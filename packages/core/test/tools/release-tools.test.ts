import { expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../../src/lifecycle.js";
import { buildToolRegistry } from "../../src/tools/registry.js";

function orchestrator(workspace: string): LifecycleOrchestrator {
  return new LifecycleOrchestrator({
    templateDir: join(import.meta.dir, "../fixtures/templates/fixture-min"),
    workspace,
  });
}

test("release tools stage, promote, report, and rollback rollout state", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "pneuma-release-tools-"));
  try {
    const reg = buildToolRegistry({ orchestrator: orchestrator(workspace), workspaceId: "workspace-release-tools" });
    expect(reg.has("release.status")).toBe(true);
    expect(reg.has("release.stage")).toBe(true);
    expect(reg.has("release.promote")).toBe(true);
    expect(reg.has("release.rollback")).toBe(true);

    const initialActive = await reg.call("release.stage", {
      candidate_id: "rc-baseline",
      image_tag: "pneuma-knowledge-inbox:m10-active",
      url: "http://127.0.0.1:4100",
      status: "healthy",
      checks: [{ name: "health", status: "passed", message: "baseline healthy" }],
    });
    expect(initialActive.ok).toBe(true);
    const promotedInitial = await reg.call("release.promote", {});
    expect(promotedInitial.ok).toBe(true);

    const staged = await reg.call("release.stage", {
      candidate_id: "rc-semantic-search",
      image_tag: "pneuma-knowledge-inbox:m11-candidate",
      url: "http://127.0.0.1:4101",
      status: "healthy",
      checks: [{ name: "health", status: "passed", message: "candidate healthy" }],
    });
    expect(staged.ok).toBe(true);

    const promoted = await reg.call("release.promote", {});
    expect(promoted.ok).toBe(true);
    const status = await reg.call("release.status", {});
    expect(status.ok).toBe(true);
    expect((status.state as { summary: { active_candidate_id?: string } }).summary.active_candidate_id)
      .toBe("rc-semantic-search");

    const rolledBack = await reg.call("release.rollback", { reason: "demo rollback" });
    expect(rolledBack.ok).toBe(true);
    const afterRollback = await reg.call("release.status", {});
    expect((afterRollback.state as { summary: { active_candidate_id?: string } }).summary.active_candidate_id)
      .toBe("rc-baseline");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

test("release.promote fails closed when the staged candidate is not healthy", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "pneuma-release-tools-unhealthy-"));
  try {
    const reg = buildToolRegistry({ orchestrator: orchestrator(workspace) });
    const staged = await reg.call("release.stage", {
      candidate_id: "rc-unhealthy",
      image_tag: "pneuma-knowledge-inbox:broken",
      status: "unhealthy",
      checks: [{ name: "health", status: "failed", message: "GET /healthz failed" }],
    });
    expect(staged.ok).toBe(true);

    const promoted = await reg.call("release.promote", {});
    expect(promoted.ok).toBe(false);
    expect(promoted.error).toContain("candidate must be healthy");
    const status = await reg.call("release.status", {});
    expect((status.state as { summary: { candidate_candidate_id?: string } }).summary.candidate_candidate_id)
      .toBe("rc-unhealthy");
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});
