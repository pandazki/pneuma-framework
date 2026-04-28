# Team Share Package

**Date:** 2026-04-27
**Status:** Current 0-prep team-share package
**Audience:** teammates who know normal software but do not know Pneuma internals.
**Format:** 30-minute live share with one local browser demo.

This is the recommended share package for the app-definition milestone. It is intentionally self-contained: a teammate should be able to understand why the milestone matters without reading ADRs first.

## Outcome

After the share, the team should be able to say:

```text
Pneuma is proving a new software construction loop:
Builder intent -> Agent proposal -> governed app-definition row -> runtime rediscovery -> visible app change -> reversible rollback.
```

They should also understand what is not done yet: hot reload, enterprise auth, restored-definition rollback, arbitrary code generation, and custom View component packaging.

## One-Sentence Framing

> Pneuma lets a Builder evolve a real app's schema, domain service, API surface, and end-user view by talking to an agent, while the framework keeps the change governed, attributable, and reversible.

中文讲法：

> 这不是 agent 帮用户点按钮，而是 Builder 通过 agent 改变一个真实 app 的软件结构；framework 负责审批、记录、重启发现和回滚。

## Opening Narrative

Use this before touching the browser.

```text
Most software assumes the Developer finishes the app shape before users arrive.
Pneuma is testing a different contract:
the Builder can change the app's own software surface in-session by talking to an Agent.
```

Then make the distinction explicit:

```text
Data mutation:
  "add one bookmark row"

Definition mutation:
  "teach this app a new capability and make it visible"
```

Key line:

> If this works, Pneuma is not just an agent UI. It is infrastructure for governed app evolution.

中文讲法：

> 重点不是“AI 帮我填了一条数据”，而是“AI 在 framework 的治理路径里，让这个 app 长出一个新的软件能力”。

## Share Run Of Show

| Time | Section | Goal |
|---:|---|---|
| 0-3 min | Frame the problem | Explain why data mutation is not enough. |
| 3-7 min | Introduce the demo app | Make Reader Bookmarks feel like a real app, not a framework test. |
| 7-20 min | Live demo | Walk Operation -> View -> rollback. |
| 20-25 min | Architecture readback | Map what happened to primitives and system-owned definition rows. |
| 25-30 min | Boundaries + next work | Align the team on what to build next. |

## Demo URL

Run the E2E example server:

```bash
cd examples/p5-viewer-approval-e2e
bun run build
bun ./server.ts
```

Open:

```text
http://127.0.0.1:<port>/?scenario=capability-lifecycle&variant=studio
```

The classic engineering proof remains available:

```text
http://127.0.0.1:<port>/?scenario=capability-lifecycle
```

Use `variant=studio` for team sharing.

## Presenter Checklist

Before the meeting:

```bash
bun run typecheck
bun test packages/core-domain/test/aggregates/operation.test.ts \
  packages/core-domain/test/lifecycle/pneuma-operations.test.ts \
  packages/core-domain/test/lifecycle/pneuma-views.test.ts \
  packages/core-domain/test/lifecycle/pneuma-policy-rules.test.ts \
  packages/runtime/test/framework-operations.test.ts \
  packages/runtime/test/api-config.test.ts \
  packages/core/test/tools/definition-apply.test.ts \
  packages/core/test/operation-tool-bridge.test.ts \
  packages/core/test/template-mcp-bridge.test.ts \
  packages/viewer-react/test/PermissionPrompt.test.tsx
cd examples/p5-viewer-approval-e2e
bun run build
bun ./server.ts
```

Browser setup:

- Use the `studio` URL.
- Zoom to a comfortable level before starting.
- Keep terminal visible only if the audience asks about repeatability.
- Start from a fresh `Replay` state.
- Do not start by explaining `pneuma_*` tables; start from the end-user app.

Rehearsal check:

```text
Ask agent to propose capability -> approval appears
Allow -> URL export becomes live
Add Review Queue view -> approval appears
Allow -> Review Queue appears
Review rollback impact -> rollback disclosure appears
Allow -> Operation and View disappear, bookmark row remains
```

## Story Before The Demo

Start with the end-user app, not the framework tables.

**Reader Bookmarks** is a source inbox:

- a reader collects source URLs.
- each source belongs to a research lens.
- later, another AI workflow needs the selected source URLs.
- today the app has the source data, but it does not yet expose a callable URL export capability or a user-facing Review Queue.

The Builder asks the agent to add that missing capability.

This gives the primitive a reason to exist:

```text
User problem: "I collected sources and need to hand selected URLs to another AI workflow."
Builder intent: "Expose selected bookmark URLs and show them in the app."
Framework change: add a query-backed Operation definition, then mount it as a View.
```

## Screen Map

The studio demo has three synchronized surfaces.

