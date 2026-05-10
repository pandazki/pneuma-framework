import { validatePortableArtifactSafety } from "./portable-artifact-safety.js";

export type CredentialBindingMode = "per-user" | "shared" | "admin-delegated";
export type CredentialPlacement =
  | "host-broker"
  | "keychain"
  | "secret-manager"
  | "kms"
  | "env";

export interface HostAuthoringContractIssue {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface HostAuthoringContractCheck<T> {
  readonly ok: boolean;
  readonly subject: T;
  readonly issues: readonly HostAuthoringContractIssue[];
}

export interface CredentialRequirement {
  readonly id: string;
  readonly provider_id: string;
  readonly scopes: readonly string[];
  readonly binding_mode: CredentialBindingMode;
  readonly placement: CredentialPlacement;
  readonly required: boolean;
}

export type ProviderSpecializationAllowedContext =
  | "profile_id"
  | "capabilities"
  | "credential_requirements";

export interface BuildAgentProviderSpecializationPolicy {
  readonly mode: "capability-contract-only";
  readonly provider_specific_branches: "forbidden";
  readonly allowed_context: readonly ProviderSpecializationAllowedContext[];
}

export interface BuildAgentPackageManifest {
  readonly schema_version: 1;
  readonly package_id: string;
  readonly version: string;
  readonly display_name: string;
  readonly instructions_path: string;
  readonly tool_allowlist: readonly string[];
  readonly provider_capability_matrix_id: string;
  readonly provider_specialization_policy: BuildAgentProviderSpecializationPolicy;
  readonly credential_boundary: {
    readonly allow_secret_storage: false;
    readonly allowed_placements: readonly CredentialPlacement[];
  };
  readonly review_checklist: readonly string[];
  readonly verification_hooks: readonly {
    readonly id: string;
    readonly command?: string;
    readonly description: string;
  }[];
}

export interface ProviderCapability {
  readonly id: string;
  readonly kind:
    | "storage"
    | "deployment"
    | "agent-backend"
    | "external-provider"
    | "semantic-index";
  readonly description: string;
  readonly default_fail_closed_behavior: string;
}

export interface ProviderCapabilityMatrixProfile {
  readonly profile_id: string;
  readonly storage_profile?: string;
  readonly deployment_profile?: string;
  readonly supported_capabilities: readonly string[];
  readonly unsupported_capabilities: readonly {
    readonly capability_id: string;
    readonly fail_closed_behavior: string;
  }[];
  readonly credential_requirements: readonly CredentialRequirement[];
}

export interface ProviderProfileParityContract {
  readonly id: string;
  readonly capability_id: string;
  readonly profile_ids: readonly string[];
  readonly semantic_contract: string;
  readonly verification_hook_id: string;
}

export interface ProviderCapabilityMatrix {
  readonly schema_version: 1;
  readonly matrix_id: string;
  readonly capabilities: readonly ProviderCapability[];
  readonly profiles: readonly ProviderCapabilityMatrixProfile[];
  readonly parity_contracts: readonly ProviderProfileParityContract[];
}

export interface ShareArtifactManifest {
  readonly schema_version: 1;
  readonly artifact_id: string;
  readonly app_id: string;
  readonly version_id: string;
  readonly source_profile_id: string;
  readonly created_from_package_id: string;
  readonly created_from_package_version: string;
  readonly includes: {
    readonly app_definition: true;
    readonly init_recipe: true;
    readonly provider_requirements: true;
  };
  readonly excludes: {
    readonly secrets: true;
    readonly private_derived_cache: true;
    readonly source_database: true;
  };
  readonly credential_requirements: readonly CredentialRequirement[];
  readonly target_profile_policy: {
    readonly compatible_profile_ids: readonly string[];
    readonly required_capabilities: readonly string[];
    readonly credential_rebinding_required: true;
  };
  readonly init_recipe: {
    readonly recipe_id: string;
    readonly version: string;
    readonly steps: readonly {
      readonly id: string;
      readonly kind: "semantic-operation";
      readonly operation_id: string;
      readonly idempotency_key: string;
      readonly description: string;
    }[];
  };
}

export type ScaffoldMaterializationStrategy = "copy" | "generate";
export type ScaffoldToolPolicy = "draft-workspace-only";
export type ScaffoldGuardrailPhase = "pre_proposal" | "pre_apply" | "post_apply";
export type ScaffoldFrameworkGuardrailCheck =
  | "base-snapshot-unchanged"
  | "diff-computable"
  | "protected-paths-unchanged"
  | "preview-health";

export interface ScaffoldLifecycleCommand {
  readonly command: string;
  readonly cwd?: string;
  readonly env?: readonly string[];
}

export type ScaffoldGuardrailCheck =
  | {
      readonly id: string;
      readonly kind: "command";
      readonly command: string;
      readonly description: string;
    }
  | {
      readonly id: string;
      readonly kind: "framework";
      readonly framework_check: ScaffoldFrameworkGuardrailCheck;
      readonly description: string;
    };

export interface ScaffoldProjectManifest {
  readonly schema_version: 1;
  readonly scaffold_id: string;
  readonly version: string;
  readonly display_name: string;
  readonly materialization: {
    readonly strategy: ScaffoldMaterializationStrategy;
    readonly source_roots: readonly string[];
    readonly exclude: readonly string[];
  };
  readonly artifact_boundary: {
    readonly writable_roots: readonly string[];
    readonly protected_paths: readonly string[];
    readonly generated_roots: readonly string[];
    readonly share_include: readonly string[];
    readonly share_exclude: readonly string[];
  };
  readonly agent_contract: {
    readonly allowed_tasks: readonly string[];
    readonly forbidden_tasks: readonly string[];
    readonly system_prompt_fragments: readonly string[];
    readonly tool_policy: ScaffoldToolPolicy;
  };
  readonly guardrails: {
    readonly pre_proposal: readonly ScaffoldGuardrailCheck[];
    readonly pre_apply: readonly ScaffoldGuardrailCheck[];
    readonly post_apply: readonly ScaffoldGuardrailCheck[];
  };
  readonly lifecycle: {
    readonly preview: ScaffoldLifecycleCommand;
    readonly build: ScaffoldLifecycleCommand;
    readonly test: readonly ScaffoldLifecycleCommand[];
    readonly publish?: ScaffoldLifecycleCommand;
  };
  readonly evidence: {
    readonly diff: true;
    readonly checks: true;
    readonly changed_files: true;
    readonly preview_url?: true;
  };
}

export interface HostAuthoringKitContracts {
  readonly agent_package: BuildAgentPackageManifest;
  readonly provider_capabilities: ProviderCapabilityMatrix;
  readonly share_artifact: ShareArtifactManifest;
}

const ID_RE = /^[a-z][a-z0-9-]{1,62}$/;
const OPERATION_ID_RE = /^[a-z][a-z0-9_-]{1,62}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const PROVIDER_SPECIALIZATION_ALLOWED_CONTEXT = new Set<ProviderSpecializationAllowedContext>([
  "profile_id",
  "capabilities",
  "credential_requirements",
]);
const CREDENTIAL_BINDING_MODES = new Set<CredentialBindingMode>([
  "per-user",
  "shared",
  "admin-delegated",
]);
const CREDENTIAL_PLACEMENTS = new Set<CredentialPlacement>([
  "host-broker",
  "keychain",
  "secret-manager",
  "kms",
  "env",
]);
const SCAFFOLD_MATERIALIZATION_STRATEGIES = new Set<ScaffoldMaterializationStrategy>([
  "copy",
  "generate",
]);
const SCAFFOLD_TOOL_POLICIES = new Set<ScaffoldToolPolicy>([
  "draft-workspace-only",
]);
const SCAFFOLD_FRAMEWORK_GUARDRAIL_CHECKS = new Set<ScaffoldFrameworkGuardrailCheck>([
  "base-snapshot-unchanged",
  "diff-computable",
  "protected-paths-unchanged",
  "preview-health",
]);
const SCAFFOLD_GUARDRAIL_PHASES: readonly ScaffoldGuardrailPhase[] = [
  "pre_proposal",
  "pre_apply",
  "post_apply",
];

export function validateBuildAgentPackageManifest(
  manifest: BuildAgentPackageManifest,
): HostAuthoringContractCheck<BuildAgentPackageManifest> {
  const issues: HostAuthoringContractIssue[] = [];

  pushSchemaBasics(issues, "build_agent_package", manifest, "package_id");

  if (!SEMVER_RE.test(String(manifest.version ?? ""))) {
    issues.push(error(
      "build_agent_package.version.invalid",
      "Build Agent Package version must be semver-like, for example 0.1.0.",
      "version",
    ));
  }
  if (!manifest.display_name?.trim()) {
    issues.push(error(
      "build_agent_package.display_name.required",
      "Build Agent Package display_name is required.",
      "display_name",
    ));
  }
  if (!manifest.instructions_path?.trim()) {
    issues.push(error(
      "build_agent_package.instructions_path.required",
      "Build Agent Package instructions_path is required.",
      "instructions_path",
    ));
  }
  if (!nonEmptyStringArray(manifest.tool_allowlist)) {
    issues.push(error(
      "build_agent_package.tool_allowlist.required",
      "Build Agent Package tool_allowlist must include at least one semantic tool id.",
      "tool_allowlist",
    ));
  }
  pushProviderSpecializationPolicyIssues(issues, manifest.provider_specialization_policy);
  if (manifest.credential_boundary?.allow_secret_storage !== false) {
    issues.push(error(
      "build_agent_package.credential_boundary.secret_storage_forbidden",
      "Build Agent Package must not allow storing raw secrets in app data or package files.",
      "credential_boundary.allow_secret_storage",
    ));
  }
  if (!nonEmptyStringArray(manifest.credential_boundary?.allowed_placements)) {
    issues.push(error(
      "build_agent_package.credential_boundary.placements_required",
      "Build Agent Package credential_boundary must declare allowed secret placements.",
      "credential_boundary.allowed_placements",
    ));
  }
  if (!nonEmptyStringArray(manifest.review_checklist)) {
    issues.push(error(
      "build_agent_package.review_checklist.required",
      "Build Agent Package must include at least one review checklist item.",
      "review_checklist",
    ));
  }
  pushSecretMaterialIssue(issues, "build_agent_package", manifest);

  return result(manifest, issues);
}

export function validateProviderCapabilityMatrix(
  matrix: ProviderCapabilityMatrix,
): HostAuthoringContractCheck<ProviderCapabilityMatrix> {
  const issues: HostAuthoringContractIssue[] = [];

  pushSchemaBasics(issues, "provider_capability_matrix", matrix, "matrix_id");

  const capabilityIds = new Set<string>();
  if (!Array.isArray(matrix.capabilities) || matrix.capabilities.length === 0) {
    issues.push(error(
      "provider_capability_matrix.capabilities.required",
      "Provider capability matrix must declare at least one capability.",
      "capabilities",
    ));
  } else {
    for (const [index, capability] of matrix.capabilities.entries()) {
      if (!ID_RE.test(String(capability.id ?? ""))) {
        issues.push(error(
          "provider_capability_matrix.capability.id.invalid",
          "Capability id must be kebab-case.",
          `capabilities.${index}.id`,
        ));
      } else if (capabilityIds.has(capability.id)) {
        issues.push(error(
          "provider_capability_matrix.capability.id.duplicate",
          `Duplicate capability id: ${capability.id}.`,
          `capabilities.${index}.id`,
        ));
      } else {
        capabilityIds.add(capability.id);
      }
      if (!capability.default_fail_closed_behavior?.trim()) {
        issues.push(error(
          "provider_capability_matrix.capability.fail_closed_required",
          "Capability must describe default fail-closed behavior.",
          `capabilities.${index}.default_fail_closed_behavior`,
        ));
      }
    }
  }

  if (!Array.isArray(matrix.profiles) || matrix.profiles.length === 0) {
    issues.push(error(
      "provider_capability_matrix.profiles.required",
      "Provider capability matrix must include at least one profile.",
      "profiles",
    ));
  } else {
    const profilesById = new Map<string, ProviderCapabilityMatrixProfile>();
    for (const [profileIndex, profile] of matrix.profiles.entries()) {
      if (!ID_RE.test(String(profile.profile_id ?? ""))) {
        issues.push(error(
          "provider_capability_matrix.profile.id.invalid",
          "Profile id must be kebab-case.",
          `profiles.${profileIndex}.profile_id`,
        ));
      } else if (profilesById.has(profile.profile_id)) {
        issues.push(error(
          "provider_capability_matrix.profile.id.duplicate",
          `Duplicate profile id: ${profile.profile_id}.`,
          `profiles.${profileIndex}.profile_id`,
        ));
      } else {
        profilesById.set(profile.profile_id, profile);
      }

      for (const capabilityId of profile.supported_capabilities ?? []) {
        if (!capabilityIds.has(capabilityId)) {
          issues.push(error(
            "provider_capability_matrix.profile.supported_capability.unknown",
            `Profile ${profile.profile_id} supports unknown capability: ${capabilityId}.`,
            `profiles.${profileIndex}.supported_capabilities`,
          ));
        }
      }
      for (const [unsupportedIndex, unsupported] of (profile.unsupported_capabilities ?? []).entries()) {
        if (!capabilityIds.has(unsupported.capability_id)) {
          issues.push(error(
            "provider_capability_matrix.profile.unsupported_capability.unknown",
            `Profile ${profile.profile_id} marks unknown capability unsupported: ${unsupported.capability_id}.`,
            `profiles.${profileIndex}.unsupported_capabilities.${unsupportedIndex}.capability_id`,
          ));
        }
        if (!unsupported.fail_closed_behavior?.trim()) {
          issues.push(error(
            "provider_capability_matrix.profile.unsupported_capability.fail_closed_required",
            "Unsupported capability must describe explicit fail-closed behavior.",
            `profiles.${profileIndex}.unsupported_capabilities.${unsupportedIndex}.fail_closed_behavior`,
          ));
        }
      }
      pushCredentialRequirementIssues(
        issues,
        profile.credential_requirements ?? [],
        `profiles.${profileIndex}.credential_requirements`,
      );
    }

    pushProviderProfileParityIssues(
      issues,
      matrix.parity_contracts,
      capabilityIds,
      profilesById,
      matrix.profiles,
    );
  }
  pushSecretMaterialIssue(issues, "provider_capability_matrix", matrix);

  return result(matrix, issues);
}

export function validateShareArtifactManifest(
  manifest: ShareArtifactManifest,
): HostAuthoringContractCheck<ShareArtifactManifest> {
  const issues: HostAuthoringContractIssue[] = [];

  pushSchemaBasics(issues, "share_artifact", manifest, "artifact_id");

  if (manifest.excludes?.secrets !== true) {
    issues.push(error(
      "share_artifact.excludes.secrets_required",
      "Share artifact must explicitly exclude secrets.",
      "excludes.secrets",
    ));
  }
  if (manifest.excludes?.private_derived_cache !== true) {
    issues.push(error(
      "share_artifact.excludes.private_cache_required",
      "Share artifact must explicitly exclude private derived cache.",
      "excludes.private_derived_cache",
    ));
  }
  if (manifest.excludes?.source_database !== true) {
    issues.push(error(
      "share_artifact.excludes.source_database_required",
      "Share artifact must explicitly exclude source databases and volume snapshots.",
      "excludes.source_database",
    ));
  }
  if (!Array.isArray(manifest.credential_requirements) || manifest.credential_requirements.length === 0) {
    issues.push(error(
      "share_artifact.credential_requirements.required",
      "Share artifact must declare credential requirements so installers can re-bind their own credentials.",
      "credential_requirements",
    ));
  } else {
    pushCredentialRequirementIssues(issues, manifest.credential_requirements, "credential_requirements");
  }
  pushTargetProfilePolicyIssues(issues, manifest);
  if (!Array.isArray(manifest.init_recipe?.steps) || manifest.init_recipe.steps.length === 0) {
    issues.push(error(
      "share_artifact.init_recipe.steps.required",
      "Share artifact init recipe must include at least one portable semantic step.",
      "init_recipe.steps",
    ));
  } else {
    pushInitRecipeStepIssues(issues, manifest.init_recipe.steps);
  }
  pushRawSourceMaterialIssue(issues, "share_artifact", manifest);
  pushSecretMaterialIssue(issues, "share_artifact", manifest);

  return result(manifest, issues);
}

export function validateScaffoldProjectManifest(
  manifest: ScaffoldProjectManifest,
): HostAuthoringContractCheck<ScaffoldProjectManifest> {
  const normalizedManifest = normalizeScaffoldProjectManifest(manifest);
  const issues: HostAuthoringContractIssue[] = [];

  pushSchemaBasics(issues, "scaffold_project", normalizedManifest, "scaffold_id");

  if (!SEMVER_RE.test(String(normalizedManifest.version ?? ""))) {
    issues.push(error(
      "scaffold_project.version.invalid",
      "Scaffold Project version must be semver-like, for example 0.1.0.",
      "version",
    ));
  }
  if (!normalizedManifest.display_name?.trim()) {
    issues.push(error(
      "scaffold_project.display_name.required",
      "Scaffold Project display_name is required.",
      "display_name",
    ));
  }

  pushScaffoldMaterializationIssues(issues, normalizedManifest);
  pushScaffoldArtifactBoundaryIssues(issues, normalizedManifest);
  pushScaffoldAgentContractIssues(issues, normalizedManifest);
  pushScaffoldGuardrailIssues(issues, normalizedManifest);
  pushScaffoldLifecycleIssues(issues, normalizedManifest);
  pushScaffoldEvidenceIssues(issues, normalizedManifest);
  pushSecretMaterialIssue(issues, "scaffold_project", normalizedManifest);

  return result(normalizedManifest, issues);
}

export function validateHostAuthoringKitContracts(
  kit: HostAuthoringKitContracts,
): HostAuthoringContractCheck<HostAuthoringKitContracts> {
  const issues: HostAuthoringContractIssue[] = [];
  const agentPackage = kit.agent_package;
  const matrix = kit.provider_capabilities;
  const shareArtifact = kit.share_artifact;

  if (agentPackage.provider_capability_matrix_id !== matrix.matrix_id) {
    issues.push(error(
      "host_authoring_kit.provider_matrix.id_mismatch",
      "Build Agent Package must reference the provided Provider Capability Matrix id.",
      "agent_package.provider_capability_matrix_id",
    ));
  }

  const hookIds = new Set((agentPackage.verification_hooks ?? []).map((hook) => hook.id));
  for (const [index, parity] of (matrix.parity_contracts ?? []).entries()) {
    if (!hookIds.has(parity.verification_hook_id)) {
      issues.push(error(
        "host_authoring_kit.parity_contract.verification_hook_unknown",
        `Parity contract ${parity.id} references unknown verification hook ${parity.verification_hook_id}.`,
        `provider_capabilities.parity_contracts.${index}.verification_hook_id`,
      ));
    }
  }

  const profileIds = new Set((matrix.profiles ?? []).map((profile) => profile.profile_id));
  if (!profileIds.has(shareArtifact.source_profile_id)) {
    issues.push(error(
      "host_authoring_kit.share_artifact.source_profile_unknown",
      `Share artifact source_profile_id is not declared in provider capabilities: ${shareArtifact.source_profile_id}.`,
      "share_artifact.source_profile_id",
    ));
  }

  for (const [index, targetProfileId] of (shareArtifact.target_profile_policy?.compatible_profile_ids ?? []).entries()) {
    const profile = (matrix.profiles ?? []).find((candidate) => candidate.profile_id === targetProfileId);
    if (profile === undefined) {
      issues.push(error(
        "host_authoring_kit.share_artifact.target_profile_unknown",
        `Share artifact target profile is not declared in provider capabilities: ${targetProfileId}.`,
        `share_artifact.target_profile_policy.compatible_profile_ids.${index}`,
      ));
      continue;
    }
    for (const requiredCapability of shareArtifact.target_profile_policy?.required_capabilities ?? []) {
      if (!(profile.supported_capabilities ?? []).includes(requiredCapability)) {
        issues.push(error(
          "host_authoring_kit.share_artifact.target_profile_missing_capability",
          `Target profile ${targetProfileId} does not support required share capability ${requiredCapability}.`,
          `share_artifact.target_profile_policy.required_capabilities`,
        ));
      }
    }
  }

  if (shareArtifact.created_from_package_id !== agentPackage.package_id) {
    issues.push(error(
      "host_authoring_kit.share_artifact.package_id_mismatch",
      "Share artifact must point back to the Build Agent Package that created it.",
      "share_artifact.created_from_package_id",
    ));
  }

  if (shareArtifact.created_from_package_version !== agentPackage.version) {
    issues.push(error(
      "host_authoring_kit.share_artifact.package_version_mismatch",
      "Share artifact package version must match the Build Agent Package version.",
      "share_artifact.created_from_package_version",
    ));
  }

  return result(kit, issues);
}

export function validateCredentialRequirements(
  requirements: readonly CredentialRequirement[],
  path = "credential_requirements",
): readonly HostAuthoringContractIssue[] {
  const issues: HostAuthoringContractIssue[] = [];
  pushCredentialRequirementIssues(issues, requirements, path);
  return issues;
}

function pushScaffoldMaterializationIssues(
  issues: HostAuthoringContractIssue[],
  manifest: ScaffoldProjectManifest,
): void {
  const materialization = manifest.materialization;
  if (!SCAFFOLD_MATERIALIZATION_STRATEGIES.has(materialization?.strategy as ScaffoldMaterializationStrategy)) {
    issues.push(error(
      "scaffold_project.materialization.strategy.invalid",
      "Scaffold Project materialization strategy must be copy or generate.",
      "materialization.strategy",
    ));
  }
  pushScaffoldPathArrayIssues(
    issues,
    materialization?.source_roots,
    "scaffold_project.materialization.source_roots",
    "Scaffold Project materialization source_roots must include at least one source root.",
    { allowWorkspaceRoot: true },
  );
  if (!nonEmptyStringArray(materialization?.exclude)) {
    issues.push(error(
      "scaffold_project.materialization.exclude.required",
      "Scaffold Project materialization exclude must name directories/files that never enter generated app drafts.",
      "materialization.exclude",
    ));
  } else {
    pushScaffoldPathEscapeIssues(
      issues,
      materialization.exclude,
      "scaffold_project.materialization.exclude",
    );
  }
}

function pushScaffoldArtifactBoundaryIssues(
  issues: HostAuthoringContractIssue[],
  manifest: ScaffoldProjectManifest,
): void {
  const boundary = manifest.artifact_boundary;
  pushScaffoldPathArrayIssues(
    issues,
    boundary?.writable_roots,
    "scaffold_project.artifact_boundary.writable_roots",
    "Scaffold Project artifact_boundary writable_roots must include at least one draft-writable root.",
  );
  pushScaffoldPathArrayIssues(
    issues,
    boundary?.protected_paths,
    "scaffold_project.artifact_boundary.protected_paths",
    "Scaffold Project artifact_boundary protected_paths must include framework integration and release-critical paths.",
  );
  pushScaffoldPathArrayIssues(
    issues,
    boundary?.generated_roots,
    "scaffold_project.artifact_boundary.generated_roots",
    "Scaffold Project artifact_boundary generated_roots must include at least one generated-app source root.",
  );
  pushScaffoldPathArrayIssues(
    issues,
    boundary?.share_include,
    "scaffold_project.artifact_boundary.share_include",
    "Scaffold Project artifact_boundary share_include must include portable generated-app files.",
  );
  pushScaffoldPathArrayIssues(
    issues,
    boundary?.share_exclude,
    "scaffold_project.artifact_boundary.share_exclude",
    "Scaffold Project artifact_boundary share_exclude must include private runtime files.",
  );

  if (
    nonEmptyStringArray(boundary?.writable_roots) &&
    nonEmptyStringArray(boundary?.protected_paths)
  ) {
    for (const protectedPath of boundary.protected_paths) {
      if (boundary.writable_roots.some((root) =>
        protectedPathConflictsWithWritableRoot(protectedPath, root)
      )) {
        issues.push(error(
          "scaffold_project.artifact_boundary.protected_path_under_writable_root",
          `Protected path ${protectedPath} must not overlap an agent-writable root.`,
          "artifact_boundary.protected_paths",
        ));
        break;
      }
    }
  }

  // validateScaffoldProjectManifest normalizes .env into share_exclude when the
  // array exists. Missing/non-array share_exclude is still reported above.
}

function pushScaffoldAgentContractIssues(
  issues: HostAuthoringContractIssue[],
  manifest: ScaffoldProjectManifest,
): void {
  const contract = manifest.agent_contract;
  if (!nonEmptyStringArray(contract?.allowed_tasks)) {
    issues.push(error(
      "scaffold_project.agent_contract.allowed_tasks.required",
      "Scaffold Project agent_contract must describe what the Build-phase Agent may change.",
      "agent_contract.allowed_tasks",
    ));
  }
  if (!nonEmptyStringArray(contract?.forbidden_tasks)) {
    issues.push(error(
      "scaffold_project.agent_contract.forbidden_tasks.required",
      "Scaffold Project agent_contract must describe forbidden tasks such as protected-path or release-script edits.",
      "agent_contract.forbidden_tasks",
    ));
  }
  if (!nonEmptyStringArray(contract?.system_prompt_fragments)) {
    issues.push(error(
      "scaffold_project.agent_contract.system_prompt_fragments.required",
      "Scaffold Project agent_contract must provide prompt fragments the Host can inject into Build Agent sessions.",
      "agent_contract.system_prompt_fragments",
    ));
  }
  if (!SCAFFOLD_TOOL_POLICIES.has(contract?.tool_policy as ScaffoldToolPolicy)) {
    issues.push(error(
      "scaffold_project.agent_contract.tool_policy.invalid",
      "Scaffold Project agent_contract tool_policy must be draft-workspace-only.",
      "agent_contract.tool_policy",
    ));
  }
}

function pushScaffoldGuardrailIssues(
  issues: HostAuthoringContractIssue[],
  manifest: ScaffoldProjectManifest,
): void {
  const guardrails = manifest.guardrails;
  for (const phase of SCAFFOLD_GUARDRAIL_PHASES) {
    const checks = guardrails?.[phase];
    if (!Array.isArray(checks) || checks.length === 0) {
      issues.push(error(
        `scaffold_project.guardrails.${phase}.required`,
        `Scaffold Project guardrails.${phase} must include at least one check.`,
        `guardrails.${phase}`,
      ));
      continue;
    }

    for (const [index, check] of checks.entries()) {
      pushScaffoldGuardrailCheckIssues(issues, phase, index, check);
    }
  }
}

function pushScaffoldGuardrailCheckIssues(
  issues: HostAuthoringContractIssue[],
  phase: ScaffoldGuardrailPhase,
  index: number,
  check: ScaffoldGuardrailCheck,
): void {
  const path = `guardrails.${phase}.${index}`;
  if (!ID_RE.test(String(check.id ?? ""))) {
    issues.push(error(
      "scaffold_project.guardrail.id.invalid",
      "Scaffold Project guardrail id must be kebab-case.",
      `${path}.id`,
    ));
  }
  if (!String(check.description ?? "").trim()) {
    issues.push(error(
      "scaffold_project.guardrail.description.required",
      "Scaffold Project guardrail description is required.",
      `${path}.description`,
    ));
  }
  if (check.kind === "command") {
    if (!String(check.command ?? "").trim()) {
      issues.push(error(
        "scaffold_project.guardrail.command.required",
        "Command guardrails must declare a command.",
        `${path}.command`,
      ));
    }
    return;
  }
  if (check.kind === "framework") {
    if (!SCAFFOLD_FRAMEWORK_GUARDRAIL_CHECKS.has(
      check.framework_check as ScaffoldFrameworkGuardrailCheck,
    )) {
      issues.push(error(
        "scaffold_project.guardrail.framework_check.invalid",
        `Framework guardrails must use a known framework_check: ${[
          ...SCAFFOLD_FRAMEWORK_GUARDRAIL_CHECKS,
        ].join(", ")}.`,
        `${path}.framework_check`,
      ));
    }
    return;
  }
  issues.push(error(
    "scaffold_project.guardrail.kind.invalid",
    "Scaffold Project guardrail kind must be command or framework.",
    `${path}.kind`,
  ));
}

function pushScaffoldLifecycleIssues(
  issues: HostAuthoringContractIssue[],
  manifest: ScaffoldProjectManifest,
): void {
  pushScaffoldCommandIssue(
    issues,
    manifest.lifecycle?.preview,
    "scaffold_project.lifecycle.preview.command.required",
    "Scaffold Project lifecycle.preview must declare a command.",
    "lifecycle.preview.command",
  );
  pushScaffoldCommandIssue(
    issues,
    manifest.lifecycle?.build,
    "scaffold_project.lifecycle.build.command.required",
    "Scaffold Project lifecycle.build must declare a command.",
    "lifecycle.build.command",
  );
  if (!Array.isArray(manifest.lifecycle?.test) || manifest.lifecycle.test.length === 0) {
    issues.push(error(
      "scaffold_project.lifecycle.test.required",
      "Scaffold Project lifecycle.test must include at least one test command.",
      "lifecycle.test",
    ));
  } else {
    for (const [index, command] of manifest.lifecycle.test.entries()) {
      pushScaffoldCommandIssue(
        issues,
        command,
        "scaffold_project.lifecycle.test.command.required",
        "Scaffold Project lifecycle.test entries must declare commands.",
        `lifecycle.test.${index}.command`,
      );
    }
  }
  if (manifest.lifecycle?.publish !== undefined) {
    pushScaffoldCommandIssue(
      issues,
      manifest.lifecycle.publish,
      "scaffold_project.lifecycle.publish.command.required",
      "Scaffold Project lifecycle.publish must declare a command when provided.",
      "lifecycle.publish.command",
    );
  }
}

function pushScaffoldEvidenceIssues(
  issues: HostAuthoringContractIssue[],
  manifest: ScaffoldProjectManifest,
): void {
  if (manifest.evidence?.diff !== true) {
    issues.push(error(
      "scaffold_project.evidence.diff_required",
      "Scaffold Project evidence must require a diff before Builder approval.",
      "evidence.diff",
    ));
  }
  if (manifest.evidence?.checks !== true) {
    issues.push(error(
      "scaffold_project.evidence.checks_required",
      "Scaffold Project evidence must require guardrail check evidence.",
      "evidence.checks",
    ));
  }
  if (manifest.evidence?.changed_files !== true) {
    issues.push(error(
      "scaffold_project.evidence.changed_files_required",
      "Scaffold Project evidence must require changed_files before approval/apply.",
      "evidence.changed_files",
    ));
  }
}

function pushScaffoldCommandIssue(
  issues: HostAuthoringContractIssue[],
  spec: ScaffoldLifecycleCommand | undefined,
  code: string,
  message: string,
  path: string,
): void {
  if (!String(spec?.command ?? "").trim()) {
    issues.push(error(code, message, path));
  }
}

function pushScaffoldPathArrayIssues(
  issues: HostAuthoringContractIssue[],
  value: unknown,
  codePrefix: string,
  requiredMessage: string,
  opts?: { readonly allowWorkspaceRoot?: boolean },
): void {
  const path = codePrefix.replace("scaffold_project.", "");
  if (!nonEmptyStringArray(value)) {
    issues.push(error(`${codePrefix}.required`, requiredMessage, path));
    return;
  }
  pushScaffoldPathEscapeIssues(issues, value, codePrefix, opts);
}

function pushScaffoldPathEscapeIssues(
  issues: HostAuthoringContractIssue[],
  paths: readonly string[],
  codePrefix: string,
  opts?: { readonly allowWorkspaceRoot?: boolean },
): void {
  const path = codePrefix.replace("scaffold_project.", "");
  for (const [index, entry] of paths.entries()) {
    if (isSafeScaffoldRelativePath(entry, opts)) continue;
    issues.push(error(
      `${codePrefix}.path_escape`,
      "Scaffold Project paths must be relative paths inside the scaffold workspace.",
      `${path}.${index}`,
    ));
  }
}

function isSafeScaffoldRelativePath(
  value: string,
  opts?: { readonly allowWorkspaceRoot?: boolean },
): boolean {
  const normalized = normalizeScaffoldPath(value);
  if (opts?.allowWorkspaceRoot === true && normalized === ".") return true;
  return normalized.length > 0 &&
    normalized !== "." &&
    !normalized.startsWith("/") &&
    normalized !== ".." &&
    !normalized.startsWith("../") &&
    !normalized.includes("/../");
}

function isSameOrChildPath(value: string, root: string): boolean {
  const normalizedValue = normalizeScaffoldPath(value);
  const normalizedRoot = normalizeScaffoldPath(root);
  return normalizedValue === normalizedRoot ||
    normalizedValue.startsWith(`${normalizedRoot}/`);
}

function protectedPathConflictsWithWritableRoot(protectedPath: string, root: string): boolean {
  const normalizedProtectedPath = normalizeScaffoldPath(protectedPath);
  const normalizedRoot = normalizeScaffoldPath(root);
  if (normalizedProtectedPath === normalizedRoot) return true;
  if (isSameOrChildPath(normalizedRoot, normalizedProtectedPath)) return true;
  if (!isSameOrChildPath(normalizedProtectedPath, normalizedRoot)) return false;
  return !isLikelyFilePath(normalizedProtectedPath);
}

function isLikelyFilePath(path: string): boolean {
  const name = path.split("/").at(-1) ?? "";
  return /^[^.].*\.[^.]+$/.test(name);
}

function normalizeScaffoldPath(value: string): string {
  return value.trim().replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/+/g, "/").replace(/\/$/, "");
}

