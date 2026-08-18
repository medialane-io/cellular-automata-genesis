# Cellular Automata Genesis Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a CLI that deterministically generates a fixed set of cellular-automata art pieces, uploads them, and mints them as a `mip-erc721` collection through the public `@medialane/sdk` API, paid for with pre-funded x402 credits.

**Architecture:** Three independent, file-ledger-linked stages — `generate` (pure, offline, produces SVG + a run ledger), `upload` (pushes images/metadata through `/v1/metadata`), `mint` (builds+signs+executes `create-collection` and `mint` intents via `@medialane/sdk`, using `starknet.js` for local signing). Each stage reads/writes `out/<run-id>/run.json`, which is also the resume/idempotency record.

**Tech Stack:** TypeScript, Bun (runtime, package manager, test runner — matches `@medialane/sdk`'s own tooling), `@medialane/sdk`, `starknet` (peer dep of the SDK, used directly for `Account`/`RpcProvider`/`hash`).

**Spec:** `docs/superpowers/specs/2026-08-17-cellular-automata-genesis-design.md`

## Global Constraints

- No new backend/SDK code — this repo only calls the public `/v1` surface via `@medialane/sdk` and plain `fetch`.
- No testnet path — mainnet only. Default collection size is small (10 pieces).
- Deterministic generation: identical seed must always produce identical SVG bytes and metadata.
- No secrets committed — all credentials via `.env` (gitignored).
- Package manager is `bun` (`bun.lock` committed), matching `@medialane/sdk`.

---

## File Structure

```
package.json / tsconfig.json / bun.lock
.env.example
README.md
src/
  generate/
    seed.ts        deriveSeed(salt, index) -> bigint
    prng.ts         createPrng(seed) -> () => number   (mulberry32-style, seeded)
    automaton.ts     runAutomaton(seed) -> boolean[][]  (2D CA grid)
    render.ts        renderSvg(grid) -> string
    metadata.ts       buildMetadata(index, seed, imageUri) -> PieceMetadata
    index.ts        generate(runOpts) -> RunState        (orchestrates the above, writes files)
  ledger.ts          RunState/PieceState types, loadRun/saveRun/newRun
  upload/
    index.ts        uploadImage(), uploadMetadataJson(), runUpload(runId)
  mint/
    index.ts        runIntent(), createCollection(), mintPiece(), runMint(runId, opts)
  cli.ts             argv parsing + dispatch to generate/upload/mint
```

Each stage module (`generate/index.ts`, `upload/index.ts`, `mint/index.ts`) has one job and depends only on `ledger.ts` for shared state — `cli.ts` is the only file that wires them together.

---

## Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore` (already exists — verify/extend)
- Create: `.env.example`

**Interfaces:**
- Produces: a `bun test` command and a `bun run src/cli.ts` entry point that later tasks build on.

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "cellular-automata-genesis",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "cli": "bun run src/cli.ts",
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@medialane/sdk": "^0.85.9",
    "starknet": "^8"
  },
  "devDependencies": {
    "@types/node": "^22",
    "typescript": "^5.6.0"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "types": ["node", "bun-types"]
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Install dependencies**

Run: `cd ~/dev/cellular-automata-genesis && bun add @medialane/sdk starknet && bun add -d @types/node typescript bun-types`
Expected: `bun.lock` created/updated, `node_modules/` populated, no errors.

- [ ] **Step 4: Write `.env.example`**

```bash
MEDIALANE_API_URL=https://api.medialane.io
MEDIALANE_API_KEY=

STARKNET_ACCOUNT_ADDRESS=
STARKNET_PRIVATE_KEY=
STARKNET_RPC_URL=
```

- [ ] **Step 5: Verify `.gitignore` covers generated/secret files**

Confirm it contains `node_modules/`, `out/`, `.env`, `dist/` (already written during scaffolding — just check, don't duplicate).

- [ ] **Step 6: Commit**

```bash
git add package.json tsconfig.json .env.example bun.lock
git commit -m "chore: scaffold project"
```

---

## Task 2: Seed derivation

**Files:**
- Create: `src/generate/seed.ts`
- Test: `src/generate/seed.test.ts`

**Interfaces:**
- Produces: `deriveSeed(salt: string, index: number): bigint`

- [ ] **Step 1: Write the failing test**

```typescript
// src/generate/seed.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/generate/seed.test.ts`
Expected: FAIL — `Cannot find module './seed'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/generate/seed.ts
import { hash } from "starknet";

export function deriveSeed(salt: string, index: number): bigint {
  return hash.starknetKeccak(`${salt}:${index}`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/generate/seed.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/generate/seed.ts src/generate/seed.test.ts
git commit -m "feat: deterministic seed derivation"
```

---

## Task 3: Seeded PRNG

**Files:**
- Create: `src/generate/prng.ts`
- Test: `src/generate/prng.test.ts`

**Interfaces:**
- Consumes: nothing (takes a raw `bigint` seed)
- Produces: `createPrng(seed: bigint): () => number` — returns a function yielding floats in `[0, 1)`

- [ ] **Step 1: Write the failing test**

```typescript
// src/generate/prng.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/generate/prng.test.ts`
Expected: FAIL — `Cannot find module './prng'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/generate/prng.ts
export function createPrng(seed: bigint): () => number {
  let state = Number(seed % 4294967296n) | 0;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/generate/prng.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/generate/prng.ts src/generate/prng.test.ts
git commit -m "feat: seeded PRNG"
```

---

## Task 4: Cellular automaton

**Files:**
- Create: `src/generate/automaton.ts`
- Test: `src/generate/automaton.test.ts`

**Interfaces:**
- Consumes: `createPrng` from Task 3 (`./prng`)
- Produces: `GRID_SIZE: number`, `ITERATIONS: number`, `runAutomaton(seed: bigint): boolean[][]`

- [ ] **Step 1: Write the failing test**

```typescript
// src/generate/automaton.test.ts
import { expect, test } from "bun:test";
import { runAutomaton, GRID_SIZE } from "./automaton";

test("same seed produces an identical final grid", () => {
  const a = runAutomaton(777n);
  const b = runAutomaton(777n);
  expect(a).toEqual(b);
});

test("different seeds produce different grids", () => {
  const a = runAutomaton(1n);
  const b = runAutomaton(2n);
  expect(a).not.toEqual(b);
});

test("grid is GRID_SIZE x GRID_SIZE of booleans", () => {
  const grid = runAutomaton(555n);
  expect(grid.length).toBe(GRID_SIZE);
  for (const row of grid) {
    expect(row.length).toBe(GRID_SIZE);
    for (const cell of row) expect(typeof cell).toBe("boolean");
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/generate/automaton.test.ts`
Expected: FAIL — `Cannot find module './automaton'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/generate/automaton.ts
import { createPrng } from "./prng";

export const GRID_SIZE = 32;
export const ITERATIONS = 24;
const INITIAL_DENSITY = 0.35;

function initialGrid(rng: () => number): boolean[][] {
  const grid: boolean[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < GRID_SIZE; x++) row.push(rng() < INITIAL_DENSITY);
    grid.push(row);
  }
  return grid;
}

function countNeighbors(grid: boolean[][], x: number, y: number): number {
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = (x + dx + GRID_SIZE) % GRID_SIZE;
      const ny = (y + dy + GRID_SIZE) % GRID_SIZE;
      if (grid[ny][nx]) count++;
    }
  }
  return count;
}

function step(grid: boolean[][]): boolean[][] {
  const next: boolean[][] = [];
  for (let y = 0; y < GRID_SIZE; y++) {
    const row: boolean[] = [];
    for (let x = 0; x < GRID_SIZE; x++) {
      const n = countNeighbors(grid, x, y);
      const alive = grid[y][x];
      row.push(alive ? n === 2 || n === 3 : n === 3);
    }
    next.push(row);
  }
  return next;
}

export function runAutomaton(seed: bigint): boolean[][] {
  const rng = createPrng(seed);
  let grid = initialGrid(rng);
  for (let i = 0; i < ITERATIONS; i++) grid = step(grid);
  return grid;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/generate/automaton.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/generate/automaton.ts src/generate/automaton.test.ts
git commit -m "feat: seeded 2D cellular automaton"
```

---

## Task 5: SVG rendering

**Files:**
- Create: `src/generate/render.ts`
- Test: `src/generate/render.test.ts`

**Interfaces:**
- Consumes: `boolean[][]` grids (shape produced by `runAutomaton`)
- Produces: `renderSvg(grid: boolean[][]): string`

- [ ] **Step 1: Write the failing test**

```typescript
// src/generate/render.test.ts
import { expect, test } from "bun:test";
import { renderSvg } from "./render";

test("same grid renders identical SVG bytes", () => {
  const grid = [
    [true, false],
    [false, true],
  ];
  expect(renderSvg(grid)).toBe(renderSvg(grid));
});

test("output is a well-formed svg element", () => {
  const grid = [[true]];
  const svg = renderSvg(grid);
  expect(svg.startsWith("<svg")).toBe(true);
  expect(svg.endsWith("</svg>")).toBe(true);
});

test("an all-dead grid still renders a valid svg with no rect cells", () => {
  const grid = [
    [false, false],
    [false, false],
  ];
  const svg = renderSvg(grid);
  expect(svg).toContain("<svg");
  expect(svg.match(/<rect/g)?.length).toBe(1); // just the background rect
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/generate/render.test.ts`
Expected: FAIL — `Cannot find module './render'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/generate/render.ts
const CELL_SIZE = 10;
const FG = "#111111";
const BG = "#f5f5f5";

export function renderSvg(grid: boolean[][]): string {
  const width = (grid[0]?.length ?? 0) * CELL_SIZE;
  const height = grid.length * CELL_SIZE;
  const cells = grid
    .flatMap((row, y) =>
      row.map((alive, x) =>
        alive
          ? `<rect x="${x * CELL_SIZE}" y="${y * CELL_SIZE}" width="${CELL_SIZE}" height="${CELL_SIZE}" fill="${FG}"/>`
          : ""
      )
    )
    .filter(Boolean)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><rect width="${width}" height="${height}" fill="${BG}"/>${cells}</svg>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/generate/render.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/generate/render.ts src/generate/render.test.ts
git commit -m "feat: deterministic SVG rendering"
```

---

## Task 6: Metadata builder

**Files:**
- Create: `src/generate/metadata.ts`
- Test: `src/generate/metadata.test.ts`

**Interfaces:**
- Consumes: `GRID_SIZE`, `ITERATIONS` from `./automaton`
- Produces: `PieceMetadata` type, `buildMetadata(index: number, seed: bigint, imageUri: string): PieceMetadata`

- [ ] **Step 1: Write the failing test**

```typescript
// src/generate/metadata.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/generate/metadata.test.ts`
Expected: FAIL — `Cannot find module './metadata'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/generate/metadata.ts
import { GRID_SIZE, ITERATIONS } from "./automaton";

export interface PieceMetadata {
  name: string;
  description: string;
  image: string;
  attributes: { trait_type: string; value: string | number }[];
}

export function buildMetadata(index: number, seed: bigint, imageUri: string): PieceMetadata {
  return {
    name: `Cellular Automata Genesis #${index}`,
    description: "A deterministic cellular-automata piece generated from a keccak-derived seed.",
    image: imageUri,
    attributes: [
      { trait_type: "Seed", value: seed.toString() },
      { trait_type: "Grid Size", value: GRID_SIZE },
      { trait_type: "Iterations", value: ITERATIONS },
    ],
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/generate/metadata.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: Commit**

```bash
git add src/generate/metadata.ts src/generate/metadata.test.ts
git commit -m "feat: ERC-721 metadata builder"
```

---

## Task 7: Run ledger

**Files:**
- Create: `src/ledger.ts`
- Test: `src/ledger.test.ts`

**Interfaces:**
- Produces: `PieceState`, `RunState` types; `newRun(runId, salt, count): RunState`; `runDir(runId): string`; `runPath(runId): string`; `saveRun(run: RunState): Promise<void>`; `loadRun(runId): Promise<RunState>`

- [ ] **Step 1: Write the failing test**

```typescript
// src/ledger.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/ledger.test.ts`
Expected: FAIL — `Cannot find module './ledger'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/ledger.ts
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

export interface PieceState {
  index: number;
  seed: string;
  imagePath: string;
  imageCid?: string;
  imageUri?: string;
  metadataCid?: string;
  tokenUri?: string;
  tokenId?: string;
  txHash?: string;
  uploaded: boolean;
  minted: boolean;
}

export interface RunState {
  runId: string;
  salt: string;
  count: number;
  createdAt: string;
  collection: {
    created: boolean;
    collectionContract?: string;
    txHash?: string;
  };
  pieces: PieceState[];
}

export function runDir(runId: string): string {
  return join("out", runId);
}

export function runPath(runId: string): string {
  return join(runDir(runId), "run.json");
}

export function newRun(runId: string, salt: string, count: number): RunState {
  const pieces: PieceState[] = [];
  for (let index = 0; index < count; index++) {
    pieces.push({
      index,
      seed: "",
      imagePath: join(runDir(runId), "pieces", `${index}.svg`),
      uploaded: false,
      minted: false,
    });
  }
  return {
    runId,
    salt,
    count,
    createdAt: new Date().toISOString(),
    collection: { created: false },
    pieces,
  };
}

export async function saveRun(run: RunState): Promise<void> {
  await mkdir(runDir(run.runId), { recursive: true });
  await writeFile(runPath(run.runId), JSON.stringify(run, null, 2), "utf8");
}

export async function loadRun(runId: string): Promise<RunState> {
  const raw = await readFile(runPath(runId), "utf8");
  return JSON.parse(raw) as RunState;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/ledger.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/ledger.ts src/ledger.test.ts
git commit -m "feat: run ledger for resumable generate/upload/mint state"
```

---

## Task 8: Generate orchestration

**Files:**
- Create: `src/generate/index.ts`
- Test: `src/generate/index.test.ts`

**Interfaces:**
- Consumes: `deriveSeed` (`./seed`), `runAutomaton` (`./automaton`), `renderSvg` (`./render`), `newRun`/`saveRun`/`runDir` (`../ledger`)
- Produces: `generate(runId: string, count: number, salt?: string): Promise<RunState>` — writes `out/<runId>/pieces/<index>.svg` and `out/<runId>/run.json`

- [ ] **Step 1: Write the failing test**

```typescript
// src/generate/index.test.ts
import { expect, test, afterAll } from "bun:test";
import { rm, readFile } from "node:fs/promises";
import { generate } from "./index";
import { runDir, loadRun } from "../ledger";

const runId = "test-run-generate";

afterAll(async () => {
  await rm(runDir(runId), { recursive: true, force: true });
});

test("generate writes one SVG per piece and a resolvable run ledger", async () => {
  const run = await generate(runId, 3, "fixed-salt");
  expect(run.pieces.length).toBe(3);

  const loaded = await loadRun(runId);
  expect(loaded.pieces.length).toBe(3);

  for (const piece of loaded.pieces) {
    expect(piece.seed).not.toBe("");
    const svg = await readFile(piece.imagePath, "utf8");
    expect(svg.startsWith("<svg")).toBe(true);
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/generate/index.test.ts`
Expected: FAIL — `Cannot find module './index'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/generate/index.ts
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deriveSeed } from "./seed";
import { runAutomaton } from "./automaton";
import { renderSvg } from "./render";
import { newRun, saveRun, runDir, type RunState } from "../ledger";

export async function generate(runId: string, count: number, salt: string = runId): Promise<RunState> {
  const run = newRun(runId, salt, count);
  await mkdir(join(runDir(runId), "pieces"), { recursive: true });

  for (const piece of run.pieces) {
    const seed = deriveSeed(salt, piece.index);
    const grid = runAutomaton(seed);
    const svg = renderSvg(grid);
    await writeFile(piece.imagePath, svg, "utf8");
    piece.seed = seed.toString();
  }

  await saveRun(run);
  return run;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/generate/index.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/generate/index.ts src/generate/index.test.ts
git commit -m "feat: generate orchestration writes deterministic pieces + ledger"
```

---

## Task 9: Upload stage

**Files:**
- Create: `src/upload/index.ts`
- Test: `src/upload/index.test.ts`

**Interfaces:**
- Consumes: `loadRun`/`saveRun` (`../ledger`), `buildMetadata` (`../generate/metadata`)
- Produces: `uploadImage(apiUrl, apiKey, filePath): Promise<{cid, uri}>`, `uploadMetadataJson(apiUrl, apiKey, metadata): Promise<{cid, uri}>`, `runUpload(runId, apiUrl, apiKey): Promise<RunState>`

This task talks to the real backend, so its test exercises only the pure request-shaping logic via a stubbed `fetch` — no live network call.

- [ ] **Step 1: Write the failing test**

```typescript
// src/upload/index.test.ts
import { expect, test, afterEach } from "bun:test";
import { uploadImage, uploadMetadataJson } from "./index";
import { writeFile, mkdir, rm } from "node:fs/promises";
import { join } from "node:path";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("uploadImage posts multipart form data with the api key header", async () => {
  await mkdir("out/test-upload", { recursive: true });
  const filePath = join("out/test-upload", "piece.svg");
  await writeFile(filePath, "<svg></svg>", "utf8");

  let capturedUrl = "";
  let capturedHeaders: Record<string, string> = {};
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    capturedUrl = url;
    capturedHeaders = init.headers as Record<string, string>;
    return new Response(JSON.stringify({ data: { cid: "img-cid", url: "ipfs://img-cid" } }), { status: 201 });
  }) as typeof fetch;

  const result = await uploadImage("https://api.example.com", "test-key", filePath);

  expect(capturedUrl).toBe("https://api.example.com/v1/metadata/upload-file");
  expect(capturedHeaders["x-api-key"]).toBe("test-key");
  expect(result).toEqual({ cid: "img-cid", uri: "ipfs://img-cid" });

  await rm("out/test-upload", { recursive: true, force: true });
});

test("uploadMetadataJson posts the metadata object as JSON", async () => {
  let capturedBody = "";
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    capturedBody = init.body as string;
    return new Response(JSON.stringify({ data: { cid: "meta-cid", url: "ipfs://meta-cid" } }), { status: 201 });
  }) as typeof fetch;

  const result = await uploadMetadataJson("https://api.example.com", "test-key", { name: "piece" });

  expect(JSON.parse(capturedBody)).toEqual({ name: "piece" });
  expect(result).toEqual({ cid: "meta-cid", uri: "ipfs://meta-cid" });
});

test("uploadImage throws with the backend error message on failure", async () => {
  await mkdir("out/test-upload-fail", { recursive: true });
  const filePath = join("out/test-upload-fail", "piece.svg");
  await writeFile(filePath, "<svg></svg>", "utf8");

  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: "Payload too large" }), { status: 413 })) as typeof fetch;

  await expect(uploadImage("https://api.example.com", "test-key", filePath)).rejects.toThrow(
    "Payload too large"
  );

  await rm("out/test-upload-fail", { recursive: true, force: true });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/upload/index.test.ts`
Expected: FAIL — `Cannot find module './index'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/upload/index.ts
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { loadRun, saveRun, type RunState } from "../ledger";
import { buildMetadata } from "../generate/metadata";

export interface UploadResult {
  cid: string;
  uri: string;
}

function apiUrlFor(apiUrl: string, path: string): string {
  return `${apiUrl.replace(/\/$/, "")}${path}`;
}

async function parseUploadResponse(res: Response): Promise<UploadResult> {
  const data = (await res.json().catch(() => ({}))) as { data?: UploadResult; error?: string };
  if (!res.ok || !data.data?.cid) {
    throw new Error(data.error ?? `Upload failed (${res.status})`);
  }
  return data.data;
}

export async function uploadImage(apiUrl: string, apiKey: string, filePath: string): Promise<UploadResult> {
  const bytes = await readFile(filePath);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/svg+xml" }), basename(filePath));
  const res = await fetch(apiUrlFor(apiUrl, "/v1/metadata/upload-file"), {
    method: "POST",
    headers: { "x-api-key": apiKey },
    body: form,
  });
  return parseUploadResponse(res);
}

export async function uploadMetadataJson(
  apiUrl: string,
  apiKey: string,
  metadata: unknown
): Promise<UploadResult> {
  const res = await fetch(apiUrlFor(apiUrl, "/v1/metadata/upload"), {
    method: "POST",
    headers: { "x-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  });
  return parseUploadResponse(res);
}

export async function runUpload(runId: string, apiUrl: string, apiKey: string): Promise<RunState> {
  const run = await loadRun(runId);

  for (const piece of run.pieces) {
    if (piece.uploaded) continue;

    const image = await uploadImage(apiUrl, apiKey, piece.imagePath);
    piece.imageCid = image.cid;
    piece.imageUri = image.uri;

    const metadata = buildMetadata(piece.index, BigInt(piece.seed), image.uri);
    const metadataUpload = await uploadMetadataJson(apiUrl, apiKey, metadata);
    piece.metadataCid = metadataUpload.cid;
    piece.tokenUri = metadataUpload.uri;
    piece.uploaded = true;

    await saveRun(run);
  }

  return run;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/upload/index.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/upload/index.ts src/upload/index.test.ts
git commit -m "feat: upload stage pushes images + metadata to /v1/metadata"
```

---

## Task 10: Mint stage

**Files:**
- Create: `src/mint/index.ts`
- Test: `src/mint/index.test.ts`

**Interfaces:**
- Consumes: `loadRun`/`saveRun` (`../ledger`)
- Produces: `MintDeps` type (injected `apiClient` + `account` + `provider`), `runMint(runId, deps, opts?: { dryRun?: boolean }): Promise<RunState>`

The mint stage is the one place this tool touches a real wallet and real credits, so its test fully fakes `apiClient`/`account`/`provider` — proving the orchestration logic (intent → sign-if-needed → execute → confirm → collection-address extraction) without any network or key material.

- [ ] **Step 1: Write the failing test**

```typescript
// src/mint/index.test.ts
import { expect, test, afterEach } from "bun:test";
import { rm } from "node:fs/promises";
import { newRun, saveRun, loadRun, runDir } from "../ledger";
import { runMint, type MintDeps } from "./index";

const runId = "test-run-mint";

afterEach(async () => {
  await rm(runDir(runId), { recursive: true, force: true });
});

function fakeDeps(): MintDeps {
  return {
    apiClient: {
      createCollectionIntent: async () => ({
        data: { id: "intent-collection", expiresAt: "", requiresSignature: false, calls: [{ contractAddress: "0x1", entrypoint: "deploy", calldata: [] }] },
      }),
      createMintIntent: async () => ({
        data: { id: "intent-mint", expiresAt: "", requiresSignature: false, calls: [{ contractAddress: "0x1", entrypoint: "mint", calldata: [] }] },
      }),
      submitIntentSignature: async () => {
        throw new Error("not used in this fixture");
      },
      confirmIntent: async () => ({ data: {} }),
    } as unknown as MintDeps["apiClient"],
    account: {
      address: "0xowner",
      execute: async () => ({ transaction_hash: "0xdeadbeef" }),
      signMessage: async () => ["0x1", "0x2"],
    } as unknown as MintDeps["account"],
    provider: {
      getTransactionReceipt: async () => ({
        events: [{ keys: ["0xCollectionDeployedSelector", "0xnewcollection"], data: [] }],
      }),
    } as unknown as MintDeps["provider"],
    collectionDeployedSelector: "0xCollectionDeployedSelector",
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

test("mints the collection once, then each uploaded piece", async () => {
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
  expect(result.pieces.every((p) => p.minted)).toBe(true);
  expect(result.pieces.every((p) => p.txHash === "0xdeadbeef")).toBe(true);

  const reloaded = await loadRun(runId);
  expect(reloaded.collection.created).toBe(true);
});

test("skips pieces not yet uploaded", async () => {
  const run = newRun(runId, "salt", 2);
  run.pieces[0].seed = "1";
  run.pieces[0].uploaded = true;
  run.pieces[0].tokenUri = "ipfs://meta-0";
  // pieces[1] left un-uploaded
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
  run.collection = { created: true, collectionContract: "0xexisting", txHash: "0xexisting-tx" };
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/mint/index.test.ts`
Expected: FAIL — `Cannot find module './index'`

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/mint/index.ts
import type { ApiClient } from "@medialane/sdk";
import type { Account, RpcProvider, Call, TypedData } from "starknet";
import { loadRun, saveRun, type RunState } from "../ledger";

export interface MintDeps {
  apiClient: Pick<
    ApiClient,
    "createCollectionIntent" | "createMintIntent" | "submitIntentSignature" | "confirmIntent"
  >;
  account: Pick<Account, "address" | "execute" | "signMessage">;
  provider: Pick<RpcProvider, "getTransactionReceipt">;
  collectionDeployedSelector: string;
}

interface RunIntentResult {
  intentId: string;
  txHash: string;
}

async function runIntent(
  deps: MintDeps,
  create: () => Promise<{ data: { id: string; requiresSignature: boolean; typedData?: unknown; calls?: unknown } }>
): Promise<RunIntentResult> {
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
  await deps.apiClient.confirmIntent(intent.id, result.transaction_hash);
  return { intentId: intent.id, txHash: result.transaction_hash };
}

async function extractDeployedCollectionAddress(deps: MintDeps, txHash: string): Promise<string | null> {
  const receipt = (await deps.provider.getTransactionReceipt(txHash)) as unknown as {
    events?: { keys?: string[] }[];
  };
  const event = receipt.events?.find((e) => e.keys?.[0] === deps.collectionDeployedSelector);
  return event?.keys?.[1] ?? null;
}

export async function runMint(
  runId: string,
  deps: MintDeps,
  opts: { dryRun?: boolean } = {}
): Promise<RunState> {
  const run = await loadRun(runId);

  if (!run.collection.created) {
    if (opts.dryRun) {
      console.log("[dry-run] would create collection for run", runId);
    } else {
      const { txHash } = await runIntent(deps, () =>
        deps.apiClient.createCollectionIntent({
          owner: deps.account.address,
          name: `Cellular Automata Genesis (${runId})`,
          symbol: "CAG",
          baseUri: "",
          service: "mip-erc721",
        })
      );
      const collectionContract = await extractDeployedCollectionAddress(deps, txHash);
      run.collection = { created: true, collectionContract: collectionContract ?? undefined, txHash };
      await saveRun(run);
    }
  }

  for (const piece of run.pieces) {
    if (piece.minted || !piece.uploaded || !piece.tokenUri) continue;

    if (opts.dryRun) {
      console.log("[dry-run] would mint piece", piece.index, piece.tokenUri);
      continue;
    }

    const { txHash } = await runIntent(deps, () =>
      deps.apiClient.createMintIntent({
        owner: deps.account.address,
        recipient: deps.account.address,
        collectionContract: run.collection.collectionContract,
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/mint/index.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/mint/index.ts src/mint/index.test.ts
git commit -m "feat: mint stage builds, signs, and executes collection + mint intents"
```

---

## Task 11: CLI

**Files:**
- Create: `src/cli.ts`

**Interfaces:**
- Consumes: `generate` (`./generate/index`), `runUpload` (`./upload/index`), `runMint`/`MintDeps` (`./mint/index`)
- Produces: the `generate`/`upload`/`mint` subcommands invoked as `bun run src/cli.ts <command> [flags]`

No unit test for this task — it is a thin argv-to-function dispatcher over already-tested modules; its correctness is verified by the manual dry-run smoke test in Task 12.

- [ ] **Step 1: Write `src/cli.ts`**

```typescript
#!/usr/bin/env bun
import { ApiClient } from "@medialane/sdk";
import { Account, RpcProvider, hash } from "starknet";
import { generate } from "./generate/index";
import { runUpload } from "./upload/index";
import { runMint, type MintDeps } from "./mint/index";

const COLLECTION_DEPLOYED_SELECTOR = hash.getSelectorFromName("CollectionDeployed");

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
    const account = new Account(provider, accountAddress, privateKey);
    const apiClient = new ApiClient(apiUrl, apiKey);

    const deps: MintDeps = {
      apiClient,
      account,
      provider,
      collectionDeployedSelector: COLLECTION_DEPLOYED_SELECTOR,
    };

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
```

- [ ] **Step 2: Typecheck**

Run: `bun run typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/cli.ts
git commit -m "feat: CLI wiring generate/upload/mint commands"
```

---

## Task 12: README and manual smoke test

**Files:**
- Create: `README.md`

**Interfaces:**
- Consumes: nothing new — documents the commands built in Tasks 8, 9, 11.

- [ ] **Step 1: Write `README.md`**

```markdown
# Cellular Automata Genesis

Deterministic cellular-automata art, generated and minted as a `mip-erc721`
collection through the public Medialane API (`@medialane/sdk`), paid for
with x402-funded credits.

## Setup

1. `bun install`
2. Copy `.env.example` to `.env` and fill in:
   - `MEDIALANE_API_KEY` — create one at medialane.io's account dashboard
     (connect a wallet, provision an API key, fund credits via x402).
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
```

- [ ] **Step 2: Run the full test suite**

Run: `bun test`
Expected: PASS, all tests across every task green

- [ ] **Step 3: Manual dry-run smoke test**

Run:
```bash
bun run src/cli.ts generate --run smoke-1 --count 3
ls out/smoke-1/pieces
```
Expected: 3 `.svg` files exist, `out/smoke-1/run.json` has 3 pieces with non-empty seeds.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: add README with setup and usage"
```

- [ ] **Step 5: Push**

```bash
git push
```
