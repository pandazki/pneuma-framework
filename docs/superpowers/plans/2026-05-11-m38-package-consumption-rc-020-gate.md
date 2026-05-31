# M38 Package Consumption RC 0.2.0 Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove `pneuma-rc-0.2.0` can be consumed by a fresh downstream Bun TypeScript Creation Host project without relying on monorepo workspace magic.

**Architecture:** Keep `pneuma-framework -> Creation Host -> Generated Application -> Published Application` explicit. M38 does not add a new product primitive; it hardens the package/developer boundary so later downstream validation measures framework semantics rather than install friction.

**Tech Stack:** Bun workspaces, TypeScript package manifests, `bun:test`, shell-driven fresh-project smoke, Markdown release docs.

---

## File Structure

- Create `scripts/check-local-package-consumption.ts`: creates a temporary downstream project outside the repo, installs framework packages via local `file:` dependencies, imports core/runtime/core-domain, runs a tiny smoke, and fails on unresolved `workspace:*` dependencies or import errors.
- Modify `package.json`: add `test:package-consumption` script.
- Modify `packages/*/package.json`: set `version` to `0.2.0` for developer-facing packages and replace internal `workspace:*` dependencies with `file:../...` so local file installs work outside the monorepo.
- Create `docs/developer/upgrading-to-rc-0.2.0.md` and `docs/developer/upgrading-to-rc-0.2.0.zh-CN.md`: downstream upgrade/install guide.
- Create `docs/archive/release-candidate-0.2.0-snapshot.md` and `.zh-CN.md`: gate meaning, evidence, and non-claims.
- Modify `docs/developer/start-here.md`, `docs/developer/start-here.zh-CN.md`, `docs/architecture/README.md`, `docs/architecture/roadmap.md`: point readers at the new 0.2.0 consumption gate without claiming production SaaS readiness.

## Task 1: Fresh Downstream Consumption Smoke

**Files:**
- Create: `scripts/check-local-package-consumption.ts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing smoke script**

Create a script that:

```ts
const downstream = mkdtempSync(join(tmpdir(), "pneuma-consumer-"));
writeFileSync(join(downstream, "package.json"), JSON.stringify({
  type: "module",
  scripts: { smoke: "bun run smoke.ts" },
  dependencies: {
    "@pneuma-framework/core-domain": `file:${repo}/packages/core-domain`,
    "@pneuma-framework/core": `file:${repo}/packages/core`,
    "@pneuma-framework/runtime": `file:${repo}/packages/runtime`,
  },
}, null, 2));
```

The smoke should import:

```ts
import { Table, Operation } from "@pneuma-framework/core-domain";
import { validatePortableArtifactSafety, summarizeBuildThreadTurns } from "@pneuma-framework/core";
import { PNEUMA_SQLITE_PATH_ENV } from "@pneuma-framework/runtime";
```

Then it should run `bun install`, `bun run smoke`, and `bunx tsc --noEmit`.

- [ ] **Step 2: Run and verify it fails before manifest fixes**

Run: `bun run scripts/check-local-package-consumption.ts`

Expected before fixes: install/import/typecheck fails because external file consumption still sees monorepo-only dependency assumptions.

- [ ] **Step 3: Add root script**

Add:

```json
"test:package-consumption": "bun run scripts/check-local-package-consumption.ts"
```

- [ ] **Step 4: Commit after green**

Commit after Task 2 makes this pass.

## Task 2: Package Manifest Boundary

**Files:**
- Modify: `packages/core-domain/package.json`
- Modify: `packages/core/package.json`
- Modify: `packages/runtime/package.json`
- Modify: `packages/cli/package.json`
- Modify: `packages/backend-opencode/package.json`
- Modify: `packages/viewer-react/package.json`
- Modify: `packages/adapter-linear/package.json`
- Modify: `packages/provider-openrouter/package.json`

- [ ] **Step 1: Set developer-facing package versions**

Set `version` to `0.2.0` on framework packages.

- [ ] **Step 2: Replace internal workspace dependencies**

Replace internal dependencies like:

```json
"@pneuma-framework/core-domain": "workspace:*"
```

with local file dependencies such as:

```json
"@pneuma-framework/core-domain": "file:../core-domain"
```

This keeps the monorepo usable while allowing a downstream project to install packages from local paths.

- [ ] **Step 3: Run fresh consumption smoke**

Run: `bun run test:package-consumption`

Expected: install, runtime smoke, and downstream typecheck pass.

- [ ] **Step 4: Run focused package tests**

Run:

```bash
bun test packages/core/test/host-authoring.test.ts packages/core/test/sharing-governance.test.ts packages/core/test/build-thread.test.ts packages/runtime/test/constants.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add package.json scripts/check-local-package-consumption.ts packages/*/package.json
git commit -m "chore: gate local package consumption for rc 0.2.0"
```

## Task 3: 0.2.0 Developer Paperwork

**Files:**
- Create: `docs/developer/upgrading-to-rc-0.2.0.md`
- Create: `docs/developer/upgrading-to-rc-0.2.0.zh-CN.md`
- Create: `docs/archive/release-candidate-0.2.0-snapshot.md`
- Create: `docs/archive/release-candidate-0.2.0-snapshot.zh-CN.md`
- Modify: `docs/developer/start-here.md`
- Modify: `docs/developer/start-here.zh-CN.md`
- Modify: `docs/architecture/README.md`
- Modify: `docs/architecture/roadmap.md`

- [ ] **Step 1: Write upgrade guide**

Document:

- target tag: `pneuma-rc-0.2.0`;
- local file install shape;
- `bun run test:package-consumption`;
- new helpers from Production Readiness v0;
- non-claims: not npm production publish, not hosted identity, not production SaaS.

- [ ] **Step 2: Write RC 0.2.0 snapshot**

Document the decision:

```text
0.1.x proved core abstractions and post-RC primitives.
0.2.0 proves fresh downstream package consumption and developer-preview install path.
```

- [ ] **Step 3: Update reading path**

Add 0.2.0 links to Start Here and Architecture README. Roadmap should show M38 as closed only after verification passes.

- [ ] **Step 4: Commit**

```bash
git add docs/developer/upgrading-to-rc-0.2.0*.md docs/archive/release-candidate-0.2.0-snapshot*.md docs/developer/start-here*.md docs/architecture/README.md docs/architecture/roadmap.md
git commit -m "docs: add rc 0.2.0 package consumption gate"
```

## Task 4: Verification And Tag Readiness

**Files:**
- No code files unless verification exposes a bug.

- [ ] **Step 1: Run package consumption smoke**

Run: `bun run test:package-consumption`

- [ ] **Step 2: Run full suite**

Run:

```bash
bun test
bun run typecheck
```

- [ ] **Step 3: Review boundary**

Verify docs still say:

```text
pneuma-framework -> Creation Host -> Generated Application -> Published Application
```

and do not claim production SaaS readiness.

- [ ] **Step 4: Stop before tag**

Report tag readiness. Do not create `pneuma-rc-0.2.0` until the user explicitly confirms.

## Self-Review

- Spec coverage: includes fresh external install, package manifest hardening, docs, full verification, and tag gate.
- Placeholder scan: no placeholder sections.
- Scope check: M38 stays focused on package consumption and release readiness; it does not start enterprise org governance or Pneuma 2.x dogfood.
