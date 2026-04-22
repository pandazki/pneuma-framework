import { GlobalRegistrator } from "@happy-dom/global-registrator";

// Happy-dom's GlobalRegistrator replaces not just DOM constructors but also
// many core runtime globals (fetch, Request/Response/Headers, Event,
// EventTarget, URL, AbortController, timers, etc.) with stubs from happy-dom.
// In Bun those stubs break anything that relies on Bun's native networking —
// in particular `new WebSocket(url)` used by sibling test files. Since
// `bun test` runs all files in the same process, leaking those globals fails
// unrelated tests. We therefore overlay only the DOM surface React needs
// (window/document/HTMLElement/etc.) and restore the native runtime globals.
const PRESERVED_GLOBALS = [
  "fetch", "Request", "Response", "Headers", "WebSocket", "FormData",
  "Blob", "File", "URL", "AbortController", "AbortSignal",
  "Event", "EventTarget", "queueMicrotask",
  "setTimeout", "setInterval", "clearTimeout", "clearInterval",
] as const;
const nativeGlobals: Record<string, unknown> = {};
for (const k of PRESERVED_GLOBALS) {
  nativeGlobals[k] = (globalThis as unknown as Record<string, unknown>)[k];
}
if (!("window" in globalThis)) GlobalRegistrator.register();
for (const k of PRESERVED_GLOBALS) {
  (globalThis as unknown as Record<string, unknown>)[k] = nativeGlobals[k];
}

// Imports below must come AFTER DOM registration because
// @testing-library/react registers beforeAll hooks at module evaluation time.
import { test, expect } from "bun:test";
import { render, act } from "@testing-library/react";
import * as React from "react";
import { PneumaViewer, useWireConnection } from "../src/index.js";

test("PneumaViewer opens a WebSocket to the given wsUrl and exposes status=open", async () => {
  const opened: string[] = [];
  class FakeWS extends EventTarget {
    static instances: FakeWS[] = [];
    readyState = 0;
    url: string;
    constructor(url: string) {
      super();
      this.url = url;
      opened.push(url);
      FakeWS.instances.push(this);
      queueMicrotask(() => {
        this.readyState = 1;
        this.dispatchEvent(new Event("open"));
      });
    }
    send(_data: string): void { /* noop */ }
    close(): void {
      this.readyState = 3;
      this.dispatchEvent(new Event("close"));
    }
  }
  const previousWebSocket = globalThis.WebSocket;
  (globalThis as unknown as { WebSocket: typeof FakeWS }).WebSocket = FakeWS;
  try {
    function Status() {
      const conn = useWireConnection();
      return React.createElement("div", { "data-testid": "status" }, conn.status);
    }
    const { findByTestId } = render(
      React.createElement(
        PneumaViewer,
        { wsUrl: "ws://127.0.0.1:1/ws/viewer/abc", sid: "abc" },
        React.createElement(Status),
      ),
    );
    const el = await findByTestId("status");
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(opened.at(0)).toBe("ws://127.0.0.1:1/ws/viewer/abc");
    expect(el.textContent).toBe("open");
  } finally {
    // Restore Bun's native WebSocket so sibling test files that speak real
    // WebSockets against Bun.serve aren't poisoned by our FakeWS stub.
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = previousWebSocket;
  }
});
