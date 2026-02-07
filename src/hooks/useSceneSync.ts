import { useEffect, useRef, useCallback, useState } from 'react';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import {
  SceneSyncManager,
  type PeerState,
  type PeerPosition,
  type ServerMessage,
  type ConnectionState,
} from '@/lib/wsSync';

/** Position state flush interval in ms (~15 fps) */
const FLUSH_INTERVAL = 66;

/** Emoji display duration in ms */
const EMOJI_DURATION = 3000;

/** Live chat message (same shape as ChatMessage for merging in UI) */
export interface LiveChatMessage {
  id: string;
  pubkey: string;
  content: string;
  createdAt: number;
}

const MAX_LIVE_CHAT = 100;

interface UseSceneSyncOptions {
  /** WebSocket sync server URL from scene metadata */
  syncUrl: string | undefined;
  /** Whether sync should be active */
  enabled?: boolean;
}

interface UseSceneSyncReturn {
  /** Map of remote peer pubkeys -> their latest state */
  peerStates: Record<string, PeerState>;
  /** Number of connected peers (as reported by server) */
  connectedCount: number;
  /** Send our position to the server */
  broadcastPosition: (pos: PeerPosition) => void;
  /** Send an emoji to the server */
  broadcastEmoji: (emoji: string) => void;
  /** Send a chat message to the server */
  broadcastChat: (text: string) => void;
  /** Send a private chat message to one peer */
  sendPrivateChat: (peerPubkey: string, text: string) => void;
  /** Recent chat messages received via WebSocket */
  liveChatMessages: LiveChatMessage[];
  /** Private chat messages per peer pubkey */
  privateChatMessages: Record<string, LiveChatMessage[]>;
  /** Whether the sync connection is active */
  isActive: boolean;
  /** Detailed connection state */
  connectionState: ConnectionState;
}

