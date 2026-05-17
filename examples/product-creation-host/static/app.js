const state = {
  snapshot: { projects: [], shares: [] },
  selectedAppId: null,
  selectedTab: "preview",
  busy: false,
  role: "user:bob",
  lang: preferredLanguage(),
};

const i18n = {
  en: {
    "app.eyebrow": "M47 Product Host Expansion",
    "role.actingAs": "Acting as",
    "role.bob": "Builder: Bob",
    "role.reviewer": "Reviewer",
    "role.charlie": "Builder: Charlie",
    "role.endUser": "End User",
    "create.eyebrow": "Create",
    "create.title": "New board",
    "create.name": "Name",
    "create.goal": "Goal",
    "create.profile": "Profile",
    "create.submit": "Create board",
    "profile.engineering": "Engineering operations",
    "profile.personal": "Personal focus",
    "workspace.eyebrow": "Workspace",
    "workspace.projects": "Projects",
    "share.eyebrow": "Portability",
    "share.title": "Share artifacts",
    "contract.eyebrow": "Alice's contract",
    "contract.title": "Host boundary",
    "selected.eyebrow": "Selected generated app",
    "selected.none": "No board selected",
    "selected.noneMeta": "Create a board to start the Builder loop.",
    "selected.current": "current",
    "selected.active": "active",
    "selected.forkOf": "fork of",
    "action.preview": "Preview",
    "action.publish": "Publish",
    "action.rollback": "Rollback",
    "action.share": "Share",
    "lineage.eyebrow": "External story",
    "lineage.title": "Alice → Bob → Charlie",
    "lineage.empty": "Create and evolve a board to see lineage.",
    "lineage.version": "version",
    "lineage.versions": "versions",
    "lineage.aliceAction": "ships Host contract",
    "lineage.bobCreates": "creates and evolves",
    "lineage.charlieForks": "forks and evolves",
    "lineage.endUsers": "End users",
    "lineage.waiting": "waiting for publish",
    "lineage.open": "open",
    "lineage.noRelease": "No active release yet.",
    "conversation.eyebrow": "Builder conversation",
    "conversation.title": "Ask the agent",
    "conversation.ask": "Ask agent",
    "proposal.empty": "Agent proposals, guardrails, diffs, and approval state appear here.",
    "proposal.none": "No pending proposal. Ask the agent for the next product change.",
    "proposal.changedFiles": "Changed files",
    "proposal.requiredApproval": "Required approval",
    "proposal.dataPolicy": "Data policy",
    "proposal.noDiff": "No diff",
    "proposal.noneValue": "none",
    "proposal.rehearsal": "preview rehearsal before publish",
    "governance.eyebrow": "Governance",
    "governance.title": "Approval route",
    "governance.approve": "Approve as current role",
    "governance.none": "No approval decision is pending.",
    "governance.required": "Reviewer approval required. Builder self-approval will be blocked by governance.",
    "tab.preview": "Preview",
    "tab.schema": "Schema",
    "tab.data": "Data",
    "tab.evidence": "Evidence",
    "tab.versions": "Versions",
    "tab.logs": "Agent log",
    "preview.empty": "Preview or publish a board to inspect the generated app here.",
    "contract.loading": "Developer contract will appear after refresh.",
    "contract.frameworkOwns": "Framework owns",
    "contract.hostOwns": "Host owns",
    "schema.fields": "Fields",
    "data.noPriority": "no priority",
    "evidence.project": "Project",
    "evidence.pendingReviewPacket": "Pending review packet",
    "evidence.developerBoundary": "Developer boundary",
    "versions.items": "items",
    "versions.current": "current",
    "versions.active": "active",
    "logs.empty": "No agent events yet.",
    "error.requestFailed": "Request failed",
    "defaults.boardName": "Engineering Dev Board",
    "defaults.goal": "Track release work, review queues, and GitHub attention in one daily board.",
    "defaults.agentMessage": "Add a review queue so items can be marked needs_review and approved.",
    "defaults.forkName": "Charlie's Dev Board",
    "defaults.forkAgentMessage": "Add a priority lane and GitHub attention list for my Linux workflow.",
  },
  zh: {
    "app.eyebrow": "M47 产品型 Host 扩展",
    "role.actingAs": "当前身份",
    "role.bob": "Builder：Bob",
    "role.reviewer": "Reviewer",
    "role.charlie": "Builder：Charlie",
    "role.endUser": "End User",
    "create.eyebrow": "创建",
    "create.title": "新看板",
    "create.name": "名称",
    "create.goal": "目标",
    "create.profile": "配置",
    "create.submit": "创建看板",
    "profile.engineering": "工程协作",
    "profile.personal": "个人专注",
    "workspace.eyebrow": "工作区",
    "workspace.projects": "项目",
    "share.eyebrow": "可迁移性",
    "share.title": "分享制品",
    "contract.eyebrow": "Alice 的契约",
    "contract.title": "Host 边界",
    "selected.eyebrow": "当前 Generated App",
    "selected.none": "未选择看板",
    "selected.noneMeta": "创建一个看板来开始 Builder 流程。",
    "selected.current": "当前版本",
    "selected.active": "线上版本",
    "selected.forkOf": "fork 自",
    "action.preview": "预览",
    "action.publish": "发布",
    "action.rollback": "回滚",
    "action.share": "分享",
    "lineage.eyebrow": "外部故事",
    "lineage.title": "Alice → Bob → Charlie",
    "lineage.empty": "创建并演进看板后，这里会展示 lineage。",
    "lineage.version": "个版本",
    "lineage.versions": "个版本",
    "lineage.aliceAction": "交付 Host 契约",
    "lineage.bobCreates": "创建并演进",
    "lineage.charlieForks": "fork 并演进",
    "lineage.endUsers": "End users",
    "lineage.waiting": "等待发布",
    "lineage.open": "打开",
    "lineage.noRelease": "还没有线上版本。",
    "conversation.eyebrow": "Builder 对话",
    "conversation.title": "询问 agent",
    "conversation.ask": "询问 agent",
    "proposal.empty": "Agent proposal、guardrails、diff 和审批状态会显示在这里。",
    "proposal.none": "还没有待处理 proposal。可以让 agent 提出下一次产品变更。",
    "proposal.changedFiles": "修改文件",
    "proposal.requiredApproval": "所需审批",
    "proposal.dataPolicy": "数据策略",
    "proposal.noDiff": "没有 diff",
    "proposal.noneValue": "无",
    "proposal.rehearsal": "发布前 preview rehearsal",
    "governance.eyebrow": "治理",
    "governance.title": "审批路线",
    "governance.approve": "以当前身份审批",
    "governance.none": "当前没有待处理审批。",
    "governance.required": "需要 reviewer 审批。Builder 自己审批会被治理规则拦住。",
    "tab.preview": "预览",
    "tab.schema": "Schema",
    "tab.data": "数据",
    "tab.evidence": "证据",
    "tab.versions": "版本",
    "tab.logs": "Agent 日志",
    "preview.empty": "预览或发布看板后，可以在这里检查生成应用。",
    "contract.loading": "刷新后会显示 Developer contract。",
    "contract.frameworkOwns": "Framework 负责",
    "contract.hostOwns": "Host 负责",
    "schema.fields": "字段",
    "data.noPriority": "无优先级",
    "evidence.project": "项目",
    "evidence.pendingReviewPacket": "待处理 review packet",
    "evidence.developerBoundary": "Developer 边界",
    "versions.items": "条数据",
    "versions.current": "当前",
    "versions.active": "线上",
    "logs.empty": "还没有 agent 事件。",
    "error.requestFailed": "请求失败",
    "defaults.boardName": "工程开发看板",
    "defaults.goal": "在一个日常看板中跟踪发布工作、评审队列和 GitHub 关注项。",
    "defaults.agentMessage": "添加一个 review queue，让事项可以标记为 needs_review 并被 approved。",
    "defaults.forkName": "Charlie 的开发看板",
    "defaults.forkAgentMessage": "为我的 Linux 工作流添加 priority lane 和 GitHub attention list。",
  },
};

