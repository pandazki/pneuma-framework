const state = {
  snapshot: { projects: [], shares: [], developer_contract: null },
  selectedAppId: localStorage.getItem("pneuma.productHost.selectedAppId"),
  lang: localStorage.getItem("pneuma.productHost.lang") || "en",
  role: localStorage.getItem("pneuma.productHost.role") || "user:bob",
  inspector: "data",
  busy: false,
  lastError: "",
  helpOpen: false,
};

const els = {
  app: document.getElementById("app"),
  projectSelect: document.getElementById("project-select"),
  projectHealth: document.getElementById("project-health"),
  roleSelect: document.getElementById("role-select"),
  languageSwitcher: document.getElementById("language-switcher"),
  langButtons: [...document.querySelectorAll("[data-lang]")],
  runtimeStatus: document.getElementById("runtime-status"),
  createPanel: document.getElementById("create-panel"),
  runtimeSurface: document.getElementById("runtime-surface"),
  inspector: document.getElementById("inspector"),
  helpToggle: document.getElementById("help-toggle"),
  helpPanel: document.getElementById("help-panel"),
  conversation: document.getElementById("conversation"),
  agentForm: document.getElementById("agent-form"),
  agentMessage: document.getElementById("agent-message"),
};

const i18n = {
  en: {
    "app.eyebrow": "Creation Host",
    "top.project": "Project",
    "top.identity": "Identity",
    "role.builder": "Builder",
    "role.forkingBuilder": "Forking Builder",
    "role.endUser": "End User",
    "runtime.eyebrow": "Generated Application",
    "runtime.title": "Runtime surface",
    "builder.eyebrow": "Builder Workbench",
    "builder.title": "Conversation",
    "builder.help": "Model",
    "composer.label": "Describe the next change",
    "composer.submit": "Ask agent",
    "project.none": "No project yet",
    "status.idle": "idle",
    "status.draft": "draft",
    "status.awaiting_builder_confirmation": "awaiting confirmation",
    "status.awaiting_reviewer_approval": "awaiting confirmation",
    "status.blocked": "blocked",
    "status.ready_to_preview": "ready to preview",
    "status.previewing": "previewing",
    "status.published": "published",
    "status.forked": "forked",
    "status.approved": "approved",
    "status.denied": "denied",
    "status.todo": "todo",
    "status.doing": "doing",
    "status.needs_review": "needs_review",
    "status.completed": "completed",
    "create.title": "Create a Dev Board",
    "create.body": "Choose a profile, then use the agent to evolve the generated app.",
    "create.name": "Name",
    "create.goal": "Goal",
    "create.profile": "Profile",
    "create.submit": "Create app",
    "profile.engineering": "Engineering operations",
    "profile.personal": "Personal focus",
    "defaults.name": "Engineering Dev Board",
    "defaults.goal": "Track release work, review queues, and GitHub attention in one daily board.",
    "defaults.message": "Add a review queue so items can be marked needs_review and approved.",
    "runtime.emptyTitle": "No generated app selected",
    "runtime.emptyBody": "Create a project to see the app surface, data, versions, and release controls.",
    "runtime.version": "Version",
    "runtime.live": "Live",
    "runtime.items": "Items",
    "runtime.openPreview": "Open preview sandbox",
    "runtime.openLive": "Open published app",
    "runtime.unavailable": "Unavailable",
    "runtime.modules": "Modules",
    "runtime.sampleData": "Data",
    "runtime.owner": "Owner",
    "runtime.status": "Status",
    "runtime.priority": "Priority",
    "runtime.noPriority": "None",
    "runtime.actions": "Lifecycle",
    "action.preview": "Start preview",
    "action.publish": "Publish",
    "action.share": "Share artifact",
    "action.rollback": "Rollback",
    "inspector.data": "Data",
    "inspector.schema": "Schema",
    "inspector.versions": "Versions",
    "inspector.evidence": "Evidence",
    "inspector.logs": "Logs",
    "conversation.emptyTitle": "Builder and app are separate surfaces",
    "conversation.emptyBody": "The left pane shows the generated app. This pane is where the Builder asks the build agent for a change, reviews the interpretation and proposal, then confirms apply.",
    "conversation.state": "Workspace",
    "conversation.original": "Original request",
    "conversation.interpretation": "Agent interpretation",
    "conversation.proposal": "Precise proposal",
    "conversation.confirmIntent": "Confirm intent before apply",
    "conversation.interpretedAs": "Interpreted as: {summary}. The agent prepares source and data changes only; publish stays a separate Builder action.",
    "proposal.highlights": "Key changes",
    "proposal.file": "File",
    "proposal.confirmation": "Required confirmation",
    "proposal.data": "Data",
    "proposal.diff": "Diff",
    "proposal.confirm": "Confirm and apply",
    "proposal.required": "Builder confirmation required",
    "proposal.applied": "Applied. Start preview next and check the app before publishing.",
    "proposal.noneTitle": "No pending proposal",
    "proposal.noneBody": "Ask for a product change to produce an interpretation, exact proposal, key highlights, and confirmation control.",
    "highlight.reviewModule": "Add Review queue as a first-class module.",
    "highlight.reviewField": "Add review_status so items can move through needs_review and approved.",
    "highlight.githubModule": "Add GitHub attention as a visible workflow lane.",
    "highlight.githubField": "Preserve issue/PR URLs in item data.",
    "highlight.priorityModule": "Add a priority lane.",
    "highlight.priorityField": "Expose P1/P2/P3 priority as normal app data.",
    "highlight.dataReceipt": "Run data carry-forward rehearsal before publish.",
    "help.title": "Product model",
    "help.body": "Framework provides the build loop and governance primitives. This Creation Host turns them into a Builder-facing product. Generated Apps and Published Apps stay separate from the workbench.",
    "help.framework": "Framework owns",
    "help.host": "Host owns",
    "help.promises": "Builder-visible promises",
    "share.none": "No share artifacts yet.",
    "share.fork": "Fork",
    "error.title": "Request failed",
    "command.hint": "Preview opens a disposable data copy. Publish opens the app as a separate page for End Users.",
  },
  zh: {
    "app.eyebrow": "Creation Host",
    "top.project": "项目",
    "top.identity": "身份",
    "role.builder": "Builder",
    "role.forkingBuilder": "Fork Builder",
    "role.endUser": "End User",
    "runtime.eyebrow": "Generated Application",
    "runtime.title": "应用运行面",
    "builder.eyebrow": "Builder Workbench",
    "builder.title": "对话工作流",
    "builder.help": "模型",
    "composer.label": "描述下一次变更",
    "composer.submit": "询问 agent",
    "project.none": "还没有项目",
    "status.idle": "空闲",
    "status.draft": "草稿",
    "status.awaiting_builder_confirmation": "等待确认",
    "status.awaiting_reviewer_approval": "等待确认",
    "status.blocked": "已阻止",
    "status.ready_to_preview": "可预览",
    "status.previewing": "预览中",
    "status.published": "已发布",
    "status.forked": "已 fork",
    "status.approved": "已批准",
    "status.denied": "已拒绝",
    "status.todo": "待办",
    "status.doing": "进行中",
    "status.needs_review": "待评审",
    "status.completed": "已完成",
    "create.title": "创建 Dev Board",
    "create.body": "先选择 profile，再通过 agent 演进生成应用。",
    "create.name": "名称",
    "create.goal": "目标",
    "create.profile": "配置",
    "create.submit": "创建应用",
    "profile.engineering": "工程协作",
    "profile.personal": "个人专注",
    "defaults.name": "工程开发看板",
    "defaults.goal": "在一个日常看板中跟踪发布工作、评审队列和 GitHub 关注项。",
    "defaults.message": "添加一个 review queue，让事项可以标记为 needs_review 并被 approved。",
    "runtime.emptyTitle": "还没有选择 Generated App",
    "runtime.emptyBody": "创建项目后，这里会显示应用运行面、数据、版本和发布控制。",
    "runtime.version": "版本",
    "runtime.live": "线上",
    "runtime.items": "事项",
    "runtime.openPreview": "打开预览沙盒",
    "runtime.openLive": "打开线上应用",
    "runtime.unavailable": "不可用",
    "runtime.modules": "模块",
    "runtime.sampleData": "数据",
    "runtime.owner": "负责人",
    "runtime.status": "状态",
    "runtime.priority": "优先级",
    "runtime.noPriority": "无",
    "runtime.actions": "生命周期",
    "action.preview": "启动预览",
    "action.publish": "发布",
    "action.share": "生成分享制品",
    "action.rollback": "回滚",
    "inspector.data": "数据",
    "inspector.schema": "Schema",
    "inspector.versions": "版本",
    "inspector.evidence": "证据",
    "inspector.logs": "日志",
    "conversation.emptyTitle": "Builder 和 App 是分开的",
    "conversation.emptyBody": "左侧是生成应用本身。右侧是 Builder 向 build agent 提需求、检查理解与 proposal、最后确认执行的地方。",
    "conversation.state": "工作区",
    "conversation.original": "原始需求",
    "conversation.interpretation": "Agent 理解",
    "conversation.proposal": "准确 proposal",
    "conversation.confirmIntent": "执行前确认意图",
    "conversation.interpretedAs": "理解为：{summary}。Agent 只准备 source/data 变更；发布仍然是 Builder 的独立动作。",
    "proposal.highlights": "重点改动",
    "proposal.file": "文件",
    "proposal.confirmation": "所需确认",
    "proposal.data": "数据",
    "proposal.diff": "Diff",
    "proposal.confirm": "确认并执行",
    "proposal.required": "需要 Builder 确认",
    "proposal.applied": "已执行。下一步启动预览，检查应用效果后再发布。",
    "proposal.noneTitle": "没有待处理 proposal",
    "proposal.noneBody": "提出产品变更后，这里会出现 agent 理解、准确 proposal、重点改动和确认控件。",
    "highlight.reviewModule": "把 Review queue 作为一等模块加入应用。",
    "highlight.reviewField": "加入 review_status，让事项可以进入 needs_review 和 approved。",
    "highlight.githubModule": "把 GitHub attention 变成可见工作流。",
    "highlight.githubField": "在数据里保留 issue/PR URL。",
    "highlight.priorityModule": "新增 priority lane。",
    "highlight.priorityField": "把 P1/P2/P3 优先级变成正常应用数据。",
    "highlight.dataReceipt": "发布前执行 data carry-forward rehearsal。",
    "help.title": "产品模型",
    "help.body": "Framework 提供 build loop 和治理 primitive。Creation Host 把它们变成 Builder 可用的产品。Generated App 和 Published App 与工作台保持分离。",
    "help.framework": "Framework 拥有",
    "help.host": "Host 拥有",
    "help.promises": "Builder 可见承诺",
    "share.none": "还没有分享制品。",
    "share.fork": "Fork",
    "error.title": "请求失败",
    "command.hint": "预览会创建一次性数据副本。发布后，End User 在单独页面使用应用。",
  },
};

