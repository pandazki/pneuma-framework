import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { STACK_PROFILES } from "./profiles.js";
import {
  createGeneralityHostStore,
  type M15HostStore,
} from "./host-store.js";
import {
  inspectM15PreviewRuntime,
  startM15PreviewRuntime,
  stopM15PreviewRuntime,
} from "./preview-runtime.js";
import type { M15PreviewRuntimeHandle } from "./types.js";

export interface StartM15GeneralityHostServerOptions {
  readonly workspace: string;
  readonly port: number;
}

export interface M15GeneralityHostServer {
  readonly port: number;
  readonly workspace: string;
  stop(): Promise<void>;
}

export async function startM15GeneralityHostServer(
  options: StartM15GeneralityHostServerOptions,
): Promise<M15GeneralityHostServer> {
  const workspace = resolve(options.workspace);
  const store = createGeneralityHostStore({ workspace });
  const previews = new Map<string, M15PreviewRuntimeHandle>();
  const server = Bun.serve({
    port: options.port,
    fetch: (req) => handleRequest(req, store, previews, workspace),
  });

  return {
    port: server.port,
    workspace,
    async stop() {
      await Promise.all([...previews.values()].map((preview) => stopM15PreviewRuntime(preview)));
      previews.clear();
      server.stop(true);
    },
  };
}

async function handleRequest(
  req: Request,
  store: M15HostStore,
  previews: Map<string, M15PreviewRuntimeHandle>,
  workspace: string,
): Promise<Response> {
  const url = new URL(req.url);
  try {
    if (req.method === "GET" && url.pathname === "/") return serveIndex();
    if (req.method === "GET" && url.pathname === "/favicon.ico") return new Response(null, { status: 204 });
    if (req.method === "GET" && url.pathname.startsWith("/static/")) return serveStatic(url.pathname);
    if (req.method === "GET" && url.pathname === "/api/host/status") {
      return json({ workspace, running_previews: previews.size });
    }
    if (req.method === "GET" && url.pathname === "/api/host/profiles") {
      return json({ profiles: STACK_PROFILES });
    }
    if (req.method === "GET" && url.pathname === "/api/host/projects") {
      return json({ projects: store.listProjects() });
    }
    if (req.method === "POST" && url.pathname === "/api/host/demo/create") {
      return handleCreateDemo(store);
    }

    const match = url.pathname.match(/^\/api\/host\/projects\/([^/]+)(?:\/(.+))?$/);
    if (match) {
      const appId = decodeURIComponent(match[1]);
      const tail = match[2] ?? "";
      if (req.method === "GET" && tail === "") return handleGetProject(appId, store, previews);
      if (req.method === "POST" && tail === "preview/start") {
        return await handleStartPreview(appId, req, store, previews);
      }
      if (req.method === "POST" && tail === "preview/stop") return await handleStopPreview(appId, previews);
      if (req.method === "GET" && tail === "inspect") return await handleInspect(appId, store, previews);
    }

    return json({ error: "not_found" }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
}

function handleCreateDemo(store: M15HostStore): Response {
  ensureDemoProject(store, {
    app_id: "team-knowledge-inbox",
    display_name: "Team Knowledge Inbox",
    profile_id: "knowledge-inbox-bun-sqlite",
  });
  ensureDemoProject(store, {
    app_id: "team-decision-log",
    display_name: "Team Decision Log",
    profile_id: "team-decision-log-bun-sqlite",
  });
  return json({ projects: store.listProjects() });
}

function ensureDemoProject(
  store: M15HostStore,
  input: Parameters<M15HostStore["createProject"]>[0],
): void {
  if (store.listProjects().some((project) => project.app_id === input.app_id)) return;
  store.createProject(input);
}

function handleGetProject(
  appId: string,
  store: M15HostStore,
  previews: Map<string, M15PreviewRuntimeHandle>,
): Response {
  return json({
    project: store.getProject(appId),
    versions: store.listVersions(appId),
    preview: publicPreview(previews.get(appId)),
  });
}

async function handleStartPreview(
  appId: string,
  req: Request,
  store: M15HostStore,
  previews: Map<string, M15PreviewRuntimeHandle>,
): Promise<Response> {
  const existing = previews.get(appId);
  if (existing && existing.proc.exitCode === null) return json({ preview: publicPreview(existing) });

  const body = await readOptionalJson<{ version_id?: string }>(req);
  const project = store.getProject(appId);
  const version = store.getVersion(appId, body.version_id ?? project.current_version_id);
  const preview = await startM15PreviewRuntime({ project, version, port: 0 });
  previews.set(appId, preview);
  return json({ preview: publicPreview(preview) });
}

async function handleStopPreview(
  appId: string,
  previews: Map<string, M15PreviewRuntimeHandle>,
): Promise<Response> {
  const preview = previews.get(appId);
  if (preview) {
    await stopM15PreviewRuntime(preview);
    previews.delete(appId);
  }
  return json({ stopped: true });
}

async function handleInspect(
  appId: string,
  store: M15HostStore,
  previews: Map<string, M15PreviewRuntimeHandle>,
): Promise<Response> {
  const preview = previews.get(appId);
  if (!preview || preview.proc.exitCode !== null) throw new Error(`preview is not running for ${appId}`);
  return json({
    project: store.getProject(appId),
    preview: publicPreview(preview),
    inspection: await inspectM15PreviewRuntime(preview),
  });
}

function publicPreview(preview: M15PreviewRuntimeHandle | undefined): Record<string, unknown> | null {
  if (!preview) return null;
  return {
    preview_id: preview.preview_id,
    app_id: preview.app_id,
    version_id: preview.version_id,
    profile_id: preview.profile_id,
    preview_url: preview.preview_url,
    started_at_ms: preview.started_at_ms,
    status: preview.status,
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
    return new Response("M15 Generality Pressure Host", {
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
