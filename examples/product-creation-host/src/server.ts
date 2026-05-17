import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProductCreationHost } from "./host/product-host.js";
import type { DevBoardItem } from "./domain/dev-board.js";

const port = Number(process.env.PORT ?? "8895");
const workspace = process.env.PNEUMA_PRODUCT_HOST_WORKSPACE
  ?? mkdtempSync(join(tmpdir(), "pneuma-product-creation-host-"));
const draftAgent = process.env.PNEUMA_PRODUCT_HOST_AGENT === "opencode"
  ? (await import("./host/opencode-code-agent.js")).createOpencodeDevBoardDraftAgent({
      model: process.env.PNEUMA_PRODUCT_HOST_MODEL,
      timeout_ms: Number(process.env.PNEUMA_PRODUCT_HOST_AGENT_TIMEOUT_MS ?? "210000"),
    })
  : undefined;
const host = createProductCreationHost({
  workspace,
  base_url: `http://127.0.0.1:${port}`,
  draft_agent: draftAgent,
});
const staticRoot = join(import.meta.dir, "..", "static");
const previewSandboxes = new Map<string, PreviewSandbox>();
const previewTtlMs = 30 * 60 * 1000;

const server = Bun.serve({
  port,
  idleTimeout: 255,
  async fetch(request) {
    try {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/") return fileResponse("index.html", "text/html; charset=utf-8");
      if (request.method === "GET" && url.pathname === "/static/styles.css") return fileResponse("styles.css", "text/css; charset=utf-8");
      if (request.method === "GET" && url.pathname === "/static/app.js") return fileResponse("app.js", "text/javascript; charset=utf-8");
      if (request.method === "GET" && url.pathname === "/api/state") {
        prunePreviewSandboxes();
        return json({ ...host.snapshot(), workspace, preview_sandboxes: previewSandboxes.size });
      }

      const previewMatch = /^\/preview\/([^/]+)$/.exec(url.pathname);
      if (request.method === "GET" && previewMatch) {
        return devBoardPage(previewMatch[1], "preview", languageFromUrl(url), url.searchParams.get("preview_id") ?? undefined);
      }
      const appMatch = /^\/app\/([^/]+)$/.exec(url.pathname);
      if (request.method === "GET" && appMatch) return devBoardPage(appMatch[1], "published", languageFromUrl(url));

      if (request.method === "POST" && url.pathname === "/api/projects") {
        const body = await request.json() as {
          name?: string;
          goal?: string;
          template_id?: "engineering" | "personal";
          builder_subject?: string;
        };
        return json(await host.createProject({
          name: body.name?.trim() || "Engineering Dev Board",
          goal: body.goal?.trim() || "Track engineering work with agent-governed evolution.",
          template_id: body.template_id ?? "engineering",
          builder_subject: body.builder_subject ?? "user:bob",
        }));
      }

      const evolveMatch = /^\/api\/projects\/([^/]+)\/evolution\/request$/.exec(url.pathname);
      if (request.method === "POST" && evolveMatch) {
        const body = await request.json() as { message?: string; builder_subject?: string };
        return json(await host.requestEvolution({
          app_id: evolveMatch[1],
          builder_subject: body.builder_subject ?? "user:bob",
          message: body.message?.trim() || "Add a review queue so items can be marked needs_review and approved.",
        }));
      }

      const approveMatch = /^\/api\/projects\/([^/]+)\/evolution\/approve$/.exec(url.pathname);
      if (request.method === "POST" && approveMatch) {
        const body = await request.json().catch(() => ({})) as { subject?: string; decision?: "approved" | "denied"; reason?: string };
        const project = host.store.getProject(approveMatch[1]);
        return json(await host.approveEvolution({
          app_id: approveMatch[1],
          subject: body.subject ?? project.builder_subject,
          decision: body.decision,
          reason: body.reason,
        }));
      }

      const previewStartMatch = /^\/api\/projects\/([^/]+)\/preview\/start$/.exec(url.pathname);
      if (request.method === "POST" && previewStartMatch) {
        const result = await host.startPreview({ app_id: previewStartMatch[1] });
        const sandbox = createPreviewSandbox(previewStartMatch[1]);
        host.store.updateProject(previewStartMatch[1], { preview_url: sandbox.url });
        return json({ ...result, url: sandbox.url, preview_id: sandbox.preview_id, data_mode: "preview_sandbox" });
      }

      const publishMatch = /^\/api\/projects\/([^/]+)\/publish$/.exec(url.pathname);
      if (request.method === "POST" && publishMatch) {
        const result = await host.publish({ app_id: publishMatch[1] });
        destroyPreviewSandboxesForApp(publishMatch[1]);
        return json(result);
      }

      const rollbackMatch = /^\/api\/projects\/([^/]+)\/rollback$/.exec(url.pathname);
      if (request.method === "POST" && rollbackMatch) {
        const result = await host.rollback({ app_id: rollbackMatch[1] });
        destroyPreviewSandboxesForApp(rollbackMatch[1]);
        return json(result);
      }

      const shareMatch = /^\/api\/projects\/([^/]+)\/share$/.exec(url.pathname);
      if (request.method === "POST" && shareMatch) return json(await host.share({ app_id: shareMatch[1] }));

      if (request.method === "POST" && url.pathname === "/api/forks") {
        const body = await request.json() as { artifact_id?: string; name?: string; builder_subject?: string };
        if (!body.artifact_id) return json({ error: "artifact_id_required" }, 400);
        return json(await host.fork({
          artifact_id: body.artifact_id,
          name: body.name?.trim() || "Charlie's Dev Board",
          builder_subject: body.builder_subject ?? "user:charlie",
        }));
      }

      const previewEndMatch = /^\/api\/previews\/([^/]+)\/end$/.exec(url.pathname);
      if (request.method === "POST" && previewEndMatch) {
        const deleted = previewSandboxes.delete(previewEndMatch[1]);
        return json({ ok: true, deleted });
      }

      const previewResetMatch = /^\/api\/previews\/([^/]+)\/reset$/.exec(url.pathname);
      if (request.method === "POST" && previewResetMatch) return json(resetPreviewSandbox(previewResetMatch[1]));

      const addPreviewItemMatch = /^\/api\/previews\/([^/]+)\/apps\/([^/]+)\/items$/.exec(url.pathname);
      if (request.method === "POST" && addPreviewItemMatch) {
        const body = await request.json() as { title?: string; owner?: string };
        return json(addPreviewItem(addPreviewItemMatch[1], addPreviewItemMatch[2], body.title?.trim() || "New follow-up", body.owner?.trim() || "End User"));
      }

      const updatePreviewItemMatch = /^\/api\/previews\/([^/]+)\/apps\/([^/]+)\/items\/([^/]+)$/.exec(url.pathname);
      if (request.method === "POST" && updatePreviewItemMatch) {
        const body = await request.json() as { status?: DevBoardItem["status"]; priority?: DevBoardItem["priority"] };
        return json(updatePreviewItem(updatePreviewItemMatch[1], updatePreviewItemMatch[2], updatePreviewItemMatch[3], body));
      }

      const addItemMatch = /^\/api\/apps\/([^/]+)\/items$/.exec(url.pathname);
      if (request.method === "POST" && addItemMatch) {
        const body = await request.json() as { title?: string; owner?: string };
        return json(addRuntimeItem(addItemMatch[1], body.title?.trim() || "New follow-up", body.owner?.trim() || "End User"));
      }

      const updateItemMatch = /^\/api\/apps\/([^/]+)\/items\/([^/]+)$/.exec(url.pathname);
      if (request.method === "POST" && updateItemMatch) {
        const body = await request.json() as { status?: DevBoardItem["status"]; priority?: DevBoardItem["priority"] };
        return json(updateRuntimeItem(updateItemMatch[1], updateItemMatch[2], body));
      }

      return json({ error: "not_found" }, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return json({ error: message }, 500);
    }
  },
});

console.log(`Product Creation Host listening on http://127.0.0.1:${server.port}/`);
console.log(`workspace: ${workspace}`);

function fileResponse(file: string, contentType: string): Response {
  return new Response(readFileSync(join(staticRoot, file)), {
    headers: {
      "content-type": contentType,
      "cache-control": "no-store",
    },
  });
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function languageFromUrl(url: URL): "en" | "zh" {
  return url.searchParams.get("lang") === "zh" ? "zh" : "en";
}

function runtimeText(lang: "en" | "zh") {
  return lang === "zh"
    ? {
        preview: "预览",
        previewMode: "预览沙盒",
        previewHelp: "操作只影响临时数据。结束预览或发布后会销毁。",
        resetSandbox: "重置预览数据",
        endPreview: "结束预览",
        published: "已发布",
        publishedMode: "真实运行态",
        publishedHelp: "操作会写入当前线上版本的数据。",
        source: "来源",
        noPriority: "无优先级",
        advance: "推进",
        raise: "提为 P1",
        titlePlaceholder: "添加一条可见跟进事项",
        ownerPlaceholder: "负责人",
        addItem: "添加事项",
        fallbackOwner: "End User",
        compact: "紧凑",
        statuses: {
          todo: "待办",
          doing: "进行中",
          needs_review: "待评审",
          approved: "已批准",
        } satisfies Record<DevBoardItem["status"], string>,
      }
    : {
        preview: "PREVIEW",
        previewMode: "Preview sandbox",
        previewHelp: "Changes affect temporary data only. Ending preview or publishing discards them.",
        resetSandbox: "Reset preview data",
        endPreview: "End preview",
        published: "PUBLISHED",
        publishedMode: "Live data",
        publishedHelp: "Changes write to the active published version.",
        source: "source",
        noPriority: "no priority",
        advance: "Advance",
        raise: "Raise",
        titlePlaceholder: "Add a visible follow-up item",
        ownerPlaceholder: "Owner",
        addItem: "Add item",
        fallbackOwner: "End User",
        compact: "compact",
        statuses: {
          todo: "todo",
          doing: "doing",
          needs_review: "needs_review",
          approved: "approved",
        } satisfies Record<DevBoardItem["status"], string>,
      };
}

function devBoardPage(appId: string, mode: "preview" | "published", lang: "en" | "zh", previewId?: string): Response {
  const project = host.store.getProject(appId);
  const versionId = mode === "published" ? project.active_version_id ?? project.current_version_id : project.current_version_id;
  const version = host.store.getVersion(appId, versionId);
  const copy = runtimeText(lang);
  const preview = mode === "preview" ? requirePreviewSandbox(previewId, appId) : undefined;
  if (mode === "preview" && !preview) return previewExpiredPage(lang);
  const items = preview?.items ?? version.items;
  const apiBase = mode === "preview"
    ? `/api/previews/${encodeURIComponent(preview.preview_id)}/apps/${encodeURIComponent(appId)}`
    : `/api/apps/${encodeURIComponent(appId)}`;
  const modeTitle = mode === "preview" ? copy.previewMode : copy.publishedMode;
  const modeHelp = mode === "preview" ? copy.previewHelp : copy.publishedHelp;
  const html = `<!doctype html>
<html lang="${lang === "zh" ? "zh-CN" : "en"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(version.definition.title)}</title>
  <style>
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: oklch(97% 0.007 235); color: oklch(22% 0.018 246); }
    main { max-width: 1120px; margin: 0 auto; padding: 32px; }
    header { display:flex; justify-content:space-between; gap:20px; align-items:flex-end; padding-bottom:24px; border-bottom:1px solid oklch(86% 0.018 238); }
    .eyebrow { color: oklch(46% 0.07 242); font-size:12px; font-weight:700; text-transform:uppercase; letter-spacing:.08em; }
    h1 { margin: 4px 0 0; font-size: 30px; letter-spacing: 0; }
    p { color: oklch(43% 0.024 246); }
    .mode-note { margin-top:10px; display:inline-flex; flex-wrap:wrap; gap:8px; align-items:center; border:1px solid oklch(84% 0.038 160); background:oklch(96% 0.023 160); color:oklch(34% 0.07 160); border-radius:999px; padding:7px 11px; font-size:13px; }
    .mode-note.live { border-color:oklch(84% 0.038 244); background:oklch(96% 0.022 244); color:oklch(35% 0.08 244); }
    .modules { display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:14px; margin:24px 0; }
    .module, .item, form { background: oklch(99% 0.004 235); border:1px solid oklch(88% 0.018 238); border-radius:8px; padding:16px; }
    .module h2, .item h3 { margin:0 0 6px; font-size:15px; }
    .items { display:grid; gap:10px; }
    .item { display:grid; grid-template-columns: 1fr auto; gap:12px; align-items:center; }
    .item-actions { display:flex; gap:7px; justify-content:flex-end; flex-wrap:wrap; }
    .badge { border:1px solid oklch(80% 0.04 242); border-radius:999px; padding:4px 9px; font-size:12px; color:oklch(38% 0.07 242); }
    form { display:grid; grid-template-columns: minmax(180px, 1fr) 150px auto; gap:8px; margin-top:22px; }
    input { flex:1; border:1px solid oklch(82% 0.018 238); border-radius:7px; padding:10px 12px; font:inherit; }
    button { border:0; border-radius:7px; background:oklch(47% 0.12 244); color:oklch(99% 0.005 235); padding:10px 13px; font-weight:700; cursor:pointer; }
    button.secondary { background:oklch(92% 0.035 244); color:oklch(37% 0.095 244); }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <div class="eyebrow">${escapeHtml(mode === "published" ? copy.published : copy.preview)} · ${escapeHtml(project.app_id)}@${escapeHtml(version.version_id)}</div>
        <h1>${escapeHtml(version.definition.title)}</h1>
        <p>${escapeHtml(version.definition.description)}</p>
        <div class="mode-note ${mode === "published" ? "live" : ""}"><strong>${escapeHtml(modeTitle)}</strong><span>${escapeHtml(modeHelp)}</span></div>
      </div>
      <span class="badge">${escapeHtml(lang === "zh" && version.definition.theme.density === "compact" ? copy.compact : version.definition.theme.density)}</span>
    </header>
    <section class="modules">${version.definition.modules.map((mod) => `
      <article class="module">
        <h2>${escapeHtml(mod.title)}</h2>
        <p>${escapeHtml(mod.description)}</p>
      </article>`).join("")}
    </section>
    <section class="items">${items.map((item) => `
      <article class="item">
        <div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.owner)}${item.url ? ` · <a href="${escapeHtml(item.url)}">${escapeHtml(copy.source)}</a>` : ""}</p>
        </div>
        <div class="item-actions">
          <span class="badge">${escapeHtml(item.priority ?? copy.noPriority)}</span>
          <span class="badge" data-status="${escapeHtml(item.status)}">${escapeHtml(copy.statuses[item.status])}</span>
          <button class="secondary" data-item-id="${escapeHtml(item.id)}" data-action="advance-status">${escapeHtml(copy.advance)}</button>
          <button class="secondary" data-item-id="${escapeHtml(item.id)}" data-action="raise-priority">${escapeHtml(copy.raise)}</button>
        </div>
      </article>`).join("")}
    </section>
    ${mode === "preview" ? `<div class="item-actions"><button class="secondary" data-action="reset-sandbox">${escapeHtml(copy.resetSandbox)}</button><button class="secondary" data-action="end-preview">${escapeHtml(copy.endPreview)}</button></div>` : ""}
    <form data-app-id="${escapeHtml(appId)}">
      <input name="title" placeholder="${escapeHtml(copy.titlePlaceholder)}">
      <input name="owner" placeholder="${escapeHtml(copy.ownerPlaceholder)}">
      <button>${escapeHtml(copy.addItem)}</button>
    </form>
  </main>
  <script>
    document.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const title = form.querySelector("input[name='title']");
      const owner = form.querySelector("input[name='owner']");
      await fetch("${escapeJs(apiBase)}/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.value, owner: owner.value || "${escapeJs(copy.fallbackOwner)}" })
      });
      location.reload();
    });
    document.querySelector(".items").addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-item-id]");
      if (!button) return;
      const statusBadge = button.closest(".item").querySelector("[data-status]");
      const body = button.dataset.action === "advance-status"
        ? { status: nextStatus(statusBadge.dataset.status) }
        : { priority: "P1" };
      await fetch("${escapeJs(apiBase)}/items/" + encodeURIComponent(button.dataset.itemId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      location.reload();
    });
    document.querySelector("[data-action='reset-sandbox']")?.addEventListener("click", async () => {
      await fetch("/api/previews/${escapeJs(preview?.preview_id ?? "")}/reset", { method: "POST" });
      location.reload();
    });
    document.querySelector("[data-action='end-preview']")?.addEventListener("click", async () => {
      await fetch("/api/previews/${escapeJs(preview?.preview_id ?? "")}/end", { method: "POST" });
      location.href = "/preview/${escapeJs(appId)}?preview_id=ended";
    });
    function nextStatus(status) {
      if (status === "todo") return "doing";
      if (status === "doing") return "needs_review";
      if (status === "needs_review") return "approved";
      return "todo";
    }
  </script>
</body>
</html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

interface PreviewSandbox {
  readonly preview_id: string;
  readonly app_id: string;
  readonly version_id: string;
  items: DevBoardItem[];
  expires_at_ms: number;
}

function createPreviewSandbox(appId: string): { readonly preview_id: string; readonly url: string } {
  prunePreviewSandboxes();
  const project = host.store.getProject(appId);
  const version = host.store.getVersion(appId, project.current_version_id);
  const previewId = `preview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  previewSandboxes.set(previewId, {
    preview_id: previewId,
    app_id: appId,
    version_id: version.version_id,
    items: cloneItems(version.items),
    expires_at_ms: Date.now() + previewTtlMs,
  });
  return { preview_id: previewId, url: `${hostBaseUrl()}/preview/${appId}?preview_id=${previewId}` };
}

