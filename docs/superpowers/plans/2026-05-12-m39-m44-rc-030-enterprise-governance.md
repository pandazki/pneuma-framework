# RC 0.3.0 Enterprise Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reach `pneuma-rc-0.3.0` by proving a minimum enterprise-governed Builder + Build Agent change flow: roles, responsibility, review packet, approval routing, evidence, publish gate, rollback/recovery, and one real external provider pressure path.

**Architecture:** Keep the four-layer model explicit: `pneuma-framework -> Creation Host -> Generated Application -> Published Application`. The framework owns generic governance vocabulary, evaluation, validation, evidence references, and adoption guidance; the Creation Host owns product UX, identity provider integration, credential vaulting, real provider adapters, and deployment product choices.

**Tech Stack:** Bun workspaces, TypeScript, `bun:test`, existing `@pneuma-framework/core` modules, Markdown docs, one reference example using GitHub public-read data and a mock Linear provider.

---

## 0.3.0 Release Thesis

`pneuma-rc-0.2.0` proves a fresh downstream Creation Host can consume the developer-facing framework packages and adopt the post-RC utility surface.

`pneuma-rc-0.3.0` should prove a narrower enterprise claim:

```text
An AI-assisted business-function change can move through a minimum enterprise governance loop:

Builder intent
  -> Build Agent proposal
  -> review packet + assurance case
  -> role-based approval route
  -> governed execution
  -> verification / publish gate
  -> rollback or recovery evidence
```

This is not production IAM, hosted compliance retention, marketplace artifact trust, or a complete enterprise SaaS product.

## Starting Point

M39 setup has already happened before this plan was written:

- `pneuma-rc-0.2.0` tag exists at `7e03d5e`.
- New branch/worktree exists:
  - branch: `codex/m40-enterprise-governance`
  - path: `/Users/pandazki/.codex/worktrees/m40-enterprise-governance/pneuma-framework`
- Baseline verification passed in the new worktree:
  - `bun run typecheck`
  - `bun run test:package-consumption`

The remaining plan starts from M40.

## Provider Pressure Baseline

0.3.0 must not be mock-only.

Minimum provider shape:

```text
GitHub: real public-read provider
  -> public profile / repo / issue / pull request / workflow-like evidence when available
  -> no OAuth required for the minimum slice
  -> OAuth can remain optional provider pressure

Linear: mock provider shaped like real Linear
  -> workspace / team / project / issue / status / assignee
  -> deterministic fixture data
  -> validates provider capability contracts without requiring real Linear auth
```

The Build Agent and governance model must see capability contracts, not provider-special-case branches.

## File Structure

- Create `docs/architecture/spec/production-readiness-boundary.md` and `.zh-CN.md`: durable architecture review for the minimum production boundary.
- Create `docs/architecture/spec/enterprise-governance-domain-review.md` and `.zh-CN.md`: DDD vocabulary for roles, approval routes, responsibility, and enterprise governance claims.
- Create `packages/core/src/enterprise-governance.ts`: generic governance policy, request, decision, and route evaluation helpers.
- Create `packages/core/test/enterprise-governance.test.ts`: tests for role assignment, risk-based approval routing, self-approval blocking, owner override, operator limitations, and evidence requirements.
- Modify `packages/core/src/build-assurance.ts`: add optional governance evidence refs and a readiness helper that can consume an enterprise governance decision.
- Modify `packages/core/test/build-assurance.test.ts`: cover publish blocking when governance decision is missing or denied.
- Modify `packages/core/src/index.ts`: export enterprise governance helpers.
- Create `docs/developer/enterprise-governance.md` and `.zh-CN.md`: Developer adoption guide for minimum enterprise governance.
- Create `examples/m43-enterprise-governance-demo/`: reference demo with role switcher, GitHub public-read provider, mock Linear provider, proposal/review/approval/publish/rollback flow.
- Modify `examples/README.md`: register the new canonical 0.3.0 demo after it is implemented.
- Create milestone snapshots:
  - `docs/architecture/milestone-40-snapshot.md` and `.zh-CN.md`
  - `docs/architecture/milestone-41-snapshot.md` and `.zh-CN.md`
  - `docs/architecture/milestone-42-snapshot.md` and `.zh-CN.md`
  - `docs/architecture/milestone-43-snapshot.md` and `.zh-CN.md`
  - `docs/architecture/release-candidate-0.3.0-snapshot.md` and `.zh-CN.md`
- Modify `docs/architecture/team-share-demo.md` and `.zh-CN.md`: add the 0.3.0 enterprise governance story after implementation.
- Modify `README.md`, `PRODUCT.md`, `docs/developer/start-here.md`, and `.zh-CN.md`: update the canonical entry path after the 0.3.0 gate passes.

