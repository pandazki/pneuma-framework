import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createHostStore, type HostStore } from "../m12-reference-creation-host/host-store.js";
import type {
  GeneratedAppProject,
  GeneratedAppVersion,
} from "../m12-reference-creation-host/types.js";
import { createHostEvolutionRuntime } from "../m13-host-agent-evolution/host-evolution.js";
import { forkGeneratedAppVersion } from "./version-store.js";
import {
  createHostPublishRolloutManager,
  type HostPublishRolloutManager,
} from "./publish-rollout.js";

export interface StartM14HostPublishRolloutServerOptions {
  readonly workspace: string;
  readonly port: number;
}

export interface M14HostPublishRolloutServer {
  readonly port: number;
  readonly workspace: string;
  stop(): Promise<void>;
}

interface DemoState {
  project: GeneratedAppProject;
  versions: GeneratedAppVersion[];
  manager: HostPublishRolloutManager;
}

export async function startM14HostPublishRolloutServer(
  options: StartM14HostPublishRolloutServerOptions,
): Promise<M14HostPublishRolloutServer> {
  const workspace = resolve(options.workspace);
  const store = createHostStore({ workspace });
  let demo: DemoState | undefined;
  const server = Bun.serve({
    port: options.port,
    fetch: (req) => handleRequest(req, store, workspace, {
      get demo() {
        return demo;
      },
      set demo(next: DemoState | undefined) {
        demo = next;
      },
    }),
  });

  return {
    port: server.port,
    workspace,
    async stop() {
      await demo?.manager.close();
      server.stop(true);
    },
  };
}

async function handleRequest(
  req: Request,
  store: HostStore,
  workspace: string,
  state: { demo: DemoState | undefined },
): Promise<Response> {
  const url = new URL(req.url);
  try {
    if (req.method === "GET" && url.pathname === "/") return serveIndex();
    if (req.method === "GET" && url.pathname === "/favicon.ico") return new Response(null, { status: 204 });
    if (req.method === "GET" && url.pathname.startsWith("/static/")) return serveStatic(url.pathname);
    if (req.method === "GET" && url.pathname === "/api/host/status") {
      return json({ workspace, demo: publicDemo(state.demo) });
    }
    if (req.method === "POST" && url.pathname === "/api/host/demo/create") {
      if (state.demo) return json(publicDemo(state.demo));
      state.demo = await createDemo(store, workspace);
      return json(publicDemo(state.demo));
    }

    const match = url.pathname.match(/^\/api\/host\/projects\/([^/]+)\/(.+)$/);
    if (match) {
      const appId = decodeURIComponent(match[1]);
      if (appId !== "team-knowledge-inbox") throw new Error(`unknown project: ${appId}`);
      const tail = match[2];
      if (req.method === "GET" && tail === "rollout") return json(await requireDemo(state).manager.status());
      if (req.method === "POST" && tail === "publish") {
        const body = await readOptionalJson<{ version_id?: string }>(req);
        return json(await requireDemo(state).manager.publishVersion(body.version_id ?? "v0"));
      }
      if (req.method === "POST" && tail === "restart-active") {
        return json(await requireDemo(state).manager.restartActive());
      }
      if (req.method === "POST" && tail === "rollback") {
        return json(await requireDemo(state).manager.rollback());
      }
    }

    return json({ error: "not_found" }, 404);
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 400);
  }
}

async function createDemo(store: HostStore, workspace: string): Promise<DemoState> {
  const { project, version: v0 } = store.createProject({
    app_id: "team-knowledge-inbox",
    display_name: "Team Knowledge Inbox",
    profile_id: "knowledge-inbox-bun-sqlite",
  });
  const v1 = forkGeneratedAppVersion({
    store,
    appId: project.app_id,
    fromVersionId: "v0",
    toVersionId: "v1",
  });
  const evolution = await createHostEvolutionRuntime({
    project,
    version: v1,
    backend: "fake",
    autoDecision: "allow",
  });
  try {
    await evolution.startPreview();
    await evolution.startEvolution({
      builderUserId: "builder-alice",
      builderRequest: "Add a Priority Queue for urgent inbox items.",
    });
  } finally {
    await evolution.close();
  }

  const manager = createHostPublishRolloutManager({
    workspace,
    project,
    versions: [v0, v1],
  });
  return { project, versions: [v0, v1], manager };
}

function requireDemo(state: { demo: DemoState | undefined }): DemoState {
  if (!state.demo) throw new Error("demo has not been created");
  return state.demo;
}

function publicDemo(demo: DemoState | undefined): Record<string, unknown> {
  if (!demo) return { project: null, versions: [] };
  return {
    project: demo.project,
    versions: demo.versions,
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
    return new Response("M14 Host Publish Rollout", {
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
