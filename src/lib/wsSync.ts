/**
 * WebSocket Scene Sync Manager
 *
 * Uses a star topology: all clients connect to a central AI-hosted WebSocket server.
 * The server relays position updates, chat, and emoji between connected clients.
 *
 * Authentication uses a Nostr-style challenge-response:
 *   1. Client connects and sends { type: "auth", pubkey }
 *   2. Server responds with { type: "auth_challenge", challenge }
 *   3. Client signs the challenge and sends { type: "auth_response", signature }
 *   4. Server verifies and sends { type: "welcome", peers }
 *
 * Message types (Client → Server):
 *   - "auth":          { pubkey }                 (start authentication)
 *   - "auth_response": { signature }              (respond to challenge)
 *   - "position":      { x, y, z, ry }           (avatar position + Y rotation)
 *   - "chat":          { text }                   (public chat message)
 *   - "dm":            { to, text }               (private message to one peer)
 *   - "emoji":         { emoji }                  (floating emoji bubble)
 *   - "join":          { avatar: AvatarConfig }   (announce avatar config)
 *   - "ping":          {}                         (keepalive)
 *
 * Message types (Server → Client):
 *   - "auth_challenge": { challenge }             (authentication challenge)
 *   - "welcome":        { peers }                 (initial state on connect)
 *   - "peer_join":      { pubkey, avatar }        (new peer joined)
 *   - "peer_leave":     { pubkey }                (peer left)
 *   - "peer_position":  { pubkey, x, y, z, ry }  (peer position update)
 *   - "peer_chat":      { pubkey, text }          (peer chat message)
 *   - "peer_dm":        { pubkey, text }          (private message from peer)
 *   - "peer_emoji":     { pubkey, emoji }         (peer emoji reaction)
 *   - "pong":           {}                        (keepalive response)
 *   - "error":          { message, code? }        (error message)
 *   - "game_event":     { event, data }           (custom game event from AI)
 */

import type { AvatarConfig } from './scene';

// ============================================================================
// Shared Types (used by both client and server)
// ============================================================================

export interface PeerPosition {
  x: number;
  y: number;
  z: number;
  ry: number; // Y-axis rotation (facing direction)
}

export interface PeerState {
  pubkey: string;
  position: PeerPosition;
  avatar?: AvatarConfig;
  emoji?: string;
  emojiExpiry?: number;
  lastUpdate: number;
}

// ============================================================================
// Client → Server Messages
// ============================================================================

export type ClientMessage =
  | { type: 'auth'; pubkey: string }
  | { type: 'auth_response'; signature: string }
  | { type: 'position'; x: number; y: number; z: number; ry: number }
  | { type: 'chat'; text: string }
  | { type: 'dm'; to: string; text: string }
  | { type: 'emoji'; emoji: string }
  | { type: 'join'; avatar: AvatarConfig }
  | { type: 'ping' };

// ============================================================================
// Server → Client Messages
// ============================================================================

export interface WelcomePeer {
  pubkey: string;
  position: PeerPosition;
  avatar?: AvatarConfig;
}

export type ServerMessage =
  | { type: 'auth_challenge'; challenge: string }
  | { type: 'welcome'; peers: WelcomePeer[] }
  | { type: 'peer_join'; pubkey: string; avatar?: AvatarConfig }
  | { type: 'peer_leave'; pubkey: string }
  | { type: 'peer_position'; pubkey: string; x: number; y: number; z: number; ry: number }
  | { type: 'peer_chat'; pubkey: string; text: string }
  | { type: 'peer_dm'; pubkey: string; text: string }
  | { type: 'peer_emoji'; pubkey: string; emoji: string }
  | { type: 'pong' }
  | { type: 'error'; message: string; code?: string }
  | { type: 'game_event'; event: string; data: unknown };

// ============================================================================
// Connection State
// ============================================================================

export type ConnectionState = 'disconnected' | 'connecting' | 'authenticating' | 'connected';

// ============================================================================
// WebSocket Sync Manager
// ============================================================================

/** Reconnect delay bounds (exponential backoff) */
const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 30000;

/** Keepalive ping interval */
const PING_INTERVAL_MS = 15000;

/** Pong timeout — if no pong within this, reconnect */
const PONG_TIMEOUT_MS = 10000;

