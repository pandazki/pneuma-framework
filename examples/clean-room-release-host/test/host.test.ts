import { afterAll, describe, expect, test } from "bun:test";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { ReleaseHost } from "../src/host";
import { isProtected } from "../src/workspace";
import { isCodexTurnCompletionTimeout } from "@pneuma-framework/backend-codex";

const scaffoldDir = join(import.meta.dir, "..", "..", "clean-room-release-board");
const workDir = join(import.meta.dir, "..", ".work-test");

const host = new ReleaseHost({ scaffoldDir, workDir });

afterAll(async () => {
  await host.shutdown();
  rmSync(workDir, { recursive: true, force: true });
});

describe("workspace + agent guards (offline)", () => {
  test("isProtected matches a root and its descendants", () => {
    const roots = ["api", "vercel.json", "src/db/client.ts"];
    expect(isProtected("api/index.ts", roots)).toBe(true);
    expect(isProtected("vercel.json", roots)).toBe(true);
    expect(isProtected("src/db/client.ts", roots)).toBe(true);
    expect(isProtected("src/db/schema.ts", roots)).toBe(false);
    expect(isProtected("src/shared/contracts.ts", roots)).toBe(false);
  });

  test("codex timeout classifier only matches turn-completion timeouts", () => {
    expect(
      isCodexTurnCompletionTimeout(new Error("Timed out waiting for Codex turn completion after 600000ms")),
    ).toBe(true);
    expect(isCodexTurnCompletionTimeout(new Error("network down"))).toBe(false);
    expect(isCodexTurnCompletionTimeout("nope")).toBe(false);
  });
});

describe("ReleaseHost lifecycle (deterministic, offline)", () => {
  let projectId = "";

  test("create-from-profile yields a complete v0 with a built bundle", async () => {
    const project = await host.createProject();
    projectId = project.id;
    expect(project.versions).toEqual(["v0"]);
    expect(project.activeVersionId).toBe("v0");
    const meta = host.getVersionMeta(projectId, "v0");
    expect(meta?.appSchemaSignature).toContain("release_items(");
    expect(meta?.appSchemaSignature).not.toContain("environment");
    expect(meta?.bundle.files.length ?? 0).toBeGreaterThan(0);
  }, 120_000);

  test("preview starts a disposable in-memory runtime", async () => {
    const preview = await host.startPreview(projectId);
    expect(preview.persistence).toBe("memory");
    const health = await (await fetch(`${preview.url}/api/health`)).json();
    expect(health.persistence).toBe("memory");
    expect(health.ok).toBe(true);
    await host.stopPreview(projectId);
  }, 60_000);

  test("deterministic draft passes the verify gate and yields schema + bundle deltas", async () => {
    const proposal = await host.runAgent(projectId, { agent: "deterministic" });
    expect(proposal.status).toBe("ready");
    expect(proposal.changedPaths).toContain("src/shared/contracts.ts");
    expect(proposal.changedPaths).toContain("src/db/schema.ts");
    expect(proposal.changedPaths).toContain("drizzle/0001_add_environment.sql");
    // app contract schema signature changed and now carries `environment`
    expect(proposal.appSchemaSignatureBefore).not.toContain("environment");
    expect(proposal.appSchemaSignatureAfter).toContain("environment");
    // the packaged client bundle changed too
    expect(proposal.bundleAfter.signature).not.toBe(proposal.bundleBefore.signature);
  }, 180_000);

  test("approve applies v1; rollback returns to v0", async () => {
    const applied = await host.approve(projectId);
    expect(applied.versionId).toBe("v1");
    expect(applied.appSchemaSignature).toContain("environment");
    expect(host.getProject(projectId)?.activeVersionId).toBe("v1");

    const rolled = await host.rollback(projectId);
    expect(rolled.activeVersionId).toBe("v0");
  }, 120_000);
});
