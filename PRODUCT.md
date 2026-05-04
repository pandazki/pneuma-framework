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

## Current Release-Candidate Target

The current candidate target is still:

```text
Developer-facing framework for building local/reference Creation Hosts.
```

M19 found the repo technically close to that target, but the RC tag is deferred until M20 pins one boundary:

```text
Are open-ended UI/module artifacts Host-owned with Host approval,
or framework-governed through a new definition extension lane?
```

It should let a Developer understand and run:

- framework and generated-app primitives;
- governed `definition.apply` and `definition.apply_change_set`;
- Builder approval and permission evidence;
- Creation Host project/profile/version flow;
- preview and inspection surfaces;
- publish, restart, and rollback evidence;
- reference app profiles that show both schema-driven and open-ended app shapes.

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
- [`docs/architecture/roadmap.md`](./docs/architecture/roadmap.md) — current milestone sequence.

## Product Taste

Pneuma should feel like serious infrastructure for creative software, not a dashboard toy:

- conversation is useful only when paired with preview, inspection, and evidence;
- approval prompts explain what will change and why;
- generated apps should feel like real apps, not wireframes;
- framework docs should distinguish durable decisions from process logs;
- vendor integrations remain reference evidence until promoted by ADR.
