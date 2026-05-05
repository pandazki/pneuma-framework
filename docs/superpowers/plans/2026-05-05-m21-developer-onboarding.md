# M21 Developer Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the developer onboarding layer: scaffold command, Creation Host contract test-kit, diagnostics/doctor command, and developer-facing guides.

**Architecture:** Keep developer experience as a thin layer over existing framework contracts. `packages/core` owns reusable validation/diagnostic data structures; `packages/cli` owns terminal commands; docs explain the path without adding runtime semantics.

**Tech Stack:** Bun, TypeScript, existing `@pneuma-framework/core` and `@pneuma-framework/cli` workspaces.

---

### Task 1: Core Developer Experience Contract

**Files:**
- Create: `packages/core/src/developer-experience.ts`
- Test: `packages/core/test/developer-experience.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests**

Add tests for profile contract validation and workspace diagnostics:

```ts
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertCreationHostProfileContract,
  createCreationHostStore,
  diagnoseCreationHostWorkspace,
  validateCreationHostProfileContract,
  type CreationHostProfile,
} from "../src/index.js";
```

- [ ] **Step 2: Verify red**

Run:

```bash
bun test packages/core/test/developer-experience.test.ts
```

Expected: fails because the developer-experience exports do not exist.

- [ ] **Step 3: Implement core helpers**

Create validation helpers returning structured issues and diagnostics:

```ts
export interface CreationHostContractIssue {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}
```

- [ ] **Step 4: Export helpers**

Export the helpers and types from `packages/core/src/index.ts`.

- [ ] **Step 5: Verify green**

Run:

```bash
bun test packages/core/test/developer-experience.test.ts packages/core/test/creation-host.test.ts
```

Expected: all tests pass.

### Task 2: CLI Scaffold And Doctor

**Files:**
- Modify: `packages/cli/src/parse-args.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/test/developer-experience.test.ts`

- [ ] **Step 1: Write failing CLI tests**

Cover:

- `parseArgs(["scaffold-host", "/tmp/my-host", "--name", "My Host"])`;
- `parseArgs(["doctor-host", "--workspace", "/tmp/ws", "--profiles", "/tmp/profiles.json"])`;
- scaffold command writes starter files;
- doctor command rejects invalid profile JSON with non-zero exit.

- [ ] **Step 2: Verify red**

Run:

```bash
bun test packages/cli/test/developer-experience.test.ts
```

Expected: fails because CLI commands are unsupported.

- [ ] **Step 3: Implement parser**

Add `scaffold-host` and `doctor-host` as special commands. Existing lifecycle verbs still require `templateDir`.

- [ ] **Step 4: Implement scaffold and doctor**

Use core diagnostics for `doctor-host`. Use deterministic file writes for scaffold starter files.

- [ ] **Step 5: Verify green**

Run:

```bash
bun test packages/cli/test/developer-experience.test.ts packages/cli/test/parse-args.test.ts packages/cli/test/e2e.test.ts
```

Expected: all CLI tests pass.

### Task 3: Developer Guides

**Files:**
- Create: `docs/developer/getting-started.md`
- Create: `docs/developer/creation-host-contract.md`
- Modify: `README.md`
- Modify: `docs/architecture/README.md`
- Modify: `docs/architecture/roadmap.md`

- [ ] **Step 1: Write docs**

Explain the M21 golden path, minimum Host contract, diagnostics, and the M20 open-ended artifact boundary.

- [ ] **Step 2: Link docs**

Add developer-guide links to repository and architecture indexes.

- [ ] **Step 3: Verify docs links**

Run the architecture/docs link checker used in M20.

### Task 4: M21 Snapshot And Regression

**Files:**
- Create: `docs/architecture/milestone-21-snapshot.md`
- Create: `docs/architecture/milestone-21-snapshot.zh-CN.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Write bilingual snapshot**

Record what M21 proves and what it deliberately does not prove.

- [ ] **Step 2: Run regression**

Run:

```bash
bun test packages/core/test/developer-experience.test.ts packages/cli/test/developer-experience.test.ts
bun run examples/m16-reference-creation-host/run.ts --port 0 --smoke-exit
bun run examples/m18-open-ended-personal-focus-site/run.ts --port 0 --smoke-exit
bun run typecheck
git diff --check
```

- [ ] **Step 3: Update snapshot evidence**

Paste exact verification evidence into both snapshot files.

