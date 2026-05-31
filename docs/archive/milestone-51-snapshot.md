# Milestone 51 Snapshot

**Milestone:** M51, Agent Debug Loop Close-Out Review
**Status:** Closed
**Date:** 2026-05-27
**Chinese version:** [milestone-51-snapshot.zh-CN.md](./milestone-51-snapshot.zh-CN.md)

## Decision

M51 is the close-out gate for the M49/M50 line. It does not introduce a new product or primitive. It verifies that the Agent Debug Loop, Workflow App Studio lifecycle UX, real Codex path, and documentation are consistent enough to use as the next team-alignment baseline.

The accepted model is:

```text
proposal is a checked candidate
  not an unverified agent draft
  not a guarantee that later apply/publish can never fail

post-apply failure
  -> deterministic evidence
  -> rollback when possible
  -> new Builder intent for repair
```

## What Was Reviewed

M51 reviewed the line from three directions:

1. **Domain model:** the work still respects Framework -> Creation Host -> Generated Application -> Published Application.
2. **Engineering boundary:** debug loop belongs before proposal; post-apply repair does not silently re-enter the code agent.
3. **Example evidence:** Workflow App Studio proves the flow through deterministic tests and a real Codex app-server browser run.

## Verification

Typecheck:

```bash
bun run typecheck
```

Result:

```text
passed
```

Combined test gate:

```bash
bun test packages/core/test packages/host-kit/test examples/workflow-app-studio/workflow-studio.test.ts examples/workflow-app-studio/workflow-app.test.ts
```

Result:

```text
506 pass
0 fail
1785 expect() calls
```

Whitespace / patch hygiene:

```bash
git diff --check
```

Result:

```text
passed
```

Real browser E2E:

```text
Host: Workflow App Studio
Backend: codex-app-server
Request: add SLA due date, SLA status, and SLA watch queue
Flow: create -> ask agent -> debug loop -> approve -> preview -> publish -> open published app -> create published runtime record
Changed source: src/app.ts
Observed runtime fields: due_date, sla_status
Observed runtime view: sla_watch
```

## Paperwork Updated

M51 synchronized:

- `AGENTS.md`
- `docs/architecture/README.md`
- `docs/architecture/roadmap.md`
- `docs/developer/start-here.md`
- `docs/developer/start-here.zh-CN.md`
- `examples/workflow-app-studio/README.md`
- `examples/workflow-app-studio/README.zh-CN.md`
- M49/M50/M51 bilingual snapshots

## Residual Risk

The line is healthy, but the next work should not pretend the framework is complete:

- backend-neutral progress event normalization is still thin;
- post-apply deterministic recovery can be stronger;
- generated-runtime code support remains intentionally narrow;
- production deployment/profile adapters are still mostly Host-owned;
- arbitrary UI generation is not proven.

## Next Work

Recommended next lanes:

1. post-apply deterministic verification and recovery hardening;
2. backend-neutral code-agent progress events;
3. broader generated-runtime code support with explicit scaffold boundaries;
4. production deployment/profile adapters without turning the framework into a deployment platform.

M51 closes the current line and makes those follow-up lanes explicit choices, not hidden unfinished work.
