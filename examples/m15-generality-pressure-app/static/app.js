const APP_IDS = ["team-knowledge-inbox", "team-decision-log"];

const state = {
  workspace: "",
  projects: [],
  previews: {},
  inspections: {},
  selectedAppId: "",
  activeTab: "schema",
  busy: false,
};

const els = {
  workspaceLabel: document.querySelector("#workspace-label"),
  previewTitle: document.querySelector("#preview-title"),
  previewStatus: document.querySelector("#preview-status"),
  emptyPreview: document.querySelector("#empty-preview"),
  previewFrame: document.querySelector("#preview-frame"),
  createBoth: document.querySelector("#create-both"),
  appGrid: document.querySelector("#app-grid"),
  tabs: [...document.querySelectorAll(".tab")],
  inspector: document.querySelector("#inspector"),
};

els.createBoth.addEventListener("click", () => runAction(createBoth));
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
    state.workspace = status.workspace;
    els.workspaceLabel.textContent = compactPath(status.workspace);
    await refreshProjects();
  });
}

async function createBoth() {
  const result = await fetchJson("/api/host/demo/create", { method: "POST" });
  state.projects = result.projects;
  if (!state.selectedAppId) state.selectedAppId = result.projects[0]?.app_id ?? "";
}

async function startPreview(appId) {
  const result = await fetchJson(`/api/host/projects/${appId}/preview/start`, { method: "POST" });
  state.previews[appId] = result.preview;
  state.selectedAppId = appId;
  await inspectApp(appId);
}

async function inspectApp(appId) {
  const result = await fetchJson(`/api/host/projects/${appId}/inspect`);
  state.previews[appId] = result.preview;
  state.inspections[appId] = result.inspection;
  state.selectedAppId = appId;
}

async function refreshProjects() {
  const result = await fetchJson("/api/host/projects");
  state.projects = result.projects;
  if (!state.selectedAppId) state.selectedAppId = state.projects[0]?.app_id ?? "";
}

async function runAction(action) {
  if (state.busy) return;
  state.busy = true;
  render();
  try {
    await action();
  } catch (err) {
    els.inspector.innerHTML = `<p class="error-line">${escapeHtml(err instanceof Error ? err.message : String(err))}</p>`;
  } finally {
    state.busy = false;
    render();
  }
}

function render() {
  const hasProjects = state.projects.length > 0;
  els.createBoth.disabled = state.busy || hasProjects;
  renderAppCards();
  renderPreview();
  renderTabs();
  renderInspector();
}

function renderAppCards() {
  const projects = hasProjectData()
    ? state.projects
    : APP_IDS.map((app_id) => ({
      app_id,
      display_name: app_id === "team-knowledge-inbox" ? "Team Knowledge Inbox" : "Team Decision Log",
      profile_id: app_id === "team-knowledge-inbox"
        ? "knowledge-inbox-bun-sqlite"
        : "team-decision-log-bun-sqlite",
    }));
  els.appGrid.innerHTML = projects.map((project) => {
    const preview = state.previews[project.app_id];
    const inspection = state.inspections[project.app_id];
    const selected = project.app_id === state.selectedAppId;
    return `
      <article class="app-card ${selected ? "selected" : ""}">
        <div>
          <p class="eyebrow">${escapeHtml(project.profile_id)}</p>
          <h3>${escapeHtml(project.display_name)}</h3>
          <p>${escapeHtml(summaryFor(project.app_id))}</p>
        </div>
        <div class="button-row">
          <button data-action="preview" data-app-id="${escapeHtml(project.app_id)}" data-testid="preview-${escapeHtml(project.app_id)}" type="button" ${state.busy || !hasProjectData() ? "disabled" : ""}>Preview</button>
          <button data-action="inspect" data-app-id="${escapeHtml(project.app_id)}" data-testid="inspect-${escapeHtml(project.app_id)}" type="button" ${state.busy || !preview ? "disabled" : ""}>Inspect</button>
        </div>
        <dl>
          <div><dt>Preview</dt><dd>${preview ? "running" : "stopped"}</dd></div>
          <div><dt>Rows</dt><dd>${rowCount(inspection)}</dd></div>
        </dl>
      </article>
    `;
  }).join("");
  for (const button of els.appGrid.querySelectorAll("button")) {
    button.addEventListener("click", () => {
      const appId = button.dataset.appId;
      if (button.dataset.action === "preview") void runAction(() => startPreview(appId));
      if (button.dataset.action === "inspect") void runAction(() => inspectApp(appId));
    });
  }
}

function renderPreview() {
  const preview = state.previews[state.selectedAppId];
  const project = state.projects.find((candidate) => candidate.app_id === state.selectedAppId);
  els.previewTitle.textContent = project?.display_name ?? "Select an app";
  els.previewStatus.textContent = preview ? `${preview.app_id}@${preview.version_id}` : "offline";
  els.previewStatus.classList.toggle("online", Boolean(preview));
  els.emptyPreview.hidden = Boolean(preview?.preview_url);
  els.previewFrame.hidden = !preview?.preview_url;
  if (preview?.preview_url && els.previewFrame.src !== preview.preview_url) {
    els.previewFrame.src = preview.preview_url;
  }
}

function renderTabs() {
  for (const tab of els.tabs) {
    tab.classList.toggle("active", tab.dataset.tab === state.activeTab);
  }
}

function renderInspector() {
  const inspection = state.inspections[state.selectedAppId];
  if (!inspection) {
    els.inspector.innerHTML = `<p class="empty-line">Inspection appears after preview starts.</p>`;
    return;
  }
  if (state.activeTab === "schema") renderList("Schema", inspection.schema.tables, "id");
  else if (state.activeTab === "operations") renderList("Operations", inspection.operations, "id");
  else if (state.activeTab === "views") renderList("Views", inspection.schema.views, "id");
  else if (state.activeTab === "policies") renderList("Policies", inspection.schema.policy_rules, "id");
  else renderData(inspection.data);
}

function renderList(title, rows, field) {
  els.inspector.innerHTML = `
    <div class="inspector-heading"><h3>${escapeHtml(title)}</h3><span>${rows.length} items</span></div>
    <div class="list-stack">
      ${rows.map((row) => `
        <article class="inspect-row">
          <strong>${escapeHtml(row[field] ?? "")}</strong>
          <pre>${escapeHtml(JSON.stringify(row, null, 2))}</pre>
        </article>
      `).join("")}
    </div>
  `;
}

function renderData(data) {
  const [tableId, rows = []] = Object.entries(data)[0] ?? ["rows", []];
  els.inspector.innerHTML = `
    <div class="inspector-heading"><h3>${escapeHtml(tableId)}</h3><span>${rows.length} rows</span></div>
    <div class="list-stack">
      ${rows.map((row) => `
        <article class="inspect-row">
          <strong>${escapeHtml(row.title ?? row.url ?? row.id ?? "")}</strong>
          <pre>${escapeHtml(JSON.stringify(row, null, 2))}</pre>
        </article>
      `).join("")}
    </div>
  `;
}

function hasProjectData() {
  return state.projects.length > 0;
}

function summaryFor(appId) {
  if (appId === "team-knowledge-inbox") return "Capture, review, and triage durable source material.";
  return "Record team decisions with owner and status policy shape.";
}

function rowCount(inspection) {
  if (!inspection) return "n/a";
  const rows = Object.values(inspection.data)[0] ?? [];
  return String(rows.length);
}

function compactPath(path) {
  if (!path) return "local workspace";
  const parts = path.split("/");
  return parts.length > 3 ? `…/${parts.slice(-3).join("/")}` : path;
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
  return response.json();
}
