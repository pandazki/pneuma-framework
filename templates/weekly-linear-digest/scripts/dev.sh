#!/bin/sh
set -e

HERE="$(dirname "$0")/.."
cd "$HERE"

if [ -z "$LINEAR_API_KEY" ]; then
  echo "ERROR: LINEAR_API_KEY env not set. export LINEAR_API_KEY=lin_api_..." >&2
  exit 1
fi
if [ -z "$OPENROUTER_API_KEY" ]; then
  echo "ERROR: OPENROUTER_API_KEY env not set. export OPENROUTER_API_KEY=sk-or-..." >&2
  exit 1
fi

exec bun --hot server/app.ts
