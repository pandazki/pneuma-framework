#!/bin/sh
echo "##pneuma:service-ready viewer http://127.0.0.1:0"
echo "##pneuma:ready"
trap 'exit 0' TERM INT
while true; do sleep 0.1; done
