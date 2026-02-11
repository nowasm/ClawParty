/**
 * useSyncServerList — discover all active sync servers on the network.
 *
 * Queries Nostr for kind 10311 heartbeat events and returns a
 * deduplicated list of sync server nodes with their status info.
 */

import { useNostr } from '@nostrify/react';
import { useQuery } from '@tanstack/react-query';
import type { NostrEvent } from '@nostrify/nostrify';
import { DEFAULT_RELAY_URLS } from '@/lib/scene';

/** Parsed sync server node info from a heartbeat event */
export interface SyncServerNode {
  /** Nostr pubkey of the sync server operator */
  pubkey: string;
  /** Public WebSocket URL (wss://...) */
  syncUrl: string;
  /** Server status */
  status: 'active' | 'standby' | 'offline';
  /** Current connected player count */
  currentPlayers: number;
  /** Maximum player capacity */
  maxPlayers: number;
  /** Number of active rooms (maps with players) */
  activeRooms: number;
  /** List of map IDs this server serves (empty if "serves all") */
  servedMapIds: number[];
  /** Whether this server serves all maps on demand */
  servesAll: boolean;
  /** Region identifier (e.g. "asia-east", "us-west") */
  region: string;
  /** Uptime in seconds */
  uptime: number;
  /** Event timestamp (unix seconds) */
  createdAt: number;
}

/**
 * Parse a heartbeat event into a SyncServerNode.
 * Returns null if the event is invalid or stale (> 3 minutes).
 */
function parseServerHeartbeat(event: NostrEvent): SyncServerNode | null {
  const tags = event.tags;
  const getTag = (name: string) => tags.find(([t]) => t === name)?.[1] ?? '';

  const syncUrl = getTag('sync');
  if (!syncUrl) return null;

  const statusVal = getTag('status') || 'active';
  if (statusVal === 'offline' || statusVal === 'standby') return null;

  // Reject heartbeats older than 3 minutes
  const now = Math.floor(Date.now() / 1000);
  if (now - event.created_at > 180) return null;

  // Parse load
  const loadStr = getTag('load') || '0';
  let currentPlayers: number;
  let maxPlayers: number;

  if (loadStr.includes('/')) {
    const parts = loadStr.split('/');
    currentPlayers = parseInt(parts[0], 10) || 0;
    maxPlayers = parseInt(parts[1], 10) || 200;
  } else {
    currentPlayers = parseInt(loadStr, 10) || 0;
    maxPlayers = parseInt(getTag('capacity'), 10) || 200;
  }

  // Parse map tags
  const servesAll = tags.some(([name, val]) => name === 'serves' && val === 'all');
  const servedMapIds: number[] = [];
  for (const tag of tags) {
    if (tag[0] === 'map') {
      const mapId = parseInt(tag[1], 10);
      if (!isNaN(mapId)) servedMapIds.push(mapId);
    }
  }

  const activeRooms = parseInt(getTag('rooms'), 10) || 0;
  const uptime = parseInt(getTag('uptime'), 10) || 0;

  return {
    pubkey: event.pubkey,
    syncUrl,
    status: statusVal as 'active' | 'standby' | 'offline',
    currentPlayers,
    maxPlayers,
    activeRooms,
    servedMapIds,
    servesAll,
    region: getTag('region') || '',
    uptime,
    createdAt: event.created_at,
  };
}

interface UseSyncServerListReturn {
  /** List of active sync server nodes, sorted by load (fewest players first) */
  servers: SyncServerNode[];
  /** Whether the query is loading */
  isLoading: boolean;
  /** Error if the query failed */
  error: Error | null;
}

/**
 * Hook to discover all currently active sync servers on the network.
 */
export function useSyncServerList(): UseSyncServerListReturn {
  const { nostr } = useNostr();

  const query = useQuery({
    queryKey: ['sync-server-list'],
    queryFn: async () => {
      // Query from the specific relays where heartbeats are published.
      // Using nostr.group() bypasses the user's configured relay list and
      // ensures we always reach the discovery relays, even if the user
      // has customised their relay set.
      const discoveryRelays = nostr.group(DEFAULT_RELAY_URLS);
      const events = await discoveryRelays.query([
        {
          kinds: [10311],
          '#t': ['3d-scene-sync'],
          limit: 200,
        },
      ]);

      // Deduplicate by syncUrl — keep latest event per server
      const latestByUrl = new Map<string, NostrEvent>();
      for (const event of events) {
        const syncTag = event.tags.find(([t]) => t === 'sync');
        const syncUrl = syncTag?.[1];
        if (!syncUrl) continue;

        const existing = latestByUrl.get(syncUrl);
        if (!existing || event.created_at > existing.created_at) {
          latestByUrl.set(syncUrl, event);
        }
      }

      // Parse into SyncServerNode
      const servers: SyncServerNode[] = [];
      for (const event of latestByUrl.values()) {
        const node = parseServerHeartbeat(event);
        if (node) servers.push(node);
      }

      // Sort: most players first (active servers on top), then by uptime
      servers.sort((a, b) => {
        if (a.currentPlayers !== b.currentPlayers) return b.currentPlayers - a.currentPlayers;
        return b.uptime - a.uptime;
      });

      return servers;
    },
    refetchInterval: 30_000,
    staleTime: 15_000,
  });

  return {
    servers: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
  };
}
