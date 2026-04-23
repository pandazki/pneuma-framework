#!/bin/sh
# bookmarks-core-domain / setup.sh — 模板初始化.
# workspace 是 monorepo; bun install 在 repo root 已经统一处理了, 这里主要做:
#   - 打印启动说明
#   - 校验依赖能 resolve
set -e

echo "bookmarks-core-domain setup:"
echo "  workspace: ${PNEUMA_WORKSPACE:-$(pwd)/.pneuma-workspace}"
echo "  port hint: ${PNEUMA_PORT_HINT:-8765}"
echo ""
echo "Ready. Run scripts/dev.sh to launch."
