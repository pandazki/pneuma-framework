const state = {
  snapshot: { projects: [], shares: [] },
  selectedAppId: null,
  busy: false,
  role: "user:bob",
  lang: preferredLanguage(),
  lastError: null,
  createDisclosureInitialized: false,
};

const i18n = {
  en: {
    "app.eyebrow": "Product Creation Host",
    "app.subtitle": "A builder workbench for creating and publishing real Dev Board apps.",
    "role.actingAs": "Acting as",
    "role.builder": "Builder",
    "role.forkingBuilder": "Forking Builder",
    "role.endUser": "End User",
    "appPane.eyebrow": "Generated Application",
    "appPane.title": "App surface",
    "project.switcher": "Project",
    "create.summary": "Create a new generated app",
    "create.name": "Name",
    "create.goal": "Goal",
    "create.profile": "Profile",
    "create.submit": "Create app",
    "profile.engineering": "Engineering operations",
    "profile.personal": "Personal focus",
    "empty.eyebrow": "No app selected",
    "empty.title": "Start by creating a Dev Board.",
    "empty.body": "The app itself lives here as a product surface. Builder conversation and approvals stay on the right.",
    "context.summary": "Story context and framework evidence",
    "builder.eyebrow": "Builder Workbench",
    "builder.title": "Conversation with agent",
    "composer.label": "Ask for a product change",
    "composer.submit": "Ask agent",
    "project.none": "No generated app yet",
    "selected.current": "current",
    "selected.active": "published",
    "selected.preview": "preview",
    "selected.forkOf": "fork of",
    "status.draft": "draft",
    "status.awaiting_builder_confirmation": "awaiting builder confirmation",
    "status.awaiting_reviewer_approval": "awaiting builder confirmation",
    "status.blocked": "blocked",
    "status.ready_to_preview": "ready to preview",
    "status.previewing": "previewing",
    "status.published": "published",
    "status.forked": "forked",
    "status.idle": "idle",
    "status.todo": "todo",
    "status.doing": "doing",
    "status.needs_review": "needs_review",
    "status.approved": "approved",
    "status.denied": "denied",
    "status.completed": "completed",
    "link.preview": "Open preview",
    "link.published": "Open published app",
    "link.unavailable": "Not available yet",
    "stat.current": "Current version",
    "stat.published": "Published version",
    "stat.items": "Items",
    "app.modules": "App modules",
    "app.data": "Demo data",
    "app.inspect": "Inspect schema, evidence, and logs",
    "app.schema": "Schema",
    "app.evidence": "Evidence",
    "app.versions": "Versions",
    "app.logs": "Agent log",
    "app.noPriority": "no priority",
    "thread.welcomeLabel": "System",
    "thread.welcomeTitle": "Builder and app are separate.",
    "thread.welcomeBody": "Create or select a Generated Application on the left. Use this conversation to ask the build agent for changes, review the proposal, confirm it, then open preview or published app in a separate page.",
    "thread.stateLabel": "Workspace state",
    "thread.stateBody": "The selected app is {status}. Current version is {current}. Published version is {active}.",
    "thread.intentLabel": "Original request",
    "thread.agentLabel": "Agent proposal",
    "thread.confirmLabel": "Agent interpretation",
    "thread.confirmTitle": "Confirm the intent before apply",
    "thread.confirmBody": "I interpreted the fuzzy request as: {summary}. I will not publish yet; I will only prepare a source/data change and wait for Builder confirmation.",
    "thread.proposalLabel": "Precise proposal",
    "thread.noProposalTitle": "No pending proposal.",
    "thread.noProposalBody": "Ask the agent for the next product change. The original request, interpretation, proposal, highlights, and confirmation control will appear in this conversation.",
    "thread.actionsLabel": "Next actions",
    "thread.actionsTitle": "Lifecycle controls",
    "thread.actionsBody": "These operate on the selected Generated Application. Preview and published app open as separate pages.",
    "thread.logs": "Agent stream and tool log",
    "thread.noLogs": "No agent events yet.",
    "proposal.changedFiles": "Changed files",
    "proposal.requiredApproval": "Required confirmation",
    "proposal.dataPolicy": "Data policy",
    "proposal.diff": "Diff",
    "proposal.highlights": "Key highlights",
    "proposal.none": "none",
    "proposal.defaultApproval": "builder",
    "proposal.approve": "Confirm and apply",
    "proposal.decision": "Confirmation",
    "proposal.noDecision": "Builder confirmation is required before apply.",
    "proposal.applied": "Applied. Open preview next and publish only after checking the result.",
    "highlight.reviewModule": "Adds a Review queue module.",
    "highlight.reviewField": "Adds a review_status field so items can move through needs_review and approved.",
    "highlight.githubModule": "Adds a GitHub attention module.",
    "highlight.githubField": "Adds URL links for issue/PR attention.",
    "highlight.priorityModule": "Adds a Priority lane.",
    "highlight.priorityField": "Carries P1/P2/P3 priority into visible data.",
    "highlight.dataReceipt": "Rehearses data carry-forward before publish.",
    "action.preview": "Start preview",
    "action.publish": "Publish",
    "action.rollback": "Rollback",
    "action.share": "Create share artifact",
    "context.storyTitle": "Why this exists",
    "context.storyBody": "Alice is the Developer who built this Creation Host. A Builder uses it to create a Generated App. End Users only open the Published App.",
    "context.contract": "Framework / Host contract",
    "context.artifacts": "Share artifacts",
    "context.noArtifacts": "Publish and share an app to create a portable artifact.",
    "context.fork": "Fork as Forking Builder",
    "contract.frameworkOwns": "Framework owns",
    "contract.hostOwns": "Host owns",
    "contract.promises": "Builder-visible promises",
    "error.requestFailed": "Request failed",
    "defaults.boardName": "Engineering Dev Board",
    "defaults.goal": "Track release work, review queues, and GitHub attention in one daily board.",
    "defaults.agentMessage": "Add a review queue so items can be marked needs_review and approved.",
    "defaults.forkName": "Forked Dev Board",
    "defaults.forkAgentMessage": "Add a priority lane and GitHub attention list for my workflow.",
  },
  zh: {
    "app.eyebrow": "产品型 Creation Host",
    "app.subtitle": "用于创建、演进并发布真实 Dev Board 应用的 Builder 工作台。",
    "role.actingAs": "当前身份",
    "role.builder": "Builder",
    "role.forkingBuilder": "Fork Builder",
    "role.endUser": "End User",
    "appPane.eyebrow": "Generated Application",
    "appPane.title": "应用界面",
    "project.switcher": "项目",
    "create.summary": "创建新的 Generated App",
    "create.name": "名称",
    "create.goal": "目标",
    "create.profile": "配置",
    "create.submit": "创建应用",
    "profile.engineering": "工程协作",
    "profile.personal": "个人专注",
    "empty.eyebrow": "未选择应用",
    "empty.title": "先创建一个 Dev Board。",
    "empty.body": "App 自身显示在这里。Builder 对话、确认和构建操作都放在右侧。",
    "context.summary": "故事上下文与框架证据",
    "builder.eyebrow": "Builder Workbench",
    "builder.title": "与 agent 对话",
    "composer.label": "提出一个产品变更",
    "composer.submit": "询问 agent",
    "project.none": "还没有 Generated App",
    "selected.current": "当前版本",
    "selected.active": "线上版本",
    "selected.preview": "预览",
    "selected.forkOf": "fork 自",
    "status.draft": "草稿",
    "status.awaiting_builder_confirmation": "等待 Builder 确认",
    "status.awaiting_reviewer_approval": "等待 Builder 确认",
    "status.blocked": "已阻止",
    "status.ready_to_preview": "可预览",
    "status.previewing": "预览中",
    "status.published": "已发布",
    "status.forked": "已 fork",
    "status.idle": "空闲",
    "status.todo": "待办",
    "status.doing": "进行中",
    "status.needs_review": "待评审",
    "status.approved": "已批准",
    "status.denied": "已拒绝",
    "status.completed": "已完成",
    "link.preview": "打开预览",
    "link.published": "打开线上应用",
    "link.unavailable": "暂不可用",
    "stat.current": "当前版本",
    "stat.published": "线上版本",
    "stat.items": "数据项",
    "app.modules": "应用模块",
    "app.data": "演示数据",
    "app.inspect": "检查 schema、证据与日志",
    "app.schema": "Schema",
    "app.evidence": "证据",
    "app.versions": "版本",
    "app.logs": "Agent 日志",
    "app.noPriority": "无优先级",
    "thread.welcomeLabel": "系统",
    "thread.welcomeTitle": "Builder 和 App 是分开的。",
    "thread.welcomeBody": "在左侧创建或选择一个 Generated Application。右侧用来向 build agent 提需求、查看 proposal、完成确认，再把预览或线上应用作为独立页面打开。",
    "thread.stateLabel": "工作区状态",
    "thread.stateBody": "当前应用状态是 {status}。当前版本是 {current}。线上版本是 {active}。",
    "thread.intentLabel": "原始需求",
    "thread.agentLabel": "Agent proposal",
    "thread.confirmLabel": "Agent 理解",
    "thread.confirmTitle": "执行前先确认意图",
    "thread.confirmBody": "我把这个模糊需求理解为：{summary}。我不会直接发布，只会准备 source/data 变更，并等待 Builder 确认。",
    "thread.proposalLabel": "准确 proposal",
    "thread.noProposalTitle": "当前没有待处理 proposal。",
    "thread.noProposalBody": "向 agent 提出下一次产品变更后，原始需求、agent 理解、proposal、重点改动和确认控件会直接出现在这条对话流里。",
    "thread.actionsLabel": "下一步操作",
    "thread.actionsTitle": "生命周期控制",
    "thread.actionsBody": "这些操作作用于当前 Generated Application。预览和线上应用都会以独立页面打开。",
    "thread.logs": "Agent 流式输出与工具日志",
    "thread.noLogs": "还没有 agent 事件。",
    "proposal.changedFiles": "修改文件",
    "proposal.requiredApproval": "所需确认",
    "proposal.dataPolicy": "数据策略",
    "proposal.diff": "Diff",
    "proposal.highlights": "重点改动",
    "proposal.none": "无",
    "proposal.defaultApproval": "builder",
    "proposal.approve": "确认并执行",
    "proposal.decision": "确认记录",
    "proposal.noDecision": "应用前需要 Builder 确认。",
    "proposal.applied": "已执行。下一步打开预览检查效果，确认后再发布。",
    "highlight.reviewModule": "新增 Review queue 模块。",
    "highlight.reviewField": "新增 review_status 字段，让事项可以进入 needs_review 和 approved。",
    "highlight.githubModule": "新增 GitHub attention 模块。",
    "highlight.githubField": "为 issue/PR 关注项增加 URL 链接。",
    "highlight.priorityModule": "新增 Priority lane。",
    "highlight.priorityField": "把 P1/P2/P3 优先级变成可见数据。",
    "highlight.dataReceipt": "发布前先 rehearsal 数据 carry-forward。",
    "action.preview": "启动预览",
    "action.publish": "发布",
    "action.rollback": "回滚",
    "action.share": "生成分享制品",
    "context.storyTitle": "为什么有这个界面",
    "context.storyBody": "Alice 是构建这个 Creation Host 的 Developer。Builder 在这里创建 Generated App。End User 只打开 Published App 使用。",
    "context.contract": "Framework / Host 契约",
    "context.artifacts": "分享制品",
    "context.noArtifacts": "发布并分享应用后，会生成 portable artifact。",
    "context.fork": "以 Fork Builder 身份 fork",
    "contract.frameworkOwns": "Framework 负责",
    "contract.hostOwns": "Host 负责",
    "contract.promises": "Builder 可感知承诺",
    "error.requestFailed": "请求失败",
    "defaults.boardName": "工程开发看板",
    "defaults.goal": "在一个日常看板中跟踪发布工作、评审队列和 GitHub 关注项。",
    "defaults.agentMessage": "添加一个 review queue，让事项可以标记为 needs_review 并被 approved。",
    "defaults.forkName": "Fork 后的开发看板",
    "defaults.forkAgentMessage": "为我的工作流添加 priority lane 和 GitHub attention list。",
  },
};

