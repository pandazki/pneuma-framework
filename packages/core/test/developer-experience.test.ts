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
  type CredentialRebindingEvidence,
  type CreationHostProfile,
  type HostExtensionManifest,
  type HostExtensionSlotRegistry,
  type ProviderCapabilityMatrix,
  type ScaffoldProjectManifest,
  type ShareArtifactManifest,
  type SharingGovernanceManifest,
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

const validSharingGovernance: SharingGovernanceManifest = {
  schema_version: 1,
  governance_id: "starter-sharing",
  artifact_id: "starter-share",
  app_id: "starter-app",
  version_id: "v0",
  owner: "user:alice",
  maintainers: ["user:alice"],
  operators: ["user:alice"],
  lineage: {},
  rights: [
    {
      id: "builder-install",
      subject: "user:bob",
      actions: ["install", "fork"],
      scope: "artifact",
    },
  ],
  credential_rebinding_policy: {
    required: true,
    requirements: validShareArtifact.credential_requirements,
  },
  revocation: {
    revoked: false,
  },
};

const validCredentialRebindingEvidence: CredentialRebindingEvidence = {
  schema_version: 1,
  evidence_id: "bob-starter-bindings",
  artifact_id: "starter-share",
  app_id: "starter-app",
  version_id: "v0",
  subject: "user:bob",
  bindings: [
    {
      requirement_id: "github-user-token",
      provider_id: "github",
      status: "bound",
      bound_at: "2026-05-06T00:00:00.000Z",
      credential_ref: "credref:bob-github",
    },
  ],
};

