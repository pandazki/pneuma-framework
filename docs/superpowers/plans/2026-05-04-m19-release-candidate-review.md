# M19 Release Candidate Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decide whether M1-M18 evidence is strong enough to tag a release candidate for developers building Creation Hosts.

**Architecture:** M19 is a review gate, not a feature milestone. It should gather evidence across product-goal alignment, package/API boundaries, documentation navigation, example health, browser UX, and milestone provenance, then produce a clear RC decision with blockers and non-blocking follow-up work.

**Tech Stack:** Bun workspaces, TypeScript, existing example smoke runners, architecture docs, in-app browser E2E, git tags/logs.

---

## Review Principles

M19 must not add a major feature unless review finds a missing top-level abstraction. Treat polish, better examples, hot reload, Runtime Agent, custom code, and Pneuma 2.x dogfood as post-RC work unless they invalidate the current framework claim.

RC acceptance means:

```text
Developer can understand the framework boundary
  -> run focused examples
  -> see Creation Host -> Generated Application -> Published Application
  -> trust governance and release evidence enough to build the next prototype
```

RC rejection means one of these is true:

```text
core model is ambiguous
package/API boundary leaks app-specific concerns
docs cannot onboard a new contributor
canonical examples are not runnable enough to trust
M18 exposed a missing pre-RC primitive
security/governance evidence regressed
```

## File Structure

- Create `docs/superpowers/plans/2026-05-04-m19-release-candidate-review.md` for this review plan.
- Create after the review: `docs/archive/milestone-19-snapshot.md` for the English RC decision snapshot.
- Create after the review: `docs/archive/milestone-19-snapshot.zh-CN.md` for the Chinese RC decision snapshot.
- Modify `docs/architecture/README.md` only after the M19 decision is known.
- Modify `docs/architecture/roadmap.md` only after the M19 decision is known.
- Modify `AGENTS.md` and `CLAUDE.md` only after the M19 decision is known.
- Modify `examples/README.md` only if example status changes.
- Do not change runtime/framework code during M19 unless a reviewed blocker requires a small correction.

## Task 1: Baseline State And Provenance

**Files:**
- Read: `AGENTS.md`
- Read: `CLAUDE.md`
- Read: `docs/architecture/roadmap.md`
- Read: `docs/archive/milestone-18-snapshot.md`
- Inspect: git tags and recent milestone commits

- [ ] **Step 1: Capture repository state**

Run:

```bash
git status --short
git branch --show-current
git log --oneline -20
git tag --list 'm*' --sort=version:refname
```

Expected:

```text
current branch is a codex worktree branch
M18 snapshot commit is visible
untracked local scratch files are explicitly identified
milestone tags can be mapped or gaps can be listed
```

- [ ] **Step 2: Build the M19 evidence checklist**

Create a short working checklist in the session notes with these categories:

```text
model boundary
package/API boundary
docs navigation
example health
browser UX
security/governance regression
release/tag readiness
RC blockers vs post-RC follow-ups
```

- [ ] **Step 3: Decide whether M19 is allowed to change code**

Default decision:

```text
No major feature work.
Only fix small documentation drift, broken tests, stale links, or tiny correctness defects discovered by review.
```

## Task 2: Product Goal And Model Review

**Files:**
- Read: `PRODUCT.md`
- Read: `AGENTS.md`
- Read: `CLAUDE.md`
- Read: `docs/architecture/spec/creation-host-model.md`
- Read: `docs/architecture/spec/creation-host-model.zh-CN.md`
- Read: `docs/architecture/spec/domain-model.md`
- Read: `docs/architecture/adr/0029-supersede-v0-design-spec.md`
- Read: `docs/architecture/adr/0030-lifecycle-subsystem-contract.md`

- [ ] **Step 1: Verify top-level model consistency**

Run:

```bash
rg -n "Creation Host|Generated Application|Published Application|pneuma-app-template|template self-containment|Release mode|Dev mode" \
  PRODUCT.md AGENTS.md CLAUDE.md docs/architecture/spec docs/architecture/adr docs/architecture/README.md docs/architecture/roadmap.md
```

Expected:

```text
four-artifact model is dominant in current docs
old template/lifecycle-centric wording is either historical or clearly superseded
any ambiguous current wording is listed as a docs blocker or follow-up
```

- [ ] **Step 2: Evaluate whether M18 removes the RC generality blocker**

Check M15, M16, M17, and M18 snapshots:

```text
M15: two schema-driven app shapes
M16: integrated Creation Host workflow
M17: security + architecture acceptance
M18: non-table-first Personal Focus Site
```

Expected:

