export const BUILD_CHANGE_RISK_KINDS = [
  "additive_ui",
  "source_code_change",
  "definition_additive",
  "policy_change",
  "destructive_definition",
  "data_migration",
  "credential_boundary",
  "release_change",
] as const;

export type BuildChangeRisk = (typeof BUILD_CHANGE_RISK_KINDS)[number];

export const BUILD_CHANGE_READINESS_VALUES = [
  "needs_clarification",
  "blocked",
  "awaiting_approval",
  "ready_to_apply",
  "verified",
  "ready_to_publish",
  "published",
  "failed_recovered",
  "failed_unrecovered",
  "rolled_back",
  "superseded",
] as const;

export type BuildChangeReadiness = (typeof BUILD_CHANGE_READINESS_VALUES)[number];

export const BUILD_CHANGE_MIGRATION_MODES = [
  "none",
  "before_publish",
  "publish_downtime",
  "carry_forward_with_receipt",
  "irreversible_with_backup",
] as const;

export type BuildChangeMigrationMode = (typeof BUILD_CHANGE_MIGRATION_MODES)[number];

export const BUILD_CHANGE_PROPOSED_CHANGE_KINDS = [
  "definition",
  "source",
  "host_artifact",
  "runtime_config",
  "credential",
  "migration",
  "release",
] as const;

export type BuildChangeProposedChangeKind =
  (typeof BUILD_CHANGE_PROPOSED_CHANGE_KINDS)[number];

export const BUILD_CHANGE_RECOVERY_STRATEGIES = [
  "none_required",
  "discard_unapplied_draft",
  "rollback_to_previous_version",
  "restore_backup",
  "corrective_proposal",
  "manual_operator_recovery",
] as const;

export type BuildChangeRecoveryStrategy =
  (typeof BUILD_CHANGE_RECOVERY_STRATEGIES)[number];

export type BuildChangeEvidenceRef =
  | { readonly kind: "build_thread_turn"; readonly thread_id: string; readonly turn_id: string }
  | { readonly kind: "permission_ledger_record"; readonly request_id: string }
  | { readonly kind: "code_change_receipt"; readonly proposal_id: string }
  | { readonly kind: "definition_history"; readonly app_id: string; readonly version: number }
  | { readonly kind: "runtime_health"; readonly runtime_id: string; readonly checked_at_ms: number }
  | { readonly kind: "release_rollout"; readonly app_id: string; readonly rollout_id: string }
  | { readonly kind: "host_check"; readonly check_id: string; readonly status: BuildChangeCheckStatus };

export type BuildChangeCheckStatus = "passed" | "failed" | "skipped";
export type BuildChangeCheckPhase = "pre_proposal" | "pre_apply" | "post_apply" | "release";

export interface BuildChangeCheckEvidence {
  readonly id: string;
  readonly phase: BuildChangeCheckPhase;
  readonly status: BuildChangeCheckStatus;
  readonly message: string;
  readonly output?: string;
}

export interface BuildChangeReleaseCheckEvidence {
  readonly name: string;
  readonly status: "passed" | "failed";
  readonly message?: string;
  readonly at_ms: number;
}

export interface BuildChangeGovernanceAssessment {
  readonly required: boolean;
  readonly decision?: {
    readonly allowed: boolean;
    readonly reason_code: string;
    readonly required_roles: readonly string[];
    readonly missing_roles: readonly string[];
    readonly satisfied_by_subjects: readonly string[];
    readonly evidence_refs: readonly BuildChangeEvidenceRef[];
  };
}

export type BuildChangeIntentStatus = "clear" | "needs_clarification";
export type BuildChangeProposalStatus = "not_proposed" | "proposed";
export type BuildChangeApprovalStatus = "not_required" | "awaiting" | "approved" | "rejected";
export type BuildChangeExecutionStatus =
  | "not_started"
  | "applied"
  | "failed_recovered"
  | "failed_unrecovered"
  | "rolled_back"
  | "published"
  | "superseded";

