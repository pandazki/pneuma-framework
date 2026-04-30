#!/bin/sh
set -eu

HERE="$(dirname "$0")/.."
WS="${PNEUMA_WORKSPACE:-$HERE/.pneuma-workspace}"
DB="${PNEUMA_SQLITE_PATH:-$WS/data/app.db}"

mkdir -p "$(dirname "$DB")"
PNEUMA_SQLITE_PATH="$DB" bun --cwd "$HERE" -e '
  const { openPneumaSqliteDatabase } = await import("@pneuma-framework/core-domain");
  const db = openPneumaSqliteDatabase(process.env.PNEUMA_SQLITE_PATH);
  db.close();
'

echo "##pneuma:progress 100 migrated"
