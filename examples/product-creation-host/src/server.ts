import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProductCreationHost } from "./host/product-host.js";
import { hasModule, type DevBoardItem } from "./domain/dev-board.js";
import {
  actionForRuntimeField,
  applyRuntimeItemPatch,
  localizeRuntimeLabel,
  type DevBoardRuntimeExtension,
} from "./domain/runtime-extension.js";

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
        const body = await request.json() as DevBoardItemPatch;
        return json(updatePreviewItem(updatePreviewItemMatch[1], updatePreviewItemMatch[2], updatePreviewItemMatch[3], body));
      }

      const addItemMatch = /^\/api\/apps\/([^/]+)\/items$/.exec(url.pathname);
      if (request.method === "POST" && addItemMatch) {
        const body = await request.json() as { title?: string; owner?: string };
        return json(addRuntimeItem(addItemMatch[1], body.title?.trim() || "New follow-up", body.owner?.trim() || "End User"));
      }

      const updateItemMatch = /^\/api\/apps\/([^/]+)\/items\/([^/]+)$/.exec(url.pathname);
      if (request.method === "POST" && updateItemMatch) {
        const body = await request.json() as DevBoardItemPatch;
        return json(updateRuntimeItem(updateItemMatch[1], updateItemMatch[2], body));
      }

      return json({ error: "not_found" }, 404);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const status = message.includes("runtime extension does not allow editing owner") ? 409 : 500;
      return json({ error: message }, status);
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
        modules: "模块",
        priorityBoard: "优先级看板",
        priorityBoardHelp: "每个事项按 P1/P2/P3 分层，先处理左侧最高风险工作。",
        githubAttention: "GitHub 关注项",
        githubAttentionHelp: "集中查看带来源链接的 issue / PR，直接推进状态或提升优先级。",
        reviewQueue: "评审队列",
        reviewQueueHelp: "把事项从进行中推到待评审，再推进为已批准。",
        releaseReadiness: "发布检查",
        releaseReadinessHelp: "发布前快速确认哪些事项仍在推进、评审或阻断。",
        dependencyMap: "依赖地图",
        dependencyMapHelp: "看清前置事项，避免在依赖未完成时盲目推进。",
        blockerTriage: "阻塞处理",
        blockerTriageHelp: "把卡住的工作和阻塞原因放到同一个地方处理。",
        ciHealth: "CI 健康度",
        ciHealthHelp: "把构建、测试和集成信号跟事项放在一起看。",
        deliveryTimeline: "交付时间线",
        deliveryTimelineHelp: "按截止日期和工作量观察交付压力。",
        allItems: "全部事项",
        addQuickItem: "添加事项",
        item: "事项",
        owner: "负责人",
        status: "状态",
        priority: "优先级",
        noPriority: "无优先级",
        advance: "推进",
        raise: "提为 P1",
        block: "标记阻塞",
        cycleCi: "切换 CI",
        openSource: "打开来源",
        dueDate: "截止日期",
        dependsOn: "依赖",
        ciStatus: "CI",
        effort: "工作量",
        reason: "原因",
        emptyLane: "暂无事项",
        ready: "已就绪",
        active: "进行中",
        waiting: "待处理",
        blocked: "阻断",
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
          blocked: "已阻断",
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
        modules: "Modules",
        priorityBoard: "Priority board",
        priorityBoardHelp: "Items are split by P1/P2/P3 so the highest-risk work is obvious.",
        githubAttention: "GitHub attention",
        githubAttentionHelp: "Review linked issues and PRs, then advance status or raise priority.",
        reviewQueue: "Review queue",
        reviewQueueHelp: "Move work from active implementation into needs_review and approved.",
        releaseReadiness: "Release readiness",
        releaseReadinessHelp: "Check what is active, waiting for review, approved, or blocked before publishing.",
        dependencyMap: "Dependency map",
        dependencyMapHelp: "See prerequisites before moving work forward.",
        blockerTriage: "Blocker triage",
        blockerTriageHelp: "Keep blocked work and the recovery reason in one place.",
        ciHealth: "CI health",
        ciHealthHelp: "Review build, test, and integration signal beside each item.",
        deliveryTimeline: "Delivery timeline",
        deliveryTimelineHelp: "Read delivery pressure by due date and effort.",
        allItems: "All items",
        addQuickItem: "Add item",
        item: "Item",
        owner: "Owner",
        status: "Status",
        priority: "Priority",
        noPriority: "no priority",
        advance: "Advance",
        raise: "Raise",
        block: "Block",
        cycleCi: "Cycle CI",
        openSource: "Open source",
        dueDate: "Due date",
        dependsOn: "Depends on",
        ciStatus: "CI",
        effort: "Effort",
        reason: "Reason",
        emptyLane: "No items",
        ready: "Ready",
        active: "Active",
        waiting: "Waiting",
        blocked: "Blocked",
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
          blocked: "blocked",
        } satisfies Record<DevBoardItem["status"], string>,
      };
}

