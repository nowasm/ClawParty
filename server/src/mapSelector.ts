/**
 * Map Selector — Guardian birth + adjacent frontier expansion.
 *
 * Each lobster guardian:
 *   1. Picks a seed point as its "birthplace" (the seed with fewest guardians)
 *   2. Expands outward from the guarded territory (8-directional adjacency)
 *   3. Only selects maps on the frontier (adjacent to already-guarded maps)
 *
 * This creates a naturally growing "green zone" of guarded tiles that
 * expands from the 6 seed points as more lobsters join the network.
 */

import WebSocket from 'ws';
import {
  SEED_MAP_IDS,
  getNeighborMapIds,
  isValidMapId,
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
  /** How many frontier maps (beyond the birth seed) to guard */
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

    // Check if this server serves all maps
    const servesAll = tags.some(([name, val]) => name === 'serves' && val === 'all');

    for (const tag of tags) {
      if (tag[0] !== 'map') continue;
      const mapId = parseInt(tag[1], 10);
      if (isNaN(mapId) || !isValidMapId(mapId)) continue;

      const players = tag[2] ? parseInt(tag[2], 10) : 0;
      guardedMaps.add(mapId);
      guardianCounts.set(mapId, (guardianCounts.get(mapId) ?? 0) + 1);
      playerCounts.set(mapId, (playerCounts.get(mapId) ?? 0) + (isNaN(players) ? 0 : players));
    }

    // If serves all, mark all seed maps as guarded (they can serve them on demand)
    if (servesAll) {
      for (const seed of SEED_MAP_IDS) {
        guardedMaps.add(seed);
        guardianCounts.set(seed, (guardianCounts.get(seed) ?? 0) + 1);
      }
    }
  }

  return { guardedMaps, guardianCounts, playerCounts };
}

/**
 * Choose a birth seed — the seed point with the fewest guardians.
 * Ties are broken randomly to avoid all lobsters choosing the same one.
 */
function chooseBirthSeed(state: MapNetworkState): number {
  let minGuardians = Infinity;
  const candidates: number[] = [];

  for (const seed of SEED_MAP_IDS) {
    const count = state.guardianCounts.get(seed) ?? 0;
    if (count < minGuardians) {
      minGuardians = count;
      candidates.length = 0;
      candidates.push(seed);
    } else if (count === minGuardians) {
      candidates.push(seed);
    }
  }

  // Random tie-break
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
  birthSeed: number,
): number {
  // Priority 1: Maps with no guardians get a big bonus
  const orphanBonus = guardianCount === 0 ? 500 : 0;

  // Priority 2: Fewer existing guardians = higher score
  const scarcityScore = Math.max(0, 100 - guardianCount * 50);

  // Priority 3: More players = higher demand
  const demandScore = Math.min(playerCount * 20, 100);

  // Priority 4: Proximity to birth seed (Manhattan distance on grid)
  const { x: bx, y: by } = { x: birthSeed % 100, y: Math.floor(birthSeed / 100) };
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

    // Analyze the network
    const state = analyzeHeartbeats(allEvents);

    // 1. Choose birth seed
    const birthSeed = chooseBirthSeed(state);
    console.log(`[Guardian] Birth seed: map ${birthSeed} (guardians: ${state.guardianCounts.get(birthSeed) ?? 0})`);

    // 2. Build the full guarded set (network + seeds)
    const guardedSet = new Set(state.guardedMaps);
    for (const seed of SEED_MAP_IDS) {
      guardedSet.add(seed);
    }

    // 3. Compute frontier (adjacent unguarded maps)
    const frontier = computeFrontier(guardedSet);

    // 4. Score and select frontier maps
    const scored = frontier.map((mapId) => ({
      mapId,
      score: scoreFrontierMap(
        mapId,
        state.guardianCounts.get(mapId) ?? 0,
        state.playerCounts.get(mapId) ?? 0,
        birthSeed,
      ),
    }));

    scored.sort((a, b) => b.score - a.score);
    const selectedFrontier = scored.slice(0, this.config.targetMaps).map((s) => s.mapId);

    // 5. Final map list = birth seed + frontier
    const finalMaps = [birthSeed, ...selectedFrontier];

    // Update the room manager
    this.roomManager.updateServedMaps(finalMaps);

    console.log(`[Guardian] Now guarding ${finalMaps.length} maps: seed ${birthSeed} + ${selectedFrontier.length} frontier`);
    if (selectedFrontier.length > 0) {
      console.log(`[Guardian]   Frontier maps: ${selectedFrontier.join(', ')}`);
    }

    return finalMaps;
  }
}
