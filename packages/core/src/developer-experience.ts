import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import type {
  CreationHostProfile,
  CreationHostState,
} from "./creation-host.js";
import {
  validateBuildAgentPackageManifest,
  validateHostAuthoringKitContracts,
  validateProviderCapabilityMatrix,
  validateScaffoldProjectManifest,
  validateShareArtifactManifest,
  type BuildAgentPackageManifest,
  type HostAuthoringContractIssue,
  type ProviderCapabilityMatrix,
  type ScaffoldProjectManifest,
  type ShareArtifactManifest,
} from "./host-authoring.js";
import {
  validateCredentialRebindingEvidence,
  validateSharingGovernanceBundle,
  validateSharingGovernanceManifest,
  type CredentialRebindingEvidence,
  type SharingGovernanceManifest,
} from "./sharing-governance.js";

export interface CreationHostContractIssue {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface CreationHostProfileContractCheck {
  readonly ok: boolean;
  readonly profile_id: string;
  readonly profile: CreationHostProfile;
  readonly issues: readonly CreationHostContractIssue[];
}

export interface CreationHostWorkspaceDiagnostics {
  readonly ok: boolean;
  readonly summary: {
    readonly profile_count: number;
    readonly project_count: number;
    readonly version_count: number;
  };
  readonly profile_checks: readonly CreationHostProfileContractCheck[];
  readonly workspace_checks: readonly CreationHostContractIssue[];
  readonly next_steps: readonly string[];
}

export interface DiagnoseCreationHostWorkspaceOptions {
  readonly workspace: string;
  readonly profiles: readonly CreationHostProfile[];
}

export type CreationHostAuthoringCheckKind =
  | "scaffold_project"
  | "agent_package"
  | "provider_capabilities"
  | "share_artifact"
  | "sharing_governance"
  | "credential_rebinding"
  | "sharing_governance_bundle"
  | "kit_cross_contract";

export interface CreationHostAuthoringContractCheck {
  readonly kind: CreationHostAuthoringCheckKind;
  readonly ok: boolean;
  readonly issues: readonly HostAuthoringContractIssue[];
}

export interface CreationHostAuthoringDiagnostics {
  readonly ok: boolean;
  readonly summary: {
    readonly scaffold_project_checked: boolean;
    readonly agent_package_checked: boolean;
    readonly provider_capabilities_checked: boolean;
    readonly share_artifact_checked: boolean;
    readonly sharing_governance_checked: boolean;
    readonly credential_rebinding_checked: boolean;
  };
  readonly authoring_checks: readonly CreationHostAuthoringContractCheck[];
  readonly next_steps: readonly string[];
}

export interface DiagnoseCreationHostAuthoringOptions {
  readonly scaffold_project?: ScaffoldProjectManifest;
  readonly agent_package?: BuildAgentPackageManifest;
  readonly provider_capabilities?: ProviderCapabilityMatrix;
  readonly share_artifact?: ShareArtifactManifest;
  readonly sharing_governance?: SharingGovernanceManifest;
  readonly credential_rebinding_evidence?: CredentialRebindingEvidence;
}

export function validateCreationHostProfileContract(
  profile: CreationHostProfile,
): CreationHostProfileContractCheck {
  const issues: CreationHostContractIssue[] = [];

  if (!/^[a-z][a-z0-9-]{1,62}$/.test(String(profile.id ?? ""))) {
    issues.push({
      severity: "error",
      code: "profile.id.invalid",
      message: "Profile id must be kebab-case, start with a letter, and be 2-63 characters.",
      path: "id",
    });
  }

  if (!profile.display_name?.trim()) {
    issues.push({
      severity: "error",
      code: "profile.display_name.required",
      message: "Profile display_name is required.",
      path: "display_name",
    });
  }

  if (!profile.description?.trim()) {
    issues.push({
      severity: "error",
      code: "profile.description.required",
      message: "Profile description is required.",
      path: "description",
    });
  }

  if (!profile.template_dir?.trim()) {
    issues.push({
      severity: "error",
      code: "profile.template_dir.required",
      message: "Profile template_dir is required.",
      path: "template_dir",
    });
  }

  if (
    profile.capabilities !== undefined &&
    (!Array.isArray(profile.capabilities) ||
      profile.capabilities.some((capability) => !capability.trim()))
  ) {
    issues.push({
      severity: "error",
      code: "profile.capabilities.invalid",
      message: "Profile capabilities must be non-empty strings when provided.",
      path: "capabilities",
    });
  }

  if (profile.stack_id !== undefined && !/^[a-z][a-z0-9-]{1,62}$/.test(profile.stack_id)) {
    issues.push({
      severity: "error",
      code: "profile.stack_id.invalid",
      message: "Profile stack_id must be kebab-case when provided.",
      path: "stack_id",
    });
  }

  if (profile.metadata !== undefined && !isJsonSerializable(profile.metadata)) {
    issues.push({
      severity: "error",
      code: "profile.metadata.not_json",
      message: "Profile metadata must be JSON-serializable.",
      path: "metadata",
    });
  }

  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    profile_id: String(profile.id ?? ""),
    profile,
    issues,
  };
}

