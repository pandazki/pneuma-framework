# M2.2 Durable Permission Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a durable permission ledger so framework-owned approvals are recorded, queryable, and recoverable on viewer reconnect without persisting reusable approval tokens.

**Architecture:** Add a focused `packages/core/src/permission-ledger.ts` module for append-only ledger storage and derived request records. Wire it into `createPneumaFramework`, `LifecycleOrchestrator`, tool authorization, and viewer reconnect seed. Keep approval tokens in-memory and single-use; persist only token hashes and governance metadata.

**Tech Stack:** TypeScript, Bun test runner, Node `fs` sync APIs for local JSONL durability, existing wire-protocol envelopes.

---

## File Structure

- Create `packages/core/src/permission-ledger.ts`
  - Owns event/request types, `FilePermissionLedgerStore`, `InMemoryPermissionLedgerStore`, token hashing, JSONL parsing, and request derivation.
- Modify `packages/core/src/index.ts`
  - Exports ledger types and store implementations.
- Modify `packages/core/src/tools/types.ts`
  - Adds optional `permissionLedger` to `ToolContext`.
- Modify `packages/core/src/tools/action.ts`
  - Records approval-token metadata and framework execution authorization decisions.
- Modify `packages/core/src/create.ts`
  - Installs the default file ledger when authorization is enabled, passes it into tools, and wires it into lifecycle and viewer seed.
- Modify `packages/core/src/lifecycle.ts`
  - Records permission requested/responded/completed/failed events and tracks live framework prompts for reconnect replay.
- Modify `packages/core/src/wire-protocol/types.ts`
  - Adds `permission-ledger-state` framework event type.
- Create `packages/core/src/wire-protocol/permission-ledger-state.ts`
  - Builds reconnect seed envelopes from ledger records plus live prompt envelopes.
- Test `packages/core/test/permission-ledger.test.ts`
  - Unit coverage for store, derivation, corrupt lines, and token-hash safety.
- Test `packages/core/test/tools/definition-authorization.test.ts`
  - Tool-layer token metadata and authorization event coverage.
- Test `packages/core/test/tools/definition-apply.test.ts`
  - Lifecycle request/response/completion/failure coverage for definition apply and rollback.
- Test `packages/core/test/wire-protocol/permission-ledger-seed.test.ts`
  - Reconnect seed coverage.
- Update `docs/architecture/OPEN-QUESTIONS.md`
  - Mark the live-only approval gap as partially closed by M2.2, leaving full Permission Center as later work.

## Implementation Notes

The ledger interface should accept sync or async implementations without forcing the existing bridge to become fully async:

```ts
export interface PermissionLedgerStore {
  append(event: PermissionLedgerEvent): void | Promise<void>;
  list(options?: PermissionLedgerListOptions): readonly PermissionLedgerEvent[] | Promise<readonly PermissionLedgerEvent[]>;
  listRequests(options?: PermissionLedgerRequestListOptions): readonly PermissionLedgerRequestRecord[] | Promise<readonly PermissionLedgerRequestRecord[]>;
  getRequest(promptId: string): PermissionLedgerRequestRecord | undefined | Promise<PermissionLedgerRequestRecord | undefined>;
}
```

The default file store should be synchronous internally. That preserves existing synchronous `handleFrameworkPermissionResponse(...)` tests and keeps response routing simple.

Use helper functions when lifecycle/tool code is already async:

```ts
await Promise.resolve(ledger.append(event));
```

Use direct calls when response routing must remain synchronous:

```ts
this.permissionLedger?.append(event);
```

Default file path:

```ts
permissionLedgerFilePath(workspace) === join(stateDir(workspace), "permission-ledger.jsonl")
```

Do not persist the raw `approval_token_id`. Use:

```ts
export function approvalTokenLedgerHash(input: {
  token_id: string;
  app_id: string;
  workspace_id: string;
}): string {
  return createHash("sha256")
    .update(`${input.app_id}\0${input.workspace_id}\0${input.token_id}`)
    .digest("hex");
}
```

## Task 1: Ledger Store And Derived Records

**Files:**
- Create: `packages/core/src/permission-ledger.ts`
- Create: `packages/core/test/permission-ledger.test.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing ledger unit tests**

Create `packages/core/test/permission-ledger.test.ts` with these tests:

```ts
import { test, expect } from "bun:test";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  FilePermissionLedgerStore,
  InMemoryPermissionLedgerStore,
  approvalTokenLedgerHash,
  permissionLedgerFilePath,
  type PermissionLedgerEvent,
} from "../src/permission-ledger.js";

const app_id = "app:test";
const workspace_id = "workspace:test";

function requested(prompt_id = "prompt-1"): PermissionLedgerEvent {
  return {
    schema_version: 1,
    event_id: `evt-${prompt_id}`,
    event_type: "permission_requested",
    at_ms: 100,
    prompt_id,
    app_id,
    workspace_id,
    tool: "definition.apply",
    capability: "definition:apply",
    target: { kind: "definition", id: "definition.apply:add_table:tasks", fingerprint: "target-1" },
    target_fingerprint: "target-1",
    requested_principal: {
      kind: "build_agent",
      id: "opencode",
      acting_for: { kind: "builder", id: "builder:default" },
    },
    detail: { change_id: "def-1" },
  };
}

