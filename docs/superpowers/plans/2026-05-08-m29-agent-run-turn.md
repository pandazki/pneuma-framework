# M29 AgentBackend runTurn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make BuildThread the standard source of truth for Builder-agent turns by adding `AgentBackend.runTurn` and a small BuildThread receipt helper.

**Architecture:** Keep existing `launch/sendUserMessage` backends valid by providing a shared `runAgentTurnThroughLaunchSend` helper. Backends can implement `runTurn` with this helper and cache a backend-native session per BuildThread. The prompt sent to legacy backends is built from the semantic BuildThread, system prompt, and optional context snapshot. Receipt automation stays Host-called, but the framework now owns the common decision+receipt append shape.

**Tech Stack:** Bun test runner, TypeScript, `packages/core` agent-backend and BuildThread primitives, backend-opencode adapter.

---

## File Structure

- Modify `packages/core/src/agent-backend/types.ts`: add `AgentRunTurnOptions`, `AgentRunTurnResult`, and required `runTurn`.
- Create `packages/core/src/agent-backend/run-turn.ts`: shared prompt builder and legacy transport helper.
- Modify `packages/core/src/agent-backend/fake.ts`: implement `runTurn` with per-thread session cache.
- Modify `packages/backend-opencode/src/adapter.ts`: implement `runTurn` with per-thread session cache.
- Modify `packages/core/src/build-thread.ts`: add `recordBuildThreadExecutionOutcome`.
- Modify `packages/core/src/index.ts`: export new APIs.
- Create `packages/core/test/agent-backend/run-turn.test.ts`: helper and fake backend behavior.
- Modify `packages/core/test/agent-backend/types.test.ts` and `packages/core/test/agent-backend/fake.test.ts`: interface coverage.
- Modify `packages/core/test/build-thread.test.ts`: receipt helper coverage.
- Modify `packages/backend-opencode/test/adapter.test.ts`: opencode runTurn cache behavior if the test scaffold supports it; otherwise add the minimal focused test near existing adapter tests.
- Update `docs/developer/build-thread.md` and `.zh-CN.md`: replace "no auto receipt helper" language.
- Create `docs/architecture/adr/0036-agent-backend-run-turn.md`: accepted M29 boundary.
- Create `docs/archive/milestone-29-snapshot.md` and `.zh-CN.md`.
- Update `docs/architecture/README.md`, `docs/architecture/roadmap.md`, `AGENTS.md`, `CLAUDE.md`.

## Task 1: runTurn Types And Shared Helper

**Files:**
- Create: `packages/core/test/agent-backend/run-turn.test.ts`
- Modify: `packages/core/src/agent-backend/types.ts`
- Create: `packages/core/src/agent-backend/run-turn.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing tests**

Add a test that creates a BuildThread with prior proposal/receipt turns, then calls `runAgentTurnThroughLaunchSend` with a fake transport. Assert:

- the new user message is appended to the thread;
- the prompt includes system prompt, context snapshot, user text, and `[pneuma:host_execution_receipt ...]`;
- the helper creates one backend session for the first turn and reuses it for the second turn.

- [ ] **Step 2: Verify red**

Run:

```bash
bun test packages/core/test/agent-backend/run-turn.test.ts
```

Expected: FAIL because the helper and types do not exist.

- [ ] **Step 3: Implement types and helper**

Add:

- `AgentRunTurnOptions`
- `AgentRunTurnResult`
- `AgentRunTurnSessionCache`
- `AgentRunTurnTransport`
- `formatAgentRunTurnPrompt`
- `runAgentTurnThroughLaunchSend`

The helper appends `{ kind: "user", text: newUserMessage }`, packs `BuildTurnRoleContentMessage[]`, builds one prompt, launches a backend session when no cached session exists, sends the prompt, and stores the session in the supplied cache.

- [ ] **Step 4: Verify green**

Run:

```bash
bun test packages/core/test/agent-backend/run-turn.test.ts
```

Expected: PASS.

## Task 2: Backend Implementations

**Files:**
- Modify: `packages/core/test/agent-backend/types.test.ts`
- Modify: `packages/core/test/agent-backend/fake.test.ts`
- Modify: `packages/core/src/agent-backend/fake.ts`
- Modify: `packages/backend-opencode/src/adapter.ts`
- Modify or create: `packages/backend-opencode/test/adapter.test.ts`

- [ ] **Step 1: Write failing tests**

Update the interface stub to include `runTurn`. Add a fake backend test:

```ts
const result = await fb.runTurn({
  cwd: "/tmp/ws",
  thread_store: store,
  thread_id: thread.thread_id,
  new_user_message: "add a widget",
  system_prompt: "You are the build agent.",
});

