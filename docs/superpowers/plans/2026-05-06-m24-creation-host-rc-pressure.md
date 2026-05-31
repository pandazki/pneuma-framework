# M24 Creation Host RC Pressure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a contract-level RC pressure scenario that proves a Developer-authored Creation Host can create, share, install, and fork a Generated Application across profiles without leaking provider-specific logic into Builder-mode agents.

**Architecture:** Add a pure core verifier around the Alice/Bob/Charlie/Dave story. The verifier composes existing M21-M23 contracts: Creation Host profiles, Build Agent Package, Provider Capability Matrix, Share Artifact, Sharing Governance Bundle, and no-secret Credential Rebinding Evidence. It does not introduce a product UI or real cloud deployment yet; it produces deterministic evidence that a future reference Host can replay.

**Tech Stack:** TypeScript, Bun tests, `packages/core` contract helpers, existing Creation Host store, existing sharing governance validators.

---

## File Structure

- Create: `tests/pressure/creation-host-rc-pressure.fixture.ts`
  - Owns the M24 RC pressure scenario types, sample `dev-board` fixtures, fork/install intent types, and pure verifier functions.
- Create: `tests/pressure/creation-host-rc-pressure.test.ts`
  - Proves the Alice/Bob/Charlie/Dave story as executable contract evidence.
- Do not modify: `packages/core/src/index.ts`
  - M24 helpers are pressure-test fixtures, not framework API.
- Modify: `docs/architecture/roadmap.md`
  - Adds M24 as the recommended RC pressure lane after M23.1.
- Create later, after implementation passes: `docs/archive/milestone-24-snapshot.md` and `docs/archive/milestone-24-snapshot.zh-CN.md`
  - Team-facing explanation after M24 closes. Do not create snapshot before implementation and verification.

## Scenario Contract

M24 uses this fixed story:

```text
Alice = Developer of a Creation Host.
Bob = Builder who creates dev-board with local-sqlite-docker.
Charlie = installer who keeps Bob's default profile and re-binds his own GitHub/Linear credentials.
Dave = forker who switches to remote-postgres-docker, removes apple-notes, and re-binds his own GitHub/Linear credentials.
```

The pressure assertions:

1. Alice's Build Agent Package exposes capability contracts and forbids provider-specific branches.
2. Bob's share artifact excludes source database, secrets, and private derived cache.
3. Charlie install is allowed only with artifact-scoped install rights and version-bound credential evidence.
4. Dave fork is allowed only with artifact/forks-scoped rights, target profile capability compatibility, and explicit removal of unsupported Apple Notes.
5. The Builder-mode agent is never asked to know provider implementation details beyond `profile_id`, `capabilities`, and `credential_requirements`.

---

### Task 1: Write the Failing RC Pressure Test

**Files:**
- Create: `tests/pressure/creation-host-rc-pressure.test.ts`

- [x] **Step 1: Add the test file**

