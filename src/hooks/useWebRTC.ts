import { useEffect, useRef, useCallback, useState } from 'react';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { WebRTCManager, type PeerState, type PeerPosition, type DataChannelMessage, type SignalMessage } from '@/lib/webrtc';
import { sceneAddress } from '@/lib/scene';
import type { NostrEvent } from '@nostrify/nostrify';

/** Ephemeral kind for WebRTC signaling (application-specific) */
const SIGNAL_KIND = 25050;

/** Position broadcast interval in ms (~15 fps) */
const POSITION_INTERVAL = 66;

/** Emoji display duration in ms */
const EMOJI_DURATION = 3000;

interface UseWebRTCOptions {
  scenePubkey: string | undefined;
  sceneDTag: string | undefined;
  enabled?: boolean;
}

interface UseWebRTCReturn {
  /** Map of remote peer pubkeys -> their latest state */
  peerStates: Record<string, PeerState>;
  /** Number of WebRTC-connected peers */
  connectedCount: number;
  /** Send our position to all peers */
  broadcastPosition: (pos: PeerPosition) => void;
  /** Send an emoji to all peers */
  broadcastEmoji: (emoji: string) => void;
  /** Send a chat message to all peers (for instant delivery, supplements kind 1311) */
  broadcastChat: (text: string) => void;
  /** Whether WebRTC is active */
  isActive: boolean;
}

