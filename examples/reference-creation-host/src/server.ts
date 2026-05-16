import { mkdtempSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createReferenceHost } from "./host/reference-host.js";

const workspace = process.env.PNEUMA_REFERENCE_HOST_WORKSPACE
  ?? mkdtempSync(join(tmpdir(), "pneuma-reference-host-server-"));
const draftAgent = process.env.PNEUMA_REFERENCE_HOST_AGENT === "opencode"
  ? (await import("./host/opencode-code-agent.js")).createOpencodeReviewQueueDraftAgent({
      model: process.env.PNEUMA_REFERENCE_HOST_MODEL,
      timeout_ms: Number(process.env.PNEUMA_REFERENCE_HOST_AGENT_TIMEOUT_MS ?? "180000"),
    })
  : undefined;
const host = createReferenceHost({ workspace, draft_agent: draftAgent });
const staticRoot = join(import.meta.dir, "..", "static");

const routes: Record<string, () => Promise<Response> | Response> = {
  "/": () => fileResponse("index.html", "text/html; charset=utf-8"),
  "/static/styles.css": () => fileResponse("styles.css", "text/css; charset=utf-8"),
  "/static/app.js": () => fileResponse("app.js", "text/javascript; charset=utf-8"),
  "/api/state": () => json({ project: host.state(), workspace }),
};

const server = Bun.serve({
  port: Number(process.env.PORT ?? "8892"),
  idleTimeout: 255,
  async fetch(request) {
    const url = new URL(request.url);
    const route = routes[url.pathname];
    if (request.method === "GET" && route) return route();

    if (request.method === "POST" && url.pathname === "/api/project/create") {
      return json(await host.createProject({ app_id: "team-notes", builder_user_id: "user:bob" }));
    }
    if (request.method === "POST" && url.pathname === "/api/evolution/request") {
      return json(await host.requestReviewQueueEvolution({
        app_id: "team-notes",
        builder_subject: "user:bob",
        message: "Add a review queue so notes can be marked needs_review and approved.",
      }));
    }
    if (request.method === "POST" && url.pathname === "/api/evolution/approve") {
      const body = await request.json().catch(() => ({})) as { subject?: string };
      return json(await host.approveEvolution({
        app_id: "team-notes",
        proposal_id: "proposal-review-queue",
        subject: body.subject ?? "user:reviewer",
      }));
    }
    if (request.method === "POST" && url.pathname === "/api/preview/start") {
      return json(await host.startPreview({ app_id: "team-notes" }));
    }
    if (request.method === "POST" && url.pathname === "/api/publish") {
      return json(await host.publish({ app_id: "team-notes" }));
    }
    if (request.method === "POST" && url.pathname === "/api/rollback") {
      return json(await host.rollback({ app_id: "team-notes" }));
    }

    return json({ error: "not_found" }, 404);
  },
});

console.log(`Reference Host listening on http://127.0.0.1:${server.port}/`);

function fileResponse(file: string, contentType: string): Response {
  return new Response(readFileSync(join(staticRoot, file)), {
    headers: { "content-type": contentType },
  });
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}
