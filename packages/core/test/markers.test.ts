import { test, expect } from "bun:test";
import {
  formatReadyMarker,
  formatServiceReadyMarker,
  formatStoppingMarker,
  parseMarker,
  printReadyMarker,
  printServiceReadyMarker,
  printStoppingMarker,
} from "../src/markers.js";

test("parseMarker returns null for non-marker line", () => {
  expect(parseMarker("regular log")).toBe(null);
  expect(parseMarker("")).toBe(null);
  expect(parseMarker("##pneuma: typo-space")).toBe(null);
});

test("parseMarker parses service-ready", () => {
  expect(parseMarker("##pneuma:service-ready web http://localhost:3000"))
    .toEqual({ kind: "service-ready", name: "web", url: "http://localhost:3000" });
});

test("format marker helpers produce parseable marker lines", () => {
  expect(formatServiceReadyMarker("api", "http://127.0.0.1:4100"))
    .toBe("##pneuma:service-ready api http://127.0.0.1:4100");
  expect(formatReadyMarker()).toBe("##pneuma:ready");
  expect(formatStoppingMarker()).toBe("##pneuma:stopping");

  expect(parseMarker(formatServiceReadyMarker("api", "http://127.0.0.1:4100")))
    .toEqual({ kind: "service-ready", name: "api", url: "http://127.0.0.1:4100" });
});

test("formatServiceReadyMarker rejects whitespace because parser treats fields as atoms", () => {
  expect(() => formatServiceReadyMarker("api server", "http://127.0.0.1:4100"))
    .toThrow("service name");
  expect(() => formatServiceReadyMarker("api", "http://127.0.0.1:4100 health"))
    .toThrow("service url");
});

test("print marker helpers append newline to the writer", () => {
  let output = "";
  const writer = { write: (chunk: string) => { output += chunk; } };

  printServiceReadyMarker("api", "http://127.0.0.1:4100", writer);
  printReadyMarker(writer);
  printStoppingMarker(writer);

  expect(output).toBe([
    "##pneuma:service-ready api http://127.0.0.1:4100",
    "##pneuma:ready",
    "##pneuma:stopping",
    "",
  ].join("\n"));
});

test("parseMarker parses ready / stopping", () => {
  expect(parseMarker("##pneuma:ready")).toEqual({ kind: "ready" });
  expect(parseMarker("##pneuma:stopping")).toEqual({ kind: "stopping" });
});

test("parseMarker parses needs-confirm with quoted label", () => {
  expect(parseMarker('##pneuma:needs-confirm "deploy to prod"'))
    .toEqual({ kind: "needs-confirm", label: "deploy to prod" });
  expect(parseMarker("##pneuma:needs-confirm simple"))
    .toEqual({ kind: "needs-confirm", label: "simple" });
});

test("parseMarker parses progress", () => {
  expect(parseMarker("##pneuma:progress 42 fetching deps"))
    .toEqual({ kind: "progress", pct: 42, label: "fetching deps" });
});

test("parseMarker parses artifact", () => {
  expect(parseMarker("##pneuma:artifact ./dist/bundle.tar.gz"))
    .toEqual({ kind: "artifact", path: "./dist/bundle.tar.gz" });
});

test("parseMarker returns null for unknown kind (forward compatible)", () => {
  expect(parseMarker("##pneuma:future-marker whatever")).toBe(null);
});
