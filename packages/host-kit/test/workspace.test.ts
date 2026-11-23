import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { tmpdir } from "node:os";
import { diffTrees, listFiles, treeSignature, type TreeWalkOptions } from "../src/workspace.js";

const temps: string[] = [];
function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "workspace-"));
  temps.push(root);
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, rel)), { recursive: true });
    writeFileSync(join(root, rel), content);
  }
  return root;
}
afterEach(() => {
  while (temps.length) rmSync(temps.pop()!, { recursive: true, force: true });
});

describe("treeSignature", () => {
  test("equal for trees with the same files and content, different on content or a rename", () => {
    const files = { "src/a.ts": "a\n", "src/b.ts": "b\n" };
    expect(treeSignature(tree(files))).toBe(treeSignature(tree(files)));
    expect(treeSignature(tree({ ...files, "src/b.ts": "B\n" }))).not.toBe(treeSignature(tree(files)));
    expect(treeSignature(tree({ "src/a.ts": "a\n", "src/c.ts": "b\n" }))).not.toBe(treeSignature(tree(files)));
  });

  test("covers only what the walk options list", () => {
    const walk: TreeWalkOptions = { ignoredDirs: new Set(["node_modules"]), ignoredFiles: new Set(), ignoredPaths: new Set(["data"]) };
    const plain = tree({ "src/a.ts": "a\n" });
    const withNoise = tree({ "src/a.ts": "a\n", "data/app.sqlite": "rows", "node_modules/x/index.js": "x" });
    expect(treeSignature(withNoise, walk)).toBe(treeSignature(plain, walk));
    expect(treeSignature(withNoise)).not.toBe(treeSignature(plain));
  });
});

describe("TreeWalkOptions.ignoredPaths", () => {
  test("skips a path at exactly that place, not the same name deeper down", () => {
    const root = tree({ "data/app.sqlite": "rows", "src/data/seed.json": "[]", "notes.txt": "n", "src/notes.txt": "n" });
    const walk: TreeWalkOptions = { ignoredPaths: new Set(["data", "notes.txt"]) };
    expect(listFiles(root, walk)).toEqual(["src/data/seed.json", "src/notes.txt"]);
    expect(diffTrees(tree({}), root, walk).changedPaths).toEqual(["src/data/seed.json", "src/notes.txt"]);
  });
});
