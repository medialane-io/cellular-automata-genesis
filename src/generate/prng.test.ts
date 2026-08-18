import { expect, test } from "bun:test";
import { createPrng } from "./prng";

test("same seed produces the same sequence", () => {
  const a = createPrng(42n);
  const b = createPrng(42n);
  const seqA = [a(), a(), a()];
  const seqB = [b(), b(), b()];
  expect(seqA).toEqual(seqB);
});

test("different seeds produce different sequences", () => {
  const a = createPrng(1n);
  const b = createPrng(2n);
  expect(a()).not.toBe(b());
});

test("values stay within [0, 1)", () => {
  const rng = createPrng(123456789n);
  for (let i = 0; i < 100; i++) {
    const v = rng();
    expect(v).toBeGreaterThanOrEqual(0);
    expect(v).toBeLessThan(1);
  }
});
