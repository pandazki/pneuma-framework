import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("product workbench UI contract", () => {
  test("uses product actions rather than scenario buttons", () => {
    const html = readFileSync(new URL("./static/index.html", import.meta.url), "utf8");
    expect(html).toContain("Dev Board Builder");
    expect(html).toContain("Ask agent");
    expect(html).toContain("Approve as current role");
    expect(html).toContain("Share artifacts");
    expect(html).not.toContain("Run scenario");
    expect(html).not.toContain("Bob approve");
    expect(html).not.toContain("Alice approve");
  });

  test("keeps preview, data, schema, evidence, and logs visible as workbench surfaces", () => {
    const html = readFileSync(new URL("./static/index.html", import.meta.url), "utf8");
    for (const label of ["Preview", "Schema", "Data", "Evidence", "Agent log"]) {
      expect(html).toContain(label);
    }
  });
});
