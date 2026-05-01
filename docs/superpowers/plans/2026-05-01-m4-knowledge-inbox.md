# M4 Knowledge Inbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Start M4 by turning the M3 substrate into a real reference app track, while first closing the remaining governed-apply-to-release smoke gap.

**Architecture:** M4 has one bridge slice and one product-prototype line. The bridge slice proves a Builder/Agent capability can be created through the governed `definition.apply` tool path before release, then survive Docker release and restart. The product line introduces a `Knowledge Inbox` reference template on the same substrate, with minimal capture, triage, and review capabilities before any Postgres/Qdrant/deploy-adapter expansion.

**Tech Stack:** Bun, TypeScript, `@pneuma-framework/core`, `@pneuma-framework/runtime`, `@pneuma-framework/core-domain`, SQLite app database, shell lifecycle scripts, Docker.

---

## File Structure

Bridge slice:

- `examples/m3-deployable-substrate/definition-apply-release-smoke.test.ts` — Bun test wrapper for the governed release smoke script.
- `examples/m3-deployable-substrate/definition-apply-release-smoke.sh` — shell smoke that calls `definition.apply` through `createPneumaFramework`, then runs Docker release/restart checks.
- `examples/m3-deployable-substrate/README.md` — adds the new command and clarifies the difference between direct-row capability smoke and governed-apply release smoke.
- `docs/architecture/milestone-3-snapshot.md` and `.zh-CN.md` — later amendment only if the smoke changes the M3/M4 boundary wording.

Knowledge Inbox prototype:

- `templates/knowledge-inbox-core-domain/` — new reference template copied from the bookmarks substrate shape, then renamed and narrowed to the Knowledge Inbox domain.
- `templates/knowledge-inbox-core-domain/server/config.ts` — declares `inbox_items` table, operations, policy, handlers, SQLite persistence.
- `templates/knowledge-inbox-core-domain/server/app.ts` — same minimal Bun runtime shape as bookmarks, with app id changed.
- `templates/knowledge-inbox-core-domain/scripts/*.sh` — lifecycle scripts matching the M3 substrate contract.
- `templates/knowledge-inbox-core-domain/test/operation-declarations.test.ts` — operation contract tests.
- `templates/knowledge-inbox-core-domain/test/deployable-substrate.test.ts` — migrate/build manifest tests.
- `examples/m4-knowledge-inbox/README.md` — M4 demo runbook once the prototype has a credible loop.
- `examples/m4-knowledge-inbox/smoke.test.ts` — local substrate smoke for Knowledge Inbox.
- `examples/m4-knowledge-inbox/docker-smoke.test.ts` and `.sh` — Docker restart smoke for Knowledge Inbox.
- `templates/README.md` and `examples/README.md` — status labels after the template/example exist.

## M4 Minimum Product Loop

The first real app prototype is **Knowledge Inbox**, not a generic bookmarks tool.

Minimum loop:

```text
capture source
  -> store source as inbox item
  -> classify/annotate enough metadata for triage
  -> review queue view lists pending items
  -> mark item as keep / archive
  -> persist data + definition + history through Docker restart
```

First implementation should remain modest:

- no vector database yet;
- no runtime agent yet;
- no custom React view components yet;
- no multi-user admin workflow yet;
- no Postgres yet.

## Task 1: Governed `definition.apply` Release Smoke

**Files:**
- Create: `examples/m3-deployable-substrate/definition-apply-release-smoke.test.ts`
- Create: `examples/m3-deployable-substrate/definition-apply-release-smoke.sh`
- Modify: `examples/m3-deployable-substrate/README.md`

- [x] **Step 1: Write the failing test wrapper**

Create `examples/m3-deployable-substrate/definition-apply-release-smoke.test.ts`:

```ts
import { describe, expect, test } from "bun:test";
import { $ } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";

const scriptPath = join(import.meta.dir, "definition-apply-release-smoke.sh");

describe("M4 governed definition.apply release smoke", () => {
  test("creates a capability through governed definition.apply before Docker release", async () => {
    expect(existsSync(scriptPath)).toBe(true);
    const result = await $`${scriptPath}`.env({ ...process.env }).text();

    expect(result).toContain("definition-apply-release-smoke: governed capability survived Docker restart");
  }, 180_000);
});
```