## Task 1: M40 Production Readiness Boundary

**Files:**
- Create: `docs/architecture/spec/production-readiness-boundary.md`
- Create: `docs/architecture/spec/production-readiness-boundary.zh-CN.md`
- Modify: `docs/architecture/OPEN-QUESTIONS.md`
- Create: `docs/architecture/milestone-40-snapshot.md`
- Create: `docs/architecture/milestone-40-snapshot.zh-CN.md`

- [ ] **Step 1: Write the English boundary doc**

Create `docs/architecture/spec/production-readiness-boundary.md` with these required sections:

```md
# Production Readiness Boundary

**Status:** RC 0.3.0 planning anchor.
**Date:** 2026-05-12
**Chinese version:** [production-readiness-boundary.zh-CN.md](./production-readiness-boundary.zh-CN.md)

## Purpose

Define the minimum production-facing boundary for a Creation Host that wants to claim enterprise-governed Builder + Build Agent changes.

## Non-Goal

This is not production IAM, hosted secret vaulting, marketplace artifact signing, or zero-downtime deployment.

## Boundary Table

| Concern | Framework must provide | Creation Host must provide | Later enterprise productization | Out of scope for 0.3.0 |
|---|---|---|---|---|
| Identity | Subject reference vocabulary and role assignment contract. | Real auth, SSO, user directory, org mapping. | SCIM, IdP sync, admin console. | Framework-hosted identity. |
| Credential | No-secret refs, rebinding evidence, local/reference utilities. | Secret storage, rotation, refresh, provider account UX. | Vault adapters and retention policy. | Storing raw secrets in framework app data. |
| Approval | Generic approval route evaluation and evidence refs. | Product UI and final policy choices. | Assignment queues, SLA, delegated approval. | A full workflow engine. |
| Audit | Evidence refs and local durable case shape. | Retention/export/storage policy. | Compliance export and legal hold. | Hosted audit backend. |
| Migration | Migration-mode vocabulary and backup/rollback evidence refs. | Actual migration scripts and downtime policy. | Multi-tenant online migration tooling. | 99.99% online migration. |
| Recovery | Recovery readiness vocabulary and drill matrix shape. | Product incident UI and operator playbooks. | Automated repair routing. | Guaranteed cross-store ACID. |
| Provider | Capability contracts and provider-specialization boundaries. | Real provider SDKs and credentials. | Certified provider marketplace. | Provider-specific agent branches. |
```

Also include short scenario notes for:

- agent writes a bug;
- agent deletes a capability unnecessarily;
- builder regrets approval;
- migration needs downtime;
- reviewer denies;
- rollback fails.

- [ ] **Step 2: Write the Chinese boundary doc**

Create `docs/architecture/spec/production-readiness-boundary.zh-CN.md` with equivalent content. Keep framework/Host/productization/out-of-scope terms consistent with the English table.

- [ ] **Step 3: Update open questions**

In `docs/architecture/OPEN-QUESTIONS.md`, add a short section:

```md
## RC 0.3.0 Enterprise Governance

M40 pins the minimum production-readiness boundary for enterprise-governed Builder + Build Agent changes.

Remaining questions:

| Question | Current leaning |
|---|---|
| Which real providers should pressure the 0.3.0 demo? | GitHub public-read plus mock Linear is the minimum. |
| Should Reviewer/Owner/Operator be framework principals or Host identities? | Framework owns role vocabulary and route evaluation; Host maps real identities. |
| Should approval routing become a workflow engine? | No for 0.3.0; keep it as deterministic evaluation plus evidence. |
```

- [ ] **Step 4: Write M40 snapshot**

Create English and Chinese snapshots with:

```md
# Milestone 40 Snapshot: Production Readiness Boundary

**Status:** Closed when the boundary docs are linked and reviewed.

## What Is Proven

- 0.3.0 is scoped to minimum enterprise governance, not full production SaaS.
- Framework/Host/productization/out-of-scope boundaries are explicit.
- Provider pressure baseline is GitHub public-read plus mock Linear.
```

- [ ] **Step 5: Verify docs**

Run:

```bash
git diff --check
node scripts/check-doc-links-if-present.js
```

If `scripts/check-doc-links-if-present.js` does not exist, run this local checker instead:

