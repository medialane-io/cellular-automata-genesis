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
