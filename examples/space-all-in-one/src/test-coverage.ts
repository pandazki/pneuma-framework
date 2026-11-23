import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VerifyResult } from "@pneuma-framework/host-kit/governed-change";
import { runCommand } from "./space";

// ---------------------------------------------------------------------------
// What the test check covered.
//
// "npm-test: passed" says nothing about which code was tested. In an app made
// from the PneumaSpace template, `npm test` once ran only the SDK's own tests.
// So the Host records what ran: the number of tests from the runner's summary,
// and how many of them are the app's own (files outside sdk/) from a second
// report it asks Node's test runner for. Whatever cannot be read is "unknown".
// ---------------------------------------------------------------------------

/** The scaffold's verify command, run once, with what the test runner reported about it. */
export interface CheckRun extends VerifyResult {
  /** Node's JUnit report of the run, when the runner wrote one. */
  readonly report?: string;
}

export type Count = number | "unknown";

export interface TestCoverage {
  /** Tests the runner's summary reported (it counts skipped and todo tests too). */
  readonly tests: Count;
  /** Test files those tests were in, from the JUnit report. */
  readonly test_files: Count;
  /** Tests in files outside `sdk/`: the app's own. */
  readonly app_tests: Count;
  readonly app_test_files: Count;
  /** One plain sentence saying the above, for history. */
  readonly note: string;
}

/** Paths a change can touch that are the app's own code. A change to any of them is expected to come with a test. */
export const APP_CODE_ROOTS = ["src/", "public/app/"] as const;

/**
 * `NODE_OPTIONS` that keep the runner's usual output on stdout and add a JUnit report in `file`. Node's
 * JUnit report names each test's file from Node 24 on; older runners leave it out, and the app's own
 * share is then unknown. A process that is not a test run ignores these options.
 */
export function withJunitReport(nodeOptions: string | undefined, file: string): string {
  const destination = /\s/.test(file) ? `"${file}"` : file;
  return [nodeOptions?.trim(), "--test-reporter=spec", "--test-reporter-destination=stdout", "--test-reporter=junit", `--test-reporter-destination=${destination}`]
    .filter(Boolean)
    .join(" ");
}

/** Run the verify command in `root` and keep the JUnit report Node's test runner writes beside its usual output. */
export async function runCheckCommand(root: string, command: string, timeoutMs = 600_000): Promise<CheckRun> {
  const dir = mkdtempSync(join(tmpdir(), "pneuma-report-"));
  const file = join(dir, "junit.xml");
  try {
    const result = await runCommand(["sh", "-c", command], { cwd: root, timeoutMs, env: { NODE_OPTIONS: withJunitReport(process.env.NODE_OPTIONS, file) } });
    return { ok: result.code === 0, output: result.output, ...(existsSync(file) ? { report: readFileSync(file, "utf8") } : {}) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unxml = (value: string) => value.replace(/&(amp|lt|gt|quot|apos);/g, (_, name: string) => XML_ENTITIES[name]!);

/** The single "tests N" line of a spec (`ℹ tests N`) or TAP (`# tests N`) summary. More than one run, or none: unknown. */
function summaryTests(output: string): Count {
  const plain = output.replace(/\u001b\[[0-9;]*m/g, "");
  const found = [...plain.matchAll(/^\s*(?:ℹ|#) tests (\d+)\s*$/gm)];
  return found.length === 1 ? Number(found[0]![1]) : "unknown";
}

/** Each test case's file in a JUnit report, relative to the directory the check ran in; null when any case has no file under it. */
function reportFiles(report: string, roots: readonly string[]): string[] | null {
  const cases = [...report.matchAll(/<testcase\b([^>]*)>/g)];
  const files: string[] = [];
  for (const [, attrs] of cases) {
    const file = /\bfile="([^"]*)"/.exec(attrs ?? "")?.[1];
    if (file === undefined) return null;
    const path = unxml(file);
    const root = roots.find((candidate) => path.startsWith(`${candidate}/`));
    if (!root) return null;
    files.push(path.slice(root.length + 1));
  }
  return files;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * What a test check ran, read from the runner's output and its JUnit report. `root` is the directory the
 * check ran in. Nothing is inferred: a count the runner did not report, or a report that does not agree with
 * the summary, is "unknown".
 */
export function testCoverage(run: CheckRun, root: string): TestCoverage {
  const tests = summaryTests(run.output);
  const roots = [root, ...(existsSync(root) ? [realpathSync(root)] : [])];
  const files = run.report === undefined ? null : reportFiles(run.report, roots);
  // The report must describe the same run as the summary, case for case.
  const usable = files !== null && tests !== "unknown" && files.length === tests;
  const app = usable ? files.filter((file) => !file.startsWith("sdk/")) : [];
  const test_files: Count = usable ? new Set(files).size : "unknown";
  const app_tests: Count = usable ? app.length : tests === 0 ? 0 : "unknown";
  const app_test_files: Count = usable ? new Set(app).size : tests === 0 ? 0 : "unknown";

  let note: string;
  if (tests === "unknown") {
    note = "What the test check ran is unknown: its output has no test runner summary this Host can read.";
  } else if (tests === 0) {
    note = "No tests ran.";
  } else if (app_tests === "unknown") {
    const why =
      run.report === undefined
        ? "the runner wrote no per-file report (this Host asks Node's test runner for one)"
        : files === null
          ? "the runner's per-file report does not name each test's file (Node's test runner does from Node 24 on)"
          : "the runner's per-file report does not match its summary";
    note = `${plural(tests, "test")} ran; how many of them are the app's own is unknown: ${why}.`;
  } else if (app_tests === 0) {
    note = `${plural(tests, "test")} ran in ${plural(test_files as number, "file")}, all of them the SDK's (sdk/); none of the app's own.`;
  } else {
    note = `${plural(tests, "test")} ran in ${plural(test_files as number, "file")}. The app's own: ${plural(app_tests, "test")} in ${plural(app_test_files as number, "file")}; the rest are the SDK's (sdk/).`;
  }
  return { tests, test_files, app_tests, app_test_files, note };
}

/**
 * One line for the agent when a change touched the app's own code and none of the app's own tests ran, or when
 * that cannot be told. Nothing when the change touched no app code, or when app tests ran. It blocks nothing.
 */
export function testWarning(changedPaths: readonly string[], coverage: TestCoverage | undefined): string | undefined {
  const code = changedPaths.filter((path) => APP_CODE_ROOTS.some((root) => path.startsWith(root)));
  if (!code.length || !coverage) return undefined;
  const shown = code.length > 3 ? `${code.slice(0, 3).join(", ")} and ${code.length - 3} more` : code.join(", ");
  if (coverage.app_tests === 0) {
    return `warning: this change touched app code (${shown}) and none of the app's own tests ran. Add a test under src/ (a *.test.ts file); AGENTS.md shows the smallest one.`;
  }
  if (coverage.app_tests === "unknown") return `note: this change touched app code (${shown}); whether any of the app's own tests ran is unknown. ${coverage.note}`;
  return undefined;
}
