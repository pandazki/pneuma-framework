import { test, expect } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LifecycleOrchestrator } from "../../src/lifecycle.js";
import { createSessionRegistry } from "../../src/wire-protocol/session-registry.js";
import { createWireServer } from "../../src/wire-protocol/server.js";
import type { WireEnvelope } from "../../src/wire-protocol/types.js";

const FIXTURE = join(import.meta.dir, "../fixtures/templates/fixture-min");

test("wire server accepts /ws/viewer/:sid upgrades and routes envelopes", async () => {
  const registry = createSessionRegistry();
  const ws = mkdtempSync(join(tmpdir(), "pneuma-wire-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE, workspace: ws });
  const sess = registry.createSession("sid-a", { orchestrator: orch });

  const received: WireEnvelope[] = [];
  const server = createWireServer(registry, {
    port: 0,
    onViewerEnvelope: (_s, env) => { received.push(env); },
  });

  const client = new WebSocket(`${server.url.replace(/^http/, "ws")}/ws/viewer/sid-a`);
  await new Promise<void>((r) => client.addEventListener("open", () => r(), { once: true }));
  expect(sess.viewerSockets.size).toBe(1);

  client.send(JSON.stringify({ dir: "v2a", kind: "focus", focus: { file: "x.md" } } satisfies WireEnvelope));
  await new Promise((r) => setTimeout(r, 50));
  expect(received.at(-1)?.kind).toBe("focus");

  client.close();
  await new Promise((r) => setTimeout(r, 50));
  expect(sess.viewerSockets.size).toBe(0);
  await server.close();
});

test("wire server rejects upgrade for unknown sid with 404", async () => {
  const registry = createSessionRegistry();
  const server = createWireServer(registry, { port: 0, onViewerEnvelope: () => {} });

  const res = await fetch(`${server.url}/ws/viewer/nope`, {
    headers: { Upgrade: "websocket", Connection: "Upgrade" },
  });
  expect(res.status).toBe(404);
  await server.close();
});

test("wire server broadcast() reaches every connected viewer for a session", async () => {
  const registry = createSessionRegistry();
  const ws = mkdtempSync(join(tmpdir(), "pneuma-wire-bcast-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE, workspace: ws });
  registry.createSession("sid-b", { orchestrator: orch });
  const server = createWireServer(registry, { port: 0, onViewerEnvelope: () => {} });

  const mkClient = async () => {
    const c = new WebSocket(`${server.url.replace(/^http/, "ws")}/ws/viewer/sid-b`);
    await new Promise<void>((r) => c.addEventListener("open", () => r(), { once: true }));
    return c;
  };
  const [c1, c2] = await Promise.all([mkClient(), mkClient()]);
  const received: string[] = [];
  c1.addEventListener("message", (e) => received.push(`c1:${e.data}`));
  c2.addEventListener("message", (e) => received.push(`c2:${e.data}`));

  const env: WireEnvelope = { dir: "a2v", kind: "viewer-request", req: { kind: "toast", message: "hi" } };
  server.broadcast("sid-b", env);
  await new Promise((r) => setTimeout(r, 50));
  expect(received.filter((m) => m.includes("toast")).length).toBe(2);

  c1.close();
  c2.close();
  await server.close();
});

test("wire server drops malformed v2a envelopes (missing required fields)", async () => {
  const registry = createSessionRegistry();
  const ws = mkdtempSync(join(tmpdir(), "pneuma-wire-bad-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE, workspace: ws });
  registry.createSession("sid-c", { orchestrator: orch });

  const received: WireEnvelope[] = [];
  const server = createWireServer(registry, {
    port: 0,
    onViewerEnvelope: (_s, env) => { received.push(env); },
  });

  const client = new WebSocket(`${server.url.replace(/^http/, "ws")}/ws/viewer/sid-c`);
  await new Promise<void>((r) => client.addEventListener("open", () => r(), { once: true }));

  // All invalid: unknown kind, missing focus, unknown action kind, missing decision.
  client.send(JSON.stringify({ dir: "v2a", kind: "nope" }));
  client.send(JSON.stringify({ dir: "v2a", kind: "focus" })); // missing focus field
  client.send(JSON.stringify({ dir: "v2a", kind: "action", action: { kind: "unknown" } }));
  client.send(JSON.stringify({ dir: "v2a", kind: "permission-response", response: { id: "x" } })); // no decision
  // Wrong direction entirely.
  client.send(JSON.stringify({ dir: "a2v", kind: "text", turnId: "t", partId: "p", delta: "d" }));
  // Valid one, for sanity.
  client.send(JSON.stringify({ dir: "v2a", kind: "focus", focus: { file: "a.md" } }));
  await new Promise((r) => setTimeout(r, 50));

  expect(received.length).toBe(1);
  expect(received[0]?.kind).toBe("focus");

  client.close();
  await server.close();
});

test("removeSession closes attached viewer sockets and clears the set", async () => {
  const registry = createSessionRegistry();
  const ws = mkdtempSync(join(tmpdir(), "pneuma-wire-rm-"));
  const orch = new LifecycleOrchestrator({ templateDir: FIXTURE, workspace: ws });
  const sess = registry.createSession("sid-rm", { orchestrator: orch });

  const server = createWireServer(registry, { port: 0, onViewerEnvelope: () => {} });
  const client = new WebSocket(`${server.url.replace(/^http/, "ws")}/ws/viewer/sid-rm`);
  await new Promise<void>((r) => client.addEventListener("open", () => r(), { once: true }));
  expect(sess.viewerSockets.size).toBe(1);

  const closed = new Promise<void>((resolve) => {
    client.addEventListener("close", () => resolve(), { once: true });
  });
  registry.removeSession("sid-rm");
  await closed;
  // viewerSockets cleared during remove (server's close-handler runs against
  // the now-deleted registry entry, so it's the registry itself that clears).
  expect(sess.viewerSockets.size).toBe(0);
  expect(registry.getSession("sid-rm")).toBeUndefined();

  await server.close();
});
