import { expect, test, afterAll } from "bun:test";
import { rm, readFile } from "node:fs/promises";
import { generate } from "./index";
import { runDir, loadRun } from "../ledger";

const runId = "test-run-generate";

afterAll(async () => {
  await rm(runDir(runId), { recursive: true, force: true });
});

test("generate writes one animated GIF per piece and a resolvable run ledger", async () => {
  const run = await generate(runId, 3, "fixed-salt");
  expect(run.pieces.length).toBe(3);

  const loaded = await loadRun(runId);
  expect(loaded.pieces.length).toBe(3);

  for (const piece of loaded.pieces) {
    expect(piece.seed).not.toBe("");
    const bytes = await readFile(piece.imagePath);
    const header = String.fromCharCode(...bytes.subarray(0, 6));
    expect(header).toBe("GIF89a");
  }
});

test("generate is deterministic given the same salt", async () => {
  const runIdB = "test-run-generate-b";
  try {
    const a = await generate(runId + "-a", 1, "same-salt");
    const b = await generate(runIdB, 1, "same-salt");
    expect(a.pieces[0].seed).toBe(b.pieces[0].seed);
  } finally {
    await rm(runDir(runId + "-a"), { recursive: true, force: true });
    await rm(runDir(runIdB), { recursive: true, force: true });
  }
});
