const APPS = {
  inbox: {
    app_id: "team-knowledge-inbox",
    display_name: "Team Knowledge Inbox",
    profile_id: "knowledge-inbox-bun-sqlite",
  },
  decisions: {
    app_id: "team-decision-log",
    display_name: "Team Decision Log",
    profile_id: "team-decision-log-bun-sqlite",
  },
};

const state = {
  workspace: "",
  projects: [],
  selectedAppId: "",
  previews: new Map(),
  inspection: null,
  evolution: null,
  reviewPacket: null,
  assurance: null,
  assuranceCases: [],
  rollout: null,
  events: [],
  busy: false,
  activeTab: "schema",
  frameUrl: "",
};

const els = {
  workspaceLabel: document.querySelector("#workspace-label"),
  surfaceTitle: document.querySelector("#surface-title"),
  surfacePill: document.querySelector("#surface-pill"),
  emptySurface: document.querySelector("#empty-surface"),
  appFrame: document.querySelector("#app-frame"),
  createInbox: document.querySelector("#create-inbox"),
  createDecisions: document.querySelector("#create-decisions"),
  projectList: document.querySelector("#project-list"),
  selectedApp: document.querySelector("#selected-app"),
  startPreview: document.querySelector("#start-preview"),
  inspectApp: document.querySelector("#inspect-app"),
  startEvolution: document.querySelector("#start-evolution"),
  approveEvolution: document.querySelector("#approve-evolution"),
  denyEvolution: document.querySelector("#deny-evolution"),
  approvalCopy: document.querySelector("#approval-copy"),
  evolutionStatus: document.querySelector("#evolution-status"),
  assuranceReadiness: document.querySelector("#assurance-readiness"),
  assuranceSummary: document.querySelector("#assurance-summary"),
  assuranceRisk: document.querySelector("#assurance-risk"),
  assuranceEvidence: document.querySelector("#assurance-evidence"),
  assuranceReasons: document.querySelector("#assurance-reasons"),
  publishV0: document.querySelector("#publish-v0"),
  publishV1: document.querySelector("#publish-v1"),
  restartActive: document.querySelector("#restart-active"),
  rollback: document.querySelector("#rollback"),
  rolloutStatus: document.querySelector("#rollout-status"),
  inspectorOutput: document.querySelector("#inspector-output"),
  tabs: [...document.querySelectorAll("[data-tab]")],
};

els.createInbox.addEventListener("click", () => runAction(() => createProject(APPS.inbox)));
els.createDecisions.addEventListener("click", () => runAction(() => createProject(APPS.decisions)));
els.startPreview.addEventListener("click", () => runAction(startPreview));
els.inspectApp.addEventListener("click", () => runAction(inspectSelected));
els.startEvolution.addEventListener("click", () => runAction(startEvolution));
els.approveEvolution.addEventListener("click", () => runAction(approveEvolution));
els.denyEvolution.addEventListener("click", () => runAction(denyEvolution));
els.publishV0.addEventListener("click", () => runAction(() => publishVersion("v0")));
els.publishV1.addEventListener("click", () => runAction(() => publishVersion("v1")));
els.restartActive.addEventListener("click", () => runAction(restartActive));
els.rollback.addEventListener("click", () => runAction(rollback));
els.tabs.forEach((button) => {
  button.addEventListener("click", () => {
    state.activeTab = button.dataset.tab;
    render();
  });
});

void initialize();

async function initialize() {
  await runAction(async () => {
    const status = await fetchJson("/api/host/status");
    state.workspace = status.workspace;
    state.projects = status.projects ?? [];
    if (state.projects[0]) state.selectedAppId = state.projects[0].app_id;
    await loadAssurance();
  });
}

async function createProject(app) {
  const exists = state.projects.some((project) => project.app_id === app.app_id);
  if (!exists) {
    await fetchJson("/api/host/projects", {
      method: "POST",
      body: JSON.stringify(app),
    });
    pushEvent("created", `${app.display_name} created from ${app.profile_id}.`);
  }
  await refreshProjects();
  selectApp(app.app_id);
  await loadAssurance();
}

async function startPreview() {
  requireSelected();
  const result = await fetchJson(`/api/host/projects/${state.selectedAppId}/preview/start`, { method: "POST" });
  state.previews.set(state.selectedAppId, result.preview);
  state.frameUrl = result.preview.preview_url;
  pushEvent("preview", `${state.selectedAppId}@${result.preview.version_id} is running.`);
}

async function inspectSelected() {
  requireSelected();
  const result = await fetchJson(`/api/host/projects/${state.selectedAppId}/inspect`);
  state.inspection = result.inspection;
  state.evolution = result.evolution;
  state.reviewPacket = result.review_packet ?? state.reviewPacket;
  state.assurance = result.assurance ?? state.assurance;
  state.assuranceCases = result.assurance_cases ?? state.assuranceCases;
  state.previews.set(state.selectedAppId, result.preview);
  pushEvent("inspect", `${state.selectedAppId} schema/data refreshed.`);
}

