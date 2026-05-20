import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createWorkflowRecord,
  createWorkflowAppStudio,
} from "./host/workflow-studio.js";
import { createOpencodeWorkflowDraftAgent } from "./host/opencode-workflow-agent.js";
import {
  transitionWorkflowRecord,
  type WorkflowField,
  type WorkflowRecord,
} from "./domain/workflow-app.js";

const port = Number(process.env.PORT ?? "8898");
const workspace = process.env.PNEUMA_WORKFLOW_STUDIO_WORKSPACE
  ?? mkdtempSync(join(tmpdir(), "pneuma-workflow-studio-"));
const agentMode = process.env.PNEUMA_WORKFLOW_STUDIO_AGENT === "opencode" ? "opencode" : "deterministic";
const host = createWorkflowAppStudio({
  workspace,
  base_url: `http://127.0.0.1:${port}`,
  draft_agent: agentMode === "opencode"
    ? createOpencodeWorkflowDraftAgent({
        model: process.env.PNEUMA_WORKFLOW_STUDIO_MODEL,
        timeout_ms: Number(process.env.PNEUMA_WORKFLOW_STUDIO_AGENT_TIMEOUT_MS ?? "600000"),
      })
    : undefined,
});
const staticRoot = join(import.meta.dir, "..", "static");
const previewSandboxes = new Map<string, PreviewSandbox>();

