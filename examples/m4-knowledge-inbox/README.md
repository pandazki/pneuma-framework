# m4-knowledge-inbox

M4 reference app smoke for `templates/knowledge-inbox-core-domain`.

This example proves the first product-shaped loop on top of the M3 deployable
substrate:

```text
capture source -> store inbox item -> list review queue -> survive runtime reopen
```

The template now also ships a usable vanilla viewer at
`templates/knowledge-inbox-core-domain/viewer/index.html`: capture form, review
queue, status filters, selected item detail, runtime evidence panel, and live
substrate inspector for schema, Operations, and API surface. It also includes a
Data view that renders the same `inbox_items` rows as a table, so reviewers can
see the stored data behind the end-user workflow.

## Run The Live Demo

Start the reference app with a real SQLite workspace and deterministic demo
data:

```sh
bun run examples/m4-knowledge-inbox/run.ts --seed --port 8876
```

The runner prints the live URL, workspace path, and SQLite path:

```text
Knowledge Inbox ready: http://127.0.0.1:8876
workspace: /tmp/pneuma-m4-knowledge-inbox-...
sqlite: /tmp/pneuma-m4-knowledge-inbox-.../data/app.db
seeded: captured=3 updated=2 existing=0
```

Use `--port 0` if `8876` is already occupied. Use `--workspace <dir>` to keep a
specific demo database between runs. The seed is idempotent: running the command
again against the same workspace does not duplicate rows.

For automated checks, use smoke mode:

```sh
bun run examples/m4-knowledge-inbox/run.ts --seed --smoke-exit --port 0
```

Smoke mode starts the real template server, seeds through the public Operation
HTTP API, verifies the row count, stops the server, and exits.

Run the local persistence smoke:

```sh
bun test examples/m4-knowledge-inbox/smoke.test.ts
```

The smoke boots `@pneuma-framework/runtime` directly against a temporary SQLite
workspace, calls the public Operation HTTP contract, closes the runtime, reopens
the same app database, and verifies the captured item is still present.

Run the Docker release/restart smoke:

```sh
bun test examples/m4-knowledge-inbox/docker-smoke.test.ts
```

The Docker smoke builds `templates/knowledge-inbox-core-domain/Dockerfile`,
starts a container with a mounted `/data` volume, captures an item through the
real HTTP Operation API, updates its status to `kept`, restarts the container,
and verifies the same item and status are still readable from `/data/app.db`.

Run the demo runner contract:

```sh
bun test examples/m4-knowledge-inbox/run.test.ts
```

This is the canonical M4 demo entry until the reference app grows semantic
search, a richer runtime agent, or a deployment adapter beyond Docker.
