# Product Context

## What Pneuma Framework Is

`pneuma-framework` is infrastructure for building **AI-native Creation Hosts**.

A Developer uses the framework to build a Builder-facing product surface. Inside that surface, a Builder creates, previews, inspects, evolves, approves, publishes, monitors, and rolls back Generated Applications by talking to a Build-phase Agent. End Users then use the Published Application version.

The non-negotiable model:

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

This repo is not trying to be a single generated app, a website builder clone, or a production SaaS control plane. It is the primitive layer that lets Developers build those products without reinventing the agent loop, governed app definition, preview, inspection, release evidence, and rollback machinery.

## Current State And Target

Status: `v0.5.0` is tagged (2026-06-23), the public-API freeze. Milestone 54 is closed (2026-11-24): an out-of-the-box governed loop on PneumaSpace ([`examples/space-all-in-one`](./examples/space-all-in-one/README.md)), on the change record of [ADR-0039](./docs/architecture/adr/0039-change-record-floor-and-declared-reversibility.md). Its changes are in [`CHANGELOG.md`](./CHANGELOG.md) under `[Unreleased]`; whether to cut a release for them is the owner's decision. Where the project stands now: the [M54 snapshot](./docs/archive/milestone-54-snapshot.md).

What the framework is today:

```text
Developer-facing implementation framework for building local/reference Creation Hosts,
with enough governance, assurance, and code-agent control to pressure-test real product shapes;
since M54, a change record under every mode, and one governed loop that a coding agent
or an agent product can use out of the box on PneumaSpace.
```

The next target is not chosen; it is the owner's call. The M54 snapshot recommends making layer 3 real: a pre-assembled Host a product can import, with reversibility on by default (candidate workstreams in the [roadmap](./docs/architecture/roadmap.md)). The product questions it depends on are open and listed in [`OPEN-QUESTIONS.md`](./docs/architecture/OPEN-QUESTIONS.md), "Product Questions After M54": one product or two, the outward name and the entry project, the first design partner, and whether undo brings stored data back by default.

The release line:

```text
pneuma-rc-0.1.0 -> 0.1.1 -> 0.1.2 -> 0.1.3 -> 0.2.0 -> 0.3.0 -> 0.4.0 -> 0.5.0 -> [Unreleased]: M54
```

Post-RC work M26-M43 tightened the developer contract and added the first enterprise-governance lane:

- Code Change Lane hardening;
- Runtime Diagnostic Surface;
- HostExtension slots;
- AgentBackend `runTurn`;
- Host Credential Broker utilities and downstream adoption;
- Build Change Assurance, visible/durable cases, approval-time review packets, recovery drills, and downstream adoption guidance;
- package-consumption gating, focused public subpaths, and downstream-safe `doctor-host`;
- production-readiness boundary, enterprise governance roles/routes, Build Assurance publish gating, and an enterprise-governance demo.

M45-M51 then moved from contract shape to executable implementation pressure:

- Host Kit as reusable Creation Host implementation parts;
- Reference Creation Host as a compact canonical consumer;
- Product Creation Host as a product-shaped pressure sample with share/fork/publish/rollback;
- Workflow App Studio as the cleaner real Creation Host example;
- Codex app-server as the default real code-agent lane for controlled generated source edits;
- Agent Debug Loop before proposal creation, so failed drafts repair before Builder approval;
- lifecycle UX hardening and close-out verification through browser E2E, typecheck, and package/example tests.

M52-M54 then wired the loop to real stacks and took it out of the box:

- a Developer-authored production Generated App scaffold profile (Bun, Hono, React, Drizzle, Zod, Neon), and a Creation Host harness around it with Neon-backed published data and Vercel publish/rollback (M52, M53);
- the change record: versions, history and restore of an app directory, with each entry naming the guarantees that held, usable by a coding agent with no Host through `pneuma-framework record` (M54);
- reversibility declared by the Host: undo puts code back, stored data comes back only through a declared data snapshot capability, and going back past a one-way change needs the owner (M54);
- `examples/space-all-in-one`: one compose stack where any coding agent, or a product that starts the agent itself, creates and changes apps on PneumaSpace under one governed loop with three modes, and the owner decides and goes back on a page written for a non-programmer (M54).