function requirePreviewSandbox(previewId: string | undefined, appId: string): PreviewSandbox | undefined {
  prunePreviewSandboxes();
  if (!previewId) return undefined;
  const sandbox = previewSandboxes.get(previewId);
  if (!sandbox || sandbox.app_id !== appId) return undefined;
  sandbox.expires_at_ms = Date.now() + previewTtlMs;
  return sandbox;
}

function resetPreviewSandbox(previewId: string): { readonly ok: true; readonly preview_id: string; readonly item_count: number } {
  const sandbox = previewSandboxes.get(previewId);
  if (!sandbox) throw new Error(`Preview sandbox ${previewId} has expired.`);
  const version = host.store.getVersion(sandbox.app_id, sandbox.version_id);
  sandbox.items = cloneItems(version.items);
  sandbox.expires_at_ms = Date.now() + previewTtlMs;
  return { ok: true, preview_id: previewId, item_count: sandbox.items.length };
}

function addPreviewItem(previewId: string, appId: string, title: string, owner: string): { readonly ok: true; readonly item: DevBoardItem } {
  const sandbox = requirePreviewSandbox(previewId, appId);
  if (!sandbox) throw new Error(`Preview sandbox ${previewId} has expired.`);
  const item: DevBoardItem = {
    id: `preview-item-${Date.now().toString(36)}`,
    title,
    owner,
    status: "todo",
    priority: "P3",
  };
  sandbox.items = [...sandbox.items, item];
  return { ok: true, item };
}

