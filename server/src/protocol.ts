/**
 * Shared protocol types for WebSocket scene sync.
 * These types mirror the client-side definitions in src/lib/wsSync.ts.
 *
 * Multi-server architecture:
 *   - The world contains 10,000 fixed maps in a 100×100 grid.
 *   - Sync servers choose which maps to serve (market-driven).
 *   - Clients connect to ALL active servers for a given map and pick
 *     the lowest-latency one as their "primary" for position downloads.
 *   - All broadcast messages carry a `msgId` for client-side deduplication.
 */

import { randomBytes } from 'node:crypto';

// ============================================================================
// Shared Types
// ============================================================================

export interface PeerPosition {
  x: number;
  y: number;
  z: number;
  ry: number;
}

export interface AvatarConfig {
  model: string;
  color: string;
  hairStyle?: string;
  hairColor?: string;
  displayName: string;
}

export interface PeerInfo {
  pubkey: string;
  position: PeerPosition;
  avatar?: AvatarConfig;
}

// ============================================================================
// Message ID Generation
// ============================================================================

/**
 * Unique node identifier for this server instance.
 * Used as prefix for msgId to guarantee global uniqueness
 * across multiple sync servers for the same scene.
 */
export const NODE_ID = randomBytes(4).toString('hex');

let _msgSeq = 0;

/** Generate a globally unique message ID: "{nodeId}-{seq}" */
export function nextMsgId(): string {
  return `${NODE_ID}-${++_msgSeq}`;
}

// ============================================================================
// Client → Server Messages
// ============================================================================

export type ClientMessage =
  | { type: 'auth'; pubkey: string; mapId?: number }
  | { type: 'auth_response'; signature: string }
  | { type: 'position'; x: number; y: number; z: number; ry: number }
  | { type: 'chat'; text: string }
  | { type: 'dm'; to: string; text: string }
  | { type: 'emoji'; emoji: string }
  | { type: 'join'; avatar: AvatarConfig }
  | { type: 'subscribe_cells'; cells: string[] }
  | { type: 'ping' };

// ============================================================================
// Server → Client Messages
// ============================================================================

export interface WelcomePeer {
  pubkey: string;
  position: PeerPosition;
  avatar?: AvatarConfig;
}

/**
 * Messages broadcast to multiple clients carry a `msgId` field.
 * This allows clients connected to multiple sync servers to
 * deduplicate messages they receive from different servers.
 *
 * Non-broadcast messages (auth_challenge, welcome, pong, error)
 * are per-connection and do NOT carry a msgId.
 */
export type ServerMessage =
  | { type: 'auth_challenge'; challenge: string }
  | { type: 'welcome'; peers: WelcomePeer[]; mapId?: number }
  | { type: 'map_list'; maps: number[] }
  | { type: 'peer_join'; msgId: string; pubkey: string; avatar?: AvatarConfig }
  | { type: 'peer_leave'; msgId: string; pubkey: string }
  | { type: 'peer_position'; msgId: string; pubkey: string; x: number; y: number; z: number; ry: number }
  | { type: 'peer_chat'; msgId: string; pubkey: string; text: string }
  | { type: 'peer_dm'; msgId: string; pubkey: string; text: string }
  | { type: 'peer_emoji'; msgId: string; pubkey: string; emoji: string }
  | { type: 'pong' }
  | { type: 'error'; message: string; code?: string }
  | { type: 'game_event'; msgId: string; event: string; data: unknown };
