# Documentation Compression Design

**Date:** 2026-05-09  
**Status:** Proposed implementation design  
**Branch:** `codex/m31-credential-adoption`  
**Context:** Post-M31, after AI Build Assurance DDD review

## Goal

Compress the documentation surface without losing the reasoning trail that makes
the project credible.

The repo now has enough durable architecture, developer guides, milestone
snapshots, downstream upgrade notes, bilingual diagrams, and process plans that
the main risk is no longer missing context. The main risk is that new readers
cannot tell which documents are current entry points, which are reference
contracts, and which are historical evidence.

This cleanup should make three audiences faster:

1. A zero-context teammate trying to understand why Pneuma exists.
2. A Developer trying to build a Creation Host.
3. A downstream Host implementer trying to adopt a specific post-RC contract.

## Non-Goals

- Do not delete milestone snapshots or ADRs. They are evidence.
- Do not rewrite the architecture history to make it look linear.
- Do not create a new milestone or claim a new release tag.
- Do not move source files or package code.
- Do not turn process plans into canonical docs.

## Current Problem

The current docs are accurate but too flat:

- `docs/developer/start-here.md` is a good first page, but its read-next list has
  started to behave like a changelog.
- `docs/architecture/README.md` mixes first-read navigation, milestone catalog,
  ADR map, and historical explanation.
- `docs/architecture/team-share-demo.md` is current through M31, but it still
  needs to absorb the new AI Build Assurance framing so the project does not
  drift into generic artifact trust.
- Post-RC stabilization documents are valuable, but not all of them deserve to
  appear in the first reading path.
- Bilingual visual anchors exist, but the five-image entry path should now show
  the post-M31 model: Creation Host, governed Builder intent, BuildThread,
  Code Change Lane, credential utilities, and the next Assurance Case direction.

## Documentation Classes

Every document should be treated as one of four classes.

| Class | Meaning | Examples | Canonical entry behavior |
|---|---|---|---|
| Current entry | A first document for an audience | `docs/developer/start-here.md`, `docs/architecture/team-share-demo.md` | Short, visual, opinionated, no milestone dump |
| Durable reference | Contract or decision that remains valid | ADRs, `creation-host-contract.md`, `build-thread.md`, `code-change-lane.md` | Linked from entries by topic |
| Historical evidence | Snapshot proving what was done | milestone snapshots, RC snapshots | Linked from evidence ladder or appendix |
| Process archive | Plans, working notes, pressure logs | `docs/superpowers/plans/*`, old design specs | Not in first-read paths unless directly relevant |

Compression means moving documents to the right reading layer, not erasing useful
history.

## Target Information Architecture

### 1. Developer First Path

`docs/developer/start-here.md` becomes the primary Developer entrance.

It should answer five questions with five visual anchors:

1. What product layer am I building?
2. What does a Creation Host own?
3. How does one Builder intent become a governed change?
4. Which framework contracts keep that loop safe and portable?
5. What is the current post-RC capability map and next Assurance direction?

Its read-next section should shrink into four lanes:

- Build a Host: `getting-started.md`, `creation-host-contract.md`.
- Add governed creation: `build-thread.md`, `scaffold-project-contract.md`,
  `code-change-lane.md`.
- Compose runtime and release: `app-config-authoring.md`,
  `runtime-composition.md`, `release-rollout-authoring.md`.
- Adopt post-RC utilities: `host-extension-slots.md`, `credential-broker.md`,
  and the latest upgrade guide.

Milestone snapshots should move to an evidence appendix link, not appear as a
long mandatory reading list.

### 2. Zero-Knowledge Team Share Path

`docs/architecture/team-share-demo.md` becomes the teammate entrance.

It should explain:

```text
project goal
  -> four-layer product model
  -> Builder + Agent as an engineering control problem
  -> governed creation loop
  -> framework contract stack
  -> proof ladder
  -> current open work: Build Change Assurance Case
```

The team-share package should not read like a milestone ledger. Milestones should
support the story, not define the story.

### 3. Architecture Index

`docs/architecture/README.md` becomes a navigation router:

- "I am a Developer"
- "I am a teammate trying to understand the project"
- "I am a downstream implementer"
- "I am reviewing architecture history"

The current giant canonical table should be compressed into topic clusters:

- Top-level model and DDD anchors
- Core primitives
- Build/approval/assurance
- Runtime/release
- Sharing/forking/credentials
- Evidence archive

### 4. Downstream Implementer Path

Downstream guides should be easier to follow as a sequence:

1. Upgrade notes for tagged RCs.
2. Host authoring and diagnostics contract.
3. BuildThread and AgentBackend turn contract.
4. Scaffold Project and Code Change Lane.
5. Credential broker utilities.

The docs should explicitly say which guides are for tagged release adoption and
which are post-RC stabilization evidence not yet released as a new tag.

## Visual Refresh

Use Imagen-generated bilingual images, not browser screenshots, for the new
canonical visual anchors. Keep existing images when they still tell the current
story; replace or supplement only where the post-M31 model is missing.

Required image set:

1. **Four-layer product model**  
   Framework -> Creation Host -> Generated Application -> Published Application.

2. **Developer responsibility map**  
   Developer-owned Host profile, agent package, provider matrix, scaffold
   boundary, credential policy, runtime/release choices.

3. **Governed Builder intent loop**  
   Builder intent -> BuildThread -> Agent proposal -> assurance evidence ->
   approval -> execution lane -> receipt -> preview/publish/rollback.

4. **Framework contract stack**  
   Operation, definition-as-data, BuildThread, Scaffold Project, Code Change
   Lane, runtime diagnostics, HostExtension slots, credential broker, sharing
   governance.

5. **Post-RC evidence and assurance map**  
   M1-M25 proved RC coherence; M26-M31 stabilized downstream contracts; next lane
   is AI Build Assurance for "what changed, who approved, what failed, how to
   recover."

Each image needs English and Chinese variants. File names should stay consistent
with existing conventions under `docs/developer/assets/` or
`docs/architecture/assets/team-share/`.

## Compression Rules

1. First-read docs should contain no long milestone catalog.
2. Milestone snapshots stay, but they are evidence archive.
3. ADRs stay, but entry docs link only to the few ADRs needed for the current
   explanation.
4. Process plans under `docs/superpowers/plans/` should not be linked as durable
   architecture unless they are the only source of a still-current decision. If
   they contain durable content, promote that content into an ADR, spec, or
   snapshot first.
5. Bilingual docs should remain paired. If the English entry changes materially,
   update the Chinese entry in the same change.
6. Image captions and surrounding text should explain why the image exists; do
   not add decorative images.

## Validation

The cleanup is complete only if:

- English and Chinese first-read paths exist and are consistent.
- Local markdown links in changed docs pass.
- `git diff --check` passes.
- The new entry path can be explained in under five minutes:

```text
Start Here
  -> Getting Started
  -> Creation Host Contract
  -> BuildThread / Code Change Lane / Credential Broker as needed
  -> Architecture index only when deeper reasoning is needed
```

## Expected Outcome

After this work, a new reader should not feel that Pneuma is "a repo with 31
milestones." They should feel that Pneuma is a coherent framework with a clear
entry path, a readable proof ladder, and a current next problem: making AI-built
application changes inspectable, approvable, recoverable, and accountable.