const statusTone = {
  draft: "neutral",
  awaiting_builder_confirmation: "warn",
  awaiting_reviewer_approval: "warn",
  blocked: "bad",
  ready_to_preview: "good",
  previewing: "good",
  published: "live",
  forked: "neutral",
};

els.langButtons.forEach((button) => {
  button.addEventListener("click", () => {
    state.lang = button.dataset.lang;
    localStorage.setItem("pneuma.productHost.lang", state.lang);
    render();
  });
});

els.roleSelect.addEventListener("change", () => {
  state.role = els.roleSelect.value;
  localStorage.setItem("pneuma.productHost.role", state.role);
  render();
});

els.projectSelect.addEventListener("change", () => {
  state.selectedAppId = els.projectSelect.value || null;
  localStorage.setItem("pneuma.productHost.selectedAppId", state.selectedAppId || "");
  const project = selectedProject();
  if (project && state.role !== "user:end-user") {
    state.role = project.builder_subject;
    localStorage.setItem("pneuma.productHost.role", state.role);
  }
  render();
});

els.helpToggle.addEventListener("click", () => {
  state.helpOpen = !state.helpOpen;
  render();
});

els.agentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const project = selectedProject();
  if (!project) return;
  await runAction(async () => {
    await post(`/api/projects/${project.app_id}/evolution/request`, {
      message: els.agentMessage.value.trim() || t("defaults.message"),
      builder_subject: state.role,
    });
  });
});

