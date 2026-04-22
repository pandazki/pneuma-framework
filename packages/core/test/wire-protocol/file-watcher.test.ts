import { test, expect } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { watchFiles } from "../../src/wire-protocol/file-watcher.js";

test("watchFiles fires callback on .md writes", async () => {
  const root = mkdtempSync(join(tmpdir(), "pneuma-fw-"));
  writeFileSync(join(root, "doc.md"), "hello");
  const events: string[] = [];
  const stop = watchFiles(root, { extensions: [".md"], debounceMs: 20 }, (path) => {
    events.push(path);
  });
  await new Promise((r) => setTimeout(r, 50));
  writeFileSync(join(root, "doc.md"), "hello world");
  await new Promise((r) => setTimeout(r, 120));
  expect(events.some((p) => p.endsWith("doc.md"))).toBe(true);
  stop();
});

test("watchFiles skips .pneuma / node_modules / .git", async () => {
  const root = mkdtempSync(join(tmpdir(), "pneuma-fw-skip-"));
  mkdirSync(join(root, ".pneuma"));
  mkdirSync(join(root, "node_modules"));
  const events: string[] = [];
  const stop = watchFiles(root, { extensions: [".md"], debounceMs: 20 }, (p) => events.push(p));
  await new Promise((r) => setTimeout(r, 50));
  writeFileSync(join(root, ".pneuma/ignored.md"), "nope");
  writeFileSync(join(root, "node_modules/ignored.md"), "nope");
  await new Promise((r) => setTimeout(r, 120));
  expect(events.length).toBe(0);
  stop();
});

test("watchFiles debounces rapid-fire writes to the same file", async () => {
  const root = mkdtempSync(join(tmpdir(), "pneuma-fw-deb-"));
  const events: string[] = [];
  const stop = watchFiles(root, { extensions: [".md"], debounceMs: 50 }, (p) => events.push(p));
  await new Promise((r) => setTimeout(r, 50));
  writeFileSync(join(root, "x.md"), "1");
  writeFileSync(join(root, "x.md"), "2");
  writeFileSync(join(root, "x.md"), "3");
  await new Promise((r) => setTimeout(r, 150));
  expect(events.length).toBe(1);
  stop();
});