```bash
node <<'NODE'
const fs = require('fs');
const path = require('path');
const docs = [
  'docs/architecture/spec/production-readiness-boundary.md',
  'docs/architecture/spec/production-readiness-boundary.zh-CN.md',
  'docs/architecture/milestone-40-snapshot.md',
  'docs/architecture/milestone-40-snapshot.zh-CN.md',
];
const root = process.cwd();
const re = /!?\[[^\]]*\]\(([^)]+)\)/g;
const missing = [];
for (const doc of docs) {
  const text = fs.readFileSync(path.join(root, doc), 'utf8');
  for (const m of text.matchAll(re)) {
    let target = m[1].trim();
    if (target.startsWith('http://') || target.startsWith('https://') || target.startsWith('#')) continue;
    target = target.replace(/^<|>$/g, '').split('#')[0];
    if (!target) continue;
    const resolved = path.resolve(path.dirname(path.join(root, doc)), target);
    if (!fs.existsSync(resolved)) missing.push(`${doc} -> ${m[1]}`);
  }
}
if (missing.length) {
  console.error(missing.join('\n'));
  process.exit(1);
}
console.log(`checked ${docs.length} docs`);
NODE
```

- [ ] **Step 6: Commit**

```bash
git add docs/architecture/spec/production-readiness-boundary.md docs/architecture/spec/production-readiness-boundary.zh-CN.md docs/architecture/OPEN-QUESTIONS.md docs/architecture/milestone-40-snapshot.md docs/architecture/milestone-40-snapshot.zh-CN.md
git commit -m "docs: define production readiness boundary for rc 0.3.0"
```

## Task 2: M41 Enterprise Governance Domain Model v0

**Files:**
- Create: `docs/architecture/spec/enterprise-governance-domain-review.md`
- Create: `docs/architecture/spec/enterprise-governance-domain-review.zh-CN.md`
- Create: `packages/core/src/enterprise-governance.ts`
- Create: `packages/core/test/enterprise-governance.test.ts`
- Modify: `packages/core/src/index.ts`
- Create: `docs/architecture/milestone-41-snapshot.md`
- Create: `docs/architecture/milestone-41-snapshot.zh-CN.md`

- [ ] **Step 1: Write failing tests for role vocabulary**

Create `packages/core/test/enterprise-governance.test.ts`:

```ts
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

  test("blocks self approval when builder is also reviewer", () => {
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
});
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
bun test packages/core/test/enterprise-governance.test.ts
```

Expected: fail because `packages/core/src/enterprise-governance.ts` does not exist.

- [ ] **Step 3: Implement minimum types and evaluator**

Create `packages/core/src/enterprise-governance.ts`:

