import { test, expect } from "bun:test";
import { OpencodeBackend, type OpencodeSdk } from "../src/adapter.js";

function makeFakeSdk(overrides?: Partial<{ createCalls: string[] }>): { sdk: OpencodeSdk; createCalls: string[]; subscribeCalls: number } {
  const createCalls: string[] = overrides?.createCalls ?? [];
  let subscribeCalls = 0;
  const client = {
    session: {
      create: async (args: { body: { title?: string } }) => {
        createCalls.push(args.body.title ?? "");
        return { data: { id: `new-${createCalls.length}` } };
      },
      prompt: async () => ({}),
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
  return { sdk, createCalls, subscribeCalls };
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
