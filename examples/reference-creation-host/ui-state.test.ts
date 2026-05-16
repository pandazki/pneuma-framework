import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "bun:test";

const root = import.meta.dir;

describe("reference host workbench assets", () => {
  test("renders the three-pane product workbench states", () => {
    const html = readFileSync(join(root, "static/index.html"), "utf8");
    const css = readFileSync(join(root, "static/styles.css"), "utf8");
    const js = readFileSync(join(root, "static/app.js"), "utf8");

    expect(html).toContain("BuildThread");
    expect(html).toContain("Generated App Preview");
    expect(html).toContain("Governance & Evidence");
    expect(html).toContain("Agent log");
    expect(html).toContain("opencode stream");
    expect(js).toContain("agent_logs");
    expect(js).toContain("awaiting_reviewer_approval");
    expect(js).toContain("preview_data_rehearsal_failed");
    expect(js).toContain("published");
    expect(js).toContain("rolled_back");
    expect(css).toContain("grid-template-columns");
  });
});
