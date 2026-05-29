import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Pool } from "@neondatabase/serverless";
import { createNeonDb } from "./client";
import { NeonReleaseRepository } from "./neon-repository";

// Applies every drizzle/*.sql migration (idempotent), then seeds demo rows if
// the board is empty. Run before serving a published runtime or deploying to
// Vercel. Each statement is executed individually because the Neon HTTP driver
// is one-statement-per-request.
async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("DATABASE_URL is required for db:migrate");
    process.exit(1);
  }

  const migrationsDir = join(import.meta.dir, "..", "..", "drizzle");
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    for (const file of files) {
      const raw = readFileSync(join(migrationsDir, file), "utf8");
      const statements = raw
        .split(";")
        .map((s) => s.replace(/--.*$/gm, "").trim())
        .filter((s) => s.length > 0);
      for (const statement of statements) {
        await pool.query(statement);
      }
      console.log(`applied ${file} (${statements.length} statements)`);
    }
  } finally {
    await pool.end();
  }

  const db = createNeonDb(databaseUrl);
  if (!db) throw new Error("failed to build Neon client");
  const seeded = await new NeonReleaseRepository(db).seedIfEmpty();
  console.log(seeded > 0 ? `seeded ${seeded} demo rows` : "board already has rows; no seed");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
