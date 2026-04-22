#!/bin/sh
: "${PNEUMA_WORKSPACE:?}"
echo "##pneuma:progress 50 installing"
touch "$PNEUMA_WORKSPACE/.setup-ran"
echo "##pneuma:progress 100 done"
exit 0