function normalizeScaffoldProjectManifest(
  manifest: ScaffoldProjectManifest,
): ScaffoldProjectManifest {
  const shareExclude = Array.isArray(manifest.artifact_boundary?.share_exclude)
    ? ensureEnvExcluded(manifest.artifact_boundary.share_exclude)
    : manifest.artifact_boundary?.share_exclude;
  return {
    ...manifest,
    artifact_boundary: {
      ...manifest.artifact_boundary,
      share_exclude: shareExclude,
    },
  } as ScaffoldProjectManifest;
}

function ensureEnvExcluded(paths: readonly string[]): readonly string[] {
  if (paths.some((entry) => normalizeScaffoldPath(entry) === ".env")) return paths;
  return [".env", ...paths];
}

function pushTargetProfilePolicyIssues(
  issues: HostAuthoringContractIssue[],
  manifest: ShareArtifactManifest,
): void {
  const policy = manifest.target_profile_policy;
  if (!nonEmptyStringArray(policy?.compatible_profile_ids)) {
    issues.push(error(
      "share_artifact.target_profile_policy.compatible_profiles.required",
      "Share artifact must declare compatible target profile ids so fork/install can fail closed.",
      "target_profile_policy.compatible_profile_ids",
    ));
  }
  if (!nonEmptyStringArray(policy?.required_capabilities)) {
    issues.push(error(
      "share_artifact.target_profile_policy.required_capabilities.required",
      "Share artifact must declare capabilities required from any target profile.",
      "target_profile_policy.required_capabilities",
    ));
  }
  if (policy?.credential_rebinding_required !== true) {
    issues.push(error(
      "share_artifact.target_profile_policy.credential_rebinding_required",
      "Share artifact must require installers to bind their own credentials instead of copying source credentials.",
      "target_profile_policy.credential_rebinding_required",
    ));
  }
}

