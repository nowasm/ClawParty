/**
 * Map Selector — Guardian start point + adjacent frontier expansion.
 *
 * Each lobster guardian:
 *   1. Picks a start map (the one with fewest guardians, or center if network is empty)
 *   2. Expands outward from the guarded territory (8-directional adjacency)
 *   3. Only selects maps on the frontier (adjacent to already-guarded maps)
 */

import WebSocket from 'ws';
import {
  getNeighborMapIds,
  isValidMapId,
  toMapId,
} from './mapRegistry.js';
import type { RoomManager } from './roomManager.js';

// Default relays for querying heartbeat data
const DEFAULT_RELAYS = [
  'wss://relay.ditto.pub',
  'wss://relay.primal.net',
];

/** Re-evaluation interval */
const REEVALUATE_INTERVAL_MS = 30 * 60_000; // 30 minutes

export interface MapSelectorConfig {
  /** How many frontier maps (beyond the start map) to guard */
  targetMaps: number;
  /** Relay URLs to query for heartbeat data */
  relays?: string[];
}

interface MapNetworkState {
  /** Set of all currently guarded map IDs across the network */
  guardedMaps: Set<number>;
  /** Map ID → number of sync nodes guarding it */
  guardianCounts: Map<number, number>;
  /** Map ID → number of players on it */
  playerCounts: Map<number, number>;
}

/**
 * Query a Nostr relay for recent heartbeat events.
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
      const subId = 'guardian-selector';
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
 * Analyze heartbeat data to build a picture of the network state.
 */
function analyzeHeartbeats(allEvents: unknown[]): MapNetworkState {
  const now = Math.floor(Date.now() / 1000);

  // Deduplicate by sync URL (keep latest per server)
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

  const guardedMaps = new Set<number>();
  const guardianCounts = new Map<number, number>();
  const playerCounts = new Map<number, number>();

  for (const event of latestBySyncUrl.values()) {
    const tags = event.tags as string[][];
    const createdAt = event.created_at as number;

    // Skip stale heartbeats (> 3 minutes)
    if (now - createdAt > 180) continue;

    const statusTag = tags.find(([name]) => name === 'status');
    if (statusTag?.[1] === 'offline') continue;

    for (const tag of tags) {
      if (tag[0] !== 'map') continue;
      const mapId = parseInt(tag[1], 10);
      if (isNaN(mapId) || !isValidMapId(mapId)) continue;

      const players = tag[2] ? parseInt(tag[2], 10) : 0;
      guardedMaps.add(mapId);
      guardianCounts.set(mapId, (guardianCounts.get(mapId) ?? 0) + 1);
      playerCounts.set(mapId, (playerCounts.get(mapId) ?? 0) + (isNaN(players) ? 0 : players));
    }
  }

  return { guardedMaps, guardianCounts, playerCounts };
}

/** Center of the grid (50, 50) — used when network has no guardians yet */
const CENTER_MAP_ID = toMapId(50, 50);

/**
 * Choose a start map — the map with the fewest guardians in the network.
 * If the network is empty, use the center map.
 */
function chooseStartMap(state: MapNetworkState): number {
  if (state.guardedMaps.size === 0) {
    return CENTER_MAP_ID;
  }

  let minGuardians = Infinity;
  const candidates: number[] = [];

  for (const mapId of state.guardedMaps) {
    const count = state.guardianCounts.get(mapId) ?? 0;
    if (count < minGuardians) {
      minGuardians = count;
      candidates.length = 0;
      candidates.push(mapId);
    } else if (count === minGuardians) {
      candidates.push(mapId);
    }
  }

  if (candidates.length === 0) return CENTER_MAP_ID;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Compute the frontier — unguarded maps adjacent to guarded territory.
 */
function computeFrontier(guardedSet: Set<number>): number[] {
  const frontier = new Set<number>();

  for (const mapId of guardedSet) {
    for (const neighbor of getNeighborMapIds(mapId)) {
      if (!guardedSet.has(neighbor)) {
        frontier.add(neighbor);
      }
    }
  }

  return Array.from(frontier);
}

/**
 * Score a frontier map for selection.
 * Higher score = more desirable to guard.
 */
function scoreFrontierMap(
  mapId: number,
  guardianCount: number,
  playerCount: number,
  startMap: number,
): number {
  const orphanBonus = guardianCount === 0 ? 500 : 0;
  const scarcityScore = Math.max(0, 100 - guardianCount * 50);
  const demandScore = Math.min(playerCount * 20, 100);
  const { x: bx, y: by } = { x: startMap % 100, y: Math.floor(startMap / 100) };
  const { x: mx, y: my } = { x: mapId % 100, y: Math.floor(mapId / 100) };
  const distance = Math.abs(bx - mx) + Math.abs(by - my);
  const proximityScore = Math.max(0, 50 - distance);
  return orphanBonus + scarcityScore + demandScore + proximityScore;
}

export class MapSelector {
  private roomManager: RoomManager;
  private config: MapSelectorConfig;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(roomManager: RoomManager, config: MapSelectorConfig) {
    this.roomManager = roomManager;
    this.config = config;
  }

  /** Start the guardian map selection process */
  async start(): Promise<number[]> {
    console.log(`[Guardian] Starting map selection (target: ${this.config.targetMaps} frontier maps)`);

    const selectedMaps = await this.selectMaps();

    // Periodic re-evaluation
    this.timer = setInterval(async () => {
      console.log('[Guardian] Re-evaluating map selection...');
      await this.selectMaps();
    }, REEVALUATE_INTERVAL_MS);

    return selectedMaps;
  }

  /** Stop the selection process */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Select maps based on network state */
  private async selectMaps(): Promise<number[]> {
    const relays = this.config.relays ?? DEFAULT_RELAYS;

    // Gather heartbeat data
    let allEvents: unknown[] = [];
    for (const relay of relays) {
      try {
        const events = await queryRelay(relay);
        allEvents = allEvents.concat(events);
        if (events.length > 0) break; // Got data, that's enough
      } catch {
        continue;
      }
    }

    const state = analyzeHeartbeats(allEvents);

    const startMap = chooseStartMap(state);
    console.log(`[Guardian] Start map: ${startMap} (guardians: ${state.guardianCounts.get(startMap) ?? 0})`);

    const guardedSet = new Set(state.guardedMaps);
    if (guardedSet.size === 0) {
      guardedSet.add(startMap);
    }

    const frontier = computeFrontier(guardedSet);

    const scored = frontier.map((mapId) => ({
      mapId,
      score: scoreFrontierMap(
        mapId,
        state.guardianCounts.get(mapId) ?? 0,
        state.playerCounts.get(mapId) ?? 0,
        startMap,
      ),
    }));

    scored.sort((a, b) => b.score - a.score);
    const selectedFrontier = scored.slice(0, this.config.targetMaps).map((s) => s.mapId);

    const finalMaps = [startMap, ...selectedFrontier];

    this.roomManager.updateServedMaps(finalMaps);

    console.log(`[Guardian] Now guarding ${finalMaps.length} maps: start ${startMap} + ${selectedFrontier.length} frontier`);
    if (selectedFrontier.length > 0) {
      console.log(`[Guardian]   Frontier maps: ${selectedFrontier.join(', ')}`);
    }

    return finalMaps;
  }
}
