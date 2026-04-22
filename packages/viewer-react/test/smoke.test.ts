import { test, expect } from "bun:test";
import * as viewer from "../src/index.js";

test("@pneuma-framework/viewer-react resolves", () => {
  expect(typeof viewer).toBe("object");
});
