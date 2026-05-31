# M2.3 Governance Evidence Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the M2.3 governance evidence loop: a durable, viewer-visible chain showing who proposed, who approved, what token authorized execution, who executed, and what final outcome occurred.

**Architecture:** Extend the existing permission ledger derived read model instead of adding a new persistence path. Feed that read model through the existing `permission-ledger-state` wire event, store it in `PneumaViewerState`, render a lightweight Governance Evidence panel in `viewer-react`, and reuse it in the canonical p5 demo governance variant. Add a draft `milestone-2-snapshot.md` skeleton that reads M2 from outside the implementation.

**Tech Stack:** Bun test runner, TypeScript, React, existing `@pneuma-framework/core` wire protocol, existing `@pneuma-framework/viewer-react` SDK, existing `examples/p5-viewer-approval-e2e` demo.

---

## File Structure

- Modify `packages/core/src/permission-ledger.ts`
  - Add evidence fields to `PermissionLedgerRequestRecord`.
  - Add `execution_principal` to execution authorization/denial ledger events.
  - Derive token metadata and execution principal into request records.
- Modify `packages/core/src/tools/action.ts`
  - Record `execution_principal: decision.principal` when appending execution authorization/denial events.
- Modify `packages/core/test/permission-ledger.test.ts`
  - Cover full evidence derivation and no raw token exposure.
- Modify `packages/core/test/wire-protocol/permission-ledger-seed.test.ts`
  - Cover seeded recent evidence fields.
- Modify `packages/viewer-react/src/context.ts`
  - Add `permissionLedger` to `PneumaViewerState`.
- Modify `packages/viewer-react/src/PneumaViewer.tsx`
  - Reduce `permission-ledger-state` into direct viewer state.
- Modify `packages/viewer-react/src/index.ts`
  - Export Governance Evidence helpers/panel.
- Create `packages/viewer-react/src/GovernanceEvidence.tsx`
  - Format and render evidence records.
- Create `packages/viewer-react/test/GovernanceEvidence.test.tsx`
  - Test panel states and deterministic labels.
- Modify `packages/viewer-react/test/hooks.test.tsx`
  - Test `usePneumaState` exposes permission ledger state.
- Modify `examples/p5-viewer-approval-e2e/server.ts`
  - Emit simulated `permission-ledger-state` records for capability lifecycle prompts and responses.
- Modify `examples/p5-viewer-approval-e2e/src/main.tsx`
  - Add `variant=governance` path and render the Governance Evidence panel alongside the existing app/builder story.
- Modify `examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts`
  - Test pending and completed governance evidence over the live WebSocket.
- Create `docs/archive/milestone-2-snapshot.md`
  - Draft M2 snapshot skeleton with thesis, evidence chain, proof table, demo story, and honest gaps.

---

### Task 1: Extend Permission Ledger Evidence Read Model

**Files:**
- Modify: `packages/core/src/permission-ledger.ts`
- Modify: `packages/core/src/tools/action.ts`
- Test: `packages/core/test/permission-ledger.test.ts`

- [ ] **Step 1: Write the failing ledger evidence test**

Add this test to `packages/core/test/permission-ledger.test.ts`:

