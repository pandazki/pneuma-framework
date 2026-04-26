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
import { PneumaViewer, PermissionPrompt, usePneumaState } from "../src/index.js";

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
    function StatusProbe() {
      const { pendingPrompt } = usePneumaState();
      return React.createElement("pre", { "data-testid": "prompt-state" }, pendingPrompt?.id ?? "none");
    }
    const { container } = render(
      React.createElement(PneumaViewer, { wsUrl: "ws://x/b", sid: "b" },
        React.createElement(StatusProbe),
        React.createElement(PermissionPrompt),
      ),
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    await act(async () => {
      FakeWS.instance!.inject({
        dir: "a2v", kind: "permission-prompt",
        prompt: { id: "req-1", tool: "deploy", detail: {} },
      });
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(container.querySelector('[data-testid="prompt-state"]')!.textContent).toBe("req-1");
    const allowBtn = container.querySelector('[data-permission="allow"]') as HTMLButtonElement | null;
    expect(allowBtn).not.toBeNull();
    await act(async () => { fireEvent.click(allowBtn!); });
    const resp = sent.find((e) => (e as { kind?: string }).kind === "permission-response") as
      | { response: { id: string; decision: string } } | undefined;
    expect(resp?.response.id).toBe("req-1");
    expect(resp?.response.decision).toBe("allow");
    expect(container.querySelector(".pneuma-prompt")).toBeNull();
    expect(container.querySelector('[data-testid="prompt-state"]')!.textContent).toBe("none");
  } finally {
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = prevWS;
  }
});

test("PermissionPrompt renders definition.apply impact disclosure", async () => {
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
      React.createElement(PneumaViewer, { wsUrl: "ws://x/c", sid: "c" },
        React.createElement(PermissionPrompt),
      ),
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    await act(async () => {
      FakeWS.instance!.inject({
        dir: "a2v",
        kind: "permission-prompt",
        prompt: {
          id: "def-1",
          tool: "definition.apply",
          detail: {
            operation_id: "add_table_column",
            change: {
              kind: "add_table_column",
              table_id: "bookmarks",
              column_name: "tags",
              cell_type: { kind: "primitive", of: "Text" },
              nullable: true,
            },
            impact: {
              changed_tables: [{
                table_id: "bookmarks",
                before_columns: ["url"],
                after_columns: ["url", "tags"],
                added_columns: ["tags"],
              }],
              added_tables: [],
            },
            restart_required: true,
          },
        },
      });
      await new Promise((r) => setTimeout(r, 20));
    });

    const text = container.textContent ?? "";
    expect(text).toContain("App definition change request");
    expect(text).toContain("bookmarks.tags");
    expect(text).toContain("Type: Text");
    expect(text).toContain("Impact: bookmarks +tags");
    expect(text).toContain("Restart required: yes");

    const denyBtn = container.querySelector('[data-permission="deny"]') as HTMLButtonElement | null;
    expect(denyBtn).not.toBeNull();
    await act(async () => { fireEvent.click(denyBtn!); });
    const resp = sent.find((e) => (e as { kind?: string }).kind === "permission-response") as
      | { response: { id: string; decision: string } } | undefined;
    expect(resp?.response.id).toBe("def-1");
    expect(resp?.response.decision).toBe("deny");
  } finally {
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = prevWS;
  }
});

test("PermissionPrompt renders definition.apply add_operation impact disclosure", async () => {
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
      React.createElement(PneumaViewer, { wsUrl: "ws://x/operation", sid: "operation" },
        React.createElement(PermissionPrompt),
      ),
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    await act(async () => {
      FakeWS.instance!.inject({
        dir: "a2v",
        kind: "permission-prompt",
        prompt: {
          id: "def-operation-1",
          tool: "definition.apply",
          detail: {
            operation_id: "add_operation",
            change: {
              kind: "add_operation",
              operation_id: "list_bookmark_urls",
              name: "List bookmark URLs",
              handler: {
                kind: "query",
                on: "bookmarks",
                fields: ["url"],
                pagination: { kind: "offset", size: 20 },
              },
            },
            impact: {
              changed_tables: [],
              added_tables: [],
              added_operations: [{
                operation_id: "list_bookmark_urls",
                action: "read",
                handler_kind: "query",
              }],
            },
            restart_required: true,
          },
        },
      });
      await new Promise((r) => setTimeout(r, 20));
    });

    const text = container.textContent ?? "";
    expect(text).toContain("App definition change request");
    expect(text).toContain("Add operation: list_bookmark_urls");
    expect(text).toContain("Name: List bookmark URLs");
    expect(text).toContain("Handler: query on bookmarks");
    expect(text).toContain("Fields: url");
    expect(text).toContain("Output: row-list(bookmarks)");
    expect(text).toContain("Capability surface: agent/client Operation");
    expect(text).toContain("Impact: new operation list_bookmark_urls (read, query)");
    expect(text).toContain("Restart required: yes");

    const allowBtn = container.querySelector('[data-permission="allow"]') as HTMLButtonElement | null;
    expect(allowBtn).not.toBeNull();
    await act(async () => { fireEvent.click(allowBtn!); });
    const resp = sent.find((e) => (e as { kind?: string }).kind === "permission-response") as
      | { response: { id: string; decision: string } } | undefined;
    expect(resp?.response.id).toBe("def-operation-1");
    expect(resp?.response.decision).toBe("allow");
  } finally {
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = prevWS;
  }
});

