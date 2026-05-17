import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("product workbench UI contract", () => {
  test("separates Builder workbench from Generated App surface", () => {
    const html = readFileSync(new URL("./static/index.html", import.meta.url), "utf8");
    expect(html).toContain("Dev Board Builder");
    expect(html).toContain("Generated Application");
    expect(html).toContain("Builder Workbench");
    expect(html).toContain("Ask agent");
    expect(html).toContain("Create a new generated app");
    expect(html).not.toContain("Run scenario");
    expect(html).not.toContain("Bob approve");
    expect(html).not.toContain("Alice approve");
  });

  test("opens preview and published app as separate pages instead of embedding an iframe", () => {
    const html = readFileSync(new URL("./static/index.html", import.meta.url), "utf8");
    const app = readFileSync(new URL("./static/app.js", import.meta.url), "utf8");
    expect(app).toContain("Open preview");
    expect(app).toContain("Open published app");
    expect(app).toContain("target=\"_blank\"");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("Inspector tabs");
  });

  test("supports bilingual demo UI", () => {
    const html = readFileSync(new URL("./static/index.html", import.meta.url), "utf8");
    const app = readFileSync(new URL("./static/app.js", import.meta.url), "utf8");
    expect(html).toContain("data-lang=\"zh\"");
    expect(app).toContain("创建应用");
    expect(app).toContain("Builder 和 App 是分开的");
    expect(app).toContain("以当前身份审批");
  });
});
