// LinearClient — 轻量 GraphQL 封装. 不用 @linear/sdk.
// 单一职责: 构造 query / mutation, POST 到 https://api.linear.app/graphql, 解析响应.

export interface LinearClientConfig {
  readonly apiKey: string;
  readonly baseURL?: string;
  readonly fetchImpl?: typeof fetch;
}

export class LinearClientError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
    public readonly errors?: unknown[]
  ) {
    super(message);
    this.name = "LinearClientError";
  }
}

export interface LinearUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly displayName?: string;
  readonly active?: boolean;
}

export interface LinearIssueStateRef {
  readonly id: string;
  readonly name: string;
  readonly type: "backlog" | "unstarted" | "started" | "completed" | "canceled" | "triage";
}

export interface LinearIssue {
  readonly id: string;
  readonly identifier: string;
  readonly title: string;
  readonly description?: string | null;
  readonly priority: number;
  readonly state: LinearIssueStateRef;
  readonly assignee?: { id: string; email?: string; name?: string } | null;
  readonly creator?: { id: string; email?: string; name?: string } | null;
  readonly team?: { id: string; key: string; name: string };
  readonly createdAt: string; // ISO
  readonly updatedAt: string;
  readonly completedAt?: string | null;
}

/** Linear GraphQL issue filter — 用户拼出来需要 nest (creator.id.eq 等) */
export type LinearIssueFilter = Record<string, unknown>;

export class LinearClient {
  private readonly apiKey: string;
  private readonly baseURL: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: LinearClientConfig) {
    if (!config.apiKey) throw new LinearClientError("apiKey required");
    this.apiKey = config.apiKey;
    this.baseURL = config.baseURL ?? "https://api.linear.app/graphql";
    this.fetchImpl = config.fetchImpl ?? fetch;
  }

  private async graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
    const res = await this.fetchImpl(this.baseURL, {
      method: "POST",
      headers: {
        Authorization: this.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables: variables ?? {} }),
    });
    if (!res.ok) {
      const body = await safeText(res);
      throw new LinearClientError(
        `Linear HTTP ${res.status}: ${body.slice(0, 400)}`,
        res.status
      );
    }
    const json = (await res.json()) as { data?: T; errors?: unknown[] };
    if (json.errors && json.errors.length > 0) {
      throw new LinearClientError(
        `Linear returned errors: ${JSON.stringify(json.errors).slice(0, 400)}`,
        undefined,
        json.errors
      );
    }
    if (!json.data) {
      throw new LinearClientError("Linear returned no data field");
    }
    return json.data;
  }

  async getViewer(): Promise<LinearUser> {
    const data = await this.graphql<{ viewer: LinearUser }>(
      `query { viewer { id email name displayName active } }`
    );
    return data.viewer;
  }

  /**
   * 按 email 精确查 user. 找到返回, 找不到返回 null.
   * 用于 bind_linear_identity: pneuma user email → Linear user id.
   */
  async findUserByEmail(email: string): Promise<LinearUser | null> {
    const data = await this.graphql<{
      users: { nodes: LinearUser[] };
    }>(
      `query FindUser($email: String!) {
        users(filter: { email: { eq: $email } }, first: 2) {
          nodes { id email name displayName active }
        }
      }`,
      { email }
    );
    const nodes = data.users?.nodes ?? [];
    if (nodes.length === 0) return null;
    // 精确 eq; 极少数情况 >1 说明 Linear 数据不干净 — 返回第一条
    return nodes[0]!;
  }

  /**
   * List issues with arbitrary filter. filter 用 Linear 的 nested shape.
   * 默认返回 first=50; order=updatedAt desc.
   */
  async listIssues(opts: {
    filter?: LinearIssueFilter;
    first?: number;
    orderBy?: "createdAt" | "updatedAt";
  }): Promise<LinearIssue[]> {
    const first = opts.first ?? 50;
    const orderBy = opts.orderBy ?? "updatedAt";
    const data = await this.graphql<{
      issues: { nodes: LinearIssue[] };
    }>(
      `query ListIssues($filter: IssueFilter, $first: Int!, $orderBy: PaginationOrderBy) {
        issues(filter: $filter, first: $first, orderBy: $orderBy) {
          nodes {
            id identifier title description priority
            state { id name type }
            assignee { id email name }
            creator { id email name }
            team { id key name }
            createdAt updatedAt completedAt
          }
        }
      }`,
      {
        filter: opts.filter ?? {},
        first,
        orderBy,
      }
    );
    return data.issues?.nodes ?? [];
  }
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return "(failed to read body)";
  }
}
