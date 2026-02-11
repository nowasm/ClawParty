/**
 * useMapSyncServers — discover sync servers for a specific map.
 *
 * Queries Nostr for kind 10311 heartbeat events tagged with the
 * target map ID, and returns the list of available sync server URLs
 * sorted by load (fewest players first).
 */

import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { DEFAULT_RELAY_URLS } from '@/lib/scene';

const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV === true;
function debugLog(...args: unknown[]) {
  if (isDev) console.log('[MapSyncServers]', ...args);
}

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

  const getTag = (name: string) => tags.find(([t]) => t === name)?.[1] ?? '';

  const syncUrl = getTag('sync');
  if (!syncUrl) return null;

  const statusVal = getTag('status') || 'active';
  // Reject offline/standby nodes — only 'active' (or legacy 'online') are usable
  if (statusVal === 'offline' || statusVal === 'standby') return null;

  const servesAllTag = tags.find(([name, val]) => name === 'serves' && val === 'all');

  // Parse load — supports both new format (single number) and legacy "current/max"
  const loadStr = getTag('load') || '0';
  let currentPlayers: number;
  let maxPlayers: number;

  if (loadStr.includes('/')) {
    // Legacy format: "current/max"
    const parts = loadStr.split('/');
    currentPlayers = parseInt(parts[0], 10) || 0;
    maxPlayers = parseInt(parts[1], 10) || 200;
  } else {
    // New format: single number for load, separate capacity tag
    currentPlayers = parseInt(loadStr, 10) || 0;
    maxPlayers = parseInt(getTag('capacity'), 10) || 200;
  }

  // Find the specific map tag to get per-map player count
  const mapTag = tags.find(([name, val]) => name === 'map' && val === mapId.toString());
  const mapPlayers = mapTag?.[2] ? parseInt(mapTag[2], 10) : 0;

  // Reject if heartbeat is too old (> 3 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (now - event.created_at > 180) return null;

  return {
    syncUrl,
    load: `${currentPlayers}/${maxPlayers}`,
    currentPlayers,
    maxPlayers,
    region: getTag('region'),
    status: 'online',
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

      // Query all heartbeat events using only single-letter tag filters.
      // Multi-letter tags like #map and #serves are NOT indexed by relays,
      // so we fetch all heartbeats and filter client-side.
      // Use nostr.group() to query from the specific discovery relays
      // where heartbeats are published, bypassing user relay configuration.
      const discoveryRelays = nostr.group(DEFAULT_RELAY_URLS);
      const events = await discoveryRelays.query([
        {
          kinds: [10311],
          '#t': ['3d-scene-sync'],
          limit: 200,
        },
      ]);

      debugLog(`query returned ${events.length} heartbeat events, filtering for map ${mapId}`);

      // Client-side filter: keep events that either have a 'map' tag matching
      // our mapId, or have 'serves' = 'all' (indicating they handle any map).
      const mapIdStr = mapId.toString();
      const relevantEvents = events.filter((event) => {
        const hasMapTag = event.tags.some(([name, val]) => name === 'map' && val === mapIdStr);
        const servesAll = event.tags.some(([name, val]) => name === 'serves' && val === 'all');
        return hasMapTag || servesAll;
      });

      debugLog(`  ${relevantEvents.length} events relevant to map ${mapId}`);

      // Parse and deduplicate by syncUrl (keep latest per server)
      const serversByUrl = new Map<string, SyncServerInfo>();

      for (const event of relevantEvents) {
        const info = parseHeartbeatEvent(event, mapId);
        if (!info) {
          debugLog('  skipped event (invalid/stale/offline):', event.pubkey?.slice(0, 8), event.created_at);
          continue;
        }

        const existing = serversByUrl.get(info.syncUrl);
        if (!existing || info.createdAt > existing.createdAt) {
          serversByUrl.set(info.syncUrl, info);
        }
      }

      // Sort: prefer servers that already have players on this map (so later players
      // join the same node as the first), then by total load (fewest players first)
      const servers = Array.from(serversByUrl.values());
      servers.sort((a, b) => {
        if (a.mapPlayers !== b.mapPlayers) return b.mapPlayers - a.mapPlayers;
        return a.currentPlayers - b.currentPlayers;
      });

      debugLog(`found ${servers.length} active sync servers:`, servers.map(s => s.syncUrl));

      return servers;
    },
    enabled: enabled && mapId !== undefined,
    refetchInterval: 30_000, // Refresh every 30 seconds
    staleTime: 15_000, // Consider stale after 15 seconds
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
