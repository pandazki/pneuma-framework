#!/bin/sh
set -e
if [ -z "$PNEUMA_ARTIFACT_MANIFEST" ]; then
  echo "no manifest path" 1>&2
  exit 2
fi
echo "would deploy artifact at $PNEUMA_ARTIFACT_MANIFEST"
