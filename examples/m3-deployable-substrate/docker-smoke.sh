#!/bin/sh
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="${PNEUMA_M3_DOCKER_IMAGE:-pneuma-bookmarks-core-domain:smoke}"
CONTAINER="pneuma-m3-smoke-$$"
VOLUME="pneuma-m3-smoke-data-$$"

cleanup() {
  docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
  docker volume rm "$VOLUME" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker build -f "$ROOT/templates/bookmarks-core-domain/Dockerfile" -t "$IMAGE" "$ROOT" >/dev/null
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

wait_health
docker exec "$CONTAINER" test -f /data/app.db
SMOKE_URL="http://127.0.0.1:${HOST_PORT}" bun -e '
  const base = process.env.SMOKE_URL;
  const add = await fetch(`${base}/api/operations/add_bookmark`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input: { url: "https://m3-smoke.local", title: "M3 Smoke" } }),
  });
  if (!add.ok) {
    console.error(await add.text());
    process.exit(1);
  }
  const list = await fetch(`${base}/api/operations/list_bookmarks`);
  const body = await list.json();
  if (!body.rows?.some((row) => row.url === "https://m3-smoke.local" && row.title === "M3 Smoke")) {
    console.error(JSON.stringify(body));
    process.exit(1);
  }
'
docker restart "$CONTAINER" >/dev/null
HOST_PORT="$(docker port "$CONTAINER" 3000/tcp | sed 's/.*://')"
wait_health
docker exec "$CONTAINER" test -f /data/app.db
SMOKE_URL="http://127.0.0.1:${HOST_PORT}" bun -e '
  const base = process.env.SMOKE_URL;
  const list = await fetch(`${base}/api/operations/list_bookmarks`);
  const body = await list.json();
  if (!body.rows?.some((row) => row.url === "https://m3-smoke.local" && row.title === "M3 Smoke")) {
    console.error(JSON.stringify(body));
    process.exit(1);
  }
'
echo "docker-smoke: bookmark survived restart"
