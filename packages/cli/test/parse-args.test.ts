import { test, expect } from "bun:test";
import { parseArgs } from "../src/parse-args.js";

test("parseArgs parses verb + templateDir", () => {
  const r = parseArgs(["dev", "./templates/minimal"]);
  expect(r).toEqual({ verb: "dev", templateDir: "./templates/minimal", workspace: undefined });
});

test("parseArgs supports --workspace", () => {
  const r = parseArgs(["build", "./tpl", "--workspace", "/tmp/ws"]);
  expect(r.workspace).toBe("/tmp/ws");
});

test("parseArgs rejects unknown verb", () => {
  expect(() => parseArgs(["frobnicate", "./tpl"])).toThrow(/unknown verb/i);
});

test("parseArgs rejects missing templateDir", () => {
  expect(() => parseArgs(["dev"])).toThrow(/templateDir/);
});
