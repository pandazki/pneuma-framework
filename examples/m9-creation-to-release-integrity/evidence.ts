import type {
  DefinitionChangeSetChildProgress,
  DefinitionChangeSetRecovery,
  DefinitionChangeSetStatus,
} from "../../packages/core/src/lifecycle.js";
import type { ReleaseCandidate } from "../../packages/core/src/release-candidate.js";

export type CreationToReleaseFinalStatus =
  | "proposed"
  | "approved"
  | "applying"
  | "recovering"
  | "recovered"
  | "release_candidate_building"
  | "release_candidate_ready"
  | "released"
  | "failed_repair_required"
  | "denied";

export type CreationToReleaseDecision = "allow" | "deny" | "allow-always";

export interface CreationToReleaseTimelineEntry {
  readonly at: string;
  readonly stage: CreationToReleaseFinalStatus;
  readonly summary: string;
  readonly detail?: unknown;
}

export interface CreationProposalEvidence {
  readonly intent: string;
  readonly summary: string;
  readonly tool: "definition.apply_change_set";
  readonly changes: readonly unknown[];
}

export interface CreationApprovalEvidence {
  readonly prompt_id: string;
  readonly decision: CreationToReleaseDecision;
  readonly decided_at: string;
}

export interface CreationExecutionEvidence {
  readonly change_set_id: string;
  readonly status: DefinitionChangeSetStatus;
  readonly child_progress: readonly Partial<DefinitionChangeSetChildProgress>[];
  readonly failed_change_index?: number;
}

export interface CreationToReleaseEvidence {
  readonly schema_version: 1;
  readonly run_id: string;
  readonly created_at: string;
  readonly builder_request: string;
  final_status: CreationToReleaseFinalStatus;
  proposal?: CreationProposalEvidence;
  approval?: CreationApprovalEvidence;
  execution?: CreationExecutionEvidence;
  recovery?: DefinitionChangeSetRecovery;
  release_candidate?: ReleaseCandidate;
  readonly timeline: CreationToReleaseTimelineEntry[];
}

export function createCreationToReleaseEvidence(input: {
  readonly run_id: string;
  readonly builder_request: string;
  readonly created_at?: string;
}): CreationToReleaseEvidence {
  const evidence: CreationToReleaseEvidence = {
    schema_version: 1,
    run_id: input.run_id,
    created_at: input.created_at ?? new Date().toISOString(),
    builder_request: input.builder_request,
    final_status: "proposed",
    timeline: [],
  };
  appendTimeline(evidence, "proposed", "Builder request received", {
    builder_request: input.builder_request,
  });
  return evidence;
}

export function recordCreationProposal(
  evidence: CreationToReleaseEvidence,
  proposal: CreationProposalEvidence,
): void {
  evidence.proposal = proposal;
  appendTimeline(evidence, "proposed", proposal.summary, proposal);
}

export function recordCreationApproval(
  evidence: CreationToReleaseEvidence,
  approval: {
    readonly prompt_id: string;
    readonly decision: CreationToReleaseDecision;
    readonly decided_at?: string;
  },
): void {
  evidence.approval = {
    prompt_id: approval.prompt_id,
    decision: approval.decision,
    decided_at: approval.decided_at ?? new Date().toISOString(),
  };
  evidence.final_status = approval.decision === "deny" ? "denied" : "approved";
  appendTimeline(evidence, evidence.final_status, decisionTimelineSummary(approval.decision), evidence.approval);
}

export function recordCreationExecution(
  evidence: CreationToReleaseEvidence,
  execution: CreationExecutionEvidence,
): void {
  evidence.execution = execution;
  evidence.final_status = execution.status === "failed" ? "recovering" : "applying";
  appendTimeline(evidence, evidence.final_status, `Change set ${execution.status}`, execution);
}

export function recordCreationRecovery(
  evidence: CreationToReleaseEvidence,
  recovery: DefinitionChangeSetRecovery,
): void {
  evidence.recovery = recovery;
  evidence.final_status = recovery.status === "manual_repair_required" ? "failed_repair_required" : "recovered";
  appendTimeline(evidence, evidence.final_status, `Recovery status: ${recovery.status}`, recovery);
}

export function recordCreationReleaseCandidate(
  evidence: CreationToReleaseEvidence,
  candidate: ReleaseCandidate,
): void {
  evidence.release_candidate = candidate;
  evidence.final_status = candidate.status === "ready" ? "release_candidate_ready" : "release_candidate_building";
  appendTimeline(evidence, evidence.final_status, `Release candidate ${candidate.status}`, candidate);
}

export function finalizeCreationToReleaseEvidence(
  evidence: CreationToReleaseEvidence,
  status: CreationToReleaseFinalStatus,
): void {
  evidence.final_status = status;
  appendTimeline(evidence, status, `Final status: ${status}`);
}

export function serializeCreationToReleaseEvidence(evidence: CreationToReleaseEvidence): string {
  return `${JSON.stringify({
    ...evidence,
    release_candidate: evidence.release_candidate ?? null,
  }, null, 2)}\n`;
}

function appendTimeline(
  evidence: CreationToReleaseEvidence,
  stage: CreationToReleaseFinalStatus,
  summary: string,
  detail?: unknown,
): void {
  evidence.timeline.push({
    at: new Date().toISOString(),
    stage,
    summary,
    ...(detail !== undefined ? { detail } : {}),
  });
}

function decisionTimelineSummary(decision: CreationToReleaseDecision): string {
  if (decision === "deny") return "Builder denied proposal";
  if (decision === "allow-always") return "Builder approved proposal persistently";
  return "Builder approved proposal";
}
