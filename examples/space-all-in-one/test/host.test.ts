import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { chmodSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { validateScaffoldProjectManifest } from "@pneuma-framework/core/host-authoring";
import { createFileBuildThreadStore } from "@pneuma-framework/core/build-thread";
import type { DataSnapshotCapability } from "@pneuma-framework/host-kit/change-record";
import { agentLane } from "../src/agents";
import { installOverlay, restoreWorkingTree, snapshot } from "../src/artifact";
import { dataSnapshotFromEnv, hostUrlFromEnv } from "../src/config";
import { AppHost, HostError, type AppHostOptions, type HostDataSnapshot } from "../src/host";
import { esc, renderPage } from "../src/page";
import { AUTO_SUBJECT, loadRiskPolicy } from "../src/policy";
import { FakeSpace, FIXTURE_TEMPLATE, templateTests } from "./fake-space";

const EXAMPLE = join(import.meta.dir, "..");
const OWNER = "user:me";
const POLICY = loadRiskPolicy(join(EXAMPLE, "policy", "personal.json"));

let work: string;
let space: FakeSpace;
let host: AppHost;

function makeHost(appsDir: string, fake: FakeSpace, extra: Partial<AppHostOptions> = {}): AppHost {
  return new AppHost({
    appsDir,
    space: fake,
    overlayDir: join(EXAMPLE, "overlay"),
    cliSource: join(EXAMPLE, "bin", "pneuma.mjs"),
    owner: OWNER,
    policy: POLICY,
    // Stands in for `npm ci && npm test`: a draft holding src/TEST_FAILS fails its tests.
    runVerify: async (root) => (existsSync(join(root, "src", "TEST_FAILS")) ? { ok: false, output: "1 test failed" } : { ok: true, output: "tests passed" }),
    ...extra,
  });
}

const app = (name: string, ...rel: string[]) => join(work, "apps", name, ...rel);
const put = (root: string, rel: string, content: string) => {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), content);
};
const edit = (name: string, rel: string, content: string) => put(app(name), rel, content);
/** Stands in for test code that finds the draft under .pneuma/drafts and writes into it. */
const writeIntoDrafts = (name: string, rel: string, content: string) => {
  for (const id of readdirSync(app(name, ".pneuma", "drafts"))) put(app(name, ".pneuma", "drafts", id), rel, content);
};

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), "space-all-in-one-"));
  space = new FakeSpace();
  host = makeHost(join(work, "apps"), space);
});
afterEach(() => rmSync(work, { recursive: true, force: true }));

describe("create", () => {
  test("publishes v1 and leaves a self-describing artifact", async () => {
    const result = await host.create("todo");
    expect(result).toMatchObject({ status: "published", version: "v1", address: "http://space.test/apps/todo/" });

    const agents = readFileSync(app("todo", "AGENTS.md"), "utf8");
    expect(agents).toContain("PneumaSpace app template");
    expect(agents).toContain("## Changing this app");
    // The governed protocol has to be met before the platform guide's own "publish with appctl".
    expect(agents.indexOf("## Changing this app")).toBeLessThan(agents.indexOf("PneumaSpace app template (test fixture)"));
    expect(readFileSync(app("todo", "CLAUDE.md"), "utf8").trim()).toBe("@AGENTS.md");
    for (const file of ["pneuma.scaffold.json", ".pneuma/app.json", ".pneuma/pneuma.mjs", ".pneuma/history.jsonl", ".pneuma/build-threads.json", ".pneuma/release-rollout.json", ".pneuma/versions/v1/src/server.ts"]) {
      expect(existsSync(app("todo", file))).toBe(true);
    }
    // Host state never ships: the version is clean source.
    expect(existsSync(app("todo", ".pneuma/versions/v1/.pneuma"))).toBe(false);

    const [entry] = host.history("todo");
    expect(entry).toMatchObject({ kind: "create", outcome: "published", version: "v1" });
    expect(entry!.checks!.map((check) => `${check.id}:${check.status}`)).toEqual(["npm-test:passed", "space-preview:passed"]);
    expect(space.previews()).toEqual([]);
    expect(space.live.has("todo")).toBe(true);
  });

  test("the artifact's scaffold manifest is valid by the framework's own validator", () => {
    const manifest = JSON.parse(readFileSync(join(EXAMPLE, "overlay", "pneuma.scaffold.json"), "utf8"));
    const check = validateScaffoldProjectManifest(manifest);
    expect(check.issues.filter((issue) => issue.severity === "error")).toEqual([]);
  });

  test("refuses a bad name and a taken directory", async () => {
    await expect(host.create("Bad_Name")).rejects.toBeInstanceOf(HostError);
    await host.create("todo");
    await expect(host.create("todo")).rejects.toThrow("is not empty");
  });
});

describe("agent-driven change", () => {
  beforeEach(async () => void (await host.create("todo")));

  test("a source edit is verified, previewed, approved by the standing policy and released", async () => {
    edit("todo", "src/server.ts", "export const changed = true;\n");
    const result = await host.submit({ name: "todo", intent: "add due dates", agent: "claude-code" });
    expect(result).toMatchObject({ status: "published", version: "v2", changed_paths: ["src/server.ts"], risks: ["source_code_change"], approved_by: [AUTO_SUBJECT] });

    const entry = host.history("todo").at(-1)!;
    expect(entry).toMatchObject({ intent: "add due dates", agent: "claude-code", control: "agent-driven", base_version: "v1", version: "v2" });
    expect(entry.approval).toMatchObject({ route: "low-risk", reason_code: "required-approvals-satisfied" });
    expect(space.previews()).toEqual([]);
    expect((await host.status("todo")).uncommitted).toEqual([]);
    // The preview stays up until the release is done, so the release reuses the bundle it uploaded.
    const steps = space.log.slice(-3).map((line) => line.replace(/-pv\w+/, "-pv"));
    expect(steps).toEqual(["publish todo-pv", "publish todo", "discard todo-pv"]);
  });

  test("no edit is not a change", async () => {
    expect(await host.submit({ name: "todo", intent: "nothing", agent: "codex" })).toMatchObject({ status: "rejected", reason: "no_change" });
  });

  test("a protected path is refused on the diff, and discard puts the tree back", async () => {
    edit("todo", "sdk/serve.ts", "export const hacked = true;\n");
    const result = await host.submit({ name: "todo", intent: "patch the sdk", agent: "codex" });
    expect(result).toMatchObject({ status: "rejected", reason: "protected_file_changed", detail: "sdk/serve.ts" });
    expect((await host.status("todo")).active_version).toBe("v1");

    expect((await host.discard("todo")).restored).toEqual(["sdk/serve.ts"]);
    expect(readFileSync(app("todo", "sdk/serve.ts"), "utf8")).toContain("export function serve");
  });

  test("failing tests stop the change before anything reaches the platform", async () => {
    edit("todo", "src/TEST_FAILS", "x");
    const publishes = space.log.length;
    const result = await host.submit({ name: "todo", intent: "break it", agent: "claude-code" });
    expect(result).toMatchObject({ status: "rejected", reason: "verify_failed" });
    expect(space.log.length).toBe(publishes);
    expect(host.history("todo").at(-1)).toMatchObject({ outcome: "rejected", reason: "verify_failed" });
  });

  test("a draft that does not boot on PneumaSpace is caught by the preview, not by users", async () => {
    edit("todo", "src/BOOT_FAILS", "x");
    const result = await host.submit({ name: "todo", intent: "crash on start", agent: "claude-code" });
    expect(result).toMatchObject({ status: "rejected", reason: "verify_failed" });
    expect(host.history("todo").at(-1)!.checks!.map((check) => `${check.id}:${check.status}`)).toEqual(["npm-test:passed", "space-preview:failed"]);
    expect(space.live.get("todo")!.boots).toBe(true);
    expect(space.previews()).toEqual([]);
  });

  test("a refused publish releases nothing and keeps the version counter", async () => {
    const noPreview = makeHost(join(work, "apps"), space, { preview: false });
    edit("todo", "src/PUBLISH_FAILS", "x");
    expect(await noPreview.submit({ name: "todo", intent: "over quota", agent: "codex" })).toMatchObject({ status: "rejected", reason: "publish_failed" });
    expect((await noPreview.status("todo")).active_version).toBe("v1");
    expect(existsSync(app("todo", ".pneuma/versions/v2"))).toBe(false);
  });
});

describe("changes a person has to decide", () => {
  beforeEach(async () => void (await host.create("todo")));

  test("destructive SQL waits for the owner; only the owner role can approve", async () => {
    edit("todo", "src/server.ts", "export const sql = `ALTER TABLE todos DROP COLUMN note`;\n");
    const result = await host.submit({ name: "todo", intent: "remove notes", agent: "claude-code" });
    expect(result.status).toBe("needs_approval");
    if (result.status !== "needs_approval") return;
    expect(result.risks).toContain("destructive_definition");
    // What approving costs, said before the owner approves.
    expect(result.disclosure.join(" ")).toContain("going back to an earlier version is refused unless the owner confirms it");
    expect(result.disclosure.join(" ")).toContain("This Host declares no data snapshot capability, so a confirmed undo puts back only the code");
    expect((await host.status("todo")).active_version).toBe("v1");
    expect((await host.status("todo")).pending.map((p) => p.change_id)).toEqual([result.change_id]);
    // The draft is kept for the owner; its preview is not left running while they decide.
    expect(space.previews()).toEqual([]);

    // Neither the agent nor the standing policy holds the owner role.
    await expect(host.resolve("todo", result.change_id, "approved", "agent:claude-code")).rejects.toThrow("cannot approve");
    await expect(host.resolve("todo", result.change_id, "approved", AUTO_SUBJECT)).rejects.toThrow("cannot approve");

    const approved = await host.resolve("todo", result.change_id, "approved", OWNER);
    expect(approved).toMatchObject({ status: "published", version: "v2", approved_by: [OWNER] });
    expect((await host.status("todo")).pending).toEqual([]);
    expect(host.history("todo").map((h) => h.outcome)).toEqual(["published", "needs_approval", "published"]);
  });

  test("dropping sign-in is a policy change the owner can deny", async () => {
    const manifest = JSON.parse(readFileSync(app("todo", "pneuma-space.json"), "utf8"));
    manifest.capabilities.identity = { required: false };
    edit("todo", "pneuma-space.json", JSON.stringify(manifest));
    const result = await host.submit({ name: "todo", intent: "make it public", agent: "codex" });
    expect(result).toMatchObject({ status: "needs_approval", risks: expect.arrayContaining(["policy_change"]) });
    if (result.status !== "needs_approval") return;

    expect(await host.resolve("todo", result.change_id, "denied", OWNER, "keep it private")).toMatchObject({ status: "rejected", reason: "denied" });
    expect((await host.status("todo")).active_version).toBe("v1");
    expect(host.history("todo").at(-1)).toMatchObject({ kind: "decision", outcome: "denied" });
  });

  test("adding a capability is additive and goes through on policy", async () => {
    const manifest = JSON.parse(readFileSync(app("todo", "pneuma-space.json"), "utf8"));
    manifest.capabilities.db = {};
    edit("todo", "pneuma-space.json", JSON.stringify(manifest));
    const result = await host.submit({ name: "todo", intent: "store todos", agent: "codex" });
    expect(result).toMatchObject({ status: "published", risks: expect.arrayContaining(["definition_additive"]) });
  });

  test("what the standing policy may approve is read from the preset", async () => {
    const cautious = makeHost(join(work, "apps"), space, { policy: { ...POLICY, preset_id: "cautious", auto_approve: ["additive_ui"] } });
    edit("todo", "src/server.ts", "export const changed = true;\n");
    const result = await cautious.submit({ name: "todo", intent: "tweak", agent: "codex" });
    expect(result).toMatchObject({ status: "needs_approval", risks: ["source_code_change"] });
    expect(cautious.history("todo").at(-1)!.approval).toMatchObject({ route: "high-risk" });
  });

  test("review-all governance sends every change to the owner", async () => {
    const strict = makeHost(join(work, "apps"), space, { governance: "review-all" });
    edit("todo", "src/server.ts", "export const changed = 1;\n");
    expect((await strict.submit({ name: "todo", intent: "small tweak", agent: "codex" })).status).toBe("needs_approval");
  });
});

describe("undo", () => {
  test("goes back one version, republishes it and restores the working tree", async () => {
    await host.create("todo");
    const original = readFileSync(app("todo", "src/server.ts"), "utf8");
    edit("todo", "src/server.ts", "export const changed = true;\n");
    edit("todo", "src/extra.ts", "export const extra = 1;\n");
    await host.submit({ name: "todo", intent: "add things", agent: "claude-code" });

    expect(await host.undo("todo", "did not like it")).toMatchObject({ active_version: "v1", undone_version: "v2" });
    expect(readFileSync(app("todo", "src/server.ts"), "utf8")).toBe(original);
    expect(existsSync(app("todo", "src/extra.ts"))).toBe(false);
    expect(space.live.get("todo")!.files).not.toContain("src/extra.ts");
    expect(host.history("todo").at(-1)).toMatchObject({ kind: "restore", outcome: "rolled_back", version: "v1", base_version: "v2", guarantees: [] });

    // A second undo goes further back, never forward: v1 is the first version, so there is nowhere to go.
    await expect(host.undo("todo", "changed my mind")).rejects.toThrow("v1 is the first version of todo");
    expect((await host.status("todo")).active_version).toBe("v1");
  });

  test("there is nothing to undo on a fresh app", async () => {
    await host.create("todo");
    await expect(host.undo("todo", "oops")).rejects.toThrow("there is nothing before it to go back to");
  });
});

