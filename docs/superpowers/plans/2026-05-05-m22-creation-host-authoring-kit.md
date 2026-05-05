# M22 Creation Host Authoring Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Add the first test-backed Creation Host Authoring Kit contracts so a Developer can define a Build Agent Package, provider capability matrix, credential requirements, and share artifact boundary without moving Host-owned product policy into framework core.

**Architecture:** Add a focused `packages/core/src/host-authoring.ts` contract/validator module and export it from `@pneuma-framework/core`. Extend existing developer-experience tests with red/green coverage, then add a scaffold sample that emits the new authoring files. Keep implementation pure TypeScript with no runtime dependency or provider-specific adapter.

**Tech Stack:** Bun test, TypeScript, existing `@pneuma-framework/core` package exports, existing CLI scaffold tests.

---

### Task 1: Core Host Authoring Validators

**Files:**
- Create: `packages/core/src/host-authoring.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/host-authoring.test.ts`

- [x] **Step 1: Write failing tests**

Create `packages/core/test/host-authoring.test.ts` with tests that:

```ts
import { describe, expect, test } from "bun:test";
import {
  validateBuildAgentPackageManifest,
  validateProviderCapabilityMatrix,
  validateShareArtifactManifest,
  type BuildAgentPackageManifest,
  type ProviderCapabilityMatrix,
  type ShareArtifactManifest,
} from "../src/index.js";

describe("Creation Host Authoring Kit contracts", () => {
  const credentialRequirement = {
    id: "github-user-token",
    provider_id: "github",
    scopes: ["repo", "workflow"],
    binding_mode: "per-user",
    placement: "host-broker",
    required: true,
  } as const;

  test("accepts a valid Build Agent Package manifest", () => {
    const manifest: BuildAgentPackageManifest = {
      schema_version: 1,
      package_id: "dev-board-builder",
      version: "0.1.0",
      display_name: "Dev Board Builder",
      instructions_path: "./agent-policy.md",
      tool_allowlist: ["definition.apply_change_set", "release.status"],
      provider_capability_matrix_id: "dev-board-providers",
      credential_boundary: {
        allow_secret_storage: false,
        allowed_placements: ["host-broker", "keychain"],
      },
      review_checklist: ["No provider-specific implementation in Builder mode."],
      verification_hooks: [
        { id: "contract-tests", command: "bun test", description: "Run host contract tests." },
      ],
    };

    expect(validateBuildAgentPackageManifest(manifest)).toMatchObject({
      ok: true,
      issues: [],
    });
  });

  test("rejects unsafe Build Agent Package manifests", () => {
    const result = validateBuildAgentPackageManifest({
      schema_version: 1,
      package_id: "bad-package",
      version: "0.1.0",
      display_name: "Bad Package",
      instructions_path: "./agent-policy.md",
      tool_allowlist: [],
      provider_capability_matrix_id: "dev-board-providers",
      credential_boundary: {
        allow_secret_storage: true,
        allowed_placements: ["host-broker"],
      },
      review_checklist: [],
      verification_hooks: [],
      token: "ghp_should-not-live-here",
    } as unknown as BuildAgentPackageManifest);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "build_agent_package.tool_allowlist.required",
      "build_agent_package.credential_boundary.secret_storage_forbidden",
      "build_agent_package.review_checklist.required",
      "build_agent_package.secret_material.forbidden",
    ]);
  });

  test("validates provider capability matrix fail-closed semantics", () => {
    const matrix: ProviderCapabilityMatrix = {
      schema_version: 1,
      matrix_id: "dev-board-providers",
      capabilities: [
        {
          id: "relational-store",
          kind: "storage",
          description: "Relational app data and framework history.",
          default_fail_closed_behavior: "Reject writes when relational storage is unavailable.",
        },
        {
          id: "apple-notes",
          kind: "external-provider",
          description: "Local Apple Notes integration.",
          default_fail_closed_behavior: "Disable Apple Notes views and sync.",
        },
      ],
      profiles: [
        {
          profile_id: "local-sqlite-docker",
          storage_profile: "sqlite",
          deployment_profile: "local-docker",
          supported_capabilities: ["relational-store", "apple-notes"],
          unsupported_capabilities: [],
          credential_requirements: [credentialRequirement],
        },
        {
          profile_id: "remote-postgres-docker",
          storage_profile: "postgres",
          deployment_profile: "remote-docker",
          supported_capabilities: ["relational-store"],
          unsupported_capabilities: [
            {
              capability_id: "apple-notes",
              fail_closed_behavior: "Require Builder to remove Apple Notes capability before publish.",
            },
          ],
          credential_requirements: [credentialRequirement],
        },
      ],
    };

    expect(validateProviderCapabilityMatrix(matrix)).toMatchObject({
      ok: true,
      issues: [],
    });
  });

  test("rejects provider capability matrices with unknown capabilities and missing fail-closed behavior", () => {
    const result = validateProviderCapabilityMatrix({
      schema_version: 1,
      matrix_id: "bad-matrix",
      capabilities: [
        {
          id: "relational-store",
          kind: "storage",
          description: "Relational app data.",
          default_fail_closed_behavior: "Reject unavailable storage.",
        },
      ],
      profiles: [
        {
          profile_id: "remote-postgres-docker",
          supported_capabilities: ["missing-capability"],
          unsupported_capabilities: [
            {
              capability_id: "relational-store",
              fail_closed_behavior: "",
            },
          ],
          credential_requirements: [],
        },
      ],
    } as unknown as ProviderCapabilityMatrix);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "provider_capability_matrix.profile.supported_capability.unknown",
      "provider_capability_matrix.profile.unsupported_capability.fail_closed_required",
    ]);
  });

  test("validates share artifacts as no-secret portable manifests", () => {
    const manifest: ShareArtifactManifest = {
      schema_version: 1,
      artifact_id: "dev-board-share",
      app_id: "dev-board",
      version_id: "v3",
      source_profile_id: "local-sqlite-docker",
      created_from_package_id: "dev-board-builder",
      created_from_package_version: "0.1.0",
      includes: {
        app_definition: true,
        init_recipe: true,
        provider_requirements: true,
      },
      excludes: {
        secrets: true,
        private_derived_cache: true,
      },
      credential_requirements: [credentialRequirement],
      init_recipe: {
        recipe_id: "dev-board-init",
        version: "0.1.0",
        steps: [
          {
            id: "seed-default-board",
            operation_id: "seed_defaults",
            description: "Seed portable default board rows.",
          },
        ],
      },
    };

    expect(validateShareArtifactManifest(manifest)).toMatchObject({
      ok: true,
      issues: [],
    });
  });

  test("rejects share artifacts that include secrets or private cache", () => {
    const result = validateShareArtifactManifest({
      schema_version: 1,
      artifact_id: "bad-share",
      app_id: "dev-board",
      version_id: "v3",
      source_profile_id: "local-sqlite-docker",
      created_from_package_id: "dev-board-builder",
      created_from_package_version: "0.1.0",
      includes: {
        app_definition: true,
        init_recipe: true,
        provider_requirements: true,
      },
      excludes: {
        secrets: false,
        private_derived_cache: false,
      },
      credential_requirements: [],
      init_recipe: {
        recipe_id: "dev-board-init",
        version: "0.1.0",
        steps: [],
      },
      api_key: "should-not-live-here",
    } as unknown as ShareArtifactManifest);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "share_artifact.excludes.secrets_required",
      "share_artifact.excludes.private_cache_required",
      "share_artifact.credential_requirements.required",
      "share_artifact.init_recipe.steps.required",
      "share_artifact.secret_material.forbidden",
    ]);
  });
});
```

