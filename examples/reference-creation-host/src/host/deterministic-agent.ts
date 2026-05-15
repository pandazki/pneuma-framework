export interface DeterministicReviewQueueProposal {
  readonly proposal_id: string;
  readonly build_change_id: string;
  readonly summary: string;
  readonly rationale: string;
}

export function proposeReviewQueueFeature(): DeterministicReviewQueueProposal {
  return {
    proposal_id: "proposal-review-queue",
    build_change_id: "change-review-queue",
    summary: "Add review queue.",
    rationale: "Notes need explicit review status, a queue view, and an approve action.",
  };
}
