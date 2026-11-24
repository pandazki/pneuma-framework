import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { diffTrees } from "@pneuma-framework/host-kit/workspace";
import { readSpaceManifest, TREE } from "../src/artifact";
import { classifyRisks, loadRiskPolicy, parseRiskPolicy } from "../src/policy";

const PRESET_FILE = join(import.meta.dir, "..", "policy", "personal.json");
const PRESET = loadRiskPolicy(PRESET_FILE);

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "space-policy-"));
  roots.push(root);
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return root;
}

function classify(before: Record<string, string>, after: Record<string, string>, policy = PRESET) {
  const activeRoot = tree(before);
  const draftRoot = tree(after);
  return classifyRisks(policy, {
    diff: diffTrees(activeRoot, draftRoot, TREE),
    activeRoot,
    draftRoot,
    before: readSpaceManifest(activeRoot),
    after: readSpaceManifest(draftRoot),
  });
}

const migrate = (...statements: string[]) =>
  `export async function migrate(db) {\n${statements.map((sql) => `  await db.exec('${sql}');\n`).join("")}}\n`;

const destructive = (labels: string) => `src/db.ts now runs ${labels}, which deletes or rewrites data that is already stored.`;

describe("destructive SQL", () => {
  test("a new DROP in a file that already had a different DROP is flagged", () => {
    const result = classify({ "src/db.ts": migrate("DROP TABLE IF EXISTS tmp") }, { "src/db.ts": migrate("DROP TABLE IF EXISTS tmp", "DROP TABLE todos") });
    expect(result.risks).toEqual(["source_code_change", "destructive_definition"]);
    expect(result.reasons).toEqual(["1 file(s) changed", "src/db.ts newly contains DROP"]);
    expect(result.disclosure).toEqual([destructive(`"DROP"`)]);
  });

  test("replacing one DROP target with another is flagged", () => {
    const result = classify({ "src/db.ts": migrate("DROP TABLE IF EXISTS tmp") }, { "src/db.ts": migrate("DROP TABLE todos") });
    expect(result.risks).toEqual(["source_code_change", "destructive_definition"]);
    expect(result.reasons).toEqual(["1 file(s) changed", "src/db.ts newly contains DROP"]);
    expect(result.disclosure).toEqual([destructive(`"DROP"`)]);
  });

  test("a statement matching two patterns gives one reason and one disclosure line", () => {
    const result = classify({ "src/db.ts": migrate("ALTER TABLE todos DROP COLUMN note") }, { "src/db.ts": migrate("ALTER TABLE todos DROP COLUMN title") });
    expect(result.reasons).toEqual(["1 file(s) changed", "src/db.ts newly contains DROP, ALTER TABLE ... DROP/RENAME"]);
    expect(result.disclosure).toEqual([destructive(`"DROP" and "ALTER TABLE ... DROP/RENAME"`)]);
  });

  test("running the same statement once more is flagged", () => {
    const result = classify({ "src/db.ts": migrate("TRUNCATE todos") }, { "src/db.ts": migrate("TRUNCATE todos", "TRUNCATE todos") });
    expect(result.reasons).toEqual(["1 file(s) changed", "src/db.ts newly contains TRUNCATE"]);
  });

  test("an unchanged destructive statement in a file that changed elsewhere is not flagged", () => {
    const result = classify(
      { "src/db.ts": `${migrate("DROP TABLE IF EXISTS tmp", "DELETE FROM sessions")}export const version = 1;\n` },
      { "src/db.ts": `${migrate("DROP TABLE IF EXISTS tmp", "DELETE FROM sessions")}export const version = 2;\n` },
    );
    expect(result).toEqual({ risks: ["source_code_change"], reasons: ["1 file(s) changed"], disclosure: [], oneWay: [] });
  });

  test("moving the same statement within the file is not flagged", () => {
    const create = "CREATE TABLE IF NOT EXISTS todos (id TEXT PRIMARY KEY)";
    const result = classify({ "src/db.ts": migrate("DROP TABLE IF EXISTS tmp", create) }, { "src/db.ts": migrate(create, "DROP TABLE IF EXISTS tmp") });
    expect(result).toEqual({ risks: ["source_code_change"], reasons: ["1 file(s) changed"], disclosure: [], oneWay: [] });
  });

  test("respacing, recasing or requoting the same statement is not flagged", () => {
    const result = classify(
      { "src/db.ts": migrate("DROP TABLE IF EXISTS tmp") },
      { "src/db.ts": 'export async function migrate(db) {\n  await db.exec(`drop table\n    if exists "TMP"`);\n}\n' },
    );
    expect(result).toEqual({ risks: ["source_code_change"], reasons: ["1 file(s) changed"], disclosure: [], oneWay: [] });
  });
});

