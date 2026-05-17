import { describe, expect, test } from "bun:test";
import {
  evaluateHostKitApproval,
  type HostKitApprovalInput,
} from "../src/index.js";

const input: Omit<HostKitApprovalInput, "decisions"> = {
  app_id: "team-notes",
  build_change_id: "change-review-queue",
  builder_subject: "user:bob",
  risks: ["source_code_change", "data_migration"],
  evidence_refs: [{ kind: "host_check", check_id: "diff", status: "passed" }],
  policy: {
    policy_id: "team-notes-governance",
    app_id: "team-notes",
    role_assignments: [
      { subject: "user:bob", role: "builder" },
      { subject: "user:alice", role: "reviewer" },
    ],
    routes: [
      {
        route_id: "source-and-data-review",
        risks: ["source_code_change", "data_migration"],
        required_roles: ["reviewer"],
      },
    ],
  },
};

describe("host-kit approval", () => {
  test("builder self approval does not satisfy reviewer route", () => {
    const result = evaluateHostKitApproval({
      ...input,
      decisions: [
        {
          subject: "user:bob",
          decision: "approved",
          decided_at_ms: 1,
        },
      ],
    });

    expect(result.allowed).toBe(false);
    expect(result.reason_code).toBe("missing-required-approval");
    expect(result.missing_roles).toEqual(["reviewer"]);
  });

  test("reviewer approval satisfies the route", () => {
    const result = evaluateHostKitApproval({
      ...input,
      decisions: [
        {
          subject: "user:alice",
          decision: "approved",
          decided_at_ms: 1,
        },
      ],
    });

    expect(result.allowed).toBe(true);
    expect(result.satisfied_by_subjects).toEqual(["user:alice"]);
  });

  test("builder approval satisfies an explicit builder confirmation route", () => {
    const result = evaluateHostKitApproval({
      ...input,
      policy: {
        ...input.policy,
        routes: [
          {
            route_id: "builder-confirmation",
            risks: ["source_code_change", "data_migration"],
            required_roles: ["builder"],
          },
        ],
      },
      decisions: [
        {
          subject: "user:bob",
          decision: "approved",
          decided_at_ms: 1,
        },
      ],
    });

    expect(result.allowed).toBe(true);
    expect(result.satisfied_by_subjects).toEqual(["user:bob"]);
  });
});
