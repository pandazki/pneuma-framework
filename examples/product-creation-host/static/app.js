const state = {
  snapshot: { projects: [], shares: [] },
  selectedAppId: null,
  selectedTab: "preview",
  busy: false,
  role: "user:bob",
};

const els = {
  roleButtons: Array.from(document.querySelectorAll("#role-switcher button")),
  createForm: document.querySelector("#create-form"),
  projectList: document.querySelector("#project-list"),
  projectCount: document.querySelector("#project-count"),
  selectedTitle: document.querySelector("#selected-title"),
  selectedMeta: document.querySelector("#selected-meta"),
  pendingState: document.querySelector("#pending-state"),
  agentForm: document.querySelector("#agent-form"),
  agentMessage: document.querySelector("#agent-message"),
  proposal: document.querySelector("#proposal-card"),
  approve: document.querySelector("#approve-button"),
  preview: document.querySelector("#preview-button"),
  publish: document.querySelector("#publish-button"),
  share: document.querySelector("#share-button"),
  shareList: document.querySelector("#share-list"),
  decisions: document.querySelector("#decision-feed"),
  frame: document.querySelector("#preview-frame"),
  frameEmpty: document.querySelector("#preview-empty"),
  schema: document.querySelector("#tab-schema"),
  data: document.querySelector("#tab-data"),
  evidence: document.querySelector("#tab-evidence"),
  logs: document.querySelector("#agent-log"),
};

els.roleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.role = button.dataset.role;
    render();
  });
});

els.createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(els.createForm);
  await action(async () => {
    const project = await api("/api/projects", {
      name: form.get("name"),
      goal: form.get("goal"),
      template_id: form.get("template_id"),
      builder_subject: state.role.startsWith("user:charlie") ? "user:charlie" : "user:bob",
    });
    state.selectedAppId = project.app_id;
  });
});

els.agentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const project = selectedProject();
  if (!project) return;
  const message = els.agentMessage.value.trim();
  await action(
    () => api(`/api/projects/${project.app_id}/evolution/request`, {
      message,
      builder_subject: project.builder_subject,
    }),
    { poll: true },
  );
});

els.approve.addEventListener("click", async () => {
  const project = selectedProject();
  if (!project) return;
  await action(() => api(`/api/projects/${project.app_id}/evolution/approve`, { subject: state.role }));
});

els.preview.addEventListener("click", async () => {
  const project = selectedProject();
  if (!project) return;
  await action(() => api(`/api/projects/${project.app_id}/preview/start`, {}));
});

els.publish.addEventListener("click", async () => {
  const project = selectedProject();
  if (!project) return;
  await action(() => api(`/api/projects/${project.app_id}/publish`, {}));
});

els.share.addEventListener("click", async () => {
  const project = selectedProject();
  if (!project) return;
  await action(() => api(`/api/projects/${project.app_id}/share`, {}));
});

document.querySelectorAll(".tabs button").forEach((button) => {
  button.addEventListener("click", () => {
    state.selectedTab = button.dataset.tab;
    renderTabs();
  });
});

async function action(fn, options = {}) {
  if (state.busy) return;
  state.busy = true;
  render();
  let pollTimer;
  try {
    if (options.poll) pollTimer = setInterval(refresh, 1500);
    await fn();
    await refresh();
  } catch (error) {
    els.proposal.classList.remove("empty");
    els.proposal.innerHTML = `<h3>Request failed</h3><p class="muted">${escapeHtml(error.message)}</p>`;
  } finally {
    if (pollTimer) clearInterval(pollTimer);
    state.busy = false;
    render();
  }
}

async function refresh() {
  state.snapshot = await fetch("/api/state").then((res) => res.json());
  if (!state.selectedAppId && state.snapshot.projects[0]) {
    state.selectedAppId = state.snapshot.projects[0].app_id;
  }
  render();
}

async function api(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "request failed");
  return payload;
}

function selectedProject() {
  return state.snapshot.projects.find((project) => project.app_id === state.selectedAppId);
}

function render() {
  const project = selectedProject();
  els.roleButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.role === state.role);
  });
  els.projectCount.textContent = String(state.snapshot.projects.length);
  els.projectList.innerHTML = state.snapshot.projects.map((item) => `
    <button class="project-button ${item.app_id === state.selectedAppId ? "active" : ""}" data-app-id="${escapeHtml(item.app_id)}">
      <span>${escapeHtml(item.name)}</span>
      <small>${escapeHtml(item.status)} · ${escapeHtml(item.current_version_id)}</small>
    </button>
  `).join("") || `<p class="muted">No boards yet.</p>`;
  els.projectList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedAppId = button.dataset.appId;
      render();
    });
  });

  els.shareList.innerHTML = state.snapshot.shares.map((share) => `
    <button class="share-button" data-artifact-id="${escapeHtml(share.artifact_id)}">
      <span>${escapeHtml(share.manifest.app_name)} ${escapeHtml(share.version_id)}</span>
      <small>${escapeHtml(share.artifact_id)}</small>
    </button>
  `).join("") || `<p class="muted">Publish and share a board to create a portable artifact.</p>`;
  els.shareList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => forkArtifact(button.dataset.artifactId));
  });

  if (!project) {
    els.selectedTitle.textContent = "No board selected";
    els.selectedMeta.textContent = "Create a board to start the Builder loop.";
    els.pendingState.textContent = "idle";
    els.proposal.className = "proposal-card empty";
    els.proposal.innerHTML = `<p class="muted">Agent proposals, guardrails, diffs, and approval state appear here.</p>`;
    els.decisions.innerHTML = "";
    setActionDisabled(true);
    renderInspector(undefined);
    return;
  }

  els.selectedTitle.textContent = project.name;
  els.selectedMeta.textContent = `${project.app_id} · ${project.profile_id} · current ${project.current_version_id}${project.active_version_id ? ` · active ${project.active_version_id}` : ""}`;
  els.pendingState.textContent = project.status;
  els.pendingState.className = `status-pill ${project.status.includes("blocked") ? "blocked" : project.pending_evolution ? "pending" : "ready"}`;
  setActionDisabled(state.busy);
  renderProposal(project);
  renderInspector(project);
}

