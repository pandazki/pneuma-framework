const APP_ID = "team-knowledge-inbox";

const state = {
  workspace: "",
  demo: null,
  rollout: null,
  activeUrl: "",
  health: "unknown",
  busy: false,
  events: [],
};

const els = {
  workspaceLabel: document.querySelector("#workspace-label"),
  releasePill: document.querySelector("#release-pill"),
  emptyRelease: document.querySelector("#empty-release"),
  publishedFrame: document.querySelector("#published-frame"),
  createDemo: document.querySelector("#create-demo"),
  publishV0: document.querySelector("#publish-v0"),
  publishV1: document.querySelector("#publish-v1"),
  restartActive: document.querySelector("#restart-active"),
  rollback: document.querySelector("#rollback"),
  activeState: document.querySelector("#active-state"),
  previousState: document.querySelector("#previous-state"),
  healthState: document.querySelector("#health-state"),
  stepCreate: document.querySelector("#step-create"),
  stepPublishV0: document.querySelector("#step-publish-v0"),
  stepPublishV1: document.querySelector("#step-publish-v1"),
  stepRollback: document.querySelector("#step-rollback"),
  versionV0: document.querySelector("#version-v0"),
  versionV1: document.querySelector("#version-v1"),
  timeline: document.querySelector("#timeline"),
  timelineCount: document.querySelector("#timeline-count"),
};

els.createDemo.addEventListener("click", () => runAction(createDemo));
els.publishV0.addEventListener("click", () => runAction(() => publishVersion("v0")));
els.publishV1.addEventListener("click", () => runAction(() => publishVersion("v1")));
els.restartActive.addEventListener("click", () => runAction(restartActive));
els.rollback.addEventListener("click", () => runAction(rollback));

void initialize();

async function initialize() {
  await runAction(async () => {
    const status = await fetchJson("/api/host/status");
    state.workspace = status.workspace;
    state.demo = status.demo;
    els.workspaceLabel.textContent = compactPath(status.workspace);
    if (hasDemo()) await refreshRollout({ quiet: true });
  });
}

async function createDemo() {
  const demo = await fetchJson("/api/host/demo/create", { method: "POST" });
  state.demo = demo;
  pushEvent("created", "Created v0 and Builder/Agent-evolved v1 workspaces.");
  await refreshRollout({ quiet: true });
}

async function publishVersion(versionId) {
  const result = await fetchJson(`/api/host/projects/${APP_ID}/publish`, {
    method: "POST",
    body: JSON.stringify({ version_id: versionId }),
  });
  applyRolloutResult(result);
  pushEvent("published", `${versionId} promoted as the active Published Application.`);
}

async function restartActive() {
  blankPublishedFrame();
  const result = await fetchJson(`/api/host/projects/${APP_ID}/restart-active`, { method: "POST" });
  applyRolloutResult(result);
  pushEvent("restarted", `${result.summary.active_candidate_id} restarted and passed health checks.`);
}

async function rollback() {
  const result = await fetchJson(`/api/host/projects/${APP_ID}/rollback`, { method: "POST" });
  applyRolloutResult(result);
  pushEvent("rollback", `${result.summary.active_candidate_id} restored as active; ${result.summary.previous_candidate_id} kept as previous.`);
}

async function refreshRollout(options = {}) {
  try {
    const rollout = await fetchJson(`/api/host/projects/${APP_ID}/rollout`);
    state.rollout = rollout;
    const active = rollout.state?.active;
    state.activeUrl = active?.url ?? "";
    state.health = active?.status ?? "unknown";
  } catch (err) {
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
    pushEvent("error", err instanceof Error ? err.message : String(err));
  } finally {
    state.busy = false;
    render();
  }
}

function applyRolloutResult(result) {
  state.rollout = { state: result.state, summary: result.summary };
  state.activeUrl = result.active?.url ?? result.state?.active?.url ?? "";
  state.health = result.health?.ok ? "healthy" : result.state?.active?.status ?? "unknown";
}

function blankPublishedFrame() {
  state.activeUrl = "";
  els.publishedFrame.src = "about:blank";
}

function pushEvent(kind, message) {
  state.events = [
    {
      kind,
      message,
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }),
    },
    ...state.events,
  ];
}

function render() {
  const demoReady = hasDemo();
  const activeCandidate = state.rollout?.summary?.active_candidate_id ?? "";
  const previousCandidate = state.rollout?.summary?.previous_candidate_id ?? "";
  const activeVersion = versionFromCandidate(activeCandidate);
  const previousVersion = versionFromCandidate(previousCandidate);

  els.createDemo.disabled = state.busy || demoReady;
  els.publishV0.disabled = state.busy || !demoReady || activeVersion === "v0";
  els.publishV1.disabled = state.busy || !demoReady || activeVersion === "v1";
  els.restartActive.disabled = state.busy || !activeCandidate;
  els.rollback.disabled = state.busy || !previousCandidate;

  els.activeState.textContent = activeCandidate || "none";
  els.previousState.textContent = previousCandidate || "none";
  els.healthState.textContent = state.health;
  els.releasePill.textContent = activeCandidate || "no release";
  els.releasePill.classList.toggle("online", Boolean(activeCandidate));

  els.emptyRelease.hidden = Boolean(state.activeUrl);
  els.publishedFrame.hidden = !state.activeUrl;
  if (state.activeUrl && els.publishedFrame.src !== state.activeUrl) {
    els.publishedFrame.src = state.activeUrl;
  }

  setStep(els.stepCreate, demoReady ? "done" : "active");
  setStep(els.stepPublishV0, activeVersion === "v0" || previousVersion === "v0" ? "done" : demoReady ? "active" : "");
  setStep(els.stepPublishV1, activeVersion === "v1" || previousVersion === "v1" ? "done" : activeVersion === "v0" ? "active" : "");
  setStep(els.stepRollback, activeVersion === "v0" && previousVersion === "v1" ? "done" : previousVersion ? "active" : "");

  els.versionV0.classList.toggle("active", activeVersion === "v0");
  els.versionV1.classList.toggle("active", activeVersion === "v1");
  renderTimeline();
}

function renderTimeline() {
  els.timelineCount.textContent = `${state.events.length} event${state.events.length === 1 ? "" : "s"}`;
  if (!state.events.length) {
    els.timeline.innerHTML = `<p class="empty-line">Run the flow to collect publish and rollback evidence.</p>`;
    return;
  }
  els.timeline.innerHTML = state.events.map((event) => `
    <article class="timeline-row">
      <span>${escapeHtml(event.time)}</span>
      <div>
        <strong>${escapeHtml(event.kind)}</strong>
        <p>${escapeHtml(event.message)}</p>
      </div>
    </article>
  `).join("");
}

function setStep(element, status) {
  element.classList.toggle("done", status === "done");
  element.classList.toggle("active", status === "active");
}

function hasDemo() {
  return Boolean(state.demo?.versions?.length);
}

function versionFromCandidate(candidate) {
  const match = String(candidate || "").match(/-(v[0-9]+)$/);
  return match ? match[1] : "";
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