export interface BuildChangeAssuranceAssessmentInput {
  readonly intent_status: BuildChangeIntentStatus;
  readonly proposal_status: BuildChangeProposalStatus;
  readonly approval_status: BuildChangeApprovalStatus;
  readonly execution_status: BuildChangeExecutionStatus;
  readonly risks: readonly BuildChangeRisk[];
  readonly checks: readonly BuildChangeCheckEvidence[];
  readonly evidence_refs: readonly BuildChangeEvidenceRef[];
  readonly release_checks?: readonly BuildChangeReleaseCheckEvidence[];
  readonly destructive_impact_disclosed?: boolean;
  readonly migration_mode?: BuildChangeMigrationMode;
  readonly governance?: BuildChangeGovernanceAssessment;
}

export interface BuildChangeAssuranceAssessment {
  readonly readiness: BuildChangeReadiness;
  readonly blocking_reasons: readonly string[];
  readonly rollback_notes: readonly string[];
  readonly migration_notes: readonly string[];
}

export interface BuildChangeAssuranceCase {
  readonly build_change_id: string;
  readonly app_id: string;
  readonly thread_id: string;
  readonly builder_subject: string;
  readonly intent_summary: string;
  readonly scope_summary: string;
  readonly risk_classification: readonly BuildChangeRisk[];
  readonly readiness: BuildChangeReadiness;
  readonly evidence_refs: readonly BuildChangeEvidenceRef[];
  readonly blocking_reasons: readonly string[];
  readonly rollback_notes?: readonly string[];
  readonly migration_notes?: readonly string[];
  readonly migration_mode?: BuildChangeMigrationMode;
}

export interface BuildChangeProposedChange {
  readonly kind: BuildChangeProposedChangeKind;
  readonly title: string;
  readonly summary: string;
  readonly destructive?: boolean;
  readonly evidence_refs?: readonly BuildChangeEvidenceRef[];
}

export interface BuildChangeRecoveryPlan {
  readonly strategy: BuildChangeRecoveryStrategy;
  readonly summary: string;
  readonly evidence_refs?: readonly BuildChangeEvidenceRef[];
}

export interface BuildChangeReviewPacket {
  readonly build_change_id: string;
  readonly app_id: string;
  readonly thread_id: string;
  readonly builder_subject: string;
  readonly intent_summary: string;
  readonly scope_boundary: string;
  readonly proposed_changes: readonly BuildChangeProposedChange[];
  readonly risk_classification: readonly BuildChangeRisk[];
  readonly pre_proposal_checks: readonly BuildChangeCheckEvidence[];
  readonly evidence_refs: readonly BuildChangeEvidenceRef[];
  readonly recovery_plan: BuildChangeRecoveryPlan;
  readonly migration_mode?: BuildChangeMigrationMode;
  readonly approval_statement: string;
}

export interface CreateBuildChangeAssuranceCaseInput {
  readonly build_change_id: string;
  readonly app_id: string;
  readonly thread_id: string;
  readonly builder_subject: string;
  readonly intent_summary: string;
  readonly scope_summary: string;
  readonly risks: readonly BuildChangeRisk[];
  readonly evidence_refs: readonly BuildChangeEvidenceRef[];
  readonly assessment: BuildChangeAssuranceAssessmentInput;
  readonly migration_mode?: BuildChangeMigrationMode;
}

export type CreateBuildChangeReviewPacketInput =
  Omit<BuildChangeReviewPacket, "approval_statement"> & {
    readonly approval_statement?: string;
  };

export type BuildChangeAssuranceValidationResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly issues: readonly BuildChangeAssuranceValidationIssue[] };

export interface BuildChangeAssuranceValidationIssue {
  readonly path: string;
  readonly message: string;
}