document.addEventListener("submit", async (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  if (form.id !== "create-form") return;
  event.preventDefault();
  const data = new FormData(form);
  await runAction(async () => {
    const project = await post("/api/projects", {
      name: String(data.get("name") || t("defaults.name")),
      goal: String(data.get("goal") || t("defaults.goal")),
      template_id: data.get("template_id") || "engineering",
      builder_subject: state.role,
    });
    state.selectedAppId = project.app_id;
    state.role = project.builder_subject;
    localStorage.setItem("pneuma.productHost.selectedAppId", state.selectedAppId);
    localStorage.setItem("pneuma.productHost.role", state.role);
  });
});

document.addEventListener("click", async (event) => {
  if (!(event.target instanceof Element)) return;
  const button = event.target.closest("[data-action]");
  if (!button || button.disabled || button.classList.contains("is-disabled")) return;
  const action = button.dataset.action;
  const project = selectedProject();

  if (action === "inspect-tab") {
    state.inspector = button.dataset.tab || "data";
    render();
    return;
  }

  if (action === "fork") {
    const artifactId = button.dataset.artifactId;
    if (!artifactId) return;
    await runAction(async () => {
      const forked = await post("/api/forks", {
        artifact_id: artifactId,
        name: "Charlie's Dev Board",
        builder_subject: "user:charlie",
      });
      state.selectedAppId = forked.app_id;
      state.role = forked.builder_subject;
      localStorage.setItem("pneuma.productHost.selectedAppId", state.selectedAppId);
      localStorage.setItem("pneuma.productHost.role", state.role);
    });
    return;
  }

  if (!project) return;
  if (action === "confirm") {
    await runAction(() => post(`/api/projects/${project.app_id}/evolution/approve`, { subject: state.role }));
  } else if (action === "preview") {
    await runAction(() => post(`/api/projects/${project.app_id}/preview/start`, {}));
  } else if (action === "publish") {
    await runAction(() => post(`/api/projects/${project.app_id}/publish`, {}));
  } else if (action === "share") {
    await runAction(() => post(`/api/projects/${project.app_id}/share`, {}));
  } else if (action === "rollback") {
    await runAction(() => post(`/api/projects/${project.app_id}/rollback`, {}));
  }
});

