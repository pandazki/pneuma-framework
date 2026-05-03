const APP_ID = "team-knowledge-inbox";

const state = {
  project: null,
  preview: null,
  inspection: null,
  evolution: null,
  priorityRows: [],
  activeTab: "data",
  busy: false,
};

const els = {
  workspaceLabel: document.querySelector("#workspace-label"),
  previewStatus: document.querySelector("#preview-status"),
  emptyPreview: document.querySelector("#empty-preview"),
  previewFrame: document.querySelector("#preview-frame"),
  builderRequest: document.querySelector("#builder-request"),
  createProject: document.querySelector("#create-project"),
  startPreview: document.querySelector("#start-preview"),
  startEvolution: document.querySelector("#start-evolution"),
  approvalPanel: document.querySelector("#approval-panel"),
  approvalTitle: document.querySelector("#approval-title"),
  approvalCopy: document.querySelector("#approval-copy"),
  approvalImpact: document.querySelector("#approval-impact"),
  allowEvolution: document.querySelector("#allow-evolution"),
  denyEvolution: document.querySelector("#deny-evolution"),
  projectState: document.querySelector("#project-state"),
  previewState: document.querySelector("#preview-state"),
  evolutionState: document.querySelector("#evolution-state"),
  tabs: [...document.querySelectorAll(".tab")],
  inspector: document.querySelector("#inspector"),
};

els.createProject.addEventListener("click", () => runAction(createProject));
els.startPreview.addEventListener("click", () => runAction(startPreview));
els.startEvolution.addEventListener("click", () => runAction(startEvolution));
els.allowEvolution.addEventListener("click", () => runAction(allowEvolution));
els.denyEvolution.addEventListener("click", () => runAction(denyEvolution));
for (const tab of els.tabs) {
  tab.addEventListener("click", () => {
    state.activeTab = tab.dataset.tab;
    render();
  });
}

void initialize();

async function initialize() {
  await runAction(async () => {
    const status = await fetchJson("/api/host/status");
    els.workspaceLabel.textContent = compactPath(status.workspace);
    const projects = await fetchJson("/api/host/projects");
    state.project = projects.projects.find((project) => project.app_id === APP_ID) ?? null;
    if (state.project) await refreshProject();
  });
}

async function createProject() {
  if (!state.project) {
    const result = await fetchJson("/api/host/projects", {
      method: "POST",
      body: JSON.stringify({
        app_id: APP_ID,
        display_name: "Team Knowledge Inbox",
        profile_id: "knowledge-inbox-bun-sqlite",
        builder_user_id: "builder-alice",
        builder_request: "Create a shared inbox for team knowledge.",
      }),
    });
    state.project = result.project;
  }
  await refreshProject();
}

async function startPreview() {
  await ensureProject();
  const result = await fetchJson(`/api/host/projects/${APP_ID}/preview/start`, {
    method: "POST",
    body: JSON.stringify({ version_id: "v0" }),
  });
  state.preview = result.preview;
  await refreshInspection();
}

async function startEvolution() {
  await ensurePreview();
  const result = await fetchJson(`/api/host/projects/${APP_ID}/evolution/start`, {
    method: "POST",
    body: JSON.stringify({
      version_id: "v0",
      builder_user_id: "builder-alice",
      builder_request: els.builderRequest.value.trim() || "Add a Priority Queue for urgent inbox items.",
    }),
  });
  state.evolution = result;
  await refreshProject();
}

async function allowEvolution() {
  const result = await fetchJson(`/api/host/projects/${APP_ID}/evolution/approve`, { method: "POST" });
  state.evolution = result;
  await refreshPriorityQueue();
  await refreshInspection();
}

async function denyEvolution() {
  const result = await fetchJson(`/api/host/projects/${APP_ID}/evolution/deny`, { method: "POST" });
  state.evolution = result;
  state.priorityRows = [];
  await refreshInspection();
}

async function ensureProject() {
  if (!state.project) await createProject();
}