describe("one artifact, both control planes, any host", () => {
  test("a host-driven turn and an agent-driven edit stack on the same app", async () => {
    await host.create("todo");
    const lane = await agentLane("scripted", "show a note");
    const driven = await host.submit({ name: "todo", intent: "show a note", agent: "scripted", ...lane });
    expect(driven).toMatchObject({ status: "published", version: "v2", changed_paths: ["public/app/note.txt"], risks: ["additive_ui"] });
    // The Host edited a draft, so it brings the working tree up to date for whoever comes next.
    expect(readFileSync(app("todo", "public/app/note.txt"), "utf8")).toBe("show a note\n");

    edit("todo", "src/server.ts", "export const changed = true;\n");
    const edited = await host.submit({ name: "todo", intent: "tweak the page", agent: "codex" });
    expect(edited).toMatchObject({ status: "published", version: "v3", changed_paths: ["src/server.ts"] });
    expect(host.history("todo").map((h) => `${h.control}/${h.agent}`)).toEqual(["owner/host", "host-driven/scripted", "agent-driven/codex"]);
  });

  test("a failed agent turn is recorded and releases nothing", async () => {
    await host.create("todo");
    const result = await host.submit({
      name: "todo",
      intent: "do something",
      agent: "claude-code",
      runAgent: async () => {
        throw new Error("claude turn failed (error_during_execution): boom");
      },
    });
    expect(result).toMatchObject({ status: "rejected", reason: "agent_failed" });
    expect((await host.status("todo")).active_version).toBe("v1");
  });

  test("the directory alone is enough: another host on another platform continues it", async () => {
    await host.create("todo");
    edit("todo", "src/server.ts", "export const changed = true;\n");
    await host.submit({ name: "todo", intent: "first change", agent: "claude-code" });

    const elsewhere = join(work, "other-machine");
    cpSync(app("todo"), join(elsewhere, "todo"), { recursive: true });
    const otherSpace = new FakeSpace();
    const otherHost = makeHost(elsewhere, otherSpace);

    expect(await otherHost.status("todo")).toMatchObject({ active_version: "v2", previous_version: "v1", uncommitted: [] });
    expect(otherHost.history("todo").map((h) => h.intent)).toEqual(["Create the app from the PneumaSpace template", "first change"]);

    writeFileSync(join(elsewhere, "todo", "src", "server.ts"), "export const changed = 2;\n");
    const result = await otherHost.submit({ name: "todo", intent: "second change, new agent", agent: "codex" });
    expect(result).toMatchObject({ status: "published", version: "v3" });
    expect(otherSpace.live.has("todo")).toBe(true);
  });
});

describe("the boundary of a change", () => {
  beforeEach(async () => void (await host.create("todo")));

  test("what the checks write never ships: verify runs in a copy of the draft", async () => {
    // Stands in for agent-written tests that tamper with the tree while they run.
    const tampering = makeHost(join(work, "apps"), space, {
      runVerify: async (root) => {
        writeFileSync(join(root, "sdk", "serve.ts"), "// rewritten by a test\n");
        writeFileSync(join(root, "src", "migrate.ts"), "export const sql = `DROP TABLE todos`;\n");
        return { ok: true, output: "tests passed" };
      },
    });
    const sdk = readFileSync(app("todo", "sdk/serve.ts"), "utf8");
    edit("todo", "src/server.ts", "export const changed = true;\n");
    const result = await tampering.submit({ name: "todo", intent: "tweak", agent: "codex" });

    expect(result).toMatchObject({ status: "published", version: "v2", changed_paths: ["src/server.ts"], risks: ["source_code_change"] });
    expect(existsSync(app("todo", ".pneuma/versions/v2/src/migrate.ts"))).toBe(false);
    expect(readFileSync(app("todo", ".pneuma/versions/v2/sdk/serve.ts"), "utf8")).toBe(sdk);
    expect(space.live.get("todo")!.files).not.toContain("src/migrate.ts");
    expect(readFileSync(app("todo", "sdk/serve.ts"), "utf8")).toBe(sdk);
  });

  test("a path outside the writable roots is refused before any check runs", async () => {
    edit("todo", "public/index.html", "<h1>hi</h1>\n");
    edit("todo", "lib/util.ts", "export const x = 1;\n");
    edit("todo", "src/server.ts", "export const changed = true;\n");
    const result = await host.submit({ name: "todo", intent: "add files anywhere", agent: "codex" });

    expect(result).toMatchObject({ status: "rejected", reason: "outside_writable_roots" });
    if (result.status !== "rejected") return;
    expect(result.detail).toContain("lib/util.ts");
    expect(result.detail).toContain("public/index.html");
    expect(result.detail).not.toContain("src/server.ts");
    expect(host.history("todo").at(-1)).toMatchObject({ outcome: "rejected", reason: "outside_writable_roots", checks: [] });
    expect((await host.status("todo")).active_version).toBe("v1");
  });

  test("a manifest that is not valid JSON is refused, not crashed on", async () => {
    edit("todo", "pneuma-space.json", "{ not json");
    const result = await host.submit({ name: "todo", intent: "break the manifest", agent: "codex" });
    expect(result).toMatchObject({ status: "rejected", reason: "invalid_manifest" });
    expect(host.history("todo").at(-1)).toMatchObject({ outcome: "rejected", reason: "invalid_manifest" });
  });

  test("a manifest that is valid JSON but not an object is refused before any check runs", async () => {
    edit("todo", "pneuma-space.json", "null");
    const result = await host.submit({ name: "todo", intent: "empty the manifest", agent: "codex" });
    expect(result).toMatchObject({ status: "rejected", reason: "invalid_manifest", detail: "pneuma-space.json must hold a JSON object, not null" });
    expect(host.history("todo").at(-1)).toMatchObject({ outcome: "rejected", reason: "invalid_manifest", checks: [] });
  });

  test("checks run in a copy outside the app directory, and the copy is gone afterwards", async () => {
    let checkedIn = "";
    const watching = makeHost(join(work, "apps"), space, {
      runVerify: async (root) => {
        checkedIn = root;
        return { ok: true, output: "tests passed" };
      },
    });
    edit("todo", "src/server.ts", "export const changed = true;\n");
    expect(await watching.submit({ name: "todo", intent: "tweak", agent: "codex" })).toMatchObject({ status: "published" });
    expect(checkedIn.startsWith(app("todo"))).toBe(false);
    expect(existsSync(checkedIn)).toBe(false);
    expect(readdirSync(app("todo", ".pneuma", "drafts"))).toEqual([]);
  });

  test("a check that writes into the draft itself, not its copy, releases nothing", async () => {
    const reaching = makeHost(join(work, "apps"), space, {
      runVerify: async () => {
        writeIntoDrafts("todo", "src/migrate.ts", "export const sql = `DROP TABLE todos`;\n");
        return { ok: true, output: "tests passed" };
      },
    });
    edit("todo", "src/server.ts", "export const changed = true;\n");
    const result = await reaching.submit({ name: "todo", intent: "tweak", agent: "codex" });

    expect(result).toMatchObject({ status: "rejected", reason: "draft_changed_after_check" });
    if (result.status !== "rejected") return;
    // Caught by the backbone's sealed draft, before any release step.
    expect(result.detail).toContain("while verify ran");
    expect(reaching.history("todo").at(-1)).toMatchObject({ outcome: "rejected", reason: "draft_changed_after_check" });
    expect((await reaching.status("todo")).active_version).toBe("v1");
    expect(existsSync(app("todo", ".pneuma/versions/v2"))).toBe(false);
    expect(space.live.get("todo")!.files).not.toContain("src/migrate.ts");
  });

  test("a waiting change whose draft is altered before approval is not released, and is cleared like a denial", async () => {
    edit("todo", "src/server.ts", "export const sql = `ALTER TABLE todos DROP COLUMN note`;\n");
    const pending = await host.submit({ name: "todo", intent: "remove notes", agent: "claude-code" });
    if (pending.status !== "needs_approval") throw new Error("expected needs_approval");
    await host.discard("todo");
    // The draft waits inside the working tree, where the agent can still write.
    writeIntoDrafts("todo", "src/server.ts", "export const sql = `DROP TABLE todos`;\n");
    const steps = space.log.length;

    const result = await host.resolve("todo", pending.change_id, "approved", OWNER);
    expect(result).toMatchObject({ status: "rejected", reason: "draft_changed_after_check" });
    expect(space.log.length).toBe(steps);
    const status = await host.status("todo");
    expect(status.active_version).toBe("v1");
    expect(status.pending).toEqual([]);
    expect(existsSync(app("todo", ".pneuma/drafts", pending.change_id))).toBe(false);
    expect(existsSync(app("todo", ".pneuma/versions/v2"))).toBe(false);
    expect(host.history("todo").at(-1)).toMatchObject({ kind: "decision", outcome: "rejected", reason: "draft_changed_after_check" });
  });

  test("a local run's data directory in a host-driven draft is not part of the change", async () => {
    const result = await host.submit({
      name: "todo",
      intent: "show a note",
      agent: "scripted",
      runAgent: async (draftRoot) => {
        put(draftRoot, "public/app/note.txt", "show a note\n");
        put(draftRoot, "data/app.sqlite", "rows");
        return { note: "ran the app locally" };
      },
    });
    expect(result).toMatchObject({ status: "published", version: "v2", changed_paths: ["public/app/note.txt"] });
    expect(existsSync(app("todo", ".pneuma/versions/v2/data"))).toBe(false);
  });

  test("what the agent keeps for itself in a host-driven draft is neither reported nor classified", async () => {
    const result = await host.submit({
      name: "todo",
      intent: "show a note",
      agent: "scripted",
      runAgent: async (draftRoot) => {
        put(draftRoot, "public/app/note.txt", "show a note\n");
        put(draftRoot, ".claude/settings.local.json", "{}\n");
        return { note: "wrote a note" };
      },
    });
    expect(result).toMatchObject({ status: "published", version: "v2", changed_paths: ["public/app/note.txt"], risks: ["additive_ui"] });
    expect(host.history("todo").at(-1)!.changed_paths).toEqual(["public/app/note.txt"]);

    const onlyItsOwn = await host.submit({
      name: "todo",
      intent: "nothing",
      agent: "scripted",
      runAgent: async (draftRoot) => {
        put(draftRoot, ".claude/settings.local.json", "{}\n");
        return { note: "changed nothing" };
      },
    });
    expect(onlyItsOwn).toMatchObject({ status: "rejected", reason: "no_change" });
    expect((await host.status("todo")).active_version).toBe("v2");
  });

  test("what agents and editors keep for themselves is not part of the app", async () => {
    edit("todo", ".claude/settings.local.json", "{}\n");
    edit("todo", ".codex/config.toml", "\n");
    edit("todo", ".vscode/settings.json", "{}\n");
    edit("todo", ".idea/workspace.xml", "<x/>\n");
    expect((await host.status("todo")).uncommitted).toEqual([]);
    expect(await host.submit({ name: "todo", intent: "nothing", agent: "claude-code" })).toMatchObject({ status: "rejected", reason: "no_change" });

    edit("todo", "src/server.ts", "export const changed = true;\n");
    await host.submit({ name: "todo", intent: "tweak", agent: "claude-code" });
    await host.undo("todo", "back");
    expect(existsSync(app("todo", ".claude/settings.local.json"))).toBe(true);
  });
});

