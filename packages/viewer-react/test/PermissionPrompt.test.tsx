import { GlobalRegistrator } from "@happy-dom/global-registrator";
const PRESERVED_GLOBALS = [
  "fetch", "Request", "Response", "Headers", "WebSocket", "FormData",
  "Blob", "File", "URL", "AbortController", "AbortSignal",
  "Event", "EventTarget", "queueMicrotask",
  "setTimeout", "setInterval", "clearTimeout", "clearInterval",
] as const;
const nativeGlobals: Record<string, unknown> = {};
for (const k of PRESERVED_GLOBALS) nativeGlobals[k] = (globalThis as unknown as Record<string, unknown>)[k];
if (!("window" in globalThis)) GlobalRegistrator.register();
for (const k of PRESERVED_GLOBALS) (globalThis as unknown as Record<string, unknown>)[k] = nativeGlobals[k];

import { test, expect } from "bun:test";
import { render, act, fireEvent } from "@testing-library/react";
import * as React from "react";
import { PneumaViewer, PermissionPrompt } from "../src/index.js";

test("PermissionPrompt renders nothing when pendingPrompt is unset", async () => {
  const prevWS = globalThis.WebSocket;
  class FakeWS extends EventTarget {
    readyState = 1;
    constructor(_url: string) { super(); queueMicrotask(() => this.dispatchEvent(new Event("open"))); }
    send(_: string): void {}
    close(): void { this.dispatchEvent(new Event("close")); }
  }
  (globalThis as unknown as { WebSocket: typeof FakeWS }).WebSocket = FakeWS;
  try {
    const { container } = render(
      React.createElement(PneumaViewer, { wsUrl: "ws://x/a", sid: "a" },
        React.createElement(PermissionPrompt),
      ),
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(container.querySelector(".pneuma-prompt")).toBeNull();
  } finally {
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = prevWS;
  }
});

test("PermissionPrompt renders tool name + Allow/Deny; Allow sends permission-response", async () => {
  const sent: unknown[] = [];
  const prevWS = globalThis.WebSocket;
  class FakeWS extends EventTarget {
    static instance: FakeWS | undefined;
    readyState = 1;
    constructor(_url: string) { super(); FakeWS.instance = this; queueMicrotask(() => this.dispatchEvent(new Event("open"))); }
    send(d: string): void { sent.push(JSON.parse(d)); }
    close(): void { this.dispatchEvent(new Event("close")); }
    inject(env: unknown): void {
      const ev = new Event("message") as Event & { data: string };
      ev.data = JSON.stringify(env);
      this.dispatchEvent(ev);
    }
  }
  (globalThis as unknown as { WebSocket: typeof FakeWS }).WebSocket = FakeWS;
  try {
    const { container } = render(
      React.createElement(PneumaViewer, { wsUrl: "ws://x/b", sid: "b" },
        React.createElement(PermissionPrompt),
      ),
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    FakeWS.instance!.inject({
      dir: "a2v", kind: "permission-prompt",
      prompt: { id: "req-1", tool: "deploy", detail: {} },
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const allowBtn = container.querySelector('[data-permission="allow"]') as HTMLButtonElement | null;
    expect(allowBtn).not.toBeNull();
    await act(async () => { fireEvent.click(allowBtn!); });
    const resp = sent.find((e) => (e as { kind?: string }).kind === "permission-response") as
      | { response: { id: string; decision: string } } | undefined;
    expect(resp?.response.id).toBe("req-1");
    expect(resp?.response.decision).toBe("allow");
    expect(container.querySelector(".pneuma-prompt")).toBeNull();
  } finally {
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = prevWS;
  }
});
