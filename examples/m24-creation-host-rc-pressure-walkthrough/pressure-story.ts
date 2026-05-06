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
  type CredentialRequirement,
  type ProviderCapabilityMatrix,
  type ShareArtifactManifest,
  type SharingGovernanceDecision,
  type SharingGovernanceManifest,
} from "../../packages/core/src/index.js";

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

export interface CreationHostRcWalkthroughStep {
  readonly id: string;
  readonly actor: string;
  readonly title: string;
  readonly intent: string;
  readonly result: "passed" | "blocked";
  readonly contract_refs: readonly string[];
  readonly evidence: readonly string[];
  readonly inspection_focus: "agent_package" | "provider_capabilities" | "share_artifact" | "sharing_governance" | "credential_evidence";
}

export interface CreationHostRcFailureCase {
  readonly id: string;
  readonly title: string;
  readonly result: "blocked";
  readonly issues: readonly string[];
  readonly evidence: readonly string[];
}

export interface CreationHostRcWalkthrough {
  readonly title: string;
  readonly subtitle: string;
  readonly scenario_label: string;
  readonly report: CreationHostRcPressureReport;
  readonly steps: readonly CreationHostRcWalkthroughStep[];
  readonly failure_cases: readonly CreationHostRcFailureCase[];
  readonly inspector: {
    readonly agent_package: BuildAgentPackageManifest;
    readonly provider_capabilities: ProviderCapabilityMatrix;
    readonly share_artifact: ShareArtifactManifest;
    readonly sharing_governance: SharingGovernanceManifest;
    readonly credential_evidence: {
      readonly charlie: CredentialRebindingEvidence;
      readonly dave: CredentialRebindingEvidence;
    };
  };
}

export type CreationHostRcWalkthroughLocale = "en" | "zh-CN";

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
        command: "bun test tests/pressure/creation-host-rc-pressure.test.ts",
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

export function buildCreationHostRcWalkthrough(
  locale: CreationHostRcWalkthroughLocale = "en",
): CreationHostRcWalkthrough {
  if (locale === "zh-CN") return buildCreationHostRcWalkthroughZhCn();
  const scenario = buildDevBoardRcPressureScenario();
  const report = evaluateCreationHostRcPressure(scenario);

  return {
    title: "M24 RC Pressure Walkthrough",
    subtitle: "Alice prepares a Creation Host, Bob shares dev-board, Charlie installs it, and Dave forks it across provider profiles without leaking provider-specific logic into the Builder agent.",
    scenario_label: "mawidget / dev-board",
    report,
    steps: [
      {
        id: "alice-prepares-host",
        actor: "Alice / Developer",
        title: "Prepare a capability-contract Build Agent package",
        intent:
          "Alice defines the Builder agent package, tool allowlist, provider boundary, credential boundary, and verification hooks before any Builder session starts.",
        result: "passed",
        contract_refs: ["BuildAgentPackageManifest", "ProviderCapabilityMatrix"],
        evidence: [
          "provider_specialization_policy.mode = capability-contract-only",
          "provider_specific_branches = forbidden",
          "agent context is limited to profile_id, capabilities, and credential_requirements",
          "raw secret storage is disallowed; credentials live behind the Host broker",
        ],
        inspection_focus: "agent_package",
      },
      {
        id: "bob-shares-artifact",
        actor: "Bob / Builder",
        title: "Share a portable app artifact, not a source database",
        intent:
          "Bob publishes dev-board v3 as a portable share artifact that contains app definition, init recipe, and provider requirements, while excluding secrets and source data.",
        result: "passed",
        contract_refs: ["ShareArtifactManifest", "SharingGovernanceManifest"],
        evidence: [
          "share artifact includes app_definition, init_recipe, and provider_requirements",
          "share artifact excludes secrets, private derived cache, and source_database",
          "governance owner is user:bob and artifact version is bound to v3",
        ],
        inspection_focus: "share_artifact",
      },
      {
        id: "charlie-installs",
        actor: "Charlie / Installer",
        title: "Install by rebinding personal GitHub and Linear credentials",
        intent:
          "Charlie accepts Bob's defaults, but the Host requires Charlie's own credential evidence before GitHub and Linear-backed operations can run.",
        result: report.charlie_install.allowed ? "passed" : "blocked",
        contract_refs: ["CredentialRebindingEvidence", "SharingGovernanceManifest"],
        evidence: [
          `decision = ${report.charlie_install.allowed ? "allowed" : "denied"} (${report.charlie_install.reason_code})`,
          `matched grants = ${report.charlie_install.matched_grants.join(", ") || "none"}`,
          "credential evidence is bound to artifact dev-board-share, app dev-board, version v3",
        ],
        inspection_focus: "credential_evidence",
      },
      {
        id: "dave-forks",
        actor: "Dave / Forking Builder",
        title: "Fork to remote Postgres + Docker with unsupported local capability removed",
        intent:
          "Dave switches the target profile from local SQLite/Docker to remote Postgres/Docker and removes Apple Notes because that local-only capability cannot publish remotely.",
        result: report.dave_fork.allowed ? "passed" : "blocked",
        contract_refs: ["ProviderCapabilityMatrix", "SharingGovernanceManifest"],
        evidence: [
          `target profile = ${report.dave_fork.target_profile_id}`,
          `removed capabilities = ${report.dave_fork.removed_capability_ids.join(", ") || "none"}`,
          `provider-specific migration used = ${String(report.dave_fork.provider_specific_migration_used)}`,
          "shared relational-store, GitHub, and Linear semantics are covered by parity hooks",
        ],
        inspection_focus: "provider_capabilities",
      },
    ],
    failure_cases: [
      staleCharlieEvidenceCase(scenario),
      missingAppleNotesRemovalCase(scenario),
      providerSpecificMigrationCase(scenario),
      wrongForkScopeCase(scenario),
    ],
    inspector: {
      agent_package: scenario.agent_package,
      provider_capabilities: scenario.provider_capabilities,
      share_artifact: scenario.share_artifact,
      sharing_governance: scenario.sharing_governance,
      credential_evidence: {
        charlie: scenario.charlie_credential_rebinding,
        dave: scenario.dave_credential_rebinding,
      },
    },
  };
}

