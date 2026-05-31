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

## Current Post-RC Target

The current target is:

```text
Developer-facing implementation framework for building local/reference Creation Hosts,
with enough governance, assurance, and code-agent control to pressure-test real product shapes.
```

The release-candidate line is accepted through `pneuma-rc-0.2.0`, `pneuma-rc-0.3.0` is prepared as the first minimum enterprise-governance roll-up, and M45-M51 start the 0.4.0 implementation-framework lane:

```text
pneuma-rc-0.1.0 -> 0.1.1 -> 0.1.2 -> 0.1.3 -> 0.2.0 -> 0.3.0
```

Post-RC work M26-M43 then tightened the developer contract and added the first enterprise-governance lane:

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

It should let a Developer understand and run:

- framework and generated-app primitives;
- governed `definition.apply`, `definition.apply_change_set`, and Code Change Lane flows;
- Builder approval, permission evidence, review packets, and assurance cases;
- Creation Host project/profile/version flow;
- preview and inspection surfaces;
- publish, restart, and rollback evidence;
- reference app profiles that show both schema-driven and open-ended app shapes;
- local/reference credential and assurance utilities that remain Host-owned at production scale;
- minimum enterprise review routing that blocks publish until the required human responsibility is satisfied.
- Host Kit helpers that assemble approval, code change, runtime/data, publish, and code-agent attempt loops without owning the Host product UX.

It does not yet claim:

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
- [`docs/developer/enterprise-governance.md`](./docs/developer/enterprise-governance.md) — role-route guide for Host implementers.
- [`docs/developer/host-kit.md`](./docs/developer/host-kit.md) — Host Kit guide.
- [`docs/developer/agent-debug-loop.md`](./docs/developer/agent-debug-loop.md) — pre-proposal code-agent debug loop guide.
- [`examples/workflow-app-studio/README.md`](./examples/workflow-app-studio/README.md) — current real Creation Host example.
- [`docs/architecture/adr/0031-open-ended-definition-artifact-boundary.md`](./docs/architecture/adr/0031-open-ended-definition-artifact-boundary.md) — accepted Host-owned open-ended artifact boundary.
- [`docs/architecture/spec/ai-build-assurance-domain-review.md`](./docs/architecture/spec/ai-build-assurance-domain-review.md) — assurance domain anchor for Builder + Build Agent changes.
- [`docs/developer/downstream-validation-brief.md`](./docs/developer/downstream-validation-brief.md) — handoff brief for the next fresh downstream validation project.
- [`docs/architecture/roadmap.md`](./docs/architecture/roadmap.md) — current milestone sequence.

## Product Taste

Pneuma should feel like serious infrastructure for creative software, not a dashboard toy:

- conversation is useful only when paired with preview, inspection, and evidence;
- approval prompts explain what will change and why;
- generated apps should feel like real apps, not wireframes;
- Builder approval should happen after checks, not on raw agent drafts;
- framework docs should distinguish durable decisions from process logs;
- vendor integrations remain reference evidence until promoted by ADR.
