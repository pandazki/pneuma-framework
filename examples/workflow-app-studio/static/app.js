const state = {
  lang: new URLSearchParams(location.search).get("lang") === "zh" ? "zh" : "en",
  snapshot: null,
  selectedAppId: null,
  tab: "data",
  notice: null,
  busy: null,
};

const text = {
  en: {
    eyebrow: "Creation Host",
    title: "Workflow App Studio",
    project: "Project",
    noProject: "No project yet",
    generatedApp: "Generated Application",
    builderWorkbench: "Builder Workbench",
    createTitle: "Create workflow app",
    createBody: "Start with a real workflow app, then evolve it through Builder conversation and governed proposals.",
    name: "Name",
    goal: "Goal",
    template: "Template",
    create: "Create app",
    defaultName: "Vendor Intake Portal",
    defaultGoal: "Collect vendor requests, review risk, and approve onboarding.",
    defaultMessage: "Add a legal review stage before approval and require contract value for high-risk vendors.",
    version: "Version",
    live: "Live",
    records: "Records",
    fields: "Fields",
    stages: "Stages",
    actions: "Actions",
    data: "Data",
    schema: "Schema",
    type: "Type",
    required: "Required",
    from: "From",
    to: "To",
    role: "Role",
    yes: "yes",
    no: "no",
    versions: "Versions",
    noSelection: "Create or select a workflow app to inspect its runtime, schema, versions, and proposal evidence.",
    askAgent: "Ask build agent",
    approve: "Approve and apply",
    preview: "Start preview",
    publish: "Publish",
    share: "Share artifact",
    fork: "Fork artifact",
    rollback: "Rollback",
    openPreview: "Open preview",
    openLive: "Open published app",
    originalRequest: "Original request",
    interpretation: "Agent interpretation",
    proposal: "Precise proposal",
    highlights: "Key changes",
    dataImpact: "Data carry-forward",
    diff: "Source diff",
    noProposal: "No pending proposal. Ask the build agent for a workflow change.",
    status: "Status",
    owner: "Owner",
    stage: "Stage",
    emptyShares: "No share artifacts yet.",
    lifecycle: "Lifecycle",
    pendingConfirmation: "Waiting for Builder approval.",
    previewRequired: "Preview the current version before publishing.",
    readyToPublish: "Preview is running. Publish when the generated app looks right.",
    published: "Published.",
    blocked: "Blocked.",
    agentMode: "Agent mode",
    agentLogs: "Agent work log",
    codeSource: "Generated source",
    askingAgent: "Real code agent is editing the draft workspace...",
  },
  zh: {
    eyebrow: "创建宿主",
    title: "业务流程应用工作室",
    project: "项目",
    noProject: "还没有项目",
    generatedApp: "生成应用",
    builderWorkbench: "构建者工作台",
    createTitle: "创建流程应用",
    createBody: "先创建一个真实 workflow app，再通过 Builder 对话和受治理 proposal 演进它。",
    name: "名称",
    goal: "目标",
    template: "模板",
    create: "创建应用",
    defaultName: "供应商准入门户",
    defaultGoal: "收集供应商请求、评估风险并批准准入。",
    defaultMessage: "在批准前增加法务评审阶段，并要求高风险供应商填写合同金额。",
    version: "版本",
    live: "线上",
    records: "记录",
    fields: "字段",
    stages: "阶段",
    actions: "动作",
    data: "数据",
    schema: "结构",
    type: "类型",
    required: "必填",
    from: "起点",
    to: "终点",
    role: "角色",
    yes: "是",
    no: "否",
    versions: "版本",
    noSelection: "创建或选择一个流程应用后，这里会显示运行面、结构、版本和 proposal 证据。",
    askAgent: "询问构建 agent",
    approve: "批准并应用",
    preview: "启动预览",
    publish: "发布",
    share: "生成分享制品",
    fork: "Fork 制品",
    rollback: "回滚",
    openPreview: "打开预览",
    openLive: "打开线上应用",
    originalRequest: "原始需求",
    interpretation: "Agent 理解",
    proposal: "精确提案",
    highlights: "重点改动",
    dataImpact: "数据迁移",
    diff: "源码差异",
    noProposal: "暂无 pending proposal。请先向构建 agent 提出 workflow change。",
    status: "状态",
    owner: "负责人",
    stage: "阶段",
    emptyShares: "还没有 share artifact。",
    lifecycle: "生命周期",
    pendingConfirmation: "等待 Builder 批准。",
    previewRequired: "发布前需要先预览当前版本。",
    readyToPublish: "预览正在运行。确认生成应用符合预期后再发布。",
    published: "已发布。",
    blocked: "已阻塞。",
    agentMode: "Agent 模式",
    agentLogs: "Agent 工作日志",
    codeSource: "生成源码",
    askingAgent: "真实 code agent 正在修改 draft workspace...",
  },
};

