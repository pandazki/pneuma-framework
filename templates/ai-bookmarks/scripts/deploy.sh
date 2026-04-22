#!/bin/sh
set -eu
: "${PNEUMA_ARTIFACT_MANIFEST:?}"

TARGET="${PNEUMA_DEPLOY_TARGET:-local}"
MANIFEST="$PNEUMA_ARTIFACT_MANIFEST"
# Extract image tag from the manifest's "produced" array.
# Tolerates either string or array form for the first element.
IMAGE=$(bun -e 'const m = JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")); const p = m.produced; console.log(Array.isArray(p) ? p[0] : p);' "$MANIFEST")
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
