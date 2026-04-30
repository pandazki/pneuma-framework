import { describe, expect, test } from "bun:test";
import { PolicySet, Resources, Subjects } from "../../src/aggregates/policy-set.js";
import { PolicyEvaluator } from "../../src/services/policy-evaluator.js";
import { buildRootContext } from "../../src/value-objects/permission-context.js";

const APP = "policy-evaluator-explain";

function userContext(id: string, roles: readonly string[] = []) {
  return buildRootContext({
    app_id: APP,
    invoked_via: "ui",
    user: { id, attrs: {}, roles },
  });
}

describe("PolicyEvaluator · explain", () => {
  test("explicit deny wins over explicit allow independent of rule order", () => {
    const policy = new PolicySet({
      app_id: APP,
      default_posture: { app: "restricted" },
    });
    policy.addRule({
      id: "allow-reviewers",
      allow: [Subjects.role("reviewer")],
      do: ["read"],
      on: Resources.view("review_queue"),
    });
    policy.addRule({
      id: "deny-contractors",
      effect: "deny",
      allow: [Subjects.role("contractor")],
      do: ["read"],
      on: Resources.view("review_queue"),
    });
    const evaluator = new PolicyEvaluator(policy.compile());

    expect(
      evaluator.explain(
        "read",
        Resources.view("review_queue"),
        userContext("alice", ["reviewer", "contractor"]),
      ),
    ).toEqual({
      decision: "deny",
      reason: "explicit-deny",
      matched_rule_ids: ["deny-contractors"],
      default_posture: "restricted",
      action: "read",
      resource: Resources.view("review_queue"),
    });
  });

  test("explicit allow wins only when no deny rule matches", () => {
    const policy = new PolicySet({
      app_id: APP,
      default_posture: { app: "restricted" },
    });
    policy.addRule({
      id: "deny-contractors",
      effect: "deny",
      allow: [Subjects.role("contractor")],
      do: ["read"],
      on: Resources.view("review_queue"),
    });
    policy.addRule({
      id: "allow-reviewers",
      allow: [Subjects.role("reviewer")],
      do: ["read"],
      on: Resources.view("review_queue"),
    });
    const evaluator = new PolicyEvaluator(policy.compile());

    expect(
      evaluator.explain(
        "read",
        Resources.view("review_queue"),
        userContext("alice", ["reviewer"]),
      ),
    ).toMatchObject({
      decision: "allow",
      reason: "explicit-allow",
      matched_rule_ids: ["allow-reviewers"],
    });
  });

  test("returns explicit-allow explanation with matched rule ids from the same evaluator semantics", () => {
    const policy = new PolicySet({
      app_id: APP,
      default_posture: { app: "restricted" },
    });
    policy.addRule({
      id: "alice-can-read-review-queue",
      allow: [Subjects.user("alice")],
      do: ["read"],
      on: Resources.view("review_queue"),
    });
    policy.addRule({
      id: "reviewers-can-read-review-queue",
      allow: [Subjects.role("reviewer")],
      do: ["read"],
      on: Resources.view("review_queue"),
    });
    const evaluator = new PolicyEvaluator(policy.compile());
    const ctx = userContext("alice", ["reviewer"]);

    const decision = evaluator.check("read", Resources.view("review_queue"), ctx);
    const explanation = evaluator.explain("read", Resources.view("review_queue"), ctx);

    expect(explanation).toMatchObject(decision);
    expect(explanation).toEqual({
      decision: "allow",
      reason: "explicit-allow",
      matched_rule_ids: [
        "alice-can-read-review-queue",
        "reviewers-can-read-review-queue",
      ],
      default_posture: "restricted",
      action: "read",
      resource: Resources.view("review_queue"),
    });
  });

  test("returns default-restricted-no-match explanation without explicit deny semantics", () => {
    const policy = new PolicySet({
      app_id: APP,
      default_posture: { app: "restricted" },
    });
    policy.addRule({
      id: "alice-can-read-review-queue",
      allow: [Subjects.user("alice")],
      do: ["read"],
      on: Resources.view("review_queue"),
    });
    const evaluator = new PolicyEvaluator(policy.compile());

    const explanation = evaluator.explain(
      "read",
      Resources.view("review_queue"),
      userContext("bob"),
    );

    expect(explanation).toEqual({
      decision: "deny",
      reason: "default-restricted-no-match",
      matched_rule_ids: [],
      default_posture: "restricted",
      action: "read",
      resource: Resources.view("review_queue"),
    });
    expect(explanation.reason).not.toBe("explicit-deny");
  });

  test("returns default-public explanation when no rule matches a public app", () => {
    const policy = new PolicySet({ app_id: APP });
    const evaluator = new PolicyEvaluator(policy.compile());

    expect(
      evaluator.explain("read", Resources.view("public_view"), userContext("bob")),
    ).toEqual({
      decision: "allow",
      reason: "default-public",
      matched_rule_ids: [],
      default_posture: "public",
      action: "read",
      resource: Resources.view("public_view"),
    });
  });
});