function buildCreationHostRcWalkthroughZhCn(): CreationHostRcWalkthrough {
  const scenario = buildDevBoardRcPressureScenario();
  const report = evaluateCreationHostRcPressure(scenario);

  return {
    title: "M24 RC Pressure 中文演示",
    subtitle: "Alice 准备 Creation Host，Bob 分享 dev-board，Charlie 安装并重新绑定凭据，Dave 跨 provider profile fork，同时不让 Builder agent 写 provider-specific 逻辑。",
    scenario_label: "mawidget / dev-board",
    report,
    steps: [
      {
        id: "alice-prepares-host",
        actor: "Alice / Developer",
        title: "准备 capability-contract Build Agent package",
        intent:
          "Alice 在任何 Builder session 开始之前，先定义 Builder agent package、tool allowlist、provider boundary、credential boundary 和 verification hooks。",
        result: "passed",
        contract_refs: ["BuildAgentPackageManifest", "ProviderCapabilityMatrix"],
        evidence: [
          "provider_specialization_policy.mode = capability-contract-only",
          "provider_specific_branches = forbidden",
          "agent 只能看到 profile_id、capabilities、credential_requirements",
          "禁止原始 secret storage；credential 只能放在 Host broker 后面",
        ],
        inspection_focus: "agent_package",
      },
      {
        id: "bob-shares-artifact",
        actor: "Bob / Builder",
        title: "分享 portable app artifact，而不是分享源数据库",
        intent:
          "Bob 把 dev-board v3 发布成 portable share artifact，其中包含 app definition、init recipe 和 provider requirements，但不包含 secrets 和源数据。",
        result: "passed",
        contract_refs: ["ShareArtifactManifest", "SharingGovernanceManifest"],
        evidence: [
          "share artifact includes app_definition、init_recipe、provider_requirements",
          "share artifact excludes secrets、private derived cache、source_database",
          "governance owner 是 user:bob，artifact version 绑定到 v3",
        ],
        inspection_focus: "share_artifact",
      },
      {
        id: "charlie-installs",
        actor: "Charlie / Installer",
        title: "安装时重新绑定自己的 GitHub 和 Linear 凭据",
        intent:
          "Charlie 沿用 Bob 的默认设置，但 Host 要求 Charlie 先提供自己的 credential evidence，GitHub 和 Linear 相关能力才可以运行。",
        result: report.charlie_install.allowed ? "passed" : "blocked",
        contract_refs: ["CredentialRebindingEvidence", "SharingGovernanceManifest"],
        evidence: [
          `decision = ${report.charlie_install.allowed ? "allowed" : "denied"} (${report.charlie_install.reason_code})`,
          `matched grants = ${report.charlie_install.matched_grants.join(", ") || "none"}`,
          "credential evidence 绑定到 artifact dev-board-share、app dev-board、version v3",
        ],
        inspection_focus: "credential_evidence",
      },
      {
        id: "dave-forks",
        actor: "Dave / Forking Builder",
        title: "Fork 到 remote Postgres + Docker，并移除不支持的本地能力",
        intent:
          "Dave 把 target profile 从 local SQLite/Docker 切到 remote Postgres/Docker，并移除 Apple Notes，因为这个本地能力不能发布到远程环境。",
        result: report.dave_fork.allowed ? "passed" : "blocked",
        contract_refs: ["ProviderCapabilityMatrix", "SharingGovernanceManifest"],
        evidence: [
          `target profile = ${report.dave_fork.target_profile_id}`,
          `removed capabilities = ${report.dave_fork.removed_capability_ids.join(", ") || "none"}`,
          `provider-specific migration used = ${String(report.dave_fork.provider_specific_migration_used)}`,
          "relational-store、GitHub、Linear 的跨 profile 语义由 parity hooks 覆盖",
        ],
        inspection_focus: "provider_capabilities",
      },
    ],
    failure_cases: [
      staleCharlieEvidenceCaseZhCn(scenario),
      missingAppleNotesRemovalCaseZhCn(scenario),
      providerSpecificMigrationCaseZhCn(scenario),
      wrongForkScopeCaseZhCn(scenario),
    ],
    inspector: {
      agent_package: scenario.agent_package,
      provider_capabilities: scenario.provider_capabilities,
      share_artifact: scenario.share_artifact,
      sharing_governance: scenario.sharing_governance,
      credential_evidence: {
        charlie: scenario.charlie_credential_rebinding,
        dave: scenario.dave_credential_rebinding,
      },
    },
  };
}

