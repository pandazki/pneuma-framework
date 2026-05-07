# Upgrading Downstream Hosts To pneuma-rc-0.1.2

**Audience:** downstream Creation Host projects currently using `pneuma-rc-0.1.1`
**Chinese version:** [upgrading-to-rc-0.1.2.zh-CN.md](./upgrading-to-rc-0.1.2.zh-CN.md)

`pneuma-rc-0.1.2` is an additive BuildThread patch. It introduces a framework-owned semantic transcript for Builder conversation, proposal, Builder decision, and Host execution receipt turns.

It does not replace `AgentBackend.launch/sendUserMessage/onEvent`, does not change Generated Application runtime SQLite, and does not change Published Application data.

## 1. Update The Local Framework Path

If your downstream project references the local RC checkout in `package.json`, update every `@pneuma-framework/*` path from:

```json
"file:/Users/pandazki/Codes/pneuma-framework-rc-0.1.1/packages/core"
```

to:

```json
"file:/Users/pandazki/Codes/pneuma-framework-rc-0.1.2/packages/core"
```

Use the matching package directory for each package:

```text
/Users/pandazki/Codes/pneuma-framework-rc-0.1.2/packages/core
/Users/pandazki/Codes/pneuma-framework-rc-0.1.2/packages/core-domain
/Users/pandazki/Codes/pneuma-framework-rc-0.1.2/packages/runtime
/Users/pandazki/Codes/pneuma-framework-rc-0.1.2/packages/cli
/Users/pandazki/Codes/pneuma-framework-rc-0.1.2/packages/viewer-react
```

Then reinstall:

```bash
bun install
```

## 2. Add A BuildThread Store

Downstream Hosts that currently have a `host_conversations`, `evolution_conversations`, or similar table can start migrating that code to the framework store:

```ts
import { createFileBuildThreadStore } from "@pneuma-framework/core";

const conversations = createFileBuildThreadStore({
  workspace: hostWorkspaceDir,
});
```

The v0 store writes:

```text
<creation-host-workspace>/.pneuma/build-threads.json
```

This is Creation Host workspace state. Do not place it in Generated Application runtime SQLite, and do not include it in Published Application data by default.

## 3. Append Semantic Turns

Recommended Host route mapping:

```text
POST /evolution/start
  -> startThread()
  -> appendTurn(kind: "user")

POST /evolution/:thread_id/message
  -> appendTurn(kind: "user")

Agent proposes a plan
  -> appendTurn(kind: "agent_proposal")

Builder approves or rejects
  -> appendTurn(kind: "user_decision")

Host executor finishes
  -> appendTurn(kind: "host_execution_receipt")
```

Use typed turns instead of hiding governance state inside `agent_text` prose:

```ts
await conversations.appendTurn(thread.thread_id, {
  kind: "agent_proposal",
  proposal_id,
  summary,
  rationale,
  tool_calls,
});

await conversations.appendTurn(thread.thread_id, {
  kind: "user_decision",
  proposal_id,
  decision: "approved",
});

await conversations.appendTurn(thread.thread_id, {
  kind: "host_execution_receipt",
  proposal_id,
  status: "completed",
  evidence,
});
```

Keep your proposal table and two-phase Host executor if you have one. BuildThread records the semantic transcript; it does not execute Host-owned artifact changes.

## 4. Replay Turns To The Backend

If your Host currently translates conversation rows into model messages, replace that translator with the framework helper:

```ts
import { pneumaTurnsToAnthropicMessages } from "@pneuma-framework/core";

const turns = await conversations.listTurns(threadId);
const messages = pneumaTurnsToAnthropicMessages(turns, {
  capTurns: 20,
  alwaysKeepAnchor: true,
});
```

For opencode-shaped replay:

```ts
import { pneumaTurnsToOpencodeMessages } from "@pneuma-framework/core";
```

Backend-native sessions may still be used as cache or resume optimization. The BuildThread transcript is the portable source of truth.

## 5. Preserve Thread Id In The Browser

Treat `thread_id` as durable UI state. Do not compute follow-up URLs from a stale React closure.

Safe pattern:

```text
1. Start request opens a new thread.
2. The server streams or returns thread_id.
3. The browser commits thread_id into explicit state/ref.
4. Follow-up messages are disabled until thread_id exists.
5. Follow-up requests always target /evolution/:thread_id/message.
```

This directly avoids the failure mode where every follow-up accidentally creates a new evolution thread and the Agent loses prior Builder context.

## 6. What Not To Migrate Yet

Do not expect this RC patch to provide:

- a new `AgentBackend.runTurn` interface;
- automatic Host execution receipt recording;
- token-budget packing;
- cloud multi-tenant transcript storage;
- a browser chat client package.

Those are future lanes. RC 0.1.2 intentionally lands the primitive without forcing a backend-interface break.

## 7. Run Downstream Verification

Recommended minimum:

```bash
bun install
bun run typecheck
bun test
```

If you migrate a Host conversation table, add regression tests for:

- follow-up message reuses the original `thread_id`;
- proposal / decision / receipt turns are appended in order;
- backend replay includes the initial Builder anchor and the latest turns;
- reject path records `user_decision` without execution receipt;
- successful approve path records `host_execution_receipt`.

## 8. Expected Impact

Expected:

- less Host-owned transcript storage code;
- less backend-specific turn translation code;
- clearer inspection evidence for proposal / approval / execution;
- easier future backend migration.

Not expected:

- no Generated Application data migration;
- no Published Application behavior change;
- no required rewrite of Host proposal/executor logic;
- no change to the four-layer model.
