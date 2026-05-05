import type { CredentialRequirement } from "./host-authoring.js";

export type SharingSubjectKind = "user" | "role" | "org" | "team";
export type SharingSubjectRef = `${SharingSubjectKind}:${string}`;
export type SharingAction =
  | "share"
  | "fork"
  | "install"
  | "approve"
  | "publish"
  | "rollback"
  | "revoke";
export type SharingScope = "artifact" | "forks" | "published-app";

export interface SharingGovernanceIssue {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface SharingGovernanceCheck<T> {
  readonly ok: boolean;
  readonly subject: T;
  readonly issues: readonly SharingGovernanceIssue[];
}

export interface SharingRightGrant {
  readonly id: string;
  readonly subject: SharingSubjectRef;
  readonly actions: readonly SharingAction[];
  readonly scope: SharingScope;
}

export interface SharingGovernanceManifest {
  readonly schema_version: 1;
  readonly governance_id: string;
  readonly artifact_id: string;
  readonly app_id: string;
  readonly version_id: string;
  readonly owner: SharingSubjectRef;
  readonly maintainers: readonly SharingSubjectRef[];
  readonly operators: readonly SharingSubjectRef[];
  readonly lineage: {
    readonly source_artifact_id?: string;
    readonly source_app_id?: string;
    readonly source_version_id?: string;
    readonly forked_from_governance_id?: string;
  };
  readonly rights: readonly SharingRightGrant[];
  readonly credential_rebinding_policy: {
    readonly required: true;
    readonly requirements: readonly CredentialRequirement[];
  };
  readonly revocation: {
    readonly revoked: boolean;
    readonly reason?: string;
    readonly revoked_by?: SharingSubjectRef;
    readonly revoked_at?: string;
  };
}

export interface CredentialRebindingEvidence {
  readonly schema_version: 1;
  readonly evidence_id: string;
  readonly artifact_id: string;
  readonly app_id: string;
  readonly subject: SharingSubjectRef;
  readonly bindings: readonly {
    readonly requirement_id: string;
    readonly provider_id: string;
    readonly status: "bound" | "missing" | "revoked";
    readonly bound_at?: string;
    readonly credential_ref?: string;
  }[];
}

export interface SharingGovernanceRequest {
  readonly action: SharingAction;
  readonly subject: SharingSubjectRef;
  readonly credential_rebinding_evidence?: CredentialRebindingEvidence;
}

export interface SharingGovernanceDecision {
  readonly allowed: boolean;
  readonly action: SharingAction;
  readonly subject: SharingSubjectRef;
  readonly reason_code:
    | "explicit-grant"
    | "owner"
    | "maintainer"
    | "operator"
    | "revoked"
    | "missing-grant"
    | "missing-credential-rebinding";
  readonly matched_grants: readonly string[];
  readonly missing_credential_requirement_ids: readonly string[];
}

const ID_RE = /^[a-z][a-z0-9-]{1,62}$/;
const SUBJECT_RE = /^(user|role|org|team):[a-zA-Z0-9][a-zA-Z0-9._/@-]{0,126}$/;
const ACTIONS = new Set<SharingAction>([
  "share",
  "fork",
  "install",
  "approve",
  "publish",
  "rollback",
  "revoke",
]);
const SCOPES = new Set<SharingScope>(["artifact", "forks", "published-app"]);
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
const CREDENTIAL_REQUIRED_ACTIONS = new Set<SharingAction>(["install", "fork", "publish"]);

export function validateSharingGovernanceManifest(
  manifest: SharingGovernanceManifest,
): SharingGovernanceCheck<SharingGovernanceManifest> {
  const issues: SharingGovernanceIssue[] = [];

  if (manifest?.schema_version !== 1) {
    issues.push(error(
      "sharing_governance.schema_version.invalid",
      "Sharing governance manifest schema_version must be 1.",
      "schema_version",
    ));
  }
  pushIdIssue(issues, manifest?.governance_id, "sharing_governance.governance_id.invalid", "governance_id");
  pushIdIssue(issues, manifest?.artifact_id, "sharing_governance.artifact_id.invalid", "artifact_id");
  pushIdIssue(issues, manifest?.app_id, "sharing_governance.app_id.invalid", "app_id");
  if (!String(manifest?.version_id ?? "").trim()) {
    issues.push(error(
      "sharing_governance.version_id.required",
      "Sharing governance version_id is required.",
      "version_id",
    ));
  }
  pushSubjectIssue(issues, manifest?.owner, "sharing_governance.owner.invalid", "owner");

  for (const [index, subject] of arrayOrEmpty(manifest?.maintainers).entries()) {
    pushSubjectIssue(
      issues,
      subject,
      "sharing_governance.maintainer.subject.invalid",
      `maintainers.${index}`,
    );
  }
  for (const [index, subject] of arrayOrEmpty(manifest?.operators).entries()) {
    pushSubjectIssue(
      issues,
      subject,
      "sharing_governance.operator.subject.invalid",
      `operators.${index}`,
    );
  }

  if (!Array.isArray(manifest?.rights)) {
    issues.push(error(
      "sharing_governance.rights.required",
      "Sharing governance rights must be an array.",
      "rights",
    ));
  } else {
    for (const [index, grant] of manifest.rights.entries()) {
      pushIdIssue(issues, grant?.id, "sharing_governance.right.id.invalid", `rights.${index}.id`);
      pushSubjectIssue(
        issues,
        grant?.subject,
        "sharing_governance.right.subject.invalid",
        `rights.${index}.subject`,
      );
      if (!Array.isArray(grant?.actions) || grant.actions.length === 0) {
        issues.push(error(
          "sharing_governance.right.actions.required",
          "Sharing right grant must include at least one action.",
          `rights.${index}.actions`,
        ));
      } else {
        for (const action of grant.actions) {
          if (!ACTIONS.has(action as SharingAction)) {
            issues.push(error(
              "sharing_governance.right.action.invalid",
              "Sharing right action is not supported.",
              `rights.${index}.actions`,
            ));
            break;
          }
        }
      }
      if (!SCOPES.has(grant?.scope as SharingScope)) {
        issues.push(error(
          "sharing_governance.right.scope.invalid",
          "Sharing right scope must be artifact, forks, or published-app.",
          `rights.${index}.scope`,
        ));
      }
    }
  }

  if (manifest?.credential_rebinding_policy?.required !== true) {
    issues.push(error(
      "sharing_governance.credential_rebinding.required",
      "Sharing governance must require credential rebinding.",
      "credential_rebinding_policy.required",
    ));
  }
  if (!Array.isArray(manifest?.credential_rebinding_policy?.requirements)) {
    issues.push(error(
      "sharing_governance.credential_rebinding.requirements_required",
      "Sharing governance credential rebinding policy must include requirements.",
      "credential_rebinding_policy.requirements",
    ));
  }
  if (manifest?.revocation?.revoked !== true && manifest?.revocation?.revoked !== false) {
    issues.push(error(
      "sharing_governance.revocation.revoked_required",
      "Sharing governance revocation.revoked must be a boolean.",
      "revocation.revoked",
    ));
  }
  if (manifest?.revocation?.revoked_by !== undefined) {
    pushSubjectIssue(
      issues,
      manifest.revocation.revoked_by,
      "sharing_governance.revocation.revoked_by.invalid",
      "revocation.revoked_by",
    );
  }

  return result(manifest, issues);
}

export function validateCredentialRebindingEvidence(
  evidence: CredentialRebindingEvidence,
  manifest: SharingGovernanceManifest,
): SharingGovernanceCheck<CredentialRebindingEvidence> {
  const issues: SharingGovernanceIssue[] = [];

  if (evidence?.schema_version !== 1) {
    issues.push(error(
      "credential_rebinding.schema_version.invalid",
      "Credential rebinding evidence schema_version must be 1.",
      "schema_version",
    ));
  }
  pushIdIssue(issues, evidence?.evidence_id, "credential_rebinding.evidence_id.invalid", "evidence_id");
  if (evidence?.artifact_id !== manifest.artifact_id) {
    issues.push(error(
      "credential_rebinding.artifact_id.mismatch",
      "Credential rebinding evidence must reference the governed artifact.",
      "artifact_id",
    ));
  }
  if (evidence?.app_id !== manifest.app_id) {
    issues.push(error(
      "credential_rebinding.app_id.mismatch",
      "Credential rebinding evidence must reference the governed app.",
      "app_id",
    ));
  }
  pushSubjectIssue(issues, evidence?.subject, "credential_rebinding.subject.invalid", "subject");

  const requirementById = new Map(
    arrayOrEmpty(manifest.credential_rebinding_policy?.requirements).map((requirement) => [
      requirement.id,
      requirement,
    ]),
  );
  if (!Array.isArray(evidence?.bindings)) {
    issues.push(error(
      "credential_rebinding.bindings.required",
      "Credential rebinding evidence must include bindings.",
      "bindings",
    ));
  } else {
    for (const [index, binding] of evidence.bindings.entries()) {
      const requirement = requirementById.get(binding?.requirement_id);
      if (!requirement) {
        issues.push(error(
          "credential_rebinding.binding.requirement_unknown",
          "Credential rebinding evidence references an unknown requirement.",
          `bindings.${index}.requirement_id`,
        ));
      } else if (binding.provider_id !== requirement.provider_id) {
        issues.push(error(
          "credential_rebinding.binding.provider_mismatch",
          "Credential rebinding evidence provider_id must match the requirement provider.",
          `bindings.${index}.provider_id`,
        ));
      }
      if (!["bound", "missing", "revoked"].includes(String(binding?.status))) {
        issues.push(error(
          "credential_rebinding.binding.status.invalid",
          "Credential rebinding status must be bound, missing, or revoked.",
          `bindings.${index}.status`,
        ));
      }
    }
  }

  pushSecretMaterialIssue(issues, evidence);

  return result(evidence, issues);
}

export function evaluateSharingGovernance(
  manifest: SharingGovernanceManifest,
  request: SharingGovernanceRequest,
): SharingGovernanceDecision {
  const matchedGrantIds = matchingGrantIds(manifest, request);
  if (manifest.revocation.revoked) {
    return decision(false, request, "revoked", matchedGrantIds, []);
  }

  let reason: SharingGovernanceDecision["reason_code"] | undefined;
  if (request.subject === manifest.owner) {
    reason = "owner";
  } else if (manifest.maintainers.includes(request.subject) && isMaintainerAction(request.action)) {
    reason = "maintainer";
  } else if (manifest.operators.includes(request.subject) && isOperatorAction(request.action)) {
    reason = "operator";
  } else if (matchedGrantIds.length > 0) {
    reason = "explicit-grant";
  }

  if (!reason) {
    return decision(false, request, "missing-grant", [], []);
  }

  const missingCredentialIds = missingCredentialRequirementIds(manifest, request);
  if (missingCredentialIds.length > 0) {
    return decision(false, request, "missing-credential-rebinding", matchedGrantIds, missingCredentialIds);
  }

  return decision(true, request, reason, matchedGrantIds, []);
}

function matchingGrantIds(
  manifest: SharingGovernanceManifest,
  request: SharingGovernanceRequest,
): string[] {
  return arrayOrEmpty(manifest.rights)
    .filter((grant) => grant.subject === request.subject && grant.actions.includes(request.action))
    .map((grant) => grant.id);
}

function missingCredentialRequirementIds(
  manifest: SharingGovernanceManifest,
  request: SharingGovernanceRequest,
): string[] {
  if (!CREDENTIAL_REQUIRED_ACTIONS.has(request.action)) return [];
  const evidence = request.credential_rebinding_evidence;
  const requiredRequirements = arrayOrEmpty(manifest.credential_rebinding_policy?.requirements)
    .filter((requirement) => requirement.required);
  if (!evidence || evidence.artifact_id !== manifest.artifact_id ||
    evidence.app_id !== manifest.app_id ||
    evidence.subject !== request.subject) {
    return requiredRequirements.map((requirement) => requirement.id);
  }
  const boundRequirementIds = new Set(
    arrayOrEmpty(evidence.bindings)
      .filter((binding) => binding.status === "bound")
      .map((binding) => binding.requirement_id),
  );
  return requiredRequirements
    .filter((requirement) => !boundRequirementIds.has(requirement.id))
    .map((requirement) => requirement.id);
}

function isMaintainerAction(action: SharingAction): boolean {
  return ["share", "approve", "publish", "rollback", "revoke"].includes(action);
}

function isOperatorAction(action: SharingAction): boolean {
  return ["publish", "rollback"].includes(action);
}

function decision(
  allowed: boolean,
  request: SharingGovernanceRequest,
  reasonCode: SharingGovernanceDecision["reason_code"],
  matchedGrants: readonly string[],
  missingCredentialIds: readonly string[],
): SharingGovernanceDecision {
  return {
    allowed,
    action: request.action,
    subject: request.subject,
    reason_code: reasonCode,
    matched_grants: matchedGrants,
    missing_credential_requirement_ids: missingCredentialIds,
  };
}

function pushIdIssue(
  issues: SharingGovernanceIssue[],
  value: unknown,
  code: string,
  path: string,
): void {
  if (!ID_RE.test(String(value ?? ""))) {
    issues.push(error(code, "Identifier must be kebab-case.", path));
  }
}

function pushSubjectIssue(
  issues: SharingGovernanceIssue[],
  value: unknown,
  code: string,
  path: string,
): void {
  if (!SUBJECT_RE.test(String(value ?? ""))) {
    issues.push(error(code, "Subject reference must look like user:bob, role:maintainer, org:acme, or team:acme/platform.", path));
  }
}

function pushSecretMaterialIssue(issues: SharingGovernanceIssue[], value: unknown): void {
  const seen = new Set<unknown>();

  function visit(node: unknown): void {
    if (!node || typeof node !== "object") return;
    if (seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    for (const [key, nested] of Object.entries(node)) {
      if (SECRET_KEYS.has(key.toLowerCase())) {
        issues.push(error(
          "credential_rebinding.secret_material.forbidden",
          "Credential rebinding evidence must not include raw secret material.",
          key,
        ));
        return;
      }
      visit(nested);
    }
  }

  visit(value);
}

function arrayOrEmpty<T>(value: readonly T[] | undefined): readonly T[] {
  return Array.isArray(value) ? value : [];
}

function error(code: string, message: string, path: string): SharingGovernanceIssue {
  return {
    severity: "error",
    code,
    message,
    path,
  };
}

function result<T>(subject: T, issues: SharingGovernanceIssue[]): SharingGovernanceCheck<T> {
  return {
    ok: issues.every((issue) => issue.severity !== "error"),
    subject,
    issues,
  };
}