describe("ALTER TABLE on a quoted or qualified table name", () => {
  const base = { "src/db.ts": migrate("CREATE TABLE IF NOT EXISTS todos (id TEXT)") };
  const added = (statement: string) => classify(base, { "src/db.ts": migrate("CREATE TABLE IF NOT EXISTS todos (id TEXT)", statement) });

  test("a RENAME is flagged however the table is written", () => {
    for (const statement of [
      'ALTER TABLE "todos" RENAME COLUMN "a" TO "b"',
      "ALTER TABLE `todos` RENAME TO old",
      "ALTER TABLE todos RENAME COLUMN a TO b",
      'ALTER TABLE public."todos" RENAME TO archive',
      "ALTER TABLE IF EXISTS todos RENAME TO archive",
    ]) {
      const result = added(statement);
      expect(result.risks, statement).toContain("destructive_definition");
      expect(result.reasons.join(" "), statement).toContain("ALTER TABLE ... DROP/RENAME");
    }
  });

  // migrate() wraps statements in single quotes; inside a template literal the backticks around a name are escaped.
  test("a RENAME on a backticked name inside a template literal is flagged", () => {
    const literal = (statement: string) => ({ "src/db.ts": "export async function migrate(db) {\n  await db.run(`" + statement + "`);\n}\n" });
    for (const statement of ["ALTER TABLE \\`todos\\` RENAME TO old", "ALTER TABLE \\`todos\\` RENAME COLUMN \\`a\\` TO \\`b\\`"]) {
      const result = classify(literal("SELECT 1"), literal(statement));
      expect(result.risks, statement).toContain("destructive_definition");
    }
    expect(classify(literal("SELECT 1"), literal("ALTER TABLE \\`todos\\` ADD COLUMN note TEXT")).risks).not.toContain("destructive_definition");
  });

  test("an additive ALTER is not flagged", () => {
    expect(added('ALTER TABLE "todos" ADD COLUMN note TEXT').risks).not.toContain("destructive_definition");
  });
});