async function startEvolution() {
  selectApp(APPS.inbox.app_id);
  const result = await fetchJson(`/api/host/projects/${APPS.inbox.app_id}/evolution/start`, {
    method: "POST",
    body: JSON.stringify({
      builder_user_id: "builder-alice",
      builder_request: "Add a Priority Queue for urgent inbox items.",
    }),
  });
  state.evolution = result.evolution;
  state.reviewPacket = result.review_packet;
  state.assurance = result.assurance;
  state.assuranceCases = result.assurance_cases ?? state.assuranceCases;
  state.frameUrl = result.result.preview_url;
  await refreshProjects();
  pushEvent("proposal", "Priority Queue proposal is waiting for one Builder approval.");
}

async function approveEvolution() {
  const result = await fetchJson(`/api/host/projects/${APPS.inbox.app_id}/evolution/approve`, { method: "POST" });
  state.evolution = result.evolution;
  state.reviewPacket = result.review_packet ?? state.reviewPacket;
  state.assurance = result.assurance;
  state.assuranceCases = result.assurance_cases ?? state.assuranceCases;
  state.frameUrl = result.result.preview_url;
  state.inspection = {
    ...(state.inspection ?? {}),
    transcript: result.evolution.transcript,
    data: { priority_queue: result.priority_rows },
  };
  pushEvent("approved", "Priority Queue completed with 3 seeded priority rows.");
}

async function denyEvolution() {
  const result = await fetchJson(`/api/host/projects/${APPS.inbox.app_id}/evolution/deny`, { method: "POST" });
  state.evolution = result.evolution;
  state.reviewPacket = result.review_packet ?? state.reviewPacket;
  state.assurance = result.assurance;
  state.assuranceCases = result.assurance_cases ?? state.assuranceCases;
  pushEvent("denied", "Builder denied the proposal; app definition stayed unchanged.");
}

async function publishVersion(versionId) {
  selectApp(APPS.inbox.app_id);
  const result = await fetchJson(`/api/host/projects/${APPS.inbox.app_id}/publish`, {
    method: "POST",
    body: JSON.stringify({ version_id: versionId }),
  });
  applyRollout(result);
  state.assurance = result.assurance ?? state.assurance;
  state.assuranceCases = result.assurance_cases ?? state.assuranceCases;
  pushEvent("published", `${versionId} is active as Published Application.`);
}

async function loadAssurance() {
  if (!state.selectedAppId) {
    state.assurance = null;
    state.assuranceCases = [];
    return;
  }
  const result = await fetchJson(`/api/host/projects/${state.selectedAppId}/assurance`);
  state.assuranceCases = result.cases ?? [];
  state.assurance = state.assuranceCases[0] ?? null;
}

async function restartActive() {
  blankFrame();
  const result = await fetchJson(`/api/host/projects/${APPS.inbox.app_id}/restart-active`, { method: "POST" });
  applyRollout(result);
  pushEvent("restart", `${result.summary.active_candidate_id} restarted healthy.`);
}

async function rollback() {
  blankFrame();
  const result = await fetchJson(`/api/host/projects/${APPS.inbox.app_id}/rollback`, { method: "POST" });
  applyRollout(result);
  pushEvent("rollback", `${result.summary.active_candidate_id} restored as active.`);
}

async function refreshProjects() {
  const result = await fetchJson("/api/host/projects");
  state.projects = result.projects ?? [];
}

function applyRollout(result) {
  state.rollout = result;
  state.frameUrl = result.active?.url ?? result.state?.active?.url ?? "";
}

async function runAction(action) {
  if (state.busy) return;
  state.busy = true;
  render();
  try {
    await action();
  } catch (err) {
    pushEvent("error", err instanceof Error ? err.message : String(err));
  } finally {
    state.busy = false;
    render();
  }
}

function render() {
  els.workspaceLabel.textContent = compactPath(state.workspace);
  const selected = selectedProject();
  const isInbox = selected?.profile_id === APPS.inbox.profile_id;
  const hasV1 = isInbox && selected?.current_version_id === "v1";
  const selectedPreview = state.previews.get(state.selectedAppId);
  const selectedActiveRelease = isInbox ? state.rollout?.summary?.active_candidate_id : undefined;
  const assurance = activeAssurance();
  els.selectedApp.textContent = selected ? `${selected.app_id}@${selected.current_version_id}` : "none";
  els.surfaceTitle.textContent = selected?.display_name ?? "M16 Reference Creation Host";
  els.surfacePill.textContent = selectedActiveRelease ?? selectedPreview?.version_id ?? "no release";
  els.evolutionStatus.textContent = state.evolution?.status ?? "idle";
  els.rolloutStatus.textContent = selectedActiveRelease ?? "no release";

  els.emptySurface.hidden = Boolean(state.frameUrl);
  els.appFrame.hidden = !state.frameUrl;
  if (state.frameUrl && els.appFrame.src !== state.frameUrl) els.appFrame.src = state.frameUrl;

  const hasSelected = Boolean(selected);
  els.startPreview.disabled = state.busy || !hasSelected;
  els.inspectApp.disabled = state.busy || !hasSelected || !state.previews.has(state.selectedAppId);
  els.startEvolution.disabled = state.busy || !isInbox;
  els.approveEvolution.disabled = state.busy || state.evolution?.status !== "awaiting_approval";
  els.denyEvolution.disabled = state.busy || state.evolution?.status !== "awaiting_approval";
  els.publishV0.disabled = state.busy || !isInbox;
  els.publishV1.disabled = state.busy || !hasV1 || !["verified", "ready_to_publish"].includes(assurance?.readiness);
  els.restartActive.disabled = state.busy || !isInbox || !state.rollout?.summary?.active_candidate_id;
  els.rollback.disabled = state.busy || !isInbox || !state.rollout?.summary?.previous_candidate_id;

  renderProjects();
  renderAssurance();
  renderInspector();
}

