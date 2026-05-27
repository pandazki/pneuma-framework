import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;

describe("product UI design contract", () => {
  it("uses local product primitives instead of raw native select controls", () => {
    const app = readFileSync(join(root, "src/client/App.tsx"), "utf8");
    expect(app).not.toContain("<select");
    expect(app).toContain("segmented");
    expect(app).toContain("lucide-react");
  });

  it("uses tinted OKLCH tokens and avoids pure black/white", () => {
    const css = readFileSync(join(root, "src/client/styles.css"), "utf8");
    expect(css).toContain("oklch(");
    expect(css).not.toMatch(/#000(?![0-9a-f])/i);
    expect(css).not.toMatch(/#fff(?![0-9a-f])/i);
  });

  it("documents the visual quality bar in the scaffold", () => {
    const contract = readFileSync(join(root, "DESIGN_CONTRACT.md"), "utf8");
    expect(contract).toContain("restrained light product UI");
    expect(contract).toContain("No browser-native unstyled `select` controls");
    expect(contract).toContain("Generated-App UI Acceptance");
  });
});