```ts
import type { BuildChangeEvidenceRef, BuildChangeRisk } from "./build-assurance.js";

export type EnterpriseGovernanceRole = "builder" | "reviewer" | "owner" | "operator" | "end_user";

export interface GovernanceRoleAssignment {
  readonly subject: string;
  readonly role: EnterpriseGovernanceRole;
}

export interface BuildChangeGovernanceRoute {
  readonly route_id: string;
  readonly risks: readonly BuildChangeRisk[];
  readonly required_roles: readonly EnterpriseGovernanceRole[];
}

export interface BuildChangeGovernancePolicy {
  readonly policy_id: string;
  readonly app_id: string;
  readonly role_assignments: readonly GovernanceRoleAssignment[];
  readonly routes: readonly BuildChangeGovernanceRoute[];
}

export interface BuildChangeGovernanceDecisionInput {
  readonly subject: string;
  readonly decision: "approved" | "denied";
  readonly reason?: string;
  readonly decided_at_ms: number;
}

export interface BuildChangeGovernanceRequest {
  readonly app_id: string;
  readonly build_change_id: string;
  readonly builder_subject: string;
  readonly risks: readonly BuildChangeRisk[];
  readonly evidence_refs: readonly BuildChangeEvidenceRef[];
  readonly decisions: readonly BuildChangeGovernanceDecisionInput[];
}

export type BuildChangeGovernanceReasonCode =
  | "required-approvals-satisfied"
  | "denied"
  | "missing-required-approval"
  | "invalid-policy"
  | "app-mismatch"
  | "no-matching-route";

export interface BuildChangeGovernanceDecision {
  readonly allowed: boolean;
  readonly reason_code: BuildChangeGovernanceReasonCode;
  readonly route_id?: string;
  readonly required_roles: readonly EnterpriseGovernanceRole[];
  readonly missing_roles: readonly EnterpriseGovernanceRole[];
  readonly satisfied_by_subjects: readonly string[];
  readonly evidence_refs: readonly BuildChangeEvidenceRef[];
}

export function validateBuildChangeGovernancePolicy(
  policy: BuildChangeGovernancePolicy,
): { ok: boolean; issues: readonly string[] } {
  const issues: string[] = [];
  if (!policy.policy_id) issues.push("policy_id.required");
  if (!policy.app_id) issues.push("app_id.required");
  if (new Set(policy.role_assignments.map((assignment) => `${assignment.subject}:${assignment.role}`)).size !== policy.role_assignments.length) {
    issues.push("role_assignments.duplicate");
  }
  for (const route of policy.routes) {
    if (!route.route_id) issues.push("route_id.required");
    if (route.required_roles.length === 0) issues.push("required_roles.required");
  }
  return { ok: issues.length === 0, issues };
}

export function evaluateBuildChangeGovernance(
  policy: BuildChangeGovernancePolicy,
  request: BuildChangeGovernanceRequest,
): BuildChangeGovernanceDecision {
  const validation = validateBuildChangeGovernancePolicy(policy);
  if (!validation.ok) {
    return deny("invalid-policy", [], [], [], request.evidence_refs);
  }
  if (policy.app_id !== request.app_id) {
    return deny("app-mismatch", [], [], [], request.evidence_refs);
  }
  const route = policy.routes.find((candidate) =>
    request.risks.some((risk) => candidate.risks.includes(risk)),
  );
  if (!route) {
    return deny("no-matching-route", [], [], [], request.evidence_refs);
  }
  if (request.decisions.some((decision) => decision.decision === "denied")) {
    return deny("denied", route.required_roles, route.required_roles, [], request.evidence_refs, route.route_id);
  }
  const rolesBySubject = new Map<string, Set<EnterpriseGovernanceRole>>();
  for (const assignment of policy.role_assignments) {
    const roles = rolesBySubject.get(assignment.subject) ?? new Set<EnterpriseGovernanceRole>();
    roles.add(assignment.role);
    rolesBySubject.set(assignment.subject, roles);
  }
  const satisfiedRoles = new Set<EnterpriseGovernanceRole>();
  const satisfiedBy: string[] = [];
  for (const decision of request.decisions.filter((candidate) => candidate.decision === "approved")) {
    if (decision.subject === request.builder_subject) continue;
    const roles = rolesBySubject.get(decision.subject);
    if (!roles) continue;
    for (const requiredRole of route.required_roles) {
      if (roles.has(requiredRole)) {
        satisfiedRoles.add(requiredRole);
        if (!satisfiedBy.includes(decision.subject)) satisfiedBy.push(decision.subject);
      }
    }
  }
  const missing = route.required_roles.filter((role) => !satisfiedRoles.has(role));
  if (missing.length > 0) {
    return deny("missing-required-approval", route.required_roles, missing, satisfiedBy, request.evidence_refs, route.route_id);
  }
  return {
    allowed: true,
    reason_code: "required-approvals-satisfied",
    route_id: route.route_id,
    required_roles: route.required_roles,
    missing_roles: [],
    satisfied_by_subjects: satisfiedBy,
    evidence_refs: request.evidence_refs,
  };
}

function deny(
  reason_code: BuildChangeGovernanceReasonCode,
  required_roles: readonly EnterpriseGovernanceRole[],
  missing_roles: readonly EnterpriseGovernanceRole[],
  satisfied_by_subjects: readonly string[],
  evidence_refs: readonly BuildChangeEvidenceRef[],
  route_id?: string,
): BuildChangeGovernanceDecision {
  return {
    allowed: false,
    reason_code,
    route_id,
    required_roles,
    missing_roles,
    satisfied_by_subjects,
    evidence_refs,
  };
}
```

- [ ] **Step 4: Export and run tests**

Add to `packages/core/src/index.ts`:

```ts
export * from "./enterprise-governance.js";
```

Run:

```bash
bun test packages/core/test/enterprise-governance.test.ts
```

Expected: pass.

- [ ] **Step 5: Write DDD docs**

Create `docs/architecture/spec/enterprise-governance-domain-review.md` and `.zh-CN.md` with:

- top-level non-drift statement;
- role vocabulary;
- aggregate candidates:
  - `EnterpriseGovernancePolicy`
  - `GovernanceRoute`
  - `GovernanceDecision`
  - `GovernanceEvidence`
- integration with BuildThread, Permission Ledger, Build Assurance, Release Rollout;
- explicit non-claims:
  - no hosted IAM;
  - no workflow engine;
  - no compliance backend;
  - no marketplace trust layer.

- [ ] **Step 6: Write M41 snapshot**

Create M41 snapshots stating:

```text
M41 proves the framework can express minimum enterprise role routing for a Build Change without importing Host identity/IAM into core.
```

