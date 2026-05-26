# Agent Debug Loop

**Audience:** Developers building Creation Hosts with code-changing Build-phase Agents.
**Chinese version:** [agent-debug-loop.zh-CN.md](./agent-debug-loop.zh-CN.md)
**Introduced:** M49

Agent Debug Loop is the proposal-before-approval coding loop:

```text
Builder intent
  -> agent edits draft workspace
  -> Host runs checks
  -> failed checks become feedback to the agent
  -> agent repairs draft
  -> checks pass
  -> Code Change Lane prepares a proposal
```

It sits before [Code Change Lane](./code-change-lane.md). Code Change Lane
still owns proposal evidence, Builder approval, apply, stale-base checks,
post-apply checks, and rollback.

## Why This Exists

M48 proved that a real code agent can edit controlled Generated Application
source. But a single draft attempt is not enough for real coding work. Agents
need to see type errors, build failures, product-specific validation failures,
and runtime smoke failures before asking a Builder to approve.

The framework boundary is:

- **before proposal:** agent can iterate under a Developer-declared budget;
- **proposal:** Builder sees a converged candidate that passed declared checks;
- **after apply:** Host/framework runs deterministic validation and rollback;
- **repair after apply:** new debug loop, new proposal.

## Core API

Use `runAgentDebugLoop` when you already have a way to run an agent attempt and
a way to run checks:

```ts
import { runAgentDebugLoop } from "@pneuma-framework/core/agent-debug-loop";

const debug = await runAgentDebugLoop({
  session_id: "debug-proposal-1",
  budget: { max_attempts: 3, max_wall_time_ms: 120_000 },
  checks: [{ id: "typecheck", description: "Run TypeScript." }],
  thread_store,
  thread_id,
  run_attempt: async ({ attempt_index, feedback }) => {
    await runYourAgent({
      prompt: feedback
        ? `Previous attempt failed:\n${feedback.summary}\nRepair the draft.`
        : "Implement the Builder request.",
    });
    return { ok: true, backend_type: "codex-app-server", summary: `attempt ${attempt_index} completed` };
  },
  run_check: async () => {
    const result = await runTypecheck();
    return { ok: result.ok, message: result.summary, output: result.output };
  },
});

if (!debug.ok) {
  // Do not ask for Builder approval.
  return debug;
}
```

`runAgentDebugLoop` records `host_event` turns in BuildThread:

- `agent_debug_attempt`
- `agent_debug_session`

It never appends an `agent_proposal` turn. A proposal should appear only after
the debug loop passes and the Host calls `prepareCodeChangeProposal`.

## Host Kit API

For common code-agent cases, use `runHostKitCodeAgentDebugLoop`:

```ts
import { runHostKitCodeAgentDebugLoop } from "@pneuma-framework/host-kit";

const debug = await runHostKitCodeAgentDebugLoop({
  app_id,
  backend,
  thread_store,
  thread_id,
  cwd: draftRoot,
  initial_user_message: builderMessage,
  system_prompt,
  budget: { max_attempts: 2 },
  checks: [
    {
      id: "draft-verification",
      description: "Generated app source is valid.",
      run: async () => verifyDraft(draftRoot),
    },
  ],
});
```

The wrapper calls `AgentBackend.runTurn` for each attempt and feeds failed check
summaries back into the next attempt. The Host still owns draft workspace
creation, concrete commands, product-specific verifiers, preview lifecycle, and
UI rendering.

## Failure Semantics

Agent Debug Loop is fail-closed:

```text
budget exhausted      -> no proposal
checks still failing  -> no proposal
attempt runner fails  -> retry until budget is exhausted
```

It does not weaken apply-time safety:

```text
pre_apply failure   -> no source mutation
post_apply failure  -> rollback source and record failed_validate_rolled_back
```

Do not let a code agent silently keep editing after approval. If an approved
change fails during apply, preview, publish, or rollout, record the failure in
BuildThread and start a corrective proposal if the Builder wants to continue.

## What A Builder Should See

The Builder should not see every raw token as a decision point. A good Creation
Host shows:

- attempt count and budget;
- failed check summaries;
- final passing checks;
- proposal diff and review packet;
- clear distinction between "debugging draft" and "awaiting approval".

This keeps approval tied to one coherent change set rather than to the agent's
intermediate debugging work.
