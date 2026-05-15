import type {
  AgentBackend,
  AgentLaunchOptions,
  AgentRunTurnResult,
  BuildThreadStore,
} from "@pneuma-framework/core";

export interface HostKitDraftVerification {
  readonly ok: boolean;
  readonly message: string;
  readonly changed_paths?: readonly string[];
}

export interface HostKitCodeAgentDraftReceipt {
  readonly receipt_id: string;
  readonly app_id: string;
  readonly proposal_id: string;
  readonly thread_id: string;
  readonly backend_type: string;
  readonly status: "completed";
  readonly changed_paths: readonly string[];
  readonly created_at_ms: number;
  readonly evidence_refs: readonly {
    readonly kind: "host_check";
    readonly check_id: string;
    readonly status: "passed";
  }[];
}

export type HostKitCodeAgentDraftResult =
  | {
      readonly ok: true;
      readonly run_turn: AgentRunTurnResult;
      readonly verification: HostKitDraftVerification;
      readonly receipt: HostKitCodeAgentDraftReceipt;
    }
  | {
      readonly ok: false;
      readonly reason: "agent_run_failed" | "draft_verification_failed";
      readonly message: string;
      readonly run_turn?: AgentRunTurnResult;
      readonly verification?: HostKitDraftVerification;
    };

export async function runHostKitCodeAgentDraft(input: {
  readonly app_id: string;
  readonly proposal_id: string;
  readonly backend: AgentBackend;
  readonly thread_store: BuildThreadStore;
  readonly thread_id: string;
  readonly cwd: string;
  readonly new_user_message: string;
  readonly system_prompt: string;
  readonly context_snapshot?: unknown;
  readonly launch?: Omit<AgentLaunchOptions, "cwd" | "initialPrompt" | "resumeSessionId">;
  readonly timeout_ms?: number;
  readonly poll_interval_ms?: number;
  readonly verify_draft: () => Promise<HostKitDraftVerification> | HostKitDraftVerification;
}): Promise<HostKitCodeAgentDraftResult> {
  let runTurn: AgentRunTurnResult;
  try {
    runTurn = await input.backend.runTurn({
      thread_store: input.thread_store,
      thread_id: input.thread_id,
      cwd: input.cwd,
      new_user_message: input.new_user_message,
      system_prompt: input.system_prompt,
      context_snapshot: input.context_snapshot,
      launch: input.launch,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await input.thread_store.appendTurn(input.thread_id, {
      kind: "host_event",
      label: "code_agent_draft_failed",
      payload: { reason: "agent_run_failed", message },
    });
    return { ok: false, reason: "agent_run_failed", message };
  }

  const verification = await waitForDraftVerification({
    verify: input.verify_draft,
    timeout_ms: input.timeout_ms ?? 120_000,
    poll_interval_ms: input.poll_interval_ms ?? 500,
  });
  if (!verification.ok) {
    await input.thread_store.appendTurn(input.thread_id, {
      kind: "host_event",
      label: "code_agent_draft_failed",
      payload: {
        reason: "draft_verification_failed",
        message: verification.message,
        backend_type: input.backend.type,
      },
    });
    return {
      ok: false,
      reason: "draft_verification_failed",
      message: verification.message,
      run_turn: runTurn,
      verification,
    };
  }

  const receipt: HostKitCodeAgentDraftReceipt = {
    receipt_id: `code-agent-draft-${input.proposal_id}`,
    app_id: input.app_id,
    proposal_id: input.proposal_id,
    thread_id: input.thread_id,
    backend_type: input.backend.type,
    status: "completed",
    changed_paths: verification.changed_paths ?? [],
    created_at_ms: Date.now(),
    evidence_refs: [{ kind: "host_check", check_id: "draft-verification", status: "passed" }],
  };
  await input.thread_store.appendTurn(input.thread_id, {
    kind: "host_event",
    label: "code_agent_draft",
    payload: receipt,
  });
  return {
    ok: true,
    run_turn: runTurn,
    verification,
    receipt,
  };
}

async function waitForDraftVerification(input: {
  readonly verify: () => Promise<HostKitDraftVerification> | HostKitDraftVerification;
  readonly timeout_ms: number;
  readonly poll_interval_ms: number;
}): Promise<HostKitDraftVerification> {
  const started = Date.now();
  let latest: HostKitDraftVerification = { ok: false, message: "verification not started" };
  while (Date.now() - started <= input.timeout_ms) {
    latest = await input.verify();
    if (latest.ok) return latest;
    await sleep(input.poll_interval_ms);
  }
  return latest;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