- [ ] **Step 7: Verify and commit**

Run:

```bash
bun test packages/core/test/enterprise-governance.test.ts
bun run typecheck
git diff --check
```

Commit:

```bash
git add packages/core/src/enterprise-governance.ts packages/core/test/enterprise-governance.test.ts packages/core/src/index.ts docs/architecture/spec/enterprise-governance-domain-review.md docs/architecture/spec/enterprise-governance-domain-review.zh-CN.md docs/architecture/milestone-41-snapshot.md docs/architecture/milestone-41-snapshot.zh-CN.md
git commit -m "feat(core): add enterprise governance route evaluator"
```

## Task 3: M42 Build Assurance Governance Integration

**Files:**
- Modify: `packages/core/src/build-assurance.ts`
- Modify: `packages/core/test/build-assurance.test.ts`
- Modify: `packages/core/src/enterprise-governance.ts`
- Modify: `packages/core/test/enterprise-governance.test.ts`
- Create: `docs/developer/enterprise-governance.md`
- Create: `docs/developer/enterprise-governance.zh-CN.md`
- Create: `docs/architecture/milestone-42-snapshot.md`
- Create: `docs/architecture/milestone-42-snapshot.zh-CN.md`

- [ ] **Step 1: Write failing publish-gate tests**

In `packages/core/test/build-assurance.test.ts`, add:

```ts
import {
  evaluateBuildChangeGovernance,
  type BuildChangeGovernancePolicy,
} from "../src/enterprise-governance.js";

test("build assurance blocks publish when required governance approval is missing", () => {
  const assessment = assessBuildChangeReadiness({
    intent_status: "clear",
    proposal_status: "proposed",
    approval_status: "approved",
    execution_status: "applied",
    risks: ["source_code_change"],
    checks: [{ id: "post-apply", phase: "post_apply", status: "passed", message: "Preview passed." }],
    evidence_refs: [{ kind: "host_check", check_id: "post-apply", status: "passed" }],
    governance: {
      required: true,
      decision: {
        allowed: false,
        reason_code: "missing-required-approval",
        required_roles: ["reviewer"],
        missing_roles: ["reviewer"],
        satisfied_by_subjects: [],
        evidence_refs: [],
      },
    },
  });
  expect(assessment.readiness).toBe("blocked");
  expect(assessment.blockers).toContain("governance_approval_missing");
});

test("build assurance reaches ready_to_publish when governance approval and release checks pass", () => {
  const assessment = assessBuildChangeReadiness({
    intent_status: "clear",
    proposal_status: "proposed",
    approval_status: "approved",
    execution_status: "applied",
    risks: ["source_code_change"],
    checks: [
      { id: "post-apply", phase: "post_apply", status: "passed", message: "Preview passed." },
      { id: "release-health", phase: "release", status: "passed", message: "Release candidate healthy." },
    ],
    evidence_refs: [{ kind: "host_check", check_id: "release-health", status: "passed" }],
    governance: {
      required: true,
      decision: {
        allowed: true,
        reason_code: "required-approvals-satisfied",
        route_id: "default-reviewer",
        required_roles: ["reviewer"],
        missing_roles: [],
        satisfied_by_subjects: ["user:rachel"],
        evidence_refs: [{ kind: "permission_ledger_record", request_id: "approval-1" }],
      },
    },
  });
  expect(assessment.readiness).toBe("ready_to_publish");
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
bun test packages/core/test/build-assurance.test.ts
```

Expected: fail because assessment input does not yet accept governance.

- [ ] **Step 3: Add governance to assurance input**

In `packages/core/src/build-assurance.ts`, extend the assessment input:

```ts
export interface BuildChangeGovernanceAssessment {
  readonly required: boolean;
  readonly decision?: {
    readonly allowed: boolean;
    readonly reason_code: string;
    readonly required_roles: readonly string[];
    readonly missing_roles: readonly string[];
    readonly satisfied_by_subjects: readonly string[];
    readonly evidence_refs: readonly BuildChangeEvidenceRef[];
  };
}

export interface BuildChangeReadinessInput {
  // existing fields
  readonly governance?: BuildChangeGovernanceAssessment;
}
```

In `assessBuildChangeReadiness`, before release readiness:

```ts
if (input.governance?.required === true) {
  if (!input.governance.decision?.allowed) {
    blockers.push("governance_approval_missing");
    return { readiness: "blocked", blockers, warnings };
  }
}
```

Keep the return shape consistent with the existing evaluator.

- [ ] **Step 4: Write developer guide**

