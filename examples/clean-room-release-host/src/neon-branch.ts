// ---------------------------------------------------------------------------
// Host-owned Neon branching adapter — the control plane behind "Preview Data
// Rehearsal". A draft is rehearsed on a throwaway Neon branch (copy-on-write
// from main, so it has real data), the draft's migration runs against it, and
// the branch is deleted when the preview stops. Data on the branch is test data
// and is never merged back — the verified *migration* is what reaches main at
// publish time.
//
// Requires a Neon API key (the Postgres connection string alone cannot drive
// the control plane). Project id is auto-resolved when a single project exists,
// or supplied explicitly.
// ---------------------------------------------------------------------------

const API = "https://console.neon.tech/api/v2";

export interface NeonBranchHandle {
  branchId: string;
  connectionUri: string;
}

export interface NeonBranchConfig {
  apiKey: string;
  projectId?: string;
  databaseName: string;
  roleName: string;
  fetchImpl?: typeof fetch;
  log?: (line: string) => void;
}

export function parseNeonDbRole(databaseUrl: string): { databaseName: string; roleName: string } {
  const u = new URL(databaseUrl);
  return {
    databaseName: u.pathname.replace(/^\//, "") || "neondb",
    roleName: decodeURIComponent(u.username) || "neondb_owner",
  };
}

export class NeonBranchClient {
  private readonly fetchImpl: typeof fetch;
  private readonly log: (line: string) => void;
  private projectId?: string;

  constructor(private readonly cfg: NeonBranchConfig) {
    this.fetchImpl = cfg.fetchImpl ?? fetch;
    this.log = cfg.log ?? (() => {});
    this.projectId = cfg.projectId;
  }

  private headers(): Record<string, string> {
    return {
      authorization: `Bearer ${this.cfg.apiKey}`,
      accept: "application/json",
      "content-type": "application/json",
    };
  }

  private async req(path: string, init?: RequestInit): Promise<unknown> {
    const res = await this.fetchImpl(`${API}${path}`, { ...init, headers: this.headers() });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) throw new Error(`neon api ${path} failed (${res.status}): ${text.slice(0, 300)}`);
    return json;
  }

  async resolveProjectId(): Promise<string> {
    if (this.projectId) return this.projectId;
    const j = (await this.req("/projects")) as { projects?: Array<{ id: string }> };
    const projects = j.projects ?? [];
    if (projects.length === 0) throw new Error("no Neon projects found for this API key");
    if (projects.length > 1) {
      throw new Error("multiple Neon projects; set NEON_PROJECT_ID to disambiguate");
    }
    this.projectId = projects[0]!.id;
    return this.projectId;
  }

  private async parentBranchId(projectId: string): Promise<string> {
    const j = (await this.req(`/projects/${projectId}/branches`)) as {
      branches?: Array<{ id: string; default?: boolean; primary?: boolean }>;
    };
    const branches = j.branches ?? [];
    const parent = branches.find((b) => b.default) ?? branches.find((b) => b.primary) ?? branches[0];
    if (!parent) throw new Error("no parent branch found");
    return parent.id;
  }

  /** Create a copy-on-write branch with a read_write endpoint; return its connection URI. */
  async createBranch(name: string): Promise<NeonBranchHandle> {
    const projectId = await this.resolveProjectId();
    const parentId = await this.parentBranchId(projectId);
    const created = (await this.req(`/projects/${projectId}/branches`, {
      method: "POST",
      body: JSON.stringify({
        branch: { parent_id: parentId, name },
        endpoints: [{ type: "read_write" }],
      }),
    })) as {
      branch?: { id?: string };
      connection_uris?: Array<{ connection_uri?: string }>;
    };
    const branchId = created.branch?.id;
    if (!branchId) throw new Error("neon create branch returned no branch id");
    this.log(`neon: created branch ${branchId} from ${parentId}`);

    let connectionUri = created.connection_uris?.[0]?.connection_uri;
    if (!connectionUri) {
      const params = new URLSearchParams({
        branch_id: branchId,
        database_name: this.cfg.databaseName,
        role_name: this.cfg.roleName,
        pooled: "true",
      });
      const conn = (await this.req(`/projects/${projectId}/connection_uri?${params}`)) as {
        uri?: string;
        connection_uri?: string;
      };
      connectionUri = conn.uri ?? conn.connection_uri;
    }
    if (!connectionUri) throw new Error("neon branch created but no connection uri returned");
    return { branchId, connectionUri };
  }

  async deleteBranch(branchId: string): Promise<void> {
    const projectId = await this.resolveProjectId();
    try {
      await this.req(`/projects/${projectId}/branches/${branchId}`, { method: "DELETE" });
      this.log(`neon: deleted branch ${branchId}`);
    } catch (err) {
      this.log(`neon: failed to delete branch ${branchId}: ${err instanceof Error ? err.message : err}`);
    }
  }
}
