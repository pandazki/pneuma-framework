import {
  validateBuildAgentPackageManifest,
  validateHostAuthoringKitContracts,
  validateProviderCapabilityMatrix,
  validateShareArtifactManifest,
  type BuildAgentPackageManifest,
  type CredentialRequirement,
  type ProviderCapabilityMatrix,
  type ShareArtifactManifest,
} from "./host-authoring.js";
import {
  evaluateSharingGovernance,
  validateSharingGovernanceBundle,
  validateSharingGovernanceManifest,
  type CredentialRebindingEvidence,
  type SharingGovernanceDecision,
  type SharingGovernanceManifest,
} from "./sharing-governance.js";

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

const githubRequirement: CredentialRequirement = {
  id: "github-user-token",
  provider_id: "github",
  scopes: ["repo", "workflow"],
  binding_mode: "per-user",
  placement: "host-broker",
  required: true,
};

const linearRequirement: CredentialRequirement = {
  id: "linear-user-token",
  provider_id: "linear",
  scopes: ["read", "write"],
  binding_mode: "per-user",
  placement: "host-broker",
  required: true,
};

export function buildDevBoardRcPressureScenario(): CreationHostRcPressureScenario {
  const agentPackage: BuildAgentPackageManifest = {
    schema_version: 1,
    package_id: "mawidget-dev-board-builder",
    version: "0.1.0",
    display_name: "Mawidget Dev Board Builder",
    instructions_path: "./agent-policy.md",
    tool_allowlist: [
      "definition.apply_change_set",
      "host.share.prepare",
      "host.fork.prepare",
    ],
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
      {
        id: "host-contract-tests",
        command: "bun test packages/core/test/creation-host-rc-pressure.test.ts",
        description: "Run M24 Host RC pressure tests.",
      },
      {
        id: "sqlite-postgres-parity",
        command: "bun test parity",
        description: "Run Host-owned SQLite/Postgres semantic parity tests.",
      },
      {
        id: "provider-contract-parity",
        command: "bun test provider-parity",
        description: "Run Host-owned external provider capability parity tests.",
      },
    ],
  };

  const providerCapabilities: ProviderCapabilityMatrix = {
    schema_version: 1,
    matrix_id: "mawidget-providers",
    capabilities: [
      {
        id: "relational-store",
        kind: "storage",
        description: "Relational app data and framework history.",
        default_fail_closed_behavior: "Reject app writes when relational storage is unavailable.",
      },
      {
        id: "github-issues",
        kind: "external-provider",
        description: "GitHub issue and pull request tracking.",
        default_fail_closed_behavior: "Disable GitHub-backed operations until credentials are rebound.",
      },
      {
        id: "linear-projects",
        kind: "external-provider",
        description: "Linear project and issue tracking.",
        default_fail_closed_behavior: "Disable Linear-backed operations until credentials are rebound.",
      },
      {
        id: "apple-notes",
        kind: "external-provider",
        description: "Local Apple Notes integration.",
        default_fail_closed_behavior: "Disable Apple Notes surfaces outside macOS local profiles.",
      },
    ],
    profiles: [
      {
        profile_id: "local-sqlite-docker",
        storage_profile: "sqlite",
        deployment_profile: "local-docker",
        supported_capabilities: [
          "relational-store",
          "github-issues",
          "linear-projects",
          "apple-notes",
        ],
        unsupported_capabilities: [],
        credential_requirements: [githubRequirement, linearRequirement],
      },
      {
        profile_id: "remote-postgres-docker",
        storage_profile: "postgres",
        deployment_profile: "remote-docker",
        supported_capabilities: [
          "relational-store",
          "github-issues",
          "linear-projects",
        ],
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
        semantic_contract:
          "Rows, app definition, app history, and policy state behave the same across SQLite and Postgres profiles.",
        verification_hook_id: "sqlite-postgres-parity",
      },
      {
        id: "github-issues-profile-parity",
        capability_id: "github-issues",
        profile_ids: ["local-sqlite-docker", "remote-postgres-docker"],
        semantic_contract:
          "GitHub issue and pull request tracking exposes the same semantic operations across local and remote profiles.",
        verification_hook_id: "provider-contract-parity",
      },
      {
        id: "linear-projects-profile-parity",
        capability_id: "linear-projects",
        profile_ids: ["local-sqlite-docker", "remote-postgres-docker"],
        semantic_contract:
          "Linear project tracking exposes the same semantic operations across local and remote profiles.",
        verification_hook_id: "provider-contract-parity",
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
        {
          id: "seed-board-columns",
          kind: "semantic-operation",
          operation_id: "seed_dev_board_defaults",
          idempotency_key: "seed-dev-board-defaults-v1",
          description: "Seed portable board defaults through semantic operations.",
        },
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
      {
        id: "charlie-install",
        subject: "user:charlie",
        actions: ["install"],
        scope: "artifact",
      },
      {
        id: "dave-fork",
        subject: "user:dave",
        actions: ["fork", "install"],
        scope: "forks",
      },
    ],
    credential_rebinding_policy: {
      required: true,
      requirements: [githubRequirement, linearRequirement],
    },
    revocation: {
      revoked: false,
    },
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
  if (!charlieInstall.allowed) {
    issues.push("charlie_install.denied");
  }

  const daveGovernance = evaluateSharingGovernance(scenario.sharing_governance, {
    action: "fork",
    scope: "forks",
    subject: "user:dave",
    credential_rebinding_evidence: scenario.dave_credential_rebinding,
  });
  const daveFork = evaluateDaveForkPlan(scenario, daveGovernance.allowed);
  if (!daveFork.allowed) {
    issues.push(...daveFork.reasons);
  }

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

  if (!governanceAllowed) {
    reasons.push("dave_fork.governance_denied");
  }
  if (targetProfile === undefined) {
    reasons.push("dave_fork.target_profile_unknown");
  }
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

function credentialEvidence(userId: "charlie" | "dave"): CredentialRebindingEvidence {
  return {
    schema_version: 1,
    evidence_id: `${userId}-dev-board-bindings`,
    artifact_id: "dev-board-share",
    app_id: "dev-board",
    version_id: "v3",
    subject: `user:${userId}`,
    bindings: [
      {
        requirement_id: "github-user-token",
        provider_id: "github",
        status: "bound",
        bound_at: "2026-05-06T00:00:00.000Z",
        credential_ref: `credref:${userId}-github`,
      },
      {
        requirement_id: "linear-user-token",
        provider_id: "linear",
        status: "bound",
        bound_at: "2026-05-06T00:00:00.000Z",
        credential_ref: `credref:${userId}-linear`,
      },
    ],
  };
}
