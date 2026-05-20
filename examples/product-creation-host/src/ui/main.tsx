import React, { type FormEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  Bot,
  Box,
  Check,
  ChevronDown,
  Code2,
  Database,
  Eye,
  FileText,
  GitBranch,
  History,
  Info,
  LayoutDashboard,
  ListChecks,
  Logs,
  MessageSquare,
  Package,
  PanelRight,
  Plus,
  Rocket,
  RotateCcw,
  Send,
  Share2,
  ShieldCheck,
  Table2,
  type LucideIcon,
} from "lucide-react";

type Lang = "en" | "zh";
type Role = "user:bob" | "user:charlie";

type Snapshot = {
  projects: Project[];
  shares: ShareArtifact[];
  developer_contract: DeveloperContract | null;
};

type DeveloperContract = {
  framework_owned: string[];
  host_owned: string[];
  builder_visible_promises: string[];
};

type ShareArtifact = {
  artifact_id: string;
  app_id: string;
  version_id: string;
  manifest: { app_name: string };
};

type Project = {
  app_id: string;
  name: string;
  goal: string;
  profile_id: string;
  status: string;
  builder_subject: Role;
  current_version_id: string;
  active_version_id?: string;
  preview_url?: string;
  published_url?: string;
  current_version?: AppVersion;
  versions: AppVersion[];
  pending_evolution?: PendingEvolution;
  agent_logs?: AgentLog[];
};

type AppVersion = {
  version_id: string;
  created_at_ms: number;
  definition: {
    modules: Array<{ id: string; title: string; kind: string; description: string }>;
    fields: unknown;
  };
  items: DevBoardItem[];
};

type DevBoardItem = {
  id: string;
  title: string;
  owner: string;
  status: string;
  priority?: string;
};

type PendingEvolution = {
  proposal_id: string;
  builder_message: string;
  proposal?: {
    summary?: string;
    evidence?: {
      changed_files?: string[];
      diff?: string;
    };
  };
  review_packet?: {
    intent_summary?: string;
    scope_boundary?: string;
    required_approvals?: Array<{ role: string }>;
  };
  decisions: Array<{ subject: string; decision: string }>;
  data_receipt?: { policy?: string };
};

type AgentLog = {
  kind: string;
  at_ms: number;
  text: string;
};