const els = {
  langButtons: Array.from(document.querySelectorAll("#language-switcher button")),
  roleSelect: document.querySelector("#role-select"),
  createDisclosure: document.querySelector("#create-disclosure"),
  createForm: document.querySelector("#create-form"),
  projectSelect: document.querySelector("#project-select"),
  appSurface: document.querySelector("#app-surface"),
  contextPanel: document.querySelector("#context-panel"),
  pendingState: document.querySelector("#pending-state"),
  threadFeed: document.querySelector("#thread-feed"),
  agentForm: document.querySelector("#agent-form"),
  agentMessage: document.querySelector("#agent-message"),
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

els.roleSelect.addEventListener("change", () => {
  state.role = els.roleSelect.value;
  render();
});

els.projectSelect.addEventListener("change", () => {
  state.selectedAppId = els.projectSelect.value || null;
  const project = selectedProject();
  if (project && state.role !== "user:end-user") state.role = project.builder_subject;
  render();
});

els.createForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = new FormData(els.createForm);
  await action(async () => {
    const project = await api("/api/projects", {
      name: form.get("name"),
      goal: form.get("goal"),
      template_id: form.get("template_id"),
      builder_subject: state.role === "user:charlie" ? "user:charlie" : "user:bob",
    });
    state.selectedAppId = project.app_id;
    els.createDisclosure.open = false;
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

els.threadFeed.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-action]");
  if (!button || button.classList.contains("disabled")) return;
  const project = selectedProject();
  if (!project) return;
  const actionName = button.dataset.action;
  if (actionName === "approve") {
    await action(() => api(`/api/projects/${project.app_id}/evolution/approve`, { subject: state.role }));
  } else if (actionName === "preview") {
    await action(() => api(`/api/projects/${project.app_id}/preview/start`, {}));
  } else if (actionName === "publish") {
    await action(() => api(`/api/projects/${project.app_id}/publish`, {}));
  } else if (actionName === "rollback") {
    await action(() => api(`/api/projects/${project.app_id}/rollback`, {}));
  } else if (actionName === "share") {
    await action(() => api(`/api/projects/${project.app_id}/share`, {}));
  }
});