async function ensurePreview() {
  await ensureProject();
  if (!state.preview) await startPreview();
}

async function refreshProject() {
  if (!state.project) return;
  const result = await fetchJson(`/api/host/projects/${APP_ID}`);
  state.project = result.project;
  state.preview = result.preview;
  state.evolution = result.evolution ?? state.evolution;
  if (state.preview?.preview_url) {
    els.previewFrame.src = state.preview.preview_url;
  }
  await refreshInspection({ quiet: true });
  if (currentEvolutionStatus() === "completed") {
    await refreshPriorityQueue({ quiet: true });
  }
}

async function refreshInspection(options = {}) {
  if (!state.preview?.preview_url) return;
  try {
    const result = await fetchJson(`/api/host/projects/${APP_ID}/inspect`);
    state.inspection = result.inspection;
  } catch (err) {
    if (!options.quiet) throw err;
  }
}

async function refreshPriorityQueue(options = {}) {
  try {
    const result = await fetchJson(`/api/host/projects/${APP_ID}/priority-queue`);
    state.priorityRows = result.rows ?? [];
  } catch (err) {
    state.priorityRows = [];
    if (!options.quiet) throw err;
  }
}

async function runAction(action) {
  if (state.busy) return;
  state.busy = true;
  render();
  try {
    await action();
  } catch (err) {
    state.evolution = {
      status: "failed",
      transcript: {
        status: "failed",
        events: [{ kind: "completion", summary: err instanceof Error ? err.message : String(err) }],
      },
    };
  } finally {
    state.busy = false;
    render();
  }
}

function render() {
  const hasProject = Boolean(state.project);
  const hasPreview = Boolean(state.preview?.preview_url);
  const evolutionStatus = currentEvolutionStatus();

  els.createProject.disabled = state.busy || hasProject;
  els.startPreview.disabled = state.busy || !hasProject || hasPreview;
  els.startEvolution.disabled = state.busy
    || !hasPreview
    || evolutionStatus === "awaiting_approval"
    || evolutionStatus === "completed";
  els.allowEvolution.disabled = state.busy || evolutionStatus !== "awaiting_approval";
  els.denyEvolution.disabled = state.busy || evolutionStatus !== "awaiting_approval";

  els.projectState.textContent = hasProject ? `${APP_ID}@v0` : "not created";
  els.previewState.textContent = hasPreview ? "running" : "stopped";
  els.evolutionState.textContent = evolutionStatus;
  els.previewStatus.textContent = hasPreview ? "running" : "offline";
  els.previewStatus.classList.toggle("online", hasPreview);
  els.emptyPreview.hidden = hasPreview;
  els.previewFrame.hidden = !hasPreview;
  if (hasPreview && els.previewFrame.src !== state.preview.preview_url) {
    els.previewFrame.src = state.preview.preview_url;
  }

  renderApproval();
  renderTabs();
  renderInspector();
}

function renderApproval() {
  const transcript = currentTranscript();
  const prompt = transcript?.events?.find((event) => event.kind === "approval_prompt");
  const status = currentEvolutionStatus();
  els.approvalPanel.hidden = status !== "awaiting_approval";
  if (!prompt) return;

  els.approvalTitle.textContent = prompt.summary || "Review proposed app change";
  els.approvalCopy.textContent = "The agent proposes one governed change-set. The Host will apply all child mutations together after approval.";
  const impact = prompt.detail?.impact ?? {};
  const items = [
    ["Schema", countOf(impact.changed_tables) + countOf(impact.added_tables)],
    ["Domain service", countOf(impact.added_operations)],
    ["View", countOf(impact.added_views)],
    ["Policy", countOf(impact.added_policy_rules)],
  ];
  els.approvalImpact.innerHTML = items.map(([label, value]) => `
    <div>
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(String(value))}</strong>
    </div>
  `).join("");
}

function renderTabs() {
  for (const tab of els.tabs) {
    tab.classList.toggle("active", tab.dataset.tab === state.activeTab);
  }
}