describe("edits that were never submitted are not overwritten", () => {
  beforeEach(async () => void (await host.create("todo")));

  test("a host-driven change refuses to start over them", async () => {
    edit("todo", "src/wip.ts", "export const wip = 1;\n");
    const lane = await agentLane("scripted", "show a note");
    await expect(host.submit({ name: "todo", intent: "show a note", agent: "scripted", ...lane })).rejects.toThrow("never submitted (src/wip.ts)");
    expect(readFileSync(app("todo", "src/wip.ts"), "utf8")).toBe("export const wip = 1;\n");
    expect(host.history("todo")).toHaveLength(1);
  });

  test("undo refuses over them", async () => {
    edit("todo", "src/server.ts", "export const changed = true;\n");
    await host.submit({ name: "todo", intent: "tweak", agent: "codex" });
    edit("todo", "src/wip.ts", "export const wip = 1;\n");
    await expect(host.undo("todo", "back")).rejects.toThrow("never submitted (src/wip.ts)");
    expect((await host.status("todo")).active_version).toBe("v2");
    expect(existsSync(app("todo", "src/wip.ts"))).toBe(true);
  });

  test("approval goes through over the pending edits themselves or a clean tree, and refuses anything else", async () => {
    const drop = "export const sql = `ALTER TABLE todos DROP COLUMN note`;\n";
    edit("todo", "src/server.ts", drop);
    const pending = await host.submit({ name: "todo", intent: "remove notes", agent: "claude-code" });
    if (pending.status !== "needs_approval") throw new Error("expected needs_approval");

    // The agent kept working after it was told to stop.
    edit("todo", "src/wip.ts", "export const wip = 1;\n");
    await expect(host.resolve("todo", pending.change_id, "approved", OWNER)).rejects.toThrow("not part of this change (src/wip.ts)");
    expect((await host.status("todo")).pending).toHaveLength(1);

    // Put back to the active version: approval then brings the tree up to the new one.
    await host.discard("todo");
    expect(await host.resolve("todo", pending.change_id, "approved", OWNER)).toMatchObject({ status: "published", version: "v2" });
    expect(readFileSync(app("todo", "src/server.ts"), "utf8")).toBe(drop);
    expect((await host.status("todo")).uncommitted).toEqual([]);
  });

  test("a host-driven change releases but leaves the tree alone when it was edited during the turn, and says so", async () => {
    const result = await host.submit({
      name: "todo",
      intent: "show a note",
      agent: "scripted",
      runAgent: async (draftRoot) => {
        put(draftRoot, "public/app/note.txt", "show a note\n");
        edit("todo", "src/wip.ts", "export const wip = 1;\n");
        return { note: "wrote a note" };
      },
    });
    expect(result).toMatchObject({ status: "published", version: "v2", changed_paths: ["public/app/note.txt"] });
    if (result.status !== "published") return;
    expect(result.note).toContain("left as it is and does not hold v2");
    expect(host.history("todo").at(-1)).toMatchObject({ outcome: "published", version: "v2", note: result.note });

    expect(readFileSync(app("todo", "src/wip.ts"), "utf8")).toBe("export const wip = 1;\n");
    expect((await host.status("todo")).uncommitted).toEqual(["public/app/note.txt", "src/wip.ts"]);
  });

  test("an approval leaves the tree alone when it is edited while the release goes out", async () => {
    edit("todo", "src/server.ts", "export const sql = `DROP TABLE todos`;\n");
    const pending = await host.submit({ name: "todo", intent: "start over", agent: "codex" });
    if (pending.status !== "needs_approval") throw new Error("expected needs_approval");
    space.onPublish = (name) => name === "todo" && edit("todo", "src/wip.ts", "export const wip = 1;\n");

    const result = await host.resolve("todo", pending.change_id, "approved", OWNER);
    expect(result).toMatchObject({ status: "published", version: "v2", note: expect.stringContaining("does not hold v2") });
    expect(readFileSync(app("todo", "src/wip.ts"), "utf8")).toBe("export const wip = 1;\n");
    expect(host.history("todo").at(-1)!.note).toContain("left as it is");
  });

  test("an undo leaves the tree alone when it is edited while the older version goes out", async () => {
    edit("todo", "src/server.ts", "export const changed = true;\n");
    await host.submit({ name: "todo", intent: "tweak", agent: "codex" });
    space.onPublish = (name) => name === "todo" && edit("todo", "src/wip.ts", "export const wip = 1;\n");

    const result = await host.undo("todo", "back");
    expect(result).toMatchObject({ active_version: "v1", note: expect.stringContaining("does not hold v1") });
    expect(readFileSync(app("todo", "src/server.ts"), "utf8")).toBe("export const changed = true;\n");
    expect(existsSync(app("todo", "src/wip.ts"))).toBe(true);
    expect(host.history("todo").at(-1)).toMatchObject({ kind: "restore", outcome: "rolled_back", version: "v1", kept_edits: ["src/wip.ts"] });
  });

  test("only the owner turns a waiting change down", async () => {
    edit("todo", "src/server.ts", "export const sql = `DROP TABLE todos`;\n");
    const pending = await host.submit({ name: "todo", intent: "start over", agent: "codex" });
    if (pending.status !== "needs_approval") throw new Error("expected needs_approval");

    await expect(host.resolve("todo", pending.change_id, "denied", "agent:codex")).rejects.toThrow("cannot deny");
    await expect(host.resolve("todo", pending.change_id, "denied", AUTO_SUBJECT)).rejects.toThrow("cannot deny");
    expect((await host.status("todo")).pending).toHaveLength(1);
    expect(existsSync(app("todo", ".pneuma/drafts", pending.change_id))).toBe(true);
  });
});

describe("the address and the recorded state stay in step", () => {
  test("a create that does not publish leaves nothing behind and can be tried again", async () => {
    space.refuse = (name) => name === "todo";
    expect(await host.create("todo")).toMatchObject({ status: "rejected", reason: "publish_failed" });
    expect(existsSync(app("todo"))).toBe(false);
    expect(space.live.has("todo")).toBe(false);
    expect(space.previews()).toEqual([]);

    space.refuse = null;
    expect(await host.create("todo")).toMatchObject({ status: "published", version: "v1" });
  });

  test("a create whose build goes up but does not come up is taken down again and can be tried again", async () => {
    space.unhealthy = (name) => name === "todo";
    const result = await host.create("todo");
    expect(result).toMatchObject({ status: "rejected", reason: "published_unhealthy" });
    if (result.status !== "rejected") return;
    expect(result.detail).toContain("todo was removed from PneumaSpace again");
    expect(space.live.has("todo")).toBe(false);
    expect(existsSync(app("todo"))).toBe(false);
    expect(space.previews()).toEqual([]);

    space.unhealthy = null;
    expect(await host.create("todo")).toMatchObject({ status: "published", version: "v1" });
  });

  test("when that removal fails, the result says the app is still on PneumaSpace and how to remove it", async () => {
    space.unhealthy = (name) => name === "todo";
    space.failDiscard = (name) => name === "todo";
    const result = await host.create("todo");
    expect(result).toMatchObject({ status: "rejected", reason: "published_unhealthy" });
    if (result.status !== "rejected") return;
    expect(result.detail).toContain("todo could not be removed from PneumaSpace and is still there");
    expect(result.detail).toContain("appctl remove todo");
    expect(result.detail).not.toContain("was removed");
    expect(space.live.has("todo")).toBe(true);
    expect(existsSync(app("todo"))).toBe(false);
    // As the result says: the name stays taken until the app is removed on PneumaSpace.
    await expect(host.create("todo")).rejects.toThrow("already has an app named todo");
  });

  test("a create whose draft is altered by its own checks releases nothing", async () => {
    const reaching = makeHost(join(work, "apps"), space, {
      runVerify: async () => {
        writeIntoDrafts("todo", "src/extra.ts", "export const extra = 1;\n");
        return { ok: true, output: "tests passed" };
      },
    });
    expect(await reaching.create("todo")).toMatchObject({ status: "rejected", reason: "draft_changed_after_check" });
    expect(space.live.has("todo")).toBe(false);
    expect(existsSync(app("todo"))).toBe(false);
  });

  test("a preview that cannot be removed holds nothing up and is logged", async () => {
    await host.create("todo");
    const lines: string[] = [];
    const logging = makeHost(join(work, "apps"), space, { log: (line) => lines.push(line) });
    space.failDiscard = (name) => name.includes("-pv");
    edit("todo", "src/server.ts", "export const changed = true;\n");

    expect(await logging.submit({ name: "todo", intent: "tweak", agent: "codex" })).toMatchObject({ status: "published", version: "v2" });
    expect(space.previews()).toHaveLength(1);
    expect(lines.filter((line) => line.includes("could not be removed from PneumaSpace"))).toHaveLength(1);
  });

  test("create refuses a name PneumaSpace already knows, and touches neither the app nor the directory", async () => {
    await space.publish("todo", join(import.meta.dir, "fixture-template"));
    await expect(host.create("todo")).rejects.toThrow("already has an app named todo");
    expect(existsSync(app("todo"))).toBe(false);
    expect(space.live.has("todo")).toBe(true);
  });

  test("a release that does not come up puts the address back on the version that was serving", async () => {
    await host.create("todo");
    const noPreview = makeHost(join(work, "apps"), space, { preview: false });
    edit("todo", "src/BOOT_FAILS", "x");
    const result = await noPreview.submit({ name: "todo", intent: "crash on start", agent: "codex" });

    expect(result).toMatchObject({ status: "rejected", reason: "published_unhealthy" });
    expect(space.live.get("todo")).toMatchObject({ boots: true });
    expect(noPreview.history("todo").at(-1)).toMatchObject({ reason: "published_unhealthy", address_note: "the address is back on v1" });
  });

  test("when the address cannot be put back, the rejection and the history say so", async () => {
    await host.create("todo");
    const noPreview = makeHost(join(work, "apps"), space, { preview: false });
    edit("todo", "src/BOOT_FAILS", "x");
    space.refuse = (_name, dir) => dir.endsWith(join("versions", "v1"));
    const result = await noPreview.submit({ name: "todo", intent: "crash on start", agent: "codex" });

    expect(result).toMatchObject({ status: "rejected", reason: "published_unhealthy" });
    if (result.status !== "rejected") return;
    expect(result.detail).toContain("could not be put back on v1");
    expect(noPreview.history("todo").at(-1)!.address_note).toContain("may still serve the rejected build");
    expect((await noPreview.status("todo")).active_version).toBe("v1");
  });

  test("an undo that cannot republish says what the address still serves", async () => {
    await host.create("todo");
    edit("todo", "src/server.ts", "export const changed = true;\n");
    await host.submit({ name: "todo", intent: "tweak", agent: "codex" });
    space.refuse = (_name, dir) => dir.endsWith(join("versions", "v1"));

    await expect(host.undo("todo", "back")).rejects.toThrow("the address was not touched and still serves v2");
    expect((await host.status("todo")).active_version).toBe("v2");
    expect(readFileSync(app("todo", "src/server.ts"), "utf8")).toBe("export const changed = true;\n");
    expect(host.history("todo").at(-1)).toMatchObject({
      kind: "restore",
      outcome: "rejected",
      reason: "publish_failed",
      base_version: "v2",
      address_note: "the address was not touched and still serves v2",
    });
  });

  test("an undo whose older version goes up but does not come up puts the address back and is recorded", async () => {
    await host.create("todo");
    edit("todo", "src/extra.ts", "export const extra = 1;\n");
    await host.submit({ name: "todo", intent: "add a file", agent: "codex" });
    space.unhealthy = (_name, dir) => dir.endsWith(join("versions", "v1"));

    await expect(host.undo("todo", "back")).rejects.toThrow("the address is back on v2");
    expect(space.live.get("todo")).toMatchObject({ boots: true });
    expect(space.live.get("todo")!.files).toContain("src/extra.ts");
    expect((await host.status("todo")).active_version).toBe("v2");
    expect(existsSync(app("todo", "src/extra.ts"))).toBe(true);
    expect(host.history("todo").at(-1)).toMatchObject({
      kind: "restore",
      outcome: "rejected",
      reason: "published_unhealthy",
      base_version: "v2",
      address_note: "the address is back on v2",
    });
  });
});

// --- the change record, record mode, multi-level undo, one-way changes ------------------------------

/** A data snapshot capability that keeps its snapshots in memory and logs what it does to `events`. */
function fakeSnapshots(events: string[]) {
  const cap = {
    id: "fake-snapshot",
    failSnapshot: false,
    failRestore: false,
    taken: [] as string[],
    restored: [] as string[],
    setAsideNote: "The data in use now is kept in the fake's attic.",
    setAsideAfter: () => (cap.restored.length ? `The data that was in use is kept as attic-${cap.restored.length}.` : undefined),
    async snapshot({ version }: { appRoot: string; version: string }) {
      if (cap.failSnapshot) throw new Error("the disk is full");
      cap.taken.push(version);
      events.push(`snapshot ${version}`);
      return { ref: `snap-${cap.taken.length}` };
    },
    /** Like a real capability, it accepts only a ref it made; the record, which the agent can write, is not trusted. */
    refuse(ref: string): void {
      if (!cap.taken.some((_, i) => ref === `snap-${i + 1}`)) throw new Error(`the fake made no snapshot called ${ref}. Nothing was changed`);
    },
    async check({ ref }: { appRoot: string; ref: string }) {
      events.push(`check ${ref}`);
      cap.refuse(ref);
    },
    async restore({ ref }: { appRoot: string; ref: string }) {
      cap.refuse(ref);
      if (cap.failRestore) throw new Error("the snapshot is gone");
      cap.restored.push(ref);
      events.push(`restore ${ref}`);
    },
  };
  return cap satisfies HostDataSnapshot;
}

/** A plain framework capability: no word on where replaced data goes. */
function plainSnapshots(): DataSnapshotCapability & { restored: string[] } {
  const restored: string[] = [];
  return {
    id: "plain-snapshot",
    restored,
    snapshot: async () => ({ ref: "plain-1" }),
    restore: async ({ ref }) => void restored.push(ref),
  };
}

/** How the Host writes the time of a snapshot for a person: 2026-11-23 22:48 UTC. */
const readable = (iso: string) => `${iso.slice(0, 16).replace("T", " ")} UTC`;

const DROP_NOTE = "export const sql = `ALTER TABLE todos DROP COLUMN note`;\n";
const DROP_REASON = 'src/server.ts now runs "DROP" and "ALTER TABLE ... DROP/RENAME", which deletes or rewrites data that is already stored.';

/** Submit a column drop and have the owner approve it. */
async function approveOneWay(h: AppHost) {
  edit("todo", "src/server.ts", DROP_NOTE);
  const pending = await h.submit({ name: "todo", intent: "remove notes", agent: "claude-code" });
  if (pending.status !== "needs_approval") throw new Error(`expected needs_approval, got ${pending.status}`);
  return { pending, approved: await h.resolve("todo", pending.change_id, "approved", OWNER) };
}

async function hostError(promise: Promise<unknown>): Promise<HostError> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof HostError) return err;
    throw err;
  }
  throw new Error("expected a HostError");
}

/** Publish versions until `count` exist, each with its own src/server.ts. */
async function versions(h: AppHost, count: number) {
  for (let n = 2; n <= count; n++) {
    edit("todo", "src/server.ts", `export const version = ${n};\n`);
    expect(await h.submit({ name: "todo", intent: `make v${n}`, agent: "codex" })).toMatchObject({ status: "published", version: `v${n}` });
  }
}
const liveServer = () => space.live.get("todo")!.files.includes("src/server.ts");
const serverText = () => readFileSync(app("todo", "src/server.ts"), "utf8");

