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

Docker release/restart smoke is intentionally the next slice. Once that passes,
this example becomes the canonical M4 demo entry.
