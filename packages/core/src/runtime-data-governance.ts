import type { BuildChangeEvidenceRef } from "./build-assurance.js";

export const RUNTIME_GOVERNANCE_MODES = ["preview", "published"] as const;
export type RuntimeGovernanceMode = (typeof RUNTIME_GOVERNANCE_MODES)[number];

export const DATA_EVOLUTION_POLICY_KINDS = [
  "isolated-version-data",
  "carry-forward-with-receipt",
  "provider-managed-snapshot",
  "provider-managed-branch",
] as const;
export type DataEvolutionPolicyKind = (typeof DATA_EVOLUTION_POLICY_KINDS)[number];

export const RUNTIME_INTENT_ACTIONS = [
  "start_preview",
  "publish",
  "restart",
  "rollback",
  "migrate",
  "rebuild_index",
  "bind_credential",
] as const;
export type RuntimeIntentAction = (typeof RUNTIME_INTENT_ACTIONS)[number];

export const RUNTIME_GENERATION_STATUSES = ["current", "stale", "stopped"] as const;
export type RuntimeGenerationStatus = (typeof RUNTIME_GENERATION_STATUSES)[number];

export const RUNTIME_OBSERVATION_STATUSES = ["passed", "failed", "warning"] as const;
export type RuntimeObservationStatus = (typeof RUNTIME_OBSERVATION_STATUSES)[number];

export const RUNTIME_OBSERVATION_CHECK_KINDS = [
  "runtime_health",
  "runtime_config",
  "provider_check",
  "data_check",
  "credential_check",
] as const;
export type RuntimeObservationCheckKind = (typeof RUNTIME_OBSERVATION_CHECK_KINDS)[number];

export const RUNTIME_CONTROL_STATUSES = [
  "pending",
  "running",
  "completed",
  "failed_recovered",
  "failed_unrecovered",
] as const;
export type RuntimeControlStatus = (typeof RUNTIME_CONTROL_STATUSES)[number];

export const RECONCILE_RECOVERY_STATUSES = [
  "not_required",
  "recovered",
  "manual_repair_required",
  "failed_unrecovered",
] as const;
export type ReconcileRecoveryStatus = (typeof RECONCILE_RECOVERY_STATUSES)[number];

export type RuntimeDataGovernanceEvidenceRef =
  | BuildChangeEvidenceRef
  | { readonly kind: "runtime_generation"; readonly runtime_generation_id: string }
  | { readonly kind: "runtime_observation"; readonly observation_id: string }
  | { readonly kind: "runtime_control_receipt"; readonly receipt_id: string }
  | { readonly kind: "data_evolution_receipt"; readonly receipt_id: string };

export interface RuntimeDataGovernanceIssue {
  readonly path: string;
  readonly message: string;
}

export interface RuntimeDataGovernanceCheck {
  readonly ok: boolean;
  readonly issues: readonly RuntimeDataGovernanceIssue[];
}

export interface RuntimeIntent {
  readonly intent_id: string;
  readonly build_change_id: string;
  readonly app_id: string;
  readonly version_id: string;
  readonly profile_id: string;
  readonly mode: RuntimeGovernanceMode;
  readonly action: RuntimeIntentAction;
  readonly desired_state: string;
  readonly data_evolution_policy: DataEvolutionPolicyKind;
  readonly evidence_refs: readonly RuntimeDataGovernanceEvidenceRef[];
}

export interface RuntimeGeneration {
  readonly runtime_generation_id: string;
  readonly app_id: string;
  readonly version_id: string;
  readonly profile_id: string;
  readonly mode: RuntimeGovernanceMode;
  readonly status: RuntimeGenerationStatus;
  readonly service_url?: string;
  readonly created_at_ms: number;
  readonly stopped_at_ms?: number;
}

export interface RuntimeObservationCheck {
  readonly id: string;
  readonly kind: RuntimeObservationCheckKind;
  readonly status: "passed" | "failed" | "warning";
  readonly message: string;
}

export interface RuntimeObservation {
  readonly observation_id: string;
  readonly runtime_generation_id: string;
  readonly app_id: string;
  readonly version_id: string;
  readonly profile_id: string;
  readonly mode: RuntimeGovernanceMode;
  readonly status: RuntimeObservationStatus;
  readonly observed_at_ms: number;
  readonly checks: readonly RuntimeObservationCheck[];
  readonly evidence_refs: readonly RuntimeDataGovernanceEvidenceRef[];
}

export interface DataEvolutionReceiptStep {
  readonly id: string;
  readonly status: "passed" | "failed" | "skipped";
  readonly message: string;
}

export interface DataEvolutionReceipt {
  readonly receipt_id: string;
  readonly app_id: string;
  readonly source_version_id?: string;
  readonly target_version_id: string;
  readonly provider_profile_id: string;
  readonly policy: DataEvolutionPolicyKind;
  readonly status: "completed" | "failed" | "skipped";
  readonly created_at_ms: number;
  readonly steps: readonly DataEvolutionReceiptStep[];
  readonly evidence_refs: readonly RuntimeDataGovernanceEvidenceRef[];
}

