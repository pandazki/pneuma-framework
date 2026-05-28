import { readdirSync } from "node:fs";
import { join } from "node:path";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required for Neon migration.");
}

const sql = neon(databaseUrl);
const migrationsDir = join(import.meta.dir, "..", "..", "drizzle");
const files = readdirSync(migrationsDir).filter((file) => file.endsWith(".sql")).sort();

for (const file of files) {
  const content = await Bun.file(join(migrationsDir, file)).text();
  for (const statement of splitSqlStatements(content)) {
    await sql.query(statement);
  }
}

console.log(JSON.stringify({ ok: true, migrations: files }));

function splitSqlStatements(content: string): readonly string[] {
  return content
    .split(/;\s*(?:\n|$)/)
    .map((statement) => statement.trim())
    .filter(Boolean);
}
