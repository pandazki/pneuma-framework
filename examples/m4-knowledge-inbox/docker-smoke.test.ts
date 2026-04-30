import { describe, expect, test } from "bun:test";
import { $ } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";

const scriptPath = join(import.meta.dir, "docker-smoke.sh");

describe("M4 Knowledge Inbox Docker smoke", () => {
  test("builds and runs Knowledge Inbox with a persistent SQLite volume", async () => {
    expect(existsSync(scriptPath)).toBe(true);
    const result = await $`${scriptPath}`.text();
    expect(result).toContain("knowledge-inbox-docker-smoke: inbox item survived restart");
  }, 180_000);
});
