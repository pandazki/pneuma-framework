#!/bin/sh
# Intentionally refuses to stop: infinite loop, ignores signals.
# The orchestrator should time out waiting on it and fall through to SIGTERM dev.
trap '' TERM INT
while true; do sleep 0.5; done
