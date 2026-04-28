# Canonical Doc Templates

Section-by-section templates for the four canonical paperwork artefacts. Use as scaffolding; replace `<placeholder>` text with milestone-specific content.

---

## Template 1 — Milestone Snapshot

Filename: `docs/architecture/milestone-N-snapshot.md` (or equivalent under your project's design-doc tree).

Use the section ordering exactly as listed below. Each section's role is annotated. Sections marked **REQUIRED** never get skipped; sections marked **CONDITIONAL** are skipped when they genuinely don't apply.

### Header block (REQUIRED)

```markdown
# Milestone N Snapshot: <Theme>

**Date:** YYYY-MM-DD
**Status:** Milestone snapshot for team alignment
**Audience:** teammates with zero <Project> context
**Scope:** what the current milestone proves, what it does not prove yet, and what should become the next phase.

中文摘要：

> <one paragraph for the bilingual reader if this project is bilingual>
```

If the project is single-language, drop the 中文 block.

### Executive Summary (REQUIRED)

5–7 sentences for the zero-context reader stating what this milestone proved, followed by a Before/After contrast table. Example shape:

```markdown
## Executive Summary

<Project>'s current milestone proves <one-sentence claim about the construction loop or capability>:

```text
<6-9 line ASCII flow showing the loop>
```

The key shift is this:

| Before this milestone | After this milestone |
|---|---|
| <prior state row 1> | <new state row 1> |
| <prior state row 2> | <new state row 2> |
| <prior state row 3> | <new state row 3> |
| <prior state row 4> | <new state row 4> |
```

### Milestone Thesis (REQUIRED)

One bold sentence stating what was proven, plus 2–3 follow-up bullets distinguishing it from adjacent things.

```markdown
## Milestone Thesis

> <one bold thesis sentence — italicised in the doc>

This is the architectural line that matters for the project:

- **Not <adjacent claim 1>:** <why it's not this>
- **Not <adjacent claim 2>:** <why it's not this either>
- **Yes <actual claim>:** <one sentence of substance>
```

### Where <Project> Sits (REQUIRED)

Vision + differentiation. Pulled from `CLAUDE.md` / `PRODUCT.md` / founding ADR — don't reinvent.

```markdown
## Where <Project> Sits

<Project> is **<one-sentence positioning>** — <expand into 2 sentences>.

| | <Neighbour 1> | <Neighbour 2> | <Neighbour 3> | **<Project>** |
|---|---|---|---|---|
| <axis 1> | <neighbour 1 answer> | <n2> | <n3> | **<project answer>** |
| <axis 2> | ... | ... | ... | ... |
| <axis 3> | ... | ... | ... | ... |
| <axis 4> | ... | ... | ... | ... |

Three differentiators that no other framework offers together:

1. **<differentiator 1>** — <one sentence>. ([ADR-XXXX](./adr/XXXX-...md))
2. **<differentiator 2>** — <one sentence>. ([ADR-XXXX](./adr/XXXX-...md))
3. **<differentiator 3>** — <one sentence>. ([ADR-XXXX](./adr/XXXX-...md))
```

### System At A Glance (REQUIRED)

The architectural insight visualised. Use a hero illustration generated in Phase 4. One paragraph before, one after — the before names the insight, the after reads back what the illustration shows.

```markdown
## System At A Glance

The architectural insight of this milestone: **<one-sentence insight, often a "X and Y go through the same Z" claim>.**

![<descriptive alt text including all the labels in the image>](./spec/images/m1-system-architecture.png)

The <accent-coloured element in the image> is what this milestone added: <one paragraph reading back what the diagram shows, naming the reused infrastructure>.
```

### What Is Proven (REQUIRED)

Two-column table: capability | current proof.

```markdown
## What Is Proven

| Capability | Current proof |
|---|---|
| <capability 1> | <code path / artefact name showing it works> |
| <capability 2> | <...> |
| <capability 3> | <...> |
```

7–10 rows is typical.

### Current Primitive Surface (CONDITIONAL — for primitive-introducing milestones)

5–7 line ASCII tree of the primitive layers this milestone covers, plus one paragraph explaining how the layers compose.

### Working Definition Surface (CONDITIONAL — for milestones that add data)

Table of system-owned tables / structures introduced. Any normalised contract gets a TS code block.

### Supported Operations / Mutations (CONDITIONAL — for milestones that add operations)

Per supported operation shape: small TS code block + 5-line acceptance proof.

```markdown
### `<operation_name>`

```ts
{
  <ts shape>
}
```

Acceptance proof:

```text
before:  <state before the operation>
apply:   <what the operation writes>
restart: <if rediscovery is needed>
after:   <state after the operation>
```
```

### End-To-End Loop (REQUIRED)

Hero illustration showing the loop, plus a "demo moment → framework concept" mapping table.

```markdown
## End-To-End Loop

![<alt text>](./spec/images/m1-governance-loop.png)

What changed is not hidden in the demo UI. Each step maps to an actual framework concept:

| Demo moment | Framework concept |
|---|---|
| <moment 1> | <concept 1> |
| ... | ... |
```

### Demo Story (REQUIRED)

5 numbered steps, one sentence each, that match the live demo. Pointer to the share runbook for the click-by-click talk track.

```markdown
## Demo Story

The recommended milestone demo is:

```text
<path to demo + run instructions>
```

Story:

1. **Baseline:** <starting state>
2. **<Action 1>:** <what the Builder/user does and what changes>
3. **<Action 2>:** <...>
4. **<Action 3>:** <...>
5. **Rollback:** <reversibility shown>

For the full presenter runbook (opening narrative, screen map, talk track, FAQ), see [`team-share-demo.md`](./team-share-demo.md).
```

### Rollback / Reversibility Path (CONDITIONAL — for milestones with destructive operations)

ASCII 3-stage flow plus an impact table.

```markdown
## Rollback Path

```text
<operation>.rollback.validate
  -> <step>
  -> <step>

<operation>.rollback.prepare
  -> <step>
  -> <step>

<operation>.rollback.execute
  -> <step>
  -> <step>
```

| Rollback impact | Status |
|---|---|
| <impact 1> | Supported, <how> |
| <impact 2> | Not supported yet |
```

### Why These Design Choices (REQUIRED)

The 3 load-bearing design decisions, each with Why and Cost.

```markdown
## Why These Design Choices

Three design decisions are doing most of the load-bearing work in this milestone. If a reviewer is going to push back, they will push back on one of these three.

### 1. <Decision 1>

<Plain statement of the decision>

**Why:** <reason it was chosen, ADR refs>

**Cost:** <what this trades off>

### 2. <Decision 2>

<...>

### 3. <Decision 3>

<...>
```

### M<N> Verification Matrix (REQUIRED)

Capability dimension × variant grid. Use ✅ / ❌ / — legend (— means "not applicable", not "not yet").

```markdown
## M<N> Verification Matrix

Each <thing> is verified end-to-end. Tests live in <path summary>.

| Capability dimension | <variant 1> | <variant 2> | <variant 3> | <variant 4> | <variant 5> |
|---|:-:|:-:|:-:|:-:|:-:|
| <dim 1> | ✅ | ✅ | ✅ | ✅ | ✅ |
| <dim 2> | ✅ | ✅ | ✅ | ✅ | ✅ |
| <dim 3> | ✅ | ✅ | ✅ | ✅ | ✅ |
| <dim — partial> | — | — | — | ✅ | ✅ |
| <dim — not yet> | ❌ | ❌ | ❌ | ❌ | ❌ |

Legend: ✅ supported · ❌ not yet · — not applicable.

Targeted suite (run as smoke before team share):

```text
<one test path per line>
```

Full repo state (YYYY-MM-DD):

```text
<typecheck, test, build, status results>
```
```

### Project Progress By Layer (REQUIRED)

Two views — qualitative (how it feels) and structural (which ADRs are landed). Both in this section.

```markdown
## Project Progress By Layer

### Qualitative

| Layer | Current state | Implication |
|---|---|---|
| <layer 1> | <one-line state> | <one-line implication> |
| ... | ... | ... |

### ADR coverage (by §)

![<alt text>](./spec/images/m1-adr-coverage-radar.png)

<N> ADRs sit in <M> sections. Coverage = ADR exists + matching code path + at least one scenario / test that exercises it. "Partial" means decision recorded and code path landed but enterprise-level surface is still demo-grade.

| § | Topic | ADRs | Status | Notes |
|---|---|---|---|---|
| §1 | <topic> | NNNN | ✅ Full | <one line> |
| §2 | <topic> | NNNN-NNNN | 🟡 Partial | <what's still pending> |
| ... | ... | ... | ... | ... |

Visual roll-up:

```text
§1   <topic>             ▰▰▰▰▰▰▰▰▰▰  Full
§2   <topic>             ▰▰▰▰▰▰▰▱▱▱  Partial (<gap>)
§3   <topic>             ▰▰▰▰▰▰▱▱▱▱  Partial
...
```
```

### What This Does Not Prove Yet (REQUIRED — never skip)

The honesty section. Two-column table.

```markdown
## What This Does Not Prove Yet

This boundary is important. The milestone is real, but it is not yet a production <category> platform.

| Not yet proven | Why it matters |
|---|---|
| <gap 1> | <why this matters> |
| <gap 2> | <why this matters> |
| ... | ... |
```

### Strategic Read (REQUIRED)

3 paragraphs answering "what should the team be most worried about now?". This section is your editorial voice — write it, don't templated-fill it.

### Recommended Next Phase (REQUIRED)

One-sentence next-milestone theme + candidate workstreams table.

```markdown
## Recommended Next Phase

Recommended next phase:

> **Milestone <N+1>: <Theme>**

Suggested workstreams (full list in [`roadmap.md`](./roadmap.md) §"Stage <K>"):

| Workstream | Goal |
|---|---|
| <name 1> | <one-line goal> |
| <name 2> | <one-line goal> |
| ... | ... |
```

### Team Decision Gate (REQUIRED)

4 yes/no questions for the share meeting + a phase-boundary framing block.

```markdown
## Team Decision Gate

For the team share, I would end with these decisions:

1. <question 1 — alignment check>
2. <question 2 — direction check>
3. <question 3 — scope check>
4. <question 4 — risk-priority check>

If the team agrees, the project has a clean phase boundary:

```text
Milestone <N>:
  "<question this milestone answered>"
  Answer: yes, for the supported slice.

Milestone <N+1>:
  "<question the next milestone needs to answer>"
  Answer: next work.
```
```

### Evidence (REQUIRED)

```markdown
## Evidence

Recent commits leading into this snapshot:

```text
<5-9 oneline commits>
```

Recorded verification from the milestone:

```text
<verification commands>
```

Latest recorded full test state:

```text
<N pass / 0 fail / <expect_count> expect() calls>
```
```

### Reading Path (REQUIRED)

```markdown
## Reading Path

For a teammate with no context:

1. Read this snapshot first.
2. Read [`team-share-demo.md`](./team-share-demo.md) before the live share.
3. Read [`OPEN-QUESTIONS.md`](./OPEN-QUESTIONS.md) only after agreeing on the milestone boundary.
4. Read [`roadmap.md`](./roadmap.md) for the post-M<N> phasing.

For deeper architecture, follow [`README.md`](./README.md) into the ADR set.
```

### Appendix — Historical Slice Ledger (CONDITIONAL — when work was done as numbered slices)

Brief ledger only. Do not accumulate per-slice reports — the ledger replaces them.

```markdown
## Appendix — Historical Slice Ledger (P<X>–P<Y>)

| Slice | Durable result |
|---|---|
| P1  | <one-line result> |
| P2  | <one-line result> |
| ... | ... |
```

---

## Template 2 — Roadmap

Filename: `docs/architecture/roadmap.md`.

```markdown
# Roadmap

**Last updated:** YYYY-MM-DD
**Status:** 项目当前唯一 roadmap，单一 source of truth
**Supersedes:** <prior roadmap doc, if applicable, with link to supersedure ADR>

> 本文档**不**累积历史进度报告。已完成阶段只留一句话总结 + 关键 ADR 链接。
> 已闭合阶段的细节进 milestone snapshot；未闭合阶段的开放问题进 OPEN-QUESTIONS。

---

## 阶段总览

![<alt text>](./spec/images/m1-roadmap-river.png)

```text
Stage 0   <topic>                ✅  CLOSED
Stage 1   <topic>                ✅  CLOSED
Stage 2   <topic>                ✅  CLOSED
Stage 3   <topic>                ✅  CLOSED
Stage 4   <topic>                ✅  M<N> — current snapshot
Stage 5   <topic>                🔜  M<N+1> candidate
Stage 6   <topic>                ⏳
Stage 7   <topic>                ⏳
Stage 8   <topic>                ⏳
```

> 上图是 share-deck 主视觉；text-only 阅读器看下面的 ASCII 块。

---

## Stage details

### Stage 0 — <topic> ✅

<one-line summary>

- <bullet>
- 关键 ADR：[NNNN](./adr/NNNN-...md), [NNNN](./adr/NNNN-...md)

### Stage 1 — <topic> ✅

(...)

### Stage <N> — <topic> ✅ (M<N> — current)

**已闭合**——细节见 [`milestone-N-snapshot.md`](./milestone-N-snapshot.md)。

简介：<one paragraph>

**未闭合的 Stage <N> 边界**（带入下一 stage 而不是阻塞 M<N> 闭合）：

- <gap 1>
- <gap 2>
- ...

### Stage <N+1> — <topic> 🔜 (M<N+1> candidate)

**主题：<theme>。**

候选 workstream（见 [OPEN-QUESTIONS.md](./OPEN-QUESTIONS.md) "<section>"）：

| Workstream | 目标 |
|---|---|
| <name> | <goal> |
| ... | ... |

**进入 M<N+1> 之前要先决定<最危险的 gap 是哪一条>**——团队决策门见 milestone-N-snapshot §"Team Decision Gate"。

### Stage <N+2> — <topic> ⏳

- <bullet>
- <bullet>

(...continue for future stages, less detail per stage as you go further out)

---

## 约束与原则

**<Constraint 1>。** <one paragraph>

**<Constraint 2>。** <one paragraph>

**<Constraint 3>。** <one paragraph>
```

Notes on the roadmap:

- Never invent dates. ✅ / 🔜 / ⏳ tells the reader the right amount about timing.
- Each closed stage is one paragraph max — detail belongs in the snapshot of that stage.
- Each future stage gets less detail the further out it is.
- The Constraints & Principles section is where you state the architectural rules that span stages (e.g., "no new primitives in M<N+1>" — that's a real constraint, write it down).

---

## Template 3 — Share Runbook

Filename: `docs/architecture/team-share-demo.md`.

The runbook has two halves: **Live Script** (click-by-click during the demo) and **Slide-By-Slide** (the surrounding deck structure). Both reference the same milestone snapshot.

### Header + framing block

```markdown
# Team Share Package

**Date:** YYYY-MM-DD
**Status:** Current 0-prep team-share package
**Audience:** teammates who know normal software but do not know <Project> internals.
**Format:** 30-minute live share with one local browser demo.

This is the recommended share package for the <topic> milestone. It is intentionally self-contained: a teammate should be able to understand why the milestone matters without reading ADRs first.

## Outcome

After the share, the team should be able to say:

```text
<one-sentence elevator pitch the team should be able to repeat>
```

They should also understand what is not done yet: <list of 4-5 limitations>.
```

### One-Sentence Framing

```markdown
## One-Sentence Framing

> <The pitch in English>

中文讲法：

> <The pitch in Chinese, if applicable>
```

### Opening Narrative

The 1–2 minutes before touching the browser. Memorise this section verbatim — it's the most under-rehearsed slot in any technical share.

### Share Run Of Show (the time table)

```markdown
## Share Run Of Show

| Time | Section | Goal |
|---:|---|---|
| 0-3 min | Frame the problem | <goal> |
| 3-7 min | Introduce the demo app | <goal> |
| 7-20 min | Live demo | <goal> |
| 20-25 min | Architecture readback | <goal> |
| 25-30 min | Boundaries + next work | <goal> |
```

### Demo URL + Presenter Checklist

Run instructions, browser setup, rehearsal check.

### Story Before The Demo

The narrative scaffolding — what the demo app *is*, what user problem it represents.

### Live Script (sections 1–N, click-by-click)

Per section: what to click, what to point at, key lines to say verbatim, common misunderstandings to prevent.

```markdown
### N. <Section name>

Click:

```text
<button name>
```

Pause on the approval card / state.

```text
<what the screen shows>
```

Key line:

> <one line for the presenter to say>

What to point at:

- <thing 1>
- <thing 2>
```

### Architecture Readback

A single ASCII diagram + a primitive-to-role mapping table.

### What This Proves / Does Not Prove Yet

Repeated from the snapshot but in talk-track tone.

### Suggested 30-Minute Share — Slide-By-Slide

This is the deck scaffold. Use this exact structure:

```markdown
## Suggested 30-Minute Share — Slide-By-Slide

The runbook above is the live-demo script (click-by-click). This section is the deck **scaffold** — what slides surround the demo, what the presenter says, and how long each slide takes.

| # | Slide | Speaker note (one breath) | Time |
|---:|---|---|---:|
| 1 | **Title** — *<title>* | "<one-line opening>" | 0:30 |
| 2 | **The question** | "<one-line problem statement>" | 0:30 |
| 3 | **<Project> in one sentence** | "<the elevator pitch>" | 1:00 |
| 4 | **<Vision frame>** (e.g., role table or population diagram) | "<one-line>" | 1:00 |
| 5 | **Differentiation grid** | "<one-line — why we're not Retool/Notion/Rails>" | 2:00 |
| 6 | **The conceptual shift** | "<the load-bearing distinction the audience must grasp>" | 2:00 |
| — | **Pause for questions on the framing.** Skip if no hands. | — | 0:30 |
| 7 | **End-to-end loop** (hero illustration) | "<one-line readback of the loop>" | 1:30 |
| 8 | **Meet the demo app** | "<one-line introduction to the demo>" | 1:00 |
| 9-13 | **Live demo** — follow the Live Script section above | (talk track is in §"Live Script") | 13:00 |
| 14 | **Architecture readback** (hero illustration) | "<one-line readback>" | 2:00 |
| 15 | **Verification matrix** (table screenshot) | "<one-line on coverage>" | 1:30 |
| 16 | **Boundary slide** — "What this does NOT prove yet" | "<one-line on honesty>" | 1:30 |
| 17 | **Why <next milestone> is X, not Y** | "<one-line on why next milestone is governance/scaling/etc>" | 1:00 |
| 18 | **Decision gate** — 4 questions | Read the four questions verbatim. Do not editorialise. Wait. | 1:00 |
| Appendix A | **ADR map** | "<one-line>" | — |
| Appendix B | **Reading paths** | "<one-line>" | — |
| Appendix C | **Stack & tests** | <for skeptics> | — |

Total: 30 minutes; 60 minutes more for Q&A which the appendices are pre-loaded for.

### Tips for the presenter

- **Slides 1–6 are the most under-rehearsed slot in any technical share.** If you wing the framing, the demo lands flat. Memorise slides 3 and 6 verbatim; everything else can be paraphrased.
- **The replay slide (mid-demo) is the natural confidence checkpoint.** If it works on Replay, the demo is done; do not improvise an extra round.
- **Slide 18 (Decision gate) — do not answer the four questions for the audience.** The whole point is alignment by getting them on record. If someone says "I'd say yes to all four," ask the next person.
- **If asked "what does this NOT do that the agent could just do directly?"** — the answer is in slide 6 + slide 14. Do not re-litigate. Point to the slides.
- **If asked about <common gap>** — point to slide 16. <gap> is M<N+1>/M<N+2>, not M<N>.
- **If asked about <another common gap>** — point at roadmap.md Stage <K>.

### Reference deck assets

Hero illustrations live in [`spec/images/`](./spec/images/). They are designed as a coherent set so they can drop into any deck template without re-styling. Mapping:

| Slide | Image | Rationale |
|---|---|---|
| 7 (End-to-end loop) | [`spec/images/m1-governance-loop.png`](./spec/images/m1-governance-loop.png) | <rationale> |
| 14 (Architecture readback) | [`spec/images/m1-system-architecture.png`](./spec/images/m1-system-architecture.png) | <rationale> |
| 15 (Verification matrix) | rendered from snapshot §"M1 Verification Matrix" | Markdown table — screenshot directly. |
| 17 (Roadmap) | [`spec/images/m1-roadmap-river.png`](./spec/images/m1-roadmap-river.png) | <rationale> |
| Appendix A (ADR map) | [`spec/images/m1-adr-coverage-radar.png`](./spec/images/m1-adr-coverage-radar.png) | <rationale> |

To produce the deck end-to-end:

1. Read this section + the Live Script + [`milestone-N-snapshot.md`](./milestone-N-snapshot.md) once for tone.
2. Drop the hero illustrations into the deck template at the slides above.
3. Screenshot the verification matrix and ADR coverage tables for slides 15 and Appendix A supplemental.
4. Rehearse slides 1–6 (the framing) and slide 18 (the decision gate) until they are muscle memory; everything else can be paraphrased.
```

---

## Template 4 — State Label Index

Filename: `<area>/README.md` (one per code area: `templates/`, `examples/`, optionally `packages/`).

```markdown
# <Area> — Status Index

**Last updated:** YYYY-MM-DD
**Purpose:** label each <unit>'s lifecycle state so new contributors do not mistake a dormant <unit> for a canonical reference path.

Status convention:

- **canonical** — currently load-bearing in the milestone story, actively tested as milestone evidence.
- **reference** — validates a specific ADR / primitive face but not in the milestone demo; kept as teaching / regression.
- **archived** — historical, preserved but not actively maintained; superseded by a newer <unit>.
- **scratch** — experimental / spike, not for general use.

| <Unit> | Status | Role | Last touched |
|---|---|---|---|
| [`<name>`](./<name>/) | **canonical** | <role> | <relative time> |
| [`<name>`](./<name>/) | **reference** | <role + ADR ref or smoke-suite link> | <relative time> |
| [`<name>`](./<name>/) | **archived** | <what superseded it> | <relative time> |

## Notes

- **canonical / reference** <units> are workspace members and run under `<typecheck command>`.
- **archived** <units> are kept in-tree to preserve git context and to keep older examples runnable, but new work should not target them.
- See <pointer to roadmap section about future <units>>.
```

---

## OPEN-QUESTIONS update

After milestone closure, prune `OPEN-QUESTIONS.md` aggressively. Remove anything settled by the milestone or absorbed into the snapshot. The file should only contain genuinely-unresolved questions going forward.

```markdown
# Open Questions

**Last updated:** YYYY-MM-DD
**Purpose:** only track unsettled questions. Closed history belongs in ADRs or milestone docs.

Current canonical state:

- [milestone-N-snapshot.md](./milestone-N-snapshot.md) — current milestone (<topic>); contains "What Is Proven", verification matrix, and slice ledger.
- [roadmap.md](./roadmap.md) — Stage 0–<K> phasing.
- [team-share-demo.md](./team-share-demo.md) — team-share runbook.
- ADRs remain the source of durable architectural decisions.

> M<N> closed scope is documented in [milestone-N-snapshot.md](./milestone-N-snapshot.md). This file only tracks **unresolved** questions going forward.

## <Topic 1 — open question cluster>

(unresolved questions, no closed-list / demo-flow blocks here)

## <Topic 2 — open question cluster>

(...)

## Later ADR Candidates

| Candidate | Trigger |
|---|---|
| <ADR title> | <when this needs to become an ADR> |
```