| Surface | What to say |
|---|---|
| End-user app | This is what the final user understands: source inbox, research lens, AI handoff. |
| System viewer | This is the traditional software stack: schema, domain service, API, app view. |
| Builder studio | This is where conversation becomes a governed definition change. Its protocol rail shows approval, mutation, restart, rediscovery, and rollback progress as live `framework-event` snapshots. |

Do not describe the screen as "left/right panels." Describe the roles:

```text
End-user app: what changed for the user.
System viewer: what changed in software terms.
Builder studio: how the change was proposed, approved, restarted, rediscovered, and rolled back.
```

## Live Script

### 1. Baseline

Show the app first.

```text
Reader Bookmarks
Source inbox for preparing AI research handoffs
Selected source: Pneuma architecture notes
AI handoff: Export selected URLs
Runtime output: No callable operation yet.
```

Then show the system viewer.

```text
Schema + demo data:
  bookmarks(title, url, source, lens, saved_at)
  bookmark-1 is present

Domain service:
  BookmarkStore exists
  ReaderLensService exists
  list_bookmark_urls is not installed

API surface:
  GET /app/bookmarks is stable
  POST /api/operations/list_bookmark_urls is hidden

App view:
  Review Queue is not mounted
```

Key line:

> The app has useful data, but the software surface cannot yet hand selected URLs to another workflow or present that handoff as a user-facing view.

Common misunderstanding to prevent:

> This is not a missing row. The row exists. The missing thing is a capability surface.

### 2. Builder Request

Click:

```text
Ask agent to propose capability
```

Pause on the approval card.

```text
Install capability definition
Tool: definition.apply
Schema: bookmarks data stays; pneuma_operations gets a row
Domain: list_bookmark_urls
API: POST /api/operations/list_bookmark_urls
```

Key line:

> The agent is not editing random code. It is asking the framework to add a semantic Operation definition.

Architecture readback:

```text
definition.apply(add_operation)
  -> writes pneuma_operations
  -> app_history records attribution
  -> restart discovers the Operation
  -> /api/config exposes it
```

### 3. Approve Add

Click:

```text
Allow
```

Show what changed:

```text
End-user app:
  AI handoff is ready
  Runtime output returns https://example.com/full-chain-demo

System viewer:
  Schema demo row is unchanged
  Domain service has list_bookmark_urls installed
  API surface exposes POST /api/operations/list_bookmark_urls
  pneuma_operations has list_bookmark_urls query v1
```

Point at the protocol rail:

```text
definition.apply:
  awaiting approval
  write definition row
  stop runtime
  start runtime
  refresh /api/config
  running
```

Key line:

> Business data did not change. The app's capability surface changed.

What to point at:

- Runtime output now returns the selected URL.
- `bookmarks` demo row did not move.
- `list_bookmark_urls` is now visible in the domain/API layer.

### 4. Add App View

Click:

```text
Add Review Queue view
```

Pause on the approval card.

```text
Mount app view
Tool: definition.apply
View: review_queue
Source: list_bookmark_urls
Surface: Reader Bookmarks gains Review Queue
```

Point out one governance detail:

```text
The View can mount list_bookmark_urls because the Operation is view_mountable.
Framework-internal read Operations are still agent-callable, but not app surface.
```

Click:

```text
Allow
```

Show what changed:

```text
End-user app:
  Review Queue is visible
  It displays the selected source row from the Operation source using the View presentation contract

System viewer:
  App view layer is mounted
  pneuma_views has review_queue v1
  app_history advanced to v2
```

Point at the protocol rail again:

```text
The same framework event channel carried the second definition.apply run.
The correlation id changed, but the contract stayed the same.
```

Key line:

> Operation made the capability callable; View made it part of the app experience.

Architecture readback:

```text
definition.apply(add_view)
  -> writes pneuma_views
  -> source Operation must be view_mountable
  -> app_history advances
  -> restart exposes /api/config.views for identities allowed to read the View and invoke its source Operation
```

### 5. Review Rollback

Click:

```text
Review rollback impact
```

Pause on the approval card.

```text
Rollback capability definition
Tool: definition.rollback.validate
Schema: bookmark rows untouched
Domain: remove list_bookmark_urls
View: remove review_queue
API: restore definition history v0
```

Key line:

> Rollback is also governed. Before executing, the framework discloses what will disappear and what data remains.

What to emphasize:

```text
Removed:
  Operation definition
  View definition

Preserved:
  bookmark row
  source URL
  app data
```

### 6. Approve Rollback

Click:

```text
Allow
```

Show final state:

```text
End-user app:
  URL export and Review Queue are removed
  Runtime output says the bookmark row remains

System viewer:
  Schema demo row is still visible
  Domain service marks list_bookmark_urls rolled back
  API route is removed
  App view is removed
  pneuma_operations is empty again
  pneuma_views is empty again
```

Point at the protocol rail one final time:

