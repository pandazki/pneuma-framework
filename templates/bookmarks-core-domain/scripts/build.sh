#!/bin/sh
# bookmarks-core-domain / build.sh — typecheck + emit build manifest.
set -e

HERE="$(dirname "$0")/.."
cd "$HERE"

# typecheck
bun x tsc --noEmit -p tsconfig.json

# Build manifest — Bun 运行时不需要 bundle (server 直接 bun run TS),
# viewer 是静态 HTML. Artifact manifest 指向源文件 + static assets.
if [ -n "$PNEUMA_ARTIFACT_MANIFEST_PATH" ]; then
  mkdir -p "$(dirname "$PNEUMA_ARTIFACT_MANIFEST_PATH")"
  cat > "$PNEUMA_ARTIFACT_MANIFEST_PATH" <<EOF
{
  "schemaVersion": 1,
  "kind": "bookmarks-core-domain",
  "entrypoint": "server/app.ts",
  "produced": ["server/app.ts", "viewer/index.html", "manifest.json"],
  "processes": {
    "web": {
      "command": "bun server/app.ts",
      "health": "/healthz"
    }
  },
  "data": {
    "volume": "/data",
    "sqlite": "/data/app.db"
  },
  "migrations": {
    "command": "scripts/migrate.sh",
    "direction": "up"
  },
  "healthcheck": "/healthz",
  "deployHints": {
    "requiresMigration": true,
    "runtimeAgent": "none"
  }
}
EOF
  echo "build manifest written to $PNEUMA_ARTIFACT_MANIFEST_PATH"
fi

echo "build ok"
