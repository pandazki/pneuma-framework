import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { coverAppTests } from "../src/artifact";
import { runCommand } from "../src/space";
import { runCheckCommand, testCoverage, testWarning, withJunitReport } from "../src/test-coverage";

// The shapes below are what Node's test runner printed in this repository's checks (Node 22, 24 and 26):
// the spec summary on stdout and, with a second reporter, a JUnit report. Node 24 and later name each
// test's file in the report; Node 22 does not.
const ROOT = "/tmp/pneuma-check-AbC123";
const spec = (tests: number) =>
  `\n> test\n> node --test 'sdk/*.test.ts' 'src/**/*.test.ts'\n\n✔ one (0.3ms)\nℹ tests ${tests}\nℹ suites 0\nℹ pass ${tests}\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 88.5`;
const junit = (files: readonly (string | null)[]) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<testsuites>\n${files
    .map((file, i) => `\t<testcase name="t${i}" time="0.0003" classname="test"${file === null ? "" : ` file="${file}"`}/>`)
    .join("\n")}\n\t<!-- tests ${files.length} -->\n</testsuites>\n`;

describe("what the test check covered, read from the runner's report", () => {
  test("Node 24 and later: the tests, the files, and how many are the app's own", () => {
    const coverage = testCoverage(
      { ok: true, output: spec(4), report: junit([`${ROOT}/sdk/serve.test.ts`, `${ROOT}/sdk/serve.test.ts`, `${ROOT}/sdk/db.test.ts`, `${ROOT}/src/server.test.ts`]) },
      ROOT,
    );
    expect(coverage).toEqual({
      tests: 4,
      test_files: 3,
      app_tests: 1,
      app_test_files: 1,
      note: "4 tests ran in 3 files. The app's own: 1 test in 1 file; the rest are the SDK's (sdk/).",
    });
  });

  test("only the SDK's tests ran: none of the app's own, said plainly", () => {
    const coverage = testCoverage({ ok: true, output: spec(2), report: junit([`${ROOT}/sdk/serve.test.ts`, `${ROOT}/sdk/db.test.ts`]) }, ROOT);
    expect(coverage).toMatchObject({ tests: 2, app_tests: 0, app_test_files: 0 });
    expect(coverage.note).toBe("2 tests ran in 2 files, all of them the SDK's (sdk/); none of the app's own.");
  });

  test("Node 22: the report names no files, so the app's share is unknown, not guessed", () => {
    const coverage = testCoverage({ ok: true, output: spec(2), report: junit([null, null]) }, ROOT);
    expect(coverage).toMatchObject({ tests: 2, test_files: "unknown", app_tests: "unknown", app_test_files: "unknown" });
    expect(coverage.note).toContain("2 tests ran; how many of them are the app's own is unknown: the runner's per-file report does not name each test's file");
  });

  test("no report, a report that disagrees with the summary, or no summary at all: unknown", () => {
    expect(testCoverage({ ok: true, output: spec(3) }, ROOT)).toMatchObject({ tests: 3, app_tests: "unknown" });
    expect(testCoverage({ ok: true, output: spec(3), report: junit([`${ROOT}/src/a.test.ts`]) }, ROOT)).toMatchObject({ tests: 3, app_tests: "unknown" });
    const none = testCoverage({ ok: true, output: "tests passed" }, ROOT);
    expect(none).toEqual({
      tests: "unknown",
      test_files: "unknown",
      app_tests: "unknown",
      app_test_files: "unknown",
      note: "What the test check ran is unknown: its output has no test runner summary this Host can read.",
    });
    // Two runs in one command print two summaries; which one the report belongs to is not guessed.
    expect(testCoverage({ ok: true, output: `${spec(2)}\n${spec(1)}`, report: junit([`${ROOT}/src/a.test.ts`]) }, ROOT).tests).toBe("unknown");
    // A file outside the directory the check ran in is not classified.
    expect(testCoverage({ ok: true, output: spec(1), report: junit(["/elsewhere/src/a.test.ts"]) }, ROOT).app_tests).toBe("unknown");
  });

  test("a TAP summary and a coloured spec summary are read too; no tests is zero of the app's own", () => {
    expect(testCoverage({ ok: true, output: "1..2\n# tests 2\n# pass 2" }, ROOT).tests).toBe(2);
    expect(testCoverage({ ok: true, output: "\u001b[34mℹ tests 5\u001b[39m" }, ROOT).tests).toBe(5);
    expect(testCoverage({ ok: true, output: spec(0) }, ROOT)).toMatchObject({ tests: 0, app_tests: 0, note: "No tests ran." });
  });

  test("a warning only when a change touched app code and none of the app's own tests ran; a note when that is unknown", () => {
    const sdkOnly = testCoverage({ ok: true, output: spec(1), report: junit([`${ROOT}/sdk/serve.test.ts`]) }, ROOT);
    const withApp = testCoverage({ ok: true, output: spec(1), report: junit([`${ROOT}/src/a.test.ts`]) }, ROOT);
    const unknown = testCoverage({ ok: true, output: "tests passed" }, ROOT);
    expect(testWarning(["src/server.ts", "public/app/main.js"], sdkOnly)).toBe(
      "warning: this change touched app code (src/server.ts, public/app/main.js) and none of the app's own tests ran. Add a test under src/ (a *.test.ts file); AGENTS.md shows the smallest one.",
    );
    expect(testWarning(["src/server.ts"], withApp)).toBeUndefined();
    expect(testWarning(["pneuma-space.json", "package.json"], sdkOnly)).toBeUndefined();
    expect(testWarning(["src/server.ts"], unknown)).toStartWith("note: this change touched app code (src/server.ts); whether any of the app's own tests ran is unknown.");
    expect(testWarning(["src/a.ts", "src/b.ts", "src/c.ts", "src/d.ts", "src/e.ts"], sdkOnly)).toContain("(src/a.ts, src/b.ts, src/c.ts and 2 more)");
  });

  test("the report is asked for beside the runner's usual output, keeping any NODE_OPTIONS already set", () => {
    expect(withJunitReport(undefined, "/tmp/r/junit.xml")).toBe(
      "--test-reporter=spec --test-reporter-destination=stdout --test-reporter=junit --test-reporter-destination=/tmp/r/junit.xml",
    );
    expect(withJunitReport("--max-old-space-size=512", "/tmp/a b/junit.xml")).toStartWith("--max-old-space-size=512 --test-reporter=spec");
    expect(withJunitReport(undefined, "/tmp/a b/junit.xml")).toEndWith('--test-reporter-destination="/tmp/a b/junit.xml"');
  });
});

describe("against Node's real test runner", () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "pneuma-coverage-"));
    mkdirSync(join(root, "sdk"));
    mkdirSync(join(root, "src"));
    writeFileSync(join(root, "sdk", "a.test.mjs"), "import test from 'node:test';\ntest('sdk one', () => {});\ntest('sdk two', () => {});\n");
    writeFileSync(join(root, "src", "b.test.mjs"), "import { describe, it } from 'node:test';\ndescribe('app', () => { it('app one', () => {}); });\n");
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  // Plain .mjs files and explicit paths, so any Node with the test runner's reporters runs them. Which Node
  // that is depends on the machine: from 24 on its report names the files, before that the app's share is unknown.
  test("the check counts what the runner ran, and says unknown where the runner does not name the files", async () => {
    const run = await runCheckCommand(root, "node --test sdk/a.test.mjs src/b.test.mjs", 60_000);
    expect(run.ok).toBe(true);
    const coverage = testCoverage(run, root);
    expect(coverage.tests).toBe(3);
    const major = Number((await runCommand(["node", "-p", "process.versions.node.split('.')[0]"])).output);
    if (major >= 24) {
      expect(coverage).toMatchObject({ test_files: 2, app_tests: 1, app_test_files: 1 });
    } else {
      expect(coverage).toMatchObject({ test_files: "unknown", app_tests: "unknown" });
    }
  }, 60_000);
});

describe("a new app's npm test runs the app's own tests", () => {
  let root: string;
  beforeEach(() => (root = mkdtempSync(join(tmpdir(), "pneuma-package-"))));
  afterEach(() => rmSync(root, { recursive: true, force: true }));
  const write = (pkg: unknown) => writeFileSync(join(root, "package.json"), `${JSON.stringify(pkg, null, 2)}\n`);
  const script = () => (JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as { scripts: { test: string } }).scripts.test;

  test("the template's script gains the src/ pattern once; running it again changes nothing", () => {
    write({ name: "pneuma-space-app", private: true, type: "module", engines: { node: ">=24" }, scripts: { start: "node src/server.ts", test: "node --test 'sdk/*.test.ts'" } });
    expect(coverAppTests(root)).toBe(true);
    expect(script()).toBe("node --test 'sdk/*.test.ts' 'src/**/*.test.ts'");
    const after = readFileSync(join(root, "package.json"), "utf8");
    expect(coverAppTests(root)).toBe(false);
    expect(readFileSync(join(root, "package.json"), "utf8")).toBe(after);
    expect(JSON.parse(after)).toMatchObject({ engines: { node: ">=24" }, scripts: { start: "node src/server.ts" } });
  });

  test("a template that already covers src/, or runs something other than node --test, is left as it is", () => {
    write({ scripts: { test: 'node --test "sdk/*.test.ts" "src/**/*.test.ts"' } });
    expect(coverAppTests(root)).toBe(false);
    write({ scripts: { test: "vitest run" } });
    expect(coverAppTests(root)).toBe(false);
    expect(script()).toBe("vitest run");
  });
});