expect(result.thread_id).toBe(thread.thread_id);
expect(fb.userMessages[0].text).toContain("add a widget");
```

Add opencode adapter coverage that `runTurn` calls `session.prompt` and reuses the same backend session id for the same `thread_id`.

- [ ] **Step 2: Verify red**

Run:

```bash
bun test packages/core/test/agent-backend/types.test.ts packages/core/test/agent-backend/fake.test.ts packages/backend-opencode/test/adapter.test.ts
```

Expected: FAIL until implementations exist.

- [ ] **Step 3: Implement backend runTurn**

Add a private `buildThreadSessions = new Map<string, AgentSession>()` to FakeAgentBackend and OpencodeBackend. Implement `runTurn` by delegating to `runAgentTurnThroughLaunchSend`.

- [ ] **Step 4: Verify green**

Run the same targeted command. Expected: PASS.

## Task 3: BuildThread Receipt Automation

**Files:**
- Modify: `packages/core/test/build-thread.test.ts`
- Modify: `packages/core/src/build-thread.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing test**

Add a test for `recordBuildThreadExecutionOutcome`:

```ts
const outcome = await recordBuildThreadExecutionOutcome(store, {
  thread_id: thread.thread_id,
  proposal_id: "proposal-1",
  decision: "approved",
  receipt: {
    status: "completed",
    evidence: { changed_files: ["src/widget.tsx"] },
  },
});

expect(outcome.decision_turn.kind).toBe("user_decision");
expect(outcome.receipt_turn.kind).toBe("host_execution_receipt");
```

- [ ] **Step 2: Verify red**

Run:

```bash
bun test packages/core/test/build-thread.test.ts
```

Expected: FAIL because the helper does not exist.

- [ ] **Step 3: Implement helper**

Add `recordBuildThreadExecutionOutcome(store, input)` to append `user_decision` followed by `host_execution_receipt` in one framework-owned helper.

- [ ] **Step 4: Verify green**

Run:

```bash
bun test packages/core/test/build-thread.test.ts
```

Expected: PASS.

## Task 4: Docs, ADR, Snapshot

**Files:**
- Modify: `docs/developer/build-thread.md`
- Modify: `docs/developer/build-thread.zh-CN.md`
- Create: `docs/architecture/adr/0036-agent-backend-run-turn.md`
- Create: `docs/archive/milestone-29-snapshot.md`
- Create: `docs/archive/milestone-29-snapshot.zh-CN.md`
- Modify: `docs/architecture/README.md`
- Modify: `docs/architecture/roadmap.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document M29**

Document:

- `AgentBackend.runTurn` reads/writes BuildThread;
- backend-native session remains cache;
- legacy `launch/sendUserMessage` still exists as transport;
- `recordBuildThreadExecutionOutcome` handles decision+receipt append;
- M29 does not solve read-only iterative tool-result replay or provider-native event normalization.

- [ ] **Step 2: Verify docs links**

Run local markdown link checker over touched docs. Expected: no broken links.

## Task 5: Final Verification And Commit

- [ ] **Step 1: Run targeted tests**

```bash
bun test packages/core/test/agent-backend/run-turn.test.ts packages/core/test/agent-backend/types.test.ts packages/core/test/agent-backend/fake.test.ts packages/core/test/build-thread.test.ts packages/backend-opencode/test/adapter.test.ts
```

- [ ] **Step 2: Run typecheck**

```bash
bun run typecheck
```

- [ ] **Step 3: Run full suite**

```bash
tmp_config=$(mktemp -d) && printf '{"auths":{}}\n' > "$tmp_config/config.json" && DOCKER_CONFIG="$tmp_config" bun test
```

- [ ] **Step 4: Commit**

```bash
git add .
git commit -m "feat(core): add agent run turn contract"
```

---

## Self-Review

- Spec coverage: covers runTurn API, helper semantics, fake/opencode backend implementation, receipt helper, docs, ADR, and snapshot.
- Scope exclusions: no provider-native event normalization, no tool-result replay loop, no UI chat client, no full backend rewrite.
- Type consistency: uses `thread_store`, `thread_id`, `new_user_message`, `system_prompt`, and `context_snapshot` consistently across tests/docs/types.