function pushInitRecipeStepIssues(
  issues: HostAuthoringContractIssue[],
  steps: ShareArtifactManifest["init_recipe"]["steps"],
): void {
  for (const [index, step] of steps.entries()) {
    if (!ID_RE.test(String(step.id ?? ""))) {
      issues.push(error(
        "share_artifact.init_recipe.step.id.invalid",
        "Init recipe step id must be kebab-case.",
        `init_recipe.steps.${index}.id`,
      ));
    }
    if (step.kind !== "semantic-operation") {
      issues.push(error(
        "share_artifact.init_recipe.step.kind.invalid",
        "Init recipe steps must be semantic-operation steps, not raw database/provider scripts.",
        `init_recipe.steps.${index}.kind`,
      ));
    }
    if (!OPERATION_ID_RE.test(String(step.operation_id ?? ""))) {
      issues.push(error(
        "share_artifact.init_recipe.step.operation_id.invalid",
        "Init recipe step operation_id must be a semantic operation id.",
        `init_recipe.steps.${index}.operation_id`,
      ));
    }
    if (!String(step.idempotency_key ?? "").trim()) {
      issues.push(error(
        "share_artifact.init_recipe.step.idempotency_key.required",
        "Init recipe step must include an idempotency_key so fork/install can retry safely.",
        `init_recipe.steps.${index}.idempotency_key`,
      ));
    }
  }
}

