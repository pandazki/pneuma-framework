import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function runM10(
  workspace: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn({
    cmd: ["bun", "run", join(import.meta.dir, "run.ts"), "--workspace", workspace],
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

describe("M10 derived semantic index runner", () => {
  test("rebuilds index, searches semantic queries, and writes evidence", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-m10-"));
    try {
      const result = await runM10(workspace);
      const evidencePath = join(
        workspace,
        ".pneuma",
        "m10",
        "semantic-index-evidence.json",
      );
      expect(result.exitCode).toBe(0);
      expect(result.stderr).toBe("");
      expect(result.stdout).toContain("M10 Derived Semantic Index ready:");
      expect(result.stdout).toContain("release risk from customer escalation -> risk");
      expect(result.stdout).toContain("deployment confidence -> deploy");
      expect(result.stdout).toContain("team alignment -> team");
      expect(existsSync(evidencePath)).toBe(true);
      const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as {
        final_status: string;
        index_status: string;
        source_rows_have_embedding_column: boolean;
        queries: Array<{ top_item_id: string }>;
      };
      expect(evidence.final_status).toBe("semantic_index_ready");
      expect(evidence.index_status).toBe("ready");
      expect(evidence.source_rows_have_embedding_column).toBe(false);
      expect(evidence.queries.map((query) => query.top_item_id)).toEqual([
        "risk",
        "deploy",
        "team",
      ]);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  }, 120_000);
});