const els = {
  langButtons: Array.from(document.querySelectorAll("#language-switcher button")),
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
  rollback: document.querySelector("#rollback-button"),
  share: document.querySelector("#share-button"),
  shareList: document.querySelector("#share-list"),
  developerContract: document.querySelector("#developer-contract"),
  lineageState: document.querySelector("#lineage-state"),
  lineage: document.querySelector("#lineage-map"),
  decisions: document.querySelector("#decision-feed"),
  frame: document.querySelector("#preview-frame"),
  frameEmpty: document.querySelector("#preview-empty"),
  schema: document.querySelector("#tab-schema"),
  data: document.querySelector("#tab-data"),
  evidence: document.querySelector("#tab-evidence"),
  versions: document.querySelector("#tab-versions"),
  logs: document.querySelector("#agent-log"),
};

function preferredLanguage() {
  const params = new URLSearchParams(window.location.search);
  const forced = params.get("lang");
  if (forced === "en" || forced === "zh") return forced;
  const saved = localStorage.getItem("pneuma.product-host.lang");
  if (saved === "en" || saved === "zh") return saved;
  const languages = navigator.languages?.length ? navigator.languages : [navigator.language];
  return languages.some((language) => language?.toLowerCase().startsWith("zh")) ? "zh" : "en";
}

