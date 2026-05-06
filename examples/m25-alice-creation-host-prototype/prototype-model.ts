import {
  validateBuildAgentPackageManifest,
  validateHostAuthoringKitContracts,
  validateProviderCapabilityMatrix,
  validateShareArtifactManifest,
  validateSharingGovernanceBundle,
  validateSharingGovernanceManifest,
} from "../../packages/core/src/index.js";
import {
  buildDevBoardRcPressureScenario,
  evaluateCreationHostRcPressure,
  type CreationHostRcPressureReport,
  type CreationHostRcPressureScenario,
} from "../m24-creation-host-rc-pressure-walkthrough/pressure-story.js";

export type M25StageStatus = "pending" | "completed";
export type M25EvidenceStatus = "pass" | "watch";
export type M25InspectorKey =
  | "artifact_model"
  | "agent_package"
  | "provider_matrix"
  | "generated_app"
  | "share_artifact"
  | "governance"
  | "credential_evidence";

export interface M25EvidenceItem {
  readonly id: string;
  readonly status: M25EvidenceStatus;
  readonly label: string;
  readonly source: string;
  readonly detail: string;
}

export interface M25DeveloperStage {
  readonly id: string;
  readonly order: number;
  readonly title: string;
  readonly developer_question: string;
  readonly mental_shift: string;
  readonly alice_action: string;
  readonly framework_contracts: readonly string[];
  readonly evidence_ids: readonly string[];
  readonly inspector_focus: M25InspectorKey;
  readonly status: M25StageStatus;
}

export interface M25GeneratedAppPreview {
  readonly app_id: string;
  readonly display_name: string;
  readonly current_version_id: string;
  readonly builder: string;
  readonly selected_profile_id: string;
  readonly modules: readonly {
    readonly id: string;
    readonly label: string;
    readonly capability_id: string;
    readonly local_profile: "supported" | "unsupported";
    readonly remote_profile: "supported" | "unsupported";
  }[];
}

export interface M25BuilderTranscriptEntry {
  readonly speaker: "builder" | "agent" | "framework";
  readonly text: string;
  readonly evidence_ids: readonly string[];
}

export interface M25PrototypeModel {
  readonly title: string;
  readonly subtitle: string;
  readonly completed_stage_ids: readonly string[];
  readonly rc_ready: boolean;
  readonly stages: readonly M25DeveloperStage[];
  readonly evidence: readonly M25EvidenceItem[];
  readonly generated_app: M25GeneratedAppPreview;
  readonly transcript: readonly M25BuilderTranscriptEntry[];
  readonly rc_pressure_report: CreationHostRcPressureReport;
  readonly inspector: Record<M25InspectorKey, unknown>;
}

export const M25_STAGE_IDS = [
  "name-the-product-layer",
  "choose-host-profile",
  "package-build-agent",
  "declare-provider-contracts",
  "create-dev-board",
  "run-builder-session",
  "prepare-portable-share",
  "validate-charlie-install",
  "validate-dave-fork",
  "make-rc-judgment",
] as const;

export type M25StageId = typeof M25_STAGE_IDS[number];

export function buildM25PrototypeModel(completedStageIds: readonly string[] = []): M25PrototypeModel {
  const scenario = buildDevBoardRcPressureScenario();
  const report = evaluateCreationHostRcPressure(scenario);
  const completed = new Set(completedStageIds.filter((id) => M25_STAGE_IDS.includes(id as M25StageId)));
  const evidence = buildEvidence(scenario, report);
  const stages = buildStages(completed);

  return {
    title: "M25 Alice Creation Host Prototype",
    subtitle:
      "A Developer-first walkthrough: Alice learns the framework boundary, authors a Creation Host, and uses Bob/Charlie/Dave to validate the Host contract.",
    completed_stage_ids: [...completed],
    rc_ready: report.ok && M25_STAGE_IDS.every((id) => completed.has(id)),
    stages,
    evidence,
    generated_app: buildGeneratedAppPreview(),
    transcript: buildBuilderTranscript(),
    rc_pressure_report: report,
    inspector: {
      artifact_model: buildArtifactModel(),
      agent_package: scenario.agent_package,
      provider_matrix: scenario.provider_capabilities,
      generated_app: buildGeneratedAppPreview(),
      share_artifact: scenario.share_artifact,
      governance: scenario.sharing_governance,
      credential_evidence: {
        charlie: scenario.charlie_credential_rebinding,
        dave: scenario.dave_credential_rebinding,
      },
    },
  };
}

