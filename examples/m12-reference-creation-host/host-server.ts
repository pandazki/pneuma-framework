import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { STACK_PROFILES } from "./profiles.js";
import {
  createHostStore,
  type HostStore,
} from "./host-store.js";
import {
  inspectPreviewRuntime,
  startPreviewRuntime,
  stopPreviewRuntime,
} from "./preview-runtime.js";
import type { PreviewRuntimeHandle } from "./types.js";

export interface StartReferenceCreationHostServerOptions {
  readonly workspace: string;
  readonly port: number;
}

export interface ReferenceCreationHostServer {
  readonly port: number;
  readonly workspace: string;
  stop(): Promise<void>;
}

export async function startReferenceCreationHostServer(
  options: StartReferenceCreationHostServerOptions,
): Promise<ReferenceCreationHostServer> {
  const workspace = resolve(options.workspace);
  const store = createHostStore({ workspace });
  const previews = new Map<string, PreviewRuntimeHandle>();
  const server = Bun.serve({
    port: options.port,
    fetch: (req) => handleRequest(req, store, previews, workspace),
  });

  return {
    port: server.port,
    workspace,
    async stop() {
      await Promise.all([...previews.values()].map((preview) => stopPreviewRuntime(preview)));
      previews.clear();
      server.stop(true);
    },
  };
}

async function handleRequest(
  req: Request,
  store: HostStore,
  previews: Map<string, PreviewRuntimeHandle>,
  workspace: string,
): Promise<Response> {
  const url = new URL(req.url);
  try {
    if (req.method === "GET" && url.pathname === "/") return serveIndex();
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
    if (req.method === "POST" && url.pathname === "/api/host/projects") {
      return await handleCreateProject(req, store);
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

async function handleCreateProject(req: Request, store: HostStore): Promise<Response> {
  const body = (await req.json()) as {
    app_id?: string;
    display_name?: string;
    profile_id?: "knowledge-inbox-bun-sqlite";
    builder_user_id?: string;
    builder_request?: string;
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
  previews: Map<string, PreviewRuntimeHandle>,
): Response {
  return json({
    project: store.getProject(appId),
    versions: store.listVersions(appId),
    sessions: store.listSessions(appId),
    preview: publicPreview(previews.get(appId)),
  });
}

async function handleStartPreview(
  appId: string,
  req: Request,
  store: HostStore,
  previews: Map<string, PreviewRuntimeHandle>,
): Promise<Response> {
  const existing = previews.get(appId);
  if (existing && existing.proc.exitCode === null) {
    return json({ preview: publicPreview(existing) });
  }

  const body = await readOptionalJson<{ version_id?: string }>(req);
  const project = store.getProject(appId);
  const version = store.getVersion(appId, body.version_id ?? project.current_version_id);
  const preview = await startPreviewRuntime({ project, version, port: 0 });
  previews.set(appId, preview);
  return json({ preview: publicPreview(preview) });
}

async function handleStopPreview(
  appId: string,
  previews: Map<string, PreviewRuntimeHandle>,
): Promise<Response> {
  const preview = previews.get(appId);
  if (preview) {
    await stopPreviewRuntime(preview);
    previews.delete(appId);
  }
  return json({ stopped: true });
}

async function handleInspect(
  appId: string,
  store: HostStore,
  previews: Map<string, PreviewRuntimeHandle>,
): Promise<Response> {
  const preview = previews.get(appId);
  if (!preview || preview.proc.exitCode !== null) throw new Error(`preview is not running for ${appId}`);
  return json({
    project: store.getProject(appId),
    preview: publicPreview(preview),
    inspection: await inspectPreviewRuntime(preview),
  });
}

function publicPreview(preview: PreviewRuntimeHandle | undefined): Record<string, unknown> | null {
  if (!preview) return null;
  return {
    preview_id: preview.preview_id,
    app_id: preview.app_id,
    version_id: preview.version_id,
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
    return new Response("M12 Reference Creation Host", {
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
