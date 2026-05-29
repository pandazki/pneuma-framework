import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { ReleaseHost, type AgentKind, type DeployTarget } from "./host";

// ---------------------------------------------------------------------------
// Creation Host control-plane server. Exposes the lifecycle as a small JSON API
// and serves the Builder studio UI. The same API backs the browser E2E.
// ---------------------------------------------------------------------------

const scaffoldDir = join(import.meta.dir, "..", "..", "clean-room-release-board");
const workDir = join(import.meta.dir, "..", ".work");

const agentDefault: AgentKind =
  process.env.PNEUMA_AGENT === "codex-app-server" ? "codex-app-server" : "deterministic";
const databaseUrl = process.env.DATABASE_URL;
const vercel =
  process.env.VERCEL_TOKEN && process.env.VERCEL_PROJECT
    ? {
        token: process.env.VERCEL_TOKEN,
        project: process.env.VERCEL_PROJECT,
        teamId: process.env.VERCEL_TEAM_ID,
      }
    : undefined;
const neon = process.env.NEON_API_KEY
  ? { apiKey: process.env.NEON_API_KEY, projectId: process.env.NEON_PROJECT_ID }
  : undefined;

const trace: string[] = [];
const log = (line: string) => {
  const stamped = `${new Date().toISOString().slice(11, 19)} ${line}`;
  trace.push(stamped);
  if (trace.length > 400) trace.shift();
  console.log(stamped);
};

function buildHost(): ReleaseHost {
  return new ReleaseHost({ scaffoldDir, workDir, databaseUrl, vercel, neon, codexModel: process.env.CODEX_MODEL, log });
}

let host = buildHost();

function projectView(id: string) {
  const state = host.getProject(id);
  if (!state) return null;
  return {
    ...state,
    versionMeta: state.versions.map((v) => host.getVersionMeta(id, v)).filter(Boolean),
    proposal: host.getProposal(id) ?? null,
    published: host.getPublished(id) ?? null,
  };
}

const app = new Hono();

app.get("/api/config", (c) =>
  c.json({
    agentDefault,
    databaseConfigured: Boolean(databaseUrl),
    vercelConfigured: Boolean(vercel),
    neonBranchConfigured: Boolean(neon && databaseUrl),
    deployTargets: vercel ? ["local", "vercel"] : ["local"],
  }),
);

app.get("/api/trace", (c) => c.json({ lines: trace.slice(-200) }));

app.get("/api/projects", (c) =>
  c.json(host.listProjects().map((p) => projectView(p.id))),
);

app.post("/api/projects", async (c) => {
  const state = await host.createProject();
  return c.json(projectView(state.id), 201);
});

app.get("/api/projects/:id", (c) => {
  const view = projectView(c.req.param("id"));
  if (!view) return c.json({ error: "not_found" }, 404);
  return c.json(view);
});

app.post("/api/projects/:id/preview", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as {
    target?: "active" | "draft";
    data?: "memory" | "neon-branch";
  };
  const preview = await host.startPreview(c.req.param("id"), body.target ?? "active", body.data ?? "memory");
  return c.json(preview);
});

app.post("/api/projects/:id/preview/stop", async (c) => {
  await host.stopPreview(c.req.param("id"));
  return c.json({ ok: true });
});

app.post("/api/projects/:id/agent", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { request?: string; agent?: AgentKind };
  const agent = body.agent ?? agentDefault;
  const proposal = await host.runAgent(c.req.param("id"), { request: body.request, agent });
  return c.json(proposal);
});

app.post("/api/projects/:id/approve", async (c) => {
  const meta = await host.approve(c.req.param("id"));
  return c.json(meta);
});

app.post("/api/projects/:id/publish", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { target?: DeployTarget };
  const target: DeployTarget = body.target ?? "local";
  const receipt = await host.publish(c.req.param("id"), target);
  return c.json(receipt);
});

app.post("/api/projects/:id/rollback", async (c) => {
  const state = await host.rollback(c.req.param("id"));
  return c.json(projectView(state.id));
});

app.post("/api/reset", async (c) => {
  await host.shutdown();
  rmSync(workDir, { recursive: true, force: true });
  trace.length = 0;
  host = buildHost();
  return c.json({ ok: true });
});

// Wrap mutating handlers so failures return structured JSON instead of 500s.
app.onError((err, c) => {
  log(`error: ${err.message}`);
  return c.json({ error: "host_error", message: err.message }, 400);
});

app.use("/assets/*", serveStatic({ root: "./dist" }));
app.get("*", async (c) => {
  if (c.req.path.startsWith("/api/")) return c.json({ error: "not_found" }, 404);
  const file = Bun.file("./dist/index.html");
  if (await file.exists()) {
    return new Response(file, { headers: { "content-type": "text/html; charset=utf-8" } });
  }
  return c.text("Studio UI not built. Run `bun run build`.", 503);
});

const port = Number(process.env.PORT ?? 8870);
log(`clean-room-release-host studio on :${port} (agent: ${agentDefault}, vercel: ${Boolean(vercel)})`);

export default { port, fetch: app.fetch, idleTimeout: 255 };
