import { expect, test } from "bun:test";
import {
  createBuildChangeReviewPacket,
  formatBuildChangeApprovalStatement,
  validateBuildChangeReviewPacket,
  type BuildChangeReviewPacket,
} from "../src/index.js";

test("creates a single-intent approval packet from proposal evidence", () => {
  const packet = createBuildChangeReviewPacket({
    build_change_id: "team-knowledge-inbox-v1-priority-queue",
    app_id: "team-knowledge-inbox",
    thread_id: "thread-priority",
    builder_subject: "user:builder-alice",
    intent_summary: "Add a Priority Queue for urgent inbox items.",
    scope_boundary: "Additive inbox definition only; no data deletion, no credential change, no release promotion.",
    proposed_changes: [
      {
        kind: "definition",
        title: "Add priority field",
        summary: "Add a priority column to inbox_items.",
      },
      {
        kind: "definition",
        title: "Add priority queue operation",
        summary: "Expose a read-only operation sorted by priority.",
      },
    ],
    risk_classification: ["definition_additive"],
    pre_proposal_checks: [
      {
        id: "proposal-ready",
        phase: "pre_proposal",
        status: "passed",
        message: "Proposal was generated as one governed change-set.",
      },
    ],
    evidence_refs: [
      { kind: "build_thread_turn", thread_id: "thread-priority", turn_id: "proposal-1" },
      { kind: "host_check", check_id: "proposal-ready", status: "passed" },
    ],
    recovery_plan: {
      strategy: "discard_unapplied_draft",
      summary: "Before approval, deny the proposal and discard the v1 draft.",
    },
    migration_mode: "none",
  });

  expect(validateBuildChangeReviewPacket(packet)).toEqual({ ok: true });
  expect(packet.approval_statement).toBe(
    "Approve one Builder intent: Add a Priority Queue for urgent inbox items. Scope: Additive inbox definition only; no data deletion, no credential change, no release promotion.",
  );
  expect(formatBuildChangeApprovalStatement(packet)).toBe(packet.approval_statement);
});

test("blocks review packets with failed pre-proposal checks", () => {
  const invalid = packetFor({
    pre_proposal_checks: [
      {
        id: "tests",
        phase: "pre_proposal",
        status: "failed",
        message: "Tests failed before proposal.",
      },
    ],
  });

  expect(validateBuildChangeReviewPacket(invalid)).toEqual({
    ok: false,
    issues: [
      {
        path: "pre_proposal_checks[0]",
        message: "pre-proposal check tests must pass before approval",
      },
    ],
  });
});

test("requires destructive disclosure and recovery strategy for destructive review packets", () => {
  const invalid = packetFor({
    risk_classification: ["destructive_definition"],
    proposed_changes: [
      {
        kind: "definition",
        title: "Remove source column",
        summary: "Remove the source column from inbox_items.",
      },
    ],
    recovery_plan: {
      strategy: "none_required",
      summary: "No recovery needed.",
    },
  });

  expect(validateBuildChangeReviewPacket(invalid)).toEqual({
    ok: false,
    issues: [
      {
        path: "proposed_changes",
        message: "destructive_definition risk requires at least one destructive proposed change",
      },
      {
        path: "recovery_plan.strategy",
        message: "destructive changes require a non-empty recovery strategy",
      },
    ],
  });
});

test("requires migration mode when the packet carries data migration risk", () => {
  const invalid = packetFor({
    risk_classification: ["data_migration"],
    migration_mode: "none",
  });

  expect(validateBuildChangeReviewPacket(invalid)).toEqual({
    ok: false,
    issues: [
      {
        path: "migration_mode",
        message: "data_migration risk requires an explicit non-none migration mode",
      },
    ],
  });
});

function packetFor(overrides: Partial<BuildChangeReviewPacket>): BuildChangeReviewPacket {
  return {
    build_change_id: "change-1",
    app_id: "app-1",
    thread_id: "thread-1",
    builder_subject: "user:bob",
    intent_summary: "Add a visible priority queue.",
    scope_boundary: "Additive definition only.",
    proposed_changes: [
      {
        kind: "definition",
        title: "Add priority field",
        summary: "Add a priority column.",
      },
    ],
    risk_classification: ["definition_additive"],
    pre_proposal_checks: [
      {
        id: "proposal-ready",
        phase: "pre_proposal",
        status: "passed",
        message: "Proposal ready.",
      },
    ],
    evidence_refs: [{ kind: "host_check", check_id: "proposal-ready", status: "passed" }],
    recovery_plan: {
      strategy: "discard_unapplied_draft",
      summary: "Deny before apply.",
    },
    migration_mode: "none",
    approval_statement: "Approve one Builder intent: Add a visible priority queue. Scope: Additive definition only.",
    ...overrides,
  };
}

