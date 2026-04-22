import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPneumaFramework, FakeAgentBackend } from "../src/index.js";
import type { WireEnvelope } from "../src/index.js";

const FIXTURE = join(import.meta.dir, "fixtures/templates/fixture-min");

test("wire: { enabled } starts a wire server and exposes its URL", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-cw-"));
  const fw = createPneumaFramework({
    templateDir: FIXTURE,
    workspace: ws,
    wire: { enabled: true },
  });
  expect(fw.wireServer).toBeDefined();
  expect(fw.wireServer?.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(fw.sessionId).toMatch(/^[a-f0-9-]{8,}$/);
  await fw.close();
});

test("no wire option means no wire server", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-cw-none-"));
  const fw = createPneumaFramework({ templateDir: FIXTURE, workspace: ws });
  expect(fw.wireServer).toBeUndefined();
  expect(fw.sessionId).toBeUndefined();
  await fw.close();
});

test("end-to-end: viewer WS → focus+action → backend.sendUserMessage", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-cw-e2e-"));
  const backend = new FakeAgentBackend();
  const fw = createPneumaFramework({
    templateDir: FIXTURE,
    workspace: ws,
    backend,
    wire: { enabled: true, autoAcceptPermissions: true },
  });
  const sess = await backend.launch({ cwd: ws });
  fw.annotateBackendSession(sess.sessionId);

  const client = new WebSocket(
    `${fw.wireServer!.url.replace(/^http/, "ws")}/ws/viewer/${fw.sessionId}`,
  );
  await new Promise<void>((r) => client.addEventListener("open", () => r(), { once: true }));

  const focus: WireEnvelope = {
    dir: "v2a", kind: "focus",
    focus: { file: "doc.md", element: { kind: "heading", index: 0, text: "Hello", level: 1 } },
  };
  const action: WireEnvelope = {
    dir: "v2a", kind: "action",
    action: { kind: "user-message", text: "rewrite this" },
  };
  client.send(JSON.stringify(focus));
  client.send(JSON.stringify(action));
  await new Promise((r) => setTimeout(r, 80));

  const last = backend.userMessages.at(-1);
  expect(last?.text).toMatch(/\[Context: file "doc\.md"\]/);
  expect(last?.text).toContain("rewrite this");

  client.close();
  await fw.close();
});
