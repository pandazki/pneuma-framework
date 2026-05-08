import { test, expect, describe } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { OpencodeBackend, type OpencodeSdk } from "../src/adapter.js";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileBuildThreadStore } from "@pneuma-framework/core";

function makeFakeSdk(overrides?: Partial<{ createCalls: string[] }>): {
  sdk: OpencodeSdk;
  createCalls: string[];
  promptCalls: Array<{ sessionId: string; text: string }>;
  subscribeCalls: number;
} {
  const createCalls: string[] = overrides?.createCalls ?? [];
  const promptCalls: Array<{ sessionId: string; text: string }> = [];
  let subscribeCalls = 0;
  const client = {
    session: {
      create: async (args: { body: { title?: string } }) => {
        createCalls.push(args.body.title ?? "");
        return { data: { id: `new-${createCalls.length}` } };
      },
      prompt: async (args: { path: { id: string }; body: { parts: Array<{ text?: string }> } }) => {
        promptCalls.push({
          sessionId: args.path.id,
          text: args.body.parts[0]?.text ?? "",
        });
        return {};
      },
    },
    event: {
      subscribe: async () => {
        subscribeCalls += 1;
        return { stream: (async function* () { /* no events */ })() };
      },
    },
  };
  const sdk: OpencodeSdk = {
    createOpencode: async () => ({ client: client as never }),
    createOpencodeClient: () => client as never,
  };
  return { sdk, createCalls, promptCalls, subscribeCalls };
}

test("launch with resumeSessionId skips session.create and reuses the id", async () => {
  const { sdk, createCalls } = makeFakeSdk();
  const backend = new OpencodeBackend({ baseUrl: "http://127.0.0.1:9999" }, sdk);
  const sess = await backend.launch({ cwd: "/tmp", resumeSessionId: "existing-123" });
  expect(sess.sessionId).toBe("existing-123");
  expect(sess.backendSessionId).toBe("existing-123");
  expect(createCalls).toEqual([]);
  await backend.close();
});

test("launch rejects (not a detached promise) if event.subscribe fails", async () => {
  const client = {
    session: {
      create: async () => ({ data: { id: "s1" } }),
      prompt: async () => ({}),
    },
    event: {
      subscribe: async () => { throw new Error("subscribe boom"); },
    },
  };
  const sdk: OpencodeSdk = {
    createOpencode: async () => ({ client: client as never }),
    createOpencodeClient: () => client as never,
  };
  const backend = new OpencodeBackend({ baseUrl: "http://127.0.0.1:9999" }, sdk);
  await expect(backend.launch({ cwd: "/tmp" })).rejects.toThrow(/subscribe boom/);
  await backend.close();
});

test("runTurn prompts opencode through one session per BuildThread", async () => {
  const workspace = mkdtempSync(join(tmpdir(), "pneuma-opencode-run-turn-"));
  try {
    const store = createFileBuildThreadStore({ workspace });
    const thread = await store.startThread({
      profile_id: "dev-board",
      app_id: "dev-board",
      builder_user_id: "builder",
    });
    const { sdk, createCalls, promptCalls } = makeFakeSdk();
    const backend = new OpencodeBackend({ baseUrl: "http://127.0.0.1:9999" }, sdk);

    const first = await backend.runTurn({
      cwd: workspace,
      thread_store: store,
      thread_id: thread.thread_id,
      new_user_message: "add a widget",
      system_prompt: "You are the build agent.",
    });
    const second = await backend.runTurn({
      cwd: workspace,
      thread_store: store,
      thread_id: thread.thread_id,
      new_user_message: "tighten the spacing",
      system_prompt: "You are the build agent.",
    });

    expect(first.backend_session_cached).toBe(false);
    expect(second.backend_session_cached).toBe(true);
    expect(first.session.sessionId).toBe(second.session.sessionId);
    expect(createCalls).toEqual([""]);
    expect(promptCalls).toHaveLength(2);
    expect(promptCalls[0]?.sessionId).toBe("new-1");
    expect(promptCalls[0]?.text).toContain("add a widget");
    expect(promptCalls[1]?.sessionId).toBe("new-1");
    expect(promptCalls[1]?.text).toContain("tighten the spacing");
    await backend.close();
  } finally {
    rmSync(workspace, { recursive: true, force: true });
  }
});

