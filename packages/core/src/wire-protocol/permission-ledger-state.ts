import type { PermissionLedgerStore } from "../permission-ledger.js";
import type { WireEnvelope } from "./types.js";

type PermissionPromptEnvelope = Extract<WireEnvelope, { kind: "permission-prompt" }>;

export function seedPermissionLedgerState(input: {
  readonly ledger?: PermissionLedgerStore;
  readonly livePromptIds: ReadonlySet<string>;
  readonly livePromptEnvelopes: readonly PermissionPromptEnvelope[];
  readonly recentLimit?: number;
}): WireEnvelope[] {
  if (!input.ledger) return [];
  const records = input.ledger.listRequests({
    livePromptIds: input.livePromptIds,
  });
  if (records instanceof Promise) {
    throw new Error("seedPermissionLedgerState requires a synchronous PermissionLedgerStore");
  }

  const pending = records.filter((record) => record.status === "pending");
  const recent = records
    .filter((record) => record.status !== "pending")
    .slice(0, input.recentLimit ?? 20);
  const livePendingPromptIds = new Set(
    pending
      .filter((record) => record.live)
      .map((record) => record.prompt_id),
  );
  const livePromptEnvelopes = input.livePromptEnvelopes.filter((env) =>
    livePendingPromptIds.has(env.prompt.id),
  );

  return [
    {
      dir: "a2v",
      kind: "framework-event",
      event: {
        type: "permission-ledger-state",
        state: { pending, recent },
      },
    },
    ...livePromptEnvelopes,
  ];
}