Create `docs/developer/enterprise-governance.md` and `.zh-CN.md` with:

- how a Host maps real users to `builder`, `reviewer`, `owner`, `operator`, `end_user`;
- how to evaluate governance before publish;
- how to attach governance decision to Build Assurance;
- why provider selection stays outside governance core;
- GitHub public-read + mock Linear as recommended 0.3.0 pressure baseline.

- [ ] **Step 5: Write M42 snapshot**

Create M42 snapshots:

```text
M42 proves Build Assurance can consume governance decisions so publish readiness is blocked until the required enterprise approval route is satisfied.
```

- [ ] **Step 6: Verify and commit**

Run:

```bash
bun test packages/core/test/enterprise-governance.test.ts packages/core/test/build-assurance.test.ts
bun run typecheck
git diff --check
```

Commit:

```bash
git add packages/core/src/build-assurance.ts packages/core/test/build-assurance.test.ts packages/core/src/enterprise-governance.ts packages/core/test/enterprise-governance.test.ts docs/developer/enterprise-governance.md docs/developer/enterprise-governance.zh-CN.md docs/architecture/milestone-42-snapshot.md docs/architecture/milestone-42-snapshot.zh-CN.md
git commit -m "feat(core): gate build assurance with governance approval"
```

## Task 4: M43 Enterprise Governance Demo With GitHub + Mock Linear

**Files:**
- Create directory: `examples/m43-enterprise-governance-demo/`
- Create: `examples/m43-enterprise-governance-demo/package.json`
- Create: `examples/m43-enterprise-governance-demo/server.ts`
- Create: `examples/m43-enterprise-governance-demo/providers/github-public.ts`
- Create: `examples/m43-enterprise-governance-demo/providers/linear-mock.ts`
- Create: `examples/m43-enterprise-governance-demo/governance.ts`
- Create: `examples/m43-enterprise-governance-demo/ui.ts`
- Create: `examples/m43-enterprise-governance-demo/run.ts`
- Create: `examples/m43-enterprise-governance-demo/README.md`
- Create: `examples/m43-enterprise-governance-demo/README.zh-CN.md`
- Create: `examples/m43-enterprise-governance-demo/enterprise-governance.test.ts`
- Modify: `examples/README.md`
- Create: `docs/architecture/milestone-43-snapshot.md`
- Create: `docs/architecture/milestone-43-snapshot.zh-CN.md`

- [ ] **Step 1: Write provider contract tests**

Create `examples/m43-enterprise-governance-demo/enterprise-governance.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { fetchGitHubPublicAttention } from "./providers/github-public.js";
import { fetchLinearMockAttention } from "./providers/linear-mock.js";
import { buildGovernancePolicy, buildGovernanceRequest } from "./governance.js";
import { evaluateBuildChangeGovernance } from "@pneuma-framework/core/enterprise-governance";

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
    const policy = buildGovernancePolicy();
    const request = buildGovernanceRequest({
      builder_subject: "user:bob",
      decisions: [{ subject: "user:rachel", decision: "approved", decided_at_ms: 1 }],
      risks: ["source_code_change"],
    });
    expect(evaluateBuildChangeGovernance(policy, request).allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run failing tests**

Run:

```bash
bun test examples/m43-enterprise-governance-demo/enterprise-governance.test.ts
```

Expected: fail because files do not exist.

- [ ] **Step 3: Implement GitHub public provider**

Create `providers/github-public.ts`:

```ts
export interface GitHubAttentionItem {
  readonly provider: "github";
  readonly kind: "repo" | "issue" | "pull_request";
  readonly title: string;
  readonly url: string;
  readonly repo?: string;
}

export async function fetchGitHubPublicAttention(input: {
  readonly owner: string;
  readonly limit?: number;
}): Promise<GitHubAttentionItem[]> {
  const limit = input.limit ?? 5;
  const response = await fetch(`https://api.github.com/users/${input.owner}/repos?sort=updated&per_page=${limit}`, {
    headers: { Accept: "application/vnd.github+json", "User-Agent": "pneuma-m43-demo" },
  });
  if (!response.ok) {
    return [{
      provider: "github",
      kind: "repo",
      title: `GitHub public-read unavailable: ${response.status}`,
      url: `https://github.com/${input.owner}`,
    }];
  }
  const repos = await response.json() as Array<{ name: string; html_url: string; full_name: string }>;
  return repos.slice(0, limit).map((repo) => ({
    provider: "github",
    kind: "repo",
    title: repo.name,
    url: repo.html_url,
    repo: repo.full_name,
  }));
}
```

The fallback is intentional so the demo remains runnable if GitHub rate-limits local tests.

- [ ] **Step 4: Implement mock Linear provider**

Create `providers/linear-mock.ts`:

```ts
export interface LinearMockAttentionItem {
  readonly provider: "linear";
  readonly workspace: string;
  readonly team: string;
  readonly project: string;
  readonly issue_id: string;
  readonly title: string;
  readonly status: "Backlog" | "In Progress" | "In Review" | "Done";
  readonly assignee: string;
}