- [x] **Step 2: Run the wrapper and verify it fails because the script is missing**

Run:

```bash
bun test examples/m3-deployable-substrate/definition-apply-release-smoke.test.ts
```

Expected:

```text
FAIL
definition-apply-release-smoke.sh: No such file or directory
```

- [x] **Step 3: Add the governed release smoke script**

Create `examples/m3-deployable-substrate/definition-apply-release-smoke.sh`:

```sh
#!/bin/sh
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="${PNEUMA_M4_DEFINITION_APPLY_DOCKER_IMAGE:-pneuma-bookmarks-core-domain:definition-apply-release-smoke}"
CONTAINER="pneuma-m4-definition-apply-smoke-$$"
WORKSPACE="$(mktemp -d "$ROOT/.pneuma-m4-definition-apply-XXXXXX")"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$WORKSPACE"
}
trap cleanup EXIT INT TERM

PNEUMA_WORKSPACE="$WORKSPACE" \
  "$ROOT/templates/bookmarks-core-domain/scripts/migrate.sh" >/dev/null

PNEUMA_M4_ROOT="$ROOT" \
PNEUMA_M4_WORKSPACE="$WORKSPACE" \
  bun --cwd "$ROOT" -e '
    const { join } = await import("node:path");
    const { createPneumaFramework } = await import("./packages/core/src/index.ts");

    const root = process.env.PNEUMA_M4_ROOT;
    const workspace = process.env.PNEUMA_M4_WORKSPACE;
    if (!root || !workspace) throw new Error("missing smoke environment");

    const fw = createPneumaFramework({
      templateDir: join(root, "templates/bookmarks-core-domain"),
      workspace,
      authorization: {
        appId: "bookmarks-core-domain",
        workspaceId: workspace,
      },
    });
    fw.orchestrator.setPermissionPromptPushHook((env) => {
      queueMicrotask(() => {
        fw.orchestrator.handleFrameworkPermissionResponse(env.prompt.id, "allow");
      });
    });

    try {
      const start = await fw.toolRegistry.call("lifecycle.dev.start", {});
      if (!start.ok) throw new Error(`dev start failed: ${JSON.stringify(start)}`);

      const result = await fw.toolRegistry.call("definition.apply", {
        require_approval: true,
        kind: "add_table_column",
        table_id: "bookmarks",
        column_name: "tags",
        cell_type: { kind: "primitive", of: "Text" },
        nullable: true,
      });
      if (!result.ok) throw new Error(`definition.apply failed: ${JSON.stringify(result)}`);

      const state = result.state;
      const authorization = state?.authorization;
      if (authorization?.requested_principal?.kind !== "build_agent") {
        throw new Error(`missing build_agent request proof: ${JSON.stringify(result)}`);
      }
      if (authorization?.execution_principal?.kind !== "framework_system") {
        throw new Error(`missing framework_system execution proof: ${JSON.stringify(result)}`);
      }
      if (authorization?.reason_code !== "allowed") {
        throw new Error(`missing allowed authorization proof: ${JSON.stringify(result)}`);
      }
    } finally {
      await fw.close();
    }
  '

docker build -f "$ROOT/templates/bookmarks-core-domain/Dockerfile" -t "$IMAGE" "$ROOT" >/dev/null
docker run \
  --detach \
  --name "$CONTAINER" \
  --env PNEUMA_WORKSPACE=/data \
  --env PNEUMA_DATA_DIR=/data \
  --env PNEUMA_SQLITE_PATH=/data/app.db \
  --env PNEUMA_PORT_HINT=3000 \
  --publish 127.0.0.1::3000 \
  --volume "$WORKSPACE/data":/data \
  "$IMAGE" >/dev/null

HOST_PORT="$(docker port "$CONTAINER" 3000/tcp | sed 's/.*://')"

wait_health() {
  i=0
  while [ "$i" -lt 60 ]; do
    if bun -e "const r = await fetch('http://127.0.0.1:${HOST_PORT}/healthz'); process.exit(r.ok ? 0 : 1)" >/dev/null 2>&1; then
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  docker logs "$CONTAINER" >&2 || true
  return 1
}

assert_tags_column() {
  SMOKE_URL="http://127.0.0.1:${HOST_PORT}" bun -e '
    const base = process.env.SMOKE_URL;
    const config = await fetch(`${base}/api/config`).then((response) => response.json());
    const bookmarks = config.tables?.find((table) => table.id === "bookmarks");
    if (!bookmarks?.columns?.some((column) => column.name === "tags")) {
      console.error(JSON.stringify(config));
      process.exit(1);
    }
  '
}

wait_health
docker exec "$CONTAINER" test -f /data/app.db
assert_tags_column
docker restart "$CONTAINER" >/dev/null
HOST_PORT="$(docker port "$CONTAINER" 3000/tcp | sed 's/.*://')"
wait_health
docker exec "$CONTAINER" test -f /data/app.db
assert_tags_column

echo "definition-apply-release-smoke: governed capability survived Docker restart"
```

