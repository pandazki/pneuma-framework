import { describe, expect, test } from "bun:test";
import { NeonBranchClient, parseNeonDbRole } from "../src/neon-branch.js";

describe("parseNeonDbRole", () => {
  test("extracts database + role from a Neon connection string", () => {
    const { databaseName, roleName } = parseNeonDbRole(
      "postgresql://neondb_owner:pw@ep-x-pooler.aws.neon.tech/neondb?sslmode=require",
    );
    expect(databaseName).toBe("neondb");
    expect(roleName).toBe("neondb_owner");
  });
});

describe("NeonBranchClient (control plane)", () => {
  test("creates a copy-on-write branch from the default parent and returns a connection uri", async () => {
    const calls: string[] = [];
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      const u = String(url);
      const method = init?.method ?? "GET";
      calls.push(`${method} ${u.replace("https://console.neon.tech/api/v2", "")}`);
      if (u.endsWith("/branches") && method === "GET") {
        return new Response(JSON.stringify({ branches: [{ id: "br-main", default: true }] }), { status: 200 });
      }
      if (u.endsWith("/branches") && method === "POST") {
        const body = JSON.parse(String(init?.body)) as { branch?: { parent_id?: string } };
        expect(body.branch?.parent_id).toBe("br-main");
        return new Response(
          JSON.stringify({ branch: { id: "br-new" }, connection_uris: [{ connection_uri: "postgres://branch" }] }),
          { status: 201 },
        );
      }
      throw new Error(`unexpected ${method} ${u}`);
    }) as unknown as typeof fetch;

    const client = new NeonBranchClient({
      apiKey: "napi_x",
      projectId: "proj-1",
      databaseName: "neondb",
      roleName: "neondb_owner",
      fetchImpl,
    });
    const handle = await client.createBranch("rehearsal-1");
    expect(handle).toEqual({ branchId: "br-new", connectionUri: "postgres://branch" });
    expect(calls).toEqual(["GET /projects/proj-1/branches", "POST /projects/proj-1/branches"]);
  });

  test("deleteBranch issues a DELETE and swallows failures (best-effort cleanup)", async () => {
    let deleted = "";
    const fetchImpl = (async (url: string | URL | Request, init?: RequestInit) => {
      if ((init?.method ?? "GET") === "DELETE") {
        deleted = String(url);
        return new Response("{}", { status: 200 });
      }
      throw new Error("unexpected");
    }) as unknown as typeof fetch;
    const client = new NeonBranchClient({
      apiKey: "napi_x",
      projectId: "proj-1",
      databaseName: "neondb",
      roleName: "neondb_owner",
      fetchImpl,
    });
    await client.deleteBranch("br-new");
    expect(deleted).toContain("/projects/proj-1/branches/br-new");
  });
});