function setActionDisabled(disabled) {
  [els.approve, els.preview, els.publish, els.share, els.agentForm.querySelector("button")].forEach((button) => {
    button.disabled = disabled;
  });
}

function renderProposal(project) {
  const pending = project.pending_evolution;
  if (!pending) {
    els.proposal.className = "proposal-card empty";
    els.proposal.innerHTML = `<p class="muted">No pending proposal. Ask the agent for the next product change.</p>`;
    els.decisions.innerHTML = `<div class="decision">No approval decision is pending.</div>`;
    return;
  }
  els.proposal.className = "proposal-card";
  els.proposal.innerHTML = `
    <h3>${escapeHtml(pending.review_packet.intent_summary)}</h3>
    <p class="muted">${escapeHtml(pending.review_packet.scope_boundary)}</p>
    <div class="badge">${pending.review_packet.risk_classification.map(escapeHtml).join(" · ")}</div>
    <pre>${escapeHtml(pending.proposal.evidence.diff || "No diff")}</pre>
  `;
  els.decisions.innerHTML = pending.decisions.map((decision) => `
    <div class="decision">
      <strong>${escapeHtml(decision.subject)}</strong>
      <span>${escapeHtml(decision.decision)}</span>
      <p class="muted">${new Date(decision.decided_at_ms).toLocaleTimeString()}</p>
    </div>
  `).join("") || `<div class="decision">Reviewer approval required. Builder self-approval will be blocked by governance.</div>`;
}

function renderInspector(project) {
  renderTabs();
  if (!project?.current_version) {
    els.frame.classList.add("hidden");
    els.frameEmpty.classList.remove("hidden");
    els.schema.innerHTML = "";
    els.data.innerHTML = "";
    els.evidence.innerHTML = "";
    els.logs.innerHTML = "";
    return;
  }
  const url = project.preview_url || project.published_url;
  if (url) {
    els.frame.src = url;
    els.frame.classList.remove("hidden");
    els.frameEmpty.classList.add("hidden");
  } else {
    els.frame.classList.add("hidden");
    els.frameEmpty.classList.remove("hidden");
  }

  const definition = project.current_version.definition;
  els.schema.innerHTML = `
    <div class="schema-grid">
      ${definition.modules.map((mod) => `
        <article class="schema-card"><h3>${escapeHtml(mod.title)}</h3><p class="muted">${escapeHtml(mod.kind)} · ${escapeHtml(mod.description)}</p></article>
      `).join("")}
      <article class="schema-card"><h3>Fields</h3><p class="muted">${definition.fields.map((field) => escapeHtml(field.id)).join(", ")}</p></article>
    </div>
  `;
  els.data.innerHTML = `
    <div class="data-list">
      ${project.current_version.items.map((item) => `
        <article class="data-card"><h3>${escapeHtml(item.title)}</h3><p class="muted">${escapeHtml(item.owner)} · ${escapeHtml(item.status)} · ${escapeHtml(item.priority || "no priority")}</p></article>
      `).join("")}
    </div>
  `;
  els.evidence.innerHTML = `
    <div class="evidence-list">
      <article class="evidence-block"><h3>Project</h3><pre>${escapeHtml(JSON.stringify({
        app_id: project.app_id,
        status: project.status,
        current_version_id: project.current_version_id,
        active_version_id: project.active_version_id,
        source_app_id: project.source_app_id,
      }, null, 2))}</pre></article>
      <article class="evidence-block"><h3>Pending review packet</h3><pre>${escapeHtml(JSON.stringify(project.pending_evolution?.review_packet ?? null, null, 2))}</pre></article>
    </div>
  `;
  els.logs.innerHTML = project.agent_logs.map((log) => `
    <div class="log-entry"><strong>${escapeHtml(log.kind)}</strong><div>${escapeHtml(log.text)}</div></div>
  `).join("") || `<p class="muted">No agent events yet.</p>`;
}

function renderTabs() {
  document.querySelectorAll(".tabs button").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === state.selectedTab);
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.id === `tab-${state.selectedTab}`);
  });
}

async function forkArtifact(artifactId) {
  await action(async () => {
    const project = await api("/api/forks", {
      artifact_id: artifactId,
      name: "Charlie's Dev Board",
      builder_subject: "user:charlie",
    });
    state.selectedAppId = project.app_id;
    state.role = "user:charlie";
    els.agentMessage.value = "Add a priority lane and GitHub attention list for my Linux workflow.";
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

refresh();