describe("the app is on the framework's change record", () => {
  test("create writes the record's own files, and the version counter is not in app.json", async () => {
    await host.create("todo");
    expect(JSON.parse(readFileSync(app("todo", ".pneuma/record.json"), "utf8"))).toEqual({ schema_version: 1, version_counter: 1, current_version: "v1" });
    expect(JSON.parse(readFileSync(app("todo", ".pneuma/app.json"), "utf8")).version_counter).toBeUndefined();
    expect(host.history("todo")[0]).toMatchObject({ kind: "create", version: "v1", guarantees: ["verified", "previewed", "approved", "sealed"] });
  });

  test("every entry says which guarantees held, and previewed only when a preview ran", async () => {
    await host.create("todo");
    edit("todo", "src/server.ts", "export const changed = 1;\n");
    expect(await host.submit({ name: "todo", intent: "tweak", agent: "codex" })).toMatchObject({ guarantees: ["verified", "previewed", "approved", "sealed"] });

    const noPreview = makeHost(join(work, "apps"), space, { preview: false });
    edit("todo", "src/server.ts", "export const changed = 2;\n");
    expect(await noPreview.submit({ name: "todo", intent: "tweak again", agent: "codex" })).toMatchObject({ guarantees: ["verified", "approved", "sealed"] });

    // Tests passed, the preview did not boot: verified held, previewed did not.
    edit("todo", "src/BOOT_FAILS", "x");
    await host.submit({ name: "todo", intent: "crash", agent: "codex" });
    expect(host.history("todo").at(-1)).toMatchObject({ outcome: "rejected", reason: "verify_failed", guarantees: ["verified"] });
    await host.discard("todo");

    edit("todo", "sdk/serve.ts", "// patched\n");
    await host.submit({ name: "todo", intent: "patch", agent: "codex" });
    expect(host.history("todo").at(-1)).toMatchObject({ outcome: "rejected", reason: "protected_file_changed", guarantees: [] });
  });

  test("a copy altered while it is published is not recorded, and the address goes back", async () => {
    await host.create("todo");
    edit("todo", "src/server.ts", "export const changed = true;\n");
    // Stands in for anything that writes into the copy while it goes out.
    space.onPublish = (name, dir) => name === "todo" && writeFileSync(join(dir, "src", "sneaked.ts"), "export const x = 1;\n");
    const result = await host.submit({ name: "todo", intent: "tweak", agent: "codex" });
    expect(result).toMatchObject({ status: "rejected", reason: "draft_changed_after_check" });
    expect(existsSync(app("todo", ".pneuma/versions/v2"))).toBe(false);
    expect((await host.status("todo")).active_version).toBe("v1");
    expect(host.history("todo").at(-1)).toMatchObject({ outcome: "rejected", guarantees: [], address_note: "the address is back on v1" });
  });
});

describe("record mode: the zero position of the dial", () => {
  let verified: string[];
  let recording: AppHost;
  beforeEach(() => {
    verified = [];
    recording = makeHost(join(work, "apps"), space, {
      governance: "record",
      runVerify: async (root) => {
        verified.push(root);
        return { ok: true, output: "tests passed" };
      },
    });
  });

  test("records and publishes what is on disk, checks nothing, approves nothing, and every entry says so", async () => {
    expect(await recording.create("todo")).toMatchObject({ status: "published", version: "v1", guarantees: [], approved_by: [] });
    // A protected file, a path outside the writable roots, destructive SQL and failing tests: nothing here looks.
    edit("todo", "sdk/serve.ts", "// patched\n");
    edit("todo", "lib/util.ts", "export const x = 1;\n");
    edit("todo", "src/server.ts", DROP_NOTE);
    edit("todo", "src/TEST_FAILS", "x");
    const result = await recording.submit({ name: "todo", intent: "anything goes", agent: "claude-code" });

    expect(result).toMatchObject({ status: "published", version: "v2", risks: [], approved_by: [], guarantees: [] });
    expect(verified).toEqual([]);
    expect(space.log.filter((line) => line.includes("-pv"))).toEqual([]);
    expect(space.live.get("todo")!.files).toContain("lib/util.ts");
    for (const entry of recording.history("todo")) {
      expect(entry.guarantees).toEqual([]);
      expect(entry.approval).toBeUndefined();
    }
    expect(recording.history("todo").at(-1)).toMatchObject({ kind: "change", outcome: "published", version: "v2", base_version: "v1", control: "agent-driven" });
    expect(recording.history("todo").at(-1)!.one_way).toBeUndefined();
    const status = await recording.status("todo");
    expect(status).toMatchObject({ governance: "record", active_version: "v2", serving_version: "v2", uncommitted: [] });
    expect(status.governance_note).toContain("Nothing checks or approves it");
  });

  test("no edit is still not a change", async () => {
    await recording.create("todo");
    expect(await recording.submit({ name: "todo", intent: "nothing", agent: "codex" })).toMatchObject({ status: "rejected", reason: "no_change" });
    expect(existsSync(app("todo", ".pneuma/versions/v2"))).toBe(false);
  });

  test("a refused publish keeps the version recorded, says what the address serves, and the next change goes on from it", async () => {
    await recording.create("todo");
    space.refuse = (name) => name === "todo";
    edit("todo", "src/extra.ts", "export const extra = 1;\n");
    const result = await recording.submit({ name: "todo", intent: "add a file", agent: "codex" });

    expect(result).toMatchObject({
      status: "release_failed",
      version: "v2",
      reason: "publish_failed",
      address_note: "the address was not touched and still serves v1",
      serving_version: "v1",
    });
    expect(existsSync(app("todo", ".pneuma/versions/v2/src/extra.ts"))).toBe(true);
    expect(space.live.get("todo")!.files).not.toContain("src/extra.ts");
    expect(await recording.status("todo")).toMatchObject({ active_version: "v2", serving_version: "v1", uncommitted: [] });
    expect(recording.history("todo").at(-1)).toMatchObject({ outcome: "release_failed", version: "v2", guarantees: [], address_note: "the address was not touched and still serves v1" });

    space.refuse = null;
    edit("todo", "src/more.ts", "export const more = 1;\n");
    expect(await recording.submit({ name: "todo", intent: "add another", agent: "codex" })).toMatchObject({ status: "published", version: "v3" });
    expect(recording.history("todo").at(-1)).toMatchObject({ version: "v3", base_version: "v2" });
    expect(await recording.status("todo")).toMatchObject({ active_version: "v3", serving_version: "v3" });
    expect(space.live.get("todo")!.files).toEqual(expect.arrayContaining(["src/extra.ts", "src/more.ts"]));
  });

  test("a build that does not answer is recorded, and the address goes back to what served", async () => {
    await recording.create("todo");
    edit("todo", "src/BOOT_FAILS", "x");
    const result = await recording.submit({ name: "todo", intent: "crash on start", agent: "codex" });
    expect(result).toMatchObject({ status: "release_failed", version: "v2", reason: "published_unhealthy", address_note: "the address is back on v1" });
    expect(space.live.get("todo")).toMatchObject({ boots: true });

    // Undo works here too: back to v1, which is what serves.
    expect(await recording.undo("todo", "back")).toMatchObject({ active_version: "v1", undone_version: "v2" });
    expect(existsSync(app("todo", "src/BOOT_FAILS"))).toBe(false);
  });

  test("the agent's own --one-way marks the change, and undo past it is refused like any one-way change", async () => {
    await recording.create("todo");
    edit("todo", "src/server.ts", DROP_NOTE);
    const result = await recording.submit({ name: "todo", intent: "drop notes", agent: "claude-code", oneWay: "drops the note column and its data" });
    expect(result).toMatchObject({ status: "published", version: "v2", one_way: "drops the note column and its data", guarantees: [] });
    expect(recording.history("todo").at(-1)!.one_way).toEqual({ reason: "drops the note column and its data" });

    const refused = await hostError(recording.undo("todo", "back"));
    expect(refused).toMatchObject({ status: 409, reason: "crosses_one_way_change" });
    expect(refused.message).toContain("v2: drops the note column and its data");
  });

  test("in record mode too, putting the data back past a one-way change waits for the owner", async () => {
    const cap = fakeSnapshots([]);
    const withData = makeHost(join(work, "apps"), space, { governance: "record", dataSnapshot: cap });
    await withData.create("todo");
    edit("todo", "src/server.ts", DROP_NOTE);
    expect(await withData.submit({ name: "todo", intent: "drop notes", agent: "claude-code", oneWay: "drops the note column and its data" })).toMatchObject({ status: "published", version: "v2" });
    expect(cap.taken).toEqual(["v1"]);

    expect(await hostError(withData.undo("todo", "back"))).toMatchObject({ status: 409, reason: "crosses_one_way_change", fields: { data_restore: "snapshot" } });
    expect(await hostError(withData.undo("todo", "back", { acceptOneWay: true, subject: "agent:claude-code" }))).toMatchObject({ status: 403 });
    expect(cap.restored).toEqual([]);
    expect(await withData.undo("todo", "back", { acceptOneWay: true, subject: OWNER })).toMatchObject({ active_version: "v1", data_restored: true, confirmed_by: OWNER });
    expect(withData.history("todo").at(-1)).toMatchObject({ one_way_crossed: { by: "data_restored" }, confirmed_by: OWNER, guarantees: [] });
  });

  test("one_way is refused in the governed modes: there the preset decides", async () => {
    await host.create("todo");
    edit("todo", "src/server.ts", "export const changed = true;\n");
    const err = await hostError(host.submit({ name: "todo", intent: "tweak", agent: "codex", oneWay: "drops data" }));
    expect(err.status).toBe(400);
    expect(err.message).toContain("one_way is for record mode only");
  });

  test("a host-driven change in record mode is recorded and brings the working tree up to it", async () => {
    await recording.create("todo");
    const lane = await agentLane("scripted", "show a note");
    expect(await recording.submit({ name: "todo", intent: "show a note", agent: "scripted", ...lane })).toMatchObject({ status: "published", version: "v2", guarantees: [] });
    expect(readFileSync(app("todo", "public/app/note.txt"), "utf8")).toBe("show a note\n");
    expect(recording.history("todo").at(-1)).toMatchObject({ control: "host-driven", version: "v2" });
  });
});

describe("undo walks back", () => {
  beforeEach(async () => void (await host.create("todo")));

  test("each undo goes one version further back, and a change after it takes a fresh number on the restored version", async () => {
    await versions(host, 4);
    expect(await host.undo("todo", "back")).toMatchObject({ active_version: "v3", undone_version: "v4", undone: ["v4"] });
    expect(serverText()).toBe("export const version = 3;\n");
    expect(await host.undo("todo", "further")).toMatchObject({ active_version: "v2", undone_version: "v3" });
    expect(serverText()).toBe("export const version = 2;\n");
    expect(await host.status("todo")).toMatchObject({ active_version: "v2", previous_version: "v1", serving_version: "v2", uncommitted: [] });
    expect(JSON.parse(readFileSync(app("todo", ".pneuma/release-rollout.json"), "utf8")).active.candidate_id).toBe("v2");

    edit("todo", "src/server.ts", "export const version = 5;\n");
    expect(await host.submit({ name: "todo", intent: "new direction", agent: "codex" })).toMatchObject({ status: "published", version: "v5" });
    expect(host.history("todo").at(-1)).toMatchObject({ version: "v5", base_version: "v2" });
    // v5 was built on v2, so going back from it lands on v2, not on v4.
    expect(await host.undo("todo", "not that either")).toMatchObject({ active_version: "v2", undone_version: "v5" });
    expect(liveServer()).toBe(true);
  });

  test("undo --to goes straight back along the versions the current one was built on, and nowhere else", async () => {
    await versions(host, 3);
    expect(await host.undo("todo", "start over", { to: "v1" })).toMatchObject({ active_version: "v1", undone_version: "v3", undone: ["v3", "v2"] });
    expect(serverText()).toBe(readFileSync(join(FIXTURE_TEMPLATE, "src", "server.ts"), "utf8"));
    expect(host.history("todo").at(-1)).toMatchObject({ kind: "restore", version: "v1", base_version: "v3", outcome: "rolled_back" });

    edit("todo", "src/server.ts", "export const version = 4;\n");
    await host.submit({ name: "todo", intent: "v4", agent: "codex" });
    // v3 is not behind v4 any more: bringing it back is a new change, not an undo.
    expect(await hostError(host.undo("todo", "back", { to: "v3" }))).toMatchObject({ status: 409, message: expect.stringContaining("v3 is not one of them") });
    expect(await hostError(host.undo("todo", "back", { to: "v9" }))).toMatchObject({ status: 404 });
    expect(await hostError(host.undo("todo", "back", { to: "v4" }))).toMatchObject({ status: 409, message: expect.stringContaining("already the current version") });
    expect((await host.status("todo")).active_version).toBe("v4");
  });

  test("a history with rejections, a waiting change and a denial in between still walks back correctly", async () => {
    await versions(host, 2);
    edit("todo", "src/TEST_FAILS", "x");
    expect(await host.submit({ name: "todo", intent: "break it", agent: "codex" })).toMatchObject({ status: "rejected", reason: "verify_failed" });
    await host.discard("todo");
    edit("todo", "src/server.ts", DROP_NOTE);
    const pending = await host.submit({ name: "todo", intent: "remove notes", agent: "codex" });
    if (pending.status !== "needs_approval") throw new Error("expected needs_approval");
    await host.resolve("todo", pending.change_id, "denied", OWNER, "keep the notes");
    await host.discard("todo");
    edit("todo", "src/server.ts", "export const version = 3;\n");
    expect(await host.submit({ name: "todo", intent: "make v3", agent: "codex" })).toMatchObject({ status: "published", version: "v3" });

    expect(host.history("todo").map((h) => [h.kind, h.outcome, h.version ?? "-", h.guarantees.join("+") || "none"])).toEqual([
      ["create", "published", "v1", "verified+previewed+approved+sealed"],
      ["change", "published", "v2", "verified+previewed+approved+sealed"],
      ["change", "rejected", "-", "none"],
      ["change", "needs_approval", "-", "verified+previewed"],
      ["decision", "denied", "-", "verified+previewed"],
      ["change", "published", "v3", "verified+previewed+approved+sealed"],
    ]);

    expect(await host.undo("todo", "back")).toMatchObject({ active_version: "v2", undone: ["v3"] });
    expect(serverText()).toBe("export const version = 2;\n");
    expect(await host.undo("todo", "back again")).toMatchObject({ active_version: "v1", undone: ["v2"] });
    await expect(host.undo("todo", "once more")).rejects.toThrow("v1 is the first version");
  });
});