```text
rollback.validate disclosed impact before execution.
rollback.execute removed definition rows, restarted, refreshed config, and reached running.
```

Key line:

> The framework can add a capability, mount it as an app view, prove both work, remove both, and prove user data survived.

### 7. Replay

Click:

```text
Replay
```

Key line:

> This is not a one-shot mock. Each replay boots a fresh runtime harness and walks the same governed path.

## Architecture Readback

After the live demo, compress the architecture into one diagram:

```text
Builder says what they want
        |
        v
Build-phase Agent proposes a definition change
        |
        v
Framework asks for approval
        |
        v
System-owned definition table row is written
        |
        v
app_history records attribution and snapshot
        |
        v
Runtime restarts and rediscovers /api/config
        |
        v
End-user app surface changes
```

ADR-0028 turns the restart line into a live protocol surface: viewers can receive `framework-event` updates for `applying-definition`, `stopping-for-definition-apply`, `starting-after-definition-apply`, `refreshing-definition`, and final `running` / `failed` states.

When explaining the protocol, keep the contract simple:

```text
framework-event is a state snapshot.
status is the coarse product state.
phase is the fine-grained progress state.
change_id / rollback_id correlates the snapshots.
timeline shows the path already taken.
```

Map the current milestone to primitives:

| Primitive | Role in this demo |
|---|---|
| Table | `bookmarks` stores business data; `pneuma_*` stores app definition. |
| Operation | `list_bookmark_urls` is the callable capability. |
| Operation surface | Separates agent-callable framework tools from end-user app capability surface. |
| View | `review_queue` makes the capability visible in the app through a normalized presentation contract. |
| App history | Records attribution and rollback checkpoints. |
| Permission prompt | Turns definition mutation into a governed action. |

Key line:

> The same storage and governance path now handles data, capability definition, app view, and rollback.

## What This Proves

- The framework can store app definition as rows, not only as static code.
- A Builder/agent action can mutate definition through semantic Operations.
- Runtime restart can rediscover the new schema/API/view surface.
- The same viewer permission envelope supports apply and rollback approval.
- Rollback can remove a capability and its app view while preserving business data.
- The demo renders a View through `PneumaViewRenderer` from `/api/config.views`, presentation columns, and Operation output instead of a hard-coded `review_queue` table.
- A traditional software audience can understand the change as schema/service/API/view movement.

## What This Does Not Prove Yet

- no hot reload yet; restart is still required.
- no arbitrary code handler generation.
- no restored Operation/View/PolicyRule rollback.
- no custom View component packaging yet; `PneumaViewRenderer` only covers the declarative table/list/detail path.
- no non-React renderer package yet.
- no enterprise-grade auth policy.
- no production deployment story.

Use this wording if challenged:

> This milestone proves the primitive path, not the finished product surface. The point is that the capability became governable before it became fully ergonomic. The restart is now visible as framework protocol, so the demo can show the boundary instead of narrating around it.

## Suggested 30-Minute Share

1. 5 min: why Pneuma exists, personal tools to governed app evolution.
2. 5 min: data mutation vs definition mutation.
3. 10 min: live demo.
4. 5 min: architecture path and why system-owned definition tables matter.
5. 5 min: boundaries and next milestone.

## FAQ

**Is this just a workflow builder?**

No. Workflow builders usually compose actions inside a fixed host product. This demo changes the app's own definition surface: Operation, View, API config, app history, and rollback.

**Why not let the agent edit React directly?**

Eventually custom UI generation may exist. For this milestone, generated code would hide the primitive. `pneuma_views` proves View changes can be approved, audited, rediscovered, and rolled back like other definition rows.

**Why does the demo restart?**

Restart is the current rediscovery boundary. It keeps the primitive honest: the definition row has to survive process restart and rehydrate through the same runtime path. Hot reload is a product polish milestone, not a replacement for durable definition state.

**Why do framework operations appear as agent tools?**

The Build-phase Agent needs framework tools to mutate definition. ADR-0023 separates this from end-user app surface: framework operations are `agent_callable=true` but `framework_internal=true` and `view_mountable=false`.

**What makes this relevant to enterprise?**

The enterprise path needs permission, audit, rollback, and attribution around AI-created app capabilities. This milestone proves those concerns can attach to definition changes, not just to normal row mutations. ADR-0024 also makes the visible app surface request-scoped: a View is listed only when both `read view:<id>` and `invoke operation:<source>` pass for that identity.

## Next Milestone Candidates

The clean next work is no longer "prove View exists"; it is hardening governance and client contracts:

- Policy definition primitive: make `pneuma_policies` Builder-editable instead of code-only.
- Operation contract cleanup: output schema, invocation method, and reads-only isolation.
- View renderer hardening: navigation, loading state, and custom cell hooks before custom components.
- Framework event persistence: decide whether live protocol events should be replayable from session history.