```ts
import { describe, expect, test } from "bun:test";
import {
  buildDevBoardRcPressureScenario,
  evaluateCreationHostRcPressure,
} from "./creation-host-rc-pressure.fixture.js";

describe("M24 Creation Host RC pressure", () => {
  test("proves Alice can prepare Bob's Build Agent package without provider special-casing", () => {
    const scenario = buildDevBoardRcPressureScenario();
    const report = evaluateCreationHostRcPressure(scenario);

    expect(report.ok).toBe(true);
    expect(report.agent_package.provider_specialization_policy).toEqual({
      mode: "capability-contract-only",
      provider_specific_branches: "forbidden",
      allowed_context: ["profile_id", "capabilities", "credential_requirements"],
    });
    expect(report.agent_context_visible_to_builder_agent).toEqual([
      "profile_id",
      "capabilities",
      "credential_requirements",
    ]);
    expect(report.provider_specific_branching_allowed).toBe(false);
  });

  test("proves Charlie can install Bob's artifact by rebinding credentials", () => {
    const scenario = buildDevBoardRcPressureScenario();
    const report = evaluateCreationHostRcPressure(scenario);

    expect(report.charlie_install.allowed).toBe(true);
    expect(report.charlie_install.reason_code).toBe("explicit-grant");
    expect(report.charlie_install.matched_grants).toEqual(["charlie-install"]);
    expect(report.charlie_install.missing_credential_requirement_ids).toEqual([]);
  });

  test("proves Dave can fork only after unsupported Apple Notes is removed", () => {
    const scenario = buildDevBoardRcPressureScenario();
    const report = evaluateCreationHostRcPressure(scenario);

    expect(report.dave_fork.allowed).toBe(true);
    expect(report.dave_fork.target_profile_id).toBe("remote-postgres-docker");
    expect(report.dave_fork.removed_capability_ids).toEqual(["apple-notes"]);
    expect(report.dave_fork.unsupported_capabilities_acknowledged).toEqual(["apple-notes"]);
    expect(report.dave_fork.provider_specific_migration_used).toBe(false);
  });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run:

```bash
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun test tests/pressure/creation-host-rc-pressure.test.ts
```

Expected: fail because the pressure fixture helper is not implemented yet.

- [x] **Step 3: Commit the red test**

```bash
git add tests/pressure/creation-host-rc-pressure.test.ts
git commit -m "test: describe creation host rc pressure"
```

---

### Task 2: Implement the RC Scenario Fixtures

**Files:**
- Create: `tests/pressure/creation-host-rc-pressure.fixture.ts`
- Test: `tests/pressure/creation-host-rc-pressure.test.ts`

- [x] **Step 1: Add scenario types and fixtures**

Create `tests/pressure/creation-host-rc-pressure.fixture.ts`:

```ts
import {
  evaluateSharingGovernance,
  validateBuildAgentPackageManifest,
  validateHostAuthoringKitContracts,
  validateProviderCapabilityMatrix,
  validateShareArtifactManifest,
  validateSharingGovernanceBundle,
  validateSharingGovernanceManifest,
  type BuildAgentPackageManifest,
  type CredentialRebindingEvidence,
  type ProviderCapabilityMatrix,
  type ShareArtifactManifest,
  type SharingGovernanceDecision,
  type SharingGovernanceManifest,
} from "./index.js";

export interface CreationHostRcForkPlan {
  readonly actor: "user:dave";
  readonly source_app_id: "dev-board";
  readonly source_version_id: "v3";
  readonly target_profile_id: "remote-postgres-docker";
  readonly removed_capability_ids: readonly string[];
  readonly provider_specific_migration_used: boolean;
}

export interface CreationHostRcPressureScenario {
  readonly agent_package: BuildAgentPackageManifest;
  readonly provider_capabilities: ProviderCapabilityMatrix;
  readonly share_artifact: ShareArtifactManifest;
  readonly sharing_governance: SharingGovernanceManifest;
  readonly charlie_credential_rebinding: CredentialRebindingEvidence;
  readonly dave_credential_rebinding: CredentialRebindingEvidence;
  readonly dave_fork_plan: CreationHostRcForkPlan;
}

export interface CreationHostRcForkDecision {
  readonly allowed: boolean;
  readonly target_profile_id: string;
  readonly removed_capability_ids: readonly string[];
  readonly unsupported_capabilities_acknowledged: readonly string[];
  readonly provider_specific_migration_used: boolean;
  readonly reasons: readonly string[];
}

export interface CreationHostRcPressureReport {
  readonly ok: boolean;
  readonly issues: readonly string[];
  readonly agent_package: BuildAgentPackageManifest;
  readonly agent_context_visible_to_builder_agent: readonly string[];
  readonly provider_specific_branching_allowed: boolean;
  readonly charlie_install: SharingGovernanceDecision;
  readonly dave_fork: CreationHostRcForkDecision;
}
```

- [x] **Step 2: Add `buildDevBoardRcPressureScenario`**

Append to `tests/pressure/creation-host-rc-pressure.fixture.ts`:

```ts
const githubRequirement = {
  id: "github-user-token",
  provider_id: "github",
  scopes: ["repo", "workflow"],
  binding_mode: "per-user",
  placement: "host-broker",
  required: true,
} as const;

const linearRequirement = {
  id: "linear-user-token",
  provider_id: "linear",
  scopes: ["read", "write"],
  binding_mode: "per-user",
  placement: "host-broker",
  required: true,
} as const;

