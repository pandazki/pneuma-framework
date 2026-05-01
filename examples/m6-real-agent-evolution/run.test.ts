import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
});
