# Reference Creation Host

**Status:** M45 canonical consumer
**Chinese version:** [README.zh-CN.md](./README.zh-CN.md)

This example is the long-lived Reference Host for the 0.4.0 implementation-framework lane. It is not a one-off milestone demo.

## Scenario

The Host starts with a Generated Application called **Team Notes Board**.

```text
v0:
  notes list
  create/update shape represented by source fields

Builder asks:
  Add a review queue so notes can be marked needs_review and approved.

v1:
  review_status field
  review queue preview
  carry-forward data receipt
```

The Host requires Reviewer approval. Bob is the Builder; Alice is the Reviewer.

## Run

```bash
PORT=8893 bun run --cwd examples/reference-creation-host serve
```

Open:

```text
http://127.0.0.1:8893/
```

## Test

```bash
bun test examples/reference-creation-host/reference-host.test.ts
bun test examples/reference-creation-host/ui-state.test.ts
```

## Flow

1. Create v0.
2. Ask Agent for the review queue.
3. Bob approval is blocked.
4. Alice approval succeeds.
5. Code Change Lane applies the guarded source change.
6. Preview Data Rehearsal assigns `review_status=not_required` to existing notes.
7. Preview starts.
8. Publish records runtime/data evidence.
9. Rollback returns active version to v0.

## What This Replaces

If M45 remains healthy, this example can replace most of the operational value of `examples/m16-reference-creation-host/`.

## What It Still Does Not Prove

It does not prove:

- production IAM;
- production credential vault;
- cloud deployment;
- arbitrary raw patch coding agent;
- fully open-ended UI generation;
- Docker as the default deployment path.

Those remain pressure lanes, not prerequisites for M45.

