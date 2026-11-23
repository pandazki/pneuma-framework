import { diffTrees, isProtected, treeSignature, type TreeDiff, type TreeWalkOptions } from "./workspace.js";

// ---------------------------------------------------------------------------
// The governed-change backbone: turn a code-agent's draft workspace into a
// Builder-visible proposal, enforcing the invariants that are easy to get wrong.
//
// The framework owns the SEQUENCING and the GATING; the Host owns every effect
// (running the agent, classifying a timeout, the verify gate, gathering
// evidence) by supplying closures. This holds no opinion about the generated
// app's stack, domain, UI, or data — only about correctness:
//
//   1. fail-closed on a recoverable agent timeout (kill/fall through to verify);
//      re-throw any other error,
//   2. reject an empty change,
//   3. reject a change that touches a protected root (checked on the diff, not
//      on the agent's promises), then, when the Host declares writable roots,
//      one that touches a path outside all of them,
//   4. reject a draft that fails the scaffold's own `verify` (fail-closed), and,
//      when the Host seals the draft, one that changed while `verify` ran,
//   5. only then assemble a proposal with before/after evidence and the draft's
//      signature, which the Host can compare again right before it releases.
//
// A follow-up turn should pass a draft already copied from the PRIOR draft so
// fixes/additions stack (set `iterated`); the diff is always computed against
// the ACTIVE version so the proposal shows the full accumulated delta.
// ---------------------------------------------------------------------------

/** Evidence of a version/draft's effect, gathered by a host-supplied probe. */
export interface ObservationEvidence {
  /** Stable fingerprint of the app's data contract (e.g. column set). */
  appSchemaSignature: string;
  /** Content signature of the packaged client bundle. */
  bundleSignature: string;
  bundleBytes: number;
  /** Host-defined extra evidence (db schema, file manifest, ...). */
  extra?: Record<string, unknown>;
}

export interface GovernedProposal {
  draftId: string;
  changedPaths: string[];
  diff: TreeDiff;
  /** Tail of the verify output, for disclosure at approval time. */
  verifyTail: string;
  before: ObservationEvidence;
  after: ObservationEvidence;
  agentNote: string;
  /** True when this proposal refined a prior un-applied proposal. */
  iterated: boolean;
  /**
   * `treeSignature` of the draft under `walkOptions`, taken with the diff (before
   * `verify`). Compare it on the tree about to be released to release only what was diffed.
   */
  draftSignature: string;
}

/**
 * `outside_writable_roots` occurs only when `writableRoots` is given, and
 * `draft_changed_during_verify` only when `sealDraft` is set; a caller that passes
 * neither sees the other three reasons only.
 */
export type ProposalRejectionReason =
  | "no_change"
  | "protected_file_changed"
  | "outside_writable_roots"
  | "verify_failed"
  | "draft_changed_during_verify";

export class GovernedProposalRejected extends Error {
  constructor(
    readonly reason: ProposalRejectionReason,
    message: string,
    readonly detail?: string,
  ) {
    super(message);
    this.name = "GovernedProposalRejected";
  }
}

export interface VerifyResult {
  ok: boolean;
  output: string;
}

export interface BuildGovernedProposalInput {
  draftId: string;
  /** Materialized active version root (diff baseline). */
  activeRoot: string;
  /** Draft workspace root — already a copy of the base (active or prior draft). */
  draftRoot: string;
  /** Profile-declared protected roots; a draft touching any is rejected. */
  protectedRoots: readonly string[];
  /**
   * Profile-declared writable roots. When given, a draft touching a path outside all of
   * them is rejected as `outside_writable_roots` before `verify` runs. A protected path
   * is still rejected as `protected_file_changed`. Absent: no writable-root check.
   */
  writableRoots?: readonly string[];
  /**
   * Which files the backbone diffs and signs. Pass the options the Host versions with,
   * so `changedPaths` and `draftSignature` cover what it releases. Absent: host-kit's
   * default ignore list.
   */
  walkOptions?: TreeWalkOptions;
  /**
   * Sign the draft again after `verify` and reject it as `draft_changed_during_verify`
   * if it differs. `verify` usually runs agent-written code, and processes an agent
   * left behind can still be writing. Absent: `verify` may write into the draft.
   */
  sealDraft?: boolean;
  /** True when refining a prior un-applied proposal. */
  iterated?: boolean;
  /** Active version's evidence, to avoid re-observing it. */
  beforeEvidence?: ObservationEvidence;

