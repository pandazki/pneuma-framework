#!/bin/sh
set -eu
: "${PNEUMA_WORKSPACE:?}"

TEMPLATE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WS="$PNEUMA_WORKSPACE"

mkdir -p "$WS/.pneuma-data"
mkdir -p "$WS/migrations"
mkdir -p "$WS/viewer/src"

# Seed scaffolds the first time.
if [ ! -f "$WS/lenses.json" ]; then
  cp "$TEMPLATE_DIR/scaffold/lenses.json" "$WS/lenses.json"
fi
if [ ! -f "$WS/migrations/001-init.sql" ]; then
  cp "$TEMPLATE_DIR/scaffold/migrations/001-init.sql" "$WS/migrations/"
fi
if [ ! -f "$WS/AGENTS.md" ]; then
  cp "$TEMPLATE_DIR/skill/SKILL.md" "$WS/AGENTS.md"
fi

echo "##pneuma:progress 30 seeded scaffolds"

# Run initial migration.
PNEUMA_MIGRATE_DIRECTION=up sh "$TEMPLATE_DIR/scripts/migrate.sh"

echo "##pneuma:progress 100 ready"
exit 0
