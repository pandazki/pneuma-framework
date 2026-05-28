import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ProductionProfileHost, verifyProductionDraft } from "./src/host";
import { isCodexTurnCompletionTimeout } from "./src/production-codex-agent";
import { deployVercelProductionFromRoot } from "./src/vercel-api-deploy";

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
    expect(host.canRollback({ app_id: project.app_id })).toBe(false);

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
    expect(host.canRollback({ app_id: project.app_id })).toBe(true);

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

    host.prepareDraft(project.app_id);
    const v2Draft = host.project(project.app_id);
    writeFileSync(join(v2Draft.draft_root, "README.md"), "# Release Ops\n\nv2 documentation update.\n");
    const v2Proposal = await host.buildProposal({
      app_id: project.app_id,
      builder_request: "Refresh generated-app documentation.",
    });
    expect(v2Proposal.verification.ok).toBe(true);
    const v2 = host.approveAndApply({ app_id: project.app_id, proposal_id: v2Proposal.proposal_id });
    expect(v2.active_version_id).toBe("v2");
    expect(host.canRollback({ app_id: project.app_id })).toBe(true);

    const rolledBack = host.rollback({ app_id: project.app_id });
    expect(rolledBack.active_version_id).toBe("v1");
    expect(host.canRollback({ app_id: project.app_id })).toBe(true);
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

  it("classifies Codex turn-completion timeout as recoverable draft-verification path", () => {
    expect(isCodexTurnCompletionTimeout(new Error("Timed out waiting for Codex turn completion after 600000ms"))).toBe(true);
    expect(isCodexTurnCompletionTimeout(new Error("Codex app-server connection closed"))).toBe(false);
  });

  it("deploys a generated app version through the Vercel REST API handshake", async () => {
    const root = join(workspace, "vercel-root");
    mkdirSync(root, { recursive: true });
    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { build: "true" } }));
    writeFileSync(join(root, "index.html"), "<main>ok</main>");
    const seen: string[] = [];
    let deploymentShas: string[] = [];
    const fetchImpl = async (url: URL | RequestInfo, init?: RequestInit) => {
      const parsed = new URL(String(url));
      seen.push(`${init?.method ?? "GET"} ${parsed.pathname}`);
      if (parsed.pathname === "/v13/deployments" && init?.method === "POST") {
        const body = JSON.parse(String(init.body)) as { files: readonly { sha: string }[] };
        deploymentShas = body.files.map((file) => file.sha);
        if (seen.filter((entry) => entry === "POST /v13/deployments").length === 1) {
          return Response.json({ error: { code: "missing_files", missing: deploymentShas } }, { status: 400 });
        }
        return Response.json({ id: "dpl_test", readyState: "BUILDING", url: "preview.example.vercel.app" });
      }
      if (parsed.pathname === "/v2/files" && init?.method === "POST") {
        expect(deploymentShas).toContain((init.headers as Record<string, string>)["x-now-digest"]);
        return Response.json({ ok: true });
      }
      if (parsed.pathname === "/v13/deployments/dpl_test") {
        return Response.json({ id: "dpl_test", readyState: "READY", url: "preview.example.vercel.app" });
      }
      throw new Error(`Unexpected Vercel mock request: ${init?.method ?? "GET"} ${parsed.pathname}`);
    };

    const receipt = await deployVercelProductionFromRoot({
      root,
      token: "test-token",
      project_name: "production-generated-app-profile",
      fetch_impl: fetchImpl as typeof fetch,
      poll_interval_ms: 1,
    });

    expect(receipt).toEqual({
      deployment_id: "dpl_test",
      files: 2,
      ready_state: "READY",
      url: "https://preview.example.vercel.app",
    });
    expect(seen).toEqual([
      "POST /v13/deployments",
      "POST /v2/files",
      "POST /v2/files",
      "POST /v13/deployments",
      "GET /v13/deployments/dpl_test",
    ]);
  });
});