const i18n = {
  en: {
    hostTitle: "Dev Board Builder",
    appEyebrow: "Creation Host",
    project: "Project",
    currentBuilder: "Current Builder",
    builder: "Builder",
    forkingBuilder: "Forking Builder",
    generatedApplication: "Generated Application",
    runtimeSurface: "Runtime surface",
    builderWorkbench: "Builder Workbench",
    conversation: "Conversation",
    model: "Model",
    describeChange: "Describe the next change",
    askAgent: "Send",
    noProject: "No project yet",
    idle: "idle",
    createTitle: "Start a build workspace",
    createBody: "This step only allocates the Host workspace, profile, thread, and starter app shell. The build agent designs changes in the proposal flow on the right.",
    name: "Name",
    goal: "Goal",
    profile: "Profile",
    createApp: "Start workspace",
    engineeringProfile: "Engineering operations",
    localProfileMeta: "local Bun + SQLite",
    personalProfile: "Personal focus",
    personalProfileMeta: "focused profile",
    defaultName: "Engineering Dev Board",
    defaultGoal: "Track release work, review queues, and GitHub attention in one daily board.",
    defaultMessage: "Add a review queue so items can be marked needs_review and approved.",
    emptyRuntimeTitle: "No generated app selected",
    emptyRuntimeBody: "Start a workspace to see the starter app shell, then ask the build agent to design concrete changes.",
    version: "Version",
    live: "Live",
    item: "Item",
    items: "Items",
    openPreview: "Open preview sandbox",
    openLive: "Open published app",
    unavailable: "Unavailable",
    modules: "Modules",
    data: "Data",
    owner: "Owner",
    status: "Status",
    priority: "Priority",
    noPriority: "None",
    lifecycle: "Lifecycle",
    currentGate: "Current gate",
    startPreview: "Start preview",
    publish: "Publish",
    share: "Share artifact",
    rollback: "Rollback",
    gateDraft: "Start with a preview. The preview uses a disposable data copy and does not affect the live app.",
    gateAwaiting: "Waiting for Builder confirmation in the proposal above. Lifecycle actions are locked until apply finishes.",
    gateReady: "The proposal has been applied. Start preview and inspect the generated app before publishing.",
    gatePreviewing: "Preview is running on a disposable data copy. Publish only after checking the app.",
    gatePublished: "A version is live. Share it, roll back if needed, or ask the agent for the next change.",
    gateUnpublishedCurrent: "The current version differs from live. Start preview before publishing this version again.",
    gateBlocked: "This change is blocked. Read the failure, then ask the agent to adjust the proposal.",
    previewReadyHint: "Creates a fresh disposable copy.",
    previewRunningHint: "Preview is already running. Verify, then publish.",
    previewBlockedHint: "Apply or create a change first.",
    publishReadyHint: "Promotes the checked version.",
    publishBlockedHint: "Requires a running preview.",
    shareReadyHint: "Exports the live version.",
    shareBlockedHint: "Publish a version first.",
    rollbackReadyHint: "Restores the previous live version.",
    rollbackBlockedHint: "Needs a previous live version.",
    busyReason: "Operation in progress.",
    schema: "Schema",
    versions: "Versions",
    evidence: "Evidence",
    logs: "Logs",
    emptyConversationTitle: "Builder and app are separate surfaces",
    emptyConversationBody: "The left pane shows the generated app. This pane is where the Builder asks the build agent for a change, reviews the interpretation and proposal, then confirms apply.",
    workspace: "Workspace",
    agentActivity: "Agent activity",
    agentActivityBody: "Live opencode progress appears here while the build agent is drafting.",
    originalRequest: "Original request",
    agentInterpretation: "Agent interpretation",
    preciseProposal: "Precise proposal",
    confirmIntent: "Confirm intent before apply",
    interpretedAs: "Interpreted as: {summary}. The agent prepares source and data changes only; publish stays a separate Builder action.",
    keyChanges: "Key changes",
    file: "File",
    requiredConfirmation: "Required confirmation",
    dataPolicy: "Data",
    diff: "Diff",
    confirmApply: "Confirm and apply",
    required: "Builder confirmation required",
    applied: "Applied. Start preview next and check the app before publishing.",
    noProposalTitle: "No pending proposal",
    noProposalBody: "Ask for a product change to produce an interpretation, exact proposal, key highlights, and confirmation control.",
    reviewModule: "Add Review queue as a first-class module.",
    reviewField: "Add review_status so items can move through needs_review and approved.",
    githubModule: "Add GitHub attention as a visible workflow lane.",
    githubField: "Preserve issue/PR URLs in item data.",
    priorityModule: "Add a priority lane.",
    priorityField: "Expose P1/P2/P3 priority as normal app data.",
    dependencyModule: "Add a dependency map so order-of-work is explicit.",
    dependencyField: "Add depends_on as portable app data.",
    blockerModule: "Add blocker triage for stuck work.",
    blockerField: "Add blocked_reason so recovery context is visible.",
    ciModule: "Add CI health beside each item.",
    ciField: "Add ci_status as a governed signal field.",
    timelineModule: "Add a delivery timeline.",
    timelineField: "Add due_date and effort for planning pressure.",
    ownerRuntimeAction: "Add a runtime action so owners can be edited directly in the generated app.",
    dataReceipt: "Run data carry-forward rehearsal before publish.",
    productModel: "Product model",
    productModelBody: "Framework provides the build loop and governance primitives. This Creation Host turns them into a Builder-facing product. Generated Apps and Published Apps stay separate from the workbench.",
    frameworkOwns: "Framework owns",
    hostOwns: "Host owns",
    visiblePromises: "Builder-visible promises",
    noShares: "No share artifacts yet.",
    fork: "Fork",
    requestFailed: "Request failed",
    commandHint: "Preview opens a disposable data copy. Publish opens the app as a separate page for End Users.",
  },
  zh: {
    hostTitle: "开发看板构建器",
    appEyebrow: "创建宿主",
    project: "项目",
    currentBuilder: "当前构建者",
    builder: "构建者",
    forkingBuilder: "派生构建者",
    generatedApplication: "生成应用",
    runtimeSurface: "应用运行面",
    builderWorkbench: "构建者工作台",
    conversation: "对话工作流",
    model: "模型",
    describeChange: "描述下一次变更",
    askAgent: "发送",
    noProject: "还没有项目",
    idle: "空闲",
    createTitle: "启动构建工作区",
    createBody: "这一步只分配 Host 工作区、配置、对话线程和起始应用壳。真正的应用设计发生在右侧构建智能体的 proposal 流程里。",
    name: "名称",
    goal: "目标",
    profile: "配置",
    createApp: "启动工作区",
    engineeringProfile: "工程协作",
    localProfileMeta: "本地 Bun + SQLite",
    personalProfile: "个人专注",
    personalProfileMeta: "专注配置",
    defaultName: "工程开发看板",
    defaultGoal: "在一个日常看板中跟踪发布工作、评审队列和 GitHub 关注项。",
    defaultMessage: "添加一个评审队列，让事项可以标记为待评审并被批准。",
    emptyRuntimeTitle: "还没有选择生成应用",
    emptyRuntimeBody: "启动工作区后，这里会显示起始应用壳；随后通过构建智能体设计具体变更。",
    version: "版本",
    live: "线上",
    item: "事项",
    items: "事项",
    openPreview: "打开预览沙盒",
    openLive: "打开线上应用",
    unavailable: "不可用",
    modules: "模块",
    data: "数据",
    owner: "负责人",
    status: "状态",
    priority: "优先级",
    noPriority: "无",
    lifecycle: "生命周期",
    currentGate: "当前关口",
    startPreview: "启动预览",
    publish: "发布",
    share: "生成分享制品",
    rollback: "回滚",
    gateDraft: "先启动预览。预览使用一次性数据副本，不影响线上应用。",
    gateAwaiting: "等待构建者在上方确认提案。执行完成前，生命周期动作会被锁住。",
    gateReady: "提案已经执行。先启动预览，检查生成应用后再发布。",
    gatePreviewing: "预览正在使用一次性数据副本运行。确认效果后再发布。",
    gatePublished: "已有版本在线上。可以分享、回滚，或继续向 agent 提下一个变更。",
    gateUnpublishedCurrent: "当前版本和线上版本不同。重新发布前需要先启动预览。",
    gateBlocked: "这次变更被阻断。先看失败原因，再让构建智能体调整提案。",
    previewReadyHint: "创建新的临时数据副本。",
    previewRunningHint: "预览已在运行。确认无误后再发布。",
    previewBlockedHint: "先执行或创建一次变更。",
    publishReadyHint: "将检查后的版本推到线上。",
    publishBlockedHint: "需要先运行预览。",
    shareReadyHint: "导出当前线上版本。",
    shareBlockedHint: "先发布一个版本。",
    rollbackReadyHint: "恢复上一个线上版本。",
    rollbackBlockedHint: "需要存在上一个线上版本。",
    busyReason: "操作执行中。",
    schema: "结构",
    versions: "版本",
    evidence: "证据",
    logs: "日志",
    emptyConversationTitle: "构建者工作台和应用是分开的",
    emptyConversationBody: "左侧是生成应用本身。右侧是构建者向构建智能体提需求、检查理解与提案、最后确认执行的地方。",
    workspace: "工作区",
    agentActivity: "智能体工作回显",
    agentActivityBody: "真实 opencode 生成草稿时，进度会实时显示在这里。",
    originalRequest: "原始需求",
    agentInterpretation: "智能体理解",
    preciseProposal: "准确提案",
    confirmIntent: "执行前确认意图",
    interpretedAs: "理解为：{summary}。智能体只准备源码和数据变更；发布仍然是构建者的独立动作。",
    keyChanges: "重点改动",
    file: "文件",
    requiredConfirmation: "所需确认",
    dataPolicy: "数据",
    diff: "差异",
    confirmApply: "确认并执行",
    required: "需要构建者确认",
    applied: "已执行。下一步启动预览，检查应用效果后再发布。",
    noProposalTitle: "没有待处理提案",
    noProposalBody: "提出产品变更后，这里会出现智能体理解、准确提案、重点改动和确认控件。",
    reviewModule: "把评审队列作为一等模块加入应用。",
    reviewField: "加入评审状态，让事项可以进入待评审和已批准。",
    githubModule: "把 GitHub 关注项变成可见工作流。",
    githubField: "在数据里保留 issue/PR URL。",
    priorityModule: "新增优先级工作流。",
    priorityField: "把 P1/P2/P3 优先级变成正常应用数据。",
    dependencyModule: "新增依赖地图，让工作顺序变得明确。",
    dependencyField: "加入 depends_on，作为可迁移的应用数据。",
    blockerModule: "新增阻塞处理，用于处理卡住的事项。",
    blockerField: "加入 blocked_reason，让恢复上下文可见。",
    ciModule: "新增 CI 健康度。",
    ciField: "加入 ci_status，作为受治理的信号字段。",
    timelineModule: "新增交付时间线。",
    timelineField: "加入 due_date 和 effort，用于观察交付压力。",
    ownerRuntimeAction: "加入运行时动作，让负责人可以在生成应用里直接编辑。",
    dataReceipt: "发布前执行数据继承预演。",
    productModel: "产品模型",
    productModelBody: "pneuma-framework 提供构建循环和治理原语。创建宿主把它们变成构建者可用的产品。生成应用和已发布应用与工作台保持分离。",
    frameworkOwns: "框架拥有",
    hostOwns: "宿主拥有",
    visiblePromises: "构建者可见承诺",
    noShares: "还没有分享制品。",
    fork: "派生",
    requestFailed: "请求失败",
    commandHint: "预览会创建一次性数据副本。发布后，最终用户在单独页面使用应用。",
  },
} satisfies Record<Lang, Record<string, string>>;

const statusText: Record<string, keyof typeof i18n.en> = {
  idle: "idle",
  draft: "idle",
};

const statusTone: Record<string, string> = {
  awaiting_builder_confirmation: "warn",
  awaiting_reviewer_approval: "warn",
  blocked: "bad",
  ready_to_preview: "good",
  previewing: "good",
  published: "live",
};

