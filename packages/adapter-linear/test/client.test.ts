import { describe, test, expect } from "bun:test";
import { LinearClient, LinearClientError } from "../src/client.js";

function mockFetch(
  responder: (url: string, init: RequestInit) => Response | Promise<Response>
): typeof fetch {
  return (async (url: Request | URL | string, init?: RequestInit) =>
    responder(String(url), init ?? {})) as typeof fetch;
}

describe("LinearClient · auth + graphql shape", () => {
  test("sends Authorization header with raw api key (no 'Bearer' prefix per Linear docs)", async () => {
    let capturedAuth = "";
    const c = new LinearClient({
      apiKey: "lin_api_xyz",
      fetchImpl: mockFetch((_url, init) => {
        capturedAuth = String((init.headers as Record<string, string>).Authorization);
        return new Response(
          JSON.stringify({ data: { viewer: { id: "u1", email: "x@y", name: "X" } } }),
          { status: 200 }
        );
      }),
    });
    await c.getViewer();
    expect(capturedAuth).toBe("lin_api_xyz"); // Linear personal API keys use no 'Bearer'
  });

  test("posts query + variables as JSON body", async () => {
    let capturedBody = "";
    const c = new LinearClient({
      apiKey: "k",
      fetchImpl: mockFetch((_url, init) => {
        capturedBody = String(init.body);
        return new Response(
          JSON.stringify({ data: { users: { nodes: [] } } }),
          { status: 200 }
        );
      }),
    });
    await c.findUserByEmail("alice@co");
    const parsed = JSON.parse(capturedBody);
    expect(parsed.variables.email).toBe("alice@co");
    expect(typeof parsed.query).toBe("string");
    expect(parsed.query).toContain("users");
  });
});

describe("LinearClient · findUserByEmail", () => {
  test("returns user when found", async () => {
    const c = new LinearClient({
      apiKey: "k",
      fetchImpl: mockFetch(() =>
        new Response(
          JSON.stringify({
            data: {
              users: {
                nodes: [{ id: "u-123", email: "a@co", name: "Alice", active: true }],
              },
            },
          }),
          { status: 200 }
        )
      ),
    });
    const u = await c.findUserByEmail("a@co");
    expect(u?.id).toBe("u-123");
    expect(u?.name).toBe("Alice");
  });

  test("returns null when not found (empty nodes)", async () => {
    const c = new LinearClient({
      apiKey: "k",
      fetchImpl: mockFetch(() =>
        new Response(
          JSON.stringify({ data: { users: { nodes: [] } } }),
          { status: 200 }
        )
      ),
    });
    expect(await c.findUserByEmail("nope@example")).toBeNull();
  });
});

describe("LinearClient · error mapping", () => {
  test("HTTP non-2xx → LinearClientError with status", async () => {
    const c = new LinearClient({
      apiKey: "k",
      fetchImpl: mockFetch(() => new Response("unauthorized", { status: 401 })),
    });
    await expect(c.getViewer()).rejects.toBeInstanceOf(LinearClientError);
  });

  test("GraphQL errors → LinearClientError with errors array", async () => {
    const c = new LinearClient({
      apiKey: "k",
      fetchImpl: mockFetch(() =>
        new Response(
          JSON.stringify({ errors: [{ message: "invalid filter" }] }),
          { status: 200 }
        )
      ),
    });
    try {
      await c.listIssues({ filter: {} });
      throw new Error("should throw");
    } catch (err) {
      expect(err).toBeInstanceOf(LinearClientError);
      expect((err as LinearClientError).errors).toHaveLength(1);
    }
  });

  test("empty apiKey rejected at construction", () => {
    expect(() => new LinearClient({ apiKey: "" })).toThrow(LinearClientError);
  });
});

describe("LinearClient · listIssues returns nodes", () => {
  test("returns issues array", async () => {
    const c = new LinearClient({
      apiKey: "k",
      fetchImpl: mockFetch(() =>
        new Response(
          JSON.stringify({
            data: {
              issues: {
                nodes: [
                  {
                    id: "x",
                    identifier: "MEM-1",
                    title: "Hi",
                    description: null,
                    priority: 3,
                    state: { id: "s", name: "Backlog", type: "backlog" },
                    assignee: null,
                    creator: { id: "u1", email: "a@co", name: "A" },
                    team: { id: "t", key: "MEM", name: "M" },
                    createdAt: "2026-04-20T00:00:00Z",
                    updatedAt: "2026-04-20T00:00:00Z",
                    completedAt: null,
                  },
                ],
              },
            },
          }),
          { status: 200 }
        )
      ),
    });
    const issues = await c.listIssues({ filter: {} });
    expect(issues).toHaveLength(1);
    expect(issues[0]!.identifier).toBe("MEM-1");
  });
});