async function action(fn, options = {}) {
  if (state.busy) return;
  state.busy = true;
  state.lastError = null;
  render();
  let pollTimer;
  try {
    if (options.poll) pollTimer = setInterval(refresh, 1500);
    await fn();
    await refresh();
  } catch (error) {
    state.lastError = error instanceof Error ? error.message : String(error);
  } finally {
    if (pollTimer) clearInterval(pollTimer);
    state.busy = false;
    render();
  }
}

async function refresh() {
  state.snapshot = await fetch("/api/state", { cache: "no-store" }).then((res) => res.json());
  if (!state.selectedAppId && state.snapshot.projects[0]) {
    state.selectedAppId = state.snapshot.projects[0].app_id;
  }
  if (state.selectedAppId && !state.snapshot.projects.some((project) => project.app_id === state.selectedAppId)) {
    state.selectedAppId = state.snapshot.projects[0]?.app_id ?? null;
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

function selectedProject() {
  return state.snapshot.projects.find((project) => project.app_id === state.selectedAppId);
}

function render() {
  applyStaticTranslations();
  els.roleSelect.value = state.role;
  const project = selectedProject();
  if (!state.createDisclosureInitialized) {
    els.createDisclosure.open = state.snapshot.projects.length === 0;
    state.createDisclosureInitialized = true;
  }
  renderProjectSelect();
  renderAppSurface(project);
  renderContext(project);
  renderThread(project);
  setBusyState();
}

function renderProjectSelect() {
  const projects = state.snapshot.projects;
  if (!projects.length) {
    els.projectSelect.innerHTML = `<option value="">${escapeHtml(t("project.none"))}</option>`;
    els.projectSelect.disabled = true;
    return;
  }
  els.projectSelect.disabled = false;
  els.projectSelect.innerHTML = projects.map((project) => {
    const label = `${project.name} · ${statusLabel(project.status)} · ${project.current_version_id}`;
    return `<option value="${escapeHtml(project.app_id)}">${escapeHtml(label)}</option>`;
  }).join("");
  els.projectSelect.value = state.selectedAppId || projects[0].app_id;
}

function renderAppSurface(project) {
  if (!project?.current_version) {
    els.appSurface.className = "app-surface empty";
    els.appSurface.innerHTML = `
      <div class="empty-state">
        <p class="eyebrow">${escapeHtml(t("empty.eyebrow"))}</p>
        <h3>${escapeHtml(t("empty.title"))}</h3>
        <p>${escapeHtml(t("empty.body"))}</p>
      </div>
    `;
    return;
  }

  els.appSurface.className = "app-surface";
  const version = project.current_version;
  const previewHref = project.preview_url ? localizedUrl(project.preview_url) : "";
  const publishedHref = project.published_url ? localizedUrl(project.published_url) : "";
  els.appSurface.innerHTML = `
    <div class="app-hero">
      <div class="app-hero-top">
        <div>
          <p class="eyebrow">${escapeHtml(project.profile_id)}</p>
          <h3 class="app-title">${escapeHtml(project.name)}</h3>
          <p class="app-meta">${escapeHtml(project.goal)}</p>
        </div>
        <div class="open-actions">
          ${externalLink(previewHref, t("link.preview"), Boolean(previewHref))}
          ${externalLink(publishedHref, t("link.published"), Boolean(publishedHref), true)}
        </div>
      </div>
      <div class="app-stats">
        <div class="stat"><span>${escapeHtml(t("stat.current"))}</span><strong>${escapeHtml(project.current_version_id)}</strong></div>
        <div class="stat"><span>${escapeHtml(t("stat.published"))}</span><strong>${escapeHtml(project.active_version_id || t("link.unavailable"))}</strong></div>
        <div class="stat"><span>${escapeHtml(t("stat.items"))}</span><strong>${escapeHtml(String(version.items.length))}</strong></div>
      </div>
    </div>
    <section class="app-section">
      <div class="section-heading">
        <h3>${escapeHtml(t("app.modules"))}</h3>
        <span class="badge ${project.status === "published" ? "ok" : project.pending_evolution ? "warn" : ""}">${escapeHtml(statusLabel(project.status))}</span>
      </div>
      <div class="module-grid">
        ${version.definition.modules.map((mod) => `
          <article class="module-card">
            <h4>${escapeHtml(mod.title)}</h4>
            <p>${escapeHtml(mod.kind)} · ${escapeHtml(mod.description)}</p>
          </article>
        `).join("")}
      </div>
    </section>
    <section class="app-section">
      <div class="section-heading">
        <h3>${escapeHtml(t("app.data"))}</h3>
        <span class="badge">${escapeHtml(version.version_id)}</span>
      </div>
      <div class="data-list">
        ${version.items.map((item) => renderDataRow(item)).join("")}
      </div>
    </section>
    <details class="inspect-details">
      <summary>${escapeHtml(t("app.inspect"))}</summary>
      <div class="inspect-grid">
        <div class="inspect-block"><h4>${escapeHtml(t("app.schema"))}</h4><pre>${escapeHtml(JSON.stringify(version.definition.fields, null, 2))}</pre></div>
        <div class="inspect-block"><h4>${escapeHtml(t("app.evidence"))}</h4><pre>${escapeHtml(JSON.stringify(projectEvidence(project), null, 2))}</pre></div>
        <div class="inspect-block"><h4>${escapeHtml(t("app.versions"))}</h4><div class="version-list">${renderVersions(project)}</div></div>
        <div class="inspect-block"><h4>${escapeHtml(t("app.logs"))}</h4><div class="agent-log">${renderAgentLogs(project.agent_logs)}</div></div>
      </div>
    </details>
  `;
}

function renderThread(project) {
  const messages = [];
  if (state.lastError) {
    messages.push(`
      <article class="message error">
        <span class="message-label">${escapeHtml(t("error.requestFailed"))}</span>
        <p>${escapeHtml(state.lastError)}</p>
      </article>
    `);
  }

  messages.push(`
    <article class="message system">
      <span class="message-label">${escapeHtml(t("thread.welcomeLabel"))}</span>
      <h3>${escapeHtml(t("thread.welcomeTitle"))}</h3>
      <p>${escapeHtml(t("thread.welcomeBody"))}</p>
    </article>
  `);

  if (!project) {
    els.pendingState.textContent = statusLabel("idle");
    els.pendingState.className = "status-pill";
    els.threadFeed.innerHTML = messages.join("");
    return;
  }

  els.pendingState.textContent = statusLabel(project.status);
  els.pendingState.className = `status-pill ${project.status === "blocked" ? "blocked" : project.pending_evolution ? "pending" : "ready"}`;

  messages.push(`
    <article class="message system">
      <span class="message-label">${escapeHtml(t("thread.stateLabel"))}</span>
      <p>${escapeHtml(format(t("thread.stateBody"), {
        status: statusLabel(project.status),
        current: project.current_version_id,
        active: project.active_version_id || t("link.unavailable"),
      }))}</p>
      ${project.last_block_reason ? `<p><strong>${escapeHtml(project.last_block_reason)}</strong></p>` : ""}
    </article>
  `);

  if (project.pending_evolution) {
    messages.push(`
      <article class="message builder">
        <span class="message-label">${escapeHtml(t("thread.intentLabel"))}</span>
        <p>${escapeHtml(project.pending_evolution.builder_message)}</p>
      </article>
    `);
    messages.push(renderInterpretationMessage(project.pending_evolution));
    messages.push(renderProposalMessage(project.pending_evolution));
  } else {
    messages.push(`
      <article class="message agent">
        <span class="message-label">${escapeHtml(t("thread.agentLabel"))}</span>
        <h3>${escapeHtml(t("thread.noProposalTitle"))}</h3>
        <p>${escapeHtml(t("thread.noProposalBody"))}</p>
      </article>
    `);
  }

  messages.push(renderActionMessage(project));
  if (project.agent_logs?.length) messages.push(renderLogMessage(project.agent_logs));
  els.threadFeed.innerHTML = messages.join("");
}

function renderInterpretationMessage(pending) {
  return `
    <article class="message agent">
      <span class="message-label">${escapeHtml(t("thread.confirmLabel"))}</span>
      <h3>${escapeHtml(t("thread.confirmTitle"))}</h3>
      <p>${escapeHtml(format(t("thread.confirmBody"), {
        summary: pending.review_packet?.intent_summary || pending.proposal?.summary || pending.builder_message,
      }))}</p>
    </article>
  `;
}

function renderProposalMessage(pending) {
  const changedFiles = pending.proposal?.evidence?.changed_files ?? [];
  const diff = pending.proposal?.evidence?.diff || t("proposal.none");
  const approvals = pending.review_packet?.required_approvals?.map((item) => item.role).join(", ") || t("proposal.defaultApproval");
  const dataPolicy = pending.data_receipt?.policy || pending.review_packet?.scope_boundary || t("proposal.none");
  const highlights = proposalHighlights(pending.builder_message);
  return `
    <article class="message agent">
      <span class="message-label">${escapeHtml(t("thread.proposalLabel"))}</span>
      <h3>${escapeHtml(pending.review_packet?.intent_summary || pending.proposal?.summary || "Proposed change")}</h3>
      <p>${escapeHtml(pending.review_packet?.scope_boundary || "")}</p>
      <div class="highlight-list">
        <strong>${escapeHtml(t("proposal.highlights"))}</strong>
        <ul>
          ${highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
        </ul>
      </div>
      <div class="proposal-grid">
        <div class="proposal-cell"><strong>${escapeHtml(t("proposal.changedFiles"))}</strong><span>${escapeHtml(changedFiles.join(", ") || t("proposal.none"))}</span></div>
        <div class="proposal-cell"><strong>${escapeHtml(t("proposal.requiredApproval"))}</strong><span>${escapeHtml(approvals)}</span></div>
        <div class="proposal-cell"><strong>${escapeHtml(t("proposal.dataPolicy"))}</strong><span>${escapeHtml(dataPolicy)}</span></div>
      </div>
      <details>
        <summary>${escapeHtml(t("proposal.diff"))}</summary>
        <pre>${escapeHtml(diff)}</pre>
      </details>
      <div class="decision-list">
        ${pending.decisions.length ? pending.decisions.map((decision) => `
          <span class="badge ${decision.decision === "approved" ? "ok" : "bad"}">${escapeHtml(t("proposal.decision"))}: ${escapeHtml(decision.subject)} · ${escapeHtml(statusLabel(decision.decision))}</span>
        `).join("") : `<span class="badge warn">${escapeHtml(t("proposal.noDecision"))}</span>`}
        ${pending.data_receipt ? `<span class="badge ok">${escapeHtml(t("proposal.applied"))}</span>` : ""}
      </div>
      <div class="action-grid">
        <button data-action="approve" class="primary"${state.busy || pending.data_receipt ? " disabled" : ""}>${escapeHtml(t("proposal.approve"))}</button>
      </div>
    </article>
  `;
}

function proposalHighlights(message) {
  const lower = message.toLowerCase();
  const highlights = [];
  if (lower.includes("review")) {
    highlights.push(t("highlight.reviewModule"));
    highlights.push(t("highlight.reviewField"));
  }
  if (lower.includes("github") || lower.includes("issue") || lower.includes("pull request") || /\bpr\b/.test(lower)) {
    highlights.push(t("highlight.githubModule"));
    highlights.push(t("highlight.githubField"));
  }
  if (lower.includes("priority") || lower.includes("focus") || lower.includes("triage")) {
    highlights.push(t("highlight.priorityModule"));
    highlights.push(t("highlight.priorityField"));
  }
  highlights.push(t("highlight.dataReceipt"));
  return highlights;
}

function renderActionMessage(project) {
  return `
    <article class="message action">
      <span class="message-label">${escapeHtml(t("thread.actionsLabel"))}</span>
      <h3>${escapeHtml(t("thread.actionsTitle"))}</h3>
      <p>${escapeHtml(t("thread.actionsBody"))}</p>
      <div class="action-grid">
        <button data-action="preview"${state.busy ? " disabled" : ""}>${escapeHtml(t("action.preview"))}</button>
        <button data-action="publish" class="primary"${state.busy ? " disabled" : ""}>${escapeHtml(t("action.publish"))}</button>
        <button data-action="share"${state.busy ? " disabled" : ""}>${escapeHtml(t("action.share"))}</button>
        <button data-action="rollback"${state.busy || project.versions.length < 2 ? " disabled" : ""}>${escapeHtml(t("action.rollback"))}</button>
      </div>
    </article>
  `;
}

function renderLogMessage(logs) {
  return `
    <article class="message action">
      <details>
        <summary>${escapeHtml(t("thread.logs"))}</summary>
        <div class="agent-log">
          ${renderAgentLogs(logs)}
        </div>
      </details>
    </article>
  `;
}

function renderContext(project) {
  const contract = state.snapshot.developer_contract;
  const artifactRows = state.snapshot.shares.length
    ? state.snapshot.shares.map((share) => `
      <article class="artifact-row">
        <h4>${escapeHtml(share.manifest.app_name)} · ${escapeHtml(share.version_id)}</h4>
        <p>${escapeHtml(share.artifact_id)}</p>
        <button data-fork-artifact="${escapeHtml(share.artifact_id)}" class="subtle">${escapeHtml(t("context.fork"))}</button>
      </article>
    `).join("")
    : `<p class="muted">${escapeHtml(t("context.noArtifacts"))}</p>`;

  els.contextPanel.innerHTML = `
    <div class="context-columns">
      <section>
        <h3>${escapeHtml(t("context.storyTitle"))}</h3>
        <p class="muted">${escapeHtml(t("context.storyBody"))}</p>
        ${project ? `<p class="muted">${escapeHtml(project.name)} · ${escapeHtml(project.app_id)}${project.source_app_id ? ` · ${t("selected.forkOf")} ${project.source_app_id}` : ""}</p>` : ""}
      </section>
      <section>
        <h3>${escapeHtml(t("context.contract"))}</h3>
        ${contract ? renderContract(contract) : ""}
      </section>
    </div>
    <section>
      <h3>${escapeHtml(t("context.artifacts"))}</h3>
      <div class="artifact-list">${artifactRows}</div>
    </section>
  `;
  els.contextPanel.querySelectorAll("[data-fork-artifact]").forEach((button) => {
    button.addEventListener("click", () => forkArtifact(button.dataset.forkArtifact));
  });
}

function renderContract(contract) {
  return `
    <div class="contract-list">
      ${contractSection(t("contract.frameworkOwns"), contract.framework_owned)}
      ${contractSection(t("contract.hostOwns"), contract.host_owned)}
      ${contractSection(t("contract.promises"), contract.builder_visible_promises)}
    </div>
  `;
}

function contractSection(title, items) {
  return `
    <article class="contract-row">
      <strong>${escapeHtml(title)}</strong>
      <p>${items.map(escapeHtml).join(" · ")}</p>
    </article>
  `;
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
    els.roleSelect.value = state.role;
    els.agentMessage.value = t("defaults.forkAgentMessage");
  });
}