describe("one-way changes", () => {
  beforeEach(async () => void (await host.create("todo")));

  test("the preset marks a destructive change one-way, and its release carries the reason", async () => {
    const { pending, approved } = await approveOneWay(host);
    expect(pending.disclosure).toContain(DROP_REASON);
    expect(approved).toMatchObject({ status: "published", version: "v2", one_way: DROP_REASON, guarantees: ["verified", "previewed", "approved", "sealed"] });
    expect(host.history("todo").at(-1)).toMatchObject({ kind: "decision", version: "v2", one_way: { reason: DROP_REASON } });

    // An ordinary change is not one-way.
    edit("todo", "src/extra.ts", "export const extra = 1;\n");
    await host.submit({ name: "todo", intent: "add a file", agent: "codex" });
    expect(host.history("todo").at(-1)!.one_way).toBeUndefined();
  });

  test("undo past it is refused in plain words that say only code would come back, and nothing moves", async () => {
    await approveOneWay(host);
    const steps = space.log.length;
    const entries = host.history("todo").length;

    const err = await hostError(host.undo("todo", "back"));
    expect(err).toMatchObject({ status: 409, reason: "crosses_one_way_change", detail: ["v2"], fields: { data_restore: "none" } });
    expect(err.message).toContain("Going back to v1 would undo a change that putting files back cannot undo:");
    expect(err.message).toContain(`v2: ${DROP_REASON}`);
    expect(err.message).toContain("This Host cannot put stored data back.");
    expect(err.message).toContain("stored data would stay as it is now, so v1 may not work with it: the older version may fail on today's data");
    expect(err.message).toContain("the owner's decision, and they have to confirm it");
    expect(space.log.length).toBe(steps);
    expect(host.history("todo")).toHaveLength(entries);
    expect((await host.status("todo")).active_version).toBe("v2");
    expect(serverText()).toBe(DROP_NOTE);
    // Going straight past it is refused the same way.
    expect(await hostError(host.undo("todo", "back", { to: "v1" }))).toMatchObject({ reason: "crosses_one_way_change" });
  });

  test("only the owner can confirm going back with code only, and the entry says who", async () => {
    await approveOneWay(host);
    for (const subject of ["agent:claude-code", AUTO_SUBJECT, undefined]) {
      expect(await hostError(host.undo("todo", "back", { acceptOneWay: true, subject }))).toMatchObject({ status: 403 });
    }
    expect((await host.status("todo")).active_version).toBe("v2");

    const result = await host.undo("todo", "the column is gone for good", { acceptOneWay: true, subject: OWNER, actor: "owner" });
    expect(result).toMatchObject({ active_version: "v1", confirmed_by: OWNER, data_restored: false });
    expect(result.set_aside).toBeUndefined();
    expect(host.history("todo").at(-1)).toMatchObject({
      kind: "restore",
      version: "v1",
      one_way_crossed: { versions: ["v2"], by: "accepted" },
      confirmed_by: OWNER,
      reason: `code and manifest only; stored data is left as it is, as ${OWNER} confirmed`,
      guarantees: [],
    });
    expect(space.live.get("todo")!.files).toContain("src/server.ts");
    expect(serverText()).not.toBe(DROP_NOTE);
  });

  test("with a data snapshot capability, the disclosure says so, and the data is saved right before the release", async () => {
    const events: string[] = [];
    const cap = fakeSnapshots(events);
    const withData = makeHost(join(work, "apps"), space, { dataSnapshot: cap });
    space.onPublish = (name) => void events.push(`publish ${name}`);
    const { pending, approved } = await approveOneWay(withData);

    expect(pending.disclosure.join(" ")).toContain("This Host declares a data snapshot capability (fake-snapshot)");
    expect(approved).toMatchObject({ status: "published", version: "v2" });
    // The preview went up while the change was checked; the snapshot comes after the approval, right before the release.
    expect(events.filter((line) => !line.includes("-pv"))).toEqual(["snapshot v1", "publish todo"]);
    const note = withData.history("todo").find((h) => h.kind === "snapshot");
    expect(note).toMatchObject({ version: "v1", data_ref: { capability: "fake-snapshot", ref: "snap-1" }, guarantees: [], outcome: "snapshot_taken" });
    expect((await withData.status("todo")).data_snapshot).toBe("fake-snapshot");

    // An ordinary change takes no snapshot.
    edit("todo", "src/extra.ts", "export const extra = 1;\n");
    await withData.submit({ name: "todo", intent: "add a file", agent: "codex" });
    expect(cap.taken).toEqual(["v1"]);
  });

  test("a snapshot that fails stops the release", async () => {
    const cap = fakeSnapshots([]);
    cap.failSnapshot = true;
    const withData = makeHost(join(work, "apps"), space, { dataSnapshot: cap });
    edit("todo", "src/server.ts", DROP_NOTE);
    const pending = await withData.submit({ name: "todo", intent: "remove notes", agent: "claude-code" });
    if (pending.status !== "needs_approval") throw new Error("expected needs_approval");
    const steps = space.log.length;

    const result = await withData.resolve("todo", pending.change_id, "approved", OWNER);
    expect(result).toMatchObject({ status: "rejected", reason: "data_snapshot_failed" });
    if (result.status !== "rejected") return;
    expect(result.detail).toContain("the disk is full");
    expect(space.log.length).toBe(steps);
    expect(existsSync(app("todo", ".pneuma/versions/v2"))).toBe(false);
    expect((await withData.status("todo")).active_version).toBe("v1");
    expect(withData.history("todo").at(-1)).toMatchObject({ kind: "decision", outcome: "rejected", reason: "data_snapshot_failed", guarantees: ["verified", "previewed", "approved"] });
  });

  test("with a snapshot, an unconfirmed undo is refused: it says the data returns to the snapshot, what is set aside and where, and touches nothing", async () => {
    const events: string[] = [];
    const cap = fakeSnapshots(events);
    const withData = makeHost(join(work, "apps"), space, { dataSnapshot: cap });
    await approveOneWay(withData);
    const taken = withData.history("todo").find((h) => h.kind === "snapshot")!.at;
    const steps = space.log.length;
    const entries = withData.history("todo").length;
    events.length = 0;

    // Putting the data back throws away what was stored since, so it interrupts the person like going back without it.
    const err = await hostError(withData.undo("todo", "bring the notes back"));
    expect(err).toMatchObject({ status: 409, reason: "crosses_one_way_change", detail: ["v2"], fields: { data_restore: "snapshot" } });
    expect(err.message).toContain(`v2: ${DROP_REASON}`);
    // The snapshot is named, so the owner can see what would be copied in.
    expect(err.message).toContain(`This Host can put stored data back (fake-snapshot). The stored data would return to the snapshot snap-1, taken before v2 at ${readable(taken)}.`);
    expect(err.message).toContain("Everything stored since then would be set aside and would not be in the app. The data in use now is kept in the fake's attic.");
    expect(err.message).not.toContain("may not work with it");
    expect(err.message).toContain("the owner's decision, and they have to confirm it");
    expect(events).toEqual([]);
    expect(cap.restored).toEqual([]);
    expect(space.log.length).toBe(steps);
    expect(withData.history("todo")).toHaveLength(entries);
    expect((await withData.status("todo")).active_version).toBe("v2");
    expect(serverText()).toBe(DROP_NOTE);
  });

  test("with a snapshot, a confirmation by anyone but the owner is turned away with 403, and nothing is touched", async () => {
    const cap = fakeSnapshots([]);
    const withData = makeHost(join(work, "apps"), space, { dataSnapshot: cap });
    await approveOneWay(withData);
    for (const subject of ["agent:claude-code", AUTO_SUBJECT, undefined]) {
      const err = await hostError(withData.undo("todo", "back", { acceptOneWay: true, subject }));
      expect(err.status).toBe(403);
      expect(err.message).toContain("only the owner decides");
    }
    expect(cap.restored).toEqual([]);
    expect((await withData.status("todo")).active_version).toBe("v2");
  });

  test("the owner's confirmation puts the older code out first, then the data, then looks again; the entry names who confirmed and where the old data went", async () => {
    const events: string[] = [];
    const cap = fakeSnapshots(events);
    const withData = makeHost(join(work, "apps"), space, { dataSnapshot: cap });
    await approveOneWay(withData);
    // What the address serves at each step: a request then wakes whatever build is released.
    space.onPublish = (name, dir) => void (name === "todo" && events.push(`publish ${basename(dir)}`));
    const probe = space.probe.bind(space);
    space.probe = async (name) => (events.push(`probe ${name}`), probe(name));
    events.length = 0;

    const result = await withData.undo("todo", "bring the notes back", { acceptOneWay: true, subject: OWNER });
    expect(result).toMatchObject({ active_version: "v1", data_restored: true, confirmed_by: OWNER, set_aside: "The data that was in use is kept as attic-1." });
    // When the data comes back, the release is already v1: the build that dropped the column cannot wake on it.
    // The ref is checked before anything is released.
    expect(events).toEqual(["check snap-1", "publish v1", "probe todo", "restore snap-1", "probe todo"]);
    expect(withData.history("todo").at(-1)).toMatchObject({
      kind: "restore",
      version: "v1",
      one_way_crossed: { versions: ["v2"], by: "data_restored", data_ref: { capability: "fake-snapshot", ref: "snap-1" } },
      confirmed_by: OWNER,
      set_aside: "The data that was in use is kept as attic-1.",
      reason: `code, manifest and stored data: the data was put back to the snapshot snap-1, saved before v2, as ${OWNER} confirmed`,
      guarantees: [],
    });
    expect(serverText()).not.toBe(DROP_NOTE);
  });

  test("a capability that took no snapshot before the change cannot put this data back, and the refusal says so", async () => {
    // The change was released before this Host had the capability.
    await approveOneWay(host);
    const late = makeHost(join(work, "apps"), space, { dataSnapshot: fakeSnapshots([]) });
    const err = await hostError(late.undo("todo", "back"));
    expect(err).toMatchObject({ status: 409, fields: { data_restore: "none" } });
    expect(err.message).toContain("This Host can put stored data back (fake-snapshot), but it took no snapshot before v2, so it cannot put this data back.");
    expect(err.message).toContain("Only the code of v1 would come back.");
    expect(await late.undo("todo", "back", { acceptOneWay: true, subject: OWNER })).toMatchObject({ data_restored: false, confirmed_by: OWNER });
  });

  test("a plain framework capability works too; the refusal then has no word on where the old data goes", async () => {
    const cap = plainSnapshots();
    const withData = makeHost(join(work, "apps"), space, { dataSnapshot: cap });
    await approveOneWay(withData);
    const err = await hostError(withData.undo("todo", "back"));
    expect(err.message).toContain("Everything stored since then would be set aside and would not be in the app.\n");
    const result = await withData.undo("todo", "back", { acceptOneWay: true, subject: OWNER });
    expect(result).toMatchObject({ data_restored: true, confirmed_by: OWNER });
    expect(result.set_aside).toBeUndefined();
    expect(cap.restored).toEqual(["plain-1"]);
  });

  test("a data restore that fails after the older code went out puts the address back on what served, and the record stays", async () => {
    const cap = fakeSnapshots([]);
    const withData = makeHost(join(work, "apps"), space, { dataSnapshot: cap });
    await approveOneWay(withData);
    cap.failRestore = true;
    const published: string[] = [];
    space.onPublish = (name, dir) => void (name === "todo" && published.push(basename(dir)));

    const err = await hostError(withData.undo("todo", "back", { acceptOneWay: true, subject: OWNER }));
    expect(err).toMatchObject({ status: 502, reason: "data_restore_failed" });
    expect(err.message).toContain("the snapshot is gone");
    // The Host says only what it knows; what happened to the data is in the capability's own words.
    expect(err.message).toContain("The undo stopped there: v1's code had gone out first, and the address is back on v2. The record was not changed.");
    expect(published).toEqual(["v1", "v2"]);
    expect(space.live.get("todo")).toMatchObject({ boots: true });
    expect((await withData.status("todo")).active_version).toBe("v2");
    expect(serverText()).toBe(DROP_NOTE);
    expect(withData.history("todo").at(-1)).toMatchObject({
      kind: "restore",
      outcome: "rejected",
      reason: "data_restore_failed",
      target_version: "v1",
      address_note: "v1's code had gone out first; the address is back on v2",
    });
  });

  test("a snapshot ref the capability did not make is refused before any publish: nothing changes, and the refusal says so", async () => {
    const events: string[] = [];
    const cap = fakeSnapshots(events);
    const withData = makeHost(join(work, "apps"), space, { dataSnapshot: cap });
    await approveOneWay(withData);
    // The agent can write the record: it points the snapshot at something the capability never made.
    const history = app("todo", ".pneuma", "history.jsonl");
    const lines = readFileSync(history, "utf8");
    expect(lines).toContain('"ref":"snap-1"');
    writeFileSync(history, lines.replaceAll('"ref":"snap-1"', '"ref":"snap_billing_v1"'));
    const recorded = withData.history("todo").length;
    const published: string[] = [];
    space.onPublish = (name, dir) => void (name === "todo" && published.push(basename(dir)));
    const steps = space.log.length;
    events.length = 0;

    const err = await hostError(withData.undo("todo", "back", { acceptOneWay: true, subject: OWNER }));
    expect(err).toMatchObject({ status: 409, reason: "data_snapshot_refused", detail: ["snap_billing_v1"] });
    expect(err.message).toBe(
      "the stored data cannot be put back to the snapshot snap_billing_v1 (the fake made no snapshot called snap_billing_v1. Nothing was changed). " +
        "The undo was refused before anything happened: no code was released, no data was touched, and the record was not changed.",
    );
    expect(events).toEqual(["check snap_billing_v1"]);
    expect(published).toEqual([]);
    expect(space.log.length).toBe(steps);
    expect(cap.restored).toEqual([]);
    expect((await withData.status("todo")).active_version).toBe("v2");
    expect(serverText()).toBe(DROP_NOTE);
    expect(withData.history("todo")).toHaveLength(recorded);
  });

  test("the older code not published: no data is touched, and the record stays", async () => {
    const cap = fakeSnapshots([]);
    const withData = makeHost(join(work, "apps"), space, { dataSnapshot: cap });
    await approveOneWay(withData);
    space.refuse = (_name, dir) => dir.endsWith(join("versions", "v1"));

    const err = await hostError(withData.undo("todo", "back", { acceptOneWay: true, subject: OWNER }));
    expect(err).toMatchObject({ status: 502, reason: "publish_failed" });
    expect(err.message).toContain("the address was not touched and still serves v2");
    expect(err.message).toContain("stored data was not touched");
    expect(cap.restored).toEqual([]);
    expect((await withData.status("todo")).active_version).toBe("v2");
    expect(withData.history("todo").at(-1)).toMatchObject({ kind: "restore", outcome: "rejected", reason: "publish_failed" });
  });

  test("the app does not answer once its data is back: the newer code is not put back, the record names what is in place, and the undo fails saying so", async () => {
    const cap = fakeSnapshots([]);
    const withData = makeHost(join(work, "apps"), space, { dataSnapshot: cap });
    await approveOneWay(withData);
    const restore = cap.restore;
    cap.restore = async (input) => {
      await restore(input);
      space.live.get("todo")!.boots = false;
    };
    const published: string[] = [];
    space.onPublish = (name, dir) => void (name === "todo" && published.push(basename(dir)));

    const err = await hostError(withData.undo("todo", "back", { acceptOneWay: true, subject: OWNER }));
    expect(err).toMatchObject({ status: 502, reason: "unhealthy_after_data_restore" });
    expect(err.message).toContain("Stored data was put back to the snapshot snap-1 and v1's code is released, but after the data came back v1 did not answer (GET / -> 502 did not start).");
    expect(err.message).toContain("v2's code was not put back: it must not run on the restored data.");
    expect(err.message).toContain("The data that was in use is kept as attic-1.");
    // Only v1 went out; nothing put v2 back.
    expect(published).toEqual(["v1"]);
    expect(await withData.status("todo")).toMatchObject({ active_version: "v1", serving_version: "v1" });
    expect(withData.history("todo").at(-1)).toMatchObject({
      kind: "restore",
      version: "v1",
      outcome: "rolled_back",
      one_way_crossed: { by: "data_restored" },
      address_note: "v1 did not answer after the data came back (GET / -> 502 did not start)",
    });
  });

  test.skipIf(process.getuid?.() === 0)("data back but the record cannot be written: the address stays on the older code, and the error says how to finish", async () => {
    const cap = fakeSnapshots([]);
    const withData = makeHost(join(work, "apps"), space, { dataSnapshot: cap });
    await approveOneWay(withData);
    const state = app("todo", ".pneuma");
    const restore = cap.restore;
    cap.restore = async (input) => {
      await restore(input);
      // Stands in for a disk that refuses the record's write once the data is back.
      chmodSync(state, 0o555);
    };
    const published: string[] = [];
    space.onPublish = (name, dir) => void (name === "todo" && published.push(basename(dir)));
    let err: HostError;
    try {
      err = await hostError(withData.undo("todo", "back", { acceptOneWay: true, subject: OWNER }));
    } finally {
      chmodSync(state, 0o755);
    }
    expect(err).toMatchObject({ status: 500, reason: "record_failed" });
    expect(err.message).toContain("v1's code and the stored data of the snapshot snap-1 are live, but the record could not be written");
    expect(err.message).toContain("v2's code was not put back: it must not run on the restored data");
    expect(err.message).toContain("Do not submit before that");
    expect(published).toEqual(["v1"]);
  });
});

