import type { CredentialRequirement } from "./host-authoring.js";

export type HostExtensionSlotKind =
  | "ui"
  | "api"
  | "runtime-hook"
  | "agent-tool"
  | "data-import";

export type HostExtensionArtifactKind =
  | "ts-module"
  | "tsx-module"
  | "json"
  | "static-asset"
  | "command";

export type HostExtensionRuntimeMode = "preview" | "published";

export interface HostExtensionContractIssue {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface HostExtensionContractCheck<T> {
  readonly ok: boolean;
  readonly subject: T;
  readonly issues: readonly HostExtensionContractIssue[];
}

export interface HostExtensionSlotDeclaration {
  readonly slot_id: string;
  readonly kind: HostExtensionSlotKind;
  readonly display_name: string;
  readonly description: string;
  readonly runtime_modes: readonly HostExtensionRuntimeMode[];
  readonly accepted_artifact_kinds: readonly HostExtensionArtifactKind[];
  readonly required_capabilities: readonly string[];
}

export interface HostExtensionSlotRegistry {
  readonly schema_version: 1;
  readonly host_id: string;
  readonly slots: readonly HostExtensionSlotDeclaration[];
}

export interface HostExtensionContribution {
  readonly id: string;
  readonly slot_id: string;
  readonly kind: HostExtensionSlotKind;
  readonly artifact_kind: HostExtensionArtifactKind;
  readonly artifact_path: string;
  readonly export_name?: string;
  readonly runtime_modes: readonly HostExtensionRuntimeMode[];
  readonly required_capabilities: readonly string[];
}

export interface HostExtensionManifest {
  readonly schema_version: 1;
  readonly extension_id: string;
  readonly version: string;
  readonly display_name: string;
  readonly description: string;
  readonly created_from: {
    readonly app_id: string;
    readonly version_id: string;
    readonly scaffold_id: string;
    readonly scaffold_version: string;
    readonly package_id: string;
    readonly package_version: string;
  };
  readonly bundle: {
    readonly root: string;
    readonly include: readonly string[];
    readonly exclude: readonly string[];
  };
  readonly slots: readonly HostExtensionContribution[];
  readonly credential_requirements: readonly CredentialRequirement[];
  readonly target_profile_policy: {
    readonly compatible_profile_ids: readonly string[];
    readonly required_capabilities: readonly string[];
  };
  readonly governance: {
    readonly install_requires_approval: true;
    readonly update_requires_approval: true;
    readonly uninstall_requires_approval: true;
    readonly conflict_behavior: "fail-closed";
  };
}

export interface HostExtensionBundle {
  readonly slots: HostExtensionSlotRegistry;
  readonly extension: HostExtensionManifest;
}

const ID_RE = /^[a-z][a-z0-9-]{1,62}$/;
const SEMVER_RE = /^\d+\.\d+\.\d+$/;
const SLOT_KINDS = new Set<HostExtensionSlotKind>([
  "ui",
  "api",
  "runtime-hook",
  "agent-tool",
  "data-import",
]);
const ARTIFACT_KINDS = new Set<HostExtensionArtifactKind>([
  "ts-module",
  "tsx-module",
  "json",
  "static-asset",
  "command",
]);
const RUNTIME_MODES = new Set<HostExtensionRuntimeMode>(["preview", "published"]);
const CREDENTIAL_BINDING_MODES = new Set(["per-user", "shared", "admin-delegated"]);
const CREDENTIAL_PLACEMENTS = new Set(["host-broker", "keychain", "secret-manager", "kms", "env"]);

export function validateHostExtensionSlotRegistry(
  registry: HostExtensionSlotRegistry,
): HostExtensionContractCheck<HostExtensionSlotRegistry> {
  const issues: HostExtensionContractIssue[] = [];

  if (registry.schema_version !== 1) {
    issues.push(error(
      "host_extension_slots.schema_version.unsupported",
      "HostExtension slot registry schema_version must be 1.",
      "schema_version",
    ));
  }
  if (!ID_RE.test(String(registry.host_id ?? ""))) {
    issues.push(error(
      "host_extension_slots.host_id.invalid",
      "HostExtension slot registry host_id must be kebab-case.",
      "host_id",
    ));
  }
  if (!Array.isArray(registry.slots) || registry.slots.length === 0) {
    issues.push(error(
      "host_extension_slots.slots.required",
      "HostExtension slot registry must declare at least one slot.",
      "slots",
    ));
  }

  const seen = new Set<string>();
  for (const [index, slot] of (registry.slots ?? []).entries()) {
    const path = `slots.${index}`;
    if (!ID_RE.test(String(slot.slot_id ?? ""))) {
      issues.push(error(
        "host_extension_slots.slot_id.invalid",
        "HostExtension slot_id must be kebab-case.",
        `${path}.slot_id`,
      ));
    } else if (seen.has(slot.slot_id)) {
      issues.push(error(
        "host_extension_slots.slot_id.duplicate",
        `HostExtension slot_id ${slot.slot_id} is duplicated.`,
        `${path}.slot_id`,
      ));
    } else {
      seen.add(slot.slot_id);
    }
    if (!SLOT_KINDS.has(slot.kind)) {
      issues.push(error(
        "host_extension_slots.kind.invalid",
        "HostExtension slot kind is not supported.",
        `${path}.kind`,
      ));
    }
    validateNonEmptyString(slot.display_name, issues, {
      code: "host_extension_slots.display_name.required",
      message: "HostExtension slot display_name is required.",
      path: `${path}.display_name`,
    });
    validateNonEmptyString(slot.description, issues, {
      code: "host_extension_slots.description.required",
      message: "HostExtension slot description is required.",
      path: `${path}.description`,
    });
    validateEnumArray(slot.runtime_modes, RUNTIME_MODES, issues, {
      requiredCode: "host_extension_slots.runtime_modes.required",
      invalidCode: "host_extension_slots.runtime_mode.invalid",
      path: `${path}.runtime_modes`,
      label: "runtime mode",
    });
    validateEnumArray(slot.accepted_artifact_kinds, ARTIFACT_KINDS, issues, {
      requiredCode: "host_extension_slots.accepted_artifact_kinds.required",
      invalidCode: "host_extension_slots.artifact_kind.invalid",
      path: `${path}.accepted_artifact_kinds`,
      label: "artifact kind",
    });
    validateStringArray(slot.required_capabilities, issues, {
      code: "host_extension_slots.required_capabilities.invalid",
      message: "HostExtension slot required_capabilities must be strings.",
      path: `${path}.required_capabilities`,
    });
  }

  return check(registry, issues);
}

export function validateHostExtensionManifest(
  manifest: HostExtensionManifest,
): HostExtensionContractCheck<HostExtensionManifest> {
  const issues: HostExtensionContractIssue[] = [];

  if (manifest.schema_version !== 1) {
    issues.push(error(
      "host_extension.schema_version.unsupported",
      "HostExtension manifest schema_version must be 1.",
      "schema_version",
    ));
  }
  if (!ID_RE.test(String(manifest.extension_id ?? ""))) {
    issues.push(error(
      "host_extension.extension_id.invalid",
      "HostExtension extension_id must be kebab-case.",
      "extension_id",
    ));
  }
  if (!SEMVER_RE.test(String(manifest.version ?? ""))) {
    issues.push(error(
      "host_extension.version.invalid",
      "HostExtension version must be semver-like, for example 0.1.0.",
      "version",
    ));
  }
  validateNonEmptyString(manifest.display_name, issues, {
    code: "host_extension.display_name.required",
    message: "HostExtension display_name is required.",
    path: "display_name",
  });
  validateNonEmptyString(manifest.description, issues, {
    code: "host_extension.description.required",
    message: "HostExtension description is required.",
    path: "description",
  });
  validateCreatedFrom(manifest, issues);
  validateBundle(manifest, issues);
  validateContributions(manifest, issues);
  validateCredentialRequirements(manifest, issues);
  validateTargetProfilePolicy(manifest, issues);
  validateGovernance(manifest, issues);

  return check(manifest, issues);
}

export function validateHostExtensionBundle(
  bundle: HostExtensionBundle,
): HostExtensionContractCheck<HostExtensionBundle> {
  const issues: HostExtensionContractIssue[] = [
    ...validateHostExtensionSlotRegistry(bundle.slots).issues,
    ...validateHostExtensionManifest(bundle.extension).issues,
  ];
  const slotById = new Map(bundle.slots.slots.map((slot) => [slot.slot_id, slot]));

  for (const [index, contribution] of bundle.extension.slots.entries()) {
    const path = `extension.slots.${index}`;
    const slot = slotById.get(contribution.slot_id);
    if (slot === undefined) {
      issues.push(error(
        "host_extension_bundle.slot.unknown",
        `HostExtension contribution ${contribution.id} references unknown slot ${contribution.slot_id}.`,
        `${path}.slot_id`,
      ));
      continue;
    }
    if (slot.kind !== contribution.kind) {
      issues.push(error(
        "host_extension_bundle.slot.kind_mismatch",
        `HostExtension contribution ${contribution.id} kind ${contribution.kind} does not match slot ${slot.slot_id} kind ${slot.kind}.`,
        `${path}.kind`,
      ));
    }
    if (!slot.accepted_artifact_kinds.includes(contribution.artifact_kind)) {
      issues.push(error(
        "host_extension_bundle.slot.artifact_kind_unsupported",
        `HostExtension contribution ${contribution.id} artifact kind ${contribution.artifact_kind} is not accepted by slot ${slot.slot_id}.`,
        `${path}.artifact_kind`,
      ));
    }
    for (const mode of contribution.runtime_modes) {
      if (!slot.runtime_modes.includes(mode)) {
        issues.push(error(
          "host_extension_bundle.slot.runtime_mode_unsupported",
          `HostExtension contribution ${contribution.id} runtime mode ${mode} is not accepted by slot ${slot.slot_id}.`,
          `${path}.runtime_modes`,
        ));
      }
    }
    for (const capability of contribution.required_capabilities) {
      if (!slot.required_capabilities.includes(capability)) {
        issues.push(error(
          "host_extension_bundle.slot.capability_missing",
          `HostExtension contribution ${contribution.id} requires capability ${capability}, but slot ${slot.slot_id} does not declare it.`,
          `${path}.required_capabilities`,
        ));
      }
    }
  }

  return check(bundle, issues);
}

function validateCreatedFrom(
  manifest: HostExtensionManifest,
  issues: HostExtensionContractIssue[],
): void {
  const createdFrom = manifest.created_from;
  for (const key of [
    "app_id",
    "version_id",
    "scaffold_id",
    "scaffold_version",
    "package_id",
    "package_version",
  ] as const) {
    validateNonEmptyString(createdFrom?.[key], issues, {
      code: `host_extension.created_from.${key}.required`,
      message: `HostExtension created_from.${key} is required.`,
      path: `created_from.${key}`,
    });
  }
}

function validateBundle(
  manifest: HostExtensionManifest,
  issues: HostExtensionContractIssue[],
): void {
  const bundle = manifest.bundle;
  validateRelativePath(bundle?.root, issues, {
    code: "host_extension.bundle.root.invalid",
    message: "HostExtension bundle root must be a safe relative path.",
    path: "bundle.root",
  });
  validatePathArray(bundle?.include, issues, {
    code: "host_extension.bundle.include.invalid",
    message: "HostExtension bundle include must contain safe relative paths.",
    path: "bundle.include",
  });
  validatePathArray(bundle?.exclude, issues, {
    code: "host_extension.bundle.exclude.invalid",
    message: "HostExtension bundle exclude must contain safe relative paths.",
    path: "bundle.exclude",
  });

  const exclude = bundle?.exclude ?? [];
  if (!exclude.some(isSecretPath)) {
    issues.push(error(
      "host_extension.bundle.exclude.secret_required",
      "HostExtension bundle exclude must block secret material such as .env.",
      "bundle.exclude",
    ));
  }
  if (!exclude.some(isPrivateCachePath)) {
    issues.push(error(
      "host_extension.bundle.exclude.private_cache_required",
      "HostExtension bundle exclude must block private framework/Host cache paths such as .pneuma.",
      "bundle.exclude",
    ));
  }

  for (const [index, include] of (bundle?.include ?? []).entries()) {
    if (isSecretPath(include)) {
      issues.push(error(
        "host_extension.bundle.include.secret_forbidden",
        "HostExtension bundle include must not contain secret material.",
        `bundle.include.${index}`,
      ));
    }
    if (isSourceDatabasePath(include)) {
      issues.push(error(
        "host_extension.bundle.include.source_database_forbidden",
        "HostExtension bundle include must not contain source databases or volume snapshots.",
        `bundle.include.${index}`,
      ));
    }
    if (isPrivateCachePath(include)) {
      issues.push(error(
        "host_extension.bundle.include.private_cache_forbidden",
        "HostExtension bundle include must not contain private framework/Host cache paths.",
        `bundle.include.${index}`,
      ));
    }
  }
}

function validateContributions(
  manifest: HostExtensionManifest,
  issues: HostExtensionContractIssue[],
): void {
  if (!Array.isArray(manifest.slots) || manifest.slots.length === 0) {
    issues.push(error(
      "host_extension.slots.required",
      "HostExtension manifest must declare at least one slot contribution.",
      "slots",
    ));
    return;
  }

  const seen = new Set<string>();
  for (const [index, contribution] of manifest.slots.entries()) {
    const path = `slots.${index}`;
    if (!ID_RE.test(String(contribution.id ?? ""))) {
      issues.push(error(
        "host_extension.slot.id.invalid",
        "HostExtension slot contribution id must be kebab-case.",
        `${path}.id`,
      ));
    } else if (seen.has(contribution.id)) {
      issues.push(error(
        "host_extension.slot.id.duplicate",
        `HostExtension slot contribution id ${contribution.id} is duplicated.`,
        `${path}.id`,
      ));
    } else {
      seen.add(contribution.id);
    }
    if (!ID_RE.test(String(contribution.slot_id ?? ""))) {
      issues.push(error(
        "host_extension.slot.slot_id.invalid",
        "HostExtension contribution slot_id must be kebab-case.",
        `${path}.slot_id`,
      ));
    }
    if (!SLOT_KINDS.has(contribution.kind)) {
      issues.push(error(
        "host_extension.slot.kind.invalid",
        "HostExtension contribution kind is not supported.",
        `${path}.kind`,
      ));
    }
    if (!ARTIFACT_KINDS.has(contribution.artifact_kind)) {
      issues.push(error(
        "host_extension.slot.artifact_kind.invalid",
        "HostExtension contribution artifact_kind is not supported.",
        `${path}.artifact_kind`,
      ));
    }
    validateRelativePath(contribution.artifact_path, issues, {
      code: "host_extension.slot.artifact_path.invalid",
      message: "HostExtension contribution artifact_path must be a safe relative path.",
      path: `${path}.artifact_path`,
    });
    validateEnumArray(contribution.runtime_modes, RUNTIME_MODES, issues, {
      requiredCode: "host_extension.slot.runtime_modes.required",
      invalidCode: "host_extension.slot.runtime_mode.invalid",
      path: `${path}.runtime_modes`,
      label: "runtime mode",
    });
    validateStringArray(contribution.required_capabilities, issues, {
      code: "host_extension.slot.required_capabilities.invalid",
      message: "HostExtension contribution required_capabilities must be strings.",
      path: `${path}.required_capabilities`,
    });
  }
}

function validateTargetProfilePolicy(
  manifest: HostExtensionManifest,
  issues: HostExtensionContractIssue[],
): void {
  validateStringArray(manifest.target_profile_policy?.compatible_profile_ids, issues, {
    code: "host_extension.target_profile_policy.compatible_profile_ids.required",
    message: "HostExtension target_profile_policy.compatible_profile_ids must list compatible profiles.",
    path: "target_profile_policy.compatible_profile_ids",
    requireNonEmpty: true,
  });
  validateStringArray(manifest.target_profile_policy?.required_capabilities, issues, {
    code: "host_extension.target_profile_policy.required_capabilities.invalid",
    message: "HostExtension target_profile_policy.required_capabilities must be strings.",
    path: "target_profile_policy.required_capabilities",
  });
}

function validateCredentialRequirements(
  manifest: HostExtensionManifest,
  issues: HostExtensionContractIssue[],
): void {
  if (!Array.isArray(manifest.credential_requirements)) {
    issues.push(error(
      "host_extension.credential_requirements.invalid",
      "HostExtension credential_requirements must be an array.",
      "credential_requirements",
    ));
    return;
  }

  for (const [index, requirement] of manifest.credential_requirements.entries()) {
    const path = `credential_requirements.${index}`;
    if (!ID_RE.test(String(requirement.id ?? ""))) {
      issues.push(error(
        "host_extension.credential_requirement.id.invalid",
        "HostExtension credential requirement id must be kebab-case.",
        `${path}.id`,
      ));
    }
    if (!ID_RE.test(String(requirement.provider_id ?? ""))) {
      issues.push(error(
        "host_extension.credential_requirement.provider_id.invalid",
        "HostExtension credential requirement provider_id must be kebab-case.",
        `${path}.provider_id`,
      ));
    }
    if (hasInvalidScopes(requirement.scopes)) {
      issues.push(error(
        "host_extension.credential_requirement.scopes.invalid",
        "HostExtension credential requirement scopes must be non-empty strings.",
        `${path}.scopes`,
      ));
    }
    if (!CREDENTIAL_BINDING_MODES.has(String(requirement.binding_mode ?? ""))) {
      issues.push(error(
        "host_extension.credential_requirement.binding_mode.invalid",
        "HostExtension credential requirement binding_mode is not supported.",
        `${path}.binding_mode`,
      ));
    }
    if (!CREDENTIAL_PLACEMENTS.has(String(requirement.placement ?? ""))) {
      issues.push(error(
        "host_extension.credential_requirement.placement.invalid",
        "HostExtension credential requirement placement is not supported.",
        `${path}.placement`,
      ));
    }
    if (typeof requirement.required !== "boolean") {
      issues.push(error(
        "host_extension.credential_requirement.required.invalid",
        "HostExtension credential requirement required must be a boolean.",
        `${path}.required`,
      ));
    }
  }
}

function validateGovernance(
  manifest: HostExtensionManifest,
  issues: HostExtensionContractIssue[],
): void {
  if (manifest.governance?.install_requires_approval !== true) {
    issues.push(error(
      "host_extension.governance.install_requires_approval.required",
      "HostExtension install must require Host/Builder approval.",
      "governance.install_requires_approval",
    ));
  }
  if (manifest.governance?.update_requires_approval !== true) {
    issues.push(error(
      "host_extension.governance.update_requires_approval.required",
      "HostExtension update must require Host/Builder approval.",
      "governance.update_requires_approval",
    ));
  }
  if (manifest.governance?.uninstall_requires_approval !== true) {
    issues.push(error(
      "host_extension.governance.uninstall_requires_approval.required",
      "HostExtension uninstall must require Host/Builder approval.",
      "governance.uninstall_requires_approval",
    ));
  }
  if (manifest.governance?.conflict_behavior !== "fail-closed") {
    issues.push(error(
      "host_extension.governance.conflict_behavior.fail_closed_required",
      "HostExtension conflicts must fail closed.",
      "governance.conflict_behavior",
    ));
  }
}

function hasInvalidScopes(value: unknown): boolean {
  return !Array.isArray(value) ||
    value.length === 0 ||
    value.some((scope: unknown) => typeof scope !== "string" || scope.trim().length === 0);
}

function validateEnumArray<T extends string>(
  values: readonly T[] | undefined,
  allowed: ReadonlySet<T>,
  issues: HostExtensionContractIssue[],
  input: {
    readonly requiredCode: string;
    readonly invalidCode: string;
    readonly path: string;
    readonly label: string;
  },
): void {
  if (!Array.isArray(values) || values.length === 0) {
    issues.push(error(
      input.requiredCode,
      `HostExtension ${input.label} list must not be empty.`,
      input.path,
    ));
    return;
  }
  values.forEach((value, index) => {
    if (!allowed.has(value)) {
      issues.push(error(
        input.invalidCode,
        `HostExtension ${input.label} is not supported.`,
        `${input.path}.${index}`,
      ));
    }
  });
}

function validateStringArray(
  values: readonly string[] | undefined,
  issues: HostExtensionContractIssue[],
  input: {
    readonly code: string;
    readonly message: string;
    readonly path: string;
    readonly requireNonEmpty?: boolean;
  },
): void {
  if (!Array.isArray(values) || (input.requireNonEmpty === true && values.length === 0)) {
    issues.push(error(input.code, input.message, input.path));
    return;
  }
  values.forEach((value, index) => {
    if (typeof value !== "string" || value.trim().length === 0) {
      issues.push(error(input.code, input.message, `${input.path}.${index}`));
    }
  });
}

function validateNonEmptyString(
  value: unknown,
  issues: HostExtensionContractIssue[],
  input: {
    readonly code: string;
    readonly message: string;
    readonly path: string;
  },
): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push(error(input.code, input.message, input.path));
  }
}

