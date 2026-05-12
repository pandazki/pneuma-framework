import { describe, expect, test } from "bun:test";
import { evaluateBuildChangeGovernance } from "../../packages/core/src/index.js";
import { fetchGitHubPublicAttention } from "./providers/github-public.js";
import { fetchLinearMockAttention } from "./providers/linear-mock.js";
import { buildGovernancePolicy, buildGovernanceRequest } from "./governance.js";

describe("m43 provider pressure", () => {
  test("mock Linear provider exposes real-shaped planning issues", async () => {
    const issues = await fetchLinearMockAttention();

    expect(issues[0]).toMatchObject({
      provider: "linear",
      workspace: "acme-eng",
      team: "platform",
      status: "In Progress",
    });
  });

  test("GitHub public provider normalizes public-read attention items", async () => {
    const items = await fetchGitHubPublicAttention({ owner: "pandazki", limit: 3 });

    expect(items.length).toBeGreaterThan(0);
    expect(items[0]).toHaveProperty("provider", "github");
    expect(items[0]).toHaveProperty("url");
  });
});

describe("m43 governance route", () => {
  test("reviewer approval allows a source-code dev board proposal", () => {
    const decision = evaluateBuildChangeGovernance(
      buildGovernancePolicy(),
      buildGovernanceRequest({
        builder_subject: "user:bob",
        decisions: [{ subject: "user:rachel", decision: "approved", decided_at_ms: 1 }],
        risks: ["source_code_change"],
      }),
    );

    expect(decision).toMatchObject({
      allowed: true,
      route_id: "reviewer-for-standard-change",
    });
  });

  test("builder self-approval is denied in the demo route", () => {
    const decision = evaluateBuildChangeGovernance(
      buildGovernancePolicy(),
      buildGovernanceRequest({
        builder_subject: "user:bob",
        decisions: [{ subject: "user:bob", decision: "approved", decided_at_ms: 1 }],
        risks: ["source_code_change"],
      }),
    );

    expect(decision).toMatchObject({
      allowed: false,
      missing_roles: ["reviewer"],
    });
  });
});