function pushSchemaBasics<T extends { readonly schema_version?: unknown }>(
  issues: HostAuthoringContractIssue[],
  prefix: string,
  value: T,
  idKey: keyof T & string,
): void {
  const record = value as Record<string, unknown>;
  if (value.schema_version !== 1) {
    issues.push(error(
      `${prefix}.schema_version.invalid`,
      "Authoring contract schema_version must be 1.",
      "schema_version",
    ));
  }
  if (!ID_RE.test(String(record[idKey] ?? ""))) {
    issues.push(error(
      `${prefix}.${idKey}.invalid`,
      `${idKey} must be kebab-case, start with a letter, and be 2-63 characters.`,
      idKey,
    ));
  }
}

function pushProviderSpecializationPolicyIssues(
  issues: HostAuthoringContractIssue[],
  policy: BuildAgentProviderSpecializationPolicy | undefined,
): void {
  if (policy === undefined) {
    issues.push(error(
      "build_agent_package.provider_specialization_policy.required",
      "Build Agent Package must declare that Builder sessions use capability contracts instead of provider-specific branches.",
      "provider_specialization_policy",
    ));
    return;
  }

  if (policy.mode !== "capability-contract-only") {
    issues.push(error(
      "build_agent_package.provider_specialization_policy.mode.invalid",
      "Build Agent Package provider specialization mode must be capability-contract-only.",
      "provider_specialization_policy.mode",
    ));
  }
  if (policy.provider_specific_branches !== "forbidden") {
    issues.push(error(
      "build_agent_package.provider_specialization_policy.branches_forbidden",
      "Build Agent Package must forbid provider-specific implementation branches during Builder sessions.",
      "provider_specialization_policy.provider_specific_branches",
    ));
  }
  if (!nonEmptyStringArray(policy.allowed_context)) {
    issues.push(error(
      "build_agent_package.provider_specialization_policy.allowed_context.required",
      "Build Agent Package must declare which provider context the Build Agent may see.",
      "provider_specialization_policy.allowed_context",
    ));
  } else {
    for (const [index, context] of policy.allowed_context.entries()) {
      if (!PROVIDER_SPECIALIZATION_ALLOWED_CONTEXT.has(context as ProviderSpecializationAllowedContext)) {
        issues.push(error(
          "build_agent_package.provider_specialization_policy.allowed_context.invalid",
          "Build Agent Package allowed_context may expose only profile_id, capabilities, and credential_requirements.",
          `provider_specialization_policy.allowed_context.${index}`,
        ));
      }
    }
  }
}