It should let a Developer understand and run:

- framework and generated-app primitives;
- governed `definition.apply`, `definition.apply_change_set`, and Code Change Lane flows;
- Builder approval, permission evidence, review packets, and assurance cases;
- Creation Host project/profile/version flow;
- preview and inspection surfaces;
- publish, restart, and rollback evidence;
- reference app profiles that show both schema-driven and open-ended app shapes;
- local/reference credential and assurance utilities that remain Host-owned at production scale;
- minimum enterprise review routing that blocks publish until the required human responsibility is satisfied;
- Host Kit helpers that assemble approval, code change, runtime/data, publish, and code-agent attempt loops without owning the Host product UX;
- the change record, and the example Host's three modes on top of it: `record` (recorded only), `personal`, and `review-all`;
- one out-of-the-box governed loop on PneumaSpace that a coding agent with no context can use (`examples/space-all-in-one`).

It does not yet claim:

- a pre-assembled Host a product can import (an integrator copies `examples/space-all-in-one`);
- stored data that comes back on undo by default (the first-run stack declares no data snapshot capability);
- an authenticated owner, or multi-user or hosted operation of that loop;
- production multi-tenant IAM;
- assignment queues or workflow engine;
- zero-downtime cloud traffic switching;
- hosted secret management;
- compliance retention/export backend;
- arbitrary code generation;
- hot reload for every definition change;
- Runtime Agent inside every Published Application;
- full Pneuma 2.x mode parity.
- arbitrary generated-runtime code editing without scaffold boundaries and checks.

## Audiences

| Audience | Needs |
|---|---|
| **Developer** | A clear framework boundary, runnable examples, package/API map, and confidence that app-specific concerns do not leak into core semantics. |
| **Builder** | A Creation Host that makes conversation, preview, inspection, approval, and publish understandable. |
| **End User** | A Published Application that behaves like a normal app and does not require understanding the build loop. |

## Reference Evidence

The current evidence line is documented in:

