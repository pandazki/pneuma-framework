# M26 Code Change Lane Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Harden the rc-0.1.3 Code Change Lane based on DevBoard Studio's external validation feedback without expanding into HostExtension/distribution semantics.

**Architecture:** Keep the existing `ScaffoldProjectManifest`, `prepareCodeChangeProposal`, and `applyCodeChangeProposal` APIs as the core surface, then add small compatible affordances: readable unified diffs, cleaner rejection/receipt semantics, safer BuildThread append control, and better scaffold diagnostics. This remains a stabilization milestone, not a release packaging milestone.

**Tech Stack:** Bun test runner, TypeScript, existing `packages/core` contracts, file-backed BuildThread tests, markdown docs.

---

## File Structure

- Modify `packages/core/src/code-change-lane.ts`: unified diff rendering, `rejected` receipt status, reject convenience, proposal append options.
- Modify `packages/core/test/code-change-lane.test.ts`: TDD coverage for M26 code-change lane behavior.
- Modify `packages/core/src/host-authoring.ts`: scaffold diagnostics, protected-path overlap relaxation, `.env` share exclude behavior.
- Modify `packages/core/test/host-authoring.test.ts`: TDD coverage for manifest validation changes.
- Modify `packages/core/src/index.ts`: export any new public types/functions.
- Create/update `docs/architecture/milestone-26-snapshot.md`: M26 snapshot and evidence.
- Modify `docs/developer/code-change-lane.md` and `.zh-CN.md`: new API notes and downstream guidance.
- Modify `docs/developer/scaffold-project-contract.md` and `.zh-CN.md`: validator semantics and examples.
- Modify `docs/architecture/roadmap.md`, `docs/architecture/README.md`, `AGENTS.md`, `CLAUDE.md`: status/read-order updates after implementation.

## Task 1: Unified Diff Evidence

**Files:**
- Modify: `packages/core/test/code-change-lane.test.ts`
- Modify: `packages/core/src/code-change-lane.ts`

- [x] **Step 1: Write failing test**

Add a test showing an existing-file one-line edit keeps unchanged context lines instead of rendering the entire file as all deleted/all added.

- [x] **Step 2: Verify red**

Run: `bun test packages/core/test/code-change-lane.test.ts`

Expected: FAIL because the current diff contains the full before/after wall.

- [x] **Step 3: Implement minimal unified diff renderer**

Replace the current whole-file renderer with a small line-based LCS renderer that emits unified hunks. Keep output as a string so downstream wire shape does not change.

- [x] **Step 4: Verify green**

Run: `bun test packages/core/test/code-change-lane.test.ts`

Expected: PASS.

## Task 2: Rejection Semantics and Convenience API

**Files:**
- Modify: `packages/core/test/code-change-lane.test.ts`
- Modify: `packages/core/src/code-change-lane.ts`
- Modify: `packages/core/src/index.ts`

- [x] **Step 1: Write failing tests**

Cover two behaviors: `applyCodeChangeProposal(... decision: "rejected")` returns status `rejected`, and `rejectCodeChangeProposal({ proposal, reason, thread_store, thread_id })` records the same user decision + receipt without source mutation.

- [x] **Step 2: Verify red**

Run: `bun test packages/core/test/code-change-lane.test.ts`

Expected: FAIL because status is currently `failed_framework` and the convenience API is missing.

- [x] **Step 3: Implement minimal API**

Add `rejected` to the receipt status union and implement `rejectCodeChangeProposal` as a thin wrapper around the existing rejection path.

- [x] **Step 4: Verify green**

Run: `bun test packages/core/test/code-change-lane.test.ts`

Expected: PASS.

## Task 3: BuildThread Proposal Append Control

**Files:**
- Modify: `packages/core/test/code-change-lane.test.ts`
- Modify: `packages/core/src/code-change-lane.ts`

- [x] **Step 1: Write failing test**

Prepare a proposal with `record_agent_proposal_turn: false` and assert the thread does not receive a synthesized `agent_proposal` turn while the prepared envelope is still returned.

- [x] **Step 2: Verify red**

Run: `bun test packages/core/test/code-change-lane.test.ts`

Expected: FAIL because no opt-out exists.

- [x] **Step 3: Implement option**

Add an optional boolean defaulting to true, preserving backward compatibility.

- [x] **Step 4: Verify green**

Run: `bun test packages/core/test/code-change-lane.test.ts`

Expected: PASS.

## Task 4: Scaffold Manifest Validator Polish

**Files:**
- Modify: `packages/core/test/host-authoring.test.ts`
- Modify: `packages/core/src/host-authoring.ts`

- [x] **Step 1: Write failing tests**

Cover three DevBoard findings: file-level `protected_paths` under a `writable_root` are accepted, `share_exclude` missing `.env` is normalized instead of hard-failed, and invalid framework check diagnostics list valid values.

- [x] **Step 2: Verify red**

Run: `bun test packages/core/test/host-authoring.test.ts`

Expected: FAIL on current strict validation/diagnostic behavior.

- [x] **Step 3: Implement minimal validator changes**

Relax only file-level protected paths under writable roots, auto-normalize `.env` into share excludes during validation/normalization, and include valid framework check names in the issue message or metadata.

- [x] **Step 4: Verify green**

Run: `bun test packages/core/test/host-authoring.test.ts`

Expected: PASS.

## Task 5: Documentation and Snapshot

**Files:**
- Create: `docs/architecture/milestone-26-snapshot.md`
- Modify: `docs/developer/code-change-lane.md`
- Modify: `docs/developer/code-change-lane.zh-CN.md`
- Modify: `docs/developer/scaffold-project-contract.md`
- Modify: `docs/developer/scaffold-project-contract.zh-CN.md`
- Modify: `docs/architecture/roadmap.md`
- Modify: `docs/architecture/README.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

- [x] **Step 1: Update docs**

Document M26 as stabilization work, not `0.1.4` release packaging. Include migration notes for downstream but do not instruct them to upgrade yet.

- [x] **Step 2: Verify markdown links**

Run a local relative-link check for touched docs.

Expected: no broken relative links.

## Task 6: Final Verification

- [x] **Step 1: Run targeted tests**

Run: `bun test packages/core/test/code-change-lane.test.ts packages/core/test/host-authoring.test.ts`

Expected: PASS.

- [x] **Step 2: Run typecheck**

Run: `bun run typecheck`

Expected: PASS.

- [x] **Step 3: Run full suite**

Run: `bun test`

Expected: PASS, or if an integration test has a known one-off timeout, rerun and document exact evidence.

- [x] **Step 4: Commit**

Commit message: `feat(core): harden code change lane`

---

## Self-Review

- Spec coverage: covers #38, #40, rejection semantics, duplicate proposal-turn opt-out, validator diagnostics, and docs. Does not include Runtime Diagnostic Surface, HostExtension, or AgentBackend.runTurn; those are M27-M29.
- Placeholder scan: no TODO/TBD placeholders.
- Type consistency: keep existing snake_case option style in public API to match rc-0.1.3; document it rather than changing to camelCase.
