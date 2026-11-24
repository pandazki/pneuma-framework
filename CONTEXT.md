# pneuma-framework

This context describes the product and domain language for building AI-native Creation Hosts with `pneuma-framework`.

## Language

**pneuma-framework**:
The framework that provides shared primitives, contracts, validators, semantic tools, evidence vocabularies, and reusable implementation parts for AI-native Creation Hosts.
_Avoid_: pneuma app, app builder product

**Creation Host**:
The Builder-facing product built by a Developer with `pneuma-framework`.
_Avoid_: generated app, published app

**Generated Application**:
An application created and evolved by a Builder inside a Creation Host.
_Avoid_: creation host, framework app

**Published Application**:
An active released version of a Generated Application that End Users can open and use.
_Avoid_: generated app draft, preview runtime

**Developer**:
The person or team building or configuring a Creation Host.
_Avoid_: builder, end user

**Builder**:
The person using a Creation Host to create or evolve a Generated Application.
_Avoid_: developer, end user

**End User**:
The person using a Published Application.
_Avoid_: builder, developer

**Build-phase Agent**:
The agent that helps a Builder create or evolve a Generated Application inside a Creation Host.
_Avoid_: runtime agent

**Runtime Agent**:
An optional agent embedded in a Published Application for End Users.
_Avoid_: build-phase agent

**Creation Host Implementation Kit**:
A framework-provided set of reusable Host implementation parts that help a Developer assemble BuildThread, AgentBackend, approval, assurance, runtime/data receipts, preview, and publish lifecycle into an executable Creation Host loop.
_Avoid_: reference host, host product, provider SDK, core primitive

**Code Change Lane**:
The governed lane for proposing, reviewing, applying, verifying, and recovering source or open-ended artifact changes to a Generated Application.
_Avoid_: direct file editing, autonomous coding, hidden patch

**Agent Debug Loop**:
A pre-proposal code-agent loop where a Build-phase Agent edits a draft workspace, Developer-declared checks run, failed checks become feedback, and only a passing draft may become a Builder-visible proposal.
_Avoid_: post-approval silent repair, raw draft approval, autonomous retry

**Runtime/Data Receipt**:
Evidence that records what happened to runtime state or provider data after an approved Generated Application change.
_Avoid_: audit log, migration script, deployment log

**Data Evolution Handler**:
A Host-owned executor that performs runtime or provider data changes for a Generated Application version and returns a Runtime/Data Receipt.
_Avoid_: framework migration engine, hidden database mutation

**Preview Data Rehearsal**:
A pre-publish exercise that clones representative data into an isolated preview target, runs a Host-owned Data Evolution Handler, and records whether the evolved app can be previewed safely.
_Avoid_: production migration, framework database copy

**Corrective Proposal**:
A later Build-phase Agent proposal made in response to a failed, blocked, or rolled-back governed attempt.
_Avoid_: automatic retry, implicit repair, hidden fix

**Reference Host**:
A long-lived canonical Creation Host implementation maintained to demonstrate and verify correct framework and Creation Host Implementation Kit consumption.
_Avoid_: framework, product template, one-off demo

**Change Record**:
The floor of the framework (`@pneuma-framework/host-kit/change-record`): versions of an app directory, an append-only history, and restore, kept in the directory's `.pneuma/`. It records and audits; it runs no check, asks nobody, never touches stored data, and is not an authority. Whoever uses it owns governance.
_Avoid_: checkpoint, approval record, governed loop

**Guarantees**:
The names a Change Record entry carries for what held for that exact content: `verified` (a check command passed), `previewed` (it answered as a running app before release), `approved` (an approval record exists), `sealed` (the recorded content is byte-identical to the checked content). An empty list means recorded only; absence means not guaranteed. The floor never sets one; Hosts may add their own names.
_Avoid_: status, checks passed

**One-Way Change**:
A recorded change that putting files back cannot undo, such as a migration that drops a column and its data; its entry carries `one_way` with a reason. Going back past it is refused unless stored data was put back through a Data Snapshot Capability or someone explicitly accepted the cost, and the restore entry says which.
_Avoid_: destructive rollback, forbidden change