export function runM25PrototypeStage(
  completedStageIds: readonly string[],
  stageId: string,
): M25PrototypeModel {
  if (!M25_STAGE_IDS.includes(stageId as M25StageId)) {
    throw new Error(`unknown M25 stage: ${stageId}`);
  }
  const completed = new Set(completedStageIds);
  completed.add(stageId);
  return buildM25PrototypeModel([...completed]);
}

function buildStages(completed: ReadonlySet<string>): readonly M25DeveloperStage[] {
  return [
    {
      id: "name-the-product-layer",
      order: 1,
      title: "先命名四层产品边界",
      developer_question: "我到底是在写一个 app，还是在写一个 app builder？",
      mental_shift: "pneuma-framework 是 primitive；Alice 要写的是 Creation Host；Bob 创建的是 Generated Application。",
      alice_action: "把 framework -> Creation Host -> Generated Application -> Published Application 作为 Host 的第一屏解释模型。",
      framework_contracts: ["Creation Host model", "Developer / Builder / End User roles"],
      evidence_ids: ["artifact-model-boundary"],
      inspector_focus: "artifact_model",
      status: status(completed, "name-the-product-layer"),
    },
    {
      id: "choose-host-profile",
      order: 2,
      title: "选择 Host 暴露给 Builder 的产品 profile",
      developer_question: "Bob 能自由选任意技术栈吗，还是 Alice 先定义可用 profile？",
      mental_shift: "自由度来自 Host profile，而不是让 Builder agent 从零猜工程架构。",
      alice_action: "定义 dev-board profile：local SQLite/Docker 与 remote Postgres/Docker 两条可验证 profile。",
      framework_contracts: ["ProviderCapabilityMatrix", "CreationHostProfile"],
      evidence_ids: ["provider-matrix-valid", "provider-parity-present"],
      inspector_focus: "provider_matrix",
      status: status(completed, "choose-host-profile"),
    },
    {
      id: "package-build-agent",
      order: 3,
      title: "准备 Bob 的 Build Agent Package",
      developer_question: "Bob 的 agent 是谁准备的？它知道什么，不该知道什么？",
      mental_shift: "Build Agent Package 是 Alice 写给 Builder agent 的 guardrail package；Builder session 是 Bob 使用时产生的实例。",
      alice_action: "声明 tool allowlist、provider-specialization policy、credential boundary、review checklist。",
      framework_contracts: ["BuildAgentPackageManifest", "validateBuildAgentPackageManifest"],
      evidence_ids: ["agent-package-valid", "agent-provider-branching-forbidden", "credential-boundary-no-secret"],
      inspector_focus: "agent_package",
      status: status(completed, "package-build-agent"),
    },
    {
      id: "declare-provider-contracts",
      order: 4,
      title: "把 provider 差异提升成 capability contract",
      developer_question: "如果 Dave 从 SQLite 切到 Postgres，agent 要不要写特殊迁移？",
      mental_shift: "Agent 只消费 capability contract；SQLite/Postgres parity 是 Alice 的 Host 责任。",
      alice_action: "为 relational-store、GitHub、Linear 写 parity hooks；把 Apple Notes 标为 local-only capability。",
      framework_contracts: ["ProviderProfileParityContract", "fail-closed unsupported capabilities"],
      evidence_ids: ["provider-parity-present", "apple-notes-local-only"],
      inspector_focus: "provider_matrix",
      status: status(completed, "declare-provider-contracts"),
    },
    {
      id: "create-dev-board",
      order: 5,
      title: "创建 Bob 的 dev-board Generated Application",
      developer_question: "Builder 创建出来的东西存在哪里，它和 Host 是什么关系？",
      mental_shift: "dev-board 是 Generated Application，拥有自己的 definition、data、versions 和 release history。",
      alice_action: "让 Host 创建 dev-board@v3 的预览状态，并展示 GitHub、Linear、CI、Apple Notes 模块。",
      framework_contracts: ["CreationHostProject", "CreationHostVersion", "Generated Application"],
      evidence_ids: ["generated-app-versioned", "builder-session-contract-bound"],
      inspector_focus: "generated_app",
      status: status(completed, "create-dev-board"),
    },
    {
      id: "run-builder-session",
      order: 6,
      title: "跑一次 Builder agent session",
      developer_question: "Bob 用自然语言提需求时，Host 如何避免 agent 乱改边界？",
      mental_shift: "对话必须配合 preview、inspect、approval、evidence；agent 通过 semantic tools 改 Host 允许的东西。",
      alice_action: "模拟 Bob 的 dev-board builder session，验证 agent 使用 capability context 而不是 provider-specific 分支。",
      framework_contracts: ["Build Agent Session", "semantic tool allowlist", "approval/evidence loop"],
      evidence_ids: ["agent-provider-branching-forbidden", "builder-session-contract-bound"],
      inspector_focus: "agent_package",
      status: status(completed, "run-builder-session"),
    },
    {
      id: "prepare-portable-share",
      order: 7,
      title: "准备 portable share artifact",
      developer_question: "Bob 分享给 Charlie 的到底是什么？",
      mental_shift: "分享的是 portable artifact + init recipe + provider requirements，不是 Bob 的数据库或 token。",
      alice_action: "生成 dev-board-share@v3，并把 secrets、source database、private cache 排除在 artifact 外。",
      framework_contracts: ["ShareArtifactManifest", "validateShareArtifactManifest"],
      evidence_ids: ["share-artifact-valid", "share-artifact-no-source-db"],
      inspector_focus: "share_artifact",
      status: status(completed, "prepare-portable-share"),
    },
    {
      id: "validate-charlie-install",
      order: 8,
      title: "验证 Charlie install",
      developer_question: "Charlie 可以直接沿用 Bob 的默认设置吗？凭据怎么办？",
      mental_shift: "默认设置可以沿用；credential 必须由 Charlie 重新绑定，并绑定 artifact/app/version/subject。",
      alice_action: "用 Sharing Governance 和 Credential Rebinding Evidence 验证 Charlie 的 install decision。",
      framework_contracts: ["SharingGovernanceManifest", "CredentialRebindingEvidence", "evaluateSharingGovernance"],
      evidence_ids: ["charlie-install-allowed", "credential-evidence-version-bound"],
      inspector_focus: "credential_evidence",
      status: status(completed, "validate-charlie-install"),
    },
    {
      id: "validate-dave-fork",
      order: 9,
      title: "验证 Dave fork 到 remote profile",
      developer_question: "Dave 是 Linux 专家，他要 fork 到云端 Postgres，什么必须被阻断？",
      mental_shift: "fork 可以切 provider profile，但必须移除 unsupported capability，并保持 provider-specific migration forbidden。",
      alice_action: "验证 Dave 有 forks scope grant，移除 Apple Notes，并且没有 provider-specific migration。",
      framework_contracts: ["SharingScope=forks", "ProviderCapabilityMatrix", "fork fail-closed checks"],
      evidence_ids: ["dave-fork-allowed", "apple-notes-local-only", "provider-specific-migration-blocked"],
      inspector_focus: "provider_matrix",
      status: status(completed, "validate-dave-fork"),
    },
    {
      id: "make-rc-judgment",
      order: 10,
      title: "形成 Alice 的 RC 判断",
      developer_question: "基于这个 prototype，Alice 可以真正开始写自己的 Creation Host 吗？",
      mental_shift: "可以开始真实原型；仍不宣称生产 IAM、OAuth、marketplace、真实 Postgres adapter 已完成。",
      alice_action: "把 Host authoring path、share/fork path、known productization gaps 作为 RC 分享材料。",
      framework_contracts: ["RC evidence", "known productization gaps"],
      evidence_ids: ["rc-pressure-passed", "productization-gaps-explicit"],
      inspector_focus: "artifact_model",
      status: status(completed, "make-rc-judgment"),
    },
  ];
}

