import React, { useCallback, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  Box,
  Check,
  ChevronDown,
  CircleAlert,
  ClipboardList,
  Code2,
  Database,
  ExternalLink,
  FileText,
  FolderOpen,
  GitBranch,
  History,
  Languages,
  Layers3,
  Loader2,
  Play,
  Plus,
  Rocket,
  RotateCcw,
  Send,
  Share2,
  ShieldCheck,
  SquareCheckBig,
} from "lucide-react";

type Lang = "en" | "zh";
type TabKey = "data" | "schema" | "versions" | "codeSource";

const initialLang: Lang = new URLSearchParams(location.search).get("lang") === "zh" ? "zh" : "en";

const copy = {
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
    resetData: "Reset data",
    resetDone: "Demo data reset.",
    agentLogs: "Agent work log",
    codeSource: "Generated source",
    directories: "Workspace directories",
    hostExampleSource: "Host example source",
    hostExampleSourceHelp: "The Creation Host implementation for this example.",
    generatedSource: "Current generated source",
    generatedSourceHelp: "The source tree that becomes the next generated application version.",
    draftWorkspace: "Agent draft workspace",
    draftWorkspaceHelp: "The isolated draft tree where the code agent writes before Builder approval.",
    activePublishedData: "Active published data",
    activePublishedDataHelp: "The data directory used by the current published version.",
    versionData: "Version data",
    versionDataHelp: "Per-version data snapshot for comparing releases and rollback behavior.",
    openInCode: "Code",
    openInFinder: "Finder",
    askingAgent: "Real code agent is editing the draft workspace...",
    chooseProject: "Choose project",
    sourceBoundary: "Source boundary",
    templateVendor: "Vendor intake",
    templateIncident: "Incident review",
    templateHiring: "Hiring loop",
    templateVendorDesc: "Purchasing, vendor risk, legal review.",
    templateIncidentDesc: "Triage, investigation, postmortem.",
    templateHiringDesc: "Candidate review and panel flow.",
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
    resetData: "重置数据",
    resetDone: "演示数据已重置。",
    agentLogs: "Agent 工作日志",
    codeSource: "生成源码",
    directories: "工作区目录",
    hostExampleSource: "Host 示例源码",
    hostExampleSourceHelp: "这个 Creation Host example 自身的实现代码。",
    generatedSource: "当前生成应用源码",
    generatedSourceHelp: "会进入下一版 Generated Application 的 source tree。",
    draftWorkspace: "Agent 草稿工作区",
    draftWorkspaceHelp: "Code agent 在 Builder 批准前写入的隔离草稿目录。",
    activePublishedData: "当前线上数据",
    activePublishedDataHelp: "当前 Published Application 版本使用的数据目录。",
    versionData: "版本数据",
    versionDataHelp: "每个版本自己的数据快照，用来比较 release 和 rollback 行为。",
    openInCode: "代码",
    openInFinder: "Finder",
    askingAgent: "真实 code agent 正在修改 draft workspace...",
    chooseProject: "选择项目",
    sourceBoundary: "源码边界",
    templateVendor: "供应商准入",
    templateIncident: "事故复盘",
    templateHiring: "招聘流程",
    templateVendorDesc: "采购、供应商风险、法务评审。",
    templateIncidentDesc: "分诊、调查、复盘。",
    templateHiringDesc: "候选人评审与面试流转。",
  },
} as const;

const templates = [
  { id: "vendor_intake", titleKey: "templateVendor", descKey: "templateVendorDesc", icon: ClipboardList },
  { id: "incident_review", titleKey: "templateIncident", descKey: "templateIncidentDesc", icon: CircleAlert },
  { id: "hiring_loop", titleKey: "templateHiring", descKey: "templateHiringDesc", icon: SquareCheckBig },
] as const;

