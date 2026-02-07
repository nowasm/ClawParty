import { useEffect, useRef, useCallback, useState } from 'react';
import { useNostr } from '@nostrify/react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { useNostrPublish } from '@/hooks/useNostrPublish';
import { WebRTCManager, type PeerState, type PeerPosition, type DataChannelMessage, type SignalMessage } from '@/lib/webrtc';
import { sceneAddress, SIGNALING_RELAY_URLS } from '@/lib/scene';
import type { NostrEvent, NostrFilter } from '@nostrify/nostrify';

/** Ephemeral kind for WebRTC signaling (application-specific) */
const SIGNAL_KIND = 25050;

/** Position broadcast interval in ms (~15 fps) */
const POSITION_INTERVAL = 66;

/** Emoji display duration in ms */
const EMOJI_DURATION = 3000;

/** Re-announce presence so late joiners discover us */
const PRESENCE_INTERVAL_MS = 10000;
/** How far back to request presence/signals when subscribing (seconds) */
const SUBSCRIBE_SINCE_PRESENCE = 60;
const SUBSCRIBE_SINCE_SIGNALS = 30;

const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV === true;
function debugLog(...args: unknown[]) {
  if (isDev) console.log('[WebRTC]', ...args);
}

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
  /** Send a private chat message to one peer (only sender and recipient see it) */
  sendPrivateChat: (peerPubkey: string, text: string) => void;
  /** Recent chat messages received over WebRTC (instant, in-scene only) */
  liveChatMessages: LiveChatMessage[];
  /** Private chat messages per peer pubkey (conversation with that peer) */
  privateChatMessages: Record<string, LiveChatMessage[]>;
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
  const [privateChatMessages, setPrivateChatMessages] = useState<Record<string, LiveChatMessage[]>>({});
  const peerStatesRef = useRef<Record<string, PeerState>>({});
  const liveChatRef = useRef<LiveChatMessage[]>([]);
  const privateChatRef = useRef<Record<string, LiveChatMessage[]>>({});

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
      debugLog('signal send', msg.type, 'to', msg.to.slice(0, 8) + '…');
      const event = await publishEvent(payload);
      // Send to signaling relays first so the other peer (subscribed there) receives it
      try {
        await nostr.group(SIGNALING_RELAY_URLS).event(event, { signal: AbortSignal.timeout(8000) });
        debugLog('signal sent to signaling relays ok');
      } catch (e) {
        debugLog('signal to signaling relays failed', e);
      }
    } catch (err) {
      console.warn('Failed to send WebRTC signal:', err);
    }
  }, [user, publishEvent, address, nostr]);

  // Initialize WebRTC manager and Nostr signaling subscription
  useEffect(() => {
    if (!isActive || !user) return;

    debugLog('active scene address', address.slice(0, 20) + '…');
    const sceneId = address;
    const manager = new WebRTCManager(user.pubkey, sceneId);
    managerRef.current = manager;

    // Wire up signaling output
    manager.onSignal = (msg) => {
      sendSignal(msg);
    };
    manager.onDebug = (msg) => debugLog(msg);

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
        debugLog('received join from', from.slice(0, 8) + '…', '→ peer in scene');
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
      } else if (msg.type === 'dm' && 'to' in msg && msg.to === user.pubkey) {
        const list = (privateChatRef.current[from] ?? []).slice();
        const entry: LiveChatMessage = {
          id: `dm-${from}-${now}-${list.length}`,
          pubkey: from,
          content: msg.text,
          createdAt: Math.floor(now / 1000),
        };
        list.push(entry);
        if (list.length > MAX_LIVE_CHAT) list.splice(0, list.length - MAX_LIVE_CHAT);
        privateChatRef.current = { ...privateChatRef.current, [from]: list };
        setPrivateChatMessages((prev) => ({ ...prev, [from]: list }));
      }
    };

    // Wire up peer connection changes
    manager.onPeerChange = (peers) => {
      debugLog('peer change connected:', peers.length, peers.map((p) => p.slice(0, 8) + '…'));
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

    // ========================================================================
    // Relay subscriptions
    //
    // IMPORTANT: We subscribe to each relay INDIVIDUALLY via nostr.relay(url)
    // instead of using nostr.group(urls).req(). NPool.group().req() has a
    // built-in eoseTimeout (default 1000ms) that silently kills the
    // subscription ~1 second after the first relay sends EOSE. This means
    // any signals arriving later (like an answer) are never received.
    // Using individual relay subscriptions keeps them open indefinitely.
    // ========================================================================

    const subController = new AbortController();
    const seen = new Set<string>(); // dedup events across relays

    /**
     * Subscribe to a filter on each relay URL individually (persistent).
     * Calls onEvent for each unique event received.
     */
    const subscribeRelays = (
      urls: string[],
      filters: NostrFilter[],
      onEvent: (event: NostrEvent) => void,
    ) => {
      for (const url of urls) {
        (async () => {
          try {
            for await (const msg of nostr.relay(url).req(filters, { signal: subController.signal })) {
              if (msg[0] === 'EVENT') {
                const event = msg[2] as NostrEvent;
                if (!seen.has(event.id)) {
                  seen.add(event.id);
                  onEvent(event);
                }
              }
            }
          } catch {
            // Relay subscription ended (abort or error)
          }
        })();
      }
    };

    const now = Math.floor(Date.now() / 1000);

    // --- Signals addressed to us (offer / answer / ice with #p tag) ---
    subscribeRelays(
      SIGNALING_RELAY_URLS,
      [{
        kinds: [SIGNAL_KIND],
        '#p': [user.pubkey],
        '#a': [address],
        since: now - SUBSCRIBE_SINCE_SIGNALS,
      }],
      (event) => {
        try {
          const signal = JSON.parse(event.content) as SignalMessage;
          if (signal.to !== user.pubkey) return;
          debugLog('signal recv', signal.type, 'from', signal.from?.slice(0, 8) + '…');
          manager.handleSignal(signal);
        } catch {
          // Ignore malformed
        }
      },
    );

    // --- Scene-wide signals (discover offers, receive answer/ice via #t) ---
    subscribeRelays(
      SIGNALING_RELAY_URLS,
      [{
        kinds: [SIGNAL_KIND],
        '#a': [address],
        '#t': ['webrtc-signal'],
        since: now - SUBSCRIBE_SINCE_SIGNALS,
      }],
      (event) => {
        try {
          const signal = JSON.parse(event.content) as SignalMessage;
          const offererPubkey = event.pubkey;
          // Discover other peers' offers
          if (offererPubkey !== user.pubkey && signal.type === 'offer' && signal.to !== user.pubkey) {
            if (user.pubkey < offererPubkey) manager.connectToPeer(offererPubkey);
          }
          // Handle signals addressed to us
          if (signal.to === user.pubkey) {
            debugLog('signal recv (scene sub)', signal.type, 'from', signal.from?.slice(0, 8) + '…');
            manager.handleSignal(signal);
          }
        } catch {
          // Ignore
        }
      },
    );

    // --- Presence announcements ---
    subscribeRelays(
      SIGNALING_RELAY_URLS,
      [{
        kinds: [SIGNAL_KIND],
        '#a': [address],
        '#t': ['presence'],
        since: now - SUBSCRIBE_SINCE_PRESENCE,
      }],
      (event) => {
        const peerPubkey = event.pubkey;
        if (peerPubkey && peerPubkey !== user.pubkey) {
          if (user.pubkey < peerPubkey) {
            debugLog('presence from', peerPubkey.slice(0, 8) + '…', '→ connecting');
            manager.connectToPeer(peerPubkey);
          }
        }
      },
    );

    // Announce our presence so other users in the scene can discover and connect to us
    const signalingRelays = nostr.group(SIGNALING_RELAY_URLS);
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
        debugLog('presence sent', 'relays:', SIGNALING_RELAY_URLS.length);
        try {
          await signalingRelays.event(event, { signal: AbortSignal.timeout(5000) });
        } catch {
          // Best-effort
        }
      } catch {
        // Ignore
      }
    };
    announcePresence();
    // Burst presence in first few seconds so late-joining peers see us quickly
    const burstTimeout1 = setTimeout(announcePresence, 2000);
    const burstTimeout2 = setTimeout(announcePresence, 5000);
    const presenceInterval = setInterval(announcePresence, PRESENCE_INTERVAL_MS);

    return () => {
      clearInterval(flushInterval);
      clearTimeout(burstTimeout1);
      clearTimeout(burstTimeout2);
      clearInterval(presenceInterval);
      subController.abort();
      manager.destroy();
      managerRef.current = null;
      peerStatesRef.current = {};
      liveChatRef.current = [];
      privateChatRef.current = {};
      setPeerStates({});
      setConnectedCount(0);
      setLiveChatMessages([]);
      setPrivateChatMessages({});
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

  const sendPrivateChat = useCallback((peerPubkey: string, text: string) => {
    const manager = managerRef.current;
    if (!manager || !user) return;
    manager.sendTo(peerPubkey, { type: 'dm', to: peerPubkey, text });
    const entry: LiveChatMessage = {
      id: `dm-me-${Date.now()}-${(privateChatRef.current[peerPubkey] ?? []).length}`,
      pubkey: user.pubkey,
      content: text,
      createdAt: Math.floor(Date.now() / 1000),
    };
    const list = (privateChatRef.current[peerPubkey] ?? []).slice();
    list.push(entry);
    if (list.length > MAX_LIVE_CHAT) list.splice(0, list.length - MAX_LIVE_CHAT);
    privateChatRef.current = { ...privateChatRef.current, [peerPubkey]: list };
    setPrivateChatMessages((prev) => ({ ...prev, [peerPubkey]: list }));
  }, [user]);

  return {
    peerStates,
    connectedCount,
    broadcastPosition,
    broadcastEmoji,
    broadcastChat,
    sendPrivateChat,
    liveChatMessages,
    privateChatMessages,
    isActive,
  };
}
