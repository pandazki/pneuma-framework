import type { BuildThreadStore } from "./build-thread.js";

export interface AgentDebugBudget {
  readonly max_attempts: number;
  readonly max_wall_time_ms?: number;
  readonly max_output_bytes?: number;
}

export interface AgentDebugCheck {
  readonly id: string;
  readonly description: string;
}

export type AgentDebugCheckStatus = "passed" | "failed";

export interface AgentDebugCheckEvidence {
  readonly id: string;
  readonly status: AgentDebugCheckStatus;
  readonly message: string;
  readonly output?: string;
}

export interface AgentDebugFeedback {
  readonly summary: string;
  readonly failed_checks: readonly AgentDebugCheckEvidence[];
  readonly failed_attempt: AgentDebugAttempt;
}

export interface AgentDebugAttemptRunnerInput {
  readonly session_id: string;
  readonly attempt_index: number;
  readonly budget: AgentDebugBudget;
  readonly prior_attempts: readonly AgentDebugAttempt[];
  readonly feedback?: AgentDebugFeedback;
}

export type AgentDebugAttemptRunnerResult =
  | {
      readonly ok: true;
      readonly backend_type?: string;
      readonly summary: string;
      readonly output?: string;
      readonly evidence?: unknown;
    }
  | {
      readonly ok: false;
      readonly backend_type?: string;
      readonly summary?: string;
      readonly message: string;
      readonly output?: string;
      readonly evidence?: unknown;
    };

export interface AgentDebugCheckRunnerInput {
  readonly session_id: string;
  readonly check: AgentDebugCheck;
  readonly attempt: AgentDebugAttempt;
  readonly prior_attempts: readonly AgentDebugAttempt[];
}

export interface AgentDebugCheckResult {
  readonly ok: boolean;
  readonly message: string;
  readonly output?: string;
}

export type AgentDebugAttemptStatus = "passed" | "failed_checks" | "failed_agent";

export interface AgentDebugAttempt {
  readonly session_id: string;
  readonly attempt_index: number;
  readonly status: AgentDebugAttemptStatus;
  readonly started_at_ms: number;
  readonly completed_at_ms: number;
  readonly agent: {
    readonly backend_type?: string;
    readonly summary: string;
    readonly output?: string;
    readonly evidence?: unknown;
  };
  readonly checks: readonly AgentDebugCheckEvidence[];
}

export type AgentDebugSessionStatus = "passed" | "budget_exhausted";

export interface AgentDebugSession {
  readonly session_id: string;
  readonly status: AgentDebugSessionStatus;
  readonly budget: AgentDebugBudget;
  readonly attempts: readonly AgentDebugAttempt[];
  readonly started_at_ms: number;
  readonly completed_at_ms: number;
}

export interface AgentDebugLoopInput {
  readonly session_id: string;
  readonly budget: AgentDebugBudget;
  readonly checks: readonly AgentDebugCheck[];
  readonly run_attempt: (input: AgentDebugAttemptRunnerInput) => Promise<AgentDebugAttemptRunnerResult>;
  readonly run_check: (input: AgentDebugCheckRunnerInput) => Promise<AgentDebugCheckResult>;
  readonly thread_store?: BuildThreadStore;
  readonly thread_id?: string;
}

export type AgentDebugLoopResult =
  | {
      readonly ok: true;
      readonly proposal_ready: true;
      readonly session: AgentDebugSession & { readonly status: "passed" };
      readonly passed_attempt: AgentDebugAttempt & { readonly status: "passed" };
    }
  | {
      readonly ok: false;
      readonly proposal_ready: false;
      readonly reason: "budget_exhausted";
      readonly session: AgentDebugSession & { readonly status: "budget_exhausted" };
      readonly latest_attempt?: AgentDebugAttempt;
    };

export async function runAgentDebugLoop(
  input: AgentDebugLoopInput,
): Promise<AgentDebugLoopResult> {
  validateBudget(input.budget);
  const startedAt = Date.now();
  const attempts: AgentDebugAttempt[] = [];
  let feedback: AgentDebugFeedback | undefined;

  for (let attemptIndex = 1; attemptIndex <= input.budget.max_attempts; attemptIndex += 1) {
    if (isWallTimeExhausted(startedAt, input.budget)) break;

    const attemptStartedAt = Date.now();
    const agentResult = await input.run_attempt({
      session_id: input.session_id,
      attempt_index: attemptIndex,
      budget: input.budget,
      prior_attempts: attempts,
      feedback,
    });

    const baseAttempt = {
      session_id: input.session_id,
      attempt_index: attemptIndex,
      started_at_ms: attemptStartedAt,
      completed_at_ms: Date.now(),
      agent: agentFromResult(agentResult, input.budget),
    };

    if (!agentResult.ok) {
      const attempt: AgentDebugAttempt = {
        ...baseAttempt,
        status: "failed_agent",
        checks: [],
      };
      attempts.push(attempt);
      await appendAttempt(input, attempt);
      feedback = feedbackForAttempt(attempt);
      continue;
    }

    const checks = await runChecks({
      ...input,
      attempt: { ...baseAttempt, status: "failed_checks", checks: [] },
      attempts,
    });
    const status: AgentDebugAttemptStatus = checks.some((check) => check.status === "failed")
      ? "failed_checks"
      : "passed";
    const attempt: AgentDebugAttempt = {
      ...baseAttempt,
      completed_at_ms: Date.now(),
      status,
      checks,
    };
    attempts.push(attempt);
    await appendAttempt(input, attempt);

    if (attempt.status === "passed") {
      const session = sessionFor(input, "passed", attempts, startedAt);
      await appendSession(input, session);
      return {
        ok: true,
        proposal_ready: true,
        session,
        passed_attempt: attempt as AgentDebugAttempt & { readonly status: "passed" },
      };
    }

    feedback = feedbackForAttempt(attempt);
  }

  const session = sessionFor(input, "budget_exhausted", attempts, startedAt);
  await appendSession(input, session);
  return {
    ok: false,
    proposal_ready: false,
    reason: "budget_exhausted",
    session,
    latest_attempt: attempts.at(-1),
  };
}

