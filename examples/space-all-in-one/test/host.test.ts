import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { validateScaffoldProjectManifest } from "@pneuma-framework/core/host-authoring";
import { agentLane } from "../src/agents";
import { AppHost, HostError, type AppHostOptions } from "../src/host";
import { AUTO_SUBJECT, loadRiskPolicy } from "../src/policy";
import { FakeSpace } from "./fake-space";

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
const edit = (name: string, rel: string, content: string) => {
  mkdirSync(join(app(name, rel), ".."), { recursive: true });
  writeFileSync(app(name, rel), content);
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
    expect(result.disclosure.join(" ")).toContain("Undo restores code only");
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
    expect(host.history("todo").at(-1)).toMatchObject({ kind: "undo", outcome: "rolled_back", version: "v1", base_version: "v2" });

    // The undone version stays as "previous", so a second undo is a redo.
    expect((await host.undo("todo", "changed my mind")).active_version).toBe("v2");
  });

  test("there is nothing to undo on a fresh app", async () => {
    await host.create("todo");
    await expect(host.undo("todo", "oops")).rejects.toThrow("previous release is required");
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
  });
});