function renderInspector() {
  if (!state.inspection) {
    els.inspector.innerHTML = `<div class="empty-state"><p>Inspection appears after preview starts.</p></div>`;
    return;
  }

  if (state.activeTab === "data") {
    renderDataTab();
  } else if (state.activeTab === "schema") {
    renderSchemaTab();
  } else if (state.activeTab === "api") {
    renderApiTab();
  } else {
    renderTranscriptTab();
  }
}

function renderDataTab() {
  const rows = state.priorityRows.length
    ? state.priorityRows
    : state.inspection?.data?.inbox_items ?? [];
  const title = state.priorityRows.length ? "Priority Queue rows" : "Inbox rows";
  els.inspector.innerHTML = `
    <div class="inspector-heading">
      <h3>${title}</h3>
      <span>${rows.length} rows</span>
    </div>
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Priority</th>
            <th>Title</th>
            <th>Status</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row) => `
            <tr>
              <td>${escapeHtml(row.priority ?? "")}</td>
              <td>${escapeHtml(row.title ?? "")}</td>
              <td>${escapeHtml(row.status ?? "")}</td>
              <td>${escapeHtml(row.source ?? "")}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSchemaTab() {
  const tables = state.inspection?.schema?.tables ?? [];
  els.inspector.innerHTML = `
    <div class="inspector-heading">
      <h3>Schema with demo data</h3>
      <span>${tables.length} tables</span>
    </div>
    <div class="schema-list">
      ${tables.map((table) => `
        <article class="schema-block">
          <h4>${escapeHtml(table.id)}</h4>
          <div class="column-list">
            ${(table.columns ?? []).map((column) => `
              <span class="${column.name === "priority" ? "is-new" : ""}">${escapeHtml(column.name)}</span>
            `).join("")}
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function renderApiTab() {
  const operations = state.inspection?.operations ?? [];
  els.inspector.innerHTML = `
    <div class="inspector-heading">
      <h3>Domain service and API</h3>
      <span>${operations.length} operations</span>
    </div>
    <div class="operation-list">
      ${operations.map((operation) => `
        <article class="operation-row ${operation.id === "list_priority_queue" ? "is-new" : ""}">
          <div>
            <strong>${escapeHtml(operation.id)}</strong>
            <p>${escapeHtml(operation.description ?? operation.name ?? "")}</p>
          </div>
          <span>${escapeHtml(operation.invocation_method ?? "")}</span>
        </article>
      `).join("")}
    </div>
  `;
}

function renderTranscriptTab() {
  const events = currentTranscript()?.events ?? [];
  els.inspector.innerHTML = `
    <div class="inspector-heading">
      <h3>Agent transcript</h3>
      <span>${events.length} events</span>
    </div>
    <div class="timeline">
      ${events.map((event) => `
        <article class="timeline-row">
          <span>${escapeHtml(labelForEvent(event.kind))}</span>
          <div>
            <strong>${escapeHtml(event.tool ?? event.actor ?? "")}</strong>
            <p>${escapeHtml(event.summary ?? "")}</p>
          </div>
        </article>
      `).join("")}
    </div>
  `;
}

function currentEvolutionStatus() {
  return state.evolution?.status ?? state.evolution?.transcript?.status ?? "idle";
}

function currentTranscript() {
  return state.evolution?.transcript ?? state.evolution?.evolution?.transcript ?? state.inspection?.transcript ?? null;
}

function countOf(value) {
  return Array.isArray(value) ? value.length : 0;
}

function compactPath(path) {
  if (typeof path !== "string") return "local workspace";
  const parts = path.split("/");
  return parts.length > 3 ? `.../${parts.slice(-3).join("/")}` : path;
}

function labelForEvent(kind) {
  return String(kind ?? "").replaceAll("_", " ");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function fetchJson(url, init) {
  const response = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${init?.method ?? "GET"} ${url} failed with HTTP ${response.status}: ${await response.text()}`);
  }
  return await response.json();
}