export function buildDevBoardRcPressureScenario(): CreationHostRcPressureScenario {
  const agentPackage: BuildAgentPackageManifest = {
    schema_version: 1,
    package_id: "mawidget-dev-board-builder",
    version: "0.1.0",
    display_name: "Mawidget Dev Board Builder",
    instructions_path: "./agent-policy.md",
    tool_allowlist: ["definition.apply_change_set", "host.share.prepare", "host.fork.prepare"],
    provider_capability_matrix_id: "mawidget-providers",
    provider_specialization_policy: {
      mode: "capability-contract-only",
      provider_specific_branches: "forbidden",
      allowed_context: ["profile_id", "capabilities", "credential_requirements"],
    },
    credential_boundary: {
      allow_secret_storage: false,
      allowed_placements: ["host-broker"],
    },
    review_checklist: [
      "No provider-specific implementation in Builder mode.",
      "No raw credentials in generated app data, share artifacts, or transcripts.",
      "Unsupported capabilities are removed or fail closed before publish.",
    ],
    verification_hooks: [
      { id: "host-contract-tests", command: "bun test tests/pressure/creation-host-rc-pressure.test.ts", description: "Run M24 Host RC pressure tests." },
      { id: "sqlite-postgres-parity", command: "bun test parity", description: "Run Host-owned SQLite/Postgres semantic parity tests." },
    ],
  };

  const providerCapabilities: ProviderCapabilityMatrix = {
    schema_version: 1,
    matrix_id: "mawidget-providers",
    capabilities: [
      { id: "relational-store", kind: "storage", description: "Relational app data and framework history.", default_fail_closed_behavior: "Reject app writes when relational storage is unavailable." },
      { id: "github-issues", kind: "external-provider", description: "GitHub issue and pull request tracking.", default_fail_closed_behavior: "Disable GitHub-backed operations until credentials are rebound." },
      { id: "linear-projects", kind: "external-provider", description: "Linear project and issue tracking.", default_fail_closed_behavior: "Disable Linear-backed operations until credentials are rebound." },
      { id: "apple-notes", kind: "external-provider", description: "Local Apple Notes integration.", default_fail_closed_behavior: "Disable Apple Notes surfaces outside macOS local profiles." },
    ],
    profiles: [
      {
        profile_id: "local-sqlite-docker",
        storage_profile: "sqlite",
        deployment_profile: "local-docker",
        supported_capabilities: ["relational-store", "github-issues", "linear-projects", "apple-notes"],
        unsupported_capabilities: [],
        credential_requirements: [githubRequirement, linearRequirement],
      },
      {
        profile_id: "remote-postgres-docker",
        storage_profile: "postgres",
        deployment_profile: "remote-docker",
        supported_capabilities: ["relational-store", "github-issues", "linear-projects"],
        unsupported_capabilities: [
          {
            capability_id: "apple-notes",
            fail_closed_behavior: "Remove Apple Notes capability before remote publish.",
          },
        ],
        credential_requirements: [githubRequirement, linearRequirement],
      },
    ],
    parity_contracts: [
      {
        id: "relational-store-sqlite-postgres-parity",
        capability_id: "relational-store",
        profile_ids: ["local-sqlite-docker", "remote-postgres-docker"],
        semantic_contract: "Rows, app definition, app history, and policy state behave the same across SQLite and Postgres profiles.",
        verification_hook_id: "sqlite-postgres-parity",
      },
    ],
  };

  const shareArtifact: ShareArtifactManifest = {
    schema_version: 1,
    artifact_id: "dev-board-share",
    app_id: "dev-board",
    version_id: "v3",
    source_profile_id: "local-sqlite-docker",
    created_from_package_id: "mawidget-dev-board-builder",
    created_from_package_version: "0.1.0",
    includes: { app_definition: true, init_recipe: true, provider_requirements: true },
    excludes: { secrets: true, private_derived_cache: true, source_database: true },
    credential_requirements: [githubRequirement, linearRequirement],
    target_profile_policy: {
      compatible_profile_ids: ["local-sqlite-docker", "remote-postgres-docker"],
      required_capabilities: ["relational-store", "github-issues", "linear-projects"],
      credential_rebinding_required: true,
    },
    init_recipe: {
      recipe_id: "dev-board-init",
      version: "0.1.0",
      steps: [
        { id: "seed-board-columns", kind: "semantic-operation", operation_id: "seed_dev_board_defaults", idempotency_key: "seed-dev-board-defaults-v1", description: "Seed portable board defaults through semantic operations." },
      ],
    },
  };

  const sharingGovernance: SharingGovernanceManifest = {
    schema_version: 1,
    governance_id: "dev-board-sharing",
    artifact_id: "dev-board-share",
    app_id: "dev-board",
    version_id: "v3",
    owner: "user:bob",
    maintainers: ["user:bob"],
    operators: ["user:bob"],
    lineage: {
      source_artifact_id: "dev-board-share",
      source_app_id: "dev-board",
      source_version_id: "v3",
    },
    rights: [
      { id: "charlie-install", subject: "user:charlie", actions: ["install"], scope: "artifact" },
      { id: "dave-fork", subject: "user:dave", actions: ["fork", "install"], scope: "forks" },
    ],
    credential_rebinding_policy: {
      required: true,
      requirements: [githubRequirement, linearRequirement],
    },
    revocation: { revoked: false },
  };

  return {
    agent_package: agentPackage,
    provider_capabilities: providerCapabilities,
    share_artifact: shareArtifact,
    sharing_governance: sharingGovernance,
    charlie_credential_rebinding: credentialEvidence("charlie"),
    dave_credential_rebinding: credentialEvidence("dave"),
    dave_fork_plan: {
      actor: "user:dave",
      source_app_id: "dev-board",
      source_version_id: "v3",
      target_profile_id: "remote-postgres-docker",
      removed_capability_ids: ["apple-notes"],
      provider_specific_migration_used: false,
    },
  };
}