test("file ledger appends events and derives a completed request", () => {
  const workspace = mkdtempSync(join(tmpdir(), "pneuma-permission-ledger-"));
  const store = new FilePermissionLedgerStore(workspace);
  store.append(requested());
  store.append({
    schema_version: 1,
    event_id: "evt-response",
    event_type: "permission_responded",
    at_ms: 110,
    prompt_id: "prompt-1",
    app_id,
    workspace_id,
    tool: "definition.apply",
    decision: "allow",
    decided_by: { kind: "builder", id: "builder:default" },
  });
  store.append({
    schema_version: 1,
    event_id: "evt-token",
    event_type: "approval_token_issued",
    at_ms: 111,
    prompt_id: "prompt-1",
    app_id,
    workspace_id,
    tool: "definition.apply",
    capability: "definition:apply",
    approval_token_hash: approvalTokenLedgerHash({ token_id: "approval-secret", app_id, workspace_id }),
    approved_capability: "definition:apply",
    approved_by: { kind: "builder", id: "builder:default" },
    issued_at_ms: 111,
    expires_at_ms: 411,
    single_use: true,
  });
  store.append({
    schema_version: 1,
    event_id: "evt-authorized",
    event_type: "permission_execution_authorized",
    at_ms: 112,
    prompt_id: "prompt-1",
    app_id,
    workspace_id,
    tool: "definition.apply",
    capability: "definition:apply",
    authorization_reason_code: "allowed",
  });
  store.append({
    schema_version: 1,
    event_id: "evt-completed",
    event_type: "permission_execution_completed",
    at_ms: 120,
    prompt_id: "prompt-1",
    app_id,
    workspace_id,
    tool: "definition.apply",
  });

  expect(existsSync(permissionLedgerFilePath(workspace))).toBe(true);
  const records = store.listRequests();
  expect(records).toHaveLength(1);
  expect(records[0]).toMatchObject({
    prompt_id: "prompt-1",
    status: "completed",
    live: false,
    decision: "allow",
    authorization_reason_code: "allowed",
  });
});

test("file ledger derives pending requests and can mark live prompt ids", () => {
  const workspace = mkdtempSync(join(tmpdir(), "pneuma-permission-ledger-pending-"));
  const store = new FilePermissionLedgerStore(workspace);
  store.append(requested("prompt-live"));

  expect(store.listRequests()[0]).toMatchObject({ status: "pending", live: false });
  expect(store.listRequests({ livePromptIds: new Set(["prompt-live"]) })[0]).toMatchObject({
    status: "pending",
    live: true,
  });
});

test("file ledger skips corrupt jsonl lines", () => {
  const workspace = mkdtempSync(join(tmpdir(), "pneuma-permission-ledger-corrupt-"));
  mkdirSync(join(workspace, ".pneuma"), { recursive: true });
  writeFileSync(permissionLedgerFilePath(workspace), "{broken json}\n" + JSON.stringify(requested()) + "\n", "utf8");
  const store = new FilePermissionLedgerStore(workspace);
  expect(store.list()).toHaveLength(1);
  expect(store.listRequests()[0]?.prompt_id).toBe("prompt-1");
});

test("approval token hash does not expose the raw token id", () => {
  const hash = approvalTokenLedgerHash({ token_id: "approval-secret", app_id, workspace_id });
  expect(hash).not.toContain("approval-secret");
  expect(hash).toHaveLength(64);
});

test("in-memory ledger mirrors file ledger derivation", () => {
  const store = new InMemoryPermissionLedgerStore();
  store.append(requested());
  expect(store.getRequest("prompt-1")).toMatchObject({ prompt_id: "prompt-1", status: "pending" });
  expect(store.getRequest("missing")).toBeUndefined();
  expect(readFileSync).toBeDefined();
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
bun test packages/core/test/permission-ledger.test.ts
```

Expected: fail with missing `../src/permission-ledger.js` exports.

- [ ] **Step 3: Implement `permission-ledger.ts`**

Create `packages/core/src/permission-ledger.ts` with:

```ts
import { createHash, randomUUID } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type {
  AuthorizationTarget,
  Capability,
  Principal,
} from "@pneuma-framework/core-domain";
import { stateDir } from "./workspace.js";

export type PermissionLedgerDecision = "allow" | "deny" | "allow-always";
export type PermissionLedgerRequestStatus =
  | "pending"
  | "allowed"
  | "denied"
  | "authorized"
  | "completed"
  | "failed"
  | "expired";

export interface PermissionLedgerBaseEvent {
  readonly schema_version: 1;
  readonly event_id: string;
  readonly event_type: string;
  readonly at_ms: number;
  readonly prompt_id: string;
  readonly session_id?: string;
  readonly app_id: string;
  readonly workspace_id: string;
  readonly tool: string;
  readonly capability?: Capability;
  readonly target?: AuthorizationTarget;
  readonly target_fingerprint?: string;
}

export type PermissionLedgerEvent =
  | (PermissionLedgerBaseEvent & {
      readonly event_type: "permission_requested";
      readonly requested_principal?: Principal;
      readonly detail: Record<string, unknown>;
    })
  | (PermissionLedgerBaseEvent & {
      readonly event_type: "permission_responded";
      readonly decision: PermissionLedgerDecision;
      readonly decided_by: { readonly kind: "builder"; readonly id: string };
    })
  | (PermissionLedgerBaseEvent & {
      readonly event_type: "approval_token_issued";
      readonly approval_token_hash: string;
      readonly approved_capability: Capability;
      readonly approved_by: { readonly kind: "builder"; readonly id: string };
      readonly issued_at_ms: number;
      readonly expires_at_ms: number;
      readonly single_use: true;
    })
  | (PermissionLedgerBaseEvent & {
      readonly event_type: "permission_execution_authorized";
      readonly authorization_reason_code: string;
    })
  | (PermissionLedgerBaseEvent & {
      readonly event_type: "permission_execution_denied";
      readonly authorization_reason_code: string;
      readonly message?: string;
    })
  | (PermissionLedgerBaseEvent & {
      readonly event_type: "permission_execution_completed";
    })
  | (PermissionLedgerBaseEvent & {
      readonly event_type: "permission_execution_failed";
      readonly message: string;
    })
  | (PermissionLedgerBaseEvent & {
      readonly event_type: "permission_expired";
      readonly message?: string;
    });

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
  readonly detail: Record<string, unknown>;
  readonly authorization_reason_code?: string;
  readonly message?: string;
}

export interface PermissionLedgerListOptions {
  readonly limit?: number;
}

export interface PermissionLedgerRequestListOptions {
  readonly limit?: number;
  readonly livePromptIds?: ReadonlySet<string>;
}

export interface PermissionLedgerStore {
  append(event: PermissionLedgerEvent): void | Promise<void>;
  list(options?: PermissionLedgerListOptions): readonly PermissionLedgerEvent[] | Promise<readonly PermissionLedgerEvent[]>;
  listRequests(options?: PermissionLedgerRequestListOptions): readonly PermissionLedgerRequestRecord[] | Promise<readonly PermissionLedgerRequestRecord[]>;
  getRequest(promptId: string, options?: PermissionLedgerRequestListOptions): PermissionLedgerRequestRecord | undefined | Promise<PermissionLedgerRequestRecord | undefined>;
}

export function permissionLedgerFilePath(workspace: string): string {
  return join(stateDir(workspace), "permission-ledger.jsonl");
}

export function permissionLedgerEventId(): string {
  return `permission-${randomUUID()}`;
}

export function approvalTokenLedgerHash(input: {
  readonly token_id: string;
  readonly app_id: string;
  readonly workspace_id: string;
}): string {
  return createHash("sha256")
    .update(`${input.app_id}\0${input.workspace_id}\0${input.token_id}`)
    .digest("hex");
}

export class FilePermissionLedgerStore implements PermissionLedgerStore {
  private readonly path: string;

  constructor(private readonly workspace: string) {
    this.path = permissionLedgerFilePath(workspace);
  }

  append(event: PermissionLedgerEvent): void {
    mkdirSync(stateDir(this.workspace), { recursive: true });
    appendFileSync(this.path, JSON.stringify(event) + "\n", "utf8");
  }

  list(options: PermissionLedgerListOptions = {}): readonly PermissionLedgerEvent[] {
    if (!existsSync(this.path)) return [];
    const events: PermissionLedgerEvent[] = [];
    const raw = readFileSync(this.path, "utf8");
    for (const line of raw.split(/\n/)) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as PermissionLedgerEvent;
        if (parsed.schema_version === 1 && typeof parsed.prompt_id === "string") {
          events.push(parsed);
        }
      } catch {
        continue;
      }
    }
    return applyLimit(events, options.limit);
  }

  listRequests(options: PermissionLedgerRequestListOptions = {}): readonly PermissionLedgerRequestRecord[] {
    return derivePermissionLedgerRequests(this.list(), options);
  }

  getRequest(promptId: string, options: PermissionLedgerRequestListOptions = {}): PermissionLedgerRequestRecord | undefined {
    return this.listRequests(options).find((record) => record.prompt_id === promptId);
  }
}

