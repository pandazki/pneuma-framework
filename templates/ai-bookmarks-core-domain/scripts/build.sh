#!/bin/sh
set -e

HERE="$(dirname "$0")/.."
cd "$HERE"

bun x tsc --noEmit -p tsconfig.json

if [ -n "$PNEUMA_ARTIFACT_MANIFEST_PATH" ]; then
  mkdir -p "$(dirname "$PNEUMA_ARTIFACT_MANIFEST_PATH")"
  cat > "$PNEUMA_ARTIFACT_MANIFEST_PATH" <<EOF
{
  "kind": "ai-bookmarks-core-domain",
  "entry": "server/app.ts",
  "viewer": "viewer/index.html",
  "runtime": "bun",
  "requires_env": ["OPENROUTER_API_KEY"]
}
EOF
fi

echo "build ok"
