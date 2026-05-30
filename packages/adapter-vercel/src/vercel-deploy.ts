import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createHash } from "node:crypto";

// ---------------------------------------------------------------------------
// Reference adapter: a Vercel REST deploy lane with a structured receipt.
//
// Content-addressed two-phase upload — POST the file manifest, upload any blobs
// Vercel reports missing, re-POST, then poll until READY. This is a REFERENCE
// adapter, not framework core: the framework should learn the SHAPE of a
// structured deploy receipt, not hard-code Vercel. Project build settings, env,
// and ignored paths are all configurable so the adapter is not tied to one
// generated-app stack. `fetchImpl` is injectable for tests.
// ---------------------------------------------------------------------------

const API = "https://api.vercel.com";
const DEFAULT_IGNORED_DIRS = new Set(["node_modules", "dist", ".git", ".vercel"]);
const DEFAULT_IGNORED_FILES = new Set([".env", ".env.local"]);

export interface VercelDeployReceipt {
  target: "vercel";
  deploymentId: string;
  url: string;
  readyState: string;
  files: number;
}

export interface VercelProjectSettings {
  framework?: string | null;
  buildCommand?: string;
  outputDirectory?: string;
  installCommand?: string;
}

export interface VercelDeployInput {
  /** Directory whose files are uploaded as the deployment source. */
  root: string;
  token: string;
  project: string;
  teamId?: string;
  /** Runtime + build env for the deployment (e.g. a DB connection string). */
  env?: Record<string, string>;
  projectSettings?: VercelProjectSettings;
  meta?: Record<string, string>;
  ignoredDirs?: Set<string>;
  ignoredFiles?: Set<string>;
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

function collectFiles(root: string, ignoredDirs: Set<string>, ignoredFiles: Set<string>): CollectedFile[] {
  const rels: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (ignoredDirs.has(entry.name)) continue;
        walk(join(dir, entry.name));
      } else if (entry.isFile()) {
        if (ignoredFiles.has(entry.name)) continue;
        rels.push(relative(root, join(dir, entry.name)).split(sep).join("/"));
      }
    }
  };
  walk(root);
  rels.sort();
  return rels.map((rel) => {
    const full = join(root, rel);
    const data = readFileSync(full);
    return {
      file: rel,
      size: data.byteLength,
      mode: statSync(full).mode,
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
  const authHeaders = { authorization: `Bearer ${input.token}`, accept: "application/json" };

  const files = collectFiles(
    input.root,
    input.ignoredDirs ?? DEFAULT_IGNORED_DIRS,
    input.ignoredFiles ?? DEFAULT_IGNORED_FILES,
  );
  const bySha = new Map(files.map((f) => [f.sha, f]));
  log(`vercel: collected ${files.length} files`);

  const settings = input.projectSettings ?? {};
  const deployBody = {
    name: input.project,
    target: "production",
    version: 2,
    meta: { source: "pneuma-adapter-vercel", ...input.meta },
    ...(input.env ? { env: input.env, build: { env: input.env } } : {}),
    projectSettings: {
      framework: settings.framework ?? null,
      buildCommand: settings.buildCommand ?? "bun run build",
      outputDirectory: settings.outputDirectory ?? "dist/client",
      installCommand: settings.installCommand ?? "bun install",
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
    if (!res.ok && missingShas(json).length === 0) {
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
    if (missingShas(response).length > 0) throw new Error("vercel still reports missing files after upload");
  }

  const deploymentId = response.id as string;
  if (!deploymentId) throw new Error(`vercel deployment missing id: ${JSON.stringify(response)}`);
  const url = resolveUrl(response);

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