async function runChecks(input: AgentDebugLoopInput & {
  readonly attempt: AgentDebugAttempt;
  readonly attempts: readonly AgentDebugAttempt[];
}): Promise<readonly AgentDebugCheckEvidence[]> {
  const evidence: AgentDebugCheckEvidence[] = [];
  for (const check of input.checks) {
    const result = await input.run_check({
      session_id: input.session_id,
      check,
      attempt: input.attempt,
      prior_attempts: input.attempts,
    });
    evidence.push({
      id: check.id,
      status: result.ok ? "passed" : "failed",
      message: result.message,
      output: truncate(result.output, input.budget.max_output_bytes),
    });
  }
  return evidence;
}

function agentFromResult(
  result: AgentDebugAttemptRunnerResult,
  budget: AgentDebugBudget,
): AgentDebugAttempt["agent"] {
  return {
    backend_type: result.backend_type,
    summary: result.ok ? result.summary : result.summary ?? result.message,
    output: truncate(result.output, budget.max_output_bytes),
    evidence: result.evidence,
  };
}

function feedbackForAttempt(attempt: AgentDebugAttempt): AgentDebugFeedback {
  const failedChecks = attempt.checks.filter((check) => check.status === "failed");
  const summary = failedChecks.length > 0
    ? failedChecks.map((check) => `${check.id} failed: ${check.message}`).join("\n")
    : `attempt ${attempt.attempt_index} failed: ${attempt.agent.summary}`;
  return {
    summary,
    failed_checks: failedChecks,
    failed_attempt: attempt,
  };
}

function sessionFor<S extends AgentDebugSessionStatus>(
  input: AgentDebugLoopInput,
  status: S,
  attempts: readonly AgentDebugAttempt[],
  startedAt: number,
): AgentDebugSession & { readonly status: S } {
  return {
    session_id: input.session_id,
    status,
    budget: input.budget,
    attempts,
    started_at_ms: startedAt,
    completed_at_ms: Date.now(),
  };
}

async function appendAttempt(
  input: Pick<AgentDebugLoopInput, "thread_store" | "thread_id">,
  attempt: AgentDebugAttempt,
): Promise<void> {
  if (!input.thread_store || !input.thread_id) return;
  await input.thread_store.appendTurn(input.thread_id, {
    kind: "host_event",
    label: "agent_debug_attempt",
    payload: attempt,
  });
}

async function appendSession(
  input: Pick<AgentDebugLoopInput, "thread_store" | "thread_id">,
  session: AgentDebugSession,
): Promise<void> {
  if (!input.thread_store || !input.thread_id) return;
  await input.thread_store.appendTurn(input.thread_id, {
    kind: "host_event",
    label: "agent_debug_session",
    payload: session,
  });
}

function isWallTimeExhausted(startedAt: number, budget: AgentDebugBudget): boolean {
  return budget.max_wall_time_ms !== undefined && Date.now() - startedAt >= budget.max_wall_time_ms;
}

function validateBudget(budget: AgentDebugBudget): void {
  if (!Number.isInteger(budget.max_attempts) || budget.max_attempts < 1) {
    throw new Error("AgentDebugBudget.max_attempts must be a positive integer");
  }
  if (budget.max_wall_time_ms !== undefined && budget.max_wall_time_ms < 1) {
    throw new Error("AgentDebugBudget.max_wall_time_ms must be positive when provided");
  }
  if (budget.max_output_bytes !== undefined && budget.max_output_bytes < 1) {
    throw new Error("AgentDebugBudget.max_output_bytes must be positive when provided");
  }
}

function truncate(value: string | undefined, maxBytes: number | undefined): string | undefined {
  if (value === undefined || maxBytes === undefined) return value;
  const bytes = Buffer.from(value, "utf8");
  if (bytes.byteLength <= maxBytes) return value;
  return `${bytes.subarray(0, maxBytes).toString("utf8")}\n[truncated]`;
}