```text
If Personal Focus Site proves enough generality for RC, record why.
If not, name the missing primitive and stop M19 as rejected.
```

- [ ] **Step 3: Record the RC target audience**

Use this wording unless review disproves it:

```text
The release candidate is for developers building Creation Hosts and reference profiles, not for production SaaS operators or arbitrary end-user website generation.
```

## Task 3: Package And API Boundary Review

**Files:**
- Read: root `package.json`
- Read: `packages/*/package.json`
- Read: `packages/core/src/index.ts`
- Read: `packages/core-domain/src/index.ts`
- Read: `packages/runtime/src/index.ts`
- Read: `packages/backend-opencode/src/index.ts`
- Read: `packages/adapter-linear/package.json`
- Read: `packages/provider-openrouter/package.json`

- [ ] **Step 1: Capture package map**

Run:

```bash
find packages -maxdepth 2 -name package.json -print -exec sed -n '1,160p' {} \;
```

Expected:

```text
core framework packages are identifiable
reference-integration packages are clearly marked private/reference
no new vendor package is required by M18
```

- [ ] **Step 2: Inspect public exports**

Run:

```bash
find packages -path '*/src/index.ts' -maxdepth 4 -type f -print -exec sed -n '1,220p' {} \;
```

Expected:

```text
exports match the current framework story
Creation Host contract is minimal
provider/adapter implementation details do not leak as core semantics
```

- [ ] **Step 3: Check app-specific leakage**

Run:

```bash
rg -n "knowledge|inbox|decision|linear|openrouter|github|pandazki|Personal Focus|priority" packages
```

Expected:

```text
app/example/vendor words are absent from core package semantics, except reference-integration package metadata or tests where explicitly justified
```

## Task 4: Documentation Navigation And Link Health

**Files:**
- Read: `README.md` if present
- Read: `PRODUCT.md`
- Read: `docs/architecture/README.md`
- Read: `docs/architecture/roadmap.md`
- Read: `docs/architecture/OPEN-QUESTIONS.md`
- Read: `examples/README.md`
- Read: `templates/README.md`
- Read: `AGENTS.md`
- Read: `CLAUDE.md`

- [ ] **Step 1: Check canonical reading path**

Run:

```bash
rg -n "current closed milestone|Next step|M19|M18|Release candidate|release-candidate|Post-M" \
  AGENTS.md CLAUDE.md docs/architecture/README.md docs/architecture/roadmap.md examples/README.md
```

Expected:

```text
M18 is closed
M19 is next
release-candidate review is framed as a decision gate, not as already accepted
```

- [ ] **Step 2: Check relative markdown links in architecture docs**

Run:

```bash
bun -e '
const { readdirSync, readFileSync, existsSync, statSync } = require("node:fs");
const { join, dirname, normalize } = require("node:path");
function walk(dir){ return readdirSync(dir,{withFileTypes:true}).flatMap(d=>d.isDirectory()?walk(join(dir,d.name)):join(dir,d.name)); }
let bad=[];
for (const file of walk("docs/architecture").filter(f=>f.endsWith(".md"))) {
  const text=readFileSync(file,"utf8");
  for (const match of text.matchAll(/\\[[^\\]]+\\]\\(([^)]+)\\)/g)) {
    const raw=match[1];
    if (/^(https?:|file:|#|mailto:)/.test(raw)) continue;
    const path=raw.split("#")[0];
    if (!path) continue;
    const target=normalize(join(dirname(file), path));
    if (!existsSync(target)) bad.push(`${file}: missing ${raw}`);
  }
}
if (bad.length) { console.log(bad.join("\\n")); process.exit(1); }
'
```

Expected:

```text
exit 0
```

- [ ] **Step 3: Check stale milestone counts and old status labels**

Run:

```bash
rg -n "24 条 ADR|28 条 ADR|M18.*Next|Post-M17|M5-M17|release-candidate review is blocked|open-ended app pressure before M19" \
  docs/architecture AGENTS.md CLAUDE.md examples | grep -v "docs/architecture/adr/0029-supersede-v0-design-spec.md" || true
```

Expected:

```text
no current-doc stale hits
historical process docs under `docs/superpowers/` are excluded from this stale-status check
ADR-0029 may still mention "28 条 ADR" as historical supersession context
```

## Task 5: Example And Test Health

**Files:**
- Read: `examples/README.md`
- Read: canonical example `package.json` and `run.test.ts` files

- [ ] **Step 1: Run focused canonical Creation Host tests**

Run tests serially:

```bash
bun test examples/m16-reference-creation-host/run.test.ts
bun test examples/m18-open-ended-personal-focus-site
```

Expected:

```text
M16 integrated host path passes
M18 open-ended pressure path passes
```

