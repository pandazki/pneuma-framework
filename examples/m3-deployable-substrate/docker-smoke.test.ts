import { describe, expect, test } from "bun:test";
import { $ } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";

const scriptPath = join(import.meta.dir, "docker-smoke.sh");

describe("M3 Docker runtime smoke", () => {
  test("builds and runs the reference app with a persistent SQLite volume", async () => {
    expect(existsSync(scriptPath)).toBe(true);
    const result = await $`${scriptPath}`.text();
    expect(result).toContain("docker-smoke: bookmark survived restart");
  }, 180_000);
});
