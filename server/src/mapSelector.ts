/**
 * Map Selector — automatically selects which maps a sync node should serve.
 *
 * The algorithm prioritizes:
 *   1. Maps with zero sync nodes (prevent orphaned maps)
 *   2. Maps with fewest sync nodes (balance load)
 *   3. Maps with most players (serve where demand is highest)
 *
 * The selector periodically re-evaluates and can adjust the served map list.
 * This is used when the server is started without a specific SERVED_MAPS config.
 *
 * Usage:
 *   const selector = new MapSelector(roomManager, { targetMaps: 50 });
 *   await selector.start();
 *   // selector updates roomManager's served maps periodically
 *   selector.stop();
 */

import WebSocket from 'ws';
import { TOTAL_MAPS } from './mapRegistry.js';
import type { RoomManager } from './roomManager.js';

// Default relays for querying heartbeat data
const DEFAULT_RELAYS = [
  'wss://relay.ditto.pub',
  'wss://relay.primal.net',
];

/** Re-evaluation interval */
const REEVALUATE_INTERVAL_MS = 30 * 60_000; // 30 minutes

export interface MapSelectorConfig {
  /** How many maps this node should aim to serve */
  targetMaps: number;
  /** Relay URLs to query for heartbeat data */
  relays?: string[];
}

interface MapScore {
  mapId: number;
  syncNodes: number;
  players: number;
  score: number;
}

/**
 * Query a Nostr relay for recent heartbeat events.
 * Returns parsed events as raw JSON arrays.
 */
function queryRelay(relayUrl: string): Promise<unknown[]> {
  return new Promise((resolve) => {
    const events: unknown[] = [];
    const timeout = setTimeout(() => {
      try { ws.close(); } catch { /* ignore */ }
      resolve(events);
    }, 15_000);

    let ws: WebSocket;
    try {
      ws = new WebSocket(relayUrl);
    } catch {
      clearTimeout(timeout);
      resolve(events);
      return;
    }

    ws.on('open', () => {
      // Subscribe to heartbeat events
      const subId = 'map-selector';
      ws.send(JSON.stringify([
        'REQ', subId,
        {
          kinds: [20311],
          '#t': ['3d-scene-sync'],
          limit: 200,
        },
      ]));
    });

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data.toString());
        if (Array.isArray(msg)) {
          if (msg[0] === 'EVENT') {
            events.push(msg[2]);
          } else if (msg[0] === 'EOSE') {
            clearTimeout(timeout);
            ws.close();
            resolve(events);
          }
        }
      } catch { /* ignore */ }
    });

    ws.on('error', () => {
      clearTimeout(timeout);
      resolve(events);
    });
  });
}

/**
 * Analyze heartbeat data to score maps for selection.
 */
function scoreMap(
  mapId: number,
  syncNodeCount: number,
  playerCount: number,
): number {
  // Higher score = more desirable to serve
  // Priority 1: Maps with zero sync nodes get a huge bonus
  const orphanBonus = syncNodeCount === 0 ? 1000 : 0;
  // Priority 2: Fewer existing sync nodes = higher score
  const scarcityScore = Math.max(0, 100 - syncNodeCount * 25);
  // Priority 3: More players = higher demand score
  const demandScore = Math.min(playerCount * 10, 100);

  return orphanBonus + scarcityScore + demandScore;
}

export class MapSelector {
  private roomManager: RoomManager;
  private config: MapSelectorConfig;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(roomManager: RoomManager, config: MapSelectorConfig) {
    this.roomManager = roomManager;
    this.config = config;
  }

  /** Start the auto-selection process */
  async start(): Promise<number[]> {
    console.log(`[MapSelector] Starting auto-selection (target: ${this.config.targetMaps} maps)`);

    const selectedMaps = await this.selectMaps();

    // Start periodic re-evaluation
    this.timer = setInterval(async () => {
      console.log('[MapSelector] Re-evaluating map selection...');
      await this.selectMaps();
    }, REEVALUATE_INTERVAL_MS);

    return selectedMaps;
  }

  /** Stop the auto-selection process */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Select maps based on network state */
  private async selectMaps(): Promise<number[]> {
    const relays = this.config.relays ?? DEFAULT_RELAYS;

    // Gather heartbeat data from relays
    let allEvents: unknown[] = [];
    for (const relay of relays) {
      try {
        const events = await queryRelay(relay);
        allEvents = allEvents.concat(events);
        if (events.length > 0) break; // Got data from one relay, that's enough
      } catch {
        continue;
      }
    }

    // Analyze the data
    const mapStats = new Map<number, { syncNodes: Set<string>; players: number }>();
    const now = Math.floor(Date.now() / 1000);

    // Deduplicate by sync URL
    const latestBySyncUrl = new Map<string, Record<string, unknown>>();
    for (const raw of allEvents) {
      const event = raw as Record<string, unknown>;
      const tags = event.tags as string[][] | undefined;
      if (!tags) continue;

      const syncTag = tags.find(([name]) => name === 'sync');
      const syncUrl = syncTag?.[1];
      if (!syncUrl) continue;

      const createdAt = event.created_at as number;
      const existing = latestBySyncUrl.get(syncUrl);
      if (!existing || createdAt > (existing.created_at as number)) {
        latestBySyncUrl.set(syncUrl, event);
      }
    }

    for (const event of latestBySyncUrl.values()) {
      const tags = event.tags as string[][];
      const createdAt = event.created_at as number;

      // Skip stale
      if (now - createdAt > 180) continue;

      const statusTag = tags.find(([name]) => name === 'status');
      if (statusTag?.[1] === 'offline') continue;

      const syncTag = tags.find(([name]) => name === 'sync');
      const syncUrl = syncTag?.[1] ?? '';

      for (const tag of tags) {
        if (tag[0] !== 'map') continue;
        const mapId = parseInt(tag[1], 10);
        if (isNaN(mapId) || mapId < 0 || mapId >= TOTAL_MAPS) continue;

        const playerCount = tag[2] ? parseInt(tag[2], 10) : 0;
        const stats = mapStats.get(mapId) ?? { syncNodes: new Set<string>(), players: 0 };
        stats.syncNodes.add(syncUrl);
        stats.players += isNaN(playerCount) ? 0 : playerCount;
        mapStats.set(mapId, stats);
      }
    }

    // Score all maps
    const scores: MapScore[] = [];
    for (let mapId = 0; mapId < TOTAL_MAPS; mapId++) {
      const stats = mapStats.get(mapId);
      const syncNodes = stats?.syncNodes.size ?? 0;
      const players = stats?.players ?? 0;
      scores.push({
        mapId,
        syncNodes,
        players,
        score: scoreMap(mapId, syncNodes, players),
      });
    }

    // Sort by score (highest first) and pick top N
    scores.sort((a, b) => b.score - a.score);
    const selected = scores.slice(0, this.config.targetMaps).map((s) => s.mapId);

    console.log(`[MapSelector] Selected ${selected.length} maps:`);
    const withPlayers = selected.filter((id) => {
      const stats = mapStats.get(id);
      return stats && stats.players > 0;
    });
    if (withPlayers.length > 0) {
      console.log(`[MapSelector]   Maps with active players: ${withPlayers.join(', ')}`);
    }
    const orphaned = selected.filter((id) => {
      const stats = mapStats.get(id);
      return !stats || stats.syncNodes.size === 0;
    });
    console.log(`[MapSelector]   Orphaned maps (no sync nodes): ${orphaned.length}`);

    return selected;
  }
}