function pushProviderProfileParityIssues(
  issues: HostAuthoringContractIssue[],
  parityContracts: readonly ProviderProfileParityContract[] | undefined,
  capabilityIds: ReadonlySet<string>,
  profilesById: ReadonlyMap<string, ProviderCapabilityMatrixProfile>,
  profiles: readonly ProviderCapabilityMatrixProfile[],
): void {
  const contracts = Array.isArray(parityContracts) ? parityContracts : [];
  if (parityContracts !== undefined && !Array.isArray(parityContracts)) {
    issues.push(error(
      "provider_capability_matrix.parity_contracts.invalid",
      "Provider capability matrix parity_contracts must be an array.",
      "parity_contracts",
    ));
  }

  for (const [index, parity] of contracts.entries()) {
    if (!ID_RE.test(String(parity.id ?? ""))) {
      issues.push(error(
        "provider_capability_matrix.parity_contract.id.invalid",
        "Parity contract id must be kebab-case.",
        `parity_contracts.${index}.id`,
      ));
    }
    if (!capabilityIds.has(parity.capability_id)) {
      issues.push(error(
        "provider_capability_matrix.parity_contract.capability.unknown",
        `Parity contract references unknown capability: ${parity.capability_id}.`,
        `parity_contracts.${index}.capability_id`,
      ));
    }
    if (!Array.isArray(parity.profile_ids) || parity.profile_ids.length < 2) {
      issues.push(error(
        "provider_capability_matrix.parity_contract.profile_ids.required",
        "Parity contract must cover at least two provider profiles.",
        `parity_contracts.${index}.profile_ids`,
      ));
    } else {
      for (const profileId of parity.profile_ids) {
        const profile = profilesById.get(profileId);
        if (profile === undefined) {
          issues.push(error(
            "provider_capability_matrix.parity_contract.profile.unknown",
            `Parity contract references unknown profile: ${profileId}.`,
            `parity_contracts.${index}.profile_ids`,
          ));
          continue;
        }
        if (!(profile.supported_capabilities ?? []).includes(parity.capability_id)) {
          issues.push(error(
            "provider_capability_matrix.parity_contract.profile_missing_capability",
            `Profile ${profileId} does not support parity capability ${parity.capability_id}.`,
            `parity_contracts.${index}.profile_ids`,
          ));
        }
      }
    }
    if (!parity.semantic_contract?.trim()) {
      issues.push(error(
        "provider_capability_matrix.parity_contract.semantic_contract.required",
        "Parity contract must describe the provider-independent semantic contract.",
        `parity_contracts.${index}.semantic_contract`,
      ));
    }
    if (!ID_RE.test(String(parity.verification_hook_id ?? ""))) {
      issues.push(error(
        "provider_capability_matrix.parity_contract.verification_hook_id.invalid",
        "Parity contract verification_hook_id must be kebab-case.",
        `parity_contracts.${index}.verification_hook_id`,
      ));
    }
  }

  for (const capabilityId of capabilityIds) {
    const supportingProfileIds = profiles
      .filter((profile) => (profile.supported_capabilities ?? []).includes(capabilityId))
      .map((profile) => profile.profile_id);
    if (supportingProfileIds.length < 2) continue;

    const covered = contracts.some((contract) =>
      contract.capability_id === capabilityId &&
      supportingProfileIds.every((profileId) => contract.profile_ids.includes(profileId))
    );
    if (!covered) {
      issues.push(error(
        "provider_capability_matrix.profile_parity.missing",
        `Capability ${capabilityId} is supported by multiple profiles and needs a parity contract.`,
        "parity_contracts",
      ));
    }
  }
}

