import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPneumaFramework } from "../../src/index.js";
import type { WireEnvelope } from "../../src/index.js";

const FIXTURE = join(import.meta.dir, "../fixtures/templates/fixture-min");

test("writing a .md file in the workspace pushes a2v state to the viewer", async () => {
  const ws = mkdtempSync(join(tmpdir(), "pneuma-fsp-"));
  const fw = createPneumaFramework({
    templateDir: FIXTURE,
    workspace: ws,
    wire: { enabled: true },
  });
  const client = new WebSocket(
    `${fw.wireServer!.url.replace(/^http/, "ws")}/ws/viewer/${fw.sessionId}`,
  );
  await new Promise<void>((r) => client.addEventListener("open", () => r(), { once: true }));

  const received: WireEnvelope[] = [];
  client.addEventListener("message", (e) => {
    received.push(JSON.parse(typeof e.data === "string" ? e.data : "") as WireEnvelope);
  });

  writeFileSync(join(ws, "doc.md"), "# hello");
  await new Promise((r) => setTimeout(r, 250));
  const state = received.find((e) => e.kind === "state");
  expect(state?.kind === "state" && state.state.path).toMatch(/doc\.md$/);
  expect(state?.kind === "state" && state.state.content).toBe("# hello");

  client.close();
  await fw.close();
});