function renderDataRow(item) {
  return `
    <article class="data-row">
      <div>
        <h4>${escapeHtml(item.title)}</h4>
        <p>${escapeHtml(item.owner)} · ${escapeHtml(statusLabel(item.status))} · ${escapeHtml(item.priority || t("app.noPriority"))}${item.url ? ` · ${escapeHtml(item.url)}` : ""}</p>
      </div>
      <span class="badge">${escapeHtml(statusLabel(item.status))}</span>
    </article>
  `;
}

function renderVersions(project) {
  return (project.versions || []).map((version) => `
    <article class="version-row">
      <strong>${escapeHtml(version.version_id)}${version.version_id === project.current_version_id ? ` · ${escapeHtml(t("selected.current"))}` : ""}${version.version_id === project.active_version_id ? ` · ${escapeHtml(t("selected.active"))}` : ""}</strong>
      <p>${escapeHtml(version.definition.modules.map((mod) => mod.kind).join(", "))}</p>
    </article>
  `).join("");
}

function renderAgentLogs(logs = []) {
  if (!logs.length) return `<p class="muted">${escapeHtml(t("thread.noLogs"))}</p>`;
  return logs.map((log) => `
    <div class="agent-log-entry">
      <strong>${escapeHtml(log.kind)} · ${escapeHtml(formatTime(log.at_ms))}</strong>
      <div>${escapeHtml(log.text)}</div>
    </div>
  `).join("");
}

