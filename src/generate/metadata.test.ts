import { expect, test } from "bun:test";
import { buildMetadata } from "./metadata";

test("builds ERC-721-shaped metadata with the given image uri", () => {
  const meta = buildMetadata(3, 42n, "ipfs://abc123");
  expect(meta.name).toBe("Cellular Automata Genesis #3");
  expect(meta.image).toBe("ipfs://abc123");
  expect(meta.attributes).toEqual(
    expect.arrayContaining([{ trait_type: "Seed", value: "42" }])
  );
});