function validateRelativePath(
  value: unknown,
  issues: HostExtensionContractIssue[],
  input: {
    readonly code: string;
    readonly message: string;
    readonly path: string;
  },
): void {
  if (typeof value !== "string" || !isSafeRelativePath(value)) {
    issues.push(error(input.code, input.message, input.path));
  }
}

function validatePathArray(
  values: readonly string[] | undefined,
  issues: HostExtensionContractIssue[],
  input: {
    readonly code: string;
    readonly message: string;
    readonly path: string;
  },
): void {
  if (!Array.isArray(values)) {
    issues.push(error(input.code, input.message, input.path));
    return;
  }
  values.forEach((value, index) => {
    if (!isSafeRelativePath(value)) {
      issues.push(error(input.code, input.message, `${input.path}.${index}`));
    }
  });
}

function isSafeRelativePath(value: string): boolean {
  return value.length > 0 &&
    !value.startsWith("/") &&
    !value.includes("\\") &&
    !value.split("/").includes("..");
}

function isSecretPath(path: string): boolean {
  return path === ".env" ||
    path.startsWith(".env.") ||
    path.includes("/.env") ||
    /(^|[/_-])(secret|secrets|token|tokens|credential|credentials)([/_.-]|$)/i.test(path);
}

function isSourceDatabasePath(path: string): boolean {
  return /\.(db|sqlite|sqlite3)$/i.test(path) ||
    /(^|\/)(data|volume|volumes|database|databases)(\/|$)/i.test(path);
}

function isPrivateCachePath(path: string): boolean {
  return path === ".pneuma" ||
    path.startsWith(".pneuma/") ||
    /(^|\/)(cache|private-cache|derived-cache)(\/|$)/i.test(path);
}

function error(
  code: string,
  message: string,
  path?: string,
): HostExtensionContractIssue {
  return {
    severity: "error",
    code,
    message,
    ...(path === undefined ? {} : { path }),
  };
}

function check<T>(
  subject: T,
  issues: readonly HostExtensionContractIssue[],
): HostExtensionContractCheck<T> {
  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    subject,
    issues,
  };
}