els.langButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.lang = button.dataset.lang;
    localStorage.setItem("pneuma.product-host.lang", state.lang);
    applyStaticTranslations();
    render();
  });
});

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

els.rollback.addEventListener("click", async () => {
  const project = selectedProject();
  if (!project) return;
  await action(() => api(`/api/projects/${project.app_id}/rollback`, {}));
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
    els.proposal.innerHTML = `<h3>${escapeHtml(t("error.requestFailed"))}</h3><p class="muted">${escapeHtml(error.message)}</p>`;
  } finally {
    if (pollTimer) clearInterval(pollTimer);
    state.busy = false;
    render();
  }
}

function t(key) {
  return i18n[state.lang]?.[key] || i18n.en[key] || key;
}

function applyStaticTranslations() {
  document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
  els.langButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.lang === state.lang);
  });
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  syncDefaultValue("[name='name']", "defaults.boardName");
  syncDefaultValue("[name='goal']", "defaults.goal");
  syncDefaultValue("#agent-message", "defaults.agentMessage");
}

function syncDefaultValue(selector, key) {
  const input = document.querySelector(selector);
  if (!input) return;
  const values = Object.values(i18n).map((dict) => dict[key]).filter(Boolean);
  if (!input.value || values.includes(input.value)) input.value = t(key);
}

function statusLabel(status) {
  const zh = {
    draft: "草稿",
    previewing: "预览中",
    published: "已发布",
    idle: "空闲",
    awaiting_reviewer_approval: "等待 reviewer 审批",
    ready_to_preview: "可预览",
    blocked: "已阻止",
    todo: "待办",
    doing: "进行中",
    needs_review: "待评审",
    approved: "已批准",
    denied: "已拒绝",
  };
  return state.lang === "zh" ? zh[status] || status : status;
}

