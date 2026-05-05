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
  };
  readonly credential_requirements: readonly CredentialRequirement[];
  readonly init_recipe: {
    readonly recipe_id: string;
    readonly version: string;
    readonly steps: readonly {
      readonly id: string;
      readonly operation_id: string;
      readonly description: string;
    }[];
  };
}

export interface HostAuthoringKitContracts {
  readonly agent_package: BuildAgentPackageManifest;
  readonly provider_capabilities: ProviderCapabilityMatrix;
  readonly share_artifact: ShareArtifactManifest;
}

const ID_RE = /^[a-z][a-z0-9-]{1,62}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const SECRET_KEYS = new Set([
  "api_key",
  "apikey",
  "access_token",
  "refresh_token",
  "token",
  "password",
  "private_key",
  "client_secret",
]);
const PROVIDER_SPECIALIZATION_ALLOWED_CONTEXT = new Set<ProviderSpecializationAllowedContext>([
  "profile_id",
  "capabilities",
  "credential_requirements",
]);

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
  if (!Array.isArray(manifest.credential_requirements) || manifest.credential_requirements.length === 0) {
    issues.push(error(
      "share_artifact.credential_requirements.required",
      "Share artifact must declare credential requirements so installers can re-bind their own credentials.",
      "credential_requirements",
    ));
  } else {
    pushCredentialRequirementIssues(issues, manifest.credential_requirements, "credential_requirements");
  }
  if (!Array.isArray(manifest.init_recipe?.steps) || manifest.init_recipe.steps.length === 0) {
    issues.push(error(
      "share_artifact.init_recipe.steps.required",
      "Share artifact init recipe must include at least one portable semantic step.",
      "init_recipe.steps",
    ));
  }
  pushSecretMaterialIssue(issues, "share_artifact", manifest);

  return result(manifest, issues);
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
  }
}

function pushSecretMaterialIssue(
  issues: HostAuthoringContractIssue[],
  prefix: string,
  value: unknown,
): void {
  if (!containsSecretMaterial(value)) return;
  issues.push(error(
    `${prefix}.secret_material.forbidden`,
    "Authoring contracts must contain credential requirements and refs only, never raw secret material.",
  ));
}

function containsSecretMaterial(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (Array.isArray(value)) return value.some(containsSecretMaterial);
  if (typeof value !== "object") return false;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SECRET_KEYS.has(key.toLowerCase())) return true;
    if (containsSecretMaterial(child)) return true;
  }
  return false;
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
