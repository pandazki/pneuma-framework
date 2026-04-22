import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPneumaFramework, FakeAgentBackend } from "../src/index.js";
import type { WireEnvelope } from "../src/index.js";

const FIXTURE = join(import.meta.dir, "fixtures/templates/fixture-min");

test("E2E wire flow: seed + focus + user-message → backend; text event → viewer", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-e2e-wire-"));
  writeFileSync(join(ws, "doc.md"), "# Hello");

  const backend = new FakeAgentBackend();
  const fw = createPneumaFramework({
    templateDir: FIXTURE, workspace: ws, backend,
    wire: { enabled: true, autoAcceptPermissions: true },
  });
  const sess = await backend.launch({ cwd: ws });
  fw.annotateBackendSession(sess.sessionId);

  const client = new WebSocket(
    `${fw.wireServer!.url.replace(/^http/, "ws")}/ws/viewer/${fw.sessionId}`,
  );
  const received: WireEnvelope[] = [];
  client.addEventListener("message", (e) => {
    received.push(JSON.parse(typeof e.data === "string" ? e.data : "") as WireEnvelope);
  });
  await new Promise<void>((r) => client.addEventListener("open", () => r(), { once: true }));
  await new Promise((r) => setTimeout(r, 80));

  // 1. Seed envelope for existing doc.md.
  const seeded = received.find((e) => e.kind === "state");
  expect(seeded?.kind === "state" && seeded.state.content).toBe("# Hello");

  // 2. Viewer sends focus + user-message; backend sees prefixed prompt.
  client.send(JSON.stringify({
    dir: "v2a", kind: "focus",
    focus: { file: "doc.md", element: { kind: "heading", index: 0, text: "Hello", level: 1 } },
  } satisfies WireEnvelope));
  client.send(JSON.stringify({
    dir: "v2a", kind: "action",
    action: { kind: "user-message", text: "rename this" },
  } satisfies WireEnvelope));
  await new Promise((r) => setTimeout(r, 80));
  const msg = backend.userMessages.at(-1);
  expect(msg?.text).toContain("rename this");
  expect(msg?.text).toMatch(/\[Context: file "doc\.md"\]/);
  expect(msg?.text).toMatch(/\[User selected: heading.*"Hello"\]/);

  // 3. Backend emits cumulative text events → viewer receives deltas.
  backend.simulate({
    type: "text", sessionId: sess.sessionId,
    payload: { part: { id: "p1", type: "text", text: "Got", time: { start: 1 } }, messageID: "m1" },
  });
  backend.simulate({
    type: "text", sessionId: sess.sessionId,
    payload: { part: { id: "p1", type: "text", text: "Got it", time: { start: 1 } }, messageID: "m1" },
  });
  await new Promise((r) => setTimeout(r, 80));
  const deltas = received.filter((e) => e.kind === "text").map((e) => e.kind === "text" && e.delta);
  expect(deltas).toEqual(["Got", " it"]);

  // 4. Editing doc.md fires a new state envelope.
  writeFileSync(join(ws, "doc.md"), "# Renamed");
  await new Promise((r) => setTimeout(r, 200));
  const states = received.filter((e) => e.kind === "state");
  expect(states.at(-1)?.kind === "state" && states.at(-1)!.state.content).toBe("# Renamed");

  client.close();
  await fw.close();
});
