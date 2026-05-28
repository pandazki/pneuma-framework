import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

export interface VercelApiDeployInput {
  readonly root: string;
  readonly token: string;
  readonly project_name: string;
  readonly team_id?: string;
  readonly meta?: Record<string, string>;
  readonly fetch_impl?: typeof fetch;
  readonly poll_interval_ms?: number;
  readonly timeout_ms?: number;
  readonly on_log?: (message: string) => void;
}

export interface VercelApiDeployReceipt {
  readonly deployment_id: string;
  readonly url: string;
  readonly ready_state: string;
  readonly files: number;
}

interface VercelPreparedFile {
  readonly file: string;
  readonly size: number;
  readonly mode: number;
  readonly sha: string;
}

interface VercelCollectedFile extends VercelPreparedFile {
  readonly data: Uint8Array;
}

type JsonRecord = Record<string, unknown>;

const ignoredFileNames = new Set(["node_modules", "dist", ".env", ".env.local", ".vercel"]);
const vercelApiBase = "https://api.vercel.com";

export async function deployVercelProductionFromRoot(input: VercelApiDeployInput): Promise<VercelApiDeployReceipt> {
  const fetchImpl = input.fetch_impl ?? fetch;
  const files = collectVercelDeploymentFiles(input.root);
  if (files.length === 0) throw new Error("Vercel deployment has no files.");

  input.on_log?.(`Prepared ${files.length} source files for Vercel API deployment.`);
  const created = await createDeployment({ input, fetchImpl, files });
  const missing = missingFiles(created);
  if (missing.length > 0) {
    input.on_log?.(`Vercel requested ${missing.length} missing files; uploading content blobs.`);
    await uploadMissingFiles({ input, fetchImpl, files, missing });
    const retried = await createDeployment({ input, fetchImpl, files });
    assertNoMissingFiles(retried);
    return await waitForReady({ input, fetchImpl, deployment: retried, filesCount: files.length });
  }
  return await waitForReady({ input, fetchImpl, deployment: created, filesCount: files.length });
}

function collectVercelDeploymentFiles(root: string): readonly VercelCollectedFile[] {
  const files: VercelCollectedFile[] = [];
  const visit = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (ignoredFileNames.has(entry)) continue;
      const absolute = join(dir, entry);
      const stat = statSync(absolute);
      if (stat.isDirectory()) {
        visit(absolute);
        continue;
      }
      if (!stat.isFile()) continue;
      const data = readFileSync(absolute);
      files.push({
        file: relative(root, absolute).replaceAll("\\", "/"),
        size: data.byteLength,
        mode: stat.mode,
        sha: createHash("sha1").update(data).digest("hex"),
        data,
      });
    }
  };
  visit(root);
  return files.sort((a, b) => a.file.localeCompare(b.file));
}

async function createDeployment(input: {
  readonly input: VercelApiDeployInput;
  readonly fetchImpl: typeof fetch;
  readonly files: readonly VercelCollectedFile[];
}): Promise<JsonRecord> {
  const response = await vercelFetch(input.input, input.fetchImpl, "/v13/deployments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: input.input.project_name,
      target: "production",
      version: 2,
      meta: {
        source: "pneuma-production-profile-host",
        ...input.input.meta,
      },
      files: input.files.map(({ data: _data, ...file }) => file satisfies VercelPreparedFile),
      projectSettings: {
        buildCommand: "bun run build",
        outputDirectory: "dist/client",
      },
    }),
  });
  const json = await readJson(response);
  if (!response.ok && missingFiles(json).length === 0) {
    throw new Error(`Vercel create deployment failed (${response.status}): ${summarizeVercelError(json)}`);
  }
  return json;
}

