# m4-knowledge-inbox

M4 reference app smoke for `templates/knowledge-inbox-core-domain`.

This example proves the first product-shaped loop on top of the M3 deployable
substrate:

```text
capture source -> store inbox item -> list review queue -> survive runtime reopen
```

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

This is the canonical M4 demo entry until the reference app grows a richer
viewer or deployment adapter.
