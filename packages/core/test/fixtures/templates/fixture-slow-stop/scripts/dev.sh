#!/bin/sh
trap 'echo "##pneuma:stopping"; exit 0' TERM INT
echo "##pneuma:service-ready viewer http://localhost:0"
echo "##pneuma:ready"
while true; do sleep 0.1; done