function buildEvidence(
  scenario: CreationHostRcPressureScenario,
  report: CreationHostRcPressureReport,
): readonly M25EvidenceItem[] {
  return [
    {
      id: "artifact-model-boundary",
      status: "pass",
      label: "四层模型被显式保留",
      source: "PRODUCT.md / AGENTS.md",
      detail: "framework -> Creation Host -> Generated Application -> Published Application 没有被折叠成一个 pneuma app。",
    },
    {
      id: "agent-package-valid",
      status: validateBuildAgentPackageManifest(scenario.agent_package).ok ? "pass" : "watch",
      label: "Build Agent Package 通过 validator",
      source: "validateBuildAgentPackageManifest",
      detail: "Alice 的 agent package 声明 instructions、tool allowlist、provider policy、credential boundary 和 verification hooks。",
    },
    {
      id: "agent-provider-branching-forbidden",
      status: report.provider_specific_branching_allowed ? "watch" : "pass",
      label: "Builder agent 不允许 provider-specific branching",
      source: "BuildAgentProviderSpecializationPolicy",
      detail: "agent 只能看到 profile_id、capabilities、credential_requirements，不能根据 SQLite/Postgres 写特殊路径。",
    },
    {
      id: "credential-boundary-no-secret",
      status: scenario.agent_package.credential_boundary.allow_secret_storage ? "watch" : "pass",
      label: "Credential boundary 禁止原始 secret storage",
      source: "BuildAgentPackageManifest.credential_boundary",
      detail: "凭据只能通过 Host broker/keychain/secret-manager 这类 placement 进入，不能进入 generated app data 或 transcripts。",
    },
    {
      id: "provider-matrix-valid",
      status: validateProviderCapabilityMatrix(scenario.provider_capabilities).ok ? "pass" : "watch",
      label: "Provider Capability Matrix 通过 validator",
      source: "validateProviderCapabilityMatrix",
      detail: "local SQLite/Docker 与 remote Postgres/Docker profile 都声明了 supported/unsupported capabilities。",
    },
    {
      id: "provider-parity-present",
      status: validateHostAuthoringKitContracts({
        agent_package: scenario.agent_package,
        provider_capabilities: scenario.provider_capabilities,
        share_artifact: scenario.share_artifact,
      }).ok ? "pass" : "watch",
      label: "跨 profile capability 有 parity hooks",
      source: "validateHostAuthoringKitContracts",
      detail: "relational-store、GitHub、Linear 这些跨 profile capability 都有 semantic parity contract。",
    },
    {
      id: "apple-notes-local-only",
      status: "pass",
      label: "Apple Notes 被显式标成 local-only capability",
      source: "ProviderCapabilityMatrixProfile.unsupported_capabilities",
      detail: "remote-postgres-docker 不支持 apple-notes，Dave fork 时必须移除它。",
    },
    {
      id: "generated-app-versioned",
      status: "pass",
      label: "dev-board 被建模为 versioned Generated Application",
      source: "M25 example runtime",
      detail: "Bob 的 dev-board 不是 Creation Host 本身，而是 Host 管理的 Generated Application。",
    },
    {
      id: "builder-session-contract-bound",
      status: "pass",
      label: "Builder session 被 Host contract 约束",
      source: "M25 transcript",
      detail: "Bob 的自然语言需求会转成 Host 允许的 semantic actions，而不是让 agent 直接拥有 provider 实现细节。",
    },
    {
      id: "share-artifact-valid",
      status: validateShareArtifactManifest(scenario.share_artifact).ok ? "pass" : "watch",
      label: "Share Artifact 通过 validator",
      source: "validateShareArtifactManifest",
      detail: "artifact 包含 definition、init recipe、provider requirements，并声明 credential rebinding required。",
    },
    {
      id: "share-artifact-no-source-db",
      status: "pass",
      label: "Share Artifact 不包含源数据库、secret、private cache",
      source: "ShareArtifactManifest.excludes",
      detail: "Bob 分享的是 portable recipe，不是 Bob 的 SQLite volume 或 provider tokens。",
    },
    {
      id: "charlie-install-allowed",
      status: report.charlie_install.allowed ? "pass" : "watch",
      label: "Charlie install 被 governance 允许",
      source: "evaluateSharingGovernance(action=install, scope=artifact)",
      detail: `matched grants: ${report.charlie_install.matched_grants.join(", ") || "none"}`,
    },
    {
      id: "credential-evidence-version-bound",
      status: validateSharingGovernanceBundle({
        share_artifact: scenario.share_artifact,
        sharing_governance: scenario.sharing_governance,
        credential_rebinding_evidence: scenario.charlie_credential_rebinding,
        provider_capabilities: scenario.provider_capabilities,
      }).ok ? "pass" : "watch",
      label: "Credential evidence 绑定 artifact/app/version/subject",
      source: "validateSharingGovernanceBundle",
      detail: "旧 version 的 credential evidence 不能授权新的 portable artifact。",
    },
    {
      id: "dave-fork-allowed",
      status: report.dave_fork.allowed ? "pass" : "watch",
      label: "Dave fork 被 governance 与 provider checks 允许",
      source: "evaluateSharingGovernance(action=fork, scope=forks)",
      detail: `target profile: ${report.dave_fork.target_profile_id}; removed: ${report.dave_fork.removed_capability_ids.join(", ")}`,
    },
    {
      id: "provider-specific-migration-blocked",
      status: "pass",
      label: "Provider-specific migration 被阻断",
      source: "M24 fail-closed probe",
      detail: "如果 Dave 的 fork plan 标记 provider_specific_migration_used=true，M24 pressure 会返回 blocked。",
    },
    {
      id: "rc-pressure-passed",
      status: report.ok ? "pass" : "watch",
      label: "M24 RC pressure 报告通过",
      source: "evaluateCreationHostRcPressure",
      detail: "Authoring Kit + Sharing Governance + provider parity + credential rebinding 能承载 Alice/Bob/Charlie/Dave 故事。",
    },
    {
      id: "productization-gaps-explicit",
      status: "watch",
      label: "Production gaps 被显式保留",
      source: "M25 RC judgment",
      detail: "真实 OAuth、credential broker、signed artifact、marketplace、真实 Postgres adapter 仍是后续 productization lanes。",
    },
  ];
}

