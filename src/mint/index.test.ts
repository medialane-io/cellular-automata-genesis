import { expect, test, afterEach } from "bun:test";
import { rm } from "node:fs/promises";
import { newRun, saveRun, loadRun, runDir } from "../ledger";
import { runMint, type MintDeps } from "./index";

const runId = "test-run-mint";
const originalFetch = globalThis.fetch;

afterEach(async () => {
  await rm(runDir(runId), { recursive: true, force: true });
  globalThis.fetch = originalFetch;
});

function fakeDeps(overrides: Partial<MintDeps> = {}): MintDeps {
  globalThis.fetch = (async () => new Response(JSON.stringify({ data: { synced: 1 } }))) as unknown as typeof fetch;

  return {
    apiClient: {
      createCollectionIntent: async () => ({
        data: { id: "intent-collection", expiresAt: "", requiresSignature: false, calls: [{ contractAddress: "0x1", entrypoint: "create_collection", calldata: [] }] },
      }),
      createMintIntent: async () => ({
        data: { id: "intent-mint", expiresAt: "", requiresSignature: false, calls: [{ contractAddress: "0x1", entrypoint: "mint", calldata: [] }] },
      }),
      submitIntentSignature: async () => {
        throw new Error("not used in this fixture");
      },
      getCollectionsByOwner: async () => ({
        data: [
          {
            contractAddress: "0xnewcollection",
            collectionId: "42",
            name: `Cellular Automata Genesis (${runId})`,
          },
        ],
      }),
    } as unknown as MintDeps["apiClient"],
    account: {
      address: "0xowner",
      execute: async () => ({ transaction_hash: "0xdeadbeef" }),
      signMessage: async () => ["0x1", "0x2"],
    } as unknown as MintDeps["account"],
    apiUrl: "https://api.example.com",
    apiKey: "test-key",
    pollAttempts: 1,
    pollIntervalMs: 0,
    ...overrides,
  };
}

test("dry run does not execute or confirm anything", async () => {
  const run = newRun(runId, "salt", 1);
  run.pieces[0].seed = "1";
  run.pieces[0].uploaded = true;
  run.pieces[0].tokenUri = "ipfs://meta";
  await saveRun(run);

  const deps = fakeDeps();
  let executed = false;
  (deps.account as any).execute = async () => {
    executed = true;
    return { transaction_hash: "0x" };
  };

  await runMint(runId, deps, { dryRun: true });
  expect(executed).toBe(false);
});

test("creates the collection once, resolves its id, then mints each uploaded piece", async () => {
  const run = newRun(runId, "salt", 2);
  for (const piece of run.pieces) {
    piece.seed = String(piece.index + 1);
    piece.uploaded = true;
    piece.tokenUri = `ipfs://meta-${piece.index}`;
  }
  await saveRun(run);

  const deps = fakeDeps();
  const result = await runMint(runId, deps, {});

  expect(result.collection.created).toBe(true);
  expect(result.collection.collectionContract).toBe("0xnewcollection");
  expect(result.collection.collectionId).toBe("42");
  expect(result.pieces.every((p) => p.minted)).toBe(true);
  expect(result.pieces.every((p) => p.txHash === "0xdeadbeef")).toBe(true);

  const reloaded = await loadRun(runId);
  expect(reloaded.collection.collectionId).toBe("42");
});

test("skips pieces not yet uploaded", async () => {
  const run = newRun(runId, "salt", 2);
  run.pieces[0].seed = "1";
  run.pieces[0].uploaded = true;
  run.pieces[0].tokenUri = "ipfs://meta-0";
  await saveRun(run);

  const deps = fakeDeps();
  const result = await runMint(runId, deps, {});

  expect(result.pieces[0].minted).toBe(true);
  expect(result.pieces[1].minted).toBe(false);
});

test("re-running skips an already-created collection and already-minted pieces", async () => {
  const run = newRun(runId, "salt", 1);
  run.pieces[0].seed = "1";
  run.pieces[0].uploaded = true;
  run.pieces[0].tokenUri = "ipfs://meta-0";
  run.pieces[0].minted = true;
  run.pieces[0].txHash = "0xalready";
  run.collection = { created: true, collectionContract: "0xexisting", collectionId: "7", txHash: "0xexisting-tx" };
  await saveRun(run);

  const deps = fakeDeps();
  let collectionIntentCalls = 0;
  (deps.apiClient as any).createCollectionIntent = async () => {
    collectionIntentCalls++;
    return { data: { id: "x", expiresAt: "", requiresSignature: false, calls: [] } };
  };

  const result = await runMint(runId, deps, {});

  expect(collectionIntentCalls).toBe(0);
  expect(result.pieces[0].txHash).toBe("0xalready");
});

test("throws a clear error if the collection never resolves after sync", async () => {
  const run = newRun(runId, "salt", 1);
  run.pieces[0].seed = "1";
  run.pieces[0].uploaded = true;
  run.pieces[0].tokenUri = "ipfs://meta-0";
  await saveRun(run);

  const deps = fakeDeps({
    apiClient: {
      createCollectionIntent: async () => ({
        data: { id: "intent-collection", expiresAt: "", requiresSignature: false, calls: [{ contractAddress: "0x1", entrypoint: "create_collection", calldata: [] }] },
      }),
      createMintIntent: async () => {
        throw new Error("should not be called");
      },
      submitIntentSignature: async () => {
        throw new Error("not used");
      },
      getCollectionsByOwner: async () => ({ data: [] }),
    } as unknown as MintDeps["apiClient"],
  });

  await expect(runMint(runId, deps, {})).rejects.toThrow(/collectionId/);
});
