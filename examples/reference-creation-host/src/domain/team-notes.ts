export interface TeamNoteV0 {
  readonly id: string;
  readonly title: string;
  readonly body: string;
  readonly owner: string;
  readonly status: "open" | "done";
}

export interface TeamNoteV1 extends TeamNoteV0 {
  readonly review_status: "not_required" | "needs_review" | "approved";
}

export type TeamNote = TeamNoteV0 | TeamNoteV1;

export function seedTeamNotes(): readonly TeamNoteV0[] {
  return [
    {
      id: "note-1",
      title: "Design review",
      body: "Review the board interaction model.",
      owner: "Bob",
      status: "open",
    },
    {
      id: "note-2",
      title: "Release checklist",
      body: "Verify publish and rollback evidence.",
      owner: "Bob",
      status: "open",
    },
  ];
}

export function evolveNotesForReviewQueue(notes: readonly TeamNoteV0[]): readonly TeamNoteV1[] {
  return notes.map((note) => ({
    ...note,
    review_status: "not_required",
  }));
}

export function noteHasReviewStatus(note: TeamNote): note is TeamNoteV1 {
  return "review_status" in note;
}