await refresh();

async function refresh() {
  const response = await fetch("/api/state");
  state.snapshot = await response.json();
  if (!state.snapshot.projects.some((project) => project.app_id === state.selectedAppId)) {
    state.selectedAppId = state.snapshot.projects[0]?.app_id || null;
  }
  if (state.selectedAppId) localStorage.setItem("pneuma.productHost.selectedAppId", state.selectedAppId);
  render();
}

async function runAction(fn) {
  state.busy = true;
  state.lastError = "";
  render();
  try {
    await fn();
    await refresh();
  } catch (err) {
    state.lastError = err instanceof Error ? err.message : String(err);
    render();
  } finally {
    state.busy = false;
    render();
  }
}

async function post(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Request failed");
  return payload;
}

function render() {
  document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
  document.querySelectorAll("[data-i18n]").forEach((node) => {
    node.textContent = t(node.dataset.i18n);
  });
  els.langButtons.forEach((button) => button.classList.toggle("active", button.dataset.lang === state.lang));
  els.roleSelect.value = state.role;
  syncDefaultText();
  const project = selectedProject();
  renderProjectSelect(project);
  renderHealth(project);
  renderCreatePanel(project);
  renderRuntime(project);
  renderInspector(project);
  renderHelp();
  renderConversation(project);
  els.app.classList.toggle("is-busy", state.busy);
}

function syncDefaultText() {
  if (!els.agentMessage.value || Object.values(i18n).some((dict) => dict["defaults.message"] === els.agentMessage.value)) {
    els.agentMessage.value = t("defaults.message");
  }
}

function renderProjectSelect(project) {
  if (!state.snapshot.projects.length) {
    els.projectSelect.innerHTML = `<option value="">${escape(t("project.none"))}</option>`;
    els.projectSelect.disabled = true;
    return;
  }
  els.projectSelect.disabled = false;
  els.projectSelect.innerHTML = state.snapshot.projects.map((item) => {
    const label = `${item.name} · ${statusLabel(item.status)} · ${item.current_version_id}`;
    return `<option value="${escape(item.app_id)}">${escape(label)}</option>`;
  }).join("");
  els.projectSelect.value = project?.app_id || state.snapshot.projects[0].app_id;
}

function renderHealth(project) {
  if (!project) {
    els.projectHealth.innerHTML = `
      <span>${escape(t("status.idle"))}</span>
      <strong>${escape(t("project.none"))}</strong>
    `;
    return;
  }
  els.projectHealth.innerHTML = `
    <span class="status-dot ${statusTone[project.status] || "neutral"}"></span>
    <strong>${escape(statusLabel(project.status))}</strong>
    <span>${escape(t("runtime.version"))} ${escape(project.current_version_id)}</span>
    <span>${escape(t("runtime.live"))} ${escape(project.active_version_id || t("runtime.unavailable"))}</span>
  `;
}

