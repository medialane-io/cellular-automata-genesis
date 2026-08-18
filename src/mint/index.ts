import type { ApiClient } from "@medialane/sdk";
import type { Account, Call, TypedData } from "starknet";
import { loadRun, saveRun, type RunState } from "../ledger";

export interface MintDeps {
  apiClient: Pick<
    ApiClient,
    "createCollectionIntent" | "createMintIntent" | "submitIntentSignature" | "getCollectionsByOwner"
  >;
  account: Pick<Account, "address" | "execute" | "signMessage">;
  apiUrl: string;
  apiKey: string;
  pollAttempts?: number;
  pollIntervalMs?: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeIntent(
  deps: MintDeps,
  create: () => Promise<{ data: { id: string; requiresSignature: boolean; typedData?: unknown; calls?: unknown } }>
): Promise<string> {
  const intent = (await create()).data;
  let calls: Call[];

  if (intent.requiresSignature) {
    const signature = await deps.account.signMessage(intent.typedData as TypedData);
    const signed = await deps.apiClient.submitIntentSignature(
      intent.id,
      (Array.isArray(signature) ? signature : [signature]).map(String)
    );
    calls = (signed.data as { calls: Call[] }).calls;
  } else {
    calls = intent.calls as Call[];
  }

  const result = await deps.account.execute(calls);
  return result.transaction_hash;
}

async function syncCollectionTx(deps: MintDeps, txHash: string): Promise<void> {
  try {
    await fetch(`${deps.apiUrl.replace(/\/$/, "")}/v1/collections/sync-tx`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": deps.apiKey },
      body: JSON.stringify({ txHash }),
    });
  } catch {
    // best-effort — the background indexer will pick it up if this fails
  }
}

async function resolveCreatedCollection(
  deps: MintDeps,
  collectionName: string
): Promise<{ contractAddress: string; collectionId: string } | null> {
  const attempts = deps.pollAttempts ?? 5;
  const intervalMs = deps.pollIntervalMs ?? 2000;

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await sleep(intervalMs);
    const res = await deps.apiClient.getCollectionsByOwner(deps.account.address, 1, 10);
    const match = res.data.find((c) => c.name === collectionName && c.collectionId);
    if (match?.collectionId) {
      return { contractAddress: match.contractAddress, collectionId: match.collectionId };
    }
  }
  return null;
}

export async function runMint(
  runId: string,
  deps: MintDeps,
  opts: { dryRun?: boolean } = {}
): Promise<RunState> {
  const run = await loadRun(runId);
  const collectionName = `Cellular Automata Genesis (${runId})`;

  if (!run.collection.created) {
    if (opts.dryRun) {
      console.log("[dry-run] would create collection for run", runId);
    } else {
      const txHash = await executeIntent(deps, () =>
        deps.apiClient.createCollectionIntent({
          owner: deps.account.address,
          name: collectionName,
          symbol: "CAG",
          baseUri: "",
        })
      );

      await syncCollectionTx(deps, txHash);
      const resolved = await resolveCreatedCollection(deps, collectionName);
      if (!resolved) {
        throw new Error(
          `Collection tx ${txHash} confirmed but the indexer hasn't surfaced a collectionId yet — re-run mint to retry the lookup.`
        );
      }

      run.collection = {
        created: true,
        collectionContract: resolved.contractAddress,
        collectionId: resolved.collectionId,
        txHash,
      };
      await saveRun(run);
    }
  }

  for (const piece of run.pieces) {
    if (piece.minted || !piece.uploaded || !piece.tokenUri) continue;

    if (opts.dryRun) {
      console.log("[dry-run] would mint piece", piece.index, piece.tokenUri);
      continue;
    }

    const txHash = await executeIntent(deps, () =>
      deps.apiClient.createMintIntent({
        owner: deps.account.address,
        recipient: deps.account.address,
        collectionId: run.collection.collectionId,
        tokenUri: piece.tokenUri,
        royaltyBps: 0,
      })
    );

    piece.minted = true;
    piece.txHash = txHash;
    await saveRun(run);
  }

  return run;
}