```ts
test("request record exposes full governance evidence without raw token ids", () => {
  const store = new InMemoryPermissionLedgerStore();
  const tokenHash = approvalTokenLedgerHash({ token_id: "approval-secret", app_id, workspace_id });
  store.append(requested("prompt-evidence", 100));
  store.append({
    schema_version: 1,
    event_id: "evt-evidence-response",
    event_type: "permission_responded",
    at_ms: 110,
    prompt_id: "prompt-evidence",
    app_id,
    workspace_id,
    tool: "definition.apply",
    decision: "allow",
    decided_by: { kind: "builder", id: "builder:default" },
  });
  store.append({
    schema_version: 1,
    event_id: "evt-evidence-token",
    event_type: "approval_token_issued",
    at_ms: 111,
    prompt_id: "prompt-evidence",
    app_id,
    workspace_id,
    tool: "definition.apply",
    capability: "definition:apply",
    target: { kind: "definition", id: "definition.apply:add_table:tasks", fingerprint: "target-1" },
    target_fingerprint: "target-1",
    approval_token_hash: tokenHash,
    approved_capability: "definition:apply",
    approved_by: { kind: "builder", id: "builder:default" },
    issued_at_ms: 111,
    expires_at_ms: 411,
    single_use: true,
  });
  store.append({
    schema_version: 1,
    event_id: "evt-evidence-authorized",
    event_type: "permission_execution_authorized",
    at_ms: 112,
    prompt_id: "prompt-evidence",
    app_id,
    workspace_id,
    tool: "definition.apply",
    capability: "definition:apply",
    authorization_reason_code: "allowed",
    execution_principal: { kind: "framework_system", id: "framework" },
  });
  store.append({
    schema_version: 1,
    event_id: "evt-evidence-completed",
    event_type: "permission_execution_completed",
    at_ms: 120,
    prompt_id: "prompt-evidence",
    app_id,
    workspace_id,
    tool: "definition.apply",
  });

  const record = store.getRequest("prompt-evidence")!;
  expect(record).toMatchObject({
    status: "completed",
    approval_token_hash: tokenHash,
    approved_capability: "definition:apply",
    approved_by: { kind: "builder", id: "builder:default" },
    approval_token_expires_at_ms: 411,
    approval_token_single_use: true,
    execution_principal: { kind: "framework_system", id: "framework" },
    authorization_reason_code: "allowed",
  });
  expect(JSON.stringify(record)).not.toContain("approval-secret");
});
```

- [ ] **Step 2: Run the ledger test to verify it fails**

Run:

```bash
bun test packages/core/test/permission-ledger.test.ts -t "request record exposes full governance evidence"
```

Expected: FAIL because `approval_token_hash`, token metadata, and `execution_principal` are not yet present on the derived request record.

- [ ] **Step 3: Implement the ledger evidence fields**

In `packages/core/src/permission-ledger.ts`:

```ts
export interface PermissionLedgerRequestRecord {
  readonly prompt_id: string;
  readonly status: PermissionLedgerRequestStatus;
  readonly live: boolean;
  readonly requested_at_ms: number;
  readonly responded_at_ms?: number;
  readonly completed_at_ms?: number;
  readonly tool: string;
  readonly capability?: Capability;
  readonly target?: AuthorizationTarget;
  readonly target_fingerprint?: string;
  readonly requested_principal?: Principal;
  readonly decided_by?: { readonly kind: "builder"; readonly id: string };
  readonly decision?: PermissionLedgerDecision;
  readonly approved_by?: { readonly kind: "builder"; readonly id: string };
  readonly approval_token_hash?: string;
  readonly approved_capability?: Capability;
  readonly approval_token_expires_at_ms?: number;
  readonly approval_token_single_use?: true;
  readonly execution_principal?: Principal;
  readonly detail: Record<string, unknown>;
  readonly authorization_reason_code?: string;
  readonly message?: string;
}
```

Extend `permission_execution_authorized` and `permission_execution_denied` event variants:

```ts
| (PermissionLedgerBaseEvent & {
    readonly event_type: "permission_execution_authorized";
    readonly authorization_reason_code: string;
    readonly execution_principal?: Principal;
  })
| (PermissionLedgerBaseEvent & {
    readonly event_type: "permission_execution_denied";
    readonly authorization_reason_code: string;
    readonly execution_principal?: Principal;
    readonly message?: string;
  })
```

Inside `deriveOne`, track:

```ts
let approved_by: { readonly kind: "builder"; readonly id: string } | undefined;
let approval_token_hash: string | undefined;
let approved_capability: Capability | undefined;
let approval_token_expires_at_ms: number | undefined;
let approval_token_single_use: true | undefined;
let execution_principal: Principal | undefined;
```

Handle token and execution events:

```ts
case "approval_token_issued":
  approval_token_hash = event.approval_token_hash;
  approved_capability = event.approved_capability;
  approved_by = event.approved_by;
  approval_token_expires_at_ms = event.expires_at_ms;
  approval_token_single_use = event.single_use;
  break;
case "permission_execution_authorized":
  authorization_reason_code = event.authorization_reason_code;
  execution_principal = event.execution_principal;
  if (!terminal) status = "authorized";
  break;
case "permission_execution_denied":
  authorization_reason_code = event.authorization_reason_code;
  execution_principal = event.execution_principal;
  message = event.message;
  if (!terminal) {
    status = "failed";
    terminal = true;
  }
  break;
```

Return those fields in the record.

