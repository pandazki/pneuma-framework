import { test, expect } from "bun:test";
import { LogBuffer } from "../src/logs.js";

test("LogBuffer records and returns lines per verb", () => {
  const b = new LogBuffer({ perVerbCap: 100 });
  b.push("build", { stream: "stdout", line: "hello", ts: 1 });
  b.push("dev", { stream: "stdout", line: "world", ts: 2 });
  expect(b.getLines({ verb: "build" }).map(e => e.line)).toEqual(["hello"]);
  expect(b.getLines({ verb: "dev" }).map(e => e.line)).toEqual(["world"]);
});

test("LogBuffer filters by since and caps via limit", () => {
  const b = new LogBuffer({ perVerbCap: 100 });
  for (let i = 0; i < 10; i++) b.push("build", { stream: "stdout", line: `l${i}`, ts: i });
  expect(b.getLines({ verb: "build", since: 5 }).map(e => e.line)).toEqual(["l5", "l6", "l7", "l8", "l9"]);
  expect(b.getLines({ verb: "build", limit: 3 }).map(e => e.line)).toEqual(["l7", "l8", "l9"]);
});

test("LogBuffer drops oldest past perVerbCap", () => {
  const b = new LogBuffer({ perVerbCap: 3 });
  for (let i = 0; i < 5; i++) b.push("build", { stream: "stdout", line: `l${i}`, ts: i });
  expect(b.getLines({ verb: "build" }).map(e => e.line)).toEqual(["l2", "l3", "l4"]);
});