  // --- host-supplied effects (the framework never implements these) ---
  /** Run one code-agent turn against the draft. May throw (e.g. a turn timeout). */
  runAgent: (draftRoot: string) => Promise<{ note: string }>;
  /** Classify a thrown error as a fail-closed-recoverable agent timeout. */
  isAgentTimeout: (err: unknown) => boolean;
  /** The scaffold's own pre-proposal gate. */
  verify: (draftRoot: string) => Promise<VerifyResult>;
  /** Gather evidence for a built version/draft root. */
  observe: (root: string) => Promise<ObservationEvidence>;
}

const TIMEOUT_NOTE = "agent turn timed out; fell through to verification (fail-closed)";

/**
 * Build a checked proposal from an agent draft, or throw GovernedProposalRejected.
 * The draft is mutated in place by `runAgent`.
 */
export async function buildGovernedProposal(
  input: BuildGovernedProposalInput,
): Promise<GovernedProposal> {
  // 1. Run the agent; a recoverable timeout falls through to the gate (fail-closed),
  //    any other failure aborts.
  let agentNote: string;
  try {
    const result = await input.runAgent(input.draftRoot);
    agentNote = result.note;
  } catch (err) {
    if (!input.isAgentTimeout(err)) throw err;
    agentNote = TIMEOUT_NOTE;
  }

  // 2. Diff against the active version (full accumulated delta). The signature is taken
  //    before the diff, not after: a write landing between the two then makes the draft
  //    differ from its signature, instead of being signed without the diff having seen it.
  const draftSignature = treeSignature(input.draftRoot, input.walkOptions);
  const diff = diffTrees(input.activeRoot, input.draftRoot, input.walkOptions);
  if (diff.changedPaths.length === 0) {
    throw new GovernedProposalRejected("no_change", "agent produced no change");
  }

  // 3. Protected-root enforcement on the diff (not on the agent's promises), then the
  //    writable roots.
  const violating = diff.changedPaths.filter((p) => isProtected(p, input.protectedRoots));
  if (violating.length > 0) {
    throw new GovernedProposalRejected(
      "protected_file_changed",
      `draft changed protected files: ${violating.join(", ")}`,
      violating.join(", "),
    );
  }
  const writableRoots = input.writableRoots;
  if (writableRoots) {
    const outside = diff.changedPaths.filter(
      (p) => !writableRoots.some((root) => p === root || p.startsWith(root + "/")),
    );
    if (outside.length > 0) {
      throw new GovernedProposalRejected(
        "outside_writable_roots",
        `draft changed paths outside the writable roots: ${outside.join(", ")}`,
        outside.join(", "),
      );
    }
  }

  // 4. The scaffold's own verify is the gate; failure is fail-closed.
  const verify = await input.verify(input.draftRoot);
  if (!verify.ok) {
    throw new GovernedProposalRejected(
      "verify_failed",
      "draft failed verify (fail-closed)",
      verify.output.slice(-2000),
    );
  }
  if (input.sealDraft && treeSignature(input.draftRoot, input.walkOptions) !== draftSignature) {
    throw new GovernedProposalRejected(
      "draft_changed_during_verify",
      "draft changed while verify ran, so what verify checked is not what was diffed",
    );
  }

  // 5. Assemble the proposal with before/after evidence.
  const before = input.beforeEvidence ?? (await input.observe(input.activeRoot));
  const after = await input.observe(input.draftRoot);
  return {
    draftId: input.draftId,
    changedPaths: diff.changedPaths,
    diff,
    verifyTail: verify.output.slice(-1200),
    before,
    after,
    agentNote,
    iterated: Boolean(input.iterated),
    draftSignature,
  };
}
