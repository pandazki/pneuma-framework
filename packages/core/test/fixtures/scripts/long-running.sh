#!/bin/sh
trap 'echo "##pneuma:stopping"; exit 0' TERM INT
echo "booting"
echo "##pneuma:service-ready web http://localhost:0"
echo "##pneuma:ready"
while true; do
  sleep 0.1
done
