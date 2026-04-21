#!/bin/sh
# Simulate a daemonizing dev launcher: print ready markers, then exit cleanly.
# In real templates this would have backgrounded a service with nohup/setsid.
# Here we just exit, which causes state.dev.state to transition to "exited".
echo "##pneuma:service-ready viewer http://localhost:0"
echo "##pneuma:ready"
exit 0
