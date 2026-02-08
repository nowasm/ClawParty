/**
 * Client-side spatial grid utilities for Area-of-Interest (AOI) management.
 *
 * Mirrors the server-side spatialGrid.ts logic. The client uses this
 * to compute which cells to subscribe to based on the player's position.
 */

/** Scene dimensions in meters */
export const SCENE_SIZE = 100;

/** Number of cells per axis */
export const GRID_SIZE = 10;

/** Size of each cell in meters */
export const CELL_SIZE = SCENE_SIZE / GRID_SIZE;

/**
 * Compute the cell coordinate string for a world position.
 * Clamps to valid grid range [0, GRID_SIZE-1].
 */
export function cellFromPosition(x: number, z: number): string {
  const cx = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(x / CELL_SIZE)));
  const cz = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(z / CELL_SIZE)));
  return `${cx},${cz}`;
}

/**
 * Get the surrounding cells for a given position (3x3 neighborhood).
 * Returns the cell IDs the client should subscribe to.
 *
 * @param x World X position
 * @param z World Z position
 * @param radius Number of cells in each direction (default 1 = 3x3 = 9 cells)
 */
export function getSubscriptionCells(x: number, z: number, radius = 1): string[] {
  const cx = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(x / CELL_SIZE)));
  const cz = Math.max(0, Math.min(GRID_SIZE - 1, Math.floor(z / CELL_SIZE)));

  const cells: string[] = [];
  for (let dx = -radius; dx <= radius; dx++) {
    for (let dz = -radius; dz <= radius; dz++) {
      const nx = cx + dx;
      const nz = cz + dz;
      if (nx >= 0 && nx < GRID_SIZE && nz >= 0 && nz < GRID_SIZE) {
        cells.push(`${nx},${nz}`);
      }
    }
  }
  return cells;
}