describe("sign-in", () => {
  const manifest = (capabilities: unknown) => ({ "pneuma-space.json": JSON.stringify({ contract: 1, runtime: "isolate", capabilities }) });
  const signInRequired = manifest({ identity: { required: true }, static: { dir: "public" } });

  test.each([
    ["null", { identity: null, static: { dir: "public" } }],
    ["false", { identity: false, static: { dir: "public" } }],
    ["removed", { static: { dir: "public" } }],
    ["{required:false}", { identity: { required: false }, static: { dir: "public" } }],
  ])("required -> %s is a policy change", (_, capabilities) => {
    const result = classify(signInRequired, manifest(capabilities));
    expect(result.risks).toContain("policy_change");
    expect(result.reasons).toContain("sign-in is no longer required");
    expect(result.disclosure).toEqual(["Visitors will be able to open this app without signing in."]);
  });

  test("{required:false} -> {} is not a policy change", () => {
    const result = classify(manifest({ identity: { required: false } }), manifest({ identity: {} }));
    expect(result).toEqual({ risks: ["source_code_change"], reasons: ["1 file(s) changed"], disclosure: [], oneWay: [] });
  });

  test.each([
    ["null", null],
    ["an array", ["identity"]],
    ["a string", "identity"],
  ])("capabilities that are %s declare nothing and do not throw", (_, odd) => {
    const away = classify(signInRequired, manifest(odd));
    expect(away.risks).toEqual(["source_code_change", "release_change", "policy_change"]);
    expect(away.reasons).toEqual([
      "1 file(s) changed",
      "stops using capability identity; its data is kept by the platform",
      "stops using capability static; its data is kept by the platform",
      "sign-in is no longer required",
    ]);

    const back = classify(manifest(odd), signInRequired);
    expect(back.risks).toEqual(["source_code_change", "definition_additive"]);
    expect(back.reasons).toEqual(["1 file(s) changed", "declares capability identity", "declares capability static"]);
  });

  test("a manifest that is null does not throw", () => {
    const result = classify(signInRequired, { "pneuma-space.json": "null" });
    expect(result.risks).toContain("policy_change");
    expect(result.reasons).toContain("sign-in is no longer required");
  });
});

describe("the rules are a preset, not code", () => {
  const raw = () => JSON.parse(readFileSync(PRESET_FILE, "utf8"));
  const manifest = (capabilities: unknown) => JSON.stringify({ contract: 1, runtime: "isolate", capabilities });

  test("an empty preset finds nothing beyond the base risk it names", () => {
    const bare = parseRiskPolicy({ schema_version: 1, preset_id: "bare", auto_approve: [], change: { risk: "source_code_change" } });
    const result = classify(
      { "src/db.ts": "export const a = 1;\n", "pneuma-space.json": manifest({ identity: {} }) },
      { "src/db.ts": "export const sql = `DROP TABLE todos`;\n", "pneuma-space.json": manifest({}) },
      bare,
    );
    expect(result.risks).toEqual(["source_code_change"]);
    expect(result.disclosure).toEqual([]);
  });

  test("a path rule sends changes under a directory to the owner, with the preset's own words", () => {
    const preset = raw();
    preset.paths = [{ under: ["src/billing/"], risk: "credential_boundary", disclosure: "Payment code changed: {paths}" }];
    const result = classify({ "src/billing/charge.ts": "export const fee = 1;\n" }, { "src/billing/charge.ts": "export const fee = 2;\n" }, parseRiskPolicy(preset));
    expect(result.risks).toContain("credential_boundary");
    expect(result.disclosure).toEqual(["Payment code changed: src/billing/charge.ts"]);
  });

  test("a content rule of one's own is applied like the shipped ones", () => {
    const preset = raw();
    preset.content.push({ id: "wipes-files", files: "\\.ts$", risk: "data_migration", disclosure: "{path} now calls {labels}.", patterns: [{ label: "rm -rf", regex: "\\brmSync\\(" }] });
    const result = classify({ "src/a.ts": "export const a = 1;\n" }, { "src/a.ts": "rmSync(dir, { recursive: true });\n" }, parseRiskPolicy(preset));
    expect(result.risks).toContain("data_migration");
    expect(result.disclosure).toEqual(['src/a.ts now calls "rm -rf".']);
  });

  test("which risk a manifest change carries is the preset's choice", () => {
    const preset = raw();
    preset.manifest = [{ when: "capability_added", risk: "policy_change", disclosure: "The app asks the platform for more." }];
    const result = classify({ "pneuma-space.json": manifest({}) }, { "pneuma-space.json": manifest({ db: {} }) }, parseRiskPolicy(preset));
    expect(result.risks).toContain("policy_change");
    expect(result.risks).not.toContain("definition_additive");
  });

  test("a preset that cannot be applied stops the Host at start, naming the place", () => {
    const broken = (edit: (preset: any) => void) => {
      const preset = raw();
      edit(preset);
      return () => parseRiskPolicy(preset, "test preset");
    };
    expect(broken((p) => (p.auto_approve = ["harmless"]))).toThrow("test preset: auto_approve[0] must be one of");
    expect(broken((p) => (p.content[0].patterns[0].regex = "("))).toThrow("content[0].patterns[0].regex is not a valid regular expression");
    expect(broken((p) => (p.manifest[0].when = "anything"))).toThrow("manifest[0].when must be one of");
    expect(broken((p) => delete p.change)).toThrow("change must be an object");
    expect(broken((p) => (p.schema_version = 2))).toThrow("schema_version must be 1");
  });
});

