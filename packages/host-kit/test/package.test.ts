import { describe, expect, test } from "bun:test";
import {
  createHostKitVersion,
  type HostKitVersion,
} from "../src/index.js";

describe("host-kit package", () => {
  test("exports a version marker", () => {
    const version: HostKitVersion = createHostKitVersion();
    expect(version.package_name).toBe("@pneuma-framework/host-kit");
    expect(version.contract).toBe("creation-host-implementation-kit-v0");
  });
});