The acceptance requirement is that the capability itself is created through `definition.apply` with `require_approval: true`; the migrate step only prepares the real SQLite app database used by both dev and Docker release runtime.

- [x] **Step 4: Run the smoke and verify it passes**

Run:

```bash
bun test examples/m3-deployable-substrate/definition-apply-release-smoke.test.ts
```

Expected:

```text
definition-apply-release-smoke: governed capability survived Docker restart
1 pass
```

- [x] **Step 5: Update the M3 demo README**

Modify `examples/m3-deployable-substrate/README.md` to add:

```bash
bun test examples/m3-deployable-substrate/definition-apply-release-smoke.test.ts
```

Add this explanation:

```text
The governed definition.apply release smoke closes the M3/M4 bridge: it starts
the framework, creates the `bookmarks.tags` capability through `definition.apply`
with `require_approval: true`, verifies the authorization proof records
`build_agent -> framework_system`, then packages the same SQLite app database
into Docker release and verifies `/api/config` after restart.
```

- [x] **Step 6: Run the focused M3/M4 bridge suite**

Run:

```bash
bun test examples/m3-deployable-substrate/capability-release-smoke.test.ts examples/m3-deployable-substrate/definition-apply-release-smoke.test.ts
```

Expected:

```text
2 pass
```

- [x] **Step 7: Commit**

```bash
git add examples/m3-deployable-substrate/definition-apply-release-smoke.test.ts \
  examples/m3-deployable-substrate/definition-apply-release-smoke.sh \
  examples/m3-deployable-substrate/README.md
git commit -m "test: prove governed capability survives release"
```

## Task 2: Establish Knowledge Inbox Template Skeleton

**Files:**
- Create: `templates/knowledge-inbox-core-domain/`
- Modify: `templates/README.md`
- Create: `templates/knowledge-inbox-core-domain/test/operation-declarations.test.ts`
- Create: `templates/knowledge-inbox-core-domain/test/deployable-substrate.test.ts`

- [x] **Step 1: Copy the substrate shape**

Run:

```bash
cp -R templates/bookmarks-core-domain templates/knowledge-inbox-core-domain
rm -rf templates/knowledge-inbox-core-domain/dist
```

- [x] **Step 2: Rename package, manifest, and app id**

Edit:

```text
templates/knowledge-inbox-core-domain/package.json
templates/knowledge-inbox-core-domain/manifest.json
templates/knowledge-inbox-core-domain/server/config.ts
templates/knowledge-inbox-core-domain/server/app.ts
templates/knowledge-inbox-core-domain/Dockerfile
templates/knowledge-inbox-core-domain/docker-compose.yml
```

Required values:

```text
app_id: knowledge-inbox-core-domain
package name: pneuma-template-knowledge-inbox-core-domain
Docker image default: pneuma-knowledge-inbox-core-domain
displayName: Knowledge Inbox Core Domain
```

- [x] **Step 3: Run template declaration tests and expect current bookmark naming failures**

Run:

```bash
bun test templates/knowledge-inbox-core-domain/test/operation-declarations.test.ts
```

Expected:

```text
FAIL
```

The first failure should point at `bookmarks` table or bookmark operation ids. If it fails earlier on imports, fix paths before continuing.

- [x] **Step 4: Commit skeleton after tests compile**

```bash
git add templates/knowledge-inbox-core-domain templates/README.md
git commit -m "feat: scaffold knowledge inbox template"
```

## Task 3: Implement Knowledge Inbox Core Domain