function renderProjects() {
  if (!state.projects.length) {
    els.projectList.innerHTML = `<p class="muted">No generated apps yet.</p>`;
    return;
  }
  els.projectList.innerHTML = state.projects.map((project) => `
    <button class="project-row ${project.app_id === state.selectedAppId ? "active" : ""}" data-app-id="${escapeHtml(project.app_id)}">
      <strong>${escapeHtml(project.display_name)}</strong>
      <span>${escapeHtml(project.profile_id)} · ${escapeHtml(project.current_version_id)}</span>
    </button>
  `).join("");
  els.projectList.querySelectorAll("[data-app-id]").forEach((button) => {
    button.addEventListener("click", () => runAction(async () => {
      selectApp(button.dataset.appId);
      await loadAssurance();
    }));
  });
}

function renderInspector() {
  els.tabs.forEach((button) => button.classList.toggle("active", button.dataset.tab === state.activeTab));
  const inspection = state.inspection ?? {};
  const payload = {
    schema: inspection.schema?.tables ?? [],
    operations: inspection.operations ?? [],
    policies: inspection.schema?.policy_rules ?? [],
    data: inspection.data ?? {},
    assurance: {
      current: activeAssurance(),
      recent_cases: state.assuranceCases,
      review_packet: state.reviewPacket,
    },
    transcript: state.evolution?.transcript ?? inspection.transcript ?? null,
    timeline: state.events,
  }[state.activeTab];
  els.inspectorOutput.textContent = JSON.stringify(payload ?? "No evidence yet.", null, 2);
}

function renderAssurance() {
  const assurance = activeAssurance();
  const reviewPacket = state.reviewPacket;
  els.approvalCopy.textContent = reviewPacket
    ? `${reviewPacket.approval_statement} Recovery: ${reviewPacket.recovery_plan?.summary ?? "Host-owned recovery plan."}`
    : "One Builder intent becomes one approval before framework_system mutates app definition.";
  if (!assurance) {
    els.assuranceReadiness.textContent = "no change";
    els.assuranceSummary.textContent = "No Builder/Agent change has been proposed yet.";
    els.assuranceRisk.textContent = "none";
    els.assuranceEvidence.textContent = "0 refs";
    els.assuranceReasons.innerHTML = "";
    return;
  }

  els.assuranceReadiness.textContent = assurance.readiness;
  els.assuranceSummary.textContent = assurance.scope_summary || assurance.intent_summary;
  els.assuranceRisk.textContent = (assurance.risk_classification ?? []).join(", ") || "none";
  els.assuranceEvidence.textContent = `${assurance.evidence_refs?.length ?? 0} refs`;
  const reasons = assurance.blocking_reasons?.length
    ? assurance.blocking_reasons
    : readinessCopy(assurance.readiness);
  els.assuranceReasons.innerHTML = reasons
    .map((reason) => `<li>${escapeHtml(reason)}</li>`)
    .join("");
}

function activeAssurance() {
  return state.assurance ?? state.assuranceCases[0] ?? null;
}

function readinessCopy(readiness) {
  if (readiness === "awaiting_approval") return ["Waiting for Builder approval before mutation."];
  if (readiness === "verified") return ["Applied change passed post-apply checks."];
  if (readiness === "ready_to_publish") return ["Release health checks passed; publish gate is clear."];
  if (readiness === "failed_recovered") return ["Failure was recovered with rollback evidence."];
  if (readiness === "blocked") return ["A required assurance condition is blocking progress."];
  return [readiness];
}

function selectedProject() {
  return state.projects.find((project) => project.app_id === state.selectedAppId);
}

function selectApp(appId) {
  if (state.selectedAppId !== appId) {
    state.assurance = null;
    state.assuranceCases = [];
  }
  state.selectedAppId = appId;
  const preview = state.previews.get(appId);
  state.frameUrl = preview?.preview_url ?? "";
}

function requireSelected() {
  if (!state.selectedAppId) throw new Error("select or create a generated app first");
}

function blankFrame() {
  state.frameUrl = "";
  els.appFrame.src = "about:blank";
}

function pushEvent(kind, message) {
  state.events = [
    { kind, message, at: new Date().toISOString() },
    ...state.events,
  ];
}

function compactPath(path) {
  if (!path) return "local workspace";
  const parts = path.split("/");
  return parts.length > 3 ? `.../${parts.slice(-3).join("/")}` : path;
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
