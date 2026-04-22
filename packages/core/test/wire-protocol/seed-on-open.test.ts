import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createPneumaFramework } from "../../src/index.js";
import type { WireEnvelope } from "../../src/index.js";

const FIXTURE = join(import.meta.dir, "../fixtures/templates/fixture-min");

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
