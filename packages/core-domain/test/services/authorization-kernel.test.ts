import { expect, test } from "bun:test";
import {
  AuthorizationKernel,
  type ApprovalToken,
  type AuthorizationContext,
  type Principal,
} from "../../src/index.js";

const appContext: AuthorizationContext = {
  workspace_id: "workspace-a",
  app_id: "app-a",
  target: { kind: "definition", id: "add-tags" },
};

const builder: Principal = { kind: "builder", id: "builder-a" };
const otherBuilder: Principal = { kind: "builder", id: "builder-b" };
const buildAgent: Principal = {
  kind: "build_agent",
  id: "opencode",
  acting_for: { kind: "builder", id: "builder-a" },
};
const framework: Principal = { kind: "framework_system", id: "framework" };
const reviewer: Principal = { kind: "end_user", id: "reviewer-a", roles: ["reviewer"] };
const guest: Principal = { kind: "end_user", id: "guest-a", roles: [] };
const runtimeAgent: Principal = { kind: "runtime_agent", id: "runtime-agent-a" };

function approvalToken(overrides: Partial<ApprovalToken> = {}): ApprovalToken {
  return {
    token_id: "approval-1",
    approved_by: { kind: "builder", id: "builder-a" },
    approved_capability: "definition:apply",
    workspace_id: "workspace-a",
    app_id: "app-a",
    target_fingerprint: "definition:add-tags",
    issued_at_ms: 10,
    expires_at_ms: 1000,
    single_use: true,
    ...overrides,
  };
}

test("build_agent can propose definition changes", () => {
  const kernel = new AuthorizationKernel();

  const decision = kernel.authorize(buildAgent, "definition:propose", appContext);

  expect(decision).toMatchObject({
    decision: "allow",
    reason_code: "allowed",
    principal: { kind: "build_agent" },
    capability: "definition:propose",
  });
});

test("build_agent can validate rollback impact", () => {
  const kernel = new AuthorizationKernel();

  const decision = kernel.authorize(buildAgent, "definition:rollback:validate", {
    ...appContext,
    target: { kind: "rollback_target", id: "v1" },
  });

  expect(decision.decision).toBe("allow");
  expect(decision.reason_code).toBe("allowed");
});

test("build_agent cannot apply definition changes without builder approval", () => {
  const kernel = new AuthorizationKernel();

  const decision = kernel.authorize(buildAgent, "definition:apply", appContext);

  expect(decision).toMatchObject({
    decision: "deny",
    reason_code: "approval_required",
    principal: { kind: "build_agent" },
    capability: "definition:apply",
  });
});

test("build_agent cannot spend a builder approval token directly", () => {
  const kernel = new AuthorizationKernel();

  const decision = kernel.authorize(buildAgent, "definition:apply", {
    ...appContext,
    approval_token: approvalToken(),
    target_fingerprint: "definition:add-tags",
  });

  expect(decision).toMatchObject({
    decision: "deny",
    reason_code: "principal_not_allowed",
  });
});

test("build_agent cannot mutate policy without builder approval", () => {
  const kernel = new AuthorizationKernel();

  const decision = kernel.authorize(buildAgent, "policy:mutate", {
    ...appContext,
    target: { kind: "policy_rule", id: "reviewers-can-read" },
  });

  expect(decision).toMatchObject({
    decision: "deny",
    reason_code: "approval_required",
    capability: "policy:mutate",
  });
});

test("builder can approve definition apply in owned workspace", () => {
  const kernel = new AuthorizationKernel({
    builderWorkspaceAccess: (principal, ctx) =>
      principal.id === "builder-a" && ctx.workspace_id === "workspace-a" && ctx.app_id === "app-a",
  });

  const decision = kernel.authorize(builder, "definition:approve", appContext);

  expect(decision.decision).toBe("allow");
  expect(decision.reason_code).toBe("allowed");
});

test("builder cannot approve definition apply in another workspace", () => {
  const kernel = new AuthorizationKernel({
    builderWorkspaceAccess: (principal, ctx) =>
      principal.id === "builder-a" && ctx.workspace_id === "workspace-a" && ctx.app_id === "app-a",
  });

  const decision = kernel.authorize(otherBuilder, "definition:approve", appContext);

  expect(decision).toMatchObject({
    decision: "deny",
    reason_code: "workspace_mismatch",
  });
});