export async function fetchLinearMockAttention(): Promise<LinearMockAttentionItem[]> {
  return [
    {
      provider: "linear",
      workspace: "acme-eng",
      team: "platform",
      project: "Developer Control Plane",
      issue_id: "PLAT-17",
      title: "Review release rollback evidence before next publish",
      status: "In Progress",
      assignee: "rachel",
    },
    {
      provider: "linear",
      workspace: "acme-eng",
      team: "platform",
      project: "Developer Control Plane",
      issue_id: "PLAT-24",
      title: "Validate provider capability matrix for GitHub and Linear",
      status: "In Review",
      assignee: "olivia",
    },
  ];
}
```

- [ ] **Step 5: Implement governance helpers**

Create `governance.ts` with:

```ts
import type {
  BuildChangeGovernanceDecisionInput,
  BuildChangeGovernancePolicy,
  BuildChangeGovernanceRequest,
} from "@pneuma-framework/core/enterprise-governance";
import type { BuildChangeRisk } from "@pneuma-framework/core/build-assurance";

export function buildGovernancePolicy(): BuildChangeGovernancePolicy {
  return {
    policy_id: "m43-enterprise-minimum",
    app_id: "dev-activity-board",
    role_assignments: [
      { subject: "user:bob", role: "builder" },
      { subject: "user:rachel", role: "reviewer" },
      { subject: "user:olivia", role: "owner" },
      { subject: "user:otto", role: "operator" },
    ],
    routes: [
      { route_id: "reviewer-for-standard-change", risks: ["source_code_change", "definition_additive"], required_roles: ["reviewer"] },
      { route_id: "owner-for-high-risk", risks: ["destructive_definition", "policy_change", "data_migration", "credential_boundary"], required_roles: ["owner"] },
    ],
  };
}

export function buildGovernanceRequest(input: {
  readonly builder_subject: string;
  readonly risks: readonly BuildChangeRisk[];
  readonly decisions: readonly BuildChangeGovernanceDecisionInput[];
}): BuildChangeGovernanceRequest {
  return {
    app_id: "dev-activity-board",
    build_change_id: "change-dev-activity-board-v1",
    builder_subject: input.builder_subject,
    risks: input.risks,
    evidence_refs: [
      { kind: "build_thread_turn", thread_id: "thread-m43", turn_id: "proposal-v1" },
      { kind: "host_check", check_id: "provider-capability-contract", status: "passed" },
    ],
    decisions: input.decisions,
  };
}
```

- [ ] **Step 6: Implement server and UI**

Create a minimal Bun server with endpoints:

```text
GET  /
GET  /api/state?role=builder|reviewer|owner|operator|end_user
POST /api/propose
POST /api/decision
POST /api/publish
POST /api/rollback
```

Required behavior:

- `builder` can propose but cannot approve own governed change.
- `reviewer` can approve standard source/definition changes.
- `owner` can approve high-risk changes and trigger rollback.
- `operator` can inspect health/release state but cannot approve business change.
- `end_user` can only see the published app panel.
- state includes GitHub public-read items and mock Linear items.

Use a single in-memory demo state object. Do not introduce a database for this demo.

- [ ] **Step 7: Implement run script**

Create `run.ts` that starts the server on an ephemeral port, drives:

```text
builder propose
builder self-approval denied
reviewer approval allowed
publish allowed
operator status visible
owner rollback allowed
end_user sees published app before rollback and previous state after rollback
```

The script should print:

```text
m43 propose: awaiting reviewer
m43 self approval: denied
m43 reviewer approval: allowed
m43 publish: active
m43 rollback: completed
```

- [ ] **Step 8: Verify demo**

Run:

```bash
bun test examples/m43-enterprise-governance-demo/enterprise-governance.test.ts
bun run examples/m43-enterprise-governance-demo/run.ts
```

- [ ] **Step 9: Add docs and examples index**

Update `examples/README.md` with the M43 demo as canonical.

Write `examples/m43-enterprise-governance-demo/README.md` and `.zh-CN.md` with:

- scenario;
- roles;
- provider baseline;
- what is proven;
- what is not claimed;
- run commands.

Create M43 snapshots.

- [ ] **Step 10: Commit**

```bash
git add examples/m43-enterprise-governance-demo examples/README.md docs/architecture/milestone-43-snapshot.md docs/architecture/milestone-43-snapshot.zh-CN.md
git commit -m "feat(examples): add enterprise governance demo"
```

## Task 5: M44 RC 0.3.0 Paperwork And Gate

**Files:**
- Create: `docs/architecture/release-candidate-0.3.0-snapshot.md`
- Create: `docs/architecture/release-candidate-0.3.0-snapshot.zh-CN.md`
- Modify: `docs/architecture/team-share-demo.md`
- Modify: `docs/architecture/team-share-demo.zh-CN.md`
- Modify: `docs/developer/start-here.md`
- Modify: `docs/developer/start-here.zh-CN.md`
- Modify: `docs/architecture/README.md`
- Modify: `README.md`
- Modify: `PRODUCT.md`

- [ ] **Step 1: Write RC 0.3.0 snapshot**

Create a snapshot with:

```md
# Release Candidate Snapshot: pneuma-rc-0.3.0

