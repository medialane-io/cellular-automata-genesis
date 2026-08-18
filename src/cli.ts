#!/usr/bin/env bun
import { ApiClient } from "@medialane/sdk";
import { Account, RpcProvider } from "starknet";
import { generate } from "./generate/index";
import { runUpload } from "./upload/index";
import { runMint, type MintDeps } from "./mint/index";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function parseFlags(argv: string[]): Record<string, string | boolean> {
  const flags: Record<string, string | boolean> = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return flags;
}

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const flags = parseFlags(rest);

  if (command === "generate") {
    const count = Number(flags.count ?? 10);
    const runId = String(flags.run ?? `run-${Date.now()}`);
    const run = await generate(runId, count);
    console.log(`Generated ${run.pieces.length} pieces for run ${runId}`);
    return;
  }

  if (command === "upload") {
    const runId = String(flags.run);
    if (!runId) throw new Error("--run <run-id> is required");
    const apiUrl = requireEnv("MEDIALANE_API_URL");
    const apiKey = requireEnv("MEDIALANE_API_KEY");
    const run = await runUpload(runId, apiUrl, apiKey);
    console.log(`Uploaded ${run.pieces.filter((p) => p.uploaded).length}/${run.pieces.length} pieces`);
    return;
  }

  if (command === "mint") {
    const runId = String(flags.run);
    if (!runId) throw new Error("--run <run-id> is required");
    const apiUrl = requireEnv("MEDIALANE_API_URL");
    const apiKey = requireEnv("MEDIALANE_API_KEY");
    const rpcUrl = requireEnv("STARKNET_RPC_URL");
    const accountAddress = requireEnv("STARKNET_ACCOUNT_ADDRESS");
    const privateKey = requireEnv("STARKNET_PRIVATE_KEY");

    const provider = new RpcProvider({ nodeUrl: rpcUrl });
    const account = new Account({ provider, address: accountAddress, signer: privateKey });
    const apiClient = new ApiClient(apiUrl, apiKey);

    const deps: MintDeps = { apiClient, account, apiUrl, apiKey };

    const run = await runMint(runId, deps, { dryRun: Boolean(flags["dry-run"]) });
    console.log(`Minted ${run.pieces.filter((p) => p.minted).length}/${run.pieces.length} pieces`);
    console.log(`Collection: ${run.collection.collectionContract ?? "(dry run)"}`);
    return;
  }

  console.error("Usage: cli.ts <generate|upload|mint> [--run <id>] [--count <n>] [--dry-run]");
  process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
