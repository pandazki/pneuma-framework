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
    agentProgress: "Live agent progress",
    agentProgressSummary: "Progress summary",
    rawAgentLogs: "Raw backend log",
    rawAgentLogsHelp: "Keep raw stdout, stderr, and tool events available for inspection without making them the main Builder surface.",
    progressWorkspace: "Prepare draft workspace",
    progressBackend: "Start code agent",
    progressRead: "Inspect generated source",
    progressEdit: "Edit controlled source",
    progressVerify: "Verify draft",
    progressProposal: "Build proposal",
    progressDone: "Completed",
    progressWaiting: "Waiting",
    progressWarnings: "Warnings are available in the raw log.",
    proposalReady: "Proposal is ready for Builder approval.",
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
    agentProgress: "实时 agent 进度",
    agentProgressSummary: "进度摘要",
    rawAgentLogs: "原始后端日志",
    rawAgentLogsHelp: "保留 stdout、stderr 和 tool event 供检查，但不让它们成为 Builder 主界面。",
    progressWorkspace: "准备草稿工作区",
    progressBackend: "启动 code agent",
    progressRead: "检查生成源码",
    progressEdit: "修改受控源码",
    progressVerify: "验证草稿",
    progressProposal: "生成提案",
    progressDone: "已完成",
    progressWaiting: "等待中",
    progressWarnings: "原始日志中有 warning 可检查。",
    proposalReady: "提案已准备好，等待 Builder 批准。",
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
    meta: `${formatProjectStatus(project.status, lang)} · ${project.current_version_id}`,
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
            {selectedProject ? <span className="pill">{formatProjectStatus(selectedProject.status, lang)}</span> : null}
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
          <p className="eyebrow">{formatGeneratedText(workflow.entity.plural, currentLang())}</p>
          <h2>{workflow.title}</h2>
          <p className="muted">{formatGeneratedText(workflow.purpose, currentLang())}</p>
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
  const [liveStatus, setLiveStatus] = useState<string | null>(null);
  const [liveLogs, setLiveLogs] = useState<any[]>([]);
  const request = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await safeAction(async () => {
      const data = new FormData(event.currentTarget);
      setBusy(t("askingAgent"));
      setLiveStatus(t("askingAgent"));
      setLiveLogs([]);
      try {
        await streamEvolutionRequest(`/api/projects/${project.app_id}/evolution/request`, {
          message: data.get("message"),
          builder_subject: project.builder_subject,
          stream: true,
        }, {
          onStatus: (status) => setLiveStatus(status.text ?? t("askingAgent")),
          onProgress: (progress) => {
            if (progress.kind !== "log") return;
            setLiveLogs((current) => {
              if (progress.replace_previous && current.length > 0) {
                return [...current.slice(0, -1), progress.entry];
              }
              return [...current, progress.entry];
            });
          },
        });
        setLiveStatus(t("proposalReady"));
      } finally {
        setBusy(null);
      }
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
        <label>
          {t("originalRequest")}
          <textarea
            key={pending?.proposal_id ?? project.app_id}
            name="message"
            defaultValue={pending?.builder_message ?? t("defaultMessage")}
            disabled={project.status === "awaiting_builder_confirmation" || Boolean(busy)}
          />
        </label>
        <button className="primary" type="submit" disabled={project.status === "awaiting_builder_confirmation" || Boolean(busy)}>
          {busy ? <Loader2 size={17} className="spin" /> : <Send size={17} />}{t("askAgent")}
        </button>
      </form>
      {!pending && (liveStatus || liveLogs.length > 0) ? (
        <article className="proposal-card live-agent-card">
          <div className="live-agent-header">
            <p className="eyebrow">{t("agentProgress")}</p>
            {busy ? <Loader2 size={16} className="spin" /> : <Check size={16} />}
          </div>
          <AgentProgressPanel entries={liveLogs} statusText={liveStatus} done={!busy && liveLogs.length > 0} t={t} />
          <Details title={t("rawAgentLogs")} open={false} help={t("rawAgentLogsHelp")}>
            <LogList entries={liveLogs} raw />
          </Details>
        </article>
      ) : null}
      {pending ? (
        <article className="proposal-card">
          <AgentProgressPanel entries={pending.agent_logs || []} statusText={`${t("proposalReady")} · ${pending.agent_mode}`} done t={t} />
          <Section title={t("interpretation")}><p>{formatInterpretation(pending, lang)}</p></Section>
          <Section title={t("proposal")}><h3>{formatProposalText(pending.summary, lang)}</h3></Section>
          <Section title={t("highlights")}>
            <ul className="highlight-list">{pending.highlights.map((item: string) => <li key={item}>{formatProposalText(item, lang)}</li>)}</ul>
          </Section>
          <Section title={t("dataImpact")}><p>{formatProposalText(pending.data_impact, lang)}</p></Section>
          <Details title={t("diff")}><pre>{pending.diff}</pre></Details>
          <Details title={`${t("agentLogs")} · ${pending.agent_mode}`} open={false} help={t("rawAgentLogsHelp")}>
            <LogList entries={pending.agent_logs || []} raw />
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

type Translator = (key: keyof typeof copy.en) => string;

function AgentProgressPanel({ entries, statusText, done, t }: {
  entries: readonly any[];
  statusText?: string | null;
  done?: boolean;
  t: Translator;
}) {
  const steps = summarizeAgentProgress(entries, done, t);
  const warnings = entries.filter(isWarningLog).length;
  return (
    <div className="agent-progress-panel">
      <div className="progress-copy">
        <p className="eyebrow">{t("agentProgressSummary")}</p>
        {statusText ? <p className="muted">{statusText}</p> : null}
        {warnings > 0 ? <p className="progress-warning">{t("progressWarnings")}</p> : null}
      </div>
      <ol className="progress-steps">
        {steps.map((step) => (
          <li className={`progress-step ${step.status}`} key={step.id}>
            <span className="progress-dot">{step.status === "done" ? <Check size={13} /> : null}</span>
            <span>
              <strong>{step.label}</strong>
              <small>{step.detail}</small>
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Details({ title, children, open = true, help }: {
  title: string;
  children: React.ReactNode;
  open?: boolean;
  help?: string;
}) {
  return (
    <details open={open} className="details-card">
      <summary>{title}</summary>
      {help ? <p className="details-help">{help}</p> : null}
      {children}
    </details>
  );
}

function LogList({ entries, raw = false }: { entries: readonly any[]; raw?: boolean }) {
  if (entries.length === 0) return null;
  return (
    <div className={raw ? "log-list raw" : "log-list"}>
      {entries.map((entry: any, index: number) => (
        <div className={`log-entry ${displayLogKind(entry)}`} key={`${entry.kind}-${entry.at_ms}-${index}`}>
          <strong>{displayLogKind(entry)}</strong>
          <span>{new Date(entry.at_ms).toLocaleTimeString()}</span>
          <p>{entry.text}</p>
        </div>
      ))}
    </div>
  );
}

function summarizeAgentProgress(entries: readonly any[], done: boolean | undefined, t: Translator) {
  const joined = entries.map((entry) => String(entry.text ?? "")).join("\n");
  const definitions = [
    {
      id: "workspace",
      label: t("progressWorkspace"),
      match: /Draft workspace prepared|source boundary|Only src\/app\.ts/i,
    },
    {
      id: "backend",
      label: t("progressBackend"),
      match: /Starting Codex app-server|Codex thread started|Starting opencode|opencode session ready|Starting real opencode/i,
    },
    {
      id: "read",
      label: t("progressRead"),
      match: /sed -n|cat src\/app\.ts|Read|Inspect|context_snapshot|reasoning/i,
    },
    {
      id: "edit",
      label: t("progressEdit"),
      match: /src\/app\.ts|file change|file patch|writeFile|cat >|workflowPatch/i,
    },
    {
      id: "verify",
      label: t("progressVerify"),
      match: /Draft verification passed|draft verification|Building governed code-change review packet|review packet/i,
    },
    {
      id: "proposal",
      label: t("progressProposal"),
      match: /Proposal is ready|awaiting_builder_confirmation/i,
    },
  ];
  const matched = definitions.map((definition) => definition.match.test(joined));
  const lastMatched = matched.reduce((last, value, index) => value ? index : last, -1);
  const activeIndex = done
    ? definitions.length - 1
    : Math.max(0, Math.min(lastMatched + 1, definitions.length - 1));

  return definitions.map((definition, index) => ({
    id: definition.id,
    label: definition.label,
    status: done || index < activeIndex || matched[index] ? "done" : index === activeIndex ? "active" : "waiting",
    detail: done || index < activeIndex || matched[index]
      ? t("progressDone")
      : index === activeIndex
        ? t("askingAgent")
        : t("progressWaiting"),
  }));
}

function displayLogKind(entry: any): string {
  if (isWarningLog(entry)) return "warning";
  return typeof entry.kind === "string" ? entry.kind : "log";
}

function isWarningLog(entry: any): boolean {
  const kind = String(entry.kind ?? "");
  const text = String(entry.text ?? "");
  return kind === "warning"
    || (kind === "error" && /warning|configWarning|guardianWarning/i.test(text))
    || (kind === "tool" && /stderr:.*warning|warning:/i.test(text));
}

function DataTable({ version, t }: any) {
  const lang = currentLang();
  return (
    <table className="table">
      <thead><tr><th>{t("records")}</th><th>{t("owner")}</th><th>{t("stage")}</th></tr></thead>
      <tbody>{version.records.map((record: any) => <tr key={record.id}><td>{record.title}</td><td>{record.owner}</td><td>{formatGeneratedText(record.stage, lang)}</td></tr>)}</tbody>
    </table>
  );
}

function SchemaView({ workflow, t }: any) {
  const lang = currentLang();
  return (
    <>
      <table className="table">
        <thead><tr><th>{t("fields")}</th><th>{t("type")}</th><th>{t("required")}</th></tr></thead>
        <tbody>{workflow.fields.map((field: any) => <tr key={field.id}><td>{formatGeneratedText(field.label, lang)}</td><td>{field.type}</td><td>{field.required ? t("yes") : t("no")}</td></tr>)}</tbody>
      </table>
      <div className="table-spacer" />
      <table className="table">
        <thead><tr><th>{t("actions")}</th><th>{t("from")}</th><th>{t("to")}</th><th>{t("role")}</th></tr></thead>
        <tbody>{workflow.actions.map((action: any) => <tr key={action.id}><td>{formatGeneratedText(action.label, lang)}</td><td>{formatGeneratedText(action.from_stage, lang)}</td><td>{formatGeneratedText(action.to_stage, lang)}</td><td>{formatGeneratedText(action.required_role, lang)}</td></tr>)}</tbody>
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

function formatProjectStatus(status: string, lang: Lang): string {
  if (lang === "zh") {
    return ({
      draft: "草稿",
      ready_to_preview: "待预览",
      previewing: "预览中",
      awaiting_builder_confirmation: "等待批准",
      published: "已发布",
      blocked: "已阻塞",
    } as Record<string, string>)[status] ?? status;
  }
  return ({
    draft: "draft",
    ready_to_preview: "ready to preview",
    previewing: "previewing",
    awaiting_builder_confirmation: "awaiting approval",
    published: "published",
    blocked: "blocked",
  } as Record<string, string>)[status] ?? status;
}

function formatInterpretation(pending: any, lang: Lang): string {
  if (lang === "zh") {
    return `Agent 将 Builder 的需求理解为：${pending.builder_message}`;
  }
  return pending.interpretation;
}

function formatProposalText(text: string, lang: Lang): string {
  if (lang !== "zh") return text;
  return ({
    "Add legal review to the workflow before approval.": "在批准前加入法务评审流程。",
    "Add SLA tracking to the workflow.": "为流程加入 SLA 跟踪能力。",
    "Add fields: Contract value.": "新增字段：合同金额。",
    "Add fields: Due date, SLA status.": "新增字段：到期日期、SLA 状态。",
    "Add fields: SLA due date, SLA status.": "新增字段：SLA 到期日期、SLA 状态。",
    "Add stages: Legal review.": "新增阶段：法务评审。",
    "Add views: Legal queue.": "新增视图：法务队列。",
    "Carry existing records forward with defaults for new fields.": "保留已有记录，并为新增字段填充安全默认值。",
    "Existing records will be carried forward. New fields receive safe defaults. Stage ids are preserved unless the new workflow explicitly adds stages.": "已有记录会被安全迁移。新增字段会填充安全默认值；除非新 workflow 明确新增阶段，否则阶段 ID 会保持不变。",
  } as Record<string, string>)[text] ?? text;
}

function formatGeneratedText(text: string, lang: Lang): string {
  if (lang !== "zh") return text;
  if (text.includes("Adds optional SLA due date and status tracking plus an SLA watch queue for open vendor requests, without requiring changes to existing records.")) {
    return text.replace(
      "Adds optional SLA due date and status tracking plus an SLA watch queue for open vendor requests, without requiring changes to existing records.",
      "增加可选 SLA 到期日期、SLA 状态和 SLA 关注队列，同时不要求修改已有记录。",
    );
  }
  if (text.includes("Tracks due dates and SLA status so owners can see aging work before it slips.")) {
    return text.replace(
      "Tracks due dates and SLA status so owners can see aging work before it slips.",
      "跟踪到期日期和 SLA 状态，让负责人提前看到可能逾期的事项。",
    );
  }
  return ({
    "Vendor requests": "供应商请求",
    "Collect vendor requests, review risk, and approve onboarding.": "收集供应商请求、评估风险并批准准入。",
    "Collect vendor requests, review risk, and approve onboarding. Tracks due dates and SLA status so owners can see aging work before it slips.": "收集供应商请求、评估风险并批准准入。跟踪到期日期和 SLA 状态，让负责人提前看到可能逾期的事项。",
    "Collect vendor requests, review risk, and approve onboarding. Adds optional SLA due date and status tracking plus an SLA watch queue for open vendor requests, without requiring changes to existing records.": "收集供应商请求、评估风险并批准准入。增加可选 SLA 到期日期、SLA 状态和 SLA 关注队列，同时不要求修改已有记录。",
    "Tracks due dates and SLA status so owners can see aging work before it slips.": "跟踪到期日期和 SLA 状态，让负责人提前看到可能逾期的事项。",
    "Adds optional SLA due date and status tracking plus an SLA watch queue for open vendor requests, without requiring changes to existing records.": "增加可选 SLA 到期日期、SLA 状态和 SLA 关注队列，同时不要求修改已有记录。",
    "Submitted": "已提交",
    "Business review": "业务评审",
    "Approved": "已批准",
    "Rejected": "已拒绝",
    submitted: "已提交",
    business_review: "业务评审",
    approved: "已批准",
    rejected: "已拒绝",
    "Vendor name": "供应商名称",
    Requestor: "申请人",
    Category: "类别",
    Risk: "风险",
    Notes: "备注",
    "Due date": "到期日期",
    "SLA due date": "SLA 到期日期",
    "SLA status": "SLA 状态",
    "Target completion date for this item.": "该事项的目标完成日期。",
    "Current service-level health.": "当前服务等级状态。",
    "Optional deadline for vendor review; left blank on existing records so migration is safe.": "供应商评审的可选截止日期；已有记录保持为空以保证迁移安全。",
    "Track whether the vendor request is on track, at risk, or overdue.": "跟踪供应商请求是否正常、有风险或已逾期。",
    "Send to business review": "提交业务评审",
    "Approve vendor": "批准供应商",
    "Reject vendor": "拒绝供应商",
    operations: "运营",
    approver: "审批人",
  } as Record<string, string>)[text] ?? text;
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

async function streamEvolutionRequest(
  path: string,
  body: Record<string, unknown>,
  handlers: {
    readonly onStatus: (status: { readonly text?: string }) => void;
    readonly onProgress: (progress: any) => void;
  },
) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      accept: "text/event-stream",
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({ error: "Request failed" }));
    throw new Error(failure.error || "Request failed");
  }
  if (!response.body) throw new Error("Streaming response body is not available.");

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let donePayload: unknown;
  while (true) {
    const read = await reader.read();
    if (read.done) break;
    buffer += decoder.decode(read.value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary >= 0) {
      const packet = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = parseSsePacket(packet);
      if (event) {
        if (event.event === "status") handlers.onStatus(event.data as { readonly text?: string });
        if (event.event === "progress") handlers.onProgress(event.data);
        if (event.event === "done") donePayload = event.data;
        if (event.event === "error") throw new Error((event.data as { readonly error?: string }).error || "Agent request failed");
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
  buffer += decoder.decode();
  return donePayload;
}

function parseSsePacket(packet: string): { readonly event: string; readonly data: unknown } | undefined {
  const lines = packet.split(/\r?\n/);
  const event = lines.find((line) => line.startsWith("event:"))?.slice("event:".length).trim() ?? "message";
  const data = lines
    .filter((line) => line.startsWith("data:"))
    .map((line) => line.slice("data:".length).trimStart())
    .join("\n");
  if (!data) return undefined;
  return { event, data: JSON.parse(data) };
}

function currentLang(): Lang {
  return new URLSearchParams(location.search).get("lang") === "zh" ? "zh" : "en";
}

createRoot(document.querySelector("#app")!).render(<App />);
