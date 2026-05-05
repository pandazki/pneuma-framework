import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertCreationHostProfileContract,
  createCreationHostStore,
  diagnoseCreationHostAuthoring,
  diagnoseCreationHostWorkspace,
  formatCreationHostAuthoringDiagnosticsReport,
  validateCreationHostProfileContract,
  type BuildAgentPackageManifest,
  type CreationHostProfile,
  type ProviderCapabilityMatrix,
  type ShareArtifactManifest,
} from "../src/index.js";

const validProfile: CreationHostProfile = {
  id: "knowledge-inbox-bun-sqlite",
  display_name: "Knowledge Inbox",
  description: "Capture and triage sources.",
  template_dir: "/templates/knowledge-inbox",
  stack_id: "reference-bun-sqlite",
  capabilities: ["preview", "inspect", "evolve", "publish"],
  metadata: {
    read_operation_id: "list_inbox_items",
    data_table_id: "inbox_items",
  },
};

const validAgentPackage: BuildAgentPackageManifest = {
  schema_version: 1,
  package_id: "starter-builder",
  version: "0.1.0",
  display_name: "Starter Builder Agent",
  instructions_path: "./agent-policy.md",
  tool_allowlist: ["definition.apply_change_set"],
  provider_capability_matrix_id: "starter-providers",
  provider_specialization_policy: {
    mode: "capability-contract-only",
    provider_specific_branches: "forbidden",
    allowed_context: ["profile_id", "capabilities", "credential_requirements"],
  },
  credential_boundary: {
    allow_secret_storage: false,
    allowed_placements: ["host-broker"],
  },
  review_checklist: ["No provider-specific implementation in Builder mode."],
  verification_hooks: [
    { id: "host-contract-tests", command: "bun test", description: "Run Host contract tests." },
    { id: "sqlite-postgres-parity", command: "bun test parity", description: "Run SQLite/Postgres parity tests." },
  ],
};

const validProviderMatrix: ProviderCapabilityMatrix = {
  schema_version: 1,
  matrix_id: "starter-providers",
  capabilities: [
    {
      id: "relational-store",
      kind: "storage",
      description: "Relational app data and framework history.",
      default_fail_closed_behavior: "Reject writes when relational storage is unavailable.",
    },
  ],
  profiles: [
    {
      profile_id: "starter-bun-sqlite",
      storage_profile: "sqlite",
      deployment_profile: "local-docker",
      supported_capabilities: ["relational-store"],
      unsupported_capabilities: [],
      credential_requirements: [
        {
          id: "github-user-token",
          provider_id: "github",
          scopes: ["repo"],
          binding_mode: "per-user",
          placement: "host-broker",
          required: false,
        },
      ],
    },
    {
      profile_id: "remote-postgres-docker",
      storage_profile: "postgres",
      deployment_profile: "remote-docker",
      supported_capabilities: ["relational-store"],
      unsupported_capabilities: [],
      credential_requirements: [
        {
          id: "github-user-token",
          provider_id: "github",
          scopes: ["repo"],
          binding_mode: "per-user",
          placement: "host-broker",
          required: false,
        },
      ],
    },
  ],
  parity_contracts: [
    {
      id: "relational-store-sqlite-postgres-parity",
      capability_id: "relational-store",
      profile_ids: ["starter-bun-sqlite", "remote-postgres-docker"],
      semantic_contract: "Relational app data behaves the same across SQLite and Postgres profiles.",
      verification_hook_id: "sqlite-postgres-parity",
    },
  ],
};

const validShareArtifact: ShareArtifactManifest = {
  schema_version: 1,
  artifact_id: "starter-share",
  app_id: "starter-app",
  version_id: "v0",
  source_profile_id: "starter-bun-sqlite",
  created_from_package_id: "starter-builder",
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
  credential_requirements: [
    {
      id: "github-user-token",
      provider_id: "github",
      scopes: ["repo"],
      binding_mode: "per-user",
      placement: "host-broker",
      required: false,
    },
  ],
  target_profile_policy: {
    compatible_profile_ids: ["starter-bun-sqlite", "remote-postgres-docker"],
    required_capabilities: ["relational-store"],
    credential_rebinding_required: true,
  },
  init_recipe: {
    recipe_id: "starter-init",
    version: "0.1.0",
    steps: [
      {
        id: "seed-defaults",
        kind: "semantic-operation",
        operation_id: "seed_defaults",
        idempotency_key: "seed-defaults-v1",
        description: "Seed portable defaults.",
      },
    ],
  },
};

