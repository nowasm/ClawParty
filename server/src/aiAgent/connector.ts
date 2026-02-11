/**
 * AI Agent WebSocket Connector
 *
 * Connects to a sync server as a regular player using the same protocol
 * as human clients. Handles Nostr challenge-response auth with its own
 * keypair, manages reconnection, and exposes send/receive primitives.
 */

import WebSocket from 'ws';
import { getPublicKey, finalizeEvent, type EventTemplate } from 'nostr-tools';
import type { ClientMessage, ServerMessage, AvatarConfig, WelcomePeer } from '../protocol.js';

// ============================================================================
// Types
// ============================================================================

export interface ConnectorOptions {
  /** WebSocket server URL (ws:// or wss://) */
  syncUrl: string;
  /** Nostr secret key (32 bytes) for this AI agent */
  secretKey: Uint8Array;
  /** Map ID to join (0–9999) */
  mapId: number;
  /** Avatar configuration to announce on join */
  avatar: AvatarConfig;
}

export type ConnectorState = 'disconnected' | 'connecting' | 'authenticating' | 'connected';

export interface ConnectorEvents {
  onStateChange?: (state: ConnectorState) => void;
  onMessage?: (msg: ServerMessage) => void;
  onWelcome?: (peers: WelcomePeer[]) => void;
  onError?: (error: string) => void;
}

// ============================================================================
// Connector
// ============================================================================

const RECONNECT_MIN_MS = 2000;
const RECONNECT_MAX_MS = 30000;
const PING_INTERVAL_MS = 15000;
const PONG_TIMEOUT_MS = 10000;

export class AgentConnector {
  private ws: WebSocket | null = null;
  private secretKey: Uint8Array;
  private pubkey: string;
  private syncUrl: string;
  private mapId: number;
  private avatar: AvatarConfig;

  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private pongTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private _state: ConnectorState = 'disconnected';

  public events: ConnectorEvents = {};

  constructor(options: ConnectorOptions) {
    this.secretKey = options.secretKey;
    this.pubkey = getPublicKey(options.secretKey);
    this.syncUrl = options.syncUrl;
    this.mapId = options.mapId;
    this.avatar = options.avatar;
  }

  get state(): ConnectorState { return this._state; }
  get agentPubkey(): string { return this.pubkey; }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  /** Connect to the sync server */
  connect(): void {
    if (this.destroyed || this.ws) return;

    this.setState('connecting');
    console.log(`[AgentConnector] Connecting to ${this.syncUrl} for map ${this.mapId}`);

    try {
      this.ws = new WebSocket(this.syncUrl);
    } catch (err) {
      console.error('[AgentConnector] WebSocket constructor error:', err);
      this.setState('disconnected');
      this.scheduleReconnect();
      return;
    }

    this.ws.on('open', () => {
      this.reconnectAttempts = 0;
      this.setState('authenticating');
      this.send({ type: 'auth', pubkey: this.pubkey, mapId: this.mapId });
      this.startPing();
    });

    this.ws.on('message', (data) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(data.toString()) as ServerMessage;
      } catch { return; }

      if (msg.type === 'auth_challenge') {
        this.handleAuthChallenge(msg.challenge);
        return;
      }

      if (msg.type === 'welcome') {
        this.setState('connected');
        // Announce our avatar
        this.send({ type: 'join', avatar: this.avatar });
        this.events.onWelcome?.(msg.peers);
      }

      if (msg.type === 'pong') {
        this.clearPongTimeout();
        return;
      }

      this.events.onMessage?.(msg);
    });

    this.ws.on('close', () => {
      this.cleanup();
      if (!this.destroyed) this.scheduleReconnect();
    });

    this.ws.on('error', (err) => {
      console.error('[AgentConnector] WS error:', err.message);
    });
  }

  /** Send a client message */
  send(msg: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      try {
        this.ws.send(JSON.stringify(msg));
      } catch { /* ignore */ }
    }
  }

  /** Send a position update */
  sendPosition(x: number, y: number, z: number, ry: number, animation?: string, expression?: string): void {
    const msg: ClientMessage = { type: 'position', x, y, z, ry };
    if (animation) (msg as Record<string, unknown>).animation = animation;
    if (expression) (msg as Record<string, unknown>).expression = expression;
    this.send(msg);
  }

  /** Send a chat message */
  sendChat(text: string): void {
    this.send({ type: 'chat', text });
  }

  /** Send an emoji */
  sendEmoji(emoji: string): void {
    this.send({ type: 'emoji', emoji });
  }

  /** Disconnect permanently */
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
  // Private
  // --------------------------------------------------------------------------

  private setState(state: ConnectorState): void {
    if (this._state === state) return;
    this._state = state;
    this.events.onStateChange?.(state);
  }

  private async handleAuthChallenge(challenge: string): Promise<void> {
    try {
      // Create a kind 27235 event with the challenge as content
      const template: EventTemplate = {
        kind: 27235,
        content: challenge,
        tags: [],
        created_at: Math.floor(Date.now() / 1000),
      };
      const signed = finalizeEvent(template, this.secretKey);
      this.send({ type: 'auth_response', signature: JSON.stringify(signed) });
    } catch (err) {
      console.error('[AgentConnector] Failed to sign challenge:', err);
      this.events.onError?.('Failed to sign authentication challenge');
      this.ws?.close();
    }
  }

  private startPing(): void {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.send({ type: 'ping' });
        this.pongTimer = setTimeout(() => {
          console.warn('[AgentConnector] Pong timeout, reconnecting');
          this.ws?.close();
        }, PONG_TIMEOUT_MS);
      }
    }, PING_INTERVAL_MS);
  }

  private stopPing(): void {
    if (this.pingTimer) { clearInterval(this.pingTimer); this.pingTimer = null; }
    this.clearPongTimeout();
  }

  private clearPongTimeout(): void {
    if (this.pongTimer) { clearTimeout(this.pongTimer); this.pongTimer = null; }
  }

  private cleanup(): void {
    this.stopPing();
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.setState('disconnected');
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    const delay = Math.min(RECONNECT_MIN_MS * Math.pow(2, this.reconnectAttempts), RECONNECT_MAX_MS);
    this.reconnectAttempts++;
    console.log(`[AgentConnector] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, delay);
  }
}