function credentialEvidence(userId: "charlie" | "dave"): CredentialRebindingEvidence {
  return {
    schema_version: 1,
    evidence_id: `${userId}-dev-board-bindings`,
    artifact_id: "dev-board-share",
    app_id: "dev-board",
    version_id: "v3",
    subject: `user:${userId}`,
    bindings: [
      { requirement_id: "github-user-token", provider_id: "github", status: "bound", bound_at: "2026-05-06T00:00:00.000Z", credential_ref: `credref:${userId}-github` },
      { requirement_id: "linear-user-token", provider_id: "linear", status: "bound", bound_at: "2026-05-06T00:00:00.000Z", credential_ref: `credref:${userId}-linear` },
    ],
  };
}
```

- [x] **Step 3: Keep the scenario builder test-local**

Post-review boundary correction: do not export the scenario builder from `packages/core/src/index.ts`.
The fixture stays in `tests/pressure/creation-host-rc-pressure.fixture.ts` and imports public core contracts.

This keeps `dev-board`, `mawidget`, Alice/Bob/Charlie/Dave, and other pressure-story language out of the framework package API.

- [x] **Step 4: Run the test**

Run:

```bash
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun test tests/pressure/creation-host-rc-pressure.test.ts
```

Expected: fail because the pressure verifier is declared by the test but not implemented yet.

---

### Task 3: Implement the RC Pressure Verifier

**Files:**
- Modify: `tests/pressure/creation-host-rc-pressure.fixture.ts`
- Test: `tests/pressure/creation-host-rc-pressure.test.ts`

- [x] **Step 1: Add the verifier implementation**

Append to `tests/pressure/creation-host-rc-pressure.fixture.ts`:

```ts
export function evaluateCreationHostRcPressure(
  scenario: CreationHostRcPressureScenario,
): CreationHostRcPressureReport {
  const issues = [
    ...validateBuildAgentPackageManifest(scenario.agent_package).issues.map((issue) => issue.code),
    ...validateProviderCapabilityMatrix(scenario.provider_capabilities).issues.map((issue) => issue.code),
    ...validateShareArtifactManifest(scenario.share_artifact).issues.map((issue) => issue.code),
    ...validateSharingGovernanceManifest(scenario.sharing_governance).issues.map((issue) => issue.code),
    ...validateHostAuthoringKitContracts({
      agent_package: scenario.agent_package,
      provider_capabilities: scenario.provider_capabilities,
      share_artifact: scenario.share_artifact,
    }).issues.map((issue) => issue.code),
    ...validateSharingGovernanceBundle({
      share_artifact: scenario.share_artifact,
      sharing_governance: scenario.sharing_governance,
      credential_rebinding_evidence: scenario.charlie_credential_rebinding,
      provider_capabilities: scenario.provider_capabilities,
    }).issues.map((issue) => issue.code),
    ...validateSharingGovernanceBundle({
      share_artifact: scenario.share_artifact,
      sharing_governance: scenario.sharing_governance,
      credential_rebinding_evidence: scenario.dave_credential_rebinding,
      provider_capabilities: scenario.provider_capabilities,
    }).issues.map((issue) => issue.code),
  ];

  const charlieInstall = evaluateSharingGovernance(scenario.sharing_governance, {
    action: "install",
    scope: "artifact",
    subject: "user:charlie",
    credential_rebinding_evidence: scenario.charlie_credential_rebinding,
  });

  const daveGovernance = evaluateSharingGovernance(scenario.sharing_governance, {
    action: "fork",
    scope: "forks",
    subject: "user:dave",
    credential_rebinding_evidence: scenario.dave_credential_rebinding,
  });

  const daveFork = evaluateDaveForkPlan(scenario, daveGovernance.allowed);
  if (!charlieInstall.allowed) issues.push("charlie_install.denied");
  if (!daveFork.allowed) issues.push(...daveFork.reasons);

  const policy = scenario.agent_package.provider_specialization_policy;
  return {
    ok: issues.length === 0,
    issues,
    agent_package: scenario.agent_package,
    agent_context_visible_to_builder_agent: policy.allowed_context,
    provider_specific_branching_allowed: policy.provider_specific_branches !== "forbidden",
    charlie_install: charlieInstall,
    dave_fork: daveFork,
  };
}

