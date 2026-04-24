# Pneuma Framework Phase 3 Priority Plan

> Status: Draft v2 for team review
> Date: 2026-04-24
> Scope: next framework priorities after Operation MCP binding, live viewer updates, and session resume have been proven. Revised after team review of the first P1-P4 draft.

---

## Executive Summary

`pneuma-framework` has already proven the first critical loop:

```
Operation declaration
  -> runtime HTTP API
  -> agent MCP tool-call
  -> real app side effect
  -> SSE live viewer update
  -> resumable agent session
```

The next priority is not to build more template features. The next priority is to prove the deeper claim:

> A Builder can create or change software by talking to an agent, and the framework can make those changes persistent, governed, observable, and reversible.

This is the line between:

- "an AI app framework with a chat box"
- and "coding-agent infrastructure for creating durable software"

The plan below turns the current demo loop into a creation loop.

---

## Current Baseline

Already working:

- Template Operations can self-describe through `/api/config`.
- The opencode backend can expose template Operations as `op.*` MCP tools.
- The agent can invoke real Operations such as `add_bookmark`.
- Runtime persists data through SQLite and audit through NDJSON.
- Viewer can live-refresh through SSE after Operations execute.
- Agent conversation can resume through a thin session pointer.
- Core domain has the right primitives: Table, Row, Operation, Transform, Adapter, PolicySet, EventStream, IdentityRegistry, app history.

Main gap:

- The agent can use existing app capabilities, but cannot yet safely create or modify the app's own capabilities.

---

## North Star

The near-term north-star demo should be:

1. Builder opens an app in Dev mode.
2. Builder says: "Add a tags field to bookmarks."
3. Agent proposes the change.
4. Builder approves in the viewer.
5. Framework applies schema/data/policy changes.
6. Viewer updates live.
7. `app_history` records what changed, who/what changed it, and which agent session produced it.
8. The app can restart and keep the change.

This demo should feel like "software being shaped through conversation", not "a user asked an assistant to click an existing button."

---

## Correction From Team Review

The first draft treated "add/update lens" and "add tags on bookmarks" as comparable P1 slices. They are not the same kind of work.

- `upsert_lens` already exists as an Operation.
- A lens is currently a DB row.
- Agent adding an `anti-hype` lens proves the agent can use an existing app capability.
- It does not prove the Builder can change the app definition.

The real Phase 3 slice is schema-level change, such as adding `tags` to `bookmarks`. That changes the effective Table definition and forces the framework to answer definition persistence, attribution, app history, restart/reload, and governance questions.

Lens-via-agent may remain a demo warm-up, but it is not a Phase 3 acceptance criterion.

---

## P0 — Operation Semantics Cleanup

### Goal

Fix the small semantic cracks surfaced by the current prototype before using Operations to describe definition changes.

This should happen before P1. P1 will introduce more framework-level Operations. If Operation semantics remain imprecise, the definition-change work will create more placeholders and TODOs.

### Delivery Target

Make Operation output and read-only semantics expressive enough for agent-visible tools and future definition-editing tools.

### Problems to Fix

Current issue 1:

- `reads_only: true` requires `handler.kind === "query"`.
- Real apps need read-only computed code handlers such as `related_bookmarks` and `bookmark_graph`.
- Those Operations are currently forced to declare `reads_only: false`, which is semantically wrong.

Current issue 2:

- `OperationOutput` lacks shapes for computed derived results, graph results, and structured objects.
- Some Operations use `void` as a placeholder, which weakens `/api/config`, MCP tool descriptions, and future UI generation.

### Concrete Deliverables

- Amend `Operation` model to support read-only computed code handlers.
- Add explicit output kinds, likely:
  - `derived-list`
  - `graph`
  - `object` with JSON schema
- Update `/api/config` output schema generation.
- Update MCP bridge tool descriptors to include useful output descriptions.
- Migrate `related_bookmarks` and `bookmark_graph` to correct semantics.
- Add tests for read-only computed Operations and output schema emission.

### Acceptance Criteria

- Read-only computed Operations no longer masquerade as mutations.
- Agent-visible tool metadata correctly distinguishes reads, writes, destructive actions, and computed reads.
- `related_bookmarks` and `bookmark_graph` have meaningful output types.
- Existing audit and SSE semantics still behave correctly.
- Existing tests stay green.

### Non-goals

- Full GraphQL-like query language.
- Vector database pushdown.
- General dashboard/view system.

---

## P1 — True App Definition Change

### Goal

Enable the first thin slice where a Builder, through an agent, changes the app itself rather than only app data.

### Delivery Target

Build a minimal schema-level definition mutation path for `ai-bookmarks-core-domain`.

The first slice should support exactly one genuinely new definition change:

- Add a simple user-defined field `tags` on `bookmarks`.
- Persist the app-definition change under the workspace using a framework-owned definition model.
- Apply the change after runtime restart, with a clear path toward hot reload later.
- Record the change in `app_history`.

The implementation should avoid general code generation at this stage. It should also avoid treating JSON overlay as the long-term source of truth.

