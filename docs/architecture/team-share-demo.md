# Team Share Demo

**Date:** 2026-04-27
**Status:** Current 0-prep team-share script
**Audience:** teammates who know normal software but do not know Pneuma internals.

This is the recommended live demo script for the app-definition milestone.

## One-Sentence Framing

> Pneuma lets a Builder evolve a real app's schema, domain service, API surface, and end-user view by talking to an agent, while the framework keeps the change governed, attributable, and reversible.

中文讲法：

> 这不是 agent 帮用户点按钮，而是 Builder 通过 agent 改变一个真实 app 的软件结构；framework 负责审批、记录、重启发现和回滚。

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
| Builder studio | This is where conversation becomes a governed definition change. |

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

Key line:

> Business data did not change. The app's capability surface changed.

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
  It displays the selected source URL from the Operation source

System viewer:
  App view layer is mounted
  pneuma_views has review_queue v1
  app_history advanced to v2
```

Key line:

> Operation made the capability callable; View made it part of the app experience.

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

Key line:

> The framework can add a capability, mount it as an app view, prove both work, remove both, and prove user data survived.

### 7. Replay

Click:

```text
Replay
```

Key line:

> This is not a one-shot mock. Each replay boots a fresh runtime harness and walks the same governed path.

## What This Proves

- The framework can store app definition as rows, not only as static code.
- A Builder/agent action can mutate definition through semantic Operations.
- Runtime restart can rediscover the new schema/API/view surface.
- The same viewer permission envelope supports apply and rollback approval.
- Rollback can remove a capability and its app view while preserving business data.
- A traditional software audience can understand the change as schema/service/API/view movement.

## What This Does Not Prove Yet

- no hot reload yet; restart is still required.
- no arbitrary code handler generation.
- no restored Operation/View rollback.
- no reusable View renderer contract beyond this demo surface.
- no enterprise-grade auth policy.
- no production deployment story.

## Suggested 30-Minute Share

1. 5 min: why Pneuma exists, personal tools to governed app evolution.
2. 5 min: data mutation vs definition mutation.
3. 10 min: live demo.
4. 5 min: architecture path and why system-owned definition tables matter.
5. 5 min: boundaries and next milestone.

## Next Milestone Candidates

The clean next work is no longer "prove View exists"; it is making the View path less demo-specific:

- View policy and visibility: who can see or mount a View.
- View rendering contract: reusable table/list/detail renderer before custom components.
- Restart protocol polish: make `restarting -> rediscovered -> failed` visible to the Builder and Agent.
- Operation contract cleanup: output schema, invocation method, and reads-only isolation.
