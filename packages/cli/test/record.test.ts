import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { parseArgs, parseRecordArgs } from "../src/parse-args.js";
import { AGENTS_SECTION_BEGIN, AGENTS_SECTION_END, agentsSection } from "../src/record.js";

const CLI = resolve(import.meta.dir, "../src/index.ts");

const temps: string[] = [];
function app(files: Record<string, string> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "pneuma-cli-record-"));
  temps.push(root);
  write(root, files);
  return root;
}
function write(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
}
afterEach(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
});

async function run(args: string[], cwd?: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bun", CLI, ...args], { stdout: "pipe", stderr: "pipe", ...(cwd ? { cwd } : {}) });
  await proc.exited;
  return {
    code: proc.exitCode,
    stdout: await new Response(proc.stdout).text(),
    stderr: await new Response(proc.stderr).text(),
  };
}

describe("parseRecordArgs", () => {
  test("save takes the intent as its words and the save flags", () => {
    expect(parseRecordArgs(["save", "add", "a", "dark", "mode", "--agent", "codex", "--one-way", "dropped notes", "--json", "--dir", "/tmp/app"])).toEqual({
      command: "save",
      intent: "add a dark mode",
      agent: "codex",
      oneWay: "dropped notes",
      json: true,
      dir: "/tmp/app",
    });
    expect(parseRecordArgs(["save", "--", "--looks like a flag"]).intent).toBe("--looks like a flag");
    expect(() => parseRecordArgs(["save"])).toThrow(/what the person asked for/);
    expect(() => parseRecordArgs(["save", "x", "--one-way"])).toThrow(/--one-way requires a value/);
    expect(() => parseRecordArgs(["save", "x", "--one-way", "--json"])).toThrow(/--one-way requires a value/);
  });

  test("restore takes exactly one version and its own flags", () => {
    expect(parseRecordArgs(["restore", "v2", "--discard-edits", "--accept-one-way"])).toEqual({
      command: "restore",
      version: "v2",
      discardEdits: true,
      acceptOneWay: true,
    });
    expect(() => parseRecordArgs(["restore"])).toThrow(/exactly one version/);
    expect(() => parseRecordArgs(["restore", "v1", "v2"])).toThrow(/exactly one version/);
  });

  test("a flag that belongs to another command is refused, as is an unknown command", () => {
    expect(() => parseRecordArgs(["history", "--accept-one-way"])).toThrow(/does not take --accept-one-way/);
    expect(() => parseRecordArgs(["init", "--json"])).toThrow(/does not take --json/);
    expect(() => parseRecordArgs(["status", "extra"])).toThrow(/takes no arguments/);
    expect(() => parseRecordArgs(["undo"])).toThrow(/record needs a command/);
    expect(parseRecordArgs(["init", "--no-agents-md", "--agent", "claude-code"])).toEqual({ command: "init", noAgentsMd: true, agent: "claude-code" });
  });

  test("parseArgs routes the record verb", () => {
    expect(parseArgs(["record", "status", "--dir", "/tmp/app"])).toEqual({ verb: "record", record: { command: "status", dir: "/tmp/app" } });
  });
});

describe("AGENTS.md section", () => {
  test("is short, marked, and says what the record does not do", () => {
    const section = agentsSection();
    const lines = section.split("\n");
    expect(lines.length).toBeLessThan(15);
    expect(lines[0]).toBe(AGENTS_SECTION_BEGIN);
    expect(lines.at(-1)).toBe(AGENTS_SECTION_END);
    expect(section).toContain('record save "<what the person asked for>" --agent <your name>');
    expect(section).toContain("record history");
    expect(section).toContain("record restore <version>");
    expect(section).toContain("Nothing here checks or approves your work");
    expect(section).toContain('--one-way "<reason>"');
  });
});