function runtimeModuleDisplay(
  mod: { readonly kind: string; readonly title: string; readonly description: string },
  lang: "en" | "zh",
): { readonly title: string; readonly description: string } {
  if (lang !== "zh") return { title: mod.title, description: mod.description };
  const labels: Record<string, { readonly title: string; readonly description: string }> = {
    watchlist: { title: "工程关注列表", description: "让最高风险的项目事项始终可见。" },
    release_checklist: { title: "发布检查清单", description: "在发布版本前跟踪准备状态和检查项。" },
    review_queue: { title: "评审队列", description: "让事项经过待评审和已批准状态。" },
    github_attention: { title: "GitHub 关注项", description: "集中展示需要处理的 issue 和 pull request。" },
    priority_lane: { title: "优先级工作流", description: "把 P1/P2/P3 工作拆开，让下一步行动更明确。" },
    daily_plan: { title: "每日计划", description: "不打开完整项目管理器，也能规划下一段工作。" },
    notes: { title: "工作笔记", description: "先记录零散实现观察，避免它们丢失。" },
    dependency_map: { title: "依赖地图", description: "展示事项之间的前置依赖。" },
    blocker_triage: { title: "阻塞处理", description: "追踪被阻塞事项和恢复路径。" },
    ci_health: { title: "CI 健康度", description: "把构建和测试信号放进看板。" },
    delivery_timeline: { title: "交付时间线", description: "按截止日期和工作量观察交付压力。" },
  };
  return labels[mod.kind] ?? { title: mod.title, description: mod.description };
}