- [`docs/archive/milestone-16-snapshot.md`](./docs/archive/milestone-16-snapshot.md) — integrated Reference Creation Host workflow.
- [`docs/archive/milestone-17-snapshot.md`](./docs/archive/milestone-17-snapshot.md) — security and architecture acceptance.
- [`docs/archive/milestone-18-snapshot.md`](./docs/archive/milestone-18-snapshot.md) — open-ended Personal Focus Site pressure.
- [`docs/archive/milestone-19-snapshot.md`](./docs/archive/milestone-19-snapshot.md) — release-candidate review and pre-RC boundary decision.
- [`docs/archive/milestone-20-snapshot.md`](./docs/archive/milestone-20-snapshot.md) — open-ended definition artifact boundary closure.
- [`docs/archive/milestone-25-snapshot.md`](./docs/archive/milestone-25-snapshot.md) — Alice Creation Host prototype.
- [`docs/archive/milestone-31-snapshot.md`](./docs/archive/milestone-31-snapshot.md) — downstream credential-helper adoption pressure.
- [`docs/archive/milestone-37-snapshot.md`](./docs/archive/milestone-37-snapshot.md) — Build Assurance downstream readiness.
- [`docs/archive/release-candidate-0.2.0-snapshot.md`](./docs/archive/release-candidate-0.2.0-snapshot.md) — package-consumption gate, full verification, and 0.2.0 release-train boundary.
- [`docs/archive/release-candidate-0.3.0-snapshot.md`](./docs/archive/release-candidate-0.3.0-snapshot.md) — minimum enterprise-governance gate and owner confirmation boundary.
- [`docs/archive/milestone-40-snapshot.md`](./docs/archive/milestone-40-snapshot.md) — production-readiness boundary for the 0.3.0 lane.
- [`docs/archive/milestone-43-snapshot.md`](./docs/archive/milestone-43-snapshot.md) — enterprise-governance demo evidence.
- [`docs/architecture/spec/global-alignment-review-0.4.md`](./docs/architecture/spec/global-alignment-review-0.4.md) — current top-level review after Host Kit, Workflow App Studio, and Agent Debug Loop.
- [`docs/archive/milestone-45-snapshot.md`](./docs/archive/milestone-45-snapshot.md) — Host Kit and Reference Creation Host evidence.
- [`docs/archive/milestone-48-snapshot.md`](./docs/archive/milestone-48-snapshot.md) — Workflow App Studio and Codex app-server evidence.
- [`docs/archive/milestone-49-snapshot.md`](./docs/archive/milestone-49-snapshot.md) — Agent Debug Loop evidence.
- [`docs/archive/milestone-50-snapshot.md`](./docs/archive/milestone-50-snapshot.md) — Workflow App Studio lifecycle UX hardening.
- [`docs/archive/milestone-51-snapshot.md`](./docs/archive/milestone-51-snapshot.md) — close-out review and verification evidence.
- [`docs/archive/milestone-52-snapshot.md`](./docs/archive/milestone-52-snapshot.md) — production Generated App scaffold profile.
- [`docs/archive/milestone-53-snapshot.md`](./docs/archive/milestone-53-snapshot.md) — production profile Creation Host integration (Neon, Vercel).
- [`docs/archive/milestone-54-snapshot.md`](./docs/archive/milestone-54-snapshot.md) — the latest milestone: an out-of-the-box governed loop on PneumaSpace, what it proves and what it does not.
- [`docs/architecture/adr/0039-change-record-floor-and-declared-reversibility.md`](./docs/architecture/adr/0039-change-record-floor-and-declared-reversibility.md) and [`docs/developer/change-record.md`](./docs/developer/change-record.md) — the change record and declared reversibility.
- [`examples/space-all-in-one/README.md`](./examples/space-all-in-one/README.md) — the runnable entry, with the record of its live runs and gaps.
- [`docs/developer/enterprise-governance.md`](./docs/developer/enterprise-governance.md) — role-route guide for Host implementers.
- [`docs/developer/host-kit.md`](./docs/developer/host-kit.md) — Host Kit guide.
- [`docs/developer/agent-debug-loop.md`](./docs/developer/agent-debug-loop.md) — pre-proposal code-agent debug loop guide.
- [`examples/workflow-app-studio/README.md`](./examples/workflow-app-studio/README.md) — the M48-M51 Creation Host example line.
- [`docs/architecture/adr/0031-open-ended-definition-artifact-boundary.md`](./docs/architecture/adr/0031-open-ended-definition-artifact-boundary.md) — accepted Host-owned open-ended artifact boundary.
- [`docs/architecture/spec/ai-build-assurance-domain-review.md`](./docs/architecture/spec/ai-build-assurance-domain-review.md) — assurance domain anchor for Builder + Build Agent changes.
- [`docs/architecture/roadmap.md`](./docs/architecture/roadmap.md) — milestone sequence and the recommended next stage.
- [`docs/architecture/OPEN-QUESTIONS.md`](./docs/architecture/OPEN-QUESTIONS.md) — the open product questions after M54.

## Product Taste

Pneuma should feel like serious infrastructure for creative software, not a dashboard toy:

- conversation is useful only when paired with preview, inspection, and evidence;
- approval prompts explain what will change and why;
- generated apps should feel like real apps, not wireframes;
- Builder approval should happen after checks, not on raw agent drafts;
- framework docs should distinguish durable decisions from process logs;
- vendor integrations remain reference evidence until promoted by ADR.
