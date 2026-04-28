import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createPneumaFramework,
  InMemoryPermissionLedgerStore,
} from "../../src/index.js";
import type { PermissionLedgerStore, WireEnvelope } from "../../src/index.js";

const FIXTURE = join(import.meta.dir, "../fixtures/templates/fixture-min");

async function openViewer(input: {
  readonly url: string;
  readonly sessionId: string;
}): Promise<{ client: WebSocket; received: WireEnvelope[]; closed: Promise<void> }> {
  const client = new WebSocket(
    `${input.url.replace(/^http/, "ws")}/ws/viewer/${input.sessionId}`,
  );
  const received: WireEnvelope[] = [];
  const closed = new Promise<void>((resolve) => {
    client.addEventListener("close", () => resolve(), { once: true });
  });
  client.addEventListener("message", (e) => {
    received.push(JSON.parse(typeof e.data === "string" ? e.data : "") as WireEnvelope);
  });
  await new Promise<void>((resolve) => client.addEventListener("open", () => resolve(), { once: true }));
  return { client, received, closed };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test("a viewer connecting after doc.md exists receives an initial a2v state envelope", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-seed-"));
  writeFileSync(join(ws, "doc.md"), "# preexisting");
  const fw = createPneumaFramework({
    templateDir: FIXTURE, workspace: ws, wire: { enabled: true },
  });
  const client = new WebSocket(
    `${fw.wireServer!.url.replace(/^http/, "ws")}/ws/viewer/${fw.sessionId}`,
  );
  const received: WireEnvelope[] = [];
  client.addEventListener("message", (e) => {
    received.push(JSON.parse(typeof e.data === "string" ? e.data : "") as WireEnvelope);
  });
  await new Promise<void>((r) => client.addEventListener("open", () => r(), { once: true }));
  await new Promise((r) => setTimeout(r, 100));

  const state = received.find((e) => e.kind === "state");
  expect(state?.kind === "state" && state.state.path).toBe("doc.md");
  expect(state?.kind === "state" && state.state.content).toBe("# preexisting");

  client.close();
  await fw.close();
});

test("viewer open seeds file state before permission ledger state", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-seed-ledger-"));
  writeFileSync(join(ws, "doc.md"), "# preexisting");
  const permissionLedger = new InMemoryPermissionLedgerStore();
  permissionLedger.append({
    schema_version: 1,
    event_id: "evt-request",
    event_type: "permission_requested",
    at_ms: 100,
    prompt_id: "prompt-stale",
    app_id: "app:test",
    workspace_id: "workspace:test",
    tool: "definition.apply",
    detail: { change_id: "def-stale" },
  });
  const fw = createPneumaFramework({
    templateDir: FIXTURE,
    workspace: ws,
    wire: { enabled: true },
    authorization: { permissionLedger },
  });
  const { client, received } = await openViewer({
    url: fw.wireServer!.url,
    sessionId: fw.sessionId!,
  });
  await delay(100);

  expect(received[0]).toMatchObject({
    kind: "state",
    state: { path: "doc.md", content: "# preexisting" },
  });
  expect(received[1]).toMatchObject({
    kind: "framework-event",
    event: {
      type: "permission-ledger-state",
      state: { pending: [{ prompt_id: "prompt-stale", live: false }] },
    },
  });

  client.close();
  await fw.close();
});

test("viewer open keeps file seed connected when permission ledger seed rejects async", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-seed-async-ledger-"));
  writeFileSync(join(ws, "doc.md"), "# preexisting");
  const permissionLedger: PermissionLedgerStore = {
    append: () => undefined,
    list: () => [],
    listRequests: async () => {
      throw new Error("boom");
    },
    getRequest: () => undefined,
  };
  const fw = createPneumaFramework({
    templateDir: FIXTURE,
    workspace: ws,
    wire: { enabled: true },
    authorization: { permissionLedger },
  });
  const { client, received, closed } = await openViewer({
    url: fw.wireServer!.url,
    sessionId: fw.sessionId!,
  });
  const closedImmediately = await Promise.race([
    closed.then(() => true),
    delay(100).then(() => false),
  ]);

  expect(received[0]).toMatchObject({
    kind: "state",
    state: { path: "doc.md", content: "# preexisting" },
  });
  expect(received.find((env) => env.kind === "framework-event")).toBeUndefined();
  expect(closedImmediately).toBe(false);

  client.close();
  await fw.close();
});

test("viewer open keeps file seed connected when permission ledger seed throws sync", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-seed-throwing-ledger-"));
  writeFileSync(join(ws, "doc.md"), "# preexisting");
  const permissionLedger: PermissionLedgerStore = {
    append: () => undefined,
    list: () => [],
    listRequests: () => {
      throw new Error("boom");
    },
    getRequest: () => undefined,
  };
  const fw = createPneumaFramework({
    templateDir: FIXTURE,
    workspace: ws,
    wire: { enabled: true },
    authorization: { permissionLedger },
  });
  const { client, received, closed } = await openViewer({
    url: fw.wireServer!.url,
    sessionId: fw.sessionId!,
  });
  const closedImmediately = await Promise.race([
    closed.then(() => true),
    delay(100).then(() => false),
  ]);

  expect(received[0]).toMatchObject({
    kind: "state",
    state: { path: "doc.md", content: "# preexisting" },
  });
  expect(received.find((env) => env.kind === "framework-event")).toBeUndefined();
  expect(closedImmediately).toBe(false);

  client.close();
  await fw.close();
});