export function assessBuildChangeReadiness(
  input: BuildChangeAssuranceAssessmentInput,
): BuildChangeAssuranceAssessment {
  const blockingReasons: string[] = [];
  const rollbackNotes: string[] = [];
  const migrationNotes = migrationNotesFor(input.migration_mode);

  if (input.intent_status === "needs_clarification") {
    return {
      readiness: "needs_clarification",
      blocking_reasons: ["intent_needs_clarification"],
      rollback_notes: [],
      migration_notes: migrationNotes,
    };
  }

  collectFailedCheckReasons(input.checks, "pre_proposal", blockingReasons);
  collectFailedCheckReasons(input.checks, "pre_apply", blockingReasons);

  if (
    input.risks.includes("destructive_definition") &&
    input.destructive_impact_disclosed !== true
  ) {
    blockingReasons.push("destructive_change_missing_explicit_impact");
  }

  if (input.execution_status === "failed_recovered") {
    collectFailedCheckReasons(input.checks, "post_apply", blockingReasons);
    if (hasRollbackEvidence(input.evidence_refs)) {
      rollbackNotes.push("rollback evidence present");
    }
    return {
      readiness: "failed_recovered",
      blocking_reasons: blockingReasons,
      rollback_notes: rollbackNotes,
      migration_notes: migrationNotes,
    };
  }

  if (input.execution_status === "failed_unrecovered") {
    collectFailedCheckReasons(input.checks, "post_apply", blockingReasons);
    if (!hasRollbackEvidence(input.evidence_refs)) {
      blockingReasons.push("rollback_evidence_missing");
    }
    return {
      readiness: "failed_unrecovered",
      blocking_reasons: blockingReasons,
      rollback_notes: rollbackNotes,
      migration_notes: migrationNotes,
    };
  }

  if (blockingReasons.length > 0) {
    return {
      readiness: "blocked",
      blocking_reasons: blockingReasons,
      rollback_notes: rollbackNotes,
      migration_notes: migrationNotes,
    };
  }

  if (input.governance?.required === true && input.governance.decision?.allowed !== true) {
    return {
      readiness: "blocked",
      blocking_reasons: ["governance_approval_missing"],
      rollback_notes: rollbackNotes,
      migration_notes: migrationNotes,
    };
  }

  if (input.approval_status === "rejected") {
    return {
      readiness: "blocked",
      blocking_reasons: ["builder_rejected_proposal"],
      rollback_notes: rollbackNotes,
      migration_notes: migrationNotes,
    };
  }

  if (input.execution_status === "rolled_back") {
    return {
      readiness: "rolled_back",
      blocking_reasons: [],
      rollback_notes: hasRollbackEvidence(input.evidence_refs) ? ["rollback evidence present"] : [],
      migration_notes: migrationNotes,
    };
  }

  if (input.execution_status === "superseded") {
    return {
      readiness: "superseded",
      blocking_reasons: [],
      rollback_notes: rollbackNotes,
      migration_notes: migrationNotes,
    };
  }

  if (input.execution_status === "published") {
    return {
      readiness: "published",
      blocking_reasons: [],
      rollback_notes: rollbackNotes,
      migration_notes: migrationNotes,
    };
  }

  if (input.approval_status === "awaiting") {
    return {
      readiness: "awaiting_approval",
      blocking_reasons: [],
      rollback_notes: rollbackNotes,
      migration_notes: migrationNotes,
    };
  }

  if (input.approval_status === "approved" && input.execution_status === "not_started") {
    return {
      readiness: "ready_to_apply",
      blocking_reasons: [],
      rollback_notes: rollbackNotes,
      migration_notes: migrationNotes,
    };
  }

  if (input.execution_status === "applied") {
    collectFailedCheckReasons(input.checks, "post_apply", blockingReasons);
    collectFailedReleaseCheckReasons(input.release_checks ?? [], blockingReasons);
    if (blockingReasons.length > 0) {
      return {
        readiness: "blocked",
        blocking_reasons: blockingReasons,
        rollback_notes: rollbackNotes,
        migration_notes: migrationNotes,
      };
    }

    if ((input.release_checks?.length ?? 0) > 0 && allReleaseChecksPassed(input.release_checks ?? [])) {
      return {
        readiness: "ready_to_publish",
        blocking_reasons: [],
        rollback_notes: rollbackNotes,
        migration_notes: migrationNotes,
      };
    }

    if (hasPassedCheck(input.checks, "post_apply")) {
      return {
        readiness: "verified",
        blocking_reasons: [],
        rollback_notes: rollbackNotes,
        migration_notes: migrationNotes,
      };
    }
  }

  return {
    readiness: "blocked",
    blocking_reasons: ["insufficient_assurance_evidence"],
    rollback_notes: rollbackNotes,
    migration_notes: migrationNotes,
  };
}