export class InMemoryPermissionLedgerStore implements PermissionLedgerStore {
  private readonly events: PermissionLedgerEvent[] = [];

  append(event: PermissionLedgerEvent): void {
    this.events.push(event);
  }

  list(options: PermissionLedgerListOptions = {}): readonly PermissionLedgerEvent[] {
    return applyLimit([...this.events], options.limit);
  }

  listRequests(options: PermissionLedgerRequestListOptions = {}): readonly PermissionLedgerRequestRecord[] {
    return derivePermissionLedgerRequests(this.events, options);
  }

  getRequest(promptId: string, options: PermissionLedgerRequestListOptions = {}): PermissionLedgerRequestRecord | undefined {
    return this.listRequests(options).find((record) => record.prompt_id === promptId);
  }
}

export function derivePermissionLedgerRequests(
  events: readonly PermissionLedgerEvent[],
  options: PermissionLedgerRequestListOptions = {},
): readonly PermissionLedgerRequestRecord[] {
  const byPrompt = new Map<string, PermissionLedgerEvent[]>();
  for (const event of events) {
    const bucket = byPrompt.get(event.prompt_id) ?? [];
    bucket.push(event);
    byPrompt.set(event.prompt_id, bucket);
  }
  const records = [...byPrompt.values()]
    .map((bucket) => deriveOne(bucket, options.livePromptIds ?? new Set()))
    .filter((record): record is PermissionLedgerRequestRecord => record !== undefined)
    .sort((a, b) => b.requested_at_ms - a.requested_at_ms);
  return applyLimit(records, options.limit);
}

function deriveOne(
  bucket: readonly PermissionLedgerEvent[],
  livePromptIds: ReadonlySet<string>,
): PermissionLedgerRequestRecord | undefined {
  const ordered = [...bucket].sort((a, b) => a.at_ms - b.at_ms);
  const request = ordered.find((event) => event.event_type === "permission_requested");
  if (!request || request.event_type !== "permission_requested") return undefined;
  let status: PermissionLedgerRequestStatus = "pending";
  let responded_at_ms: number | undefined;
  let completed_at_ms: number | undefined;
  let decision: PermissionLedgerDecision | undefined;
  let decided_by: { readonly kind: "builder"; readonly id: string } | undefined;
  let authorization_reason_code: string | undefined;
  let message: string | undefined;
  for (const event of ordered) {
    switch (event.event_type) {
      case "permission_responded":
        responded_at_ms = event.at_ms;
        decision = event.decision;
        decided_by = event.decided_by;
        status = event.decision === "deny" ? "denied" : "allowed";
        break;
      case "permission_execution_authorized":
        authorization_reason_code = event.authorization_reason_code;
        status = "authorized";
        break;
      case "permission_execution_denied":
        authorization_reason_code = event.authorization_reason_code;
        message = event.message;
        status = "failed";
        break;
      case "permission_execution_completed":
        completed_at_ms = event.at_ms;
        status = "completed";
        break;
      case "permission_execution_failed":
        completed_at_ms = event.at_ms;
        message = event.message;
        status = "failed";
        break;
      case "permission_expired":
        completed_at_ms = event.at_ms;
        message = event.message;
        status = "expired";
        break;
    }
  }
  return {
    prompt_id: request.prompt_id,
    status,
    live: status === "pending" && livePromptIds.has(request.prompt_id),
    requested_at_ms: request.at_ms,
    responded_at_ms,
    completed_at_ms,
    tool: request.tool,
    capability: request.capability,
    target: request.target,
    target_fingerprint: request.target_fingerprint,
    requested_principal: request.requested_principal,
    decided_by,
    decision,
    detail: request.detail,
    authorization_reason_code,
    message,
  };
}

