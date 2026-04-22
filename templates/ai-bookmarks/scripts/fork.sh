#!/bin/sh
set -eu
: "${PNEUMA_FORK_SOURCE:?}"
: "${PNEUMA_FORK_TARGET:?}"

SRC="$PNEUMA_FORK_SOURCE"
TGT="$PNEUMA_FORK_TARGET"

mkdir -p "$TGT"
# Copy everything except runtime DB and shadow-git state.
rsync -a --exclude='.pneuma' --exclude='.pneuma-data' --exclude='.pneuma-build' --exclude='node_modules' "$SRC/" "$TGT/"

echo "##pneuma:progress 100 forked to $TGT"
exit 0
