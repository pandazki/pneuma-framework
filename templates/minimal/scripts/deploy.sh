#!/bin/sh
set -e
if [ -z "$PNEUMA_ARTIFACT_MANIFEST" ]; then
  echo "pneuma: PNEUMA_ARTIFACT_MANIFEST is empty" 1>&2
  exit 2
fi
echo "pneuma: would deploy artifact described at $PNEUMA_ARTIFACT_MANIFEST"
