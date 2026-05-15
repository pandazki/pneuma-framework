import {
  applyCodeChangeProposal,
  createBuildChangeReviewPacket,
  prepareCodeChangeProposal,
  type ApplyCodeChangeProposalResult,
  type BuildChangeGovernanceDecision,
  type BuildChangeMigrationMode,
  type BuildChangeReviewPacket,
  type BuildChangeRisk,
  type CodeChangeLaneCommandRunner,
  type PreparedCodeChangeProposal,
  type PrepareCodeChangeProposalResult,
  type ScaffoldProjectManifest,
} from "@pneuma-framework/core";

export interface PrepareHostKitCodeChangeReviewInput {
  readonly manifest: ScaffoldProjectManifest;
  readonly source_root: string;
  readonly draft_root: string;
  readonly proposal_id: string;
  readonly build_change_id: string;
  readonly app_id: string;
  readonly thread_id: string;
  readonly builder_subject: string;
  readonly summary: string;
  readonly rationale: string;
  readonly risks: readonly BuildChangeRisk[];
  readonly migration_mode: BuildChangeMigrationMode;
  readonly command_runner?: CodeChangeLaneCommandRunner;
}

export type PrepareHostKitCodeChangeReviewResult =
  | {
      readonly ok: true;
      readonly proposal: PreparedCodeChangeProposal;
      readonly review_packet: BuildChangeReviewPacket;
    }
  | {
      readonly ok: false;
      readonly proposal_result: Extract<PrepareCodeChangeProposalResult, { ok: false }>;
    };

export async function prepareHostKitCodeChangeReview(
  input: PrepareHostKitCodeChangeReviewInput,
): Promise<PrepareHostKitCodeChangeReviewResult> {
  const proposalResult = await prepareCodeChangeProposal({
    manifest: input.manifest,
    source_root: input.source_root,
    draft_root: input.draft_root,
    proposal_id: input.proposal_id,
    summary: input.summary,
    rationale: input.rationale,
    command_runner: input.command_runner,
  });
  if (!proposalResult.ok) {
    return { ok: false, proposal_result: proposalResult };
  }

  const reviewPacket = createBuildChangeReviewPacket({
    build_change_id: input.build_change_id,
    app_id: input.app_id,
    thread_id: input.thread_id,
    builder_subject: input.builder_subject,
    intent_summary: input.summary,
    scope_boundary: input.rationale,
    risk_classification: input.risks,
    pre_proposal_checks: proposalResult.proposal.evidence.checks.map((check) => ({
      id: check.id,
      phase: check.phase,
      status: check.status,
      message: check.message,
      output: check.output,
    })),
    evidence_refs: [{ kind: "code_change_receipt", proposal_id: input.proposal_id }],
    proposed_changes: [
      {
        kind: "source",
        title: "Source change",
        summary: input.summary,
        evidence_refs: [{ kind: "code_change_receipt", proposal_id: input.proposal_id }],
      },
      {
        kind: "migration",
        title: "Data evolution",
        summary: `Migration mode: ${input.migration_mode}`,
      },
    ],
    recovery_plan: {
      strategy: "corrective_proposal",
      summary: "A failed apply or rehearsal returns structured evidence to the BuildThread.",
    },
    migration_mode: input.migration_mode,
  });

  return {
    ok: true,
    proposal: proposalResult.proposal,
    review_packet: reviewPacket,
  };
}

export interface ApplyApprovedHostKitCodeChangeInput {
  readonly manifest: ScaffoldProjectManifest;
  readonly source_root: string;
  readonly draft_root: string;
  readonly proposal: PreparedCodeChangeProposal;
  readonly approval: Pick<BuildChangeGovernanceDecision, "allowed" | "reason_code">;
  readonly command_runner?: CodeChangeLaneCommandRunner;
}

export async function applyApprovedHostKitCodeChange(
  input: ApplyApprovedHostKitCodeChangeInput,
): Promise<ApplyCodeChangeProposalResult> {
  if (!input.approval.allowed) {
    return applyCodeChangeProposal({
      manifest: input.manifest,
      source_root: input.source_root,
      draft_root: input.draft_root,
      proposal: input.proposal,
      decision: "rejected",
      decision_reason: input.approval.reason_code,
      command_runner: input.command_runner,
    });
  }

  return applyCodeChangeProposal({
    manifest: input.manifest,
    source_root: input.source_root,
    draft_root: input.draft_root,
    proposal: input.proposal,
    decision: "approved",
    command_runner: input.command_runner,
  });
}