async function uploadMissingFiles(input: {
  readonly input: VercelApiDeployInput;
  readonly fetchImpl: typeof fetch;
  readonly files: readonly VercelCollectedFile[];
  readonly missing: readonly string[];
}): Promise<void> {
  const bySha = new Map(input.files.map((file) => [file.sha, file]));
  for (const sha of input.missing) {
    const file = bySha.get(sha);
    if (!file) throw new Error(`Vercel requested unknown file sha ${sha}.`);
    const response = await vercelFetch(input.input, input.fetchImpl, "/v2/files", {
      method: "POST",
      headers: {
        "content-type": "application/octet-stream",
        "x-now-digest": file.sha,
        "x-now-size": String(file.size),
      },
      body: file.data,
    });
    if (!response.ok && response.status !== 409) {
      const json = await readJson(response);
      throw new Error(`Vercel file upload failed for ${file.file} (${response.status}): ${summarizeVercelError(json)}`);
    }
  }
}

async function waitForReady(input: {
  readonly input: VercelApiDeployInput;
  readonly fetchImpl: typeof fetch;
  readonly deployment: JsonRecord;
  readonly filesCount: number;
}): Promise<VercelApiDeployReceipt> {
  const deploymentId = String(input.deployment.id ?? "");
  if (!deploymentId) throw new Error(`Vercel deployment response did not include id: ${JSON.stringify(input.deployment)}`);
  const timeoutMs = input.input.timeout_ms ?? 180_000;
  const pollIntervalMs = input.input.poll_interval_ms ?? 2_000;
  const started = Date.now();
  let current = input.deployment;
  while (Date.now() - started < timeoutMs) {
    const readyState = String(current.readyState ?? current.ready_state ?? "");
    if (readyState === "READY") {
      return {
        deployment_id: deploymentId,
        url: deploymentUrl(current),
        ready_state: readyState,
        files: input.filesCount,
      };
    }
    if (readyState === "ERROR" || readyState === "CANCELED") {
      throw new Error(`Vercel deployment ${deploymentId} ended with ${readyState}: ${summarizeVercelError(current)}`);
    }
    await sleep(pollIntervalMs);
    const response = await vercelFetch(input.input, input.fetchImpl, `/v13/deployments/${deploymentId}`, { method: "GET" });
    current = await readJson(response);
    if (!response.ok) {
      throw new Error(`Vercel deployment status failed (${response.status}): ${summarizeVercelError(current)}`);
    }
  }
  throw new Error(`Timed out waiting for Vercel deployment ${deploymentId}.`);
}

function assertNoMissingFiles(json: JsonRecord): void {
  const missing = missingFiles(json);
  if (missing.length > 0) throw new Error(`Vercel still reports missing files after upload: ${missing.join(", ")}`);
}

function missingFiles(json: JsonRecord): readonly string[] {
  const error = typeof json.error === "object" && json.error ? json.error as JsonRecord : json;
  const code = String(error.code ?? "");
  if (code !== "missing_files") return [];
  const missing = error.missing;
  return Array.isArray(missing) ? missing.map(String) : [];
}

function deploymentUrl(json: JsonRecord): string {
  const aliases = Array.isArray(json.alias) ? json.alias : Array.isArray(json.aliases) ? json.aliases : [];
  const alias = aliases.find((value) => typeof value === "string" && value.length > 0);
  const value = String(alias ?? json.url ?? "");
  if (!value) throw new Error(`Vercel deployment response did not include url: ${JSON.stringify(json)}`);
  return value.startsWith("http") ? value : `https://${value}`;
}

async function vercelFetch(
  input: VercelApiDeployInput,
  fetchImpl: typeof fetch,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const url = new URL(`${vercelApiBase}${path}`);
  if (input.team_id) url.searchParams.set("teamId", input.team_id);
  return await fetchImpl(url, {
    ...init,
    headers: {
      authorization: `Bearer ${input.token}`,
      accept: "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function readJson(response: Response): Promise<JsonRecord> {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text) as JsonRecord;
  } catch {
    return { message: text };
  }
}

function summarizeVercelError(json: JsonRecord): string {
  const error = typeof json.error === "object" && json.error ? json.error as JsonRecord : json;
  return String(error.message ?? error.code ?? JSON.stringify(json));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
