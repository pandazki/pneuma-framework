import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildM6LiveAgentPrompt,
  waitForPriorityQueueOperationReady,
} from "./run.js";

describe("M6 real backend-agent evolution runner", () => {
  test("runs the deterministic backend path, verifies Priority Queue API rows, and exits cleanly", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m6-runner-"));
    try {
      const proc = Bun.spawn({
        cmd: [
          "bun",
          "run",
          join(import.meta.dir, "run.ts"),
          "--backend",
          "fake",
          "--workspace",
          workspace,
          "--port",
          "0",
          "--smoke-exit",
        ],
        stdout: "pipe",
        stderr: "pipe",
      });

      const [stdout, stderr, exitCode] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
        proc.exited,
      ]);

      expect(exitCode).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toContain("M6 Real Backend-Agent Evolution ready:");
      expect(stdout).toContain("backend: fake");
      expect(stdout).toContain("framework tools: definition.apply");
      expect(stdout).toContain("agent tool calls: 4");
      expect(stdout).toContain("priority queue smoke: 3 rows");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 90_000);

  test("live opencode prompt instructs the code agent to execute exact governed changes without design questions", () => {
    const prompt = buildM6LiveAgentPrompt();

    expect(prompt).toContain("Do not ask design questions");
    expect(prompt).toContain("definition.apply");
    expect(prompt).toContain("require_approval");
    expect(prompt).toContain("add_table_column");
    expect(prompt).toContain("add_operation");
    expect(prompt).toContain("add_view");
    expect(prompt).toContain("add_policy_rule");
    expect(prompt).toContain("list_priority_queue");
    expect(prompt).toContain("priority_queue");
  });

  test("live completion gate waits through transient 404 until Priority Queue operation is available", async () => {
    let attempts = 0;
    const server = Bun.serve({
      port: 0,
      fetch(request) {
        const url = new URL(request.url);
        if (url.pathname !== "/api/operations/list_priority_queue") {
          return Response.json({ error: "not_found" }, { status: 404 });
        }
        attempts += 1;
        if (attempts < 3) {
          return Response.json({ error: "operation_not_found" }, { status: 404 });
        }
        return Response.json({ rows: [] });
      },
    });

    try {
      const rows = await waitForPriorityQueueOperationReady(`http://127.0.0.1:${server.port}`, {
        intervalMs: 5,
        timeoutMs: 1_000,
      });

      expect(rows).toEqual([]);
      expect(attempts).toBe(3);
    } finally {
      server.stop(true);
    }
  });
});