function pushCredentialRequirementIssues(
  issues: HostAuthoringContractIssue[],
  requirements: readonly CredentialRequirement[],
  path: string,
): void {
  for (const [index, requirement] of requirements.entries()) {
    if (!ID_RE.test(String(requirement.id ?? ""))) {
      issues.push(error(
        "credential_requirement.id.invalid",
        "Credential requirement id must be kebab-case.",
        `${path}.${index}.id`,
      ));
    }
    if (!ID_RE.test(String(requirement.provider_id ?? ""))) {
      issues.push(error(
        "credential_requirement.provider_id.invalid",
        "Credential requirement provider_id must be kebab-case.",
        `${path}.${index}.provider_id`,
      ));
    }
    if (!nonEmptyStringArray(requirement.scopes)) {
      issues.push(error(
        "credential_requirement.scopes.required",
        "Credential requirement scopes must include at least one scope.",
        `${path}.${index}.scopes`,
      ));
    }
    if (!CREDENTIAL_BINDING_MODES.has(requirement.binding_mode as CredentialBindingMode)) {
      issues.push(error(
        "credential_requirement.binding_mode.invalid",
        "Credential requirement binding_mode must be per-user, shared, or admin-delegated.",
        `${path}.${index}.binding_mode`,
      ));
    }
    if (!CREDENTIAL_PLACEMENTS.has(requirement.placement as CredentialPlacement)) {
      issues.push(error(
        "credential_requirement.placement.invalid",
        "Credential requirement placement must be host-broker, keychain, secret-manager, kms, or env.",
        `${path}.${index}.placement`,
      ));
    }
    if (requirement.required !== true && requirement.required !== false) {
      issues.push(error(
        "credential_requirement.required.invalid",
        "Credential requirement required must be a boolean.",
        `${path}.${index}.required`,
      ));
    }
  }
}