function renderCreatePanel(project) {
  if (project) {
    els.createPanel.innerHTML = "";
    els.createPanel.hidden = true;
    return;
  }
  els.createPanel.hidden = false;
  els.createPanel.innerHTML = `
    <form id="create-form" class="create-form">
      <div class="form-intro">
        <h3>${escape(t("create.title"))}</h3>
        <p>${escape(t("create.body"))}</p>
      </div>
      <label>
        <span>${escape(t("create.name"))}</span>
        <input name="name" value="${escape(t("defaults.name"))}">
      </label>
      <label>
        <span>${escape(t("create.goal"))}</span>
        <textarea name="goal" rows="3">${escape(t("defaults.goal"))}</textarea>
      </label>
      <label>
        <span>${escape(t("create.profile"))}</span>
        <select name="template_id">
          <option value="engineering">${escape(t("profile.engineering"))}</option>
          <option value="personal">${escape(t("profile.personal"))}</option>
        </select>
      </label>
      <button class="primary-button" type="submit">${escape(t("create.submit"))}</button>
    </form>
  `;
}

function renderRuntime(project) {
  els.runtimeStatus.textContent = statusLabel(project?.status || "idle");
  els.runtimeStatus.className = `status-token ${statusTone[project?.status] || "neutral"}`;
  if (!project?.current_version) {
    els.runtimeSurface.innerHTML = `
      <div class="empty-surface">
        <h3>${escape(t("runtime.emptyTitle"))}</h3>
        <p>${escape(t("runtime.emptyBody"))}</p>
      </div>
    `;
    return;
  }

  const version = project.current_version;
  els.runtimeSurface.innerHTML = `
    <div class="runtime-header">
      <div>
        <span class="eyebrow">${escape(project.profile_id)}</span>
        <h3>${escape(project.name)}</h3>
        <p>${escape(project.goal)}</p>
      </div>
      <div class="runtime-links">
        ${runtimeLink(project.preview_url, t("runtime.openPreview"))}
        ${runtimeLink(project.published_url, t("runtime.openLive"), true)}
      </div>
    </div>

    <div class="metric-line">
      <span><strong>${escape(project.current_version_id)}</strong>${escape(t("runtime.version"))}</span>
      <span><strong>${escape(project.active_version_id || "-")}</strong>${escape(t("runtime.live"))}</span>
      <span><strong>${escape(String(version.items.length))}</strong>${escape(t("runtime.items"))}</span>
    </div>

    <section class="runtime-section">
      <div class="section-title">
        <h4>${escape(t("runtime.modules"))}</h4>
      </div>
      <div class="module-list">
        ${version.definition.modules.map((mod) => `
          <div class="module-row">
            <strong>${escape(mod.title)}</strong>
            <span>${escape(mod.kind)}</span>
            <p>${escape(mod.description)}</p>
          </div>
        `).join("")}
      </div>
    </section>

    <section class="runtime-section">
      <div class="section-title">
        <h4>${escape(t("runtime.sampleData"))}</h4>
      </div>
      ${renderDataTable(version.items)}
    </section>
  `;
}

