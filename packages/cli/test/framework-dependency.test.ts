import { afterEach, beforeEach, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { frameworkDependencySpec, specFromInstallingProject } from "../src/framework-dependency.js";

const CORE = "@pneuma-framework/core";
const CLI = "@pneuma-framework/cli";

let root: string;
const write = (rel: string, value: unknown): void => {
  mkdirSync(join(root, rel, ".."), { recursive: true });
  writeFileSync(join(root, rel), JSON.stringify(value));
};

// The layout bun leaves after `file:` installs: copies in node_modules, each with
// its own framework dependencies nested under it, and no siblings.
beforeEach(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), "pneuma-cli-spec-")));
  write("framework/packages/cli/package.json", { name: CLI, dependencies: { [CORE]: "file:../core" } });
  write("framework/packages/core/package.json", { name: CORE });
  write("project/node_modules/@pneuma-framework/cli/package.json", { name: CLI, dependencies: { [CORE]: "file:../core" } });
  write("project/node_modules/@pneuma-framework/cli/node_modules/@pneuma-framework/core/package.json", { name: CORE });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const installedCli = (): string => join(root, "project/node_modules/@pneuma-framework/cli");
const nestedCore = (): string => join(installedCli(), "node_modules/@pneuma-framework/core");

test("real package source is used as it is", () => {
  const source = join(root, "framework/packages/core");
  expect(frameworkDependencySpec(CORE, source)).toBe(`file:${source}`);
});

test("a copy in node_modules resolves to what the installing project declares", () => {
  write("project/package.json", { dependencies: { [CLI]: "file:../framework/packages/cli", [CORE]: "file:../framework/packages/core" } });
  expect(frameworkDependencySpec(CLI, installedCli())).toBe(`file:${join(root, "framework/packages/cli")}`);
  expect(frameworkDependencySpec(CORE, nestedCore())).toBe(`file:${join(root, "framework/packages/core")}`);
});

test("a package the project only gets through the CLI resolves through the CLI's own manifest", () => {
  write("project/package.json", { devDependencies: { [CLI]: "file:../framework/packages/cli" } });
  expect(frameworkDependencySpec(CORE, nestedCore())).toBe(`file:${join(root, "framework/packages/core")}`);
});

test("a specifier that is not a path is passed on unchanged", () => {
  write("project/package.json", { dependencies: { [CLI]: "^0.5.0", [CORE]: "^0.5.0" } });
  expect(frameworkDependencySpec(CLI, installedCli())).toBe("^0.5.0");
  expect(frameworkDependencySpec(CORE, nestedCore())).toBe("^0.5.0");
});

test("without a project that says where the package came from, the installed directory is the last resort", () => {
  expect(specFromInstallingProject(CORE, nestedCore())).toBeNull();
  expect(frameworkDependencySpec(CORE, nestedCore())).toBe(`file:${nestedCore()}`);
});
