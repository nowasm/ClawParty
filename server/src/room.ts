/**
 * Room management for scene sync.
 *
 * Each map has one room. The room tracks connected clients,
 * broadcasts messages, and manages peer state.
 * A Room is identified by a mapId (0–9999).
 */

import type { WebSocket } from 'ws';
import type {
  PeerPosition,
  AvatarConfig,
  ClientMessage,
  ServerMessage,
  WelcomePeer,
} from './protocol.js';
import { nextMsgId } from './protocol.js';
import { generateChallenge, verifyAuthResponse } from './auth.js';
import { cellFromPosition, validateCells } from './spatialGrid.js';

/** Maximum chat message length */
const MAX_CHAT_LENGTH = 500;

/** Maximum emoji length */
const MAX_EMOJI_LENGTH = 16;

/** A connected client in a room */
interface RoomClient {
  ws: WebSocket;
  pubkey: string;
  position: PeerPosition;
  /** Current spatial cell based on position */
  cell: string;
  /** Cells this client is subscribed to (for AOI filtering) */
  subscribedCells: Set<string>;
  avatar?: AvatarConfig;
  authenticated: boolean;
  challenge?: string;
  lastActivity: number;
}

export class Room {
  /** The map ID this room is serving */
  public readonly mapId: number;

  private clients: Map<WebSocket, RoomClient> = new Map();
  private pubkeyIndex: Map<string, WebSocket> = new Map();

  /** Optional hook for AI game logic — called on every client message */
  public onClientMessage?: (pubkey: string, msg: ClientMessage) => ServerMessage[] | undefined;

  constructor(mapId: number = 0) {
    this.mapId = mapId;
  }