**Status:** release-candidate gate pending final owner confirmation.

## Decision

Prepare RC 0.3.0 as the minimum enterprise governance release train.

## What 0.3.0 Proves

- Enterprise governance route vocabulary exists.
- Build Assurance can block publish until required governance approval is satisfied.
- A reference demo shows Builder, Reviewer, Owner, Operator, and End User responsibilities.
- Provider pressure includes GitHub public-read and mock Linear.

## Still Not Claimed

- Hosted IAM.
- Production credential vault.
- Compliance retention backend.
- Workflow engine.
- Marketplace artifact trust.
- Full provider SDK certification.
```

- [ ] **Step 2: Update team-share**

In `docs/architecture/team-share-demo.md` and `.zh-CN.md`, add a final section:

```text
0.3.0 moves from developer-contract consumption to minimum enterprise governance:
one AI-assisted business change has a role route, review packet, decision evidence,
publish gate, and recovery path.
```

- [ ] **Step 3: Update developer entries**

Add links to:

- production readiness boundary;
- enterprise governance domain review;
- enterprise governance developer guide;
- M43 demo;
- RC 0.3.0 snapshot.

- [ ] **Step 4: Run final verification**

Run:

```bash
bun run typecheck
bun run test:package-consumption
bun test packages/core/test/enterprise-governance.test.ts packages/core/test/build-assurance.test.ts examples/m43-enterprise-governance-demo/enterprise-governance.test.ts
bun run examples/m43-enterprise-governance-demo/run.ts
git diff --check
```

If targeted tests pass, run full suite:

```bash
bun test
```

- [ ] **Step 5: Commit RC 0.3.0 paperwork**

```bash
git add docs/architecture/release-candidate-0.3.0-snapshot.md docs/architecture/release-candidate-0.3.0-snapshot.zh-CN.md docs/architecture/team-share-demo.md docs/architecture/team-share-demo.zh-CN.md docs/developer/start-here.md docs/developer/start-here.zh-CN.md docs/architecture/README.md README.md PRODUCT.md
git commit -m "docs: prepare rc 0.3.0 enterprise governance gate"
```

## Acceptance Criteria

0.3.0 is ready for owner review when all of these are true:

- `pneuma-rc-0.2.0` tag exists and is the starting point for the branch.
- Production readiness boundary docs are current in English and Chinese.
- Enterprise governance domain docs are current in English and Chinese.
- `evaluateBuildChangeGovernance` is exported from a focused public subpath or top-level core export.
- Governance evaluator proves:
  - reviewer approval can satisfy standard changes;
  - builder self-approval does not satisfy required review;
  - destructive/policy/migration/credential-boundary risks route to owner;
  - operator cannot approve business changes by default.
- Build Assurance publish readiness can be blocked by missing governance approval.
- M43 demo runs end to end with GitHub public-read plus mock Linear provider pressure.
- Team-share docs explain 0.3.0 as minimum enterprise governance, not full enterprise SaaS.
- Final verification passes:
  - `bun run typecheck`
  - `bun run test:package-consumption`
  - targeted governance/demo tests
  - `bun test`
  - `git diff --check`

## Execution Recommendation

Use subagent-driven development only after Task 1 and Task 2 docs/types are accepted. The demo task should remain local or be delegated to one worker with a strict write scope under `examples/m43-enterprise-governance-demo/`.

Provider choice should remain:

```text
GitHub public-read + mock Linear
```

until the owner explicitly chooses to add authenticated GitHub or real Linear.

