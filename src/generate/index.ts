import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { deriveSeed } from "./seed";
import { runAutomatonFrames } from "./automaton";
import { renderGif } from "./renderGif";
import { newRun, saveRun, runDir, type RunState } from "../ledger";

export async function generate(runId: string, count: number, salt: string = runId): Promise<RunState> {
  const run = newRun(runId, salt, count);
  await mkdir(join(runDir(runId), "pieces"), { recursive: true });

  for (const piece of run.pieces) {
    const seed = deriveSeed(salt, piece.index);
    const frames = runAutomatonFrames(seed);
    const gif = renderGif(frames);
    await writeFile(piece.imagePath, gif);
    piece.seed = seed.toString();
  }

  await saveRun(run);
  return run;
}
