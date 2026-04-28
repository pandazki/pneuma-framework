import { afterEach, expect, test } from "bun:test";

type DemoEnvelope = {
  readonly kind?: string;
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

const children: Bun.Subprocess[] = [];

afterEach(async () => {
  await Promise.all(children.map(async (child) => {
    child.kill();
    await child.exited.catch(() => undefined);
  }));
  children.length = 0;
});

test("capability lifecycle demo reaches policy-gated reviewer access", async () => {
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
    created_by_kind: "agent",
  })]);
  expect(afterPolicy.policy_access).toMatchObject({
    reviewer_can_read_view: true,
    guest_can_read_view: false,
    reviewer_can_invoke_operation: true,
    guest_can_invoke_operation: false,
  });

  ws.close();
});

async function readServerUrl(proc: Bun.Subprocess): Promise<string> {
  const reader = proc.stdout.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const chunk = await Promise.race([
      reader.read(),
      delay(100).then(() => undefined),
    ]);
    if (!chunk) continue;
    if (chunk.done) break;
    buffer += decoder.decode(chunk.value, { stream: true });
    const match = /p5-viewer-approval-e2e (http:\/\/127\.0\.0\.1:\d+)/.exec(buffer);
    if (match) return match[1]!;
  }
  throw new Error(`server did not print a URL. stdout so far:\n${buffer}`);
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
