#!/bin/sh
# bookmarks-core-domain / stop.sh
# Orchestrator 先通过 SIGTERM 尝试优雅停止; 如果没响应会 SIGKILL.
# 这里只是一个 no-op marker 让 orchestrator 有机会走完 lifecycle.
set -e

echo "##pneuma:stopping"