const root = document.querySelector("#app");

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  state.notice = null;
  return body;
}

async function refresh() {
  state.snapshot = await api("/api/state");
  if (!state.selectedAppId && state.snapshot.projects[0]) state.selectedAppId = state.snapshot.projects[0].app_id;
  if (state.selectedAppId && !state.snapshot.projects.some((project) => project.app_id === state.selectedAppId)) {
    state.selectedAppId = state.snapshot.projects[0]?.app_id ?? null;
  }
  render();
}

function t(key) {
  return text[state.lang][key];
}

function selectedProject() {
  return state.snapshot?.projects.find((project) => project.app_id === state.selectedAppId) ?? null;
}

function render() {
  const project = selectedProject();
  root.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="brand">
          <p class="eyebrow">${t("eyebrow")}</p>
          <h1>${t("title")}</h1>
        </div>
        <label class="project-select">
          <span>${t("project")}</span>
          <select data-select-project>
            <option value="">${t("noProject")}</option>
            ${(state.snapshot?.projects ?? []).map((item) => `<option value="${item.app_id}" ${item.app_id === state.selectedAppId ? "selected" : ""}>${escapeHtml(item.name)} · ${item.status}</option>`).join("")}
          </select>
        </label>
        <div class="language">
          <span class="mode-chip">${t("agentMode")}: ${escapeHtml(state.snapshot?.agent_mode ?? "deterministic")}</span>
          <button data-lang="en" class="${state.lang === "en" ? "active" : ""}">EN</button>
          <button data-lang="zh" class="${state.lang === "zh" ? "active" : ""}">中文</button>
        </div>
      </header>
      <main class="workspace">
        <section class="pane">
          <div class="pane-header">
            <div>
              <p class="eyebrow">${t("generatedApp")}</p>
              <h2>${project ? escapeHtml(project.name) : t("createTitle")}</h2>
            </div>
            ${project ? `<span class="pill">${project.status}</span>` : ""}
          </div>
          <div class="pane-body">
            ${project ? renderProject(project) : renderCreate()}
          </div>
        </section>
        <section class="pane">
          <div class="pane-header">
            <div>
              <p class="eyebrow">${t("builderWorkbench")}</p>
              <h2>${t("proposal")}</h2>
            </div>
          </div>
          <div class="pane-body conversation">
            ${state.notice ? `<div class="notice error">${escapeHtml(state.notice)}</div>` : ""}
            ${state.busy ? `<div class="notice">${escapeHtml(state.busy)}</div>` : ""}
            ${project ? renderWorkbench(project) : `<p class="muted">${t("noSelection")}</p>`}
          </div>
        </section>
      </main>
    </div>
  `;
  bindEvents();
}

function renderCreate() {
  return `
    <div class="create-grid">
      <div>
        <h3>${t("createTitle")}</h3>
        <p class="muted">${t("createBody")}</p>
      </div>
      <form class="form-grid" data-create-project>
        <label>${t("name")}<input name="name" value="${t("defaultName")}" /></label>
        <label>${t("goal")}<textarea name="goal">${t("defaultGoal")}</textarea></label>
        <label>${t("template")}
          <select name="template_id">
            <option value="vendor_intake">Vendor Intake</option>
            <option value="incident_review">Incident Review</option>
            <option value="hiring_loop">Hiring Loop</option>
          </select>
        </label>
        <button class="primary" type="submit">${t("create")}</button>
      </form>
    </div>
  `;
}

function renderProject(project) {
  const version = project.current_version;
  if (!version) return `<p class="muted">${t("noSelection")}</p>`;
  const workflow = version.source.workflow;
  return `
    <div class="app-card">
      <div>
        <p class="eyebrow">${escapeHtml(workflow.entity.plural)}</p>
        <h2>${escapeHtml(workflow.title)}</h2>
        <p class="muted">${escapeHtml(workflow.purpose)}</p>
      </div>
      <div class="metric-grid">
        <div class="metric"><strong>${project.current_version_id}</strong><span>${t("version")}</span></div>
        <div class="metric"><strong>${project.active_version_id || "-"}</strong><span>${t("live")}</span></div>
        <div class="metric"><strong>${version.records.length}</strong><span>${t("records")}</span></div>
      </div>
      <div class="actions">
        <button data-open-preview ${!project.preview_url ? "disabled" : ""}>${t("openPreview")}</button>
        <button data-open-live ${!project.published_url ? "disabled" : ""}>${t("openLive")}</button>
        <button data-start-preview ${project.status === "awaiting_builder_confirmation" ? "disabled" : ""}>${t("preview")}</button>
        <button class="primary" data-publish ${project.status !== "previewing" ? "disabled" : ""}>${t("publish")}</button>
        <button data-share ${!project.active_version_id ? "disabled" : ""}>${t("share")}</button>
        <button data-rollback ${project.versions.length < 2 ? "disabled" : ""}>${t("rollback")}</button>
      </div>
      <p class="status-note">${lifecycleHint(project)}</p>
    </div>
    <div class="tabs">
      ${["data", "schema", "versions", "codeSource"].map((tab) => `<button data-tab="${tab}" class="${state.tab === tab ? "active" : ""}">${t(tab)}</button>`).join("")}
    </div>
    ${state.tab === "data" ? renderData(version) : state.tab === "schema" ? renderSchema(workflow) : state.tab === "versions" ? renderVersions(project) : renderCodeSource(version)}
  `;
}

function renderData(version) {
  return `
    <table class="table">
      <thead><tr><th>${t("records")}</th><th>${t("owner")}</th><th>${t("stage")}</th></tr></thead>
      <tbody>
        ${version.records.map((record) => `<tr><td>${escapeHtml(record.title)}</td><td>${escapeHtml(record.owner)}</td><td>${escapeHtml(record.stage)}</td></tr>`).join("")}
      </tbody>
    </table>
  `;
}

function renderSchema(workflow) {
  return `
    <table class="table">
      <thead><tr><th>${t("fields")}</th><th>${t("type")}</th><th>${t("required")}</th></tr></thead>
      <tbody>
        ${workflow.fields.map((field) => `<tr><td>${escapeHtml(field.label)}</td><td>${field.type}</td><td>${field.required ? t("yes") : t("no")}</td></tr>`).join("")}
      </tbody>
    </table>
    <div style="height:12px"></div>
    <table class="table">
      <thead><tr><th>${t("actions")}</th><th>${t("from")}</th><th>${t("to")}</th><th>${t("role")}</th></tr></thead>
      <tbody>
        ${workflow.actions.map((action) => `<tr><td>${escapeHtml(action.label)}</td><td>${action.from_stage}</td><td>${action.to_stage}</td><td>${action.required_role}</td></tr>`).join("")}
      </tbody>
    </table>
  `;
}

function renderVersions(project) {
  return `
    <table class="table">
      <thead><tr><th>${t("version")}</th><th>${t("fields")}</th><th>${t("stages")}</th><th>${t("records")}</th></tr></thead>
      <tbody>
        ${project.versions.map((version) => `<tr><td>${version.version_id}</td><td>${version.source.workflow.fields.length}</td><td>${version.source.workflow.stages.length}</td><td>${version.records.length}</td></tr>`).join("")}
      </tbody>
    </table>
  `;
}

function renderCodeSource(version) {
  return `
    <details open class="source-card">
      <summary>src/app.ts</summary>
      <pre>${escapeHtml(version.source.app_code || "")}</pre>
    </details>
  `;
}

function renderWorkbench(project) {
  const pending = project.pending_evolution;
  const shares = state.snapshot.shares.filter((share) => share.app_id === project.app_id);
  return `
    <form class="form-grid" data-request-evolution>
      <label>${t("originalRequest")}<textarea name="message">${t("defaultMessage")}</textarea></label>
      <button class="primary" type="submit" ${project.status === "awaiting_builder_confirmation" || state.busy ? "disabled" : ""}>${t("askAgent")}</button>
    </form>
    ${pending ? `
      <article class="proposal-card">
        <div>
          <p class="eyebrow">${t("interpretation")}</p>
          <p>${escapeHtml(pending.interpretation)}</p>
        </div>
        <div>
          <p class="eyebrow">${t("proposal")}</p>
          <h3>${escapeHtml(pending.summary)}</h3>
        </div>
        <div>
          <p class="eyebrow">${t("highlights")}</p>
          <ul class="highlight-list">${pending.highlights.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>
        </div>
        <div>
          <p class="eyebrow">${t("dataImpact")}</p>
          <p>${escapeHtml(pending.data_impact)}</p>
        </div>
        <details open>
          <summary>${t("diff")}</summary>
          <pre>${escapeHtml(pending.diff)}</pre>
        </details>
        <details open>
          <summary>${t("agentLogs")} · ${escapeHtml(pending.agent_mode)}</summary>
          <div class="log-list">
            ${(pending.agent_logs || []).map((entry) => `
              <div class="log-entry ${entry.kind}">
                <strong>${escapeHtml(entry.kind)}</strong>
                <span>${new Date(entry.at_ms).toLocaleTimeString()}</span>
                <p>${escapeHtml(entry.text)}</p>
              </div>
            `).join("")}
          </div>
        </details>
        <button class="primary" data-approve>${t("approve")}</button>
      </article>
    ` : `<article class="proposal-card"><p class="muted">${t("noProposal")}</p></article>`}
    <article class="proposal-card">
      <p class="eyebrow">${t("share")}</p>
      ${shares.length ? shares.map((share) => `
        <div class="app-card">
          <strong>${escapeHtml(share.manifest.app_name)} · ${share.version_id}</strong>
          <button data-fork="${share.artifact_id}">${t("fork")}</button>
        </div>
      `).join("") : `<p class="muted">${t("emptyShares")}</p>`}
    </article>
  `;
}

function lifecycleHint(project) {
  if (project.status === "awaiting_builder_confirmation") return t("pendingConfirmation");
  if (project.status === "ready_to_preview" || project.status === "draft") return t("previewRequired");
  if (project.status === "previewing") return t("readyToPublish");
  if (project.status === "published") return t("published");
  return project.last_block_reason || t("blocked");
}

function bindEvents() {
  document.querySelectorAll("[data-lang]").forEach((button) => {
    button.addEventListener("click", () => {
      state.lang = button.dataset.lang;
      const url = new URL(location.href);
      url.searchParams.set("lang", state.lang);
      history.replaceState(null, "", url);
      render();
    });
  });
  document.querySelector("[data-select-project]")?.addEventListener("change", (event) => {
    state.selectedAppId = event.target.value || null;
    render();
  });
  document.querySelector("[data-create-project]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await safeAction(async () => {
      const data = new FormData(event.currentTarget);
      const project = await api("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: data.get("name"),
          goal: data.get("goal"),
          template_id: data.get("template_id"),
          builder_subject: "user:bob",
        }),
      });
      state.selectedAppId = project.app_id;
      await refresh();
    });
  });
  document.querySelector("[data-request-evolution]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await safeAction(async () => {
      const project = selectedProject();
      const data = new FormData(event.currentTarget);
      state.busy = t("askingAgent");
      render();
      await api(`/api/projects/${project.app_id}/evolution/request`, {
        method: "POST",
        body: JSON.stringify({ message: data.get("message"), builder_subject: project.builder_subject }),
      });
      state.busy = null;
      await refresh();
    });
  });
  document.querySelector("[data-approve]")?.addEventListener("click", async () => {
    await safeAction(async () => {
      const project = selectedProject();
      await api(`/api/projects/${project.app_id}/evolution/approve`, { method: "POST", body: JSON.stringify({ subject: project.builder_subject }) });
      await refresh();
    });
  });
  document.querySelector("[data-start-preview]")?.addEventListener("click", async () => {
    await safeAction(async () => {
      const project = selectedProject();
      await api(`/api/projects/${project.app_id}/preview/start`, { method: "POST" });
      await refresh();
    });
  });
  document.querySelector("[data-publish]")?.addEventListener("click", async () => {
    await safeAction(async () => {
      const project = selectedProject();
      await api(`/api/projects/${project.app_id}/publish`, { method: "POST" });
      await refresh();
    });
  });
  document.querySelector("[data-share]")?.addEventListener("click", async () => {
    await safeAction(async () => {
      const project = selectedProject();
      await api(`/api/projects/${project.app_id}/share`, { method: "POST" });
      await refresh();
    });
  });
  document.querySelector("[data-rollback]")?.addEventListener("click", async () => {
    await safeAction(async () => {
      const project = selectedProject();
      await api(`/api/projects/${project.app_id}/rollback`, { method: "POST" });
      await refresh();
    });
  });
  document.querySelector("[data-open-preview]")?.addEventListener("click", () => {
    const project = selectedProject();
    if (project?.preview_url) window.open(`${project.preview_url}&lang=${state.lang}`, "_blank");
  });
  document.querySelector("[data-open-live]")?.addEventListener("click", () => {
    const project = selectedProject();
    if (project?.published_url) window.open(`${project.published_url}?lang=${state.lang}`, "_blank");
  });
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.tab = button.dataset.tab;
      render();
    });
  });
  document.querySelectorAll("[data-fork]").forEach((button) => {
    button.addEventListener("click", async () => {
      const fork = await api("/api/forks", {
        method: "POST",
        body: JSON.stringify({ artifact_id: button.dataset.fork, name: "Partner Intake Portal", builder_subject: "user:charlie" }),
      });
      state.selectedAppId = fork.app_id;
      await refresh();
    }).catch((err) => {
      state.notice = err.message;
      render();
    });
  });
}

async function safeAction(fn) {
  try {
    await fn();
  } catch (err) {
    state.busy = null;
    state.notice = err instanceof Error ? err.message : String(err);
    render();
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char] ?? char);
}

refresh().catch((err) => {
  root.innerHTML = `<pre>${escapeHtml(err.stack || err.message)}</pre>`;
});
