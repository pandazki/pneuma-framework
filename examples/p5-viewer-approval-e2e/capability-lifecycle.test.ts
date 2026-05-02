import { afterEach, expect, test } from "bun:test";
import { startP5ViewerApprovalServer } from "./server";

type DemoEnvelope = {
  readonly kind?: string;
  readonly event?: {
    readonly type?: string;
    readonly state?: {
      readonly pending: Array<Record<string, unknown>>;
      readonly recent: Array<Record<string, unknown>>;
      readonly permission_center?: {
        readonly summary?: Record<string, unknown>;
        readonly records?: Array<Record<string, unknown>>;
      };
    };
  };
  readonly prompt?: {
    readonly id?: string;
    readonly tool?: string;
    readonly detail?: Record<string, unknown>;
  };
  readonly state?: {
    readonly path?: string;
    readonly content?: string;
  };
};

const servers: Array<ReturnType<typeof startP5ViewerApprovalServer>> = [];
const E2E_TEST_TIMEOUT_MS = 60_000;

afterEach(() => {
  for (const server of servers) {
    server.stop(true);
  }
  servers.length = 0;
});

test("capability lifecycle demo reaches policy-gated reviewer access", async () => {
  const server = startP5ViewerApprovalServer(0);
  servers.push(server);

  const baseUrl = serverUrl(server);
  const ws = await openSocket(`${baseUrl.replace(/^http/, "ws")}/ws?scenario=capability-lifecycle`);
  const messages = collectMessages(ws);

  const baseline = await waitForState(messages, "capability-lifecycle/status");
  expect(baseline.stage).toBe("baseline");

  ws.send(JSON.stringify({ kind: "action", action: { kind: "click", target: "capability.request-add" } }));
  const addPrompt = await waitForPrompt(messages, "pneuma:capability-lifecycle:add-operation");
  expect(addPrompt.tool).toBe("definition.apply");
  ws.send(JSON.stringify({
    kind: "permission-response",
    response: { id: "pneuma:capability-lifecycle:add-operation", decision: "allow" },
  }));
  const afterAdd = await waitForState(messages, "capability-lifecycle/after-add");
  expect(afterAdd.stage).toBe("operation_added");

  ws.send(JSON.stringify({ kind: "action", action: { kind: "click", target: "capability.request-view" } }));
  const viewPrompt = await waitForPrompt(messages, "pneuma:capability-lifecycle:add-view");
  expect(viewPrompt.tool).toBe("definition.apply");
  ws.send(JSON.stringify({
    kind: "permission-response",
    response: { id: "pneuma:capability-lifecycle:add-view", decision: "allow" },
  }));
  const afterView = await waitForState(messages, "capability-lifecycle/after-view");
  expect(afterView.stage).toBe("view_added");
  expect(afterView.policy_access).toMatchObject({
    reviewer_can_read_view: false,
    guest_can_read_view: false,
  });

  ws.send(JSON.stringify({ kind: "action", action: { kind: "click", target: "capability.request-policy" } }));
  const policyPrompt = await waitForPrompt(messages, "pneuma:capability-lifecycle:add-policy");
  expect(policyPrompt.tool).toBe("definition.apply");
  expect(policyPrompt.detail?.impact).toMatchObject({
    added_policy_rules: [{
      rule_id: "reviewers-can-read-review-queue",
      resource: { kind: "view", id: "review_queue" },
    }],
  });
  ws.send(JSON.stringify({
    kind: "permission-response",
    response: { id: "pneuma:capability-lifecycle:add-policy", decision: "allow" },
  }));

  const afterPolicy = await waitForState(messages, "capability-lifecycle/after-policy");
  expect(afterPolicy.stage).toBe("policy_added");
  expect(afterPolicy.definition_policy_rules).toEqual([expect.objectContaining({
    row_id: expect.stringMatching(/^ppr-/),
    rule_id: "reviewers-can-read-review-queue",
    actions: ["read"],
    resource_kind: "view",
    resource_id: "review_queue",
    definition_version: 1,
    created_by_kind: "framework",
  })]);
  expect(afterPolicy.policy_access).toMatchObject({
    reviewer_can_read_view: true,
    guest_can_read_view: false,
    reviewer_can_invoke_operation: true,
    guest_can_invoke_operation: false,
  });

  ws.close();
}, E2E_TEST_TIMEOUT_MS);

test("capability lifecycle demo exposes governance evidence over wire", async () => {
  const server = startP5ViewerApprovalServer(0);
  servers.push(server);

  const baseUrl = serverUrl(server);
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
  expect(pending.eventCenter?.summary).toMatchObject({
    pending: 1,
    completed: 0,
  });
  const pendingCenterRecord = pending.eventCenter?.records?.find((record) =>
    record.prompt_id === "pneuma:capability-lifecycle:add-operation",
  );
  expect(pendingCenterRecord).toMatchObject({
    live: true,
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
  expect(completed.eventCenter?.summary).toMatchObject({
    pending: 0,
    completed: 1,
  });
  const completedCenterRecord = completed.eventCenter?.records?.find((record) =>
    record.prompt_id === "pneuma:capability-lifecycle:add-operation",
  );
  expect(completedCenterRecord).toMatchObject({
    approval_token_single_use: true,
    execution_principal: { kind: "framework_system", id: "framework" },
  });
  expect(JSON.stringify(completed)).not.toContain("approval-secret");

  ws.close();
}, E2E_TEST_TIMEOUT_MS);

function serverUrl(server: ReturnType<typeof startP5ViewerApprovalServer>): string {
  return `http://127.0.0.1:${server.port}`;
}

function openSocket(url: string): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const timer = setTimeout(() => reject(new Error(`timed out opening ${url}`)), 5000);
    ws.addEventListener("open", () => {
      clearTimeout(timer);
      resolve(ws);
    }, { once: true });
    ws.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error(`failed to open ${url}`));
    }, { once: true });
  });
}

function collectMessages(ws: WebSocket): DemoEnvelope[] {
  const messages: DemoEnvelope[] = [];
  ws.addEventListener("message", (event) => {
    messages.push(JSON.parse(String(event.data)) as DemoEnvelope);
  });
  return messages;
}

async function waitForPrompt(messages: DemoEnvelope[], id: string): Promise<NonNullable<DemoEnvelope["prompt"]>> {
  const env = await waitFor(messages, (message) => message.prompt?.id === id);
  return env.prompt!;
}

async function waitForState(messages: DemoEnvelope[], path: string): Promise<Record<string, unknown>> {
  const env = await waitFor(messages, (message) => message.state?.path === path);
  return JSON.parse(env.state!.content ?? "{}") as Record<string, unknown>;
}

async function waitForPermissionLedgerState(
  messages: DemoEnvelope[],
  predicate: (state: {
    pending: Array<Record<string, unknown>>;
    recent: Array<Record<string, unknown>>;
    permission_center?: {
      summary?: Record<string, unknown>;
      records?: Array<Record<string, unknown>>;
    };
  }) => boolean,
) {
  const env = await waitFor(messages, (message) =>
    message.kind === "framework-event" &&
    message.event?.type === "permission-ledger-state" &&
    message.event.state !== undefined &&
    predicate(message.event.state),
  );
  return {
    ...env.event!.state!,
    eventCenter: env.event!.state!.permission_center,
  };
}

async function waitFor(
  messages: DemoEnvelope[],
  predicate: (message: DemoEnvelope) => boolean,
): Promise<DemoEnvelope> {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const found = messages.find(predicate);
    if (found) return found;
    await delay(25);
  }
  throw new Error(`timed out waiting for demo message. Received:\n${JSON.stringify(messages, null, 2)}`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
