# M2 Close Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn M2.7 into a close-ready milestone package that teammates can understand, demo, and use for the next decision gate.

**Architecture:** No new primitives or runtime capabilities. This is a documentation and demo hardening pass: milestone snapshot, team-share runbook, live browser QA, and verification evidence.

**Tech Stack:** Markdown docs, Bun example server, viewer React demo, in-app browser QA.

---

### Task 1: Close Plan

**Files:**
- Create: `docs/superpowers/plans/2026-04-30-m2-close-package.md`

- [x] **Step 1: Save this plan**

Create this file with the close package scope:

```text
M2 close package = milestone snapshot + team-share runbook + live demo QA + verification.
No new primitive work.
```

- [x] **Step 2: Check worktree**

Run:

```bash
git status --short --branch
```

Expected: current feature branch and no unrelated dirty work.

### Task 2: Milestone Snapshot Close

**Files:**
- Modify: `docs/architecture/milestone-2-snapshot.md`
- Modify: `docs/architecture/roadmap.md`

- [x] **Step 1: Make the snapshot close-ready**

Update status language from draft to close candidate / closed-for-team-share. Make the top summary explicitly say M2.7 is the current close point.

- [x] **Step 2: Tighten the decision gate**

Ensure the next decision gate separates:

```text
M2 close: governance chain is explainable and demoable.
M3 candidates: Permission Center productization, protocol hardening, transaction/concurrency, IAM/threat model.
```

- [x] **Step 3: Keep non-claims honest**

Verify the snapshot still states that production IAM, multi-approver approval, retention, admin workflows, distributed locks, ACID transactions, hot reload, and threat modeling are not claimed.

### Task 3: Team-Share Runbook Refresh

**Files:**
- Modify: `docs/architecture/team-share-demo.md`

- [x] **Step 1: Shift the package from M1 to M2**

Update the title, status, outcome, one-sentence framing, slide scaffold, and next milestone candidates so the document reflects M2 enterprise governance evidence rather than only M1 governed app evolution.

- [x] **Step 2: Add Permission Center talk track**

Add a short section explaining the right-side governance surface:

```text
Permission Center is the product-facing read model over the ledger.
It shows who proposed, who approved, what token authorized execution, who executed, and what happened.
It is v0 inspection, not production admin workflow.
```

- [x] **Step 3: Preserve the demo mechanics**

Keep the existing Operation -> View -> Policy -> Rollback walkthrough, because it remains the core live demo.

### Task 4: Live Browser QA

**Files:**
- Modify only if QA reveals issues:
  - `examples/p5-viewer-approval-e2e/src/main.tsx`
  - `docs/architecture/team-share-demo.md`

- [x] **Step 1: Build and start the demo**

Run:

```bash
bun run --cwd examples/p5-viewer-approval-e2e build
PORT=0 bun examples/p5-viewer-approval-e2e/server.ts
```

- [x] **Step 2: Open the governance URL**

Open:

```text
http://127.0.0.1:<port>/?scenario=capability-lifecycle&variant=governance
```

- [x] **Step 3: Walk the demo**

Interact through:

```text
Ask agent to propose capability
Allow
Add Review Queue view
Allow
Add reviewer access
Allow
Review rollback impact
Allow
```

Check that Permission Center is visible and understandable during at least one pending and one completed state.

- [x] **Step 4: Fix only comprehension blockers**

If the demo is technically correct but confusing, prefer small copy or layout fixes. Do not add new primitives or flows.

### Task 5: Verification and Commit

**Files:**
- All files touched above.

- [x] **Step 1: Run focused verification**

Run:

```bash
bun test examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts packages/viewer-react/test/PermissionCenter.test.tsx packages/core/test/permission-ledger.test.ts packages/core/test/wire-protocol/permission-ledger-seed.test.ts
bun run --cwd examples/p5-viewer-approval-e2e build
git diff --check
```

- [x] **Step 2: Commit**

Run:

```bash
git add docs/superpowers/plans/2026-04-30-m2-close-package.md docs/architecture/milestone-2-snapshot.md docs/architecture/team-share-demo.md docs/architecture/roadmap.md examples/p5-viewer-approval-e2e/src/main.tsx
git commit -m "docs: close M2 governance package"
```

If no demo source changes are needed, omit `examples/p5-viewer-approval-e2e/src/main.tsx`.
