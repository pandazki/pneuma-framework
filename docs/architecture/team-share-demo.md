# Pneuma Team Share Package

**Date:** 2026-05-04
**Status:** Current after M20 open-ended definition boundary closure; next step is final RC decision
**Audience:** teammates with zero Pneuma context who understand normal software products
**Format:** 45-60 minute team share with two optional local browser demos
**Chinese version:** [Pneuma Team Share Package zh-CN](./team-share-demo.zh-CN.md)

This is the current canonical team-share package. It replaces the older M2-specific governance runbook with a top-down narrative:

```text
project goal
  -> product/artifact model
  -> framework architecture
  -> implementation evidence
  -> runnable demos
  -> current RC decision boundary
```

## Outcome

After the share, the team should be able to say:

```text
Pneuma is infrastructure for building AI-native Creation Hosts.
A Developer uses the framework to build the Host.
A Builder uses the Host to create, inspect, evolve, approve, publish, monitor, and roll back Generated Applications by talking to a Build-phase Agent.
End Users use the Published Application.
```

The second sentence they should remember:

```text
Pneuma is not proving that an agent can edit files.
It is proving that app evolution can become a governed software primitive.
```

## 1. Why This Exists

Most software assumes the Developer finishes the app shape before users arrive. Users then operate the finished surface: click buttons, fill forms, read dashboards.

Pneuma tests a different contract:

```text
The Builder can change the app's own behavior, data model, UI surface, and release state in-session by talking to an Agent.
```

![Pneuma north star](./assets/team-share/team-share-north-star.png)

The important distinction is:

| Normal app interaction | Pneuma creation interaction |
|---|---|
| Add one data row | Add a new capability |
| Filter a list | Create a new View and Operation |
| Ask an assistant for help | Ask an Agent to evolve the app under governance |
| Deploy a build produced by developers | Publish a Generated Application version produced through the Host workflow |

This is why the project needs primitives such as Operation, definition-as-data, approval tokens, app history, permission ledger, rollout state, and rollback. If Pneuma only created one hard-coded app, those primitives would be unnecessary overhead.

## 2. The Four-Artifact Model

The most common misunderstanding is to collapse everything into "a pneuma app." The current model deliberately keeps four artifacts separate:

![Four artifacts](./assets/team-share/team-share-four-artifacts.png)

| Artifact | Meaning |
|---|---|
| **pneuma-framework** | The library/runtime providing primitives, semantic tools, wire protocol, lifecycle, governance, and release evidence. |
| **Creation Host** | A Developer-built product surface where Builders create and operate Generated Applications. |
| **Generated Application** | The app instance created through the Host. It has definition, data, versions, runtime surface, and release history. |
| **Published Application** | A selected Generated Application version exposed to End Users. |

The role map:

| Role | Main job |
|---|---|
| **Developer** | Builds or configures the Creation Host, stack profiles, host UX, and domain constraints. |
| **Builder** | Uses the Creation Host to shape a Generated Application through conversation, preview, inspection, approval, and publish. |
| **End User** | Uses the Published Application like a normal app. They may never see the Build-phase Agent. |

Use this line when presenting:

> Framework is the primitive. Creation Hosts and generated apps are products built on top.

## 3. The Governed Creation Loop

The core loop is one Builder intent becoming one governed app change:

![Governed creation loop](./assets/team-share/team-share-governed-loop.png)

This loop is the reason M2 and M7 mattered:

```text
Builder intent
  -> Agent proposal
  -> impact disclosure
  -> Builder approval
  -> scoped approval token
  -> framework_system execution
  -> app definition / release state changes
  -> preview, publish, rollback, and evidence
```

The authority split is non-negotiable:

| Actor | Allowed to do |
|---|---|
| Build-phase Agent | Propose changes through framework semantic tools. |
| Builder | Approve or deny the proposal. |
| framework_system | Spend scoped approval authority and execute governed mutation. |
| End User | Use the published app through normal app policy. |

This is why the framework treats approval evidence as product state, not a debug log. A future enterprise surface needs to answer:

```text
Who proposed this?
Who approved it?
What exactly was approved?
Which scoped token authorized execution?
What executed?
What changed?
Can we inspect or roll it back?
```

## 4. The Primitive Control Plane

Pneuma is not a UI builder plus chat. It is a control plane where the same primitive declarations feed UI, Agent tools, HTTP API, policy, history, and release evidence.

![Primitive control plane](./assets/team-share/team-share-primitive-control-plane.png)

Current important primitives:

