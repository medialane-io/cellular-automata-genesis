import { expect, test } from "bun:test";
import { deriveSeed } from "./seed";

test("deriveSeed is deterministic for the same salt and index", () => {
  const a = deriveSeed("run-abc", 3);
  const b = deriveSeed("run-abc", 3);
  expect(a).toBe(b);
});

test("deriveSeed differs across indices", () => {
  const a = deriveSeed("run-abc", 0);
  const b = deriveSeed("run-abc", 1);
  expect(a).not.toBe(b);
});

test("deriveSeed differs across salts", () => {
  const a = deriveSeed("run-abc", 0);
  const b = deriveSeed("run-xyz", 0);
  expect(a).not.toBe(b);
});