export function useSceneSync({ syncUrl, enabled = true }: UseSceneSyncOptions): UseSceneSyncReturn {
  const { user } = useCurrentUser();

  const managerRef = useRef<SceneSyncManager | null>(null);
  const [peerStates, setPeerStates] = useState<Record<string, PeerState>>({});
  const [connectedCount, setConnectedCount] = useState(0);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [liveChatMessages, setLiveChatMessages] = useState<LiveChatMessage[]>([]);
  const [privateChatMessages, setPrivateChatMessages] = useState<Record<string, LiveChatMessage[]>>({});
  const peerStatesRef = useRef<Record<string, PeerState>>({});
  const liveChatRef = useRef<LiveChatMessage[]>([]);
  const privateChatRef = useRef<Record<string, LiveChatMessage[]>>({});

  const isActive = !!user && !!syncUrl && enabled;

  // Initialize WebSocket connection
  useEffect(() => {
    if (!isActive || !user || !syncUrl) return;

    const manager = new SceneSyncManager({
      syncUrl,
      pubkey: user.pubkey,
      sign: async (challenge: string) => {
        // Use the signer to sign the challenge
        // We create a kind-27235 event (NIP-98 style) with the challenge as content
        const event = await user.signer.signEvent({
          kind: 27235,
          content: challenge,
          tags: [],
          created_at: Math.floor(Date.now() / 1000),
        });
        return JSON.stringify(event);
      },
    });
    managerRef.current = manager;

    manager.onStateChange = (state) => {
      setConnectionState(state);
    };

    manager.onMessage = (msg: ServerMessage) => {
      const now = Date.now();

      switch (msg.type) {
        case 'welcome': {
          // Initialize peer states from server
          const initial: Record<string, PeerState> = {};
          for (const peer of msg.peers) {
            initial[peer.pubkey] = {
              pubkey: peer.pubkey,
              position: peer.position,
              avatar: peer.avatar,
              lastUpdate: now,
            };
          }
          peerStatesRef.current = initial;
          setPeerStates({ ...initial });
          setConnectedCount(msg.peers.length);
          break;
        }

        case 'peer_join': {
          peerStatesRef.current = {
            ...peerStatesRef.current,
            [msg.pubkey]: {
              pubkey: msg.pubkey,
              position: peerStatesRef.current[msg.pubkey]?.position ?? { x: 0, y: 0, z: 0, ry: 0 },
              avatar: msg.avatar,
              lastUpdate: now,
            },
          };
          setPeerStates({ ...peerStatesRef.current });
          setConnectedCount(Object.keys(peerStatesRef.current).length);
          break;
        }

        case 'peer_leave': {
          const next = { ...peerStatesRef.current };
          delete next[msg.pubkey];
          peerStatesRef.current = next;
          setPeerStates(next);
          setConnectedCount(Object.keys(next).length);
          break;
        }

        case 'peer_position': {
          peerStatesRef.current = {
            ...peerStatesRef.current,
            [msg.pubkey]: {
              ...peerStatesRef.current[msg.pubkey],
              pubkey: msg.pubkey,
              position: { x: msg.x, y: msg.y, z: msg.z, ry: msg.ry },
              lastUpdate: now,
            },
          };
          // Batched via flush interval
          break;
        }

        case 'peer_chat': {
          const list = liveChatRef.current;
          const entry: LiveChatMessage = {
            id: `live-${msg.pubkey}-${now}-${list.length}`,
            pubkey: msg.pubkey,
            content: msg.text,
            createdAt: Math.floor(now / 1000),
          };
          list.push(entry);
          if (list.length > MAX_LIVE_CHAT) list.shift();
          liveChatRef.current = list;
          setLiveChatMessages([...list]);
          break;
        }

        case 'peer_dm': {
          const dmList = (privateChatRef.current[msg.pubkey] ?? []).slice();
          const dmEntry: LiveChatMessage = {
            id: `dm-${msg.pubkey}-${now}-${dmList.length}`,
            pubkey: msg.pubkey,
            content: msg.text,
            createdAt: Math.floor(now / 1000),
          };
          dmList.push(dmEntry);
          if (dmList.length > MAX_LIVE_CHAT) dmList.splice(0, dmList.length - MAX_LIVE_CHAT);
          privateChatRef.current = { ...privateChatRef.current, [msg.pubkey]: dmList };
          setPrivateChatMessages((prev) => ({ ...prev, [msg.pubkey]: dmList }));
          break;
        }

        case 'peer_emoji': {
          peerStatesRef.current = {
            ...peerStatesRef.current,
            [msg.pubkey]: {
              ...peerStatesRef.current[msg.pubkey],
              pubkey: msg.pubkey,
              emoji: msg.emoji,
              emojiExpiry: now + EMOJI_DURATION,
              lastUpdate: now,
            },
          };
          setPeerStates({ ...peerStatesRef.current });
          break;
        }

        case 'error': {
          console.warn('[SceneSync] Server error:', msg.message, msg.code);
          break;
        }

        case 'game_event': {
          // Game events can be handled by consumers of this hook
          // For now, just log in dev
          if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
            console.log('[SceneSync] Game event:', msg.event, msg.data);
          }
          break;
        }
      }
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
    }, FLUSH_INTERVAL);

    // Connect
    manager.connect();

    return () => {
      clearInterval(flushInterval);
      manager.destroy();
      managerRef.current = null;
      peerStatesRef.current = {};
      liveChatRef.current = [];
      privateChatRef.current = {};
      setPeerStates({});
      setConnectedCount(0);
      setConnectionState('disconnected');
      setLiveChatMessages([]);
      setPrivateChatMessages({});
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, syncUrl, user?.pubkey]);

  const broadcastPosition = useCallback((pos: PeerPosition) => {
    managerRef.current?.send({
      type: 'position',
      x: pos.x,
      y: pos.y,
      z: pos.z,
      ry: pos.ry,
    });
  }, []);

  const broadcastEmoji = useCallback((emoji: string) => {
    managerRef.current?.send({ type: 'emoji', emoji });
  }, []);

  const broadcastChat = useCallback((text: string) => {
    if (!user) return;
    managerRef.current?.send({ type: 'chat', text });
    // Show own message locally (server doesn't echo back our own messages)
    const list = liveChatRef.current;
    const now = Date.now();
    const entry: LiveChatMessage = {
      id: `live-me-${now}-${list.length}`,
      pubkey: user.pubkey,
      content: text,
      createdAt: Math.floor(now / 1000),
    };
    list.push(entry);
    if (list.length > MAX_LIVE_CHAT) list.shift();
    liveChatRef.current = list;
    setLiveChatMessages([...list]);
  }, [user]);

  const sendPrivateChat = useCallback((peerPubkey: string, text: string) => {
    if (!user) return;
    managerRef.current?.send({ type: 'dm', to: peerPubkey, text });
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
    isActive: connectionState === 'connected',
    connectionState,
  };
}
