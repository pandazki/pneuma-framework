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
Developer-facing framework for building local/reference Creation Hosts,
with enough governance and assurance primitives to pressure-test real product shapes.
```

The first release-candidate line is accepted through `pneuma-rc-0.1.3`:

```text
pneuma-rc-0.1.0 -> 0.1.1 -> 0.1.2 -> 0.1.3
```

Post-RC work M26-M37 then tightened the developer contract without cutting a new tag:

- Code Change Lane hardening;
- Runtime Diagnostic Surface;
- HostExtension slots;
- AgentBackend `runTurn`;
- Host Credential Broker utilities and downstream adoption;
- Build Change Assurance, visible/durable cases, approval-time review packets, recovery drills, and downstream adoption guidance.

It should let a Developer understand and run:

- framework and generated-app primitives;
- governed `definition.apply`, `definition.apply_change_set`, and Code Change Lane flows;
- Builder approval, permission evidence, review packets, and assurance cases;
- Creation Host project/profile/version flow;
- preview and inspection surfaces;
- publish, restart, and rollback evidence;
- reference app profiles that show both schema-driven and open-ended app shapes;
- local/reference credential and assurance utilities that remain Host-owned at production scale.

It does not yet claim:

- production multi-tenant IAM;
- zero-downtime cloud traffic switching;
- hosted secret management;
- arbitrary code generation;
- hot reload for every definition change;
- Runtime Agent inside every Published Application;
- full Pneuma 2.x mode parity.

## Audiences

| Audience | Needs |
|---|---|
| **Developer** | A clear framework boundary, runnable examples, package/API map, and confidence that app-specific concerns do not leak into core semantics. |
| **Builder** | A Creation Host that makes conversation, preview, inspection, approval, and publish understandable. |
| **End User** | A Published Application that behaves like a normal app and does not require understanding the build loop. |

## Reference Evidence

The current evidence line is documented in:

- [`docs/architecture/milestone-16-snapshot.md`](./docs/architecture/milestone-16-snapshot.md) — integrated Reference Creation Host workflow.
- [`docs/architecture/milestone-17-snapshot.md`](./docs/architecture/milestone-17-snapshot.md) — security and architecture acceptance.
- [`docs/architecture/milestone-18-snapshot.md`](./docs/architecture/milestone-18-snapshot.md) — open-ended Personal Focus Site pressure.
- [`docs/architecture/milestone-19-snapshot.md`](./docs/architecture/milestone-19-snapshot.md) — release-candidate review and pre-RC boundary decision.
- [`docs/architecture/milestone-20-snapshot.md`](./docs/architecture/milestone-20-snapshot.md) — open-ended definition artifact boundary closure.
- [`docs/architecture/milestone-25-snapshot.md`](./docs/architecture/milestone-25-snapshot.md) — Alice Creation Host prototype.
- [`docs/architecture/milestone-31-snapshot.md`](./docs/architecture/milestone-31-snapshot.md) — downstream credential-helper adoption pressure.
- [`docs/architecture/milestone-37-snapshot.md`](./docs/architecture/milestone-37-snapshot.md) — Build Assurance downstream readiness.
- [`docs/architecture/adr/0031-open-ended-definition-artifact-boundary.md`](./docs/architecture/adr/0031-open-ended-definition-artifact-boundary.md) — accepted Host-owned open-ended artifact boundary.
- [`docs/architecture/spec/ai-build-assurance-domain-review.md`](./docs/architecture/spec/ai-build-assurance-domain-review.md) — assurance domain anchor for Builder + Build Agent changes.
- [`docs/architecture/roadmap.md`](./docs/architecture/roadmap.md) — current milestone sequence.

## Product Taste

Pneuma should feel like serious infrastructure for creative software, not a dashboard toy:

- conversation is useful only when paired with preview, inspection, and evidence;
- approval prompts explain what will change and why;
- generated apps should feel like real apps, not wireframes;
- framework docs should distinguish durable decisions from process logs;
- vendor integrations remain reference evidence until promoted by ADR.
