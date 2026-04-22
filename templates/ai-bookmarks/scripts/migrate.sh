#!/bin/sh
set -eu
: "${PNEUMA_WORKSPACE:?}"
: "${PNEUMA_MIGRATE_DIRECTION:=up}"

WS="$PNEUMA_WORKSPACE"
DB="$WS/.pneuma-data/db.sqlite"
mkdir -p "$WS/.pneuma-data"

if [ "$PNEUMA_MIGRATE_DIRECTION" != "up" ]; then
  echo "pneuma: only direction=up is supported in v0 (got ${PNEUMA_MIGRATE_DIRECTION})" 1>&2
  exit 1
fi

# Ensure the _migrations table exists.
sqlite3 "$DB" "CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at INTEGER NOT NULL);"

# Apply each migration file that hasn't been applied yet, in lexical order.
for f in "$WS"/migrations/*.sql; do
  [ -e "$f" ] || continue
  name=$(basename "$f")
  applied=$(sqlite3 "$DB" "SELECT 1 FROM _migrations WHERE name='$name' LIMIT 1;")
  if [ -z "$applied" ]; then
    echo "pneuma: applying $name"
    sqlite3 "$DB" < "$f"
    sqlite3 "$DB" "INSERT INTO _migrations(name, applied_at) VALUES('$name', $(date +%s%3N));"
  fi
done

echo "##pneuma:progress 100 migrated"
exit 0
