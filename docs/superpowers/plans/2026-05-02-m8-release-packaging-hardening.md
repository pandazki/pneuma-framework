# M8 Release Packaging Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that an evolved Knowledge Inbox app can be packaged as a Docker release artifact and preserve the Priority Queue capability through container restart.

**Architecture:** Add a milestone example under `examples/m8-release-packaging-hardening/`. The example prepares an evolved SQLite workspace, validates the Knowledge Inbox build manifest, builds/runs the existing Dockerfile with the workspace data mounted as `/data`, and verifies release runtime surfaces before and after restart.

**Tech Stack:** Bun tests, shell smoke script, Knowledge Inbox template, SQLite app database, Docker.

---

### Task 1: Add the M8 Release Smoke Test

**Files:**
- Create: `examples/m8-release-packaging-hardening/release-packaging-smoke.test.ts`
- Create: `examples/m8-release-packaging-hardening/release-packaging-smoke.sh`
- Create: `examples/m8-release-packaging-hardening/README.md`

- [ ] **Step 1: Write the failing Bun test**

```ts
import { describe, expect, test } from "bun:test";
import { $ } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";

const scriptPath = join(import.meta.dir, "release-packaging-smoke.sh");

describe("M8 release packaging hardening", () => {
  test("packages an evolved Knowledge Inbox capability into a restartable Docker release", async () => {
    expect(existsSync(scriptPath)).toBe(true);
    const output = await $`${scriptPath}`.text();
    expect(output).toContain("m8-release-packaging-smoke: evolved Knowledge Inbox survived release restart");
  }, 240_000);
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
bun test examples/m8-release-packaging-hardening/release-packaging-smoke.test.ts
```

Expected: FAIL because `release-packaging-smoke.sh` does not exist or is not executable.

- [ ] **Step 3: Add the smoke script**

Create `release-packaging-smoke.sh` with these responsibilities:

```sh
#!/bin/sh
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="${PNEUMA_M8_DOCKER_IMAGE:-pneuma-knowledge-inbox-core-domain:m8-release-smoke}"
CONTAINER="pneuma-m8-release-smoke-$$"
WORKSPACE="$(mktemp -d "$ROOT/.pneuma-m8-release-XXXXXX")"
BUILD_DIR="$WORKSPACE/.pneuma-build/m8"
MANIFEST_PATH="$BUILD_DIR/build.manifest.json"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$WORKSPACE"
}
trap cleanup EXIT INT TERM

TEMPLATE="$ROOT/templates/knowledge-inbox-core-domain"
DATA_DIR="$WORKSPACE/data"
DB_PATH="$DATA_DIR/app.db"

PNEUMA_WORKSPACE="$WORKSPACE" \
PNEUMA_DATA_DIR="$DATA_DIR" \
PNEUMA_SQLITE_PATH="$DB_PATH" \
  "$TEMPLATE/scripts/migrate.sh" >/dev/null

PNEUMA_ROOT="$ROOT" \
PNEUMA_WORKSPACE="$WORKSPACE" \
PNEUMA_DATA_DIR="$DATA_DIR" \
PNEUMA_SQLITE_PATH="$DB_PATH" \
  bun --cwd "$ROOT" examples/m8-release-packaging-hardening/seed-evolved-knowledge-inbox.ts

PNEUMA_BUILD_DIR="$BUILD_DIR" \
PNEUMA_ARTIFACT_MANIFEST_PATH="$MANIFEST_PATH" \
  "$TEMPLATE/scripts/build.sh" >/dev/null

M8_MANIFEST_PATH="$MANIFEST_PATH" \
  bun --cwd "$ROOT" examples/m8-release-packaging-hardening/assert-build-manifest.ts

docker build -f "$TEMPLATE/Dockerfile" -t "$IMAGE" "$ROOT" >/dev/null

docker run \
  --detach \
  --name "$CONTAINER" \
  --env PNEUMA_WORKSPACE=/data \
  --env PNEUMA_DATA_DIR=/data \
  --env PNEUMA_SQLITE_PATH=/data/app.db \
  --env PNEUMA_PORT_HINT=3000 \
  --publish 127.0.0.1::3000 \
  --volume "$DATA_DIR":/data \
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

assert_release_capability() {
  M8_RELEASE_URL="http://127.0.0.1:${HOST_PORT}" \
    bun --cwd "$ROOT" examples/m8-release-packaging-hardening/assert-release-capability.ts
}

wait_health
docker exec "$CONTAINER" test -f /data/app.db
assert_release_capability
docker restart "$CONTAINER" >/dev/null
HOST_PORT="$(docker port "$CONTAINER" 3000/tcp | sed 's/.*://')"
wait_health
docker exec "$CONTAINER" test -f /data/app.db
assert_release_capability

echo "m8-release-packaging-smoke: evolved Knowledge Inbox survived release restart"
```