function staleCharlieEvidenceCase(scenario: CreationHostRcPressureScenario): CreationHostRcFailureCase {
  const report = evaluateCreationHostRcPressure({
    ...scenario,
    charlie_credential_rebinding: {
      ...scenario.charlie_credential_rebinding,
      version_id: "v2",
    },
  });
  return {
    id: "stale-charlie-evidence",
    title: "Charlie presents credential evidence for an older artifact version",
    result: "blocked",
    issues: report.issues,
    evidence: [
      "credential_rebinding.version_id must match the shared artifact version",
      "stale approvals cannot authorize a changed portable artifact",
    ],
  };
}

function staleCharlieEvidenceCaseZhCn(scenario: CreationHostRcPressureScenario): CreationHostRcFailureCase {
  const report = evaluateCreationHostRcPressure({
    ...scenario,
    charlie_credential_rebinding: {
      ...scenario.charlie_credential_rebinding,
      version_id: "v2",
    },
  });
  return {
    id: "stale-charlie-evidence",
    title: "Charlie 提供的是旧 artifact version 的 credential evidence",
    result: "blocked",
    issues: report.issues,
    evidence: [
      "credential_rebinding.version_id 必须匹配 share artifact version",
      "portable artifact 改变后，旧 approval 不能继续授权",
    ],
  };
}

