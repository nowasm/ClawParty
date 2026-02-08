import { useQuery } from '@tanstack/react-query';
import { useNostr } from '@nostrify/react';

import { DEFAULT_RELAY_URLS, sceneAddress } from '@/lib/scene';
import {
  SYNC_HEARTBEAT_KIND,
  SYNC_HEARTBEAT_TAG,
  MAX_ACTIVE_RELAYS,
  HEARTBEAT_TIMEOUT_MS,
  parseHeartbeat,
  type SyncRelayInfo,
  type CompetitionState,
} from '@/lib/syncRelay';

interface UseSyncRelaysOptions {
  /** Scene owner pubkey */
  scenePubkey: string | undefined;
  /** Scene d-tag */
  sceneDTag: string | undefined;
  /** Static sync URLs from scene metadata (seed/fallback) */
  sceneSyncUrls?: string[];
}

interface UseSyncRelaysReturn {
  /**
   * Merged and deduplicated list of all available sync relay URLs.
   * Combines static scene metadata sync tags with dynamic heartbeat discoveries.
   * Limited to MAX_ACTIVE_RELAYS (defaults to top entries by recency/load).
   */
  syncUrls: string[];
  /** Detailed relay information from heartbeats */
  relays: SyncRelayInfo[];
  /** Current competition state for this scene */
  competitionState: CompetitionState;
  /** Whether the query is loading */
  isLoading: boolean;
}

/**
 * Discover available sync relays for a scene.
 *
 * Queries Nostr for heartbeat events (kind 20311) published by AI agents,
 * merges with static sync URLs from the scene metadata, and returns
 * a deduplicated list capped at MAX_ACTIVE_RELAYS.
 *
 * Refreshes every 30 seconds to stay up-to-date with relay availability.
 */
export function useSyncRelays({
  scenePubkey,
  sceneDTag,
  sceneSyncUrls = [],
}: UseSyncRelaysOptions): UseSyncRelaysReturn {
  const { nostr } = useNostr();

  const sceneAddr = scenePubkey && sceneDTag
    ? sceneAddress(scenePubkey, sceneDTag)
    : '';

  const { data, isLoading } = useQuery({
    queryKey: ['sync-relays', sceneAddr],
    queryFn: async ({ signal }) => {
      if (!sceneAddr) return { relays: [] as SyncRelayInfo[], competitionState: 'open' as CompetitionState };

      const sceneRelays = nostr.group(DEFAULT_RELAY_URLS);

      // Query heartbeat events for this scene
      const events = await sceneRelays.query(
        [{
          kinds: [SYNC_HEARTBEAT_KIND],
          '#a': [sceneAddr],
          '#t': [SYNC_HEARTBEAT_TAG],
          limit: 20,
        }],
        { signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]) },
      );

      // Parse and filter alive relays
      const nowSec = Math.floor(Date.now() / 1000);
      const timeoutSec = HEARTBEAT_TIMEOUT_MS / 1000;

      const relayMap = new Map<string, SyncRelayInfo>();

      for (const event of events) {
        const info = parseHeartbeat(event);
        if (!info) continue;

        // Skip stale heartbeats
        if (nowSec - info.timestamp > timeoutSec) continue;

        // Keep the most recent heartbeat per sync URL
        const existing = relayMap.get(info.syncUrl);
        if (!existing || info.timestamp > existing.timestamp) {
          relayMap.set(info.syncUrl, info);
        }
      }

      const relays = Array.from(relayMap.values());

      // Determine competition state
      const activeRelays = relays.filter((r) => r.status === 'active');
      let competitionState: CompetitionState;
      if (activeRelays.length < MAX_ACTIVE_RELAYS) {
        competitionState = 'open';
      } else {
        const allHealthy = activeRelays.every(
          (r) => r.uptime > 3600 && r.load < r.capacity * 0.8,
        );
        competitionState = allHealthy ? 'full' : 'challengeable';
      }

      return { relays, competitionState };
    },
    enabled: !!sceneAddr,
    // Refresh every 30 seconds to pick up new/departed relays
    refetchInterval: 30_000,
    staleTime: 15_000,
    retry: 1,
  });

  // Merge heartbeat-discovered URLs with static scene sync URLs
  const syncUrls = getMergedSyncUrls(
    sceneSyncUrls,
    data?.relays ?? [],
  );

  return {
    syncUrls,
    relays: data?.relays ?? [],
    competitionState: data?.competitionState ?? 'open',
    isLoading,
  };
}

/**
 * Merge static scene sync URLs with dynamically discovered relay URLs.
 * Deduplicates and caps at MAX_ACTIVE_RELAYS.
 *
 * Priority:
 *   1. Active relays sorted by load (lowest first)
 *   2. Static URLs from scene metadata (as fallback)
 *   3. Standby relays
 */
function getMergedSyncUrls(
  staticUrls: string[],
  relays: SyncRelayInfo[],
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  // 1. Active relays (sorted by load ascending)
  const activeRelays = relays
    .filter((r) => r.status === 'active')
    .sort((a, b) => a.load - b.load);

  for (const relay of activeRelays) {
    if (result.length >= MAX_ACTIVE_RELAYS) break;
    if (!seen.has(relay.syncUrl)) {
      seen.add(relay.syncUrl);
      result.push(relay.syncUrl);
    }
  }

  // 2. Static URLs from scene metadata (fill remaining slots)
  for (const url of staticUrls) {
    if (result.length >= MAX_ACTIVE_RELAYS) break;
    if (url && !seen.has(url)) {
      seen.add(url);
      result.push(url);
    }
  }

  // 3. Standby relays (fill remaining slots if any)
  const standbyRelays = relays
    .filter((r) => r.status === 'standby')
    .sort((a, b) => a.load - b.load);

  for (const relay of standbyRelays) {
    if (result.length >= MAX_ACTIVE_RELAYS) break;
    if (!seen.has(relay.syncUrl)) {
      seen.add(relay.syncUrl);
      result.push(relay.syncUrl);
    }
  }

  return result;
}