function applyLimit<T>(items: readonly T[], limit?: number): readonly T[] {
  if (limit === undefined || limit < 0) return items;
  return items.slice(-limit);
}
```

- [ ] **Step 4: Export ledger APIs**

Add to `packages/core/src/index.ts`:

```ts
export {
  FilePermissionLedgerStore,
  InMemoryPermissionLedgerStore,
  approvalTokenLedgerHash,
  derivePermissionLedgerRequests,
  permissionLedgerEventId,
  permissionLedgerFilePath,
} from "./permission-ledger.js";
export type {
  PermissionLedgerDecision,
  PermissionLedgerEvent,
  PermissionLedgerListOptions,
  PermissionLedgerRequestListOptions,
  PermissionLedgerRequestRecord,
  PermissionLedgerRequestStatus,
  PermissionLedgerStore,
} from "./permission-ledger.js";
```

- [ ] **Step 5: Run ledger tests**

Run:

```bash
bun test packages/core/test/permission-ledger.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/permission-ledger.ts packages/core/src/index.ts packages/core/test/permission-ledger.test.ts
git commit -m "Add durable permission ledger store"
```

## Task 2: Framework Wiring And Default Store

**Files:**
- Modify: `packages/core/src/create.ts`
- Modify: `packages/core/src/tools/types.ts`
- Test: `packages/core/test/create.test.ts`

- [ ] **Step 1: Write failing framework constructor tests**

Add tests to `packages/core/test/create.test.ts`:

```ts
import {
  FilePermissionLedgerStore,
  InMemoryPermissionLedgerStore,
  permissionLedgerFilePath,
} from "../src/index.js";

test("createPneumaFramework installs a file permission ledger by default when authorization is enabled", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-create-permission-ledger-"));
  const fw = createPneumaFramework({ templateDir: FIXTURE, workspace: ws });
  expect(fw.permissionLedger).toBeInstanceOf(FilePermissionLedgerStore);
  expect(permissionLedgerFilePath(ws)).toContain(".pneuma/permission-ledger.jsonl");
  await fw.close();
});

test("createPneumaFramework accepts an injected permission ledger", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-create-permission-ledger-injected-"));
  const permissionLedger = new InMemoryPermissionLedgerStore();
  const fw = createPneumaFramework({
    templateDir: FIXTURE,
    workspace: ws,
    authorization: { permissionLedger },
  });
  expect(fw.permissionLedger).toBe(permissionLedger);
  await fw.close();
});

test("createPneumaFramework can disable permission ledger", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-create-permission-ledger-disabled-"));
  const fw = createPneumaFramework({
    templateDir: FIXTURE,
    workspace: ws,
    authorization: { permissionLedger: false },
  });
  expect(fw.permissionLedger).toBeUndefined();
  await fw.close();
});
```

- [ ] **Step 2: Run tests and verify they fail**

Run:

```bash
bun test packages/core/test/create.test.ts
```

Expected: fail because `permissionLedger` is not part of `PneumaFrameworkOptions` or `PneumaFramework`.

- [ ] **Step 3: Add ToolContext field**

Modify `packages/core/src/tools/types.ts`:

```ts
import type { PermissionLedgerStore } from "../permission-ledger.js";

export interface ToolContext {
  orchestrator: LifecycleOrchestrator;
  backend?: AgentBackend;
  authorizationKernel?: AuthorizationKernel;
  approvalTokens?: ApprovalTokenStore;
  permissionLedger?: PermissionLedgerStore;
  principal?: Principal;
  appId?: string;
  workspaceId?: string;
}
```

- [ ] **Step 4: Add minimal lifecycle ledger setter**

Modify `packages/core/src/lifecycle.ts` imports:

```ts
import type { PermissionLedgerStore } from "./permission-ledger.js";
```

Add the minimal config field and setter. Task 3 will add event recording and live prompt APIs.

```ts
private permissionLedgerConfig?: {
  readonly ledger: PermissionLedgerStore;
  readonly appId: string;
  readonly workspaceId: string;
  readonly getRequestedPrincipal?: () => Principal;
};

setPermissionLedger(config: {
  readonly ledger?: PermissionLedgerStore;
  readonly appId: string;
  readonly workspaceId: string;
  readonly getRequestedPrincipal?: () => Principal;
}): void {
  this.permissionLedgerConfig = config.ledger
    ? {
        ledger: config.ledger,
        appId: config.appId,
        workspaceId: config.workspaceId,
        getRequestedPrincipal: config.getRequestedPrincipal,
      }
    : undefined;
}
```

- [ ] **Step 5: Wire ledger in framework constructor**

Modify `packages/core/src/create.ts`:

```ts
import {
  FilePermissionLedgerStore,
  type PermissionLedgerStore,
} from "./permission-ledger.js";

export interface PneumaFrameworkOptions extends OrchestratorOptions {
  // existing fields...
  authorization?: {
    enabled?: boolean;
    kernel?: AuthorizationKernel;
    approvalTokens?: ApprovalTokenStore;
    permissionLedger?: PermissionLedgerStore | false;
    principal?: Principal;
    appId?: string;
    workspaceId?: string;
  };
}

export interface PneumaFramework {
  // existing fields...
  permissionLedger?: PermissionLedgerStore;
}

const permissionLedger = authorizationEnabled
  ? opts.authorization?.permissionLedger === false
    ? undefined
    : opts.authorization?.permissionLedger ?? new FilePermissionLedgerStore(opts.workspace)
  : undefined;

orchestrator.setPermissionLedger?.({
  ledger: permissionLedger,
  appId: opts.authorization?.appId ?? orchestrator.manifest.name,
  workspaceId: opts.authorization?.workspaceId ?? opts.workspace,
  getRequestedPrincipal: () => opts.authorization?.principal ?? defaultToolPrincipal(),
});

const toolRegistry = buildToolRegistry({
  orchestrator,
  backend: opts.backend,
  authorizationKernel,
  approvalTokens,
  permissionLedger,
  principal: opts.authorization?.principal ?? defaultToolPrincipal(),
  appId: opts.authorization?.appId ?? orchestrator.manifest.name,
  workspaceId: opts.authorization?.workspaceId ?? opts.workspace,
});
```

- [ ] **Step 6: Run focused constructor tests**

Run:

```bash
bun test packages/core/test/create.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

Commit this with Task 3 if `setPermissionLedger` is introduced there:

```bash
git add packages/core/src/create.ts packages/core/src/tools/types.ts packages/core/src/lifecycle.ts packages/core/test/create.test.ts
git commit -m "Install permission ledger in framework constructor"
```

## Task 3: Lifecycle Request, Response, And Completion Events

**Files:**
- Modify: `packages/core/src/lifecycle.ts`
- Test: `packages/core/test/tools/definition-apply.test.ts`

- [ ] **Step 1: Write failing lifecycle tests for definition.apply ledger events**

