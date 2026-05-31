# Milestone 29 Snapshot — AgentBackend runTurn Contract

**Date:** 2026-05-08  
**Status:** Closed as a post-RC stabilization milestone. This is not a `pneuma-rc-0.1.4` release tag.  
**Input:** DevBoard Studio downstream pressure: BuildThread was accepted as the semantic transcript, but each Host still had to translate turns into backend prompts, manage thread/session reuse, and append decision/receipt turns by hand.

## What M29 Proved

M29 makes one Builder follow-up turn a framework-level backend operation:

```text
Builder message
  -> AgentBackend.runTurn
  -> append BuildThread user turn
  -> pack semantic transcript
  -> launch or reuse backend-native session by thread_id
  -> send backend prompt
```

The core rule is unchanged from ADR-0032:

```text
BuildThread is the source of truth.
Backend-native sessions are cache / optimization.
```

## Closed Findings

| Finding | M29 result |
|---|---|
| Hosts had to replay BuildThread and build backend prompts themselves | Added `AgentBackend.runTurn` and `runAgentTurnThroughLaunchSend`. |
| Backend-native session reuse was Host-specific | Fake and opencode backends now cache one backend session per BuildThread `thread_id`. |
| Proposal / decision / receipt context could be encoded differently per Host | `runTurn` uses `packBuildTurnsForRoleContent`, preserving canonical `pneuma:` tags. |
| Decision + execution receipt append was easy to hand-roll inconsistently | Added `recordBuildThreadExecutionOutcome`. |

## Boundary Decisions

M29 does not make opencode, Anthropic, or any other provider a core semantic dependency. Core still exports backend-neutral role/content packing. Provider-native message optimization belongs in backend adapters.

M29 also does not solve read-only iterative tool-result replay or provider-native event normalization. Those remain separate pressure lanes.

## Developer-Facing Changes

Updated guide:

- [BuildThread Guide](../developer/build-thread.md) / [中文版](../developer/build-thread.zh-CN.md)

New ADR:

- [ADR-0036: AgentBackend runTurn Contract](../architecture/adr/0036-agent-backend-run-turn.md)

New or changed core exports:

- `AgentBackend.runTurn`
- `AgentRunTurnOptions`
- `AgentRunTurnResult`
- `AgentRunTurnSessionCache`
- `AgentRunTurnTransport`
- `runAgentTurnThroughLaunchSend`
- `formatAgentRunTurnPrompt`
- `recordBuildThreadExecutionOutcome`

## Verification

Commands run from the M29 worktree:

```bash
bun test packages/core/test/agent-backend/run-turn.test.ts
bun test packages/core/test/agent-backend/types.test.ts packages/core/test/agent-backend/fake.test.ts packages/backend-opencode/test/adapter.test.ts
bun test packages/core/test/build-thread.test.ts
bun test packages/core/test/agent-backend/run-turn.test.ts packages/core/test/agent-backend/types.test.ts packages/core/test/agent-backend/fake.test.ts packages/core/test/build-thread.test.ts packages/backend-opencode/test/adapter.test.ts
bun run typecheck
tmp_config=$(mktemp -d) && printf '{"auths":{}}\n' > "$tmp_config/config.json" && DOCKER_CONFIG="$tmp_config" bun test
```

Final results:

- `runAgentTurnThroughLaunchSend` targeted test: `1 pass`, `0 fail`, `16 expect() calls`.
- Backend implementation targeted tests: `14 pass`, `0 fail`, `46 expect() calls`.
- BuildThread targeted tests: `10 pass`, `0 fail`, `33 expect() calls`.
- Combined M29 targeted suite: `25 pass`, `0 fail`, `95 expect() calls`.
- Typecheck: passed.
- Full suite with a temporary Docker config: `1242 pass`, `0 fail`, `4637 expect() calls` across `187 files`.
- Markdown relative-link check over touched docs: passed.
- `git diff --check`: passed.

## Next

Recommended next milestone:

1. M30 — decide whether to pressure provider-native event normalization, read-only tool-result replay, or Host chat-client helper based on downstream integration friction.

M29 deliberately keeps the backend loop narrow. It makes one Builder turn portable; it does not turn the framework into a full chat UI SDK.