const validScaffoldProject: ScaffoldProjectManifest = {
  schema_version: 1,
  scaffold_id: "starter-scaffold",
  version: "0.1.0",
  display_name: "Starter Scaffold",
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
        description: "Ensure protected files are unchanged.",
      },
      {
        id: "typecheck",
        kind: "command",
        command: "bun run typecheck",
        description: "Typecheck the draft before asking for Builder approval.",
      },
    ],
    pre_apply: [
      {
        id: "base-snapshot",
        kind: "framework",
        framework_check: "base-snapshot-unchanged",
        description: "Ensure approved draft still targets the same base.",
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

const validExtensionSlots: HostExtensionSlotRegistry = {
  schema_version: 1,
  host_id: "starter-host",
  slots: [
    {
      slot_id: "dashboard-widget",
      kind: "ui",
      display_name: "Dashboard Widget",
      description: "Mounts a Host-approved widget in the generated dashboard.",
      runtime_modes: ["preview", "published"],
      accepted_artifact_kinds: ["tsx-module"],
      required_capabilities: ["relational-store"],
    },
  ],
};

const validHostExtension: HostExtensionManifest = {
  schema_version: 1,
  extension_id: "priority-widget",
  version: "0.1.0",
  display_name: "Priority Widget",
  description: "Adds a portable priority widget contribution.",
  created_from: {
    app_id: "starter-app",
    version_id: "v1",
    scaffold_id: "starter-scaffold",
    scaffold_version: "0.1.0",
    package_id: "starter-builder",
    package_version: "0.1.0",
  },
  bundle: {
    root: "extensions/priority-widget",
    include: ["src/widget.tsx", "manifest.json"],
    exclude: [".env", "data", "node_modules", ".pneuma"],
  },
  slots: [
    {
      id: "main-widget",
      slot_id: "dashboard-widget",
      kind: "ui",
      artifact_kind: "tsx-module",
      artifact_path: "src/widget.tsx",
      export_name: "PriorityWidget",
      runtime_modes: ["preview", "published"],
      required_capabilities: ["relational-store"],
    },
  ],
  credential_requirements: [],
  target_profile_policy: {
    compatible_profile_ids: ["starter-bun-sqlite"],
    required_capabilities: ["relational-store"],
  },
  governance: {
    install_requires_approval: true,
    update_requires_approval: true,
    uninstall_requires_approval: true,
    conflict_behavior: "fail-closed",
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
      scaffold_project_checked: false,
      agent_package_checked: true,
      provider_capabilities_checked: true,
      share_artifact_checked: true,
      sharing_governance_checked: false,
      credential_rebinding_checked: false,
      host_extension_slots_checked: false,
      host_extension_checked: false,
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

  test("diagnoses valid Scaffold Project manifests", () => {
    const report = diagnoseCreationHostAuthoring({
      scaffold_project: validScaffoldProject,
    });

    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({
      scaffold_project_checked: true,
    });
    expect(report.authoring_checks.map((check) => [check.kind, check.ok])).toEqual([
      ["scaffold_project", true],
    ]);
    expect(formatCreationHostAuthoringDiagnosticsReport(report)).toContain(
      "authoring scaffold_project: ok",
    );
  });

  test("diagnoses valid HostExtension slot and manifest files", () => {
    const report = diagnoseCreationHostAuthoring({
      host_extension_slots: validExtensionSlots,
      host_extension: validHostExtension,
    });

    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({
      host_extension_slots_checked: true,
      host_extension_checked: true,
    });
    expect(report.authoring_checks.map((check) => [check.kind, check.ok])).toEqual([
      ["host_extension_slots", true],
      ["host_extension", true],
      ["host_extension_bundle", true],
    ]);
    expect(formatCreationHostAuthoringDiagnosticsReport(report)).toContain(
      "authoring host_extension_bundle: ok",
    );
  });

  test("diagnoses HostExtension bundles that target missing slots", () => {
    const report = diagnoseCreationHostAuthoring({
      host_extension_slots: validExtensionSlots,
      host_extension: {
        ...validHostExtension,
        slots: [
          {
            ...validHostExtension.slots[0],
            slot_id: "missing-slot",
          },
        ],
      },
    });

    expect(report.ok).toBe(false);
    expect(report.summary).toMatchObject({
      host_extension_slots_checked: true,
      host_extension_checked: true,
    });
    expect(report.authoring_checks.map((check) => [check.kind, check.ok])).toEqual([
      ["host_extension_slots", true],
      ["host_extension", true],
      ["host_extension_bundle", false],
    ]);
    expect(report.authoring_checks.flatMap((check) =>
      check.issues.map((issue) => issue.code)
    )).toContain("host_extension_bundle.slot.unknown");
  });

  test("diagnoses invalid Scaffold Project manifests before Builder approval", () => {
    const report = diagnoseCreationHostAuthoring({
      scaffold_project: {
        ...validScaffoldProject,
        guardrails: {
          ...validScaffoldProject.guardrails,
          pre_proposal: [],
        },
      },
    });

    expect(report.ok).toBe(false);
    expect(report.authoring_checks.map((check) => [check.kind, check.ok])).toEqual([
      ["scaffold_project", false],
    ]);
    expect(report.authoring_checks.flatMap((check) =>
      check.issues.map((issue) => issue.code)
    )).toContain("scaffold_project.guardrails.pre_proposal.required");
    expect(formatCreationHostAuthoringDiagnosticsReport(report)).toContain(
      "authoring scaffold_project: failed",
    );
  });

  test("diagnoses valid sharing governance files", () => {
    const report = diagnoseCreationHostAuthoring({
      agent_package: validAgentPackage,
      provider_capabilities: validProviderMatrix,
      share_artifact: validShareArtifact,
      sharing_governance: validSharingGovernance,
      credential_rebinding_evidence: validCredentialRebindingEvidence,
    });

    expect(report.ok).toBe(true);
    expect(report.summary).toMatchObject({
      sharing_governance_checked: true,
      credential_rebinding_checked: true,
    });
    expect(report.authoring_checks.map((check) => [check.kind, check.ok])).toContainEqual([
      "sharing_governance",
      true,
    ]);
    expect(report.authoring_checks.map((check) => [check.kind, check.ok])).toContainEqual([
      "credential_rebinding",
      true,
    ]);
    expect(report.authoring_checks.map((check) => [check.kind, check.ok])).toContainEqual([
      "sharing_governance_bundle",
      true,
    ]);
    expect(formatCreationHostAuthoringDiagnosticsReport(report)).toContain(
      "authoring sharing_governance: ok",
    );
  });

  test("diagnoses share artifact and governance version mismatches", () => {
    const report = diagnoseCreationHostAuthoring({
      agent_package: validAgentPackage,
      provider_capabilities: validProviderMatrix,
      share_artifact: validShareArtifact,
      sharing_governance: {
        ...validSharingGovernance,
        version_id: "v1",
      },
      credential_rebinding_evidence: {
        ...validCredentialRebindingEvidence,
        version_id: "v1",
      },
    });

    expect(report.ok).toBe(false);
    expect(report.authoring_checks.map((check) => [check.kind, check.ok])).toContainEqual([
      "sharing_governance_bundle",
      false,
    ]);
    expect(report.authoring_checks.flatMap((check) =>
      check.issues.map((issue) => issue.code)
    )).toContain("sharing_governance_bundle.version_id_mismatch");
  });

  test("diagnoses share artifact and governance credential requirement drift", () => {
    const report = diagnoseCreationHostAuthoring({
      agent_package: validAgentPackage,
      provider_capabilities: validProviderMatrix,
      share_artifact: validShareArtifact,
      sharing_governance: {
        ...validSharingGovernance,
        credential_rebinding_policy: {
          required: true,
          requirements: [
            ...validSharingGovernance.credential_rebinding_policy.requirements,
            {
              id: "linear-user-token",
              provider_id: "linear",
              scopes: ["read"],
              binding_mode: "per-user",
              placement: "host-broker",
              required: false,
            },
          ],
        },
      },
      credential_rebinding_evidence: {
        ...validCredentialRebindingEvidence,
        bindings: [
          ...validCredentialRebindingEvidence.bindings,
          {
            requirement_id: "linear-user-token",
            provider_id: "linear",
            status: "bound",
            bound_at: "2026-05-06T00:00:00.000Z",
            credential_ref: "credref:bob-linear",
          },
        ],
      },
    });

    expect(report.ok).toBe(false);
    expect(report.authoring_checks.flatMap((check) =>
      check.issues.map((issue) => issue.code)
    )).toContain("sharing_governance_bundle.credential_requirements_mismatch");
  });

  test("diagnoses invalid sharing governance files", () => {
    const report = diagnoseCreationHostAuthoring({
      sharing_governance: {
        ...validSharingGovernance,
        owner: "",
      },
      credential_rebinding_evidence: {
        ...validCredentialRebindingEvidence,
        bindings: [
          {
            requirement_id: "missing-token",
            provider_id: "github",
            status: "bound",
            credential_ref: "credref:missing",
            access_token: "ghp_should-not-live-here",
          },
        ],
      } as unknown as CredentialRebindingEvidence,
    });

    expect(report.ok).toBe(false);
    expect(report.authoring_checks.flatMap((check) =>
      check.issues.map((issue) => issue.code)
    )).toEqual([
      "sharing_governance.owner.invalid",
      "credential_rebinding.binding.requirement_unknown",
      "credential_rebinding.secret_material.forbidden",
    ]);
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