export interface ReconcileAttemptStep {
  readonly id: string;
  readonly status: "passed" | "failed" | "skipped";
  readonly message: string;
}

export interface ReconcileAttempt {
  readonly attempt_id: string;
  readonly runtime_intent_id: string;
  readonly app_id: string;
  readonly version_id: string;
  readonly status: RuntimeControlStatus;
  readonly started_at_ms: number;
  readonly completed_at_ms?: number;
  readonly steps: readonly ReconcileAttemptStep[];
  readonly observation_ids: readonly string[];
  readonly data_evolution_receipt_ids: readonly string[];
  readonly recovery: {
    readonly status: ReconcileRecoveryStatus;
    readonly message?: string;
  };
}

export interface RuntimeControlReceipt {
  readonly receipt_id: string;
  readonly app_id: string;
  readonly build_change_id: string;
  readonly runtime_intent_id: string;
  readonly runtime_generation_id: string;
  readonly reconcile_attempt_id: string;
  readonly status: RuntimeControlStatus;
  readonly evidence_refs: readonly RuntimeDataGovernanceEvidenceRef[];
}

const runtimeGovernanceModes = new Set<string>(RUNTIME_GOVERNANCE_MODES);
const dataEvolutionPolicies = new Set<string>(DATA_EVOLUTION_POLICY_KINDS);
const runtimeIntentActions = new Set<string>(RUNTIME_INTENT_ACTIONS);
const runtimeGenerationStatuses = new Set<string>(RUNTIME_GENERATION_STATUSES);
const runtimeObservationStatuses = new Set<string>(RUNTIME_OBSERVATION_STATUSES);
const runtimeObservationCheckKinds = new Set<string>(RUNTIME_OBSERVATION_CHECK_KINDS);
const runtimeControlStatuses = new Set<string>(RUNTIME_CONTROL_STATUSES);
const reconcileRecoveryStatuses = new Set<string>(RECONCILE_RECOVERY_STATUSES);
const receiptRequiredPolicies = new Set<DataEvolutionPolicyKind>([
  "carry-forward-with-receipt",
  "provider-managed-snapshot",
  "provider-managed-branch",
]);

export function validateRuntimeIntent(intent: RuntimeIntent): RuntimeDataGovernanceCheck {
  const issues: RuntimeDataGovernanceIssue[] = [];
  required(issues, intent.intent_id, "intent_id");
  required(issues, intent.build_change_id, "build_change_id");
  required(issues, intent.app_id, "app_id");
  required(issues, intent.version_id, "version_id");
  required(issues, intent.profile_id, "profile_id");
  enumValue(issues, intent.mode, runtimeGovernanceModes, "mode");
  enumValue(issues, intent.action, runtimeIntentActions, "action");
  required(issues, intent.desired_state, "desired_state");
  enumValue(issues, intent.data_evolution_policy, dataEvolutionPolicies, "data_evolution_policy");
  arrayValue(issues, intent.evidence_refs, "evidence_refs");
  return result(issues);
}

export function validateRuntimeGeneration(generation: RuntimeGeneration): RuntimeDataGovernanceCheck {
  const issues: RuntimeDataGovernanceIssue[] = [];
  required(issues, generation.runtime_generation_id, "runtime_generation_id");
  required(issues, generation.app_id, "app_id");
  required(issues, generation.version_id, "version_id");
  required(issues, generation.profile_id, "profile_id");
  enumValue(issues, generation.mode, runtimeGovernanceModes, "mode");
  enumValue(issues, generation.status, runtimeGenerationStatuses, "status");
  nonNegativeNumber(issues, generation.created_at_ms, "created_at_ms");
  if (generation.stopped_at_ms !== undefined) {
    nonNegativeNumber(issues, generation.stopped_at_ms, "stopped_at_ms");
  }
  return result(issues);
}

export function validateRuntimeObservation(observation: RuntimeObservation): RuntimeDataGovernanceCheck {
  const issues: RuntimeDataGovernanceIssue[] = [];
  required(issues, observation.observation_id, "observation_id");
  required(issues, observation.runtime_generation_id, "runtime_generation_id");
  required(issues, observation.app_id, "app_id");
  required(issues, observation.version_id, "version_id");
  required(issues, observation.profile_id, "profile_id");
  enumValue(issues, observation.mode, runtimeGovernanceModes, "mode");
  enumValue(issues, observation.status, runtimeObservationStatuses, "status");
  nonNegativeNumber(issues, observation.observed_at_ms, "observed_at_ms");
  arrayValue(issues, observation.checks, "checks");
  for (const [index, check] of arrayOrEmpty(observation.checks).entries()) {
    required(issues, check.id, `checks.${index}.id`);
    enumValue(issues, check.kind, runtimeObservationCheckKinds, `checks.${index}.kind`);
    enumValue(issues, check.status, new Set(["passed", "failed", "warning"]), `checks.${index}.status`);
    required(issues, check.message, `checks.${index}.message`);
  }
  arrayValue(issues, observation.evidence_refs, "evidence_refs");
  return result(issues);
}

