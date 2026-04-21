#!/bin/sh
# dev.sh that announces it's stopping (emitting the marker) but doesn't actually
# do any teardown. A separate stop.sh is expected to do the real cleanup.
echo "##pneuma:service-ready viewer http://localhost:0"
echo "##pneuma:ready"
# Emit stopping marker and exit. In real templates this could represent a
# "ready-then-detach" pattern where the launcher exits intentionally.
echo "##pneuma:stopping"
exit 0
