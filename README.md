# Cellular Automata Genesis

Deterministic, animated cellular-automata art — each piece is a GIF of the
full evolution, not just the final frame — generated and minted as a
`mip-erc721` collection through the public Medialane API (`@medialane/sdk`),
paid for with x402-funded credits.

## Setup

1. `bun install`
2. Copy `.env.example` to `.env` and fill in:
   - `MEDIALANE_API_KEY` — create one from your account dashboard (connect a
     wallet, provision an API key, fund credits via x402).
   - `STARKNET_ACCOUNT_ADDRESS` / `STARKNET_PRIVATE_KEY` — the same account
     used to create the API key above.
   - `STARKNET_RPC_URL` — a Starknet mainnet RPC endpoint.

## Usage

```bash
bun run src/cli.ts generate --run demo-1 --count 10
bun run src/cli.ts upload --run demo-1
bun run src/cli.ts mint --run demo-1 --dry-run   # review intents first
bun run src/cli.ts mint --run demo-1             # spends credits + gas
```

Each command reads/writes `out/<run-id>/run.json`, so re-running a command
resumes from wherever the previous run stopped.

## Testing

```bash
bun test
```
