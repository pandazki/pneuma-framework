#!/bin/sh
set -e
OUT="$PNEUMA_BUILD_DIR/site"
mkdir -p "$OUT"
cp -r "$(dirname "$0")/../viewer/." "$OUT/"
cat > "$PNEUMA_BUILD_DIR/build.manifest.json" <<EOF
{
  "schemaVersion": 1,
  "kind": "static-site",
  "entrypoint": "site/index.html",
  "produced": ["site/index.html"]
}
EOF
echo "##pneuma:artifact $OUT/index.html"