export function createBuildChangeAssuranceCase(
  input: CreateBuildChangeAssuranceCaseInput,
): BuildChangeAssuranceCase {
  const assessment = assessBuildChangeReadiness({
    ...input.assessment,
    risks: input.risks,
    evidence_refs: input.evidence_refs,
    migration_mode: input.migration_mode ?? input.assessment.migration_mode,
  });

  return {
    build_change_id: input.build_change_id,
    app_id: input.app_id,
    thread_id: input.thread_id,
    builder_subject: input.builder_subject,
    intent_summary: input.intent_summary,
    scope_summary: input.scope_summary,
    risk_classification: [...input.risks],
    readiness: assessment.readiness,
    evidence_refs: input.evidence_refs.map(cloneEvidenceRef),
    blocking_reasons: assessment.blocking_reasons,
    rollback_notes: assessment.rollback_notes.length > 0 ? assessment.rollback_notes : undefined,
    migration_notes: assessment.migration_notes.length > 0 ? assessment.migration_notes : undefined,
    migration_mode: input.migration_mode ?? input.assessment.migration_mode,
  };
}

export function createBuildChangeReviewPacket(
  input: CreateBuildChangeReviewPacketInput,
): BuildChangeReviewPacket {
  const packet: BuildChangeReviewPacket = {
    build_change_id: input.build_change_id,
    app_id: input.app_id,
    thread_id: input.thread_id,
    builder_subject: input.builder_subject,
    intent_summary: input.intent_summary,
    scope_boundary: input.scope_boundary,
    proposed_changes: input.proposed_changes.map((change) => ({
      ...change,
      evidence_refs: change.evidence_refs?.map(cloneEvidenceRef),
    })),
    risk_classification: [...input.risk_classification],
    pre_proposal_checks: input.pre_proposal_checks.map((check) => ({ ...check })),
    evidence_refs: input.evidence_refs.map(cloneEvidenceRef),
    recovery_plan: {
      ...input.recovery_plan,
      evidence_refs: input.recovery_plan.evidence_refs?.map(cloneEvidenceRef),
    },
    migration_mode: input.migration_mode,
    approval_statement: input.approval_statement ?? "",
  };
  return {
    ...packet,
    approval_statement: input.approval_statement ?? formatBuildChangeApprovalStatement(packet),
  };
}

export function formatBuildChangeApprovalStatement(
  packet: Pick<BuildChangeReviewPacket, "intent_summary" | "scope_boundary">,
): string {
  return `Approve one Builder intent: ${packet.intent_summary.trim()} Scope: ${packet.scope_boundary.trim()}`;
}