function evaluateDaveForkPlan(
  scenario: CreationHostRcPressureScenario,
  governanceAllowed: boolean,
): CreationHostRcForkDecision {
  const reasons: string[] = [];
  const targetProfile = scenario.provider_capabilities.profiles.find(
    (profile) => profile.profile_id === scenario.dave_fork_plan.target_profile_id,
  );
  if (!governanceAllowed) reasons.push("dave_fork.governance_denied");
  if (targetProfile === undefined) reasons.push("dave_fork.target_profile_unknown");
  if (scenario.dave_fork_plan.provider_specific_migration_used) {
    reasons.push("dave_fork.provider_specific_migration_forbidden");
  }

  const unsupported = targetProfile?.unsupported_capabilities.map((entry) => entry.capability_id) ?? [];
  for (const capabilityId of unsupported) {
    if (!scenario.dave_fork_plan.removed_capability_ids.includes(capabilityId)) {
      reasons.push(`dave_fork.unsupported_capability_not_removed:${capabilityId}`);
    }
  }

  return {
    allowed: reasons.length === 0,
    target_profile_id: scenario.dave_fork_plan.target_profile_id,
    removed_capability_ids: scenario.dave_fork_plan.removed_capability_ids,
    unsupported_capabilities_acknowledged: unsupported.filter((capabilityId) =>
      scenario.dave_fork_plan.removed_capability_ids.includes(capabilityId)
    ),
    provider_specific_migration_used: scenario.dave_fork_plan.provider_specific_migration_used,
    reasons,
  };
}
```

- [x] **Step 2: Run the test**

Run:

```bash
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun test tests/pressure/creation-host-rc-pressure.test.ts
```

Expected: pass.

- [x] **Step 3: Run focused package tests**

Run:

```bash
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun test tests/pressure/creation-host-rc-pressure.test.ts packages/core/test/developer-experience.test.ts packages/core/test/sharing-governance.test.ts
```

Expected: pass.

- [x] **Step 4: Commit**

```bash
git add tests/pressure/creation-host-rc-pressure.fixture.ts tests/pressure/creation-host-rc-pressure.test.ts
git commit -m "feat: add creation host rc pressure contract"
```

---

### Task 4: Add Negative Pressure Cases

**Files:**
- Modify: `tests/pressure/creation-host-rc-pressure.test.ts`
- Modify only if needed: `tests/pressure/creation-host-rc-pressure.fixture.ts`

- [x] **Step 1: Add negative tests**

Append to `tests/pressure/creation-host-rc-pressure.test.ts`:

```ts
test("denies Charlie install when credential evidence is stale", () => {
  const scenario = buildDevBoardRcPressureScenario();
  const report = evaluateCreationHostRcPressure({
    ...scenario,
    charlie_credential_rebinding: {
      ...scenario.charlie_credential_rebinding,
      version_id: "v2",
    },
  });

  expect(report.ok).toBe(false);
  expect(report.issues).toContain("credential_rebinding.version_id.mismatch");
  expect(report.charlie_install.allowed).toBe(false);
});