**Files:**
- Modify: `templates/knowledge-inbox-core-domain/server/config.ts`
- Modify: `templates/knowledge-inbox-core-domain/test/operation-declarations.test.ts`

- [x] **Step 1: Replace `bookmarks` with `inbox_items`**

The initial table must be:

```ts
export const inboxItemsTable = new Table({
  id: "inbox_items",
  app_id: APP_ID,
  columns: [
    { name: "url", type: URL_T },
    { name: "title", type: TEXT, nullable: true },
    { name: "source", type: TEXT, nullable: true },
    { name: "summary", type: TEXT, nullable: true },
    { name: "status", type: TEXT },
    { name: "created_at_cell", type: DATE_T },
  ],
  source: { kind: "stored" },
});
```

- [x] **Step 2: Declare minimum operations**

Operations:

```text
capture_item        write inbox_items, non-destructive
list_inbox_items    read inbox_items sorted by created_at_cell desc
update_item_status  write inbox_items, non-destructive
```

`capture_item` output schema:

```ts
{
  kind: "object",
  schema: {
    type: "object",
    properties: {
      id: { type: "string" },
      url: { type: "string" },
      status: { type: "string" },
    },
    required: ["id", "url", "status"],
    additionalProperties: false,
  },
}
```

- [x] **Step 3: Update tests to assert operation contracts**

Assertions:

```ts
expect(config.app_id).toBe("knowledge-inbox-core-domain");
expect(config.tables.map((table) => table.id)).toContain("inbox_items");
expect(config.operations.map((op) => op.id).sort()).toEqual([
  "capture_item",
  "list_inbox_items",
  "update_item_status",
]);
expect(config.operations.find((op) => op.id === "list_inbox_items")?.affects.reads_only).toBe(true);
expect(config.operations.find((op) => op.id === "capture_item")?.output.kind).toBe("object");
```

- [x] **Step 4: Run operation declaration tests**

Run:

```bash
bun test templates/knowledge-inbox-core-domain/test/operation-declarations.test.ts
```

Expected:

```text
PASS
```

- [x] **Step 5: Commit**

```bash
git add templates/knowledge-inbox-core-domain
git commit -m "feat: define knowledge inbox operations"
```

## Task 4: Prove Knowledge Inbox Substrate Persistence

**Files:**
- Modify: `templates/knowledge-inbox-core-domain/test/deployable-substrate.test.ts`
- Create: `examples/m4-knowledge-inbox/smoke.test.ts`
- Create: `examples/m4-knowledge-inbox/README.md`

- [x] **Step 1: Add migrate/build manifest assertions**

The deployable substrate test must assert:

```ts
expect(existsSync(join(workspace, "data", "app.db"))).toBe(true);
expect(manifest.schemaVersion).toBe(1);
expect(manifest.processes.web.command).toContain("server/app.ts");
expect(manifest.data.sqlite).toBe("/data/app.db");
expect(manifest.processes.web.health).toBe("/healthz");
```

- [x] **Step 2: Add local smoke for capture/list**

`examples/m4-knowledge-inbox/smoke.test.ts` must:

```text
boot the Knowledge Inbox runtime
call capture_item with url/title/source
call list_inbox_items
assert the captured row is present with status="pending"
close runtime
reopen runtime against same app.db
call list_inbox_items again
assert the row survived reopen
```

- [x] **Step 3: Run focused tests**

Run:

```bash
bun test templates/knowledge-inbox-core-domain/test/deployable-substrate.test.ts examples/m4-knowledge-inbox/smoke.test.ts
```

Expected:

```text
PASS
```

- [x] **Step 4: Commit**

```bash
git add templates/knowledge-inbox-core-domain/test/deployable-substrate.test.ts \
  examples/m4-knowledge-inbox
git commit -m "test: prove knowledge inbox persistence"
```

## Task 5: Add Docker Restart Smoke For Knowledge Inbox

**Files:**
- Create: `examples/m4-knowledge-inbox/docker-smoke.test.ts`
- Create: `examples/m4-knowledge-inbox/docker-smoke.sh`
- Modify: `examples/m4-knowledge-inbox/README.md`
- Modify: `examples/README.md`

- [x] **Step 1: Write Docker smoke wrapper**

Expected output:

```text
knowledge-inbox-docker-smoke: inbox item survived restart
```