function App() {
  const [snapshot, setSnapshot] = useState<Snapshot>({ projects: [], shares: [], developer_contract: null });
  const [selectedAppId, setSelectedAppId] = useLocalStorage("pneuma.productHost.selectedAppId", "");
  const [lang, setLang] = useLocalStorage<Lang>("pneuma.productHost.lang", "en");
  const [storedRole, setStoredRole] = useLocalStorage<string>("pneuma.productHost.role", "user:bob");
  const role = normalizeBuilderSubject(storedRole);
  const [inspector, setInspector] = useState("data");
  const [busy, setBusy] = useState(false);
  const [lastError, setLastError] = useState("");
  const [helpOpen, setHelpOpen] = useState(false);
  const [agentMessage, setAgentMessage] = useState(i18n[lang].defaultMessage);
  const copy = i18n[lang];

  const selectedProject = useMemo(
    () => snapshot.projects.find((project) => project.app_id === selectedAppId) ?? snapshot.projects[0] ?? null,
    [selectedAppId, snapshot.projects],
  );

  useEffect(() => {
    document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
    document.title = copy.hostTitle;
  }, [lang, copy.hostTitle]);

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!busy) return;
    const interval = window.setInterval(() => {
      void refresh();
    }, 1_000);
    return () => window.clearInterval(interval);
  }, [busy]);

  useEffect(() => {
    if (selectedProject && selectedProject.app_id !== selectedAppId) setSelectedAppId(selectedProject.app_id);
  }, [selectedProject, selectedAppId, setSelectedAppId]);

  useEffect(() => {
    if (selectedProject && storedRole !== selectedProject.builder_subject) {
      setStoredRole(selectedProject.builder_subject);
    }
  }, [selectedProject, storedRole, setStoredRole]);

  async function refresh() {
    const response = await fetch("/api/state");
    const next = await response.json() as Snapshot;
    setSnapshot(next);
  }

  async function runAction(fn: () => Promise<unknown>) {
    setBusy(true);
    setLastError("");
    try {
      await fn();
    } catch (err) {
      setLastError(err instanceof Error ? err.message : String(err));
    } finally {
      await refresh().catch(() => undefined);
      setBusy(false);
    }
  }

  async function request(path: string, body: unknown) {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Request failed");
    return payload;
  }

  function changeProject(appId: string) {
    const nextProject = snapshot.projects.find((project) => project.app_id === appId);
    setSelectedAppId(appId);
    if (nextProject) setStoredRole(nextProject.builder_subject);
  }

  async function createProject(input: { name: string; goal: string; template_id: string }) {
    await runAction(async () => {
      const project = await request("/api/projects", { ...input, builder_subject: role }) as Project;
      setSelectedAppId(project.app_id);
      setStoredRole(project.builder_subject);
    });
  }

  async function askAgent(event: FormEvent) {
    event.preventDefault();
    if (!selectedProject) return;
    await runAction(() => request(`/api/projects/${selectedProject.app_id}/evolution/request`, {
      message: agentMessage.trim() || copy.defaultMessage,
      builder_subject: role,
    }));
  }

  async function projectAction(action: "confirm" | "preview" | "publish" | "share" | "rollback") {
    if (!selectedProject) return;
    const paths = {
      confirm: `/api/projects/${selectedProject.app_id}/evolution/approve`,
      preview: `/api/projects/${selectedProject.app_id}/preview/start`,
      publish: `/api/projects/${selectedProject.app_id}/publish`,
      share: `/api/projects/${selectedProject.app_id}/share`,
      rollback: `/api/projects/${selectedProject.app_id}/rollback`,
    };
    await runAction(() => request(paths[action], action === "confirm" ? { subject: role } : {}));
  }

  async function fork(artifactId: string) {
    await runAction(async () => {
      const forked = await request("/api/forks", {
        artifact_id: artifactId,
        name: "Charlie's Dev Board",
        builder_subject: "user:charlie",
      }) as Project;
      setSelectedAppId(forked.app_id);
      setStoredRole(forked.builder_subject);
    });
  }

  const projectOptions = snapshot.projects.map((project) => ({
    value: project.app_id,
    label: project.name,
    meta: `${statusLabel(project.status, copy)} · ${project.current_version_id}`,
    icon: Box,
  }));

  const currentBuilder = selectedProject?.builder_subject ?? role;

  return (
    <div className={cx("app-shell", busy && "is-busy")}>
      <header className="topbar">
        <div className="brand-block">
          <span className="eyebrow">{copy.appEyebrow}</span>
          <h1>{copy.hostTitle}</h1>
        </div>
        <Select
          label={copy.project}
          value={selectedProject?.app_id ?? ""}
          fallbackLabel={copy.noProject}
          options={projectOptions}
          onValueChange={changeProject}
          disabled={!projectOptions.length}
          className="project-control"
          compact
        />
        <HealthStrip project={selectedProject} copy={copy} />
        <div className="topbar-actions">
          <Segmented value={lang} options={[{ value: "en", label: "EN" }, { value: "zh", label: "中文" }]} onChange={(value) => {
            setAgentMessage((previous) => previous === i18n[lang].defaultMessage ? i18n[value as Lang].defaultMessage : previous);
            setLang(value as Lang);
          }} />
          <BuilderSubject copy={copy} subject={currentBuilder} />
        </div>
      </header>
      <main className="workspace">
        <section className="runtime-pane" aria-labelledby="runtime-title">
          <PaneHeading
            eyebrow={copy.generatedApplication}
            title={copy.runtimeSurface}
            action={<Badge tone={statusTone[selectedProject?.status ?? ""]}>{statusLabel(selectedProject?.status ?? "idle", copy)}</Badge>}
          />
          {!selectedProject ? <CreatePanel copy={copy} onCreate={createProject} busy={busy} /> : null}
          <RuntimeSurface project={selectedProject} copy={copy} lang={lang} />
          <Inspector project={selectedProject} copy={copy} lang={lang} active={inspector} onChange={setInspector} shares={snapshot.shares} />
        </section>
        <section className="builder-pane" aria-labelledby="builder-title">
          <PaneHeading
            eyebrow={copy.builderWorkbench}
            title={copy.conversation}
            action={<Button variant="outline" size="sm" icon={PanelRight} onClick={() => setHelpOpen((value) => !value)}>{copy.model}</Button>}
          />
          {helpOpen ? <HelpPanel copy={copy} contract={snapshot.developer_contract} shares={snapshot.shares} onFork={fork} /> : null}
          <Conversation
            copy={copy}
            lang={lang}
            project={selectedProject}
            lastError={lastError}
            busy={busy}
            onConfirm={() => projectAction("confirm")}
            onAction={projectAction}
          />
          <form className="composer" onSubmit={askAgent}>
            <label htmlFor="agent-message">{copy.describeChange}</label>
            <div className="composer-row">
              <textarea id="agent-message" rows={3} value={agentMessage} onChange={(event) => setAgentMessage(event.currentTarget.value)} />
              <Button type="submit" disabled={!selectedProject || busy} icon={Send}>{copy.askAgent}</Button>
            </div>
          </form>
        </section>
      </main>
    </div>
  );
}

