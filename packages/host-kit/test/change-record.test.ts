import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import {
  ChangeRecordRefused,
  GUARANTEES,
  openChangeRecord,
  restoreWithData,
  type ChangeRecord,
  type DataSnapshotCapability,
} from "../src/change-record.js";
import { listFiles } from "../src/workspace.js";

const temps: string[] = [];
function tmp(prefix = "change-record-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  temps.push(dir);
  return dir;
}
afterEach(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
});

function write(root: string, files: Record<string, string>): void {
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
}
const read = (root: string, rel: string): string => readFileSync(join(root, rel), "utf8");
/** The working tree's files, without the record itself. */
const files = (root: string): string[] => listFiles(root, { ignoredPaths: new Set([".pneuma"]) });
const historyLines = (record: ChangeRecord): string[] =>
  existsSync(record.paths.history) ? readFileSync(record.paths.history, "utf8").split("\n").filter(Boolean) : [];

function refusal(fn: () => unknown): ChangeRecordRefused {
  try {
    fn();
  } catch (err) {
    if (err instanceof ChangeRecordRefused) return err;
    throw err;
  }
  throw new Error("expected a ChangeRecordRefused");
}
async function asyncRefusal(fn: () => Promise<unknown>): Promise<ChangeRecordRefused> {
  try {
    await fn();
  } catch (err) {
    if (err instanceof ChangeRecordRefused) return err;
    throw err;
  }
  throw new Error("expected a ChangeRecordRefused");
}

/** An app with v1 (a=1), v2 (a=2, b added), v3 (a=3, b removed). */
function threeVersions(): { root: string; record: ChangeRecord } {
  const root = tmp();
  const record = openChangeRecord(root);
  write(root, { "src/a.ts": "1\n" });
  record.record({ intent: "start", agent: "tester" });
  write(root, { "src/a.ts": "2\n", "src/b.ts": "b\n" });
  record.record({ intent: "add b", agent: "tester" });
  write(root, { "src/a.ts": "3\n" });
  rmSync(join(root, "src/b.ts"));
  record.record({ intent: "drop b", agent: "tester" });
  return { root, record };
}

describe("record", () => {
  test("the first record copies the working tree in as v1, recorded only", () => {
    const root = tmp();
    write(root, { "src/app.ts": "export const a = 1;\n", "README.md": "hi\n" });
    const record = openChangeRecord(root);
    expect(record.exists()).toBe(false);
    expect(record.current()).toBeNull();

    const entry = record.record({ intent: "make a counter", agent: "claude-code" });

    expect(entry).toMatchObject({
      kind: "create",
      intent: "make a counter",
      agent: "claude-code",
      version: "v1",
      changed_paths: ["README.md", "src/app.ts"],
      guarantees: [],
    });
    expect(entry.base_version).toBeUndefined();
    expect(entry.change_id).toMatch(/^chg_/);
    expect(Number.isNaN(Date.parse(entry.at))).toBe(false);
    expect(record.exists()).toBe(true);
    expect(record.current()).toBe("v1");
    expect(record.versions()).toEqual(["v1"]);
    expect(listFiles(record.versionDir("v1"))).toEqual(["README.md", "src/app.ts"]);
    expect(read(record.versionDir("v1"), "src/app.ts")).toBe("export const a = 1;\n");
    expect(JSON.parse(readFileSync(record.paths.info, "utf8"))).toEqual({ schema_version: 1, version_counter: 1, current_version: "v1" });
    expect(historyLines(record).map((line) => JSON.parse(line))).toEqual([entry]);
    expect(record.status()).toEqual({ current: "v1", dirty: false, changedPaths: [] });
  });

  test("the next record is a change with its base version, and writes the guarantees it is given", () => {
    const root = tmp();
    write(root, { "a.txt": "1" });
    const record = openChangeRecord(root);
    record.record({ intent: "start", agent: "tester" });
    write(root, { "a.txt": "2", "b.txt": "new" });
    expect(record.status()).toEqual({ current: "v1", dirty: true, changedPaths: ["a.txt", "b.txt"] });
    const entry = record.record({ intent: "edit", agent: "tester", guarantees: [GUARANTEES.verified, "host-lint"], changeId: "c-2" });
    expect(entry).toMatchObject({ change_id: "c-2", kind: "change", version: "v2", base_version: "v1", changed_paths: ["a.txt", "b.txt"], guarantees: ["verified", "host-lint"] });
  });

  test("refuses no_change when the tree equals the current version, and writes nothing", () => {
    const root = tmp();
    write(root, { "a.txt": "1" });
    const record = openChangeRecord(root);
    record.record({ intent: "start", agent: "tester" });
    const info = readFileSync(record.paths.info, "utf8");

    const err = refusal(() => record.record({ intent: "again", agent: "tester" }));

    expect(err.reason).toBe("no_change");
    expect(err.message).toContain("Nothing changed since v1");
    expect(readdirSync(record.paths.versions)).toEqual(["v1"]);
    expect(readFileSync(record.paths.info, "utf8")).toBe(info);
    expect(historyLines(record)).toHaveLength(1);
  });

  test("with `from`, the given directory becomes the version and the working tree is not touched", () => {
    const root = tmp();
    write(root, { "a.txt": "working 1" });
    const record = openChangeRecord(root);
    record.record({ intent: "start", agent: "tester" });
    const draft = tmp("draft-");
    write(draft, { "a.txt": "draft", "c.txt": "only in draft" });

    const entry = record.record({ intent: "from a draft", agent: "host", from: draft });

    expect(entry).toMatchObject({ version: "v2", base_version: "v1", changed_paths: ["a.txt", "c.txt"] });
    expect(files(root)).toEqual(["a.txt"]);
    expect(read(root, "a.txt")).toBe("working 1");
    expect(read(record.versionDir("v2"), "c.txt")).toBe("only in draft");
    expect(record.status()).toEqual({ current: "v2", dirty: true, changedPaths: ["a.txt", "c.txt"] });
  });

  test("if copying fails nothing else is written", () => {
    const root = tmp();
    write(root, { "a.txt": "1" });
    const record = openChangeRecord(root);
    expect(() => record.record({ intent: "x", agent: "tester", from: join(root, "missing") })).toThrow();
    expect(record.versions()).toEqual([]);
    expect(existsSync(record.paths.versions) ? readdirSync(record.paths.versions) : []).toEqual([]);
    expect(existsSync(record.paths.info)).toBe(false);
    expect(existsSync(record.paths.history)).toBe(false);
  });

  test("Host fields travel through `extra`; a record field cannot be passed that way", () => {
    const root = tmp();
    write(root, { "a.txt": "1" });
    const record = openChangeRecord(root);
    const entry = record.record({ intent: "x", agent: "tester", extra: { outcome: "published", address: "https://example.test" } });
    expect(entry.outcome).toBe("published");
    expect(record.history<{ outcome: string }>()[0]?.outcome).toBe("published");
    write(root, { "a.txt": "2" });
    expect(() => record.record({ intent: "y", agent: "tester", extra: { guarantees: ["verified"] } })).toThrow(/record field/);
    expect(record.versions()).toEqual(["v1"]);
  });
});

