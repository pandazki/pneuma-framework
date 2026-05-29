# Production container target for the Release Operations Board.
# Builds the client bundle, then serves API + static from one Bun process.
FROM oven/bun:1.1 AS build
WORKDIR /app
COPY package.json ./
RUN bun install
COPY . .
RUN bun run build

FROM oven/bun:1.1
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 8787
CMD ["bun", "run", "src/server/local.ts"]
