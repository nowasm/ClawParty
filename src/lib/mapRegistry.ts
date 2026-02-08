/**
 * Map Registry — defines the fixed set of 10,000 maps.
 *
 * The world is a 100×100 grid of maps, each 100m × 100m.
 * Total world size: 10 km × 10 km.
 *
 * Map ID is computed as: y * GRID_COLS + x  (range 0–9999)
 * This file is duplicated on the server side at server/src/mapRegistry.ts.
 */

// ============================================================================
// Constants
// ============================================================================

/** Number of columns in the world grid */
export const GRID_COLS = 100;

/** Number of rows in the world grid */
export const GRID_ROWS = 100;

/** Total number of maps in the world */
export const TOTAL_MAPS = GRID_COLS * GRID_ROWS; // 10,000

/** Size of each individual map in meters */
export const MAP_SIZE = 100;

/** Minimum valid map ID */
export const MIN_MAP_ID = 0;

/** Maximum valid map ID */
export const MAX_MAP_ID = TOTAL_MAPS - 1;

// ============================================================================
// Coordinate utilities
// ============================================================================

/**
 * Convert grid coordinates (x, y) to a map ID.
 * @param x Column index (0–99)
 * @param y Row index (0–99)
 * @returns Map ID (0–9999)
 */
export function toMapId(x: number, y: number): number {
  return y * GRID_COLS + x;
}

/**
 * Convert a map ID back to grid coordinates.
 * @param id Map ID (0–9999)
 * @returns { x, y } grid coordinates
 */
export function toMapCoords(id: number): { x: number; y: number } {
  return {
    x: id % GRID_COLS,
    y: Math.floor(id / GRID_COLS),
  };
}

/**
 * Check whether a value is a valid map ID (integer in [0, 9999]).
 */
export function isValidMapId(id: number): boolean {
  return Number.isInteger(id) && id >= MIN_MAP_ID && id <= MAX_MAP_ID;
}

/**
 * Get a deterministic default terrain preset for a map based on its ID.
 * This provides visual variety across the grid without requiring per-map config.
 */
export function getDefaultPreset(mapId: number): string {
  const presets = [
    '',                   // Green Plains (default)
    '__preset__desert',   // Desert Dunes
    '__preset__snow',     // Snow Field
    '__preset__lava',     // Lava Rocks
    '__preset__ocean',    // Ocean Platform
    '__preset__night',    // Night City
  ];
  // Use a simple hash to distribute presets across the grid
  const hash = ((mapId * 2654435761) >>> 0) % presets.length;
  return presets[hash];
}
