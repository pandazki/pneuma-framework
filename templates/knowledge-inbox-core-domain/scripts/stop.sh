#!/bin/sh
# knowledge-inbox-core-domain / stop.sh
# The orchestrator normally stops the dev process with SIGTERM. This script is
# a no-op marker so lifecycle tooling can complete the stop verb consistently.
set -e

echo "##pneuma:stopping"
