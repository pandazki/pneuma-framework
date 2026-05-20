import { readFileSync } from "node:fs";
import { describe, expect, test } from "bun:test";

describe("product workbench UI contract", () => {
  test("separates Builder workbench from Generated App surface", () => {
    const html = readFileSync(new URL("./static/index.html", import.meta.url), "utf8");
    const ui = readFileSync(new URL("./src/ui/main.tsx", import.meta.url), "utf8");
    expect(html).toContain("Dev Board Builder");
    expect(ui).toContain("Generated Application");
    expect(ui).toContain("Builder Workbench");
    expect(ui).toContain("Send");
    expect(ui).toContain("runtime-surface");
    expect(ui).toContain("conversation");
    expect(ui).toContain("composer");
    expect(ui).toContain("lucide-react");
    expect(html).not.toContain("Run scenario");
    expect(html).not.toContain("Bob approve");
    expect(html).not.toContain("Alice approve");
    expect(html).not.toContain("Reviewer</option>");
    expect(html).not.toContain("role:reviewer");
    expect(ui).toContain("Current Builder");
    expect(ui).toContain("function BuilderSubject");
    expect(ui).not.toContain("\"user:end-user\"");
    expect(ui).not.toContain("endUser:");
  });

  test("opens preview and published app as separate pages instead of embedding an iframe", () => {
    const html = readFileSync(new URL("./static/index.html", import.meta.url), "utf8");
    const ui = readFileSync(new URL("./src/ui/main.tsx", import.meta.url), "utf8");
    expect(ui).toContain("Open preview sandbox");
    expect(ui).toContain("Open published app");
    expect(ui).toContain("disposable data copy");
    expect(ui).toContain("target=\"_blank\"");
    expect(html).not.toContain("<iframe");
    expect(html).not.toContain("Inspector tabs");
  });

  test("supports bilingual demo UI", () => {
    const ui = readFileSync(new URL("./src/ui/main.tsx", import.meta.url), "utf8");
    expect(ui).toContain("value: \"zh\"");
    expect(ui).toContain("启动工作区");
    expect(ui).toContain("构建者工作台和应用是分开的");
    expect(ui).toContain("确认并执行");
    expect(ui).toContain("原始需求");
    expect(ui).toContain("所需确认");
    expect(ui).toContain("重点改动");
    expect(ui).toContain("一次性数据副本");
    expect(ui).toContain("发送");
  });

  test("renders lifecycle actions as gated state, not always-on buttons", () => {
    const ui = readFileSync(new URL("./src/ui/main.tsx", import.meta.url), "utf8");
    const css = readFileSync(new URL("./static/styles.css", import.meta.url), "utf8");
    expect(ui).toContain("lifecycleActionModel");
    expect(ui).toContain("Current gate");
    expect(ui).toContain("Lifecycle actions are locked until apply finishes.");
    expect(ui).toContain("Requires a running preview.");
    expect(ui).toContain("Publish a version first.");
    expect(ui).toContain("disabled={busy || !action.enabled}");
    expect(css).toContain(".command-cell.is-next");
    expect(css).toContain(".lifecycle-state");
  });
});
