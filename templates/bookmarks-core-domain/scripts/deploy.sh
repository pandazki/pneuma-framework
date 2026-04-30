#!/bin/sh
set -eu

HERE="$(dirname "$0")/.."
IMAGE="${PNEUMA_DOCKER_IMAGE:-pneuma-bookmarks-core-domain:m3}"
ROOT="$(cd "$HERE/../.." && pwd)"

docker build -f "$HERE/Dockerfile" -t "$IMAGE" "$ROOT"
echo "pneuma: built docker image $IMAGE"
