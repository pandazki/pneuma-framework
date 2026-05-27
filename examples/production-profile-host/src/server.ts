import { existsSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ProductionProfileHost, type PublishedRuntimeHandle } from "./host";
import type { ProductionCodeAgentLogEntry } from "./production-codex-agent";

const port = Number(process.env.PORT ?? 8899);
const workspace = join(import.meta.dir, "..", ".tmp", "browser-workspace");
const host = new ProductionProfileHost({ workspace_root: workspace });
const agentMode = resolveAgentMode(process.env.PNEUMA_PRODUCTION_PROFILE_AGENT);
let currentAppId: string | undefined;
let previewHandle: PublishedRuntimeHandle | undefined;
let publishedHandle: PublishedRuntimeHandle | undefined;
let nextRuntimePort = 8930;
let agentLogs: ProductionCodeAgentLogEntry[] = [];

mkdirSync(workspace, { recursive: true });

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/state" && request.method === "GET") return json(await state());
      if (url.pathname === "/api/reset" && request.method === "POST") return json(await reset());
      if (url.pathname === "/api/projects" && request.method === "POST") return json(await createProject());
      if (url.pathname === "/api/agent/draft" && request.method === "POST") {
        const body = await request.json().catch(() => ({})) as { request?: string };
        return json(await askAgent(body.request ?? defaultBuilderRequest));
      }
      if (url.pathname === "/api/preview" && request.method === "POST") return json(await startPreview());
      if (url.pathname === "/api/approve" && request.method === "POST") return json(await approve());
      if (url.pathname === "/api/publish" && request.method === "POST") return json(await publish());
      if (url.pathname === "/api/rollback" && request.method === "POST") return json(await rollback());

      const asset = await staticAsset(url.pathname);
      if (asset) return asset;
      return new Response("Not found", { status: 404 });
    } catch (err) {
      return json({ ok: false, error: err instanceof Error ? err.message : String(err), state: await state().catch(() => undefined) }, 500);
    }
  },
});

console.log(`Production Profile Host listening on http://127.0.0.1:${port}`);

async function state() {
  const project = currentAppId && existsSync(join(workspace, currentAppId, "host-project.json"))
    ? host.project(currentAppId)
    : undefined;
  return {
    app_id: currentAppId,
    project: project
      ? {
          app_id: project.app_id,
          title: project.title,
          active_version_id: project.active_version_id,
          has_draft: project.has_draft,
          proposal: project.proposal,
        }
      : undefined,
    preview_url: previewHandle?.url,
    published_url: publishedHandle?.url,
    agent_mode: agentMode,
    agent_logs: agentLogs,
    default_request: defaultBuilderRequest,
  };
}

async function reset() {
  await stopRuntimeHandles();
  rmSync(workspace, { recursive: true, force: true });
  mkdirSync(workspace, { recursive: true });
  currentAppId = undefined;
  agentLogs = [];
  return state();
}

async function createProject() {
  await stopRuntimeHandles();
  currentAppId = "release-ops";
  agentLogs = [{ kind: "session", text: "Project created from the Bun + Hono + React + Neon production profile." }];
  host.createProject({ app_id: currentAppId, title: "Release Operations Board" });
  return state();
}

async function askAgent(builderRequest: string) {
  const appId = requireAppId();
  await stopPreview();
  agentLogs = [{ kind: "session", text: `Builder request received: ${builderRequest}` }];
  host.prepareDraft(appId);
  if (agentMode === "codex-app-server") {
    await host.runCodexAppServerAgent({
      app_id: appId,
      builder_request: builderRequest,
      model: process.env.PNEUMA_PRODUCTION_PROFILE_MODEL,
      append_log: appendLog,
    });
  } else {
    await host.runDeterministicAgent({ app_id: appId, builder_request: builderRequest });
    appendLog({ kind: "session", text: "Deterministic build agent updated the draft workspace." });
  }
  await host.buildProposal({ app_id: appId, builder_request: builderRequest });
  appendLog({ kind: "session", text: "Draft verification passed. Proposal is ready for Builder approval." });
  return state();
}

async function startPreview() {
  const appId = requireAppId();
  await stopPreview();
  previewHandle = await host.startDraftPreview({ app_id: appId, port: nextRuntimePort++ });
  return state();
}

async function approve() {
  const appId = requireAppId();
  const project = host.project(appId);
  if (!project.proposal) throw new Error("No proposal is ready.");
  host.approveAndApply({ app_id: appId, proposal_id: project.proposal.proposal_id });
  await stopPreview();
  return state();
}

async function publish() {
  const appId = requireAppId();
  await stopPublished();
  publishedHandle = await host.startPublishedRuntime({ app_id: appId, port: nextRuntimePort++ });
  return state();
}

async function rollback() {
  const appId = requireAppId();
  await stopRuntimeHandles();
  host.rollback({ app_id: appId });
  return state();
}

function requireAppId(): string {
  if (!currentAppId) throw new Error("Create a project first.");
  return currentAppId;
}

async function stopRuntimeHandles() {
  await Promise.allSettled([stopPreview(), stopPublished()]);
}

async function stopPreview() {
  if (!previewHandle) return;
  const handle = previewHandle;
  previewHandle = undefined;
  await handle.stop();
}

async function stopPublished() {
  if (!publishedHandle) return;
  const handle = publishedHandle;
  publishedHandle = undefined;
  await handle.stop();
}

async function staticAsset(pathname: string): Promise<Response | undefined> {
  const normalized = pathname === "/" ? "/index.html" : pathname;
  const distRoot = join(import.meta.dir, "..", "dist", "client");
  const file = join(distRoot, normalized);
  if (!file.startsWith(distRoot) || !existsSync(file)) {
    const index = join(distRoot, "index.html");
    return existsSync(index) ? new Response(Bun.file(index)) : undefined;
  }
  return new Response(Bun.file(file));
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, { status });
}

const defaultBuilderRequest = "Add release environment tracking so operators can separate staging and production work.";

function resolveAgentMode(value: string | undefined): "deterministic" | "codex-app-server" {
  if (value === "codex" || value === "codex-app-server") return "codex-app-server";
  return "deterministic";
}

function appendLog(entry: ProductionCodeAgentLogEntry, options?: { readonly merge_with_previous?: boolean }): void {
  if (options?.merge_with_previous && agentLogs.length > 0 && agentLogs[agentLogs.length - 1]?.kind === entry.kind) {
    const previous = agentLogs[agentLogs.length - 1];
    agentLogs = [...agentLogs.slice(0, -1), { ...previous, text: `${previous.text}${entry.text}` }];
    return;
  }
  agentLogs = [...agentLogs, entry].slice(-80);
}
