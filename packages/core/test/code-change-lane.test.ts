import { afterEach, beforeEach, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyCodeChangeProposal,
  createFileBuildThreadStore,
  prepareCodeChangeProposal,
  type ScaffoldProjectManifest,
} from "../src/index.js";

let workspace: string;
let sourceRoot: string;
let draftRoot: string;

beforeEach(() => {
  workspace = mkdtempSync(join(tmpdir(), "pneuma-code-change-lane-test-"));
  sourceRoot = join(workspace, "source");
  draftRoot = join(workspace, "draft");
  seedSource(sourceRoot);
  seedSource(draftRoot);
});

afterEach(() => {
  rmSync(workspace, { recursive: true, force: true });
});

test("prepareCodeChangeProposal collects diff and pre-proposal evidence before Builder approval", async () => {
  writeFileSync(join(draftRoot, "src/app/page.ts"), "export const title = 'after';\n");
  const store = createFileBuildThreadStore({ workspace });
  const thread = await store.startThread({
    profile_id: "simple-bun-ts",
    app_id: "app-1",
    builder_user_id: "bob",
  });

  const result = await prepareCodeChangeProposal({
    manifest: manifestFixture(),
    source_root: sourceRoot,
    draft_root: draftRoot,
    thread_store: store,
    thread_id: thread.thread_id,
    proposal_id: "proposal-1",
    summary: "Update the page title",
    rationale: "Builder asked for a visible text change.",
  });

  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error("expected proposal preparation to pass");
  expect(result.proposal.evidence.changed_files).toEqual(["src/app/page.ts"]);
  expect(result.proposal.evidence.diff).toContain("-export const title = 'before';");
  expect(result.proposal.evidence.diff).toContain("+export const title = 'after';");
  expect(result.proposal.evidence.checks.map((check) => `${check.phase}:${check.id}:${check.status}`)).toEqual([
    "pre_proposal:typecheck:passed",
    "pre_proposal:diff:passed",
    "pre_proposal:protected-paths:passed",
  ]);

  const turns = await store.listTurns(thread.thread_id);
  expect(turns.map((turn) => turn.kind)).toEqual(["agent_proposal"]);
});

test("prepareCodeChangeProposal rejects protected path edits before approval", async () => {
  writeFileSync(join(draftRoot, "src/framework/bridge.ts"), "export const internal = 'changed';\n");

  const result = await prepareCodeChangeProposal({
    manifest: manifestFixture(),
    source_root: sourceRoot,
    draft_root: draftRoot,
    proposal_id: "proposal-2",
    summary: "Modify framework bridge",
    rationale: "This should be blocked.",
  });

  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("expected proposal preparation to fail");
  expect(result.phase).toBe("pre_proposal");
  expect(result.checks.some((check) =>
    check.id === "protected-paths" &&
    check.status === "failed" &&
    check.message.includes("src/framework/bridge.ts")
  )).toBe(true);
  expect(readFileSync(join(sourceRoot, "src/framework/bridge.ts"), "utf8")).toBe(
    "export const internal = 'stable';\n",
  );
});

test("applyCodeChangeProposal applies one approved draft and records BuildThread receipt", async () => {
  writeFileSync(join(draftRoot, "src/app/page.ts"), "export const title = 'approved';\n");
  const store = createFileBuildThreadStore({ workspace });
  const thread = await store.startThread({
    profile_id: "simple-bun-ts",
    app_id: "app-1",
    builder_user_id: "bob",
  });
  const prepared = await prepareCodeChangeProposal({
    manifest: manifestFixture(),
    source_root: sourceRoot,
    draft_root: draftRoot,
    thread_store: store,
    thread_id: thread.thread_id,
    proposal_id: "proposal-3",
    summary: "Update the page title",
    rationale: "Builder approved this change.",
  });
  if (!prepared.ok) throw new Error("expected proposal preparation to pass");

  const applied = await applyCodeChangeProposal({
    manifest: manifestFixture(),
    source_root: sourceRoot,
    draft_root: draftRoot,
    proposal: prepared.proposal,
    decision: "approved",
    thread_store: store,
    thread_id: thread.thread_id,
  });

  expect(applied.ok).toBe(true);
  if (!applied.ok) throw new Error("expected apply to pass");
  expect(readFileSync(join(sourceRoot, "src/app/page.ts"), "utf8")).toBe(
    "export const title = 'approved';\n",
  );
  expect(applied.receipt.status).toBe("completed");
  expect(applied.receipt.evidence.changed_files).toEqual(["src/app/page.ts"]);

  const turns = await store.listTurns(thread.thread_id);
  expect(turns.map((turn) => turn.kind)).toEqual([
    "agent_proposal",
    "user_decision",
    "host_execution_receipt",
  ]);
});

test("applyCodeChangeProposal rejects stale base snapshots before mutating source", async () => {
  writeFileSync(join(draftRoot, "src/app/page.ts"), "export const title = 'draft';\n");
  const prepared = await prepareCodeChangeProposal({
    manifest: manifestFixture(),
    source_root: sourceRoot,
    draft_root: draftRoot,
    proposal_id: "proposal-4",
    summary: "Update the page title",
    rationale: "Builder approved this change.",
  });
  if (!prepared.ok) throw new Error("expected proposal preparation to pass");
  writeFileSync(join(sourceRoot, "src/app/page.ts"), "export const title = 'changed elsewhere';\n");

  const applied = await applyCodeChangeProposal({
    manifest: manifestFixture(),
    source_root: sourceRoot,
    draft_root: draftRoot,
    proposal: prepared.proposal,
    decision: "approved",
  });

  expect(applied.ok).toBe(false);
  if (applied.ok) throw new Error("expected apply to fail");
  expect(applied.phase).toBe("pre_apply");
  expect(applied.receipt.status).toBe("failed_framework");
  expect(readFileSync(join(sourceRoot, "src/app/page.ts"), "utf8")).toBe(
    "export const title = 'changed elsewhere';\n",
  );
});

