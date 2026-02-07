/**
 * Shared protocol types for WebSocket scene sync.
 * These types mirror the client-side definitions in src/lib/wsSync.ts.
 */

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
// Client → Server Messages
// ============================================================================

export type ClientMessage =
  | { type: 'auth'; pubkey: string }
  | { type: 'auth_response'; signature: string }
  | { type: 'position'; x: number; y: number; z: number; ry: number }
  | { type: 'chat'; text: string }
  | { type: 'dm'; to: string; text: string }
  | { type: 'emoji'; emoji: string }
  | { type: 'join'; avatar: AvatarConfig }
  | { type: 'ping' };

// ============================================================================
// Server → Client Messages
// ============================================================================

export interface WelcomePeer {
  pubkey: string;
  position: PeerPosition;
  avatar?: AvatarConfig;
}

export type ServerMessage =
  | { type: 'auth_challenge'; challenge: string }
  | { type: 'welcome'; peers: WelcomePeer[] }
  | { type: 'peer_join'; pubkey: string; avatar?: AvatarConfig }
  | { type: 'peer_leave'; pubkey: string }
  | { type: 'peer_position'; pubkey: string; x: number; y: number; z: number; ry: number }
  | { type: 'peer_chat'; pubkey: string; text: string }
  | { type: 'peer_dm'; pubkey: string; text: string }
  | { type: 'peer_emoji'; pubkey: string; emoji: string }
  | { type: 'pong' }
  | { type: 'error'; message: string; code?: string }
  | { type: 'game_event'; event: string; data: unknown };
