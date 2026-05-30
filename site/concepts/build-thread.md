# BuildThread

A Creation Host is a long conversation that produces real, governed change. The
question is: **where does that conversation actually live?** The naive answer —
"in the agent backend's session" — is wrong, and fixing it is what **BuildThread**
is for.

![BuildThread as a framework-owned transcript of typed turns (user, proposal, decision, receipt) sitting above swappable agent backends](/diagrams/build-thread.png)

## The problem: backend sessions are not the source of truth

Every agent backend — Codex, opencode, Anthropic — keeps its own native session.
If you treat *that* as the record of what happened, you have bound the most
important asset in the system (the history of proposals, decisions, and execution
receipts) to one vendor's session format. Swap the backend and the history is
gone. Inspect the history and you are at the mercy of a cache you do not own.

BuildThread inverts this. **ADR-0032** pins the rule:

> The framework stores a canonical semantic transcript in the Creation Host
> workspace. Backend adapters may still keep native sessions for performance, but
> they rebuild or continue from the framework transcript.

The transcript is the source of truth; the backend session is a cache. The
transcript lives in the *Host workspace* (`<workspace>/.pneuma/build-threads.json`
in v0), not in a Generated Application's runtime database and not in a vendor's
servers.

## What a thread is made of

A `BuildThread` is an ordered list of typed `BuildTurn`s. The turn *kinds* are the
vocabulary of a governed conversation:

| Turn kind | Meaning |
|---|---|
| `user` | The Builder said something. |
| `agent_text` | The agent's narration. |
| `agent_clarification` | The agent asked the Builder a question. |
| `agent_proposal` | The agent proposed a change-set or tool plan. |
| `user_decision` | The Builder approved or rejected (`approved` \| `rejected`). |
| `host_execution_receipt` | What actually happened. |
| `host_event` | A Host-owned escape hatch. |

The `host_execution_receipt` status values are the same fail-closed vocabulary the
rest of the loop uses — `completed`, `rejected`, `failed_framework`,
`failed_host_rolled_back`, `failed_validate_rolled_back`. The transcript does not
just record "we tried"; it records *exactly* how a turn resolved, including a
rolled-back apply.

This is why both [change models](./change-models) write here: a code-lane
proposal appends an `agent_proposal` turn; the Builder's click appends a
`user_decision`; the apply appends a `host_execution_receipt`. The whole governed
loop is legible from the thread alone.

## Why portability is the payoff

Because the transcript is framework-owned and backend-neutral, three things become
possible that a vendor session cannot offer:

- **Swap backends mid-thread.** A new backend reconstructs context from the
  framework transcript — *"if a Host swaps backend implementations mid-thread, the
  new backend can reconstruct context from the framework transcript."*
- **Inspect and audit** the full proposal/decision/receipt history from one owned
  file, not a remote session API.
- **Replay** — the transcript is the durable record the Host's time-travel and
  checkpoint machinery builds on.

## `runTurn`: how a backend uses the thread

**ADR-0036** standardizes the backend entry point. To take one Builder follow-up,
the framework appends the Builder's `user` turn, **packs** the relevant prior
turns into role content (`packBuildTurnsForRoleContent`), hands that to the backend
through `AgentBackend.runTurn`, and records the resulting decision and receipt
turns back onto the thread. The backend may reuse its native session keyed by
`thread_id` as an optimization — but the framework never *depends* on it having
done so. Legacy launch/send transports implement the same contract through a shared
helper, so the thread stays the spine regardless of how a backend is wired.

## The one-line version

> The conversation that builds an app is too important to store in someone else's
> session. BuildThread makes it framework-owned, typed, fail-closed, and portable
> — the durable spine the entire [governed loop](/architecture/governed-loop)
> writes to.

That closes the domain-model deep dives. To see all of this driven end-to-end by a
real agent against a real stack, build one: **[Build a Host](/guide/)**.
