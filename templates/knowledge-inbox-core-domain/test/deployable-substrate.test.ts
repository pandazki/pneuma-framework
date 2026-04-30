import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { $ } from "bun";

const templateRoot = join(import.meta.dir, "..");

describe("knowledge-inbox-core-domain deployable substrate", () => {
  test("migrate creates one app.db and build emits a schemaVersion 1 release manifest", async () => {
    const workspace = mkdtempSync(join(tmpdir(), "pneuma-knowledge-inbox-m4-"));
    try {
      await $`PNEUMA_WORKSPACE=${workspace} ${templateRoot}/scripts/migrate.sh`;
      expect(existsSync(join(workspace, "data", "app.db"))).toBe(true);

      const buildDir = join(workspace, ".pneuma-build", "test");
      const manifestPath = join(buildDir, "build.manifest.json");
      await $`PNEUMA_BUILD_DIR=${buildDir} PNEUMA_ARTIFACT_MANIFEST_PATH=${manifestPath} ${templateRoot}/scripts/build.sh`;
      const manifest = await Bun.file(manifestPath).json();
      expect(manifest.schemaVersion).toBe(1);
      expect(manifest.entrypoint).toBe("server/app.ts");
      expect(manifest.data.sqlite).toBe("/data/app.db");
      expect(manifest.processes.web.health).toBe("/healthz");
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
