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

export interface BuildAgentPackageManifest {
  readonly schema_version: 1;
  readonly package_id: string;
  readonly version: string;
  readonly display_name: string;
  readonly instructions_path: string;
  readonly tool_allowlist: readonly string[];
  readonly provider_capability_matrix_id: string;
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

export interface ProviderCapabilityMatrix {
  readonly schema_version: 1;
  readonly matrix_id: string;
  readonly capabilities: readonly ProviderCapability[];
  readonly profiles: readonly ProviderCapabilityMatrixProfile[];
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
    for (const [profileIndex, profile] of matrix.profiles.entries()) {
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