function PaneHeading({ eyebrow, title, action }: { eyebrow: string; title: string; action: ReactNode }) {
  return (
    <div className="pane-heading">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function CreatePanel({ copy, busy, onCreate }: { copy: typeof i18n.en; busy: boolean; onCreate: (input: { name: string; goal: string; template_id: string }) => void }) {
  const [name, setName] = useState(copy.defaultName);
  const [goal, setGoal] = useState(copy.defaultGoal);
  const [templateId, setTemplateId] = useState("engineering");
  return (
    <form className="create-form" onSubmit={(event) => {
      event.preventDefault();
      onCreate({ name, goal, template_id: templateId });
    }}>
      <div className="form-intro">
        <h3>{copy.createTitle}</h3>
        <p>{copy.createBody}</p>
      </div>
      <Field label={copy.name}><input value={name} onChange={(event) => setName(event.currentTarget.value)} /></Field>
      <Field label={copy.goal}><textarea rows={3} value={goal} onChange={(event) => setGoal(event.currentTarget.value)} /></Field>
      <ProfilePicker
        label={copy.profile}
        value={templateId}
        options={[
          { value: "engineering", label: copy.engineeringProfile, meta: copy.localProfileMeta, icon: LayoutDashboard },
          { value: "personal", label: copy.personalProfile, meta: copy.personalProfileMeta, icon: ListChecks },
        ]}
        onValueChange={setTemplateId}
      />
      <Button type="submit" disabled={busy} icon={Plus}>{copy.createApp}</Button>
    </form>
  );
}

function ProfilePicker({ label, value, options, onValueChange }: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; meta: string; icon: LucideIcon }>;
  onValueChange: (value: string) => void;
}) {
  return (
    <div className="profile-picker">
      <span className="control-label">{label}</span>
      <div className="profile-options" role="radiogroup" aria-label={label}>
        {options.map((option) => {
          const active = option.value === value;
          const Icon = option.icon;
          return (
            <button
              type="button"
              className={cx("profile-option", active && "active")}
              role="radio"
              aria-checked={active}
              key={option.value}
              onClick={() => onValueChange(option.value)}
            >
              <Icon size={15} />
              <span className="profile-option-copy">
                <span>{option.label}</span>
                <code>{option.meta}</code>
              </span>
              {active ? <Check size={15} className="profile-check" /> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function RuntimeSurface({ project, copy, lang }: { project: Project | null; copy: typeof i18n.en; lang: Lang }) {
  if (!project?.current_version) {
    return (
      <div className="runtime-surface">
        <div className="empty-surface">
          <LayoutDashboard size={26} />
          <h3>{copy.emptyRuntimeTitle}</h3>
          <p>{copy.emptyRuntimeBody}</p>
        </div>
      </div>
    );
  }
  const version = project.current_version;
  return (
    <div className="runtime-surface">
      <div className="runtime-header">
        <div>
          <span className="eyebrow">{profileLabel(project.profile_id, lang)}</span>
          <h3>{project.name}</h3>
          <p>{project.goal}</p>
        </div>
        <div className="runtime-links">
          <RuntimeLink href={project.preview_url} label={copy.openPreview} lang={lang} icon={Eye} />
          <RuntimeLink href={project.published_url} label={copy.openLive} lang={lang} icon={ArrowUpRight} primary />
        </div>
      </div>
      <div className="metric-line">
        <span><strong>{project.current_version_id}</strong>{copy.version}</span>
        <span><strong>{project.active_version_id || "-"}</strong>{copy.live}</span>
        <span><strong>{version.items.length}</strong>{copy.items}</span>
      </div>
      <section className="runtime-section">
        <SectionTitle icon={Package} title={copy.modules} />
        <div className="module-list">
          {version.definition.modules.map((mod) => {
            const display = moduleDisplay(mod, lang);
            return (
            <div className="module-row" key={mod.id}>
              <strong>{display.title}</strong>
              <span>{display.kind}</span>
              <p>{display.description}</p>
            </div>
            );
          })}
        </div>
      </section>
      <section className="runtime-section">
        <SectionTitle icon={Table2} title={copy.data} />
        <DataTable items={version.items} copy={copy} />
      </section>
    </div>
  );
}

function Inspector({ project, copy, lang, active, onChange, shares }: {
  project: Project | null;
  copy: typeof i18n.en;
  lang: Lang;
  active: string;
  onChange: (tab: string) => void;
  shares: ShareArtifact[];
}) {
  if (!project?.current_version) return <div className="inspector is-empty" />;
  const tabs = [
    { id: "data", label: copy.data, icon: Table2 },
    { id: "schema", label: copy.schema, icon: Code2 },
    { id: "versions", label: copy.versions, icon: History },
    { id: "evidence", label: copy.evidence, icon: FileText },
    { id: "logs", label: copy.logs, icon: Logs },
  ];
  return (
    <div className="inspector">
      <div className="inspector-tabs">
        {tabs.map((tab) => (
          <button type="button" key={tab.id} className={cx(active === tab.id && "active")} onClick={() => onChange(tab.id)}>
            <tab.icon size={15} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>
      <div className="inspector-body">
        {active === "data" ? <DataTable items={project.current_version.items} copy={copy} /> : null}
        {active === "schema" ? <pre>{JSON.stringify(project.current_version.definition.fields, null, 2)}</pre> : null}
        {active === "versions" ? <VersionList project={project} lang={lang} /> : null}
        {active === "logs" ? <LogList logs={project.agent_logs ?? []} copy={copy} lang={lang} /> : null}
        {active === "evidence" ? <pre>{JSON.stringify(projectEvidence(project, shares), null, 2)}</pre> : null}
      </div>
    </div>
  );
}

function Conversation({ copy, lang, project, lastError, busy, onConfirm, onAction }: {
  copy: typeof i18n.en;
  lang: Lang;
  project: Project | null;
  lastError: string;
  busy: boolean;
  onConfirm: () => void;
  onAction: (action: "preview" | "publish" | "share" | "rollback") => void;
}) {
  return (
    <div className="conversation" aria-live="polite">
      {lastError ? (
        <article className="turn error-turn">
          <span>{copy.requestFailed}</span>
          <p>{lastError}</p>
        </article>
      ) : null}
      <article className="turn system-turn">
        <span>{copy.workspace}</span>
        <h3>{copy.emptyConversationTitle}</h3>
        <p>{project ? workspaceSummary(project, copy) : copy.emptyConversationBody}</p>
      </article>
      {project && (busy || (project.agent_logs?.length ?? 0) > 0) ? (
        <AgentActivityTurn logs={project.agent_logs ?? []} copy={copy} lang={lang} />
      ) : null}
      {project?.pending_evolution ? (
        <>
          <article className="turn builder-turn">
            <span>{copy.originalRequest}</span>
            <p>{localizedBuilderMessage(project.pending_evolution.builder_message, lang)}</p>
          </article>
          <article className="turn agent-turn">
            <span>{copy.agentInterpretation}</span>
            <h3>{copy.confirmIntent}</h3>
            <p>{format(copy.interpretedAs, {
              summary: localizedProposalSummary(
                project.pending_evolution.review_packet?.intent_summary || project.pending_evolution.proposal?.summary || project.pending_evolution.builder_message,
                lang,
              ),
            })}</p>
          </article>
          <ProposalTurn copy={copy} lang={lang} pending={project.pending_evolution} busy={busy} onConfirm={onConfirm} />
        </>
      ) : project ? (
        <article className="turn agent-turn">
          <span>{copy.preciseProposal}</span>
          <h3>{copy.noProposalTitle}</h3>
          <p>{copy.noProposalBody}</p>
        </article>
      ) : null}
      {project ? <CommandBar copy={copy} project={project} busy={busy} onAction={onAction} /> : null}
    </div>
  );
}

function AgentActivityTurn({ logs, copy, lang }: { logs: AgentLog[]; copy: typeof i18n.en; lang: Lang }) {
  const visible = logs.slice(-8);
  return (
    <article className="turn agent-activity-turn">
      <span>{copy.agentActivity}</span>
      <h3>{copy.agentActivityBody}</h3>
      {visible.length > 0 ? (
        <div className="activity-list">
          {visible.map((log, index) => (
            <div className="activity-row" key={`${log.at_ms}-${index}`}>
              <strong>{logKind(log.kind, lang)}</strong>
              <span>{new Date(log.at_ms).toLocaleTimeString(lang === "zh" ? "zh-CN" : "en-US")}</span>
              <p>{logText(log.text, lang)}</p>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function ProposalTurn({ copy, lang, pending, busy, onConfirm }: { copy: typeof i18n.en; lang: Lang; pending: PendingEvolution; busy: boolean; onConfirm: () => void }) {
  const changedFiles = pending.proposal?.evidence?.changed_files ?? [];
  const diff = pending.proposal?.evidence?.diff ?? "";
  const confirmation = pending.review_packet?.required_approvals?.map((item) => roleLabel(item.role, lang)).join(", ") || roleLabel("builder", lang);
  const data = localizedDataPolicy(pending.data_receipt?.policy || pending.review_packet?.scope_boundary || "", lang);
  const applied = Boolean(pending.data_receipt);
  const summary = localizedProposalSummary(pending.review_packet?.intent_summary || pending.proposal?.summary || "Proposal", lang);
  const scope = localizedScopeBoundary(pending.review_packet?.scope_boundary || "", lang);
  return (
    <article className="turn proposal-turn">
      <span>{copy.preciseProposal}</span>
      <h3>{summary}</h3>
      <p>{scope}</p>
      <div className="highlight-box">
        <strong>{copy.keyChanges}</strong>
        <ul>{proposalHighlights(pending.builder_message, copy).map((item) => <li key={item}>{item}</li>)}</ul>
      </div>
      <dl className="proposal-meta">
        <div><dt>{copy.file}</dt><dd>{changedFiles.join(", ") || "-"}</dd></div>
        <div><dt>{copy.requiredConfirmation}</dt><dd>{confirmation}</dd></div>
        <div><dt>{copy.dataPolicy}</dt><dd>{data || "-"}</dd></div>
      </dl>
      <details className="diff-block">
        <summary>{copy.diff}</summary>
        <pre>{diff}</pre>
      </details>
      <div className="proposal-footer">
        {pending.decisions.length ? pending.decisions.map((decision) => (
          <Badge key={`${decision.subject}-${decision.decision}`}>{copy.requiredConfirmation}: {decision.subject} · {statusLabel(decision.decision, copy)}</Badge>
        )) : <Badge tone="warn">{copy.required}</Badge>}
        {applied ? <Badge tone="good">{copy.applied}</Badge> : null}
        {!applied ? <Button icon={Check} disabled={busy} onClick={onConfirm}>{copy.confirmApply}</Button> : null}
      </div>
    </article>
  );
}

function CommandBar({ copy, project, busy, onAction }: {
  copy: typeof i18n.en;
  project: Project;
  busy: boolean;
  onAction: (action: "preview" | "publish" | "share" | "rollback") => void;
}) {
  const model = lifecycleActionModel(project, copy);
  return (
    <article className="turn command-turn">
      <span>{copy.lifecycle}</span>
      <div className="lifecycle-state">
        <Badge tone={model.tone}>{copy.currentGate}</Badge>
        <p>{model.message}</p>
      </div>
      <div className="command-grid">
        {model.actions.map((action) => (
          <div
            className={cx(
              "command-cell",
              action.enabled ? "is-enabled" : "is-disabled",
              action.next && "is-next",
            )}
            key={action.id}
          >
            <Button
              variant={action.primary ? "default" : "outline"}
              icon={action.icon}
              disabled={busy || !action.enabled}
              onClick={() => onAction(action.id)}
            >
              {action.label}
            </Button>
            <small>{busy ? copy.busyReason : action.hint}</small>
          </div>
        ))}
      </div>
    </article>
  );
}

function lifecycleActionModel(project: Project, copy: typeof i18n.en): {
  readonly tone: string;
  readonly message: string;
  readonly actions: ReadonlyArray<{
    readonly id: "preview" | "publish" | "share" | "rollback";
    readonly label: string;
    readonly icon: LucideIcon;
    readonly enabled: boolean;
    readonly next: boolean;
    readonly primary: boolean;
    readonly hint: string;
  }>;
} {
  const hasCurrentVersion = Boolean(project.current_version);
  const hasLiveVersion = Boolean(project.active_version_id);
  const currentIsLive = hasLiveVersion && project.active_version_id === project.current_version_id;
  const hasUnpublishedCurrent = hasCurrentVersion && !currentIsLive;
  const awaitingConfirmation = project.status === "awaiting_builder_confirmation" || project.status === "awaiting_reviewer_approval";
  const blocked = project.status === "blocked";
  const canPreview = hasCurrentVersion && !awaitingConfirmation && !blocked && (
    project.status === "draft" ||
    project.status === "forked" ||
    project.status === "ready_to_preview" ||
    (project.status === "published" && hasUnpublishedCurrent)
  );
  const canPublish = project.status === "previewing" && hasUnpublishedCurrent;
  const canShare = project.status === "published" && hasLiveVersion && currentIsLive;
  const canRollback = currentIsLive && project.versions.length > 1 && project.active_version_id !== project.versions[0]?.version_id;

  const message = (() => {
    if (blocked) return copy.gateBlocked;
    if (awaitingConfirmation) return copy.gateAwaiting;
    if (project.status === "ready_to_preview") return copy.gateReady;
    if (project.status === "previewing") return copy.gatePreviewing;
    if (project.status === "published" && hasUnpublishedCurrent) return copy.gateUnpublishedCurrent;
    if (project.status === "published") return copy.gatePublished;
    return copy.gateDraft;
  })();

  const next = (() => {
    if (canPublish) return "publish";
    if (canPreview) return "preview";
    if (canShare) return "share";
    return "";
  })();

  return {
    tone: blocked ? "bad" : awaitingConfirmation ? "warn" : canPublish || canPreview ? "good" : hasLiveVersion ? "live" : "neutral",
    message,
    actions: [
      {
        id: "preview",
        label: copy.startPreview,
        icon: Eye,
        enabled: canPreview,
        next: next === "preview",
        primary: next === "preview",
        hint: project.status === "previewing" ? copy.previewRunningHint : canPreview ? copy.previewReadyHint : copy.previewBlockedHint,
      },
      {
        id: "publish",
        label: copy.publish,
        icon: Rocket,
        enabled: canPublish,
        next: next === "publish",
        primary: next === "publish",
        hint: canPublish ? copy.publishReadyHint : copy.publishBlockedHint,
      },
      {
        id: "share",
        label: copy.share,
        icon: Share2,
        enabled: canShare,
        next: next === "share",
        primary: false,
        hint: canShare ? copy.shareReadyHint : copy.shareBlockedHint,
      },
      {
        id: "rollback",
        label: copy.rollback,
        icon: RotateCcw,
        enabled: canRollback,
        next: false,
        primary: false,
        hint: canRollback ? copy.rollbackReadyHint : copy.rollbackBlockedHint,
      },
    ],
  };
}

function HelpPanel({ copy, contract, shares, onFork }: {
  copy: typeof i18n.en;
  contract: DeveloperContract | null;
  shares: ShareArtifact[];
  onFork: (artifactId: string) => void;
}) {
  return (
    <div className="help-panel">
      <h3>{copy.productModel}</h3>
      <p>{copy.productModelBody}</p>
      {contract ? (
        <div className="contract-grid">
          <ContractList title={copy.frameworkOwns} items={contract.framework_owned} />
          <ContractList title={copy.hostOwns} items={contract.host_owned} />
          <ContractList title={copy.visiblePromises} items={contract.builder_visible_promises} />
        </div>
      ) : null}
      <div className="share-list">
        {shares.length ? shares.map((share) => (
          <div className="share-row" key={share.artifact_id}>
            <span>{share.manifest.app_name} · {share.version_id}</span>
            <Button variant="outline" size="sm" icon={GitBranch} onClick={() => onFork(share.artifact_id)}>{copy.fork}</Button>
          </div>
        )) : <p className="muted">{copy.noShares}</p>}
      </div>
    </div>
  );
}

function BuilderSubject({ copy, subject }: { copy: typeof i18n.en; subject: Role }) {
  const isForkingBuilder = subject === "user:charlie";
  const Icon = isForkingBuilder ? GitBranch : ShieldCheck;
  return (
    <div className="top-control builder-subject role-control">
      <span className="control-label">{copy.currentBuilder}</span>
      <div className="builder-subject-chip">
        <Icon size={15} />
        <span className="select-content">
          <span className="select-label">{isForkingBuilder ? copy.forkingBuilder : copy.builder}</span>
          <span className="select-meta">{subject}</span>
        </span>
      </div>
    </div>
  );
}

function Select({ label, value, options, onValueChange, fallbackLabel, disabled, className, align, compact = false }: {
  label: string;
  value: string;
  options: Array<{ value: string; label: string; meta?: string; icon?: LucideIcon }>;
  onValueChange: (value: string) => void;
  fallbackLabel?: string;
  disabled?: boolean;
  className?: string;
  align?: "right";
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const selected = options.find((option) => option.value === value);
  const SelectedIcon = selected?.icon ?? Box;
  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  return (
    <div ref={rootRef} className={cx("top-control ui-select", compact && "ui-select-compact", className)}>
      <span className="control-label">{label}</span>
      <button type="button" className="ui-select-trigger" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((next) => !next)}>
        <SelectedIcon size={15} />
        <span className="select-content">
          <span className="select-label">{selected?.label ?? fallbackLabel ?? ""}</span>
          {selected?.meta ? <span className="select-meta">{selected.meta}</span> : null}
        </span>
        <ChevronDown size={15} />
      </button>
      {open ? (
        <div className={cx("ui-select-menu", align === "right" && "align-right")} role="listbox">
          {options.map((option) => {
            const active = option.value === value;
            const OptionIcon = active ? Check : option.icon ?? Box;
            return (
              <button type="button" className={cx("ui-select-option", active && "active")} role="option" aria-selected={active} key={option.value} onClick={() => {
                onValueChange(option.value);
                setOpen(false);
              }}>
                <OptionIcon size={15} />
                <span className="select-content">
                  <span className="select-label">{option.label}</span>
                  {option.meta ? <span className="select-meta">{option.meta}</span> : null}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function Segmented({ value, options, onChange }: { value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void }) {
  return (
    <div className="segmented" aria-label="Language selector">
      {options.map((option) => (
        <button type="button" key={option.value} className={cx(value === option.value && "active")} onClick={() => onChange(option.value)}>
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Button({ children, icon: Icon, variant = "default", size = "md", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: LucideIcon;
  variant?: "default" | "outline" | "ghost";
  size?: "sm" | "md";
}) {
  return (
    <button {...props} className={cx("ui-button", `ui-button-${variant}`, `ui-button-${size}`, className)}>
      {Icon ? <Icon size={16} /> : null}
      <span>{children}</span>
    </button>
  );
}

function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: string }) {
  return <span className={cx("status-token", tone)}>{children}</span>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label><span>{label}</span>{children}</label>;
}

function SectionTitle({ icon: Icon, title }: { icon: LucideIcon; title: string }) {
  return (
    <div className="section-title">
      <h4><Icon size={14} />{title}</h4>
    </div>
  );
}

function RuntimeLink({ href, label, lang, icon: Icon, primary = false }: { href?: string; label: string; lang: Lang; icon: LucideIcon; primary?: boolean }) {
  if (!href) return <span className="link-button disabled"><Icon size={15} />{label}</span>;
  return <a className={cx("link-button", primary && "primary")} href={localizedUrl(href, lang)} target="_blank" rel="noreferrer"><Icon size={15} />{label}</a>;
}

function HealthStrip({ project, copy }: { project: Project | null; copy: typeof i18n.en }) {
  if (!project) {
    return <div className="health-strip"><span>{copy.idle}</span><strong>{copy.noProject}</strong></div>;
  }
  return (
    <div className="health-strip">
      <span className={cx("status-dot", statusTone[project.status] || "neutral")} />
      <strong>{statusLabel(project.status, copy)}</strong>
      <span>{copy.version} {project.current_version_id}</span>
      <span>{copy.live} {project.active_version_id || copy.unavailable}</span>
    </div>
  );
}

function DataTable({ items, copy }: { items: DevBoardItem[]; copy: typeof i18n.en }) {
  if (!items.length) return <p className="muted">{copy.emptyRuntimeBody}</p>;
  const lang = copy === i18n.zh ? "zh" : "en";
  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>{copy.item}</th>
          <th>{copy.owner}</th>
          <th>{copy.status}</th>
          <th>{copy.priority}</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item) => (
          <tr key={item.id}>
            <td>{itemTitle(item, lang)}</td>
            <td>{item.owner}</td>
            <td><span className="table-pill">{statusLabel(item.status, copy)}</span></td>
            <td>{item.priority || copy.noPriority}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function VersionList({ project, lang }: { project: Project; lang: Lang }) {
  return (
    <div className="version-list">
      {project.versions.map((version) => (
        <div className="version-row" key={version.version_id}>
          <strong>{version.version_id}</strong>
          <span>{new Date(version.created_at_ms).toLocaleString(lang === "zh" ? "zh-CN" : "en-US")}</span>
        </div>
      ))}
    </div>
  );
}

function LogList({ logs, copy, lang }: { logs: AgentLog[]; copy: typeof i18n.en; lang: Lang }) {
  if (!logs.length) return <p className="muted">{copy.noShares}</p>;
  return (
    <div className="log-list">
      {logs.map((log, index) => (
        <div className="log-row" key={`${log.at_ms}-${index}`}>
          <strong>{logKind(log.kind, lang)}</strong>
          <span>{new Date(log.at_ms).toLocaleTimeString(lang === "zh" ? "zh-CN" : "en-US")}</span>
          <p>{logText(log.text, lang)}</p>
        </div>
      ))}
    </div>
  );
}

function ContractList({ title, items }: { title: string; items: string[] }) {
  return (
    <div>
      <h4>{title}</h4>
      <ul>{items.map((item) => <li key={item}>{item}</li>)}</ul>
    </div>
  );
}

function useLocalStorage<T extends string>(key: string, fallback: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => (localStorage.getItem(key) as T | null) ?? fallback);
  return [value, (next) => {
    localStorage.setItem(key, next);
    setValue(next);
  }];
}

function normalizeBuilderSubject(subject: string): Role {
  return subject === "user:charlie" ? "user:charlie" : "user:bob";
}

function statusLabel(status: string, copy: typeof i18n.en) {
  const direct = statusText[status];
  if (direct) return copy[direct];
  const labels: Record<string, string> = copy === i18n.zh
    ? {
      draft: copy.idle,
      awaiting_builder_confirmation: "等待确认",
      awaiting_reviewer_approval: "等待确认",
      blocked: "已阻断",
      ready_to_preview: "可预览",
      previewing: "预览中",
      published: "已发布",
      forked: "已 Fork",
      approved: "已批准",
      denied: "已拒绝",
      todo: "待办",
      doing: "进行中",
      needs_review: "待评审",
      completed: "已完成",
    }
    : {
      draft: copy.idle,
      awaiting_builder_confirmation: "awaiting confirmation",
      awaiting_reviewer_approval: "awaiting confirmation",
      blocked: "blocked",
      ready_to_preview: "ready to preview",
      previewing: "previewing",
      published: "published",
      forked: "forked",
      approved: "approved",
      denied: "denied",
      todo: "todo",
      doing: "doing",
      needs_review: "needs_review",
      completed: "completed",
    };
  return labels[status] || status;
}

function profileLabel(profileId: string, lang: Lang) {
  if (lang !== "zh") return profileId.toUpperCase();
  const labels: Record<string, string> = {
    "local-bun-sqlite": "本地运行 · 嵌入式数据",
    focused_profile: "个人专注配置",
  };
  return labels[profileId] ?? profileId;
}

function roleLabel(role: string, lang: Lang) {
  if (lang !== "zh") return role;
  const labels: Record<string, string> = {
    builder: "构建者",
    reviewer: "评审者",
    maintainer: "维护者",
  };
  return labels[role] ?? role;
}

function localizedBuilderMessage(message: string, lang: Lang) {
  if (lang !== "zh") return message;
  const labels: Record<string, string> = {
    "Add a review queue so items can be marked needs_review and approved.": "添加一个评审队列，让事项可以标记为待评审并被批准。",
    "Add a priority lane to the Dev Board.": "为开发看板加入优先级工作流。",
    "Add GitHub attention to the Dev Board.": "为开发看板加入 GitHub 关注项。",
    "Add GitHub issue and pull request attention to the Dev Board, and also add a priority lane so every item can be triaged as P1, P2, or P3.": "为开发看板加入 GitHub issue / PR 关注项，并加入 P1/P2/P3 优先级工作流。",
    "Add dependency tracking, blocker triage, CI health, and a delivery timeline so the Dev Board can show what is blocked, what depends on what, which checks are failing, and what is due this week.": "加入依赖追踪、阻塞处理、CI 健康度和交付时间线，让开发看板能展示阻塞事项、前置依赖、失败检查和本周截止项。",
    "我觉得需要改负责人的功能。": "我觉得需要改负责人的功能。",
  };
  return labels[message] ?? message;
}

function localizedProposalSummary(summary: string, lang: Lang) {
  if (lang !== "zh") return summary;
  const labels: Record<string, string> = {
    "Proposal": "提案",
    "Add a review queue to the Dev Board.": "为开发看板加入评审队列。",
    "Add GitHub attention to the Dev Board.": "为开发看板加入 GitHub 关注项。",
    "Add a priority lane to the Dev Board.": "为开发看板加入优先级工作流。",
    "Add GitHub attention and priority lane to the Dev Board.": "为开发看板同时加入 GitHub 关注项和优先级工作流。",
    "Add review queue and GitHub attention to the Dev Board.": "为开发看板同时加入评审队列和 GitHub 关注项。",
    "Add review queue and priority lane to the Dev Board.": "为开发看板同时加入评审队列和优先级工作流。",
    "Add review queue, GitHub attention, and priority lane to the Dev Board.": "为开发看板同时加入评审队列、GitHub 关注项和优先级工作流。",
    "Add a dependency map to the Dev Board.": "为开发看板加入依赖地图。",
    "Add blocker triage to the Dev Board.": "为开发看板加入阻塞处理。",
    "Add CI health to the Dev Board.": "为开发看板加入 CI 健康度。",
    "Add a delivery timeline to the Dev Board.": "为开发看板加入交付时间线。",
    "Add direct owner editing to the Dev Board.": "为开发看板加入负责人直接编辑能力。",
    "Add dependency map, blocker triage, CI health, and delivery timeline to the Dev Board.": "为开发看板同时加入依赖地图、阻塞处理、CI 健康度和交付时间线。",
    "Refine the Dev Board modules.": "细化开发看板模块。",
  };
  return labels[summary] ?? localizedBuilderMessage(summary, lang);
}

function localizedScopeBoundary(text: string, lang: Lang) {
  if (lang !== "zh") return text;
  const labels: Record<string, string> = {
    "source-data-builder-confirmation": "源码和数据变更需要构建者确认",
    "The change updates the generated Dev Board source, then the Host rehearses data carry-forward before publish.": "这次变更会更新生成应用的源文件，然后由宿主在发布前预演数据继承。",
  };
  return labels[text] ?? text;
}

function localizedDataPolicy(text: string, lang: Lang) {
  if (lang !== "zh") return text;
  const labels: Record<string, string> = {
    "carry-forward-with-receipt": "带收据的数据继承预演",
    "source-data-builder-confirmation": "源码和数据变更需要构建者确认",
  };
  return labels[text] ?? localizedScopeBoundary(text, lang);
}

function moduleDisplay(mod: { readonly kind: string; readonly title: string; readonly description: string }, lang: Lang) {
  if (lang !== "zh") return { title: mod.title, kind: mod.kind, description: mod.description };
  const labels: Record<string, { readonly title: string; readonly kind: string; readonly description: string }> = {
    watchlist: {
      title: "工程关注列表",
      kind: "关注列表",
      description: "让最高风险的项目事项始终可见。",
    },
    release_checklist: {
      title: "发布检查清单",
      kind: "发布检查",
      description: "在发布版本前跟踪准备状态和检查项。",
    },
    review_queue: {
      title: "评审队列",
      kind: "评审队列",
      description: "让事项经过待评审和已批准状态。",
    },
    github_attention: {
      title: "GitHub 关注项",
      kind: "GitHub 关注",
      description: "集中展示需要处理的 issue 和 pull request。",
    },
    priority_lane: {
      title: "优先级工作流",
      kind: "优先级",
      description: "把 P1/P2/P3 工作拆开，让下一步行动更明确。",
    },
    daily_plan: {
      title: "每日计划",
      kind: "每日计划",
      description: "不打开完整项目管理器，也能规划下一段工作。",
    },
    notes: {
      title: "工作笔记",
      kind: "笔记",
      description: "先记录零散实现观察，避免它们丢失。",
    },
    dependency_map: {
      title: "依赖地图",
      kind: "依赖",
      description: "展示事项之间的前置依赖。",
    },
    blocker_triage: {
      title: "阻塞处理",
      kind: "阻塞",
      description: "追踪被阻塞事项和恢复路径。",
    },
    ci_health: {
      title: "CI 健康度",
      kind: "CI",
      description: "把构建和测试信号放进看板。",
    },
    delivery_timeline: {
      title: "交付时间线",
      kind: "时间线",
      description: "按截止日期和工作量观察交付压力。",
    },
  };
  return labels[mod.kind] ?? { title: mod.title, kind: mod.kind, description: mod.description };
}

function itemTitle(item: DevBoardItem, lang: Lang) {
  if (lang !== "zh") return item.title;
  const labels: Record<string, string> = {
    "ci-flake": "排查预览发布中的 CI 偶发失败",
    "pr-review": "评审待处理的看板 PR",
    "release-notes": "准备周五发布说明",
    "focus-auth": "梳理 OAuth 回调边界问题",
    "read-issues": "查看最近需要关注的 GitHub issue",
    "notes-cleanup": "清理过期实现笔记",
  };
  return labels[item.id] ?? item.title;
}

function logKind(kind: string, lang: Lang) {
  if (lang !== "zh") return kind;
  const labels: Record<string, string> = {
    host: "宿主",
    builder: "构建者",
    assistant: "构建智能体",
    session: "会话",
    tool: "工具",
    permission: "权限",
    error: "错误",
  };
  return labels[kind] ?? kind;
}

function logText(text: string, lang: Lang) {
  if (lang !== "zh") return text;
  if (text.startsWith("Project created with ")) {
    return `项目已创建，包含 ${moduleSummaryText(text.slice("Project created with ".length).replace(/ modules\.$/, ""), lang)} 模块。`;
  }
  if (text.startsWith("Builder request received: ")) {
    return `收到构建者需求：${localizedBuilderMessage(text.slice("Builder request received: ".length), lang)}`;
  }
  if (text.startsWith("Deterministic draft added modules: ")) {
    return `确定性草稿已加入模块：${moduleSummaryText(text.slice("Deterministic draft added modules: ".length).replace(/\.$/, ""), lang)}。`;
  }
  if (text === "Deterministic draft added runtime action: edit_owner.") return "确定性草稿已加入运行时动作：编辑负责人。";
  if (text.startsWith("Draft workspace prepared: ")) return "草稿工作区已准备。";
  if (text.startsWith("Starting real code agent")) return text.replace("Starting real code agent", "正在启动真实构建智能体");
  if (text === "Running draft guardrails against src/board.json.") return "正在对 src/board.json 执行草稿校验。";
  if (text === "Running draft guardrails against src/board.json and src/runtime.json.") return "正在对 src/board.json 和 src/runtime.json 执行草稿校验。";
  if (text.startsWith("Draft verification passed. Changed paths: ")) {
    return `草稿校验通过。变更路径：${text.slice("Draft verification passed. Changed paths: ".length)}`;
  }
  if (text.startsWith("Approved and applied. ")) {
    return text.replace("Approved and applied.", "已批准并执行。").replace(" is ready to preview.", " 已可预览。");
  }
  if (text.startsWith("Approval blocked: ")) return `审批被阻断：${text.slice("Approval blocked: ".length)}`;
  if (text.startsWith("Code apply failed: ")) return `代码应用失败：${text.slice("Code apply failed: ".length)}`;
  if (text.startsWith("Forked from ")) return text.replace("Forked from ", "已从 ").replace(" via ", " 通过 ").replace(/\.$/, " Fork。");
  return text;
}

function moduleSummaryText(summary: string, lang: Lang) {
  if (lang !== "zh") return summary;
  return summary
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((kind) => moduleDisplay({ kind, title: kind, description: "" }, lang).kind)
    .join("、") || "无";
}

function workspaceSummary(project: Project, copy: typeof i18n.en) {
  if (copy === i18n.zh) {
    return `${project.name}：${statusLabel(project.status, copy)}。${copy.version} ${project.current_version_id}。${copy.live} ${project.active_version_id || copy.unavailable}。`;
  }
  return `${project.name}: ${statusLabel(project.status, copy)}. ${copy.version} ${project.current_version_id}. ${copy.live} ${project.active_version_id || copy.unavailable}.`;
}

function proposalHighlights(message: string, copy: typeof i18n.en) {
  const lower = message.toLowerCase();
  const highlights: string[] = [];
  if (lower.includes("review") || lower.includes("评审") || lower.includes("审核") || lower.includes("批准")) {
    highlights.push(copy.reviewModule, copy.reviewField);
  }
  if (lower.includes("github") || lower.includes("issue") || lower.includes("pull request") || /\bpr\b/.test(lower) || lower.includes("议题") || lower.includes("拉取请求") || lower.includes("关注项")) {
    highlights.push(copy.githubModule, copy.githubField);
  }
  if (lower.includes("priority") || lower.includes("focus") || /\bp[123]\b/.test(lower) || lower.includes("优先级") || lower.includes("重点")) {
    highlights.push(copy.priorityModule, copy.priorityField);
  }
  if (lower.includes("dependency") || lower.includes("depends") || lower.includes("依赖") || lower.includes("前置")) {
    highlights.push(copy.dependencyModule, copy.dependencyField);
  }
  if (lower.includes("blocker") || lower.includes("blocked") || lower.includes("blocking") || lower.includes("阻塞") || lower.includes("卡住")) {
    highlights.push(copy.blockerModule, copy.blockerField);
  }
  if (lower.includes("ci") || lower.includes("build health") || lower.includes("test signal") || lower.includes("pipeline") || lower.includes("checks") || lower.includes("测试信号") || lower.includes("构建") || lower.includes("流水线")) {
    highlights.push(copy.ciModule, copy.ciField);
  }
  if (lower.includes("due date") || lower.includes("deadline") || lower.includes("timeline") || lower.includes("delivery") || lower.includes("eta") || lower.includes("排期") || lower.includes("截止") || lower.includes("交付") || lower.includes("时间线")) {
    highlights.push(copy.timelineModule, copy.timelineField);
  }
  if ((lower.includes("owner") || lower.includes("assignee") || lower.includes("负责人") || lower.includes("指派"))
    && (lower.includes("edit") || lower.includes("editable") || lower.includes("change") || lower.includes("修改") || lower.includes("改") || lower.includes("编辑") || lower.includes("直接"))) {
    highlights.push(copy.ownerRuntimeAction);
  }
  highlights.push(copy.dataReceipt);
  return highlights;
}

function projectEvidence(project: Project, shares: ShareArtifact[]) {
  return {
    app_id: project.app_id,
    status: project.status,
    builder_subject: project.builder_subject,
    current_version_id: project.current_version_id,
    active_version_id: project.active_version_id,
    preview_url: project.preview_url,
    published_url: project.published_url,
    pending_proposal_id: project.pending_evolution?.proposal_id,
    share_artifacts: shares.filter((share) => share.app_id === project.app_id).map((share) => share.artifact_id),
  };
}

function localizedUrl(url: string, lang: Lang) {
  const next = new URL(url, window.location.origin);
  next.searchParams.set("lang", lang);
  return `${next.pathname}${next.search}`;
}

function format(template: string, values: Record<string, string>) {
  return Object.entries(values).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, value), template);
}

function cx(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

const root = createRoot(document.getElementById("app")!);
root.render(<App />);
