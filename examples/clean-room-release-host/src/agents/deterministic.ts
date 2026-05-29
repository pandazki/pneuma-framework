import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Deterministic code-agent lane.
//
// Stands in for a real code agent in tests/CI and as the no-AI browser default.
// It performs ONE concrete evolution — add an `environment` (production /
// staging / development) field to release items, end to end — by editing only
// declared-editable files in a draft workspace. It threads the change through
// the Zod contract, the Drizzle schema, a new idempotent migration, and both
// repositories, exactly as a human or AI agent would.
//
// Anchors are matched exactly and must be unique; a missing anchor throws so a
// scaffold drift is caught loudly instead of silently producing a bad draft.
// ---------------------------------------------------------------------------

function edit(path: string, mutate: (src: string) => string): void {
  const before = readFileSync(path, "utf8");
  const after = mutate(before);
  if (after === before) throw new Error(`deterministic agent: no change applied to ${path}`);
  writeFileSync(path, after);
}

function replaceOnce(src: string, find: string, replace: string, where: string): string {
  const idx = src.indexOf(find);
  if (idx === -1) throw new Error(`deterministic agent: anchor not found in ${where}:\n${find}`);
  if (src.indexOf(find, idx + find.length) !== -1) {
    throw new Error(`deterministic agent: anchor not unique in ${where}`);
  }
  return src.slice(0, idx) + replace + src.slice(idx + find.length);
}

export const DETERMINISTIC_REQUEST =
  "Add an `environment` field (production / staging / development) to release items, " +
  "end to end: contract, database schema + migration, and repositories.";

export function runDeterministicAgent(draftRoot: string): string[] {
  const changed: string[] = [];
  const p = (rel: string) => join(draftRoot, rel);

  // 1. Contract --------------------------------------------------------------
  edit(p("src/shared/contracts.ts"), (src) => {
    let out = replaceOnce(
      src,
      `export const releaseRiskSchema = z.enum(RELEASE_RISKS);
export type ReleaseRisk = z.infer<typeof releaseRiskSchema>;`,
      `export const releaseRiskSchema = z.enum(RELEASE_RISKS);
export type ReleaseRisk = z.infer<typeof releaseRiskSchema>;

export const RELEASE_ENVIRONMENTS = ["production", "staging", "development"] as const;
export const releaseEnvironmentSchema = z.enum(RELEASE_ENVIRONMENTS);
export type ReleaseEnvironment = z.infer<typeof releaseEnvironmentSchema>;`,
      "contracts:enum",
    );
    out = replaceOnce(
      out,
      `  risk: releaseRiskSchema,
  owner: z.string().min(1).max(80),`,
      `  risk: releaseRiskSchema,
  environment: releaseEnvironmentSchema,
  owner: z.string().min(1).max(80),`,
      "contracts:item",
    );
    out = replaceOnce(
      out,
      `  risk: releaseRiskSchema.default("low"),
  owner: z.string().min(1, "Owner is required").max(80),`,
      `  risk: releaseRiskSchema.default("low"),
  environment: releaseEnvironmentSchema.default("development"),
  owner: z.string().min(1, "Owner is required").max(80),`,
      "contracts:input",
    );
    out = replaceOnce(
      out,
      `  "risk",
  "owner",`,
      `  "risk",
  "environment",
  "owner",`,
      "contracts:fields",
    );
    return out;
  });
  changed.push("src/shared/contracts.ts");

  // 2. Drizzle schema --------------------------------------------------------
  edit(p("src/db/schema.ts"), (src) =>
    replaceOnce(
      src,
      `    risk: text("risk").notNull().default("low"),
    owner: text("owner").notNull(),`,
      `    risk: text("risk").notNull().default("low"),
    environment: text("environment").notNull().default("development"),
    owner: text("owner").notNull(),`,
      "schema:column",
    ),
  );
  changed.push("src/db/schema.ts");

  // 3. Migration (idempotent) ------------------------------------------------
  writeFileSync(
    p("drizzle/0001_add_environment.sql"),
    `-- Add environment classification to release items.
ALTER TABLE release_board.release_items
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'development';
`,
  );
  changed.push("drizzle/0001_add_environment.sql");

  // 4. Neon repository -------------------------------------------------------
  edit(p("src/db/neon-repository.ts"), (src) => {
    let out = replaceOnce(
      src,
      `  type ReleaseRisk,`,
      `  type ReleaseEnvironment,
  type ReleaseRisk,`,
      "neon:import",
    );
    out = replaceOnce(
      out,
      `    risk: row.risk as ReleaseRisk,
    owner: row.owner,`,
      `    risk: row.risk as ReleaseRisk,
    environment: (row.environment ?? "development") as ReleaseEnvironment,
    owner: row.owner,`,
      "neon:map",
    );
    out = replaceOnce(
      out,
      `        risk: parsed.risk,
        owner: parsed.owner,`,
      `        risk: parsed.risk,
        environment: parsed.environment,
        owner: parsed.owner,`,
      "neon:insert",
    );
    return out;
  });
  changed.push("src/db/neon-repository.ts");

  // 5. Memory repository -----------------------------------------------------
  edit(p("src/server/repository.ts"), (src) =>
    replaceOnce(
      src,
      `      risk: parsed.risk,
      owner: parsed.owner,`,
      `      risk: parsed.risk,
      environment: parsed.environment,
      owner: parsed.owner,`,
      "memory:create",
    ),
  );
  changed.push("src/server/repository.ts");

  return changed.sort();
}
