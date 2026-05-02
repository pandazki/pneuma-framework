import { describe, expect, test } from "bun:test";
import { $ } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";

const scriptPath = join(import.meta.dir, "release-packaging-smoke.sh");

describe("M8 release packaging hardening", () => {
  test("packages an evolved Knowledge Inbox capability into a restartable Docker release", async () => {
    expect(existsSync(scriptPath)).toBe(true);
    const output = await $`${scriptPath}`.text();
    expect(output).toContain("m8-release-packaging-smoke: evolved Knowledge Inbox survived release restart");
  }, 240_000);
});

