import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  createCreationHostStore,
  type CreationHostProject,
  type CreationHostStore,
  type CreationHostVersion,
} from "@pneuma-framework/core";
import {
  createHostEvolutionRuntime,
  readPriorityQueueRows,
  type HostEvolutionResult,
  type HostEvolutionRuntime,
} from "../m13-host-agent-evolution/host-evolution.js";
import {
  createHostPublishRolloutManager,
  type HostPublishRolloutManager,
} from "../m14-host-publish-rollout/publish-rollout.js";
import { M16_STACK_PROFILES, getM16StackProfile } from "./profiles.js";
import {
  inspectM16PreviewRuntime,
  startM16PreviewRuntime,
  stopM16PreviewRuntime,
  type M16PreviewRuntimeHandle,
} from "./preview-runtime.js";

export interface StartM16ReferenceCreationHostServerOptions {
  readonly workspace: string;
  readonly port: number;
}

export interface M16ReferenceCreationHostServer {
  readonly port: number;
  readonly workspace: string;
  stop(): Promise<void>;
}

interface EvolutionState {
  readonly app_id: string;
  readonly version_id: string;
  readonly runtime: HostEvolutionRuntime;
  result: HostEvolutionResult | null;
}

export async function startM16ReferenceCreationHostServer(
  options: StartM16ReferenceCreationHostServerOptions,
): Promise<M16ReferenceCreationHostServer> {
  const workspace = resolve(options.workspace);
  const store = createCreationHostStore({ workspace, profiles: M16_STACK_PROFILES });
  const previews = new Map<string, M16PreviewRuntimeHandle>();
  const evolutions = new Map<string, EvolutionState>();
  const rollouts = new Map<string, HostPublishRolloutManager>();
  const server = Bun.serve({
    port: options.port,
    fetch: (req) => handleRequest(req, {
      workspace,
      store,
      previews,
      evolutions,
      rollouts,
    }),
  });

  return {
    port: server.port,
    workspace,
    async stop() {
      await Promise.all([...previews.values()].map((preview) => stopM16PreviewRuntime(preview)));
      await Promise.all([...evolutions.values()].map((evolution) => evolution.runtime.close()));
      await Promise.all([...rollouts.values()].map((rollout) => rollout.close()));
      previews.clear();
      evolutions.clear();
      rollouts.clear();
      server.stop(true);
    },
  };
}

