#!/bin/sh
# Leave a marker so the test can detect accidental invocation.
mkdir -p "$PNEUMA_WORKSPACE/.pneuma-framework"
echo "stop.sh ran" > "$PNEUMA_WORKSPACE/.pneuma-framework/stop-marker"
