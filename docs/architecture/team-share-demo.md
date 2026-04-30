# M2 Team Share Package

**Date:** 2026-04-30
**Status:** M2 close-ready 0-prep team-share package
**Audience:** teammates who know normal software but do not know Pneuma internals.
**Format:** 30-minute live share with one local browser demo.

This is the recommended share package for the enterprise-governance milestone. It is intentionally self-contained: a teammate should be able to understand why the milestone matters without reading ADRs first.

## Outcome

After the share, the team should be able to say:

```text
Pneuma is proving a governed AI-created software loop:
Builder intent -> Agent proposal -> Kernel boundary -> Builder approval -> scoped token -> framework_system execution -> app-definition rows -> runtime rediscovery -> Permission Center evidence -> policy-gated app change -> reversible rollback.
```

They should also understand what is not done yet: production IAM, multi-approver approval, retention/assignment workflows, distributed concurrency, hot reload, arbitrary code generation, and custom View component packaging.

## One-Sentence Framing

> Pneuma lets a Builder evolve a real app's schema, domain service, API surface, end-user view, and policy surface by talking to an agent, while the framework separates authority, records approval evidence, verifies mutation, and keeps rollback/recovery explicit.

中文讲法：

> 这不是 agent 帮用户点按钮，而是 Builder 通过 agent 改变一个真实 app 的软件结构；framework 负责权力边界、审批 token、ledger、重启发现、Permission Center 解释和回滚。

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
| 7-20 min | Live demo | Walk Operation -> View -> PolicyRule -> rollback. |
| 20-25 min | Architecture readback | Map what happened to primitives, authority separation, approval token, ledger, and Permission Center. |
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
http://127.0.0.1:<port>/?scenario=capability-lifecycle&variant=governance
```

The studio narrative variant remains available if you want less governance detail:

```text
http://127.0.0.1:<port>/?scenario=capability-lifecycle&variant=studio
```

The classic engineering proof remains available:

```text
http://127.0.0.1:<port>/?scenario=capability-lifecycle
```

Use `variant=governance` for M2 team sharing.

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
  packages/viewer-react/test/PermissionPrompt.test.tsx \
  packages/viewer-react/test/PermissionCenter.test.tsx \
  packages/core/test/permission-ledger.test.ts \
  packages/core/test/wire-protocol/permission-ledger-seed.test.ts \
  examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts
cd examples/p5-viewer-approval-e2e
bun run build
bun ./server.ts
```

Browser setup:

- Use the `governance` URL.
- Zoom to a comfortable level before starting.
- Keep terminal visible only if the audience asks about repeatability.
- Start from a fresh `Replay` state.
- Do not start by explaining `pneuma_*` tables; start from the end-user app.

Rehearsal check:

```text
Ask agent to propose capability -> approval appears
Allow -> URL export becomes live
Add Review Queue view -> approval appears
Allow -> Review Queue definition exists, but is policy-gated
Add reviewer access -> approval appears
Allow -> Reviewer sees Review Queue; Guest remains blocked
Review rollback impact -> rollback disclosure appears
Allow -> Operation, View, and PolicyRule disappear; bookmark row remains
```

Permission Center check:

```text
Pending state:
  Permission Center shows 1 pending request.
  Proposed by = build_agent:opencode.

Completed state:
  Permission Center shows completed requests.
  Approved by = builder:default.
  Executed by = framework_system:framework.
  Token shows only token hash, never a raw bearer token.
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
| System viewer | This is the traditional software stack: schema, domain service, API, app view, policy. |
| Builder studio | This is where conversation becomes a governed definition change. Its protocol rail shows approval, mutation, restart, rediscovery, and rollback progress as live `framework-event` snapshots. |
| Permission Center | This is the product-facing governance read model: pending/completed requests, proposer, approver, token hash, executor, and outcome. |

Do not describe the screen as "left/right panels." Describe the roles:

```text
End-user app: what changed for the user.
System viewer: what changed in software terms.
Builder studio: how the change was proposed, approved, restarted, rediscovered, and rolled back.
Permission Center: why the AI-created change was allowed, who approved it, and what executed it.
```

## Permission Center Talk Track

Use this once the first approval is visible.

```text
This right-side surface is not a debug log.
It is the first product form of enterprise governance:
who proposed the change, who approved it, what scoped token authorized execution, who actually executed, and what final state the request reached.
```

What to point at:

| Field | Meaning |
|---|---|
| Proposed by | The Build-phase Agent can propose software change, but does not get direct mutation authority. |
| Approved by | The Builder approval is captured as governance evidence. |
| Token | The framework shows only a token hash and scope metadata, never the raw bearer token. |
| Executed by | `framework_system` spends the approved token and performs the mutation. |
| Status | Pending, completed, denied, failed, and dirty-repair states become product-visible. |

Key line:

> Permission Center is v0 inspection. It is not yet a production admin workflow, but it proves the primitive already emits the evidence a real enterprise surface needs.

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

Policy:
  no Builder-authored PolicyRule exists yet
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

### 5. Add Reviewer Access

Click:

```text
Add reviewer access
```

Pause on the approval card.

```text
Grant reviewer access
Tool: definition.apply
Policy: reviewers-can-read-review-queue
Resource: view:review_queue
Effect: Reviewer can see the Review Queue; Guest remains blocked
```

Click:

```text
Allow
```

Show what changed:

```text
End-user app:
  Guest still sees a policy-gated state
  Switch to Reviewer
  Review Queue is visible and renders the selected source row

System viewer:
  Policy layer is role gated
  pneuma_policy_rules has reviewers-can-read-review-queue v1
  app_history advanced to v3
```

Key line:

> View made the capability part of the app definition; PolicyRule made it available to the right identity.

Architecture readback:

```text
definition.apply(add_policy_rule)
  -> writes pneuma_policy_rules
  -> app_history advances
  -> restart composes the rule into PolicyEvaluator
  -> /api/config.views becomes request-scoped by read view + invoke source Operation
```

### 6. Review Rollback

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
Policy: remove reviewers-can-read-review-queue
API: restore definition history v0
```

Key line:

> Rollback is also governed. Before executing, the framework discloses what will disappear and what data remains.

What to emphasize:

```text
Removed:
  Operation definition
  View definition
  PolicyRule definition

Preserved:
  bookmark row
  source URL
  app data
```

### 7. Approve Rollback

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
  Policy rule is removed
  pneuma_operations is empty again
  pneuma_views is empty again
  pneuma_policy_rules is empty again
