#!/bin/sh
# Leave a marker so the test can detect that stop.sh ran.
mkdir -p "$PNEUMA_WORKSPACE/.pneuma"
echo "stop.sh ran" > "$PNEUMA_WORKSPACE/.pneuma/stop-marker"
