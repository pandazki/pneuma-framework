import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

export type NeonDb = ReturnType<typeof drizzle<typeof schema>>;

// Builds a Drizzle client bound to a Neon HTTP connection. Returns null when no
// DATABASE_URL is configured so callers can fall back to the in-memory
// repository (preview / local dev) without branching on env everywhere.
export function createNeonDb(databaseUrl: string | undefined = process.env.DATABASE_URL): NeonDb | null {
  if (!databaseUrl) return null;
  const sql = neon(databaseUrl);
  return drizzle(sql, { schema });
}