function runtimeItemTitle(item: DevBoardItem, lang: "en" | "zh"): string {
  if (lang !== "zh") return item.title;
  const labels: Record<string, string> = {
    "ci-flake": "排查预览发布中的 CI 偶发失败",
    "pr-review": "评审待处理的看板 PR",
    "release-notes": "准备周五发布说明",
    "focus-auth": "梳理 OAuth 回调边界问题",
    "read-issues": "查看最近需要关注的 GitHub issue",
    "notes-cleanup": "清理过期实现笔记",
  };
  return labels[item.id] ?? item.title;
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
  const definition = version.definition;
  const runtimeExtension = version.runtime_extension;
  const hasPriority = hasModule(definition, "priority_lane");
  const hasGitHub = hasModule(definition, "github_attention");
      const hasReview = hasModule(definition, "review_queue");
      const hasRelease = hasModule(definition, "release_checklist");
      const hasDependency = hasModule(definition, "dependency_map");
      const hasBlockers = hasModule(definition, "blocker_triage");
      const hasCi = hasModule(definition, "ci_health");
      const hasTimeline = hasModule(definition, "delivery_timeline");
  const readyCount = items.filter((item) => item.status === "approved").length;
  const activeCount = items.filter((item) => item.status === "doing" || item.status === "needs_review").length;
  const blockedCount = items.filter((item) => item.status === "blocked").length;
  const html = `<!doctype html>
<html lang="${lang === "zh" ? "zh-CN" : "en"}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(definition.title)}</title>
  <style>
    :root { color-scheme: light; --bg: oklch(97% 0.009 224); --surface: oklch(99% 0.004 224); --surface-2: oklch(95.5% 0.014 224); --line: oklch(86% 0.022 224); --line-strong: oklch(78% 0.032 224); --text: oklch(22% 0.023 236); --muted: oklch(47% 0.029 236); --accent: oklch(48% 0.118 214); --accent-soft: oklch(92% 0.038 214); --success: oklch(45% 0.11 153); --warning: oklch(58% 0.12 74); --danger: oklch(55% 0.16 28); }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif; background: linear-gradient(180deg, var(--bg), oklch(94% 0.015 224)); color: var(--text); }
    body::before { content:""; position:fixed; inset:0; pointer-events:none; background-image: linear-gradient(var(--line) 1px, transparent 1px), linear-gradient(90deg, var(--line) 1px, transparent 1px); background-size: 40px 40px; opacity:.34; }
    main { position:relative; max-width: 1240px; margin: 0 auto; padding: 28px; }
    header { display:grid; grid-template-columns: minmax(0, 1fr) auto; gap:24px; align-items:end; padding:22px 0 24px; border-bottom:1px solid var(--line); }
    .eyebrow { color: var(--accent); font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.08em; }
    h1 { margin: 6px 0 8px; font-size: 32px; line-height:1.12; letter-spacing: 0; }
    h2 { margin:0; font-size:18px; line-height:1.25; letter-spacing:0; }
    h3 { margin:0; font-size:14px; line-height:1.35; letter-spacing:0; }
    p { color: var(--muted); line-height:1.55; margin:0; }
    a { color: var(--accent); font-weight:700; text-decoration:none; }
    .mode-note { margin-top:12px; display:inline-flex; flex-wrap:wrap; gap:8px; align-items:center; border:1px solid oklch(83% 0.04 156); background:oklch(97% 0.025 156); color:oklch(34% 0.08 156); border-radius:999px; padding:7px 11px; font-size:13px; }
    .mode-note.live { border-color:oklch(82% 0.042 214); background:oklch(96% 0.027 214); color:oklch(34% 0.09 214); }
    .summary { display:grid; grid-template-columns:repeat(4, minmax(96px, 1fr)); border:1px solid var(--line); border-radius:10px; overflow:hidden; background:var(--surface); box-shadow:0 18px 42px oklch(62% 0.04 224 / .16); }
    .summary div { min-width:110px; padding:14px 16px; border-left:1px solid var(--line); }
    .summary div:first-child { border-left:0; }
    .summary strong { display:block; font-size:23px; line-height:1; }
    .summary span { display:block; margin-top:6px; color:var(--muted); font-size:12px; font-weight:700; }
    .section { margin-top:22px; }
    .section-head { display:flex; justify-content:space-between; gap:16px; align-items:flex-end; margin-bottom:10px; }
    .section-head p { max-width:68ch; }
    .modules { display:grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap:12px; margin-top:14px; }
    .module, .panel, .lane, .table, form { background: color-mix(in oklch, var(--surface) 92%, var(--surface-2)); border:1px solid var(--line); border-radius:10px; }
    .module { padding:14px; }
    .module p { margin-top:6px; font-size:13px; }
    .board { display:grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap:12px; }
    .lane { min-height:230px; padding:12px; }
    .lane-head { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
    .lane-title { display:flex; gap:8px; align-items:center; font-weight:800; }
    .dot { width:9px; height:9px; border-radius:99px; background:var(--accent); }
    .dot.p1 { background:var(--danger); }
    .dot.p2 { background:var(--warning); }
    .dot.p3 { background:var(--accent); }
    .cards { display:grid; gap:8px; }
    .task { background:var(--surface); border:1px solid var(--line); border-radius:8px; padding:12px; }
    .task-top { display:flex; justify-content:space-between; gap:10px; align-items:start; }
    .task-title { font-weight:800; line-height:1.35; }
    .task-meta { display:flex; gap:6px; flex-wrap:wrap; margin-top:8px; }
    .task-actions { display:flex; gap:7px; flex-wrap:wrap; margin-top:10px; }
    .item-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; margin-top:14px; }
    .badge { display:inline-flex; align-items:center; gap:5px; border:1px solid oklch(80% 0.035 224); background:oklch(97% 0.008 224); border-radius:999px; padding:4px 8px; font-size:12px; line-height:1; color:oklch(37% 0.04 236); font-weight:700; }
      .badge.status-approved { border-color:oklch(78% 0.06 153); background:oklch(96% 0.028 153); color:oklch(36% 0.09 153); }
      .badge.status-blocked { border-color:oklch(78% 0.07 28); background:oklch(96% 0.03 28); color:oklch(38% 0.12 28); }
      .badge.ci-passing { border-color:oklch(78% 0.06 153); background:oklch(96% 0.028 153); color:oklch(36% 0.09 153); }
      .badge.ci-running { border-color:oklch(78% 0.08 74); background:oklch(96% 0.032 74); color:oklch(42% 0.1 74); }
      .badge.ci-failing { border-color:oklch(78% 0.07 28); background:oklch(96% 0.03 28); color:oklch(38% 0.12 28); }
    .badge.priority-P1 { border-color:oklch(76% 0.08 28); background:oklch(96% 0.03 28); color:oklch(39% 0.13 28); }
    .badge.priority-P2 { border-color:oklch(78% 0.08 74); background:oklch(96% 0.032 74); color:oklch(42% 0.1 74); }
    .badge.priority-P3 { border-color:oklch(78% 0.06 214); background:oklch(96% 0.028 214); color:oklch(36% 0.1 214); }
    .empty { border:1px dashed var(--line-strong); border-radius:8px; padding:18px; color:var(--muted); text-align:center; }
    .attention-grid { display:grid; grid-template-columns: minmax(0, 1fr) 280px; gap:12px; }
    .attention-grid .readiness { grid-template-columns:1fr 1fr; }
    .panel { padding:16px; }
    .rows { display:grid; gap:8px; }
    .row { display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:12px; align-items:center; padding:12px; border:1px solid var(--line); border-radius:8px; background:var(--surface); }
      .readiness { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:10px; }
      .timeline { display:grid; gap:10px; }
      .timeline-item { display:grid; grid-template-columns:120px minmax(0, 1fr) auto; gap:12px; align-items:center; padding:12px; border:1px solid var(--line); border-radius:8px; background:var(--surface); }
      .dependency-list { display:grid; gap:8px; }
      .dependency-item { display:grid; grid-template-columns:minmax(0, 1fr) 28px minmax(0, 1fr); gap:10px; align-items:center; padding:12px; border:1px solid var(--line); border-radius:8px; background:var(--surface); }
      .arrow { color:var(--accent); font-weight:900; text-align:center; }
    .metric { border:1px solid var(--line); border-radius:8px; background:var(--surface); padding:14px; }
    .metric strong { display:block; font-size:24px; }
    .metric span { color:var(--muted); font-size:12px; font-weight:800; }
    .table { overflow:hidden; }
    .table-row { display:grid; grid-template-columns:minmax(0, 1.8fr) 140px 130px 130px auto; gap:12px; align-items:center; padding:12px 14px; border-top:1px solid var(--line); }
    .table-row:first-child { border-top:0; }
    .table-row.head { background:var(--surface-2); color:var(--muted); font-size:12px; font-weight:800; text-transform:uppercase; letter-spacing:.04em; }
    form { display:grid; grid-template-columns: minmax(220px, 1fr) 180px auto; gap:10px; margin-top:22px; padding:14px; }
    input, select { min-width:0; border:1px solid var(--line-strong); border-radius:8px; padding:11px 12px; font:inherit; background:var(--surface); color:var(--text); }
    select { appearance:none; background-image:linear-gradient(45deg, transparent 50%, var(--muted) 50%), linear-gradient(135deg, var(--muted) 50%, transparent 50%); background-position:calc(100% - 16px) 50%, calc(100% - 11px) 50%; background-size:5px 5px, 5px 5px; background-repeat:no-repeat; padding-right:30px; }
    input:focus, select:focus, button:focus-visible, a:focus-visible { outline:3px solid oklch(76% 0.09 214 / .5); outline-offset:2px; }
    .field-editor { display:block; }
    .field-editor select, .field-editor input { width:100%; max-width:150px; padding:8px 30px 8px 10px; font-size:13px; font-weight:700; }
    .sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
    button { border:1px solid oklch(45% 0.12 214); border-radius:8px; background:var(--accent); color:oklch(99% 0.005 224); padding:9px 12px; font-weight:800; cursor:pointer; font:inherit; }
    button.secondary { border-color:var(--line-strong); background:var(--surface); color:var(--text); }
    button:hover { filter:brightness(.98); }
      @media (max-width: 980px) { main { padding:18px; } header, .attention-grid { grid-template-columns:1fr; } .summary, .board, .readiness, .timeline-item, .dependency-item { grid-template-columns:1fr; } .arrow { text-align:left; } .table-row { grid-template-columns:1fr; } form { grid-template-columns:1fr; } }
  </style>
</head>
<body>
  <main>
    <header>
      <div>
        <div class="eyebrow">${escapeHtml(mode === "published" ? copy.published : copy.preview)} · ${escapeHtml(project.app_id)}@${escapeHtml(version.version_id)}</div>
        <h1>${escapeHtml(definition.title)}</h1>
        <p>${escapeHtml(definition.description)}</p>
        <div class="mode-note ${mode === "published" ? "live" : ""}"><strong>${escapeHtml(modeTitle)}</strong><span>${escapeHtml(modeHelp)}</span></div>
      </div>
      <div class="summary">
        <div><strong>${escapeHtml(version.version_id)}</strong><span>${escapeHtml(lang === "zh" ? "版本" : "Version")}</span></div>
        <div><strong>${items.length}</strong><span>${escapeHtml(lang === "zh" ? "事项" : "Items")}</span></div>
        <div><strong>${readyCount}</strong><span>${escapeHtml(copy.ready)}</span></div>
        <div><strong>${blockedCount}</strong><span>${escapeHtml(copy.blocked)}</span></div>
      </div>
    </header>
    <section class="section">
      <div class="section-head"><h2>${escapeHtml(copy.modules)}</h2><span class="badge">${escapeHtml(lang === "zh" && definition.theme.density === "compact" ? copy.compact : definition.theme.density)}</span></div>
      <div class="modules">${definition.modules.map((mod) => {
      const display = runtimeModuleDisplay(mod, lang);
      return `
      <article class="module">
        <h2>${escapeHtml(display.title)}</h2>
        <p>${escapeHtml(display.description)}</p>
      </article>`;
    }).join("")}</div>
    </section>
    ${hasPriority ? renderPriorityBoard(items, lang, copy) : ""}
      ${hasGitHub ? renderGitHubAttention(items, lang, copy) : ""}
      ${hasReview ? renderReviewQueue(items, lang, copy) : ""}
      ${hasBlockers ? renderBlockerTriage(items, lang, copy) : ""}
      ${hasDependency ? renderDependencyMap(items, lang, copy) : ""}
      ${hasCi ? renderCiHealth(items, lang, copy) : ""}
      ${hasTimeline ? renderDeliveryTimeline(items, lang, copy) : ""}
      ${hasRelease ? renderReleaseReadiness({ items, readyCount, activeCount, blockedCount, copy }) : ""}
    <section class="section">
      <div class="section-head"><div><h2>${escapeHtml(copy.allItems)}</h2><p>${escapeHtml(lang === "zh" ? "这是最终应用的可编辑数据。预览沙盒和线上数据互相隔离。" : "Editable app data. Preview sandbox data and live data stay isolated.")}</p></div></div>
      ${renderAllItems(items, lang, copy, runtimeExtension)}
    </section>
    ${mode === "preview" ? `<div class="item-actions"><button class="secondary" data-action="reset-sandbox">${escapeHtml(copy.resetSandbox)}</button><button class="secondary" data-action="end-preview">${escapeHtml(copy.endPreview)}</button></div>` : ""}
    <form data-app-id="${escapeHtml(appId)}">
      <strong>${escapeHtml(copy.addQuickItem)}</strong>
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
    document.body.addEventListener("click", async (event) => {
      const button = event.target.closest("button[data-item-id]");
      if (!button) return;
      const statusBadge = button.closest("[data-card-id]").querySelector("[data-status]");
      const body = patchForAction(button.dataset.action, statusBadge.dataset.status, button.closest("[data-card-id]").dataset.ciStatus);
      await fetch("${escapeJs(apiBase)}/items/" + encodeURIComponent(button.dataset.itemId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body)
      });
      location.reload();
    });
    document.body.addEventListener("change", async (event) => {
      const control = event.target.closest("[data-runtime-field]");
      if (!control) return;
      await fetch("${escapeJs(apiBase)}/items/" + encodeURIComponent(control.dataset.itemId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ [control.dataset.runtimeField]: control.value })
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
      function patchForAction(action, status, ciStatus) {
        if (action === "advance-status") return { status: nextStatus(status) };
        if (action === "raise-priority") return { priority: "P1" };
        if (action === "block-item") return { status: "blocked", blocked_reason: "Needs owner decision" };
        if (action === "cycle-ci") return { ci_status: nextCiStatus(ciStatus) };
        return {};
      }
      function nextCiStatus(status) {
        if (status === "failing") return "running";
        if (status === "running") return "passing";
        if (status === "passing") return "unknown";
        return "failing";
      }
  </script>
</body>
</html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8" } });
}

type RuntimeCopy = ReturnType<typeof runtimeText>;

function renderPriorityBoard(items: readonly DevBoardItem[], lang: "en" | "zh", copy: RuntimeCopy): string {
  const priorities = ["P1", "P2", "P3"] as const;
  return `<section class="section">
    <div class="section-head">
      <div><h2>${escapeHtml(copy.priorityBoard)}</h2><p>${escapeHtml(copy.priorityBoardHelp)}</p></div>
    </div>
    <div class="board">${priorities.map((priority) => {
      const laneItems = items.filter((item) => (item.priority ?? "P3") === priority);
      return `<article class="lane">
        <div class="lane-head">
          <div class="lane-title"><span class="dot ${priority.toLowerCase()}"></span>${escapeHtml(priority)}</div>
          <span class="badge">${laneItems.length}</span>
        </div>
        <div class="cards">${laneItems.length > 0 ? laneItems.map((item) => renderTaskCard(item, lang, copy)).join("") : `<div class="empty">${escapeHtml(copy.emptyLane)}</div>`}</div>
      </article>`;
    }).join("")}</div>
  </section>`;
}

function renderGitHubAttention(items: readonly DevBoardItem[], lang: "en" | "zh", copy: RuntimeCopy): string {
  const linkedItems = items.filter((item) => item.url);
  const p1Count = items.filter((item) => item.priority === "P1").length;
  const reviewCount = items.filter((item) => item.status === "needs_review").length;
  return `<section class="section">
    <div class="section-head">
      <div><h2>${escapeHtml(copy.githubAttention)}</h2><p>${escapeHtml(copy.githubAttentionHelp)}</p></div>
    </div>
    <div class="attention-grid">
      <div class="panel rows">${linkedItems.length > 0 ? linkedItems.map((item) => `<div class="row" data-card-id="${escapeHtml(item.id)}">
        <div>
          <h3>${escapeHtml(runtimeItemTitle(item, lang))}</h3>
          <div class="task-meta">${renderPriorityBadge(item, copy)}${renderStatusBadge(item, copy)}<span class="badge">${escapeHtml(item.owner)}</span></div>
        </div>
        <div class="task-actions">
          <a class="badge" href="${escapeHtml(item.url ?? "#")}" target="_blank" rel="noreferrer">${escapeHtml(copy.openSource)}</a>
          <button class="secondary" data-item-id="${escapeHtml(item.id)}" data-action="advance-status">${escapeHtml(copy.advance)}</button>
          <button class="secondary" data-item-id="${escapeHtml(item.id)}" data-action="raise-priority">${escapeHtml(copy.raise)}</button>
        </div>
      </div>`).join("") : `<div class="empty">${escapeHtml(copy.emptyLane)}</div>`}</div>
      <aside class="panel readiness">
        <div class="metric"><strong>${linkedItems.length}</strong><span>${escapeHtml(copy.source)}</span></div>
        <div class="metric"><strong>${p1Count}</strong><span>P1</span></div>
        <div class="metric"><strong>${reviewCount}</strong><span>${escapeHtml(copy.waiting)}</span></div>
        <div class="metric"><strong>${items.length}</strong><span>${escapeHtml(copy.allItems)}</span></div>
      </aside>
    </div>
  </section>`;
}

function renderReviewQueue(items: readonly DevBoardItem[], lang: "en" | "zh", copy: RuntimeCopy): string {
  const waiting = items.filter((item) => item.status === "needs_review");
  const approved = items.filter((item) => item.status === "approved");
  const active = items.filter((item) => item.status === "doing");
  return `<section class="section">
    <div class="section-head">
      <div><h2>${escapeHtml(copy.reviewQueue)}</h2><p>${escapeHtml(copy.reviewQueueHelp)}</p></div>
    </div>
    <div class="board">
      ${renderStatusLane(copy.active, active, lang, copy)}
      ${renderStatusLane(copy.waiting, waiting, lang, copy)}
      ${renderStatusLane(copy.ready, approved, lang, copy)}
    </div>
  </section>`;
}

function renderBlockerTriage(items: readonly DevBoardItem[], lang: "en" | "zh", copy: RuntimeCopy): string {
  const blocked = items.filter((item) => item.status === "blocked");
  const risky = items.filter((item) => item.status !== "blocked" && (item.priority === "P1" || item.ci_status === "failing"));
  return `<section class="section">
    <div class="section-head">
      <div><h2>${escapeHtml(copy.blockerTriage)}</h2><p>${escapeHtml(copy.blockerTriageHelp)}</p></div>
    </div>
    <div class="board">
      ${renderStatusLane(copy.blocked, blocked, lang, copy)}
      ${renderStatusLane(lang === "zh" ? "高风险" : "High risk", risky, lang, copy)}
      ${renderStatusLane(copy.active, items.filter((item) => item.status === "doing"), lang, copy)}
    </div>
  </section>`;
}

function renderDependencyMap(items: readonly DevBoardItem[], lang: "en" | "zh", copy: RuntimeCopy): string {
  const byId = new Map(items.map((item) => [item.id, item]));
  const linked = items.filter((item) => item.depends_on);
  return `<section class="section">
    <div class="section-head">
      <div><h2>${escapeHtml(copy.dependencyMap)}</h2><p>${escapeHtml(copy.dependencyMapHelp)}</p></div>
    </div>
    <div class="panel dependency-list">${linked.length > 0 ? linked.map((item) => {
      const dependency = item.depends_on ? byId.get(item.depends_on) : undefined;
      return `<div class="dependency-item" data-card-id="${escapeHtml(item.id)}" data-ci-status="${escapeHtml(item.ci_status ?? "unknown")}">
        <div><strong>${escapeHtml(dependency ? runtimeItemTitle(dependency, lang) : item.depends_on ?? "-")}</strong><div class="task-meta">${dependency ? renderStatusBadge(dependency, copy) : `<span class="badge">${escapeHtml(copy.waiting)}</span>`}</div></div>
        <div class="arrow">-></div>
        <div><strong>${escapeHtml(runtimeItemTitle(item, lang))}</strong><div class="task-meta">${renderPriorityBadge(item, copy)}${renderStatusBadge(item, copy)}</div></div>
      </div>`;
    }).join("") : `<div class="empty">${escapeHtml(copy.emptyLane)}</div>`}</div>
  </section>`;
}

function renderCiHealth(items: readonly DevBoardItem[], lang: "en" | "zh", copy: RuntimeCopy): string {
  const ciItems = items.filter((item) => item.ci_status);
  const failing = ciItems.filter((item) => item.ci_status === "failing").length;
  return `<section class="section">
    <div class="section-head">
      <div><h2>${escapeHtml(copy.ciHealth)}</h2><p>${escapeHtml(copy.ciHealthHelp)}</p></div>
      <span class="badge ci-${failing > 0 ? "failing" : "passing"}">${failing > 0 ? `${failing} ${escapeHtml(copy.blocked)}` : escapeHtml(copy.ready)}</span>
    </div>
    <div class="panel rows">${ciItems.length > 0 ? ciItems.map((item) => `<div class="row" data-card-id="${escapeHtml(item.id)}" data-ci-status="${escapeHtml(item.ci_status ?? "unknown")}">
      <div>
        <h3>${escapeHtml(runtimeItemTitle(item, lang))}</h3>
        <div class="task-meta">${renderCiBadge(item, copy)}${renderPriorityBadge(item, copy)}${renderStatusBadge(item, copy)}</div>
      </div>
      <div class="task-actions">
        <button class="secondary" data-item-id="${escapeHtml(item.id)}" data-action="cycle-ci">${escapeHtml(copy.cycleCi)}</button>
        <button class="secondary" data-item-id="${escapeHtml(item.id)}" data-action="block-item">${escapeHtml(copy.block)}</button>
      </div>
    </div>`).join("") : `<div class="empty">${escapeHtml(copy.emptyLane)}</div>`}</div>
  </section>`;
}

function renderDeliveryTimeline(items: readonly DevBoardItem[], lang: "en" | "zh", copy: RuntimeCopy): string {
  const scheduled = items.filter((item) => item.due_date).sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)));
  return `<section class="section">
    <div class="section-head">
      <div><h2>${escapeHtml(copy.deliveryTimeline)}</h2><p>${escapeHtml(copy.deliveryTimelineHelp)}</p></div>
    </div>
    <div class="panel timeline">${scheduled.length > 0 ? scheduled.map((item) => `<div class="timeline-item" data-card-id="${escapeHtml(item.id)}" data-ci-status="${escapeHtml(item.ci_status ?? "unknown")}">
      <strong>${escapeHtml(item.due_date ?? "-")}</strong>
      <div><h3>${escapeHtml(runtimeItemTitle(item, lang))}</h3><div class="task-meta">${renderPriorityBadge(item, copy)}${renderStatusBadge(item, copy)}${item.effort ? `<span class="badge">${escapeHtml(copy.effort)} ${escapeHtml(item.effort)}</span>` : ""}</div></div>
      <div class="task-actions"><button class="secondary" data-item-id="${escapeHtml(item.id)}" data-action="advance-status">${escapeHtml(copy.advance)}</button></div>
    </div>`).join("") : `<div class="empty">${escapeHtml(copy.emptyLane)}</div>`}</div>
  </section>`;
}

function renderStatusLane(label: string, items: readonly DevBoardItem[], lang: "en" | "zh", copy: RuntimeCopy): string {
  return `<article class="lane">
    <div class="lane-head"><div class="lane-title">${escapeHtml(label)}</div><span class="badge">${items.length}</span></div>
    <div class="cards">${items.length > 0 ? items.map((item) => renderTaskCard(item, lang, copy)).join("") : `<div class="empty">${escapeHtml(copy.emptyLane)}</div>`}</div>
  </article>`;
}

function renderReleaseReadiness(input: {
  readonly items: readonly DevBoardItem[];
  readonly readyCount: number;
  readonly activeCount: number;
  readonly blockedCount: number;
  readonly copy: RuntimeCopy;
}): string {
  const waiting = input.items.length - input.readyCount - input.activeCount - input.blockedCount;
  return `<section class="section">
    <div class="section-head">
      <div><h2>${escapeHtml(input.copy.releaseReadiness)}</h2><p>${escapeHtml(input.copy.releaseReadinessHelp)}</p></div>
    </div>
    <div class="panel readiness">
      <div class="metric"><strong>${input.readyCount}</strong><span>${escapeHtml(input.copy.ready)}</span></div>
      <div class="metric"><strong>${input.activeCount}</strong><span>${escapeHtml(input.copy.active)}</span></div>
      <div class="metric"><strong>${Math.max(0, waiting)}</strong><span>${escapeHtml(input.copy.waiting)}</span></div>
      <div class="metric"><strong>${input.blockedCount}</strong><span>${escapeHtml(input.copy.blocked)}</span></div>
    </div>
  </section>`;
}

function renderAllItems(
  items: readonly DevBoardItem[],
  lang: "en" | "zh",
  copy: RuntimeCopy,
  runtimeExtension: DevBoardRuntimeExtension,
): string {
  return `<div class="table">
    <div class="table-row head">
      <span>${escapeHtml(copy.item)}</span><span>${escapeHtml(copy.owner)}</span><span>${escapeHtml(copy.status)}</span><span>${escapeHtml(copy.priority)}</span><span></span>
    </div>
    ${items.map((item) => `<div class="table-row" data-card-id="${escapeHtml(item.id)}" data-ci-status="${escapeHtml(item.ci_status ?? "unknown")}">
      <div><strong>${escapeHtml(runtimeItemTitle(item, lang))}</strong>${renderItemDetails(item, copy)}</div>
      <span>${renderOwnerCell(item, lang, runtimeExtension)}</span>
      <span>${renderStatusBadge(item, copy)}</span>
      <span>${renderPriorityBadge(item, copy)}</span>
      <span class="task-actions"><button class="secondary" data-item-id="${escapeHtml(item.id)}" data-action="advance-status">${escapeHtml(copy.advance)}</button><button class="secondary" data-item-id="${escapeHtml(item.id)}" data-action="raise-priority">${escapeHtml(copy.raise)}</button><button class="secondary" data-item-id="${escapeHtml(item.id)}" data-action="block-item">${escapeHtml(copy.block)}</button></span>
    </div>`).join("")}
  </div>`;
}

function renderOwnerCell(item: DevBoardItem, lang: "en" | "zh", runtimeExtension: DevBoardRuntimeExtension): string {
  const action = actionForRuntimeField(runtimeExtension, "owner");
  if (!action) return escapeHtml(item.owner);
  const label = localizeRuntimeLabel(action.label, lang);
  if (action.control === "select") {
    const options = Array.from(new Set([...(action.options ?? []), item.owner]));
    return `<label class="field-editor"><span class="sr-only">${escapeHtml(label)}</span><select data-runtime-field="owner" data-item-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(label)}">${options.map((option) => `<option value="${escapeHtml(option)}"${option === item.owner ? " selected" : ""}>${escapeHtml(option)}</option>`).join("")}</select></label>`;
  }
  return `<label class="field-editor"><span class="sr-only">${escapeHtml(label)}</span><input data-runtime-field="owner" data-item-id="${escapeHtml(item.id)}" aria-label="${escapeHtml(label)}" value="${escapeHtml(item.owner)}"></label>`;
}