Add a test to `packages/core/test/tools/definition-apply.test.ts` near existing approval tests:

```ts
import { InMemoryPermissionLedgerStore } from "../../src/permission-ledger.js";

test("definition.apply approval records durable permission request, response, and completion", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-ledger-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE, workspace: ws });
  const permissionLedger = new InMemoryPermissionLedgerStore();
  orch.setPermissionLedger({
    ledger: permissionLedger,
    appId: "fixture-min",
    workspaceId: ws,
    getRequestedPrincipal: () => ({
      kind: "build_agent",
      id: "opencode",
      acting_for: { kind: "builder", id: "builder:default" },
    }),
  });
  const prompts: Array<{ prompt: { id: string } }> = [];
  orch.setPermissionPromptPushHook((env) => prompts.push(env));

  const pending = orch.runDefinitionApply({
    kind: "add_table",
    table_id: "tasks",
    columns: [{ name: "title", type: { kind: "text" }, nullable: false }],
  }, { requireApproval: true });

  for (let i = 0; i < 50; i += 1) {
    if (prompts.length > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(prompts).toHaveLength(1);
  expect(permissionLedger.getRequest(prompts[0]!.prompt.id, {
    livePromptIds: orch.liveFrameworkPermissionPromptIds(),
  })).toMatchObject({ status: "pending", live: true });

  expect(orch.handleFrameworkPermissionResponse(prompts[0]!.prompt.id, "allow")).toBe(true);
  const result = await pending;
  expect(result.status).toBe("applied");
  expect(permissionLedger.getRequest(prompts[0]!.prompt.id)).toMatchObject({
    status: "completed",
    live: false,
    decision: "allow",
  });
});
```

- [ ] **Step 2: Write failing lifecycle tests for denied and fail-closed paths**

Add:

```ts
test("definition.apply denial records response without completion", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-ledger-deny-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE, workspace: ws });
  const permissionLedger = new InMemoryPermissionLedgerStore();
  orch.setPermissionLedger({ ledger: permissionLedger, appId: "fixture-min", workspaceId: ws });
  const prompts: Array<{ prompt: { id: string } }> = [];
  orch.setPermissionPromptPushHook((env) => prompts.push(env));

  const pending = orch.runDefinitionApply({
    kind: "add_table",
    table_id: "tasks",
    columns: [{ name: "title", type: { kind: "text" }, nullable: false }],
  }, { requireApproval: true });

  for (let i = 0; i < 50; i += 1) {
    if (prompts.length > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(orch.handleFrameworkPermissionResponse(prompts[0]!.prompt.id, "deny")).toBe(true);
  const result = await pending;
  expect(result.status).toBe("denied");
  expect(permissionLedger.getRequest(prompts[0]!.prompt.id)).toMatchObject({
    status: "denied",
    decision: "deny",
  });
});

test("definition.apply fails closed when required approval request cannot be recorded", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-def-apply-ledger-fail-closed-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE, workspace: ws });
  orch.setPermissionLedger({
    ledger: {
      append() { throw new Error("ledger unavailable"); },
      list() { return []; },
      listRequests() { return []; },
      getRequest() { return undefined; },
    },
    appId: "fixture-min",
    workspaceId: ws,
  });
  const prompts: Array<unknown> = [];
  orch.setPermissionPromptPushHook((env) => prompts.push(env));

  await expect(orch.runDefinitionApply({
    kind: "add_table",
    table_id: "tasks",
    columns: [{ name: "title", type: { kind: "text" }, nullable: false }],
  }, { requireApproval: true })).rejects.toThrow(/ledger unavailable/);
  expect(prompts).toHaveLength(0);
});
```

- [ ] **Step 3: Run tests and verify they fail**

Run:

```bash
bun test packages/core/test/tools/definition-apply.test.ts
```

Expected: fail because lifecycle has no ledger setter or event recording.

- [ ] **Step 4: Add lifecycle ledger configuration and live prompt APIs**

Modify `packages/core/src/lifecycle.ts` imports:

```ts
import type {
  PermissionLedgerDecision,
  PermissionLedgerEvent,
  PermissionLedgerStore,
} from "./permission-ledger.js";
import { permissionLedgerEventId } from "./permission-ledger.js";
```

Add fields and methods to `LifecycleOrchestrator`:

```ts
private readonly liveFrameworkPrompts = new Map<string, FrameworkPromptEnvelope>();

liveFrameworkPermissionPromptIds(): ReadonlySet<string> {
  return new Set(this.liveFrameworkPrompts.keys());
}

liveFrameworkPermissionPromptEnvelopes(): readonly FrameworkPromptEnvelope[] {
  return [...this.liveFrameworkPrompts.values()];
}
```

- [ ] **Step 5: Add lifecycle ledger helpers**

Add private helpers:

```ts
interface PermissionLedgerBaseDraft {
  readonly schema_version: 1;
  readonly event_id: string;
  readonly at_ms: number;
  readonly prompt_id: string;
  readonly session_id?: string;
  readonly app_id: string;
  readonly workspace_id: string;
  readonly tool: string;
  readonly capability?: Capability;
  readonly target?: AuthorizationTarget;
  readonly target_fingerprint?: string;
}

private async appendRequiredPermissionLedgerEvent(event: PermissionLedgerEvent): Promise<void> {
  if (!this.permissionLedgerConfig) return;
  await Promise.resolve(this.permissionLedgerConfig.ledger.append(event));
}

private appendBestEffortPermissionLedgerEvent(event: PermissionLedgerEvent): void {
  try {
    const result = this.permissionLedgerConfig?.ledger.append(event);
    if (result && typeof (result as Promise<void>).catch === "function") {
      void (result as Promise<void>).catch(() => {});
    }
  } catch {
    // Response routing must not crash after the Builder has acted.
  }
}

private permissionLedgerBase(input: {
  readonly prompt_id: string;
  readonly tool: string;
  readonly capability?: Capability;
  readonly target?: AuthorizationTarget;
  readonly target_fingerprint?: string;
}): PermissionLedgerBaseDraft | undefined {
  const cfg = this.permissionLedgerConfig;
  if (!cfg) return undefined;
  return {
    schema_version: 1,
    event_id: permissionLedgerEventId(),
    at_ms: Date.now(),
    prompt_id: input.prompt_id,
    session_id: this.sessionId,
    app_id: cfg.appId,
    workspace_id: cfg.workspaceId,
    tool: input.tool,
    capability: input.capability,
    target: input.target,
    target_fingerprint: input.target_fingerprint ?? input.target?.fingerprint,
  };
}
```