export function assertCreationHostProfileContract(profile: CreationHostProfile): void {
  const result = validateCreationHostProfileContract(profile);
  if (result.ok) return;
  throw new Error(formatIssues(result.issues));
}

export function diagnoseCreationHostWorkspace(
  options: DiagnoseCreationHostWorkspaceOptions,
): CreationHostWorkspaceDiagnostics {
  const workspace = resolve(options.workspace);
  const profileChecks = options.profiles.map(validateCreationHostProfileContract);
  const workspaceChecks: CreationHostContractIssue[] = [];
  const statePath = join(workspace, ".pneuma-host", "host-state.json");
  let projectCount = 0;
  let versionCount = 0;

  if (!existsSync(statePath)) {
    workspaceChecks.push({
      severity: "warning",
      code: "workspace.state.missing",
      message: "No Creation Host state file exists yet.",
      path: statePath,
    });
  } else {
    try {
      const state = JSON.parse(readFileSync(statePath, "utf8")) as CreationHostState;
      const projects = Array.isArray(state.projects) ? state.projects : [];
      const versions = Array.isArray(state.versions) ? state.versions : [];
      projectCount = projects.length;
      versionCount = versions.length;

      for (const version of versions) {
        if (!existsSync(version.version_dir)) {
          workspaceChecks.push({
            severity: "error",
            code: "workspace.version_dir.missing",
            message: `Missing version directory for ${version.app_id}@${version.version_id}.`,
            path: version.version_dir,
          });
        }
        if (!existsSync(version.app_workspace_dir)) {
          workspaceChecks.push({
            severity: "error",
            code: "workspace.app_workspace_dir.missing",
            message: `Missing app workspace directory for ${version.app_id}@${version.version_id}.`,
            path: version.app_workspace_dir,
          });
        }
      }
    } catch (err) {
      workspaceChecks.push({
        severity: "error",
        code: "workspace.state.unreadable",
        message: `Cannot read Creation Host state: ${(err as Error).message}`,
        path: statePath,
      });
    }
  }

  const nextSteps: string[] = [];
  if (workspaceChecks.some((issue) => issue.code === "workspace.state.missing")) {
    nextSteps.push(
      "Create a generated app project, then run doctor-host again to verify version directories.",
    );
  }
  if (workspaceChecks.some((issue) => issue.code === "workspace.version_dir.missing")) {
    nextSteps.push(
      "Repair or recreate missing generated-app version directories before publish/restart/rollback.",
    );
  }
  if (profileChecks.some((check) => !check.ok)) {
    nextSteps.push(
      "Fix invalid Creation Host profile fields before exposing the profile to Builders.",
    );
  }
  if (nextSteps.length === 0) {
    nextSteps.push("Run the Host smoke flow: create, preview, inspect, evolve, publish, restart, rollback.");
  }

  const allIssues = [
    ...workspaceChecks,
    ...profileChecks.flatMap((check) => check.issues),
  ];

  return {
    ok: allIssues.every((issue) => issue.severity !== "error"),
    summary: {
      profile_count: options.profiles.length,
      project_count: projectCount,
      version_count: versionCount,
    },
    profile_checks: profileChecks,
    workspace_checks: workspaceChecks,
    next_steps: nextSteps,
  };
}