- [x] **Step 2: Run failing tests**

Run:

```bash
bun test packages/core/test/host-authoring.test.ts
```

Expected: fail because exports/functions do not exist.

- [x] **Step 3: Implement validators**

Create `packages/core/src/host-authoring.ts` with focused interfaces and validator functions. Reuse the existing `CreationHostContractIssue` shape concept but keep the module independent to avoid coupling to workspace diagnostics.

- [x] **Step 4: Export validators**

Update `packages/core/src/index.ts` to export the new functions and types.

- [x] **Step 5: Run green tests**

Run:

```bash
bun test packages/core/test/host-authoring.test.ts packages/core/test/developer-experience.test.ts
```

Expected: all tests pass.

### Task 2: Scaffold Authoring Kit Sample Files

**Files:**
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/test/developer-experience.test.ts`

- [x] **Step 1: Write failing scaffold test**

Extend `scaffold-host writes a starter Creation Host project` to assert these files exist:

```ts
expect(existsSync(join(target, "agent-package.json"))).toBe(true);
expect(existsSync(join(target, "provider-capabilities.json"))).toBe(true);
expect(existsSync(join(target, "share-artifact.example.json"))).toBe(true);
expect(existsSync(join(target, "agent-policy.md"))).toBe(true);
```

Then import the core validators and assert the generated JSON validates.

- [x] **Step 2: Run failing CLI test**

Run:

```bash
bun test packages/cli/test/developer-experience.test.ts
```

Expected: fail because scaffold does not emit the new files.

- [x] **Step 3: Emit sample authoring files**

Update `scaffoldHost()` to write:

- `agent-package.json`
- `provider-capabilities.json`
- `share-artifact.example.json`
- `agent-policy.md`

Use the same sample ids from Task 1 so the validators pass.

- [x] **Step 4: Run green CLI test**

Run:

```bash
bun test packages/cli/test/developer-experience.test.ts
```

Expected: pass.

### Task 3: Docs And Verification

**Files:**
- Modify: `docs/developer/creation-host-contract.md`
- Modify: `docs/developer/creation-host-contract.zh-CN.md`
- Modify: `docs/developer/getting-started.md`
- Modify: `docs/developer/getting-started.zh-CN.md`

- [x] **Step 1: Document the new authoring files**

Add a compact section explaining that scaffold now includes the first M22 Host Authoring Kit files:

```text
agent-package.json
provider-capabilities.json
share-artifact.example.json
agent-policy.md
```

- [x] **Step 2: Run verification**

Run:

```bash
git diff --check
bun test packages/core/test/host-authoring.test.ts packages/core/test/developer-experience.test.ts packages/cli/test/developer-experience.test.ts
bun test packages/core-domain packages/core packages/cli
bun run typecheck
```

Expected: all pass.

### Task 5: Provider/Profile Parity Contract

**Files:**
- Modify: `packages/core/src/host-authoring.ts`
- Modify: `packages/core/src/developer-experience.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `packages/core/test/host-authoring.test.ts`
- Test: `packages/core/test/developer-experience.test.ts`
- Test: `packages/cli/test/developer-experience.test.ts`
- Docs: `docs/developer/creation-host-contract.md`
- Docs: `docs/developer/creation-host-contract.zh-CN.md`
- Docs: `docs/developer/getting-started.md`
- Docs: `docs/developer/getting-started.zh-CN.md`

