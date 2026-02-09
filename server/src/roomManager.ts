/**
 * Room Manager — manages multiple Room instances keyed by mapId.
 *
 * Rooms are created on-demand when the first client joins a map,
 * and destroyed after all clients leave and an idle timeout elapses.
 *
 * The manager enforces which maps this server is willing to serve
 * (configured via an allowlist or "serve all" mode).
 */

import type { WebSocket } from 'ws';
import { Room } from './room.js';
import { isValidMapId } from './mapRegistry.js';

/** How long an empty room stays alive before being destroyed (ms) */
const EMPTY_ROOM_TTL_MS = 5 * 60_000; // 5 minutes

/** Check interval for cleaning up empty rooms */
const CLEANUP_INTERVAL_MS = 60_000; // 1 minute

export interface RoomManagerConfig {
  /**
   * Which maps this server is willing to serve.
   * - `'all'`      → serve any map (for dev / testing)
   * - `number[]`   → only serve these specific map IDs
   */
  servedMaps: 'all' | number[];
}

interface ManagedRoom {
  room: Room;
  mapId: number;
  /** When the room became empty (0 if still occupied) */
  emptyAt: number;
}

export class RoomManager {
  private rooms: Map<number, ManagedRoom> = new Map();
  private config: RoomManagerConfig;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: RoomManagerConfig) {
    this.config = config;
  }

  /** Start the periodic cleanup timer */
  start(): void {
    if (this.cleanupTimer) return;
    this.cleanupTimer = setInterval(() => {
      this.cleanupEmptyRooms();
    }, CLEANUP_INTERVAL_MS);
  }

  /** Check if a map ID is served by this node */
  isMapServed(mapId: number): boolean {
    if (!isValidMapId(mapId)) return false;
    if (this.config.servedMaps === 'all') return true;
    return this.config.servedMaps.includes(mapId);
  }

  /** Get or create a room for a map */
  getOrCreateRoom(mapId: number): Room | null {
    if (!this.isMapServed(mapId)) return null;

    const existing = this.rooms.get(mapId);
    if (existing) {
      existing.emptyAt = 0; // Mark as occupied again
      return existing.room;
    }

    // Create a new room
    const room = new Room(mapId);
    const managed: ManagedRoom = {
      room,
      mapId,
      emptyAt: 0,
    };
    this.rooms.set(mapId, managed);
    console.log(`[RoomManager] Created room for map ${mapId} (total rooms: ${this.rooms.size})`);
    return room;
  }

  /** Get an existing room (without creating) */
  getRoom(mapId: number): Room | undefined {
    return this.rooms.get(mapId)?.room;
  }

  /** Handle a new connection that requests a specific map */
  addConnection(ws: WebSocket, mapId: number): boolean {
    const room = this.getOrCreateRoom(mapId);
    if (!room) {
      // Map not served by this node
      return false;
    }
    room.addConnection(ws);
    return true;
  }

  /** Get all active map IDs */
  getActiveMapIds(): number[] {
    return Array.from(this.rooms.keys());
  }

  /** Get total player count across all rooms */
  getTotalPlayerCount(): number {
    let total = 0;
    for (const managed of this.rooms.values()) {
      total += managed.room.playerCount;
    }
    return total;
  }

  /** Get player count per map */
  getPlayerCounts(): Map<number, number> {
    const counts = new Map<number, number>();
    for (const [mapId, managed] of this.rooms) {
      const count = managed.room.playerCount;
      if (count > 0) {
        counts.set(mapId, count);
      }
    }
    return counts;
  }

  /** Get the list of map IDs this server is configured to serve */
  getServedMapIds(): number[] | 'all' {
    return this.config.servedMaps;
  }

  /** Update the served maps list (used by MapSelector in auto mode) */
  updateServedMaps(mapIds: number[]): void {
    this.config.servedMaps = mapIds;
  }

  /** Clean up idle connections across all rooms */
  cleanupInactive(maxIdleMs: number): void {
    for (const managed of this.rooms.values()) {
      managed.room.cleanupInactive(maxIdleMs);
    }
    // Mark rooms that are now empty
    const now = Date.now();
    for (const managed of this.rooms.values()) {
      if (managed.room.playerCount === 0 && managed.emptyAt === 0) {
        managed.emptyAt = now;
      }
    }
  }

  /** Remove rooms that have been empty for too long */
  private cleanupEmptyRooms(): void {
    const now = Date.now();
    const toRemove: number[] = [];

    for (const [mapId, managed] of this.rooms) {
      // Re-check occupancy
      if (managed.room.playerCount > 0) {
        managed.emptyAt = 0;
        continue;
      }

      // If newly empty, set the timer
      if (managed.emptyAt === 0) {
        managed.emptyAt = now;
        continue;
      }

      // If empty long enough, schedule for removal
      if (now - managed.emptyAt > EMPTY_ROOM_TTL_MS) {
        toRemove.push(mapId);
      }
    }

    for (const mapId of toRemove) {
      const managed = this.rooms.get(mapId);
      if (managed) {
        managed.room.destroy();
        this.rooms.delete(mapId);
        console.log(`[RoomManager] Destroyed empty room for map ${mapId} (remaining: ${this.rooms.size})`);
      }
    }
  }

  /** Destroy all rooms and stop the cleanup timer */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    for (const managed of this.rooms.values()) {
      managed.room.destroy();
    }
    this.rooms.clear();
  }
}