In `isPermissionLedgerEvent`, validate optional `execution_principal` with the existing `isPrincipal` helper:

```ts
case "permission_execution_authorized":
  return isString(value.authorization_reason_code)
    && (value.execution_principal === undefined || isPrincipal(value.execution_principal));
case "permission_execution_denied":
  return isString(value.authorization_reason_code)
    && (value.execution_principal === undefined || isPrincipal(value.execution_principal))
    && (value.message === undefined || isString(value.message));
```

In `packages/core/src/tools/action.ts`, include the execution principal in appended execution decisions:

```ts
execution_principal: input.decision.principal,
```

- [ ] **Step 4: Run focused ledger tests**

Run:

```bash
bun test packages/core/test/permission-ledger.test.ts packages/core/test/tools/definition-authorization.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/permission-ledger.ts packages/core/src/tools/action.ts packages/core/test/permission-ledger.test.ts
git commit -m "Expose governance evidence in permission ledger"
```

---

### Task 2: Store Permission Ledger State In Viewer SDK

**Files:**
- Modify: `packages/viewer-react/src/context.ts`
- Modify: `packages/viewer-react/src/PneumaViewer.tsx`
- Test: `packages/viewer-react/test/hooks.test.tsx`
- Test: `packages/core/test/wire-protocol/permission-ledger-seed.test.ts`

- [ ] **Step 1: Write the failing viewer state test**

Add this test to `packages/viewer-react/test/hooks.test.tsx`:

```ts
test("usePneumaState exposes permission ledger pending and recent records", async () => {
  const prevWS = globalThis.WebSocket;
  class FakeWS extends EventTarget {
    static instance: FakeWS | undefined;
    readyState = 1;
    constructor(_url: string) {
      super();
      FakeWS.instance = this;
      queueMicrotask(() => this.dispatchEvent(new Event("open")));
    }
    send(_: string): void {}
    close(): void { this.dispatchEvent(new Event("close")); }
    inject(env: unknown): void {
      const ev = new Event("message") as Event & { data: string };
      ev.data = JSON.stringify(env);
      this.dispatchEvent(ev);
    }
  }
  (globalThis as unknown as { WebSocket: typeof FakeWS }).WebSocket = FakeWS;
  try {
    function Probe() {
      const { permissionLedger } = usePneumaState();
      return React.createElement("pre", {}, JSON.stringify(permissionLedger));
    }
    const { container } = render(
      React.createElement(PneumaViewer, { wsUrl: "ws://x/ledger", sid: "ledger" }, React.createElement(Probe)),
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    await act(async () => {
      FakeWS.instance!.inject({
        dir: "a2v",
        kind: "framework-event",
        event: {
          type: "permission-ledger-state",
          state: {
            pending: [{ prompt_id: "prompt-live", status: "pending", live: true, requested_at_ms: 1, tool: "definition.apply", detail: {} }],
            recent: [{ prompt_id: "prompt-done", status: "completed", live: false, requested_at_ms: 2, tool: "definition.apply", detail: {} }],
          },
        },
      });
      await new Promise((r) => setTimeout(r, 20));
    });
    const state = JSON.parse(container.querySelector("pre")!.textContent!);
    expect(state.pending[0].prompt_id).toBe("prompt-live");
    expect(state.recent[0].prompt_id).toBe("prompt-done");
  } finally {
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = prevWS;
  }
});
```

- [ ] **Step 2: Run the viewer state test to verify it fails**

Run:

```bash
bun test packages/viewer-react/test/hooks.test.tsx -t "permission ledger pending and recent"
```

Expected: FAIL because `PneumaViewerState` does not expose `permissionLedger`.

- [ ] **Step 3: Implement viewer permission ledger state**

In `packages/viewer-react/src/context.ts`, import `PermissionLedgerState` and add:

```ts
permissionLedger: PermissionLedgerState;
```

Initialize:

```ts
permissionLedger: { pending: [], recent: [] },
```

In `packages/viewer-react/src/PneumaViewer.tsx`, update the `framework-event` branch:

```ts
if (env.kind === "framework-event") {
  return {
    ...state,
    frameworkEvents: [...state.frameworkEvents, env.event].slice(-50),
    ...(env.event.type === "permission-ledger-state"
      ? { permissionLedger: env.event.state }
      : {}),
  };
}
```

- [ ] **Step 4: Add wire seed coverage for evidence fields**

