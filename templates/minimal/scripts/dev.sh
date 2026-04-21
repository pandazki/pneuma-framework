#!/bin/sh
set -e
PORT="${PNEUMA_PORT_HINT:-8765}"
VIEWER_DIR="$(dirname "$0")/../viewer"

cleanup() {
  echo "##pneuma:stopping"
  if [ -n "$SERVER_PID" ]; then
    kill -TERM "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  exit 0
}
trap cleanup TERM INT

cd "$VIEWER_DIR"
python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER_PID=$!

# Wait briefly for the port to open; verify the server is still alive before
# advertising ready so port collisions / missing python3 fail fast instead of
# lying about a reachable viewer.
sleep 0.3
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "pneuma: python http.server failed to start on port $PORT (port in use? python3 missing?)" 1>&2
  exit 1
fi

echo "##pneuma:service-ready viewer http://127.0.0.1:$PORT"
echo "##pneuma:ready"

wait "$SERVER_PID"