describe("one-way changes are the preset's call", () => {
  const raw = () => JSON.parse(readFileSync(PRESET_FILE, "utf8"));
  const manifest = (capabilities: unknown) => JSON.stringify({ contract: 1, runtime: "isolate", capabilities });

  test("the shipped preset marks newly destructive SQL one-way, with the rule's own words", () => {
    const result = classify({ "src/db.ts": migrate("SELECT 1") }, { "src/db.ts": migrate("SELECT 1", "DROP TABLE todos") });
    expect(result.oneWay).toEqual([destructive(`"DROP"`)]);
    expect(classify({ "src/db.ts": migrate("SELECT 1") }, { "src/db.ts": migrate("SELECT 1", "ALTER TABLE todos ADD COLUMN note TEXT") }).oneWay).toEqual([]);
  });

  test("only the destructive-SQL rule is one-way in the shipped preset", () => {
    const preset = raw();
    expect(preset.content.map((rule: { id: string; one_way?: boolean }) => [rule.id, rule.one_way])).toEqual([["destructive-sql", true]]);
    expect(preset.manifest.some((rule: { one_way?: boolean }) => rule.one_way)).toBe(false);
    const signInDropped = classify({ "pneuma-space.json": manifest({ identity: {} }) }, { "pneuma-space.json": manifest({}) });
    expect(signInDropped.risks).toContain("policy_change");
    expect(signInDropped.oneWay).toEqual([]);
  });

  test("a path or manifest rule can be one-way too; without a disclosure the finding itself is the reason", () => {
    const preset = raw();
    preset.paths = [{ under: ["src/migrations/"], risk: "data_migration", one_way: true }];
    preset.manifest = [{ when: "capability_removed", risk: "release_change", disclosure: "The app stops using a capability.", one_way: true }];
    const result = classify(
      { "src/migrations/1.ts": "a\n", "pneuma-space.json": manifest({ db: {} }) },
      { "src/migrations/1.ts": "b\n", "pneuma-space.json": manifest({}) },
      parseRiskPolicy(preset),
    );
    expect(result.oneWay).toEqual(["src/migrations/1.ts changed (data_migration)", "The app stops using a capability."]);
  });

  test("a mistyped or unknown field stops the Host at start instead of being ignored", () => {
    const broken = (edit: (preset: any) => void) => {
      const preset = raw();
      edit(preset);
      return () => parseRiskPolicy(preset, "test preset");
    };
    expect(broken((p) => (p.content[0].one_way = "yes"))).toThrow("test preset: content[0].one_way must be true or false");
    expect(broken((p) => (p.content[0].one_wya = true))).toThrow("test preset: content[0].one_wya is not a field of a preset");
    expect(broken((p) => (p.manifest[0].oneway = true))).toThrow("manifest[0].oneway is not a field of a preset");
    expect(broken((p) => (p.paths = [{ under: ["src/"], risk: "data_migration", one_way: 1 }]))).toThrow("paths[0].one_way must be true or false");
    expect(broken((p) => (p.auto_aprove = []))).toThrow("the preset.auto_aprove is not a field of a preset");
    expect(broken((p) => (p.content[0].patterns[0].flags = "i"))).toThrow("content[0].patterns[0].flags is not a field of a preset");
    // The shipped preset itself parses, description included.
    expect(() => parseRiskPolicy(raw())).not.toThrow();
  });
});
