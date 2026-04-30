#!/bin/sh
set -eu

HERE="$(dirname "$0")/.."
IMAGE="${PNEUMA_DOCKER_IMAGE:-pneuma-knowledge-inbox-core-domain:m4}"
ROOT="$(cd "$HERE/../.." && pwd)"

docker build -f "$HERE/Dockerfile" -t "$IMAGE" "$ROOT"
echo "pneuma: built docker image $IMAGE"
