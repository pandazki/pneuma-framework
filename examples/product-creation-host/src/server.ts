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

const server = Bun.serve({
  port,
  idleTimeout: 255,
  async fetch(request) {
    try {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/") return fileResponse("index.html", "text/html; charset=utf-8");
      if (request.method === "GET" && url.pathname === "/static/styles.css") return fileResponse("styles.css", "text/css; charset=utf-8");
      if (request.method === "GET" && url.pathname === "/static/app.js") return fileResponse("app.js", "text/javascript; charset=utf-8");
      if (request.method === "GET" && url.pathname === "/api/state") return json({ ...host.snapshot(), workspace });

      const previewMatch = /^\/preview\/([^/]+)$/.exec(url.pathname);
      if (request.method === "GET" && previewMatch) return devBoardPage(previewMatch[1], "preview");
      const appMatch = /^\/app\/([^/]+)$/.exec(url.pathname);
      if (request.method === "GET" && appMatch) return devBoardPage(appMatch[1], "published");

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
        return json(await host.approveEvolution({
          app_id: approveMatch[1],
          subject: body.subject ?? "role:reviewer",
          decision: body.decision,
          reason: body.reason,
        }));
      }

      const previewStartMatch = /^\/api\/projects\/([^/]+)\/preview\/start$/.exec(url.pathname);
      if (request.method === "POST" && previewStartMatch) return json(await host.startPreview({ app_id: previewStartMatch[1] }));

      const publishMatch = /^\/api\/projects\/([^/]+)\/publish$/.exec(url.pathname);
      if (request.method === "POST" && publishMatch) return json(await host.publish({ app_id: publishMatch[1] }));

      const rollbackMatch = /^\/api\/projects\/([^/]+)\/rollback$/.exec(url.pathname);
      if (request.method === "POST" && rollbackMatch) return json(await host.rollback({ app_id: rollbackMatch[1] }));

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
    headers: { "content-type": contentType },
  });
}

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value, null, 2), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function devBoardPage(appId: string, mode: "preview" | "published"): Response {
  const project = host.store.getProject(appId);
  const versionId = mode === "published" ? project.active_version_id ?? project.current_version_id : project.current_version_id;
  const version = host.store.getVersion(appId, versionId);
  const html = `<!doctype html>
<html lang="en">
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
        <div class="eyebrow">${mode} · ${escapeHtml(project.app_id)}@${escapeHtml(version.version_id)}</div>
        <h1>${escapeHtml(version.definition.title)}</h1>
        <p>${escapeHtml(version.definition.description)}</p>
      </div>
      <span class="badge">${escapeHtml(version.definition.theme.density)}</span>
    </header>
    <section class="modules">${version.definition.modules.map((mod) => `
      <article class="module">
        <h2>${escapeHtml(mod.title)}</h2>
        <p>${escapeHtml(mod.description)}</p>
      </article>`).join("")}
    </section>
    <section class="items">${version.items.map((item) => `
      <article class="item">
        <div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.owner)}${item.url ? ` · <a href="${escapeHtml(item.url)}">source</a>` : ""}</p>
        </div>
        <div class="item-actions">
          <span class="badge">${escapeHtml(item.priority ?? "no priority")}</span>
          <span class="badge">${escapeHtml(item.status)}</span>
          <button class="secondary" data-item-id="${escapeHtml(item.id)}" data-action="advance-status">Advance</button>
          <button class="secondary" data-item-id="${escapeHtml(item.id)}" data-action="raise-priority">Raise</button>
        </div>
      </article>`).join("")}
    </section>
    <form data-app-id="${escapeHtml(appId)}">
      <input name="title" placeholder="Add a visible follow-up item">
      <input name="owner" placeholder="Owner">
      <button>Add item</button>
    </form>
  </main>
  <script>
    document.querySelector("form").addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const title = form.querySelector("input[name='title']");
      const owner = form.querySelector("input[name='owner']");
      await fetch("/api/apps/${escapeJs(appId)}/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: title.value, owner: owner.value || "End User" })
      });
      location.reload();
    });
    document.querySelector(".items").addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-item-id]");
      if (!button) return;
      const body = button.dataset.action === "advance-status"
        ? { status: nextStatus(button.closest(".item").querySelectorAll(".badge")[1].textContent) }
        : { priority: "P1" };
      await fetch("/api/apps/${escapeJs(appId)}/items/" + encodeURIComponent(button.dataset.itemId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      location.reload();
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