test("denies Dave fork when Apple Notes is not explicitly removed", () => {
  const scenario = buildDevBoardRcPressureScenario();
  const report = evaluateCreationHostRcPressure({
    ...scenario,
    dave_fork_plan: {
      ...scenario.dave_fork_plan,
      removed_capability_ids: [],
    },
  });

  expect(report.ok).toBe(false);
  expect(report.dave_fork.allowed).toBe(false);
  expect(report.dave_fork.reasons).toContain("dave_fork.unsupported_capability_not_removed:apple-notes");
});

test("denies Dave fork when provider-specific migration is used", () => {
  const scenario = buildDevBoardRcPressureScenario();
  const report = evaluateCreationHostRcPressure({
    ...scenario,
    dave_fork_plan: {
      ...scenario.dave_fork_plan,
      provider_specific_migration_used: true,
    },
  });

  expect(report.ok).toBe(false);
  expect(report.dave_fork.allowed).toBe(false);
  expect(report.dave_fork.reasons).toContain("dave_fork.provider_specific_migration_forbidden");
});
```

- [x] **Step 2: Run the negative tests**

Run:

```bash
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun test tests/pressure/creation-host-rc-pressure.test.ts
```

Expected: pass.

- [x] **Step 3: Commit**

```bash
git add tests/pressure/creation-host-rc-pressure.test.ts tests/pressure/creation-host-rc-pressure.fixture.ts
git commit -m "test: harden creation host rc pressure"
```

---

### Task 5: Update Roadmap and Snapshot After Verification

**Files:**
- Modify: `docs/architecture/roadmap.md`
- Create: `docs/archive/milestone-24-snapshot.md`
- Create: `docs/archive/milestone-24-snapshot.zh-CN.md`

- [x] **Step 1: Update roadmap line**

In `docs/architecture/roadmap.md`, replace:

```text
RC        Candidate release decision       ⏳ Recommended next pressure
```

with:

```text
M24       Creation Host RC pressure        ✅ Closed
RC        Candidate release decision       ⏳ Recommended next pressure
```

Only do this after M24 implementation and verification pass.

- [x] **Step 2: Create English snapshot**

Create `docs/archive/milestone-24-snapshot.md`:

```md
# Milestone 24 Snapshot — Creation Host RC Pressure

**Status:** Closed
**Date:** 2026-05-06
**Chinese version:** [milestone-24-snapshot.zh-CN.md](../../archive/milestone-24-snapshot.zh-CN.md)

## What M24 Proves

M24 proves the framework has enough Creation Host contract surface to describe the Alice/Bob/Charlie/Dave story without pretending that provider choice, credentials, and sharing are app-runtime details.

## End-to-End Story

```text
Alice prepares Creation Host contracts
  -> Bob creates and shares dev-board
  -> Charlie installs with own credentials
  -> Dave forks to a remote profile and removes Apple Notes
```

## Contract Evidence

- Build Agent Package forbids provider-specific Builder-mode branches.
- Provider Capability Matrix distinguishes local SQLite/Docker and remote Postgres/Docker profiles.
- Share Artifact excludes source database, private cache, and secrets.
- Sharing Governance Bundle binds artifact/app/version, scope, credentials, and provider matrix.
- Dave fork is allowed only when unsupported Apple Notes is removed and no provider-specific migration is used.

## Verification