Preferred direction: system-owned app-definition Tables, following the precedent of `IdentityRegistry`.

Minimum viable meta-model:

- `pneuma_table_columns`
  - `table_id`
  - `column_name`
  - `cell_type`
  - `nullable`
  - `default_value`
  - `created_by`
  - `definition_version`

Effective config:

```
template static definition
  + system-owned app-definition rows
  = effective AppConfig
```

JSON may be used as an implementation cache or snapshot, but not as the domain source of truth.

### Concrete Deliverables

- Minimal system-owned definition table for Builder-authored column additions.
- Runtime loader that merges template defaults with system-owned definition rows.
- One agent-callable Operation or framework tool for safe declaration edits.
- `app_history.append(...)` wired for declaration changes.
- Audit events for definition-change Operations.
- Developer verification script showing:
  - start app
  - agent adds `tags`
  - restart app manually or through the current lifecycle tool
  - tags still exist
  - history contains the change

### Acceptance Criteria

- A Builder can ask the agent to add `bookmarks.tags` without manual file editing.
- The change survives process restart.
- The change is represented as structured declaration, not hidden ad hoc code.
- The change is stored through the same domain/storage posture as other framework-owned state, not as an unrelated side file.
- `app_history` contains actor, actor kind, description, scope, and whether the change was AI-generated.
- The effective `bookmarks` Table schema includes `tags` after restart.
- A row write that uses `tags` is validated by the normal schema/CellType path.
- Existing tests stay green.

P1 alone is not demo-complete. The user-facing creation-loop demo requires P2's framework-owned apply/restart protocol so the agent receives an unambiguous completion result.

### Non-goals

- Arbitrary generated TypeScript handlers.
- Runtime hot reload without restart.
- Full visual view-builder.
- Multi-user collaboration.
- Full Table/Operation/Transform/PolicyRule meta-model.

---

## P2 — Agent Attribution and Framework-Owned Apply/Restart Protocol

### Goal

Make every agent-driven Operation carry the correct identity, session, and invocation source, and make definition-apply restarts explicit to the agent.

Today, HTTP Operations are still effectively treated as UI-originated unless the caller manually builds a different context. For enterprise and audit semantics, that is not enough.

Also, if P1 accepts restart instead of hot reload, restart cannot be an implicit side effect that confuses the agent. It must be a framework-owned transaction with a clear result.

### Delivery Target

Introduce two related contracts:

1. A minimal invocation context contract from MCP bridge to runtime.
2. A framework-owned `definition.apply` flow that can persist definition changes, restart the template service, rediscover `/api/config`, and return a completion result to the agent.

### Concrete Deliverables

- Runtime accepts explicit invocation metadata:
  - `invoked_via: "agent" | "ui" | "cli" | "webhook" | "system"`
  - `builder_id`
  - `agent_backend`
  - `backend_session_id`
  - optional `pneuma_session_id`
- MCP bridge forwards this metadata when invoking `/api/operations/:id`.
- `OperationExecutor` audit events preserve this metadata.
- `app_history` can link declaration changes to the agent session that produced them.
- A `definition.apply` or equivalent framework tool/Operation with this high-level transaction:
  - validate definition change
  - persist definition rows
  - append `app_history`
  - stop template service
  - start template service
  - wait for `service-ready`
  - refetch `/api/config`
  - return `{ applied: true, definition_version, restart: "completed" }`
- Tests showing UI and agent calls share the same Operation pipeline but differ in attribution.

### Acceptance Criteria

- Audit records can answer: "Was this change made by a user click or an agent tool call?"
- Audit records can answer: "Which agent session produced this change?"
- Agent receives a structured completion result after definition apply and restart.
- A template restart during definition apply does not require the agent to guess whether the change succeeded.
- `/api/config` is refreshed after restart before the apply call is considered complete.
- Existing UI calls continue to work without providing agent metadata.
- No template-specific code is required to get baseline attribution.

### Non-goals

- Full auth system.
- OIDC/SAML.
- Organization/team membership enforcement.
- Usage metering.
- Hot reload.

---

## P3a — Wire-Protocol Prompt Loop

### Goal

Bring the wire-protocol into real viewer use with the smallest possible prompt/response loop.

This must happen before destructive Operation confirmation. Otherwise P3 would introduce viewer WebSocket consumption, backend prompt translation, viewer UI, and Operation retry semantics all at once.

### Delivery Target

Viewer establishes a WebSocket connection to the framework wire server, receives a minimal permission/confirmation prompt, and sends allow/deny back. This slice does not need to bind to destructive Operations yet.

### Concrete Deliverables

- Viewer-side WebSocket connection using existing wire-protocol session metadata.
- Minimal prompt envelope rendered in the viewer.
- Allow/deny response envelope from viewer to framework.
- Framework test harness that can push a prompt and receive a response.
- Demo where a synthetic framework prompt appears in the viewer and records the Builder decision.

### Acceptance Criteria