function pushSecretMaterialIssue(
  issues: HostAuthoringContractIssue[],
  prefix: string,
  value: unknown,
): void {
  const secretIssue = validatePortableArtifactSafety(value).issues.find((issue) =>
    issue.code === "portable_artifact.secret_material.forbidden"
  );
  if (secretIssue === undefined) return;
  issues.push(error(
    `${prefix}.secret_material.forbidden`,
    "Authoring contracts must contain credential requirements and refs only, never raw secret material.",
    secretIssue.path,
  ));
}

function pushRawSourceMaterialIssue(
  issues: HostAuthoringContractIssue[],
  prefix: string,
  value: unknown,
): void {
  const sourceIssue = validatePortableArtifactSafety(value).issues.find((issue) =>
    issue.code === "portable_artifact.raw_source_material.forbidden"
  );
  if (sourceIssue === undefined) return;
  issues.push(error(
    `${prefix}.raw_source_material.forbidden`,
    "Share/fork contracts must reference app definition and semantic init recipes, never raw source databases, row dumps, SQL, or volume snapshots.",
    sourceIssue.path,
  ));
}

function nonEmptyStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) &&
    value.length > 0 &&
    value.every((entry) => typeof entry === "string" && entry.trim().length > 0);
}

function error(
  code: string,
  message: string,
  path?: string,
): HostAuthoringContractIssue {
  return { severity: "error", code, message, path };
}

function result<T>(
  subject: T,
  issues: readonly HostAuthoringContractIssue[],
): HostAuthoringContractCheck<T> {
  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    subject,
    issues,
  };
}