```bash
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun test tests/pressure/creation-host-rc-pressure.test.ts
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun test packages/core-domain packages/core packages/cli
/opt/homebrew/bin/node node_modules/typescript/bin/tsc --noEmit -p packages/core/tsconfig.json
/opt/homebrew/bin/node node_modules/typescript/bin/tsc --noEmit -p packages/cli/tsconfig.json
git diff --check
```

## Remaining Before RC

- Real credential broker is still simulated by no-secret refs.
- Real fork materialization is still contract-level, not a deployed Host UI flow.
- The next RC decision should decide whether to build the reference Host workflow or freeze the current contract set as candidate.
```

- [x] **Step 3: Create Chinese snapshot**

Create `docs/archive/milestone-24-snapshot.zh-CN.md`:

```md
# Milestone 24 Snapshot — Creation Host RC Pressure（中文版）

**状态：** Closed
**日期：** 2026-05-06
**英文版：** [milestone-24-snapshot.md](../../archive/milestone-24-snapshot.md)

## M24 证明了什么

M24 证明 framework 已经有足够的 Creation Host contract surface，可以描述 Alice/Bob/Charlie/Dave 的真实故事，而不用把 provider choice、credential 和 sharing 误塞进 app runtime 语义里。

## 端到端故事

```text
Alice 准备 Creation Host contracts
  -> Bob 创建并分享 dev-board
  -> Charlie 用自己的凭据安装
  -> Dave fork 到远程 profile 并移除 Apple Notes
```

## Contract Evidence

- Build Agent Package 禁止 Builder-mode provider-specific branches。
- Provider Capability Matrix 区分 local SQLite/Docker 和 remote Postgres/Docker profiles。
- Share Artifact 排除 source database、private cache 和 secrets。
- Sharing Governance Bundle 绑定 artifact/app/version、scope、credentials 和 provider matrix。
- Dave fork 只有在移除 unsupported Apple Notes 且不使用 provider-specific migration 时才允许。

## Verification

```bash
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun test tests/pressure/creation-host-rc-pressure.test.ts
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun test packages/core-domain packages/core packages/cli
/opt/homebrew/bin/node node_modules/typescript/bin/tsc --noEmit -p packages/core/tsconfig.json
/opt/homebrew/bin/node node_modules/typescript/bin/tsc --noEmit -p packages/cli/tsconfig.json
git diff --check
```

## RC 前剩余问题

- Real credential broker 仍然只是 no-secret refs 模拟。
- Real fork materialization 仍然是 contract-level，不是已部署 Host UI flow。
- 下一次 RC decision 要决定：继续做 reference Host workflow，还是把当前 contract set 冻结为 candidate。
```

- [x] **Step 4: Run docs and package checks**

Run:

```bash
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun test tests/pressure/creation-host-rc-pressure.test.ts packages/core/test/developer-experience.test.ts packages/core/test/sharing-governance.test.ts
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun test packages/core-domain packages/core packages/cli
/opt/homebrew/bin/node node_modules/typescript/bin/tsc --noEmit -p packages/core/tsconfig.json
/opt/homebrew/bin/node node_modules/typescript/bin/tsc --noEmit -p packages/cli/tsconfig.json
git diff --check
```

Expected: all commands exit 0.

- [x] **Step 5: Commit**

```bash
git add docs/architecture/roadmap.md docs/archive/milestone-24-snapshot.md docs/archive/milestone-24-snapshot.zh-CN.md
git commit -m "docs: close m24 creation host rc pressure"
```

---

## Self-Review

**Spec coverage:** The plan maps the two core questions into one contract pressure test. Creation Host authoring is covered by Build Agent Package, Provider Capability Matrix, and provider-specialization policy. Sharing/governance is covered by Share Artifact, Sharing Governance Bundle, scoped install/fork decisions, and version-bound rebinding evidence.

**Placeholder scan:** This plan avoids TBD/TODO placeholders. Snapshot creation is explicitly gated until implementation passes, and every implementation step has a concrete file path and command.

**Type consistency:** The pressure fixture uses current exported types from `packages/core/src/index.ts`: `BuildAgentPackageManifest`, `ProviderCapabilityMatrix`, `ShareArtifactManifest`, `SharingGovernanceManifest`, `CredentialRebindingEvidence`, and `SharingGovernanceDecision`. M24 story-specific types remain local to `tests/pressure` and are not exported as framework API.