test("applyCodeChangeProposal rejects draft changes made after approval evidence", async () => {
  writeFileSync(join(draftRoot, "src/app/page.ts"), "export const title = 'approved evidence';\n");
  const prepared = await prepareCodeChangeProposal({
    manifest: manifestFixture(),
    source_root: sourceRoot,
    draft_root: draftRoot,
    proposal_id: "proposal-5",
    summary: "Update the page title",
    rationale: "Builder approved the original draft.",
  });
  if (!prepared.ok) throw new Error("expected proposal preparation to pass");
  writeFileSync(join(draftRoot, "src/app/page.ts"), "export const title = 'unapproved later edit';\n");

  const applied = await applyCodeChangeProposal({
    manifest: manifestFixture(),
    source_root: sourceRoot,
    draft_root: draftRoot,
    proposal: prepared.proposal,
    decision: "approved",
  });

  expect(applied.ok).toBe(false);
  if (applied.ok) throw new Error("expected apply to fail");
  expect(applied.phase).toBe("pre_apply");
  expect(applied.receipt.status).toBe("failed_framework");
  expect(applied.receipt.evidence.message).toContain("Pre-apply guardrails failed");
  expect(readFileSync(join(sourceRoot, "src/app/page.ts"), "utf8")).toBe(
    "export const title = 'before';\n",
  );
});

test("applyCodeChangeProposal rolls back source when post-apply guardrails fail", async () => {
  writeFileSync(join(draftRoot, "src/app/page.ts"), "export const title = 'bad runtime';\n");
  const prepared = await prepareCodeChangeProposal({
    manifest: manifestFixture(),
    source_root: sourceRoot,
    draft_root: draftRoot,
    proposal_id: "proposal-6",
    summary: "Update the page title",
    rationale: "Post-apply should catch runtime failures.",
  });
  if (!prepared.ok) throw new Error("expected proposal preparation to pass");

  const applied = await applyCodeChangeProposal({
    manifest: manifestFixture({
      postApplyCommand: "bun -e \"process.exit(9)\"",
    }),
    source_root: sourceRoot,
    draft_root: draftRoot,
    proposal: prepared.proposal,
    decision: "approved",
  });

  expect(applied.ok).toBe(false);
  if (applied.ok) throw new Error("expected apply to fail");
  expect(applied.phase).toBe("post_apply");
  expect(applied.receipt.status).toBe("failed_validate_rolled_back");
  expect(applied.receipt.evidence.rolled_back).toBe(true);
  expect(readFileSync(join(sourceRoot, "src/app/page.ts"), "utf8")).toBe(
    "export const title = 'before';\n",
  );
});

function seedSource(root: string): void {
  mkdirSync(join(root, "src/app"), { recursive: true });
  mkdirSync(join(root, "src/framework"), { recursive: true });
  writeFileSync(join(root, "src/app/page.ts"), "export const title = 'before';\n");
  writeFileSync(join(root, "src/framework/bridge.ts"), "export const internal = 'stable';\n");
  writeFileSync(join(root, "package.json"), "{\"type\":\"module\"}\n");
}

function manifestFixture(opts?: { postApplyCommand?: string }): ScaffoldProjectManifest {
  return {
    schema_version: 1,
    scaffold_id: "simple-bun-ts",
    version: "0.1.0",
    display_name: "Simple Bun TS",
    materialization: {
      strategy: "copy",
      source_roots: ["src"],
      exclude: ["node_modules", ".env", ".pneuma"],
    },
    artifact_boundary: {
      writable_roots: ["src/app"],
      protected_paths: ["src/framework", "pneuma.scaffold.json"],
      generated_roots: ["src/app"],
      share_include: ["src/app", "package.json"],
      share_exclude: [".env", "node_modules", ".pneuma"],
    },
    agent_contract: {
      allowed_tasks: ["Modify app files inside src/app."],
      forbidden_tasks: ["Modify framework bridge files."],
      system_prompt_fragments: ["Only edit src/app."],
      tool_policy: "draft-workspace-only",
    },
    guardrails: {
      pre_proposal: [
        {
          id: "typecheck",
          kind: "command",
          command: "bun -e \"console.log('typecheck ok')\"",
          description: "Run a lightweight typecheck.",
        },
        {
          id: "diff",
          kind: "framework",
          framework_check: "diff-computable",
          description: "Compute proposal diff.",
        },
        {
          id: "protected-paths",
          kind: "framework",
          framework_check: "protected-paths-unchanged",
          description: "Ensure protected paths did not change.",
        },
      ],
      pre_apply: [
        {
          id: "base-snapshot",
          kind: "framework",
          framework_check: "base-snapshot-unchanged",
          description: "Ensure source did not change after approval evidence was produced.",
        },
      ],
      post_apply: [
        {
          id: "smoke",
          kind: "command",
          command: opts?.postApplyCommand ?? "bun -e \"console.log('preview ok')\"",
          description: "Run post-apply smoke check.",
        },
      ],
    },
    lifecycle: {
      preview: { command: "bun run dev" },
      build: { command: "bun run build" },
      test: [{ command: "bun test" }],
    },
    evidence: {
      diff: true,
      checks: true,
      changed_files: true,
    },
  };
}