export function useWebRTC({ scenePubkey, sceneDTag, enabled = true }: UseWebRTCOptions): UseWebRTCReturn {
  const { nostr } = useNostr();
  const { user } = useCurrentUser();
  const { mutateAsync: publishEvent } = useNostrPublish();

  const managerRef = useRef<WebRTCManager | null>(null);
  const [peerStates, setPeerStates] = useState<Record<string, PeerState>>({});
  const [connectedCount, setConnectedCount] = useState(0);
  const peerStatesRef = useRef<Record<string, PeerState>>({});

  const address = scenePubkey && sceneDTag ? sceneAddress(scenePubkey, sceneDTag) : '';
  const isActive = !!user && !!address && enabled;

  // Send signaling message via Nostr (ephemeral event kind 25050)
  const sendSignal = useCallback(async (msg: SignalMessage) => {
    if (!user) return;
    try {
      await publishEvent({
        kind: SIGNAL_KIND,
        content: JSON.stringify(msg),
        tags: [
          ['p', msg.to],
          ['a', address],
          ['t', 'webrtc-signal'],
        ],
      });
    } catch (err) {
      console.warn('Failed to send WebRTC signal:', err);
    }
  }, [user, publishEvent, address]);

  // Initialize WebRTC manager and Nostr signaling subscription
  useEffect(() => {
    if (!isActive || !user) return;

    const sceneId = address;
    const manager = new WebRTCManager(user.pubkey, sceneId);
    managerRef.current = manager;

    // Wire up signaling output
    manager.onSignal = (msg) => {
      sendSignal(msg);
    };

    // Wire up incoming data messages
    manager.onMessage = (from: string, msg: DataChannelMessage) => {
      const now = Date.now();

      if (msg.type === 'position') {
        peerStatesRef.current = {
          ...peerStatesRef.current,
          [from]: {
            ...peerStatesRef.current[from],
            pubkey: from,
            position: { x: msg.x, y: msg.y, z: msg.z, ry: msg.ry },
            lastUpdate: now,
          },
        };
        // Batch state updates at animation frame rate
      } else if (msg.type === 'emoji') {
        peerStatesRef.current = {
          ...peerStatesRef.current,
          [from]: {
            ...peerStatesRef.current[from],
            pubkey: from,
            emoji: msg.emoji,
            emojiExpiry: now + EMOJI_DURATION,
            lastUpdate: now,
          },
        };
        setPeerStates({ ...peerStatesRef.current });
      } else if (msg.type === 'join') {
        peerStatesRef.current = {
          ...peerStatesRef.current,
          [from]: {
            pubkey: from,
            position: peerStatesRef.current[from]?.position ?? { x: 0, y: 0, z: 0, ry: 0 },
            lastUpdate: now,
          },
        };
        setPeerStates({ ...peerStatesRef.current });
      } else if (msg.type === 'leave') {
        const next = { ...peerStatesRef.current };
        delete next[from];
        peerStatesRef.current = next;
        setPeerStates(next);
      }
    };

    // Wire up peer connection changes
    manager.onPeerChange = (peers) => {
      setConnectedCount(peers.length);
    };

    // Periodic state flush (position updates are high-frequency, batch React setState)
    const flushInterval = setInterval(() => {
      setPeerStates({ ...peerStatesRef.current });

      // Clean up expired emojis
      const now = Date.now();
      let changed = false;
      for (const [key, state] of Object.entries(peerStatesRef.current)) {
        if (state.emojiExpiry && now > state.emojiExpiry) {
          peerStatesRef.current[key] = { ...state, emoji: undefined, emojiExpiry: undefined };
          changed = true;
        }
      }
      if (changed) setPeerStates({ ...peerStatesRef.current });
    }, POSITION_INTERVAL);

    // Subscribe to Nostr for incoming signaling messages
    const controller = new AbortController();

    (async () => {
      try {
        // Announce presence by subscribing to signals addressed to us in this scene
        for await (const msg of nostr.req(
          [{
            kinds: [SIGNAL_KIND],
            '#p': [user.pubkey],
            '#a': [address],
            since: Math.floor(Date.now() / 1000) - 10,
          }],
          { signal: controller.signal },
        )) {
          if (msg[0] === 'EVENT') {
            const event = msg[2] as NostrEvent;
            try {
              const signal = JSON.parse(event.content) as SignalMessage;
              manager.handleSignal(signal);
            } catch {
              // Ignore malformed signals
            }
          }
        }
      } catch {
        // Subscription ended
      }
    })();

    // Also subscribe to "join" announcements to discover peers
    const joinController = new AbortController();

    (async () => {
      try {
        for await (const msg of nostr.req(
          [{
            kinds: [SIGNAL_KIND],
            '#a': [address],
            '#t': ['webrtc-signal'],
            since: Math.floor(Date.now() / 1000) - 30,
          }],
          { signal: joinController.signal },
        )) {
          if (msg[0] === 'EVENT') {
            const event = msg[2] as NostrEvent;
            // If someone is signaling to another peer in this scene, they're present
            // If they're sending an offer, we should also connect to them
            try {
              const signal = JSON.parse(event.content) as SignalMessage;
              if (signal.from !== user.pubkey && signal.type === 'offer' && signal.to !== user.pubkey) {
                // Another peer is in this scene, initiate connection if we haven't
                manager.connectToPeer(signal.from);
              }
              // Handle signals addressed to us
              if (signal.to === user.pubkey) {
                manager.handleSignal(signal);
              }
            } catch {
              // Ignore
            }
          }
        }
      } catch {
        // Subscription ended
      }
    })();

    // Announce our presence by sending a "ping" signal to the scene
    // This causes other users' subscriptions to see us and connect
    const announcePresence = async () => {
      try {
        await publishEvent({
          kind: SIGNAL_KIND,
          content: JSON.stringify({ type: 'presence', from: user.pubkey, sceneId: address }),
          tags: [
            ['a', address],
            ['t', 'webrtc-signal'],
            ['t', 'presence'],
          ],
        });
      } catch {
        // Ignore
      }
    };
    announcePresence();

    // Listen for presence announcements from others
    const presenceController = new AbortController();
    (async () => {
      try {
        for await (const msg of nostr.req(
          [{
            kinds: [SIGNAL_KIND],
            '#a': [address],
            '#t': ['presence'],
            since: Math.floor(Date.now() / 1000) - 10,
          }],
          { signal: presenceController.signal },
        )) {
          if (msg[0] === 'EVENT') {
            const event = msg[2] as NostrEvent;
            try {
              const data = JSON.parse(event.content);
              if (data.from && data.from !== user.pubkey) {
                manager.connectToPeer(data.from);
              }
            } catch {
              // Ignore
            }
          }
        }
      } catch {
        // Subscription ended
      }
    })();

    return () => {
      clearInterval(flushInterval);
      controller.abort();
      joinController.abort();
      presenceController.abort();
      manager.destroy();
      managerRef.current = null;
      peerStatesRef.current = {};
      setPeerStates({});
      setConnectedCount(0);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, address, user?.pubkey]);

  const broadcastPosition = useCallback((pos: PeerPosition) => {
    managerRef.current?.broadcast({
      type: 'position',
      x: pos.x,
      y: pos.y,
      z: pos.z,
      ry: pos.ry,
    });
  }, []);

  const broadcastEmoji = useCallback((emoji: string) => {
    managerRef.current?.broadcast({ type: 'emoji', emoji });
  }, []);

  const broadcastChat = useCallback((text: string) => {
    managerRef.current?.broadcast({ type: 'chat', text });
  }, []);

  return {
    peerStates,
    connectedCount,
    broadcastPosition,
    broadcastEmoji,
    broadcastChat,
    isActive,
  };
}
