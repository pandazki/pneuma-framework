# Milestone 35 Snapshot — Build Change Review Packet

**Date:** 2026-05-10  
**Status:** Closed as a post-RC assurance milestone. This is not a `pneuma-rc-0.1.4` release tag.  
**Input:** M32-M34 made Build Change Assurance assessable, visible, and durable. M35 asks what the Builder should see before approving one business intent.

## What M35 Proved

M35 adds `BuildChangeReviewPacket`:

```text
Builder intent
  -> Agent proposal
  -> Review Packet
  -> one approval statement
  -> assurance case after decision/execution
```

The important shift is:

```text
Approval is for one Builder intent, not N tool calls.
```

The packet names:

- intent summary;
- scope boundary;
- proposed changes by lane;
- risk classification;
- pre-proposal checks;
- recovery plan;
- migration mode;
- generated approval statement.

## Product Boundary

Core owns the packet shape and validation. The Creation Host owns how to render
it and whether to ask for approval. The packet does not replace permission
ledger, BuildThread, definition history, Code Change Lane, or Host-owned
approval UI.

This keeps the assurance lane aligned with the project goal: constrain and
explain Builder + Build Agent business-function changes, not build a generic
artifact trust platform.

## Implementation Surface

Updated core:

- `packages/core/src/build-assurance.ts`
- `packages/core/test/build-assurance-review-packet.test.ts`
- `packages/core/src/index.ts`

Updated Reference Host:

- `examples/m16-reference-creation-host/host-server.ts`
- `examples/m16-reference-creation-host/static/app.js`
- `examples/m16-reference-creation-host/run.test.ts`

Updated guide:

- [Build Change Assurance](../developer/build-assurance.md)
- [中文版](../developer/build-assurance.zh-CN.md)

## Reference Host Evidence

`evolution/start` now returns a `review_packet` for the Priority Queue proposal.
The packet lists five additive definition changes:

1. Add priority column.
2. Add priority queue read operation.
3. Add priority queue view.
4. Allow public priority queue read.
5. Allow public priority queue invoke.

The generated approval statement is:

```text
Approve one Builder intent: Add a Priority Queue for urgent inbox items. Scope: Additive inbox definition only: priority column, read operation, view, and read/invoke policies.
```

The recovery plan is `discard_unapplied_draft`: deny before approval and keep
the current app definition untouched.

## Verification

Targeted commands:

```bash
bun test packages/core/test/build-assurance-review-packet.test.ts
bun test examples/m16-reference-creation-host/run.test.ts
```

Targeted results:

- core review packet: `4 pass`, `0 fail`, `6 expect() calls`;
- M16 E2E: `1 pass`, `0 fail`, `39 expect() calls`.

The tests prove:

- a packet can be created from proposal evidence;
- failed pre-proposal checks block approval;
- destructive definition risk requires destructive disclosure and recovery;
- data migration risk requires a non-`none` migration mode;
- the Reference Host exposes the packet before approval.

## Remaining Boundary

M35 does not add a generic approval UI, a compliance workflow engine, or a
marketplace audit primitive. M36 should focus on the next assurance gap:
negative-path recovery drills.

