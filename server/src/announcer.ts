/**
 * Heartbeat Announcer — publishes ephemeral events to Nostr relays
 * so clients can discover which maps this sync node serves.
 *
 * Publishes kind 10311 events (replaceable) with:
 *   - t: "3d-scene-sync"            (discovery tag)
 *   - map: "<mapId>"                (one tag per served map, relay-indexed)
 *   - sync: "wss://..."             (this node's public WebSocket URL)
 *   - load: "<current>/<max>"       (player load)
 *   - region: "<region>"            (optional region identifier)
 *   - status: "online" | "offline"  (node status)
 *
 * Heartbeats are published every 60 seconds while the node is running.
 * A final "offline" heartbeat is published on graceful shutdown.
 */

import WebSocket from 'ws';
import { finalizeEvent, getPublicKey, type EventTemplate } from 'nostr-tools';
import { nip19 } from 'nostr-tools';
import type { RoomManager } from './roomManager.js';

// Default relays for heartbeat discovery
const DEFAULT_RELAYS = [
  'wss://relay.ditto.pub',
  'wss://relay.primal.net',
  'wss://relay.damus.io',
  'wss://nos.lol',
];

/** Heartbeat interval in milliseconds */
const HEARTBEAT_INTERVAL_MS = 60_000; // 1 minute

/** Reconnect delay when a relay connection drops */
const RECONNECT_DELAY_MS = 5_000;

/** Timeout for receiving OK after sending an event */
const PUBLISH_TIMEOUT_MS = 10_000;

export interface AnnouncerConfig {
  /** Nostr secret key for signing heartbeat events */
  secretKey: Uint8Array;
  /** Public WebSocket URL (wss://...) */
  syncUrl: string;
  /** Region identifier (e.g., "asia-east", "us-west") */
  region: string;
  /** Maximum players this node can handle */
  maxPlayers: number;
  /** Room manager to query for map/player info */
  roomManager: RoomManager;
}

/**
 * Build a kind 10311 replaceable heartbeat event.
 *
 * Tags for discovery:
 *   - `#t: ["3d-scene-sync"]` — discovery filter
 *   - `#map: [mapId]` — one per guarded map, with player count
 *   - `rooms` — number of active rooms (maps being guarded)
 *   - `sync` — WebSocket URL
 *   - `load` / `capacity` — player load info
 */
function buildHeartbeatEvent(
  config: AnnouncerConfig,
  status: 'online' | 'offline',
  uptimeSeconds: number,
): EventTemplate {
  const servedMaps = config.roomManager.getServedMapIds();
  const playerCounts = config.roomManager.getPlayerCounts();
  const totalPlayers = config.roomManager.getTotalPlayerCount();
  const activeRoomCount = config.roomManager.getActiveMapIds().length;

  // Map status to the format clients expect: 'active' | 'standby'
  const syncRelayStatus = status === 'online' ? 'active' : 'standby';

  const tags: string[][] = [
    ['t', '3d-scene-sync'],
    ['sync', config.syncUrl],
    ['status', syncRelayStatus],
    ['load', totalPlayers.toString()],
    ['capacity', config.maxPlayers.toString()],
    ['rooms', activeRoomCount.toString()],
    ['uptime', uptimeSeconds.toString()],
  ];

  if (config.region) {
    tags.push(['region', config.region]);
  }

  // Add map tags for map-based discovery (useMapSyncServers)
  if (servedMaps === 'all') {
    // For "all" mode, advertise maps with active rooms + serves-all flag
    tags.push(['serves', 'all']);
    for (const [mapId, count] of playerCounts) {
      tags.push(['map', mapId.toString(), count.toString()]);
    }
  } else {
    // Advertise all guarded maps with player counts
    for (const mapId of servedMaps) {
      const count = playerCounts.get(mapId) ?? 0;
      tags.push(['map', mapId.toString(), count.toString()]);
    }
  }

  return {
    kind: 10311,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: '',
  };
}

// ============================================================================
// Persistent Relay Connection
// ============================================================================

