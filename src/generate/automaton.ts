import { createPrng } from "./prng";

export const GRID_SIZE = 32;
export const ITERATIONS = 24;
const INITIAL_DENSITY = 0.35;

function initialGrid(rng: () => number): boolean[][] {
  const grid: boolean[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < GRID_SIZE; x++) row.push(rng() < INITIAL_DENSITY);
    grid.push(row);
  }
  return grid;
}

function countNeighbors(grid: boolean[][], x: number, y: number): number {
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = (x + dx + GRID_SIZE) % GRID_SIZE;
      const ny = (y + dy + GRID_SIZE) % GRID_SIZE;
      if (grid[ny][nx]) count++;
    }
  }
  return count;
}

function step(grid: boolean[][]): boolean[][] {
  const next: boolean[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      const n = countNeighbors(grid, x, y);
      const alive = grid[y][x];
      row.push(alive ? n === 2 || n === 3 : n === 3);
    }
    next.push(row);
  }
  return next;
}

export function runAutomaton(seed: bigint): boolean[][] {
  const rng = createPrng(seed);
  let grid = initialGrid(rng);
  for (let i = 0; i < ITERATIONS; i++) grid = step(grid);
  return grid;
}

/** All ITERATIONS + 1 grids (initial state through the final frame), for previewing the evolution. */
export function runAutomatonFrames(seed: bigint): boolean[][][] {
  const rng = createPrng(seed);
  const frames: boolean[][][] = [initialGrid(rng)];
  for (let i = 0; i < ITERATIONS; i++) frames.push(step(frames[frames.length - 1]));
  return frames;
}
