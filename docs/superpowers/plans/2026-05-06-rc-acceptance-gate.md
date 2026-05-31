# RC Acceptance Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decide whether the post-M25 repository is ready to become the first release candidate, with fresh verification evidence and a bilingual RC snapshot.

**Architecture:** This gate does not add framework primitives. It reviews the existing evidence chain from M1-M25, verifies the current repo, records the acceptance decision, and updates the canonical docs/indexes so a new Developer can enter through the four-layer model.

**Tech Stack:** Bun test runner, TypeScript typecheck, Markdown docs, existing M24/M25 examples, current in-app browser at `http://127.0.0.1:8886/`.

---

### Task 1: Acceptance Evidence Review

**Files:**
- Read: `AGENTS.md`
- Read: `docs/architecture/roadmap.md`
- Read: `docs/architecture/OPEN-QUESTIONS.md`
- Read: `docs/archive/milestone-24-snapshot.md`
- Read: `docs/archive/milestone-25-snapshot.md`
- Create: `docs/archive/release-candidate-snapshot.md`
- Create: `docs/archive/release-candidate-snapshot.zh-CN.md`

- [x] **Step 1: Extract acceptance criteria**

Use these exact criteria:

```text
1. The four-layer product model is explicit and not collapsed.
2. Operation + definition-as-data remains the core primitive.
3. Security acceptance blockers from M17 remain closed.
4. Open-ended app boundary is pinned by ADR-0031 and M20.
5. Developer onboarding exists through scaffold-host and doctor-host.
6. Creation Host Authoring Kit contracts exist and are tested.
7. Sharing Governance contracts exist and are tested.
8. Alice/Bob/Charlie/Dave RC pressure is executable.
9. Alice's Developer-first story is runnable and explainable.
10. Remaining gaps are productization lanes, not hidden RC blockers.
```

- [x] **Step 2: Map each criterion to evidence**

Use evidence from:

```text
M1-M3: primitive, governance, deployable substrate
M4-M11: reference app, agent evolution, approval, packaging, integrity, semantic index, rollout
M12-M18: Creation Host workflow and open-ended pressure
M19-M20: RC review and open-ended boundary acceptance
M21-M23: onboarding, authoring kit, sharing governance
M24-M25: realistic RC pressure and Developer-first prototype
```

- [x] **Step 3: Draft RC snapshot**

Write `release-candidate-snapshot.md` and `.zh-CN.md` with:

```text
Status
Date
Decision
Why RC Exists Now
Acceptance Matrix
Verification Evidence
Demo Route
Known Non-Goals
Productization Lanes After RC
Tag Recommendation
```

### Task 2: Hard Verification

**Files:**
- No source edits expected.
- Update verification section in `docs/archive/release-candidate-snapshot.md`.
- Update verification section in `docs/archive/release-candidate-snapshot.zh-CN.md`.

- [x] **Step 1: Run full tests**

```bash
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun test
```

Expected:

```text
0 fail
```

- [x] **Step 2: Run typecheck**

```bash
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun run typecheck
```

Expected:

```text
exit code 0
```

- [x] **Step 3: Run targeted RC examples**

```bash
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun test tests/pressure/creation-host-rc-pressure.test.ts examples/m24-creation-host-rc-pressure-walkthrough/run.test.ts examples/m25-alice-creation-host-prototype/prototype-model.test.ts examples/m25-alice-creation-host-prototype/run.test.ts
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun run examples/m24-creation-host-rc-pressure-walkthrough/run.ts --smoke-exit
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun run examples/m25-alice-creation-host-prototype/run.ts --smoke-exit
```

Expected:

```text
test commands: 0 fail
smoke commands: exit code 0
```

- [x] **Step 4: Run docs whitespace check**

```bash
git diff --check
```

Expected:

```text
exit code 0
```

### Task 3: Browser Acceptance

**Files:**
- Save screenshot if needed: `docs/architecture/assets/rc-acceptance-m25-browser.png`
- Update verification section in both RC snapshot docs.

- [x] **Step 1: Inspect current M25 browser page**

Open or reuse:

```text
http://127.0.0.1:8886/
```

Expected visible state:

```text
M25 Alice Creation Host Prototype
Run full path
RC path ready after execution
```

- [x] **Step 2: Execute full browser path**

Click:

```text
Run full path
```

Expected:

```text
Current stage reaches RC judgment.
RC path ready is visible.
No browser console errors.
```

### Task 4: Canonical Docs Update

**Files:**
- Modify: `docs/architecture/README.md`
- Modify: `docs/architecture/roadmap.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

- [x] **Step 1: Add RC snapshot to architecture README**

Add `release-candidate-snapshot.md` and `.zh-CN.md` to the canonical document table and current-position reading list.

- [x] **Step 2: Mark RC as accepted in roadmap**

Change:

```text
RC        Candidate release decision       ⏳ Recommended next pressure
```

to:

```text
RC        Candidate release decision       ✅ Accepted
```

- [x] **Step 3: Update agent entry docs**

Change status from Post-M25 to RC accepted, and make `release-candidate-snapshot.md` the first architecture read after `AGENTS.md` / `CLAUDE.md`.

### Task 5: Commit And Tag

**Files:**
- Git metadata only after docs and verification pass.

- [ ] **Step 1: Stage docs**

```bash
git add docs/superpowers/plans/2026-05-06-rc-acceptance-gate.md docs/archive/release-candidate-snapshot.md docs/archive/release-candidate-snapshot.zh-CN.md docs/architecture/README.md docs/architecture/roadmap.md AGENTS.md CLAUDE.md docs/architecture/assets/rc-acceptance-m25-browser.png
```

- [ ] **Step 2: Commit**

```bash
git commit -m "docs: record rc acceptance gate"
```

- [ ] **Step 3: Tag**

```bash
git tag pneuma-rc-0.1.0
```

Tag only if verification passed and the snapshot decision is "accepted".
