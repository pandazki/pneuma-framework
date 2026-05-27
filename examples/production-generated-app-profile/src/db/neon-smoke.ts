import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error("DATABASE_URL is required. Copy .env.example to .env.local or configure the deploy environment.");
}

const sql = neon(databaseUrl);
const rows = await sql`select current_database() as database_name, current_user as user_name`;
console.log(JSON.stringify({ ok: true, rows }, null, 2));
