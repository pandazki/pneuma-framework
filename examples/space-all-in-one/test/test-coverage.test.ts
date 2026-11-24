import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runCheckCommand, testCoverage, testWarning, withJunitReport } from "../src/test-coverage";

// The shapes below are what Node's test runner printed in this repository's checks (Node 22, 24 and 26):
// the spec summary on stdout and, with a second reporter, a JUnit report. Node 24 and later name each
// test's file in the report; Node 22 does not.
const ROOT = "/tmp/pneuma-check-AbC123";
const spec = (tests: number) =>
  `\n> test\n> node --test 'sdk/*.test.ts' 'src/**/*.test.ts'\n\n✔ one (0.3ms)\nℹ tests ${tests}\nℹ suites 0\nℹ pass ${tests}\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 88.5`;
const junit = (files: readonly (string | null)[], skipped: readonly string[] = []) =>
  `<?xml version="1.0" encoding="utf-8"?>\n<testsuites>\n${files
    .map((file, i) => `\t<testcase name="t${i}" time="0.0003" classname="test"${file === null ? "" : ` file="${file}"`}/>`)
    .concat(skipped.map((file, i) => `\t<testcase name="s${i}" time="0.0001" classname="test" file="${file}">\n\t\t<skipped type="skipped" message="true"/>\n\t</testcase>`))
    .join("\n")}\n\t<!-- tests ${files.length} -->\n</testsuites>\n`;