function buildGeneratedAppPreview(): M25GeneratedAppPreview {
  return {
    app_id: "dev-board",
    display_name: "Bob's Dev Board",
    current_version_id: "v3",
    builder: "user:bob",
    selected_profile_id: "local-sqlite-docker",
    modules: [
      {
        id: "github-issues",
        label: "GitHub issues / PRs",
        capability_id: "github-issues",
        local_profile: "supported",
        remote_profile: "supported",
      },
      {
        id: "linear-projects",
        label: "Linear project work",
        capability_id: "linear-projects",
        local_profile: "supported",
        remote_profile: "supported",
      },
      {
        id: "github-ci",
        label: "GitHub CI attention",
        capability_id: "github-issues",
        local_profile: "supported",
        remote_profile: "supported",
      },
      {
        id: "apple-notes",
        label: "Apple Notes context",
        capability_id: "apple-notes",
        local_profile: "supported",
        remote_profile: "unsupported",
      },
    ],
  };
}

function buildBuilderTranscript(): readonly M25BuilderTranscriptEntry[] {
  return [
    {
      speaker: "builder",
      text: "Bob: 我想要一个每天打开就知道 GitHub、Linear、CI 和 Apple Notes 里什么最该处理的 dev-board。",
      evidence_ids: ["generated-app-versioned"],
    },
    {
      speaker: "agent",
      text: "Build Agent: 我会使用 Alice 暴露的 capability contracts，不直接读取真实 provider implementation。",
      evidence_ids: ["agent-provider-branching-forbidden"],
    },
    {
      speaker: "framework",
      text: "Framework: proposal 绑定 semantic tools、credential boundary、profile capabilities，并生成可检查 evidence。",
      evidence_ids: ["builder-session-contract-bound", "provider-parity-present"],
    },
  ];
}

function buildArtifactModel(): Record<string, unknown> {
  return {
    product_layers: [
      "pneuma-framework",
      "Creation Host",
      "Generated Application",
      "Published Application",
    ],
    role_boundary: {
      developer: "Alice builds/configures the Creation Host.",
      builder: "Bob creates and evolves dev-board through the Host.",
      installer: "Charlie installs Bob's artifact with his own credentials.",
      forking_builder: "Dave forks the artifact into a different provider profile.",
      end_user: "Uses a Published Application version.",
    },
    m25_boundary:
      "This example validates the Developer cognitive path and Host contract closure. It is still not a production marketplace or credential broker.",
  };
}

function status(completed: ReadonlySet<string>, stageId: M25StageId): M25StageStatus {
  return completed.has(stageId) ? "completed" : "pending";
}