```

Point at the protocol rail one final time:

```text
rollback.validate disclosed impact before execution.
rollback.execute removed definition rows, restarted, refreshed config, and reached running.
```

Key line:

> The framework can add a capability, mount it as an app view, gate it by policy, prove the role difference, remove all three definition rows, and prove user data survived.

### 8. Replay

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
System-owned definition table row(s) are written
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
| PolicyRule | `reviewers-can-read-review-queue` makes the View visible only to the reviewer role. |
| App history | Records attribution and rollback checkpoints. |
| Permission prompt | Turns definition mutation into a governed action. |

Key line:

> The same storage and governance path now handles data, capability definition, app view, policy, and rollback.

## What This Proves

- The framework can store app definition as rows, not only as static code.
- A Builder/agent action can mutate definition through semantic Operations.
- The Agent cannot directly execute definition mutation; the Authorization Kernel separates proposer from executor.
- Builder approval becomes a scoped, single-use approval token consumed by `framework_system`.
- The durable permission ledger can be presented as a Permission Center read model instead of staying in logs.
- Runtime restart can rediscover the new schema/API/view surface.
- The same viewer permission envelope supports apply and rollback approval.
- Rollback can remove a capability, its app view, and its policy rule while preserving business data.
- The demo renders a View through `PneumaViewRenderer` from `/api/config.views`, presentation columns, and Operation output instead of a hard-coded `review_queue` table.
- Request-scoped policy can make the same app surface visible to a reviewer and hidden from a guest.
- A traditional software audience can understand the change as schema/service/API/view/policy movement.

## What This Does Not Prove Yet

- no hot reload yet; restart is still required.
- no arbitrary code handler generation.
- no restored Operation/View/PolicyRule rollback.
- no custom View component packaging yet; `PneumaViewRenderer` only covers the declarative table/list/detail path.
- no non-React renderer package yet.
- no production IAM / SSO / SCIM / org-role import.
- no multi-approver workflow, assignment queue, retention policy, or bulk admin action.
- no distributed definition-write lock or cross-store ACID transaction.
- no production deployment story.

Use this wording if challenged:

> This milestone proves the governance chain, not the finished enterprise product. The point is that the AI-created capability became attributable, approvable, token-scoped, inspectable, and recoverable before it became fully ergonomic. The restart is visible as framework protocol, so the demo can show the boundary instead of narrating around it.

## Suggested 30-Minute Share — Slide-By-Slide

The runbook above is the live-demo script (click-by-click). This section is the deck **scaffold** — what slides surround the demo, what the presenter says, and how long each slide takes. Rehearse this independently from the demo so you do not improvise the framing on the fly.

| # | Slide | Speaker note (one breath) | Time |
|---:|---|---|---:|
| 1 | **Title** — *Pneuma Milestone 2: Enterprise Governance Evidence* | "M1 proved the app can evolve. M2 proves AI-created app capability can evolve under a governance chain." | 0:30 |
| 2 | **The question** | "If an agent can create software capability, what makes that safe enough for an enterprise product?" | 0:30 |
| 3 | **Pneuma in one sentence** | "Builder talks → Agent proposes → Kernel gates → Builder approves → framework executes → Permission Center explains." | 1:00 |
| 4 | **Three populations** (Developer / Builder / End User table) | "All three may collapse in solo cases. The enterprise case needs these identities separated before we add product polish." | 1:00 |
| 5 | **From M1 to M2** | "M1: app definition is runtime data. M2: AI-created definition changes have authority separation, approval token, ledger, policy, and recovery." | 2:00 |
| 6 | **The conceptual shift** — data mutation vs governed definition mutation | "Adding a bookmark row is data mutation. Installing URL export and Review Queue is definition mutation. M2 makes that mutation governable." | 2:00 |
| — | **Pause for questions on the framing.** Skip if no hands. | — | 0:30 |
| 7 | **Governance chain** (Agent → Kernel → Builder approval → token → framework_system → ledger → Permission Center) | "The Agent proposes; it does not get direct mutation authority. Execution happens through a scoped token spent by framework_system." | 1:30 |
| 8 | **Meet the demo app** (Reader Bookmarks one-line description + screenshot) | "Reader Bookmarks has data but lacks a callable URL-export capability and a policy-gated Review Queue. The Builder will add them." | 1:00 |
| 9-13 | **Live demo** — follow the Live Script section above (Operation → View → Policy → Permission Center → Rollback → Replay) | (talk track is in §"Live Script" and §"Permission Center Talk Track") | 13:00 |
| 14 | **Architecture readback diagram** (the readback diagram in §"Architecture Readback") | "Definition rows, policy rows, approval ledger, and Permission Center are all part of one governed software-change path." | 2:00 |
| 15 | **M2 evidence matrix** (from `milestone-2-snapshot.md` §"What Is Proven So Far") | "The proof is not one feature; it is the chain: authority split, token, ledger, policy semantics, mutation guard, Permission Center." | 1:30 |
| 16 | **Boundary slide** — "What this does NOT prove yet" | "Production IAM, multi-approver approval, retention, assignment, distributed concurrency, ACID transaction, hot reload, threat model. We pin those here so the milestone story stays honest." | 1:30 |
| 17 | **Why next is productization / protocol / production hardening** | "Adding another primitive is less valuable than hardening the governance surface that now exists." | 1:00 |
| 18 | **Decision gate** — from `milestone-2-snapshot.md` §"Next Decision Gate" | Ask: "Do we close M2 here, and which production-hardening stream do we take next?" Wait. | 1:00 |
| Appendix A | **ADR map** (current ADR index screenshot from `docs/architecture/README.md`) | "If you want to drill into any decision, here is the index. ADR-0029 is the supersedure note." | — |
| Appendix B | **Reading paths** — for designers, for backend folks, for product folks | "Three different 30-minute reading paths into the work. Pick yours." | — |
| Appendix C | **Stack & tests** — Bun workspaces, current `bun test` count, focused M2 suite | For "is this real" skeptics. | — |

Total: 30 minutes; 60 minutes more for Q&A which the appendices are pre-loaded for.

### Tips for the presenter

- **Slides 1–6 are the most under-rehearsed slot in any technical share.** If you wing the framing, the demo lands flat. Memorize 3 and 6 verbatim; everything else can be paraphrased.
- **Slide 13 (Replay) is the natural confidence checkpoint.** If it works on Replay, the demo is done; do not improvise an extra round.
- **Slide 18 (Decision gate) — do not answer the four questions for the audience.** The whole point is alignment by getting them on record. If someone says "I'd say yes to all four," ask the next person.
- **If asked "what does this NOT do that the agent could just do directly?"** — the answer is in slide 6 (data vs definition) and slide 14 (governance path). Do not re-litigate. Point to the slides.
- **If asked about hot reload** — point to slide 16. Hot reload is production polish / later UX, not the M2 governance proof.
- **If asked about pricing / multi-tenant** — point at roadmap.md Stage 7.

### Reference deck assets

Hero illustrations live in [`spec/images/`](./spec/images/). They were created for the M1 deck, but remain useful context assets for M2 if they are framed as "primitive foundation" rather than the headline governance proof. Mapping:

| Slide | Image | Rationale |
|---|---|---|
| 5 (From M1 to M2) | [`spec/images/m1-governance-loop.png`](./spec/images/m1-governance-loop.png) | Use as the foundation: M1 proved governed app evolution. |
| 14 (Architecture readback) | [`spec/images/m1-system-architecture.png`](./spec/images/m1-system-architecture.png) | Definition rows + data rows on the same Operation pipeline — still the base M2 builds on. |
| 15 (M2 evidence matrix) | rendered from [`milestone-2-snapshot.md`](./milestone-2-snapshot.md) §"What Is Proven So Far" | Markdown table — screenshot directly. |
| 17 (Roadmap) | [`spec/images/m1-roadmap-river.png`](./spec/images/m1-roadmap-river.png) | Add an M2 marker in the deck editor if you use this image. |
| Appendix A (ADR map) | [`spec/images/m1-adr-coverage-radar.png`](./spec/images/m1-adr-coverage-radar.png) | Use as historical context; M2 adds governance evidence beyond the original radar. |
| Earlier ADR diagrams | [`spec/images/01-10-*.png`](./spec/images/) | Domain model + agent-in-loop + SSE etc., for drill-down questions. |

To produce the deck end-to-end:

1. Read this section + the Live Script + [`milestone-2-snapshot.md`](./milestone-2-snapshot.md) once for tone.
2. Drop the five hero illustrations into the deck template at the slides above.
3. Screenshot the M2 evidence table and the next-decision gate from the snapshot for slides 15 and 18.
4. Rehearse slides 1–7 (the governance framing) and slide 18 (the decision gate) until they are muscle memory; everything else can be paraphrased.

## FAQ

**Is this just a workflow builder?**

No. Workflow builders usually compose actions inside a fixed host product. This demo changes the app's own definition surface: Operation, View, PolicyRule, API config, app history, and rollback.

**Why not let the agent edit React directly?**

Eventually custom UI generation may exist. For this milestone, generated code would hide the primitive. `pneuma_views` proves View changes can be approved, audited, rediscovered, and rolled back like other definition rows.

**Why does the demo restart?**

Restart is the current rediscovery boundary. It keeps the primitive honest: the definition row has to survive process restart and rehydrate through the same runtime path. Hot reload is a product polish milestone, not a replacement for durable definition state.

**Why do framework operations appear as agent tools?**

The Build-phase Agent needs framework tools to mutate definition. ADR-0023 separates this from end-user app surface: framework operations are `agent_callable=true` but `framework_internal=true` and `view_mountable=false`.

**What makes this relevant to enterprise?**

The enterprise path needs permission, audit, rollback, attribution, and explainable authority around AI-created app capabilities. This milestone proves those concerns can attach to definition changes, not just to normal row mutations. Permission Center v0 makes the evidence product-visible. ADR-0024 also makes the visible app surface request-scoped: a View is listed only when both `read view:<id>` and `invoke operation:<source>` pass for that identity.

## Next Milestone Candidates

The clean next work is no longer "prove governance exists"; it is choosing which production-hardening gap matters most:

- Permission Center productization: queues, assignment, retention, bulk actions, policy authoring, and repair ownership.
- Protocol hardening: versioned envelopes, reconnect replay, durable framework events, and clearer seed/live semantics.
- Transaction and concurrency hardening: cross-store atomicity, optimistic concurrency, distributed write locks, or explicit reset/retry workflows.
- IAM and threat model: SSO/SCIM/org roles, external policy integration, prompt injection, untrusted content, and extension supply-chain boundaries.