- [ ] **Step 6: Record request before broadcasting prompts**

In `awaitDefinitionApplyApproval(...)`, before `permissionPromptPushHook(...)`:

```ts
const promptEnvelope: FrameworkPromptEnvelope = {
  dir: "a2v",
  kind: "permission-prompt",
  prompt: {
    id: promptId,
    tool: "definition.apply",
    detail: {
      change_id: changeId,
      operation_id: operationIdForDefinitionChange(change),
      change,
      impact: diff,
      restart_required: restartRequiredForDefinitionChange(change),
    },
  },
};
const base = this.permissionLedgerBase({
  prompt_id: promptId,
  tool: "definition.apply",
  capability: "definition:apply",
  target: { kind: "definition", id: operationIdForDefinitionChange(change), fingerprint: `definition.apply:${changeId}` },
});
if (base) {
  await this.appendRequiredPermissionLedgerEvent({
    ...base,
    event_type: "permission_requested",
    requested_principal: this.permissionLedgerConfig?.getRequestedPrincipal?.(),
    detail: promptEnvelope.prompt.detail,
  });
}
this.liveFrameworkPrompts.set(promptId, promptEnvelope);
this.permissionPromptPushHook(promptEnvelope);
```

Apply the same pattern in `awaitDefinitionRollbackPrepareApproval(...)` using:

```ts
tool: "definition.rollback.validate"
capability: "definition:rollback:execute"
target: { kind: "rollback_target", id: `definition.rollback:${targetHistoryVersion}`, fingerprint: `definition.rollback:${targetHistoryVersion}` }
```

Keep deploy prompt ledger best-effort or untouched in this task.

- [ ] **Step 7: Record responses and clear live prompts**

In `handleFrameworkPermissionResponse(...)`, before resolving:

```ts
this.recordFrameworkPermissionResponse(id, decision);
```

Add:

```ts
private recordFrameworkPermissionResponse(id: string, decision: PermissionLedgerDecision): void {
  const env = this.liveFrameworkPrompts.get(id);
  if (!env) return;
  const base = this.permissionLedgerBase({ prompt_id: id, tool: env.prompt.tool });
  if (base) {
    this.appendBestEffortPermissionLedgerEvent({
      ...base,
      event_type: "permission_responded",
      decision,
      decided_by: { kind: "builder", id: "builder:default" },
    });
  }
  this.liveFrameworkPrompts.delete(id);
}
```

- [ ] **Step 8: Record completion/failure after lifecycle mutation**

In successful `runDefinitionApply(...)` after the applied result is known and before return:

```ts
this.recordPermissionExecutionTerminal(approvalPromptId, "permission_execution_completed");
```

In failure helper paths after `approvalPromptId` is known:

```ts
this.recordPermissionExecutionTerminal(approvalPromptId, "permission_execution_failed", message);
```

Add:

```ts
private recordPermissionExecutionTerminal(
  promptId: string | undefined,
  eventType: "permission_execution_completed" | "permission_execution_failed",
  message?: string,
): void {
  if (!promptId) return;
  const base = this.permissionLedgerBase({ prompt_id: promptId, tool: promptId.includes("rollback") ? "definition.rollback.execute" : "definition.apply" });
  if (!base) return;
  this.appendBestEffortPermissionLedgerEvent(eventType === "permission_execution_completed"
    ? { ...base, event_type: "permission_execution_completed" }
    : { ...base, event_type: "permission_execution_failed", message: message ?? "Framework permission execution failed" });
}
```

Keep this helper narrow; call it only from code paths that already have the relevant approval prompt id.

- [ ] **Step 9: Run lifecycle tests**

Run:

```bash
bun test packages/core/test/tools/definition-apply.test.ts
```

Expected: pass.

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/lifecycle.ts packages/core/test/tools/definition-apply.test.ts packages/core/src/create.ts packages/core/src/tools/types.ts packages/core/test/create.test.ts
git commit -m "Record framework approval lifecycle in permission ledger"
```

## Task 4: Tool Authorization Token Metadata Events

**Files:**
- Modify: `packages/core/src/tools/action.ts`
- Test: `packages/core/test/tools/definition-authorization.test.ts`

- [ ] **Step 1: Write failing token metadata test**

Add to `packages/core/test/tools/definition-authorization.test.ts`:

```ts
import { InMemoryPermissionLedgerStore } from "../../src/permission-ledger.js";

test("definition.apply require_approval records token metadata without raw token id", async () => {
  const approvalTokens = new InMemoryApprovalTokenStore();
  const permissionLedger = new InMemoryPermissionLedgerStore();
  const orchestrator = createFakeOrchestrator();
  const registry = buildToolRegistry({
    orchestrator: orchestrator as unknown as LifecycleOrchestrator,
    authorizationKernel: new AuthorizationKernel(),
    approvalTokens,
    permissionLedger,
    appId: "app:test",
    workspaceId: "workspace:test",
  });

  const result = await registry.call("definition.apply", {
    kind: "add_table",
    table_id: "tasks",
    columns: [],
    require_approval: true,
  });

  expect(result.ok).toBe(true);
  const promptId = orchestrator.definitionApplyCalls[0]!.authorizationPromptId;
  const events = permissionLedger.list().filter((event) => event.prompt_id === promptId);
  const tokenEvent = events.find((event) => event.event_type === "approval_token_issued");
  expect(tokenEvent).toBeDefined();
  const rawState = JSON.stringify(events);
  const approvalTokenId = (result.state as { authorization: { approval_token_id: string } }).authorization.approval_token_id;
  expect(rawState).not.toContain(approvalTokenId);
  expect(events.some((event) => event.event_type === "permission_execution_authorized")).toBe(true);
});
```

The existing `createFakeOrchestrator()` uses `prompt_id: "prompt-1"` for `runDefinitionApply(...)`, so the test filters ledger events by `"prompt-1"`.

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
bun test packages/core/test/tools/definition-authorization.test.ts
```

Expected: fail because tool authorization does not append token metadata events.