- `packages/core/src/wire-protocol/` has a real viewer consumer.
- The viewer can receive a prompt over WS and send a response over WS.
- The prompt flow is independent from SSE; SSE remains server-to-viewer state observation.
- The implementation does not require a destructive Operation yet.

### Non-goals

- Operation retry semantics.
- Impact disclosure rendering beyond a minimal prompt body.
- Multi-user routing.

---

## P3b — Structured Confirmation for Destructive Agent Actions

### Goal

Turn destructive agent actions from "tool error with HTTP 428" into a real Builder approval flow, using the P3a prompt loop.

### Delivery Target

When an agent invokes a destructive Operation without confirmation:

1. Runtime returns a structured confirmation-required response.
2. MCP bridge converts it into a permission/confirmation request.
3. Viewer shows the impact disclosure.
4. Builder approves or denies.
5. Bridge retries with `confirmed: true` only after approval.

### Concrete Deliverables

- Confirmation response schema for Operation calls.
- MCP bridge handling for `confirmation_required`.
- Wire-protocol binding from confirmation request to P3a prompt/response.
- Viewer UI for Operation impact disclosure.
- End-to-end demo with `delete_bookmark` or `delete_lens`.

### Acceptance Criteria

- Agent cannot silently execute destructive Operations.
- Builder sees the concrete impact, not only a generic "are you sure?"
- Denial is recorded and does not mutate data.
- Approval retries the same Operation with the same input and trace/session metadata.
- UI-triggered and agent-triggered destructive Operations share the same confirmation semantics.

### Non-goals

- Full policy editor.
- Multi-step approval workflows.
- Enterprise admin approval chains.

---

## Suggested Execution Order

### Milestone 0: Clean Operation Semantics

Do P0 first.

Reason: P1-P3 will add more framework-level Operations. Fixing read-only computed handlers and output schemas first prevents more placeholder semantics from spreading.

### Milestone 1: Definition Storage and Effective Schema

Do P1 next.

Reason: it proves the core product claim. Without a real schema-level change, the framework remains an agent-operated app runtime rather than a software creation substrate.

Expected verification:

> Builder asks for a `tags` field on bookmarks. Agent applies a constrained schema declaration change. Runtime persists it. A restart shows the effective schema includes the field. History records it.

### Milestone 2: Attribution and Apply/Restart Protocol

Do P2 immediately after P1.

Reason: once agents can modify app definitions, attribution becomes mandatory. If restart is accepted for P1, the agent also needs a structured apply/restart result.

Expected demo after P2:

> Builder asks for a `tags` field on bookmarks. Agent calls the definition apply path. Framework persists the definition, restarts the template service, refetches `/api/config`, returns a completion result, and the viewer reflects the change.

### Milestone 3: Wire-Protocol Prompt Loop

Do P3a next.

Reason: wire-protocol needs one real viewer consumer before destructive confirmation can be implemented cleanly.

### Milestone 4: Safe Destructive Actions

Do P3b after P3a.

Reason: creation is not enough; safe modification and deletion are part of real software work. But this should build on a proven prompt/response channel, not introduce it at the same time.

---

## What We Should Defer

Defer for now:

- A third reference app.
- More graph/embedding features inside `ai-bookmarks`.
- Marketplace/distribution UI.
- Full enterprise auth.
- Multi-tenant cloud runtime.
- Arbitrary code-generation Operations.
- Hot reload for every declaration type.
- Full Table/Operation/Transform/PolicyRule meta-model.
- Full `pneuma-skills` migration.

These are valuable, but they do not answer the immediate strategic question:

> Can pneuma-framework let a Builder create governed software through conversation?

---

## Relationship to Pneuma Skills and Enterprise

This plan keeps the three-layer strategy clean:

- `pneuma-skills` remains the open personal/community exploration layer where AI capability distribution can stay free-form and expressive.
- `pneuma-framework` becomes the substrate where those capabilities turn into durable software with persistence, lifecycle, audit, permissions, and app history.
- Pneuma Enterprise can later build on the framework once attribution, confirmation, app history, and policy surfaces are stable.

The near-term test is not whether we can build many apps. The test is whether the same framework can support:

- personal creation with taste
- persistent app evolution
- governed team/enterprise changes

P0-P3b are the shortest path toward that proof.

---

## Team Review Questions

Resolved in this draft:

1. Lens creation is not a Phase 3 definition-change acceptance criterion.
2. P0 moves before P1.
3. P1 targets `bookmarks.tags`, not a lens row.
4. App-definition source of truth should align with system-owned Tables, not a long-term JSON overlay.
5. P3 is split into P3a wire-protocol prompt loop and P3b destructive Operation confirmation.

Still open:

1. Is `pneuma_table_columns` enough as the first system-owned definition table, or should P1 name a more general `pneuma_definition_entries` table?
2. Should `definition.apply` be an app-level Operation, a framework lifecycle tool, or both?
3. What is the minimum UI needed to make `bookmarks.tags` visible after restart?
4. Should P1 write only snapshots to `app_history`, or also begin shaping delta entries?