export function validateBuildChangeReviewPacket(
  packet: BuildChangeReviewPacket,
): BuildChangeAssuranceValidationResult {
  const issues: BuildChangeAssuranceValidationIssue[] = [];

  requireNonEmpty("build_change_id", packet.build_change_id, issues);
  requireNonEmpty("app_id", packet.app_id, issues);
  requireNonEmpty("thread_id", packet.thread_id, issues);
  requireNonEmpty("builder_subject", packet.builder_subject, issues);
  requireNonEmpty("intent_summary", packet.intent_summary, issues);
  requireNonEmpty("scope_boundary", packet.scope_boundary, issues);
  requireNonEmpty("approval_statement", packet.approval_statement, issues);

  if (!Array.isArray(packet.proposed_changes) || packet.proposed_changes.length === 0) {
    issues.push({ path: "proposed_changes", message: "at least one proposed change is required" });
  }
  packet.proposed_changes.forEach((change, index) => {
    if (!isBuildChangeProposedChangeKind(change.kind)) {
      issues.push({
        path: `proposed_changes[${index}].kind`,
        message: `unknown proposed change kind: ${String(change.kind)}`,
      });
    }
    requireNonEmpty(`proposed_changes[${index}].title`, change.title, issues);
    requireNonEmpty(`proposed_changes[${index}].summary`, change.summary, issues);
    change.evidence_refs?.forEach((ref, refIndex) => {
      validateEvidenceRef(ref, `proposed_changes[${index}].evidence_refs[${refIndex}]`, issues);
    });
  });

  packet.risk_classification.forEach((risk, index) => {
    if (!isBuildChangeRisk(risk)) {
      issues.push({
        path: `risk_classification[${index}]`,
        message: `unknown risk kind: ${String(risk)}`,
      });
    }
  });

  packet.pre_proposal_checks.forEach((check, index) => {
    if (check.phase !== "pre_proposal") {
      issues.push({
        path: `pre_proposal_checks[${index}].phase`,
        message: "review packet checks must use pre_proposal phase",
      });
    }
    if (check.status !== "passed") {
      issues.push({
        path: `pre_proposal_checks[${index}]`,
        message: `pre-proposal check ${check.id} must pass before approval`,
      });
    }
  });

  packet.evidence_refs.forEach((ref, index) => {
    validateEvidenceRef(ref, `evidence_refs[${index}]`, issues);
  });

  if (!isBuildChangeRecoveryStrategy(packet.recovery_plan.strategy)) {
    issues.push({
      path: "recovery_plan.strategy",
      message: `unknown recovery strategy: ${String(packet.recovery_plan.strategy)}`,
    });
  }
  requireNonEmpty("recovery_plan.summary", packet.recovery_plan.summary, issues);
  packet.recovery_plan.evidence_refs?.forEach((ref, index) => {
    validateEvidenceRef(ref, `recovery_plan.evidence_refs[${index}]`, issues);
  });

  if (packet.risk_classification.includes("destructive_definition")) {
    if (!packet.proposed_changes.some((change) => change.destructive === true)) {
      issues.push({
        path: "proposed_changes",
        message: "destructive_definition risk requires at least one destructive proposed change",
      });
    }
    if (packet.recovery_plan.strategy === "none_required") {
      issues.push({
        path: "recovery_plan.strategy",
        message: "destructive changes require a non-empty recovery strategy",
      });
    }
  }

  if (
    packet.risk_classification.includes("data_migration") &&
    (!packet.migration_mode || packet.migration_mode === "none")
  ) {
    issues.push({
      path: "migration_mode",
      message: "data_migration risk requires an explicit non-none migration mode",
    });
  }

  if (
    packet.migration_mode !== undefined &&
    !isBuildChangeMigrationMode(packet.migration_mode)
  ) {
    issues.push({
      path: "migration_mode",
      message: `unknown migration mode: ${String(packet.migration_mode)}`,
    });
  }

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

export function validateBuildChangeAssuranceCase(
  assuranceCase: BuildChangeAssuranceCase,
): BuildChangeAssuranceValidationResult {
  const issues: BuildChangeAssuranceValidationIssue[] = [];

  requireNonEmpty("build_change_id", assuranceCase.build_change_id, issues);
  requireNonEmpty("app_id", assuranceCase.app_id, issues);
  requireNonEmpty("thread_id", assuranceCase.thread_id, issues);
  requireNonEmpty("builder_subject", assuranceCase.builder_subject, issues);
  requireNonEmpty("intent_summary", assuranceCase.intent_summary, issues);
  requireNonEmpty("scope_summary", assuranceCase.scope_summary, issues);

  assuranceCase.risk_classification.forEach((risk, index) => {
    if (!isBuildChangeRisk(risk)) {
      issues.push({
        path: `risk_classification[${index}]`,
        message: `unknown risk kind: ${String(risk)}`,
      });
    }
  });

  if (!isBuildChangeReadiness(assuranceCase.readiness)) {
    issues.push({
      path: "readiness",
      message: `unknown readiness: ${String(assuranceCase.readiness)}`,
    });
  }

  if (
    assuranceCase.migration_mode !== undefined &&
    !isBuildChangeMigrationMode(assuranceCase.migration_mode)
  ) {
    issues.push({
      path: "migration_mode",
      message: `unknown migration mode: ${String(assuranceCase.migration_mode)}`,
    });
  }

  assuranceCase.evidence_refs.forEach((ref, index) => {
    validateEvidenceRef(ref, `evidence_refs[${index}]`, issues);
  });

  return issues.length === 0 ? { ok: true } : { ok: false, issues };
}

function collectFailedCheckReasons(
  checks: readonly BuildChangeCheckEvidence[],
  phase: BuildChangeCheckPhase,
  reasons: string[],
): void {
  for (const check of checks) {
    if (check.phase === phase && check.status === "failed") {
      reasons.push(`${phase}_check_failed:${check.id}`);
    }
  }
}

function collectFailedReleaseCheckReasons(
  checks: readonly BuildChangeReleaseCheckEvidence[],
  reasons: string[],
): void {
  for (const check of checks) {
    if (check.status === "failed") {
      reasons.push(`release_check_failed:${check.name}`);
    }
  }
}

function hasPassedCheck(
  checks: readonly BuildChangeCheckEvidence[],
  phase: BuildChangeCheckPhase,
): boolean {
  return checks.some((check) => check.phase === phase && check.status === "passed");
}

function allReleaseChecksPassed(checks: readonly BuildChangeReleaseCheckEvidence[]): boolean {
  return checks.length > 0 && checks.every((check) => check.status === "passed");
}

function hasRollbackEvidence(refs: readonly BuildChangeEvidenceRef[]): boolean {
  return refs.some((ref) =>
    ref.kind === "code_change_receipt" ||
    (ref.kind === "host_check" && ref.status === "passed")
  );
}

function migrationNotesFor(mode: BuildChangeMigrationMode | undefined): readonly string[] {
  if (!mode || mode === "none") return [];
  return [`migration mode: ${mode}`];
}

function requireNonEmpty(
  path: string,
  value: string,
  issues: BuildChangeAssuranceValidationIssue[],
): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    issues.push({ path, message: `${path} is required` });
  }
}

