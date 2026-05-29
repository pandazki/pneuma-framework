import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { createHash } from "node:crypto";
import { Pool } from "@neondatabase/serverless";

// ---------------------------------------------------------------------------
// Observation surfaces. After each applied version the Host records two kinds
// of change so a Builder can see what an evolution actually did:
//   1. the database schema (columns in the release_board namespace), and
//   2. the packaged client bundle (file list + sizes + content hashes).
// ---------------------------------------------------------------------------

export interface DbColumn {
  table: string;
  column: string;
  type: string;
}

export interface DbSchemaSnapshot {
  columns: DbColumn[];
  signature: string;
}

export async function inspectNeonSchema(databaseUrl: string): Promise<DbSchemaSnapshot> {
  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const res = await pool.query(
      `select table_name, column_name, data_type
         from information_schema.columns
        where table_schema = 'release_board'
        order by table_name, ordinal_position`,
    );
    const columns: DbColumn[] = res.rows.map((r: Record<string, string>) => ({
      table: r.table_name as string,
      column: r.column_name as string,
      type: r.data_type as string,
    }));
    const signature = columns.map((c) => `${c.table}.${c.column}`).join(",");
    return { columns, signature };
  } finally {
    await pool.end();
  }
}

export interface BundleFile {
  path: string;
  bytes: number;
  sha: string;
}

export interface BundleManifest {
  files: BundleFile[];
  totalBytes: number;
  signature: string;
}

/** Manifest of a built client bundle (root/dist/client). Build first. */
export function readClientBundleManifest(root: string): BundleManifest {
  const dist = join(root, "dist", "client");
  if (!existsSync(dist)) return { files: [], totalBytes: 0, signature: "(not built)" };
  const files: BundleFile[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile()) {
        const data = readFileSync(full);
        files.push({
          path: relative(dist, full).split(sep).join("/"),
          bytes: statSync(full).size,
          sha: createHash("sha1").update(data).digest("hex").slice(0, 12),
        });
      }
    }
  };
  walk(dist);
  files.sort((a, b) => a.path.localeCompare(b.path));
  const totalBytes = files.reduce((sum, f) => sum + f.bytes, 0);
  // Signature ignores content-hashed filenames so it only changes when the
  // bundle content actually changes, surfacing real packaging deltas.
  const signature = createHash("sha1")
    .update(files.map((f) => f.sha).join(","))
    .digest("hex")
    .slice(0, 12);
  return { files, totalBytes, signature };
}
