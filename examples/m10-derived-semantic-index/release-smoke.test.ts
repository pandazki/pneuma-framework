import { describe, expect, test } from "bun:test";
import { $ } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";

const scriptPath = join(import.meta.dir, "release-smoke.sh");

describe("M10 derived semantic index release smoke", () => {
  test("semantic search survives Docker release restart with mounted SQLite volume", async () => {
    expect(existsSync(scriptPath)).toBe(true);
    const output = await $`${scriptPath}`.text();
    expect(output).toContain("m10-release-smoke: semantic search survived release restart");
  }, 240_000);
});