- [ ] **Step 4: Run test to verify missing helper failures**

Run the same Bun test. Expected: FAIL because helper scripts are not implemented yet.

### Task 2: Add Deterministic Evolved Workspace Preparation

**Files:**
- Create: `examples/m8-release-packaging-hardening/seed-evolved-knowledge-inbox.ts`
- Create: `examples/m8-release-packaging-hardening/assert-build-manifest.ts`
- Create: `examples/m8-release-packaging-hardening/assert-release-capability.ts`

- [ ] **Step 1: Implement `seed-evolved-knowledge-inbox.ts`**

Use `createPneumaFramework` against `templates/knowledge-inbox-core-domain`, install an auto-allow framework permission hook, call `lifecycle.dev.start`, then call `definition.apply_change_set` with the Priority Queue changes and `require_approval: true`. Seed three inbox rows with priorities `P1`, `P2`, `P3`, then close the framework.

- [ ] **Step 2: Implement `assert-build-manifest.ts`**

Read `process.env.M8_MANIFEST_PATH`, parse JSON, and assert:

```ts
manifest.schemaVersion === 1
manifest.entrypoint === "server/app.ts"
manifest.processes.web.command includes "server/app.ts"
manifest.processes.web.health === "/healthz"
manifest.data.volume === "/data"
manifest.data.sqlite === "/data/app.db"
manifest.migrations.command === "scripts/migrate.sh"
manifest.deployHints.requiresMigration === true
manifest.deployHints.runtimeAgent === "none"
```

- [ ] **Step 3: Implement `assert-release-capability.ts`**

Fetch `${M8_RELEASE_URL}/api/config` and assert `inbox_items.priority`, `list_priority_queue`, `priority_queue`, and a read policy for `priority_queue`. Fetch `${M8_RELEASE_URL}/api/operations/list_priority_queue` and assert rows include `P1`, `P2`, and `P3`.

- [ ] **Step 4: Run test to verify GREEN**

Run:

```bash
bun test examples/m8-release-packaging-hardening/release-packaging-smoke.test.ts
```

Expected: PASS with the final smoke message.

### Task 3: Document M8 Example

**Files:**
- Modify: `examples/m8-release-packaging-hardening/README.md`
- Modify: `docs/architecture/README.md`
- Modify: `docs/architecture/roadmap.md`
- Modify: `AGENTS.md`

- [ ] **Step 1: Write the example README**

Document what the smoke proves, how to run it, and what it deliberately does not prove.

- [ ] **Step 2: Update architecture navigation**

Add M8 as active/closed depending on verification status, and point next-session readers at the M8 release packaging example.

- [ ] **Step 3: Run doc and type checks**

Run:

```bash
bun run typecheck
git diff --check
```

Expected: both pass.

### Task 4: Snapshot After Verification

**Files:**
- Create: `docs/architecture/milestone-8-snapshot.md`
- Create: `docs/architecture/milestone-8-snapshot.zh-CN.md`

- [ ] **Step 1: Write the English snapshot**

Explain M8 for zero-context teammates: M7 approved the capability; M8 packaged the evolved app into a restartable release container.

- [ ] **Step 2: Write the Chinese snapshot**

Mirror the English snapshot in Chinese, including the same evidence matrix and boundaries.

- [ ] **Step 3: Run final verification**

Run:

```bash
bun test examples/m8-release-packaging-hardening/release-packaging-smoke.test.ts
bun run typecheck
git diff --check
```

Expected: all pass.

