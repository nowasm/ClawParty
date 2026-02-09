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

// ============================================================================
// Seed Points — the 6 starting locations in the world
// ============================================================================

/**
 * Seed map IDs — the 6 starting locations from which lobster guardians
 * expand outward. These always appear as "green" (enterable) on the world map.
 *
 * Layout on the 100x100 grid:
 *
 *            (50, 15)
 *            Night City
 *
 *  (20, 35)              (80, 35)
 *  Green Plains          Desert Dunes
 *
 *            (50, 50)
 *            Snow Field
 *
 *  (20, 65)              (80, 65)
 *  Ocean Platform        Lava Rocks
 */
export const SEED_MAP_IDS: number[] = [
  toMapId(20, 35),  // 3520 — Green Plains
  toMapId(80, 35),  // 3580 — Desert Dunes
  toMapId(50, 50),  // 5050 — Snow Field
  toMapId(80, 65),  // 6580 — Lava Rocks
  toMapId(20, 65),  // 6520 — Ocean Platform
  toMapId(50, 15),  // 1550 — Night City
];

/** Check if a map ID is a seed point */
export function isSeedMap(mapId: number): boolean {
  return SEED_MAP_IDS.includes(mapId);
}

/**
 * Get 8-directional neighbor map IDs for a given map.
 * Returns only valid map IDs (within the 100x100 grid).
 */
export function getNeighborMapIds(mapId: number): number[] {
  const { x, y } = toMapCoords(mapId);
  const neighbors: number[] = [];

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (nx >= 0 && nx < GRID_COLS && ny >= 0 && ny < GRID_ROWS) {
        neighbors.push(toMapId(nx, ny));
      }
    }
  }

  return neighbors;
}