describe("switching the dial from record to a governed mode", () => {
  const recordingHost = () => makeHost(join(work, "apps"), space, { governance: "record" });

  test("guardrails loosened in record mode do not loosen the governed modes", async () => {
    const recording = recordingHost();
    await recording.create("todo");
    const scaffold = JSON.parse(readFileSync(app("todo", "pneuma.scaffold.json"), "utf8"));
    scaffold.artifact_boundary.protected_paths = [];
    scaffold.artifact_boundary.writable_roots.push("sdk");
    for (const check of scaffold.guardrails.pre_proposal) if (check.kind === "command") check.command = "true";
    edit("todo", "pneuma.scaffold.json", JSON.stringify(scaffold, null, 2));
    expect(await recording.submit({ name: "todo", intent: "loosen the rules", agent: "codex" })).toMatchObject({ status: "published", version: "v2" });

    const commands: string[] = [];
    const governed = makeHost(join(work, "apps"), space, {
      runVerify: async (_root, command) => {
        commands.push(command);
        return { ok: true, output: "tests passed" };
      },
    });
    edit("todo", "sdk/serve.ts", "// patched\n");
    expect(await governed.submit({ name: "todo", intent: "patch the sdk", agent: "codex" })).toMatchObject({ status: "rejected", reason: "protected_file_changed" });
    await governed.discard("todo");
    edit("todo", "src/server.ts", "export const changed = true;\n");
    expect(await governed.submit({ name: "todo", intent: "tweak", agent: "codex" })).toMatchObject({ status: "published" });
    // The Host's own verify command ran, not the one the record-mode version carries.
    const overlay = JSON.parse(readFileSync(join(EXAMPLE, "overlay", "pneuma.scaffold.json"), "utf8"));
    expect(commands).toEqual([overlay.guardrails.pre_proposal.find((check: { kind: string }) => check.kind === "command").command]);
  });

  test("a change recorded in record mode that never went live is checked before a governed change takes it live", async () => {
    const recording = recordingHost();
    await recording.create("todo");
    space.refuse = (name) => name === "todo";
    edit("todo", "src/server.ts", DROP_NOTE);
    expect(await recording.submit({ name: "todo", intent: "drop notes", agent: "codex" })).toMatchObject({ status: "release_failed", version: "v2" });
    space.refuse = null;

    edit("todo", "src/extra.ts", "export const extra = 1;\n");
    const pending = await host.submit({ name: "todo", intent: "add a file", agent: "codex" });
    expect(pending).toMatchObject({ status: "needs_approval", risks: expect.arrayContaining(["destructive_definition"]) });
    if (pending.status !== "needs_approval") return;
    expect(pending.disclosure).toContain(DROP_REASON);
    expect(pending.changed_paths).toEqual(["src/extra.ts", "src/server.ts"]);
    const approved = await host.resolve("todo", pending.change_id, "approved", OWNER);
    expect(approved).toMatchObject({ status: "published", version: "v3", one_way: DROP_REASON });
    expect(host.history("todo").at(-1)).toMatchObject({ version: "v3", base_version: "v2" });
  });
});

describe("recorded but not live", () => {
  const recordingHost = (extra: Partial<AppHostOptions> = {}) => makeHost(join(work, "apps"), space, { governance: "record", ...extra });
  /** Record mode: v2 adds src/extra.ts and is refused at publish, so it is recorded and the address stays on v1. */
  async function refusedV2(recording: AppHost) {
    await recording.create("todo");
    space.refuse = (name) => name === "todo";
    edit("todo", "src/extra.ts", "export const extra = 1;\n");
    expect(await recording.submit({ name: "todo", intent: "add a file", agent: "codex" })).toMatchObject({ status: "release_failed", version: "v2" });
    space.refuse = null;
    expect(await recording.status("todo")).toMatchObject({ active_version: "v2", serving_version: "v1" });
  }

  test("when the address could not be put back, status says so instead of naming a version it did not see answer", async () => {
    const recording = recordingHost();
    await recording.create("todo");
    // The platform takes every publish and then no build answers: the new one fails, and so does putting v1 back.
    space.unhealthy = () => true;
    edit("todo", "src/extra.ts", "export const extra = 1;\n");
    expect(await recording.submit({ name: "todo", intent: "add a file", agent: "codex" })).toMatchObject({ status: "release_failed", version: "v2" });

    const stuck = await recording.status("todo");
    expect(stuck).toMatchObject({ active_version: "v2", serving_version: "v1" });
    expect(stuck.serving_uncertain).toContain("could not be put back on v1");
    // list and the overview page say it the way status does, and name no version as served.
    expect(recording.summaries()[0]).toMatchObject({ serves_other_version: true, serving_uncertain: stuck.serving_uncertain });
    const page = renderPage(await recording.overview());
    expect(page).toContain(`the last release of v2 did not go live, and ${esc(stuck.serving_uncertain)}`);
    expect(page).toContain("<dt>The address serves</dt><dd>unknown ");
    expect(page).not.toContain("the address serves v1");

    // Once a release has answered, the Host has seen what serves, and the note is gone.
    space.unhealthy = null;
    expect(await recording.submit({ name: "todo", intent: "add a file", agent: "codex" })).toMatchObject({ status: "published", version: "v2", released_as_is: true });
    const settled = await recording.status("todo");
    expect(settled).toMatchObject({ active_version: "v2", serving_version: "v2" });
    expect(settled.serving_uncertain).toBeUndefined();
    expect(recording.summaries()[0]!).not.toHaveProperty("serving_uncertain");
    // The summary's last change is the release that went live, not the attempt that failed before it.
    expect(recording.summaries()[0]).toMatchObject({ last_change: { kind: "release", outcome: "published", version: "v2" } });
  });

  test("record mode: the same submit again, with no new edits, releases that version as it is and records no new one", async () => {
    const recording = recordingHost();
    await refusedV2(recording);

    const result = await recording.submit({ name: "todo", intent: "add a file", agent: "codex" });
    expect(result).toMatchObject({ status: "published", version: "v2", released_as_is: true, changed_paths: ["src/extra.ts"], guarantees: [] });
    expect(existsSync(app("todo", ".pneuma/versions/v3"))).toBe(false);
    expect(space.live.get("todo")!.files).toContain("src/extra.ts");
    expect(await recording.status("todo")).toMatchObject({ active_version: "v2", serving_version: "v2", uncommitted: [] });
    expect(recording.history("todo").at(-1)).toMatchObject({ kind: "release", outcome: "published", version: "v2", base_version: "v1", guarantees: [] });
    // Once it is live, the same submit is no change again.
    expect(await recording.submit({ name: "todo", intent: "again", agent: "codex" })).toMatchObject({ status: "rejected", reason: "no_change" });
  });

  test("a governed mode: a submit with no new edits takes the recorded version through every gate and releases it, with no new version and no 500", async () => {
    await refusedV2(recordingHost());

    const result = await host.submit({ name: "todo", intent: "release it", agent: "codex" });
    expect(result).toMatchObject({
      status: "published",
      version: "v2",
      released_as_is: true,
      changed_paths: ["src/extra.ts"],
      risks: ["source_code_change"],
      approved_by: [AUTO_SUBJECT],
      guarantees: ["verified", "previewed", "approved", "sealed"],
    });
    expect(existsSync(app("todo", ".pneuma/versions/v3"))).toBe(false);
    expect(space.live.get("todo")!.files).toContain("src/extra.ts");
    expect(await host.status("todo")).toMatchObject({ active_version: "v2", serving_version: "v2" });
    expect(host.history("todo").at(-1)).toMatchObject({ kind: "release", outcome: "published", version: "v2", guarantees: ["verified", "previewed", "approved", "sealed"] });
  });

  test("a governed mode still holds back what it would hold back: the recorded column drop waits for the owner, and approving it releases v2 as it is, marked one-way", async () => {
    const recording = recordingHost();
    await recording.create("todo");
    space.refuse = (name) => name === "todo";
    edit("todo", "src/server.ts", DROP_NOTE);
    await recording.submit({ name: "todo", intent: "drop notes", agent: "codex" });
    space.refuse = null;

    const pending = await host.submit({ name: "todo", intent: "release it", agent: "codex" });
    expect(pending).toMatchObject({ status: "needs_approval", risks: expect.arrayContaining(["destructive_definition"]) });
    if (pending.status !== "needs_approval") return;
    const approved = await host.resolve("todo", pending.change_id, "approved", OWNER);
    expect(approved).toMatchObject({ status: "published", version: "v2", released_as_is: true, one_way: DROP_REASON });
    expect(host.history("todo").at(-1)).toMatchObject({ kind: "release", version: "v2", one_way: { reason: DROP_REASON } });
    expect(await hostError(host.undo("todo", "back"))).toMatchObject({ reason: "crosses_one_way_change", detail: ["v2"] });
  });

  test("a one-way version whose snapshot failed stays recorded and not live, and the next release, of any kind, takes the snapshot first", async () => {
    const events: string[] = [];
    const cap = fakeSnapshots(events);
    const recording = recordingHost({ dataSnapshot: cap });
    await recording.create("todo");
    cap.failSnapshot = true;
    edit("todo", "src/server.ts", DROP_NOTE);
    const failed = await recording.submit({ name: "todo", intent: "drop notes", agent: "codex", oneWay: "drops the note column and its data" });
    expect(failed).toMatchObject({ status: "release_failed", version: "v2", reason: "data_snapshot_failed", serving_version: "v1" });
    expect(space.live.get("todo")!.files).not.toContain("src/extra.ts");
    expect(serverText()).toBe(DROP_NOTE);
    expect(await recording.status("todo")).toMatchObject({ active_version: "v2", serving_version: "v1" });

    // Saving works again. An ordinary edit, not one-way itself, takes v2 live with it, so the snapshot comes first.
    cap.failSnapshot = false;
    space.onPublish = (name) => void (name === "todo" && events.push("publish todo"));
    edit("todo", "src/extra.ts", "export const extra = 1;\n");
    expect(await recording.submit({ name: "todo", intent: "add a file", agent: "codex" })).toMatchObject({ status: "published", version: "v3" });
    expect(events).toEqual(["snapshot v1", "publish todo"]);
    expect(recording.history("todo").find((h) => h.kind === "snapshot")).toMatchObject({ version: "v1", data_ref: { capability: "fake-snapshot", ref: "snap-1" } });

    // Going back past v2 can now put the data back.
    const undone = await recording.undo("todo", "bring the notes back", { to: "v1", acceptOneWay: true, subject: OWNER });
    expect(undone).toMatchObject({ active_version: "v1", data_restored: true });
    expect(cap.restored).toEqual(["snap-1"]);
  });

  test("the same submit again after a failed snapshot releases the one-way version as it is, snapshot first", async () => {
    const events: string[] = [];
    const cap = fakeSnapshots(events);
    const recording = recordingHost({ dataSnapshot: cap });
    await recording.create("todo");
    cap.failSnapshot = true;
    edit("todo", "src/server.ts", DROP_NOTE);
    await recording.submit({ name: "todo", intent: "drop notes", agent: "codex", oneWay: "drops the note column and its data" });

    cap.failSnapshot = false;
    const result = await recording.submit({ name: "todo", intent: "drop notes", agent: "codex" });
    expect(result).toMatchObject({ status: "published", version: "v2", released_as_is: true, one_way: "drops the note column and its data" });
    expect(cap.taken).toEqual(["v1"]);
    expect(await recording.status("todo")).toMatchObject({ active_version: "v2", serving_version: "v2" });
  });

  test("a snapshot that fails again leaves the version recorded and not live, and says so", async () => {
    const cap = fakeSnapshots([]);
    const recording = recordingHost({ dataSnapshot: cap });
    await recording.create("todo");
    cap.failSnapshot = true;
    edit("todo", "src/server.ts", DROP_NOTE);
    await recording.submit({ name: "todo", intent: "drop notes", agent: "codex", oneWay: "drops the note column and its data" });
    const again = await recording.submit({ name: "todo", intent: "drop notes", agent: "codex" });
    expect(again).toMatchObject({ status: "release_failed", version: "v2", reason: "data_snapshot_failed", address_note: "the address was not touched and still serves v1" });
    expect(existsSync(app("todo", ".pneuma/versions/v3"))).toBe(false);
    expect(recording.history("todo").at(-1)).toMatchObject({ kind: "release", outcome: "release_failed", version: "v2", reason: "data_snapshot_failed" });
  });

  test("a governed release of new content on top of a one-way version that never went live takes the snapshot before that version", async () => {
    const cap = fakeSnapshots([]);
    const recording = recordingHost({ dataSnapshot: cap });
    await recording.create("todo");
    cap.failSnapshot = true;
    edit("todo", "src/server.ts", DROP_NOTE);
    await recording.submit({ name: "todo", intent: "drop notes", agent: "codex", oneWay: "drops the note column and its data" });
    cap.failSnapshot = false;

    const governed = makeHost(join(work, "apps"), space, { dataSnapshot: cap });
    edit("todo", "src/extra.ts", "export const extra = 1;\n");
    const pending = await governed.submit({ name: "todo", intent: "add a file", agent: "codex" });
    if (pending.status !== "needs_approval") throw new Error(`expected needs_approval, got ${pending.status}`);
    expect(await governed.resolve("todo", pending.change_id, "approved", OWNER)).toMatchObject({ status: "published", version: "v3" });
    expect(cap.taken).toEqual(["v1"]);
    expect(governed.history("todo").find((h) => h.kind === "snapshot")).toMatchObject({ version: "v1" });
  });
});

