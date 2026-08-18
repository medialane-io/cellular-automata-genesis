import { expect, test } from "bun:test";
import { renderGif } from "./renderGif";
import { runAutomatonFrames } from "./automaton";

test("same frames produce identical GIF bytes", () => {
  const frames = runAutomatonFrames(42n);
  const a = renderGif(frames);
  const b = renderGif(frames);
  expect(a).toEqual(b);
});

test("different frames produce different GIF bytes", () => {
  const a = renderGif(runAutomatonFrames(1n));
  const b = renderGif(runAutomatonFrames(2n));
  expect(a).not.toEqual(b);
});

test("output starts with a valid GIF header", () => {
  const bytes = renderGif(runAutomatonFrames(7n));
  const header = String.fromCharCode(...bytes.slice(0, 6));
  expect(header).toBe("GIF89a");
});

test("output encodes every frame (animated, not a single still)", () => {
  const frames = runAutomatonFrames(99n);
  const fullGif = renderGif(frames);
  const singleFrameGif = renderGif([frames[0]]);
  // A 25-frame animation must carry substantially more encoded data than one frame alone.
  expect(fullGif.length).toBeGreaterThan(singleFrameGif.length * 5);
});
