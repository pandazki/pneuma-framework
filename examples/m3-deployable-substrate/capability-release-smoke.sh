#!/bin/sh
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="${PNEUMA_M3_CAPABILITY_DOCKER_IMAGE:-pneuma-bookmarks-core-domain:capability-smoke}"
CONTAINER="pneuma-m3-capability-smoke-$$"
WORKSPACE="$(mktemp -d "$ROOT/.pneuma-m3-capability-XXXXXX")"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$WORKSPACE"
}
trap cleanup EXIT INT TERM

PNEUMA_WORKSPACE="$WORKSPACE" \
PNEUMA_DATA_DIR="$WORKSPACE/data" \
PNEUMA_SQLITE_PATH="$WORKSPACE/data/app.db" \
  "$ROOT/templates/bookmarks-core-domain/scripts/migrate.sh" >/dev/null

PNEUMA_WORKSPACE="$WORKSPACE" \
PNEUMA_DATA_DIR="$WORKSPACE/data" \
PNEUMA_SQLITE_PATH="$WORKSPACE/data/app.db" \
  bun --cwd "$ROOT/templates/bookmarks-core-domain" -e '
    const { bootAppRuntime } = await import("@pneuma-framework/runtime");
    const { pneumaTableColumnEntryToRow } = await import("@pneuma-framework/core-domain");
    const { config } = await import("./server/config.ts");

    const runtime = await bootAppRuntime(config);
    await runtime.storage.saveRow(pneumaTableColumnEntryToRow({
      id: "ptc-release-tags",
      app_id: config.app_id,
      table_id: "bookmarks",
      column_name: "tags",
      cell_type: { kind: "primitive", of: "Text" },
      nullable: true,
      created_by: "builder-release-smoke",
      created_by_kind: "builder",
      definition_version: 1,
    }));
    await runtime.history.append({
      app_id: config.app_id,
      history_type: "snapshot",
      payload: { definition: "bookmarks.tags" },
      is_ai_generated: true,
      actor_id: "builder-release-smoke",
      actor_kind: "builder",
      description: "add tags column for release smoke",
    });
    await runtime.close();
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

echo "capability-release-smoke: capability survived Docker restart"
