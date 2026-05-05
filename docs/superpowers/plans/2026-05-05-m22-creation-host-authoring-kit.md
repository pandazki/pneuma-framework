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

- [x] **Step 3: Commit**

```bash
git add packages/core/src/host-authoring.ts packages/core/src/index.ts packages/core/test/host-authoring.test.ts packages/cli/src/index.ts packages/cli/test/developer-experience.test.ts docs/developer/creation-host-contract.md docs/developer/creation-host-contract.zh-CN.md docs/developer/getting-started.md docs/developer/getting-started.zh-CN.md docs/superpowers/plans/2026-05-05-m22-creation-host-authoring-kit.md
git commit -m "feat: add m22 host authoring contracts"
```

