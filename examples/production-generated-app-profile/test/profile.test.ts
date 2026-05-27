import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { productionGeneratedAppProfile } from "../src/profile/stack-profile";

const root = new URL("..", import.meta.url).pathname;

describe("bun-hono-react-neon profile", () => {
  it("declares the production generated-app stack boundary", () => {
    expect(productionGeneratedAppProfile.id).toBe("bun-hono-react-neon");
    expect(productionGeneratedAppProfile.runtime).toEqual({
      local: "bun",
      api: "hono",
      frontend: "react-vite",
    });
    expect(productionGeneratedAppProfile.persistence).toEqual({
      provider: "neon-postgres",
      orm: "drizzle",
      validation: "zod",
    });
    expect(productionGeneratedAppProfile.deploymentTargets).toEqual(["docker", "vercel"]);
  });

  it("keeps every required scaffold file present", () => {
    for (const file of productionGeneratedAppProfile.generatedArtifactContract.requiredFiles) {
      expect(existsSync(join(root, file)), file).toBe(true);
    }
  });

  it("keeps the demo Neon credential out of committed files", () => {
    const neonPasswordPattern = /npg_[A-Za-z0-9]+/;
    const neonPoolerHostPattern = /ep-[a-z0-9-]+-pooler\.[a-z0-9.-]+\.neon\.tech/i;
    const checkedFiles = [
      "README.md",
      ".env.example",
      "src/db/client.ts",
      "src/db/neon-smoke.ts",
      "vercel.json",
      "Dockerfile",
    ];

    for (const file of checkedFiles) {
      const content = readFileSync(join(root, file), "utf8");
      expect(content).not.toMatch(neonPasswordPattern);
      expect(content).not.toMatch(neonPoolerHostPattern);
    }
  });
});
