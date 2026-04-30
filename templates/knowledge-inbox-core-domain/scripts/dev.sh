#!/bin/sh
# knowledge-inbox-core-domain / dev.sh - start dev server.
# bun --hot watches TS source changes. server/app.ts handles TERM/INT shutdown.
set -e

HERE="$(dirname "$0")/.."
cd "$HERE"

# Bun reads PNEUMA_WORKSPACE / PNEUMA_PORT_HINT from the environment.
exec bun --hot server/app.ts
