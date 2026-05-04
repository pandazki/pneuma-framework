import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  createCreationHostStore,
  createReleaseInstance,
  markReleaseInstanceHealthy,
  promoteReleaseCandidate,
  rollbackActiveRelease,
  stageReleaseCandidate,
  summarizeReleaseRollout,
  type CreationHostProject,
  type CreationHostStore,
  type CreationHostVersion,
  type ReleaseRolloutState,
  type ReleaseRolloutSummary,
} from "@pneuma-framework/core";
import { evolvePersonalFocusSiteDefinition, summarizeSiteDefinition } from "./site-definition.js";
import {
  ensureM18SiteDefinition,
  inspectM18Runtime,
  readM18SiteDefinition,
  startM18PreviewRuntime,
  stopM18Runtime,
  writeM18SiteDefinition,
  type M18RuntimeHandle,
} from "./preview-runtime.js";

export interface StartM18PersonalFocusHostServerOptions {
  readonly workspace: string;
  readonly port: number;
}

export interface M18PersonalFocusHostServer {
  readonly port: number;
  readonly workspace: string;
  stop(): Promise<void>;
}

interface EvolutionState {
  readonly app_id: string;
  readonly version_id: string;
  status: "awaiting_approval" | "completed" | "denied";
  readonly builder_request: string;
  readonly proposal: {
    readonly changes: readonly string[];
    readonly impact: readonly string[];
  };
  readonly transcript: Array<Record<string, unknown>>;
}

interface RolloutState {
  state: ReleaseRolloutState;
  runtimes: Map<string, M18RuntimeHandle>;
}

const M18_PROFILE = {
  id: "personal-focus-site-bun-sqlite",
  display_name: "Personal Focus Site",
  description: "An open-ended personal site with a GitHub attention module.",
  template_dir: import.meta.dir,
  persistence: "sqlite" as const,
  runtime: "bun-typescript" as const,
  read_operation_id: "read_site",
  data_table_id: "site_definition",
  supports_evolution: true,
  supports_publish: true,
};

