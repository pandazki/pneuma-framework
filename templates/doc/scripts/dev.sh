#!/bin/sh
set -eu

: "${PNEUMA_WORKSPACE:?PNEUMA_WORKSPACE is required}"

PORT="${PNEUMA_PORT_HINT:-5173}"
SID="${PNEUMA_SESSION_ID:-}"
WS="${PNEUMA_WS_URL:-}"

# First-run scaffold: seed doc.md and AGENTS.md into the workspace.
if [ ! -f "$PNEUMA_WORKSPACE/doc.md" ]; then
  cp "$(dirname "$0")/../scaffold/doc.md" "$PNEUMA_WORKSPACE/doc.md"
fi
if [ ! -f "$PNEUMA_WORKSPACE/AGENTS.md" ]; then
  cp "$(dirname "$0")/../skill/SKILL.md" "$PNEUMA_WORKSPACE/AGENTS.md"
fi

# Graceful shutdown: kill our process group on TERM/INT.
trap 'echo "##pneuma:stopping"; kill 0 2>/dev/null; exit 0' TERM INT

VIEWER_DIR="$(dirname "$0")/../viewer"

# If the viewer tree isn't in place yet (pre-D3), bail with a clear marker.
if [ ! -f "$VIEWER_DIR/index.html" ]; then
  echo "pneuma: templates/doc/viewer/index.html not found — run D3 first" 1>&2
  exit 1
fi

cd "$VIEWER_DIR"

# Emit markers BEFORE starting bun so the orchestrator sees them promptly.
if [ -n "$SID" ] && [ -n "$WS" ]; then
  # URL-encode the ws url so the viewer's query parser gets a clean value.
  WS_ENC=$(printf '%s' "$WS" | sed 's|/|%2F|g; s|:|%3A|g')
  echo "##pneuma:service-ready viewer http://127.0.0.1:${PORT}/?sid=${SID}&ws=${WS_ENC}"
else
  # Pre-E1 env: viewer still works but query params must be provided manually.
  echo "##pneuma:service-ready viewer http://127.0.0.1:${PORT}/"
fi
echo "##pneuma:ready"

# Hand stdout+stderr to bun --hot so HMR messages show up in the CLI.
# `exec` replaces the shell so the PID is bun itself (easier kill).
exec bun --hot index.html --port "$PORT"
