---
name: closing-a-milestone
description: Close out a project milestone with serious paperwork — top-down architectural review, docs squash into git history, canonical milestone snapshot + roadmap + share runbook + state labels, and editorial-grade hero illustrations. Use whenever the user signals a milestone-closure moment: "close M1 / M2", "wrap up this milestone", "do milestone paperwork", "squash old design docs", "write a milestone snapshot for the team", "we just shipped X and want to align", "produce share materials for the team", or asks for any combination of these. Also fire proactively right after a non-trivial milestone is verified (tests pass, demo works) and the user signals they want to share with a team, pause to take stock, or stop accumulating per-slice progress reports. Do NOT fire for routine commits, single-ADR work, bug fixes, refactors, or feature additions — only for closing a meaningful project phase where the *paperwork itself* is the deliverable.
---

# Closing a Milestone

The work has been done. Tests pass. The demo works. The team needs to be aligned. Now what's needed is **paperwork** — the artefacts that let zero-context teammates understand what was proven, what was not, and what comes next, without reading the commit log.

This skill encodes a four-phase arc for producing that paperwork. The phases are ordered: **review before squash, squash before paperwork, paperwork before visuals.** Skipping or reordering phases produces docs that look polished but lie about what was built.

## The four-phase arc

```
1. Top-down review        — does the milestone match the project's stated north star?
                             is the work thoughtful, or just packaged in a hurry?
2. Docs squash            — compress process artefacts into git history;
                             keep only load-bearing canonical docs in the working tree.
3. Paperwork              — produce a small coherent set of artefacts:
                             milestone snapshot, roadmap, share runbook, state labels.
4. Visual assets          — replace mermaid with editorial illustrations
                             when a document is share-bound.
```

Phases are sequential per-milestone, not concurrent. Reviewing while squashing causes you to delete things you'd later realise were load-bearing. Doing visuals before paperwork tempts you to commit to a frame that doesn't survive the writing.

---

## Phase 1 — Top-down review

**Goal:** Decide whether to close the milestone at all, and surface any *unstated drift* between the project's founding intent and what was actually built.

The single most important rule: **don't be guided by commits one-by-one.** Commits show what changed. They don't show whether the change was the right thing.

### Read in this order

1. **The earliest founding doc** — usually `CLAUDE.md`, `README.md`, `PRODUCT.md`, or an early design spec. This is the project's stated north star.
2. **The latest milestone artefacts** — milestone snapshots, demo runbooks, anything dated within the past week.
3. **The intermediate decision record** — ADRs in the order they were written, but skim, not deep-read. You're looking for the sequence of architectural shifts, not the details.
4. **The actual code surface** — `ls packages/`, `ls templates/`, `ls examples/` (or equivalents). Compare to what the founding doc described.

While reading, hold two questions in mind:
- **Alignment**: did the milestone advance the founding intent, or quietly substitute a different intent?
- **Thoughtfulness**: is each architectural decision an answer to a real problem (visible in ADRs / pressure tests / scenario validation), or did the milestone get packaged to hit a date?

### What to write down

A **review verdict** with three parts:

- **Q1 alignment**: yes / partial / no, with the *strongest evidence* for each side. Look especially for a v0 spec or early design document whose roadmap has been silently abandoned. That's the most common drift signal.
- **Q2 thoughtfulness**: phase-by-phase. The same project can be deliberate in early phases and rushed in late phases. Distinguish.
- **Q3 closure recommendation**: close as-is / close with caveats / not yet ready. If "with caveats", list the must-do cleanup before declaring closure (often this includes writing a supersedure ADR — see Phase 2).

Phrase the verdict in **non-binary** language. "Yes with one structural caveat" is more useful than "yes". Reviewers who only ever say "yes" or "no" stop being trusted by the rest of the team.

### Anti-patterns

- **Commit-by-commit narrative.** Following the timeline forward biases toward "everything makes sense given what came before." Top-down means you read the *destination* (latest milestone doc) first, then check whether the *journey* (commits) actually got there.
- **Confusing technical quality for milestone validity.** Code can be clean, tests green, and the milestone still wrong because it solved the wrong problem.
- **Over-trusting self-reported milestone documents.** A "Milestone 1 closed" doc is a claim, not evidence. Verify against the code and ADRs.

