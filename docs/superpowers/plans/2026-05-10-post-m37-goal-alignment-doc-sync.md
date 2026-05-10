# Post-M37 Goal Alignment Documentation Sync Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the canonical docs into the post-M37 state without adding another large narrative artifact.

**Architecture:** This is a documentation-only closeout. Update the smallest set of durable entry points so they all preserve the same top-level model and the same Build Assurance boundary: Builder + Build Agent business-change control, not generic artifact trust.

**Tech Stack:** Markdown docs, existing repo verification commands.

---

### Task 1: Refresh Product And README Entry Points

**Files:**
- Modify: `README.md`
- Modify: `PRODUCT.md`

- [x] Update `README.md` current status from M34 to M37.
- [x] Add `docs/developer/build-assurance-adoption.md` and `docs/architecture/milestone-37-snapshot.md` to the reading path.
- [x] Update `README.md` current caveat so M37 is assurance adoption readiness, not a compliance backend.
- [x] Rewrite `PRODUCT.md` current target from pre-RC framing to post-M37 RC framing.

### Task 2: Refresh Architecture Anchors

**Files:**
- Modify: `docs/architecture/spec/ai-build-assurance-domain-review.md`
- Modify: `docs/architecture/spec/ai-build-assurance-domain-review.zh-CN.md`
- Modify: `docs/architecture/OPEN-QUESTIONS.md`

- [x] Update the Build Assurance DDD review from "M32 candidate" to "M32-M37 closed lane".
- [x] Preserve the non-drift statement around marketplace/artifact trust.
- [x] Add the remaining open pressure points after M37.
- [x] Update `OPEN-QUESTIONS.md` current canonical state and add the post-M37 assurance open questions.

### Task 3: Fix Developer Guide Polish

**Files:**
- Modify: `docs/developer/build-assurance.md`
- Modify: `docs/developer/build-assurance.zh-CN.md`

- [x] Remove duplicated headings/rows.
- [x] Ensure both guides point to the adoption guide as the downstream path.

### Task 4: Verify And Commit

- [x] Run `bun run typecheck`.
- [x] Run the focused assurance suite.
- [x] Run `git diff --check`.
- [x] Commit documentation sync separately.
