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
  /**
   * Scene d-tag for scene-based discovery.
   * When set, heartbeats include an `a` tag with the scene address
   * (30311:<pubkey>:<dTag>) so clients using useSyncRelays can discover
   * this sync server by scene address.
   */
  sceneDTag?: string;
}

/**
 * Build a kind 20311 ephemeral heartbeat event.
 *
 * Tags serve two discovery paths:
 *   1. Map-based: `#map` tags → used by useMapSyncServers (MapView)
 *   2. Scene-based: `#a` tag → used by useSyncRelays (SceneView)
 *
 * Both paths query `#t: ["3d-scene-sync"]` as the discovery filter.
 */
function buildHeartbeatEvent(
  config: AnnouncerConfig,
  status: 'online' | 'offline',
  uptimeSeconds: number,
): EventTemplate {
  const servedMaps = config.roomManager.getServedMapIds();
  const playerCounts = config.roomManager.getPlayerCounts();
  const totalPlayers = config.roomManager.getTotalPlayerCount();

  // Map status to the format useSyncRelays expects: 'active' | 'standby'
  const syncRelayStatus = status === 'online' ? 'active' : 'standby';

  const tags: string[][] = [
    ['t', '3d-scene-sync'],
    ['sync', config.syncUrl],
    ['status', syncRelayStatus],
    ['load', totalPlayers.toString()],
    ['capacity', config.maxPlayers.toString()],
    ['uptime', uptimeSeconds.toString()],
  ];

  if (config.region) {
    tags.push(['region', config.region]);
  }

  // Add scene address tag for scene-based discovery (useSyncRelays)
  if (config.sceneDTag) {
    const pubkey = getPublicKey(config.secretKey);
    tags.push(['a', `30311:${pubkey}:${config.sceneDTag}`]);
    tags.push(['slot', `1/${Math.max(1, totalPlayers > 0 ? 1 : 1)}`]);
  }

  // Add map tags for map-based discovery (useMapSyncServers)
  if (servedMaps === 'all') {
    // For "all" mode, just advertise maps that have active rooms
    // (advertising all 10,000 would be too much)
    // Also add a special tag to indicate this node serves all maps
    tags.push(['serves', 'all']);
    for (const [mapId, count] of playerCounts) {
      tags.push(['map', mapId.toString(), count.toString()]);
    }
  } else {
    // Advertise all configured maps, with player counts for active ones
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
    console.log('[Announcer] Starting heartbeat publisher');
    console.log(`[Announcer]   Pubkey: ${npub}`);
    console.log(`[Announcer]   Sync:   ${this.config.syncUrl}`);
    console.log(`[Announcer]   Region: ${this.config.region || '(not set)'}`);
    if (this.config.sceneDTag) {
      console.log(`[Announcer]   Scene:  30311:${pubkey}:${this.config.sceneDTag}`);
    }

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
        `[Announcer] Heartbeat ${status}: ${accepted}/${DEFAULT_RELAYS.length} relays, ` +
        `${totalPlayers} players, ${activeRooms} active rooms, ` +
        `uptime ${this.getUptimeSeconds()}s`,
      );
    } catch (err) {
      console.error(`[Announcer] Failed to publish heartbeat: ${(err as Error).message}`);
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
      console.error(`[Announcer] Failed to publish offline heartbeat: ${(err as Error).message}`);
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
