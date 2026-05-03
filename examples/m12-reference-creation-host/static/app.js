const state = {
  appId: null,
  previewUrl: null,
  inspection: null,
  activeTab: "schema",
  busy: new Set(),
};

const $ = (id) => document.getElementById(id);

async function jsonFetch(path, init) {
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init && init.headers ? init.headers : {}),
    },
  });
  if (!response.ok) {
    throw new Error(`${init && init.method ? init.method : "GET"} ${path} failed: ${await response.text()}`);
  }
  return await response.json();
}

async function createProject() {
  setBusy("create-project", true);
  try {
    const created = await jsonFetch("/api/host/projects", {
      method: "POST",
      body: JSON.stringify({
        app_id: "team-knowledge-inbox",
        display_name: "Team Knowledge Inbox",
        profile_id: "knowledge-inbox-bun-sqlite",
        builder_user_id: "builder-alice",
        builder_request: $("builder-request").value,
      }),
    });
    state.appId = created.project.app_id;
    $("preview-title").textContent = `${created.project.app_id}@${created.project.current_version_id}`;
    $("preview-status").textContent = "created";
    renderObject({
      project: created.project,
      version: created.version,
    });
  } catch (err) {
    renderError(err);
  } finally {
    setBusy("create-project", false);
  }
}

async function startPreview() {
  if (!state.appId) return;
  setBusy("start-preview", true);
  try {
    const result = await jsonFetch(`/api/host/projects/${state.appId}/preview/start`, {
      method: "POST",
      body: JSON.stringify({ version_id: "v0" }),
    });
    state.previewUrl = result.preview.preview_url;
    $("preview-frame").src = state.previewUrl;
    $("preview-status").textContent = "running";
    await refreshInspect();
  } catch (err) {
    renderError(err);
  } finally {
    setBusy("start-preview", false);
  }
}

async function stopPreview() {
  if (!state.appId) return;
  setBusy("stop-preview", true);
  try {
    await jsonFetch(`/api/host/projects/${state.appId}/preview/stop`, { method: "POST" });
    state.previewUrl = null;
    $("preview-frame").removeAttribute("src");
    $("preview-status").textContent = "stopped";
  } catch (err) {
    renderError(err);
  } finally {
    setBusy("stop-preview", false);
  }
}

async function refreshInspect() {
  if (!state.appId) return;
  setBusy("refresh-inspect", true);
  try {
    const result = await jsonFetch(`/api/host/projects/${state.appId}/inspect`);
    state.inspection = result.inspection;
    renderInspection();
  } catch (err) {
    renderError(err);
  } finally {
    setBusy("refresh-inspect", false);
  }
}

function renderInspection() {
  if (!state.inspection) {
    renderObject({});
    return;
  }

  const tabValue = {
    schema: state.inspection.schema,
    data: state.inspection.data,
    operations: state.inspection.operations,
    logs: state.inspection.logs,
  }[state.activeTab];
  renderObject(tabValue);
}

function renderObject(value) {
  $("inspect-output").textContent = JSON.stringify(value, null, 2);
}

function renderError(err) {
  $("inspect-output").textContent = JSON.stringify({
    error: err instanceof Error ? err.message : String(err),
  }, null, 2);
}

function setBusy(id, busy) {
  if (busy) {
    state.busy.add(id);
  } else {
    state.busy.delete(id);
  }
  renderControls();
}

function renderControls() {
  $("create-project").disabled = state.busy.has("create-project") || state.appId !== null;
  $("start-preview").disabled = state.busy.has("start-preview") || state.appId === null || state.previewUrl !== null;
  $("stop-preview").disabled = state.busy.has("stop-preview") || state.previewUrl === null;
  $("refresh-inspect").disabled = state.busy.has("refresh-inspect") || state.previewUrl === null;
}

function activateTab(tab) {
  state.activeTab = tab;
  for (const button of document.querySelectorAll(".tab")) {
    button.classList.toggle("active", button.dataset.tab === tab);
  }
  renderInspection();
}

$("create-project").addEventListener("click", createProject);
$("start-preview").addEventListener("click", startPreview);
$("stop-preview").addEventListener("click", stopPreview);
$("refresh-inspect").addEventListener("click", refreshInspect);
$("publish-placeholder").addEventListener("click", () => undefined);

for (const button of document.querySelectorAll(".tab")) {
  button.addEventListener("click", () => activateTab(button.dataset.tab));
}

renderControls();
loadExistingProject().catch(renderError);

async function loadExistingProject() {
  const result = await jsonFetch("/api/host/projects");
  const project = result.projects.find((candidate) => candidate.app_id === "team-knowledge-inbox");
  if (!project) return;

  state.appId = project.app_id;
  $("preview-title").textContent = `${project.app_id}@${project.current_version_id}`;
  $("preview-status").textContent = "created";
  const detail = await jsonFetch(`/api/host/projects/${project.app_id}`);
  if (detail.preview && detail.preview.preview_url) {
    state.previewUrl = detail.preview.preview_url;
    $("preview-frame").src = state.previewUrl;
    $("preview-status").textContent = "running";
    await refreshInspect();
  } else {
    renderObject({
      project,
      versions: detail.versions,
      sessions: detail.sessions,
    });
  }
  renderControls();
}