| Primitive / subsystem | Why it exists |
|---|---|
| **Operation** | Shared action contract. UI button, Agent tool, and HTTP operation come from one declaration. |
| **definition-as-data** | App structure is stored as governed rows: tables, columns, operations, views, policies. |
| **Policy / Authorization Kernel** | Separates proposer, approver, executor, and runtime user authority. |
| **Permission Ledger** | Durable approval/evidence read model for product governance surfaces. |
| **App History** | Attribute definition changes and support validation/rollback evidence. |
| **Release Rollout State** | Track candidate, active, previous, restart, and rollback at the Host level. |
| **Lifecycle subsystem** | Start, stop, build, deploy, migrate, restart through semantic tools rather than agent-edited scripts. |
| **Semantic Index** | Derived capability. Business rows stay source of truth; embeddings/search index do not redefine app data. |

The architectural shift from the original v0 spec is already accepted:

```text
old mental model: lifecycle scripts are the core
current model: Operation + definition-as-data is the core
lifecycle remains a runtime subsystem
```

See [ADR-0029](./adr/0029-supersede-v0-design-spec.md) and [ADR-0030](./adr/0030-lifecycle-subsystem-contract.md).

## 5. Evidence From M1-M20

The project did not jump directly to a polished demo. It built a proof ladder:

![Evidence ladder](./assets/team-share/team-share-evidence-ladder.png)

Read the ladder as six proof bands plus the M20 closure:

| Band | What it proved |
|---|---|
| **M1-M2** | App definition can be governed, approved, attributed, policy-gated, and rolled back with enterprise authority separation. |
| **M3-M4** | The primitive chain survives real substrate pressure: Bun, SQLite, Drizzle, Docker, mounted volume, and a usable Knowledge Inbox app. |
| **M5-M7** | Builder/Agent app evolution works with real backend-agent paths and one proposal-level approval for one intent. |
| **M8-M11** | Generated app state can enter release packaging, integrity evidence, semantic retrieval, and rollout state. |
| **M12-M16** | The Reference Creation Host can create, preview, inspect, evolve, approve, publish, restart, roll back, and switch profiles. |
| **M17-M19** | Security review, architecture acceptance, open-ended app pressure, and RC review narrowed the remaining blocker to one explicit boundary. |
| **M20** | Accepted [ADR-0031](./adr/0031-open-ended-definition-artifact-boundary.md): open-ended UI/module artifacts are Host-owned + Host approval in v0, not framework definition rows. |

The current technical health from M19:

```text
bun test
1136 pass
0 fail

bun run typecheck
exit 0

live browser review
M18 create / preview / inspect / evolve / publish / rollback
console errors: 0
```

That does not mean production SaaS is done. It means the framework is close to a developer-facing candidate for building local/reference Creation Hosts.

## 6. Demo Path

Use two demos if time allows:

![Demo storyboard](./assets/team-share/team-share-demo-storyboard.png)

### Demo A: Reference Creation Host integration

Purpose:

```text
Show the full Creation Host workflow for schema-driven generated apps.
```

Run:

```bash
bun run examples/m16-reference-creation-host/run.ts --port 8879
```

Open:

```text
http://127.0.0.1:8879/
```

Walkthrough:

1. Create Knowledge Inbox.
2. Preview the End User app.
3. Inspect schema, operations, policies, and data.
4. Ask for Priority Queue evolution.
5. Approve one proposal-level change.
6. Publish v0 and v1.
7. Restart active runtime.
8. Roll back to v0.
9. Create Team Decision Log and show that the Host is not Knowledge Inbox-only.

Key presenter line:

> The Builder is not editing code. The Builder is operating a Creation Host that turns intent into inspected, approved, versioned app changes.

### Demo B: Open-ended Personal Focus Site

Purpose:

```text
Show that the same Host workflow can carry a non-table-first generated app.
```

Run:

```bash
bun run examples/m18-open-ended-personal-focus-site/run.ts --port 8880
```

Open:

```text
http://127.0.0.1:8880/
```

Walkthrough:

1. Create `pandazki-focus-site`.
2. Preview a polished personal site, not a list workflow.
3. Inspect routes, sections, style tokens, modules, and deterministic GitHub attention evidence.
4. Evolve one Builder request: make GitHub attention more useful.
5. Approve v1 at the Host layer.
6. Publish v0 and v1.
7. Restart and roll back.

Use this screenshot if you do not want to run the browser:

![M18 browser evidence](./assets/m18-open-ended-pressure-browser-evidence.png)

Key presenter line:

> M18 proves the four-artifact workflow can carry open-ended UI/module state. It does not yet prove that arbitrary open-ended artifacts are framework-governed definition rows.

