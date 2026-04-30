#!/bin/sh
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="${PNEUMA_M4_KNOWLEDGE_INBOX_DOCKER_IMAGE:-pneuma-knowledge-inbox-core-domain:smoke}"
CONTAINER="pneuma-m4-knowledge-inbox-smoke-$$"
VOLUME="pneuma-m4-knowledge-inbox-data-$$"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker volume rm "$VOLUME" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker build -f "$ROOT/templates/knowledge-inbox-core-domain/Dockerfile" -t "$IMAGE" "$ROOT" >/dev/null
docker volume create "$VOLUME" >/dev/null
docker run \
  --detach \
  --name "$CONTAINER" \
  --env PNEUMA_WORKSPACE=/data \
  --env PNEUMA_DATA_DIR=/data \
  --env PNEUMA_SQLITE_PATH=/data/app.db \
  --env PNEUMA_PORT_HINT=3000 \
  --publish 127.0.0.1::3000 \
  --volume "$VOLUME":/data \
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

assert_item() {
  SMOKE_URL="http://127.0.0.1:${HOST_PORT}" bun -e '
    const base = process.env.SMOKE_URL;
    const list = await fetch(`${base}/api/operations/list_inbox_items`);
    const body = await list.json();
    if (!list.ok) {
      console.error(JSON.stringify(body));
      process.exit(1);
    }
    if (!body.rows?.some((row) =>
      row.url === "https://m4-smoke.local/knowledge-inbox" &&
      row.title === "M4 Docker Smoke" &&
      row.status === "kept"
    )) {
      console.error(JSON.stringify(body));
      process.exit(1);
    }
  '
}

wait_health
docker exec "$CONTAINER" test -f /data/app.db
SMOKE_URL="http://127.0.0.1:${HOST_PORT}" bun -e '
  const base = process.env.SMOKE_URL;
  const capture = await fetch(`${base}/api/operations/capture_item`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      input: {
        url: "https://m4-smoke.local/knowledge-inbox",
        title: "M4 Docker Smoke",
        source: "docker",
        summary: "Captured through the release container",
      },
    }),
  });
  const captured = await capture.json();
  if (!capture.ok) {
    console.error(JSON.stringify(captured));
    process.exit(1);
  }
  const id = captured.output?.id;
  if (!id) {
    console.error(JSON.stringify(captured));
    process.exit(1);
  }
  const update = await fetch(`${base}/api/operations/update_item_status`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input: { item_id: id, status: "kept" } }),
  });
  if (!update.ok) {
    console.error(await update.text());
    process.exit(1);
  }
'
assert_item
docker restart "$CONTAINER" >/dev/null
HOST_PORT="$(docker port "$CONTAINER" 3000/tcp | sed 's/.*://')"
wait_health
docker exec "$CONTAINER" test -f /data/app.db
assert_item

echo "knowledge-inbox-docker-smoke: inbox item survived restart"
