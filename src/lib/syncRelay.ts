/**
 * Sync Relay Competition Protocol
 *
 * Defines types and utilities for the AI sync relay election system.
 * AI agents publish heartbeat events (kind 10311, replaceable) to announce
 * their availability and current status for a scene's sync service.
 *
 * Competition flow:
 *   1. AI queries heartbeats for a scene to assess competition state
 *   2. If OPEN (< MAX_ACTIVE slots filled): join immediately
 *   3. If CHALLENGEABLE: start as standby, players may migrate if latency is lower
 *   4. If FULL: do not participate, save resources
 *
 * Player-side flow:
 *   1. Client queries heartbeats + scene sync tags
 *   2. Merges all available relay URLs
 *   3. Connects to all (up to MAX_ACTIVE_SERVERS) and picks lowest-RTT as primary
 */

import type { NostrEvent } from '@nostrify/nostrify';

// ============================================================================
// Constants
// ============================================================================

/** Replaceable event kind for sync relay heartbeats (10000-19999 range).
 *  Previously 20311 (ephemeral), but relays don't store ephemeral events,
 *  making one-shot queries return empty results. Replaceable events store
 *  the latest event per pubkey+kind, which is ideal for heartbeats. */
export const SYNC_HEARTBEAT_KIND = 10311;

/** Discovery tag for sync relay heartbeats */
export const SYNC_HEARTBEAT_TAG = '3d-scene-sync';

/** Maximum number of active sync servers per scene */
export const MAX_ACTIVE_RELAYS = 3;

/** Heartbeat publish interval in ms */
export const HEARTBEAT_INTERVAL_MS = 30_000;

/** A relay is considered offline if no heartbeat for this duration */
export const HEARTBEAT_TIMEOUT_MS = 90_000;

// ============================================================================
// Types
// ============================================================================

/** Status of a sync relay */
export type SyncRelayStatus = 'active' | 'standby';

/** Competition state for a scene's sync slots */
export type CompetitionState = 'open' | 'challengeable' | 'full';

/** Parsed sync relay heartbeat information */
export interface SyncRelayInfo {
  /** Nostr pubkey of the AI agent running this relay */
  pubkey: string;
  /** WebSocket URL of the sync server */
  syncUrl: string;
  /** Current status */
  status: SyncRelayStatus;
  /** Slot position string (e.g., "1/3") */
  slot: string;
  /** Current connected player count */
  load: number;
  /** Maximum player capacity */
  capacity: number;
  /** Seconds online */
  uptime: number;
  /** Geographic region hint */
  region: string;
  /** Timestamp of this heartbeat */
  timestamp: number;
}

// ============================================================================
// Parsing
// ============================================================================

/**
 * Parse a kind 10311 heartbeat event into SyncRelayInfo.
 * Returns null if the event is invalid.
 */
export function parseHeartbeat(event: NostrEvent): SyncRelayInfo | null {
  if (event.kind !== SYNC_HEARTBEAT_KIND) return null;

  const getTag = (name: string) => event.tags.find(([t]) => t === name)?.[1] ?? '';

  const syncUrl = getTag('sync');
  if (!syncUrl) return null;

  const tTags = event.tags.filter(([t]) => t === 't').map(([, v]) => v);
  if (!tTags.includes(SYNC_HEARTBEAT_TAG)) return null;

  return {
    pubkey: event.pubkey,
    syncUrl,
    status: (getTag('status') as SyncRelayStatus) || 'active',
    slot: getTag('slot') || '1/1',
    load: parseInt(getTag('load'), 10) || 0,
    capacity: parseInt(getTag('capacity'), 10) || 0,
    uptime: parseInt(getTag('uptime'), 10) || 0,
    region: getTag('region') || '',
    timestamp: event.created_at,
  };
}

/**
 * Determine the competition state for a scene based on active heartbeats.
 */
export function getCompetitionState(activeRelays: SyncRelayInfo[]): CompetitionState {
  if (activeRelays.length < MAX_ACTIVE_RELAYS) return 'open';
  // If all active relays have high uptime and low load, it's FULL
  // Otherwise it's CHALLENGEABLE (there might be room for improvement)
  const allHealthy = activeRelays.every(
    (r) => r.uptime > 3600 && r.load < r.capacity * 0.8,
  );
  return allHealthy ? 'full' : 'challengeable';
}

/**
 * Filter heartbeats to only include those that are still "alive"
 * (received within the timeout window).
 */
export function filterAliveRelays(relays: SyncRelayInfo[], nowSec: number): SyncRelayInfo[] {
  const timeoutSec = HEARTBEAT_TIMEOUT_MS / 1000;
  return relays.filter((r) => nowSec - r.timestamp < timeoutSec);
}

/**
 * Build the Nostr event tags for a heartbeat event.
 */
export function buildHeartbeatTags(opts: {
  sceneAddress: string;
  syncUrl: string;
  status: SyncRelayStatus;
  slot: string;
  load: number;
  capacity: number;
  uptime: number;
  region: string;
}): string[][] {
  return [
    ['a', opts.sceneAddress],
    ['t', SYNC_HEARTBEAT_TAG],
    ['sync', opts.syncUrl],
    ['status', opts.status],
    ['slot', opts.slot],
    ['load', String(opts.load)],
    ['capacity', String(opts.capacity)],
    ['uptime', String(opts.uptime)],
    ['region', opts.region],
  ];
}
