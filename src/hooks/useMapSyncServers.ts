/**
 * useMapSyncServers — discover sync servers for a specific map.
 *
 * Queries Nostr for kind 20311 heartbeat events tagged with the
 * target map ID, and returns the list of available sync server URLs
 * sorted by load (fewest players first).
 */

import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';

/** Parsed info about a sync server from its heartbeat event */
export interface SyncServerInfo {
  /** Public WebSocket URL (wss://...) */
  syncUrl: string;
  /** Current player load: "current/max" */
  load: string;
  /** Current player count */
  currentPlayers: number;
  /** Max player capacity */
  maxPlayers: number;
  /** Region identifier */
  region: string;
  /** Server status */
  status: 'online' | 'offline';
  /** Player count on the specific map */
  mapPlayers: number;
  /** Whether this server serves all maps */
  servesAll: boolean;
  /** Pubkey of the sync server operator */
  pubkey: string;
  /** Event timestamp */
  createdAt: number;
}

/**
 * Parse a heartbeat event into a SyncServerInfo.
 * Returns null if the event is invalid or offline.
 */
function parseHeartbeatEvent(event: NostrEvent, mapId: number): SyncServerInfo | null {
  const tags = event.tags;

  const syncTag = tags.find(([name]) => name === 'sync');
  const loadTag = tags.find(([name]) => name === 'load');
  const statusTag = tags.find(([name]) => name === 'status');
  const regionTag = tags.find(([name]) => name === 'region');
  const servesAllTag = tags.find(([name, val]) => name === 'serves' && val === 'all');

  if (!syncTag?.[1]) return null;

  const status = (statusTag?.[1] ?? 'online') as 'online' | 'offline';
  if (status === 'offline') return null;

  // Parse load
  const loadStr = loadTag?.[1] ?? '0/200';
  const loadParts = loadStr.split('/');
  const currentPlayers = parseInt(loadParts[0], 10) || 0;
  const maxPlayers = parseInt(loadParts[1], 10) || 200;

  // Find the specific map tag to get per-map player count
  const mapTag = tags.find(([name, val]) => name === 'map' && val === mapId.toString());
  const mapPlayers = mapTag?.[2] ? parseInt(mapTag[2], 10) : 0;

  // Reject if heartbeat is too old (> 3 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (now - event.created_at > 180) return null;

  return {
    syncUrl: syncTag[1],
    load: loadStr,
    currentPlayers,
    maxPlayers,
    region: regionTag?.[1] ?? '',
    status,
    mapPlayers: isNaN(mapPlayers) ? 0 : mapPlayers,
    servesAll: !!servesAllTag,
    pubkey: event.pubkey,
    createdAt: event.created_at,
  };
}

interface UseMapSyncServersOptions {
  /** Map ID to find sync servers for */
  mapId: number | undefined;
  /** Whether the query should be enabled */
  enabled?: boolean;
}

interface UseMapSyncServersReturn {
  /** List of available sync server URLs, sorted by preference */
  syncUrls: string[];
  /** Detailed server info */
  servers: SyncServerInfo[];
  /** Whether the query is loading */
  isLoading: boolean;
  /** Error if the query failed */
  error: Error | null;
}

/**
 * Hook to discover sync servers for a specific map.
 *
 * Queries Nostr for heartbeat events and returns available sync URLs.
 * Results are sorted by: fewest total players first (to balance load).
 */
export function useMapSyncServers({
  mapId,
  enabled = true,
}: UseMapSyncServersOptions): UseMapSyncServersReturn {
  const { nostr } = useNostr();

  const query = useQuery({
    queryKey: ['map-sync-servers', mapId],
    queryFn: async () => {
      if (mapId === undefined) return [];

      // Query heartbeat events for this map
      // We query both specific map tags and "serves all" nodes
      const events = await nostr.query([
        {
          kinds: [20311],
          '#t': ['3d-scene-sync'],
          '#map': [mapId.toString()],
          limit: 20,
        },
        {
          kinds: [20311],
          '#t': ['3d-scene-sync'],
          '#serves': ['all'],
          limit: 20,
        },
      ]);

      // Parse and deduplicate by syncUrl (keep latest per server)
      const serversByUrl = new Map<string, SyncServerInfo>();

      for (const event of events) {
        const info = parseHeartbeatEvent(event, mapId);
        if (!info) continue;

        const existing = serversByUrl.get(info.syncUrl);
        if (!existing || info.createdAt > existing.createdAt) {
          serversByUrl.set(info.syncUrl, info);
        }
      }

      // Sort by total player load (balance load across servers)
      const servers = Array.from(serversByUrl.values());
      servers.sort((a, b) => a.currentPlayers - b.currentPlayers);

      return servers;
    },
    enabled: enabled && mapId !== undefined,
    refetchInterval: 60_000, // Refresh every 60 seconds
    staleTime: 30_000, // Consider stale after 30 seconds
  });

  const servers = query.data ?? [];
  const syncUrls = servers.map((s) => s.syncUrl);

  return {
    syncUrls,
    servers,
    isLoading: query.isLoading,
    error: query.error,
  };
}