describe("ignored paths", () => {
  test("are neither versioned nor deleted on restore", () => {
    const root = tmp();
    const record = openChangeRecord(root, {
      walkOptions: { ignoredDirs: new Set(["node_modules"]), ignoredFiles: new Set([".env"]), ignoredPaths: new Set(["data"]) },
    });
    write(root, {
      "src/a.ts": "1",
      "src/data/seed.json": "[]",
      "data/app.sqlite": "rows v1",
      "node_modules/x/index.js": "x",
      ".env": "SECRET=1",
    });
    record.record({ intent: "start", agent: "tester" });
    expect(listFiles(record.versionDir("v1"), { ignoredFiles: new Set(), ignoredDirs: new Set() })).toEqual(["src/a.ts", "src/data/seed.json"]);

    write(root, { "src/a.ts": "2", "src/new.ts": "n", "data/app.sqlite": "rows v2", ".env": "SECRET=2" });
    record.record({ intent: "edit", agent: "tester" });
    record.restore("v1", { agent: "tester" });

    expect(read(root, "src/a.ts")).toBe("1");
    expect(existsSync(join(root, "src/new.ts"))).toBe(false);
    expect(read(root, "data/app.sqlite")).toBe("rows v2");
    expect(read(root, ".env")).toBe("SECRET=2");
    expect(read(root, "node_modules/x/index.js")).toBe("x");
  });

  test("the default walk ignores host-kit's defaults, .pneuma and a top-level data/; custom options can never version .pneuma", () => {
    const root = tmp();
    write(root, { "a.txt": "1", "src/data/seed.json": "[]", "data/app.sqlite": "rows 1", "node_modules/x.js": "x", ".env": "S=1" });
    const record = openChangeRecord(root);
    record.record({ intent: "start", agent: "tester" });
    expect(listFiles(record.versionDir("v1"), { ignoredDirs: new Set(), ignoredFiles: new Set() })).toEqual(["a.txt", "src/data/seed.json"]);
    write(root, { "data/app.sqlite": "rows 2" });
    expect(record.status().dirty).toBe(false);
    write(root, { "a.txt": "1b" });
    record.record({ intent: "edit", agent: "tester" });
    record.restore("v1", { agent: "tester" });
    expect(read(root, "data/app.sqlite")).toBe("rows 2");

    // Agent, editor and OS litter is left out by default, at any depth.
    write(root, { ".claude/settings.local.json": "{}", ".codex/config.toml": "", ".vscode/settings.json": "{}", ".idea/workspace.xml": "<x/>", ".DS_Store": "f", "src/.DS_Store": "f" });
    expect(record.status().dirty).toBe(false);
    for (const litter of [".claude", ".codex", ".vscode", ".idea", ".DS_Store", "src/.DS_Store"]) rmSync(join(root, litter), { recursive: true });

    const custom = openChangeRecord(root, { walkOptions: { ignoredDirs: new Set(), ignoredFiles: new Set() } });
    write(root, { "a.txt": "2" });
    const entry = custom.record({ intent: "edit", agent: "tester" });
    expect(entry.changed_paths).toEqual([".env", "a.txt", "data/app.sqlite", "node_modules/x.js"]);
    expect(listFiles(custom.versionDir("v3"), { ignoredDirs: new Set(), ignoredFiles: new Set() })).toEqual([
      ".env",
      "a.txt",
      "data/app.sqlite",
      "node_modules/x.js",
      "src/data/seed.json",
    ]);
  });
});

