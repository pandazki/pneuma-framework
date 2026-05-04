# M18 Open-Ended Personal Focus Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the M18 Personal Focus Site pressure example: an open-ended generated site with GitHub attention data, governed evolution, inspection, publish, restart, and rollback.

**Architecture:** Add an M18 example beside M16. Keep GitHub logic inside the example/profile as reference integration code. Reuse the Creation Host store and local rollout concepts, but add M18-specific site definition, preview, fixture/live GitHub attention, and a governed scripted evolution path that changes UI/module/style definition rather than only data rows.

**Tech Stack:** Bun TypeScript, existing Creation Host store, local HTTP runtimes, fixture GitHub data with optional public GitHub API fallback, Bun tests.

---

## File Structure

- Create `examples/m18-open-ended-personal-focus-site/github-attention.ts` for fixture items, optional public GitHub fetching, and deterministic ranking.
- Create `examples/m18-open-ended-personal-focus-site/site-definition.ts` for v0/v1 Personal Focus Site definition and evolution helpers.
- Create `examples/m18-open-ended-personal-focus-site/preview-runtime.ts` for app preview, inspect, `/api/site`, and GitHub attention refresh.
- Create `examples/m18-open-ended-personal-focus-site/host-server.ts` for Creation Host endpoints.
- Create `examples/m18-open-ended-personal-focus-site/run.ts` for live/manual and smoke execution.
- Create `examples/m18-open-ended-personal-focus-site/run.test.ts` for end-to-end M18 verification.
- Create `examples/m18-open-ended-personal-focus-site/github-attention.test.ts` for ranking tests.
- Create `examples/m18-open-ended-personal-focus-site/site-definition.test.ts` for definition evolution tests.
- Create `examples/m18-open-ended-personal-focus-site/static/index.html`, `static/app.js`, and `static/styles.css` for the demo workbench.
- Create `examples/m18-open-ended-personal-focus-site/package.json`.
- Modify `examples/README.md` to list M18 as canonical once the example exists.

## Task 1: GitHub Attention Ranking

**Files:**
- Create: `examples/m18-open-ended-personal-focus-site/github-attention.test.ts`
- Create: `examples/m18-open-ended-personal-focus-site/github-attention.ts`

- [ ] **Step 1: Write failing ranking tests**

Test names:

```ts
test("ranks personal GitHub attention ahead of generic repository activity", () => {});
test("uses pandazki public profile fixture as deterministic demo identity", () => {});
```

Expected behavior:

- top item is assigned/review-requested/mentioned before generic recently updated issues;
- fixture owner is `pandazki`;
- fixture profile includes public GitHub evidence: display name `Pandazki`, username `pandazki`, pinned repositories including `pneuma-skills`, `nemori`, `leaf-playground`, and `deepict`.

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test examples/m18-open-ended-personal-focus-site/github-attention.test.ts
```

Expected: fail because the file/module does not exist yet.

- [ ] **Step 3: Implement ranking and fixtures**

Implement:

- `PANDAZKI_PUBLIC_PROFILE_FIXTURE`
- `PANDAZKI_GITHUB_ATTENTION_FIXTURE`
- `rankGitHubAttention(items, options)`
- `loadGitHubAttention({ mode })`

Live mode may use public GitHub REST endpoints, but tests use fixtures.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test examples/m18-open-ended-personal-focus-site/github-attention.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add examples/m18-open-ended-personal-focus-site/github-attention.ts examples/m18-open-ended-personal-focus-site/github-attention.test.ts
git commit -m "feat: add m18 github attention ranking"
```

## Task 2: Personal Focus Site Definition

**Files:**
- Create: `examples/m18-open-ended-personal-focus-site/site-definition.test.ts`
- Create: `examples/m18-open-ended-personal-focus-site/site-definition.ts`

- [ ] **Step 1: Write failing definition tests**

Test names:

```ts
test("creates v0 as an open-ended personal site definition", () => {});
test("applies focus evolution by changing sections, style tokens, and GitHub ranking module", () => {});
```

Expected behavior:

- v0 has routes, sections, style tokens, modules, and no table/list primary surface;
- v1 changes section copy, adds ranked GitHub module settings, and changes visual style tokens.

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test examples/m18-open-ended-personal-focus-site/site-definition.test.ts
```

Expected: fail because module does not exist.

- [ ] **Step 3: Implement definition helpers**

Implement:

- `createPersonalFocusSiteDefinition()`
- `evolvePersonalFocusSiteDefinition(definition)`
- `summarizeSiteDefinition(definition)`
- `writeSiteDefinition(path, definition)`
- `readSiteDefinition(path)`

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test examples/m18-open-ended-personal-focus-site/site-definition.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add examples/m18-open-ended-personal-focus-site/site-definition.ts examples/m18-open-ended-personal-focus-site/site-definition.test.ts
git commit -m "feat: add m18 personal focus site definition"
```

## Task 3: Preview Runtime and Inspection

**Files:**
- Create: `examples/m18-open-ended-personal-focus-site/preview-runtime.ts`
- Create/modify tests in `examples/m18-open-ended-personal-focus-site/run.test.ts`

- [ ] **Step 1: Write failing preview/inspect test**

