import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../src/lifecycle.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tmpWs(prefix: string): string {
  return mkdtempSync(join(tmpdir(), `pneuma-api-cfg-${prefix}-`));
}

/**
 * Start a minimal Bun HTTP server that handles one response shape, then call
 * `fn` with the bound port. The server is shut down after `fn` resolves.
 */
async function withFakeServer(
  handler: (req: Request) => Response | Promise<Response>,
  fn: (port: number) => Promise<void>,
): Promise<void> {
  const server = Bun.serve({ port: 0, fetch: handler });
  try {
    await fn(server.port);
  } finally {
    server.stop(true);
  }
}

// Fixture template directories
const TEMPLATE_HAPPY = join(import.meta.dir, "fixtures/templates/fixture-api-config-happy");
const TEMPLATE_404 = join(import.meta.dir, "fixtures/templates/fixture-api-config-404");
const TEMPLATE_NO_SERVICE = join(import.meta.dir, "fixtures/templates/fixture-api-config-no-service");

// ---------------------------------------------------------------------------
// Test 1: happy path — /api/config returns operations
// ---------------------------------------------------------------------------

test("LifecycleOrchestrator populates state.dev.operations after service-ready", async () => {
  const sampleOperations = [
    {
      id: "create-bookmark",
      action: "write",
      resource: { kind: "table", table: "bookmarks" },
      input: { url: "string", title: "string" },
      output: { id: "string" },
      affects: { reads_only: false, destructive: false, mutations: ["bookmarks"] },
      handler_kind: "code",
    },
    {
      id: "list-bookmarks",
      action: "read",
      resource: { kind: "table", table: "bookmarks" },
      input: {},
      output: { rows: "array" },
      affects: { reads_only: true, destructive: false, mutations: [] },
      handler_kind: "query",
    },
  ];
  const sampleTables = [
    {
      id: "bookmarks",
      source: { kind: "stored" },
      system_owned: false,
      columns: [
        { name: "url", type: { kind: "primitive", of: "URL" }, nullable: false, schema: { type: "string" } },
      ],
      row_schema: {
        type: "object",
        properties: { url: { type: "string" } },
        required: ["url"],
        additionalProperties: false,
      },
    },
  ];

  await withFakeServer(
    (req) => {
      const url = new URL(req.url);
      if (url.pathname === "/api/config") {
        return new Response(
          JSON.stringify({ app_id: "test-app", operations: sampleOperations, tables: sampleTables }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    },
    async (port) => {
      const ws = tmpWs("happy");
      const orch = new LifecycleOrchestrator({
        templateDir: TEMPLATE_HAPPY,
        workspace: ws,
        portHint: port,
      });
      const devRunning = orch.runDev();
      await orch.awaitDevReady();

      // Give the async fetch a moment to complete.
      // _fetchOperations is fire-and-forget; awaitDevReady() doesn't gate on it.
      for (let i = 0; i < 40; i++) {
        if (orch.state.dev?.operations !== undefined) break;
        await new Promise((r) => setTimeout(r, 50));
      }

      expect(orch.state.dev?.operations).toBeDefined();
      expect(orch.state.dev?.operations).toHaveLength(2);
      expect(orch.state.dev?.operations![0]!.id).toBe("create-bookmark");
      expect(orch.state.dev?.operations![1]!.id).toBe("list-bookmarks");
      expect(orch.state.dev?.operations![0]!.handler_kind).toBe("code");
      expect(orch.state.dev?.operations![1]!.handler_kind).toBe("query");
      expect(orch.state.dev?.tables).toBeDefined();
      expect(orch.state.dev?.tables).toHaveLength(1);
      expect(orch.state.dev?.tables![0]!.id).toBe("bookmarks");
      expect(orch.state.dev?.tables![0]!.columns[0]!.schema).toEqual({ type: "string" });
      expect(orch.state.dev?.operations_fetch_error).toBeUndefined();

      await orch.runStop();
      await devRunning;
    },
  );
});

// ---------------------------------------------------------------------------
// Test 2: graceful 404 — /api/config not found
// ---------------------------------------------------------------------------

test("LifecycleOrchestrator records operations_fetch_error on 404, does not crash dev", async () => {
  await withFakeServer(
    (_req) => {
      // Every request returns 404 — template doesn't expose /api/config.
      return new Response(JSON.stringify({ error: "not_found" }), { status: 404 });
    },
    async (port) => {
      const ws = tmpWs("404");
      const orch = new LifecycleOrchestrator({
        templateDir: TEMPLATE_404,
        workspace: ws,
        portHint: port,
      });
      const devRunning = orch.runDev();
      await orch.awaitDevReady();

      // Wait for the fetch to settle.
      for (let i = 0; i < 40; i++) {
        if (orch.state.dev?.operations_fetch_error !== undefined) break;
        await new Promise((r) => setTimeout(r, 50));
      }

      expect(orch.state.dev?.operations).toBeUndefined();
      expect(orch.state.dev?.operations_fetch_error).toBe("HTTP 404");
      // Dev mode is still running — not crashed.
      expect(orch.state.dev?.state).toBe("running");

      await orch.runStop();
      await devRunning;
    },
  );
});

// ---------------------------------------------------------------------------
// Test 3: no HTTP service — template emits only ##pneuma:ready, no service-ready
// ---------------------------------------------------------------------------

test("LifecycleOrchestrator silently skips operations fetch when no service-ready is emitted", async () => {
  const ws = tmpWs("no-svc");
  const orch = new LifecycleOrchestrator({
    templateDir: TEMPLATE_NO_SERVICE,
    workspace: ws,
  });
  const devRunning = orch.runDev();
  await orch.awaitDevReady();

  // A small wait to confirm no fetch was attempted.
  await new Promise((r) => setTimeout(r, 200));

  expect(orch.state.dev?.operations).toBeUndefined();
  expect(orch.state.dev?.operations_fetch_error).toBeUndefined();
  expect(orch.state.dev?.state).toBe("running");

  await orch.runStop();
  await devRunning;
});