- [ ] **Step 2: Run core security/governance regression set**

Run:

```bash
bun test packages/runtime/test/runtime.test.ts \
  packages/runtime/test/api-config.test.ts \
  packages/runtime/test/framework-operations.test.ts \
  packages/core/test/tools/definition-apply.test.ts
```

Expected:

```text
security/governance regressions pass
```

- [ ] **Step 3: Run host milestone regression set**

Run:

```bash
bun test examples/m12-reference-creation-host/run.test.ts \
  examples/m13-host-agent-evolution/run.test.ts \
  examples/m14-host-publish-rollout/run.test.ts \
  examples/m15-generality-pressure-app/run.test.ts
```

Expected:

```text
M12-M15 host path passes or any failure is investigated before RC decision
```

- [ ] **Step 4: Run smoke runners for current teaching demos**

Run:

```bash
bun run examples/m16-reference-creation-host/run.ts --port 0 --smoke-exit
bun run examples/m18-open-ended-personal-focus-site/run.ts --port 0 --smoke-exit
```

Expected:

```text
both smoke runners pass
```

- [ ] **Step 5: Run static checks**

Run:

```bash
bun run typecheck
git diff --check
```

Expected:

```text
typecheck exits 0
diff check exits 0
```

## Task 6: Live Browser Review

**Files:**
- Exercise: `examples/m16-reference-creation-host/run.ts`
- Exercise: `examples/m18-open-ended-personal-focus-site/run.ts`
- Optional evidence: screenshots under `docs/architecture/assets/` only if used in M19 snapshot

- [ ] **Step 1: Launch M18 in the in-app browser**

Run:

```bash
bun run examples/m18-open-ended-personal-focus-site/run.ts --port 8879
```

Expected:

```text
Creation Host opens at http://127.0.0.1:8879/
```

- [ ] **Step 2: Manual path**

Click:

```text
Create
Preview
Inspect
Evolve
Allow
Publish v0
Publish v1
Restart
Rollback
```

Expected:

```text
left preview always reflects the active/generated site
right inspector makes UI definition and GitHub attention understandable
rollback returns active release to v0
console has no blocking errors
```

- [ ] **Step 3: Capture any RC-relevant UX gap**

Classify every issue as:

```text
RC blocker
post-RC polish
demo narrative gap
not relevant
```

## Task 7: Third-Party Goal Review

**Files:**
- Provide reviewer context: `AGENTS.md`, `docs/archive/milestone-18-snapshot.md`, `docs/architecture/roadmap.md`, package map, verification results

- [ ] **Step 1: Ask for independent goal review**

Prompt a reviewer with:

```text
Review pneuma-framework against the original goal: infrastructure for AI-native Creation Hosts.
Focus on release-candidate readiness, missing top-level abstractions, package/API boundary risks, docs onboarding risks, and whether M18 sufficiently pressures open-ended apps.
Return findings ordered by severity, with file references when concrete.
```

Expected:

```text
independent findings are captured before M19 decision
```

- [ ] **Step 2: Triage reviewer findings**

For each finding:

```text
accept as RC blocker
accept as post-RC follow-up
reject with reason
needs more investigation
```

## Task 8: M19 Decision Snapshot

**Files:**
- Create: `docs/archive/milestone-19-snapshot.md`
- Create: `docs/archive/milestone-19-snapshot.zh-CN.md`
- Modify: `docs/architecture/README.md`
- Modify: `docs/architecture/roadmap.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `examples/README.md` only if needed

- [ ] **Step 1: Write the decision snapshot**

Include:

```text
Executive summary
RC decision: accept / reject / defer
Evidence matrix
Verification report
Third-party review summary
RC blockers
Post-RC follow-ups
What is proven
What is not proven
Next milestone
```

- [ ] **Step 2: If accepted, update current docs to Post-M19**

Expected status wording:

```text
Post-M19 release-candidate review
```

If rejected or deferred, write the actual blocker name into `roadmap.md` and keep release candidate untagged.

- [ ] **Step 3: Verify docs and tests again**

Run:

```bash
bun run typecheck
git diff --check
```

Expected:

```text
exit 0 for both
```

- [ ] **Step 4: Commit M19 review package**

Run:

```bash
git add docs/superpowers/plans/2026-05-04-m19-release-candidate-review.md \
  docs/archive/milestone-19-snapshot.md \
  docs/archive/milestone-19-snapshot.zh-CN.md \
  docs/architecture/README.md docs/architecture/roadmap.md AGENTS.md CLAUDE.md examples/README.md
git commit -m "docs: add m19 release candidate review"
```

Only include files that exist and were intentionally changed.
