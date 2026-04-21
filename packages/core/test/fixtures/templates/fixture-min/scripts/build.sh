#!/bin/sh
set -e
mkdir -p "$PNEUMA_BUILD_DIR/site"
echo "<h1>fixture</h1>" > "$PNEUMA_BUILD_DIR/site/index.html"
cat > "$PNEUMA_BUILD_DIR/build.manifest.json" <<EOF
{
  "schemaVersion": 1,
  "kind": "static-site",
  "entrypoint": "site/index.html",
  "produced": ["site/index.html"]
}
EOF
echo "##pneuma:artifact $PNEUMA_BUILD_DIR/site/index.html"