export function validateDataEvolutionReceipt(receipt: DataEvolutionReceipt): RuntimeDataGovernanceCheck {
  const issues: RuntimeDataGovernanceIssue[] = [];
  required(issues, receipt.receipt_id, "receipt_id");
  required(issues, receipt.app_id, "app_id");
  required(issues, receipt.target_version_id, "target_version_id");
  required(issues, receipt.provider_profile_id, "provider_profile_id");
  enumValue(issues, receipt.policy, dataEvolutionPolicies, "policy");
  enumValue(issues, receipt.status, new Set(["completed", "failed", "skipped"]), "status");
  nonNegativeNumber(issues, receipt.created_at_ms, "created_at_ms");
  arrayValue(issues, receipt.steps, "steps");
  for (const [index, step] of arrayOrEmpty(receipt.steps).entries()) {
    required(issues, step.id, `steps.${index}.id`);
    enumValue(issues, step.status, new Set(["passed", "failed", "skipped"]), `steps.${index}.status`);
    required(issues, step.message, `steps.${index}.message`);
  }
  arrayValue(issues, receipt.evidence_refs, "evidence_refs");
  return result(issues);
}

export function validateReconcileAttempt(attempt: ReconcileAttempt): RuntimeDataGovernanceCheck {
  const issues: RuntimeDataGovernanceIssue[] = [];
  required(issues, attempt.attempt_id, "attempt_id");
  required(issues, attempt.runtime_intent_id, "runtime_intent_id");
  required(issues, attempt.app_id, "app_id");
  required(issues, attempt.version_id, "version_id");
  enumValue(issues, attempt.status, runtimeControlStatuses, "status");
  nonNegativeNumber(issues, attempt.started_at_ms, "started_at_ms");
  if (attempt.completed_at_ms !== undefined) {
    nonNegativeNumber(issues, attempt.completed_at_ms, "completed_at_ms");
  }
  arrayValue(issues, attempt.steps, "steps");
  arrayValue(issues, attempt.observation_ids, "observation_ids");
  arrayValue(issues, attempt.data_evolution_receipt_ids, "data_evolution_receipt_ids");
  enumValue(issues, attempt.recovery?.status, reconcileRecoveryStatuses, "recovery.status");
  return result(issues);
}

export function validateRuntimeControlReceipt(receipt: RuntimeControlReceipt): RuntimeDataGovernanceCheck {
  const issues: RuntimeDataGovernanceIssue[] = [];
  required(issues, receipt.receipt_id, "receipt_id");
  required(issues, receipt.app_id, "app_id");
  required(issues, receipt.build_change_id, "build_change_id");
  required(issues, receipt.runtime_intent_id, "runtime_intent_id");
  required(issues, receipt.runtime_generation_id, "runtime_generation_id");
  required(issues, receipt.reconcile_attempt_id, "reconcile_attempt_id");
  enumValue(issues, receipt.status, runtimeControlStatuses, "status");
  arrayValue(issues, receipt.evidence_refs, "evidence_refs");
  return result(issues);
}

export function runtimeDataGovernanceIssues(
  checks: readonly RuntimeDataGovernanceCheck[],
): readonly RuntimeDataGovernanceIssue[] {
  return checks.flatMap((check) => check.issues);
}

export function isCurrentRuntimeGeneration(generation: RuntimeGeneration): boolean {
  return generation.status === "current";
}

export function assertRuntimeGenerationCanMutate(
  generation: RuntimeGeneration,
): { readonly ok: true } | { readonly ok: false; readonly reason: "runtime_generation_stale" } {
  return isCurrentRuntimeGeneration(generation)
    ? { ok: true }
    : { ok: false, reason: "runtime_generation_stale" };
}

export function dataEvolutionReceiptRequiredForPolicy(policy: DataEvolutionPolicyKind): boolean {
  return receiptRequiredPolicies.has(policy);
}

function required(issues: RuntimeDataGovernanceIssue[], value: unknown, path: string): void {
  if (String(value ?? "").trim().length === 0) {
    issues.push({ path, message: `${path} is required.` });
  }
}

function enumValue(
  issues: RuntimeDataGovernanceIssue[],
  value: unknown,
  allowed: ReadonlySet<string>,
  path: string,
): void {
  if (!allowed.has(String(value))) {
    issues.push({ path, message: `${path} is invalid.` });
  }
}

function arrayValue(issues: RuntimeDataGovernanceIssue[], value: unknown, path: string): void {
  if (!Array.isArray(value)) {
    issues.push({ path, message: `${path} must be an array.` });
  }
}

function nonNegativeNumber(issues: RuntimeDataGovernanceIssue[], value: unknown, path: string): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    issues.push({ path, message: `${path} must be a non-negative number.` });
  }
}

function arrayOrEmpty<T>(value: readonly T[] | undefined): readonly T[] {
  return Array.isArray(value) ? value : [];
}

function result(issues: readonly RuntimeDataGovernanceIssue[]): RuntimeDataGovernanceCheck {
  return { ok: issues.length === 0, issues };
}
