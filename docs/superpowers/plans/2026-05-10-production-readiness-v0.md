# Production Readiness v0 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the post-RC framework easier and safer for real Creation Host developers by adding execution-level governance helpers, portable artifact safety checks, canonical Host diagnostics, BuildThread adoption polish, and final DDD/paperwork alignment.

**Architecture:** Keep the top-level model explicit: `pneuma-framework -> Creation Host -> Generated Application -> Published Application`. The framework owns portable contracts, semantic transcript, governance decisions, diagnostics, and guardrail primitives; the Creation Host still owns product workflow, provider selection, UI, deployment target, and domain-specific tools.

**Tech Stack:** Bun workspaces, TypeScript, `bun:test`, existing `@pneuma-framework/core` contract modules, Markdown docs.

---

## File Structure

- Modify `packages/core/src/sharing-governance.ts`: add one execution-level bundle decision helper so Hosts can authorize install/fork/publish from a single fail-closed entrypoint.
- Modify `packages/core/test/sharing-governance.test.ts`: cover bundle-level allow/deny, mismatched artifact/governance/evidence, and scope-specific rights.
- Create `packages/core/src/portable-artifact-safety.ts`: reusable no-secret/no-source-data scanner shared by Host authoring and sharing governance code.
- Modify `packages/core/src/host-authoring.ts`: use the portable artifact safety scanner for share artifacts and authoring contracts.
- Modify `packages/core/src/index.ts`: export the new helpers and types.
- Modify `packages/core/test/host-authoring.test.ts`: cover generic `secret` / provider secret / raw source material rejection through the canonical helper.
- Modify `packages/core/src/developer-experience.ts`: add a compact canonical Host readiness summary that downstream Hosts can expose in their own diagnostics endpoint.
- Modify `packages/core/test/developer-experience.test.ts`: verify the readiness summary preserves failure reasons and does not hide warnings/errors.
- Modify `packages/core/src/build-thread.ts`: add a backend-agnostic inspection summary helper for BuildThread adoption.
- Modify `packages/core/test/build-thread.test.ts`: verify the helper summarizes user/proposal/decision/receipt turns without backend-specific message names.
- Modify `docs/developer/creation-host-contract.md`, `docs/developer/build-thread.md`, `docs/developer/downstream-validation-brief.md`, `docs/developer/downstream-validation-brief.zh-CN.md`: document the canonical production-readiness entrypoints.
- Modify `docs/architecture/spec/creation-host-ddd-review.md`: update DDD snapshot with the accepted production-readiness boundary.
- Create or update a release/paperwork note if the implementation changes developer-facing contracts.

## Task 1: Sharing Governance Execution Helper

**Files:**
- Modify: `packages/core/src/sharing-governance.ts`
- Modify: `packages/core/test/sharing-governance.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing bundle execution tests**

Add tests that call a new helper named `evaluateSharingGovernanceBundle`. The tests must prove:

```ts
expect(evaluateSharingGovernanceBundle(validBundle, {
  action: "install",
  scope: "artifact",
  subject: "user:charlie",
  credential_rebinding_evidence: charlieEvidence,
})).toMatchObject({
  allowed: true,
  reason_code: "explicit-grant",
  bundle_ok: true,
});

