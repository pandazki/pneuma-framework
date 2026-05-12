import { describe, expect, test } from "bun:test";
import {
  evaluateBuildChangeGovernance,
  validateBuildChangeGovernancePolicy,
  type BuildChangeGovernancePolicy,
  type BuildChangeGovernanceRequest,
} from "../src/enterprise-governance.js";

const policy: BuildChangeGovernancePolicy = {
  policy_id: "enterprise-minimum",
  app_id: "dev-board",
  role_assignments: [
    { subject: "user:bob", role: "builder" },
    { subject: "user:rachel", role: "reviewer" },
    { subject: "user:olivia", role: "owner" },
    { subject: "user:otto", role: "operator" },
  ],
  routes: [
    {
      route_id: "default-reviewer",
      risks: ["definition_additive", "source_code_change"],
      required_roles: ["reviewer"],
    },
    {
      route_id: "owner-for-high-risk",
      risks: ["destructive_definition", "policy_change", "data_migration", "credential_boundary"],
      required_roles: ["owner"],
    },
  ],
};

describe("enterprise governance policy", () => {
  test("validates the minimum role policy", () => {
    expect(validateBuildChangeGovernancePolicy(policy).ok).toBe(true);
  });

  test("routes additive source changes to reviewer approval", () => {
    const request: BuildChangeGovernanceRequest = {
      app_id: "dev-board",
      build_change_id: "change-1",
      builder_subject: "user:bob",
      risks: ["source_code_change"],
      evidence_refs: [{ kind: "build_thread_turn", thread_id: "thread-1", turn_id: "proposal-1" }],
      decisions: [{ subject: "user:rachel", decision: "approved", decided_at_ms: 1 }],
    };

    expect(evaluateBuildChangeGovernance(policy, request)).toMatchObject({
      allowed: true,
      route_id: "default-reviewer",
      required_roles: ["reviewer"],
      satisfied_by_subjects: ["user:rachel"],
      reason_code: "required-approvals-satisfied",
    });
  });

  test("blocks self approval when builder is also the decision maker", () => {
    const request: BuildChangeGovernanceRequest = {
      app_id: "dev-board",
      build_change_id: "change-2",
      builder_subject: "user:bob",
      risks: ["source_code_change"],
      evidence_refs: [{ kind: "build_thread_turn", thread_id: "thread-1", turn_id: "proposal-2" }],
      decisions: [{ subject: "user:bob", decision: "approved", decided_at_ms: 1 }],
    };

    expect(evaluateBuildChangeGovernance(policy, request)).toMatchObject({
      allowed: false,
      reason_code: "missing-required-approval",
      missing_roles: ["reviewer"],
    });
  });

  test("requires owner for destructive definition changes", () => {
    const request: BuildChangeGovernanceRequest = {
      app_id: "dev-board",
      build_change_id: "change-3",
      builder_subject: "user:bob",
      risks: ["destructive_definition"],
      evidence_refs: [{ kind: "host_check", check_id: "impact", status: "passed" }],
      decisions: [{ subject: "user:rachel", decision: "approved", decided_at_ms: 1 }],
    };

    expect(evaluateBuildChangeGovernance(policy, request)).toMatchObject({
      allowed: false,
      route_id: "owner-for-high-risk",
      missing_roles: ["owner"],
    });
  });

  test("operator cannot approve business change by default", () => {
    const request: BuildChangeGovernanceRequest = {
      app_id: "dev-board",
      build_change_id: "change-4",
      builder_subject: "user:bob",
      risks: ["source_code_change"],
      evidence_refs: [{ kind: "host_check", check_id: "review", status: "passed" }],
      decisions: [{ subject: "user:otto", decision: "approved", decided_at_ms: 1 }],
    };

    expect(evaluateBuildChangeGovernance(policy, request)).toMatchObject({
      allowed: false,
      missing_roles: ["reviewer"],
    });
  });

  test("owner approval satisfies high-risk route", () => {
    const request: BuildChangeGovernanceRequest = {
      app_id: "dev-board",
      build_change_id: "change-5",
      builder_subject: "user:bob",
      risks: ["policy_change"],
      evidence_refs: [{ kind: "host_check", check_id: "policy-impact", status: "passed" }],
      decisions: [{ subject: "user:olivia", decision: "approved", decided_at_ms: 1 }],
    };

    expect(evaluateBuildChangeGovernance(policy, request)).toMatchObject({
      allowed: true,
      route_id: "owner-for-high-risk",
      required_roles: ["owner"],
      satisfied_by_subjects: ["user:olivia"],
    });
  });

  test("explicit denial blocks even when another approver allows", () => {
    const request: BuildChangeGovernanceRequest = {
      app_id: "dev-board",
      build_change_id: "change-6",
      builder_subject: "user:bob",
      risks: ["source_code_change"],
      evidence_refs: [{ kind: "host_check", check_id: "review", status: "passed" }],
      decisions: [
        { subject: "user:rachel", decision: "approved", decided_at_ms: 1 },
        { subject: "user:olivia", decision: "denied", reason: "scope too broad", decided_at_ms: 2 },
      ],
    };

    expect(evaluateBuildChangeGovernance(policy, request)).toMatchObject({
      allowed: false,
      reason_code: "denied",
    });
  });
});