test("PermissionPrompt renders definition.apply add_view impact disclosure", async () => {
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
      React.createElement(PneumaViewer, { wsUrl: "ws://x/view", sid: "view" },
        React.createElement(PermissionPrompt),
      ),
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    await act(async () => {
      FakeWS.instance!.inject({
        dir: "a2v",
        kind: "permission-prompt",
        prompt: {
          id: "def-view-1",
          tool: "definition.apply",
          detail: {
            operation_id: "add_view",
            change: {
              kind: "add_view",
              view_id: "review_queue",
              name: "Review Queue",
              view_kind: "table",
              source: { kind: "operation", operation_id: "list_bookmark_urls" },
              presentation: { columns: ["title", "url"] },
            },
            impact: {
              changed_tables: [],
              added_tables: [],
              added_operations: [],
              added_views: [{
                view_id: "review_queue",
                kind: "table",
                source_operation_id: "list_bookmark_urls",
              }],
            },
            restart_required: true,
          },
        },
      });
      await new Promise((r) => setTimeout(r, 20));
    });

    const text = container.textContent ?? "";
    expect(text).toContain("App definition change request");
    expect(text).toContain("Add view: review_queue");
    expect(text).toContain("Name: Review Queue");
    expect(text).toContain("Kind: table");
    expect(text).toContain("Source operation: list_bookmark_urls");
    expect(text).toContain("Presentation columns: title, url");
    expect(text).toContain("Capability surface: end-user View");
    expect(text).toContain("Impact: new view review_queue (table, source: list_bookmark_urls)");
    expect(text).toContain("Restart required: yes");

    const allowBtn = container.querySelector('[data-permission="allow"]') as HTMLButtonElement | null;
    expect(allowBtn).not.toBeNull();
    await act(async () => { fireEvent.click(allowBtn!); });
    const resp = sent.find((e) => (e as { kind?: string }).kind === "permission-response") as
      | { response: { id: string; decision: string } } | undefined;
    expect(resp?.response.id).toBe("def-view-1");
    expect(resp?.response.decision).toBe("allow");
  } finally {
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = prevWS;
  }
});

test("PermissionPrompt renders definition.rollback.validate impact disclosure", async () => {
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
      React.createElement(PneumaViewer, { wsUrl: "ws://x/d", sid: "d" },
        React.createElement(PermissionPrompt),
      ),
    );
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    await act(async () => {
      FakeWS.instance!.inject({
        dir: "a2v",
        kind: "permission-prompt",
        prompt: {
          id: "rollback-1",
          tool: "definition.rollback.validate",
          detail: {
            target_history_version: 0,
            current_history_version: 2,
            destructive: true,
            requires_approval: true,
            impact: {
              removed_tables: [{
                table_id: "notes",
                row_count: 1,
                columns: ["title"],
              }],
              removed_columns: [{
                table_id: "bookmarks",
                column_name: "tags",
                affected_row_count: 1,
              }],
              restored_tables: [],
              restored_columns: [],
              removed_operations: [{
                operation_id: "list_bookmark_urls",
                handler_kind: "query",
              }],
              removed_views: [{
                view_id: "review_queue",
                source_operation_id: "list_bookmark_urls",
              }],
              restored_operations: [{
                operation_id: "legacy_bookmark_search",
                handler_kind: "query",
              }],
              restored_views: [{
                view_id: "legacy_search",
                source_operation_id: "legacy_bookmark_search",
              }],
            },
            warnings: [
              "target_history_version=0 means the baseline before any definition overlay history entry",
            ],
          },
        },
      });
      await new Promise((r) => setTimeout(r, 20));
    });

    const text = container.textContent ?? "";
    expect(text).toContain("Definition rollback impact");
    expect(text).toContain("Target history version: 0");
    expect(text).toContain("Current history version: 2");
    expect(text).toContain("Remove table: notes (1 row affected; columns: title)");
    expect(text).toContain("Remove column: bookmarks.tags (1 row with values)");
    expect(text).toContain("Remove operation: list_bookmark_urls (query)");
    expect(text).toContain("Remove view: review_queue (source: list_bookmark_urls)");
    expect(text).toContain("Restore operation: legacy_bookmark_search (query)");
    expect(text).toContain("Restore view: legacy_search (source: legacy_bookmark_search)");
    expect(text).toContain("Destructive: yes");
    expect(text).toContain("Approval required: yes");
    expect(text).toContain("Warning: target_history_version=0");

    const allowBtn = container.querySelector('[data-permission="allow"]') as HTMLButtonElement | null;
    expect(allowBtn).not.toBeNull();
    await act(async () => { fireEvent.click(allowBtn!); });
    const resp = sent.find((e) => (e as { kind?: string }).kind === "permission-response") as
      | { response: { id: string; decision: string } } | undefined;
    expect(resp?.response.id).toBe("rollback-1");
    expect(resp?.response.decision).toBe("allow");
  } finally {
    (globalThis as unknown as { WebSocket: typeof WebSocket }).WebSocket = prevWS;
  }
});
