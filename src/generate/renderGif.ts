import { GIFEncoder } from "gifenc";
import { GRID_SIZE } from "./automaton";

const CELL_SIZE = 10;
const FRAME_DELAY_MS = 140;
const PALETTE: number[][] = [
  [245, 245, 245],
  [17, 17, 17],
];

function frameToIndex(grid: boolean[][]): Uint8Array {
  const size = GRID_SIZE * CELL_SIZE;
  const index = new Uint8Array(size * size);
  for (let gy = 0; gy < GRID_SIZE; gy++) {
    for (let gx = 0; gx < GRID_SIZE; gx++) {
      const value = grid[gy][gx] ? 1 : 0;
      for (let dy = 0; dy < CELL_SIZE; dy++) {
        const row = (gy * CELL_SIZE + dy) * size;
        const rowStart = row + gx * CELL_SIZE;
        index.fill(value, rowStart, rowStart + CELL_SIZE);
      }
    }
  }
  return index;
}

export function renderGif(frames: boolean[][][]): Uint8Array {
  const size = GRID_SIZE * CELL_SIZE;
  const gif = GIFEncoder();
  for (const grid of frames) {
    const index = frameToIndex(grid);
    gif.writeFrame(index, size, size, { palette: PALETTE, delay: FRAME_DELAY_MS, repeat: 0 });
  }
  gif.finish();
  return gif.bytes();
}