describe("developer Creation Host contract helpers", () => {
  test("accepts framework-level valid Creation Host profiles", () => {
    const result = validateCreationHostProfileContract(validProfile);

    expect(result.ok).toBe(true);
    expect(result.profile_id).toBe("knowledge-inbox-bun-sqlite");
    expect(result.issues).toEqual([]);
  });

  test("reports actionable profile contract issues", () => {
    const result = validateCreationHostProfileContract({
      id: "Bad Profile",
      display_name: " ",
      description: "",
      template_dir: "",
      capabilities: ["preview", ""],
      metadata: {
        broken: undefined,
      },
    } as unknown as CreationHostProfile);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "profile.id.invalid",
      "profile.display_name.required",
      "profile.description.required",
      "profile.template_dir.required",
      "profile.capabilities.invalid",
      "profile.metadata.not_json",
    ]);
    expect(() => assertCreationHostProfileContract(result.profile)).toThrow(
      /profile.id.invalid/,
    );
  });

  test("diagnoses a healthy empty Creation Host workspace with next steps", () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-devx-empty-"));
    try {
      const report = diagnoseCreationHostWorkspace({
        workspace,
        profiles: [validProfile],
      });

      expect(report.ok).toBe(true);
      expect(report.summary.profile_count).toBe(1);
      expect(report.summary.project_count).toBe(0);
      expect(report.workspace_checks.map((check) => check.code)).toContain(
        "workspace.state.missing",
      );
      expect(report.next_steps).toContain(
        "Create a generated app project, then run doctor-host again to verify version directories.",
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("diagnoses missing generated-app version directories", () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-devx-broken-"));
    try {
      const store = createCreationHostStore({
        workspace,
        profiles: [validProfile],
        now: () => 123,
      });
      const { version } = store.createProject({
        app_id: "team-knowledge-inbox",
        display_name: "Team Knowledge Inbox",
        profile_id: validProfile.id,
      });
      rmSync(version.version_dir, { recursive: true, force: true });

      const report = diagnoseCreationHostWorkspace({
        workspace,
        profiles: [validProfile],
      });

      expect(report.ok).toBe(false);
      expect(report.workspace_checks).toContainEqual({
        severity: "error",
        code: "workspace.version_dir.missing",
        message: "Missing version directory for team-knowledge-inbox@v0.",
        path: version.version_dir,
      });
      expect(report.next_steps).toContain(
        "Repair or recreate missing generated-app version directories before publish/restart/rollback.",
      );
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });

  test("diagnoses valid authoring kit manifests", () => {
    const report = diagnoseCreationHostAuthoring({
      agent_package: validAgentPackage,
      provider_capabilities: validProviderMatrix,
      share_artifact: validShareArtifact,
    });

    expect(report.ok).toBe(true);
    expect(report.summary).toEqual({
      agent_package_checked: true,
      provider_capabilities_checked: true,
      share_artifact_checked: true,
    });
    expect(report.authoring_checks.map((check) => [check.kind, check.ok])).toEqual([
      ["agent_package", true],
      ["provider_capabilities", true],
      ["share_artifact", true],
      ["kit_cross_contract", true],
    ]);
    expect(formatCreationHostAuthoringDiagnosticsReport(report)).toContain(
      "Creation Host authoring diagnostics: passed",
    );
  });

  test("diagnoses invalid authoring kit manifests with actionable issue codes", () => {
    const report = diagnoseCreationHostAuthoring({
      agent_package: {
        ...validAgentPackage,
        tool_allowlist: [],
      },
      provider_capabilities: {
        ...validProviderMatrix,
        matrix_id: "wrong-provider-matrix",
        profiles: [
          {
            profile_id: "remote-postgres-docker",
            supported_capabilities: ["missing-capability"],
            unsupported_capabilities: [],
            credential_requirements: [],
          },
        ],
        parity_contracts: [],
      },
      share_artifact: {
        ...validShareArtifact,
        excludes: {
          secrets: false,
          private_derived_cache: true,
        },
      },
    } as unknown as Parameters<typeof diagnoseCreationHostAuthoring>[0]);

    expect(report.ok).toBe(false);
    expect(report.authoring_checks.flatMap((check) =>
      check.issues.map((issue) => issue.code)
    )).toEqual([
      "build_agent_package.tool_allowlist.required",
      "provider_capability_matrix.profile.supported_capability.unknown",
      "share_artifact.excludes.secrets_required",
      "share_artifact.excludes.source_database_required",
      "host_authoring_kit.provider_matrix.id_mismatch",
      "host_authoring_kit.share_artifact.source_profile_unknown",
      "host_authoring_kit.share_artifact.target_profile_unknown",
      "host_authoring_kit.share_artifact.target_profile_missing_capability",
    ]);
    expect(formatCreationHostAuthoringDiagnosticsReport(report)).toContain(
      "authoring share_artifact: failed",
    );
  });
});
