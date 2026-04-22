import { test, expect } from "bun:test";
import { join } from "node:path";
import { parseTemplateManifest } from "../src/manifest.js";

const TPL = join(import.meta.dir, "../../../templates/doc");

test("templates/doc has a valid manifest", () => {
  const m = parseTemplateManifest(TPL);
  expect(m.name).toBe("doc");
  expect(m.scripts?.dev).toBe("scripts/dev.sh");
  expect(m.backends?.supported).toContain("opencode");
  expect(m.backends?.supported).toContain("claude-code");
  expect(m.backends?.supported).toContain("codex");
});
