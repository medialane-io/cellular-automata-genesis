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
  const data = (await res.json().catch(() => ({}))) as {
    data?: { cid: string; url: string };
    error?: string;
  };
  if (!res.ok || !data.data?.cid) {
    throw new Error(data.error ?? `Upload failed (${res.status})`);
  }
  return { cid: data.data.cid, uri: data.data.url };
}

export async function uploadImage(apiUrl: string, apiKey: string, filePath: string): Promise<UploadResult> {
  const bytes = await readFile(filePath);
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: "image/gif" }), basename(filePath));
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