describe("a record that cannot be written after a publish", () => {
  /** Makes the record refuse new versions once the release of `name` (not a preview, not an undo) has gone out. */
  const refuseVersionsAfterPublish = (name: string) => {
    space.onPublish = (published, dir) => {
      if (published === name && !dir.includes(join(".pneuma", "versions"))) chmodSync(app(name, ".pneuma", "versions"), 0o555);
    };
  };
  const allowVersions = (name: string) => existsSync(app(name, ".pneuma", "versions")) && chmodSync(app(name, ".pneuma", "versions"), 0o755);

  test.skipIf(process.getuid?.() === 0)("a governed change puts the address back and answers with a reason, not a bare error", async () => {
    await host.create("todo");
    edit("todo", "src/extra.ts", "export const extra = 1;\n");
    refuseVersionsAfterPublish("todo");
    let err: HostError;
    try {
      err = await hostError(host.submit({ name: "todo", intent: "add a file", agent: "codex" }));
    } finally {
      allowVersions("todo");
    }
    expect(err).toMatchObject({ status: 500, reason: "record_failed" });
    expect(err.message).toContain("the address is back on v1");
    expect(space.live.get("todo")!.files).not.toContain("src/extra.ts");
    expect(await host.status("todo")).toMatchObject({ active_version: "v1", serving_version: "v1" });
    expect(host.history("todo").at(-1)).toMatchObject({ outcome: "rejected", reason: "record_failed", address_note: "the address is back on v1" });
  });

  test.skipIf(process.getuid?.() === 0)("record mode does the same", async () => {
    const recording = makeHost(join(work, "apps"), space, { governance: "record" });
    await recording.create("todo");
    edit("todo", "src/extra.ts", "export const extra = 1;\n");
    refuseVersionsAfterPublish("todo");
    let err: HostError;
    try {
      err = await hostError(recording.submit({ name: "todo", intent: "add a file", agent: "codex" }));
    } finally {
      allowVersions("todo");
    }
    expect(err).toMatchObject({ status: 500, reason: "record_failed" });
    expect(err.message).toContain("the address is back on v1");
    expect(space.live.get("todo")!.files).not.toContain("src/extra.ts");
    expect(await recording.status("todo")).toMatchObject({ active_version: "v1", serving_version: "v1" });
  });

  test.skipIf(process.getuid?.() === 0)("create takes the app down again, so neither the app nor the name is left behind", async () => {
    space.onPublish = (published, dir) => {
      if (published === "todo" && !dir.includes("-pv")) {
        mkdirSync(app("todo", ".pneuma", "versions"), { recursive: true });
        chmodSync(app("todo", ".pneuma", "versions"), 0o555);
      }
    };
    let err: HostError;
    try {
      err = await hostError(host.create("todo"));
    } finally {
      allowVersions("todo");
    }
    expect(err).toMatchObject({ status: 500, reason: "record_failed" });
    expect(err.message).toContain("todo was removed from PneumaSpace again");
    expect(space.live.has("todo")).toBe(false);
    expect(existsSync(app("todo"))).toBe(false);
    space.onPublish = null;
    expect(await host.create("todo")).toMatchObject({ status: "published", version: "v1" });
  });
});

describe("what the review of this change found", () => {
  beforeEach(async () => void (await host.create("todo")));

  test("a waiting change an earlier Host saved is marked one-way when it is read, and the owner is told the cost", async () => {
    edit("todo", "src/server.ts", DROP_NOTE);
    const submitted = await host.submit({ name: "todo", intent: "remove notes", agent: "claude-code" });
    if (submitted.status !== "needs_approval") throw new Error("expected needs_approval");
    // Rewrite the waiting change the way the earlier Host saved it: no one_way, no cost line.
    const file = app("todo", ".pneuma", "pending", `${submitted.change_id}.json`);
    const saved = JSON.parse(readFileSync(file, "utf8"));
    delete saved.one_way;
    saved.disclosure = saved.disclosure.filter((line: string) => !line.startsWith("What approving costs"));
    writeFileSync(file, JSON.stringify(saved));

    const [waiting] = (await host.status("todo")).pending;
    expect(waiting).toMatchObject({ one_way: DROP_REASON });
    expect(waiting!.disclosure.join(" ")).toContain("What approving costs");
    expect(await host.resolve("todo", submitted.change_id, "approved", OWNER)).toMatchObject({ status: "published", one_way: DROP_REASON });
    expect(await hostError(host.undo("todo", "back"))).toMatchObject({ reason: "crosses_one_way_change" });
  });

  test("a create whose copy is altered while it is published is not recorded, and the name is free again", async () => {
    const other = new FakeSpace();
    const fresh = makeHost(join(work, "other-apps"), other);
    other.onPublish = (name, dir) => name === "fresh" && !dir.includes("-pv") && writeFileSync(join(dir, "src", "sneaked.ts"), "export const x = 1;\n");
    expect(await fresh.create("fresh")).toMatchObject({ status: "rejected", reason: "draft_changed_after_check" });
    expect(other.live.has("fresh")).toBe(false);
    expect(existsSync(join(work, "other-apps", "fresh"))).toBe(false);
  });

  test.skipIf(process.getuid?.() === 0)("an undo whose older version went out but could not be recorded puts the address back and says so", async () => {
    edit("todo", "src/extra.ts", "export const extra = 1;\n");
    await host.submit({ name: "todo", intent: "add a file", agent: "codex" });
    const state = app("todo", ".pneuma");
    // Stands in for a disk that refuses the record's write once v1 has gone out.
    space.onPublish = (name, dir) => name === "todo" && dir.endsWith(join("versions", "v1")) && chmodSync(state, 0o555);
    try {
      const err = await hostError(host.undo("todo", "back"));
      expect(err).toMatchObject({ status: 500, reason: "record_failed" });
      expect(err.message).toContain("the address is back on v2");
      expect(space.live.get("todo")!.files).toContain("src/extra.ts");
    } finally {
      chmodSync(state, 0o755);
    }
    expect((await host.status("todo")).active_version).toBe("v2");
  });
});

describe("app directories made before the change record", () => {
  /** An app as an earlier Host left it: versions v1-v3, the address back on v2 after an undo, and app.json holding the counter. */
  async function legacyApp(name: string, rollout: boolean, v2 = "export const version = 2;\n"): Promise<string> {
    const root = app(name);
    cpSync(FIXTURE_TEMPLATE, root, { recursive: true });
    installOverlay(root, join(EXAMPLE, "overlay"), join(EXAMPLE, "bin", "pneuma.mjs"));
    const versionsDir = join(root, ".pneuma", "versions");
    put(root, "src/server.ts", "export const version = 1;\n");
    snapshot(root, join(versionsDir, "v1"));
    put(root, "src/server.ts", v2);
    snapshot(root, join(versionsDir, "v2"));
    put(root, "src/server.ts", "export const version = 3;\n");
    snapshot(root, join(versionsDir, "v3"));
    restoreWorkingTree(join(versionsDir, "v2"), root);
    const thread = await createFileBuildThreadStore({ workspace: root }).startThread({ profile_id: "space-isolate", app_id: name, builder_user_id: OWNER });
    put(root, ".pneuma/app.json", JSON.stringify({ schema_version: 1, app_id: name, scaffold_id: "space-isolate", owner: OWNER, thread_id: thread.thread_id, created_at: "2026-11-01T00:00:00.000Z", version_counter: 3 }));
    const line = (fields: Record<string, unknown>) => JSON.stringify({ at: "2026-11-01T00:00:00.000Z", agent: "codex", control: "agent-driven", ...fields });
    put(
      root,
      ".pneuma/history.jsonl",
      [
        line({ change_id: "a", kind: "create", outcome: "published", intent: "create", version: "v1", agent: "host", control: "owner" }),
        line({ change_id: "b", kind: "change", outcome: "rejected", intent: "broken", base_version: "v1", reason: "verify_failed" }),
        line({ change_id: "c", kind: "change", outcome: "published", intent: "v2", base_version: "v1", version: "v2" }),
        line({ change_id: "d", kind: "change", outcome: "published", intent: "v3", base_version: "v2", version: "v3" }),
        line({ change_id: "e", kind: "undo", outcome: "rolled_back", intent: "back", base_version: "v3", version: "v2", control: "owner" }),
      ].join("\n") + "\n",
    );
    if (rollout) {
      const instance = (id: string) => ({ candidate_id: id, image_tag: `${name}:${id}`, status: "healthy", checks: [], created_at_ms: 1, updated_at_ms: 1 });
      put(root, ".pneuma/release-rollout.json", JSON.stringify({ active: instance("v2"), previous: instance("v3"), timeline: [], created_at_ms: 1, updated_at_ms: 1 }));
    }
    return root;
  }

  test("are put on the record on first open: the counter from app.json, the current version from what the address serves", async () => {
    const root = await legacyApp("todo", true);
    await space.publish("todo", join(root, ".pneuma", "versions", "v2"));

    expect(await host.status("todo")).toMatchObject({ active_version: "v2", previous_version: "v1", serving_version: "v2", uncommitted: [] });
    expect(JSON.parse(readFileSync(join(root, ".pneuma/record.json"), "utf8"))).toEqual({ schema_version: 1, version_counter: 3, current_version: "v2" });
    expect(JSON.parse(readFileSync(join(root, ".pneuma/app.json"), "utf8"))).not.toHaveProperty("version_counter");
    // Old lines never said what held, so they read as nothing guaranteed.
    expect(host.history("todo").map((h) => h.guarantees)).toEqual([[], [], [], [], []]);

    edit("todo", "src/server.ts", "export const version = 4;\n");
    expect(await host.submit({ name: "todo", intent: "go on", agent: "claude-code" })).toMatchObject({ status: "published", version: "v4" });
    expect(host.history("todo").at(-1)).toMatchObject({ version: "v4", base_version: "v2" });
    expect(await host.undo("todo", "back")).toMatchObject({ active_version: "v2" });
    expect(await host.undo("todo", "back again")).toMatchObject({ active_version: "v1" });
  });

  test("a version the preset finds one-way is declared so when the app is put on the record, once", async () => {
    // v2 is the column drop of the live run: released by the earlier Host, which had no way to say it was one-way.
    await legacyApp("todo", true, DROP_NOTE);
    const declared = () => host.history("todo").filter((h) => h.kind === "declaration");
    expect(declared()).toHaveLength(1);
    expect(declared()[0]).toMatchObject({ version: "v2", one_way: { reason: DROP_REASON }, guarantees: [], outcome: "one_way_declared" });

    const err = await hostError(host.undo("todo", "back"));
    expect(err).toMatchObject({ status: 409, reason: "crosses_one_way_change" });
    expect(err.message).toContain(`v2: ${DROP_REASON}`);
    // Opening it again declares nothing more.
    await host.status("todo");
    expect(declared()).toHaveLength(1);
  });

  test("without a rollout state, the highest version is taken as current", async () => {
    const root = await legacyApp("todo", false);
    expect((await host.status("todo")).active_version).toBe("v3");
    expect(JSON.parse(readFileSync(join(root, ".pneuma/record.json"), "utf8"))).toMatchObject({ version_counter: 3, current_version: "v3" });
  });
});