function renderTaskCard(item: DevBoardItem, lang: "en" | "zh", copy: RuntimeCopy): string {
  return `<article class="task" data-card-id="${escapeHtml(item.id)}" data-ci-status="${escapeHtml(item.ci_status ?? "unknown")}">
    <div class="task-top">
      <div class="task-title">${escapeHtml(runtimeItemTitle(item, lang))}</div>
      ${renderPriorityBadge(item, copy)}
    </div>
    <div class="task-meta"><span class="badge">${escapeHtml(item.owner)}</span>${renderStatusBadge(item, copy)}${renderCiBadge(item, copy)}${item.url ? `<a class="badge" href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(copy.source)}</a>` : ""}${item.due_date ? `<span class="badge">${escapeHtml(copy.dueDate)} ${escapeHtml(item.due_date)}</span>` : ""}${item.depends_on ? `<span class="badge">${escapeHtml(copy.dependsOn)} ${escapeHtml(item.depends_on)}</span>` : ""}</div>
    ${item.blocked_reason ? `<p>${escapeHtml(copy.reason)}: ${escapeHtml(item.blocked_reason)}</p>` : ""}
    <div class="task-actions">
      <button class="secondary" data-item-id="${escapeHtml(item.id)}" data-action="advance-status">${escapeHtml(copy.advance)}</button>
      <button class="secondary" data-item-id="${escapeHtml(item.id)}" data-action="raise-priority">${escapeHtml(copy.raise)}</button>
      <button class="secondary" data-item-id="${escapeHtml(item.id)}" data-action="block-item">${escapeHtml(copy.block)}</button>
    </div>
  </article>`;
}

