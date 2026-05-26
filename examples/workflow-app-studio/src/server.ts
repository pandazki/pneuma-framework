import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createWorkflowRecord,
  createWorkflowAppStudio,
} from "./host/workflow-studio.js";
import { createCodexAppServerWorkflowDraftAgent } from "./host/codex-app-server-workflow-agent.js";
import { createOpencodeWorkflowDraftAgent } from "./host/opencode-workflow-agent.js";
import {
  transitionWorkflowRecord,
  type WorkflowField,
  type WorkflowRecord,
} from "./domain/workflow-app.js";

const port = Number(process.env.PORT ?? "8898");
const workspace = process.env.PNEUMA_WORKFLOW_STUDIO_WORKSPACE
  ?? mkdtempSync(join(tmpdir(), "pneuma-workflow-studio-"));
const requestedAgentMode = process.env.PNEUMA_WORKFLOW_STUDIO_AGENT;
const agentMode = resolveAgentMode(requestedAgentMode);
const host = createWorkflowAppStudio({
  workspace,
  base_url: `http://127.0.0.1:${port}`,
  draft_agent: agentMode === "opencode"
    ? createOpencodeWorkflowDraftAgent({
        model: process.env.PNEUMA_WORKFLOW_STUDIO_MODEL,
        timeout_ms: Number(process.env.PNEUMA_WORKFLOW_STUDIO_AGENT_TIMEOUT_MS ?? "600000"),
      })
    : agentMode === "codex-app-server"
      ? createCodexAppServerWorkflowDraftAgent({
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
      if (request.method === "POST" && url.pathname === "/api/reset") {
        previewSandboxes.clear();
        await host.resetForDemo();
        return json({ ...host.snapshot(), workspace, agent_mode: agentMode, preview_sandboxes: previewSandboxes.size });
      }
      if (request.method === "POST" && url.pathname === "/api/open-path") {
        const body = await request.json() as OpenPathRequest;
        const targetPath = resolveOpenPathTarget(body);
        const opened = await openLocalPath(targetPath, body.opener ?? "finder");
        return json({ ok: true, path: targetPath, opener: opened.opener, command: opened.command });
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
        const body = await request.json() as { message?: string; builder_subject?: string; stream?: boolean };
        if (body.stream || request.headers.get("accept")?.includes("text/event-stream")) {
          return evolutionStreamResponse(evolveMatch[1], body);
        }
        return json(await requestEvolution(evolveMatch[1], body));
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

function resolveAgentMode(mode: string | undefined): "deterministic" | "opencode" | "codex-app-server" {
  if (mode === undefined || mode === "codex" || mode === "codex-app-server") return "codex-app-server";
  if (mode === "opencode" || mode === "deterministic") return mode;
  console.warn(`Unknown PNEUMA_WORKFLOW_STUDIO_AGENT=${mode}; falling back to codex-app-server.`);
  return "codex-app-server";
}

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

function requestEvolution(appId: string, body: { readonly message?: string; readonly builder_subject?: string }) {
  return host.requestEvolution({
    app_id: appId,
    builder_subject: body.builder_subject ?? "user:bob",
    message: body.message?.trim() || "Add a legal review stage before approval and require contract value for high-risk vendors.",
  });
}

function evolutionStreamResponse(appId: string, body: { readonly message?: string; readonly builder_subject?: string }): Response {
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown): void => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } catch {
          closed = true;
        }
      };
      try {
        send("status", { text: "Builder request received. Preparing code-agent draft workspace." });
        const result = await host.requestEvolution({
          app_id: appId,
          builder_subject: body.builder_subject ?? "user:bob",
          message: body.message?.trim() || "Add a legal review stage before approval and require contract value for high-risk vendors.",
          on_progress: (progress) => send("progress", progress),
        });
        send("done", result);
      } catch (err) {
        send("error", { error: err instanceof Error ? err.message : String(err) });
      } finally {
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {}
        }
      }
    },
    cancel() {
      closed = true;
    },
  });
  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store",
      connection: "keep-alive",
    },
  });
}