- [x] **Step 2: Implement Docker smoke script**

Flow:

```text
docker build using templates/knowledge-inbox-core-domain/Dockerfile
docker volume create
docker run with PNEUMA_WORKSPACE=/data and PNEUMA_SQLITE_PATH=/data/app.db
wait /healthz
POST /api/operations/capture_item
GET /api/operations/list_inbox_items
docker restart
wait /healthz
GET /api/operations/list_inbox_items
assert item still exists
```

- [x] **Step 3: Run Docker smoke**

Run:

```bash
bun test examples/m4-knowledge-inbox/docker-smoke.test.ts
```

Expected:

```text
PASS
```

- [x] **Step 4: Update example index**

`examples/README.md` should mark `m4-knowledge-inbox` as `canonical` once the smoke passes.

- [x] **Step 5: Commit**

```bash
git add examples/m4-knowledge-inbox examples/README.md
git commit -m "test: add knowledge inbox docker smoke"
```

## Task 6: Make The Reference App Usable In The Browser

**Files:**
- Modify: `templates/knowledge-inbox-core-domain/viewer/index.html`
- Create: `templates/knowledge-inbox-core-domain/test/viewer-contract.test.ts`
- Modify: `examples/m4-knowledge-inbox/README.md`

- [x] **Step 1: Add a viewer contract test**

The test asserts the viewer exposes a capture panel, queue panel, detail panel,
runtime evidence panel, status filters, and the three Operation endpoints.

- [x] **Step 2: Rebuild the viewer as a product UI**

The viewer now supports:

```text
capture item
filter pending / kept / archived / all
select queue item
update selected item status
show SQLite / Operation evidence
show live schema / domain service / API substrate from /api/config
```

- [x] **Step 3: Browser QA**

Manual browser QA covered capture, status update, filters, empty states, and
console errors against a live local runtime.

- [x] **Step 4: Commit**

```bash
git add templates/knowledge-inbox-core-domain/viewer/index.html \
  templates/knowledge-inbox-core-domain/test/viewer-contract.test.ts \
  examples/m4-knowledge-inbox/README.md \
  docs/superpowers/plans/2026-05-01-m4-knowledge-inbox.md
git commit -m "feat: refine knowledge inbox viewer"
```

## M4 Exit Criteria For This Plan

M4 is **not** fully closed by this plan. This plan only opens the milestone and proves the first product-shaped reference app loop.

The plan is complete when:

```text
governed definition.apply release smoke passes
Knowledge Inbox template exists
capture/list/status operations pass declaration tests
SQLite persistence smoke passes
Docker restart smoke passes
README indices label the new template/example correctly
Knowledge Inbox viewer supports the capture/triage loop in browser
Knowledge Inbox viewer explains schema, domain service, and API substrate live
```

Recommended verification command after all tasks:

```bash
bun test examples/m3-deployable-substrate/definition-apply-release-smoke.test.ts \
  templates/knowledge-inbox-core-domain/test/operation-declarations.test.ts \
  templates/knowledge-inbox-core-domain/test/deployable-substrate.test.ts \
  templates/knowledge-inbox-core-domain/test/viewer-contract.test.ts \
  examples/m4-knowledge-inbox/smoke.test.ts \
  examples/m4-knowledge-inbox/docker-smoke.test.ts

bun run typecheck
git diff --check
```

## Self-Review

Spec coverage:

- M4 minimum product loop is defined as capture -> triage -> review queue -> status update -> persistence.
- M3/M4 bridge gap is covered by Task 1.
- Knowledge Inbox starts on the M3 substrate and does not introduce Postgres, Qdrant, Runtime Agent, custom components, or deploy adapters.
- The browser viewer proves the reference app can be understood as an app, not only as a smoke suite.
- The substrate inspector makes the app's schema, Operation contracts, and HTTP API visible without opening source code.

Placeholder scan:

- No `TBD`, `TODO`, or unspecified "write tests" steps remain.
- Later tasks intentionally defer implementation details to exact accepted behavior and commands; no task asks a worker to invent a new product surface.

Type consistency:

- App id is consistently `knowledge-inbox-core-domain`.
- Table id is consistently `inbox_items`.
- Operation ids are consistently `capture_item`, `list_inbox_items`, and `update_item_status`.
