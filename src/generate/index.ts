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
