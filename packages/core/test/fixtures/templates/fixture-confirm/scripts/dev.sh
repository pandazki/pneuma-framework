#!/bin/sh
trap 'echo "##pneuma:stopping"; exit 0' TERM INT
echo "##pneuma:needs-confirm demo"
# Read one line from stdin and write what we saw to stderr so the test can assert on it.
IFS= read -r reply
echo "got confirm reply: $reply" 1>&2
if echo "$reply" | grep -q "yes"; then
  echo "##pneuma:service-ready viewer http://localhost:0"
  echo "##pneuma:ready"
  while true; do sleep 0.1; done
else
  echo "rejecting" 1>&2
  exit 3
fi
