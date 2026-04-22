# Multi-stage build: compile Bun binary + bundle viewer, ship in a slim image.
FROM oven/bun:1 AS build
WORKDIR /src
COPY package.json ./
COPY server ./server
COPY viewer ./viewer
RUN bun install --production
RUN bun build --target=browser viewer/src/main.tsx --outfile viewer/main.js

FROM oven/bun:1-slim AS runtime
ENV NODE_ENV=production
ENV PORT=3000
RUN apt-get update && apt-get install -y --no-install-recommends sqlite3 ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY --from=build /src ./
VOLUME /data
ENV PNEUMA_WORKSPACE=/data
EXPOSE 3000
CMD ["bun", "server/server.ts"]
