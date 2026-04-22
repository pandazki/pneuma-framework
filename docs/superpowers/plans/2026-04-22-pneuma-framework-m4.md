# pneuma-framework M4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate the framework's full-stack + deployment story end-to-end by shipping `templates/ai-bookmarks` — an AI-native bookmarks app (Bun server + SQLite + React viewer + LangChain/OpenRouter interpretation + vector-embedding knowledge graph + Docker build/deploy) — while also closing the six framework-level gaps that M2 left as stubs: `orchestrator.runSetup/runMigrate/runFork`, tool-API routing for those three, `unattendedDeploy` consumption, and a viewer-side `permission-prompt` UI.

**Architecture:** Core extends the lifecycle orchestrator with real `runSetup` / `runMigrate` / `runFork` implementations that spawn `setup.sh` / `migrate.sh` / `fork.sh` through the existing `spawnVerb` path. `lifecycle.setup.run`, `lifecycle.migrate.run`, `lifecycle.fork.run` become first-class tools. `runDeploy` consults `manifest.backends.defaultConfig.unattendedDeploy` — when `false`, it emits `##pneuma:needs-confirm deploy` and blocks on `resolveConfirm("deploy", ...)`. viewer-react grows a `<PermissionPrompt>` that renders on `a2v permission-prompt` envelopes and routes the decision back via `useAction`. The bookmarks template is a single Bun process that serves both the React viewer (via `bun --hot index.html`) and a REST API on the same port; bookmarks land in SQLite with lens-tagged interpretations and 768-dim embeddings; a React timeline view and a react-flow graph view consume the same `/api/bookmarks` endpoint. Docker `build.sh` produces a single image with the compiled Bun binary and static assets; `deploy.sh` runs the image locally by default and pushes to a registry when `PNEUMA_DEPLOY_TARGET=registry` is set.

**Tech Stack:** Bun ≥ 1.3, TypeScript 5.x, React 19, `react-flow` for the graph view, `marked` (reused from doc mode) for renderings, `@langchain/openai` + OpenRouter for interpretation, OpenRouter `/embeddings` API directly (fetch — not LangChain) for vectors, Jina Reader (`https://r.jina.ai/<url>`) for URL extraction, `bun:sqlite` for persistence, Docker ≥ 24 for release, `bun:test` for tests, POSIX shell for lifecycle scripts.

**Spec reference:** `docs/superpowers/specs/2026-04-21-pneuma-framework-v0-design.md` — §4 lifecycle verbs (spec-complete version lands here), §5.2 action tools (migrate/fork/setup no longer stubs), §5.4 Builder confirmation via `unattendedDeploy`, §6 wire protocol (permission-prompt UI), §8.3 fork-modify-redeploy flow, §12 roadmap M4 ("`template-procfile-fullstack`" — we rename to `template-ai-bookmarks` since the test bed is more interesting), §13 open questions #2 (per-verb unattended flags — still out of scope, one flag for all gated verbs).

---

## Scope

### In scope

