import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function runM9Cli(workspace: string): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn({
    cmd: [
      "bun",
      "run",
      join(import.meta.dir, "run.ts"),
      "--workspace",
      workspace,
    ],
    stdout: "pipe",
    stderr: "pipe",
  });

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);

  return { stdout, stderr, exitCode };
}

describe("M9 creation-to-release integrity runner", () => {
  test("writes success and failure evidence for one approved capability request", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m9-run-"));
    try {
      const { stdout, stderr, exitCode } = await runM9Cli(workspace);
      const evidenceDir = join(workspace, ".pneuma", "m9");
      const successPath = join(evidenceDir, "success-evidence.json");
      const failurePath = join(evidenceDir, "failure-evidence.json");

      expect(exitCode).toBe(0);
      expect(stderr).toBe("");
      expect(stdout).toContain("M9 Creation-to-Release Integrity ready:");
      expect(stdout).toContain("success final: release_candidate_ready");
      expect(stdout).toContain("failure final: failed_repair_required");
      expect(existsSync(successPath)).toBe(true);
      expect(existsSync(failurePath)).toBe(true);

      const success = JSON.parse(readFileSync(successPath, "utf8"));
      const failure = JSON.parse(readFileSync(failurePath, "utf8"));

      expect(success.final_status).toBe("release_candidate_ready");
      expect(success.proposal.tool).toBe("definition.apply_change_set");
      expect(success.approval.decision).toBe("allow");
      expect(success.execution.child_progress.map((child: { status: string }) => child.status)).toEqual([
        "applied",
        "applied",
        "applied",
        "applied",
        "applied",
      ]);
      expect(success.release_candidate.status).toBe("ready");
      expect(success.release_candidate.checks.map((check: { name: string }) => check.name)).toEqual([
        "health",
        "config",
        "api",
      ]);

      expect(failure.final_status).toBe("failed_repair_required");
      expect(failure.release_candidate).toBe(null);
      expect(failure.execution.failed_change_index).toBe(1);
      expect(failure.execution.child_progress.map((child: { status: string }) => child.status)).toEqual([
        "applied",
        "failed",
        "pending",
        "pending",
      ]);
      expect(failure.recovery.status).toBe("manual_repair_required");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 180_000);
});
