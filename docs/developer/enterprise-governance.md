# Enterprise Governance

**Audience:** Developers building Creation Hosts with multi-person Builder + Agent change control  
**Chinese version:** [enterprise-governance.zh-CN.md](./enterprise-governance.zh-CN.md)

Enterprise Governance is the minimum framework vocabulary for routing a Build Change through human responsibility before publish.

It is not an IAM system, workflow engine, notification product, or audit backend.

## Where It Fits

```text
Builder intent
  -> BuildThread proposal
  -> Build Change Review Packet
  -> BuildChangeGovernancePolicy
  -> BuildChangeGovernanceDecision
  -> Build Assurance readiness
  -> publish / rollback
```

The Creation Host maps real users into framework governance roles. The framework evaluates the route.

## Roles

| Role | Typical Host mapping | Default power |
|---|---|---|
| `builder` | The user asking the Build Agent to change the app. | Can request and propose, but cannot satisfy required review by self-approval. |
| `reviewer` | A teammate responsible for checking normal business changes. | Can approve standard additive/source changes when policy requires reviewer. |
| `owner` | Workspace/app owner. | Can approve high-risk changes such as destructive definition, policy, migration, or credential-boundary changes. |
| `operator` | Runtime/release operator. | Can inspect and operate releases, but cannot approve business changes by default. |
| `end_user` | Published app user. | No build-time governance power by default. |

## Basic Policy

```ts
import {
  evaluateBuildChangeGovernance,
  type BuildChangeGovernancePolicy,
} from "@pneuma-framework/core";

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
```

The framework does not authenticate `user:bob`. Your Host does that and passes stable subject refs into the framework contract.

## Evaluate A Change

```ts
const decision = evaluateBuildChangeGovernance(policy, {
  app_id: "dev-board",
  build_change_id: "change-1",
  builder_subject: "user:bob",
  risks: ["source_code_change"],
  evidence_refs: [
    { kind: "build_thread_turn", thread_id: "thread-1", turn_id: "proposal-1" },
  ],
  decisions: [
    { subject: "user:rachel", decision: "approved", decided_at_ms: Date.now() },
  ],
});

if (!decision.allowed) {
  // Keep publish blocked and show decision.reason_code / missing_roles.
}
```

Important rules:

- Builder self-approval is ignored for required review.
- Any denial blocks the route.
- High-risk changes should route to owner-level approval.
- Operator approval does not satisfy business change review unless the Host explicitly assigns an approving role.

## Gate Build Assurance

Pass the governance decision into Build Assurance:

```ts
import { assessBuildChangeReadiness } from "@pneuma-framework/core";

const assessment = assessBuildChangeReadiness({
  intent_status: "clear",
  proposal_status: "proposed",
  approval_status: "approved",
  execution_status: "applied",
  risks: ["source_code_change"],
  checks: [
    { id: "smoke", phase: "post_apply", status: "passed", message: "Preview works." },
  ],
  release_checks: [
    { name: "health", status: "passed", at_ms: Date.now() },
  ],
  evidence_refs: [
    { kind: "host_check", check_id: "smoke", status: "passed" },
  ],
  governance: {
    required: true,
    decision,
  },
});
```

If `governance.required` is true and `decision.allowed` is not true, readiness becomes:

```text
blocked
blocking_reasons: ["governance_approval_missing"]
```

This keeps a Host from accidentally publishing a technically healthy change that did not pass enterprise review.

## Provider Pressure Baseline

For the RC 0.3.0 demo, use:

```text
GitHub public-read + mock Linear
```

Provider data should appear as app content or evidence. The Build Agent should work against capability contracts, not provider-specific branches such as "if GitHub then do this, if Linear then do that."

## Host Responsibilities

The Host still owns:

- login and identity mapping;
- team/org directory;
- reviewer assignment UI;
- notifications;
- audit retention/export;
- provider credentials and SDKs;
- production policy authoring;
- operator runbooks.

The framework only provides the generic route decision and readiness integration.

## Recommended Product Flow

```text
1. Builder requests a change.
2. Build Agent proposes a change and the Host creates a review packet.
3. Host evaluates which governance route applies.
4. Reviewer or Owner approves/denies.
5. Host passes the decision to Build Assurance.
6. Publish remains blocked until checks and governance pass.
7. Owner/Operator can inspect evidence and rollback/recover when needed.
```

This is the smallest product loop that makes AI-assisted app evolution accountable enough for enterprise discussion.
