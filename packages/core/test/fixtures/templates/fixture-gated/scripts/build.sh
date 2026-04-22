#!/bin/sh
: "${PNEUMA_WORKSPACE:?}"
: "${PNEUMA_BUILD_DIR:?}"
mkdir -p "$PNEUMA_BUILD_DIR"
cat > "$PNEUMA_BUILD_DIR/build.manifest.json" <<JSON
{"schemaVersion":1,"kind":"local","entrypoint":"bin/app","produced":["bin/app"],"env":{},"notes":"","deployHints":{}}
JSON
exit 0