/**
 * Manages a persistent WebSocket connection to a single Nostr relay.
 *
 * Instead of opening a new connection for every heartbeat, this class keeps
 * the connection alive and reuses it. If the connection drops, it reconnects
 * automatically. This avoids relay rate-limiting on rapid reconnections.
 */
class PersistentRelay {
  private url: string;
  private ws: WebSocket | null = null;
  private connected = false;
  private destroyed = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  /** Pending OK resolve callbacks, keyed by event ID */
  private pendingOk = new Map<string, { resolve: (ok: boolean) => void; timer: ReturnType<typeof setTimeout> }>();

  constructor(url: string) {
    this.url = url;
  }

  /** Open the connection (called once; reconnects are automatic) */
  connect(): void {
    if (this.destroyed) return;
    this.doConnect();
  }

  private doConnect(): void {
    if (this.destroyed) return;
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
    this.connected = false;

    try {
      const ws = new WebSocket(this.url);

      ws.on('open', () => {
        this.connected = true;
        this.ws = ws;
        console.log(`[Relay] Connected to ${this.url}`);
      });

      ws.on('message', (data: Buffer | ArrayBuffer | Buffer[]) => {
        try {
          const msg = JSON.parse(data.toString());
          if (Array.isArray(msg)) {
            if (msg[0] === 'OK' && typeof msg[1] === 'string') {
              const eventId = msg[1] as string;
              const accepted = !!msg[2];
              const pending = this.pendingOk.get(eventId);
              if (pending) {
                clearTimeout(pending.timer);
                this.pendingOk.delete(eventId);
                pending.resolve(accepted);
              }
              if (!accepted) {
                const reason = msg[3] ?? '';
                console.warn(`[Relay] ${this.url} rejected event ${eventId.slice(0, 8)}...: ${reason}`);
              }
            }
            // Ignore AUTH, NOTICE, etc. for now — heartbeat-only connection
          }
        } catch { /* ignore malformed messages */ }
      });

      ws.on('close', () => {
        this.connected = false;
        this.ws = null;
        // Reject all pending publishes
        for (const [, pending] of this.pendingOk) {
          clearTimeout(pending.timer);
          pending.resolve(false);
        }
        this.pendingOk.clear();
        // Schedule reconnect
        this.scheduleReconnect();
      });

      ws.on('error', (err: Error) => {
        console.warn(`[Relay] Error on ${this.url}: ${err.message}`);
        // The 'close' event will fire after 'error', triggering reconnect
      });
    } catch {
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyed || this.reconnectTimer) return;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.doConnect();
    }, RECONNECT_DELAY_MS);
  }

  /** Publish an event and wait for OK */
  publish(eventJson: Record<string, unknown>): Promise<boolean> {
    return new Promise((resolve) => {
      if (!this.connected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
        resolve(false);
        return;
      }

      const eventId = eventJson.id as string;
      if (!eventId) {
        resolve(false);
        return;
      }

      // Set up a timeout for the OK response
      const timer = setTimeout(() => {
        this.pendingOk.delete(eventId);
        resolve(false);
      }, PUBLISH_TIMEOUT_MS);

      this.pendingOk.set(eventId, { resolve, timer });

      try {
        this.ws.send(JSON.stringify(['EVENT', eventJson]));
      } catch {
        clearTimeout(timer);
        this.pendingOk.delete(eventId);
        resolve(false);
      }
    });
  }

  /** Disconnect and stop reconnecting */
  disconnect(): void {
    this.destroyed = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    for (const [, pending] of this.pendingOk) {
      clearTimeout(pending.timer);
      pending.resolve(false);
    }
    this.pendingOk.clear();
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
    this.connected = false;
  }

  get isConnected(): boolean { return this.connected; }
  get relayUrl(): string { return this.url; }
}

// ============================================================================
// Relay Pool (persistent connections to all relays)
// ============================================================================

/**
 * A pool of persistent relay connections.
 * Manages connections to all heartbeat discovery relays.
 */
class RelayPool {
  private relays: PersistentRelay[] = [];

  constructor(urls: string[]) {
    for (const url of urls) {
      this.relays.push(new PersistentRelay(url));
    }
  }

  /** Connect to all relays */
  connectAll(): void {
    for (const relay of this.relays) {
      relay.connect();
    }
  }

