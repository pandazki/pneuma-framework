const manifestPath = process.env.M8_MANIFEST_PATH;
if (!manifestPath) throw new Error("M8_MANIFEST_PATH is required");

const manifest = await Bun.file(manifestPath).json() as {
  schemaVersion?: unknown;
  entrypoint?: unknown;
  processes?: { web?: { command?: unknown; health?: unknown } };
  data?: { volume?: unknown; sqlite?: unknown };
  migrations?: { command?: unknown; direction?: unknown };
  deployHints?: { requiresMigration?: unknown; runtimeAgent?: unknown };
};

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

assert(manifest.schemaVersion === 1, "manifest.schemaVersion must be 1");
assert(manifest.entrypoint === "server/app.ts", "manifest.entrypoint must be server/app.ts");
assert(
  typeof manifest.processes?.web?.command === "string"
    && manifest.processes.web.command.includes("server/app.ts"),
  "manifest.processes.web.command must run server/app.ts",
);
assert(manifest.processes?.web?.health === "/healthz", "manifest.processes.web.health must be /healthz");
assert(manifest.data?.volume === "/data", "manifest.data.volume must be /data");
assert(manifest.data?.sqlite === "/data/app.db", "manifest.data.sqlite must be /data/app.db");
assert(manifest.migrations?.command === "scripts/migrate.sh", "manifest.migrations.command must be scripts/migrate.sh");
assert(manifest.migrations?.direction === "up", "manifest.migrations.direction must be up");
assert(manifest.deployHints?.requiresMigration === true, "manifest.deployHints.requiresMigration must be true");
assert(manifest.deployHints?.runtimeAgent === "none", "manifest.deployHints.runtimeAgent must be none");