function renderDataTable(items) {
  if (!items.length) return `<p class="muted">${escape(t("runtime.emptyBody"))}</p>`;
  return `
    <table class="data-table">
      <thead>
        <tr>
          <th>Item</th>
          <th>${escape(t("runtime.owner"))}</th>
          <th>${escape(t("runtime.status"))}</th>
          <th>${escape(t("runtime.priority"))}</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item) => `
          <tr>
            <td>${escape(item.title)}</td>
            <td>${escape(item.owner)}</td>
            <td><span class="table-pill">${escape(statusLabel(item.status))}</span></td>
            <td>${escape(item.priority || t("runtime.noPriority"))}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function renderInspector(project) {
  if (!project?.current_version) {
    els.inspector.innerHTML = "";
    return;
  }
  const tabs = ["data", "schema", "versions", "evidence", "logs"];
  els.inspector.innerHTML = `
    <div class="inspector-tabs">
      ${tabs.map((tab) => `
        <button type="button" data-action="inspect-tab" data-tab="${tab}" class="${state.inspector === tab ? "active" : ""}">
          ${escape(t(`inspector.${tab}`))}
        </button>
      `).join("")}
    </div>
    <div class="inspector-body">
      ${renderInspectorBody(project)}
    </div>
  `;
}

function renderInspectorBody(project) {
  if (state.inspector === "data") return renderDataTable(project.current_version.items);
  if (state.inspector === "schema") return `<pre>${escape(JSON.stringify(project.current_version.definition.fields, null, 2))}</pre>`;
  if (state.inspector === "versions") {
    return `
      <div class="version-list">
        ${project.versions.map((version) => `
          <div class="version-row">
            <strong>${escape(version.version_id)}</strong>
            <span>${new Date(version.created_at_ms).toLocaleString(state.lang === "zh" ? "zh-CN" : "en-US")}</span>
          </div>
        `).join("")}
      </div>
    `;
  }
  if (state.inspector === "logs") return renderLogs(project.agent_logs);
  return `<pre>${escape(JSON.stringify(projectEvidence(project), null, 2))}</pre>`;
}

function renderHelp() {
  els.helpPanel.hidden = !state.helpOpen;
  if (!state.helpOpen) return;
  const contract = state.snapshot.developer_contract;
  els.helpPanel.innerHTML = `
    <h3>${escape(t("help.title"))}</h3>
    <p>${escape(t("help.body"))}</p>
    ${contract ? `
      <div class="contract-grid">
        ${contractList(t("help.framework"), contract.framework_owned)}
        ${contractList(t("help.host"), contract.host_owned)}
        ${contractList(t("help.promises"), contract.builder_visible_promises)}
      </div>
    ` : ""}
    <div class="share-list">
      ${state.snapshot.shares.length ? state.snapshot.shares.map((share) => `
        <div class="share-row">
          <span>${escape(share.manifest.app_name)} · ${escape(share.version_id)}</span>
          <button type="button" class="ghost-button" data-action="fork" data-artifact-id="${escape(share.artifact_id)}">${escape(t("share.fork"))}</button>
        </div>
      `).join("") : `<p class="muted">${escape(t("share.none"))}</p>`}
    </div>
  `;
}

function renderConversation(project) {
  const blocks = [];
  if (state.lastError) {
    blocks.push(`
      <article class="turn error-turn">
        <span>${escape(t("error.title"))}</span>
        <p>${escape(state.lastError)}</p>
      </article>
    `);
  }

  blocks.push(`
    <article class="turn system-turn">
      <span>${escape(t("conversation.state"))}</span>
      <h3>${escape(t("conversation.emptyTitle"))}</h3>
      <p>${escape(project ? workspaceSummary(project) : t("conversation.emptyBody"))}</p>
    </article>
  `);

  if (project?.pending_evolution) {
    const pending = project.pending_evolution;
    blocks.push(`
      <article class="turn builder-turn">
        <span>${escape(t("conversation.original"))}</span>
        <p>${escape(pending.builder_message)}</p>
      </article>
    `);
    blocks.push(`
      <article class="turn agent-turn">
        <span>${escape(t("conversation.interpretation"))}</span>
        <h3>${escape(t("conversation.confirmIntent"))}</h3>
        <p>${escape(format(t("conversation.interpretedAs"), {
          summary: pending.review_packet?.intent_summary || pending.proposal?.summary || pending.builder_message,
        }))}</p>
      </article>
    `);
    blocks.push(renderProposal(project, pending));
  } else if (project) {
    blocks.push(`
      <article class="turn agent-turn">
        <span>${escape(t("conversation.proposal"))}</span>
        <h3>${escape(t("proposal.noneTitle"))}</h3>
        <p>${escape(t("proposal.noneBody"))}</p>
      </article>
    `);
  }

  if (project) blocks.push(renderCommandBar(project));
  els.conversation.innerHTML = blocks.join("");
}

function renderProposal(project, pending) {
  const changedFiles = pending.proposal?.evidence?.changed_files || [];
  const diff = pending.proposal?.evidence?.diff || "";
  const confirmation = pending.review_packet?.required_approvals?.map((item) => item.role).join(", ") || "builder";
  const data = pending.data_receipt?.policy || pending.review_packet?.scope_boundary || "";
  const applied = Boolean(pending.data_receipt);
  return `
    <article class="turn proposal-turn">
      <span>${escape(t("conversation.proposal"))}</span>
      <h3>${escape(pending.review_packet?.intent_summary || pending.proposal?.summary || "Proposal")}</h3>
      <p>${escape(pending.review_packet?.scope_boundary || "")}</p>
      <div class="highlight-box">
        <strong>${escape(t("proposal.highlights"))}</strong>
        <ul>${proposalHighlights(pending.builder_message).map((item) => `<li>${escape(item)}</li>`).join("")}</ul>
      </div>
      <dl class="proposal-meta">
        <div><dt>${escape(t("proposal.file"))}</dt><dd>${escape(changedFiles.join(", ") || "-")}</dd></div>
        <div><dt>${escape(t("proposal.confirmation"))}</dt><dd>${escape(confirmation)}</dd></div>
        <div><dt>${escape(t("proposal.data"))}</dt><dd>${escape(data || "-")}</dd></div>
      </dl>
      <details class="diff-block">
        <summary>${escape(t("proposal.diff"))}</summary>
        <pre>${escape(diff)}</pre>
      </details>
      <div class="proposal-footer">
        ${pending.decisions.length ? pending.decisions.map((decision) => `
          <span class="decision-token">${escape(t("proposal.confirmation"))}: ${escape(decision.subject)} · ${escape(statusLabel(decision.decision))}</span>
        `).join("") : `<span class="decision-token warn">${escape(t("proposal.required"))}</span>`}
        ${applied ? `<span class="decision-token ok">${escape(t("proposal.applied"))}</span>` : ""}
        ${applied ? "" : `<button type="button" class="primary-button" data-action="confirm" ${state.busy ? "disabled" : ""}>${escape(t("proposal.confirm"))}</button>`}
      </div>
    </article>
  `;
}

function renderCommandBar(project) {
  return `
    <article class="turn command-turn">
      <span>${escape(t("runtime.actions"))}</span>
      <p>${escape(t("command.hint"))}</p>
      <div class="command-grid">
        <button type="button" data-action="preview">${escape(t("action.preview"))}</button>
        <button type="button" class="primary-button" data-action="publish">${escape(t("action.publish"))}</button>
        <button type="button" data-action="share">${escape(t("action.share"))}</button>
        <button type="button" data-action="rollback" ${project.versions.length < 2 ? "disabled" : ""}>${escape(t("action.rollback"))}</button>
      </div>
    </article>
  `;
}

function renderLogs(logs = []) {
  if (!logs.length) return `<p class="muted">${escape(t("share.none"))}</p>`;
  return `
    <div class="log-list">
      ${logs.map((log) => `
        <div class="log-row">
          <strong>${escape(log.kind)}</strong>
          <span>${new Date(log.at_ms).toLocaleTimeString(state.lang === "zh" ? "zh-CN" : "en-US")}</span>
          <p>${escape(log.text)}</p>
        </div>
      `).join("")}
    </div>
  `;
}

function contractList(title, items) {
  return `
    <div>
      <h4>${escape(title)}</h4>
      <ul>${items.map((item) => `<li>${escape(item)}</li>`).join("")}</ul>
    </div>
  `;
}

function runtimeLink(href, label, primary = false) {
  if (!href) return `<span class="link-button disabled">${escape(label)} · ${escape(t("runtime.unavailable"))}</span>`;
  const url = localizedUrl(href);
  return `<a class="link-button ${primary ? "primary" : ""}" href="${escape(url)}" target="_blank" rel="noreferrer">${escape(label)}</a>`;
}

function selectedProject() {
  return state.snapshot.projects.find((project) => project.app_id === state.selectedAppId) || null;
}

function statusLabel(status) {
  return t(`status.${status}`) || status;
}

function workspaceSummary(project) {
  return `${project.name}: ${statusLabel(project.status)}. ${t("runtime.version")} ${project.current_version_id}. ${t("runtime.live")} ${project.active_version_id || t("runtime.unavailable")}.`;
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
    share_artifacts: state.snapshot.shares.filter((share) => share.app_id === project.app_id).map((share) => share.artifact_id),
  };
}

function localizedUrl(url) {
  const next = new URL(url, window.location.origin);
  next.searchParams.set("lang", state.lang);
  return `${next.pathname}${next.search}`;
}

function t(key) {
  return i18n[state.lang]?.[key] || i18n.en[key] || key;
}

function format(template, values) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), template);
}

function escape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