test("framework_system can execute definition apply with a valid approval token", () => {
  const kernel = new AuthorizationKernel();

  const decision = kernel.authorize(framework, "definition:apply", {
    ...appContext,
    approval_token: approvalToken(),
    target_fingerprint: "definition:add-tags",
    now_ms: 50,
  });

  expect(decision.decision).toBe("allow");
  expect(decision.reason_code).toBe("allowed");
});

test("framework_system can mutate policy with a valid approval token", () => {
  const kernel = new AuthorizationKernel();

  const decision = kernel.authorize(framework, "policy:mutate", {
    ...appContext,
    approval_token: approvalToken({
      approved_capability: "policy:mutate",
      target_fingerprint: "policy:reviewers-can-read",
    }),
    target: { kind: "policy_rule", id: "reviewers-can-read" },
    target_fingerprint: "policy:reviewers-can-read",
    now_ms: 50,
  });

  expect(decision.decision).toBe("allow");
  expect(decision.reason_code).toBe("allowed");
});

test("framework_system cannot execute definition apply with a mismatched approval token", () => {
  const kernel = new AuthorizationKernel();

  const decision = kernel.authorize(framework, "definition:apply", {
    ...appContext,
    approval_token: approvalToken({ target_fingerprint: "definition:other-change" }),
    target_fingerprint: "definition:add-tags",
    now_ms: 50,
  });

  expect(decision).toMatchObject({
    decision: "deny",
    reason_code: "approval_target_mismatch",
  });
});

test("framework_system cannot reuse a single-use approval token", () => {
  const kernel = new AuthorizationKernel();
  const token = approvalToken();
  const context = {
    ...appContext,
    approval_token: token,
    target_fingerprint: "definition:add-tags",
    now_ms: 50,
  };

  expect(kernel.authorize(framework, "definition:apply", context).decision).toBe("allow");
  const second = kernel.authorize(framework, "definition:apply", context);

  expect(second).toMatchObject({
    decision: "deny",
    reason_code: "approval_already_used",
  });
});

test("developer extension can add a static enterprise approver principal", () => {
  const kernel = new AuthorizationKernel({
    extensionRules: [
      {
        principal: { kind: "extension", id: "enterprise_admin" },
        capabilities: ["policy:approve"],
      },
    ],
  });

  const decision = kernel.authorize({ kind: "extension", id: "enterprise_admin" }, "policy:approve", appContext);

  expect(decision.decision).toBe("allow");
});

test("developer extension cannot override build_agent direct-apply invariant", () => {
  const kernel = new AuthorizationKernel({
    extensionRules: [
      {
        principal: { kind: "build_agent", id: "opencode" },
        capabilities: ["definition:apply"],
      },
    ],
  });

  const decision = kernel.authorize(buildAgent, "definition:apply", {
    ...appContext,
    approval_token: approvalToken(),
    target_fingerprint: "definition:add-tags",
  });

  expect(decision).toMatchObject({
    decision: "deny",
    reason_code: "principal_not_allowed",
  });
});

test("reviewer can defer view read to app policy", () => {
  const kernel = new AuthorizationKernel();

  const decision = kernel.authorize(reviewer, "view:read", {
    ...appContext,
    target: { kind: "view", id: "review_queue" },
  });

  expect(decision).toMatchObject({
    decision: "defer",
    reason_code: "defer_to_app_policy",
  });
});

test("reviewer cannot mutate app definition", () => {
  const kernel = new AuthorizationKernel();

  const decision = kernel.authorize(reviewer, "definition:apply", appContext);

  expect(decision).toMatchObject({
    decision: "deny",
    reason_code: "principal_not_allowed",
  });
});

test("guest cannot mutate app definition", () => {
  const kernel = new AuthorizationKernel();

  const decision = kernel.authorize(guest, "definition:apply", appContext);

  expect(decision).toMatchObject({
    decision: "deny",
    reason_code: "principal_not_allowed",
  });
});

test("runtime_agent cannot mutate app definition in this slice", () => {
  const kernel = new AuthorizationKernel();

  const decision = kernel.authorize(runtimeAgent, "definition:apply", appContext);

  expect(decision).toMatchObject({
    decision: "deny",
    reason_code: "principal_not_allowed",
  });
});

test("denial includes stable reason code, principal, and capability", () => {
  const kernel = new AuthorizationKernel();

  const decision = kernel.authorize(buildAgent, "definition:apply", appContext);

  expect(decision).toMatchObject({
    decision: "deny",
    reason_code: "approval_required",
    principal: buildAgent,
    capability: "definition:apply",
  });
  expect("message" in decision).toBe(true);
});
