import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { listFiles, fileMode } from "./workspace";

// ---------------------------------------------------------------------------
// Host-owned Vercel REST deploy adapter. Content-addressed two-phase upload:
// POST the file manifest, upload any blobs Vercel reports missing, re-POST,
// then poll until READY. The framework should learn the SHAPE of a structured
// deploy receipt; it should not hard-code Vercel.
// ---------------------------------------------------------------------------

const API = "https://api.vercel.com";

export interface VercelDeployReceipt {
  target: "vercel";
  deploymentId: string;
  url: string;
  readyState: string;
  files: number;
}

export interface VercelDeployInput {
  root: string;
  token: string;
  project: string;
  databaseUrl: string;
  teamId?: string;
  meta?: Record<string, string>;
  timeoutMs?: number;
  pollIntervalMs?: number;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
}

interface CollectedFile {
  file: string;
  size: number;
  mode: number;
  sha: string;
  data: Uint8Array;
}

function collectFiles(root: string): CollectedFile[] {
  return listFiles(root).map((rel) => {
    const data = readFileSync(join(root, rel));
    return {
      file: rel,
      size: data.byteLength,
      mode: fileMode(join(root, rel)),
      sha: createHash("sha1").update(data).digest("hex"),
      data: new Uint8Array(data),
    };
  });
}

function missingShas(json: unknown): string[] {
  const obj = json as { error?: { code?: string; missing?: string[] }; code?: string; missing?: string[] };
  const err = obj.error ?? obj;
  if (err && err.code === "missing_files" && Array.isArray(err.missing)) return err.missing;
  return [];
}

function resolveUrl(json: Record<string, unknown>): string {
  const aliases = (json.alias as string[] | undefined) ?? (json.aliases as string[] | undefined);
  const raw = aliases && aliases.length > 0 ? aliases[0] : (json.url as string | undefined);
  if (!raw) throw new Error("vercel deployment returned no url");
  return raw.startsWith("http") ? raw : `https://${raw}`;
}

export async function deployToVercel(input: VercelDeployInput): Promise<VercelDeployReceipt> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const log = input.log ?? (() => {});
  const teamQuery = input.teamId ? `?teamId=${input.teamId}` : "";
  const authHeaders = {
    authorization: `Bearer ${input.token}`,
    accept: "application/json",
  };

  const files = collectFiles(input.root);
  const bySha = new Map(files.map((f) => [f.sha, f]));
  log(`vercel: collected ${files.length} files`);

  const deployBody = {
    name: input.project,
    target: "production",
    version: 2,
    meta: { source: "clean-room-release-host", ...input.meta },
    env: { DATABASE_URL: input.databaseUrl },
    build: { env: { DATABASE_URL: input.databaseUrl } },
    projectSettings: {
      framework: null,
      buildCommand: "bun run build",
      outputDirectory: "dist/client",
      installCommand: "bun install",
    },
    files: files.map((f) => ({ file: f.file, size: f.size, mode: f.mode, sha: f.sha })),
  };

  const createDeployment = async (): Promise<Record<string, unknown>> => {
    const res = await fetchImpl(`${API}/v13/deployments${teamQuery}`, {
      method: "POST",
      headers: { ...authHeaders, "content-type": "application/json" },
      body: JSON.stringify(deployBody),
    });
    const json = (await res.json()) as Record<string, unknown>;
    const missing = missingShas(json);
    if (!res.ok && missing.length === 0) {
      throw new Error(`vercel create deployment failed (${res.status}): ${JSON.stringify(json)}`);
    }
    return json;
  };

  let response = await createDeployment();
  let missing = missingShas(response);
  if (missing.length > 0) {
    log(`vercel: uploading ${missing.length} missing blobs`);
    for (const sha of missing) {
      const f = bySha.get(sha);
      if (!f) throw new Error(`vercel requested unknown blob ${sha}`);
      const up = await fetchImpl(`${API}/v2/files${teamQuery}`, {
        method: "POST",
        headers: {
          ...authHeaders,
          "content-type": "application/octet-stream",
          "x-now-digest": sha,
          "x-now-size": String(f.size),
        },
        // Bun's fetch accepts a Uint8Array body at runtime; the cast sidesteps
        // the ArrayBufferLike/ArrayBuffer friction in recent TS lib typings.
        body: f.data as unknown as BodyInit,
      });
      if (!up.ok && up.status !== 409) {
        throw new Error(`vercel blob upload failed for ${f.file} (${up.status})`);
      }
    }
    response = await createDeployment();
    missing = missingShas(response);
    if (missing.length > 0) throw new Error("vercel still reports missing files after upload");
  }

  const deploymentId = response.id as string;
  if (!deploymentId) throw new Error(`vercel deployment missing id: ${JSON.stringify(response)}`);
  const url = resolveUrl(response);

  // Poll READY.
  const timeoutMs = input.timeoutMs ?? 180_000;
  const pollIntervalMs = input.pollIntervalMs ?? 2_000;
  const deadline = Date.now() + timeoutMs;
  let readyState = (response.readyState as string) ?? "QUEUED";
  while (Date.now() < deadline) {
    const res = await fetchImpl(`${API}/v13/deployments/${deploymentId}${teamQuery}`, {
      headers: authHeaders,
    });
    const json = (await res.json()) as Record<string, unknown>;
    readyState = (json.readyState as string) ?? readyState;
    log(`vercel: ${deploymentId} ${readyState}`);
    if (readyState === "READY") break;
    if (readyState === "ERROR" || readyState === "CANCELED") {
      throw new Error(`vercel deployment ${readyState}`);
    }
    await new Promise((r) => setTimeout(r, pollIntervalMs));
  }
  if (readyState !== "READY") throw new Error("vercel deployment timed out before READY");

  return { target: "vercel", deploymentId, url, readyState, files: files.length };
}
