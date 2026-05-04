import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("M5 Builder evolution runner", () => {
  test("applies the priority capability, seeds demo rows, verifies the public API, and exits in smoke mode", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m5-runner-"));
    try {
      const proc = Bun.spawn({
        cmd: [
          "bun",
          "run",
          join(import.meta.dir, "run.ts"),
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
      expect(stdout).toContain("M5 Knowledge Inbox Builder evolution ready:");
      expect(stdout).toContain("definition changes: 5 applied");
      expect(stdout).toContain("priority queue smoke: 3 rows");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 90_000);
});
