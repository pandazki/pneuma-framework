# M49 Agent Debug Loop Design

**Status:** Draft for implementation
**Date:** 2026-05-27
**Milestone:** M49

## Problem

M48 proves that a real code agent can modify controlled Generated Application
source, and that the Creation Host can turn the resulting diff into a governed
proposal. The missing coding-core primitive is what happens before the proposal.

Today the Host effectively assumes:

```text
Builder intent -> code agent produces one draft -> prepare proposal
```

That is not how coding agents work. A real code agent needs a loop:

```text
edit draft -> run checks -> read failures -> repair draft -> run checks again
```

Without a framework-level shape for that loop, every Creation Host will
hand-roll attempt budgets, failure summaries, retry prompts, debug traces, and
the boundary between "agent can still edit" and "Builder has approved this
change".

## Decision

Add an **Agent Debug Loop** primitive before Code Change Lane proposal
preparation.

```text
Builder intent
  -> BuildThread user turn
  -> Agent Debug Session
      attempt 1: agent edits draft -> checks fail
      attempt 2: agent reads failure -> edits draft -> checks pass
  -> prepareCodeChangeProposal()
  -> Builder approval
  -> applyCodeChangeProposal()
  -> post-apply deterministic verification / rollback
```

The key boundary is:

- **Before proposal:** the code agent may iterate inside draft workspaces under
  a Developer-declared budget.
- **Proposal:** the Builder sees a converged, pre-proposal-checked change set.
- **After approval/apply:** the Host/framework runs deterministic validation and
  recovery. The code agent does not silently keep programming. Any repair is a
  new debug loop and a new proposal.

## Terms

| Term | Meaning |
|---|---|
| `AgentDebugSession` | One attempt budget around one Builder intent before proposal. |
| `DebugAttempt` | One agent run against a draft workspace, followed by checks. |
| `DebugBudget` | Developer-declared maximum attempts / wall-clock / output budget. |
| `DebugCheck` | Developer or Host declared check run after each attempt. |
| `DebugOutcome` | `passed` means proposal preparation may start; anything else means no approval prompt. |
| `Corrective Proposal` | A later proposal after post-apply/publish failure evidence enters BuildThread. Not silent auto-repair. |

## Core Contract

Core should own the backend-neutral state machine:

```ts
export interface AgentDebugBudget {
  readonly max_attempts: number;
  readonly max_wall_time_ms?: number;
  readonly max_output_bytes?: number;
}

export interface AgentDebugCheck {
  readonly id: string;
  readonly description: string;
}

export interface AgentDebugAttemptRunner {
  (input: AgentDebugAttemptRunnerInput): Promise<AgentDebugAttemptRunnerResult>;
}

export interface AgentDebugCheckRunner {
  (input: AgentDebugCheckRunnerInput): Promise<AgentDebugCheckResult>;
}

export function runAgentDebugLoop(input: AgentDebugLoopInput): Promise<AgentDebugLoopResult>;
```

Core does not know Codex, opencode, Bun, React, Drizzle, or a Generated
Application's project shape. It only coordinates attempts, checks, budget
exhaustion, and BuildThread evidence.

## Host Kit Contract

Host Kit should provide a convenience wrapper for code-change lanes:

```ts
runHostKitCodeAgentDebugLoop({
  backend,
  thread_store,
  thread_id,
  cwd,
  initial_user_message,
  system_prompt,
  budget,
  checks,
})
```

The wrapper maps each attempt to `AgentBackend.runTurn`, feeds failure summaries
back to the backend on the next attempt, and returns a debug outcome that can be
attached to a later review packet.

The Host still owns:

- how to prepare/copy the draft workspace;
- which commands or probes are checks;
- how to summarize app-specific failures;
- how to render progress in the Creation Host UI.

## Failure Rules

M49 must preserve fail-closed semantics:

```text
if debug budget exhausted:
  no proposal

if final pre-proposal checks fail:
  no approval prompt

if pre-apply checks fail:
  no source mutation

if post-apply checks fail:
  rollback source
  record failed_validate_rolled_back
```

The debug loop only changes the first two cases. Code Change Lane already owns
the latter two cases and should remain the apply-time authority.

## Evidence Shape

Each attempt should produce inspectable evidence:

```ts
{
  session_id: "debug-...",
  attempt_index: 1,
  status: "failed_checks",
  agent: {
    backend_type: "codex-app-server",
    summary: "Added SLA fields but missed the view filter."
  },
  checks: [
    {
      id: "workflow-definition-valid",
      status: "failed",
      message: "view legal_queue references missing stage legal_review",
      output: "..."
    }
  ]
}
```

BuildThread should receive `host_event` turns, not new mandatory first-class
turn kinds in M49:

- `agent_debug_attempt`
- `agent_debug_session`

That keeps BuildThread portable while letting Host UIs render debug progress.

## Review Packet Integration

When the debug loop passes, the later review packet should include:

- attempt count;
- passed checks;
- latest failed checks, if any earlier attempts failed;
- budget used;
- evidence refs.

The Builder should understand that the proposal is:

> a converged candidate that passed declared pre-proposal checks,
> not a guarantee that apply, preview, publish, or end-user behavior cannot fail.

## Non-Goals

- No post-apply automatic code repair.
- No framework-owned test runner.
- No provider-specific backend message shape in core.
- No guarantee that proposal is "risk-free".
- No general autonomous coding workspace outside Scaffold Project boundaries.

## Acceptance Criteria

1. Core has tests proving:
   - passing first attempt returns `ok: true`;
   - failed first attempt can feed failure to second attempt;
   - budget exhaustion returns `ok: false` and does not claim proposal readiness;
   - BuildThread receives attempt/session evidence;
   - failed attempts do not append `agent_proposal`.
2. Host Kit has tests proving:
   - a fake backend can repair after a failed check;
   - a failed budget result is returned as structured evidence;
   - the successful result can feed `prepareHostKitCodeChangeReview`.
3. Workflow App Studio uses the debug loop for real code-agent mode:
   - UI shows attempt progress;
   - proposal is shown only after debug checks pass;
   - real Codex app-server E2E still edits only `src/app.ts`;
   - a deliberately failing task shows no approval prompt until repaired.
4. Documentation explains the boundary:
   - pre-proposal = agent debug loop;
   - proposal = verified-before-approval candidate;
   - post-apply = deterministic verification / rollback;
   - repair after apply = new proposal.