function updatePreviewItem(
  previewId: string,
  appId: string,
  itemId: string,
  patch: { readonly status?: DevBoardItem["status"]; readonly priority?: DevBoardItem["priority"] },
): { readonly ok: true; readonly item: DevBoardItem } {
  const sandbox = requirePreviewSandbox(previewId, appId);
  if (!sandbox) throw new Error(`Preview sandbox ${previewId} has expired.`);
  let updated: DevBoardItem | undefined;
  sandbox.items = sandbox.items.map((item) => {
    if (item.id !== itemId) return item;
    updated = {
      ...item,
      status: patch.status ?? item.status,
      priority: patch.priority ?? item.priority,
    };
    return updated;
  });
  if (!updated) throw new Error(`Item ${itemId} does not exist.`);
  return { ok: true, item: updated };
}

function destroyPreviewSandboxesForApp(appId: string): void {
  for (const [previewId, sandbox] of previewSandboxes) {
    if (sandbox.app_id === appId) previewSandboxes.delete(previewId);
  }
}

function prunePreviewSandboxes(): void {
  const now = Date.now();
  for (const [previewId, sandbox] of previewSandboxes) {
    if (sandbox.expires_at_ms <= now) previewSandboxes.delete(previewId);
  }
}

function cloneItems(items: readonly DevBoardItem[]): DevBoardItem[] {
  return items.map((item) => ({ ...item }));
}