---

## Phase 2 — Docs squash + canonical lockdown

**Goal:** Compress process artefacts into git history so the working tree contains only load-bearing canonical docs. New contributors should be able to onboard from `docs/` without wading through dead plans.

Before paperwork, the working tree must reflect *current* truth. If a v0 spec lives in `docs/` next to the new milestone snapshot, readers will be confused about which is authoritative — and the team-share talk will derail when someone asks "wait, is the v0 plan still happening?"

### Decision matrix: keep / merge / archive-into-git

For each document in `docs/` (and adjacent folders like `plans/`, `specs/`, `research/`), apply this matrix:

| Document type | Action | Rationale |
|---|---|---|
| ADRs (architectural decisions) | **Keep** all, even superseded ones | Decision history is an asset; supersede with a new ADR rather than deleting |
| Domain model / canonical spec | **Keep** | Long-term reference |
| Architecture diagrams (the *inputs* to ADRs) | **Keep** in `spec/images/` or similar | Visual decision record |
| Current milestone snapshot | **Keep** (one canonical doc only — see Phase 3) | Time-sensitive but load-bearing |
| Roadmap | **Keep** (one canonical doc only) | Forward-looking |
| Open questions list | **Keep** (only unresolved questions, not closed history) | Captures unsettled decisions |
| Share runbook | **Keep** | Direct deliverable for team alignment |
| Per-slice / per-day implementation plans | **Archive** | Process noise once shipped |
| Per-slice progress reports ("P1 done", "P5 progress") | **Archive** | Conclusions absorbed by ADRs and snapshot |
| Single-day retrospectives ("ultra-review of day 2") | **Archive** | Conclusions absorbed by subsequent commits |
| Pressure-test artefacts | **Archive** if conclusions are absorbed by ADRs/amendments; otherwise **keep** as standalone evidence | Often started as input to decisions, decayed into history |
| External-product competitive analyses | **Archive** if conclusions are absorbed; otherwise **keep** | Same as pressure-test |
| Step-N execution snapshots ("scenario validation as of date X") | **Replace** with a current verification matrix in the milestone snapshot, then **archive** the snapshot | Decayed evidence |
| Earlier framing docs whose model has been replaced (e.g., a v0 spec) | **Archive** + write a supersedure ADR | The supersedure ADR is what preserves the recovery story |

### The squash procedure

The point of squashing is **not** to lose information — it's to move it from the working tree into git history, where it remains recoverable but doesn't pollute new-contributor reading.

```bash
# 1. For each archive-bound file, capture its last-touched commit hash.
#    This goes into the squash commit message so future readers can run
#    `git show <hash>:<path>` to recover the content.
for f in <list of files>; do
  h=$(git log -n 1 --format=%h -- "$f")
  printf "%s  %s\n" "$h" "$f"
done

# 2. git rm them.
git rm <list of files>

# 3. Commit with the file → hash table embedded in the message.
git commit -m "Squash early process docs into git history" -m "..."
```

### Two-commit pattern

Almost always cleaner than one commit:

- **Commit A**: write any new canonical docs first (supersedure ADR, new milestone snapshot, roadmap). This makes the destination visible before destruction.
- **Commit B**: `git rm` the archive list. This is the destructive commit.

Reviewers can read Commit A and understand the new shape, then see Commit B as a clear "and these are the things we're moving to history."

### Supersedure ADR

If your review (Phase 1) found that an earlier framing has been silently abandoned (e.g., the project pivoted away from a v0 spec without writing it down), produce a supersedure ADR before squashing.

The ADR should:

1. **State the prior framing** in 2–3 sentences.
2. **State the new framing** in 2–3 sentences.
3. **Explain the architectural insight that triggered the shift** — usually a primitive or pattern that absorbed what the prior framing was hand-rolling.
4. **Identify what survives from the prior framing** as a sub-system or implementation detail (the prior framing is rarely 100% wrong).
5. **List the docs that get squashed** as a consequence.

This is the single most-loaded artefact in the squash. Do not skip it. Without it, future contributors reading the supersedure git rm commit won't understand why.

### Anti-patterns