- [x] **Step 1: Write failing contract tests**

Add tests proving:

- Build Agent Package must declare `provider_specialization_policy.mode = "capability-contract-only"`;
- Build Agent Package must forbid provider-specific implementation branches in normal Builder sessions;
- Provider Capability Matrix must declare parity contracts when multiple profiles support the same capability;
- parity contracts reference profile ids, capability ids, semantic contract text, and verification hook ids;
- the full authoring kit cross-check validates package/matrix/share references.

- [x] **Step 2: Implement minimal authoring contract surface**

Add:

- `BuildAgentProviderSpecializationPolicy`;
- `ProviderProfileParityContract`;
- `validateHostAuthoringKitContracts`;
- parity validation inside `validateProviderCapabilityMatrix`;
- cross-file validation inside `diagnoseCreationHostAuthoring`.

- [x] **Step 3: Update scaffold output**

Update the starter scaffold so generated files already pass M22.3:

- `agent-package.json` includes capability-contract-only policy;
- `provider-capabilities.json` includes SQLite/Postgres profile parity contracts;
- `agent-policy.md` tells the Build Agent to use capability contracts, not provider-specific branches;
- scaffold README names `validateHostAuthoringKitContracts`.

- [x] **Step 4: Update docs**

Update the English/Chinese developer docs to explain the provider portability rule:

```text
Build Agent sees capability contracts, not provider implementation branches.
Provider profiles that share a capability must name a parity contract and verification hook.
```

- [x] **Step 5: Verify**

Run:

```bash
bun test packages/core/test/host-authoring.test.ts packages/core/test/developer-experience.test.ts packages/cli/test/developer-experience.test.ts
bun test packages/core-domain packages/core packages/cli
bun run typecheck
```

Expected: all pass.

### Task 6: Share/Fork Recipe Portability Contract

**Files:**
- Modify: `packages/core/src/host-authoring.ts`
- Test: `packages/core/test/host-authoring.test.ts`
- Test: `packages/core/test/developer-experience.test.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/test/developer-experience.test.ts`
- Docs: `docs/developer/creation-host-contract.md`
- Docs: `docs/developer/creation-host-contract.zh-CN.md`
- Docs: `docs/developer/getting-started.md`
- Docs: `docs/developer/getting-started.zh-CN.md`

- [x] **Step 1: Write failing contract tests**

Add tests proving:

- share artifacts must explicitly exclude source databases in addition to secrets and private derived cache;
- init recipe steps must be semantic operations;
- init recipe steps must include `idempotency_key` so install/fork can retry safely;
- share artifacts must declare compatible target profiles and required capabilities;
- receiving Builders must re-bind credentials instead of copying the source Builder's credentials;
- cross-file validation rejects target profiles that do not support required share capabilities.

- [x] **Step 2: Implement minimal share/fork contract surface**

Extend `ShareArtifactManifest` with:

- `excludes.source_database: true`;
- `target_profile_policy.compatible_profile_ids`;
- `target_profile_policy.required_capabilities`;
- `target_profile_policy.credential_rebinding_required: true`;
- `init_recipe.steps[].kind = "semantic-operation"`;
- `init_recipe.steps[].idempotency_key`.

Add validation for raw source material keys such as `raw_sql`, `database_dump`, `sqlite_file`, and `volume_snapshot`.

- [x] **Step 3: Update scaffold output**

Update `share-artifact.example.json` and `agent-policy.md` so the starter Host already follows the M22.4 contract:

- no source database copy;
- target profile compatibility declared;
- required capabilities declared;
- credential rebinding required;
- idempotent semantic init recipe step.

- [x] **Step 4: Update docs**

Document that share/fork artifacts are portable recipes, not database copies:

```text
Share artifact excludes source database, secrets, and private derived cache.
Install/fork replays idempotent semantic init recipe steps.
Target profiles must satisfy the share artifact's required capabilities.
Installer credentials are always re-bound by the receiving Builder.
```

- [x] **Step 5: Verify**

Run:

```bash
bun test packages/core/test/host-authoring.test.ts packages/core/test/developer-experience.test.ts packages/cli/test/developer-experience.test.ts
bun test packages/core-domain packages/core packages/cli
bun run typecheck
```

Expected: all pass.

- [x] **Step 3: Commit**

```bash
git add packages/core/src/host-authoring.ts packages/core/src/index.ts packages/core/test/host-authoring.test.ts packages/cli/src/index.ts packages/cli/test/developer-experience.test.ts docs/developer/creation-host-contract.md docs/developer/creation-host-contract.zh-CN.md docs/developer/getting-started.md docs/developer/getting-started.zh-CN.md docs/superpowers/plans/2026-05-05-m22-creation-host-authoring-kit.md
git commit -m "feat: add m22 host authoring contracts"
```

### Task 4: Authoring Doctor Integration

**Files:**
- Modify: `packages/core/src/developer-experience.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/cli/src/index.ts`
- Modify: `packages/cli/src/parse-args.ts`
- Test: `packages/core/test/developer-experience.test.ts`
- Test: `packages/cli/test/developer-experience.test.ts`

- [x] **Step 1: Write failing core diagnostics tests**

Extend `packages/core/test/developer-experience.test.ts` so `diagnoseCreationHostAuthoring()` validates:

- a valid Build Agent Package manifest;
- a valid Provider Capability Matrix;
- a valid Share Artifact manifest;
- invalid authoring files with actionable issue codes.

Expected red: `diagnoseCreationHostAuthoring` and `formatCreationHostAuthoringDiagnosticsReport` are not exported.

- [x] **Step 2: Write failing CLI tests**

Extend `packages/cli/test/developer-experience.test.ts` so `doctor-host` accepts:

```bash
--agent-package <agent-package.json>
--provider-capabilities <provider-capabilities.json>
--share-artifact <share-artifact.json>
```

Expected red: `parseArgs()` rejects the new flags and `doctor-host` cannot validate authoring files.

- [x] **Step 3: Implement authoring diagnostics**

Add pure diagnostics in `packages/core/src/developer-experience.ts`:

- `diagnoseCreationHostAuthoring()`;
- `formatCreationHostAuthoringDiagnosticsReport()`;
- machine-readable summary booleans for which authoring files were checked;
- next-step text for missing files, invalid files, and healthy files.

- [x] **Step 4: Wire `doctor-host`**

Update the CLI so `doctor-host` keeps the existing profile/workspace diagnostics and optionally validates authoring files when the new flags are provided. Update the scaffolded `package.json` doctor script to run the full profile + authoring check by default.

- [x] **Step 5: Document the full doctor flow**

Update the English and Chinese developer guides so the first-run doctor command checks profile, workspace, Build Agent Package, provider capabilities, and share artifact together.

- [x] **Step 6: Verify**

Run:

```bash
git diff --check
bun test packages/core/test/developer-experience.test.ts packages/cli/test/developer-experience.test.ts
bun test packages/core-domain packages/core packages/cli
bun run typecheck
```

Expected: all pass.