- [ ] **Step 3: Append token and authorization events in `authorizeFrameworkExecutionAfterApproval`**

Modify `packages/core/src/tools/action.ts` imports:

```ts
import {
  approvalTokenLedgerHash,
  permissionLedgerEventId,
} from "../permission-ledger.js";
```

After token mint:

```ts
const appId = ctx.appId ?? DEFAULT_TOOL_APP_ID;
const workspaceId = ctx.workspaceId ?? ctx.orchestrator.workspace;
const base = {
  schema_version: 1 as const,
  event_id: permissionLedgerEventId(),
  at_ms: Date.now(),
  prompt_id: input.prompt_id,
  app_id: appId,
  workspace_id: workspaceId,
  tool: input.tool,
  capability: input.capability,
  target: input.target,
  target_fingerprint: targetFingerprint(input.target),
};
ctx.permissionLedger?.append({
  ...base,
  event_type: "approval_token_issued",
  approval_token_hash: approvalTokenLedgerHash({ token_id: token.token_id, app_id: appId, workspace_id: workspaceId }),
  approved_capability: input.capability,
  approved_by: token.approved_by,
  issued_at_ms: token.issued_at_ms,
  expires_at_ms: token.expires_at_ms,
  single_use: true,
});
```

After authorization:

```ts
ctx.permissionLedger?.append(decision.decision === "allow"
  ? {
      ...base,
      event_id: permissionLedgerEventId(),
      at_ms: Date.now(),
      event_type: "permission_execution_authorized",
      authorization_reason_code: decision.reason_code,
    }
  : {
      ...base,
      event_id: permissionLedgerEventId(),
      at_ms: Date.now(),
      event_type: "permission_execution_denied",
      authorization_reason_code: decision.reason_code,
      message: decision.message,
    });
```

- [ ] **Step 4: Run authorization tests**

Run:

```bash
bun test packages/core/test/tools/definition-authorization.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/tools/action.ts packages/core/test/tools/definition-authorization.test.ts
git commit -m "Record approval token authorization metadata"
```

## Task 5: Viewer Reconnect Permission Ledger Seed

**Files:**
- Modify: `packages/core/src/wire-protocol/types.ts`
- Create: `packages/core/src/wire-protocol/permission-ledger-state.ts`
- Modify: `packages/core/src/create.ts`
- Test: `packages/core/test/wire-protocol/permission-ledger-seed.test.ts`

- [ ] **Step 1: Write failing seed unit tests**

Create `packages/core/test/wire-protocol/permission-ledger-seed.test.ts`:

```ts
import { test, expect } from "bun:test";
import { InMemoryPermissionLedgerStore } from "../../src/permission-ledger.js";
import { seedPermissionLedgerState } from "../../src/wire-protocol/permission-ledger-state.js";

test("seedPermissionLedgerState emits pending/recent ledger state and live prompts", () => {
  const ledger = new InMemoryPermissionLedgerStore();
  ledger.append({
    schema_version: 1,
    event_id: "evt-request",
    event_type: "permission_requested",
    at_ms: 100,
    prompt_id: "prompt-live",
    app_id: "app:test",
    workspace_id: "workspace:test",
    tool: "definition.apply",
    detail: { change_id: "def-1" },
  });
  ledger.append({
    schema_version: 1,
    event_id: "evt-old-request",
    event_type: "permission_requested",
    at_ms: 50,
    prompt_id: "prompt-old",
    app_id: "app:test",
    workspace_id: "workspace:test",
    tool: "definition.apply",
    detail: { change_id: "def-old" },
  });
  ledger.append({
    schema_version: 1,
    event_id: "evt-old-response",
    event_type: "permission_responded",
    at_ms: 60,
    prompt_id: "prompt-old",
    app_id: "app:test",
    workspace_id: "workspace:test",
    tool: "definition.apply",
    decision: "deny",
    decided_by: { kind: "builder", id: "builder:default" },
  });

  const envelopes = seedPermissionLedgerState({
    ledger,
    livePromptIds: new Set(["prompt-live"]),
    livePromptEnvelopes: [{
      dir: "a2v",
      kind: "permission-prompt",
      prompt: { id: "prompt-live", tool: "definition.apply", detail: { change_id: "def-1" } },
    }],
  });

  expect(envelopes[0]).toMatchObject({
    kind: "framework-event",
    event: {
      type: "permission-ledger-state",
      state: {
        pending: [{ prompt_id: "prompt-live", live: true }],
        recent: [{ prompt_id: "prompt-old", status: "denied" }],
      },
    },
  });
  expect(envelopes[1]).toMatchObject({ kind: "permission-prompt", prompt: { id: "prompt-live" } });
});
```

- [ ] **Step 2: Run test and verify it fails**

Run:

```bash
bun test packages/core/test/wire-protocol/permission-ledger-seed.test.ts
```

Expected: fail because seed helper and wire event type do not exist.

- [ ] **Step 3: Extend wire protocol type**

Modify `packages/core/src/wire-protocol/types.ts`:

```ts
import type { PermissionLedgerRequestRecord } from "../permission-ledger.js";

export interface PermissionLedgerState {
  readonly pending: readonly PermissionLedgerRequestRecord[];
  readonly recent: readonly PermissionLedgerRequestRecord[];
}

export type FrameworkEvent =
  | { type: "definition-apply-state"; state: DefinitionApplyState }
  | { type: "definition-rollback-prepare-state"; state: DefinitionRollbackPrepareState }
  | { type: "definition-rollback-execute-state"; state: DefinitionRollbackExecuteState }
  | { type: "permission-ledger-state"; state: PermissionLedgerState };
```

- [ ] **Step 4: Add seed helper**

Create `packages/core/src/wire-protocol/permission-ledger-state.ts`:

