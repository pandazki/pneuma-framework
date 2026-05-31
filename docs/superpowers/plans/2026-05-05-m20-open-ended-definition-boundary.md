# M20 Open-Ended Definition Boundary Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the pre-RC boundary by explicitly deciding that M18-style open-ended UI/module artifacts are Host-owned artifacts with Host-level approval, not framework-governed definition rows in v0.

**Architecture:** Add one explicit M18 contract object that appears in site definition tests, Host inspection output, profile metadata, and evolution transcript evidence. Document the decision in ADR-0031 and update roadmap/snapshots/onboarding so the RC claim is precise rather than overbroad.

**Tech Stack:** Bun tests, TypeScript example code, Markdown ADR/milestone docs.

---

### Task 1: Executable Boundary Contract

**Files:**
- Modify: `examples/m18-open-ended-personal-focus-site/site-definition.ts`
- Modify: `examples/m18-open-ended-personal-focus-site/site-definition.test.ts`
- Modify: `examples/m18-open-ended-personal-focus-site/preview-runtime.ts`
- Modify: `examples/m18-open-ended-personal-focus-site/host-server.ts`
- Modify: `examples/m18-open-ended-personal-focus-site/run.test.ts`

- [ ] **Step 1: Add failing tests**

Add assertions that M18 exposes:

```text
artifact_kind = host_owned_open_ended_definition
governance_scope = host_approval
framework_definition_rows = false
framework_definition_apply_change_set = false
host_operation = host.apply_open_ended_evolution
artifact_path = site-definition.json
```

Run:

```bash
bun test examples/m18-open-ended-personal-focus-site/site-definition.test.ts \
  examples/m18-open-ended-personal-focus-site/run.test.ts
```

Expected before implementation: fail because the boundary contract is missing.

- [ ] **Step 2: Implement the minimal boundary object**

Export the M18 boundary object from `site-definition.ts`, attach it to Host profile metadata, include it in `inspect` output, and add boundary fields to the evolution transcript.

- [ ] **Step 3: Verify focused tests pass**

Run the same focused M18 tests and expect pass.

### Task 2: ADR-0031

**Files:**
- Create: `docs/architecture/adr/0031-open-ended-definition-artifact-boundary.md`

- [ ] **Step 1: Record the accepted decision**

Decision:

```text
Open-ended UI/module artifacts are Host-owned artifacts with Host-level approval in v0.
They are outside framework definition-as-data v0 and outside definition.apply_change_set.
```

Alternatives:

```text
framework-governed extension lane now
fully agent-edited files
```

### Task 3: Docs Alignment

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `PRODUCT.md`
- Modify: `docs/architecture/README.md`
- Modify: `docs/architecture/roadmap.md`
- Modify: `docs/architecture/OPEN-QUESTIONS.md`
- Modify: `docs/archive/milestone-18-snapshot.md`
- Modify: `docs/archive/milestone-18-snapshot.zh-CN.md`
- Modify: `docs/archive/milestone-19-snapshot.md`
- Modify: `docs/archive/milestone-19-snapshot.zh-CN.md`
- Modify: `docs/architecture/team-share-demo.md`
- Modify: `docs/architecture/team-share-demo.zh-CN.md`

- [ ] **Step 1: Replace "M20 next/blocker" wording**

M20 should become closed boundary work, not an unresolved choice.

- [ ] **Step 2: Add exact boundary phrasing**

Use:

```text
Host-owned open-ended artifacts are allowed in v0 when they expose Host-level approval, transcript, inspection, release, and rollback evidence. Pneuma does not claim framework definition-row governance for arbitrary open-ended UI/module artifacts until a later extension-lane ADR promotes that shape.
```

### Task 4: Verification

- [ ] **Step 1: Focused M18 tests**

```bash
bun test examples/m18-open-ended-personal-focus-site
```

- [ ] **Step 2: M16 regression**

```bash
bun test examples/m16-reference-creation-host/run.test.ts
```

- [ ] **Step 3: Full static verification**

```bash
bun run typecheck
git diff --check
```

- [ ] **Step 4: Architecture markdown links**

Run the local architecture markdown link checker and expect all links to resolve.