const server = Bun.serve({
  port,
  idleTimeout: 255,
  async fetch(request) {
    try {
      const url = new URL(request.url);
      if (request.method === "GET" && url.pathname === "/") return fileResponse("index.html", "text/html; charset=utf-8");
      if (request.method === "GET" && url.pathname === "/favicon.ico") return new Response(null, { status: 204 });
      if (request.method === "GET" && url.pathname === "/static/styles.css") return fileResponse("styles.css", "text/css; charset=utf-8");
      if (request.method === "GET" && url.pathname === "/static/app.js") return appBundleResponse();
      if (request.method === "GET" && url.pathname === "/api/state") {
        return json({ ...host.snapshot(), workspace, agent_mode: agentMode, preview_sandboxes: previewSandboxes.size });
      }

      const previewMatch = /^\/preview\/([^/]+)$/.exec(url.pathname);
      if (request.method === "GET" && previewMatch) {
        return workflowAppPage(previewMatch[1], "preview", languageFromUrl(url), url.searchParams.get("preview_id") ?? undefined);
      }
      const appMatch = /^\/app\/([^/]+)$/.exec(url.pathname);
      if (request.method === "GET" && appMatch) return workflowAppPage(appMatch[1], "published", languageFromUrl(url));

      if (request.method === "POST" && url.pathname === "/api/projects") {
        const body = await request.json() as {
          name?: string;
          goal?: string;
          template_id?: "vendor_intake" | "incident_review" | "hiring_loop";
          builder_subject?: string;
        };
        return json(await host.createProject({
          name: body.name?.trim() || "Vendor Intake Portal",
          goal: body.goal?.trim() || "Collect vendor requests, review risk, and approve onboarding.",
          template_id: body.template_id ?? "vendor_intake",
          builder_subject: body.builder_subject ?? "user:bob",
        }));
      }

      const evolveMatch = /^\/api\/projects\/([^/]+)\/evolution\/request$/.exec(url.pathname);
      if (request.method === "POST" && evolveMatch) {
        const body = await request.json() as { message?: string; builder_subject?: string };
        return json(await host.requestEvolution({
          app_id: evolveMatch[1],
          builder_subject: body.builder_subject ?? "user:bob",
          message: body.message?.trim() || "Add a legal review stage before approval and require contract value for high-risk vendors.",
        }));
      }

      const approveMatch = /^\/api\/projects\/([^/]+)\/evolution\/approve$/.exec(url.pathname);
      if (request.method === "POST" && approveMatch) {
        const body = await request.json().catch(() => ({})) as { subject?: string; decision?: "approved" | "denied" };
        const project = host.store.getProject(approveMatch[1]);
        return json(await host.approveEvolution({
          app_id: approveMatch[1],
          subject: body.subject ?? project.builder_subject,
          decision: body.decision,
        }));
      }

      const previewStartMatch = /^\/api\/projects\/([^/]+)\/preview\/start$/.exec(url.pathname);
      if (request.method === "POST" && previewStartMatch) {
        const previewId = `preview-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
        const result = await host.startPreview({ app_id: previewStartMatch[1], preview_id: previewId });
        previewSandboxes.set(previewId, {
          preview_id: previewId,
          app_id: previewStartMatch[1],
          records: host.store.currentVersion(previewStartMatch[1]).records.map(cloneRecord),
          created_at_ms: Date.now(),
          url: result.url,
        });
        return json({ ...result, preview_id: previewId, data_mode: "preview_sandbox" });
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
          name: body.name?.trim() || "Partner Intake Portal",
          builder_subject: body.builder_subject ?? "user:charlie",
        }));
      }

      const addPreviewRecordMatch = /^\/api\/previews\/([^/]+)\/apps\/([^/]+)\/records$/.exec(url.pathname);
      if (request.method === "POST" && addPreviewRecordMatch) {
        const body = await request.json() as RecordInput;
        return json(addPreviewRecord(addPreviewRecordMatch[1], addPreviewRecordMatch[2], body));
      }

      const transitionPreviewMatch = /^\/api\/previews\/([^/]+)\/apps\/([^/]+)\/records\/([^/]+)\/actions\/([^/]+)$/.exec(url.pathname);
      if (request.method === "POST" && transitionPreviewMatch) {
        const body = await request.json().catch(() => ({})) as { actor_role?: string; actor_subject?: string; comment?: string };
        return json(transitionPreviewRecord(transitionPreviewMatch[1], transitionPreviewMatch[2], transitionPreviewMatch[3], transitionPreviewMatch[4], body));
      }

      const addRecordMatch = /^\/api\/apps\/([^/]+)\/records$/.exec(url.pathname);
      if (request.method === "POST" && addRecordMatch) {
        const body = await request.json() as RecordInput;
        return json(addPublishedRecord(addRecordMatch[1], body));
      }

      const transitionMatch = /^\/api\/apps\/([^/]+)\/records\/([^/]+)\/actions\/([^/]+)$/.exec(url.pathname);
      if (request.method === "POST" && transitionMatch) {
        const body = await request.json().catch(() => ({})) as { actor_role?: string; actor_subject?: string; comment?: string };
        return json(transitionPublishedRecord(transitionMatch[1], transitionMatch[2], transitionMatch[3], body));
      }

      return json({ error: "not_found" }, 404);
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : String(err) }, 500);
    }
  },
});

console.log(`Workflow App Studio listening on http://127.0.0.1:${server.port}/`);
console.log(`workspace: ${workspace}`);
console.log(`agent mode: ${agentMode}`);

function fileResponse(file: string, contentType: string): Response {
  return new Response(readFileSync(join(staticRoot, file)), {
    headers: {
      "content-type": contentType,
      "cache-control": "no-store",
    },
  });
}

async function appBundleResponse(): Promise<Response> {
  const result = await Bun.build({
    entrypoints: [join(import.meta.dir, "ui", "App.tsx")],
    target: "browser",
    format: "esm",
    sourcemap: "inline",
  });
  if (!result.success) {
    return new Response(result.logs.map((log) => log.message).join("\n"), {
      status: 500,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }
  const output = result.outputs[0];
  return new Response(await output.text(), {
    headers: {
      "content-type": "text/javascript; charset=utf-8",
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

function workflowAppPage(appId: string, mode: "preview" | "published", lang: "en" | "zh", previewId?: string): Response {
  const project = host.store.getProject(appId);
  const version = mode === "published" ? host.store.activeVersion(appId) : host.store.currentVersion(appId);
  const sandbox = previewId ? previewSandboxes.get(previewId) : undefined;
  if (mode === "preview" && (!previewId || !sandbox)) throw new Error("Preview sandbox does not exist.");
  const records = mode === "preview" ? sandbox!.records : version.records;
  const t = appText(lang);
  const rows = records.map((record) => recordRowHtml(appId, record, version.source.workflow.actions.filter((action) => action.from_stage === record.stage), mode, previewId, t)).join("");
  const formFields = version.source.workflow.fields.map((field) => fieldInputHtml(field, t)).join("");
  return new Response(`<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(project.name)}</title>
  <link rel="stylesheet" href="/static/styles.css" />
</head>
<body class="runtime-page">
  <main class="runtime-shell">
    <section class="runtime-hero">
      <div>
        <p class="eyebrow">${mode === "preview" ? t.preview : t.published}</p>
        <h1>${escapeHtml(version.source.workflow.title)}</h1>
        <p>${escapeHtml(version.source.workflow.purpose)}</p>
      </div>
      <div class="runtime-badge">${escapeHtml(version.version_id)}</div>
    </section>
    <section class="runtime-grid">
      <aside class="runtime-card">
        <h2>${t.stages}</h2>
        ${version.source.workflow.stages.map((stage) => `<div class="stage-pill">${escapeHtml(stage.label)}</div>`).join("")}
      </aside>
      <section class="runtime-card">
        <h2>${t.newRecord}</h2>
        <form data-create-record data-mode="${mode}" data-app-id="${appId}" data-preview-id="${previewId ?? ""}">
          <label>${t.title}<input name="record_title" placeholder="${t.title}" required /></label>
          <label>${t.owner}<input name="record_owner" placeholder="${t.owner}" value="End User" required /></label>
          <div class="runtime-field-grid">${formFields}</div>
          <button type="submit">${t.create}</button>
        </form>
      </section>
    </section>
    <section class="runtime-card">
      <h2>${escapeHtml(version.source.workflow.entity.plural)}</h2>
      <div class="record-table">
        ${rows || `<p class="muted">${t.empty}</p>`}
      </div>
    </section>
  </main>
  <script>
    const t = ${JSON.stringify(t)};
    document.querySelector("[data-create-record]")?.addEventListener("submit", async (event) => {
      event.preventDefault();
      const form = event.currentTarget;
      const data = new FormData(form);
      const appId = form.dataset.appId;
      const previewId = form.dataset.previewId;
      const mode = form.dataset.mode;
      const url = mode === "preview"
        ? \`/api/previews/\${previewId}/apps/\${appId}/records\`
        : \`/api/apps/\${appId}/records\`;
      await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: data.get("record_title"),
          owner: data.get("record_owner"),
          values: Object.fromEntries(Array.from(form.querySelectorAll("[data-workflow-field]")).map((field) => {
            const element = field;
            return [element.name, element.type === "number" ? Number(element.value || 0) : element.value];
          }))
        })
      });
      location.reload();
    });
    document.querySelectorAll("[data-action-id]").forEach((button) => {
      button.addEventListener("click", async () => {
        const appId = button.dataset.appId;
        const previewId = button.dataset.previewId;
        const mode = button.dataset.mode;
        const url = mode === "preview"
          ? \`/api/previews/\${previewId}/apps/\${appId}/records/\${button.dataset.recordId}/actions/\${button.dataset.actionId}\`
          : \`/api/apps/\${appId}/records/\${button.dataset.recordId}/actions/\${button.dataset.actionId}\`;
        const response = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ actor_role: button.dataset.role, actor_subject: "user:end-user", comment: t.actionComment })
        });
        if (!response.ok) alert((await response.json()).error || "Action failed");
        location.reload();
      });
    });
  </script>
</body>
</html>`, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}

function fieldInputHtml(field: WorkflowField, t: ReturnType<typeof appText>): string {
  const required = field.required ? "required" : "";
  const label = escapeHtml(field.label);
  const helper = field.helper_text ? `<small>${escapeHtml(field.helper_text)}</small>` : "";
  if (field.type === "select") {
    return `<label>${label}<select data-workflow-field name="${field.id}" ${required}>${(field.options ?? []).map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(option)}</option>`).join("")}</select>${helper}</label>`;
  }
  if (field.type === "long_text") {
    return `<label>${label}<textarea data-workflow-field name="${field.id}" ${required}></textarea>${helper}</label>`;
  }
  const type = field.type === "number" ? "number" : field.type === "date" ? "date" : field.type === "url" ? "url" : "text";
  return `<label>${label}<input data-workflow-field name="${field.id}" type="${type}" ${required} placeholder="${escapeHtml(t.fieldPlaceholder)}" />${helper}</label>`;
}

function addPreviewRecord(previewId: string, appId: string, input: RecordInput): { readonly records: readonly WorkflowRecord[] } {
  const sandbox = previewSandboxes.get(previewId);
  if (!sandbox || sandbox.app_id !== appId) throw new Error("Preview sandbox does not exist.");
  const version = host.store.currentVersion(appId);
  sandbox.records = [...sandbox.records, createWorkflowRecord(version.source, normalizeRecordInput(input))];
  return { records: sandbox.records };
}

function transitionPreviewRecord(
  previewId: string,
  appId: string,
  recordId: string,
  actionId: string,
  input: { readonly actor_role?: string; readonly actor_subject?: string; readonly comment?: string },
): { readonly records: readonly WorkflowRecord[] } {
  const sandbox = previewSandboxes.get(previewId);
  if (!sandbox || sandbox.app_id !== appId) throw new Error("Preview sandbox does not exist.");
  const version = host.store.currentVersion(appId);
  sandbox.records = sandbox.records.map((record) => record.id === recordId
    ? transitionWorkflowRecord(version.source.workflow, record, {
        action_id: actionId,
        actor_role: input.actor_role ?? "operations",
        actor_subject: input.actor_subject ?? "user:end-user",
        comment: input.comment,
      })
    : record);
  return { records: sandbox.records };
}

function addPublishedRecord(appId: string, input: RecordInput): { readonly records: readonly WorkflowRecord[] } {
  const project = host.store.getProject(appId);
  const version = host.store.activeVersion(appId);
  const records = [...version.records, createWorkflowRecord(version.source, normalizeRecordInput(input))];
  host.store.saveVersion({ ...version, records });
  host.store.updateProject(appId, { status: "published", active_version_id: project.active_version_id });
  return { records };
}

function transitionPublishedRecord(
  appId: string,
  recordId: string,
  actionId: string,
  input: { readonly actor_role?: string; readonly actor_subject?: string; readonly comment?: string },
): { readonly records: readonly WorkflowRecord[] } {
  const version = host.store.activeVersion(appId);
  const records = version.records.map((record) => record.id === recordId
    ? transitionWorkflowRecord(version.source.workflow, record, {
        action_id: actionId,
        actor_role: input.actor_role ?? "operations",
        actor_subject: input.actor_subject ?? "user:end-user",
        comment: input.comment,
      })
    : record);
  host.store.saveVersion({ ...version, records });
  return { records };
}

function destroyPreviewSandboxesForApp(appId: string): void {
  for (const [previewId, sandbox] of previewSandboxes.entries()) {
    if (sandbox.app_id === appId) previewSandboxes.delete(previewId);
  }
}

function recordRowHtml(
  appId: string,
  record: WorkflowRecord,
  actions: readonly { id: string; label: string; required_role: string }[],
  mode: "preview" | "published",
  previewId: string | undefined,
  t: ReturnType<typeof appText>,
): string {
  const values = Object.entries(record.values)
    .filter(([, value]) => value !== "" && value !== null && value !== undefined)
    .slice(0, 4)
    .map(([key, value]) => `<span>${escapeHtml(key)}: ${escapeHtml(String(value))}</span>`)
    .join("");
  return `<article class="record-row">
    <div>
      <strong>${escapeHtml(record.title)}</strong>
      <p>${escapeHtml(record.owner)}</p>
      <div class="record-values">${values}</div>
    </div>
    <span class="stage-pill">${escapeHtml(record.stage)}</span>
    <div class="row-actions">
      ${actions.map((action) => `<button data-action-id="${action.id}" data-role="${action.required_role}" data-mode="${mode}" data-app-id="${appId}" data-preview-id="${previewId ?? ""}" data-record-id="${record.id}">${escapeHtml(action.label)}</button>`).join("") || `<span class="muted">${t.noActions}</span>`}
    </div>
  </article>`;
}

function normalizeRecordInput(input: RecordInput): { readonly title: string; readonly owner: string; readonly values?: Record<string, string | number | null> } {
  return {
    title: input.title?.trim() || "New vendor request",
    owner: input.owner?.trim() || "End User",
    values: input.values,
  };
}

function cloneRecord(record: WorkflowRecord): WorkflowRecord {
  return JSON.parse(JSON.stringify(record)) as WorkflowRecord;
}

function appText(lang: "en" | "zh") {
  return lang === "zh"
    ? {
        preview: "预览沙盒",
        published: "线上应用",
        stages: "流程阶段",
        newRecord: "新增记录",
        title: "事项标题",
        owner: "负责人",
        vendor: "供应商名称",
        create: "创建记录",
        empty: "暂无记录",
        noActions: "无可用动作",
        actionComment: "通过应用页面执行",
        fieldPlaceholder: "填写字段值",
      }
    : {
        preview: "Preview sandbox",
        published: "Published app",
        stages: "Workflow stages",
        newRecord: "New record",
        title: "Title",
        owner: "Owner",
        vendor: "Vendor name",
        create: "Create record",
        empty: "No records yet",
        noActions: "No actions",
        actionComment: "Applied from app page",
        fieldPlaceholder: "Enter value",
      };
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char] ?? char);
}

interface PreviewSandbox {
  readonly preview_id: string;
  readonly app_id: string;
  records: readonly WorkflowRecord[];
  readonly created_at_ms: number;
  readonly url: string;
}

interface RecordInput {
  readonly title?: string;
  readonly owner?: string;
  readonly values?: Record<string, string | number | null>;
}
