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
