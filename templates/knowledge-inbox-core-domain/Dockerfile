FROM oven/bun:1 AS build
WORKDIR /repo

COPY package.json bun.lock tsconfig.base.json ./
COPY packages/core-domain ./packages/core-domain
COPY packages/runtime ./packages/runtime
COPY templates/knowledge-inbox-core-domain ./templates/knowledge-inbox-core-domain

WORKDIR /repo/templates/knowledge-inbox-core-domain
RUN bun install
RUN bun x tsc --noEmit -p tsconfig.json

FROM oven/bun:1-slim AS runtime
ENV NODE_ENV=production \
    PNEUMA_WORKSPACE=/data \
    PNEUMA_DATA_DIR=/data \
    PNEUMA_SQLITE_PATH=/data/app.db \
    PNEUMA_PORT_HINT=3000
WORKDIR /app
COPY --from=build /repo /app
WORKDIR /app/templates/knowledge-inbox-core-domain
VOLUME /data
EXPOSE 3000
CMD ["bun", "server/app.ts"]
