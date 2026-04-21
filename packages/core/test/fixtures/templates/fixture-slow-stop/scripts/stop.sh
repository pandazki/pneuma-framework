#!/bin/sh
# Simulate a hung stop by sleeping way past the orchestrator's 10s stop-script timeout.
# The orchestrator should time out waiting and fall through to SIGTERM on the dev process.
sleep 60
