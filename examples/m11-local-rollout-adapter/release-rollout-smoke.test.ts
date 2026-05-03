import { expect, test } from "bun:test";
import { $ } from "bun";
import { existsSync } from "node:fs";
import { join } from "node:path";

const scriptPath = join(import.meta.dir, "release-rollout-smoke.sh");

test("M11 local rollout adapter promotes and rolls back Docker release slots", async () => {
  expect(existsSync(scriptPath)).toBe(true);
  const dockerAvailable = await dockerIsAvailable();
  if (!dockerAvailable) {
    console.warn("Skipping M11 Docker rollout smoke because Docker is unavailable.");
    return;
  }

  const output = await $`${scriptPath}`.text();
  expect(output).toContain("m11-release-rollout-smoke: promoted semantic candidate and rolled back baseline");
}, 300_000);

async function dockerIsAvailable(): Promise<boolean> {
  const result = Bun.spawnSync({
    cmd: ["sh", "-c", "command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1"],
    stdout: "pipe",
    stderr: "pipe",
  });
  return result.exitCode === 0;
}