  /** Get number of authenticated clients */
  get playerCount(): number {
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.authenticated) count++;
    }
    return count;
  }

  /** Get all authenticated peers as WelcomePeer list */
  getPeers(): WelcomePeer[] {
    const peers: WelcomePeer[] = [];
    for (const client of this.clients.values()) {
      if (client.authenticated) {
        peers.push({
          pubkey: client.pubkey,
          position: client.position,
          avatar: client.avatar,
        });
      }
    }
    return peers;
  }

  /** Handle a new WebSocket connection */
  addConnection(ws: WebSocket): void {
    const client: RoomClient = {
      ws,
      pubkey: '',
      position: { x: 0, y: 0, z: 0, ry: 0 },
      cell: '0,0',
      subscribedCells: new Set<string>(),
      authenticated: false,
      lastActivity: Date.now(),
    };
    this.clients.set(ws, client);

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString()) as ClientMessage;
        this.handleMessage(ws, client, msg);
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      this.removeConnection(ws);
    });

    ws.on('error', () => {
      this.removeConnection(ws);
    });
  }

  /**
   * Replay an auth message that was already intercepted by the index router.
   * This allows the RoomManager to extract mapId from the first auth message,
   * route to the correct Room, and then replay the auth into that Room's handler.
   */
  replayAuthMessage(ws: WebSocket, msg: ClientMessage): void {
    const client = this.clients.get(ws);
    if (!client) return;
    this.handleMessage(ws, client, msg);
  }

  /** Remove a connection and notify peers */
  private removeConnection(ws: WebSocket): void {
    const client = this.clients.get(ws);
    if (!client) return;

    // Remove event listeners to prevent stale handler invocation
    ws.removeAllListeners('message');
    ws.removeAllListeners('close');
    ws.removeAllListeners('error');

    if (client.authenticated && client.pubkey) {
      // Only remove from pubkeyIndex if this ws is still the current one for this pubkey.
      // On reconnect, the new connection replaces the old one in the index,
      // so the old connection's async close handler must NOT delete the new entry.
      if (this.pubkeyIndex.get(client.pubkey) === ws) {
        this.pubkeyIndex.delete(client.pubkey);
        // Only broadcast peer_leave if we actually removed from the index,
        // otherwise the user is still connected via a newer socket.
        this.broadcastExcept(ws, {
          type: 'peer_leave',
          msgId: nextMsgId(),
          pubkey: client.pubkey,
        });
      }
    }

    this.clients.delete(ws);
  }

  /** Handle a message from a client */
  private handleMessage(ws: WebSocket, client: RoomClient, msg: ClientMessage): void {
    client.lastActivity = Date.now();

    // --- Pre-authentication messages ---
    if (msg.type === 'auth') {
      if (client.authenticated) return;
      client.pubkey = msg.pubkey;
      client.challenge = generateChallenge();
      this.send(ws, { type: 'auth_challenge', challenge: client.challenge });
      return;
    }

    if (msg.type === 'auth_response') {
      if (client.authenticated) return;
      if (!client.pubkey || !client.challenge) {
        this.send(ws, { type: 'error', message: 'Must send auth first', code: 'AUTH_REQUIRED' });
        return;
      }

      const valid = verifyAuthResponse(client.pubkey, client.challenge, msg.signature);
      if (!valid) {
        this.send(ws, { type: 'error', message: 'Authentication failed', code: 'AUTH_FAILED' });
        ws.close();
        return;
      }

      // Kick existing connection for same pubkey (reconnect scenario).
      // IMPORTANT: Clean up synchronously BEFORE closing, so that:
      //   1. peer_leave is broadcast before peer_join (correct ordering)
      //   2. pubkeyIndex is not corrupted by the async close handler
      const existing = this.pubkeyIndex.get(client.pubkey);
      if (existing && existing !== ws) {
        this.send(existing, { type: 'error', message: 'Replaced by new connection', code: 'REPLACED' });
        this.removeConnection(existing); // Clean up synchronously first
        existing.close();                // Then close the socket
      }

      client.authenticated = true;
      client.challenge = undefined;
      this.pubkeyIndex.set(client.pubkey, ws);

      // Send welcome with current peer list (excluding self)
      const peers = this.getPeers().filter((p) => p.pubkey !== client.pubkey);
      this.send(ws, { type: 'welcome', peers, mapId: this.mapId });

      // Notify others about the new peer
      this.broadcastExcept(ws, {
        type: 'peer_join',
        msgId: nextMsgId(),
        pubkey: client.pubkey,
        avatar: client.avatar,
      });

      return;
    }

    if (msg.type === 'ping') {
      this.send(ws, { type: 'pong' });
      return;
    }

    // --- Authenticated-only messages ---
    if (!client.authenticated) {
      this.send(ws, { type: 'error', message: 'Not authenticated', code: 'AUTH_REQUIRED' });
      return;
    }

    // Let the AI game hook process the message first
    if (this.onClientMessage) {
      const responses = this.onClientMessage(client.pubkey, msg);
      if (responses) {
        for (const resp of responses) {
          this.send(ws, resp);
        }
      }
    }

    switch (msg.type) {
      case 'position': {
        client.position = { x: msg.x, y: msg.y, z: msg.z, ry: msg.ry };
        client.cell = cellFromPosition(msg.x, msg.z);
        // Only send position updates to clients subscribed to this cell
        const posMsg: ServerMessage = {
          type: 'peer_position',
          msgId: nextMsgId(),
          pubkey: client.pubkey,
          x: msg.x,
          y: msg.y,
          z: msg.z,
          ry: msg.ry,
        };
        // Forward optional animation/expression state
        if (msg.animation) (posMsg as Record<string, unknown>).animation = msg.animation;
        if (msg.expression) (posMsg as Record<string, unknown>).expression = msg.expression;
        this.broadcastToSubscribers(ws, client.cell, posMsg);
        break;
      }

      case 'subscribe_cells': {
        if (!Array.isArray(msg.cells)) break;
        const validated = validateCells(msg.cells);
        client.subscribedCells = new Set(validated);
        break;
      }

      case 'chat': {
        const text = msg.text?.slice(0, MAX_CHAT_LENGTH);
        if (!text) break;
        this.broadcastExcept(ws, {
          type: 'peer_chat',
          msgId: nextMsgId(),
          pubkey: client.pubkey,
          text,
        });
        break;
      }

      case 'dm': {
        const dmText = msg.text?.slice(0, MAX_CHAT_LENGTH);
        if (!dmText || !msg.to) break;
        const targetWs = this.pubkeyIndex.get(msg.to);
        if (targetWs) {
          this.send(targetWs, {
            type: 'peer_dm',
            msgId: nextMsgId(),
            pubkey: client.pubkey,
            text: dmText,
          });
        }
        break;
      }

      case 'emoji': {
        const emoji = msg.emoji?.slice(0, MAX_EMOJI_LENGTH);
        if (!emoji) break;
        this.broadcastExcept(ws, {
          type: 'peer_emoji',
          msgId: nextMsgId(),
          pubkey: client.pubkey,
          emoji,
        });
        break;
      }

      case 'join': {
        if (msg.avatar) {
          client.avatar = msg.avatar;
          // Re-broadcast join with updated avatar
          this.broadcastExcept(ws, {
            type: 'peer_join',
            msgId: nextMsgId(),
            pubkey: client.pubkey,
            avatar: msg.avatar,
          });
        }
        break;
      }
    }
  }

  /** Send a message to a specific client */
  private send(ws: WebSocket, msg: ServerMessage): void {
    if (ws.readyState === ws.OPEN) {
      try {
        ws.send(JSON.stringify(msg));
      } catch {
        // Ignore send errors
      }
    }
  }

  /** Broadcast a message to all authenticated clients except one */
  private broadcastExcept(exclude: WebSocket, msg: ServerMessage): void {
    const data = JSON.stringify(msg);
    for (const [ws, client] of this.clients) {
      if (ws !== exclude && client.authenticated && ws.readyState === ws.OPEN) {
        try {
          ws.send(data);
        } catch {
          // Ignore send errors
        }
      }
    }
  }

  /**
   * Broadcast a message only to clients subscribed to a specific cell.
   * If a client has no cell subscriptions (empty set), they receive all
   * messages (backward compatibility / no AOI filtering).
   */
  private broadcastToSubscribers(exclude: WebSocket, cell: string, msg: ServerMessage): void {
    const data = JSON.stringify(msg);
    for (const [ws, client] of this.clients) {
      if (ws === exclude || !client.authenticated || ws.readyState !== ws.OPEN) continue;
      // If client has no subscriptions, send everything (backward compat)
      // Otherwise, only send if they are subscribed to this cell
      if (client.subscribedCells.size === 0 || client.subscribedCells.has(cell)) {
        try {
          ws.send(data);
        } catch {
          // Ignore send errors
        }
      }
    }
  }

  /** Broadcast a game event to all authenticated clients */
  broadcastGameEvent(event: string, data: unknown): void {
    const msg: ServerMessage = { type: 'game_event', msgId: nextMsgId(), event, data };
    const json = JSON.stringify(msg);
    for (const [ws, client] of this.clients) {
      if (client.authenticated && ws.readyState === ws.OPEN) {
        try {
          ws.send(json);
        } catch {
          // Ignore
        }
      }
    }
  }

  /** Clean up inactive connections (call periodically) */
  cleanupInactive(maxIdleMs: number = 60000): void {
    const now = Date.now();
    // Collect stale connections first, then clean up (avoid mutation during iteration)
    const stale: WebSocket[] = [];
    for (const [ws, client] of this.clients) {
      if (now - client.lastActivity > maxIdleMs) {
        stale.push(ws);
      }
    }
    for (const ws of stale) {
      this.removeConnection(ws); // Clean up synchronously (removes listeners)
      ws.close();
    }
  }

  /** Close all connections and clean up */
  destroy(): void {
    for (const [ws] of this.clients) {
      ws.close();
    }
    this.clients.clear();
    this.pubkeyIndex.clear();
  }
}