  /** Publish an event to all connected relays. Returns number of accepted. */
  async publishToAll(event: Record<string, unknown>): Promise<number> {
    const results = await Promise.allSettled(
      this.relays.map((relay) => relay.publish(event)),
    );
    return results.filter(
      (r) => r.status === 'fulfilled' && r.value === true,
    ).length;
  }

  /** Disconnect all relays */
  disconnectAll(): void {
    for (const relay of this.relays) {
      relay.disconnect();
    }
  }

  get totalRelays(): number { return this.relays.length; }
  get connectedCount(): number { return this.relays.filter((r) => r.isConnected).length; }
}

export class Announcer {
  private config: AnnouncerConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;
  private startedAt = 0;
  private relayPool: RelayPool;

  constructor(config: AnnouncerConfig) {
    this.config = config;
    this.relayPool = new RelayPool(DEFAULT_RELAYS);
  }

  /** Get uptime in seconds since start() was called */
  private getUptimeSeconds(): number {
    if (this.startedAt === 0) return 0;
    return Math.floor((Date.now() - this.startedAt) / 1000);
  }

  /** Start publishing heartbeats */
  async start(): Promise<void> {
    this.startedAt = Date.now();

    const pubkey = getPublicKey(this.config.secretKey);
    const npub = nip19.npubEncode(pubkey);

    console.log('');
    console.log('[Guardian] Starting heartbeat publisher');
    console.log(`[Guardian]   Pubkey: ${npub}`);
    console.log(`[Guardian]   Sync:   ${this.config.syncUrl}`);
    console.log(`[Guardian]   Region: ${this.config.region || '(not set)'}`);
    console.log(`[Guardian]   Relays: ${DEFAULT_RELAYS.length} (persistent connections)`);
    void pubkey;

    // Open persistent connections to all relays
    this.relayPool.connectAll();

    // Wait a moment for connections to establish before first heartbeat
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Publish first heartbeat immediately
    await this.publishHeartbeat('online');

    // Then publish periodically
    this.timer = setInterval(async () => {
      if (!this.destroyed) {
        await this.publishHeartbeat('online');
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  /** Publish a heartbeat event */
  private async publishHeartbeat(status: 'online' | 'offline'): Promise<void> {
    try {
      const template = buildHeartbeatEvent(this.config, status, this.getUptimeSeconds());
      const event = finalizeEvent(template, this.config.secretKey);
      const accepted = await this.relayPool.publishToAll(event as unknown as Record<string, unknown>);

      const totalPlayers = this.config.roomManager.getTotalPlayerCount();
      const activeRooms = this.config.roomManager.getActiveMapIds().length;
      const connected = this.relayPool.connectedCount;

      console.log(
        `[Guardian] Heartbeat ${status}: ${accepted}/${connected} connected (${this.relayPool.totalRelays} total), ` +
        `${totalPlayers} players, ${activeRooms} active rooms, ` +
        `uptime ${this.getUptimeSeconds()}s`,
      );
    } catch (err) {
      console.error(`[Guardian] Failed to publish heartbeat: ${(err as Error).message}`);
    }
  }

  /** Stop publishing and send offline heartbeat */
  async stop(): Promise<void> {
    this.destroyed = true;

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Publish final offline heartbeat before disconnecting
    try {
      await this.publishHeartbeat('offline');
    } catch (err) {
      console.error(`[Guardian] Failed to publish offline heartbeat: ${(err as Error).message}`);
    }

    // Close all persistent connections
    this.relayPool.disconnectAll();
  }
}

/**
 * Parse a secret key from hex or nsec format into a Uint8Array.
 */
export function parseSecretKey(input: string): Uint8Array {
  const trimmed = input.trim();

  if (trimmed.startsWith('nsec1')) {
    const decoded = nip19.decode(trimmed);
    if (decoded.type !== 'nsec') {
      throw new Error('Invalid nsec key');
    }
    return decoded.data;
  }

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Uint8Array.from(Buffer.from(trimmed, 'hex'));
  }

  throw new Error(
    'NOSTR_SECRET_KEY must be a 64-char hex string or an nsec1... bech32 key',
  );
}
