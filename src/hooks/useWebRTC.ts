import { useEffect, useRef, useCallback, useState } from 'react';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { WebRTCManager, type PeerState, type PeerPosition, type DataChannelMessage, type SignalMessage } from '@/lib/webrtc';
import { sceneAddress, DEFAULT_RELAY_URLS } from '@/lib/scene';
import type { NostrEvent } from '@nostrify/nostrify';

/** Ephemeral kind for WebRTC signaling (application-specific) */
const SIGNAL_KIND = 25050;

/** Position broadcast interval in ms (~15 fps) */
const POSITION_INTERVAL = 66;

/** Emoji display duration in ms */
const EMOJI_DURATION = 3000;

/** Re-announce presence so late joiners discover us */
const PRESENCE_INTERVAL_MS = 20000;

interface UseWebRTCOptions {
  scenePubkey: string | undefined;
  sceneDTag: string | undefined;
  enabled?: boolean;
}

/** Live chat message from WebRTC (same shape as ChatMessage for merging in UI) */
export interface LiveChatMessage {
  id: string;
  pubkey: string;
  content: string;
  createdAt: number;
}

const MAX_LIVE_CHAT = 100;

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
  /** Recent chat messages received over WebRTC (instant, in-scene only) */
  liveChatMessages: LiveChatMessage[];
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
  const [liveChatMessages, setLiveChatMessages] = useState<LiveChatMessage[]>([]);
  const peerStatesRef = useRef<Record<string, PeerState>>({});
  const liveChatRef = useRef<LiveChatMessage[]>([]);

  const address = scenePubkey && sceneDTag ? sceneAddress(scenePubkey, sceneDTag) : '';
  const isActive = !!user && !!address && enabled;

  // Send signaling message via Nostr (kind 25050); publish to user relays and to default relays so all peers see it
  const sendSignal = useCallback(async (msg: SignalMessage) => {
    if (!user) return;
    const payload = {
      kind: SIGNAL_KIND,
      content: JSON.stringify(msg),
      tags: [
        ['p', msg.to],
        ['a', address],
        ['t', 'webrtc-signal'],
      ] as string[][],
    };
    try {
      const event = await publishEvent(payload);
      try {
        await nostr.group(DEFAULT_RELAY_URLS).event(event, { signal: AbortSignal.timeout(5000) });
      } catch {
        // Default relays best-effort
      }
    } catch (err) {
      console.warn('Failed to send WebRTC signal:', err);
    }
  }, [user, publishEvent, address, nostr]);

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
      } else if (msg.type === 'chat') {
        const list = liveChatRef.current;
        const entry: LiveChatMessage = {
          id: `live-${from}-${now}-${list.length}`,
          pubkey: from,
          content: msg.text,
          createdAt: Math.floor(now / 1000),
        };
        list.push(entry);
        if (list.length > MAX_LIVE_CHAT) list.shift();
        liveChatRef.current = list;
        setLiveChatMessages([...list]);
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

    // Use default relays for WebRTC signaling so all clients see the same events
    const signalingRelays = nostr.group(DEFAULT_RELAY_URLS);

    // Subscribe to Nostr for incoming signaling messages
    const controller = new AbortController();

    (async () => {
      try {
        for await (const msg of signalingRelays.req(
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

    // Subscribe to signals in scene to discover peers (e.g. offers from others)
    const joinController = new AbortController();

    (async () => {
      try {
        for await (const msg of signalingRelays.req(
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
              // Discover peer from their offer to someone else; only we (lower pubkey) initiate to avoid glare
              if (signal.from !== user.pubkey && signal.type === 'offer' && signal.to !== user.pubkey) {
                if (user.pubkey < signal.from) manager.connectToPeer(signal.from);
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

    // Announce our presence so other users in the scene can discover and connect to us
    const presencePayload = {
      kind: SIGNAL_KIND,
      content: JSON.stringify({ type: 'presence', from: user.pubkey, sceneId: address }),
      tags: [
        ['a', address],
        ['t', 'webrtc-signal'],
        ['t', 'presence'],
      ] as string[][],
    };
    const announcePresence = async () => {
      try {
        const event = await publishEvent(presencePayload);
        try {
          await signalingRelays.event(event, { signal: AbortSignal.timeout(5000) });
        } catch {
          // Best-effort to default relays
        }
      } catch {
        // Ignore
      }
    };
    announcePresence();
    const presenceInterval = setInterval(announcePresence, PRESENCE_INTERVAL_MS);

    // Listen for presence announcements from others
    const presenceController = new AbortController();
    (async () => {
      try {
        for await (const msg of signalingRelays.req(
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
                // Only we (lower pubkey) initiate to avoid duplicate connections (glare)
                if (user.pubkey < data.from) manager.connectToPeer(data.from);
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
      clearInterval(presenceInterval);
      controller.abort();
      joinController.abort();
      presenceController.abort();
      manager.destroy();
      managerRef.current = null;
      peerStatesRef.current = {};
      liveChatRef.current = [];
      setPeerStates({});
      setConnectedCount(0);
      setLiveChatMessages([]);
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
    liveChatMessages,
    isActive,
  };
}