- **Squashing without a supersedure ADR.** "We deleted the old spec because it was outdated" is not a recoverable decision record.
- **Hash capture as an afterthought.** Run hash capture *before* `git rm`, otherwise you've already lost the easy way to find the last-touched commit.
- **Bulk `git rm -r` without enumeration.** The commit message must enumerate every removed file with its hash. This is the only mechanism for future retrieval.
- **Touching ADRs in the squash.** ADRs are append-only; supersede with a new ADR rather than editing or deleting the old one.

---

## Phase 3 — Paperwork establishment

**Goal:** A small coherent set of canonical artefacts that someone with zero project context can read in ~30 minutes and understand: (a) what was proven, (b) what was not, (c) what comes next, (d) what to demo.

### The "at most one" rule

Per artefact category, keep exactly one canonical doc:

- **One** milestone snapshot (current milestone only — past milestones go into git history; future milestones go into roadmap)
- **One** roadmap
- **One** open-questions list
- **One** share runbook (acts as both the demo runbook *and* the deck outline)
- **One** state-label index per code area (templates, examples, packages — three indices, but one per area)

Two of anything triggers the "wait, which is authoritative?" question. Resist the temptation to split a milestone snapshot into a "bird's-eye" + "detailed" pair — merge them.

### Milestone snapshot — required sections

Use this exact section ordering. Each section has a specific role; reordering breaks the reader flow.

```
# Milestone N Snapshot: <Theme>

(metadata block: date, status, audience, scope)

## Executive Summary
  - 5-7 sentences for the zero-context reader
  - end with a "Before / After" table (one column per side, 4-5 rows of contrast)

## Milestone Thesis
  - one bold sentence stating what this milestone proved
  - 2-3 follow-up bullets distinguishing what was proven from adjacent things

## Where <Project> Sits
  - one sentence positioning vs the closest neighbours (3-4 named alternatives)
  - a comparison grid (4 columns: project + 3 neighbours, 4-5 rows of axes)
  - 3 differentiator bullets, each with an ADR reference

## System At A Glance
  - one paragraph stating the architectural insight
  - one hero illustration (Phase 4)
  - one paragraph reading back what the illustration shows

## What Is Proven
  - 2-column table: capability | current proof

## Current Primitive Surface
  - 5-7 line ASCII tree of the primitives this milestone covers
  - one paragraph explaining how the layers compose

## Working Definition Surface (or equivalent — what this milestone owns as data)
  - table of system-owned tables / structures
  - any normalized contract introduced (with a ts code block if applicable)

## Supported Operations / Mutations
  - per supported shape: a small ts code block + 5-line acceptance proof

## End-To-End Loop
  - one hero illustration showing the governance loop
  - "demo moment to framework concept" mapping table

## Demo Story
  - 5 numbered steps, one sentence each
  - pointer to the share runbook for the live talk track

## Rollback / Reversibility Path
  - the 3-stage flow as ASCII (validate / prepare / execute)
  - "rollback impact | status" table

## Why These Design Choices
  - 3 load-bearing decisions
  - per decision: one paragraph on the choice + Why + Cost + ADR reference

## M<N> Verification Matrix
  - capability dimension × variant grid with ✅ / ❌ / — legend
  - targeted test suite list (one path per line, copy-paste runnable)
  - full repo state (typecheck PASS / N tests / build PASS / etc.)

## Project Progress By Layer
  - qualitative table (layer | current state | implication)
  - ADR coverage (by §) sub-section with hero illustration + table + visual roll-up

## What This Does Not Prove Yet
  - 2-column table: not yet proven | why it matters

## Strategic Read
  - the 3-paragraph "what should the team be most worried about now"

## Recommended Next Phase
  - one sentence stating the recommended next milestone theme
  - candidate workstreams table

## Team Decision Gate
  - 4 yes/no questions for the share meeting
  - end with a "before / after milestone boundary" framing block

## Evidence
  - recent commits (5-9 oneline)
  - verification commands
  - latest test count

## Reading Path
  - 4 steps for a zero-context teammate

## Appendix — Historical Slice Ledger
  - per-slice ledger as a table (slice | durable result)
```

Skip a section only if it genuinely doesn't apply (e.g., a milestone with no rollback story drops the "Rollback / Reversibility Path" section). Don't skip "What This Does Not Prove Yet" — that's the section that keeps the snapshot honest.

### Roadmap — required structure