const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV === true;
function debugLog(...args: unknown[]) {
  if (isDev) console.log('[WsSync]', ...args);
}

export interface SceneSyncManagerOptions {
  /** WebSocket server URL (wss://...) */
  syncUrl: string;
  /** Our Nostr pubkey (hex) */
  pubkey: string;
  /** Sign a challenge string — returns the signature (hex) */
  sign: (challenge: string) => Promise<string>;
}

export class SceneSyncManager {
  private ws: WebSocket | null = null;
  private pubkey: string;
  private syncUrl: string;
  private sign: (challenge: string) => Promise<string>;

  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;

  private _state: ConnectionState = 'disconnected';

  // ---- Callbacks ----
  public onStateChange?: (state: ConnectionState) => void;
  public onMessage?: (msg: ServerMessage) => void;
  public onDebug?: (msg: string) => void;

  constructor(options: SceneSyncManagerOptions) {
    this.pubkey = options.pubkey;
    this.syncUrl = options.syncUrl;
    this.sign = options.sign;
  }

  get state(): ConnectionState {
    return this._state;
  }

  /** Connect to the WebSocket server */
  connect(): void {
    if (this.destroyed) return;
    if (this.ws) return; // already connecting/connected

    this.setState('connecting');
    debugLog('connecting to', this.syncUrl);

    try {
      this.ws = new WebSocket(this.syncUrl);
    } catch (err) {
      debugLog('WebSocket constructor error', err);
      this.setState('disconnected');
      this.scheduleReconnect();
      return;
    }

    this.ws.onopen = () => {
      debugLog('ws open, sending auth');
      this.reconnectAttempts = 0;
      this.setState('authenticating');
      this.send({ type: 'auth', pubkey: this.pubkey });
      this.startPing();
    };

    this.ws.onmessage = (event) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(event.data as string) as ServerMessage;
      } catch {
        return; // malformed
      }

      if (msg.type === 'auth_challenge') {
        this.handleAuthChallenge(msg.challenge);
        return;
      }

      if (msg.type === 'welcome') {
        debugLog('authenticated, peers:', msg.peers.length);
        this.setState('connected');
      }

      if (msg.type === 'pong') {
        this.clearPongTimeout();
        return;
      }

      this.onMessage?.(msg);
    };

    this.ws.onclose = () => {
      debugLog('ws closed');
      this.cleanup();
      if (!this.destroyed) {
        this.scheduleReconnect();
      }
    };

    this.ws.onerror = (err) => {
      debugLog('ws error', err);
      // onclose will fire after onerror
    };
  }

  /** Send a client message */
  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
      } catch {
        // Ignore send errors
      }
    }
  }

  /** Disconnect and clean up — permanent, no reconnect */
  destroy(): void {
    this.destroyed = true;
    this.cleanup();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.setState('disconnected');
  }

  // --------------------------------------------------------------------------
  // Private helpers
  // --------------------------------------------------------------------------

  private setState(state: ConnectionState): void {
    if (this._state === state) return;
    this._state = state;
    this.onStateChange?.(state);
  }

  private async handleAuthChallenge(challenge: string): Promise<void> {
    try {
      const signature = await this.sign(challenge);
      this.send({ type: 'auth_response', signature });
    } catch (err) {
      debugLog('failed to sign challenge', err);
      this.onMessage?.({ type: 'error', message: 'Failed to sign authentication challenge' });
      this.ws?.close();
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
        // Start pong timeout
        this.pongTimer = setTimeout(() => {
          debugLog('pong timeout, reconnecting');
          this.ws?.close();
        }, PONG_TIMEOUT_MS);
      }
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    this.clearPongTimeout();
  }

  private clearPongTimeout(): void {
    if (this.pongTimer) {
      clearTimeout(this.pongTimer);
      this.pongTimer = null;
    }
  }

  private cleanup(): void {
    this.stopPing();
    if (this.ws) {
      this.ws.onopen = null;
      this.ws.onmessage = null;
      this.ws.onclose = null;
      this.ws.onerror = null;
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.setState('disconnected');
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    const delay = Math.min(
      RECONNECT_MIN_MS * Math.pow(2, this.reconnectAttempts),
      RECONNECT_MAX_MS,
    );
    this.reconnectAttempts++;
    debugLog(`reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
