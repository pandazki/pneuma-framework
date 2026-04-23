#!/bin/sh
set -e

HERE="$(dirname "$0")/.."
cd "$HERE"

bun x tsc --noEmit -p tsconfig.json

if [ -n "$PNEUMA_ARTIFACT_MANIFEST_PATH" ]; then
  mkdir -p "$(dirname "$PNEUMA_ARTIFACT_MANIFEST_PATH")"
  cat > "$PNEUMA_ARTIFACT_MANIFEST_PATH" <<EOF
{
  "kind": "weekly-linear-digest",
  "entry": "server/app.ts",
  "viewer": "viewer/index.html",
  "runtime": "bun",
  "requires_env": ["LINEAR_API_KEY", "OPENROUTER_API_KEY"]
}
EOF
  echo "build manifest written to $PNEUMA_ARTIFACT_MANIFEST_PATH"
fi

echo "build ok"
