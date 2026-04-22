#!/bin/sh
set -eu
: "${PNEUMA_WORKSPACE:?}"
: "${PNEUMA_BUILD_DIR:?}"

TEMPLATE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
# Build context is the repo root — the template's viewer depends on the
# @pneuma-framework/viewer-react workspace package, which Bun can only resolve
# when it can see the whole monorepo. `-f` points back to this template's
# Dockerfile; the Dockerfile's COPY lines pick what ends up in the image.
REPO_ROOT="$(cd "$TEMPLATE_DIR/../.." && pwd)"
IMAGE_NAME="${PNEUMA_IMAGE_NAME:-pneuma-ai-bookmarks}"
TAG="${PNEUMA_IMAGE_TAG:-$(bun -e 'console.log(Date.now())')}"
FULL="${IMAGE_NAME}:${TAG}"

echo "##pneuma:progress 10 building docker image ${FULL}"
(cd "$REPO_ROOT" && docker build -f "$TEMPLATE_DIR/Dockerfile" -t "$FULL" .) 1>&2

mkdir -p "$PNEUMA_BUILD_DIR"
cat > "$PNEUMA_BUILD_DIR/build.manifest.json" <<JSON
{
  "schemaVersion": 1,
  "kind": "docker-image",
  "entrypoint": "docker://${FULL}",
  "produced": ["${FULL}"],
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
