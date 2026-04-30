import { describe, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const templateRoot = join(
  import.meta.dir,
  "..",
  "..",
  "templates",
  "bookmarks-core-domain"
);

describe("M3 deployable substrate artifact", () => {
  test("reference template includes Docker release files", () => {
    expect(existsSync(join(templateRoot, "Dockerfile"))).toBe(true);
    expect(existsSync(join(templateRoot, "docker-compose.yml"))).toBe(true);
  });
});
