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
import { PneumaViewer, useFocus, useAction, usePneumaState, useWireConnection } from "../src/index.js";

test("useFocus sends a v2a focus envelope", async () => {
  const sent: unknown[] = [];
  const prevWS = globalThis.WebSocket;
  class FakeWS extends EventTarget {
    readyState = 1;
    constructor(_url: string) {
      super();
      queueMicrotask(() => this.dispatchEvent(new Event("open")));
    }
    send(data: string): void { sent.push(JSON.parse(data)); }
    close(): void { this.dispatchEvent(new Event("close")); }
  }
  (globalThis as unknown as { WebSocket: typeof FakeWS }).WebSocket = FakeWS;
  try {
    function Clicker() {
      const setFocus = useFocus();
      const { status } = useWireConnection();
      React.useEffect(() => {
        if (status !== "open") return;
        setFocus({ file: "doc.md", element: { kind: "heading", index: 0, text: "Hi" } });
      }, [status, setFocus]);
      return null;
    }
    render(
      React.createElement(
        PneumaViewer,
        { wsUrl: "ws://x/a", sid: "a" },
        React.createElement(Clicker),
      ),
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(sent.some((e) => (e as { kind?: string }).kind === "focus")).toBe(true);
  } finally {
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = prevWS;
  }
});

test("useAction sends user-message as v2a action", async () => {
  const sent: unknown[] = [];
  const prevWS = globalThis.WebSocket;
  class FakeWS extends EventTarget {
    readyState = 1;
    constructor(_url: string) {
      super();
      queueMicrotask(() => this.dispatchEvent(new Event("open")));
    }
    send(d: string): void { sent.push(JSON.parse(d)); }
    close(): void { this.dispatchEvent(new Event("close")); }
  }
  (globalThis as unknown as { WebSocket: typeof FakeWS }).WebSocket = FakeWS;
  try {
    function Sender() {
      const sendAction = useAction();
      const { status } = useWireConnection();
      React.useEffect(() => {
        if (status !== "open") return;
        sendAction({ kind: "user-message", text: "hello" });
      }, [status, sendAction]);
      return null;
    }
    render(
      React.createElement(
        PneumaViewer,
        { wsUrl: "ws://x/b", sid: "b" },
        React.createElement(Sender),
      ),
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    const action = sent.find((e) => (e as { kind?: string }).kind === "action") as
      | { action: { kind: string; text: string } }
      | undefined;
    expect(action?.action.text).toBe("hello");
  } finally {
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = prevWS;
  }
});

test("usePneumaState accumulates text deltas by turnId and exposes latest docs", async () => {
  const prevWS = globalThis.WebSocket;
  class FakeWS extends EventTarget {
    static instance: FakeWS | undefined;
    readyState = 1;
    constructor(_url: string) {
      super();
      FakeWS.instance = this;
      queueMicrotask(() => this.dispatchEvent(new Event("open")));
    }
    send(_: string): void { /* noop */ }
    close(): void { this.dispatchEvent(new Event("close")); }
    inject(env: unknown): void {
      // Use a plain Event + assigned `data` rather than MessageEvent: the
      // native EventTarget restored at setup time rejects happy-dom's
      // MessageEvent subclass. The viewer's handler only reads `e.data`.
      const ev = new Event("message") as Event & { data: string };
      ev.data = JSON.stringify(env);
      this.dispatchEvent(ev);
    }
  }
  (globalThis as unknown as { WebSocket: typeof FakeWS }).WebSocket = FakeWS;
  try {
    function Consumer() {
      const { turns, docs } = usePneumaState();
      return React.createElement("pre", {}, JSON.stringify({ turns, docs }));
    }
    const { container } = render(
      React.createElement(
        PneumaViewer,
        { wsUrl: "ws://x/c", sid: "c" },
        React.createElement(Consumer),
      ),
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    await act(async () => {
      FakeWS.instance!.inject({
        dir: "a2v", kind: "text", turnId: "t1", partId: "p1", delta: "Hello",
      });
      FakeWS.instance!.inject({
        dir: "a2v", kind: "text", turnId: "t1", partId: "p1", delta: " world",
      });
      FakeWS.instance!.inject({
        dir: "a2v", kind: "state",
        state: { path: "doc.md", content: "# hi", ts: 1 },
      });
      await new Promise((r) => setTimeout(r, 30));
    });
    const out = JSON.parse(container.querySelector("pre")!.textContent!);
    expect(out.turns.t1).toBe("Hello world");
    expect(out.docs["doc.md"]).toBe("# hi");
  } finally {
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = prevWS;
  }
});

test("useAction callback identity is stable across status transitions", async () => {
  const prevWS = globalThis.WebSocket;
  class FakeWS extends EventTarget {
    readyState = 1;
    constructor(_url: string) {
      super();
      queueMicrotask(() => this.dispatchEvent(new Event("open")));
    }
    send(_: string): void {}
    close(): void { this.dispatchEvent(new Event("close")); }
  }
  (globalThis as unknown as { WebSocket: typeof FakeWS }).WebSocket = FakeWS;
  try {
    // Fail-under: if useAction's identity churns on status changes, consumers
    // that gate off `status === "open"` will re-fire their send effect and
    // duplicate one-shot actions.
    const seen = new Set<unknown>();
    function Probe() {
      const sendAction = useAction();
      seen.add(sendAction);
      return null;
    }
    render(React.createElement(PneumaViewer, { wsUrl: "ws://x/stable", sid: "stable" }, React.createElement(Probe)));
    await act(async () => { await new Promise((r) => setTimeout(r, 40)); });
    // The Probe renders at least twice (connecting + open); identity must stay 1.
    expect(seen.size).toBe(1);
  } finally {
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = prevWS;
  }
});

test("usePneumaState exposes pendingPrompt when a permission-prompt arrives", async () => {
  const prevWS = globalThis.WebSocket;
  class FakeWS extends EventTarget {
    static instance: FakeWS | undefined;
    readyState = 1;
    constructor(_url: string) {
      super(); FakeWS.instance = this;
      queueMicrotask(() => this.dispatchEvent(new Event("open")));
    }
    send(_: string): void {}
    close(): void { this.dispatchEvent(new Event("close")); }
    inject(env: unknown): void {
      const ev = new Event("message") as Event & { data: string };
      ev.data = JSON.stringify(env);
      this.dispatchEvent(ev);
    }
  }
  (globalThis as unknown as { WebSocket: typeof FakeWS }).WebSocket = FakeWS;
  try {
    function Probe() {
      const { pendingPrompt } = usePneumaState();
      return React.createElement(
        "pre", {},
        pendingPrompt ? JSON.stringify(pendingPrompt) : "none",
      );
    }
    const { container } = render(
      React.createElement(PneumaViewer, { wsUrl: "ws://x/p", sid: "p" }, React.createElement(Probe)),
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    await act(async () => {
      FakeWS.instance!.inject({
        dir: "a2v", kind: "permission-prompt",
        prompt: { id: "req-7", tool: "deploy", detail: { target: "prod" } },
      });
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(container.querySelector("pre")!.textContent).toContain("req-7");
  } finally {
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = prevWS;
  }
});

test("usePneumaState accumulates framework lifecycle events", async () => {
  const prevWS = globalThis.WebSocket;
  class FakeWS extends EventTarget {
    static instance: FakeWS | undefined;
    readyState = 1;
    constructor(_url: string) {
      super(); FakeWS.instance = this;
      queueMicrotask(() => this.dispatchEvent(new Event("open")));
    }
    send(_: string): void {}
    close(): void { this.dispatchEvent(new Event("close")); }
    inject(env: unknown): void {
      const ev = new Event("message") as Event & { data: string };
      ev.data = JSON.stringify(env);
      this.dispatchEvent(ev);
    }
  }
  (globalThis as unknown as { WebSocket: typeof FakeWS }).WebSocket = FakeWS;
  try {
    function Probe() {
      const { frameworkEvents } = usePneumaState();
      return React.createElement("pre", {}, JSON.stringify(frameworkEvents));
    }
    const { container } = render(
      React.createElement(PneumaViewer, { wsUrl: "ws://x/fw", sid: "fw" }, React.createElement(Probe)),
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    await act(async () => {
      FakeWS.instance!.inject({
        dir: "a2v",
        kind: "framework-event",
        event: {
          type: "definition-apply-state",
          state: {
            change_id: "def-1",
            status: "pending",
            phase: "starting-after-definition-apply",
            startedAt: 1,
            updatedAt: 2,
            timeline: [{ phase: "starting-after-definition-apply", at: 2 }],
          },
        },
      });
      await new Promise((r) => setTimeout(r, 20));
    });
    const events = JSON.parse(container.querySelector("pre")!.textContent!);
    expect(events[0].type).toBe("definition-apply-state");
    expect(events[0].state.phase).toBe("starting-after-definition-apply");
  } finally {
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = prevWS;
  }
});

test("usePneumaState resets when sid changes", async () => {
  const prevWS = globalThis.WebSocket;
  class FakeWS extends EventTarget {
    static instances: FakeWS[] = [];
    readyState = 1;
    constructor(_url: string) {
      super();
      FakeWS.instances.push(this);
      queueMicrotask(() => this.dispatchEvent(new Event("open")));
    }
    send(_: string): void {}
    close(): void { this.dispatchEvent(new Event("close")); }
    inject(env: unknown): void {
      const ev = new Event("message") as Event & { data: string };
      ev.data = JSON.stringify(env);
      this.dispatchEvent(ev);
    }
  }
  (globalThis as unknown as { WebSocket: typeof FakeWS }).WebSocket = FakeWS;
  try {
    function Consumer() {
      const { turns } = usePneumaState();
      return React.createElement("pre", {}, JSON.stringify(turns));
    }
    function Harness({ sid, wsUrl }: { sid: string; wsUrl: string }) {
      return React.createElement(
        PneumaViewer, { wsUrl, sid },
        React.createElement(Consumer),
      );
    }
    const { container, rerender } = render(
      React.createElement(Harness, { sid: "s1", wsUrl: "ws://x/s1" }),
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const first = FakeWS.instances[0]!;
    await act(async () => {
      first.inject({ dir: "a2v", kind: "text", turnId: "t1", partId: "p", delta: "A" });
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(JSON.parse(container.querySelector("pre")!.textContent!)).toEqual({ t1: "A" });
    // Swap sid — usePneumaState must reset its turns map.
    rerender(React.createElement(Harness, { sid: "s2", wsUrl: "ws://x/s2" }));
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(JSON.parse(container.querySelector("pre")!.textContent!)).toEqual({});
  } finally {
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = prevWS;
  }
});
