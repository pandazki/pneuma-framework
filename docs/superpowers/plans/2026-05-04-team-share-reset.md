# Team Share Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a current team-share package that explains Pneuma from top-level goal to architecture, current implementation evidence, demo flow, and pre-RC boundary.

**Architecture:** Replace the old M2-specific share package with a canonical M19/pre-RC share narrative, backed by project-local generated bitmap diagrams. Maintain English and Chinese documents with matching structure and asset references.

**Tech Stack:** Markdown docs, generated PNG visual assets, existing architecture docs, existing milestone snapshots.

---

### Task 1: Document Skeleton

**Files:**
- Modify: `docs/architecture/team-share-demo.md`
- Create: `docs/architecture/team-share-demo.zh-CN.md`

- [ ] **Step 1: Replace the M2-specific structure with a top-down narrative**

Use this section order:

```markdown
# Pneuma Team Share Package
## Outcome
## 1. Why This Exists
## 2. The Four-Artifact Model
## 3. The Governed Creation Loop
## 4. The Primitive Control Plane
## 5. Evidence From M1-M19
## 6. Demo Path
## 7. Current RC Boundary
## 8. Suggested Share Run
## Appendix: Useful Links
```

- [ ] **Step 2: Create a Chinese document with the same structure**

Use the same section order and the same factual claims, translated for Chinese-speaking teammates.

### Task 2: Visual Assets

**Files:**
- Create: `docs/architecture/assets/team-share/*.png`

- [ ] **Step 1: Generate English visual assets**

Create project-bound bitmap diagrams for:

```text
team-share-north-star.png
team-share-four-artifacts.png
team-share-governed-loop.png
team-share-primitive-control-plane.png
team-share-evidence-ladder.png
team-share-demo-storyboard.png
team-share-rc-boundary.png
```

- [ ] **Step 2: Generate Chinese visual assets**

Create matching Chinese versions with `.zh-CN.png` suffix for diagrams with text.

### Task 3: Index Updates

**Files:**
- Modify: `docs/architecture/README.md`
- Modify: `docs/architecture/OPEN-QUESTIONS.md` only if it references the old M2-only share package.

- [ ] **Step 1: Point architecture onboarding to the refreshed team-share package**

Make the docs index describe `team-share-demo.md` as the current zero-prep team-share package, not an M2 runbook.

- [ ] **Step 2: Remove stale M2-only wording**

Keep old milestone-specific details inside milestone snapshots; the team-share package should be current and durable.

### Task 4: Verification

- [ ] **Step 1: Run markdown link checks**

Run:

```bash
bun run typecheck
```

Expected: exit 0.

- [ ] **Step 2: Check changed markdown references**

Run:

```bash
rg -n "team-share-demo|team-share-demo.zh-CN|assets/team-share" docs/architecture README.md PRODUCT.md
```

Expected: new English and Chinese documents are discoverable, old M2-only references are not canonical.

- [ ] **Step 3: Check git diff**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; only intended doc/assets changes plus the pre-existing untracked `tmp-m18-browser-e2e.png`.