async function handleRequest(
  req: Request,
  ctx: {
    readonly workspace: string;
    readonly store: CreationHostStore;
    readonly previews: Map<string, M16PreviewRuntimeHandle>;
    readonly evolutions: Map<string, EvolutionState>;
    readonly rollouts: Map<string, HostPublishRolloutManager>;
  },
): Promise<Response> {
  const url = new URL(req.url);
  try {
    if (req.method === "GET" && url.pathname === "/") return serveIndex();
    if (req.method === "GET" && url.pathname === "/favicon.ico") return new Response(null, { status: 204 });
    if (req.method === "GET" && url.pathname.startsWith("/static/")) return serveStatic(url.pathname);
    if (req.method === "GET" && url.pathname === "/api/host/status") {
      return json({
        workspace: ctx.workspace,
        projects: ctx.store.listProjects(),
        running_previews: ctx.previews.size,
        running_evolutions: ctx.evolutions.size,
      });
    }
    if (req.method === "GET" && url.pathname === "/api/host/profiles") {
      return json({ profiles: ctx.store.listProfiles() });
    }
    if (req.method === "GET" && url.pathname === "/api/host/projects") {
      return json({ projects: ctx.store.listProjects() });
    }
    if (req.method === "POST" && url.pathname === "/api/host/projects") {
      return await handleCreateProject(req, ctx.store);
    }

    const match = url.pathname.match(/^\/api\/host\/projects\/([^/]+)(?:\/(.+))?$/);
    if (match) {
      const appId = decodeURIComponent(match[1]);
      const tail = match[2] ?? "";
      if (req.method === "GET" && tail === "") return handleGetProject(appId, ctx);
      if (req.method === "POST" && tail === "preview/start") return await handleStartPreview(appId, req, ctx);
      if (req.method === "POST" && tail === "preview/stop") return await handleStopPreview(appId, ctx.previews);
      if (req.method === "GET" && tail === "inspect") return await handleInspect(appId, ctx);
      if (req.method === "POST" && tail === "evolution/start") return await handleStartEvolution(appId, req, ctx);
      if (req.method === "GET" && tail === "evolution") return json({ evolution: publicEvolution(ctx.evolutions.get(appId)) });
      if (req.method === "POST" && tail === "evolution/approve") return await handleApproveEvolution(appId, ctx.evolutions);
      if (req.method === "POST" && tail === "evolution/deny") return await handleDenyEvolution(appId, ctx.evolutions);
      if (req.method === "GET" && tail === "priority-queue") return await handlePriorityQueue(appId, ctx.evolutions);
      if (req.method === "POST" && tail === "publish") return await handlePublish(appId, req, ctx);
      if (req.method === "POST" && tail === "restart-active") return await rolloutFor(appId, ctx).restartActive().then(json);
      if (req.method === "POST" && tail === "rollback") return await rolloutFor(appId, ctx).rollback().then(json);
      if (req.method === "GET" && tail === "rollout") return await rolloutFor(appId, ctx).status().then(json);
    }

    return json({ error: "not_found" }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
}

async function handleCreateProject(req: Request, store: CreationHostStore): Promise<Response> {
  const body = (await req.json()) as {
    readonly app_id?: string;
    readonly display_name?: string;
    readonly profile_id?: string;
  };
  if (!body.app_id || !body.display_name || !body.profile_id) {
    throw new Error("app_id, display_name, and profile_id are required");
  }
  const created = store.createProject({
    app_id: body.app_id,
    display_name: body.display_name,
    profile_id: body.profile_id,
  });
  return json(created);
}

function handleGetProject(
  appId: string,
  ctx: {
    readonly store: CreationHostStore;
    readonly previews: Map<string, M16PreviewRuntimeHandle>;
    readonly evolutions: Map<string, EvolutionState>;
  },
): Response {
  return json({
    project: ctx.store.getProject(appId),
    versions: ctx.store.listVersions(appId),
    preview: publicPreview(ctx.previews.get(appId)),
    evolution: publicEvolution(ctx.evolutions.get(appId)),
  });
}

async function handleStartPreview(
  appId: string,
  req: Request,
  ctx: {
    readonly store: CreationHostStore;
    readonly previews: Map<string, M16PreviewRuntimeHandle>;
  },
): Promise<Response> {
  const body = await readOptionalJson<{ readonly version_id?: string }>(req);
  const project = ctx.store.getProject(appId);
  const version = ctx.store.getVersion(appId, body.version_id ?? project.current_version_id);
  const existing = ctx.previews.get(appId);
  if (existing && existing.version_id === version.version_id && existing.proc.exitCode === null) {
    return json({ preview: publicPreview(existing) });
  }
  if (existing) await stopM16PreviewRuntime(existing);

  const preview = await startM16PreviewRuntime({
    project,
    version,
    profile: getM16StackProfile(version.profile_id),
    port: 0,
  });
  ctx.previews.set(appId, preview);
  return json({ preview: publicPreview(preview) });
}

async function handleStopPreview(
  appId: string,
  previews: Map<string, M16PreviewRuntimeHandle>,
): Promise<Response> {
  const preview = previews.get(appId);
  if (preview) {
    await stopM16PreviewRuntime(preview);
    previews.delete(appId);
  }
  return json({ stopped: true });
}

async function handleInspect(
  appId: string,
  ctx: {
    readonly store: CreationHostStore;
    readonly previews: Map<string, M16PreviewRuntimeHandle>;
    readonly evolutions: Map<string, EvolutionState>;
  },
): Promise<Response> {
  const preview = ctx.previews.get(appId);
  if (!preview || preview.proc.exitCode !== null) throw new Error(`preview is not running for ${appId}`);
  return json({
    project: ctx.store.getProject(appId),
    versions: ctx.store.listVersions(appId),
    preview: publicPreview(preview),
    evolution: publicEvolution(ctx.evolutions.get(appId)),
    inspection: await inspectM16PreviewRuntime(preview, getM16StackProfile(preview.profile_id)),
  });
}

async function handleStartEvolution(
  appId: string,
  req: Request,
  ctx: {
    readonly store: CreationHostStore;
    readonly previews: Map<string, M16PreviewRuntimeHandle>;
    readonly evolutions: Map<string, EvolutionState>;
    readonly rollouts: Map<string, HostPublishRolloutManager>;
  },
): Promise<Response> {
  const body = (await req.json()) as {
    readonly builder_user_id?: string;
    readonly builder_request?: string;
  };
  const project = ctx.store.getProject(appId);
  if (project.profile_id !== "knowledge-inbox-bun-sqlite") {
    throw new Error(`profile ${project.profile_id} does not support M16 governed evolution`);
  }
  const currentPreview = ctx.previews.get(appId);
  if (currentPreview) {
    await stopM16PreviewRuntime(currentPreview);
    ctx.previews.delete(appId);
  }
  const version = await ensureEvolvedVersion(ctx.store, appId, ctx.rollouts);
  const runtime = await createHostEvolutionRuntime({
    project: toKnowledgeProject({ ...project, current_version_id: version.version_id }),
    version: toKnowledgeVersion(version),
    backend: "fake",
    autoDecision: "none",
  });
  const result = await runtime.startEvolution({
    builderUserId: body.builder_user_id ?? "builder-alice",
    builderRequest: body.builder_request ?? "Add a Priority Queue for urgent inbox items.",
  });
  const state: EvolutionState = {
    app_id: appId,
    version_id: version.version_id,
    runtime,
    result,
  };
  ctx.evolutions.set(appId, state);
  return json({ evolution: publicEvolution(state), result });
}

async function handleApproveEvolution(
  appId: string,
  evolutions: Map<string, EvolutionState>,
): Promise<Response> {
  const evolution = requireEvolution(appId, evolutions);
  evolution.result = await evolution.runtime.approve();
  return json({
    evolution: publicEvolution(evolution),
    result: evolution.result,
    priority_rows: await readPriorityQueueRows(evolution.runtime.previewUrl()),
  });
}

async function handleDenyEvolution(
  appId: string,
  evolutions: Map<string, EvolutionState>,
): Promise<Response> {
  const evolution = requireEvolution(appId, evolutions);
  evolution.result = await evolution.runtime.deny();
  return json({ evolution: publicEvolution(evolution), result: evolution.result });
}

async function handlePriorityQueue(
  appId: string,
  evolutions: Map<string, EvolutionState>,
): Promise<Response> {
  const evolution = requireEvolution(appId, evolutions);
  return json({ rows: await readPriorityQueueRows(evolution.runtime.previewUrl()) });
}

async function handlePublish(
  appId: string,
  req: Request,
  ctx: {
    readonly workspace: string;
    readonly store: CreationHostStore;
    readonly rollouts: Map<string, HostPublishRolloutManager>;
  },
): Promise<Response> {
  const body = await readOptionalJson<{ readonly version_id?: string }>(req);
  const project = ctx.store.getProject(appId);
  if (project.profile_id !== "knowledge-inbox-bun-sqlite") {
    throw new Error(`profile ${project.profile_id} does not support M16 publish`);
  }
  return json(await rolloutFor(appId, ctx).publishVersion(body.version_id ?? project.current_version_id));
}

async function ensureEvolvedVersion(
  store: CreationHostStore,
  appId: string,
  rollouts: Map<string, HostPublishRolloutManager>,
): Promise<CreationHostVersion> {
  try {
    return store.getVersion(appId, "v1");
  } catch {
    const forked = store.forkVersion({
      app_id: appId,
      from_version_id: "v0",
      to_version_id: "v1",
    });
    const staleRollout = rollouts.get(appId);
    if (staleRollout) {
      await staleRollout.close();
      rollouts.delete(appId);
    }
    return forked;
  }
}

function rolloutFor(
  appId: string,
  ctx: {
    readonly workspace: string;
    readonly store: CreationHostStore;
    readonly rollouts: Map<string, HostPublishRolloutManager>;
  },
): HostPublishRolloutManager {
  const existing = ctx.rollouts.get(appId);
  if (existing) return existing;
  const project = ctx.store.getProject(appId);
  if (project.profile_id !== "knowledge-inbox-bun-sqlite") {
    throw new Error(`profile ${project.profile_id} does not support M16 rollout`);
  }
  const manager = createHostPublishRolloutManager({
    workspace: ctx.workspace,
    project: toKnowledgeProject(project),
    versions: ctx.store.listVersions(appId).map(toKnowledgeVersion),
  });
  ctx.rollouts.set(appId, manager);
  return manager;
}

function requireEvolution(
  appId: string,
  evolutions: Map<string, EvolutionState>,
): EvolutionState {
  const evolution = evolutions.get(appId);
  if (!evolution) throw new Error(`evolution is not running for ${appId}`);
  return evolution;
}

function publicPreview(preview: M16PreviewRuntimeHandle | undefined): Record<string, unknown> | null {
  if (!preview) return null;
  return {
    preview_id: preview.preview_id,
    app_id: preview.app_id,
    version_id: preview.version_id,
    profile_id: preview.profile_id,
    preview_url: preview.preview_url,
    status: preview.status,
  };
}

function publicEvolution(evolution: EvolutionState | undefined): Record<string, unknown> | null {
  if (!evolution) return null;
  const transcript = evolution.runtime.currentTranscript();
  return {
    app_id: evolution.app_id,
    version_id: evolution.version_id,
    status: evolution.result?.status ?? transcript?.status ?? "awaiting_approval",
    transcript,
  };
}

function toKnowledgeProject(project: CreationHostProject): {
  readonly app_id: string;
  readonly display_name: string;
  readonly profile_id: "knowledge-inbox-bun-sqlite";
  readonly created_at_ms: number;
  readonly current_version_id: string;
} {
  if (project.profile_id !== "knowledge-inbox-bun-sqlite") {
    throw new Error(`expected knowledge-inbox-bun-sqlite profile, got ${project.profile_id}`);
  }
  return {
    ...project,
    profile_id: "knowledge-inbox-bun-sqlite",
  };
}

function toKnowledgeVersion(version: CreationHostVersion): {
  readonly app_id: string;
  readonly version_id: string;
  readonly profile_id: "knowledge-inbox-bun-sqlite";
  readonly status: "previewable";
  readonly created_at_ms: number;
  readonly version_dir: string;
  readonly app_workspace_dir: string;
  readonly sqlite_path: string;
} {
  if (version.profile_id !== "knowledge-inbox-bun-sqlite") {
    throw new Error(`expected knowledge-inbox-bun-sqlite version, got ${version.profile_id}`);
  }
  return {
    ...version,
    profile_id: "knowledge-inbox-bun-sqlite",
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
    return new Response("M16 Reference Creation Host", {
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