In `packages/core/test/wire-protocol/permission-ledger-seed.test.ts`, extend the first test's old request with an `approval_token_issued` event and assert the seeded recent record includes `approval_token_hash` and `approval_token_single_use`.

- [ ] **Step 5: Run focused wire/viewer tests**

Run:

```bash
bun test packages/viewer-react/test/hooks.test.tsx packages/core/test/wire-protocol/permission-ledger-seed.test.ts packages/core/test/wire-protocol/seed-on-open.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/viewer-react/src/context.ts packages/viewer-react/src/PneumaViewer.tsx packages/viewer-react/test/hooks.test.tsx packages/core/test/wire-protocol/permission-ledger-seed.test.ts
git commit -m "Store permission ledger state in viewer"
```

---

### Task 3: Add Governance Evidence Viewer Component

**Files:**
- Create: `packages/viewer-react/src/GovernanceEvidence.tsx`
- Modify: `packages/viewer-react/src/index.ts`
- Test: `packages/viewer-react/test/GovernanceEvidence.test.tsx`

- [ ] **Step 1: Write the failing Governance Evidence component tests**

Create `packages/viewer-react/test/GovernanceEvidence.test.tsx` with tests for:

```ts
test("GovernanceEvidencePanel renders authority split and token evidence", () => {
  const records = [{
    prompt_id: "prompt-1",
    status: "completed",
    live: false,
    requested_at_ms: 100,
    responded_at_ms: 110,
    completed_at_ms: 120,
    tool: "definition.apply",
    capability: "policy:mutate",
    target: { kind: "policy_rule", id: "reviewers-can-read-review-queue", fingerprint: "policy_rule:reviewers-can-read-review-queue" },
    target_fingerprint: "policy_rule:reviewers-can-read-review-queue",
    requested_principal: { kind: "build_agent", id: "opencode", acting_for: { kind: "builder", id: "builder:default" } },
    decided_by: { kind: "builder", id: "builder:default" },
    decision: "allow",
    approved_by: { kind: "builder", id: "builder:default" },
    approval_token_hash: "abc123",
    approved_capability: "policy:mutate",
    approval_token_expires_at_ms: 700,
    approval_token_single_use: true,
    execution_principal: { kind: "framework_system", id: "framework" },
    authorization_reason_code: "allowed",
    detail: {},
  }] as const;
  const { getByText } = render(React.createElement(GovernanceEvidencePanel, { pending: [], recent: records }));
  expect(getByText("build_agent:opencode")).toBeTruthy();
  expect(getByText("framework_system:framework")).toBeTruthy();
  expect(getByText("policy:mutate")).toBeTruthy();
  expect(getByText("token hash abc123")).toBeTruthy();
});

test("GovernanceEvidencePanel distinguishes live, stale, denied, failed, expired, and completed", () => {
  const records = [
    { prompt_id: "live", status: "pending", live: true, requested_at_ms: 1, tool: "definition.apply", detail: {} },
    { prompt_id: "stale", status: "pending", live: false, requested_at_ms: 2, tool: "definition.apply", detail: {} },
    { prompt_id: "denied", status: "denied", live: false, requested_at_ms: 3, tool: "definition.apply", detail: {} },
    { prompt_id: "failed", status: "failed", live: false, requested_at_ms: 4, tool: "definition.apply", detail: {} },
    { prompt_id: "expired", status: "expired", live: false, requested_at_ms: 5, tool: "definition.apply", detail: {} },
    { prompt_id: "completed", status: "completed", live: false, requested_at_ms: 6, tool: "definition.apply", detail: {} },
  ] as const;
  const { getByText } = render(React.createElement(GovernanceEvidencePanel, { pending: records.slice(0, 2), recent: records.slice(2) }));
  expect(getByText("Pending, actionable")).toBeTruthy();
  expect(getByText("Pending, stale")).toBeTruthy();
  expect(getByText("Denied")).toBeTruthy();
  expect(getByText("Failed")).toBeTruthy();
  expect(getByText("Expired")).toBeTruthy();
  expect(getByText("Completed")).toBeTruthy();
});
```

- [ ] **Step 2: Run the component tests to verify they fail**

Run:

```bash
bun test packages/viewer-react/test/GovernanceEvidence.test.tsx
```

Expected: FAIL because `GovernanceEvidencePanel` does not exist.

