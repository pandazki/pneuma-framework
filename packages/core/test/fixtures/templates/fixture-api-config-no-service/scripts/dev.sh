#!/bin/sh
# Emits only ##pneuma:ready — no service-ready marker.
# The orchestrator must skip /api/config fetch silently.
trap 'echo "##pneuma:stopping"; exit 0' TERM INT
echo "##pneuma:ready"
while true; do sleep 0.1; done
