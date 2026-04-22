#!/bin/sh
set -eu
: "${PNEUMA_WORKSPACE:?}"

TEMPLATE_DIR="$(cd "$(dirname "$0")/.." && pwd)"
WS="$PNEUMA_WORKSPACE"

# First-run safety: if the workspace hasn't been set up, run setup.
if [ ! -f "$WS/lenses.json" ]; then
  sh "$TEMPLATE_DIR/scripts/setup.sh"
fi

trap 'echo "##pneuma:stopping"; kill 0 2>/dev/null; exit 0' TERM INT

cd "$TEMPLATE_DIR"
exec bun --hot server/server.ts