- [ ] **Step 3: Implement `GovernanceEvidencePanel`**

Create `packages/viewer-react/src/GovernanceEvidence.tsx` with:

```ts
import * as React from "react";
import type { PermissionLedgerRequestRecord } from "@pneuma-framework/core";

export interface GovernanceEvidencePanelProps {
  pending: readonly PermissionLedgerRequestRecord[];
  recent: readonly PermissionLedgerRequestRecord[];
}

export function formatPrincipal(principal: PermissionLedgerRequestRecord["requested_principal"]): string {
  if (!principal) return "unknown";
  if (principal.kind === "build_agent") return `${principal.kind}:${principal.id}`;
  if (principal.kind === "framework_system") return `${principal.kind}:${principal.id}`;
  if (principal.kind === "builder") return `${principal.kind}:${principal.id}`;
  if (principal.kind === "runtime_agent") return `${principal.kind}:${principal.id}`;
  return `${principal.kind}:${principal.id}`;
}

export function formatTarget(target: PermissionLedgerRequestRecord["target"], fallback?: string): string {
  if (!target) return fallback ?? "target:unknown";
  return `${target.kind}:${target.id ?? target.fingerprint ?? "unknown"}`;
}

export function formatPermissionStatus(record: PermissionLedgerRequestRecord): string {
  if (record.status === "pending" && record.live) return "Pending, actionable";
  if (record.status === "pending") return "Pending, stale";
  if (record.status === "denied") return "Denied";
  if (record.status === "failed") return "Failed";
  if (record.status === "expired") return "Expired";
  if (record.status === "completed") return "Completed";
  if (record.status === "authorized") return "Authorized";
  return "Allowed";
}

export function GovernanceEvidencePanel({ pending, recent }: GovernanceEvidencePanelProps) {
  const all = [...pending, ...recent];
  return (
    <section aria-label="Governance evidence" style={panelStyle}>
      <div style={headerStyle}>
        <div>
          <div style={eyebrowStyle}>Governance evidence</div>
          <h2 style={titleStyle}>AI-created changes need proof</h2>
        </div>
        <div style={countStyle}>{pending.length} pending</div>
      </div>
      {all.length === 0 ? (
        <div style={emptyStyle}>No governance evidence yet.</div>
      ) : (
        <div style={listStyle}>
          {all.map((record) => <EvidenceRow key={record.prompt_id} record={record} />)}
        </div>
      )}
    </section>
  );
}
```

Finish the file with focused `EvidenceRow` markup and inline styles. Use restrained product UI: tinted neutrals, compact rows, no nested cards, no gradient text, no decorative blobs.

Export from `packages/viewer-react/src/index.ts`:

```ts
export {
  GovernanceEvidencePanel,
  formatPermissionStatus,
  formatPrincipal,
  formatTarget,
} from "./GovernanceEvidence.js";
```

- [ ] **Step 4: Run component tests**

Run:

```bash
bun test packages/viewer-react/test/GovernanceEvidence.test.tsx
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/viewer-react/src/GovernanceEvidence.tsx packages/viewer-react/src/index.ts packages/viewer-react/test/GovernanceEvidence.test.tsx
git commit -m "Add governance evidence viewer panel"
```

---

### Task 4: Add Governance Evidence To The Canonical Demo

**Files:**
- Modify: `examples/p5-viewer-approval-e2e/server.ts`
- Modify: `examples/p5-viewer-approval-e2e/src/main.tsx`
- Test: `examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts`

- [ ] **Step 1: Write the failing demo e2e test**

Add a second test to `examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts`:

```ts
test("capability lifecycle demo exposes governance evidence over wire", async () => {
  const server = Bun.spawn(["bun", "./server.ts"], {
    cwd: import.meta.dir,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, PORT: "0" },
  });
  children.push(server);

  const baseUrl = await readServerUrl(server);
  const ws = await openSocket(`${baseUrl.replace(/^http/, "ws")}/ws?scenario=capability-lifecycle`);
  const messages = collectMessages(ws);

  await waitForState(messages, "capability-lifecycle/status");
  ws.send(JSON.stringify({ kind: "action", action: { kind: "click", target: "capability.request-add" } }));
  await waitForPrompt(messages, "pneuma:capability-lifecycle:add-operation");
  const pending = await waitForPermissionLedgerState(messages, (state) =>
    state.pending.some((record) => record.prompt_id === "pneuma:capability-lifecycle:add-operation" && record.live === true),
  );
  const pendingRecord = pending.pending.find((record) => record.prompt_id === "pneuma:capability-lifecycle:add-operation");
  expect(pendingRecord).toMatchObject({
    tool: "definition.apply",
    capability: "definition:apply",
    requested_principal: { kind: "build_agent", id: "opencode" },
  });

  ws.send(JSON.stringify({
    kind: "permission-response",
    response: { id: "pneuma:capability-lifecycle:add-operation", decision: "allow" },
  }));
  const completed = await waitForPermissionLedgerState(messages, (state) =>
    state.recent.some((record) => record.prompt_id === "pneuma:capability-lifecycle:add-operation" && record.status === "completed"),
  );
  const completedRecord = completed.recent.find((record) => record.prompt_id === "pneuma:capability-lifecycle:add-operation");
  expect(completedRecord).toMatchObject({
    status: "completed",
    decision: "allow",
    approval_token_single_use: true,
    execution_principal: { kind: "framework_system", id: "framework" },
    authorization_reason_code: "allowed",
  });
  expect(JSON.stringify(completed)).not.toContain("approval-secret");

  ws.close();
});
```

Add helper:

```ts
async function waitForPermissionLedgerState(
  messages: DemoEnvelope[],
  predicate: (state: { pending: Array<Record<string, unknown>>; recent: Array<Record<string, unknown>> }) => boolean,
) {
  const env = await waitFor(messages, (message) =>
    message.kind === "framework-event"
    && message.event?.type === "permission-ledger-state"
    && predicate(message.event.state),
  );
  return env.event!.state;
}
```

Also extend `DemoEnvelope` with optional `event`.

- [ ] **Step 2: Run the demo test to verify it fails**

Run:

```bash
bun test examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts -t "governance evidence"
```

Expected: FAIL because the demo server does not emit permission-ledger-state.

- [ ] **Step 3: Implement server-side demo evidence emission**

In `examples/p5-viewer-approval-e2e/server.ts`, add helpers:

```ts
function governanceRecord(input: {
  prompt_id: string;
  status: string;
  live: boolean;
  tool: string;
  capability: string;
  target: Record<string, unknown>;
  decision?: "allow" | "deny" | "allow-always";
  message?: string;
}) {
  return {
    prompt_id: input.prompt_id,
    status: input.status,
    live: input.live,
    requested_at_ms: Date.now(),
    responded_at_ms: input.status === "pending" ? undefined : Date.now(),
    completed_at_ms: input.status === "completed" || input.status === "failed" || input.status === "expired" ? Date.now() : undefined,
    tool: input.tool,
    capability: input.capability,
    target: input.target,
    target_fingerprint: String(input.target.fingerprint ?? input.target.id ?? input.prompt_id),
    requested_principal: {
      kind: "build_agent",
      id: "opencode",
      acting_for: { kind: "builder", id: "builder:default" },
    },
    decided_by: input.decision ? { kind: "builder", id: "builder:default" } : undefined,
    decision: input.decision,
    approved_by: input.decision === "allow" || input.decision === "allow-always" ? { kind: "builder", id: "builder:default" } : undefined,
    approval_token_hash: input.decision === "allow" || input.decision === "allow-always" ? `demo-hash-${input.prompt_id}` : undefined,
    approved_capability: input.decision === "allow" || input.decision === "allow-always" ? input.capability : undefined,
    approval_token_expires_at_ms: input.decision === "allow" || input.decision === "allow-always" ? Date.now() + 600_000 : undefined,
    approval_token_single_use: input.decision === "allow" || input.decision === "allow-always" ? true : undefined,
    execution_principal: input.status === "completed" ? { kind: "framework_system", id: "framework" } : undefined,
    authorization_reason_code: input.status === "completed" ? "allowed" : undefined,
    message: input.message,
    detail: {},
  };
}

function sendGovernanceEvidence(
  ws: ServerWebSocket<WsData>,
  pending: readonly Record<string, unknown>[],
  recent: readonly Record<string, unknown>[],
): void {
  ws.send(JSON.stringify({
    dir: "a2v",
    kind: "framework-event",
    event: {
      type: "permission-ledger-state",
      state: { pending, recent },
    },
  }));
}
```