expect(evaluateSharingGovernanceBundle({
  ...validBundle,
  share_artifact: { ...validBundle.share_artifact, app_id: "other-app" },
}, {
  action: "install",
  scope: "artifact",
  subject: "user:charlie",
  credential_rebinding_evidence: charlieEvidence,
})).toMatchObject({
  allowed: false,
  reason_code: "invalid-bundle",
  bundle_ok: false,
});
```

- [ ] **Step 2: Run the targeted test and confirm failure**

Run: `bun test packages/core/test/sharing-governance.test.ts`

Expected: fail because `evaluateSharingGovernanceBundle` is not exported.

- [ ] **Step 3: Implement the minimal fail-closed helper**

Add a result type that includes the existing decision plus bundle validation state:

```ts
export interface SharingGovernanceBundleDecision extends SharingGovernanceDecision {
  readonly bundle_ok: boolean;
  readonly bundle_issues: readonly SharingGovernanceIssue[];
}
```

Implement:

```ts
export function evaluateSharingGovernanceBundle(
  bundle: SharingGovernanceBundle,
  request: SharingGovernanceRequest,
): SharingGovernanceBundleDecision {
  const bundleCheck = validateSharingGovernanceBundle(bundle);
  if (!bundleCheck.ok) {
    return {
      allowed: false,
      action: request.action,
      subject: request.subject,
      reason_code: "invalid-bundle",
      matched_grants: [],
      missing_credential_requirement_ids: [],
      bundle_ok: false,
      bundle_issues: bundleCheck.issues,
    };
  }
  const evidence = request.credential_rebinding_evidence ?? bundle.credential_rebinding_evidence;
  const decision = evaluateSharingGovernance(bundle.sharing_governance, {
    ...request,
    credential_rebinding_evidence: evidence,
  });
  return {
    ...decision,
    bundle_ok: true,
    bundle_issues: [],
  };
}
```

Use a new `reason_code: "invalid-bundle"` union member rather than overloading `missing-grant`.

- [ ] **Step 4: Export and rerun**

Export the helper and type from `packages/core/src/index.ts`.

Run: `bun test packages/core/test/sharing-governance.test.ts`

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/sharing-governance.ts packages/core/test/sharing-governance.test.ts packages/core/src/index.ts
git commit -m "feat(core): add sharing governance bundle decision helper"
```

## Task 2: Portable Artifact Safety Scanner