describe("the data snapshot seam", () => {
  test("nothing named is none; a name no implementation has stops the Host at start", () => {
    expect(dataSnapshotFromEnv({})).toBeUndefined();
    expect(dataSnapshotFromEnv({ PNEUMA_DATA_SNAPSHOT: "" })).toBeUndefined();
    expect(() => dataSnapshotFromEnv({ PNEUMA_DATA_SNAPSHOT: "space-state" })).toThrow('PNEUMA_DATA_SNAPSHOT names "space-state"');
    expect(() => dataSnapshotFromEnv({ PNEUMA_DATA_SNAPSHOT: "space-state" })).toThrow("known: postgres-template");
  });
});

describe("the app's copy of the CLI", () => {
  test("a copy left by an earlier Host is replaced when the app is next opened, and no version sees it", async () => {
    await host.create("todo");
    const copy = app("todo", ".pneuma", "pneuma.mjs");
    const current = readFileSync(join(EXAMPLE, "bin", "pneuma.mjs"), "utf8");
    writeFileSync(copy, "// a CLI from an earlier Host\n");

    const status = await host.status("todo");

    expect(readFileSync(copy, "utf8")).toBe(current);
    expect(status.uncommitted).toEqual([]);
  });
});

describe("the Host records its own address in what it manages", () => {
  const read = (file: string) => JSON.parse(readFileSync(file, "utf8")) as { url: string; scope: string; recorded_at: string };

  test("create writes it into the app, and opening the app under another address rewrites it", async () => {
    const first = makeHost(join(work, "apps"), space, { hostUrl: "http://127.0.0.1:48363" });
    await first.create("todo");
    const file = app("todo", ".pneuma", "host.json");
    const recorded = read(file);
    expect(recorded).toMatchObject({ url: "http://127.0.0.1:48363", scope: "app" });

    await first.status("todo");
    expect(read(file).recorded_at).toBe(recorded.recorded_at);

    const moved = makeHost(join(work, "apps"), space, { hostUrl: "http://127.0.0.1:9999" });
    const status = await moved.status("todo");
    expect(read(file).url).toBe("http://127.0.0.1:9999");
    // .pneuma/ is not part of any version.
    expect(status.uncommitted).toEqual([]);
  });

  test("at start it writes the apps directory and every app in it, and brings each app's CLI copy up to this Host's", async () => {
    await host.create("one");
    await host.create("two");
    expect(existsSync(app("one", ".pneuma", "host.json"))).toBe(false);
    // A copy from a Host before the address record: it would never read host.json.
    writeFileSync(app("two", ".pneuma", "pneuma.mjs"), "// a CLI from an earlier Host\n");
    makeHost(join(work, "apps"), space, { hostUrl: "http://127.0.0.1:8090" }).announce();
    expect(read(join(work, "apps", ".pneuma", "host.json"))).toMatchObject({ url: "http://127.0.0.1:8090", scope: "apps" });
    for (const name of ["one", "two"]) expect(read(app(name, ".pneuma", "host.json"))).toMatchObject({ url: "http://127.0.0.1:8090", scope: "app" });
    expect(readFileSync(app("two", ".pneuma", "pneuma.mjs"), "utf8")).toBe(readFileSync(join(EXAMPLE, "bin", "pneuma.mjs"), "utf8"));
    expect(host.list()).toEqual(["one", "two"]);
  });

  test("bun run serve outside the container derives its address from where it listens; PNEUMA_HOST_URL wins", () => {
    expect(hostUrlFromEnv({}, "127.0.0.1", 8090)).toBe("http://127.0.0.1:8090");
    expect(hostUrlFromEnv({}, "0.0.0.0", 48363)).toBe("http://127.0.0.1:48363");
    expect(hostUrlFromEnv({}, "::", 8090)).toBe("http://[::1]:8090");
    expect(hostUrlFromEnv({ PNEUMA_HOST_URL: "http://127.0.0.1:48363/" }, "0.0.0.0", 8090)).toBe("http://127.0.0.1:48363");
    expect(() => hostUrlFromEnv({ PNEUMA_HOST_URL: "ftp://127.0.0.1:8090" }, "0.0.0.0", 8090)).toThrow("PNEUMA_HOST_URL must be an http:// or https:// address");
    expect(() => hostUrlFromEnv({ PNEUMA_HOST_URL: "not a url" }, "0.0.0.0", 8090)).toThrow("PNEUMA_HOST_URL is not a URL");
  });
});

describe("what the test check covered", () => {
  const testScript = (name: string) => (JSON.parse(readFileSync(app(name, "package.json"), "utf8")) as { scripts: { test: string } }).scripts.test;
  const npmTest = (entry: { checks?: readonly { id: string; coverage?: unknown }[] }) => entry.checks!.find((check) => check.id === "npm-test")!;

  test("a new app's npm test runs tests under src/ as well as the SDK's; an existing app's package.json is not rewritten", async () => {
    await host.create("todo");
    expect(testScript("todo")).toBe("node --test 'sdk/*.test.ts' 'src/**/*.test.ts'");
    expect(readFileSync(app("todo", ".pneuma", "versions", "v1", "package.json"), "utf8")).toContain("src/**/*.test.ts");

    // An app made before: its script runs the SDK's tests only. Opening it leaves that alone; package.json is the agent's.
    const older = `${JSON.stringify({ name: "pneuma-space-app", scripts: { test: "node --test 'sdk/*.test.ts'" } }, null, 2)}\n`;
    edit("todo", "package.json", older);
    await host.status("todo");
    expect(readFileSync(app("todo", "package.json"), "utf8")).toBe(older);
  });

  test("the npm-test check records how many tests ran and how many are the app's own, and the result warns when app code had none", async () => {
    const counted = makeHost(join(work, "apps"), space, { runVerify: (root) => templateTests(root) });
    await counted.create("todo");
    expect(npmTest(counted.history("todo")[0]!).coverage).toMatchObject({ tests: 2, app_tests: 0 });

    edit("todo", "src/server.ts", "export const timer = 25;\n");
    const untested = await counted.submit({ name: "todo", intent: "a timer", agent: "codex" });
    expect(untested).toMatchObject({ status: "published", tests: { tests: 2, test_files: 2, app_tests: 0, app_test_files: 0 } });
    expect(untested.status === "published" && untested.test_warning).toStartWith("warning: this change touched app code (src/server.ts) and none of the app's own tests ran.");
    expect(npmTest(counted.history("todo").at(-1)!).coverage).toMatchObject({
      tests: 2,
      app_tests: 0,
      note: "2 tests ran in 2 files, all of them the SDK's (sdk/); none of the app's own.",
    });

    edit("todo", "src/server.test.ts", "// a request-level test\n");
    edit("todo", "src/server.ts", "export const timer = 50;\n");
    const tested = await counted.submit({ name: "todo", intent: "a longer timer", agent: "codex" });
    expect(tested).toMatchObject({ status: "published", tests: { tests: 3, app_tests: 1, app_test_files: 1 } });
    expect(tested.status === "published" && tested.test_warning).toBeUndefined();

    // A change that touches no app code carries no warning, whatever ran.
    const manifest = JSON.parse(readFileSync(app("todo", "pneuma-space.json"), "utf8"));
    manifest.capabilities.db = {};
    edit("todo", "pneuma-space.json", JSON.stringify(manifest));
    const manifestOnly = await counted.submit({ name: "todo", intent: "store todos", agent: "codex" });
    expect(manifestOnly).toMatchObject({ status: "published", tests: { app_tests: 1 } });
    expect(manifestOnly.status === "published" && manifestOnly.test_warning).toBeUndefined();
  });

  test("a waiting change carries the warning too, so the owner reads it before approving", async () => {
    const counted = makeHost(join(work, "apps"), space, { runVerify: (root) => templateTests(root) });
    await counted.create("todo");
    edit("todo", "src/server.ts", "export const sql = 'DROP TABLE todos';\n");
    const waiting = await counted.submit({ name: "todo", intent: "start over", agent: "codex" });
    expect(waiting).toMatchObject({ status: "needs_approval", tests: { app_tests: 0 } });
    expect(waiting.status === "needs_approval" && waiting.test_warning).toStartWith("warning: this change touched app code (src/server.ts)");
  });
});

describe("every app at a glance, and the directory that holds them", () => {
  test("one summary per app: version, address, last change, waiting changes, uncommitted files, and an address serving another version", async () => {
    await host.create("calm");
    await host.create("waits");
    edit("waits", "src/server.ts", "export const sql = 'DROP TABLE todos';\n");
    const waiting = await host.submit({ name: "waits", intent: "start over", agent: "codex" });
    await host.create("dirty");
    edit("dirty", "src/server.ts", "export const draft = true;\n");
    await host.create("broken");
    writeFileSync(app("broken", ".pneuma", "app.json"), "{ not json");

    const summaries = host.summaries();
    expect(summaries.map((s) => s.app_id)).toEqual(["broken", "calm", "dirty", "waits"]);
    expect(summaries[0]).toMatchObject({ app_id: "broken", error: expect.stringContaining("JSON") });
    expect(summaries[1]).toMatchObject({
      app_id: "calm",
      active_version: "v1",
      address: "http://space.test/apps/calm/",
      serving_version: "v1",
      serves_other_version: false,
      last_change: { kind: "create", outcome: "published", version: "v1", agent: "host", intent: "Create the app from the PneumaSpace template" },
      pending: [],
      uncommitted: [],
    });
    expect(summaries[2]).toMatchObject({ app_id: "dirty", uncommitted: ["src/server.ts"] });
    expect(summaries[3]).toMatchObject({
      app_id: "waits",
      last_change: { kind: "change", outcome: "needs_approval", agent: "codex", intent: "start over" },
      pending: [{ change_id: waiting.change_id, intent: "start over", agent: "codex", risks: expect.arrayContaining(["destructive_definition"]) }],
    });
    const waits = summaries[3]!;
    expect("pending" in waits && waits.pending[0]!.disclosure.length).toBeGreaterThan(0);
  });

  test("a release that did not go live shows as an address serving another version", async () => {
    const recording = makeHost(join(work, "apps"), space, { governance: "record" });
    await recording.create("free");
    space.refuse = (name) => name === "free";
    edit("free", "src/server.ts", "export const n = 2;\n");
    await recording.submit({ name: "free", intent: "two", agent: "codex" });
    expect(recording.summaries()[0]).toMatchObject({ active_version: "v2", serving_version: "v1", serves_other_version: true, last_change: { outcome: "release_failed" } });
  });

  test("the apps directory gets an AGENTS.md block, a CLAUDE.md and a copy of the CLI, each rewritten only when stale", async () => {
    const appsDir = join(work, "apps");
    mkdirSync(appsDir, { recursive: true });
    writeFileSync(join(appsDir, "AGENTS.md"), "My own notes about these apps.\n");
    writeFileSync(join(appsDir, "CLAUDE.md"), "Mine.\n");
    const logged: string[] = [];
    const announced = makeHost(appsDir, space, { hostUrl: "http://127.0.0.1:48363", log: (line) => logged.push(line) });
    announced.announce();

    const agents = readFileSync(join(appsDir, "AGENTS.md"), "utf8");
    expect(agents).toStartWith("<!-- pneuma-host:begin");
    expect(agents).toContain("The Host is at http://127.0.0.1:48363");
    expect(agents).toContain("`node .pneuma/pneuma.mjs list`");
    expect(agents).toContain("`node .pneuma/pneuma.mjs create <name>`");
    expect(agents).toContain("follow its own `AGENTS.md`. A change goes live only through that app's `submit`");
    expect(agents).toEndWith("My own notes about these apps.\n");
    expect(readFileSync(join(appsDir, "CLAUDE.md"), "utf8")).toBe("Mine.\n");
    expect(readFileSync(join(appsDir, ".pneuma", "pneuma.mjs"), "utf8")).toBe(readFileSync(join(EXAMPLE, "bin", "pneuma.mjs"), "utf8"));

    logged.length = 0;
    announced.announce();
    expect(logged).toEqual([]);

    // Another address: the block is replaced, once, and the person's text stays.
    writeFileSync(join(appsDir, ".pneuma", "pneuma.mjs"), "// an older CLI\n");
    makeHost(appsDir, space, { hostUrl: "http://127.0.0.1:9999" }).announce();
    const moved = readFileSync(join(appsDir, "AGENTS.md"), "utf8");
    expect(moved.split("pneuma-host:begin").length).toBe(2);
    expect(moved).toContain("The Host is at http://127.0.0.1:9999");
    expect(moved).not.toContain("48363");
    expect(moved).toEndWith("My own notes about these apps.\n");
    expect(readFileSync(join(appsDir, ".pneuma", "pneuma.mjs"), "utf8")).not.toBe("// an older CLI\n");
    // None of it is an app.
    expect(announced.list()).toEqual([]);
  });

  test("a fresh apps directory gets a CLAUDE.md that points at AGENTS.md", async () => {
    makeHost(join(work, "apps"), space, { hostUrl: "http://127.0.0.1:8090" }).announce();
    expect(readFileSync(join(work, "apps", "CLAUDE.md"), "utf8").trim()).toBe("@AGENTS.md");
  });
});