function renderItemDetails(item: DevBoardItem, copy: RuntimeCopy): string {
  const details = [
    item.url ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noreferrer">${escapeHtml(copy.source)}</a>` : undefined,
    item.due_date ? `${escapeHtml(copy.dueDate)} ${escapeHtml(item.due_date)}` : undefined,
    item.depends_on ? `${escapeHtml(copy.dependsOn)} ${escapeHtml(item.depends_on)}` : undefined,
    item.ci_status ? `${escapeHtml(copy.ciStatus)} ${escapeHtml(item.ci_status)}` : undefined,
    item.effort ? `${escapeHtml(copy.effort)} ${escapeHtml(item.effort)}` : undefined,
    item.blocked_reason ? `${escapeHtml(copy.reason)} ${escapeHtml(item.blocked_reason)}` : undefined,
  ].filter(Boolean);
  return details.length > 0 ? `<div>${details.join(" · ")}</div>` : "";
}

function renderStatusBadge(item: DevBoardItem, copy: RuntimeCopy): string {
  return `<span class="badge status-${escapeHtml(item.status)}" data-status="${escapeHtml(item.status)}">${escapeHtml(copy.statuses[item.status])}</span>`;
}

function renderPriorityBadge(item: DevBoardItem, copy: RuntimeCopy): string {
  const priority = item.priority ?? copy.noPriority;
  const className = item.priority ? ` priority-${item.priority}` : "";
  return `<span class="badge${escapeHtml(className)}">${escapeHtml(priority)}</span>`;
}