export function diagnoseCreationHostAuthoring(
  options: DiagnoseCreationHostAuthoringOptions,
): CreationHostAuthoringDiagnostics {
  const authoringChecks: CreationHostAuthoringContractCheck[] = [];

  if (options.scaffold_project !== undefined) {
    const check = validateScaffoldProjectManifest(options.scaffold_project);
    authoringChecks.push({
      kind: "scaffold_project",
      ok: check.ok,
      issues: check.issues,
    });
  }

  if (options.agent_package !== undefined) {
    const check = validateBuildAgentPackageManifest(options.agent_package);
    authoringChecks.push({
      kind: "agent_package",
      ok: check.ok,
      issues: check.issues,
    });
  }

  if (options.provider_capabilities !== undefined) {
    const check = validateProviderCapabilityMatrix(options.provider_capabilities);
    authoringChecks.push({
      kind: "provider_capabilities",
      ok: check.ok,
      issues: check.issues,
    });
  }

  if (options.share_artifact !== undefined) {
    const check = validateShareArtifactManifest(options.share_artifact);
    authoringChecks.push({
      kind: "share_artifact",
      ok: check.ok,
      issues: check.issues,
    });
  }

  if (options.sharing_governance !== undefined) {
    const check = validateSharingGovernanceManifest(options.sharing_governance);
    authoringChecks.push({
      kind: "sharing_governance",
      ok: check.ok,
      issues: check.issues,
    });
  }

  if (options.credential_rebinding_evidence !== undefined) {
    if (options.sharing_governance === undefined) {
      authoringChecks.push({
        kind: "credential_rebinding",
        ok: false,
        issues: [{
          severity: "error",
          code: "credential_rebinding.sharing_governance_required",
          message: "Credential rebinding evidence requires a sharing governance manifest.",
          path: "credential_rebinding_evidence",
        }],
      });
    } else {
      const check = validateCredentialRebindingEvidence(
        options.credential_rebinding_evidence,
        options.sharing_governance,
      );
      authoringChecks.push({
        kind: "credential_rebinding",
        ok: check.ok,
        issues: check.issues,
      });
    }
  }

  if (options.share_artifact !== undefined && options.sharing_governance !== undefined) {
    const check = validateSharingGovernanceBundle({
      share_artifact: options.share_artifact,
      sharing_governance: options.sharing_governance,
      credential_rebinding_evidence: options.credential_rebinding_evidence,
      provider_capabilities: options.provider_capabilities,
    });
    authoringChecks.push({
      kind: "sharing_governance_bundle",
      ok: check.ok,
      issues: check.issues,
    });
  }

  if (
    options.agent_package !== undefined &&
    options.provider_capabilities !== undefined &&
    options.share_artifact !== undefined
  ) {
    const check = validateHostAuthoringKitContracts({
      agent_package: options.agent_package,
      provider_capabilities: options.provider_capabilities,
      share_artifact: options.share_artifact,
    });
    authoringChecks.push({
      kind: "kit_cross_contract",
      ok: check.ok,
      issues: check.issues,
    });
  }

  const nextSteps: string[] = [];
  if (authoringChecks.some((check) => !check.ok)) {
    nextSteps.push(
      "Fix invalid Creation Host authoring files before creating Builder-facing Build Agent sessions.",
    );
  }
  if (authoringChecks.length === 0) {
    nextSteps.push(
      "Pass --scaffold-project, --agent-package, --provider-capabilities, and --share-artifact to doctor-host to validate the Host authoring boundary.",
    );
  }
  if (nextSteps.length === 0) {
    nextSteps.push(
      "Keep authoring files in CI with the same validators before exposing the Host to Builders.",
    );
  }

  return {
    ok: authoringChecks.every((check) => check.ok),
    summary: {
      scaffold_project_checked: options.scaffold_project !== undefined,
      agent_package_checked: options.agent_package !== undefined,
      provider_capabilities_checked: options.provider_capabilities !== undefined,
      share_artifact_checked: options.share_artifact !== undefined,
      sharing_governance_checked: options.sharing_governance !== undefined,
      credential_rebinding_checked: options.credential_rebinding_evidence !== undefined,
    },
    authoring_checks: authoringChecks,
    next_steps: nextSteps,
  };
}

