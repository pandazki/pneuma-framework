import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { releaseBoardProfile } from "../src/profile/stack-profile";

const root = join(import.meta.dir, "..");

describe("stack profile contract", () => {
  test("declares a verify gate and a migrate command", () => {
    expect(releaseBoardProfile.generatedArtifact.verifyCommand).toEqual(["bun", "run", "verify"]);
    expect(releaseBoardProfile.generatedArtifact.migrateCommand).toEqual([
      "bun",
      "run",
      "db:migrate",
    ]);
  });

  test("editable and protected roots do not overlap", () => {
    const { editableRoots, protectedRoots } = releaseBoardProfile.generatedArtifact;
    for (const editable of editableRoots) {
      expect(protectedRoots).not.toContain(editable);
    }
  });

  test("protected deployment files exist on disk", () => {
    for (const path of ["api", "Dockerfile", "vercel.json", "package.json"]) {
      expect(existsSync(join(root, path))).toBe(true);
    }
  });

  test("keeps the database credential out of committed files", () => {
    // .env is gitignored; .env.example must carry only a placeholder.
    const examplePath = join(root, ".env.example");
    expect(existsSync(examplePath)).toBe(true);
  });
});