function App() {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [snapshot, setSnapshot] = useState<any>(null);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("data");
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [templateId, setTemplateId] = useState("vendor_intake");

  const t = useCallback((key: keyof typeof copy.en) => copy[lang][key], [lang]);
  const selectedProject = useMemo(
    () => snapshot?.projects.find((project: any) => project.app_id === selectedAppId) ?? null,
    [snapshot, selectedAppId],
  );

  const refresh = useCallback(async () => {
    const next = await api("/api/state");
    setSnapshot(next);
    setSelectedAppId((current) => {
      if (current && next.projects.some((project: any) => project.app_id === current)) return current;
      return next.projects[0]?.app_id ?? null;
    });
  }, []);

  React.useEffect(() => {
    void refresh().catch((err) => setNotice(err instanceof Error ? err.message : String(err)));
  }, [refresh]);

  const setLanguage = (next: Lang) => {
    setLang(next);
    const url = new URL(location.href);
    url.searchParams.set("lang", next);
    history.replaceState(null, "", url);
  };

  const safeAction = async (fn: () => Promise<void>) => {
    try {
      await fn();
      setNotice(null);
    } catch (err) {
      setBusy(null);
      setNotice(err instanceof Error ? err.message : String(err));
    }
  };

  const resetData = async () => {
    try {
      setBusy(null);
      const next = await api("/api/reset", { method: "POST" });
      setSnapshot(next);
      setSelectedAppId(null);
      setTab("data");
      setNotice(t("resetDone"));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  };

  const projectOptions = (snapshot?.projects ?? []).map((project: any) => ({
    value: project.app_id,
    label: project.name,
    meta: `${project.status} · ${project.current_version_id}`,
  }));

  return (
    <div className="shell">
      <header className="topbar">
        <div className="brand">
          <p className="eyebrow">{t("eyebrow")}</p>
          <h1>{t("title")}</h1>
        </div>
        <ProjectSwitcher
          label={t("project")}
          placeholder={t("noProject")}
          value={selectedAppId ?? ""}
          options={projectOptions}
          onChange={(value) => setSelectedAppId(value || null)}
        />
        <div className="top-actions">
          <button className="toolbar-button" type="button" onClick={resetData} disabled={Boolean(busy)}>
            <RotateCcw size={15} />{t("resetData")}
          </button>
          <span className="mode-chip"><ShieldCheck size={14} />{t("agentMode")}: {snapshot?.agent_mode ?? "deterministic"}</span>
          <div className="language" aria-label="Language">
            <Languages size={15} />
            <button onClick={() => setLanguage("en")} className={lang === "en" ? "active" : ""}>EN</button>
            <button onClick={() => setLanguage("zh")} className={lang === "zh" ? "active" : ""}>中文</button>
          </div>
        </div>
      </header>
      <main className="workspace">
        <section className="pane">
          <div className="pane-header">
            <div>
              <p className="eyebrow">{t("generatedApp")}</p>
              <h2>{selectedProject ? selectedProject.name : t("createTitle")}</h2>
            </div>
            {selectedProject ? <span className="pill">{selectedProject.status}</span> : null}
          </div>
          <div className="pane-body">
            {selectedProject
              ? <ProjectView project={selectedProject} tab={tab} setTab={setTab} t={t} safeAction={safeAction} refresh={refresh} />
              : <CreateProject t={t} templateId={templateId} setTemplateId={setTemplateId} safeAction={safeAction} refresh={refresh} setSelectedAppId={setSelectedAppId} />}
          </div>
        </section>
        <section className="pane">
          <div className="pane-header">
            <div>
              <p className="eyebrow">{t("builderWorkbench")}</p>
              <h2>{t("proposal")}</h2>
            </div>
          </div>
          <div className="pane-body conversation">
            {notice ? <div className="notice error">{notice}</div> : null}
            {busy ? <div className="notice loading"><Loader2 size={16} className="spin" />{busy}</div> : null}
            {selectedProject
              ? (
                <Workbench
                  project={selectedProject}
                  shares={(snapshot?.shares ?? []).filter((share: any) => share.app_id === selectedProject.app_id)}
                  t={t}
                  lang={lang}
                  busy={busy}
                  setBusy={setBusy}
                  setSelectedAppId={setSelectedAppId}
                  safeAction={safeAction}
                  refresh={refresh}
                />
              )
              : <p className="muted">{t("noSelection")}</p>}
          </div>
        </section>
      </main>
    </div>
  );
}

function ProjectSwitcher({ label, placeholder, value, options, onChange }: {
  label: string;
  placeholder: string;
  value: string;
  options: readonly { value: string; label: string; meta: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = options.find((option) => option.value === value);
  return (
    <div className="select-field">
      <span className="select-label">{label}</span>
      <div className="select-root">
        <button
          type="button"
          className="select-trigger"
          onClick={() => setOpen((current) => !current)}
          aria-expanded={open}
        >
          <Box size={18} />
          <span className="select-copy">
            <strong>{selected?.label ?? placeholder}</strong>
            {selected ? <small>{selected.meta}</small> : null}
          </span>
          <ChevronDown size={18} className={open ? "chevron open" : "chevron"} />
        </button>
        {open ? (
          <div className="select-popover" role="listbox">
            {options.length === 0 ? <div className="select-empty">{placeholder}</div> : null}
            {options.map((option) => (
              <button
                type="button"
                key={option.value}
                className={option.value === value ? "select-option active" : "select-option"}
                onClick={() => {
                  onChange(option.value);
                  setOpen(false);
                }}
              >
                <span className="check-slot">{option.value === value ? <Check size={16} /> : null}</span>
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.meta}</small>
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CreateProject({ t, templateId, setTemplateId, safeAction, refresh, setSelectedAppId }: any) {
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await safeAction(async () => {
      const data = new FormData(event.currentTarget);
      const project = await api("/api/projects", {
        method: "POST",
        body: JSON.stringify({
          name: data.get("name"),
          goal: data.get("goal"),
          template_id: templateId,
          builder_subject: "user:bob",
        }),
      });
      setSelectedAppId(project.app_id);
      await refresh();
    });
  };
  return (
    <div className="create-grid">
      <div className="intro-copy">
        <h3>{t("createTitle")}</h3>
        <p className="muted">{t("createBody")}</p>
      </div>
      <form className="form-grid" onSubmit={submit}>
        <label>{t("name")}<input name="name" defaultValue={t("defaultName")} /></label>
        <label>{t("goal")}<textarea name="goal" defaultValue={t("defaultGoal")} /></label>
        <div className="template-grid" role="radiogroup" aria-label={t("template")}>
          {templates.map((template) => {
            const Icon = template.icon;
            const active = templateId === template.id;
            return (
              <button
                type="button"
                key={template.id}
                className={active ? "template-card active" : "template-card"}
                onClick={() => setTemplateId(template.id)}
              >
                <Icon size={18} />
                <span>
                  <strong>{t(template.titleKey)}</strong>
                  <small>{t(template.descKey)}</small>
                </span>
                {active ? <Check size={16} /> : null}
              </button>
            );
          })}
        </div>
        <button className="primary" type="submit"><Plus size={17} />{t("create")}</button>
      </form>
    </div>
  );
}

function ProjectView({ project, tab, setTab, t, safeAction, refresh }: any) {
  const version = project.current_version;
  if (!version) return <p className="muted">{t("noSelection")}</p>;
  const workflow = version.source.workflow;
  const action = (path: string) => safeAction(async () => {
    await api(path, { method: "POST" });
    await refresh();
  });
  return (
    <>
      <div className="app-card">
        <div>
          <p className="eyebrow">{workflow.entity.plural}</p>
          <h2>{workflow.title}</h2>
          <p className="muted">{workflow.purpose}</p>
        </div>
        <div className="metric-grid">
          <Metric value={project.current_version_id} label={t("version")} />
          <Metric value={project.active_version_id || "-"} label={t("live")} />
          <Metric value={version.records.length} label={t("records")} />
        </div>
        <div className="actions">
          <ActionButton icon={ExternalLink} label={t("openPreview")} disabled={!project.preview_url} onClick={() => project.preview_url && window.open(`${project.preview_url}&lang=${currentLang()}`, "_blank")} />
          <ActionButton icon={ExternalLink} label={t("openLive")} disabled={!project.published_url} onClick={() => project.published_url && window.open(`${project.published_url}?lang=${currentLang()}`, "_blank")} />
          <ActionButton icon={Play} label={t("preview")} disabled={project.status === "awaiting_builder_confirmation"} onClick={() => action(`/api/projects/${project.app_id}/preview/start`)} />
          <ActionButton icon={Rocket} label={t("publish")} primary disabled={project.status !== "previewing"} onClick={() => action(`/api/projects/${project.app_id}/publish`)} />
          <ActionButton icon={Share2} label={t("share")} disabled={!project.active_version_id} onClick={() => action(`/api/projects/${project.app_id}/share`)} />
          <ActionButton icon={RotateCcw} label={t("rollback")} disabled={project.versions.length < 2} onClick={() => action(`/api/projects/${project.app_id}/rollback`)} />
        </div>
        <p className="status-note">{lifecycleHint(project, t)}</p>
      </div>
      <div className="tabs">
        {[
          ["data", Database],
          ["schema", Code2],
          ["versions", History],
          ["codeSource", FileText],
        ].map(([key, Icon]: any) => (
          <button key={key} onClick={() => setTab(key)} className={tab === key ? "active" : ""}>
            <Icon size={15} />{t(key)}
          </button>
        ))}
      </div>
      {tab === "data" ? <DataTable version={version} t={t} /> : null}
      {tab === "schema" ? <SchemaView workflow={workflow} t={t} /> : null}
      {tab === "versions" ? <VersionsView project={project} t={t} /> : null}
      {tab === "codeSource" ? (
        <>
          <DirectoryTools project={project} t={t} safeAction={safeAction} />
          <SourceView version={version} />
        </>
      ) : null}
    </>
  );
}

function Workbench({ project, shares, t, lang, busy, setBusy, setSelectedAppId, safeAction, refresh }: any) {
  const pending = project.pending_evolution;
  const request = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await safeAction(async () => {
      const data = new FormData(event.currentTarget);
      setBusy(t("askingAgent"));
      await api(`/api/projects/${project.app_id}/evolution/request`, {
        method: "POST",
        body: JSON.stringify({ message: data.get("message"), builder_subject: project.builder_subject }),
      });
      setBusy(null);
      await refresh();
    });
  };
  const approve = () => safeAction(async () => {
    await api(`/api/projects/${project.app_id}/evolution/approve`, {
      method: "POST",
      body: JSON.stringify({ subject: project.builder_subject }),
    });
    await refresh();
  });
  return (
    <>
      <form className="form-grid request-card" onSubmit={request}>
        <label>{t("originalRequest")}<textarea name="message" defaultValue={t("defaultMessage")} /></label>
        <button className="primary" type="submit" disabled={project.status === "awaiting_builder_confirmation" || Boolean(busy)}>
          {busy ? <Loader2 size={17} className="spin" /> : <Send size={17} />}{t("askAgent")}
        </button>
      </form>
      {pending ? (
        <article className="proposal-card">
          <Section title={t("interpretation")}><p>{pending.interpretation}</p></Section>
          <Section title={t("proposal")}><h3>{pending.summary}</h3></Section>
          <Section title={t("highlights")}>
            <ul className="highlight-list">{pending.highlights.map((item: string) => <li key={item}>{item}</li>)}</ul>
          </Section>
          <Section title={t("dataImpact")}><p>{pending.data_impact}</p></Section>
          <Details title={t("diff")}><pre>{pending.diff}</pre></Details>
          <Details title={`${t("agentLogs")} · ${pending.agent_mode}`}>
            <div className="log-list">
              {(pending.agent_logs || []).map((entry: any, index: number) => (
                <div className={`log-entry ${entry.kind}`} key={`${entry.kind}-${entry.at_ms}-${index}`}>
                  <strong>{entry.kind}</strong>
                  <span>{new Date(entry.at_ms).toLocaleTimeString()}</span>
                  <p>{entry.text}</p>
                </div>
              ))}
            </div>
          </Details>
          <button className="primary" onClick={approve}><ShieldCheck size={17} />{t("approve")}</button>
        </article>
      ) : <article className="proposal-card"><p className="muted">{t("noProposal")}</p></article>}
      <article className="proposal-card">
        <p className="eyebrow">{t("share")}</p>
        {shares.length ? shares.map((share: any) => (
          <div className="share-row" key={share.artifact_id}>
            <div><strong>{share.manifest.app_name}</strong><small>{share.version_id}</small></div>
            <button onClick={() => forkArtifact(share.artifact_id, setSelectedAppId, refresh)}><GitBranch size={16} />{t("fork")}</button>
          </div>
        )) : <p className="muted">{t("emptyShares")}</p>}
      </article>
    </>
  );
}

function Metric({ value, label }: { value: string | number; label: string }) {
  return <div className="metric"><strong>{value}</strong><span>{label}</span></div>;
}

function ActionButton({ icon: Icon, label, disabled, primary, onClick }: any) {
  return <button type="button" className={primary ? "primary" : ""} disabled={disabled} onClick={onClick}><Icon size={16} />{label}</button>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><p className="eyebrow">{title}</p>{children}</div>;
}

function Details({ title, children }: { title: string; children: React.ReactNode }) {
  return <details open><summary>{title}</summary>{children}</details>;
}

function DataTable({ version, t }: any) {
  return (
    <table className="table">
      <thead><tr><th>{t("records")}</th><th>{t("owner")}</th><th>{t("stage")}</th></tr></thead>
      <tbody>{version.records.map((record: any) => <tr key={record.id}><td>{record.title}</td><td>{record.owner}</td><td>{record.stage}</td></tr>)}</tbody>
    </table>
  );
}

function SchemaView({ workflow, t }: any) {
  return (
    <>
      <table className="table">
        <thead><tr><th>{t("fields")}</th><th>{t("type")}</th><th>{t("required")}</th></tr></thead>
        <tbody>{workflow.fields.map((field: any) => <tr key={field.id}><td>{field.label}</td><td>{field.type}</td><td>{field.required ? t("yes") : t("no")}</td></tr>)}</tbody>
      </table>
      <div className="table-spacer" />
      <table className="table">
        <thead><tr><th>{t("actions")}</th><th>{t("from")}</th><th>{t("to")}</th><th>{t("role")}</th></tr></thead>
        <tbody>{workflow.actions.map((action: any) => <tr key={action.id}><td>{action.label}</td><td>{action.from_stage}</td><td>{action.to_stage}</td><td>{action.required_role}</td></tr>)}</tbody>
      </table>
    </>
  );
}

function VersionsView({ project, t }: any) {
  return (
    <table className="table">
      <thead><tr><th>{t("version")}</th><th>{t("fields")}</th><th>{t("stages")}</th><th>{t("records")}</th></tr></thead>
      <tbody>{project.versions.map((version: any) => <tr key={version.version_id}><td>{version.version_id}</td><td>{version.source.workflow.fields.length}</td><td>{version.source.workflow.stages.length}</td><td>{version.records.length}</td></tr>)}</tbody>
    </table>
  );
}

function SourceView({ version }: any) {
  return <details open className="source-card"><summary>src/app.ts</summary><pre>{version.source.app_code || ""}</pre></details>;
}

function DirectoryTools({ project, t, safeAction }: any) {
  const rows = [
    {
      target: "example",
      label: t("hostExampleSource"),
      help: t("hostExampleSourceHelp"),
      enabled: true,
    },
    {
      target: "source",
      label: t("generatedSource"),
      help: t("generatedSourceHelp"),
      app_id: project.app_id,
      enabled: true,
    },
    {
      target: "draft",
      label: t("draftWorkspace"),
      help: t("draftWorkspaceHelp"),
      app_id: project.app_id,
      enabled: Boolean(project.pending_evolution) || project.versions.length > 1,
    },
    {
      target: "active_data",
      label: t("activePublishedData"),
      help: t("activePublishedDataHelp"),
      app_id: project.app_id,
      enabled: Boolean(project.active_version_id),
    },
    ...project.versions.map((version: any) => ({
      target: "version_data",
      label: `${t("versionData")} ${version.version_id}`,
      help: t("versionDataHelp"),
      app_id: project.app_id,
      version_id: version.version_id,
      enabled: true,
    })),
  ];

  const open = (row: any, opener: "code" | "finder") => safeAction(async () => {
    await api("/api/open-path", {
      method: "POST",
      body: JSON.stringify({
        target: row.target,
        opener,
        app_id: row.app_id,
        version_id: row.version_id,
      }),
    });
  });

  return (
    <section className="directory-tools">
      <div>
        <p className="eyebrow">{t("directories")}</p>
      </div>
      <div className="directory-list">
        {rows.map((row: any) => (
          <div className={row.enabled ? "directory-row" : "directory-row disabled"} key={`${row.target}-${row.version_id ?? "current"}`}>
            <div>
              <strong>{row.label}</strong>
              <small>{row.help}</small>
            </div>
            <div className="directory-actions">
              <button type="button" disabled={!row.enabled} onClick={() => open(row, "code")}>
                <Code2 size={15} />{t("openInCode")}
              </button>
              <button type="button" disabled={!row.enabled} onClick={() => open(row, "finder")}>
                <FolderOpen size={15} />{t("openInFinder")}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function lifecycleHint(project: any, t: any) {
  if (project.status === "awaiting_builder_confirmation") return t("pendingConfirmation");
  if (project.status === "ready_to_preview" || project.status === "draft") return t("previewRequired");
  if (project.status === "previewing") return t("readyToPublish");
  if (project.status === "published") return t("published");
  return project.last_block_reason || t("blocked");
}

async function forkArtifact(artifactId: string, setSelectedAppId: (id: string) => void, refresh: () => Promise<void>) {
  const fork = await api("/api/forks", {
    method: "POST",
    body: JSON.stringify({ artifact_id: artifactId, name: "Partner Intake Portal", builder_subject: "user:charlie" }),
  });
  setSelectedAppId(fork.app_id);
  await refresh();
}

async function api(path: string, options: RequestInit = {}) {
  const response = await fetch(path, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}

function currentLang(): Lang {
  return new URLSearchParams(location.search).get("lang") === "zh" ? "zh" : "en";
}

createRoot(document.querySelector("#app")!).render(<App />);