export async function startM18PersonalFocusHostServer(
  options: StartM18PersonalFocusHostServerOptions,
): Promise<M18PersonalFocusHostServer> {
  const workspace = resolve(options.workspace);
  const store = createCreationHostStore({ workspace, profiles: [M18_PROFILE] });
  const previews = new Map<string, M18RuntimeHandle>();
  const evolutions = new Map<string, EvolutionState>();
  const rollouts = new Map<string, RolloutState>();
  const server = Bun.serve({
    port: options.port,
    fetch: (req) => handleRequest(req, { workspace, store, previews, evolutions, rollouts }),
  });

  return {
    port: server.port,
    workspace,
    async stop() {
      await Promise.all([...previews.values()].map((runtime) => stopM18Runtime(runtime)));
      for (const rollout of rollouts.values()) {
        await Promise.all([...rollout.runtimes.values()].map((runtime) => stopM18Runtime(runtime)));
      }
      previews.clear();
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
    readonly previews: Map<string, M18RuntimeHandle>;
    readonly evolutions: Map<string, EvolutionState>;
    readonly rollouts: Map<string, RolloutState>;
  },
): Promise<Response> {
  const url = new URL(req.url);
  try {
    if (req.method === "GET" && url.pathname === "/") return serveIndex();
    if (req.method === "GET" && url.pathname === "/favicon.ico") return new Response(null, { status: 204 });
    if (req.method === "GET" && url.pathname.startsWith("/static/")) return serveStatic(url.pathname);
    if (req.method === "GET" && url.pathname === "/api/host/profiles") return json({ profiles: ctx.store.listProfiles() });
    if (req.method === "GET" && url.pathname === "/api/host/projects") return json({ projects: ctx.store.listProjects() });
    if (req.method === "POST" && url.pathname === "/api/host/projects") return await handleCreateProject(req, ctx.store);

    const match = url.pathname.match(/^\/api\/host\/projects\/([^/]+)(?:\/(.+))?$/);
    if (match) {
      const appId = decodeURIComponent(match[1]);
      const tail = match[2] ?? "";
      if (req.method === "POST" && tail === "preview/start") return await handleStartPreview(appId, req, ctx);
      if (req.method === "GET" && tail === "inspect") return await handleInspect(appId, ctx);
      if (req.method === "POST" && tail === "github-attention/refresh") return await handleRefreshAttention(appId, ctx);
      if (req.method === "POST" && tail === "evolution/start") return await handleStartEvolution(appId, req, ctx);
      if (req.method === "POST" && tail === "evolution/approve") return await handleApproveEvolution(appId, ctx);
      if (req.method === "POST" && tail === "evolution/deny") return handleDenyEvolution(appId, ctx.evolutions);
      if (req.method === "POST" && tail === "publish") return await handlePublish(appId, req, ctx);
      if (req.method === "POST" && tail === "restart-active") return await handleRestartActive(appId, ctx);
      if (req.method === "POST" && tail === "rollback") return await handleRollback(appId, ctx);
      if (req.method === "GET" && tail === "rollout") return json(publicRollout(rolloutFor(appId, ctx).state));
    }

    return json({ error: "not_found" }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
}

async function handleCreateProject(req: Request, store: CreationHostStore): Promise<Response> {
  const body = await req.json() as {
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
  ensureM18SiteDefinition(created.version);
  return json(created);
}

async function handleStartPreview(
  appId: string,
  req: Request,
  ctx: {
    readonly store: CreationHostStore;
    readonly previews: Map<string, M18RuntimeHandle>;
  },
): Promise<Response> {
  const body = await readOptionalJson<{ readonly version_id?: string }>(req);
  const project = ctx.store.getProject(appId);
  const version = ctx.store.getVersion(appId, body.version_id ?? project.current_version_id);
  const existing = ctx.previews.get(appId);
  if (existing && existing.version_id === version.version_id) return json({ preview: publicRuntime(existing) });
  if (existing) await stopM18Runtime(existing);
  const runtime = await startM18PreviewRuntime({ project, version, port: 0 });
  ctx.previews.set(appId, runtime);
  return json({ preview: publicRuntime(runtime) });
}

async function handleInspect(
  appId: string,
  ctx: {
    readonly store: CreationHostStore;
    readonly previews: Map<string, M18RuntimeHandle>;
    readonly evolutions: Map<string, EvolutionState>;
  },
): Promise<Response> {
  const preview = ctx.previews.get(appId);
  if (!preview) throw new Error(`preview is not running for ${appId}`);
  return json({
    project: ctx.store.getProject(appId),
    versions: ctx.store.listVersions(appId),
    preview: publicRuntime(preview),
    evolution: publicEvolution(ctx.evolutions.get(appId)),
    inspection: await inspectM18Runtime(preview),
  });
}

async function handleRefreshAttention(
  appId: string,
  ctx: { readonly previews: Map<string, M18RuntimeHandle> },
): Promise<Response> {
  const preview = ctx.previews.get(appId);
  if (!preview) throw new Error(`preview is not running for ${appId}`);
  const response = await fetch(`${preview.url}/api/github-attention/refresh`, { method: "POST" });
  if (!response.ok) throw new Error(`refresh failed with HTTP ${response.status}: ${await response.text()}`);
  return json(await response.json());
}

async function handleStartEvolution(
  appId: string,
  req: Request,
  ctx: {
    readonly store: CreationHostStore;
    readonly previews: Map<string, M18RuntimeHandle>;
    readonly evolutions: Map<string, EvolutionState>;
  },
): Promise<Response> {
  const body = await req.json() as {
    readonly builder_user_id?: string;
    readonly builder_request?: string;
  };
  const version = ensureV1(ctx.store, appId);
  const evolution: EvolutionState = {
    app_id: appId,
    version_id: version.version_id,
    status: "awaiting_approval",
    builder_request: body.builder_request ?? "Make GitHub attention more useful.",
    proposal: {
      changes: [
        "rewrite hero and GitHub attention section copy",
        "switch visual tone to editorial focus",
        "rank GitHub attention by assignment, review request, mentions, priority labels, and recent activity",
      ],
      impact: [
        "changes UI definition sections",
        "changes style tokens",
        "changes GitHub attention ranking module",
      ],
    },
    transcript: [
      {
        kind: "builder_request",
        builder_user_id: body.builder_user_id ?? "builder-alice",
        text: body.builder_request ?? "Make GitHub attention more useful.",
      },
      {
        kind: "agent_proposal",
        tool: "definition.apply_change_set",
        changes: 3,
      },
      {
        kind: "approval_prompt",
        status: "awaiting_approval",
      },
    ],
  };
  ctx.evolutions.set(appId, evolution);
  const existing = ctx.previews.get(appId);
  if (existing) {
    await stopM18Runtime(existing);
    ctx.previews.delete(appId);
  }
  return json({ evolution: publicEvolution(evolution) });
}

async function handleApproveEvolution(
  appId: string,
  ctx: {
    readonly store: CreationHostStore;
    readonly previews: Map<string, M18RuntimeHandle>;
    readonly evolutions: Map<string, EvolutionState>;
  },
): Promise<Response> {
  const evolution = requireEvolution(appId, ctx.evolutions);
  const project = ctx.store.getProject(appId);
  const version = ctx.store.getVersion(appId, evolution.version_id);
  const evolved = evolvePersonalFocusSiteDefinition(readM18SiteDefinition(version));
  writeM18SiteDefinition(version, evolved);
  evolution.status = "completed";
  evolution.transcript.push(
    { kind: "approval_response", decision: "allow" },
    { kind: "tool_result", status: "completed", changed_surface: summarizeSiteDefinition(evolved).changed_surface },
  );
  const existing = ctx.previews.get(appId);
  if (existing) await stopM18Runtime(existing);
  const runtime = await startM18PreviewRuntime({ project, version, port: 0 });
  ctx.previews.set(appId, runtime);
  return json({
    evolution: publicEvolution(evolution),
    site: await fetchJson(`${runtime.url}/api/site`),
  });
}

function handleDenyEvolution(
  appId: string,
  evolutions: Map<string, EvolutionState>,
): Response {
  const evolution = requireEvolution(appId, evolutions);
  evolution.status = "denied";
  evolution.transcript.push({ kind: "approval_response", decision: "deny" });
  return json({ evolution: publicEvolution(evolution) });
}

async function handlePublish(
  appId: string,
  req: Request,
  ctx: {
    readonly store: CreationHostStore;
    readonly rollouts: Map<string, RolloutState>;
  },
): Promise<Response> {
  const body = await readOptionalJson<{ readonly version_id?: string }>(req);
  const project = ctx.store.getProject(appId);
  const version = ctx.store.getVersion(appId, body.version_id ?? project.current_version_id);
  const rollout = rolloutFor(appId, ctx);
  const runtime = await ensurePublishedRuntime(rollout, project, version);
  const health = await healthCheck(runtime);
  const candidate = markReleaseInstanceHealthy(createReleaseInstance({
    candidate_id: `${appId}-${version.version_id}`,
    image_tag: `${appId}:${version.version_id}`,
    data_dir: join(version.app_workspace_dir, "data"),
    url: runtime.url,
    status: "healthy",
    checks: health.checks,
  }), { checks: health.checks });
  const staged = stageReleaseCandidate(rollout.state, candidate, {
    reason: `publish ${version.version_id} from M18 Creation Host`,
  });
  const promoted = promoteReleaseCandidate(staged, {
    reason: `promote ${version.version_id} as active Published Application`,
  });
  if (!promoted.ok) throw new Error(promoted.error);
  rollout.state = promoted.state;
  return json({ ...publicRollout(rollout.state), health });
}

async function handleRestartActive(
  appId: string,
  ctx: {
    readonly store: CreationHostStore;
    readonly rollouts: Map<string, RolloutState>;
  },
): Promise<Response> {
  const rollout = rolloutFor(appId, ctx);
  if (!rollout.state.active) throw new Error("active release is required before restart");
  const versionId = versionIdFromCandidate(rollout.state.active.candidate_id);
  const project = ctx.store.getProject(appId);
  const version = ctx.store.getVersion(appId, versionId);
  const existing = rollout.runtimes.get(versionId);
  if (existing) await stopM18Runtime(existing);
  rollout.runtimes.delete(versionId);
  const runtime = await ensurePublishedRuntime(rollout, project, version);
  const health = await healthCheck(runtime);
  rollout.state = {
    ...rollout.state,
    active: markReleaseInstanceHealthy({
      ...rollout.state.active,
      url: runtime.url,
      checks: health.checks,
      updated_at_ms: Date.now(),
    }, { checks: health.checks }),
    updated_at_ms: Date.now(),
  };
  return json({ ...publicRollout(rollout.state), health });
}

async function handleRollback(
  appId: string,
  ctx: {
    readonly store: CreationHostStore;
    readonly rollouts: Map<string, RolloutState>;
  },
): Promise<Response> {
  const rollout = rolloutFor(appId, ctx);
  if (!rollout.state.previous) throw new Error("previous release is required before rollback");
  const versionId = versionIdFromCandidate(rollout.state.previous.candidate_id);
  const project = ctx.store.getProject(appId);
  const version = ctx.store.getVersion(appId, versionId);
  const runtime = await ensurePublishedRuntime(rollout, project, version);
  const health = await healthCheck(runtime);
  const rolledBack = rollbackActiveRelease({
    ...rollout.state,
    previous: markReleaseInstanceHealthy({
      ...rollout.state.previous,
      url: runtime.url,
      checks: health.checks,
      updated_at_ms: Date.now(),
    }, { checks: health.checks }),
  }, {
    reason: `rollback to ${versionId}`,
  });
  if (!rolledBack.ok) throw new Error(rolledBack.error);
  rollout.state = rolledBack.state;
  return json({ ...publicRollout(rollout.state), health });
}

function ensureV1(store: CreationHostStore, appId: string): CreationHostVersion {
  try {
    return store.getVersion(appId, "v1");
  } catch {
    return store.forkVersion({
      app_id: appId,
      from_version_id: "v0",
      to_version_id: "v1",
    });
  }
}

function rolloutFor(
  appId: string,
  ctx: {
    readonly rollouts: Map<string, RolloutState>;
  },
): RolloutState {
  const existing = ctx.rollouts.get(appId);
  if (existing) return existing;
  const rollout: RolloutState = {
    state: {
      schema_version: 1,
      active: null,
      candidate: null,
      previous: null,
      timeline: [],
      updated_at_ms: Date.now(),
    },
    runtimes: new Map(),
  };
  ctx.rollouts.set(appId, rollout);
  return rollout;
}

async function ensurePublishedRuntime(
  rollout: RolloutState,
  project: CreationHostProject,
  version: CreationHostVersion,
): Promise<M18RuntimeHandle> {
  const existing = rollout.runtimes.get(version.version_id);
  if (existing) return existing;
  const runtime = await startM18PreviewRuntime({ project, version, port: 0 });
  rollout.runtimes.set(version.version_id, runtime);
  return runtime;
}

async function healthCheck(runtime: M18RuntimeHandle): Promise<{
  readonly ok: boolean;
  readonly url: string;
  readonly checks: readonly string[];
}> {
  const health = await fetchJson<{ ok: boolean }>(`${runtime.url}/health`);
  const site = await fetchJson<{ site_definition: { version: string } }>(`${runtime.url}/api/site`);
  return {
    ok: health.ok && site.site_definition.version === runtime.version_id,
    url: runtime.url,
    checks: ["GET /health", "GET /api/site"],
  };
}

function requireEvolution(
  appId: string,
  evolutions: Map<string, EvolutionState>,
): EvolutionState {
  const evolution = evolutions.get(appId);
  if (!evolution) throw new Error(`evolution is not running for ${appId}`);
  return evolution;
}

function publicRuntime(runtime: M18RuntimeHandle): Record<string, unknown> {
  return {
    app_id: runtime.app_id,
    version_id: runtime.version_id,
    preview_url: runtime.url,
    status: "running",
  };
}

function publicEvolution(evolution: EvolutionState | undefined): Record<string, unknown> | null {
  if (!evolution) return null;
  return {
    app_id: evolution.app_id,
    version_id: evolution.version_id,
    status: evolution.status,
    proposal: evolution.proposal,
    transcript: evolution.transcript,
  };
}

function publicRollout(state: ReleaseRolloutState): {
  readonly state: ReleaseRolloutState;
  readonly summary: ReleaseRolloutSummary;
} {
  return {
    state,
    summary: summarizeReleaseRollout(state),
  };
}

function versionIdFromCandidate(candidateId: string): string {
  const match = candidateId.match(/-(v[0-9]+)$/);
  if (!match) throw new Error(`candidate_id does not include version id: ${candidateId}`);
  return match[1];
}

async function readOptionalJson<T>(req: Request): Promise<T> {
  const text = await req.text();
  if (!text.trim()) return {} as T;
  return JSON.parse(text) as T;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`${init?.method ?? "GET"} ${url} failed: ${await response.text()}`);
  return await response.json() as T;
}

function serveIndex(): Response {
  const path = join(import.meta.dir, "static", "index.html");
  if (!existsSync(path)) {
    return new Response("M18 Personal Focus Site", {
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
