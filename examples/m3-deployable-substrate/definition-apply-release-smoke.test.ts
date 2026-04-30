import { describe, expect, test } from "bun:test";
import { $ } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";

const scriptPath = join(import.meta.dir, "definition-apply-release-smoke.sh");

describe("M4 governed definition.apply release smoke", () => {
  test("creates a capability through governed definition.apply before Docker release", async () => {
    expect(existsSync(scriptPath)).toBe(true);
    const result = await $`${scriptPath}`.env({ ...process.env }).text();

    expect(result).toContain("definition-apply-release-smoke: governed capability survived Docker restart");
  }, 180_000);
});
