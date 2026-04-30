#!/bin/sh
# knowledge-inbox-core-domain / setup.sh - template setup.
# The monorepo handles dependency install at the root; this script only prints
# launch details for the lifecycle orchestrator.
set -e

echo "knowledge-inbox-core-domain setup:"
echo "  workspace: ${PNEUMA_WORKSPACE:-$(pwd)/.pneuma-workspace}"
echo "  port hint: ${PNEUMA_PORT_HINT:-8765}"
echo ""
echo "Ready. Run scripts/dev.sh to launch."