function renderCiBadge(item: DevBoardItem, copy: RuntimeCopy): string {
  if (!item.ci_status) return "";
  return `<span class="badge ci-${escapeHtml(item.ci_status)}">${escapeHtml(copy.ciStatus)} ${escapeHtml(item.ci_status)}</span>`;
}

interface PreviewSandbox {
  readonly preview_id: string;
  readonly app_id: string;
  readonly version_id: string;
  items: DevBoardItem[];
  expires_at_ms: number;
}

type DevBoardItemPatch = Partial<Pick<DevBoardItem, "blocked_reason" | "ci_status" | "owner" | "priority" | "status">>;

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
  const version = host.store.getVersion(sandbox.app_id, sandbox.version_id);
  const enriched = enrichNewItemForDefinition(item, version.definition, sandbox.items.length);
  sandbox.items = [...sandbox.items, enriched];
  return { ok: true, item: enriched };
}

function updatePreviewItem(
  previewId: string,
  appId: string,
  itemId: string,
  patch: DevBoardItemPatch,
): { readonly ok: true; readonly item: DevBoardItem } {
  const sandbox = requirePreviewSandbox(previewId, appId);
  if (!sandbox) throw new Error(`Preview sandbox ${previewId} has expired.`);
  const version = host.store.getVersion(sandbox.app_id, sandbox.version_id);
  let updated: DevBoardItem | undefined;
  sandbox.items = sandbox.items.map((item) => {
    if (item.id !== itemId) return item;
      updated = applyRuntimeItemPatch(item, patch, version.runtime_extension);
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
  const enriched = enrichNewItemForDefinition(item, version.definition, version.items.length);
  host.store.saveVersion({ ...version, items: [...version.items, enriched] });
  return { ok: true, item: enriched };
}

function enrichNewItemForDefinition(item: DevBoardItem, definition: { readonly modules: readonly { readonly kind: string }[] }, index: number): DevBoardItem {
  return {
    ...item,
    ci_status: definition.modules.some((mod) => mod.kind === "ci_health") ? "unknown" : item.ci_status,
    due_date: definition.modules.some((mod) => mod.kind === "delivery_timeline") ? item.due_date ?? `2026-05-${String(28 + Math.min(index, 2)).padStart(2, "0")}` : item.due_date,
    effort: definition.modules.some((mod) => mod.kind === "delivery_timeline") ? item.effort ?? "M" : item.effort,
  };
}

function updateRuntimeItem(
  appId: string,
  itemId: string,
  patch: DevBoardItemPatch,
): { readonly ok: true; readonly item: DevBoardItem } {
  const project = host.store.getProject(appId);
  const versionId = project.active_version_id ?? project.current_version_id;
  const version = host.store.getVersion(appId, versionId);
  let updated: DevBoardItem | undefined;
  const items = version.items.map((item) => {
    if (item.id !== itemId) return item;
    updated = applyRuntimeItemPatch(item, patch, version.runtime_extension);
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
