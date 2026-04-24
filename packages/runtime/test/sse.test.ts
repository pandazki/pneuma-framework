// SSE endpoint + OperationExecutor → broadcaster integration tests.
//
// Strategy:
//  - Boot a real Bun.serve on port 0 (random).
//  - Use fetch() to open the SSE stream; read chunks from the body stream directly.
//  - Trigger operation via POST and assert the SSE subscriber received the event.
//
// We do NOT use the browser EventSource API (not available in Bun test env);
// instead we consume the response body as a ReadableStream, which is the same
// underlying transport.

import { describe, test, expect } from "bun:test";
import {
  bootAppRuntime,
  asBunFetch,
  type AppConfig,
} from "../src/index.js";
import {
  Table,
  Operation,
  PolicySet,
  Subjects,
  Resources,
  type HandlerFn,
  type CellType,
} from "@pneuma-framework/core-domain";

const APP = "sse-test";
const TEXT: CellType = { kind: "primitive", of: "Text" };
const URL_T: CellType = { kind: "primitive", of: "URL" };

function sseTestConfig(): AppConfig {
  const bookmarks = new Table({
    id: "bookmarks",
    app_id: APP,
    columns: [
      { name: "url", type: URL_T },
      { name: "title", type: TEXT, nullable: true },
    ],
    source: { kind: "stored" },
  });

  const addBookmark = new Operation({
    id: "add_bookmark",
    app_id: APP,
    name: "Add bookmark",
    description: "Creates a new bookmark",
    input: {
      type: "record",
      fields: { url: { type: URL_T, required: true } },
    },
    output: { kind: "void" },
    affects: {
      mutations: ["bookmarks"],
      adapter_writes: [],
      reads_only: false,
      destructive: false,
    },
    handler: { kind: "code", ref: "add_bookmark" },
  });

  const policy = new PolicySet({ app_id: APP });
  policy.addRule({
    id: "allow-all",
    allow: [Subjects.anyone(), Subjects.anonymous()],
    do: ["invoke"],
    on: Resources.operation("add_bookmark"),
  });

  const handlers: Record<string, HandlerFn> = {
    add_bookmark: async ({ input, storage }) => {
      const i = input as { url: string };
      const { Row } = await import("@pneuma-framework/core-domain");
      const row = new Row({
        id: `bm-${Date.now()}`,
        table_id: "bookmarks",
        app_id: APP,
        cells: { url: i.url },
      });
      await storage.saveRow(row);
      return { id: row.id };
    },
  };

  return { app_id: APP, tables: [bookmarks], operations: [addBookmark], policy, handlers };
}

// Helper: read SSE lines until we get `count` data lines or timeout.
async function collectSseDataLines(
  bodyStream: ReadableStream<Uint8Array>,
  count: number,
  timeoutMs = 3000
): Promise<string[]> {
  const lines: string[] = [];
  const reader = bodyStream.getReader();
  const decoder = new TextDecoder();
  let buf = "";

  const deadline = Date.now() + timeoutMs;
  while (lines.length < count) {
    if (Date.now() > deadline) break;
    const { value, done } = await Promise.race([
      reader.read(),
      new Promise<{ value: undefined; done: true }>((res) =>
        setTimeout(() => res({ value: undefined, done: true }), deadline - Date.now())
      ),
    ]);
    if (done || value === undefined) break;
    buf += decoder.decode(value, { stream: true });
    const parts = buf.split("\n");
    buf = parts.pop() ?? "";
    for (const line of parts) {
      if (line.startsWith("data: ")) {
        lines.push(line.slice(6));
        if (lines.length >= count) break;
      }
    }
  }
  reader.cancel().catch(() => {});
  return lines;
}

