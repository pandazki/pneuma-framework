#!/bin/sh
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="${PNEUMA_M8_DOCKER_IMAGE:-pneuma-knowledge-inbox-core-domain:m8-release-smoke}"
CONTAINER="pneuma-m8-release-smoke-$$"
WORKSPACE="$(mktemp -d "$ROOT/.pneuma-m8-release-XXXXXX")"
BUILD_DIR="$WORKSPACE/.pneuma-build/m8"
MANIFEST_PATH="$BUILD_DIR/build.manifest.json"
TEMPLATE="$ROOT/templates/knowledge-inbox-core-domain"
DATA_DIR="$WORKSPACE/data"
DB_PATH="$DATA_DIR/app.db"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$WORKSPACE"
}
trap cleanup EXIT INT TERM

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

