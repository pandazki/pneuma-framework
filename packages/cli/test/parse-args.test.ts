import { test, expect } from "bun:test";
import { parseArgs } from "../src/parse-args.js";

test("parseArgs parses verb + templateDir", () => {
  const r = parseArgs(["dev", "./templates/minimal"]);
  expect(r).toEqual({ verb: "dev", templateDir: "./templates/minimal", workspace: undefined, port: undefined, backend: undefined });
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

test("parseArgs supports --port", () => {
  const r = parseArgs(["dev", "./tpl", "--port", "18765"]);
  expect(r.port).toBe(18765);
});

test("parseArgs rejects non-integer --port", () => {
  expect(() => parseArgs(["dev", "./tpl", "--port", "abc"])).toThrow(/--port/);
});

test("parseArgs rejects --port out of range", () => {
  expect(() => parseArgs(["dev", "./tpl", "--port", "70000"])).toThrow(/--port/);
  expect(() => parseArgs(["dev", "./tpl", "--port", "0"])).toThrow(/--port/);
});

test("parseArgs supports --backend", () => {
  const r = parseArgs(["dev", "./tpl", "--backend", "opencode"]);
  expect(r.backend).toBe("opencode");
});

test("parseArgs rejects empty --backend value", () => {
  expect(() => parseArgs(["dev", "./tpl", "--backend"])).toThrow(/--backend/);
});

test("parseArgs supports setup verb", () => {
  const r = parseArgs(["setup", "./tpl"]);
  expect(r.verb).toBe("setup");
  expect(r.templateDir).toBe("./tpl");
});

test("parseArgs supports migrate verb with --direction", () => {
  const r = parseArgs(["migrate", "./tpl", "--direction", "up"]);
  expect(r.verb).toBe("migrate");
  expect(r.direction).toBe("up");
});

test("parseArgs rejects --direction with unknown value", () => {
  expect(() => parseArgs(["migrate", "./tpl", "--direction", "sideways"])).toThrow(/direction/);
});

test("parseArgs supports fork verb with --source / --target", () => {
  const r = parseArgs(["fork", "./tpl", "--source", "/src", "--target", "/tgt"]);
  expect(r.verb).toBe("fork");
  expect(r.source).toBe("/src");
  expect(r.target).toBe("/tgt");
});

test("parseArgs supports --unattended flag on deploy", () => {
  const r = parseArgs(["deploy", "./tpl", "--unattended"]);
  expect(r.unattended).toBe(true);
});
