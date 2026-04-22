#!/bin/sh
: "${PNEUMA_WORKSPACE:?}"
: "${PNEUMA_MIGRATE_DIRECTION:=up}"
echo "${PNEUMA_MIGRATE_DIRECTION}" > "$PNEUMA_WORKSPACE/.migrate-direction"
exit 0
