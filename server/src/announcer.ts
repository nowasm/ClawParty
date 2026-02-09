/**
 * Heartbeat Announcer — publishes ephemeral events to Nostr relays
 * so clients can discover which maps this sync node serves.
 *
 * Publishes kind 20311 events (ephemeral) with:
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
 * Build a kind 20311 ephemeral heartbeat event.
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
    kind: 20311,
    created_at: Math.floor(Date.now() / 1000),
    tags,
    content: '',
  };
}

/**
 * Publish an event to a single relay via WebSocket.
 */
function publishToRelay(relayUrl: string, eventJson: object): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      try { ws.close(); } catch { /* ignore */ }
      resolve(false);
    }, 10_000);

    let ws: WebSocket;
    try {
      ws = new WebSocket(relayUrl);
    } catch {
      clearTimeout(timeout);
      resolve(false);
      return;
    }

    ws.on('open', () => {
      ws.send(JSON.stringify(['EVENT', eventJson]));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (Array.isArray(msg) && msg[0] === 'OK') {
          clearTimeout(timeout);
          ws.close();
          resolve(!!msg[2]);
        }
      } catch { /* ignore */ }
    });

    ws.on('error', () => {
      clearTimeout(timeout);
      resolve(false);
    });
  });
}

/**
 * Publish the event to all default relays.
 */
async function publishToRelays(event: object): Promise<number> {
  const results = await Promise.allSettled(
    DEFAULT_RELAYS.map((relay) => publishToRelay(relay, event)),
  );

  return results.filter(
    (r) => r.status === 'fulfilled' && r.value === true,
  ).length;
}

export class Announcer {
  private config: AnnouncerConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private destroyed = false;
  private startedAt = 0;

  constructor(config: AnnouncerConfig) {
    this.config = config;
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
    void pubkey;

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
      const accepted = await publishToRelays(event);

      const totalPlayers = this.config.roomManager.getTotalPlayerCount();
      const activeRooms = this.config.roomManager.getActiveMapIds().length;

      console.log(
        `[Guardian] Heartbeat ${status}: ${accepted}/${DEFAULT_RELAYS.length} relays, ` +
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

    // Publish final offline heartbeat
    try {
      await this.publishHeartbeat('offline');
    } catch (err) {
      console.error(`[Guardian] Failed to publish offline heartbeat: ${(err as Error).message}`);
    }
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
