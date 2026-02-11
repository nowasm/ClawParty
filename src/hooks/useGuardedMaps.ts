/**
 * useGuardedMaps — discover which maps are currently guarded by lobsters.
 *
 * Queries Nostr for kind 10311 heartbeat events and aggregates
 * the set of all map IDs that have at least one active guardian.
 */

import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { isValidMapId } from '@/lib/mapRegistry';

/** Info about a guarded map */
export interface GuardedMapInfo {
  mapId: number;
  /** Number of guardians (sync nodes) serving this map */
  guardianCount: number;
  /** Total player count across all guardians */
  playerCount: number;
}

/** Parse heartbeat events into a guarded map info map */
function parseHeartbeats(events: NostrEvent[]): Map<number, GuardedMapInfo> {
  const now = Math.floor(Date.now() / 1000);
  const mapInfo = new Map<number, GuardedMapInfo>();

  // Deduplicate by sync URL (keep latest per server)
  const latestBySyncUrl = new Map<string, NostrEvent>();
  for (const event of events) {
    const syncTag = event.tags.find(([t]) => t === 'sync');
    const syncUrl = syncTag?.[1];
    if (!syncUrl) continue;

    const existing = latestBySyncUrl.get(syncUrl);
    if (!existing || event.created_at > existing.created_at) {
      latestBySyncUrl.set(syncUrl, event);
    }
  }

  for (const event of latestBySyncUrl.values()) {
    // Skip stale (> 3 minutes)
    if (now - event.created_at > 180) continue;

    const statusTag = event.tags.find(([t]) => t === 'status');
    if (statusTag?.[1] === 'offline' || statusTag?.[1] === 'standby') continue;

    for (const tag of event.tags) {
      if (tag[0] !== 'map') continue;
      const mapId = parseInt(tag[1], 10);
      if (isNaN(mapId)) continue;

      const players = tag[2] ? parseInt(tag[2], 10) : 0;
      const existing = mapInfo.get(mapId) ?? { mapId, guardianCount: 0, playerCount: 0 };
      existing.guardianCount += 1;
      existing.playerCount += isNaN(players) ? 0 : players;
      mapInfo.set(mapId, existing);
    }

  }

  return mapInfo;
}

interface UseGuardedMapsReturn {
  /** Map of mapId → GuardedMapInfo for all guarded maps */
  guardedMaps: Map<number, GuardedMapInfo>;
  /** Set of all guarded map IDs */
  guardedSet: Set<number>;
  /** Whether a specific map is enterable (all valid map IDs are enterable) */
  isEnterable: (mapId: number) => boolean;
  /** Whether the query is loading */
  isLoading: boolean;
  /** Error if query failed */
  error: Error | null;
}

/**
 * Hook to discover which maps are currently guarded by lobsters.
 */
export function useGuardedMaps(): UseGuardedMapsReturn {
  const { nostr } = useNostr();

  const query = useQuery({
    queryKey: ['guarded-maps'],
    queryFn: async () => {
      // Query all heartbeat events
      const events = await nostr.query([
        {
          kinds: [10311],
          '#t': ['3d-scene-sync'],
          limit: 200,
        },
      ]);

      return parseHeartbeats(events);
    },
    refetchInterval: 60_000, // Refresh every 60 seconds
    staleTime: 30_000,
  });

  const guardedMaps = query.data ?? new Map<number, GuardedMapInfo>();

  const guardedSet = new Set<number>(guardedMaps.keys());

  // All map tiles are enterable; sync servers default to serving all maps
  const isEnterable = (mapId: number): boolean => {
    return isValidMapId(mapId);
  };

  return {
    guardedMaps,
    guardedSet,
    isEnterable,
    isLoading: query.isLoading,
    error: query.error,
  };
}