Emit pending evidence when each capability lifecycle prompt is sent. Emit completed/denied evidence in each response handler.

- [ ] **Step 4: Implement governance variant UI**

In `examples/p5-viewer-approval-e2e/src/main.tsx`:

1. Import `GovernanceEvidencePanel`.
2. Read `permissionLedger` from `usePneumaState`.
3. Treat `variant === "governance"` as a studio-like layout with a governance evidence section.
4. Place `<GovernanceEvidencePanel pending={permissionLedger.pending} recent={permissionLedger.recent} />` in the Builder/Agent side of the screen.

Keep `variant=studio` unchanged.

- [ ] **Step 5: Run demo and viewer focused tests**

Run:

```bash
bun test examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts packages/viewer-react/test/GovernanceEvidence.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add examples/p5-viewer-approval-e2e/server.ts examples/p5-viewer-approval-e2e/src/main.tsx examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts
git commit -m "Add governance evidence demo variant"
```

---

### Task 5: Draft The M2 Snapshot Skeleton

**Files:**
- Create: `docs/archive/milestone-2-snapshot.md`
- Modify: `docs/architecture/roadmap.md`
- Modify: `docs/architecture/OPEN-QUESTIONS.md`

- [ ] **Step 1: Write the milestone snapshot skeleton**

Create `docs/archive/milestone-2-snapshot.md` with these sections:

```md
# Milestone 2 Snapshot: Enterprise Governance Evidence

**Date:** 2026-04-29
**Status:** Draft while M2.3 is in progress
**Audience:** teammates with zero Pneuma context

中文摘要：

> M1 证明 app definition 可以作为 runtime primitive 被治理。M2 证明 AI-created software capability 不是 chat side effect，而是有 authority separation、approval token、durable ledger、evidence surface 的企业级变更。

## Executive Summary

## M2 Thesis

## Evidence Chain

## What Is Proven So Far

## Demo Story

## Security Model

## Still Not Claimed

## Next Decision Gate
```

Fill each section with durable prose from the M2.3 design. Keep it honest: mark production Permission Center, multi-approver, IAM, Policy lifecycle, transaction/concurrency as not claimed yet.

- [ ] **Step 2: Update roadmap and open questions**

In `docs/architecture/roadmap.md`, add one sentence under Stage 5 that M2.3's draft snapshot is `milestone-2-snapshot.md`.

In `docs/architecture/OPEN-QUESTIONS.md`, update the Governance Gaps Permission Center row to say M2.3 has a lightweight governance evidence loop, while production Permission Center remains open.

- [ ] **Step 3: Run documentation hygiene checks**

Run:

```bash
rg -n "TBD|TODO|FIXME|placeholder" docs/archive/milestone-2-snapshot.md docs/architecture/roadmap.md docs/architecture/OPEN-QUESTIONS.md
git diff --check
```

Expected: no matches from `rg`; `git diff --check` exits 0.

- [ ] **Step 4: Commit**

```bash
git add docs/archive/milestone-2-snapshot.md docs/architecture/roadmap.md docs/architecture/OPEN-QUESTIONS.md
git commit -m "Draft M2 governance evidence snapshot"
```

---

### Task 6: Full Verification And Review

**Files:**
- No new implementation files.

- [ ] **Step 1: Run focused M2.3 verification**

Run:

```bash
bun test \
  packages/core/test/permission-ledger.test.ts \
  packages/core/test/wire-protocol/permission-ledger-seed.test.ts \
  packages/core/test/wire-protocol/seed-on-open.test.ts \
  packages/viewer-react/test/hooks.test.tsx \
  packages/viewer-react/test/GovernanceEvidence.test.tsx \
  examples/p5-viewer-approval-e2e/capability-lifecycle.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: PASS.

- [ ] **Step 3: Run full tests**

Run:

```bash
bun test
```

Expected: PASS.

- [ ] **Step 4: Run diff hygiene**

Run:

```bash
git diff --check
git status --short
```

Expected: `git diff --check` exits 0. `git status --short` is empty after all commits.

- [ ] **Step 5: Final review**

Review the final diff for:

- raw approval token leakage;
- UI overclaiming production Permission Center;
- M2 snapshot overclaiming enterprise readiness;
- wire protocol compatibility;
- evidence records missing reason/principal/target fields.

Fix any issue with a failing test first, then commit.
