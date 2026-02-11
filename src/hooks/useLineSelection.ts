/**
 * useLineSelection — select the best guardian line (sync server) for a map.
 *
 * Discovers all guardians for a specific map from heartbeats,
 * takes the top 3 by load (fewest players), and manages line selection.
 * Players connect to ONE line at a time (single sync server).
 */

import { useState, useCallback, useMemo } from 'react';
import { useMapSyncServers, type SyncServerInfo } from '@/hooks/useMapSyncServers';

const isDev = typeof import.meta !== 'undefined' && import.meta.env?.DEV === true;
function debugLog(...args: unknown[]) {
  if (isDev) console.log('[LineSelection]', ...args);
}

/** Max number of lines shown to the player */
const MAX_LINES = 3;

/** Load threshold (%) to suggest switching to another line */
const LOAD_THRESHOLD = 0.7;

/** A guardian line (sync server) the player can connect to */
export interface GuardianLine {
  /** Short identifier for UI display */
  id: string;
  /** Guardian's Nostr pubkey */
  pubkey: string;
  /** WebSocket URL */
  syncUrl: string;
  /** Current player count on this line */
  playerCount: number;
  /** Max capacity */
  capacity: number;
  /** Region identifier */
  region: string;
  /** Whether this is the recommended primary line */
  isPrimary: boolean;
}

export interface UseLineSelectionReturn {
  /** Top 3 available lines (sorted by load, fewest first) */
  lines: GuardianLine[];
  /** Total number of guardians for this map (may be > 3) */
  totalGuardians: number;
  /** Currently selected line */
  currentLine: GuardianLine | null;
  /** Select a different line by id */
  selectLine: (id: string) => void;
  /** Whether the map has no guardians at all */
  isUnguarded: boolean;
  /** Whether data is loading */
  isLoading: boolean;
  /** Whether the primary line is overloaded (hint to switch) */
  isPrimaryOverloaded: boolean;
}

function serverToLine(server: SyncServerInfo, index: number): GuardianLine {
  return {
    id: server.pubkey.slice(0, 8),
    pubkey: server.pubkey,
    syncUrl: server.syncUrl,
    playerCount: server.mapPlayers,
    capacity: server.maxPlayers,
    region: server.region,
    isPrimary: index === 0,
  };
}

export function useLineSelection(mapId: number | undefined): UseLineSelectionReturn {
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);

  const { servers, isLoading } = useMapSyncServers({
    mapId,
    enabled: mapId !== undefined,
  });

  // Convert servers to lines, take top 3
  const lines = useMemo(() => {
    // Servers are already sorted by fewest players first from useMapSyncServers
    const result = servers.slice(0, MAX_LINES).map((s, i) => serverToLine(s, i));
    if (isDev && mapId !== undefined) {
      debugLog(`map ${mapId}: ${servers.length} servers found, ${result.length} lines available`);
      if (result.length === 0 && !isLoading) {
        debugLog(`map ${mapId}: NO sync servers found — map will be in offline mode`);
        debugLog('  This usually means no guardian is publishing heartbeats for this map.');
        debugLog('  Tip: use ?sync=ws://localhost:18080 to connect to a local server directly.');
      }
    }
    return result;
  }, [servers, isLoading, mapId]);

  // Determine current line
  const currentLine = useMemo(() => {
    if (lines.length === 0) return null;

    // If user manually selected a line, use that
    if (selectedLineId) {
      const found = lines.find((l) => l.id === selectedLineId);
      if (found) return found;
    }

    // Auto-select: primary line (lowest load)
    // But if primary is overloaded and there's a better option, prefer it
    const primary = lines[0];
    if (primary.capacity > 0 && primary.playerCount / primary.capacity > LOAD_THRESHOLD && lines.length > 1) {
      // Find a line under threshold
      const better = lines.find(
        (l) => l.capacity === 0 || l.playerCount / l.capacity <= LOAD_THRESHOLD,
      );
      if (better) return better;
    }

    return primary;
  }, [lines, selectedLineId]);

  const selectLine = useCallback((id: string) => {
    setSelectedLineId(id);
  }, []);

  const isPrimaryOverloaded = lines.length > 0 && lines[0].capacity > 0
    && lines[0].playerCount / lines[0].capacity > LOAD_THRESHOLD;

  return {
    lines,
    totalGuardians: servers.length,
    currentLine,
    selectLine,
    isUnguarded: !isLoading && servers.length === 0,
    isLoading,
    isPrimaryOverloaded,
  };
}