describe("SSE /api/events/stream", () => {
  test("GET /api/events/stream returns text/event-stream and sends keepalive comment", async () => {
    const runtime = await bootAppRuntime(sseTestConfig());
    const server = Bun.serve({ port: 0, fetch: asBunFetch(runtime) });

    try {
      const resp = await fetch(`http://localhost:${server.port}/api/events/stream`);
      expect(resp.status).toBe(200);
      expect(resp.headers.get("content-type")).toContain("text/event-stream");

      // Read a small chunk — should contain the initial keepalive comment
      const reader = resp.body!.getReader();
      const { value } = await Promise.race([
        reader.read(),
        new Promise<{ value: undefined; done: boolean }>((res) =>
          setTimeout(() => res({ value: undefined, done: true }), 2000)
        ),
      ]);
      reader.cancel().catch(() => {});
      if (value) {
        const text = new TextDecoder().decode(value);
        expect(text).toContain(": keepalive");
      }
    } finally {
      server.stop(true);
      await runtime.close();
    }
  });

  test("broadcaster.emit() sends operation-executed to connected SSE client", async () => {
    const runtime = await bootAppRuntime(sseTestConfig());
    const server = Bun.serve({ port: 0, fetch: asBunFetch(runtime) });

    try {
      // Open SSE connection
      const resp = await fetch(`http://localhost:${server.port}/api/events/stream`);
      expect(resp.status).toBe(200);

      // Wait a tick for the keepalive to flush, then emit an event
      await new Promise((r) => setTimeout(r, 50));

      const collectPromise = collectSseDataLines(resp.body!, 1, 3000);

      runtime.broadcaster.emit({
        type: "operation-executed",
        operation_id: "test_op",
        app_id: APP,
        ts: 12345,
        success: true,
      });

      const lines = await collectPromise;
      expect(lines.length).toBeGreaterThanOrEqual(1);
      const evt = JSON.parse(lines[0]!);
      expect(evt.type).toBe("operation-executed");
      expect(evt.operation_id).toBe("test_op");
      expect(evt.app_id).toBe(APP);
      expect(evt.success).toBe(true);
    } finally {
      server.stop(true);
      await runtime.close();
    }
  });

  test("POST /api/operations/add_bookmark triggers operation-executed SSE event", async () => {
    const runtime = await bootAppRuntime(sseTestConfig());
    const server = Bun.serve({ port: 0, fetch: asBunFetch(runtime) });
    const base = `http://localhost:${server.port}`;

    try {
      // Open SSE stream first
      const sseResp = await fetch(`${base}/api/events/stream`);
      // Give the connection time to establish
      await new Promise((r) => setTimeout(r, 50));

      const collectPromise = collectSseDataLines(sseResp.body!, 1, 5000);

      // POST the operation
      const postResp = await fetch(`${base}/api/operations/add_bookmark`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: { url: "https://sse-test.example.com" } }),
      });
      expect(postResp.status).toBe(200);

      const lines = await collectPromise;
      expect(lines.length).toBeGreaterThanOrEqual(1);
      const evt = JSON.parse(lines[0]!);
      expect(evt.type).toBe("operation-executed");
      expect(evt.operation_id).toBe("add_bookmark");
      expect(evt.success).toBe(true);
    } finally {
      server.stop(true);
      await runtime.close();
    }
  });

  test("failed operation emits success=false via SSE", async () => {
    // Register an operation whose handler always throws.
    const failOp = new Operation({
      id: "fail_op",
      app_id: APP,
      name: "Always fail",
      description: "For testing failure path",
      input: { type: "record", fields: {} },
      output: { kind: "void" },
      affects: { mutations: [], adapter_writes: [], reads_only: false, destructive: false },
      handler: { kind: "code", ref: "fail_op" },
    });
    const policy = new PolicySet({ app_id: APP });
    policy.addRule({
      id: "allow-all",
      allow: [Subjects.anyone(), Subjects.anonymous()],
      do: ["invoke"],
      on: Resources.operation("fail_op"),
    });
    const handlers: Record<string, HandlerFn> = {
      fail_op: async () => { throw new Error("intentional failure"); },
    };
    const bookmarks = new Table({
      id: "bookmarks",
      app_id: APP,
      columns: [{ name: "url", type: URL_T }],
      source: { kind: "stored" },
    });
    const runtime = await bootAppRuntime({
      app_id: APP,
      tables: [bookmarks],
      operations: [failOp],
      policy,
      handlers,
    });
    const server = Bun.serve({ port: 0, fetch: asBunFetch(runtime) });
    const base = `http://localhost:${server.port}`;

    try {
      const sseResp = await fetch(`${base}/api/events/stream`);
      await new Promise((r) => setTimeout(r, 50));

      const collectPromise = collectSseDataLines(sseResp.body!, 1, 5000);

      // This POST will 500 because handler throws — but SSE should still emit
      await fetch(`${base}/api/operations/fail_op`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ input: {} }),
      });

      const lines = await collectPromise;
      expect(lines.length).toBeGreaterThanOrEqual(1);
      const evt = JSON.parse(lines[0]!);
      expect(evt.type).toBe("operation-executed");
      expect(evt.operation_id).toBe("fail_op");
      expect(evt.success).toBe(false);
    } finally {
      server.stop(true);
      await runtime.close();
    }
  });
});
