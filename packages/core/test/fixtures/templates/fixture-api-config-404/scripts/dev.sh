#!/bin/sh
# Same as fixture-api-config-happy: emits service-ready at $PNEUMA_PORT_HINT.
# The test starts a server that returns 404 on /api/config.
trap 'echo "##pneuma:stopping"; exit 0' TERM INT
PORT="${PNEUMA_PORT_HINT:-0}"
echo "##pneuma:service-ready app http://127.0.0.1:$PORT"
echo "##pneuma:ready"
while true; do sleep 0.1; done
