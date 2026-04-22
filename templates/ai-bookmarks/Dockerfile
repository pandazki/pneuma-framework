# Build context: the pneuma-framework repo root (so Bun can resolve
# workspace deps @pneuma-framework/viewer-react → @pneuma-framework/core).
# scripts/build.sh invokes this Dockerfile with `-f` from the root.
#
# Notes on what's intentionally absent:
#   - No pre-`bun build`: server.ts imports viewer/index.html as a route asset;
#     Bun bundles TSX/CSS at request time and caches. Works in production the
#     same as in `bun --hot` dev.
#   - No `apt-get install sqlite3`: bun:sqlite is built into the Bun runtime;
#     migrate.sh only runs on the HOST workspace (via the CLI), never inside
#     the release container.
#   - No `apt-get install ca-certificates`: Bun's native fetch ships with
#     BoringSSL + bundled root CAs, so HTTPS to OpenRouter / Jina works
#     without any system package.
FROM oven/bun:1 AS build
WORKDIR /repo
# Root manifest + lockfile so Bun understands the workspace layout.
COPY package.json bun.lock tsconfig.base.json ./
# Workspace packages the template links against.
COPY packages/core ./packages/core
COPY packages/viewer-react ./packages/viewer-react
# The template itself.
COPY templates/ai-bookmarks ./templates/ai-bookmarks
WORKDIR /repo/templates/ai-bookmarks
RUN bun install

FROM oven/bun:1-slim AS runtime
ENV NODE_ENV=production PORT=3000 PNEUMA_WORKSPACE=/data
WORKDIR /app
COPY --from=build /repo /app
WORKDIR /app/templates/ai-bookmarks
VOLUME /data
EXPOSE 3000
CMD ["bun", "server/server.ts"]
