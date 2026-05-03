import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { STACK_PROFILES } from "../m12-reference-creation-host/profiles.js";
import {
  createHostStore,
  type HostStore,
} from "../m12-reference-creation-host/host-store.js";
import type {
  GeneratedAppProject,
  GeneratedAppVersion,
} from "../m12-reference-creation-host/types.js";
import {
  createHostEvolutionRuntime,
  readPriorityQueueRows,
  type HostEvolutionRuntime,
  type M13AutoDecision,
  type M13BackendChoice,
} from "./host-evolution.js";

export interface StartM13HostAgentEvolutionServerOptions {
  readonly workspace: string;
  readonly port: number;
  readonly backend: M13BackendChoice;
  readonly autoDecision: M13AutoDecision;
}

export interface M13HostAgentEvolutionServer {
  readonly port: number;
  readonly workspace: string;
  stop(): Promise<void>;
}

export async function startM13HostAgentEvolutionServer(
  options: StartM13HostAgentEvolutionServerOptions,
): Promise<M13HostAgentEvolutionServer> {
  const workspace = resolve(options.workspace);
  const store = createHostStore({ workspace });
  const runtimes = new Map<string, HostEvolutionRuntime>();
  const server = Bun.serve({
    port: options.port,
    fetch: (req) => handleRequest(req, store, runtimes, workspace, options),
  });

  return {
    port: server.port,
    workspace,
    async stop() {
      await Promise.all([...runtimes.values()].map((runtime) => runtime.close()));
      runtimes.clear();
      server.stop(true);
    },
  };
}

