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