## 7. Current RC Boundary

M19 ended with a healthy but deliberately conservative decision:

```text
GO for pre-RC closure work.
NO-GO for tagging RC today.
```

M20 has now closed that boundary:

![Pre-RC boundary](./assets/team-share/team-share-rc-boundary.png)

The accepted decision:

| Decision | Meaning | Why |
|---|---|---|
| **Host-owned artifacts + Host approval** | Routes, sections, style tokens, and dynamic modules remain Host/profile artifacts in v0. The framework provides Host contracts, approval evidence, release, inspection, and rollback support, but does not claim those artifacts are core definition rows. | Current evidence supports the Host workflow, but not a stable framework extension primitive. |
| **Later extension lane remains possible** | A future ADR may add a primitive or extension-row model for repeated open-ended UI/module shapes. | This should happen only after multiple examples prove the shared shape. |

What the RC must not claim:

```text
Tables, Operations, Views, and Policies are framework-governed today.
Arbitrary open-ended UI/module artifacts are not framework definition rows yet.
```

This is a strength, not a weakness. It shows the project is refusing to overclaim a boundary just because a demo works.

The next step is a final release-candidate decision on top of this accepted boundary.

## 8. Suggested Share Run

| Time | Section | Goal |
|---:|---|---|
| 0-5 min | Why this exists | Separate "using software" from "creating software by talking." |
| 5-12 min | Four artifacts | Prevent the "pneuma app" terminology collapse. |
| 12-20 min | Governed loop | Explain authority separation and why enterprise governance is core. |
| 20-30 min | Primitive control plane | Map the primitives to UI, Agent tools, API, policy, history, and release. |
| 30-42 min | Demo A | Show integrated Reference Creation Host. |
| 42-52 min | Demo B | Show open-ended app pressure. |
| 52-60 min | RC decision | Explain M20 closure and align on whether the next step is RC tagging. |

Presenter rules:

- Start from the problem, not from ADR numbers.
- Use "Builder changes app capability" instead of "Agent edits code."
- Show the End User app before showing inspectors.
- When showing approval, explicitly name proposer, approver, executor.
- When showing M18, be precise: host-governed open-ended evolution, not framework definition-row governance.
- End with the RC decision, not a broad list of future features.

## 9. FAQ

### Is Pneuma a website builder?

No. A website builder is one possible Creation Host or profile. Pneuma is the framework layer for building Creation Hosts whose generated apps may be workflow tools, knowledge apps, internal SaaS modules, open-ended sites, or future Pneuma 2.x modes.

### Is the Agent allowed to change production software directly?

No. The intended contract is proposal, impact disclosure, approval, scoped token, framework execution, evidence, and rollback/recovery. M17 specifically closed spoofing and direct internal operation exposure issues.

### Why not just let the Agent edit files?

Because file edits make UI action, Agent tool-call, policy, approval evidence, audit history, rollback, and release semantics diverge. Operation + definition-as-data keeps those surfaces aligned.

### Why not support every database, vector store, deployment target, and runtime now?

Because framework semantics should not be confused with implementation choices. SQLite, Bun, Docker, Drizzle, GitHub, OpenRouter, Linear, and Qdrant-like stores are candidates or reference integrations. They become framework abstractions only after concrete pressure proves they must.

### Is this production-ready enterprise security?

No. M2 and M17 prove the right authority shape and close critical local/runtime bypasses. Production IAM, multi-tenant admin workflows, retention, assignment, and hosted secret management are later productization work.

### What would make this release-candidate ready?

Run the final RC decision pass on top of ADR-0031: focused browser paths, full verification, and no new top-level primitive gap.

## Appendix: Useful Links

- [Creation Host Model](./spec/creation-host-model.md)
- [Architecture README](./README.md)
- [Roadmap](./roadmap.md)
- [M16 Reference Creation Host Snapshot](./milestone-16-snapshot.md)
- [M18 Open-Ended App Pressure Snapshot](./milestone-18-snapshot.md)
- [M19 Release Candidate Review Snapshot](./milestone-19-snapshot.md)
- [M20 Open-Ended Definition Boundary Snapshot](./milestone-20-snapshot.md)
- [ADR-0031: Open-ended definition artifact boundary](./adr/0031-open-ended-definition-artifact-boundary.md)
- [ADR-0029: Supersede v0 design spec](./adr/0029-supersede-v0-design-spec.md)
- [ADR-0030: Lifecycle subsystem contract](./adr/0030-lifecycle-subsystem-contract.md)
