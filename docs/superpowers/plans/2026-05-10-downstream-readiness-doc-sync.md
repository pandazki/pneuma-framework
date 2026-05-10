# Downstream Readiness Documentation Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the repo ready for a new downstream Developer starting from zero context after M37.

**Architecture:** This is a documentation and developer-contract closeout. Keep the four-layer model explicit, keep Build Assurance scoped to Builder + Build Agent business-change control, and add one downstream handoff document instead of another milestone-sized narrative.

**Tech Stack:** Markdown docs, Bun/TypeScript verification commands, existing `@pneuma-framework/core` validators.

---

### Task 1: Create The New Downstream Handoff

**Files:**
- Create: `docs/developer/downstream-validation-brief.md`
- Create: `docs/developer/downstream-validation-brief.zh-CN.md`

- [x] Add a self-contained brief for a fresh downstream project.
- [x] Include mission, required reading order, deliverables, non-goals, recommended validation commands, and a gap-report template.
- [x] Keep implementation choices open; do not prescribe a specific app design beyond the framework-contract goals.

### Task 2: Update Developer Entry Points

**Files:**
- Modify: `README.md`
- Modify: `docs/developer/start-here.md`
- Modify: `docs/developer/start-here.zh-CN.md`
- Modify: `docs/developer/getting-started.md`
- Modify: `docs/developer/getting-started.zh-CN.md`

- [x] Link the downstream brief from the primary reading path.
- [x] Update the contract-test snippet to cover sharing governance, credential rebinding, HostExtension, and Build Assurance review/adoption checks.
- [x] Make clear that a new downstream should read by product layer, not by milestone chronology.

### Task 3: Update Architecture Navigation

**Files:**
- Modify: `docs/architecture/README.md`
- Modify: `docs/architecture/roadmap.md`
- Modify: `docs/architecture/team-share-demo.md`
- Modify: `docs/architecture/team-share-demo.zh-CN.md`
- Modify: `PRODUCT.md`

- [x] Add M35-M37 to the roadmap summary block.
- [x] Bump roadmap last-updated date.
- [x] Point architecture navigation and team-share material at the downstream brief.
- [x] Preserve the post-M37 statement that the next tag should come from concrete downstream pressure.

### Task 4: Verify And Commit

- [x] Run stale-language scans for M34-only / old next-lane phrasing.
- [x] Run project markdown local-link check.
- [x] Run `bun run typecheck`.
- [x] Run focused developer/authoring/assurance tests.
- [x] Run full `bun test`.
- [x] Run `git diff --check`.
- [x] Commit this documentation sync separately.
