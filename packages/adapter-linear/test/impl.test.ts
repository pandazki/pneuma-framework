import { describe, test, expect } from "bun:test";
import { LinearAdapterImpl } from "../src/impl.js";
import { LinearClient } from "../src/client.js";
import type {
  AdapterInvocationContext,
  PushableQuery,
} from "@pneuma-framework/core-domain";
import { buildRootContext } from "@pneuma-framework/core-domain";

function mkCtx(): AdapterInvocationContext {
  return {
    credential_mode: "admin_delegated",
    credential: "lin_api_x",
    user_binding_value: "u-1",
    pneuma_ctx: buildRootContext({ app_id: "t", invoked_via: "ui" }),
  };
}

function mockFetchWith(
  onRequest: (url: string, init: RequestInit, parsed: { query: string; variables: Record<string, unknown> }) => Response
): typeof fetch {
  return (async (url: Request | URL | string, init?: RequestInit) => {
    const body = init?.body as string | undefined;
    const parsed = body ? JSON.parse(body) : { query: "", variables: {} };
    return onRequest(String(url), init ?? {}, parsed);
  }) as typeof fetch;
}

describe("LinearAdapterImpl.list · filter translation", () => {
  test("creator_id eq → { creator: { id: { eq: ... } } }", async () => {
    let capturedFilter: Record<string, unknown> = {};
    const client = new LinearClient({
      apiKey: "k",
      fetchImpl: mockFetchWith((_url, _init, parsed) => {
        capturedFilter = parsed.variables.filter as Record<string, unknown>;
        return new Response(
          JSON.stringify({ data: { issues: { nodes: [] } } }),
          { status: 200 }
        );
      }),
    });
    const impl = new LinearAdapterImpl(client);
    const q: PushableQuery = {
      where: [{ column: "creator_id", op: "eq", value: "u-1" }],
    };
    await impl.list(q, mkCtx());
    expect(capturedFilter).toEqual({ creator: { id: { eq: "u-1" } } });
  });

  test("state_type in + priority lte merged", async () => {
    let capturedFilter: Record<string, unknown> = {};
    const client = new LinearClient({
      apiKey: "k",
      fetchImpl: mockFetchWith((_url, _init, parsed) => {
        capturedFilter = parsed.variables.filter as Record<string, unknown>;
        return new Response(
          JSON.stringify({ data: { issues: { nodes: [] } } }),
          { status: 200 }
        );
      }),
    });
    const impl = new LinearAdapterImpl(client);
    const q: PushableQuery = {
      where: [
        { column: "state_type", op: "in", value: ["completed", "canceled"] },
        { column: "priority", op: "lte", value: 2 },
      ],
    };
    await impl.list(q, mkCtx());
    expect(capturedFilter).toEqual({
      state: { type: { in: ["completed", "canceled"] } },
      priority: { lte: 2 },
    });
  });

  test("updated_at date last_n_days → ISO range", async () => {
    let capturedFilter: Record<string, unknown> = {};
    const client = new LinearClient({
      apiKey: "k",
      fetchImpl: mockFetchWith((_url, _init, parsed) => {
        capturedFilter = parsed.variables.filter as Record<string, unknown>;
        return new Response(
          JSON.stringify({ data: { issues: { nodes: [] } } }),
          { status: 200 }
        );
      }),
    });
    const impl = new LinearAdapterImpl(client);
    const q: PushableQuery = {
      where: [
        {
          column: "updated_at",
          op: "date",
          sub_op: "last_n_days",
          value: 7,
        },
      ],
    };
    await impl.list(q, mkCtx());
    const updatedFilter = capturedFilter.updatedAt as { gte?: string; lt?: string };
    expect(typeof updatedFilter.gte).toBe("string");
    expect(typeof updatedFilter.lt).toBe("string");
    // The filter spans roughly 8 days (today + 7 back)
    const span = Date.parse(updatedFilter.lt!) - Date.parse(updatedFilter.gte!);
    expect(span).toBeGreaterThan(6 * 86_400_000);
    expect(span).toBeLessThanOrEqual(9 * 86_400_000);
  });

  test("maps LinearIssue → ExternalRow shape", async () => {
    const client = new LinearClient({
      apiKey: "k",
      fetchImpl: mockFetchWith((_url, _init, _parsed) =>
        new Response(
          JSON.stringify({
            data: {
              issues: {
                nodes: [
                  {
                    id: "uuid-1",
                    identifier: "MEM-42",
                    title: "T",
                    description: "desc",
                    priority: 2,
                    state: { id: "s1", name: "In Progress", type: "started" },
                    assignee: { id: "u-alice", email: "alice@co", name: "Alice" },
                    creator: { id: "u-1", email: "me@co", name: "Me" },
                    team: { id: "t1", key: "MEM", name: "Memosaic" },
                    createdAt: "2026-04-20T10:00:00Z",
                    updatedAt: "2026-04-23T10:00:00Z",
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
    const impl = new LinearAdapterImpl(client);
    const rows = await impl.list({ where: [] }, mkCtx());
    expect(rows).toHaveLength(1);
    const r = rows[0]!;
    expect(r.id).toBe("uuid-1");
    expect(r.identifier).toBe("MEM-42");
    expect(r.priority).toBe(2);
    expect(r.state_type).toBe("started");
    expect(r.state_name).toBe("In Progress");
    expect(r.assignee_id).toBe("u-alice");
    expect(r.assignee_email).toBe("alice@co");
    expect(r.creator_id).toBe("u-1");
    expect(r.team_key).toBe("MEM");
    expect(typeof r.created_at).toBe("number");
    expect(r.completed_at).toBeNull();
  });

  test("first / orderBy passed to GraphQL", async () => {
    let capturedVars: Record<string, unknown> = {};
    const client = new LinearClient({
      apiKey: "k",
      fetchImpl: mockFetchWith((_url, _init, parsed) => {
        capturedVars = parsed.variables;
        return new Response(
          JSON.stringify({ data: { issues: { nodes: [] } } }),
          { status: 200 }
        );
      }),
    });
    const impl = new LinearAdapterImpl(client);
    await impl.list(
      {
        where: [],
        sort: [{ column: "created_at", dir: "desc" }],
        limit: 25,
      },
      mkCtx()
    );
    expect(capturedVars.first).toBe(25);
    expect(capturedVars.orderBy).toBe("createdAt");
  });
});
