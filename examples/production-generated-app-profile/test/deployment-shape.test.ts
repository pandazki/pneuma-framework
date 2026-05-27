import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

describe("deployment shape", () => {
  it("keeps the Vercel entry executable as a Hono app", async () => {
    const mod = await import("../api/index");
    const response = await mod.default.request("/api/health");
    expect(response.status).toBe(200);
  });

  it("documents Docker and Vercel as explicit scaffold targets", () => {
    const dockerfile = readFileSync(join(root, "Dockerfile"), "utf8");
    const vercel = JSON.parse(readFileSync(join(root, "vercel.json"), "utf8")) as {
      buildCommand?: string;
      outputDirectory?: string;
      rewrites?: Array<{ source: string; destination: string }>;
    };

    expect(dockerfile).toContain("FROM oven/bun");
    expect(dockerfile).toContain('CMD ["bun", "run", "src/server/local.ts"]');
    expect(vercel.buildCommand).toBe("bun run build");
    expect(vercel.outputDirectory).toBe("dist/client");
    expect(vercel.rewrites).toContainEqual({ source: "/api/(.*)", destination: "/api" });
  });

  it("keeps Postgres schema creation explicit through Drizzle SQL", () => {
    const migration = readFileSync(join(root, "drizzle/0000_initial_release_operations.sql"), "utf8");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS release_items");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS release_events");
    expect(migration).toContain("release_items_priority_check");
    expect(migration).toContain("release_items_status_check");
    expect(migration).toContain("release_items_risk_check");
  });
});