Test should start the M18 server, create a `personal-focus-site` project, start preview, inspect it, and assert:

- `/api/site` returns routes/sections/style_tokens/modules;
- GitHub attention contains three ranked items;
- inspection includes `ui_definition` and `github_attention`.

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test examples/m18-open-ended-personal-focus-site/run.test.ts
```

Expected: fail because server/runtime does not exist.

- [ ] **Step 3: Implement preview runtime**

Implement a lightweight Bun HTTP runtime per generated app version:

- `GET /` renders the Personal Focus Site;
- `GET /api/site` returns definition + ranked attention;
- `POST /api/github-attention/refresh` refreshes fixture/live attention;
- `GET /health` returns `{ ok: true }`.

- [ ] **Step 4: Keep test RED until host endpoints exist**

Do not force green by weakening the test. Proceed to Task 4.

## Task 4: M18 Creation Host Server and Smoke Flow

**Files:**
- Create: `examples/m18-open-ended-personal-focus-site/host-server.ts`
- Create: `examples/m18-open-ended-personal-focus-site/run.ts`
- Complete: `examples/m18-open-ended-personal-focus-site/run.test.ts`
- Create: `examples/m18-open-ended-personal-focus-site/package.json`

- [ ] **Step 1: Implement host endpoints**

Endpoints:

```text
GET  /
GET  /api/host/profiles
POST /api/host/projects
POST /api/host/projects/:app_id/preview/start
GET  /api/host/projects/:app_id/inspect
POST /api/host/projects/:app_id/github-attention/refresh
POST /api/host/projects/:app_id/evolution/start
POST /api/host/projects/:app_id/evolution/approve
POST /api/host/projects/:app_id/evolution/deny
POST /api/host/projects/:app_id/publish
POST /api/host/projects/:app_id/restart-active
POST /api/host/projects/:app_id/rollback
GET  /api/host/projects/:app_id/rollout
```

- [ ] **Step 2: Implement governed scripted evolution**

The evolution must:

- fork v0 to v1;
- produce one awaiting-approval proposal;
- approval writes evolved site definition;
- denial leaves v0/v1 definition unchanged except for the fork.

- [ ] **Step 3: Implement local publish/restart/rollback**

Use release rollout primitives or an M18-local equivalent that records active/previous URLs and verifies `/health` plus `/api/site`.

- [ ] **Step 4: Verify E2E GREEN**

Run:

```bash
bun test examples/m18-open-ended-personal-focus-site/run.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add examples/m18-open-ended-personal-focus-site
git commit -m "feat: add m18 personal focus creation host"
```

## Task 5: Browser Workbench

**Files:**
- Create: `examples/m18-open-ended-personal-focus-site/static/index.html`
- Create: `examples/m18-open-ended-personal-focus-site/static/app.js`
- Create: `examples/m18-open-ended-personal-focus-site/static/styles.css`

- [ ] **Step 1: Write static contract assertions in run test**

Assert `/` contains:

- `M18 Personal Focus Site`
- `data-testid="create-focus-site"`
- `data-testid="approve-evolution"`
- `data-testid="publish-v1"`
- `data-testid="rollback"`

- [ ] **Step 2: Verify RED**

Run:

```bash
bun test examples/m18-open-ended-personal-focus-site/run.test.ts
```

Expected: fail until static workbench exists.

- [ ] **Step 3: Implement workbench**

Workbench must show:

- left preview iframe;
- right Host console;
- controls for create / preview / inspect / refresh GitHub / evolve / approve / publish / restart / rollback;
- inspector panels for UI definition, GitHub attention, transcript, and rollout.

- [ ] **Step 4: Verify GREEN**

Run:

```bash
bun test examples/m18-open-ended-personal-focus-site/run.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add examples/m18-open-ended-personal-focus-site/static examples/m18-open-ended-personal-focus-site/run.test.ts
git commit -m "feat: add m18 personal focus workbench"
```

## Task 6: Regression, Docs, and Manual Run

**Files:**
- Modify: `examples/README.md`
- Later after implementation: `docs/architecture/roadmap.md` only if M18 status changes

- [ ] **Step 1: Add examples index entry**

Add M18 as canonical:

```text
examples/m18-open-ended-personal-focus-site — M18 open-ended app pressure demo.
```

- [ ] **Step 2: Run focused regression**

Run:

```bash
bun test examples/m18-open-ended-personal-focus-site examples/m16-reference-creation-host/run.test.ts
bun run examples/m18-open-ended-personal-focus-site/run.ts --port 0 --smoke-exit
```

Expected: all pass.

- [ ] **Step 3: Run type/static checks**

Run:

```bash
bun run typecheck
git diff --check
```

Expected: both exit 0.

- [ ] **Step 4: Commit**

```bash
git add examples/README.md
git commit -m "docs: list m18 open-ended pressure example"
```

## Self-Review

- Spec coverage: plan covers fixture/live GitHub, open-ended site definition, UI definition inspection, one approval, publish/restart/rollback, M16 regression, and demo visibility.
- Placeholder scan: no `TODO`/`TBD`; live GitHub is intentionally optional and fixture mode is canonical.
- Type consistency: uses `personal-focus-site-bun-sqlite`, `ui_definition`, `github_attention`, and `site_definition` consistently.
