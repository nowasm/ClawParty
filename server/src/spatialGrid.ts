/**
 * Spatial Grid for Area-of-Interest (AOI) management.
 *
 * Divides a scene into a grid of cells. Clients subscribe to nearby
 * cells and only receive position updates from players in those cells.
 * This reduces bandwidth by 10-100x for large scenes.
 *
 * Default: 100m x 100m scene → 10x10 grid → 100 cells (10m each).
 */

// ============================================================================
// Configuration
// ============================================================================

/** Scene dimensions in meters */
export const SCENE_SIZE = 100;

/** Number of cells per axis */
export const GRID_SIZE = 10;

/** Size of each cell in meters */
export const CELL_SIZE = SCENE_SIZE / GRID_SIZE;

// ============================================================================
// Cell utilities
// ============================================================================

/**
 * Compute the cell coordinate string for a world position.
 * Clamps to valid grid range [0, GRID_SIZE-1].
 *
 * @param x World X position (0..SCENE_SIZE)
 * @param z World Z position (0..SCENE_SIZE)
 * @returns Cell string like "3,5"
 */
export function cellFromPosition(x: number, z: number): string {
  const cx = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(x / CELL_SIZE)));
  const cz = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(z / CELL_SIZE)));
  return `${cx},${cz}`;
}

/**
 * Parse a cell string back into grid coordinates.
 * Returns null if the string is invalid.
 */
export function parseCell(cell: string): { cx: number; cz: number } | null {
  const parts = cell.split(',');
  if (parts.length !== 2) return null;
  const cx = parseInt(parts[0], 10);
  const cz = parseInt(parts[1], 10);
  if (isNaN(cx) || isNaN(cz)) return null;
  if (cx < 0 || cx >= GRID_SIZE || cz < 0 || cz >= GRID_SIZE) return null;
  return { cx, cz };
}

/**
 * Get the surrounding cells for a given cell (3x3 neighborhood).
 * Includes the cell itself. Clamps to grid boundaries.
 *
 * @param cell Center cell string (e.g., "3,5")
 * @param radius Number of cells in each direction (default 1 = 3x3)
 * @returns Array of cell strings
 */
export function getNearbyCells(cell: string, radius = 1): string[] {
  const parsed = parseCell(cell);
  if (!parsed) return [cell];

  const cells: string[] = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      const nx = parsed.cx + dx;
      const nz = parsed.cz + dz;
      if (nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE) {
        cells.push(`${nx},${nz}`);
      }
    }
  }
  return cells;
}

/**
 * Validate an array of cell strings.
 * Returns only valid cells, deduped, capped at a maximum count.
 */
export function validateCells(cells: string[], maxCells = 25): string[] {
  const valid = new Set<string>();
  for (const cell of cells) {
    if (valid.size >= maxCells) break;
    if (parseCell(cell)) {
      valid.add(cell);
    }
  }
  return Array.from(valid);
}
