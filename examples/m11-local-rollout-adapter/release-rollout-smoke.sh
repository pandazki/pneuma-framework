#!/bin/sh
set -eu

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
IMAGE="${PNEUMA_M11_DOCKER_IMAGE:-pneuma-knowledge-inbox-core-domain:m10-semantic-smoke}"
ACTIVE_CONTAINER="pneuma-m11-active-$$"
CANDIDATE_CONTAINER="pneuma-m11-candidate-$$"
WORKSPACE="$(mktemp -d "$ROOT/.pneuma-m11-rollout-XXXXXX")"
ROLLOUT_WORKSPACE="$WORKSPACE/rollout-state"
BASELINE_WORKSPACE="$WORKSPACE/baseline"
CANDIDATE_WORKSPACE="$WORKSPACE/candidate"
BUILD_DIR="$WORKSPACE/.pneuma-build/m11"
MANIFEST_PATH="$BUILD_DIR/build.manifest.json"
TEMPLATE="$ROOT/templates/knowledge-inbox-core-domain"
RUN_OUTPUT="$WORKSPACE/rollout-output.json"

cleanup() {
  docker rm -f "$ACTIVE_CONTAINER" "$CANDIDATE_CONTAINER" >/dev/null 2>&1 || true
  rm -rf "$WORKSPACE"
}
trap cleanup EXIT INT TERM

migrate_workspace() {
  workspace="$1"
  data_dir="$workspace/data"
  db_path="$data_dir/app.db"
  PNEUMA_WORKSPACE="$workspace" \
  PNEUMA_DATA_DIR="$data_dir" \
  PNEUMA_SQLITE_PATH="$db_path" \
    "$TEMPLATE/scripts/migrate.sh" >/dev/null
}

prepare_workspace() {
  workspace="$1"
  semantic="$2"
  migrate_workspace "$workspace"
  bun --cwd "$ROOT" examples/m11-local-rollout-adapter/prepare-release-data.ts \
    --workspace "$workspace" \
    --semantic "$semantic" >/dev/null
}

start_container() {
  container="$1"
  data_dir="$2"
  docker run \
    --detach \
    --name "$container" \
    --env PNEUMA_WORKSPACE=/data \
    --env PNEUMA_DATA_DIR=/data \
    --env PNEUMA_SQLITE_PATH=/data/app.db \
    --env PNEUMA_PORT_HINT=3000 \
    --publish 127.0.0.1::3000 \
    --volume "$data_dir":/data \
    "$IMAGE" >/dev/null
}

host_port() {
  docker port "$1" 3000/tcp | sed 's/.*://'
}

wait_health() {
  container="$1"
  port="$2"
  i=0
  while [ "$i" -lt 60 ]; do
    if M11_URL="http://127.0.0.1:${port}" bun -e "const r = await fetch(process.env.M11_URL + '/healthz'); process.exit(r.ok ? 0 : 1)" >/dev/null 2>&1; then
      return 0
    fi
    i=$((i + 1))
    sleep 1
  done
  docker logs "$container" >&2 || true
  return 1
}

assert_semantic_status() {
  url="$1"
  expected="$2"
  M11_URL="$url" M11_EXPECTED="$expected" bun -e '
    const response = await fetch(process.env.M11_URL + "/api/operations/semantic_search_items", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: { query: "release risk from customer escalation", limit: 1 } }),
    });
    if (!response.ok) {
      throw new Error(`semantic_search_items failed with HTTP ${response.status}: ${await response.text()}`);
    }
    const body = await response.json();
    const output = body.output ?? {};
    if (output.index_status !== process.env.M11_EXPECTED) {
      throw new Error(`expected ${process.env.M11_EXPECTED}, got ${JSON.stringify(body)}`);
    }
    if (process.env.M11_EXPECTED === "ready" && output.rows?.[0]?.item_id !== "risk") {
      throw new Error(`expected risk top hit, got ${JSON.stringify(body)}`);
    }
  '
}

ensure_image() {
  if docker image inspect "$IMAGE" >/dev/null 2>&1; then
    return 0
  fi

  echo "M11 rollout smoke image not found; building $IMAGE" >&2
  PNEUMA_BUILD_DIR="$BUILD_DIR" \
  PNEUMA_ARTIFACT_MANIFEST_PATH="$MANIFEST_PATH" \
    "$TEMPLATE/scripts/build.sh" >/dev/null
  docker build -f "$TEMPLATE/Dockerfile" -t "$IMAGE" "$ROOT"
}

prepare_workspace "$BASELINE_WORKSPACE" missing
prepare_workspace "$CANDIDATE_WORKSPACE" ready

ensure_image

start_container "$ACTIVE_CONTAINER" "$BASELINE_WORKSPACE/data"
ACTIVE_PORT="$(host_port "$ACTIVE_CONTAINER")"
wait_health "$ACTIVE_CONTAINER" "$ACTIVE_PORT"
ACTIVE_URL="http://127.0.0.1:${ACTIVE_PORT}"
assert_semantic_status "$ACTIVE_URL" missing

start_container "$CANDIDATE_CONTAINER" "$CANDIDATE_WORKSPACE/data"
CANDIDATE_PORT="$(host_port "$CANDIDATE_CONTAINER")"
wait_health "$CANDIDATE_CONTAINER" "$CANDIDATE_PORT"
CANDIDATE_URL="http://127.0.0.1:${CANDIDATE_PORT}"
assert_semantic_status "$CANDIDATE_URL" ready

bun --cwd "$ROOT" examples/m11-local-rollout-adapter/run.ts \
  --workspace "$ROLLOUT_WORKSPACE" \
  --baseline-url "$ACTIVE_URL" \
  --candidate-url "$CANDIDATE_URL" \
  --baseline-image-tag "$IMAGE" \
  --candidate-image-tag "$IMAGE" > "$RUN_OUTPUT"

M11_OUTPUT="$RUN_OUTPUT" bun -e '
  const result = JSON.parse(await Bun.file(process.env.M11_OUTPUT).text());
  if (result.summary.before.active_candidate_id !== "rc-baseline") {
    throw new Error(`expected baseline before promotion: ${JSON.stringify(result.summary.before)}`);
  }
  if (result.summary.after_promote.active_candidate_id !== "rc-semantic-search") {
    throw new Error(`expected semantic candidate after promote: ${JSON.stringify(result.summary.after_promote)}`);
  }
  if (result.summary.after_rollback.active_candidate_id !== "rc-baseline") {
    throw new Error(`expected baseline after rollback: ${JSON.stringify(result.summary.after_rollback)}`);
  }
'

assert_semantic_status "$ACTIVE_URL" missing
assert_semantic_status "$CANDIDATE_URL" ready

echo "m11-release-rollout-smoke: promoted semantic candidate and rolled back baseline"