function hostBaseUrl(): string {
  return `http://127.0.0.1:${server.port}`;
}

function previewExpiredPage(lang: "en" | "zh"): Response {
  const title = lang === "zh" ? "预览已结束" : "Preview ended";
  const body = lang === "zh"
    ? "这个预览沙盒已经销毁。请回到 Builder 工作台重新启动预览。"
    : "This preview sandbox has been discarded. Return to the Builder workbench and start preview again.";
  return new Response(`<!doctype html><html lang="${lang === "zh" ? "zh-CN" : "en"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",system-ui,sans-serif;background:oklch(97% 0.007 235);color:oklch(22% 0.018 246)}main{max-width:680px;margin:18vh auto;padding:32px}h1{margin:0 0 10px;font-size:28px;letter-spacing:0}p{color:oklch(43% 0.024 246);font-size:16px;line-height:1.55}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p></main></body></html>`, {
    status: 410,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

function addRuntimeItem(appId: string, title: string, owner: string): { readonly ok: true; readonly item: DevBoardItem } {
  const project = host.store.getProject(appId);
  const versionId = project.active_version_id ?? project.current_version_id;
  const version = host.store.getVersion(appId, versionId);
  const item: DevBoardItem = {
    id: `item-${Date.now().toString(36)}`,
    title,
    owner,
    status: "todo",
    priority: "P3",
  };
  host.store.saveVersion({ ...version, items: [...version.items, item] });
  return { ok: true, item };
}

function updateRuntimeItem(
  appId: string,
  itemId: string,
  patch: { readonly status?: DevBoardItem["status"]; readonly priority?: DevBoardItem["priority"] },
): { readonly ok: true; readonly item: DevBoardItem } {
  const project = host.store.getProject(appId);
  const versionId = project.active_version_id ?? project.current_version_id;
  const version = host.store.getVersion(appId, versionId);
  let updated: DevBoardItem | undefined;
  const items = version.items.map((item) => {
    if (item.id !== itemId) return item;
    updated = {
      ...item,
      status: patch.status ?? item.status,
      priority: patch.priority ?? item.priority,
    };
    return updated;
  });
  if (!updated) throw new Error(`Item ${itemId} does not exist.`);
  host.store.saveVersion({ ...version, items });
  return { ok: true, item: updated };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function escapeJs(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', "\\\"");
}
