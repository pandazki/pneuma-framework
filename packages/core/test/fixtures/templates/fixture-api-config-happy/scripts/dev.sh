#!/bin/sh
# Emits service-ready pointing at http://127.0.0.1:$PNEUMA_PORT_HINT (the test
# supplies a real HTTP server on that port). The orchestrator fetches /api/config.
trap 'echo "##pneuma:stopping"; exit 0' TERM INT
PORT="${PNEUMA_PORT_HINT:-0}"
echo "##pneuma:service-ready app http://127.0.0.1:$PORT"
echo "##pneuma:ready"
while true; do sleep 0.1; done