export function formatCreationHostDiagnosticsReport(
  report: CreationHostWorkspaceDiagnostics,
): string {
  const lines = [
    `Creation Host diagnostics: ${report.ok ? "passed" : "failed"}`,
    `profiles: ${report.summary.profile_count}`,
    `projects: ${report.summary.project_count}`,
    `versions: ${report.summary.version_count}`,
  ];

  for (const check of report.profile_checks) {
    lines.push(`profile ${check.profile_id || "<missing>"}: ${check.ok ? "ok" : "failed"}`);
    for (const issue of check.issues) {
      lines.push(`  [${issue.severity}] ${issue.code}: ${issue.message}`);
    }
  }

  for (const issue of report.workspace_checks) {
    lines.push(`workspace [${issue.severity}] ${issue.code}: ${issue.message}`);
  }

  lines.push("next steps:");
  for (const step of report.next_steps) lines.push(`  - ${step}`);
  return `${lines.join("\n")}\n`;
}

export function formatCreationHostAuthoringDiagnosticsReport(
  report: CreationHostAuthoringDiagnostics,
): string {
  const lines = [
    `Creation Host authoring diagnostics: ${report.ok ? "passed" : "failed"}`,
    `scaffold project checked: ${report.summary.scaffold_project_checked ? "yes" : "no"}`,
    `agent package checked: ${report.summary.agent_package_checked ? "yes" : "no"}`,
    `provider capabilities checked: ${report.summary.provider_capabilities_checked ? "yes" : "no"}`,
    `share artifact checked: ${report.summary.share_artifact_checked ? "yes" : "no"}`,
    `sharing governance checked: ${report.summary.sharing_governance_checked ? "yes" : "no"}`,
    `credential rebinding checked: ${report.summary.credential_rebinding_checked ? "yes" : "no"}`,
  ];

  for (const check of report.authoring_checks) {
    lines.push(`authoring ${check.kind}: ${check.ok ? "ok" : "failed"}`);
    for (const issue of check.issues) {
      lines.push(`  [${issue.severity}] ${issue.code}: ${issue.message}`);
    }
  }

  lines.push("authoring next steps:");
  for (const step of report.next_steps) lines.push(`  - ${step}`);
  return `${lines.join("\n")}\n`;
}

function formatIssues(issues: readonly CreationHostContractIssue[]): string {
  return issues.map((issue) => `${issue.code}: ${issue.message}`).join("\n");
}

function isJsonSerializable(value: unknown): boolean {
  if (value === null) return true;
  const type = typeof value;
  if (type === "string" || type === "number" || type === "boolean") {
    return Number.isFinite(value as number) || type !== "number";
  }
  if (type === "undefined" || type === "function" || type === "symbol" || type === "bigint") {
    return false;
  }
  if (Array.isArray(value)) return value.every(isJsonSerializable);
  if (type === "object") {
    return Object.values(value as Record<string, unknown>).every(isJsonSerializable);
  }
  return false;
}