describe("restore", () => {
  test("walks back more than one version, then a later record gets a fresh number on the right base", () => {
    const { root, record } = threeVersions();

    expect(record.planRestore("v2")).toEqual({ target: "v2", from: "v3", undone: ["v3"], oneWay: [] });
    const toV2 = record.restore("v2", { agent: "tester" });
    expect(toV2).toMatchObject({ kind: "restore", intent: "go back to v2", version: "v2", base_version: "v3", changed_paths: ["src/a.ts", "src/b.ts"], guarantees: [] });
    expect(record.current()).toBe("v2");
    expect(files(root)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(read(root, "src/a.ts")).toBe("2\n");

    record.restore("v1", { agent: "tester" });
    expect(record.current()).toBe("v1");
    expect(files(root)).toEqual(["src/a.ts"]);
    expect(read(root, "src/a.ts")).toBe("1\n");
    // A restore creates no version and keeps the counter.
    expect(record.versions()).toEqual(["v1", "v2", "v3"]);
    expect(JSON.parse(readFileSync(record.paths.info, "utf8"))).toEqual({ schema_version: 1, version_counter: 3, current_version: "v1" });

    write(root, { "src/a.ts": "4\n" });
    const v4 = record.record({ intent: "new direction", agent: "tester" });
    expect(v4).toMatchObject({ kind: "change", version: "v4", base_version: "v1", changed_paths: ["src/a.ts"] });
    // v4 sits on v1: going to v3 undoes only v4.
    expect(record.planRestore("v3").undone).toEqual(["v4"]);
    expect(record.planRestore("v1").undone).toEqual(["v4"]);
  });

  test("planRestore lists every version a multi-level restore undoes, newest first", () => {
    const { record } = threeVersions();
    expect(record.planRestore("v1").undone).toEqual(["v3", "v2"]);
  });

  test("a directory the restore emptied is removed", () => {
    const root = tmp();
    write(root, { "a.txt": "1" });
    const record = openChangeRecord(root);
    record.record({ intent: "start", agent: "tester" });
    write(root, { "deep/er/b.txt": "b" });
    record.record({ intent: "add b", agent: "tester" });
    record.restore("v1", { agent: "tester" });
    expect(existsSync(join(root, "deep"))).toBe(false);
  });

  test("refuses over unsaved edits unless discardEdits, and records what it threw away", () => {
    const { root, record } = threeVersions();
    write(root, { "src/a.ts": "edited\n", "src/extra.ts": "x" });

    const err = refusal(() => record.restore("v2", { agent: "tester" }));
    expect(err.reason).toBe("dirty_working_tree");
    expect(err.detail).toEqual(["src/a.ts", "src/extra.ts"]);
    expect(err.message).toContain("src/a.ts, src/extra.ts");
    expect(record.current()).toBe("v3");
    expect(read(root, "src/a.ts")).toBe("edited\n");
    expect(historyLines(record)).toHaveLength(3);

    const entry = record.restore("v2", { agent: "tester", discardEdits: true });
    expect(entry.discarded_edits).toEqual(["src/a.ts", "src/extra.ts"]);
    expect(files(root)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(read(root, "src/a.ts")).toBe("2\n");
  });

  test("discardEdits on the current version puts its files back; with nothing edited it is refused", () => {
    const { root, record } = threeVersions();
    expect(refusal(() => record.restore("v3", { agent: "tester" })).reason).toBe("already_current");
    write(root, { "src/a.ts": "oops\n" });
    const entry = record.restore("v3", { agent: "tester", discardEdits: true });
    expect(entry).toMatchObject({ version: "v3", base_version: "v3", discarded_edits: ["src/a.ts"] });
    expect(read(root, "src/a.ts")).toBe("3\n");
  });

  test("refuses an unknown version or a name that is not a version", () => {
    const { record } = threeVersions();
    expect(refusal(() => record.restore("v9", { agent: "tester" })).reason).toBe("unknown_version");
    expect(refusal(() => record.restore("../../etc", { agent: "tester" })).reason).toBe("unknown_version");
    expect(refusal(() => record.planRestore("v9")).message).toContain("Versions: v1, v2, v3.");
  });
});

describe("one-way changes", () => {
  function withOneWay(): { root: string; record: ChangeRecord } {
    const root = tmp();
    const record = openChangeRecord(root);
    write(root, { "schema.sql": "create table notes (id, body);\n" });
    record.record({ intent: "notes app", agent: "tester", dataRef: { capability: "neon-branch", ref: "br-v1" } });
    write(root, { "schema.sql": "create table notes (id);\n" });
    record.record({ intent: "drop the body column", agent: "tester", oneWay: { reason: "dropped the notes.body column and its data" } });
    write(root, { "app.ts": "ui\n" });
    record.record({ intent: "add a page", agent: "tester" });
    return { root, record };
  }

  test("planRestore names the one-way entries a restore would cross and the target's data snapshot", () => {
    const { record } = withOneWay();
    const plan = record.planRestore("v1");
    expect(plan.undone).toEqual(["v3", "v2"]);
    expect(plan.oneWay.map((e) => [e.version, e.one_way?.reason])).toEqual([["v2", "dropped the notes.body column and its data"]]);
    expect(plan.dataRef).toEqual({ capability: "neon-branch", ref: "br-v1" });
    expect(record.planRestore("v2").oneWay).toEqual([]);
  });

  test("a restore across one is refused in plain words, and nothing changes", () => {
    const { root, record } = withOneWay();
    const err = refusal(() => record.restore("v1", { agent: "tester" }));
    expect(err.reason).toBe("crosses_one_way_change");
    expect(err.detail).toEqual(["v2"]);
    expect(err.message).toContain("Going back to v1 would undo a change that putting files back cannot undo:");
    expect(err.message).toContain("v2: dropped the notes.body column and its data");
    expect(err.message).toContain("stored data would stay as it is now");
    expect(record.current()).toBe("v3");
    expect(read(root, "schema.sql")).toBe("create table notes (id);\n");
    expect(historyLines(record)).toHaveLength(3);
  });

  test("acceptOneWay goes back and the record says it was accepted", () => {
    const { root, record } = withOneWay();
    const entry = record.restore("v1", { agent: "tester", acceptOneWay: true, intent: "go back, the column is gone for good" });
    expect(entry.one_way_crossed).toEqual({ versions: ["v2"], by: "accepted" });
    expect(entry.intent).toBe("go back, the column is gone for good");
    expect(record.current()).toBe("v1");
    expect(read(root, "schema.sql")).toBe("create table notes (id, body);\n");
    expect(JSON.parse(historyLines(record).at(-1)!).one_way_crossed).toEqual({ versions: ["v2"], by: "accepted" });
  });

  test("dataRestored goes back and the record names the snapshot that was put back", () => {
    const { record } = withOneWay();
    const entry = record.restore("v1", { agent: "tester", dataRestored: true, acceptOneWay: true });
    expect(entry.one_way_crossed).toEqual({ versions: ["v2"], by: "data_restored", data_ref: { capability: "neon-branch", ref: "br-v1" } });
  });

  test("a restore that crosses nothing one-way writes no crossing even when flags are passed", () => {
    const { record } = withOneWay();
    const entry = record.restore("v2", { agent: "tester", acceptOneWay: true });
    expect(entry.one_way_crossed).toBeUndefined();
  });

  test("a note can declare a version one-way, or attach a snapshot, after it was recorded", () => {
    const { record } = threeVersions();
    expect(record.planRestore("v1").oneWay).toEqual([]);
    record.note({ intent: "v3 rewrote stored ids", agent: "tester", kind: "declaration", version: "v3", oneWay: { reason: "rewrote every stored id" } });
    // v3 sits on v2, so the data taken before it is attached to v2.
    record.note({ intent: "snapshot of v2 data", agent: "host", kind: "snapshot", version: "v2", dataRef: { capability: "neon-branch", ref: "br-late" } });
    const plan = record.planRestore("v1");
    expect(plan.oneWay.map((e) => e.kind)).toEqual(["declaration"]);
    expect(plan.dataRef).toEqual({ capability: "neon-branch", ref: "br-late" });
  });

  test("the data to put back is the snapshot taken before the oldest one-way change undone, also when the target is older", () => {
    // v1 -> v2 (additive) -> v3 (one-way, data saved on v2 first) -> v4.
    const root = tmp();
    const record = openChangeRecord(root);
    write(root, { "schema.sql": "notes(id, body)\n" });
    record.record({ intent: "start", agent: "tester", dataRef: { capability: "neon-branch", ref: "br-v1" } });
    write(root, { "schema.sql": "notes(id, body, tag)\n" });
    record.record({ intent: "add a tag", agent: "tester" });
    record.note({ intent: "data before dropping body", agent: "host", kind: "snapshot", version: "v2", dataRef: { capability: "neon-branch", ref: "br-v2" } });
    write(root, { "schema.sql": "notes(id, tag)\n" });
    record.record({ intent: "drop body", agent: "tester", oneWay: { reason: "dropped notes.body" } });
    write(root, { "app.ts": "ui\n" });
    record.record({ intent: "a page", agent: "tester" });

    // Going to v1 undoes v4, v3 and v2. v2 is additive and undone by code alone, so data as of v2 fits v1's code.
    expect(record.planRestore("v1")).toMatchObject({ undone: ["v4", "v3", "v2"], dataRef: { capability: "neon-branch", ref: "br-v2" } });
    expect(record.planRestore("v2").dataRef).toEqual({ capability: "neon-branch", ref: "br-v2" });
    // Nothing one-way is undone: there is no data to put back, whatever the target has attached.
    expect(record.planRestore("v3").dataRef).toBeUndefined();
  });

  test("with two one-way changes undone, the snapshot before the older one is used", () => {
    const root = tmp();
    const record = openChangeRecord(root);
    write(root, { "schema.sql": "1\n" });
    record.record({ intent: "start", agent: "tester" });
    record.note({ intent: "data", agent: "host", kind: "snapshot", version: "v1", dataRef: { capability: "c", ref: "before-v2" } });
    write(root, { "schema.sql": "2\n" });
    record.record({ intent: "drop a", agent: "tester", oneWay: { reason: "dropped a" } });
    record.note({ intent: "data", agent: "host", kind: "snapshot", version: "v2", dataRef: { capability: "c", ref: "before-v3" } });
    write(root, { "schema.sql": "3\n" });
    record.record({ intent: "drop b", agent: "tester", oneWay: { reason: "dropped b" } });

    expect(record.planRestore("v1").dataRef).toEqual({ capability: "c", ref: "before-v2" });
    expect(record.planRestore("v2").dataRef).toEqual({ capability: "c", ref: "before-v3" });
  });

  test("of several snapshots attached to the base, the newest is used", () => {
    const root = tmp();
    const record = openChangeRecord(root);
    write(root, { "schema.sql": "1\n" });
    record.record({ intent: "start", agent: "tester" });
    record.note({ intent: "data", agent: "host", kind: "snapshot", version: "v1", dataRef: { capability: "c", ref: "older" } });
    record.note({ intent: "data", agent: "host", kind: "snapshot", version: "v1", dataRef: { capability: "c", ref: "newer" } });
    write(root, { "schema.sql": "2\n" });
    record.record({ intent: "drop a", agent: "tester", oneWay: { reason: "dropped a" } });
    expect(record.planRestore("v1").dataRef).toEqual({ capability: "c", ref: "newer" });
  });

  test("a restore that crosses nothing one-way has no data to put back, even when the target has a snapshot", () => {
    const root = tmp();
    const record = openChangeRecord(root);
    write(root, { "a.txt": "1" });
    record.record({ intent: "start", agent: "tester", dataRef: { capability: "c", ref: "br-v1" } });
    write(root, { "a.txt": "2" });
    record.record({ intent: "edit", agent: "tester" });
    expect(record.planRestore("v1")).toEqual({ target: "v1", from: "v2", undone: ["v2"], oneWay: [] });
  });
});

describe("keepEdits", () => {
  test("with unsaved edits, the files stay as they are, the current version moves, and the entry lists the edits", () => {
    const { root, record } = threeVersions();
    write(root, { "src/a.ts": "edited\n", "src/extra.ts": "x" });

    const entry = record.restore("v2", { agent: "tester", keepEdits: true });

    expect(entry).toMatchObject({ kind: "restore", version: "v2", base_version: "v3", kept_edits: ["src/a.ts", "src/extra.ts"] });
    expect(entry.discarded_edits).toBeUndefined();
    expect(record.current()).toBe("v2");
    expect(read(root, "src/a.ts")).toBe("edited\n");
    expect(read(root, "src/extra.ts")).toBe("x");
    expect(existsSync(join(root, "src/b.ts"))).toBe(false);
  });

  test("with a clean working tree, the files are put back as usual and no edits are listed", () => {
    const { root, record } = threeVersions();
    const entry = record.restore("v2", { agent: "tester", keepEdits: true });
    expect(entry.kept_edits).toBeUndefined();
    expect(files(root)).toEqual(["src/a.ts", "src/b.ts"]);
    expect(read(root, "src/a.ts")).toBe("2\n");
  });

  test("cannot be combined with discardEdits, and keeping edits on the current version is nothing to do", () => {
    const { root, record } = threeVersions();
    write(root, { "src/a.ts": "edited\n" });
    expect(() => record.restore("v2", { agent: "tester", keepEdits: true, discardEdits: true })).toThrow(TypeError);
    expect(refusal(() => record.restore("v3", { agent: "tester", keepEdits: true })).reason).toBe("already_current");
    expect(record.current()).toBe("v3");
    expect(historyLines(record)).toHaveLength(3);
  });
});

describe("restoreWithData", () => {
  function capability(id: string, behaviour: "ok" | "throw" = "ok"): DataSnapshotCapability & { restored: string[] } {
    const restored: string[] = [];
    return {
      id,
      restored,
      snapshot: async ({ version }) => ({ ref: `snap-${version}` }),
      restore: async ({ ref }) => {
        if (behaviour === "throw") throw new Error("branch restore failed");
        restored.push(ref);
      },
    };
  }
  function app(dataRef?: { capability: string; ref: string }): { root: string; record: ChangeRecord } {
    const root = tmp();
    const record = openChangeRecord(root);
    write(root, { "schema.sql": "v1\n" });
    record.record({ intent: "start", agent: "tester", ...(dataRef ? { dataRef } : {}) });
    write(root, { "schema.sql": "v2\n" });
    record.record({ intent: "drop data", agent: "tester", oneWay: { reason: "dropped a table" } });
    return { root, record };
  }

  test("puts data back through the capability, then restores and records data_restored", async () => {
    const { root, record } = app({ capability: "neon-branch", ref: "br-1" });
    const cap = capability("neon-branch");
    const entry = await restoreWithData(record, "v1", cap, { agent: "tester" });
    expect(cap.restored).toEqual(["br-1"]);
    expect(entry.one_way_crossed).toEqual({ versions: ["v2"], by: "data_restored", data_ref: { capability: "neon-branch", ref: "br-1" } });
    expect(read(root, "schema.sql")).toBe("v1\n");
  });

  test("without a data_ref on the target it falls back to the plain restore: refused, or accepted when asked", async () => {
    const { record } = app();
    const cap = capability("neon-branch");
    const err = await asyncRefusal(() => restoreWithData(record, "v1", cap, { agent: "tester" }));
    expect(err.reason).toBe("crosses_one_way_change");
    expect(cap.restored).toEqual([]);
    const entry = await restoreWithData(record, "v1", cap, { agent: "tester", acceptOneWay: true });
    expect(entry.one_way_crossed?.by).toBe("accepted");
    expect(cap.restored).toEqual([]);
  });

  test("a capability with a different id is not used", async () => {
    const { record } = app({ capability: "neon-branch", ref: "br-1" });
    const cap = capability("sqlite-copy");
    expect((await asyncRefusal(() => restoreWithData(record, "v1", cap, { agent: "tester" }))).reason).toBe("crosses_one_way_change");
    expect(cap.restored).toEqual([]);
    expect((await asyncRefusal(() => restoreWithData(record, "v1", undefined, { agent: "tester" }))).reason).toBe("crosses_one_way_change");
  });

  test("if the capability throws, nothing is restored and the error propagates", async () => {
    const { root, record } = app({ capability: "neon-branch", ref: "br-1" });
    const before = historyLines(record).length;
    await expect(restoreWithData(record, "v1", capability("neon-branch", "throw"), { agent: "tester" })).rejects.toThrow("branch restore failed");
    expect(record.current()).toBe("v2");
    expect(read(root, "schema.sql")).toBe("v2\n");
    expect(historyLines(record)).toHaveLength(before);
  });

  test("unsaved edits are refused before any data is touched", async () => {
    const { root, record } = app({ capability: "neon-branch", ref: "br-1" });
    write(root, { "schema.sql": "edited\n" });
    const cap = capability("neon-branch");
    expect((await asyncRefusal(() => restoreWithData(record, "v1", cap, { agent: "tester" }))).reason).toBe("dirty_working_tree");
    expect(cap.restored).toEqual([]);
  });

  test("puts back the snapshot taken before the one-way change, not one attached to an older target", async () => {
    const root = tmp();
    const record = openChangeRecord(root);
    write(root, { "schema.sql": "v1\n" });
    record.record({ intent: "start", agent: "tester", dataRef: { capability: "neon-branch", ref: "br-v1" } });
    write(root, { "schema.sql": "v2\n" });
    record.record({ intent: "add a column", agent: "tester" });
    record.note({ intent: "data before the drop", agent: "host", kind: "snapshot", version: "v2", dataRef: { capability: "neon-branch", ref: "br-v2" } });
    write(root, { "schema.sql": "v3\n" });
    record.record({ intent: "drop a column", agent: "tester", oneWay: { reason: "dropped a column" } });
    const cap = capability("neon-branch");

    const entry = await restoreWithData(record, "v1", cap, { agent: "tester" });

    expect(cap.restored).toEqual(["br-v2"]);
    expect(entry.one_way_crossed).toEqual({ versions: ["v3"], by: "data_restored", data_ref: { capability: "neon-branch", ref: "br-v2" } });
    expect(read(root, "schema.sql")).toBe("v1\n");
  });

  describe("release, verify and putReleaseBack: code first, then data, then a check", () => {
    /** The Host's steps, logging into `events` together with the capability, and failing where told. */
    function steps(record: ChangeRecord, cap: ReturnType<typeof capability>, events: string[], fail: { release?: boolean; verify?: boolean; putBack?: boolean } = {}) {
      return {
        release: async ({ plan, withData }: { plan: { target: string }; withData: boolean }) => {
          events.push(`release ${plan.target} (data: ${withData}, restored so far: ${cap.restored.length}, current: ${record.current()})`);
          if (fail.release) throw new Error("publish refused");
        },
        verify: async ({ withData }: { withData: boolean }) => {
          events.push(`verify (data: ${withData}, restored so far: ${cap.restored.length}, current: ${record.current()})`);
          if (fail.verify) throw new Error("GET / -> 502");
        },
        putReleaseBack: async ({ error }: { error: unknown }) => {
          events.push(`put release back after: ${(error as Error).message}`);
          if (fail.putBack) throw new Error("the platform is gone");
        },
      };
    }
    function loggingCapability(events: string[], behaviour: "ok" | "throw" = "ok") {
      const cap = capability("neon-branch", behaviour);
      const restore = cap.restore;
      cap.restore = async (input) => {
        events.push(`data back to ${input.ref}`);
        return restore(input);
      };
      return cap;
    }

    test("the target's code goes out before the data is touched, the check runs after the data is back, and the record moves last", async () => {
      const { root, record } = app({ capability: "neon-branch", ref: "br-1" });
      const events: string[] = [];
      const cap = loggingCapability(events);
      const entry = await restoreWithData(record, "v1", cap, { agent: "tester", keepEdits: true }, steps(record, cap, events));
      expect(events).toEqual([
        "release v1 (data: true, restored so far: 0, current: v2)",
        "data back to br-1",
        "verify (data: true, restored so far: 1, current: v2)",
      ]);
      expect(entry.one_way_crossed).toMatchObject({ by: "data_restored" });
      expect(record.current()).toBe("v1");
      expect(read(root, "schema.sql")).toBe("v1\n");
    });

    test("they run when no data is needed, too", async () => {
      const { record } = threeVersions();
      const events: string[] = [];
      const cap = loggingCapability(events);
      await restoreWithData(record, "v2", cap, { agent: "tester", keepEdits: true }, steps(record, cap, events));
      expect(events).toEqual(["release v2 (data: false, restored so far: 0, current: v3)", "verify (data: false, restored so far: 0, current: v3)"]);
      expect(record.current()).toBe("v2");
    });

    test("a release that fails stops everything: no data is touched, nothing is put back, the record stays", async () => {
      const { root, record } = app({ capability: "neon-branch", ref: "br-1" });
      const events: string[] = [];
      const cap = loggingCapability(events);
      const before = historyLines(record).length;
      await expect(restoreWithData(record, "v1", cap, { agent: "tester", keepEdits: true }, steps(record, cap, events, { release: true }))).rejects.toThrow("publish refused");
      expect(events).toEqual(["release v1 (data: true, restored so far: 0, current: v2)"]);
      expect(cap.restored).toEqual([]);
      expect(record.current()).toBe("v2");
      expect(read(root, "schema.sql")).toBe("v2\n");
      expect(historyLines(record)).toHaveLength(before);
    });

    test("a data restore that fails after the release puts the release back, and the record stays", async () => {
      const { root, record } = app({ capability: "neon-branch", ref: "br-1" });
      const events: string[] = [];
      const cap = loggingCapability(events, "throw");
      const before = historyLines(record).length;
      await expect(restoreWithData(record, "v1", cap, { agent: "tester", keepEdits: true }, steps(record, cap, events))).rejects.toThrow("branch restore failed");
      expect(events).toEqual(["release v1 (data: true, restored so far: 0, current: v2)", "data back to br-1", "put release back after: branch restore failed"]);
      expect(record.current()).toBe("v2");
      expect(read(root, "schema.sql")).toBe("v2\n");
      expect(historyLines(record)).toHaveLength(before);
    });

    test("when putting the release back fails too, the error carries both", async () => {
      const { record } = app({ capability: "neon-branch", ref: "br-1" });
      const events: string[] = [];
      const cap = loggingCapability(events, "throw");
      let caught: unknown;
      await restoreWithData(record, "v1", cap, { agent: "tester", keepEdits: true }, steps(record, cap, events, { putBack: true })).catch((err) => (caught = err));
      expect(caught).toBeInstanceOf(AggregateError);
      expect((caught as AggregateError).errors.map((e: Error) => e.message)).toEqual(["branch restore failed", "the platform is gone"]);
      expect((caught as Error).message).toContain("stored data could not be put back (branch restore failed), and the release could not be put back either (the platform is gone)");
      expect(record.current()).toBe("v2");
    });

    test("a check that fails after the data is back does not put the newer code back; the record names what is in place, and the error propagates", async () => {
      const { root, record } = app({ capability: "neon-branch", ref: "br-1" });
      const events: string[] = [];
      const cap = loggingCapability(events);
      const extra = { outcome: "rolled_back" };
      await expect(
        restoreWithData(record, "v1", cap, { agent: "tester", keepEdits: true, extra }, {
          ...steps(record, cap, events, { verify: true }),
          verify: async () => {
            extra.outcome = "rolled_back_unanswered";
            throw new Error("GET / -> 502");
          },
        }),
      ).rejects.toThrow("GET / -> 502");
      expect(events.some((line) => line.startsWith("put release back"))).toBe(false);
      expect(cap.restored).toEqual(["br-1"]);
      // The target's code and data are what is in place, so the record says so; the Host's extra says the check failed.
      expect(record.current()).toBe("v1");
      expect(read(root, "schema.sql")).toBe("v1\n");
      expect(record.history<{ outcome?: string }>().at(-1)).toMatchObject({ kind: "restore", version: "v1", outcome: "rolled_back_unanswered", one_way_crossed: { by: "data_restored" } });
    });

    test("a check that fails with no data put back puts the release back", async () => {
      const { record } = threeVersions();
      const events: string[] = [];
      const cap = loggingCapability(events);
      await expect(restoreWithData(record, "v2", undefined, { agent: "tester", keepEdits: true }, steps(record, cap, events, { verify: true }))).rejects.toThrow("GET / -> 502");
      expect(events.at(-1)).toBe("put release back after: GET / -> 502");
      expect(record.current()).toBe("v3");
    });

    test("a one-way change that is neither restored nor accepted is refused before the release", async () => {
      const { record } = app();
      const events: string[] = [];
      const cap = loggingCapability(events);
      const err = await asyncRefusal(() => restoreWithData(record, "v1", cap, { agent: "tester", keepEdits: true }, steps(record, cap, events)));
      expect(err.reason).toBe("crosses_one_way_change");
      expect(events).toEqual([]);
    });

    test("they need keepEdits or discardEdits, and that is said before anything is touched", async () => {
      const { record } = app({ capability: "neon-branch", ref: "br-1" });
      const events: string[] = [];
      const cap = loggingCapability(events);
      for (const only of ["release", "verify", "putReleaseBack"] as const) {
        const hooks = steps(record, cap, events);
        await expect(restoreWithData(record, "v1", cap, { agent: "tester" }, { [only]: hooks[only] })).rejects.toThrow(TypeError);
      }
      expect(events).toEqual([]);
      expect(record.current()).toBe("v2");
    });

    describe("a capability's check of the ref comes before anything is released", () => {
      /** A capability that can tell, before anything happens, whether it can put a ref back. */
      function checkingCapability(events: string[], refuse?: string) {
        const cap = loggingCapability(events);
        return Object.assign(cap, {
          check: async ({ ref }: { appRoot: string; ref: string }) => {
            events.push(`check ${ref}`);
            if (refuse) throw new Error(refuse);
          },
        });
      }

      test("the order is check, release, data, verify, record", async () => {
        const { record } = app({ capability: "neon-branch", ref: "br-1" });
        const events: string[] = [];
        const cap = checkingCapability(events);
        await restoreWithData(record, "v1", cap, { agent: "tester", keepEdits: true }, steps(record, cap, events));
        expect(events).toEqual([
          "check br-1",
          "release v1 (data: true, restored so far: 0, current: v2)",
          "data back to br-1",
          "verify (data: true, restored so far: 1, current: v2)",
        ]);
        expect(record.current()).toBe("v1");
      });

      test("a check that fails is a refusal: nothing is released, no data is touched, nothing is put back, the record stays", async () => {
        const { root, record } = app({ capability: "neon-branch", ref: "br-1" });
        const events: string[] = [];
        const cap = checkingCapability(events, "br-1 is not a branch of this project");
        const before = historyLines(record).length;
        const err = await asyncRefusal(() => restoreWithData(record, "v1", cap, { agent: "tester", keepEdits: true }, steps(record, cap, events)));
        expect(err.reason).toBe("data_snapshot_refused");
        expect(err.message).toBe("br-1 is not a branch of this project");
        expect(err.detail).toEqual(["br-1"]);
        expect((err.cause as Error).message).toBe("br-1 is not a branch of this project");
        expect(events).toEqual(["check br-1"]);
        expect(cap.restored).toEqual([]);
        expect(record.current()).toBe("v2");
        expect(read(root, "schema.sql")).toBe("v2\n");
        expect(historyLines(record)).toHaveLength(before);
      });

      test("it runs only when data would be put back", async () => {
        const events: string[] = [];
        // Nothing one-way is crossed.
        const plain = threeVersions();
        await restoreWithData(plain.record, "v2", checkingCapability(events), { agent: "tester" });
        // A one-way change crossed with no snapshot to put back, accepted.
        const accepted = app();
        await restoreWithData(accepted.record, "v1", checkingCapability(events), { agent: "tester", acceptOneWay: true });
        // The caller put the data back itself.
        const done = app({ capability: "neon-branch", ref: "br-1" });
        await restoreWithData(done.record, "v1", checkingCapability(events), { agent: "tester", dataRestored: true });
        expect(events).toEqual([]);
      });

      test("a refusal by the record comes before the check", async () => {
        const { root, record } = app({ capability: "neon-branch", ref: "br-1" });
        write(root, { "schema.sql": "edited\n" });
        const events: string[] = [];
        expect((await asyncRefusal(() => restoreWithData(record, "v1", checkingCapability(events), { agent: "tester" }))).reason).toBe("dirty_working_tree");
        expect(events).toEqual([]);
      });

      test("a capability without a check behaves as before: its restore is the only place a bad ref shows", async () => {
        const { record } = app({ capability: "neon-branch", ref: "br-1" });
        const events: string[] = [];
        const cap = loggingCapability(events, "throw");
        expect("check" in cap).toBe(false);
        await expect(restoreWithData(record, "v1", cap, { agent: "tester", keepEdits: true }, steps(record, cap, events))).rejects.toThrow("branch restore failed");
        expect(events).toEqual(["release v1 (data: true, restored so far: 0, current: v2)", "data back to br-1", "put release back after: branch restore failed"]);
      });
    });

    test("with keepEdits, edits made while the release runs are kept and listed", async () => {
      const { root, record } = threeVersions();
      const entry = await restoreWithData(record, "v2", undefined, { agent: "tester", keepEdits: true }, {
        release: async () => write(root, { "src/wip.ts": "wip\n" }),
      });
      expect(entry.kept_edits).toEqual(["src/wip.ts"]);
      expect(record.current()).toBe("v2");
      expect(read(root, "src/a.ts")).toBe("3\n");
    });
  });

  describe("step 5 moves the record by step 1's plan, and after a step ran it never throws a refusal", () => {
    /** The same record behind an object that is not the module's own, so step 5 can only call `restore`. */
    function foreign(record: ChangeRecord): ChangeRecord {
      return {
        root: record.root,
        paths: record.paths,
        exists: () => record.exists(),
        current: () => record.current(),
        versions: () => record.versions(),
        versionDir: (version) => record.versionDir(version),
        history: () => record.history(),
        status: () => record.status(),
        record: (input) => record.record(input),
        note: (input) => record.note(input),
        planRestore: (version) => record.planRestore(version),
        restore: (version, input) => record.restore(version, input),
      };
    }
    const declareOneWay = (record: ChangeRecord, version: string) =>
      record.note({ kind: "declaration", intent: "written while the release ran", agent: "agent", version, oneWay: { reason: "rewrote every stored id" } });

    test("a one-way line written into the history while the release runs does not turn the move into a refusal", async () => {
      const { root, record } = threeVersions();
      const entry = await restoreWithData(record, "v2", undefined, { agent: "tester", keepEdits: true }, { release: async () => void declareOneWay(record, "v3") });
      expect(record.current()).toBe("v2");
      expect(read(root, "src/a.ts")).toBe("2\n");
      // The entry says what step 1 decided: nothing one-way was crossed when the decision was made.
      expect(entry).toMatchObject({ kind: "restore", version: "v2", base_version: "v3" });
      expect(entry.one_way_crossed).toBeUndefined();
    });

    test("a record that refuses after the release ran throws an ordinary error that says so, with the refusal as its cause", async () => {
      const { record } = threeVersions();
      let caught: unknown;
      await restoreWithData(foreign(record), "v2", undefined, { agent: "tester", keepEdits: true }, { release: async () => void declareOneWay(record, "v3") }).catch((err) => (caught = err));
      expect(caught).toBeInstanceOf(Error);
      expect(caught).not.toBeInstanceOf(ChangeRecordRefused);
      expect((caught as Error).message).toStartWith("v2's release step ran, but the record could not be moved to v2 (Going back to v2 would undo a change");
      expect((caught as Error).cause).toBeInstanceOf(ChangeRecordRefused);
      expect(((caught as Error).cause as ChangeRecordRefused).reason).toBe("crosses_one_way_change");
      expect(record.current()).toBe("v3");
    });

    test("after the release and the data restore, a version directory gone meanwhile is reported as what ran, not as a refusal", async () => {
      const { root, record } = app({ capability: "neon-branch", ref: "br-1" });
      const cap = capability("neon-branch");
      const before = historyLines(record).length;
      let caught: unknown;
      await restoreWithData(record, "v1", cap, { agent: "tester", keepEdits: true }, { release: async () => rmSync(record.versionDir("v1"), { recursive: true }) }).catch((err) => (caught = err));
      expect(caught).not.toBeInstanceOf(ChangeRecordRefused);
      expect((caught as Error).message).toStartWith("v1's release step ran and stored data was put back to br-1, but the record could not be moved to v1 (There is no version v1");
      expect(((caught as Error).cause as ChangeRecordRefused).reason).toBe("unknown_version");
      expect(cap.restored).toEqual(["br-1"]);
      expect(record.current()).toBe("v2");
      expect(read(root, "schema.sql")).toBe("v2\n");
      expect(historyLines(record)).toHaveLength(before);
    });

    test("with no step of the caller's, edits made while the data is put back are kept, not refused after the data is back", async () => {
      const { root, record } = app({ capability: "neon-branch", ref: "br-1" });
      const cap = capability("neon-branch");
      const restore = cap.restore;
      cap.restore = async (input) => {
        await restore(input);
        write(root, { "notes.md": "written meanwhile\n" });
      };
      const entry = await restoreWithData(record, "v1", cap, { agent: "tester" });
      expect(cap.restored).toEqual(["br-1"]);
      expect(entry).toMatchObject({ version: "v1", kept_edits: ["notes.md"], one_way_crossed: { by: "data_restored" } });
      expect(record.current()).toBe("v1");
      expect(read(root, "notes.md")).toBe("written meanwhile\n");
    });

    test("discardEdits still throws edits made meanwhile away, and lists them", async () => {
      const { root, record } = threeVersions();
      const entry = await restoreWithData(record, "v2", undefined, { agent: "tester", discardEdits: true }, { release: async () => write(root, { "src/wip.ts": "wip\n" }) });
      expect(entry.discarded_edits).toEqual(["src/wip.ts"]);
      expect(existsSync(join(root, "src/wip.ts"))).toBe(false);
    });
  });
});

describe("note", () => {
  test("appends an entry and creates no version", () => {
    const root = tmp();
    write(root, { "a.txt": "1" });
    const record = openChangeRecord(root);
    record.record({ intent: "start", agent: "tester" });
    const info = readFileSync(record.paths.info, "utf8");

    const entry = record.note({ intent: "make it pink", agent: "host", kind: "rejected", extra: { reason: "verify_failed" } });

    expect(entry).toMatchObject({ kind: "rejected", intent: "make it pink", guarantees: [], reason: "verify_failed" });
    expect(entry.version).toBeUndefined();
    expect(record.versions()).toEqual(["v1"]);
    expect(readFileSync(record.paths.info, "utf8")).toBe(info);
    expect(record.history().map((e) => e.kind)).toEqual(["create", "rejected"]);
    expect(record.note({ intent: "n", agent: "host" }).kind).toBe("note");
  });

  test("refuses a version that does not exist", () => {
    const root = tmp();
    const record = openChangeRecord(root);
    expect(refusal(() => record.note({ intent: "n", agent: "host", version: "v1" })).reason).toBe("unknown_version");
    expect(existsSync(record.paths.history)).toBe(false);
  });
});

describe("reading older records", () => {
  test("adopts versions/ without record.json: counter and current are the highest version found", () => {
    const root = tmp();
    write(root, { "src/app.ts": "2" });
    write(join(root, ".pneuma/versions/v1"), { "src/app.ts": "1" });
    write(join(root, ".pneuma/versions/v2"), { "src/app.ts": "2" });
    write(join(root, ".pneuma"), {
      "history.jsonl": [
        JSON.stringify({ change_id: "a", at: "2026-01-01T00:00:00.000Z", kind: "create", outcome: "published", intent: "start", agent: "codex", control: "agent-driven", version: "v1" }),
        JSON.stringify({ change_id: "b", at: "2026-01-02T00:00:00.000Z", kind: "change", outcome: "rejected", intent: "nope", agent: "codex", control: "agent-driven", reason: "verify_failed" }),
        JSON.stringify({ change_id: "c", at: "2026-01-03T00:00:00.000Z", kind: "change", outcome: "published", intent: "more", agent: "codex", control: "agent-driven", version: "v2", base_version: "v1" }),
      ].join("\n") + "\n",
    });
    const record = openChangeRecord(root);

    expect(record.exists()).toBe(true);
    expect(record.current()).toBe("v2");
    expect(record.versions()).toEqual(["v1", "v2"]);
    expect(record.status()).toEqual({ current: "v2", dirty: false, changedPaths: [] });
    expect(record.history().map((e) => e.guarantees)).toEqual([[], [], []]);
    expect(record.planRestore("v1").undone).toEqual(["v2"]);

    write(root, { "src/app.ts": "3" });
    expect(record.record({ intent: "next", agent: "tester" })).toMatchObject({ kind: "change", version: "v3", base_version: "v2" });
    expect(JSON.parse(readFileSync(record.paths.info, "utf8"))).toEqual({ schema_version: 1, version_counter: 3, current_version: "v3" });
  });

  test("versions are listed in numeric order and stray names are not versions", () => {
    const root = tmp();
    for (const name of ["v10", "v2", "v1", "notes", "v01", ".staging-v3-x"]) mkdirSync(join(root, ".pneuma/versions", name), { recursive: true });
    const record = openChangeRecord(root);
    expect(record.versions()).toEqual(["v1", "v2", "v10"]);
    expect(record.current()).toBe("v10");
  });

  test("history tolerates lines without guarantees, blank lines, a cut-short line, and a missing final newline", () => {
    const root = tmp();
    write(root, { "a.txt": "1" });
    write(join(root, ".pneuma"), {
      "history.jsonl": [
        JSON.stringify({ change_id: "old", at: "2026-01-01T00:00:00.000Z", kind: "decision", intent: "x", agent: "person" }),
        "",
        '{"change_id":"cut","at":"2026-01-0',
        JSON.stringify({ change_id: "odd", at: "2026-01-02T00:00:00.000Z", kind: "note", intent: "y", agent: "person", guarantees: "verified" }),
      ].join("\n"),
    });
    const record = openChangeRecord(root);
    expect(record.history().map((e) => [e.change_id, e.guarantees])).toEqual([["old", []], ["odd", []]]);

    record.record({ intent: "start", agent: "tester" });
    const lines = readFileSync(record.paths.history, "utf8").split("\n");
    expect(JSON.parse(lines.at(-2)!).version).toBe("v1");
    expect(record.history().map((e) => e.change_id).slice(0, 2)).toEqual(["old", "odd"]);
    expect(record.history()).toHaveLength(3);
  });

  test("a record.json with another schema version is not guessed at", () => {
    const root = tmp();
    write(join(root, ".pneuma"), { "record.json": JSON.stringify({ schema_version: 2, version_counter: 1, current_version: "v1" }) });
    expect(() => openChangeRecord(root).current()).toThrow(/schema_version 2/);
  });
});

describe("change-record module boundary", () => {
  test("imports only ./workspace.js and Node built-ins", () => {
    const source = readFileSync(new URL("../src/change-record.ts", import.meta.url), "utf8");
    const specifiers = [
      ...source.matchAll(/\bfrom\s+["']([^"']+)["']/g),
      ...source.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)/g),
      ...source.matchAll(/^\s*import\s+["']([^"']+)["']/gm),
      ...source.matchAll(/\brequire\s*\(\s*["']([^"']+)["']\s*\)/g),
    ].map((match) => match[1]!);
    expect(specifiers.length).toBeGreaterThan(0);
    const offenders = specifiers.filter((spec) => spec !== "./workspace.js" && !spec.startsWith("node:"));
    expect(offenders).toEqual([]);
  });
});