**Framework core (packages/core)**
- `LifecycleOrchestrator.runSetup()` / `runMigrate(opts)` / `runFork(sourceWorkspace)` — real implementations that spawn their `scripts/*.sh` and surface exit codes + manifests like `runBuild`.
- `lifecycle.setup.run`, `lifecycle.migrate.run`, `lifecycle.fork.run` tools route through the real orchestrator methods (replacing M2's `not-implemented` stubs).
- `runDeploy()` consults `manifest.backends?.defaultConfig?.unattendedDeploy` (default `false`); when unattended is false, emits `##pneuma:needs-confirm deploy` on the orchestrator's own channel and waits for `resolveConfirm("deploy", "deploy", "yes"|"no")` before invoking `deploy.sh`. A `"no"` resolution short-circuits with `exitCode: 3` ("user rejected").
- Tool API: `lifecycle.deploy.run` caller can pass `{ confirm: "yes" | "no" }` to pre-answer, otherwise returns an `{ok: false, error: "pending-confirmation", pendingConfirm: {...}}` shape for the viewer to surface.

**viewer-react**
- `<PermissionPrompt>` rendered as a modal-ish banner inside `<PneumaViewer>` whenever `usePneumaState().pendingPrompt` is set; Allow/Deny routes back through `useAction` → `v2a permission-response` (the M3 envelope already exists but was never rendered).
- `usePneumaState` extended to track the most recent `a2v permission-prompt` envelope as `pendingPrompt?: PermissionPrompt`, cleared when the builder answers.

**Template `templates/ai-bookmarks`**
- `manifest.json` declares all seven scripts (`setup`/`dev`/`stop`/`build`/`deploy`/`migrate`/`fork`) + `runtimeAgent: "embedded"` (the deployed app calls LLMs — framework doesn't inject creds, template reads `OPENROUTER_API_KEY` at runtime) + `backends.defaultConfig.unattendedDeploy: false`.
- `skill/SKILL.md`: bilingual agent skill telling the build-phase agent how to edit `lenses.json`, add migrations, and customize the viewer.
- `scaffold/lenses.json` (initial two lenses) + `scaffold/schema/001-init.sql`.
- `scripts/setup.sh` — creates `$WS/.pneuma-data`, installs deps, seeds `lenses.json` + schema, runs first `migrate.sh up` invocation.
- `scripts/dev.sh` — runs a single `bun --hot server.ts` process that serves the React viewer entry (`viewer/index.html`) AND the REST API on the same port.
- `scripts/migrate.sh` — applies unapplied `workspace/migrations/*.sql` in order by filename; direction `up` (v0 scope); records in `_migrations` table.
- `scripts/fork.sh` — copies workspace tree to `$PNEUMA_FORK_TARGET`, strips `.pneuma-data/db.sqlite` (schema re-migrates on first dev), preserves `lenses.json` + any user config files.
- `scripts/build.sh` — `docker build -t pneuma-bookmarks:<sha> -f Dockerfile .`; writes `build.manifest.json` with image tag + deploy hints.
- `scripts/deploy.sh` — reads manifest; local mode → `docker run -d -p <port>:3000 -v pneuma-bookmarks:/data ...`; registry mode → `docker push $PNEUMA_REGISTRY/pneuma-bookmarks:<sha>`.
- `server/` — Bun server: `POST /api/bookmarks`, `GET /api/bookmarks`, `GET /api/graph`, static serving; lens interpretation pipeline (Jina Reader → ChatOpenAI → OpenRouter embeddings → SQLite persist).
- `viewer/` — React SPA with a timeline view + a react-flow graph view + lens-config inspector + chat panel (reusing `@pneuma-framework/viewer-react`).
- `Dockerfile` — multi-stage: build with `oven/bun:1` → final slim image with compiled binary + static assets + volume mount point for `/data`.

**CLI**
- `pneuma-framework setup <templateDir> [--workspace]` subcommand wiring to `orchestrator.runSetup`.
- `pneuma-framework migrate <templateDir> [--workspace] [--direction up]` subcommand.
- `pneuma-framework fork <sourceWorkspace> <targetWorkspace>` subcommand.
- `pneuma-framework deploy` already wired in M2 — extends with `--unattended` flag override.

**E2E validation**
- One integration test: fresh workspace → `runSetup` → `runDev` (starts) → bookmark POST → assert DB row + lens interpretations + embedding length → `runStop`.
- Hand-validated full walkthrough documented in `examples/ai-bookmarks/README.md`.

### Out of scope (deferred)

- **CF Workers / CF Pages deploy target** — mentioned in M3 retro but stays M4.5. Ship Docker first.
- **Multi-user auth** — app is single-user. HTTP basic auth would be a 1-liner but out of scope.
- **Real embedding reranking / dense retrieval UI** — graph + timeline cover it for v0; proper "semantic search" box is follow-up.
- **Full `--direction down` migrations** — v0 supports only `up`. Down migrations need paired files + testing infra; schedule for M4.5.
- **Confirmation UI for migrate/fork** — v0 only gates `deploy` behind confirm. migrate/fork remain unconfirmed via CLI (they're local-only).
- **Live lens swap during generation** — `lenses.json` read at server startup. File-watcher hot-swap is future polish.
- **Graph edge recomputation on lens change** — edges are computed when a bookmark is added; recompute-all tool is M4.5.
- **Claude-code / Codex backend adapters** — still deferred per user direction from M3 closeout.

---

## File structure

All paths relative to the repo root (`/Users/pandazki/Codes/pneuma-framework/`).

### `packages/core/` — modifications

| Path | Responsibility |
|---|---|
| `src/lifecycle.ts` | **modify.** Add `runSetup()`, `runMigrate(opts)`, `runFork(sourceWorkspace, targetWorkspace)`; extend `runDeploy()` to consult `unattendedDeploy` + await `##pneuma:needs-confirm deploy`. |
| `src/tools/action.ts` | **modify.** Replace `lifecycle.setup.run`, `lifecycle.migrate.run`, `lifecycle.fork.run` stub handlers with real routing. `lifecycle.deploy.run` gains `confirm` param. |
| `src/env.ts` | **modify.** Accept + forward `PNEUMA_MIGRATE_DIRECTION` env var. |
| `src/index.ts` | **modify.** Re-export `SetupResult`, `MigrateResult`, `ForkResult` types. |
| `test/lifecycle-setup.test.ts` | **new.** runSetup green-path + script-missing error. |
| `test/lifecycle-migrate.test.ts` | **new.** runMigrate invokes migrate.sh with direction env var. |
| `test/lifecycle-fork.test.ts` | **new.** runFork spawns fork.sh with source + target env vars. |
| `test/lifecycle-deploy-confirm.test.ts` | **new.** `unattendedDeploy: false` blocks until resolveConfirm; `true` flows through. |
| `test/tools/action-setup-migrate-fork.test.ts` | **new.** Tool-API-level tests for the three un-stubbed tools. |

### `packages/viewer-react/` — addition

| Path | Responsibility |
|---|---|
| `src/PermissionPrompt.tsx` | **new.** Small React component that consumes `usePneumaState().pendingPrompt`; calls `useAction` to emit `permission-response`. |
| `src/usePneumaState.ts` | **modify.** Track `pendingPrompt: PermissionPrompt | undefined`. |
| `src/index.ts` | **modify.** Export `PermissionPrompt`. |
| `test/PermissionPrompt.test.tsx` | **new.** Mount with a mock permission envelope; click Allow → action sent. |

### `packages/cli/` — modifications

| Path | Responsibility |
|---|---|
| `src/parse-args.ts` | **modify.** Add `setup`, `migrate`, `fork` verbs; `--direction`, `--source`, `--target`, `--unattended` flags. |
| `src/index.ts` | **modify.** Wire the four new verbs / flags; `fork` takes positional `<sourceWorkspace> <targetWorkspace>` or `--source`/`--target` flags. |
| `test/parse-args.test.ts` | **modify.** Tests for the new verbs + flags. |

### `templates/ai-bookmarks/` — new template

| Path | Responsibility |
|---|---|
| `manifest.json` | Declares all 7 scripts, `unattendedDeploy: false`, `runtimeAgent: "embedded"`, deps on `opencode`/`claude-code`/`codex` backends. |
| `skill/SKILL.md` | Bilingual agent guidance: edit `lenses.json` / add migration files / customize viewer. |
| `scaffold/lenses.json` | Initial 2 lenses: `technical-depth`, `personal-relevance`. |
| `scaffold/schema/001-init.sql` | Initial migration: `bookmarks`, `interpretations`, `lenses`, `_migrations`. |
| `scripts/setup.sh` | `bun install` inside `$WS`, copy scaffold → workspace, invoke `migrate.sh up`. |
| `scripts/dev.sh` | `bun --hot server/server.ts` — Bun serves both viewer HTML + REST API. |
| `scripts/stop.sh` | Trap-emits `##pneuma:stopping`; trivial (dev.sh process group handles actual kill). |
| `scripts/build.sh` | Docker multi-stage build; write manifest with image tag. |
| `scripts/deploy.sh` | Local `docker run` by default; registry push when `PNEUMA_DEPLOY_TARGET=registry`. |
| `scripts/migrate.sh` | Walk `workspace/migrations/*.sql` sorted; apply unapplied via `sqlite3`. |
| `scripts/fork.sh` | `rsync -a --exclude='.pneuma-data' $SRC/ $TGT/`; emit marker with target path. |
| `Dockerfile` | Multi-stage; `oven/bun:1` builder → slim final. |
| `.dockerignore` | Standard excludes (`node_modules`, `.pneuma-data`, `.git`). |
| `server/server.ts` | Bun server: routes, static serving. |
| `server/db.ts` | `bun:sqlite` helpers: init, migrate runner, typed query helpers. |
| `server/interpret.ts` | Pipeline: URL → Jina Reader → ChatOpenAI (per lens) → embedding → persist. |
| `server/openrouter.ts` | Thin wrappers: `chat(model, system, user)` + `embed(input, model)`. |
| `server/lenses.ts` | Load `lenses.json` on startup; expose `listLenses()`. |
| `server/graph.ts` | Build graph from embedding cosine; threshold edges. |
| `viewer/package.json` | React 19 + react-flow + marked + `@pneuma-framework/viewer-react`. |
| `viewer/tsconfig.json` | Extends root base. |
| `viewer/index.html` | Mounts the React app; reads sid+ws params like doc mode. |
| `viewer/src/main.tsx` | React mount. |
| `viewer/src/App.tsx` | Shell: timeline / graph tab switcher + chat panel + permission prompt. |
| `viewer/src/TimelineView.tsx` | Chronological card list, lens-tagged interpretations per card. |
| `viewer/src/GraphView.tsx` | react-flow network: nodes = bookmarks, edges = cosine > threshold. |
| `viewer/src/AddBookmark.tsx` | Input box: paste URL → POST /api/bookmarks. |
| `viewer/src/LensInspector.tsx` | Sidebar: current `lenses.json` contents (read-only in v0). |
| `viewer/src/api.ts` | Typed fetch helpers for `/api/*`. |
| `viewer/src/styles.css` | Editorial theme extending doc-mode palette; timeline-vs-graph layouts. |

### `examples/ai-bookmarks/` — walkthrough

| Path | Responsibility |
|---|---|
| `package.json` | Private; no code. |
| `README.md` | Run recipe; docker-local + registry modes; fork + migrate walkthrough. |

### Root

| Path | Change |
|---|---|
| `package.json` | typecheck extends to `templates/ai-bookmarks/viewer/tsconfig.json`. |
| `.gitignore` | Add `.pneuma-data/` (workspace DB never enters git). |
| `bun.lock` | Auto-updated after `bun install`. |

---

## Canonical types (reproduced once; later tasks reference these)

### Lifecycle extensions (materialized in Phase A)

```typescript
// packages/core/src/lifecycle.ts — ADDITIONS

export interface SetupResult {
  exitCode: number;
}

export interface MigrateResult {
  exitCode: number;
  direction: "up" | "down";
}

export interface ForkResult {
  exitCode: number;
  /** Absolute path of the newly-populated fork target. */
  targetWorkspace: string;
}
```

### Bookmark schema (materialized in Phase D)

```sql
-- templates/ai-bookmarks/scaffold/schema/001-init.sql

CREATE TABLE IF NOT EXISTS _migrations (
  name TEXT PRIMARY KEY,
  applied_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  url       TEXT    NOT NULL UNIQUE,
  title     TEXT,
  fetched_at INTEGER NOT NULL,
  raw_text  TEXT
);

CREATE TABLE IF NOT EXISTS interpretations (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  bookmark_id  INTEGER NOT NULL REFERENCES bookmarks(id) ON DELETE CASCADE,
  lens_name    TEXT    NOT NULL,
  body         TEXT    NOT NULL,
  embedding    BLOB    NOT NULL, -- Float32Array packed
  created_at   INTEGER NOT NULL,
  UNIQUE(bookmark_id, lens_name)
);

CREATE INDEX IF NOT EXISTS idx_bookmarks_fetched_at ON bookmarks(fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_interpretations_bookmark ON interpretations(bookmark_id);
```

### Lens config (materialized in Phase D)

```typescript
// templates/ai-bookmarks/server/lenses.ts — canonical shape

export interface Lens {
  name: string;         // "technical-depth"
  displayName: string;  // "Technical Depth"
  prompt: string;       // system prompt text
  model?: string;       // "anthropic/claude-opus-4.7" — optional override
}

export interface LensesFile {
  lenses: Lens[];
}
```

### API contract (materialized in Phase F)

```typescript
// templates/ai-bookmarks/server/api-types.ts

export interface BookmarkRow {
  id: number;
  url: string;
  title: string | null;
  fetched_at: number;
}

export interface InterpretationRow {
  id: number;
  bookmark_id: number;
  lens_name: string;
  body: string;
  created_at: number;
}

export interface BookmarkWithInterpretations extends BookmarkRow {
  interpretations: InterpretationRow[];
}

export interface GraphNode {
  id: number;
  url: string;
  title: string | null;
}

export interface GraphEdge {
  source: number;
  target: number;
  weight: number;   // cosine similarity, 0..1
}

export interface GraphResponse {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
```

---

## Tasks

### Phase A — Framework: real lifecycle verbs (6 tasks)

### Task A1: `LifecycleOrchestrator.runSetup()`

**Files:**
- Modify: `packages/core/src/lifecycle.ts`
- Create: `packages/core/test/lifecycle-setup.test.ts`
- Create: `packages/core/test/fixtures/templates/fixture-setup/manifest.json`
- Create: `packages/core/test/fixtures/templates/fixture-setup/scripts/setup.sh`

- [ ] **Step 1: Create the setup fixture**

`packages/core/test/fixtures/templates/fixture-setup/manifest.json`:

```json
{
  "schemaVersion": 1,
  "name": "fixture-setup",
  "version": "0.0.1",
  "displayName": "Fixture Setup",
  "description": "Emits a marker file in the workspace during setup.",
  "backends": { "supported": ["claude-code"] },
  "runtimeAgent": "none",
  "scripts": { "setup": "scripts/setup.sh", "dev": "scripts/dev.sh" }
}
```

`packages/core/test/fixtures/templates/fixture-setup/scripts/setup.sh`:

```bash
#!/bin/sh
: "${PNEUMA_WORKSPACE:?}"
echo "##pneuma:progress 50 installing"
touch "$PNEUMA_WORKSPACE/.setup-ran"
echo "##pneuma:progress 100 done"
exit 0
```

`packages/core/test/fixtures/templates/fixture-setup/scripts/dev.sh` (minimal — so parseTemplateManifest doesn't choke):

```bash
#!/bin/sh
echo "##pneuma:service-ready viewer http://127.0.0.1:0"
echo "##pneuma:ready"
trap 'exit 0' TERM INT
while true; do sleep 0.1; done
```

```bash
chmod +x packages/core/test/fixtures/templates/fixture-setup/scripts/setup.sh
chmod +x packages/core/test/fixtures/templates/fixture-setup/scripts/dev.sh
```

- [ ] **Step 2: Write the failing test**

`packages/core/test/lifecycle-setup.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../src/lifecycle.js";

const FIXTURE = join(import.meta.dir, "fixtures/templates/fixture-setup");

test("runSetup spawns setup.sh and reports exit code", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-setup-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE, workspace: ws });
  const res = await orch.runSetup();
  expect(res.exitCode).toBe(0);
  expect(existsSync(join(ws, ".setup-ran"))).toBe(true);
});

test("runSetup throws if the template doesn't declare a setup script", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-setup-missing-"));
  const NO_SETUP = join(import.meta.dir, "fixtures/templates/fixture-min");
  const orch = new LifecycleOrchestrator({ templateDir: NO_SETUP, workspace: ws });
  await expect(orch.runSetup()).rejects.toThrow(/scripts\.setup/);
});
```

- [ ] **Step 3: Run to confirm fail**

```bash
bun test packages/core/test/lifecycle-setup.test.ts
```
Expected: FAIL — `orch.runSetup is not a function`.

- [ ] **Step 4: Modify `packages/core/src/lifecycle.ts`**

Add after `runDeploy`:

```typescript
async runSetup(): Promise<SetupResult> {
  const scriptPath = this.requireScript("setup");
  const proc = this.spawnVerb("setup", scriptPath, { mode: "dev" });
  const result = await proc.done;
  return { exitCode: result.code ?? -1 };
}
```

Add the `SetupResult` interface near the top (below `DeployResult`):

```typescript
export interface SetupResult {
  exitCode: number;
}
```

- [ ] **Step 5: Run to confirm green**

```bash
bun test packages/core/test/lifecycle-setup.test.ts
bun test
```
Expected: 2 new pass. Full suite: was 159 → now 161.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/lifecycle.ts packages/core/test/lifecycle-setup.test.ts packages/core/test/fixtures/templates/fixture-setup
git commit -m "$(cat <<'EOF'
feat(core): LifecycleOrchestrator.runSetup spawns setup.sh

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A2: `LifecycleOrchestrator.runMigrate()`

**Files:**
- Modify: `packages/core/src/lifecycle.ts`
- Modify: `packages/core/src/env.ts` (accept `PNEUMA_MIGRATE_DIRECTION` forwarding)
- Create: `packages/core/test/lifecycle-migrate.test.ts`
- Create: `packages/core/test/fixtures/templates/fixture-migrate/manifest.json`
- Create: `packages/core/test/fixtures/templates/fixture-migrate/scripts/migrate.sh`
- Create: `packages/core/test/fixtures/templates/fixture-migrate/scripts/dev.sh`

- [ ] **Step 1: Create the migrate fixture**

`packages/core/test/fixtures/templates/fixture-migrate/manifest.json`:

```json
{
  "schemaVersion": 1,
  "name": "fixture-migrate",
  "version": "0.0.1",
  "displayName": "Fixture Migrate",
  "description": "Writes the direction env var to workspace.",
  "backends": { "supported": ["claude-code"] },
  "runtimeAgent": "none",
  "scripts": { "migrate": "scripts/migrate.sh", "dev": "scripts/dev.sh" }
}
```

`packages/core/test/fixtures/templates/fixture-migrate/scripts/migrate.sh`:

```bash
#!/bin/sh
: "${PNEUMA_WORKSPACE:?}"
: "${PNEUMA_MIGRATE_DIRECTION:=up}"
echo "${PNEUMA_MIGRATE_DIRECTION}" > "$PNEUMA_WORKSPACE/.migrate-direction"
exit 0
```

`packages/core/test/fixtures/templates/fixture-migrate/scripts/dev.sh` (minimal):

```bash
#!/bin/sh
echo "##pneuma:service-ready viewer http://127.0.0.1:0"
echo "##pneuma:ready"
trap 'exit 0' TERM INT
while true; do sleep 0.1; done
```

```bash
chmod +x packages/core/test/fixtures/templates/fixture-migrate/scripts/migrate.sh
chmod +x packages/core/test/fixtures/templates/fixture-migrate/scripts/dev.sh
```

- [ ] **Step 2: Write the failing test**

`packages/core/test/lifecycle-migrate.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../src/lifecycle.js";

const FIXTURE = join(import.meta.dir, "fixtures/templates/fixture-migrate");

test("runMigrate() defaults to direction=up", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-migrate-up-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE, workspace: ws });
  const res = await orch.runMigrate();
  expect(res.exitCode).toBe(0);
  expect(res.direction).toBe("up");
  expect(readFileSync(join(ws, ".migrate-direction"), "utf8").trim()).toBe("up");
});

test("runMigrate({ direction: 'down' }) forwards the env var", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-migrate-down-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE, workspace: ws });
  const res = await orch.runMigrate({ direction: "down" });
  expect(res.direction).toBe("down");
  expect(readFileSync(join(ws, ".migrate-direction"), "utf8").trim()).toBe("down");
});
```

- [ ] **Step 3: Run to confirm fail**

```bash
bun test packages/core/test/lifecycle-migrate.test.ts
```
Expected: FAIL — `runMigrate is not a function`.

- [ ] **Step 4: Modify `packages/core/src/env.ts`**

Add to the `BuildLifecycleEnvOptions` interface:

```typescript
  migrateDirection?: "up" | "down";
```

In the returned env object, add (alongside the sessionId/wsUrl conditional):

```typescript
  if (opts.migrateDirection) out.PNEUMA_MIGRATE_DIRECTION = opts.migrateDirection;
```

- [ ] **Step 5: Modify `packages/core/src/lifecycle.ts`**

Add the type:

```typescript
export interface MigrateResult {
  exitCode: number;
  direction: "up" | "down";
}
```

Add the method after `runSetup`:

```typescript
async runMigrate(opts: { direction?: "up" | "down" } = {}): Promise<MigrateResult> {
  const direction = opts.direction ?? "up";
  const scriptPath = this.requireScript("migrate");
  const proc = this.spawnVerb("migrate", scriptPath, {
    mode: "dev",
    migrateDirection: direction,
  });
  const result = await proc.done;
  return { exitCode: result.code ?? -1, direction };
}
```

Extend the `spawnVerb` extra param type to accept `migrateDirection?: "up" | "down"` and pass it through to `buildLifecycleEnv`.

- [ ] **Step 6: Run to confirm green**

```bash
bun test packages/core/test/lifecycle-migrate.test.ts
bun test
```
Expected: 2 new pass. Full suite: 161 → 163.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/lifecycle.ts packages/core/src/env.ts packages/core/test/lifecycle-migrate.test.ts packages/core/test/fixtures/templates/fixture-migrate
git commit -m "$(cat <<'EOF'
feat(core): LifecycleOrchestrator.runMigrate with direction env var

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A3: `LifecycleOrchestrator.runFork()`

**Files:**
- Modify: `packages/core/src/lifecycle.ts`
- Modify: `packages/core/src/env.ts` (accept `PNEUMA_FORK_SOURCE` + `PNEUMA_FORK_TARGET`)
- Create: `packages/core/test/lifecycle-fork.test.ts`
- Create: `packages/core/test/fixtures/templates/fixture-fork/manifest.json`
- Create: `packages/core/test/fixtures/templates/fixture-fork/scripts/fork.sh`
- Create: `packages/core/test/fixtures/templates/fixture-fork/scripts/dev.sh`

- [ ] **Step 1: Create the fork fixture**

`packages/core/test/fixtures/templates/fixture-fork/manifest.json`:

```json
{
  "schemaVersion": 1,
  "name": "fixture-fork",
  "version": "0.0.1",
  "displayName": "Fixture Fork",
  "description": "Copies SOURCE to TARGET.",
  "backends": { "supported": ["claude-code"] },
  "runtimeAgent": "none",
  "scripts": { "fork": "scripts/fork.sh", "dev": "scripts/dev.sh" }
}
```

`packages/core/test/fixtures/templates/fixture-fork/scripts/fork.sh`:

```bash
#!/bin/sh
: "${PNEUMA_FORK_SOURCE:?}"
: "${PNEUMA_FORK_TARGET:?}"
mkdir -p "$PNEUMA_FORK_TARGET"
# Copy a single marker file from SRC to TGT (no real template file tree needed for the test).
if [ -f "$PNEUMA_FORK_SOURCE/marker.txt" ]; then
  cp "$PNEUMA_FORK_SOURCE/marker.txt" "$PNEUMA_FORK_TARGET/marker.txt"
fi
exit 0
```

`packages/core/test/fixtures/templates/fixture-fork/scripts/dev.sh` — same minimal pattern as A1/A2.

```bash
chmod +x packages/core/test/fixtures/templates/fixture-fork/scripts/fork.sh
chmod +x packages/core/test/fixtures/templates/fixture-fork/scripts/dev.sh
```

- [ ] **Step 2: Write the failing test**

`packages/core/test/lifecycle-fork.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../src/lifecycle.js";

const FIXTURE = join(import.meta.dir, "fixtures/templates/fixture-fork");

test("runFork() forwards source + target to fork.sh", async () => {
  const src = mkdtempSync(join(tmpdir(), "pneuma-fork-src-"));
  writeFileSync(join(src, "marker.txt"), "hello\n");
  const tgt = join(tmpdir(), `pneuma-fork-tgt-${Date.now()}`);
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE, workspace: src });
  const res = await orch.runFork({ sourceWorkspace: src, targetWorkspace: tgt });
  expect(res.exitCode).toBe(0);
  expect(res.targetWorkspace).toBe(tgt);
  expect(readFileSync(join(tgt, "marker.txt"), "utf8")).toBe("hello\n");
});
```

- [ ] **Step 3: Run to confirm fail**

```bash
bun test packages/core/test/lifecycle-fork.test.ts
```

- [ ] **Step 4: Modify `packages/core/src/env.ts`**

Add to `BuildLifecycleEnvOptions`:

```typescript
  forkSource?: string;
  forkTarget?: string;
```

In the returned env:

```typescript
  if (opts.forkSource) out.PNEUMA_FORK_SOURCE = opts.forkSource;
  if (opts.forkTarget) out.PNEUMA_FORK_TARGET = opts.forkTarget;
```

- [ ] **Step 5: Modify `packages/core/src/lifecycle.ts`**

Add the type near other results:

```typescript
export interface ForkResult {
  exitCode: number;
  targetWorkspace: string;
}

export interface ForkOptions {
  sourceWorkspace: string;
  targetWorkspace: string;
}
```

Add the method after `runMigrate`:

```typescript
async runFork(opts: ForkOptions): Promise<ForkResult> {
  const scriptPath = this.requireScript("fork");
  const proc = this.spawnVerb("fork", scriptPath, {
    mode: "dev",
    forkSource: opts.sourceWorkspace,
    forkTarget: opts.targetWorkspace,
  });
  const result = await proc.done;
  return { exitCode: result.code ?? -1, targetWorkspace: opts.targetWorkspace };
}
```

Extend `spawnVerb`'s extra arg type + its `buildLifecycleEnv` call to forward `forkSource` / `forkTarget`.

- [ ] **Step 6: Run to confirm green**

```bash
bun test packages/core/test/lifecycle-fork.test.ts
bun test
```
Expected: 1 new pass. Full suite: 163 → 164.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/lifecycle.ts packages/core/src/env.ts packages/core/test/lifecycle-fork.test.ts packages/core/test/fixtures/templates/fixture-fork
git commit -m "$(cat <<'EOF'
feat(core): LifecycleOrchestrator.runFork copies workspace via fork.sh

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A4: `runDeploy` gates on `unattendedDeploy`

**Files:**
- Modify: `packages/core/src/lifecycle.ts`
- Create: `packages/core/test/lifecycle-deploy-confirm.test.ts`
- Create: `packages/core/test/fixtures/templates/fixture-gated/manifest.json`
- Create: `packages/core/test/fixtures/templates/fixture-gated/scripts/dev.sh`
- Create: `packages/core/test/fixtures/templates/fixture-gated/scripts/build.sh`
- Create: `packages/core/test/fixtures/templates/fixture-gated/scripts/deploy.sh`

- [ ] **Step 1: Create the gated fixture**

`packages/core/test/fixtures/templates/fixture-gated/manifest.json` — same shape as other fixtures but with `"backends": { "supported": ["claude-code"], "defaultConfig": { "unattendedDeploy": false } }` and declared scripts dev / build / deploy.

```json
{
  "schemaVersion": 1,
  "name": "fixture-gated",
  "version": "0.0.1",
  "displayName": "Fixture Gated Deploy",
  "description": "Deploy is gated by unattendedDeploy: false.",
  "backends": {
    "supported": ["claude-code"],
    "defaultConfig": { "unattendedDeploy": false }
  },
  "runtimeAgent": "none",
  "scripts": {
    "dev": "scripts/dev.sh",
    "build": "scripts/build.sh",
    "deploy": "scripts/deploy.sh"
  }
}
```

`scripts/build.sh` — minimal build that produces a valid manifest:

```bash
#!/bin/sh
: "${PNEUMA_WORKSPACE:?}"
: "${PNEUMA_BUILD_DIR:?}"
mkdir -p "$PNEUMA_BUILD_DIR"
cat > "$PNEUMA_BUILD_DIR/build.manifest.json" <<JSON
{"schemaVersion":1,"kind":"local","entrypoint":"bin/app","produced":"$PNEUMA_BUILD_DIR","env":{},"notes":[],"deployHints":{}}
JSON
exit 0
```

`scripts/deploy.sh`:

```bash
#!/bin/sh
: "${PNEUMA_WORKSPACE:?}"
touch "$PNEUMA_WORKSPACE/.deploy-ran"
exit 0
```

`scripts/dev.sh` — standard minimal pattern.

Chmod +x all three.

- [ ] **Step 2: Write the failing test**

`packages/core/test/lifecycle-deploy-confirm.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../src/lifecycle.js";

const GATED = join(import.meta.dir, "fixtures/templates/fixture-gated");
const UNGATED = join(import.meta.dir, "fixtures/templates/fixture-min");

test("runDeploy with unattendedDeploy:false blocks until resolveConfirm('deploy','deploy','yes')", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-deploy-gated-"));
  const orch = new LifecycleOrchestrator({ templateDir: GATED, workspace: ws });
  await orch.runBuild();

  // Kick off deploy; it should NOT run deploy.sh yet.
  const deployPromise = orch.runDeploy();

  // Wait until the orchestrator registers the pending confirm.
  for (let i = 0; i < 40; i++) {
    if (orch.state.lastDeploy?.pendingConfirm?.label === "deploy") break;
    await new Promise((r) => setTimeout(r, 25));
  }
  expect(orch.state.lastDeploy?.pendingConfirm?.label).toBe("deploy");
  expect(existsSync(join(ws, ".deploy-ran"))).toBe(false);

  await orch.resolveConfirm("deploy", "deploy", "yes");
  const res = await deployPromise;
  expect(res.exitCode).toBe(0);
  expect(existsSync(join(ws, ".deploy-ran"))).toBe(true);
});

test("runDeploy with unattendedDeploy:false + resolveConfirm('no') short-circuits with exit 3", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-deploy-no-"));
  const orch = new LifecycleOrchestrator({ templateDir: GATED, workspace: ws });
  await orch.runBuild();
  const deployPromise = orch.runDeploy();
  for (let i = 0; i < 40; i++) {
    if (orch.state.lastDeploy?.pendingConfirm?.label === "deploy") break;
    await new Promise((r) => setTimeout(r, 25));
  }
  await orch.resolveConfirm("deploy", "deploy", "no");
  const res = await deployPromise;
  expect(res.exitCode).toBe(3);
  expect(existsSync(join(ws, ".deploy-ran"))).toBe(false);
});

test("runDeploy with unattendedDeploy NOT set in manifest runs directly (backward compat)", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-deploy-ungated-"));
  const orch = new LifecycleOrchestrator({ templateDir: UNGATED, workspace: ws });
  await orch.runBuild();
  const res = await orch.runDeploy();
  expect(res.exitCode).toBe(0);
});
```

- [ ] **Step 3: Run to confirm fail**

```bash
bun test packages/core/test/lifecycle-deploy-confirm.test.ts
```
Expected: the gated tests pass `deploy.sh` directly without confirmation, so `.deploy-ran` appears and the pendingConfirm never registers.

- [ ] **Step 4: Modify `packages/core/src/lifecycle.ts`**

Extend `runDeploy` to consult `unattendedDeploy`. Replace the method body:

```typescript
async runDeploy(options: { manifestPath?: string } = {}): Promise<DeployResult> {
  const scriptPath = this.requireScript("deploy");
  const manifestPath =
    options.manifestPath
    ?? this.state.lastBuild?.manifestPath
    ?? (this.state.lastBuild === undefined ? this.latestBuildManifest() : undefined);
  if (!manifestPath) return { exitCode: 2 };

  // Consult the manifest's unattendedDeploy flag. When false (default), the
  // orchestrator injects a synthetic needs-confirm marker BEFORE spawning the
  // script and waits for resolveConfirm("deploy", "deploy", ...) to fire. This
  // matches the ##pneuma:needs-confirm flow templates use on the dev side, but
  // is driven by the orchestrator rather than a script-emitted marker.
  const unattended = this.manifest.backends?.defaultConfig?.unattendedDeploy === true;

  if (!unattended) {
    const decision = await this.awaitDeployConfirm();
    if (decision === "no") {
      // Record a synthetic VerbExecution for state-observability.
      this.state.lastDeploy = {
        verb: "deploy", pid: -1, startedAt: Date.now(),
        state: "exited", exitedAt: Date.now(), exitCode: 3, services: [],
      };
      return { exitCode: 3 };
    }
  }

  const proc = this.spawnVerb("deploy", scriptPath, {
    mode: "release",
    artifactManifestPath: manifestPath,
  });
  const result = await proc.done;
  return { exitCode: result.code ?? -1 };
}

/**
 * Register a synthetic pendingConfirm on state.lastDeploy and return a promise
 * that resolves when the builder answers via resolveConfirm("deploy","deploy",…).
 */
private awaitDeployConfirm(): Promise<"yes" | "no"> {
  return new Promise((resolve) => {
    const slot: VerbExecution = {
      verb: "deploy", pid: -1, startedAt: Date.now(),
      state: "running", services: [],
      pendingConfirm: { label: "deploy", at: Date.now() },
    };
    this.state.lastDeploy = slot;
    // Install a resolver keyed on verb "deploy" label "deploy" — resolveConfirm
    // (below) looks it up by (verb, label) and invokes this callback.
    this.deployConfirmResolver = resolve;
  });
}

private deployConfirmResolver?: (decision: "yes" | "no") => void;
```

Extend `resolveConfirm` to handle the deploy case — insert at the top of the method:

```typescript
if (verb === "deploy" && label === "deploy" && this.deployConfirmResolver) {
  const resolver = this.deployConfirmResolver;
  this.deployConfirmResolver = undefined;
  const slot = this.state.lastDeploy;
  if (slot) slot.pendingConfirm = undefined;
  resolver(decision);
  return;
}
```

(Keep the rest of `resolveConfirm` as-is — it handles script-emitted marker flows for dev/build.)

- [ ] **Step 5: Run to confirm green**

```bash
bun test packages/core/test/lifecycle-deploy-confirm.test.ts
bun test
```
Expected: 3 new pass. Full suite: 164 → 167.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/lifecycle.ts packages/core/test/lifecycle-deploy-confirm.test.ts packages/core/test/fixtures/templates/fixture-gated
git commit -m "$(cat <<'EOF'
feat(core): runDeploy gates on manifest unattendedDeploy + resolveConfirm

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A5: Tool-API routing for setup/migrate/fork

**Files:**
- Modify: `packages/core/src/tools/action.ts`
- Create: `packages/core/test/tools/action-setup-migrate-fork.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/test/tools/action-setup-migrate-fork.test.ts`:

```typescript
import { test, expect } from "bun:test";
import { mkdtempSync, existsSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../../src/lifecycle.js";
import { createToolRegistry } from "../../src/tools/registry.js";
import { registerActionTools } from "../../src/tools/action.js";

const SETUP = join(import.meta.dir, "../fixtures/templates/fixture-setup");
const MIGRATE = join(import.meta.dir, "../fixtures/templates/fixture-migrate");
const FORK = join(import.meta.dir, "../fixtures/templates/fixture-fork");

test("lifecycle.setup.run routes to runSetup", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-tool-setup-"));
  const orch = new LifecycleOrchestrator({ templateDir: SETUP, workspace: ws });
  const reg = createToolRegistry({ orchestrator: orch });
  registerActionTools(reg);
  const r = await reg.call("lifecycle.setup.run", {});
  expect(r.ok).toBe(true);
  expect(existsSync(join(ws, ".setup-ran"))).toBe(true);
});

test("lifecycle.migrate.run routes to runMigrate with direction", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-tool-migrate-"));
  const orch = new LifecycleOrchestrator({ templateDir: MIGRATE, workspace: ws });
  const reg = createToolRegistry({ orchestrator: orch });
  registerActionTools(reg);
  const r = await reg.call("lifecycle.migrate.run", { direction: "up" });
  expect(r.ok).toBe(true);
  expect(readFileSync(join(ws, ".migrate-direction"), "utf8").trim()).toBe("up");
});

test("lifecycle.fork.run routes to runFork", async () => {
  const src = mkdtempSync(join(tmpdir(), "pneuma-tool-fork-src-"));
  writeFileSync(join(src, "marker.txt"), "hi\n");
  const tgt = join(tmpdir(), `pneuma-tool-fork-tgt-${Date.now()}`);
  const orch = new LifecycleOrchestrator({ templateDir: FORK, workspace: src });
  const reg = createToolRegistry({ orchestrator: orch });
  registerActionTools(reg);
  const r = (await reg.call("lifecycle.fork.run", { source: src, target: tgt })) as {
    ok: boolean; state: { targetWorkspace: string };
  };
  expect(r.ok).toBe(true);
  expect(r.state.targetWorkspace).toBe(tgt);
  expect(readFileSync(join(tgt, "marker.txt"), "utf8")).toBe("hi\n");
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
bun test packages/core/test/tools/action-setup-migrate-fork.test.ts
```
Expected: tools still return `not-implemented` stubs.

- [ ] **Step 3: Modify `packages/core/src/tools/action.ts`**

Replace the three stub handler bodies with real routing:

```typescript
// lifecycle.setup.run
async (ctx): Promise<ToolResult> => {
  const res = await ctx.orchestrator.runSetup();
  if (res.exitCode !== 0) return { ok: false, error: `setup exited with code ${res.exitCode}` };
  return { ok: true, state: { exitCode: 0 } };
},

// lifecycle.migrate.run
async (ctx, params): Promise<ToolResult> => {
  const dir = params.direction === "down" ? "down" : "up";
  const res = await ctx.orchestrator.runMigrate({ direction: dir });
  if (res.exitCode !== 0) return { ok: false, error: `migrate exited with code ${res.exitCode}` };
  return { ok: true, state: { direction: res.direction } };
},

// lifecycle.fork.run
async (ctx, params): Promise<ToolResult> => {
  const source = typeof params.source === "string" ? params.source : ctx.orchestrator.workspace;
  const target = params.target;
  if (typeof target !== "string" || target.length === 0) {
    return { ok: false, error: "lifecycle.fork.run requires a non-empty target" };
  }
  const res = await ctx.orchestrator.runFork({ sourceWorkspace: source, targetWorkspace: target });
  if (res.exitCode !== 0) return { ok: false, error: `fork exited with code ${res.exitCode}` };
  return { ok: true, state: { targetWorkspace: res.targetWorkspace } };
},
```

Update the `lifecycle.setup.run` descriptor so it exists in the first place (M2 only registered a stub for migrate/fork — setup was missing entirely). Insert a new `reg.register` block alongside the others:

```typescript
reg.register(
  {
    name: "lifecycle.setup.run",
    description: "Run setup.sh (one-time workspace initialization).",
    inputSchema: { type: "object", properties: {}, required: [] },
  },
  async (ctx): Promise<ToolResult> => {
    const res = await ctx.orchestrator.runSetup();
    if (res.exitCode !== 0) return { ok: false, error: `setup exited with code ${res.exitCode}` };
    return { ok: true, state: { exitCode: 0 } };
  },
);
```

- [ ] **Step 4: Run to confirm green**

```bash
bun test packages/core/test/tools/action-setup-migrate-fork.test.ts
bun test
```
Expected: 3 new pass. Full suite: 167 → 170.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tools/action.ts packages/core/test/tools/action-setup-migrate-fork.test.ts
git commit -m "$(cat <<'EOF'
feat(core): tool-API routes setup/migrate/fork to real orchestrator methods

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task A6: Update `buildToolRegistry` registry list + tool-list expectation

**Files:**
- Modify: `packages/core/test/tools/build.test.ts` (expect 14 tools now, not 13)

- [ ] **Step 1: Update the failing expectation**

In `packages/core/test/tools/build.test.ts`, update the `expect(names).toEqual([...])` block to include `"lifecycle.setup.run"`:

```typescript
expect(names).toEqual([
  "checkpoint.list",
  "checkpoint.rewind",
  "lifecycle.build.run",
  "lifecycle.confirm",
  "lifecycle.deploy.run",
  "lifecycle.dev.restart",
  "lifecycle.dev.start",
  "lifecycle.dev.stop",
  "lifecycle.fork.run",
  "lifecycle.logs",
  "lifecycle.migrate.run",
  "lifecycle.setup.run",
  "lifecycle.state",
  "workspace.tree",
]);
```

- [ ] **Step 2: Run**

```bash
bun test packages/core/test/tools/build.test.ts
bun test
```
Expected: all green. Full suite stays at 170 (no new test, just updated expectation).

- [ ] **Step 3: Commit**

```bash
git add packages/core/test/tools/build.test.ts
git commit -m "$(cat <<'EOF'
test(core): buildToolRegistry now lists 14 tools (adds lifecycle.setup.run)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Phase B — viewer-react: permission-prompt UI (3 tasks)

### Task B1: `usePneumaState` tracks pendingPrompt

**Files:**
- Modify: `packages/viewer-react/src/usePneumaState.ts`
- Modify: `packages/viewer-react/test/hooks.test.tsx`

- [ ] **Step 1: Append failing test**

Append to `packages/viewer-react/test/hooks.test.tsx` (inside the existing test suite — paste next to the existing `usePneumaState` test):

```typescript
test("usePneumaState exposes pendingPrompt when a permission-prompt arrives", async () => {
  const prevWS = globalThis.WebSocket;
  class FakeWS extends EventTarget {
    static instance: FakeWS | undefined;
    readyState = 1;
    constructor(_url: string) {
      super(); FakeWS.instance = this;
      queueMicrotask(() => this.dispatchEvent(new Event("open")));
    }
    send(_: string): void {}
    close(): void { this.dispatchEvent(new Event("close")); }
    inject(env: unknown): void {
      const ev = new Event("message") as Event & { data: string };
      ev.data = JSON.stringify(env);
      this.dispatchEvent(ev);
    }
  }
  (globalThis as unknown as { WebSocket: typeof FakeWS }).WebSocket = FakeWS;
  try {
    function Probe() {
      const { pendingPrompt } = usePneumaState();
      return React.createElement(
        "pre", {},
        pendingPrompt ? JSON.stringify(pendingPrompt) : "none",
      );
    }
    const { container } = render(
      React.createElement(PneumaViewer, { wsUrl: "ws://x/p", sid: "p" }, React.createElement(Probe)),
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    FakeWS.instance!.inject({
      dir: "a2v", kind: "permission-prompt",
      prompt: { id: "req-7", tool: "deploy", detail: { target: "prod" } },
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(container.querySelector("pre")!.textContent).toContain("req-7");
  } finally {
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = prevWS;
  }
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
bun test packages/viewer-react/test/hooks.test.tsx
```
Expected: fail — `pendingPrompt` is undefined on the hook result.

- [ ] **Step 3: Modify `packages/viewer-react/src/usePneumaState.ts`**

Add `PermissionPrompt` to the import from `@pneuma-framework/core`:

```typescript
import type { PermissionPrompt, WireEnvelope } from "@pneuma-framework/core";
```

Extend `PneumaViewerState`:

```typescript
export interface PneumaViewerState {
  turns: Record<string, string>;
  docs: Record<string, string>;
  toasts: Array<{ message: string; level: "info" | "warn" | "error"; ts: number }>;
  /** Most recent a2v permission-prompt, cleared once the builder answers. */
  pendingPrompt?: PermissionPrompt;
}
```

Add a case in the subscribe handler for `permission-prompt`:

```typescript
if (env.kind === "permission-prompt") {
  setState((s) => ({ ...s, pendingPrompt: env.prompt }));
  return;
}
```

Also add a way to clear it — add a handler that checks for an internal `__dismissPrompt` synthetic envelope. Simpler: just clear on subsequent toast envelopes? No — expose a clearer. Actually cleanest: clear it when a new permission-prompt arrives (replaces) or when explicitly dismissed. For v0, add a small helper exported alongside:

Actually the simplest path: `PermissionPrompt` component (Task B2) sends the response envelope via `useAction` AND calls a `clearPendingPrompt` function we add to the hook's return value. Update the hook shape:

```typescript
export interface PneumaViewerState {
  turns: Record<string, string>;
  docs: Record<string, string>;
  toasts: Array<{ message: string; level: "info" | "warn" | "error"; ts: number }>;
  pendingPrompt?: PermissionPrompt;
}

export function usePneumaState(): PneumaViewerState & { clearPendingPrompt: () => void } {
  const { sid, subscribe } = useWireConnection();
  const [state, setState] = useState<PneumaViewerState>(empty);
  // ... existing useEffect blocks ...
  const clearPendingPrompt = useCallback(() => {
    setState((s) => ({ ...s, pendingPrompt: undefined }));
  }, []);
  return { ...state, clearPendingPrompt };
}
```

Add `useCallback` to imports.

- [ ] **Step 4: Run to confirm green**

```bash
bun test packages/viewer-react/test/hooks.test.tsx
bun test
```
Expected: 1 new pass. Full suite: 170 → 171.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer-react/src/usePneumaState.ts packages/viewer-react/test/hooks.test.tsx
git commit -m "$(cat <<'EOF'
feat(viewer-react): usePneumaState tracks pendingPrompt + clearPendingPrompt

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task B2: `<PermissionPrompt>` component

**Files:**
- Create: `packages/viewer-react/src/PermissionPrompt.tsx`
- Modify: `packages/viewer-react/src/index.ts`
- Create: `packages/viewer-react/test/PermissionPrompt.test.tsx`

- [ ] **Step 1: Write the failing test**

`packages/viewer-react/test/PermissionPrompt.test.tsx`:

```typescript
import { GlobalRegistrator } from "@happy-dom/global-registrator";
const PRESERVED_GLOBALS = [
  "fetch", "Request", "Response", "Headers", "WebSocket", "FormData",
  "Blob", "File", "URL", "AbortController", "AbortSignal",
  "Event", "EventTarget", "queueMicrotask",
  "setTimeout", "setInterval", "clearTimeout", "clearInterval",
] as const;
const nativeGlobals: Record<string, unknown> = {};
for (const k of PRESERVED_GLOBALS) nativeGlobals[k] = (globalThis as unknown as Record<string, unknown>)[k];
if (!("window" in globalThis)) GlobalRegistrator.register();
for (const k of PRESERVED_GLOBALS) (globalThis as unknown as Record<string, unknown>)[k] = nativeGlobals[k];

import { test, expect } from "bun:test";
import { render, act, fireEvent } from "@testing-library/react";
import * as React from "react";
import { PneumaViewer, PermissionPrompt } from "../src/index.js";

test("PermissionPrompt renders nothing when pendingPrompt is unset", async () => {
  const prevWS = globalThis.WebSocket;
  class FakeWS extends EventTarget {
    readyState = 1;
    constructor(_url: string) { super(); queueMicrotask(() => this.dispatchEvent(new Event("open"))); }
    send(_: string): void {}
    close(): void { this.dispatchEvent(new Event("close")); }
  }
  (globalThis as unknown as { WebSocket: typeof FakeWS }).WebSocket = FakeWS;
  try {
    const { container } = render(
      React.createElement(PneumaViewer, { wsUrl: "ws://x/a", sid: "a" },
        React.createElement(PermissionPrompt),
      ),
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(container.querySelector(".pneuma-prompt")).toBeNull();
  } finally {
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = prevWS;
  }
});

test("PermissionPrompt renders tool name + Allow/Deny; Allow sends permission-response", async () => {
  const sent: unknown[] = [];
  const prevWS = globalThis.WebSocket;
  class FakeWS extends EventTarget {
    static instance: FakeWS | undefined;
    readyState = 1;
    constructor(_url: string) { super(); FakeWS.instance = this; queueMicrotask(() => this.dispatchEvent(new Event("open"))); }
    send(d: string): void { sent.push(JSON.parse(d)); }
    close(): void { this.dispatchEvent(new Event("close")); }
    inject(env: unknown): void {
      const ev = new Event("message") as Event & { data: string };
      ev.data = JSON.stringify(env);
      this.dispatchEvent(ev);
    }
  }
  (globalThis as unknown as { WebSocket: typeof FakeWS }).WebSocket = FakeWS;
  try {
    const { container } = render(
      React.createElement(PneumaViewer, { wsUrl: "ws://x/b", sid: "b" },
        React.createElement(PermissionPrompt),
      ),
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    FakeWS.instance!.inject({
      dir: "a2v", kind: "permission-prompt",
      prompt: { id: "req-1", tool: "deploy", detail: {} },
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const allowBtn = container.querySelector('[data-permission="allow"]') as HTMLButtonElement | null;
    expect(allowBtn).not.toBeNull();
    await act(async () => { fireEvent.click(allowBtn!); });
    const resp = sent.find((e) => (e as { kind?: string }).kind === "permission-response") as
      | { response: { id: string; decision: string } } | undefined;
    expect(resp?.response.id).toBe("req-1");
    expect(resp?.response.decision).toBe("allow");
    // Prompt should clear after answer.
    expect(container.querySelector(".pneuma-prompt")).toBeNull();
  } finally {
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = prevWS;
  }
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
bun test packages/viewer-react/test/PermissionPrompt.test.tsx
```
Expected: `PermissionPrompt` not exported.

- [ ] **Step 3: Implement `packages/viewer-react/src/PermissionPrompt.tsx`**

```typescript
import { useAction, usePneumaState } from "./index.js";

/**
 * Renders a dismissible banner whenever the agent backend has requested
 * permission to run a tool. Calling Allow or Deny sends a permission-response
 * envelope back and clears the pending prompt.
 */
export function PermissionPrompt() {
  const { pendingPrompt, clearPendingPrompt } = usePneumaState();
  const sendAction = useAction();
  if (!pendingPrompt) return null;

  const answer = (decision: "allow" | "deny"): void => {
    // Note: a permission-response is carried via a dedicated v2a envelope, not
    // an "action". We therefore bypass useAction and dispatch directly through
    // the underlying wire connection.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    void sendAction;
    // Fall through to the helper hook (added below) that sends the right kind.
    sendPermissionResponse(pendingPrompt.id, decision);
    clearPendingPrompt();
  };

  return (
    <div
      className="pneuma-prompt"
      role="alertdialog"
      aria-live="assertive"
      style={{
        position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)",
        zIndex: 10, background: "var(--paper, #fff)",
        border: "1px solid var(--rule-strong, #bbb)",
        padding: "12px 16px", fontFamily: "var(--type-sans, system-ui)",
        fontSize: 13, display: "flex", gap: 12, alignItems: "center",
      }}
    >
      <span>
        Agent wants to run <code>{pendingPrompt.tool}</code>
        {Object.keys(pendingPrompt.detail).length > 0 && (
          <> — <span style={{ color: "var(--ink-muted, #888)" }}>{Object.keys(pendingPrompt.detail).join(", ")}</span></>
        )}
      </span>
      <button
        data-permission="allow"
        onClick={() => answer("allow")}
        style={{ padding: "4px 10px", border: "1px solid var(--accent, #c66)", cursor: "pointer" }}
      >Allow · 允许</button>
      <button
        data-permission="deny"
        onClick={() => answer("deny")}
        style={{ padding: "4px 10px", border: "1px solid var(--rule, #ccc)", cursor: "pointer" }}
      >Deny · 拒绝</button>
    </div>
  );
}
```

The `sendPermissionResponse` helper doesn't exist yet — the envelope is NOT an `action`, so we can't use `useAction`. Add a sibling hook for this in `index.ts` instead (see next sub-task).

Before that, add to `packages/viewer-react/src/index.ts`:

```typescript
import { useCallback } from "react";
import { useWireConnection } from "./useWireConnection.js";

/**
 * Helper for answering a permission-prompt. Internal to the SDK — exposed via
 * <PermissionPrompt> so consumers don't have to reach for the raw envelope.
 */
function sendPermissionResponse(id: string, decision: "allow" | "deny" | "allow-always"): void {
  // This is used by <PermissionPrompt>, which itself must be inside <PneumaViewer>.
  // We hook into the context via a small internal component-level helper.
  // But since this is a plain function, it can't read context — so we re-export
  // a hook instead:
}

export function usePermissionResponder(): (id: string, decision: "allow" | "deny" | "allow-always") => boolean {
  const { send } = useWireConnection();
  return useCallback(
    (id, decision) => send({ dir: "v2a", kind: "permission-response", response: { id, decision } }),
    [send],
  );
}
```

Then update `PermissionPrompt.tsx` to use the new hook:

```typescript
import { useAction, usePneumaState, usePermissionResponder } from "./index.js";

export function PermissionPrompt() {
  const { pendingPrompt, clearPendingPrompt } = usePneumaState();
  const respond = usePermissionResponder();
  if (!pendingPrompt) return null;
  const answer = (decision: "allow" | "deny"): void => {
    respond(pendingPrompt.id, decision);
    clearPendingPrompt();
  };
  return (/* ... JSX from above, unchanged ... */);
}
```

Export `PermissionPrompt` from `index.ts`:

```typescript
export { PermissionPrompt } from "./PermissionPrompt.js";
```

- [ ] **Step 4: Run to confirm green**

```bash
bun test packages/viewer-react/test/PermissionPrompt.test.tsx
bun test
bun run typecheck
```
Expected: 2 new pass. Full suite: 171 → 173. Typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer-react/src packages/viewer-react/test/PermissionPrompt.test.tsx
git commit -m "$(cat <<'EOF'
feat(viewer-react): <PermissionPrompt> banner + usePermissionResponder hook

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task B3: Wire `<PermissionPrompt>` into the doc-mode viewer

**Files:**
- Modify: `templates/doc/viewer/src/Shell.tsx`

- [ ] **Step 1: Modify Shell.tsx**

```typescript
import { useState } from "react";
import { PermissionPrompt } from "@pneuma-framework/viewer-react";
import { MarkdownPreview } from "./MarkdownPreview.js";
import { ChatPanel } from "./ChatPanel.js";

export function Shell() {
  const [chatOpen, setChatOpen] = useState(true);
  return (
    <div className="shell" data-chat={chatOpen ? "open" : "closed"}>
      <PermissionPrompt />
      <div className="reading-col">
        <MarkdownPreview />
      </div>
      <ChatPanel open={chatOpen} onToggle={() => setChatOpen((o) => !o)} />
    </div>
  );
}
```

- [ ] **Step 2: Compile-check**

```bash
bun build --target=browser templates/doc/viewer/src/main.tsx --outfile /tmp/doc-compile.js 2>&1 | tail -3
test -s /tmp/doc-compile.js && echo OK
tsc --noEmit -p templates/doc/viewer/tsconfig.json
```

- [ ] **Step 3: Commit**

```bash
git add templates/doc/viewer/src/Shell.tsx
git commit -m "$(cat <<'EOF'
feat(templates/doc/viewer): mount <PermissionPrompt> so confirm flows surface

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Phase C — CLI: setup / migrate / fork verbs (2 tasks)

### Task C1: Extend parse-args for setup / migrate / fork

**Files:**
- Modify: `packages/cli/src/parse-args.ts`
- Modify: `packages/cli/test/parse-args.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `packages/cli/test/parse-args.test.ts`:

```typescript
test("parseArgs supports setup verb", () => {
  const r = parseArgs(["setup", "./tpl"]);
  expect(r.verb).toBe("setup");
  expect(r.templateDir).toBe("./tpl");
});

test("parseArgs supports migrate verb with --direction", () => {
  const r = parseArgs(["migrate", "./tpl", "--direction", "up"]);
  expect(r.verb).toBe("migrate");
  expect(r.direction).toBe("up");
});

test("parseArgs rejects --direction with unknown value", () => {
  expect(() => parseArgs(["migrate", "./tpl", "--direction", "sideways"])).toThrow(/direction/);
});

test("parseArgs supports fork verb with --source / --target", () => {
  const r = parseArgs(["fork", "./tpl", "--source", "/src", "--target", "/tgt"]);
  expect(r.verb).toBe("fork");
  expect(r.source).toBe("/src");
  expect(r.target).toBe("/tgt");
});

test("parseArgs supports --unattended flag on deploy", () => {
  const r = parseArgs(["deploy", "./tpl", "--unattended"]);
  expect(r.unattended).toBe(true);
});
```

- [ ] **Step 2: Run to confirm fail**

```bash
bun test packages/cli/test/parse-args.test.ts
```

- [ ] **Step 3: Modify `packages/cli/src/parse-args.ts`**

Update `SUPPORTED_VERBS`:

```typescript
const SUPPORTED_VERBS = ["dev", "build", "deploy", "stop", "setup", "migrate", "fork"] as const;
```

Add fields to `ParsedArgs`:

```typescript
export interface ParsedArgs {
  verb: SupportedVerb;
  templateDir: string;
  workspace?: string;
  port?: number;
  backend?: string;
  direction?: "up" | "down";
  source?: string;
  target?: string;
  unattended?: boolean;
}
```

Inside the flag-parsing loop, add cases:

```typescript
if (a === "--direction") {
  const v = rest[++i];
  if (v !== "up" && v !== "down") throw new Error(`--direction must be "up" or "down", got ${v}`);
  direction = v;
  continue;
}
if (a === "--source") { source = rest[++i]; if (!source) throw new Error("--source requires a path"); continue; }
if (a === "--target") { target = rest[++i]; if (!target) throw new Error("--target requires a path"); continue; }
if (a === "--unattended") { unattended = true; continue; }
```

Update the default-object return to include the new fields.

- [ ] **Step 4: Run green**

```bash
bun test packages/cli/test/parse-args.test.ts
bun test
bun run typecheck
```
Expected: 5 new pass. Full suite: 173 → 178.

- [ ] **Step 5: Commit**

```bash
git add packages/cli/src/parse-args.ts packages/cli/test/parse-args.test.ts
git commit -m "$(cat <<'EOF'
feat(cli): parse setup / migrate / fork verbs + --direction / --source / --target / --unattended

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task C2: Wire new verbs into CLI main

**Files:**
- Modify: `packages/cli/src/index.ts`

- [ ] **Step 1: Modify the verb switch**

Add three new `case` blocks inside the `switch (parsed.verb)` block, AFTER `stop`:

```typescript
case "setup": {
  log("setting up");
  const res = await fw.orchestrator.runSetup();
  return res.exitCode;
}
case "migrate": {
  log(`migrating (${parsed.direction ?? "up"})`);
  const res = await fw.orchestrator.runMigrate({ direction: parsed.direction ?? "up" });
  return res.exitCode;
}
case "fork": {
  const source = parsed.source ?? workspace;
  const target = parsed.target;
  if (!target) {
    console.error("pneuma-framework: fork requires --target <path>");
    return 2;
  }
  log(`forking ${source} → ${target}`);
  const res = await fw.orchestrator.runFork({ sourceWorkspace: source, targetWorkspace: target });
  return res.exitCode;
}
```

Update `printUsage`:

```typescript
function printUsage(): void {
  console.error(`
Usage: pneuma-framework <verb> <templateDir> [options]
Verbs:
  dev      [--workspace <path>] [--port <n>] [--backend <name>]
  build    [--workspace <path>]
  deploy   [--workspace <path>] [--unattended]
  stop     [--workspace <path>]
  setup    [--workspace <path>]
  migrate  [--workspace <path>] [--direction up|down]
  fork     [--source <path>] --target <path>

Backends: opencode
`);
}
```

For the `deploy` verb path, thread `parsed.unattended` as a manifest override. Simplest: before creating `fw`, if `parsed.unattended` is true on the deploy path, set an env var that dev.sh can read — OR (better) expose a method on the orchestrator. For v0 we can short-circuit by pre-resolving: on `deploy` + `--unattended`, call `orchestrator.resolveConfirm("deploy","deploy","yes")` immediately after `runDeploy` returns a pending confirm. BUT the orchestrator's runDeploy returns only after the deploy actually finishes. So we need a different hook.

Simplest approach: expose a pre-flag on the orchestrator that skips the gate:

In `packages/core/src/lifecycle.ts`, add:

```typescript
/** When true, runDeploy skips the unattendedDeploy gate — used by CLI --unattended. */
allowUnattendedDeploy = false;
```

In `runDeploy`, change the gate check:

```typescript
const unattended = this.manifest.backends?.defaultConfig?.unattendedDeploy === true || this.allowUnattendedDeploy;
```

In `packages/cli/src/index.ts`:

```typescript
case "deploy": {
  if (parsed.unattended) fw.orchestrator.allowUnattendedDeploy = true;
  log("deploying");
  const res = await fw.orchestrator.runDeploy();
  return res.exitCode;
}
```

- [ ] **Step 2: Run full suite + typecheck**

```bash
bun test
bun run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add packages/cli/src/index.ts packages/core/src/lifecycle.ts
git commit -m "$(cat <<'EOF'
feat(cli): setup / migrate / fork verbs + --unattended override for deploy

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Phase D — Template: skeleton + DB + setup + migrate (5 tasks)

### Task D1: `templates/ai-bookmarks` manifest + skill + scaffold

**Files:**
- Create: `templates/ai-bookmarks/manifest.json`
- Create: `templates/ai-bookmarks/skill/SKILL.md`
- Create: `templates/ai-bookmarks/scaffold/lenses.json`
- Create: `templates/ai-bookmarks/scaffold/migrations/001-init.sql`

- [ ] **Step 1: Create `templates/ai-bookmarks/manifest.json`**

```json
{
  "schemaVersion": 1,
  "name": "ai-bookmarks",
  "version": "0.1.0",
  "displayName": "AI Bookmarks",
  "description": "AI-native bookmarks: paste a URL, get multi-lens interpretations, explore via timeline and a similarity graph.",
  "backends": {
    "supported": ["opencode", "claude-code", "codex"],
    "defaultConfig": { "unattendedDeploy": false }
  },
  "runtimeAgent": "embedded",
  "scripts": {
    "setup":   "scripts/setup.sh",
    "dev":     "scripts/dev.sh",
    "stop":    "scripts/stop.sh",
    "build":   "scripts/build.sh",
    "deploy":  "scripts/deploy.sh",
    "migrate": "scripts/migrate.sh",
    "fork":    "scripts/fork.sh"
  }
}
```

- [ ] **Step 2: Create `templates/ai-bookmarks/skill/SKILL.md`**

```markdown
---
name: ai-bookmarks
description: >
  AI bookmarks workspace: a Bun server + SQLite app that interprets URLs through
  configurable "lenses" (each a system prompt). Edit lenses.json, add migrations,
  customize the React viewer — live preview + hot reload.
---

# AI Bookmarks — Build-phase Agent Skill

This workspace is an AI-native bookmarks app. Users paste URLs; the app fetches
content (via Jina Reader), sends it through each configured *lens* (a named
system prompt), stores the interpretations with vector embeddings in SQLite,
and displays a timeline + similarity graph. Your job as the build-phase agent
is to help the builder customize:

## Lenses

The source of truth for lenses is `workspace/lenses.json`. Shape:

```json
{
  "lenses": [
    { "name": "technical-depth", "displayName": "Technical Depth",
      "prompt": "Read as a senior engineer. What's novel? What would break at scale?" },
    { "name": "personal-relevance", "displayName": "Personal Relevance",
      "prompt": "How does this connect to the reader's ongoing interests in X/Y/Z?" }
  ]
}
```

When the builder asks to add / rename / reword a lens:
- Edit `workspace/lenses.json` directly.
- Keep `name` kebab-case (used as a DB key).
- Server hot-reloads on file change; no restart needed.

## Migrations

SQL migrations live in `workspace/migrations/NNN-description.sql`, applied in
filename order. To add a schema change:
- Create `workspace/migrations/NNN-<description>.sql` (NNN = zero-padded).
- Write the up migration (v0 does not support down).
- Run `bun run migrate` OR call the `lifecycle.migrate.run` tool.

## Viewer customization

The React viewer lives at `workspace/viewer/`. Edit `.tsx` files freely; Bun's
hot reload picks up changes. Main files:
- `src/TimelineView.tsx` — card list
- `src/GraphView.tsx` — react-flow network
- `src/styles.css` — editorial palette

## Constraints

- Do not edit `.pneuma-data/` — that's the runtime DB + framework state.
- Do not commit secrets. `OPENROUTER_API_KEY` is read from the environment at
  runtime; never embed it in source.
- Match the user's language for chat replies.

## 中文说明

这是一个 AI 书签工作区：用户贴 URL，app 按配置好的多个"lens"（不同系统提示）
解读，存进 SQLite，附带向量 embedding，前端显示时间线 + 相似度图。你作为
build-phase agent 的职责是帮 builder 自定义：lenses.json 里的 prompts、
workspace/migrations/ 下的 schema 变更、viewer 里的 React 组件。

用户说中文就用中文回复；编辑文件时 markdown/JSON 结构保持原样。
```

- [ ] **Step 3: Create `templates/ai-bookmarks/scaffold/lenses.json`**

```json
{
  "lenses": [
    {
      "name": "technical-depth",
      "displayName": "Technical Depth · 技术深度",
      "prompt": "You are a senior engineer reading this URL. In 3-5 bullet points: what's novel or counter-intuitive? what's the likely failure mode at scale? which concepts would a reader need to dig into to evaluate this deeply?"
    },
    {
      "name": "personal-relevance",
      "displayName": "Personal Relevance · 个人相关性",
      "prompt": "You are a research assistant tracking the reader's ongoing interests. In 3-5 bullet points: how does this piece connect to things the reader already cares about? what new threads does it open? what is the single most useful action the reader might take after reading it?"
    }
  ]
}
```

- [ ] **Step 4: Create `templates/ai-bookmarks/scaffold/migrations/001-init.sql`**

Copy the schema block from the "Canonical types" section of this plan.

- [ ] **Step 5: Commit**

```bash
git add templates/ai-bookmarks/manifest.json templates/ai-bookmarks/skill templates/ai-bookmarks/scaffold
git commit -m "$(cat <<'EOF'
feat(templates/ai-bookmarks): manifest + skill + scaffold lenses/migrations

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task D2: Lifecycle scripts — setup + migrate + fork + stop

**Files:**
- Create: `templates/ai-bookmarks/scripts/setup.sh`
- Create: `templates/ai-bookmarks/scripts/migrate.sh`
- Create: `templates/ai-bookmarks/scripts/fork.sh`
- Create: `templates/ai-bookmarks/scripts/stop.sh`

- [ ] **Step 1: setup.sh**

`templates/ai-bookmarks/scripts/setup.sh`:

```bash
#!/bin/sh
set -eu
: "${PNEUMA_WORKSPACE:?}"

TEMPLATE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WS="$PNEUMA_WORKSPACE"

mkdir -p "$WS/.pneuma-data"
mkdir -p "$WS/migrations"
mkdir -p "$WS/viewer/src"

# Seed scaffolds the first time.
if [ ! -f "$WS/lenses.json" ]; then
  cp "$TEMPLATE_DIR/scaffold/lenses.json" "$WS/lenses.json"
fi
if [ ! -f "$WS/migrations/001-init.sql" ]; then
  cp "$TEMPLATE_DIR/scaffold/migrations/001-init.sql" "$WS/migrations/"
fi
if [ ! -f "$WS/AGENTS.md" ]; then
  cp "$TEMPLATE_DIR/skill/SKILL.md" "$WS/AGENTS.md"
fi

echo "##pneuma:progress 30 seeded scaffolds"

# Run initial migration.
PNEUMA_MIGRATE_DIRECTION=up sh "$TEMPLATE_DIR/scripts/migrate.sh"

echo "##pneuma:progress 100 ready"
exit 0
```

- [ ] **Step 2: migrate.sh**

`templates/ai-bookmarks/scripts/migrate.sh`:

```bash
#!/bin/sh
set -eu
: "${PNEUMA_WORKSPACE:?}"
: "${PNEUMA_MIGRATE_DIRECTION:=up}"

WS="$PNEUMA_WORKSPACE"
DB="$WS/.pneuma-data/db.sqlite"
mkdir -p "$WS/.pneuma-data"

if [ "$PNEUMA_MIGRATE_DIRECTION" != "up" ]; then
  echo "pneuma: only direction=up is supported in v0 (got ${PNEUMA_MIGRATE_DIRECTION})" 1>&2
  exit 1
fi

# Ensure the _migrations table exists.
sqlite3 "$DB" "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);"

# Apply each migration file that hasn't been applied yet, in lexical order.
for f in "$WS"/migrations/*.sql; do
  [ -e "$f" ] || continue
  name=$(basename "$f")
  applied=$(sqlite3 "$DB" "SELECT 1 FROM _migrations WHERE name='$name' LIMIT 1;")
  if [ -z "$applied" ]; then
    echo "pneuma: applying $name"
    sqlite3 "$DB" < "$f"
    sqlite3 "$DB" "INSERT INTO _migrations(name, applied_at) VALUES('$name', $(date +%s%3N));"
  fi
done

echo "##pneuma:progress 100 migrated"
exit 0
```

- [ ] **Step 3: fork.sh**

`templates/ai-bookmarks/scripts/fork.sh`:

```bash
#!/bin/sh
set -eu
: "${PNEUMA_FORK_SOURCE:?}"
: "${PNEUMA_FORK_TARGET:?}"

SRC="$PNEUMA_FORK_SOURCE"
TGT="$PNEUMA_FORK_TARGET"

mkdir -p "$TGT"
# Copy everything except runtime DB and shadow-git state.
rsync -a --exclude='.pneuma' --exclude='.pneuma-data' --exclude='.pneuma-build' --exclude='node_modules' "$SRC/" "$TGT/"

echo "##pneuma:progress 100 forked to $TGT"
exit 0
```

- [ ] **Step 4: stop.sh**

`templates/ai-bookmarks/scripts/stop.sh`:

```bash
#!/bin/sh
# dev.sh traps TERM/INT itself; this stop script is a marker emitter for symmetry.
echo "##pneuma:stopping"
exit 0
```

- [ ] **Step 5: chmod +x all four**

```bash
chmod +x templates/ai-bookmarks/scripts/setup.sh
chmod +x templates/ai-bookmarks/scripts/migrate.sh
chmod +x templates/ai-bookmarks/scripts/fork.sh
chmod +x templates/ai-bookmarks/scripts/stop.sh
```

- [ ] **Step 6: Commit**

```bash
git add templates/ai-bookmarks/scripts
git commit -m "$(cat <<'EOF'
feat(templates/ai-bookmarks): lifecycle scripts — setup / migrate / fork / stop

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task D3: `server/db.ts` — SQLite wrapper + typed helpers

**Files:**
- Create: `templates/ai-bookmarks/server/db.ts`
- Create: `templates/ai-bookmarks/server/api-types.ts`
- Create: `templates/ai-bookmarks/package.json`
- Create: `templates/ai-bookmarks/tsconfig.json`

- [ ] **Step 1: Create `templates/ai-bookmarks/package.json`**

```json
{
  "name": "pneuma-template-ai-bookmarks",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@langchain/core": "^0.3.0",
    "@langchain/openai": "^0.3.0",
    "@pneuma-framework/viewer-react": "workspace:*",
    "marked": "^14.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "reactflow": "^11.0.0"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0"
  }
}
```

- [ ] **Step 2: Create `templates/ai-bookmarks/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM"]
  },
  "include": ["server/**/*.ts", "viewer/src/**/*.ts", "viewer/src/**/*.tsx"]
}
```

- [ ] **Step 3: Create `templates/ai-bookmarks/server/api-types.ts`**

Copy the `BookmarkRow` / `InterpretationRow` / `GraphNode` / `GraphEdge` / `GraphResponse` / `BookmarkWithInterpretations` block from the Canonical types section.

- [ ] **Step 4: Create `templates/ai-bookmarks/server/db.ts`**

```typescript
import { Database } from "bun:sqlite";
import { dirname, join } from "node:path";
import { existsSync, mkdirSync } from "node:fs";
import type { BookmarkRow, BookmarkWithInterpretations, GraphEdge, GraphNode, InterpretationRow } from "./api-types.js";

export interface DbHandle {
  readonly path: string;
  insertBookmark(b: { url: string; title: string | null; rawText: string }): BookmarkRow;
  getBookmark(id: number): BookmarkRow | undefined;
  insertInterpretation(i: {
    bookmarkId: number;
    lensName: string;
    body: string;
    embedding: Float32Array;
  }): InterpretationRow;
  listBookmarksWithInterpretations(limit?: number): BookmarkWithInterpretations[];
  buildGraph(threshold: number): { nodes: GraphNode[]; edges: GraphEdge[] };
  close(): void;
}

export function openDb(workspaceRoot: string): DbHandle {
  const dbDir = join(workspaceRoot, ".pneuma-data");
  if (!existsSync(dbDir)) mkdirSync(dbDir, { recursive: true });
  const path = join(dbDir, "db.sqlite");
  const db = new Database(path);
  db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

  return {
    path,
    insertBookmark({ url, title, rawText }) {
      const now = Date.now();
      db.run(
        "INSERT OR IGNORE INTO bookmarks(url, title, fetched_at, raw_text) VALUES(?, ?, ?, ?)",
        [url, title, now, rawText],
      );
      const row = db.query("SELECT id, url, title, fetched_at FROM bookmarks WHERE url = ?").get(url) as BookmarkRow;
      return row;
    },
    getBookmark(id) {
      return db.query("SELECT id, url, title, fetched_at FROM bookmarks WHERE id = ?").get(id) as BookmarkRow | undefined;
    },
    insertInterpretation({ bookmarkId, lensName, body, embedding }) {
      const now = Date.now();
      const blob = new Uint8Array(embedding.buffer, embedding.byteOffset, embedding.byteLength);
      db.run(
        `INSERT OR REPLACE INTO interpretations(bookmark_id, lens_name, body, embedding, created_at)
         VALUES(?, ?, ?, ?, ?)`,
        [bookmarkId, lensName, body, blob, now],
      );
      const row = db.query(
        "SELECT id, bookmark_id, lens_name, body, created_at FROM interpretations WHERE bookmark_id = ? AND lens_name = ?",
      ).get(bookmarkId, lensName) as InterpretationRow;
      return row;
    },
    listBookmarksWithInterpretations(limit = 50) {
      const bookmarks = db.query<BookmarkRow, [number]>(
        "SELECT id, url, title, fetched_at FROM bookmarks ORDER BY fetched_at DESC LIMIT ?",
      ).all(limit);
      const out: BookmarkWithInterpretations[] = [];
      const ipStmt = db.query<InterpretationRow, [number]>(
        "SELECT id, bookmark_id, lens_name, body, created_at FROM interpretations WHERE bookmark_id = ?",
      );
      for (const b of bookmarks) out.push({ ...b, interpretations: ipStmt.all(b.id) });
      return out;
    },
    buildGraph(threshold) {
      const bookmarks = db.query<BookmarkRow, []>(
        "SELECT id, url, title, fetched_at FROM bookmarks ORDER BY fetched_at DESC",
      ).all();
      const embStmt = db.query<{ bookmark_id: number; embedding: Uint8Array }, [number]>(
        "SELECT bookmark_id, embedding FROM interpretations WHERE bookmark_id = ? LIMIT 1",
      );
      const vecs: Map<number, Float32Array> = new Map();
      for (const b of bookmarks) {
        const row = embStmt.get(b.id);
        if (!row) continue;
        const buf = row.embedding.buffer.slice(row.embedding.byteOffset, row.embedding.byteOffset + row.embedding.byteLength);
        vecs.set(b.id, new Float32Array(buf as ArrayBuffer));
      }
      const nodes: GraphNode[] = bookmarks.map((b) => ({ id: b.id, url: b.url, title: b.title }));
      const edges: GraphEdge[] = [];
      const ids = [...vecs.keys()];
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = vecs.get(ids[i]!);
          const b = vecs.get(ids[j]!);
          if (!a || !b) continue;
          const w = cosine(a, b);
          if (w > threshold) edges.push({ source: ids[i]!, target: ids[j]!, weight: w });
        }
      }
      return { nodes, edges };
    },
    close() { db.close(); },
  };

  void dirname; // silence unused if not used
}

function cosine(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]! * b[i]!; na += a[i]! * a[i]!; nb += b[i]! * b[i]!; }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
```

- [ ] **Step 5: `bun install` + typecheck**

```bash
bun install
tsc --noEmit -p templates/ai-bookmarks/tsconfig.json 2>&1 | tail -10
```
Expected: no type errors. (If `bun:sqlite` types need explicit reference, add `"types": ["bun"]` to the tsconfig — usually inherited from base.)

- [ ] **Step 6: Commit**

```bash
git add templates/ai-bookmarks/server templates/ai-bookmarks/package.json templates/ai-bookmarks/tsconfig.json bun.lock
git commit -m "$(cat <<'EOF'
feat(templates/ai-bookmarks/server): db.ts — bun:sqlite wrapper + graph build

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task D4: `server/lenses.ts` — lenses.json loader

**Files:**
- Create: `templates/ai-bookmarks/server/lenses.ts`

- [ ] **Step 1: Implementation**

```typescript
import { readFileSync, existsSync, watchFile } from "node:fs";
import { join } from "node:path";

export interface Lens {
  name: string;
  displayName: string;
  prompt: string;
  model?: string;
}

export interface LensesFile {
  lenses: Lens[];
}

export class LensRegistry {
  private current: LensesFile = { lenses: [] };
  constructor(private readonly path: string) {
    this.reload();
    // Poll-based watch (fs.watch is platform-dependent; watchFile uses 5s poll).
    watchFile(path, { interval: 1000 }, () => this.reload());
  }
  reload(): void {
    if (!existsSync(this.path)) { this.current = { lenses: [] }; return; }
    try {
      this.current = JSON.parse(readFileSync(this.path, "utf8")) as LensesFile;
    } catch (err) {
      console.error(`[lenses] failed to parse ${this.path}:`, err);
    }
  }
  list(): Lens[] { return this.current.lenses; }
}

export function openLensRegistry(workspaceRoot: string): LensRegistry {
  return new LensRegistry(join(workspaceRoot, "lenses.json"));
}
```

- [ ] **Step 2: Commit (no test — pure utility, tested via D5 pipeline)**

```bash
git add templates/ai-bookmarks/server/lenses.ts
git commit -m "$(cat <<'EOF'
feat(templates/ai-bookmarks/server): lenses.ts — JSON-file-backed lens registry

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task D5: `server/openrouter.ts` — thin chat + embed wrappers

**Files:**
- Create: `templates/ai-bookmarks/server/openrouter.ts`

- [ ] **Step 1: Implementation**

```typescript
import { ChatOpenAI } from "@langchain/openai";

export interface ChatOptions {
  model?: string;
  systemPrompt: string;
  userInput: string;
}

const DEFAULT_MODEL = process.env.OPENROUTER_CHAT_MODEL ?? "anthropic/claude-opus-4.7";
const DEFAULT_EMBED_MODEL = process.env.OPENROUTER_EMBED_MODEL ?? "jina-ai/jina-embeddings-v3";

function requireKey(): string {
  const k = process.env.OPENROUTER_API_KEY;
  if (!k) throw new Error("OPENROUTER_API_KEY is required");
  return k;
}

export async function chat(opts: ChatOptions): Promise<string> {
  const client = new ChatOpenAI({
    model: opts.model ?? DEFAULT_MODEL,
    apiKey: requireKey(),
    configuration: { baseURL: "https://openrouter.ai/api/v1" },
    temperature: 0.4,
  });
  const res = await client.invoke([
    { role: "system", content: opts.systemPrompt },
    { role: "user", content: opts.userInput },
  ]);
  return typeof res.content === "string" ? res.content : JSON.stringify(res.content);
}

/**
 * Direct /embeddings call — LangChain's OpenAI embeddings binding sometimes
 * mismatches OpenRouter's embedding endpoint, so we call fetch ourselves.
 */
export async function embed(input: string, model: string = DEFAULT_EMBED_MODEL): Promise<Float32Array> {
  const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${requireKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input }),
  });
  if (!res.ok) throw new Error(`openrouter /embeddings: ${res.status} ${await res.text()}`);
  const body = await res.json() as { data: Array<{ embedding: number[] }> };
  const arr = body.data[0]?.embedding;
  if (!arr) throw new Error("openrouter /embeddings: missing data[0].embedding");
  return Float32Array.from(arr);
}
```

- [ ] **Step 2: Commit**

```bash
git add templates/ai-bookmarks/server/openrouter.ts
git commit -m "$(cat <<'EOF'
feat(templates/ai-bookmarks/server): openrouter.ts — LangChain chat + direct embeddings

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Phase E — Template: interpretation pipeline + server (4 tasks)

### Task E1: `server/interpret.ts`

**Files:**
- Create: `templates/ai-bookmarks/server/interpret.ts`

- [ ] **Step 1: Implementation**

```typescript
import type { DbHandle } from "./db.js";
import type { LensRegistry } from "./lenses.js";
import { chat, embed } from "./openrouter.js";

export interface IngestResult {
  bookmarkId: number;
  url: string;
  title: string | null;
  lensesApplied: string[];
}

/** Fetch URL content via Jina Reader (which already extracts main text). */
export async function fetchReadable(url: string): Promise<{ title: string | null; body: string }> {
  const jinaUrl = `https://r.jina.ai/${url}`;
  const res = await fetch(jinaUrl, { headers: { "Accept": "text/plain" } });
  if (!res.ok) throw new Error(`jina-reader: ${res.status} ${await res.text()}`);
  const body = await res.text();
  const firstLine = body.split("\n", 1)[0]?.trim() ?? "";
  const title = firstLine.startsWith("Title:") ? firstLine.replace(/^Title:\s*/, "") : null;
  return { title, body };
}

export async function ingest(
  db: DbHandle,
  lenses: LensRegistry,
  url: string,
): Promise<IngestResult> {
  const { title, body } = await fetchReadable(url);
  const row = db.insertBookmark({ url, title, rawText: body.slice(0, 50_000) });
  const applied: string[] = [];
  for (const lens of lenses.list()) {
    try {
      const interpretation = await chat({
        model: lens.model,
        systemPrompt: lens.prompt,
        userInput: `URL: ${url}\n\nTitle: ${title ?? "(none)"}\n\nContent:\n${body.slice(0, 20_000)}`,
      });
      const vec = await embed(interpretation);
      db.insertInterpretation({ bookmarkId: row.id, lensName: lens.name, body: interpretation, embedding: vec });
      applied.push(lens.name);
    } catch (err) {
      console.error(`[interpret] lens ${lens.name} failed:`, err);
    }
  }
  return { bookmarkId: row.id, url: row.url, title: row.title, lensesApplied: applied };
}
```

- [ ] **Step 2: Commit**

```bash
git add templates/ai-bookmarks/server/interpret.ts
git commit -m "$(cat <<'EOF'
feat(templates/ai-bookmarks/server): interpret.ts — Jina Reader + per-lens chat + embed

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task E2: `server/server.ts` — HTTP routes + static serving

**Files:**
- Create: `templates/ai-bookmarks/server/server.ts`

- [ ] **Step 1: Implementation**

```typescript
import { openDb } from "./db.js";
import { openLensRegistry } from "./lenses.js";
import { ingest } from "./interpret.js";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { file } from "bun";

const WORKSPACE = process.env.PNEUMA_WORKSPACE ?? process.cwd();
const PORT = Number(process.env.PNEUMA_PORT_HINT ?? process.env.PORT ?? 3000);
const SIMILARITY_THRESHOLD = Number(process.env.BOOKMARKS_EDGE_THRESHOLD ?? 0.65);

const db = openDb(WORKSPACE);
const lenses = openLensRegistry(WORKSPACE);

const viewerDistDir = join(import.meta.dir, "..", "viewer");
const viewerIndex = join(viewerDistDir, "index.html");

Bun.serve({
  port: PORT,
  hostname: "0.0.0.0",
  async fetch(req) {
    const url = new URL(req.url);

    // API
    if (url.pathname === "/api/bookmarks" && req.method === "POST") {
      const body = await req.json() as { url?: string };
      if (!body.url) return new Response(JSON.stringify({ error: "url required" }), { status: 400 });
      try {
        const r = await ingest(db, lenses, body.url);
        return new Response(JSON.stringify(r), { headers: { "Content-Type": "application/json" } });
      } catch (err) {
        return new Response(JSON.stringify({ error: (err as Error).message }), { status: 500 });
      }
    }
    if (url.pathname === "/api/bookmarks" && req.method === "GET") {
      const rows = db.listBookmarksWithInterpretations();
      return new Response(JSON.stringify(rows), { headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname === "/api/graph" && req.method === "GET") {
      const g = db.buildGraph(SIMILARITY_THRESHOLD);
      return new Response(JSON.stringify(g), { headers: { "Content-Type": "application/json" } });
    }
    if (url.pathname === "/api/lenses" && req.method === "GET") {
      return new Response(JSON.stringify({ lenses: lenses.list() }), { headers: { "Content-Type": "application/json" } });
    }

    // Static — serve viewer files relative to viewer/ dir. Fall back to index.html for SPA routes.
    if (url.pathname === "/" || !url.pathname.includes(".")) {
      return new Response(file(viewerIndex));
    }
    const staticPath = join(viewerDistDir, url.pathname);
    if (existsSync(staticPath)) return new Response(file(staticPath));

    return new Response("not found", { status: 404 });
  },
});

console.log(`##pneuma:service-ready viewer http://localhost:${PORT}/?sid=${process.env.PNEUMA_SESSION_ID ?? ""}&ws=${encodeURIComponent(process.env.PNEUMA_WS_URL ?? "")}`);
console.log(`##pneuma:ready`);
```

- [ ] **Step 2: Commit**

```bash
git add templates/ai-bookmarks/server/server.ts
git commit -m "$(cat <<'EOF'
feat(templates/ai-bookmarks/server): server.ts — routes + static serving

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task E3: `scripts/dev.sh`

**Files:**
- Create: `templates/ai-bookmarks/scripts/dev.sh`

- [ ] **Step 1: Implementation**

`templates/ai-bookmarks/scripts/dev.sh`:

```bash
#!/bin/sh
set -eu
: "${PNEUMA_WORKSPACE:?}"

TEMPLATE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WS="$PNEUMA_WORKSPACE"

# First-run safety: if the workspace hasn't been set up, run setup.
if [ ! -f "$WS/lenses.json" ]; then
  sh "$TEMPLATE_DIR/scripts/setup.sh"
fi

trap 'echo "##pneuma:stopping"; kill 0 2>/dev/null; exit 0' TERM INT

cd "$TEMPLATE_DIR"
exec bun --hot server/server.ts
```

```bash
chmod +x templates/ai-bookmarks/scripts/dev.sh
```

- [ ] **Step 2: Commit**

```bash
git add templates/ai-bookmarks/scripts/dev.sh
git commit -m "$(cat <<'EOF'
feat(templates/ai-bookmarks): dev.sh — auto-setup + launch bun --hot server

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task E4: Integration test — setup → dev → POST /api/bookmarks

**Files:**
- Create: `templates/ai-bookmarks/test/ingest.test.ts`

NOTE: this test mocks `fetch` so it doesn't need live Jina / OpenRouter. The LangChain `ChatOpenAI` import path makes full mocking painful — instead we test the **db + graph** layer directly with a hand-crafted embedding. Live-network pipeline is hand-validated.

- [ ] **Step 1: Write the test**

```typescript
import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../server/db.js";

function seedSchema(ws: string): void {
  const template = join(import.meta.dir, "..");
  const sql = readFileSync(join(template, "scaffold", "migrations", "001-init.sql"), "utf8");
  const db = openDb(ws);
  // openDb lazily opens — we use its raw handle via bun:sqlite directly.
  const { Database } = require("bun:sqlite");
  const direct = new Database(db.path);
  direct.exec(sql);
  direct.close();
  db.close();
}

test("db.insertBookmark + insertInterpretation + listBookmarksWithInterpretations round-trip", () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-bookmarks-"));
  mkdirSync(join(ws, ".pneuma-data"));
  seedSchema(ws);
  const db = openDb(ws);
  const b = db.insertBookmark({ url: "https://example.com", title: "Example", rawText: "hello world" });
  const vec = Float32Array.from([0.1, 0.2, 0.3]);
  db.insertInterpretation({ bookmarkId: b.id, lensName: "test", body: "analysis", embedding: vec });
  const rows = db.listBookmarksWithInterpretations();
  expect(rows.length).toBe(1);
  expect(rows[0]!.interpretations.length).toBe(1);
  expect(rows[0]!.interpretations[0]!.lens_name).toBe("test");
  db.close();
});

test("db.buildGraph edges above threshold", () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-graph-"));
  mkdirSync(join(ws, ".pneuma-data"));
  seedSchema(ws);
  const db = openDb(ws);
  const a = db.insertBookmark({ url: "https://a.example", title: "A", rawText: "" });
  const b = db.insertBookmark({ url: "https://b.example", title: "B", rawText: "" });
  const c = db.insertBookmark({ url: "https://c.example", title: "C", rawText: "" });
  db.insertInterpretation({ bookmarkId: a.id, lensName: "l", body: "", embedding: Float32Array.from([1, 0, 0]) });
  db.insertInterpretation({ bookmarkId: b.id, lensName: "l", body: "", embedding: Float32Array.from([0.95, 0.05, 0]) });
  db.insertInterpretation({ bookmarkId: c.id, lensName: "l", body: "", embedding: Float32Array.from([0, 1, 0]) });
  const g = db.buildGraph(0.7);
  // a <-> b ≈ 0.998; a <-> c = 0; b <-> c ≈ 0.05. Only one edge.
  expect(g.edges.length).toBe(1);
  expect(g.edges[0]!.source).toBe(a.id);
  expect(g.edges[0]!.target).toBe(b.id);
  expect(g.edges[0]!.weight).toBeGreaterThan(0.9);
  db.close();
});
```

- [ ] **Step 2: Run**

```bash
bun test templates/ai-bookmarks/test/ingest.test.ts
```
Expected: 2 new pass. Full suite: 178 → 180.

- [ ] **Step 3: Commit**

```bash
git add templates/ai-bookmarks/test
git commit -m "$(cat <<'EOF'
test(templates/ai-bookmarks): db + graph round-trip (fake embeddings)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Phase F — Template viewer (5 tasks)

### Task F1: Viewer scaffold + main entry

**Files:**
- Create: `templates/ai-bookmarks/viewer/index.html`
- Create: `templates/ai-bookmarks/viewer/src/main.tsx`
- Create: `templates/ai-bookmarks/viewer/src/api.ts`
- Create: `templates/ai-bookmarks/viewer/src/styles.css`

Files mirror `templates/doc/viewer` structure. Content:

- [ ] **Step 1: `index.html` (mostly copied from doc-mode, title changed):**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>AI Bookmarks</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      rel="stylesheet"
      href="https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,400;0,7..72,500;0,7..72,600&family=Work+Sans:wght@400;500;600&family=Noto+Sans+SC:wght@400;500&display=swap"
    />
    <link rel="stylesheet" href="./src/styles.css" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: `src/main.tsx`:**

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

const container = document.getElementById("root");
if (!container) throw new Error("no #root element");
createRoot(container).render(<StrictMode><App /></StrictMode>);
```

- [ ] **Step 3: `src/api.ts`:**

```typescript
import type { BookmarkWithInterpretations, GraphResponse } from "../../server/api-types.js";
import type { Lens } from "../../server/lenses.js";

export async function fetchBookmarks(): Promise<BookmarkWithInterpretations[]> {
  const r = await fetch("/api/bookmarks");
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchGraph(): Promise<GraphResponse> {
  const r = await fetch("/api/graph");
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function fetchLenses(): Promise<{ lenses: Lens[] }> {
  const r = await fetch("/api/lenses");
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function addBookmark(url: string): Promise<void> {
  const r = await fetch("/api/bookmarks", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
  if (!r.ok) throw new Error(await r.text());
}
```

- [ ] **Step 4: `src/styles.css`** — copy the doc-mode styles file from `templates/doc/viewer/src/styles.css`, strip the doc-specific `.reading` / `.chat` rules, add bookmark-specific rules:

(Keep palette tokens, type scale, reset, spacing. Add three classes: `.bm-timeline`, `.bm-timeline__card`, `.bm-graph`. Layout uses a two-column grid like doc mode but columns are view-switcher + chat.)

Full file content:

```css
/* Shared tokens with doc mode — same editorial palette. */
:root {
  --paper: oklch(98% 0.006 80);
  --paper-deep: oklch(96% 0.008 80);
  --paper-edge: oklch(94% 0.010 80);
  --ink: oklch(18% 0.012 60);
  --ink-soft: oklch(36% 0.010 60);
  --ink-muted: oklch(56% 0.010 60);
  --ink-faint: oklch(70% 0.008 80);
  --rule: oklch(88% 0.012 80);
  --rule-strong: oklch(75% 0.015 80);
  --accent: oklch(52% 0.14 45);
  --accent-soft: oklch(94% 0.04 60);

  --sp-xs: 4px; --sp-sm: 8px; --sp-md: 12px; --sp-lg: 16px;
  --sp-xl: 24px; --sp-2xl: 32px; --sp-3xl: 48px;

  --type-serif: "Literata", "Noto Serif SC", Georgia, serif;
  --type-sans: "Work Sans", "Noto Sans SC", system-ui, sans-serif;

  --fs-micro: 0.6875rem; --fs-small: 0.8125rem; --fs-body: 1rem;
  --fs-h3: 1.1875rem; --fs-h2: 1.5rem; --fs-h1: 2rem;
  --drawer-w: 360px;
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
}
* { box-sizing: border-box; }
html, body, #root { margin: 0; height: 100%; }
body {
  background: var(--paper); color: var(--ink);
  font-family: var(--type-sans); font-size: var(--fs-body);
  -webkit-font-smoothing: antialiased;
}
button, input, textarea { font: inherit; color: inherit; }
button { background: none; border: none; padding: 0; cursor: pointer; }

.shell {
  display: grid;
  grid-template-columns: 1fr var(--drawer-w);
  height: 100dvh; overflow: hidden;
}
.main-col {
  overflow-y: auto; padding: var(--sp-2xl) var(--sp-3xl);
  display: flex; flex-direction: column; gap: var(--sp-xl);
}

.view-tabs {
  display: flex; gap: var(--sp-md); border-bottom: 1px solid var(--rule);
  padding-bottom: var(--sp-sm);
}
.view-tabs button {
  font-family: var(--type-sans); font-size: var(--fs-small);
  text-transform: uppercase; letter-spacing: 0.14em;
  color: var(--ink-muted); padding: var(--sp-xs) var(--sp-sm);
}
.view-tabs button[data-active="true"] { color: var(--accent); border-bottom: 1px solid var(--accent); }

.add-bm {
  display: flex; gap: var(--sp-sm); align-items: stretch;
}
.add-bm input {
  flex: 1; padding: var(--sp-sm) var(--sp-md);
  background: var(--paper-edge); border: 1px solid transparent; border-radius: 2px;
}
.add-bm input:focus { outline: none; border-color: var(--rule-strong); background: var(--paper); }
.add-bm button {
  padding: 0 var(--sp-md); color: var(--accent); font-size: var(--fs-small);
  text-transform: uppercase; letter-spacing: 0.14em;
}

.bm-timeline { display: grid; gap: var(--sp-lg); }
.bm-timeline__card {
  padding: var(--sp-lg); background: var(--paper-deep); border-radius: 2px;
}
.bm-timeline__card h3 { font-family: var(--type-serif); font-weight: 500; margin: 0 0 var(--sp-sm); font-size: var(--fs-h3); }
.bm-timeline__card .url { font-size: var(--fs-small); color: var(--ink-muted); word-break: break-all; }
.bm-timeline__lens { margin-top: var(--sp-md); padding-top: var(--sp-md); border-top: 1px solid var(--rule); }
.bm-timeline__lens-name {
  font-family: var(--type-sans); font-size: var(--fs-micro);
  text-transform: uppercase; letter-spacing: 0.18em;
  color: var(--accent); margin-bottom: var(--sp-sm);
}
.bm-timeline__lens-body { font-family: var(--type-serif); white-space: pre-wrap; line-height: 1.65; }

.bm-graph { height: 70vh; background: var(--paper-deep); border-radius: 2px; }

.chat {
  border-left: 1px solid var(--rule); background: var(--paper-deep);
  display: flex; flex-direction: column; overflow: hidden;
}
```

- [ ] **Step 5: Commit**

```bash
git add templates/ai-bookmarks/viewer/index.html templates/ai-bookmarks/viewer/src/main.tsx templates/ai-bookmarks/viewer/src/api.ts templates/ai-bookmarks/viewer/src/styles.css
git commit -m "$(cat <<'EOF'
feat(templates/ai-bookmarks/viewer): HTML shell + React mount + api client + styles

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task F2: `AddBookmark` + view tabs + `App` shell

**Files:**
- Create: `templates/ai-bookmarks/viewer/src/App.tsx`
- Create: `templates/ai-bookmarks/viewer/src/AddBookmark.tsx`

- [ ] **Step 1: `AddBookmark.tsx`:**

```typescript
import { useState, type FormEvent } from "react";
import { addBookmark } from "./api.js";

export function AddBookmark({ onAdded }: { onAdded: () => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    const u = url.trim();
    if (!u) return;
    setBusy(true); setErr(null);
    try { await addBookmark(u); setUrl(""); onAdded(); }
    catch (x) { setErr((x as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <form className="add-bm" onSubmit={submit}>
      <input
        type="url"
        required
        placeholder="Paste a URL · 贴一个 URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={busy}
      />
      <button type="submit" disabled={busy}>{busy ? "…" : "Add · 添加"}</button>
      {err && <span style={{ color: "var(--accent)" }}>{err}</span>}
    </form>
  );
}
```

- [ ] **Step 2: `App.tsx`:**

```typescript
import { useState, useEffect, useCallback } from "react";
import { PneumaViewer, PermissionPrompt } from "@pneuma-framework/viewer-react";
import { AddBookmark } from "./AddBookmark.js";
import { TimelineView } from "./TimelineView.js";
import { GraphView } from "./GraphView.js";
import type { BookmarkWithInterpretations, GraphResponse } from "../../server/api-types.js";
import { fetchBookmarks, fetchGraph } from "./api.js";

export function App() {
  const params = new URLSearchParams(window.location.search);
  const sid = params.get("sid");
  const ws = params.get("ws");
  if (!sid || !ws) {
    return <AppCore />;   // bookmarks still usable without wire protocol
  }
  const wsBase = ws.replace(/^http:\/\//, "ws://").replace(/^https:\/\//, "wss://");
  return (
    <PneumaViewer wsUrl={`${wsBase}/ws/viewer/${sid}`} sid={sid}>
      <PermissionPrompt />
      <AppCore />
    </PneumaViewer>
  );
}

function AppCore() {
  const [view, setView] = useState<"timeline" | "graph">("timeline");
  const [bookmarks, setBookmarks] = useState<BookmarkWithInterpretations[]>([]);
  const [graph, setGraph] = useState<GraphResponse>({ nodes: [], edges: [] });

  const refresh = useCallback(async () => {
    const [b, g] = await Promise.all([fetchBookmarks(), fetchGraph()]);
    setBookmarks(b); setGraph(g);
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  return (
    <div className="shell">
      <main className="main-col">
        <AddBookmark onAdded={refresh} />
        <nav className="view-tabs">
          <button data-active={view === "timeline"} onClick={() => setView("timeline")}>Timeline · 时间线</button>
          <button data-active={view === "graph"} onClick={() => setView("graph")}>Graph · 关系图</button>
        </nav>
        {view === "timeline"
          ? <TimelineView bookmarks={bookmarks} />
          : <GraphView graph={graph} bookmarks={bookmarks} />}
      </main>
      <aside className="chat" aria-label="Chat">
        <div style={{ padding: "var(--sp-lg)", color: "var(--ink-muted)", fontSize: "var(--fs-small)" }}>
          Chat panel will mount here once the build-phase agent is wired.
        </div>
      </aside>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add templates/ai-bookmarks/viewer/src/App.tsx templates/ai-bookmarks/viewer/src/AddBookmark.tsx
git commit -m "$(cat <<'EOF'
feat(templates/ai-bookmarks/viewer): App shell + AddBookmark + view tabs

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task F3: `TimelineView`

**Files:**
- Create: `templates/ai-bookmarks/viewer/src/TimelineView.tsx`

- [ ] **Step 1: Implementation**

```typescript
import { marked } from "marked";
import type { BookmarkWithInterpretations } from "../../server/api-types.js";

export function TimelineView({ bookmarks }: { bookmarks: BookmarkWithInterpretations[] }) {
  if (bookmarks.length === 0) {
    return (
      <p style={{ color: "var(--ink-muted)", textAlign: "center", padding: "var(--sp-3xl)" }}>
        No bookmarks yet. Paste a URL above to begin · 还没有书签，粘贴一个 URL 开始。
      </p>
    );
  }
  return (
    <div className="bm-timeline">
      {bookmarks.map((b) => (
        <article key={b.id} className="bm-timeline__card">
          <h3>{b.title ?? b.url}</h3>
          <div className="url">
            <a href={b.url} target="_blank" rel="noreferrer">{b.url}</a>
            {" · "}
            {new Date(b.fetched_at).toLocaleString()}
          </div>
          {b.interpretations.map((ip) => (
            <div key={ip.id} className="bm-timeline__lens">
              <div className="bm-timeline__lens-name">{ip.lens_name}</div>
              <div
                className="bm-timeline__lens-body"
                dangerouslySetInnerHTML={{ __html: marked.parse(ip.body) as string }}
              />
            </div>
          ))}
        </article>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add templates/ai-bookmarks/viewer/src/TimelineView.tsx
git commit -m "$(cat <<'EOF'
feat(templates/ai-bookmarks/viewer): TimelineView — chronological card list

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task F4: `GraphView` using react-flow

**Files:**
- Create: `templates/ai-bookmarks/viewer/src/GraphView.tsx`

- [ ] **Step 1: Implementation**

```typescript
import ReactFlow, { Background, Controls, type Edge, type Node } from "reactflow";
import "reactflow/dist/style.css";
import type { BookmarkWithInterpretations, GraphResponse } from "../../server/api-types.js";
import { useMemo } from "react";

export function GraphView({ graph, bookmarks }: { graph: GraphResponse; bookmarks: BookmarkWithInterpretations[] }) {
  const titles = new Map(bookmarks.map((b) => [b.id, b.title ?? b.url]));
  const nodes: Node[] = useMemo(() =>
    graph.nodes.map((n, i) => {
      const angle = (i / Math.max(graph.nodes.length, 1)) * Math.PI * 2;
      return {
        id: String(n.id),
        data: { label: titles.get(n.id) ?? n.url },
        position: { x: 300 + 240 * Math.cos(angle), y: 240 + 200 * Math.sin(angle) },
        style: {
          background: "var(--paper)",
          border: "1px solid var(--rule-strong)",
          borderRadius: 2,
          padding: "6px 10px",
          fontSize: 12,
          fontFamily: "var(--type-sans)",
          maxWidth: 220,
        },
      } satisfies Node;
    })
  , [graph.nodes, titles]);
  const edges: Edge[] = useMemo(() =>
    graph.edges.map((e, i) => ({
      id: `e-${i}`,
      source: String(e.source),
      target: String(e.target),
      label: e.weight.toFixed(2),
      style: { stroke: `var(--accent)`, strokeWidth: 1 + e.weight * 2 },
      labelStyle: { fill: "var(--ink-muted)", fontSize: 10 },
    }))
  , [graph.edges]);

  if (graph.nodes.length === 0) {
    return <p style={{ color: "var(--ink-muted)", textAlign: "center", padding: "var(--sp-3xl)" }}>
      No graph yet · 还没有图。
    </p>;
  }

  return (
    <div className="bm-graph">
      <ReactFlow nodes={nodes} edges={edges} fitView>
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add templates/ai-bookmarks/viewer/src/GraphView.tsx
git commit -m "$(cat <<'EOF'
feat(templates/ai-bookmarks/viewer): GraphView — react-flow similarity network

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task F5: Extend root typecheck + install + compile-check

**Files:**
- Modify: `package.json` (root — add template viewer tsconfig to typecheck)

- [ ] **Step 1: Modify root package.json**

Extend the `typecheck` script:

```json
"typecheck": "tsc --noEmit -p packages/core/tsconfig.json && tsc --noEmit -p packages/cli/tsconfig.json && tsc --noEmit -p packages/backend-opencode/tsconfig.json && tsc --noEmit -p packages/viewer-react/tsconfig.json && tsc --noEmit -p templates/doc/viewer/tsconfig.json && tsc --noEmit -p templates/ai-bookmarks/tsconfig.json"
```

- [ ] **Step 2: Install + typecheck + compile-check**

```bash
bun install
bun run typecheck
bun build --target=browser templates/ai-bookmarks/viewer/src/main.tsx --outfile /tmp/bm-bundle.js 2>&1 | tail -5
test -s /tmp/bm-bundle.js && echo OK
```
Expected: typecheck clean; bundle OK.

- [ ] **Step 3: Commit**

```bash
git add package.json bun.lock
git commit -m "$(cat <<'EOF'
chore(build): typecheck includes templates/ai-bookmarks

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Phase G — Docker build + deploy (3 tasks)

### Task G1: Dockerfile

**Files:**
- Create: `templates/ai-bookmarks/Dockerfile`
- Create: `templates/ai-bookmarks/.dockerignore`

- [ ] **Step 1: Dockerfile**

`templates/ai-bookmarks/Dockerfile`:

```dockerfile
# Multi-stage build: compile Bun binary + bundle viewer, ship in a slim image.
FROM oven/bun:1 AS build
WORKDIR /src
COPY package.json ./
COPY server ./server
COPY viewer ./viewer
RUN bun install --production
RUN bun build --target=browser viewer/src/main.tsx --outfile viewer/main.js

FROM oven/bun:1-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /src ./
VOLUME /data
ENV PNEUMA_WORKSPACE=/data
EXPOSE 3000
CMD ["bun", "server/server.ts"]
```

- [ ] **Step 2: .dockerignore**

```
node_modules
.pneuma
.pneuma-data
.pneuma-build
.git
*.log
dist
```

- [ ] **Step 3: Commit**

```bash
git add templates/ai-bookmarks/Dockerfile templates/ai-bookmarks/.dockerignore
git commit -m "$(cat <<'EOF'
feat(templates/ai-bookmarks): multi-stage Dockerfile + .dockerignore

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task G2: `scripts/build.sh` — docker build + manifest

**Files:**
- Create: `templates/ai-bookmarks/scripts/build.sh`

- [ ] **Step 1: Implementation**

```bash
#!/bin/sh
set -eu
: "${PNEUMA_WORKSPACE:?}"
: "${PNEUMA_BUILD_DIR:?}"

TEMPLATE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
IMAGE_NAME="${PNEUMA_IMAGE_NAME:-pneuma-ai-bookmarks}"
TAG="${PNEUMA_IMAGE_TAG:-$(date +%s)}"
FULL="${IMAGE_NAME}:${TAG}"

echo "##pneuma:progress 10 building docker image ${FULL}"
(cd "$TEMPLATE_DIR" && docker build -t "$FULL" .) 1>&2

mkdir -p "$PNEUMA_BUILD_DIR"
cat > "$PNEUMA_BUILD_DIR/build.manifest.json" <<JSON
{
  "schemaVersion": 1,
  "kind": "docker-image",
  "entrypoint": "docker://${FULL}",
  "produced": "${FULL}",
  "env": { "PORT": "3000" },
  "notes": [
    "Built via templates/ai-bookmarks/scripts/build.sh",
    "Volume /data holds the SQLite DB and lenses.json"
  ],
  "deployHints": {
    "volumeMounts": [{ "host": "bookmarks-data", "container": "/data" }],
    "ports": [{ "container": 3000 }],
    "env": ["OPENROUTER_API_KEY"]
  }
}
JSON

echo "##pneuma:progress 100 built ${FULL}"
echo "##pneuma:artifact ${PNEUMA_BUILD_DIR}/build.manifest.json"
exit 0
```

```bash
chmod +x templates/ai-bookmarks/scripts/build.sh
```

- [ ] **Step 2: Commit**

```bash
git add templates/ai-bookmarks/scripts/build.sh
git commit -m "$(cat <<'EOF'
feat(templates/ai-bookmarks): build.sh — docker build + build.manifest.json

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task G3: `scripts/deploy.sh` — local + registry modes

**Files:**
- Create: `templates/ai-bookmarks/scripts/deploy.sh`

- [ ] **Step 1: Implementation**

```bash
#!/bin/sh
set -eu
: "${PNEUMA_ARTIFACT_MANIFEST:?}"

TARGET="${PNEUMA_DEPLOY_TARGET:-local}"
MANIFEST="$PNEUMA_ARTIFACT_MANIFEST"
IMAGE=$(sed -n 's/.*"produced": *"\([^"]*\)".*/\1/p' "$MANIFEST" | head -1)
[ -n "$IMAGE" ] || { echo "deploy.sh: could not parse produced image from $MANIFEST" 1>&2; exit 1; }

case "$TARGET" in
  local)
    PORT="${PNEUMA_DEPLOY_PORT:-3001}"
    VOLUME="${PNEUMA_DEPLOY_VOLUME:-pneuma-bookmarks-data}"
    NAME="${PNEUMA_DEPLOY_CONTAINER:-pneuma-bookmarks-release}"
    ENVFILE=""
    if [ -n "${OPENROUTER_API_KEY:-}" ]; then
      ENVFILE="-e OPENROUTER_API_KEY=$OPENROUTER_API_KEY"
    fi
    echo "##pneuma:progress 30 launching $IMAGE on :$PORT"
    docker rm -f "$NAME" >/dev/null 2>&1 || true
    docker run -d --name "$NAME" -p "${PORT}:3000" -v "${VOLUME}:/data" $ENVFILE "$IMAGE" 1>&2
    echo "##pneuma:progress 100 running at http://127.0.0.1:${PORT}"
    ;;
  registry)
    : "${PNEUMA_REGISTRY:?PNEUMA_REGISTRY required for target=registry}"
    REMOTE="${PNEUMA_REGISTRY}/${IMAGE#*/}"
    docker tag "$IMAGE" "$REMOTE" 1>&2
    echo "##pneuma:progress 60 pushing $REMOTE"
    docker push "$REMOTE" 1>&2
    echo "##pneuma:progress 100 pushed $REMOTE"
    ;;
  *)
    echo "deploy.sh: unknown target $TARGET (expected local | registry)" 1>&2
    exit 1
    ;;
esac
exit 0
```

```bash
chmod +x templates/ai-bookmarks/scripts/deploy.sh
```

- [ ] **Step 2: Commit**

```bash
git add templates/ai-bookmarks/scripts/deploy.sh
git commit -m "$(cat <<'EOF'
feat(templates/ai-bookmarks): deploy.sh — local docker run + registry push modes

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Phase H — E2E walkthrough + closeout (3 tasks)

### Task H1: `examples/ai-bookmarks/` walkthrough

**Files:**
- Create: `examples/ai-bookmarks/package.json`
- Create: `examples/ai-bookmarks/README.md`

- [ ] **Step 1: package.json**

```json
{ "name": "example-ai-bookmarks", "version": "0.0.0", "private": true, "type": "module" }
```

- [ ] **Step 2: README.md — full walkthrough**

```markdown
# ai-bookmarks — full-stack E2E walkthrough

Validates the framework's complete lifecycle (setup → dev → build → deploy
→ migrate → fork) against a real app: an AI-native bookmarks tool where
each saved URL is interpreted through configurable "lenses" (system prompts)
and placed into a similarity graph.

Sibling example: [`../doc-mode/README.md`](../doc-mode/README.md) — the
read-only preview template from M3.

## Prereqs

1. `opencode` on `$PATH`, OpenRouter creds registered:

   ```sh
   opencode auth login  # choose OpenRouter
   ```

2. Docker running locally (for `build` + `deploy`).
3. `OPENROUTER_API_KEY` in your shell (used by the DEPLOYED container AND
   by dev.sh so the agent can actually interpret URLs):

   ```sh
   export OPENROUTER_API_KEY=sk-or-v1-...
   ```

## Walkthrough

### 1. One-time setup

```sh
rm -rf /tmp/pneuma-bookmarks
bun packages/cli/src/index.ts setup templates/ai-bookmarks --workspace /tmp/pneuma-bookmarks
```

Creates the workspace, seeds `lenses.json`, runs the first SQL migration.

### 2. Dev loop (with build-phase agent)

```sh
bun packages/cli/src/index.ts dev templates/ai-bookmarks \
  --backend opencode --workspace /tmp/pneuma-bookmarks
```

Open the printed **Builder URL**. Paste a URL — watch Jina-Reader fetch it,
OpenRouter generate lens-by-lens interpretations, the timeline fill in, and
the graph edges appear.

Try asking the agent:
- "加一个 lens 叫 'architecture rabbit hole'，读作架构师视角，3 点总结"
- "把 timeline 的卡片背景改成更浅的米色"

Watch the edit → hot reload → live preview.

### 3. Build a release image

```sh
bun packages/cli/src/index.ts build templates/ai-bookmarks --workspace /tmp/pneuma-bookmarks
```

Produces `/tmp/pneuma-bookmarks/.pneuma-build/<date>/build.manifest.json`
and a local docker image `pneuma-ai-bookmarks:<timestamp>`.

### 4. Deploy locally

```sh
bun packages/cli/src/index.ts deploy templates/ai-bookmarks \
  --workspace /tmp/pneuma-bookmarks --unattended
```

(Without `--unattended`, the viewer shows a permission-prompt banner; click
Allow.)

Container runs on `http://127.0.0.1:3001`. This is your "release mode" — a
frozen copy of the app serving the real SQLite volume.

### 5. Fork the workspace

```sh
bun packages/cli/src/index.ts fork templates/ai-bookmarks \
  --source /tmp/pneuma-bookmarks --target /tmp/pneuma-bookmarks-v2
bun packages/cli/src/index.ts dev templates/ai-bookmarks \
  --backend opencode --workspace /tmp/pneuma-bookmarks-v2
```

Fork carries your `lenses.json` + migrations but NOT the runtime DB — the
new workspace runs fresh migrations and starts empty.

### 6. Push to a registry (optional)

```sh
export PNEUMA_REGISTRY=ghcr.io/your-user
bun packages/cli/src/index.ts deploy templates/ai-bookmarks \
  --workspace /tmp/pneuma-bookmarks --unattended
# — or —
PNEUMA_DEPLOY_TARGET=registry bun packages/cli/src/index.ts deploy \
  templates/ai-bookmarks --workspace /tmp/pneuma-bookmarks --unattended
```

## Knobs

- `OPENCODE_MODEL=openrouter/anthropic/claude-haiku-4.5` — cheaper chat model.
- `BOOKMARKS_EDGE_THRESHOLD=0.5` — lower threshold → denser graph.
- `OPENROUTER_EMBED_MODEL=openai/text-embedding-3-small` — fallback embedder.
- `PNEUMA_DEPLOY_PORT=4000` — different release port.

## Known sharp edges

- Running `deploy` WITHOUT `--unattended` routes through the viewer permission
  prompt — the CLI hangs until the builder clicks Allow in the browser.
  Set `--unattended` for scripted deploys.
- The initial setup.sh copies scaffolds — it is idempotent (skips existing
  files), so re-running it after you edit `lenses.json` won't overwrite you.
- `migrate down` is not implemented in v0. Roll-forward-only.
```

- [ ] **Step 3: Commit**

```bash
git add examples/ai-bookmarks
git commit -m "$(cat <<'EOF'
docs(examples/ai-bookmarks): E2E walkthrough README

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task H2: Root `.gitignore` workspace guard

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add entries**

Append to `.gitignore`:

```
# Framework runtime state; never committed even if a workspace lands in the repo.
.pneuma/
.pneuma-data/
.pneuma-build/
```

(If some of these are already present, skip. Verify with `grep -c '.pneuma' .gitignore` first.)

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "$(cat <<'EOF'
chore(gitignore): .pneuma{,-data,-build}/ never enter git

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task H3: M4 closeout — full suite + typecheck + tag

- [ ] **Step 1: Verification**

```bash
bun install
bun test
bun run typecheck
```
Expected: full suite green. Typecheck clean across 6 tsconfigs (core / cli / backend-opencode / viewer-react / templates/doc/viewer / templates/ai-bookmarks).

- [ ] **Step 2: Tag**

```bash
git tag m4-complete -m "$(cat <<'EOF'
M4: full-stack + deployment validation

Ships templates/ai-bookmarks — an AI-native bookmarks app (Bun + SQLite +
React + LangChain/OpenRouter + react-flow + Docker) — along with the
framework-level gaps that M2 left stubbed:

- orchestrator.runSetup / runMigrate / runFork real
- lifecycle.setup.run / migrate.run / fork.run tools routed
- runDeploy gates on manifest unattendedDeploy + resolveConfirm
- viewer-react <PermissionPrompt> surfaces deploy confirms
- CLI verbs: setup / migrate / fork + --direction / --source / --target / --unattended
- Docker multi-stage build + local / registry deploy modes

Hand-validated walkthrough: examples/ai-bookmarks/README.md.

Phase G (claude-code / codex adapters) still deferred.
EOF
)"
```

- [ ] **Step 3: Verify range**

```bash
git log --oneline m3-viewer-complete..m4-complete | wc -l
git diff --stat m3-viewer-complete..m4-complete | tail -5
```

---

## Self-review notes

Checked the plan against §4, §5, §6, §8.3, §12 M4 of the v0 spec + user's locked decisions:

**Spec coverage**
- §4 verbs — all 7 now have real orchestrator methods (Task A1-A3 for setup/migrate/fork; dev/build/deploy/stop already in M1/M2). ✓
- §5.2 action tools — `lifecycle.setup.run` / `migrate.run` / `fork.run` routed (A5). `lifecycle.deploy.run` confirm flow (A4) + `--unattended` override (C2). ✓
- §5.4 Builder confirmation — `unattendedDeploy` consumed (A4); `##pneuma:needs-confirm` → viewer banner (B2) + wire-protocol `permission-prompt` envelope (M3-era, now visualized). ✓
- §6 viewer wire protocol — `permission-prompt` → UI; `permission-response` round-trips via `usePermissionResponder`. ✓
- §8.3 fork-modify-redeploy — CLI walkthrough in H1 exercises fork → dev → deploy path. ✓
- §12 M4 — `template-ai-bookmarks` replaces `template-procfile-fullstack`, rationale documented in Goal. ✓

**Placeholder scan** — no TBD / TODO / FIXME / "similar to Task N" references. Each step ships full code. The `scripts/stop.sh` is intentionally trivial (3 lines); that's not a placeholder, that's the actual surface.

**Type consistency**
- `SetupResult` / `MigrateResult` / `ForkResult` defined in A1/A2/A3, used in A5 tool handlers. ✓
- `BookmarkRow` / `InterpretationRow` / `GraphNode` / `GraphEdge` / `GraphResponse` / `BookmarkWithInterpretations` defined once (Canonical types section), used across D3, E2, F3, F4. ✓
- `LensRegistry.list()` signature consistent across D4 and E1. ✓
- `PermissionPrompt` React component's export matches the import site in Task B3 (`templates/doc/viewer/src/Shell.tsx`). ✓
- CLI `ParsedArgs` new fields (`direction` / `source` / `target` / `unattended`) consistent between C1 parser and C2 consumer. ✓

**Known fragilities**
- `@langchain/openai` with `OpenRouter` baseURL: documented pattern but real SDK v0.3 has drifted before. If `ChatOpenAI.invoke` returns something other than `{ content: string }` for OpenRouter responses, Task E1's `typeof res.content === "string"` branch keeps it safe via the JSON-stringify fallback.
- Bun serving React from `viewer/` at runtime (E2) via static file serving — no bundler. For production Docker, the Dockerfile runs `bun build --target=browser` to emit a bundled `viewer/main.js`; `index.html` must reference `/viewer/main.js` in release (not `./src/main.tsx`) — revisit if the first real deploy's viewer blanks out. (Alternative: always reference `./src/main.tsx` and let Bun's runtime compile at request time; it works in dev and in `bun:1-slim` runtime since Bun has the TS compiler built in. Preferred — removes the split.)
- `bun:sqlite` type exports from `@types/bun` are stable for `Database`; `db.query<Row, Params>(...)` signatures compile with `"types": ["bun"]` inherited from `tsconfig.base.json`. Task D3 typecheck catches any drift.
- `reactflow` v11 has a peer dep on `react@18`. Confirm that React 19 is accepted (the v12 beta handles React 19 natively; `reactflow@^12.0.0-next` may be required if v11 refuses to install). If install errors, bump to `@xyflow/react` (the rebranded v12) in Task D3's package.json.
- Deploy target `registry` assumes `docker login` already ran against `$PNEUMA_REGISTRY`; deploy.sh does NOT invoke `docker login`. Documented in H1.

No silent assumptions. Plan ready.

---

## Post-M4 retro (2026-04-22)

After the plan shipped (tag `m4-complete`), E2E hand-validation surfaced three
places the plan was wrong or incomplete. Fixes landed as follow-up commits on
`main` on 2026-04-22; the spec text above is preserved as-written for
accuracy — consult this section for what ultimately shipped.

1. **Viewer serving via Bun HTML routes, not raw static file serving.**
   Task E2 described `Bun.serve` with a `fetch` that returned `file(viewer/index.html)` for `/` and raw files elsewhere. That sends the browser a `.tsx` source file labeled `text/javascript`, which never parses — the page white-screens. Shipped fix: `import indexHtml from "../viewer/index.html"` and pass it through `routes: { "/": indexHtml }`. Bun's bundler handles transpilation + fingerprinting for dev (`bun --hot`) and build (`bun build`). Commit: `4d5a72c`.

2. **Embeddings via first-party Jina, not OpenRouter.**
   Task D5 defaulted to `jina-ai/jina-embeddings-v3` through OpenRouter's `/v1/embeddings` endpoint. OpenRouter's embedding proxy only covers `openai/text-embedding-3-*` — all other slugs 400. Shipped fix: `openrouter.ts` now selects between `api.jina.ai/v1/embeddings` (when `JINA_API_KEY` is set) and OpenRouter → OpenAI (fallback). Jina's cosine distribution is flatter than OpenAI's — the documented graph threshold `BOOKMARKS_EDGE_THRESHOLD=0.65` swallows most "related" pairs at Jina scale; documented calibration is now 0.5 Jina / 0.7 OpenAI. Commit: `a43e14b`.

3. **Optimistic-UX pipeline, not fully-synchronous ingest.**
   Task E1's `ingest()` awaited every lens × OpenRouter chat + embed before returning from `POST /api/bookmarks` — ~10-60s of silent waiting per URL. Shipped fix: POST now inserts the bookmark + returns after Jina Reader's title fetch (~2-3s); lens interpretations run as detached background promises. Viewer polls `/api/bookmarks` every 3s and renders a `⏳ Analyzing` placeholder per pending lens so cards fill in lens-by-lens. Commit: `62a2660`.

### What was not wrong, just untested

- **Dockerfile + build.sh + deploy.sh** (Phase G): authored correctly but never
  exercised end-to-end. TODO for follow-up — the HTML-routes server.ts may
  need a small adjustment to bundle viewer assets at build time inside the
  Docker image.
- **PermissionPrompt banner flow** for deploys without `--unattended`: code
  shipped in Phase B + A4, never ran end-to-end with an actual `deploy` call.

### What remains placeholder by design

- **Right-side Chat aside in `templates/ai-bookmarks/viewer/src/App.tsx`**
  is a literal placeholder ("Chat panel will mount here once the build-phase
  agent is wired") per Task F2 scope. Wiring the `doc`-template ChatPanel in
  would close the "talk to agent to customize" story but was intentionally
  out of M4 scope.