function missingAppleNotesRemovalCase(scenario: CreationHostRcPressureScenario): CreationHostRcFailureCase {
  const report = evaluateCreationHostRcPressure({
    ...scenario,
    dave_fork_plan: {
      ...scenario.dave_fork_plan,
      removed_capability_ids: [],
    },
  });
  return {
    id: "missing-apple-notes-removal",
    title: "Dave keeps Apple Notes while targeting a remote Linux-friendly profile",
    result: "blocked",
    issues: report.issues,
    evidence: [
      "remote-postgres-docker marks apple-notes as unsupported",
      "unsupported capabilities must be removed or fail closed before publish",
    ],
  };
}

function missingAppleNotesRemovalCaseZhCn(scenario: CreationHostRcPressureScenario): CreationHostRcFailureCase {
  const report = evaluateCreationHostRcPressure({
    ...scenario,
    dave_fork_plan: {
      ...scenario.dave_fork_plan,
      removed_capability_ids: [],
    },
  });
  return {
    id: "missing-apple-notes-removal",
    title: "Dave 切到远程 profile 时仍然保留 Apple Notes",
    result: "blocked",
    issues: report.issues,
    evidence: [
      "remote-postgres-docker 明确不支持 apple-notes",
      "unsupported capability 必须在 publish 前移除，否则 fail closed",
    ],
  };
}

function providerSpecificMigrationCase(scenario: CreationHostRcPressureScenario): CreationHostRcFailureCase {
  const report = evaluateCreationHostRcPressure({
    ...scenario,
    dave_fork_plan: {
      ...scenario.dave_fork_plan,
      provider_specific_migration_used: true,
    },
  });
  return {
    id: "provider-specific-migration",
    title: "Dave's Builder agent tries to branch on a provider-specific migration",
    result: "blocked",
    issues: report.issues,
    evidence: [
      "Builder-mode agent must operate through semantic capability contracts",
      "Alice's Host owns SQLite/Postgres parity, not Bob or Dave's agent session",
    ],
  };
}

function providerSpecificMigrationCaseZhCn(scenario: CreationHostRcPressureScenario): CreationHostRcFailureCase {
  const report = evaluateCreationHostRcPressure({
    ...scenario,
    dave_fork_plan: {
      ...scenario.dave_fork_plan,
      provider_specific_migration_used: true,
    },
  });
  return {
    id: "provider-specific-migration",
    title: "Dave 的 Builder agent 试图写 provider-specific migration 分支",
    result: "blocked",
    issues: report.issues,
    evidence: [
      "Builder-mode agent 必须通过 semantic capability contracts 工作",
      "SQLite/Postgres parity 是 Alice 的 Host 职责，不是 Bob 或 Dave 的 agent session 职责",
    ],
  };
}

function wrongForkScopeCase(scenario: CreationHostRcPressureScenario): CreationHostRcFailureCase {
  const report = evaluateCreationHostRcPressure({
    ...scenario,
    sharing_governance: {
      ...scenario.sharing_governance,
      rights: scenario.sharing_governance.rights.map((grant) =>
        grant.id === "dave-fork" ? { ...grant, scope: "artifact" } : grant
      ),
    },
  });
  return {
    id: "wrong-fork-scope",
    title: "Dave has a grant, but it is scoped to artifact install instead of forks",
    result: "blocked",
    issues: report.issues,
    evidence: [
      "grant subject and action are not enough",
      "scope must match the sharing surface being authorized",
    ],
  };
}

function wrongForkScopeCaseZhCn(scenario: CreationHostRcPressureScenario): CreationHostRcFailureCase {
  const report = evaluateCreationHostRcPressure({
    ...scenario,
    sharing_governance: {
      ...scenario.sharing_governance,
      rights: scenario.sharing_governance.rights.map((grant) =>
        grant.id === "dave-fork" ? { ...grant, scope: "artifact" } : grant
      ),
    },
  });
  return {
    id: "wrong-fork-scope",
    title: "Dave 虽然有 grant，但 scope 是 artifact install，不是 forks",
    result: "blocked",
    issues: report.issues,
    evidence: [
      "只匹配 subject 和 action 不够",
      "grant scope 必须匹配正在授权的 sharing surface",
    ],
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
