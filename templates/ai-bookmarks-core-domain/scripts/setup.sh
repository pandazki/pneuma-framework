#!/bin/sh
set -e
echo "ai-bookmarks-core-domain setup:"
echo "  workspace: ${PNEUMA_WORKSPACE:-$(pwd)/.pneuma-workspace}"
echo "  port hint: ${PNEUMA_PORT_HINT:-8765}"
echo ""
echo "Required env at dev/build:"
echo "  OPENROUTER_API_KEY (openrouter.ai → Keys)"
echo ""
echo "URL fetching uses Jina Reader (https://r.jina.ai) — free, no key needed."
echo "Ready. Run scripts/dev.sh to launch."
