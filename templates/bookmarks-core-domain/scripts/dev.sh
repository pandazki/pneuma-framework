#!/bin/sh
# bookmarks-core-domain / dev.sh — 启动 dev server.
# 用 bun --hot 监听 TS 源码变动; 收到 TERM/INT signal 时通过 process.on 里 graceful 退出.
set -e

HERE="$(dirname "$0")/.."
cd "$HERE"

# 传下 env, Bun 进程会读 PNEUMA_WORKSPACE / PNEUMA_PORT_HINT
exec bun --hot server/app.ts