**Files:**
- Create: `packages/core/src/portable-artifact-safety.ts`
- Modify: `packages/core/src/host-authoring.ts`
- Modify: `packages/core/src/sharing-governance.ts`
- Modify: `packages/core/test/host-authoring.test.ts`
- Modify: `packages/core/test/sharing-governance.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing safety tests**

Add tests proving the framework rejects generic and provider-shaped secret fields:

```ts
expect(validateShareArtifactManifest({
  ...shareArtifact,
  github_secret: "ghs_should-not-export",
} as unknown as ShareArtifactManifest).issues.map((issue) => issue.code)).toContain(
  "portable_artifact.secret_material.forbidden",
);
```

Add an evidence test for `oauth_secret`:

```ts
expect(validateCredentialRebindingEvidence({
  ...charlieEvidence,
  bindings: [{ ...charlieEvidence.bindings[0], oauth_secret: "raw" }],
} as unknown as CredentialRebindingEvidence, governance).issues.map((issue) => issue.code)).toContain(
  "portable_artifact.secret_material.forbidden",
);
```

- [ ] **Step 2: Run targeted tests and confirm failure**

Run: `bun test packages/core/test/host-authoring.test.ts packages/core/test/sharing-governance.test.ts`

Expected: fail because generic provider secret keys are not all detected and the new portable issue code does not exist.

- [ ] **Step 3: Implement scanner**

Create a focused scanner:

```ts
export interface PortableArtifactSafetyIssue {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface PortableArtifactSafetyCheck {
  readonly ok: boolean;
  readonly issues: readonly PortableArtifactSafetyIssue[];
}

export function validatePortableArtifactSafety(value: unknown): PortableArtifactSafetyCheck;
```

The scanner must flag key names that are exact sensitive names (`secret`, `token`, `password`, `api_key`, `access_token`, `refresh_token`, `private_key`, `client_secret`) or end with sensitive suffixes such as `_secret`, `_token`, `_password`, `_private_key`, while allowing declaration-only keys such as `excludes.secrets` and `credential_boundary.allow_secret_storage`.

- [ ] **Step 4: Wire scanner into existing validators**

Replace duplicated `pushSecretMaterialIssue` logic in `host-authoring.ts` and `sharing-governance.ts` with the scanner, preserving existing domain-specific issue codes where tests depend on them only if needed. Prefer the new canonical `portable_artifact.secret_material.forbidden` code for new behavior.

- [ ] **Step 5: Export and rerun**

Export `validatePortableArtifactSafety` and types from `packages/core/src/index.ts`.

Run: `bun test packages/core/test/host-authoring.test.ts packages/core/test/sharing-governance.test.ts`

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/portable-artifact-safety.ts packages/core/src/host-authoring.ts packages/core/src/sharing-governance.ts packages/core/test/host-authoring.test.ts packages/core/test/sharing-governance.test.ts packages/core/src/index.ts
git commit -m "feat(core): add portable artifact safety scanner"
```

## Task 3: Canonical Host Readiness Diagnostics

**Files:**
- Modify: `packages/core/src/developer-experience.ts`
- Modify: `packages/core/test/developer-experience.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing diagnostics test**

Add a test that builds a readiness summary from authoring diagnostics and verifies that failed checks stay visible:

```ts
expect(createCreationHostReadinessSummary({
  authoring: diagnostics,
})).toMatchObject({
  ok: false,
  failed_check_count: 1,
});
```

- [ ] **Step 2: Implement the helper**

Add `createCreationHostReadinessSummary` with a small stable shape:

```ts
export interface CreationHostReadinessSummary {
  readonly ok: boolean;
  readonly failed_check_count: number;
  readonly warning_count: number;
  readonly failed_check_kinds: readonly string[];
}
```

Do not make this a product UI. It is an endpoint-friendly diagnostic summary.

- [ ] **Step 3: Export and test**

Run: `bun test packages/core/test/developer-experience.test.ts`

Expected: pass.

- [ ] **Step 4: Commit**

```bash
git add packages/core/src/developer-experience.ts packages/core/test/developer-experience.test.ts packages/core/src/index.ts
git commit -m "feat(core): summarize creation host readiness"
```

## Task 4: BuildThread Adoption Polish

**Files:**
- Modify: `packages/core/src/build-thread.ts`
- Modify: `packages/core/test/build-thread.test.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `docs/developer/build-thread.md`

- [ ] **Step 1: Write failing inspection summary test**

Add a test for `summarizeBuildThreadTurns(turns)` proving it counts user, proposal, decision, and execution receipt turns without producing Anthropic or opencode-specific messages.

- [ ] **Step 2: Implement backend-neutral summary**

Expose:

```ts
export interface BuildThreadTurnSummary {
  readonly total_turns: number;
  readonly user_turns: number;
  readonly proposal_turns: number;
  readonly decision_turns: number;
  readonly execution_receipt_turns: number;
  readonly latest_proposal_id?: string;
}
```

- [ ] **Step 3: Document migration**

Update `docs/developer/build-thread.md` with a Host migration note: use BuildThread for source-of-truth transcript; backend-native sessions are cache; use summary helper for inspection panes.

- [ ] **Step 4: Test and commit**

Run: `bun test packages/core/test/build-thread.test.ts`

Commit:

```bash
git add packages/core/src/build-thread.ts packages/core/test/build-thread.test.ts packages/core/src/index.ts docs/developer/build-thread.md
git commit -m "feat(core): add build thread inspection summary"
```

## Task 5: Documentation, DDD Review, and Full Verification

**Files:**
- Modify: `docs/developer/creation-host-contract.md`
- Modify: `docs/developer/downstream-validation-brief.md`
- Modify: `docs/developer/downstream-validation-brief.zh-CN.md`
- Modify: `docs/architecture/spec/creation-host-ddd-review.md`
- Modify: `docs/architecture/OPEN-QUESTIONS.md` only if an actual open question changes.

- [ ] **Step 1: Update developer docs**

Document:

- use `evaluateSharingGovernanceBundle` before executing install/fork/publish;
- use `validatePortableArtifactSafety` before writing share artifacts;
- expose `createCreationHostReadinessSummary` or equivalent in Host diagnostics;
- use BuildThread as the transcript source of truth.

- [ ] **Step 2: Run DDD review**

Review the implementation against the two core questions:

1. How does a Developer build a Creation Host safely?
2. How do sharing / fork / organization governance stay coherent without leaking provider details or secrets?

Update `docs/architecture/spec/creation-host-ddd-review.md` with current decisions and remaining risks.

- [ ] **Step 3: Full verification**

Run:

```bash
bun test packages/core/test/sharing-governance.test.ts packages/core/test/host-authoring.test.ts packages/core/test/developer-experience.test.ts packages/core/test/build-thread.test.ts
bun test
```

Expected: all pass.

- [ ] **Step 4: Final commit**

```bash
git add docs/developer/creation-host-contract.md docs/developer/downstream-validation-brief.md docs/developer/downstream-validation-brief.zh-CN.md docs/architecture/spec/creation-host-ddd-review.md
git commit -m "docs: align production readiness contracts"
```

## Self-Review

- Spec coverage: the plan covers the downstream failure modes surfaced by LaunchRoom without moving provider-specific product logic into the framework.
- Placeholder scan: no placeholders; each task has concrete files, test commands, and commit boundaries.
- Type consistency: new exported helpers are backend-neutral and preserve the four-layer domain boundary.
