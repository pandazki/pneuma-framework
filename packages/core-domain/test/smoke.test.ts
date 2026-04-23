import { describe, test, expect } from "bun:test";

describe("@pneuma-framework/core-domain scaffold", () => {
  test("package loads", async () => {
    const mod = await import("../src/index.js");
    expect(mod).toBeDefined();
  });
});