**Data Snapshot Capability**:
A capability a Host declares and implements (`DataSnapshotCapability`: `snapshot`, an optional `check`, `restore`) to put stored data back when an undo crosses a One-Way Change. The framework defines the interface and never supplies or promises one.
_Avoid_: framework data rollback, backup

**Governance Mode**:
The Host's one knob over its changes, all written to the same Change Record: `record` (everything recorded and published, nothing checked; entries say `guarantees: []`), `personal` (checks and a preview always run; a standing policy approves ordinary changes and the owner decides risky ones) and `review-all` (the same checks; the owner approves every change). It belongs to the Host, not to a framework enum. In the governed modes there is no change without an approval record, and in every mode going back past a One-Way Change needs the owner.
_Avoid_: skip-governance switch, framework mode

**Owner Page**:
The page the out-of-the-box Host (`examples/space-all-in-one`) serves for the person the apps are for: their apps, a waiting change shown before and after, history in plain words with the guarantees behind each version, and going back. Deciding on it needs the owner link; a decision passes the same gates and writes the same history entry as one made in a terminal.
_Avoid_: admin console, Builder workbench, PneumaSpace console

## Relationships

- A **Developer** builds or configures one **Creation Host**.
- A **Creation Host** lets a **Builder** create and evolve one or more **Generated Applications**.
- A **Generated Application** can produce one or more **Published Applications** over time.
- A **Published Application** is used by one or more **End Users**.
- A **Build-phase Agent** belongs to the creation/evolution flow; a **Runtime Agent** belongs only to a Published Application if the Host/profile chooses to include one.
- The **Creation Host Implementation Kit** is consumed by a **Creation Host** implementation; it is not itself a Creation Host product.
- A **Code Change Lane** can be orchestrated by the **Creation Host Implementation Kit**, but the **Creation Host** still owns source layout, guardrail commands, and domain-specific tool surfaces.
- An **Agent Debug Loop** runs before **Code Change Lane** proposal creation. It may repair a draft workspace within a declared budget, but it does not spend approval authority or mutate the approved source.
- A schema-changing **Code Change Lane** result needs a **Runtime/Data Receipt** when published data is carried forward, migrated, restored, branched, or otherwise evolved.
- A **Data Evolution Handler** belongs to the **Creation Host**; the **Creation Host Implementation Kit** governs when it may run and what receipt it must produce.
- A **Preview Data Rehearsal** is governed by the **Creation Host Implementation Kit**, but data cloning and provider-specific rehearsal execution are provided by the **Creation Host**.
- A failed **Preview Data Rehearsal** is recorded as failure feedback for the **Build-phase Agent**; it does not automatically create or apply a **Corrective Proposal**.
- A failed post-apply check or publish/rehearsal check can lead to a **Corrective Proposal**, but the prior approval does not authorize silent agent repair.
- The **Reference Host** is a Creation Host and a canonical consumer of the **Creation Host Implementation Kit**; it is not the only valid Creation Host shape.
- The **Creation Host Implementation Kit** belongs in a Host-facing package boundary, separate from core primitives and contracts.

## Example Dialogue

> **Dev:** "Can I use the Creation Host Implementation Kit to ship the Builder UI?"
> **Domain expert:** "No. The kit helps assemble the governed loop, but the Creation Host still owns its product UX, profiles, identity, provider wiring, and policy choices."

> **Dev:** "Should every real Creation Host fork the Reference Host?"
> **Domain expert:** "No. The Reference Host teaches and verifies the framework path; real Hosts may use different UX, providers, policies, and product boundaries."

## Flagged Ambiguities

- "pneuma app" is ambiguous. Resolve it as **Creation Host**, **Generated Application**, or **Published Application** before designing work.
- "Agent debug" is ambiguous. Resolve whether it means **pre-proposal Agent Debug Loop** or **post-apply deterministic recovery** before designing work.
