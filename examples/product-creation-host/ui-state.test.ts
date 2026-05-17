import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("product workbench UI contract", () => {
  test("uses product actions rather than scenario buttons", () => {
    const html = readFileSync(new URL("./static/index.html", import.meta.url), "utf8");
    expect(html).toContain("Dev Board Builder");
    expect(html).toContain("Ask agent");
    expect(html).toContain("Approve as current role");
    expect(html).toContain("Rollback");
    expect(html).toContain("Share artifacts");
    expect(html).toContain("Host boundary");
    expect(html).not.toContain("Run scenario");
    expect(html).not.toContain("Bob approve");
    expect(html).not.toContain("Alice approve");
  });

  test("keeps preview, data, schema, evidence, and logs visible as workbench surfaces", () => {
    const html = readFileSync(new URL("./static/index.html", import.meta.url), "utf8");
    for (const label of ["Preview", "Schema", "Data", "Evidence", "Versions", "Agent log"]) {
      expect(html).toContain(label);
    }
  });

  test("supports bilingual demo UI", () => {
    const html = readFileSync(new URL("./static/index.html", import.meta.url), "utf8");
    const app = readFileSync(new URL("./static/app.js", import.meta.url), "utf8");
    expect(html).toContain("data-lang=\"zh\"");
    expect(app).toContain("创建看板");
    expect(app).toContain("Host 边界");
    expect(app).toContain("以当前身份审批");
  });
});
