#!/bin/sh
set -e

echo "weekly-linear-digest setup:"
echo "  workspace: ${PNEUMA_WORKSPACE:-$(pwd)/.pneuma-workspace}"
echo "  port hint: ${PNEUMA_PORT_HINT:-8765}"
echo ""
echo "Required env vars at dev/build:"
echo "  LINEAR_API_KEY     (Linear → Settings → API → Personal API keys)"
echo "  OPENROUTER_API_KEY (openrouter.ai → Keys)"
echo ""
echo "Ready. Run scripts/dev.sh to launch."
