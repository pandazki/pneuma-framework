import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { ProductionProfileHost, verifyProductionDraft } from "./src/host";

const workspace = join(import.meta.dir, ".tmp", "host-flow");

describe("ProductionProfileHost", () => {
  beforeEach(() => {
    rmSync(workspace, { recursive: true, force: true });
    mkdirSync(workspace, { recursive: true });
  });

  afterEach(() => {
    rmSync(workspace, { recursive: true, force: true });
  });

  it("turns a production scaffold into a checked proposal and published runtime", async () => {
    const host = new ProductionProfileHost({ workspace_root: workspace });
    const project = host.createProject({ app_id: "release-ops", title: "Release Ops" });

    expect(project.active_version_id).toBe("v0");
    expect(project.source_root).toContain("release-ops/source");

    const v0Preview = await host.startActiveVersionPreview({ app_id: project.app_id, port: 8919 });
    try {
      const response = await fetch(`${v0Preview.url}/api/items`);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("Finalize OAuth callback hardening");
      const html = await fetch(v0Preview.url);
      expect(html.status).toBe(200);
      expect(await html.text()).toContain("root");
    } finally {
      await v0Preview.stop();
    }

    const v0Runtime = await host.startPublishedRuntime({ app_id: project.app_id, port: 8920 });
    try {
      const response = await fetch(`${v0Runtime.url}/api/items`);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("Finalize OAuth callback hardening");
      const html = await fetch(v0Runtime.url);
      expect(html.status).toBe(200);
      expect(await html.text()).toContain("root");
    } finally {
      await v0Runtime.stop();
    }

    host.prepareDraft(project.app_id);
    const agent = await host.runDeterministicAgent({
      app_id: project.app_id,
      builder_request: "Add release environment tracking so operators can separate staging and production work.",
    });
    expect(agent.changed_paths).toContain("src/shared/contracts.ts");
    expect(agent.changed_paths).toContain("src/client/App.tsx");

    const proposal = await host.buildProposal({
      app_id: project.app_id,
      builder_request: "Add release environment tracking so operators can separate staging and production work.",
    });
    expect(proposal.verification.ok).toBe(true);
    expect(proposal.changed_paths).not.toContain("Dockerfile");
    expect(proposal.changed_paths).not.toContain("vercel.json");

    const applied = host.approveAndApply({
      app_id: project.app_id,
      proposal_id: proposal.proposal_id,
    });
    expect(applied.active_version_id).toBe("v1");
    expect(applied.has_draft).toBe(false);

    const runtime = await host.startPublishedRuntime({ app_id: project.app_id, port: 8921 });
    try {
      const response = await fetch(`${runtime.url}/api/items`);
      expect(response.status).toBe(200);
      const text = await response.text();
      expect(text).toContain('"environment"');
      expect(text).toContain("production");
      expect(text).toContain("staging");
      const html = await fetch(runtime.url);
      expect(html.status).toBe(200);
    } finally {
      await runtime.stop();
    }
  }, 180_000);

  it("fails closed when protected deployment files change", async () => {
    const host = new ProductionProfileHost({ workspace_root: workspace });
    const project = host.createProject({ app_id: "release-ops", title: "Release Ops" });
    host.prepareDraft(project.app_id);
    await Bun.write(join(project.draft_root, "Dockerfile"), "FROM scratch\n");

    const verification = await verifyProductionDraft({
      source_root: project.source_root,
      draft_root: project.draft_root,
    });
    expect(verification.ok).toBe(false);
    expect(verification.reason).toBe("protected_file_changed");
  });
});