```ts
import type { PermissionLedgerStore } from "../permission-ledger.js";
import type { WireEnvelope } from "./types.js";

export function seedPermissionLedgerState(input: {
  readonly ledger?: PermissionLedgerStore;
  readonly livePromptIds: ReadonlySet<string>;
  readonly livePromptEnvelopes: readonly Extract<WireEnvelope, { kind: "permission-prompt" }>[];
  readonly recentLimit?: number;
}): WireEnvelope[] {
  if (!input.ledger) return [];
  const records = input.ledger.listRequests({
    livePromptIds: input.livePromptIds,
    limit: input.recentLimit ?? 20,
  });
  if (records instanceof Promise) {
    throw new Error("seedPermissionLedgerState requires a synchronous PermissionLedgerStore");
  }
  const pending = records.filter((record) => record.status === "pending");
  const recent = records.filter((record) => record.status !== "pending");
  return [
    {
      dir: "a2v",
      kind: "framework-event",
      event: {
        type: "permission-ledger-state",
        state: { pending, recent },
      },
    },
    ...input.livePromptEnvelopes,
  ];
}
```

- [ ] **Step 5: Wire seed into `createPneumaFramework`**

Modify `packages/core/src/create.ts`:

```ts
import { seedPermissionLedgerState } from "./wire-protocol/permission-ledger-state.js";

onViewerOpen: (_session, send) => {
  for (const env of seedInitialState(orchestrator.workspace)) send(env);
  for (const env of seedPermissionLedgerState({
    ledger: permissionLedger,
    livePromptIds: orchestrator.liveFrameworkPermissionPromptIds(),
    livePromptEnvelopes: orchestrator.liveFrameworkPermissionPromptEnvelopes(),
  })) send(env);
},
```

- [ ] **Step 6: Run seed tests**

Run:

```bash
bun test packages/core/test/wire-protocol/permission-ledger-seed.test.ts packages/core/test/wire-protocol/seed-on-open.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/wire-protocol/types.ts packages/core/src/wire-protocol/permission-ledger-state.ts packages/core/src/create.ts packages/core/test/wire-protocol/permission-ledger-seed.test.ts
git commit -m "Seed permission ledger state on viewer reconnect"
```

## Task 6: Rollback Approval Ledger Coverage

**Files:**
- Modify: `packages/core/test/tools/definition-apply.test.ts`
- Modify: `packages/core/src/lifecycle.ts` if rollback terminal events need adjustment.

- [ ] **Step 1: Write failing rollback ledger test**

Add near rollback approval tests:

```ts
test("definition.rollback.execute approval records durable permission ledger chain", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-def-rollback-ledger-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE, workspace: ws });
  const permissionLedger = new InMemoryPermissionLedgerStore();
  orch.setPermissionLedger({ ledger: permissionLedger, appId: "fixture-min", workspaceId: ws });
  const prompts: Array<{ prompt: { id: string } }> = [];
  orch.setPermissionPromptPushHook((env) => prompts.push(env));

  const pending = orch.runDefinitionRollbackPrepare(
    { target_history_version: 0 },
    { requireApproval: true },
  );
  for (let i = 0; i < 50; i += 1) {
    if (prompts.length > 0) break;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  expect(prompts[0]!.prompt.id).toContain("definition-rollback");
  expect(permissionLedger.getRequest(prompts[0]!.prompt.id, {
    livePromptIds: orch.liveFrameworkPermissionPromptIds(),
  })).toMatchObject({ status: "pending", live: true });
  expect(orch.handleFrameworkPermissionResponse(prompts[0]!.prompt.id, "allow")).toBe(true);
  const result = await pending;
  expect(result.status).toBe("ready_to_execute");
  expect(permissionLedger.getRequest(prompts[0]!.prompt.id)).toMatchObject({
    status: "completed",
    decision: "allow",
  });
});
```

- [ ] **Step 2: Run rollback test**

Run:

```bash
bun test packages/core/test/tools/definition-apply.test.ts
```

Expected: fail if rollback completion is not recorded, then pass after Step 3.

- [ ] **Step 3: Adjust rollback terminal ledger events**

In `runDefinitionRollbackPrepare(...)`, record completed when status becomes `ready_to_execute`, denied when denied, and failed in the rollback prepare failure helper.

Use the same helper introduced in Task 3:

```ts
this.recordPermissionExecutionTerminal(approvalPromptId, "permission_execution_completed");
```

For denied paths, no execution terminal event is required; `permission_responded(decision=deny)` is enough.

- [ ] **Step 4: Run rollback tests**

Run:

```bash
bun test packages/core/test/tools/definition-apply.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/lifecycle.ts packages/core/test/tools/definition-apply.test.ts
git commit -m "Cover rollback approval permission ledger"
```

## Task 7: Documentation Hygiene And Full Verification

**Files:**
- Modify: `docs/architecture/OPEN-QUESTIONS.md`

- [ ] **Step 1: Update open question wording**

Modify the Governance Gaps table row:

```md
| Approval prompt now has a durable M2.2 ledger, but product Permission Center is still demo-level | Enterprise viewer should eventually expose searchable pending/resolved approvals, filters, and admin workflows. |
```

Keep the full Permission Center as open; remove the obsolete claim that approval is purely live-only.

- [ ] **Step 2: Run focused tests**

Run:

```bash
bun test packages/core/test/permission-ledger.test.ts packages/core/test/tools/definition-authorization.test.ts packages/core/test/tools/definition-apply.test.ts packages/core/test/wire-protocol/permission-ledger-seed.test.ts packages/core/test/create.test.ts
```

Expected: all pass.

- [ ] **Step 3: Run typecheck**

Run:

```bash
bun run typecheck
```

Expected: pass.

- [ ] **Step 4: Run full tests**

Run:

```bash
bun test
```

Expected: all pass.

- [ ] **Step 5: Check whitespace**

Run:

```bash
git diff --check
```

Expected: no output.

- [ ] **Step 6: Commit docs and verification cleanup**

```bash
git add docs/architecture/OPEN-QUESTIONS.md
git commit -m "Update permission ledger governance gap"
```

## Plan Self-Review

- Spec coverage:
  - Durable store: Task 1.
  - Default install and injected/disabled store: Task 2.
  - Request/response/completion events: Task 3.
  - Token metadata without raw token persistence: Task 4.
  - Viewer reconnect seed and live prompt replay: Task 5.
  - Rollback approval coverage: Task 6.
  - Open question cleanup and verification: Task 7.
- Scope check:
  - No full Permission Center UI.
  - No durable token replay.
  - No multi-approver workflow.
  - No generic event-sourcing framework.
- Test-first check:
  - Every implementation task starts with failing tests and exact commands.
  - Full verification includes focused tests, typecheck, full suite, and diff check.