async function handleRequest(
  req: Request,
  store: HostStore,
  runtimes: Map<string, HostEvolutionRuntime>,
  workspace: string,
  options: StartM13HostAgentEvolutionServerOptions,
): Promise<Response> {
  const url = new URL(req.url);
  try {
    if (req.method === "GET" && url.pathname === "/") return serveIndex();
    if (req.method === "GET" && url.pathname.startsWith("/static/")) return serveStatic(url.pathname);
    if (req.method === "GET" && url.pathname === "/api/host/status") {
      return json({ workspace, running_previews: runtimes.size });
    }
    if (req.method === "GET" && url.pathname === "/api/host/profiles") {
      return json({ profiles: STACK_PROFILES });
    }
    if (req.method === "GET" && url.pathname === "/api/host/projects") {
      return json({ projects: store.listProjects() });
    }
    if (req.method === "POST" && url.pathname === "/api/host/projects") {
      return await handleCreateProject(req, store);
    }

    const match = url.pathname.match(/^\/api\/host\/projects\/([^/]+)(?:\/(.+))?$/);
    if (match) {
      const appId = decodeURIComponent(match[1]);
      const tail = match[2] ?? "";
      if (req.method === "GET" && tail === "") return handleGetProject(appId, store, runtimes);
      if (req.method === "POST" && tail === "preview/start") {
        return await handleStartPreview(appId, req, store, runtimes, options);
      }
      if (req.method === "POST" && tail === "preview/stop") return await handleStopPreview(appId, runtimes);
      if (req.method === "GET" && tail === "inspect") return await handleInspect(appId, store, runtimes);
      if (req.method === "POST" && tail === "evolution/start") {
        return await handleStartEvolution(appId, req, store, runtimes, options);
      }
      if (req.method === "GET" && tail === "evolution") return handleGetEvolution(appId, runtimes);
      if (req.method === "POST" && tail === "evolution/approve") return await handleApproveEvolution(appId, runtimes);
      if (req.method === "POST" && tail === "evolution/deny") return await handleDenyEvolution(appId, runtimes);
      if (req.method === "GET" && tail === "priority-queue") return await handlePriorityQueue(appId, runtimes);
    }

    return json({ error: "not_found" }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
}

async function handleCreateProject(req: Request, store: HostStore): Promise<Response> {
  const body = (await req.json()) as {
    readonly app_id?: string;
    readonly display_name?: string;
    readonly profile_id?: "knowledge-inbox-bun-sqlite";
    readonly builder_user_id?: string;
    readonly builder_request?: string;
  };
  if (!body.app_id || !body.display_name || !body.profile_id) {
    throw new Error("app_id, display_name, and profile_id are required");
  }

  const created = store.createProject({
    app_id: body.app_id,
    display_name: body.display_name,
    profile_id: body.profile_id,
  });
  if (body.builder_user_id && body.builder_request) {
    store.recordCreationSession({
      session_id: `create-${body.app_id}-v0`,
      app_id: body.app_id,
      version_id: "v0",
      builder_user_id: body.builder_user_id,
      builder_request: body.builder_request,
    });
  }

  return json({
    project: {
      app_id: created.project.app_id,
      current_version_id: created.project.current_version_id,
    },
    version: created.version,
  });
}

function handleGetProject(
  appId: string,
  store: HostStore,
  runtimes: Map<string, HostEvolutionRuntime>,
): Response {
  const runtime = runtimes.get(appId);
  return json({
    project: store.getProject(appId),
    versions: store.listVersions(appId),
    sessions: store.listSessions(appId),
    preview: publicPreview(appId, runtime),
    evolution: publicEvolution(runtime),
  });
}

async function handleStartPreview(
  appId: string,
  req: Request,
  store: HostStore,
  runtimes: Map<string, HostEvolutionRuntime>,
  options: StartM13HostAgentEvolutionServerOptions,
): Promise<Response> {
  const body = await readOptionalJson<{ readonly version_id?: string }>(req);
  const runtime = await getOrCreateRuntime(appId, body.version_id, store, runtimes, options);
  const preview = await runtime.startPreview();
  return json({ preview: publicPreview(appId, runtime, preview.preview_url) });
}

async function handleStopPreview(
  appId: string,
  runtimes: Map<string, HostEvolutionRuntime>,
): Promise<Response> {
  const runtime = runtimes.get(appId);
  if (runtime) {
    await runtime.close();
    runtimes.delete(appId);
  }
  return json({ stopped: true });
}

async function handleInspect(
  appId: string,
  store: HostStore,
  runtimes: Map<string, HostEvolutionRuntime>,
): Promise<Response> {
  const runtime = requireRuntime(appId, runtimes);
  const inspection = await runtime.inspect();
  const config = inspection.config as {
    readonly tables?: readonly Record<string, unknown>[];
    readonly operations?: readonly Record<string, unknown>[];
    readonly views?: readonly Record<string, unknown>[];
    readonly policy_rules?: readonly Record<string, unknown>[];
  };
  return json({
    project: store.getProject(appId),
    preview: publicPreview(appId, runtime),
    evolution: publicEvolution(runtime),
    inspection: {
      schema: {
        tables: config.tables ?? [],
        views: config.views ?? [],
        policy_rules: config.policy_rules ?? [],
      },
      operations: config.operations ?? [],
      data: {
        inbox_items: inspection.rows,
      },
      logs: inspection.logs,
      transcript: runtime.currentTranscript(),
    },
  });
}

async function handleStartEvolution(
  appId: string,
  req: Request,
  store: HostStore,
  runtimes: Map<string, HostEvolutionRuntime>,
  options: StartM13HostAgentEvolutionServerOptions,
): Promise<Response> {
  const body = (await req.json()) as {
    readonly version_id?: string;
    readonly builder_user_id?: string;
    readonly builder_request?: string;
  };
  const runtime = await getOrCreateRuntime(appId, body.version_id, store, runtimes, options);
  const result = await runtime.startEvolution({
    builderUserId: body.builder_user_id ?? "builder-alice",
    builderRequest: body.builder_request ?? "Add a Priority Queue for urgent inbox items.",
  });
  return json(result);
}

function handleGetEvolution(
  appId: string,
  runtimes: Map<string, HostEvolutionRuntime>,
): Response {
  return json({ evolution: publicEvolution(runtimes.get(appId)) });
}

async function handleApproveEvolution(
  appId: string,
  runtimes: Map<string, HostEvolutionRuntime>,
): Promise<Response> {
  return json(await requireRuntime(appId, runtimes).approve());
}

async function handleDenyEvolution(
  appId: string,
  runtimes: Map<string, HostEvolutionRuntime>,
): Promise<Response> {
  return json(await requireRuntime(appId, runtimes).deny());
}

async function handlePriorityQueue(
  appId: string,
  runtimes: Map<string, HostEvolutionRuntime>,
): Promise<Response> {
  const runtime = requireRuntime(appId, runtimes);
  return json({ rows: await readPriorityQueueRows(runtime.previewUrl()) });
}

async function getOrCreateRuntime(
  appId: string,
  versionId: string | undefined,
  store: HostStore,
  runtimes: Map<string, HostEvolutionRuntime>,
  options: StartM13HostAgentEvolutionServerOptions,
): Promise<HostEvolutionRuntime> {
  const existing = runtimes.get(appId);
  if (existing) return existing;
  const project = store.getProject(appId);
  const version = store.getVersion(appId, versionId ?? project.current_version_id);
  const runtime = await createHostEvolutionRuntime({
    project,
    version,
    backend: options.backend,
    autoDecision: options.autoDecision,
  });
  runtimes.set(appId, runtime);
  return runtime;
}

function requireRuntime(
  appId: string,
  runtimes: Map<string, HostEvolutionRuntime>,
): HostEvolutionRuntime {
  const runtime = runtimes.get(appId);
  if (!runtime) throw new Error(`preview is not running for ${appId}`);
  return runtime;
}

function publicPreview(
  appId: string,
  runtime: HostEvolutionRuntime | undefined,
  previewUrl?: string,
): Record<string, unknown> | null {
  if (!runtime) return null;
  let url = previewUrl;
  try {
    url ??= runtime.previewUrl();
  } catch {
    return null;
  }
  return {
    preview_id: `${appId}:v0`,
    app_id: appId,
    version_id: "v0",
    preview_url: url,
    status: "running",
  };
}

function publicEvolution(runtime: HostEvolutionRuntime | undefined): Record<string, unknown> | null {
  const transcript = runtime?.currentTranscript();
  if (!transcript) return null;
  return {
    status: transcript.status,
    transcript,
  };
}

async function readOptionalJson<T>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text.trim()) return {} as T;
  return JSON.parse(text) as T;
}

function serveIndex(): Response {
  const path = join(import.meta.dir, "static", "index.html");
  if (!existsSync(path)) {
    return new Response("M13 Host Agent Evolution", {
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  return new Response(Bun.file(path), {
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function serveStatic(pathname: string): Response {
  const relative = pathname.replace(/^\/static\/+/, "");
  const path = join(import.meta.dir, "static", relative);
  if (!existsSync(path)) return json({ error: "not_found" }, 404);
  return new Response(Bun.file(path), {
    headers: { "content-type": contentType(path) },
  });
}

function contentType(path: string): string {
  if (path.endsWith(".css")) return "text/css; charset=utf-8";
  if (path.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (path.endsWith(".html")) return "text/html; charset=utf-8";
  return "application/octet-stream";
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}