function validateEvidenceRef(
  ref: BuildChangeEvidenceRef,
  path: string,
  issues: BuildChangeAssuranceValidationIssue[],
): void {
  switch (ref.kind) {
    case "build_thread_turn":
      requireNonEmpty(`${path}.thread_id`, ref.thread_id, issues);
      requireNonEmpty(`${path}.turn_id`, ref.turn_id, issues);
      return;
    case "permission_ledger_record":
      requireNonEmpty(`${path}.request_id`, ref.request_id, issues);
      return;
    case "code_change_receipt":
      requireNonEmpty(`${path}.proposal_id`, ref.proposal_id, issues);
      return;
    case "definition_history":
      requireNonEmpty(`${path}.app_id`, ref.app_id, issues);
      if (!Number.isInteger(ref.version) || ref.version < 1) {
        issues.push({ path: `${path}.version`, message: "version must be a positive integer" });
      }
      return;
    case "runtime_health":
      requireNonEmpty(`${path}.runtime_id`, ref.runtime_id, issues);
      if (!Number.isFinite(ref.checked_at_ms) || ref.checked_at_ms < 0) {
        issues.push({ path: `${path}.checked_at_ms`, message: "checked_at_ms must be non-negative" });
      }
      return;
    case "release_rollout":
      requireNonEmpty(`${path}.app_id`, ref.app_id, issues);
      requireNonEmpty(`${path}.rollout_id`, ref.rollout_id, issues);
      return;
    case "host_check":
      requireNonEmpty(`${path}.check_id`, ref.check_id, issues);
      if (!["passed", "failed", "skipped"].includes(ref.status)) {
        issues.push({ path: `${path}.status`, message: `unknown host check status: ${String(ref.status)}` });
      }
      return;
    default:
      issues.push({ path: `${path}.kind`, message: `unknown evidence kind: ${String((ref as { kind?: unknown }).kind)}` });
  }
}

function cloneEvidenceRef(ref: BuildChangeEvidenceRef): BuildChangeEvidenceRef {
  return { ...ref } as BuildChangeEvidenceRef;
}

function isBuildChangeRisk(value: unknown): value is BuildChangeRisk {
  return (BUILD_CHANGE_RISK_KINDS as readonly unknown[]).includes(value);
}

function isBuildChangeProposedChangeKind(value: unknown): value is BuildChangeProposedChangeKind {
  return (BUILD_CHANGE_PROPOSED_CHANGE_KINDS as readonly unknown[]).includes(value);
}

function isBuildChangeRecoveryStrategy(value: unknown): value is BuildChangeRecoveryStrategy {
  return (BUILD_CHANGE_RECOVERY_STRATEGIES as readonly unknown[]).includes(value);
}

function isBuildChangeReadiness(value: unknown): value is BuildChangeReadiness {
  return (BUILD_CHANGE_READINESS_VALUES as readonly unknown[]).includes(value);
}

function isBuildChangeMigrationMode(value: unknown): value is BuildChangeMigrationMode {
  return (BUILD_CHANGE_MIGRATION_MODES as readonly unknown[]).includes(value);
}