function resolveOpenPathTarget(input: OpenPathRequest): string {
  if (input.target === "example") return join(import.meta.dir, "..");
  const appId = requireString(input.app_id, "app_id");
  if (input.target === "source") return host.store.sourceRoot(appId);
  if (input.target === "draft") return host.store.draftRoot(appId);
  if (input.target === "active_data") return host.store.activeVersion(appId).data_dir;
  if (input.target === "version_data") return host.store.getVersion(appId, requireString(input.version_id, "version_id")).data_dir;
  throw new Error(`Unknown open target: ${input.target}`);
}

function requireString(value: string | undefined, name: string): string {
  if (!value) throw new Error(`${name}_required`);
  return value;
}

async function openLocalPath(path: string, opener: "code" | "finder"): Promise<{ readonly opener: "code" | "finder"; readonly command: string }> {
  if (!existsSync(path)) throw new Error(`Path does not exist: ${path}`);
  const commands = opener === "finder" ? [["open", path]] : codeOpenCommands(path);
  for (const command of commands) {
    if (await trySpawn(command)) return { opener, command: command.join(" ") };
  }
  if (opener === "code") {
    throw new Error("No code tool opener worked. Set PNEUMA_WORKFLOW_STUDIO_CODE_COMMAND to your editor command.");
  }
  throw new Error(`Unable to open path: ${path}`);
}

function codeOpenCommands(path: string): string[][] {
  const configured = process.env.PNEUMA_WORKFLOW_STUDIO_CODE_COMMAND?.trim();
  if (configured) return [[...configured.split(/\s+/), path]];
  return [
    ["code", path],
    ["cursor", path],
    ["zed", path],
    ["open", "-a", "Visual Studio Code", path],
    ["open", "-a", "Cursor", path],
    ["open", "-a", "Zed", path],
  ];
}