describe("what the test check covered, read from the runner's report", () => {
  test("Node 24 and later: the tests, the files, and how many are the app's own", () => {
    const coverage = testCoverage(
      { ok: true, output: spec(4), report: junit([`${ROOT}/sdk/serve.test.ts`, `${ROOT}/sdk/serve.test.ts`, `${ROOT}/sdk/db.test.ts`, `${ROOT}/src/server.test.ts`]) },
      ROOT,
    );
    expect(coverage).toEqual({
      tests: 4,
      skipped: 0,
      test_files: 3,
      app_tests: 1,
      app_test_files: 1,
      src_test_files: [],
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
      skipped: "unknown",
      test_files: "unknown",
      app_tests: "unknown",
      app_test_files: "unknown",
      src_test_files: [],
      note: "What the test check ran is unknown: its output has no test runner summary this Host can read.",
    });
    // Two runs in one command print two summaries; which one the report belongs to is not guessed.
    expect(testCoverage({ ok: true, output: `${spec(2)}\n${spec(1)}`, report: junit([`${ROOT}/src/a.test.ts`]) }, ROOT).tests).toBe("unknown");
    // A file outside the directory the check ran in is not classified.
    expect(testCoverage({ ok: true, output: spec(1), report: junit(["/elsewhere/src/a.test.ts"]) }, ROOT).app_tests).toBe("unknown");
  });

  test("a TAP summary and a coloured spec summary are read too; no tests is zero of the app's own", () => {
    expect(testCoverage({ ok: true, output: "1..2\n# tests 2\n# pass 2\n# skipped 0\n# todo 0" }, ROOT).tests).toBe(2);
    expect(testCoverage({ ok: true, output: "\u001b[34mℹ tests 5\u001b[39m\n\u001b[34mℹ skipped 0\u001b[39m\n\u001b[34mℹ todo 0\u001b[39m" }, ROOT).tests).toBe(5);
    expect(testCoverage({ ok: true, output: spec(0) }, ROOT)).toMatchObject({ tests: 0, app_tests: 0, note: "No tests ran." });
  });

  test("skipped and todo tests did not run: they are left out of every count, and the note says how many", () => {
    // What Node 24 and 26 print for 2 tests that ran and 2 that did not: "tests" counts all four.
    const output = "ℹ tests 4\nℹ suites 0\nℹ pass 2\nℹ fail 0\nℹ cancelled 0\nℹ skipped 1\nℹ todo 1\nℹ duration_ms 50";
    const coverage = testCoverage({ ok: true, output, report: junit([`${ROOT}/sdk/serve.test.ts`, `${ROOT}/src/a.test.ts`], [`${ROOT}/src/a.test.ts`, `${ROOT}/src/a.test.ts`]) }, ROOT);
    expect(coverage).toMatchObject({ tests: 2, skipped: 2, test_files: 2, app_tests: 1, app_test_files: 1 });
    expect(coverage.note).toBe("2 tests ran in 2 files. The app's own: 1 test in 1 file; the rest are the SDK's (sdk/). 2 more tests were skipped or todo.");

    // Only skipped app tests: none of the app's own ran.
    const skippedOnly = testCoverage({ ok: true, output: "ℹ tests 2\nℹ skipped 1\nℹ todo 0", report: junit([`${ROOT}/sdk/serve.test.ts`], [`${ROOT}/src/a.test.ts`]) }, ROOT);
    expect(skippedOnly).toMatchObject({ tests: 1, skipped: 1, app_tests: 0 });

    // A summary that does not say how many were skipped cannot say how many ran.
    expect(testCoverage({ ok: true, output: "# tests 2\n# pass 2" }, ROOT)).toMatchObject({ tests: "unknown", skipped: "unknown" });
  });

  test("test files under src/ that did not run are named, in the note and in the warning", () => {
    const root = mkdtempSync(join(tmpdir(), "pneuma-unran-"));
    try {
      mkdirSync(join(root, "src", "lib"), { recursive: true });
      mkdirSync(join(root, "src", "node_modules", "x"), { recursive: true });
      writeFileSync(join(root, "src", "server.test.ts"), "");
      writeFileSync(join(root, "src", "lib", "timer.test.mjs"), "");
      writeFileSync(join(root, "src", "node_modules", "x", "x.test.js"), "");
      writeFileSync(join(root, "src", "server.ts"), "");
      const coverage = testCoverage({ ok: true, output: spec(1), report: junit([`${root}/sdk/serve.test.ts`]) }, root);
      expect(coverage.src_test_files).toEqual(["src/lib/timer.test.mjs", "src/server.test.ts"]);
      expect(coverage.note).toBe("1 test ran in 1 file, all of them the SDK's (sdk/); none of the app's own. src/ has test files that did not run: src/lib/timer.test.mjs, src/server.test.ts.");
      expect(testWarning(["src/server.ts"], coverage)).toBe(
        "warning: this change touched app code (src/server.ts) and none of the app's own tests ran, although src/ has test files (src/lib/timer.test.mjs, src/server.test.ts). Check that the test script in package.json runs them and that they are not skipped.",
      );
      // When they ran, nothing is said about them.
      const ran = testCoverage({ ok: true, output: spec(1), report: junit([`${root}/src/server.test.ts`]) }, root);
      expect(ran.note).not.toContain("did not run");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a warning only when a change touched app code and none of the app's own tests ran; a note when that is unknown", () => {
    const sdkOnly = testCoverage({ ok: true, output: spec(1), report: junit([`${ROOT}/sdk/serve.test.ts`]) }, ROOT);
    const withApp = testCoverage({ ok: true, output: spec(1), report: junit([`${ROOT}/src/a.test.ts`]) }, ROOT);
    const unknown = testCoverage({ ok: true, output: "tests passed" }, ROOT);
    expect(testWarning(["src/server.ts", "public/app/main.js"], sdkOnly)).toBe(
      "warning: this change touched app code (src/server.ts, public/app/main.js) and none of the app's own tests ran. Add a test for it as a *.test.ts file under src/.",
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
    writeFileSync(
      join(root, "src", "b.test.mjs"),
      "import { describe, it } from 'node:test';\ndescribe('app', () => { it('app one', () => {}); it.skip('app skipped', () => {}); it.todo('app todo'); });\n",
    );
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  // Plain .mjs files and explicit paths, so any Node with the test runner's reporters runs them. Whether its
  // report names each test's file depends on the Node on the machine (it does from 24 on), so the expectation
  // follows what the report says, not a version number.
  test("the check counts the tests that ran, leaves skipped and todo ones out, and says unknown where the runner does not name the files", async () => {
    const run = await runCheckCommand(root, "node --test sdk/a.test.mjs src/b.test.mjs", 60_000);
    expect(run.ok).toBe(true);
    expect(run.report).toBeDefined();
    const coverage = testCoverage(run, root);
    expect(coverage).toMatchObject({ tests: 3, skipped: 2 });
    if (run.report!.includes(" file=")) {
      expect(coverage).toMatchObject({ test_files: 2, app_tests: 1, app_test_files: 1 });
    } else {
      expect(coverage).toMatchObject({ test_files: "unknown", app_tests: "unknown" });
    }
  }, 60_000);

  test("a test command that picks its own reporter still passes; the app's share is then unknown, and the note says why", async () => {
    // Node refuses to start when NODE_OPTIONS adds reporters beside one on its command line, so the Host runs the check again as written.
    const run = await runCheckCommand(root, "node --test --test-reporter=spec sdk/a.test.mjs src/b.test.mjs", 60_000);
    expect(run.ok).toBe(true);
    expect(run.no_report).toContain("ran again without it");
    expect(run.report).toBeUndefined();
    const coverage = testCoverage(run, root);
    expect(coverage).toMatchObject({ tests: 3, app_tests: "unknown" });
    expect(coverage.note).toContain("how many of them are the app's own is unknown: Node refused the per-file report");

    // A package.json script that names its reporter is not given the extra ones in the first place.
    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test --test-reporter=spec sdk/a.test.mjs src/b.test.mjs" } }));
    const scripted = await runCheckCommand(root, "npm test", 60_000);
    expect(scripted).toMatchObject({ ok: true, no_report: "the test script picks its own reporter, so this Host did not ask for a per-file report" });
    expect(testCoverage(scripted, root)).toMatchObject({ tests: 3, app_tests: "unknown" });

    // So is a script that npm test runs through npm run.
    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { test: "npm run test:unit", "test:unit": "node --test --test-reporter=spec sdk/a.test.mjs src/b.test.mjs" } }));
    expect(await runCheckCommand(root, "npm test", 60_000)).toMatchObject({ ok: true, no_report: "the test script picks its own reporter, so this Host did not ask for a per-file report" });

    // A failing test still fails the check: running again does not hide a real failure.
    writeFileSync(join(root, "src", "c.test.mjs"), "import test from 'node:test';\ntest('fails', () => { throw new Error('no'); });\n");
    expect((await runCheckCommand(root, "node --test --test-reporter=spec sdk/a.test.mjs src/c.test.mjs", 60_000)).ok).toBe(false);
  }, 120_000);

  test("a script npm test does not run, such as test:watch, does not keep the Host from asking for the per-file report", async () => {
    writeFileSync(join(root, "package.json"), JSON.stringify({ scripts: { test: "node --test sdk/a.test.mjs src/b.test.mjs", "test:watch": "node --test --watch --test-reporter=dot" } }));
    const run = await runCheckCommand(root, "npm test", 60_000);
    expect(run.ok).toBe(true);
    expect(run.no_report).toBeUndefined();
    expect(run.report).toBeDefined();
    expect(testCoverage(run, root)).toMatchObject({ tests: 3 });
  }, 60_000);
});
