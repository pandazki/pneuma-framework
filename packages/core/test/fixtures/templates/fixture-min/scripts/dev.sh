#!/bin/sh
trap 'echo "##pneuma:stopping"; exit 0' TERM INT
echo "fixture-dev booting in $PNEUMA_WORKSPACE (mode=$PNEUMA_MODE)"
echo "##pneuma:service-ready viewer http://localhost:${PNEUMA_PORT_HINT:-0}"
echo "##pneuma:ready"
while true; do sleep 0.1; done