```
# Roadmap

(metadata: last updated, status, supersedure note)

## Stage Overview
  - one hero illustration (Phase 4)
  - ASCII fallback block listing each stage with status emoji

## Stage Details
  - per stage: 1 paragraph
    - what it covers
    - status (closed / current / future)
    - links to relevant ADRs
    - for closed stages, no detail beyond a one-line summary — detail goes in the milestone snapshot of that stage

## Constraints & Principles
  - 3-5 architectural rules that apply across stages
  - one of these is usually a "what the next stage WON'T do" constraint
```

The roadmap should never invent dates. "Stage 5 — Q3 2026" is a lie unless the team has actually committed to Q3. Use status emoji (✅ / 🔜 / ⏳) instead.

### Share runbook — required structure

The runbook is **two artefacts in one file**: a click-by-click live demo script + a slide-by-slide deck outline. Both reference the same milestone snapshot.

See `references/canonical-doc-templates.md` for the exact section layout, the slide-by-slide pattern with time budgets (it's longer than fits here), and the rehearsal-tips conventions.

### State labels — required structure

For each code area that contains user-facing units (templates, examples, plugins, packages):

- Create a `<area>/README.md` if missing.
- List every unit in a 3-column table: name | status | role.
- Status vocabulary (4 values, no others): **canonical** / **reference** / **archived** / **scratch**.
- "Last touched" column is optional but useful — derive from `git log -n 1 --format=%ar -- <path>`.

Definitions:

- **canonical** — currently load-bearing in the milestone story; actively tested as milestone evidence.
- **reference** — validates a specific ADR / primitive face but not in the milestone demo; kept for teaching / regression.
- **archived** — historical, preserved but not actively maintained; superseded by a newer unit.
- **scratch** — experimental / spike, not for general use.

Archived items stay in-tree (preserve git context, runnable teaching value). Don't `git rm` them in Phase 2 — only docs get squashed; code stays.

### CLAUDE.md / AGENTS.md update

After establishing the canonical artefacts, update the project-level `CLAUDE.md` (and `AGENTS.md` if mirrored) to reflect the new reading order:

- Drop pointers to anything you squashed.
- Add the milestone snapshot as the canonical first read for new sessions.
- Update the "what's already decided" list to include any new fundamental decisions (e.g., "definition is data, not code" if that's a new canonical line from the supersedure ADR).
- Update the "canonical first action" — usually it changes from "run plan against v0 spec" to "wait for user intent; M just closed."

### Anti-patterns

- **Per-slice progress reports accumulating in `docs/`.** Once a slice is shipped, its conclusions belong in the milestone snapshot or an ADR, not as a standalone report.
- **Faking percentages.** "ADR §3 is 70% covered" without saying *what* the missing 30% is is a number that lies. Use ✅ / 🟡 Partial / ❌ with a one-line note instead.
- **Splitting the milestone snapshot.** Resist the urge to separate "team-share version" from "engineering version". One doc, with sections sized for both audiences (executives read top, engineers drill into verification matrix).
- **Roadmap with invented dates.** Date-free roadmaps are honest; dated roadmaps get stale and become confusing artefacts.
- **5-bullet share outline.** A "Suggested 30-Minute Share" with five bullets is not a runbook — it's a placeholder. Slide-by-slide with speaker notes is the actual deliverable.

---

## Phase 4 — Visual asset generation

**Goal:** Replace mermaid with editorial-grade illustrations *only for share-bound documents*. Internal-only docs can stay in mermaid forever.

Mermaid is excellent for first-pass scaffolding and for engineering reference. It is *not* good enough for a milestone share where the artefact will be projected on a screen, screenshotted into a deck, or shown to executives. The visual hierarchy, typography, and proportional control mermaid offers is too coarse for that audience.

### When to invest in real illustrations

If **all three** are true, generate real illustrations:

1. The document is share-bound (will be projected, screenshotted, or sent to a non-engineering audience).
2. The mermaid diagram is currently the central visual of the section (not a sketch of a flow that's incidental).
3. The illustration will be reused at least 3× (in the deck, in the snapshot, in a follow-up doc).

If only one or two of these are true, mermaid is fine. Don't burn image-generation cost on a diagram that only one person will look at.

### The coherent-set principle

Generate **all** the milestone's hero illustrations in one batch using a **single shared style brief**. This is the difference between "a folder of images" and "a coherent set". The shared brief locks:

- Background paper colour
- Linework ink colour
- Two-tone accent palette (one for "the thing this milestone added", one for "current focus / callouts")
- Typography pairing (serif headline + sans labels)
- Composition rules (hairline rules, no drop shadows, no gradient mesh, generous whitespace)

See `references/visual-style-brief.md` for the template + delegation pattern (use a sub-agent to keep image-generation noise out of the main conversation).

### Standard milestone image set

Most milestones benefit from these four images. Generate all four together so they look coordinated:

1. **System architecture** — what was added, highlighted in the secondary accent. Replaces the "system at a glance" mermaid in the milestone snapshot.
2. **End-to-end governance loop** — the 6–10 station flow from intent to rollback. Replaces the "end-to-end loop" mermaid.
3. **Coverage radar** (or equivalent) — a radial chart showing which dimensions are full vs partial. mermaid genuinely cannot draw this; this image is the strongest argument for investing in real illustrations.
4. **Roadmap river / timeline** — stages 0–N with the current milestone marked in the focus accent. Replaces the timeline mermaid.

Each image gets a slide assignment in the share runbook (e.g., "slide 7 — End-to-end loop image"). This is what makes them load-bearing.

### Integration

After generation:

- Replace the mermaid block in the snapshot with `![alt text](./spec/images/<name>.png)`.
- Keep an ASCII fallback (e.g., the stage-overview ASCII block in roadmap.md) for text-only readers and accessibility.
- Update the share runbook with a slide ↔ image mapping table.

### Anti-patterns

- **Mermaid in the deck.** If you screenshot mermaid and put it on a slide, it will look out of place. Mermaid's typography is functional, not editorial.
- **One-off image styles.** Generating images one at a time without a shared style brief produces a grab-bag. The audience can tell.
- **Decorative photography.** This is a technical share, not a marketing deck. Keep illustrations strictly informational.
- **3D renders / glassmorphism / gradient mesh.** These age fast and read as "AI-generated stock". The editorial-illustration aesthetic survives time.

---

## Cross-phase guidance

### Sequencing within a session

A full milestone closure typically takes one focused session of 60–120 minutes of human time:

```
Phase 1 (Review)          15-20 min   produces verdict + caveats
Phase 2 (Squash)          15-20 min   produces 2 commits
Phase 3 (Paperwork)       30-40 min   produces 5 canonical docs
Phase 4 (Visual assets)   15-20 min   produces 4 hero illustrations
Total                     75-100 min  + image generation runtime (~5-10 min, can overlap)
```

The model is doing most of the work; the human's time is in reviewing and approving. Don't let the human's review time become the bottleneck — produce one phase, get a thumbs-up, move to the next.

### When to stop

Stop when **all** are true:

- The milestone snapshot reads cleanly to a zero-context teammate (test by re-reading the executive summary cold).
- The squash commit message lists every removed file with a recoverable hash.
- The supersedure ADR (if needed) explains the prior → new transition in three sentences.
- The share runbook has slide-by-slide coverage of the 30-minute talk.
- The four hero illustrations look like a coherent set, not four images from four sessions.
- `templates/`, `examples/`, and `packages/` (or equivalents) have status indices.
- `CLAUDE.md` / `AGENTS.md` reflect the new canonical reading order.

### Common-pitfall reminders

- **Don't write a vision section from scratch.** The vision is in `CLAUDE.md` or `PRODUCT.md` already. Pull it forward into the milestone snapshot rather than re-inventing it.
- **Don't promise the user a deck file.** This skill produces the *outline + assets* for a deck. Building the actual `.pptx` / `.key` is downstream work, usually the human's call.
- **Don't squash before the supersedure ADR is committed.** Order matters: ADR → snapshot → squash.
- **Don't generate images before paperwork is committed.** If the snapshot text shifts, the image alt-text and section anchors break.

---

## Reference files

- `references/canonical-doc-templates.md` — full section templates for milestone snapshot, roadmap, share runbook (including the slide-by-slide pattern with time budgets and speaker-note conventions).
- `references/visual-style-brief.md` — the editorial style brief template + sub-agent delegation pattern for image generation.

Read these only when you reach the corresponding phase — don't pre-load them.