function localizedFrameUrl(url) {
  const next = new URL(url, window.location.origin);
  next.searchParams.set("lang", state.lang);
  return next.pathname + next.search;
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
  applyStaticTranslations();
  els.roleButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.role === state.role);
  });
  els.projectCount.textContent = String(state.snapshot.projects.length);
  renderDeveloperContract();
  els.projectList.innerHTML = state.snapshot.projects.map((item) => `
    <button class="project-button ${item.app_id === state.selectedAppId ? "active" : ""}" data-app-id="${escapeHtml(item.app_id)}">
      <span>${escapeHtml(item.name)}</span>
      <small>${escapeHtml(statusLabel(item.status))} · ${escapeHtml(item.current_version_id)}</small>
    </button>
  `).join("") || `<p class="muted">${escapeHtml(state.lang === "zh" ? "还没有看板。" : "No boards yet.")}</p>`;
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
  `).join("") || `<p class="muted">${escapeHtml(state.lang === "zh" ? "发布并分享看板后，会生成 portable artifact。" : "Publish and share a board to create a portable artifact.")}</p>`;
  els.shareList.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => forkArtifact(button.dataset.artifactId));
  });

  if (!project) {
    els.selectedTitle.textContent = t("selected.none");
    els.selectedMeta.textContent = t("selected.noneMeta");
    els.pendingState.textContent = statusLabel("idle");
    els.proposal.className = "proposal-card empty";
    els.proposal.innerHTML = `<p class="muted">${escapeHtml(t("proposal.empty"))}</p>`;
    els.decisions.innerHTML = "";
    els.lineageState.textContent = state.lang === "zh" ? `0 ${t("lineage.versions")}` : `0 ${t("lineage.versions")}`;
    els.lineage.innerHTML = `<p class="muted">${escapeHtml(t("lineage.empty"))}</p>`;
    setActionDisabled(true);
    renderInspector(undefined);
    return;
  }

  els.selectedTitle.textContent = project.name;
  els.selectedMeta.textContent = `${project.app_id} · ${project.profile_id} · ${t("selected.current")} ${project.current_version_id}${project.active_version_id ? ` · ${t("selected.active")} ${project.active_version_id}` : ""}${project.source_app_id ? ` · ${t("selected.forkOf")} ${project.source_app_id}` : ""}`;
  els.pendingState.textContent = statusLabel(project.status);
  els.pendingState.className = `status-pill ${project.status.includes("blocked") ? "blocked" : project.pending_evolution ? "pending" : "ready"}`;
  setActionDisabled(state.busy);
  renderLineage(project);
  renderProposal(project);
  renderInspector(project);
}

function setActionDisabled(disabled) {
  [els.approve, els.preview, els.publish, els.rollback, els.share, els.agentForm.querySelector("button")].forEach((button) => {
    button.disabled = disabled;
  });
}

function renderDeveloperContract() {
  const contract = state.snapshot.developer_contract;
  if (!contract) {
    els.developerContract.innerHTML = `<p class="muted">${escapeHtml(t("contract.loading"))}</p>`;
    return;
  }
  els.developerContract.innerHTML = `
    <div class="contract-row">
      <strong>${escapeHtml(contract.developer)}</strong>
      <span>${escapeHtml(contract.stack_profile)}</span>
    </div>
    <details open>
      <summary>${escapeHtml(t("contract.frameworkOwns"))}</summary>
      <ul>${contract.framework_owned.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </details>
    <details>
      <summary>${escapeHtml(t("contract.hostOwns"))}</summary>
      <ul>${contract.host_owned.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
    </details>
  `;
}

function renderLineage(project) {
  const versions = project.versions || [];
  els.lineageState.textContent = state.lang === "zh"
    ? `${versions.length} ${t(versions.length === 1 ? "lineage.version" : "lineage.versions")}`
    : `${versions.length} ${t(versions.length === 1 ? "lineage.version" : "lineage.versions")}`;
  const builder = project.builder_subject === "user:charlie" ? "Charlie" : "Bob";
  els.lineage.innerHTML = `
    <article class="lineage-card">
      <span>Alice</span>
      <strong>${escapeHtml(t("lineage.aliceAction"))}</strong>
      <p class="muted">${escapeHtml(state.snapshot.developer_contract?.generated_app_boundary ?? "framework-governed host boundary")}</p>
    </article>
    <article class="lineage-card">
      <span>${escapeHtml(builder)}</span>
      <strong>${escapeHtml(project.source_app_id ? t("lineage.charlieForks") : t("lineage.bobCreates"))}</strong>
      <p class="muted">${escapeHtml(project.goal)}</p>
    </article>
    <article class="lineage-card">
      <span>${escapeHtml(t("lineage.endUsers"))}</span>
      <strong>${escapeHtml(project.active_version_id ? `${t("lineage.open")} ${project.active_version_id}` : t("lineage.waiting"))}</strong>
      <p class="muted">${project.published_url ? escapeHtml(project.published_url) : escapeHtml(t("lineage.noRelease"))}</p>
    </article>
  `;
}

function renderProposal(project) {
  const pending = project.pending_evolution;
  if (!pending) {
    els.proposal.className = "proposal-card empty";
    els.proposal.innerHTML = `<p class="muted">${escapeHtml(t("proposal.none"))}</p>`;
    els.decisions.innerHTML = `<div class="decision">${escapeHtml(t("governance.none"))}</div>`;
    return;
  }
  els.proposal.className = "proposal-card";
  els.proposal.innerHTML = `
    <h3>${escapeHtml(pending.review_packet.intent_summary)}</h3>
    <p class="muted">${escapeHtml(pending.review_packet.scope_boundary)}</p>
    <div class="badge">${pending.review_packet.risk_classification.map(escapeHtml).join(" · ")}</div>
    <div class="proposal-grid">
      <div><strong>${escapeHtml(t("proposal.changedFiles"))}</strong><p class="muted">${pending.proposal.evidence.changed_files.map(escapeHtml).join(", ") || escapeHtml(t("proposal.noneValue"))}</p></div>
      <div><strong>${escapeHtml(t("proposal.requiredApproval"))}</strong><p class="muted">${pending.review_packet.required_approvals?.map((item) => escapeHtml(item.role)).join(", ") || "reviewer"}</p></div>
      <div><strong>${escapeHtml(t("proposal.dataPolicy"))}</strong><p class="muted">${escapeHtml(pending.data_receipt?.policy || t("proposal.rehearsal"))}</p></div>
    </div>
    <pre>${escapeHtml(pending.proposal.evidence.diff || t("proposal.noDiff"))}</pre>
  `;
  els.decisions.innerHTML = pending.decisions.map((decision) => `
    <div class="decision">
      <strong>${escapeHtml(decision.subject)}</strong>
      <span>${escapeHtml(statusLabel(decision.decision))}</span>
      <p class="muted">${new Date(decision.decided_at_ms).toLocaleTimeString()}</p>
    </div>
  `).join("") || `<div class="decision">${escapeHtml(t("governance.required"))}</div>`;
}

function renderInspector(project) {
  renderTabs();
  if (!project?.current_version) {
    els.frame.classList.add("hidden");
    els.frameEmpty.classList.remove("hidden");
    els.schema.innerHTML = "";
    els.data.innerHTML = "";
    els.evidence.innerHTML = "";
    els.versions.innerHTML = "";
    els.logs.innerHTML = "";
    return;
  }
  const url = project.status === "published"
    ? project.published_url || project.preview_url
    : project.preview_url || project.published_url;
  if (url) {
    els.frame.src = localizedFrameUrl(url);
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
      <article class="schema-card"><h3>${escapeHtml(t("schema.fields"))}</h3><p class="muted">${definition.fields.map((field) => escapeHtml(field.id)).join(", ")}</p></article>
    </div>
  `;
  els.data.innerHTML = `
    <div class="data-list">
      ${project.current_version.items.map((item) => `
        <article class="data-card">
          <h3>${escapeHtml(item.title)}</h3>
          <p class="muted">${escapeHtml(item.owner)} · ${escapeHtml(statusLabel(item.status))} · ${escapeHtml(item.priority || t("data.noPriority"))}${item.url ? ` · ${escapeHtml(item.url)}` : ""}</p>
        </article>
      `).join("")}
    </div>
  `;
  els.evidence.innerHTML = `
    <div class="evidence-list">
      <article class="evidence-block"><h3>${escapeHtml(t("evidence.project"))}</h3><pre>${escapeHtml(JSON.stringify({
        app_id: project.app_id,
        status: project.status,
        current_version_id: project.current_version_id,
        active_version_id: project.active_version_id,
        source_app_id: project.source_app_id,
      }, null, 2))}</pre></article>
      <article class="evidence-block"><h3>${escapeHtml(t("evidence.pendingReviewPacket"))}</h3><pre>${escapeHtml(JSON.stringify(project.pending_evolution?.review_packet ?? null, null, 2))}</pre></article>
      <article class="evidence-block"><h3>${escapeHtml(t("evidence.developerBoundary"))}</h3><pre>${escapeHtml(JSON.stringify(state.snapshot.developer_contract, null, 2))}</pre></article>
    </div>
  `;
  els.versions.innerHTML = `
    <div class="version-list">
      ${(project.versions || []).map((version) => `
        <article class="version-card ${version.version_id === project.active_version_id ? "active" : ""}">
          <div>
            <h3>${escapeHtml(version.version_id)}${version.version_id === project.current_version_id ? ` · ${escapeHtml(t("versions.current"))}` : ""}${version.version_id === project.active_version_id ? ` · ${escapeHtml(t("versions.active"))}` : ""}</h3>
            <p class="muted">${escapeHtml(version.definition.modules.map((mod) => mod.kind).join(", "))}</p>
          </div>
          <span class="badge">${version.items.length} ${escapeHtml(t("versions.items"))}</span>
        </article>
      `).join("")}
    </div>
  `;
  els.logs.innerHTML = project.agent_logs.map((log) => `
    <div class="log-entry"><strong>${escapeHtml(log.kind)}</strong><div>${escapeHtml(log.text)}</div></div>
  `).join("") || `<p class="muted">${escapeHtml(t("logs.empty"))}</p>`;
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
      name: t("defaults.forkName"),
      builder_subject: "user:charlie",
    });
    state.selectedAppId = project.app_id;
    state.role = "user:charlie";
    els.agentMessage.value = t("defaults.forkAgentMessage");
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