async function trySpawn(command: readonly string[]): Promise<boolean> {
  try {
    const proc = Bun.spawn(command, { stdout: "ignore", stderr: "ignore" });
    return await proc.exited === 0;
  } catch {
    return false;
  }
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
  const rows = records.map((record) => recordRowHtml(appId, record, version.source.workflow.actions.filter((action) => action.from_stage === record.stage), mode, previewId, t, lang)).join("");
  const formFields = version.source.workflow.fields.map((field) => fieldInputHtml(field, t, lang)).join("");
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
        <p>${escapeHtml(formatGeneratedAppText(version.source.workflow.purpose, lang))}</p>
      </div>
      <div class="runtime-badge">${escapeHtml(version.version_id)}</div>
    </section>
    <section class="runtime-grid">
      <aside class="runtime-card">
        <h2>${t.stages}</h2>
        ${version.source.workflow.stages.map((stage) => `<div class="stage-pill">${escapeHtml(formatGeneratedAppText(stage.label, lang))}</div>`).join("")}
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
      <h2>${escapeHtml(formatGeneratedAppText(version.source.workflow.entity.plural, lang))}</h2>
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

function fieldInputHtml(field: WorkflowField, t: ReturnType<typeof appText>, lang: "en" | "zh"): string {
  const required = field.required ? "required" : "";
  const label = escapeHtml(formatGeneratedAppText(field.label, lang));
  const helper = field.helper_text ? `<small>${escapeHtml(formatGeneratedAppText(field.helper_text, lang))}</small>` : "";
  if (field.type === "select") {
    return `<label>${label}<select data-workflow-field name="${field.id}" ${required}>${(field.options ?? []).map((option) => `<option value="${escapeHtml(option)}">${escapeHtml(formatGeneratedAppText(option, lang))}</option>`).join("")}</select>${helper}</label>`;
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
  lang: "en" | "zh",
): string {
  const values = Object.entries(record.values)
    .filter(([, value]) => value !== "" && value !== null && value !== undefined)
    .slice(0, 4)
    .map(([key, value]) => `<span>${escapeHtml(formatGeneratedAppText(key, lang))}: ${escapeHtml(formatGeneratedAppText(String(value), lang))}</span>`)
    .join("");
  return `<article class="record-row">
    <div>
      <strong>${escapeHtml(record.title)}</strong>
      <p>${escapeHtml(record.owner)}</p>
      <div class="record-values">${values}</div>
    </div>
    <span class="stage-pill">${escapeHtml(formatGeneratedAppText(record.stage, lang))}</span>
    <div class="row-actions">
      ${actions.map((action) => `<button data-action-id="${action.id}" data-role="${action.required_role}" data-mode="${mode}" data-app-id="${appId}" data-preview-id="${previewId ?? ""}" data-record-id="${record.id}">${escapeHtml(formatGeneratedAppText(action.label, lang))}</button>`).join("") || `<span class="muted">${t.noActions}</span>`}
    </div>
  </article>`;
}

function formatGeneratedAppText(value: string, lang: "en" | "zh"): string {
  if (lang !== "zh") return value;
  if (value.includes("Adds optional SLA due date and status tracking plus an SLA watch queue for open vendor requests, without requiring changes to existing records.")) {
    return value.replace(
      "Adds optional SLA due date and status tracking plus an SLA watch queue for open vendor requests, without requiring changes to existing records.",
      "增加可选 SLA 到期日期、SLA 状态和 SLA 关注队列，同时不要求修改已有记录。",
    );
  }
  if (value.includes("Tracks due dates and SLA status so owners can see aging work before it slips.")) {
    return value.replace(
      "Tracks due dates and SLA status so owners can see aging work before it slips.",
      "跟踪到期日期和 SLA 状态，让负责人提前看到可能逾期的事项。",
    );
  }
  return ({
    "Vendor requests": "供应商请求",
    "Collect vendor requests, review risk, and approve onboarding.": "收集供应商请求、评估风险并批准准入。",
    "Collect vendor requests, review risk, and approve onboarding. Tracks due dates and SLA status so owners can see aging work before it slips.": "收集供应商请求、评估风险并批准准入。跟踪到期日期和 SLA 状态，让负责人提前看到可能逾期的事项。",
    "Collect vendor requests, review risk, and approve onboarding. Adds optional SLA due date and status tracking plus an SLA watch queue for open vendor requests, without requiring changes to existing records.": "收集供应商请求、评估风险并批准准入。增加可选 SLA 到期日期、SLA 状态和 SLA 关注队列，同时不要求修改已有记录。",
    "Adds optional SLA due date and status tracking plus an SLA watch queue for open vendor requests, without requiring changes to existing records.": "增加可选 SLA 到期日期、SLA 状态和 SLA 关注队列，同时不要求修改已有记录。",
    "Submitted": "已提交",
    "Business review": "业务评审",
    "Approved": "已批准",
    "Rejected": "已拒绝",
    submitted: "已提交",
    business_review: "业务评审",
    approved: "已批准",
    rejected: "已拒绝",
    vendor_name: "供应商名称",
    requestor: "申请人",
    category: "类别",
    risk_level: "风险",
    due_date: "到期日期",
    sla_status: "SLA 状态",
    low: "低",
    medium: "中",
    high: "高",
    software: "软件",
    services: "服务",
    finance: "财务",
    on_track: "正常",
    at_risk: "有风险",
    breached: "已逾期",
    overdue: "已逾期",
    "Vendor name": "供应商名称",
    Requestor: "申请人",
    Category: "类别",
    Risk: "风险",
    Notes: "备注",
    "Due date": "到期日期",
    "SLA due date": "SLA 到期日期",
    "SLA status": "SLA 状态",
    "Target completion date for this item.": "该事项的目标完成日期。",
    "Current service-level health.": "当前服务等级状态。",
    "Optional deadline for vendor review; left blank on existing records so migration is safe.": "供应商评审的可选截止日期；已有记录保持为空以保证迁移安全。",
    "Track whether the vendor request is on track, at risk, or overdue.": "跟踪供应商请求是否正常、有风险或已逾期。",
    "Send to business review": "提交业务评审",
    "Approve vendor": "批准供应商",
    "Reject vendor": "拒绝供应商",
  } as Record<string, string>)[value] ?? value;
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

interface OpenPathRequest {
  readonly target?: "example" | "source" | "draft" | "active_data" | "version_data";
  readonly opener?: "code" | "finder";
  readonly app_id?: string;
  readonly version_id?: string;
}
