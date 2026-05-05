# ADR-0031: Open-Ended Definition Artifact Boundary

**Status**: Accepted
**Date**: 2026-05-05
**Deciders**: pandazki, Codex
**Tags**: creation-host, definition, governance, release-candidate

---

## Context

M18 proved that the Creation Host workflow can carry a non-table-first Generated Application:

```text
Personal Focus Site
  -> routes
  -> sections
  -> style tokens
  -> dynamic GitHub attention module
```

That pressure was necessary because M1-M17 were strongest for schema-shaped primitives:

```text
Table
Column
Operation
View
PolicyRule
PolicySetting
Rollback
```

M19 then found one pre-RC blocker: the M18 open-ended UI/module evolution was Host-governed, not framework `definition.apply_change_set` governance. The transcript was corrected to use `host.apply_open_ended_evolution`, but the boundary still needed an accepted decision before a credible release-candidate claim.

Without this ADR, Pneuma would risk overclaiming that arbitrary open-ended UI/module artifacts already flow through the same framework-governed definition rows as Tables, Operations, Views, and PolicyRules.

This ADR depends on:

- [ADR-0018: Operations as Primitive](./0018-operations-as-primitive.md)
- [ADR-0029: Supersede v0 Design Spec](./0029-supersede-v0-design-spec.md)
- [ADR-0030: Lifecycle Subsystem Contract](./0030-lifecycle-subsystem-contract.md)
- [Milestone 18 Snapshot](../milestone-18-snapshot.md)
- [Milestone 19 Snapshot](../milestone-19-snapshot.md)

## Options considered

### Option A: Host-owned artifacts with Host-level approval

Open-ended UI/module artifacts remain owned by the Creation Host or Host profile. The framework may still provide shared Host contracts, approval evidence, transcript evidence, inspection, lifecycle, release, restart, and rollback support, but it does not claim these artifacts are framework definition rows in v0.

- **Pro**: Matches current evidence. M18 already proves this workflow without inventing premature core primitives.
- **Pro**: Keeps the release-candidate claim honest: schema primitives are framework-governed; arbitrary open-ended UI/module definitions are not yet promoted.
- **Pro**: Avoids overfitting `routes / sections / style tokens / modules` from one example into core semantics too early.
- **Con**: Host-owned artifacts do not automatically inherit uniform framework rollback, app history, policy, or `definition.apply_change_set` semantics.
- **Con**: Creation Hosts must expose their own inspection and transcript evidence for these artifacts until a shared extension lane exists.

### Option B: Framework-governed extension lane now

Introduce a new framework primitive or extension-row model for open-ended UI/module definition artifacts. Examples could include `pneuma_definition_extensions`, `Surface`, `Route`, `ComponentTree`, or another typed extension lane that `definition.apply_change_set` can govern.

- **Pro**: Would make open-ended UI/module changes use the same governance semantics as existing definition primitives.
- **Pro**: Could eventually give policy, app history, rollback, and tooling a uniform extension path.
- **Con**: Current evidence is too thin. M18 is one open-ended example, not enough to stabilize the extension shape.
- **Con**: Promoting this now risks baking a site-builder-specific model into a framework intended to support many Creation Host profiles.

### Option C: Fully agent-edited files

Let the Build-phase Agent edit open-ended files directly and rely on git/process/release evidence around those files.

- **Pro**: Simple to prototype and maximally flexible for arbitrary generated apps.
- **Con**: Reverts to the v0 weakness rejected by ADR-0029: UI action, Agent tool-call, approval evidence, policy, history, and rollback diverge.
- **Con**: Gives the framework no durable semantic contract for what changed or why.

## Decision

Choose **Option A: Host-owned artifacts with Host-level approval** for v0 / pre-RC.

The accepted boundary is:

```text
Open-ended UI/module artifacts are Host-owned artifacts in v0.
They may be evolved through Host-level approval and Host semantic operations.
They are outside framework definition-as-data v0.
They are outside framework definition.apply_change_set.
```

For the M18 Personal Focus Site, the executable boundary contract is:

```ts
{
  artifact_kind: "host_owned_open_ended_definition",
  artifact_path: "site-definition.json",
  governance_scope: "host_approval",
  host_operation: "host.apply_open_ended_evolution",
  framework_definition_rows: false,
  framework_definition_apply_change_set: false,
}
```

Required Host evidence for open-ended artifacts:

| Evidence | Requirement |
|---|---|
| Approval | The Host must show one approval boundary for one Builder intent when the artifact change is material. |
| Transcript | The transcript must name the Host operation and must not mislabel the change as `definition.apply_change_set`. |
| Inspection | The Host must expose the artifact boundary and enough definition summary to explain what changed. |
| Release | Published versions must preserve and expose the artifact state used by End Users. |
| Rollback | Host rollback must restore the selected published version's artifact state, even if rollback is Host-level rather than framework definition rollback. |

What Pneuma may claim after this decision:

```text
Pneuma supports Creation Hosts that carry Host-owned open-ended artifacts
with Host-level approval, inspection, release, and rollback evidence.
```

What Pneuma must not claim yet:

```text
Arbitrary open-ended UI/module artifacts are framework-governed definition rows.
Arbitrary open-ended UI/module artifacts are governed by definition.apply_change_set.
```

## Consequences

### Positive

- Closes the M19 pre-RC blocker without inventing a premature core primitive.
- Keeps the four-artifact model honest: Creation Hosts can own profile-specific artifacts.
- Lets RC documentation distinguish current framework-governed primitives from Host-governed open-ended artifacts.
- Provides an executable M18 contract so future demos cannot silently drift back to overclaiming framework definition governance.

### Negative / Risks

- Open-ended artifacts still require Host-specific inspection and rollback evidence.
- The framework does not yet provide uniform app-history snapshots for arbitrary UI/module artifacts.
- A future second or third open-ended example may reveal a shared shape that deserves framework promotion.
- Developers must understand the difference between `definition.apply_change_set` and Host semantic operations.

### Follow-ups

- Keep **Framework-governed extension lane** as a later ADR candidate if multiple open-ended examples repeat the same artifact shape.
- If promoted later, define an explicit extension-row model rather than retrofitting M18 `site-definition.json` directly into core.
- Keep production hot reload, custom component distribution, and Runtime Agent productization out of this ADR.
