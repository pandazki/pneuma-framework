#!/bin/sh
: "${PNEUMA_FORK_SOURCE:?}"
: "${PNEUMA_FORK_TARGET:?}"
mkdir -p "$PNEUMA_FORK_TARGET"
if [ -f "$PNEUMA_FORK_SOURCE/marker.txt" ]; then
  cp "$PNEUMA_FORK_SOURCE/marker.txt" "$PNEUMA_FORK_TARGET/marker.txt"
fi
exit 0
