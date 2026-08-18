import { expect, test } from "bun:test";
import { runAutomaton, runAutomatonFrames, GRID_SIZE, ITERATIONS } from "./automaton";

test("same seed produces an identical final grid", () => {
  const a = runAutomaton(777n);
  const b = runAutomaton(777n);
  expect(a).toEqual(b);
});

test("different seeds produce different grids", () => {
  const a = runAutomaton(1n);
  const b = runAutomaton(2n);
  expect(a).not.toEqual(b);
});

test("grid is GRID_SIZE x GRID_SIZE of booleans", () => {
  const grid = runAutomaton(555n);
  expect(grid.length).toBe(GRID_SIZE);
  for (const row of grid) {
    expect(row.length).toBe(GRID_SIZE);
    for (const cell of row) expect(typeof cell).toBe("boolean");
  }
});

test("runAutomatonFrames returns ITERATIONS + 1 frames ending at the same grid as runAutomaton", () => {
  const frames = runAutomatonFrames(321n);
  expect(frames.length).toBe(ITERATIONS + 1);
  expect(frames[frames.length - 1]).toEqual(runAutomaton(321n));
});

test("runAutomatonFrames is deterministic for the same seed", () => {
  const a = runAutomatonFrames(999n);
  const b = runAutomatonFrames(999n);
  expect(a).toEqual(b);
});
