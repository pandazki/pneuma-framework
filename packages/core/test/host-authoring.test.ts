import { describe, expect, test } from "bun:test";
import {
  validateHostAuthoringKitContracts,
  validateBuildAgentPackageManifest,
  validateProviderCapabilityMatrix,
  validateScaffoldProjectManifest,
  validateShareArtifactManifest,
  type BuildAgentPackageManifest,
  type ProviderCapabilityMatrix,
  type ScaffoldProjectManifest,
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
      provider_specialization_policy: {
        mode: "capability-contract-only",
        provider_specific_branches: "forbidden",
        allowed_context: ["profile_id", "capabilities", "credential_requirements"],
      },
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
      "build_agent_package.provider_specialization_policy.required",
      "build_agent_package.credential_boundary.secret_storage_forbidden",
      "build_agent_package.review_checklist.required",
      "build_agent_package.secret_material.forbidden",
    ]);
  });

  test("rejects provider-specific context leakage in Build Agent Package manifests", () => {
    const result = validateBuildAgentPackageManifest({
      schema_version: 1,
      package_id: "bad-context",
      version: "0.1.0",
      display_name: "Bad Context",
      instructions_path: "./agent-policy.md",
      tool_allowlist: ["definition.apply_change_set"],
      provider_capability_matrix_id: "dev-board-providers",
      provider_specialization_policy: {
        mode: "capability-contract-only",
        provider_specific_branches: "forbidden",
        allowed_context: ["storage_profile"],
      },
      credential_boundary: {
        allow_secret_storage: false,
        allowed_placements: ["host-broker"],
      },
      review_checklist: ["No provider-specific implementation in Builder mode."],
      verification_hooks: [],
    } as unknown as BuildAgentPackageManifest);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "build_agent_package.provider_specialization_policy.allowed_context.invalid",
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
      parity_contracts: [
        {
          id: "relational-store-sqlite-postgres-parity",
          capability_id: "relational-store",
          profile_ids: ["local-sqlite-docker", "remote-postgres-docker"],
          semantic_contract: "Rows, schema changes, app history, and policy storage behave the same across SQLite and Postgres profiles.",
          verification_hook_id: "sqlite-postgres-parity",
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
      parity_contracts: [],
    } as unknown as ProviderCapabilityMatrix);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "provider_capability_matrix.profile.supported_capability.unknown",
      "provider_capability_matrix.profile.unsupported_capability.fail_closed_required",
    ]);
  });

  test("requires profile parity contracts for capabilities shared by multiple profiles", () => {
    const result = validateProviderCapabilityMatrix({
      schema_version: 1,
      matrix_id: "missing-parity",
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
          profile_id: "local-sqlite-docker",
          supported_capabilities: ["relational-store"],
          unsupported_capabilities: [],
          credential_requirements: [credentialRequirement],
        },
        {
          profile_id: "remote-postgres-docker",
          supported_capabilities: ["relational-store"],
          unsupported_capabilities: [],
          credential_requirements: [credentialRequirement],
        },
      ],
      parity_contracts: [],
    } as unknown as ProviderCapabilityMatrix);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain(
      "provider_capability_matrix.profile_parity.missing",
    );
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
        source_database: true,
      },
      credential_requirements: [credentialRequirement],
      target_profile_policy: {
        compatible_profile_ids: ["local-sqlite-docker", "remote-postgres-docker"],
        required_capabilities: ["relational-store"],
        credential_rebinding_required: true,
      },
      init_recipe: {
        recipe_id: "dev-board-init",
        version: "0.1.0",
        steps: [
          {
            id: "seed-default-board",
            kind: "semantic-operation",
            operation_id: "seed_defaults",
            idempotency_key: "seed-default-board-v1",
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
        source_database: false,
      },
      credential_requirements: [],
      target_profile_policy: {
        compatible_profile_ids: [],
        required_capabilities: [],
        credential_rebinding_required: false,
      },
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
      "share_artifact.excludes.source_database_required",
      "share_artifact.credential_requirements.required",
      "share_artifact.target_profile_policy.compatible_profiles.required",
      "share_artifact.target_profile_policy.required_capabilities.required",
      "share_artifact.target_profile_policy.credential_rebinding_required",
      "share_artifact.init_recipe.steps.required",
      "share_artifact.secret_material.forbidden",
    ]);
  });

  test("rejects non-idempotent or non-semantic share init recipe steps", () => {
    const result = validateShareArtifactManifest({
      schema_version: 1,
      artifact_id: "bad-init-recipe",
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
        source_database: true,
      },
      credential_requirements: [credentialRequirement],
      target_profile_policy: {
        compatible_profile_ids: ["local-sqlite-docker"],
        required_capabilities: ["relational-store"],
        credential_rebinding_required: true,
      },
      init_recipe: {
        recipe_id: "dev-board-init",
        version: "0.1.0",
        steps: [
          {
            id: "raw-seed",
            kind: "raw-sql",
            operation_id: "seed_defaults",
            idempotency_key: "",
            description: "Seed via raw SQL.",
            raw_sql: "insert into app_data values (...)",
          },
        ],
      },
    } as unknown as ShareArtifactManifest);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "share_artifact.init_recipe.step.kind.invalid",
      "share_artifact.init_recipe.step.idempotency_key.required",
      "share_artifact.raw_source_material.forbidden",
    ]);
  });

  test("validates Scaffold Project manifests for governed code-change lanes", () => {
    const manifest: ScaffoldProjectManifest = {
      schema_version: 1,
      scaffold_id: "dev-board-scaffold",
      version: "0.1.0",
      display_name: "Dev Board Scaffold",
      materialization: {
        strategy: "copy",
        source_roots: ["./scaffold"],
        exclude: ["node_modules", ".env", ".pneuma"],
      },
      artifact_boundary: {
        writable_roots: ["src/app", "src/generated"],
        protected_paths: ["scripts/publish.sh", "src/framework", "pneuma.scaffold.json"],
        generated_roots: ["src/generated"],
        share_include: ["src/app", "src/generated", "package.json"],
        share_exclude: [".env", "data", "node_modules", ".pneuma"],
      },
      agent_contract: {
        allowed_tasks: ["Modify Generated Application source files inside writable roots."],
        forbidden_tasks: ["Modify framework integration files.", "Modify publish scripts."],
        system_prompt_fragments: ["Only edit files under writable_roots."],
        tool_policy: "draft-workspace-only",
      },
      guardrails: {
        pre_proposal: [
          {
            id: "protected-files",
            kind: "command",
            command: "bun run check:protected",
            description: "Ensure protected files are unchanged before asking for approval.",
          },
          {
            id: "typecheck",
            kind: "command",
            command: "bun run typecheck",
            description: "Typecheck the draft before asking for approval.",
          },
        ],
        pre_apply: [
          {
            id: "base-snapshot",
            kind: "framework",
            framework_check: "base-snapshot-unchanged",
            description: "Ensure the approved draft still applies to the same base version.",
          },
        ],
        post_apply: [
          {
            id: "preview-health",
            kind: "framework",
            framework_check: "preview-health",
            description: "Ensure the applied version can still start preview.",
          },
        ],
      },
      lifecycle: {
        preview: { command: "bun run dev" },
        build: { command: "bun run build" },
        test: [{ command: "bun test" }],
        publish: { command: "bun run publish" },
      },
      evidence: {
        diff: true,
        checks: true,
        changed_files: true,
        preview_url: true,
      },
    };

    expect(validateScaffoldProjectManifest(manifest)).toMatchObject({
      ok: true,
      issues: [],
    });
  });

  test("rejects Scaffold Project manifests with unsafe code-change boundaries", () => {
    const result = validateScaffoldProjectManifest({
      schema_version: 1,
      scaffold_id: "bad-scaffold",
      version: "0.1.0",
      display_name: "Bad Scaffold",
      materialization: {
        strategy: "copy",
        source_roots: ["../outside"],
        exclude: [],
      },
      artifact_boundary: {
        writable_roots: ["src"],
        protected_paths: ["src/framework"],
        generated_roots: [],
        share_include: ["src"],
        share_exclude: ["node_modules"],
      },
      agent_contract: {
        allowed_tasks: [],
        forbidden_tasks: [],
        system_prompt_fragments: [],
        tool_policy: "full-workspace",
      },
      guardrails: {
        pre_proposal: [],
        pre_apply: [
          {
            id: "raw-check",
            kind: "command",
            command: "",
            description: "Broken command.",
          },
        ],
        post_apply: [
          {
            id: "unknown-framework-check",
            kind: "framework",
            framework_check: "arbitrary-provider-check",
            description: "Broken framework check.",
          },
        ],
      },
      lifecycle: {
        preview: { command: "" },
        build: { command: "bun run build" },
        test: [],
      },
      evidence: {
        diff: false,
        checks: true,
        changed_files: false,
      },
      api_key: "should-not-live-here",
    } as unknown as ScaffoldProjectManifest);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "scaffold_project.materialization.source_roots.path_escape",
      "scaffold_project.materialization.exclude.required",
      "scaffold_project.artifact_boundary.generated_roots.required",
      "scaffold_project.artifact_boundary.protected_path_under_writable_root",
      "scaffold_project.artifact_boundary.share_exclude.secrets_required",
      "scaffold_project.agent_contract.allowed_tasks.required",
      "scaffold_project.agent_contract.forbidden_tasks.required",
      "scaffold_project.agent_contract.system_prompt_fragments.required",
      "scaffold_project.agent_contract.tool_policy.invalid",
      "scaffold_project.guardrails.pre_proposal.required",
      "scaffold_project.guardrail.command.required",
      "scaffold_project.guardrail.framework_check.invalid",
      "scaffold_project.lifecycle.preview.command.required",
      "scaffold_project.lifecycle.test.required",
      "scaffold_project.evidence.diff_required",
      "scaffold_project.evidence.changed_files_required",
      "scaffold_project.secret_material.forbidden",
    ]);
  });

  test("rejects Scaffold Project manifests when writable roots overlap protected directories", () => {
    const result = validateScaffoldProjectManifest({
      schema_version: 1,
      scaffold_id: "overlap-scaffold",
      version: "0.1.0",
      display_name: "Overlap Scaffold",
      materialization: {
        strategy: "copy",
        source_roots: ["./scaffold"],
        exclude: ["node_modules", ".env"],
      },
      artifact_boundary: {
        writable_roots: ["src/framework/generated"],
        protected_paths: ["src/framework"],
        generated_roots: ["src/framework/generated"],
        share_include: ["src/framework/generated"],
        share_exclude: [".env", "data", "node_modules"],
      },
      agent_contract: {
        allowed_tasks: ["Modify generated files."],
        forbidden_tasks: ["Modify framework integration."],
        system_prompt_fragments: ["Only edit writable roots."],
        tool_policy: "draft-workspace-only",
      },
      guardrails: {
        pre_proposal: [
          {
            id: "protected-files",
            kind: "framework",
            framework_check: "protected-paths-unchanged",
            description: "Protected files are unchanged.",
          },
        ],
        pre_apply: [
          {
            id: "base-snapshot",
            kind: "framework",
            framework_check: "base-snapshot-unchanged",
            description: "Base snapshot is unchanged.",
          },
        ],
        post_apply: [
          {
            id: "preview-health",
            kind: "framework",
            framework_check: "preview-health",
            description: "Preview starts.",
          },
        ],
      },
      lifecycle: {
        preview: { command: "bun run dev" },
        build: { command: "bun run build" },
        test: [{ command: "bun test" }],
      },
      evidence: {
        diff: true,
        checks: true,
        changed_files: true,
      },
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain(
      "scaffold_project.artifact_boundary.protected_path_under_writable_root",
    );
  });

  test("validates cross-file authoring kit parity hooks and share profile references", () => {
    const agentPackage: BuildAgentPackageManifest = {
      schema_version: 1,
      package_id: "dev-board-builder",
      version: "0.1.0",
      display_name: "Dev Board Builder",
      instructions_path: "./agent-policy.md",
      tool_allowlist: ["definition.apply_change_set"],
      provider_capability_matrix_id: "dev-board-providers",
      provider_specialization_policy: {
        mode: "capability-contract-only",
        provider_specific_branches: "forbidden",
        allowed_context: ["profile_id", "capabilities"],
      },
      credential_boundary: {
        allow_secret_storage: false,
        allowed_placements: ["host-broker"],
      },
      review_checklist: ["No provider-specific implementation in Builder mode."],
      verification_hooks: [
        { id: "sqlite-postgres-parity", command: "bun test parity", description: "SQLite/PG parity." },
      ],
    };
    const matrix: ProviderCapabilityMatrix = {
      schema_version: 1,
      matrix_id: "dev-board-providers",
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
          profile_id: "local-sqlite-docker",
          supported_capabilities: ["relational-store"],
          unsupported_capabilities: [],
          credential_requirements: [credentialRequirement],
        },
        {
          profile_id: "remote-postgres-docker",
          supported_capabilities: ["relational-store"],
          unsupported_capabilities: [],
          credential_requirements: [credentialRequirement],
        },
      ],
      parity_contracts: [
        {
          id: "relational-store-sqlite-postgres-parity",
          capability_id: "relational-store",
          profile_ids: ["local-sqlite-docker", "remote-postgres-docker"],
          semantic_contract: "Relational storage behavior is equivalent for Builder-created apps.",
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
        source_database: true,
      },
      credential_requirements: [credentialRequirement],
      target_profile_policy: {
        compatible_profile_ids: ["local-sqlite-docker", "remote-postgres-docker"],
        required_capabilities: ["relational-store"],
        credential_rebinding_required: true,
      },
      init_recipe: {
        recipe_id: "dev-board-init",
        version: "0.1.0",
        steps: [
          {
            id: "seed-default-board",
            kind: "semantic-operation",
            operation_id: "seed_defaults",
            idempotency_key: "seed-default-board-v1",
            description: "Seed defaults.",
          },
        ],
      },
    };

    expect(validateHostAuthoringKitContracts({
      agent_package: agentPackage,
      provider_capabilities: matrix,
      share_artifact: shareArtifact,
    })).toMatchObject({
      ok: true,
      issues: [],
    });
  });

  test("rejects share target profiles that do not satisfy required capabilities", () => {
    const agentPackage: BuildAgentPackageManifest = {
      schema_version: 1,
      package_id: "dev-board-builder",
      version: "0.1.0",
      display_name: "Dev Board Builder",
      instructions_path: "./agent-policy.md",
      tool_allowlist: ["definition.apply_change_set"],
      provider_capability_matrix_id: "dev-board-providers",
      provider_specialization_policy: {
        mode: "capability-contract-only",
        provider_specific_branches: "forbidden",
        allowed_context: ["profile_id", "capabilities"],
      },
      credential_boundary: {
        allow_secret_storage: false,
        allowed_placements: ["host-broker"],
      },
      review_checklist: ["No provider-specific implementation in Builder mode."],
      verification_hooks: [
        { id: "sqlite-postgres-parity", command: "bun test parity", description: "SQLite/PG parity." },
      ],
    };
    const matrix: ProviderCapabilityMatrix = {
      schema_version: 1,
      matrix_id: "dev-board-providers",
      capabilities: [
        {
          id: "relational-store",
          kind: "storage",
          description: "Relational app data.",
          default_fail_closed_behavior: "Reject unavailable storage.",
        },
        {
          id: "apple-notes",
          kind: "external-provider",
          description: "Apple Notes integration.",
          default_fail_closed_behavior: "Disable notes views.",
        },
      ],
      profiles: [
        {
          profile_id: "local-sqlite-docker",
          supported_capabilities: ["relational-store", "apple-notes"],
          unsupported_capabilities: [],
          credential_requirements: [credentialRequirement],
        },
        {
          profile_id: "remote-postgres-docker",
          supported_capabilities: ["relational-store"],
          unsupported_capabilities: [
            {
              capability_id: "apple-notes",
              fail_closed_behavior: "Remove Apple Notes before publish.",
            },
          ],
          credential_requirements: [credentialRequirement],
        },
      ],
      parity_contracts: [
        {
          id: "relational-store-sqlite-postgres-parity",
          capability_id: "relational-store",
          profile_ids: ["local-sqlite-docker", "remote-postgres-docker"],
          semantic_contract: "Relational storage behavior is equivalent.",
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
        source_database: true,
      },
      credential_requirements: [credentialRequirement],
      target_profile_policy: {
        compatible_profile_ids: ["remote-postgres-docker"],
        required_capabilities: ["relational-store", "apple-notes"],
        credential_rebinding_required: true,
      },
      init_recipe: {
        recipe_id: "dev-board-init",
        version: "0.1.0",
        steps: [
          {
            id: "seed-default-board",
            kind: "semantic-operation",
            operation_id: "seed_defaults",
            idempotency_key: "seed-default-board-v1",
            description: "Seed defaults.",
          },
        ],
      },
    };

    const result = validateHostAuthoringKitContracts({
      agent_package: agentPackage,
      provider_capabilities: matrix,
      share_artifact: shareArtifact,
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "host_authoring_kit.share_artifact.target_profile_missing_capability",
    ]);
  });
});
