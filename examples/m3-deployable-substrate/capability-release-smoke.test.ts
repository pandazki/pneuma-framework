import { describe, expect, test } from "bun:test";
import { $ } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";

const scriptPath = join(import.meta.dir, "capability-release-smoke.sh");

describe("M3 capability release smoke", () => {
  test("preserves a Builder-created capability through Docker release restart", async () => {
    expect(existsSync(scriptPath)).toBe(true);
    const result = await $`${scriptPath}`.text();
    expect(result).toContain("capability-release-smoke: capability survived Docker restart");
  }, 180_000);
});