describe("pneuma-framework record", () => {
  test("init records v1 with the AGENTS.md section on top, and a second init changes nothing", async () => {
    const root = app({ "src/app.ts": "export {};\n", "AGENTS.md": "# Existing guide\n\nKeep it.\n" });

    const first = await run(["record", "init", "--dir", root, "--agent", "claude-code"]);
    expect(first.code).toBe(0);
    expect(first.stdout).toContain("v1 holds 2 files");
    expect(first.stdout).toContain("recorded only");
    const agents = readFileSync(join(root, "AGENTS.md"), "utf8");
    expect(agents.startsWith(AGENTS_SECTION_BEGIN)).toBe(true);
    expect(agents).toContain("# Existing guide\n\nKeep it.\n");
    // The section is part of v1, so the tree is clean right after init.
    expect(readFileSync(join(root, ".pneuma/versions/v1/AGENTS.md"), "utf8")).toBe(agents);
    const status = JSON.parse((await run(["record", "status", "--dir", root, "--json"])).stdout);
    expect(status).toEqual({ current: "v1", dirty: false, changedPaths: [] });

    const second = await run(["record", "init", "--dir", root]);
    expect(second.code).toBe(0);
    expect(second.stdout).toContain("already keeps a change record");
    expect(readFileSync(join(root, "AGENTS.md"), "utf8")).toBe(agents);
    expect(agents.split(AGENTS_SECTION_BEGIN)).toHaveLength(2);
  });

  test("init creates AGENTS.md when absent and skips it with --no-agents-md", async () => {
    const created = app({ "a.txt": "1" });
    expect((await run(["record", "init", "--dir", created])).code).toBe(0);
    expect(readFileSync(join(created, "AGENTS.md"), "utf8")).toBe(`${agentsSection()}\n`);

    const skipped = app({ "a.txt": "1" });
    expect((await run(["record", "init", "--dir", skipped, "--no-agents-md"])).code).toBe(0);
    expect(existsSync(join(skipped, "AGENTS.md"))).toBe(false);
  });

  test("save, history, restore: a one-way change is refused until it is accepted, and the record says so", async () => {
    const root = app({ "schema.sql": "create table notes (id, body);\n" });
    expect((await run(["record", "init", "--dir", root, "--agent", "person", "--no-agents-md"])).code).toBe(0);

    write(root, { "page.html": "<p>hi</p>\n" });
    const saved = await run(["record", "save", "add a page", "--dir", root, "--agent", "claude-code"]);
    expect(saved.code).toBe(0);
    expect(saved.stdout).toContain("Saved v2 on top of v1: 1 file changed.");

    const nothing = await run(["record", "save", "again", "--dir", root]);
    expect(nothing.code).toBe(1);
    expect(nothing.stderr).toContain("Nothing changed since v2");

    write(root, { "schema.sql": "create table notes (id);\n" });
    const oneWay = await run(["record", "save", "drop the body column", "--dir", root, "--agent", "claude-code", "--one-way", "dropped notes.body and its data", "--json"]);
    expect(oneWay.code).toBe(0);
    expect(JSON.parse(oneWay.stdout)).toMatchObject({ version: "v3", base_version: "v2", one_way: { reason: "dropped notes.body and its data" }, guarantees: [] });

    const history = await run(["record", "history", "--dir", root]);
    expect(history.code).toBe(0);
    const lines = history.stdout.trim().split("\n");
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(line).toContain("recorded only");
    expect(lines[0]).toMatch(/create\s+v1/);
    expect(lines[2]).toContain("[ONE-WAY: dropped notes.body and its data]");

    const refused = await run(["record", "restore", "v1", "--dir", root]);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain("Going back to v1 would undo a change that putting files back cannot undo:");
    expect(refused.stderr).toContain("v3: dropped notes.body and its data");
    expect(refused.stderr).toContain("--accept-one-way");
    expect(readFileSync(join(root, "schema.sql"), "utf8")).toBe("create table notes (id);\n");

    const refusedJson = await run(["record", "restore", "v1", "--dir", root, "--json"]);
    expect(refusedJson.code).toBe(1);
    expect(JSON.parse(refusedJson.stdout)).toMatchObject({ refused: "crosses_one_way_change", detail: ["v3"] });

    const accepted = await run(["record", "restore", "v1", "--dir", root, "--accept-one-way", "--agent", "person"]);
    expect(accepted.code).toBe(0);
    expect(accepted.stdout).toContain("Now at v1 (was v3)");
    expect(accepted.stdout).toContain("Stored data was not touched.");
    expect(readFileSync(join(root, "schema.sql"), "utf8")).toBe("create table notes (id, body);\n");
    expect(existsSync(join(root, "page.html"))).toBe(false);

    const after = JSON.parse((await run(["record", "history", "--dir", root, "--json"])).stdout) as { kind: string; one_way_crossed?: unknown }[];
    expect(after.at(-1)).toMatchObject({ kind: "restore", version: "v1", base_version: "v3", one_way_crossed: { versions: ["v3"], by: "accepted" } });
    expect((await run(["record", "history", "--dir", root])).stdout).toContain("[went back past one-way v3: accepted without putting stored data back]");
  });

  test("restore over unsaved edits is refused until --discard-edits; status lists the edits", async () => {
    const root = app({ "a.txt": "1" });
    await run(["record", "init", "--dir", root, "--no-agents-md"]);
    write(root, { "a.txt": "2" });
    await run(["record", "save", "two", "--dir", root]);
    write(root, { "a.txt": "edited" });

    const status = await run(["record", "status", "--dir", root]);
    expect(status.stdout).toContain("Current version: v2");
    expect(status.stdout).toContain("Unsaved edits (1 file):\n  a.txt");

    const refused = await run(["record", "restore", "v1", "--dir", root]);
    expect(refused.code).toBe(1);
    expect(refused.stderr).toContain("Some edits have not been saved as a version yet: a.txt.");
    expect(refused.stderr).toContain("--discard-edits");

    const restored = await run(["record", "restore", "v1", "--dir", root, "--discard-edits"]);
    expect(restored.code).toBe(0);
    expect(restored.stdout).toContain("Threw away unsaved edits to 1 file.");
    expect(readFileSync(join(root, "a.txt"), "utf8")).toBe("1");
  });

  test("works from the current directory, and bad arguments exit 2", async () => {
    const root = app({ "a.txt": "1" });
    expect((await run(["record", "init", "--no-agents-md"], root)).code).toBe(0);
    expect(JSON.parse((await run(["record", "status", "--json"], root)).stdout).current).toBe("v1");
    expect((await run(["record", "status"], app())).stdout).toContain("Nothing has been recorded here yet.");
    expect((await run(["record", "restore", "v9", "--dir", root])).stderr).toContain("There is no version v9 in this record.");
    expect((await run(["record", "frobnicate"])).code).toBe(2);
    expect((await run(["record", "status", "--dir", join(root, "missing")])).code).toBe(1);
  });
});
