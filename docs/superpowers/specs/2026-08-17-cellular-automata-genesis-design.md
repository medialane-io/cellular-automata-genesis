# Cellular Automata Genesis — design

Status: approved (in-chat, 2026-08-17)

## Purpose

A standalone client of Medialane's public `/v1` API that generates a fixed,
deterministic collection of cellular-automata art and mints it on-chain as a
`mip-erc721` collection — paid for with x402-funded credits, exercised
end-to-end as a real integration test of the developer-facing API described
at `medialane-portal`'s `/developers` page.

This repo owns no protocol logic. It is a consumer of `@medialane/sdk`, the
same way any third-party integrator would be. If the CA algorithm or the
mint flow diverge from what a real external developer could do with public
docs alone, that's a bug in this repo or a gap in the docs — not a reason to
reach into backend internals.

## Non-goals

- No new backend/SDK code. If a needed capability is missing from the public
  API, that's a separate finding to report, not something this repo patches
  around.
- No UI. CLI only.
- No on-demand/per-mint generation — the set is fixed and pre-generated
  before any credits are spent (see Data flow).
- No testnet path — Medialane is mainnet-only (existing project convention).
  Collection size is kept small (default 10, configurable) because this is a
  product test, not a real drop.

## Architecture

```
src/generate/   deterministic CA -> image (SVG) + ERC-721 metadata JSON
src/upload/     pushes generated output through /v1/metadata (Pinata-backed)
src/mint/       create-collection + mint intents via @medialane/sdk,
                local signing with a Starknet account, submits + confirms
src/cli.ts      orchestrates: generate -> upload -> mint, with --dry-run
                and resume support
```

No shared state beyond the local output directory (`out/<run-id>/`), which
doubles as the resume/idempotency ledger — each piece's upload + mint status
is recorded there so a re-run skips completed steps.

## Generation

- `collectionSalt` (random per collection, persisted in `out/<run-id>/run.json`)
  + `tokenIndex` (0..N-1) → seed via `keccak256(salt, index)`.
- Seed drives a 2D cellular automaton (Conway-style neighbor rule, seeded
  initial state) over a fixed grid/iteration count, rendered directly to SVG
  — no image library dependency, deterministic byte-for-byte for a given seed.
- Metadata JSON follows standard ERC-721 shape (`name`, `description`,
  `image`, `attributes` — rule params, iteration count, seed as a trait).
- Determinism is the correctness property under test: same seed must always
  produce the same SVG bytes and metadata JSON.

## Mint flow

1. One-time, manual, by the user (not this tool): create an `ApiClient` +
   API key via `medialane-portal` `/account` (self-serve, wallet-signed),
   fund credits with a real x402 USDC payment through the same page.
2. `cellular-automata-genesis generate --count 10` — writes SVGs + metadata
   to `out/<run-id>/`, no network calls.
3. `cellular-automata-genesis upload --run <run-id>` — for each piece not
   yet uploaded: `POST /v1/metadata/upload` (image via signed URL, then JSON
   metadata), records returned CIDs into the run ledger.
4. `cellular-automata-genesis mint --run <run-id>` —
   - `sdk.createCollectionIntent({ service: "mip-erc721", ... })` once,
     sign + confirm, record `collectionId`/`collectionContract`.
   - `sdk.mintIntent({ collectionId, tokenUri, recipient, ... })` per piece,
     sign + confirm, record `tokenId`/`txHash`.
   - Each step already completed in the ledger is skipped on re-run.
- Signing: local Starknet account from `STARKNET_ACCOUNT_ADDRESS` /
  `STARKNET_PRIVATE_KEY` env vars, using `starknet.js`. This account both
  signs the returned intents and is the account whose `ApiClient`/credits
  are being spent (same wallet used to create the API key in step 1).

## Config

`.env` (see `.env.example`): `MEDIALANE_API_KEY`, `MEDIALANE_API_URL`,
`STARKNET_ACCOUNT_ADDRESS`, `STARKNET_PRIVATE_KEY`, `STARKNET_RPC_URL`.
No secrets committed; `.env` gitignored.

## Error handling

- `--dry-run` on `mint` prints the intents (collection + all mints) without
  signing or submitting — the reviewable path before any credits are spent.
- Network/API failures during `upload` or `mint` leave the ledger in a
  partial state; re-running the same command resumes from the last
  incomplete piece rather than restarting.
- A failed mint intent does not retry automatically (avoids double-spend on
  ambiguous failures) — surfaced to the user to decide.

## Testing

- Unit: seed derivation and CA generation are pure functions — assert
  determinism (same seed → identical output) and that different indices
  produce different seeds/output.
- No mocked network tests for upload/mint — `--dry-run` plus manual runs
  against real (mainnet, small-N) credits is the verification path, since
  the whole point is exercising the real API.

## Repo

`medialane-io/cellular-automata-genesis` on GitHub, private. Sibling repo
under the Medialane workspace, no `CLAUDE.md` (not part of the core
four-layer model — a client tool, not a protocol layer).