// ---- appUrl MCP bridge wiring ----

describe("launch with appUrl", () => {
  function makeCaptureSdk(): { sdk: OpencodeSdk; capturedOpts: unknown[] } {
    const capturedOpts: unknown[] = [];
    const client = {
      session: {
        create: async () => ({ data: { id: "s1" } }),
        prompt: async () => ({}),
      },
      event: {
        subscribe: async () => ({ stream: (async function* () { /* no events */ })() }),
      },
    };
    const sdk: OpencodeSdk = {
      createOpencode: async (opts) => {
        capturedOpts.push(opts);
        return { client: client as never };
      },
      createOpencodeClient: () => client as never,
    };
    return { sdk, capturedOpts };
  }

  test("when appUrl is set, createOpencode receives config.mcp.pneuma with bridge command", async () => {
    const { sdk, capturedOpts } = makeCaptureSdk();
    const backend = new OpencodeBackend({}, sdk);
    await backend.launch({ cwd: "/tmp", appUrl: "http://localhost:8765" });

    expect(capturedOpts).toHaveLength(1);
    const opts = capturedOpts[0] as { config: { mcp: { pneuma: { command: string[]; environment: Record<string, string> } } } };
    expect(opts.config.mcp.pneuma.command[1]).toBe("run");
    expect(opts.config.mcp.pneuma.command[2]).toMatch(/template-mcp-bridge\.ts$/);
    expect(opts.config.mcp.pneuma.environment["PNEUMA_APP_URL"]).toBe("http://localhost:8765");
    await backend.close();
  });

  test("when appUrl and frameworkToolUrl are set, createOpencode receives app and framework MCP bridge configs", async () => {
    const { sdk, capturedOpts } = makeCaptureSdk();
    const backend = new OpencodeBackend({}, sdk);
    await backend.launch({
      cwd: "/tmp",
      appUrl: "http://localhost:8765",
      frameworkToolUrl: "http://127.0.0.1:9010",
    } as never);

    expect(capturedOpts).toHaveLength(1);
    const opts = capturedOpts[0] as {
      config: {
        mcp: {
          pneuma_app: { command: string[]; environment: Record<string, string> };
          pneuma_framework: { command: string[]; environment: Record<string, string> };
        };
      };
    };
    expect(opts.config.mcp.pneuma_app.command[2]).toMatch(/template-mcp-bridge\.ts$/);
    expect(existsSync(opts.config.mcp.pneuma_app.command[2]!)).toBe(true);
    expect(opts.config.mcp.pneuma_app.environment["PNEUMA_APP_URL"]).toBe("http://localhost:8765");
    expect(opts.config.mcp.pneuma_framework.command[2]).toMatch(/framework-mcp-bridge\.ts$/);
    expect(existsSync(opts.config.mcp.pneuma_framework.command[2]!)).toBe(true);
    expect(opts.config.mcp.pneuma_framework.environment["PNEUMA_FRAMEWORK_TOOL_URL"]).toBe("http://127.0.0.1:9010");
    await backend.close();
  });

  test("configured server port and startup timeout are forwarded when spawning local opencode", async () => {
    const { sdk, capturedOpts } = makeCaptureSdk();
    const backend = new OpencodeBackend({
      serverPort: 43210,
      serverStartTimeoutMs: 12_345,
    }, sdk);
    await backend.launch({
      cwd: "/tmp",
      appUrl: "http://localhost:8765",
      frameworkToolUrl: "http://127.0.0.1:9010",
    } as never);

    expect(capturedOpts).toHaveLength(1);
    expect(capturedOpts[0]).toMatchObject({
      port: 43210,
      timeout: 12_345,
    });
    await backend.close();
  });

  test("when appUrl is NOT set, createOpencode is called without config", async () => {
    const { sdk, capturedOpts } = makeCaptureSdk();
    const backend = new OpencodeBackend({}, sdk);
    await backend.launch({ cwd: "/tmp" }); // no appUrl

    expect(capturedOpts).toHaveLength(1);
    // Should be called with undefined (no config injected)
    expect(capturedOpts[0]).toBeUndefined();
    await backend.close();
  });
});
