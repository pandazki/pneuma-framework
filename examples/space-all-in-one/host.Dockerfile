# The served (agent-driven) Host. Build context is the pneuma-framework repo root;
# PneumaSpace arrives as three additional build contexts: "space" (gateway/src and shared),
# "space-cli" and "space-templates" (see compose.yaml for why they are separate).
#
# Node 24 runs PneumaSpace's CLI (appctl) and the apps' own `npm ci && npm test`.
# Bun runs the Host, because the framework ships TypeScript source for Bun.

# The owner page's client (web/: React and Beautiful UI's components, Tailwind, the fonts), built from the
# example's pinned devDependencies and the repository's lockfile. Only its output, web/dist (about 0.5 MB), goes
# into the image: the Host serves it itself, so the page needs no network at run time.
FROM node:24-bookworm-slim AS page
RUN npm install -g bun@1.4.5
WORKDIR /repo
COPY . .
RUN bun install --frozen-lockfile --filter space-all-in-one \
 && bun run examples/space-all-in-one/web/build.ts

FROM node:24-bookworm-slim

RUN npm install -g bun@1 && bun --version

# The Host may run as whoever owns the mounted apps directory (see host-entrypoint.sh), a user
# this image has never heard of. npm needs a home it can write its cache to.
ENV HOME=/home/host
RUN mkdir -p /home/host && chmod 1777 /home/host
# The Host's own state (pictures of apps, the owner token), a named volume in compose. Docker fills a new named volume from
# this directory, mode included, so that user can write there too.
RUN mkdir -p /state && chmod 1777 /state

# appctl, its shared model and the app templates.
COPY --from=space-cli . /opt/pneuma-space/cli
COPY --from=space gateway/src /opt/pneuma-space/gateway/src
COPY --from=space shared /opt/pneuma-space/shared
COPY --from=space-templates . /opt/pneuma-space/templates

WORKDIR /framework
COPY packages/core packages/core
COPY packages/host-kit packages/host-kit
COPY packages/backend-codex packages/backend-codex
COPY packages/backend-claude-code packages/backend-claude-code
COPY examples/space-all-in-one/package.json examples/space-all-in-one/package.json
COPY examples/space-all-in-one/src examples/space-all-in-one/src
COPY examples/space-all-in-one/bin examples/space-all-in-one/bin
COPY examples/space-all-in-one/overlay examples/space-all-in-one/overlay
COPY examples/space-all-in-one/policy examples/space-all-in-one/policy
COPY examples/space-all-in-one/host-entrypoint.sh /usr/local/bin/host-entrypoint.sh
COPY --from=page /repo/examples/space-all-in-one/web/dist examples/space-all-in-one/web/dist

# The Host imports only dependency-free framework modules (governed-change,
# workspace, enterprise-governance, release-rollout, build-thread), so linking
# the packages is all the "install" it needs.
RUN mkdir -p node_modules/@pneuma-framework \
 && for p in core host-kit backend-codex backend-claude-code; do ln -s /framework/packages/$p node_modules/@pneuma-framework/$p; done

# The Host binds to loopback by default. In here it has to take connections arriving through the
# published port; compose.yaml publishes that port on the machine's loopback only.
ENV PNEUMA_SPACE_CLI=/opt/pneuma-space/cli/appctl.ts \
    PNEUMA_APPS_DIR=/apps \
    PNEUMA_HOST_PORT=8090 \
    PNEUMA_HOST_BIND=0.0.0.0
EXPOSE 8090
WORKDIR /framework/examples/space-all-in-one
ENTRYPOINT ["/usr/local/bin/host-entrypoint.sh"]
CMD ["bun", "run", "src/serve.ts"]