function projectEvidence(project) {
  return {
    app_id: project.app_id,
    status: project.status,
    builder_subject: project.builder_subject,
    current_version_id: project.current_version_id,
    active_version_id: project.active_version_id,
    preview_url: project.preview_url,
    published_url: project.published_url,
    pending_proposal_id: project.pending_evolution?.proposal_id,
  };
}

function externalLink(href, label, enabled, primary = false) {
  if (!enabled) {
    return `<a class="button-link disabled ${primary ? "primary" : ""}" aria-disabled="true">${escapeHtml(label)} · ${escapeHtml(t("link.unavailable"))}</a>`;
  }
  return `<a class="button-link ${primary ? "primary" : ""}" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">${escapeHtml(label)}</a>`;
}

function localizedUrl(url) {
  const next = new URL(url, window.location.origin);
  next.searchParams.set("lang", state.lang);
  return next.pathname + next.search;
}

function setBusyState() {
  document.querySelectorAll("button, input, textarea, select").forEach((node) => {
    if (node.id === "role-select" || node.id === "project-select") return;
    if (!node.closest("#thread-feed, #create-form, #agent-form")) return;
    if (state.busy) {
      if (node.dataset.preBusyDisabled === undefined) {
        node.dataset.preBusyDisabled = node.disabled ? "true" : "false";
      }
      node.disabled = true;
      return;
    }
    if (node.dataset.preBusyDisabled !== undefined) {
      node.disabled = node.dataset.preBusyDisabled === "true";
      delete node.dataset.preBusyDisabled;
    }
  });
}

function statusLabel(status) {
  return t(`status.${status}`) || status;
}

function format(template, values) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), template);
}

function formatTime(ms) {
  return new Date(ms).toLocaleTimeString(state.lang === "zh" ? "zh-CN" : "en-US");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

refresh();
