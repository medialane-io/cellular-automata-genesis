import { expect, test, afterAll } from "bun:test";
import { rm } from "node:fs/promises";
import { newRun, saveRun, loadRun, runDir } from "./ledger";

const runId = "test-run-ledger";

afterAll(async () => {
  await rm(runDir(runId), { recursive: true, force: true });
});

test("newRun creates the expected shape", () => {
  const run = newRun(runId, "salt-1", 2);
  expect(run.runId).toBe(runId);
  expect(run.pieces.length).toBe(2);
  expect(run.pieces[0]).toMatchObject({ index: 0, uploaded: false, minted: false });
  expect(run.collection.created).toBe(false);
});

test("saveRun then loadRun round-trips", async () => {
  const run = newRun(runId, "salt-1", 1);
  run.pieces[0].imageCid = "cid-1";
  await saveRun(run);
  const loaded = await loadRun(runId);
  expect(loaded.pieces[0].imageCid).toBe("cid-1");
});
