import {
  Boxes,
  CheckCircle2,
  ExternalLink,
  GitBranch,
  Languages,
  Play,
  RefreshCcw,
  Rocket,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

type Language = "en" | "zh";
type BusyTask = "create" | "agent" | "preview" | "approve" | "publish" | "rollback";

interface HostState {
  readonly app_id?: string;
  readonly agent_mode: "deterministic" | "codex-app-server";
  readonly agent_logs: readonly {
    readonly kind: "session" | "assistant" | "tool" | "warning" | "error";
    readonly text: string;
  }[];
  readonly default_request: string;
  readonly deploy_mode: "local-bun" | "vercel-api";
  readonly deployment_receipt?: {
    readonly deployment_id: string;
    readonly ready_state: string;
    readonly files: number;
  };
  readonly preview_url?: string;
  readonly published_url?: string;
  readonly persistence_mode: "memory-demo" | "neon";
  readonly project?: {
    readonly app_id: string;
    readonly title: string;
    readonly active_version_id: string;
    readonly has_draft: boolean;
    readonly proposal?: {
      readonly proposal_id: string;
      readonly summary: string;
      readonly changed_paths: readonly string[];
      readonly verification: { readonly ok: true; readonly output: string };
    };
  };
}

const copy = {
  en: {
    eyebrow: "Creation Host",
    title: "Production Profile Studio",
    subtitle: "A Builder-facing Host for a Bun + Hono + React + Neon generated product.",
    generated: "Generated Application",
    generatedTitle: "Release Operations Board",
    create: "Create from profile",
    ask: "Ask build agent",
    preview: "Start preview",
    approve: "Approve and apply",
    publish: "Publish runtime",
    rollback: "Rollback",
    openPreview: "Open preview",
    openPublished: "Open published app",
    request: "Builder request",
    proposal: "Checked proposal",
    noProposal: "No checked proposal yet",
    lifecycle: "Lifecycle",
    profile: "Profile",
    evidence: "Evidence",
    trace: "Agent trace",
    agentWorking: "Code agent is working. Trace updates live while the draft is being edited.",
    waitingTrace: "Waiting for the first agent event...",
    mode: "Agent mode",
    persistence: "Published persistence",
    deployMode: "Deploy mode",
    deployment: "Deployment",
    draft: "Draft workspace",
    active: "Active version",
    statusIdle: "No project",
    statusReady: "Project created",
    statusProposal: "Proposal ready",
    statusPreview: "Preview running",
    statusPublished: "Published runtime running",
    copyOne: "The Host owns stack choices and protected files. The agent only changes declared editable roots.",
    copyTwo: "The proposal appears only after the generated app verify command passes.",
    copyThree: "Creating from a profile produces a complete v0 app. Agent work is optional evolution, not a prerequisite.",
  },
  zh: {
    eyebrow: "Creation Host",
    title: "Production Profile Studio",
    subtitle: "面向 Builder 的 Host，用来创建 Bun + Hono + React + Neon 产物。",
    generated: "Generated Application",
    generatedTitle: "发布运营看板",
    create: "从 profile 创建",
    ask: "询问构建 agent",
    preview: "启动预览",
    approve: "批准并应用",
    publish: "发布运行时",
    rollback: "回滚",
    openPreview: "打开预览",
    openPublished: "打开线上应用",
    request: "Builder 需求",
    proposal: "已检查 Proposal",
    noProposal: "还没有通过检查的 proposal",
    lifecycle: "生命周期",
    profile: "Profile",
    evidence: "证据",
    trace: "Agent 过程",
    agentWorking: "Code agent 正在工作。Draft 修改期间这里会实时刷新过程。",
    waitingTrace: "等待第一个 agent 事件...",
    mode: "Agent 模式",
    persistence: "线上持久化",
    deployMode: "部署模式",
    deployment: "部署记录",
    draft: "Draft workspace",
    active: "当前版本",
    statusIdle: "还没有项目",
    statusReady: "项目已创建",
    statusProposal: "Proposal 已就绪",
    statusPreview: "预览运行中",
    statusPublished: "线上运行中",
    copyOne: "Host 拥有技术栈选择和 protected files。agent 只能修改声明过的 editable roots。",
    copyTwo: "只有 generated app 自己的 verify 通过后，proposal 才会出现。",
    copyThree: "从 profile 创建会得到完整 v0 应用。agent 工作是后续演进，不是发布前置条件。",
  },
} satisfies Record<Language, Record<string, string>>;

export function App() {
  const [lang, setLang] = useState<Language>("en");
  const [state, setState] = useState<HostState | undefined>();
  const [request, setRequest] = useState("Add release environment tracking so operators can separate staging and production work.");
  const [busy, setBusy] = useState<BusyTask | undefined>();
  const [error, setError] = useState<string | undefined>();
  const traceListRef = useRef<HTMLDivElement | null>(null);
  const t = copy[lang];

  async function refresh() {
    const res = await fetch("/api/state");
    const next = await res.json() as HostState;
    setState(next);
    setRequest((current) => current || next.default_request);
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    if (!busy) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/state", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        setState(await res.json() as HostState);
      } catch {
        // The foreground action will surface the final error if the request fails.
      }
    };
    void poll();
    const timer = setInterval(() => void poll(), busy === "agent" ? 900 : 1_500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [busy]);

  useEffect(() => {
    const list = traceListRef.current;
    if (!list) return;
    list.scrollTop = list.scrollHeight;
  }, [state?.agent_logs.length]);

  async function action(task: BusyTask, path: string, body?: unknown) {
    setBusy(task);
    setError(undefined);
    try {
      const res = await fetch(path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = await res.json();
      if (!res.ok || payload.ok === false) throw new Error(payload.error ?? res.statusText);
      setState(payload as HostState);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(undefined);
    }
  }

  const status = useMemo(() => {
    if (state?.preview_url) return t.statusPreview;
    if (state?.project?.proposal) return t.statusProposal;
    if (state?.published_url) return t.statusPublished;
    if (state?.project) return t.statusReady;
    return t.statusIdle;
  }, [state, t]);

  const canAsk = Boolean(state?.project) && !busy;
  const canPreview = Boolean(state?.project) && !busy;
  const canApprove = Boolean(state?.project?.proposal) && !busy;
  const canPublish = Boolean(state?.project && !state.project.proposal) && !busy;
  const canRollback = state?.project?.active_version_id === "v1" && !busy;

  return (
    <main className="shell">
      <aside className="rail">
        <div className="mark"><Sparkles size={18} /></div>
        <p className="eyebrow">{t.eyebrow}</p>
        <h1>{t.title}</h1>
        <p>{t.subtitle}</p>
        <div className="language">
          <Languages size={15} />
          <button className={lang === "en" ? "selected" : ""} onClick={() => setLang("en")} type="button">EN</button>
          <button className={lang === "zh" ? "selected" : ""} onClick={() => setLang("zh")} type="button">中文</button>
        </div>
      </aside>

      <section className="stage">
        <header className="topbar">
          <div>
            <p className="eyebrow">{t.generated}</p>
            <h2>{t.generatedTitle}</h2>
          </div>
          <div className="status-pill">{status}</div>
        </header>

        <section className="grid">
          <section className="panel product-panel">
            <div className="panel-title">
              <Boxes size={18} />
              <span>{t.profile}</span>
            </div>
            <div className="profile-card">
              <strong>Bun + Hono + React + Drizzle + Zod</strong>
              <span>Neon boundary · Docker + Vercel targets · shadcn-style UI contract</span>
            </div>
            <div className="facts">
              <Fact label={t.active} value={state?.project?.active_version_id ?? "-"} />
              <Fact label={t.persistence} value={state?.persistence_mode ?? "-"} />
              <Fact label={t.deployMode} value={state?.deploy_mode ?? "-"} />
              <Fact label={t.mode} value={state?.agent_mode ?? "-"} />
            </div>
            <div className="runtime-actions">
              {state?.preview_url ? <OpenLink href={state.preview_url} label={t.openPreview} /> : null}
              {state?.published_url ? <OpenLink href={state.published_url} label={t.openPublished} /> : null}
            </div>
            {state?.deployment_receipt ? (
              <div className="deployment-receipt">
                <span>{t.deployment}</span>
                <strong>{state.deployment_receipt.ready_state}</strong>
                <code>{state.deployment_receipt.deployment_id}</code>
                <small>{state.deployment_receipt.files} files</small>
              </div>
            ) : null}
            <div className="notes">
              <p>{t.copyThree}</p>
              <p>{t.copyOne}</p>
              <p>{t.copyTwo}</p>
            </div>
          </section>

          <section className="panel builder-panel">
            <div className="panel-title">
              <GitBranch size={18} />
              <span>{t.lifecycle}</span>
            </div>
            <div className="flow-buttons">
              <button onClick={() => void action("create", "/api/projects")} type="button">
                <Rocket size={16} /> {t.create}
              </button>
              <button disabled={!canAsk} onClick={() => void action("agent", "/api/agent/draft", { request })} type="button">
                <Sparkles size={16} /> {busy === "agent" ? "..." : t.ask}
              </button>
              <button disabled={!canPreview} onClick={() => void action("preview", "/api/preview")} type="button">
                <Play size={16} /> {t.preview}
              </button>
              <button disabled={!canApprove} onClick={() => void action("approve", "/api/approve")} type="button">
                <CheckCircle2 size={16} /> {t.approve}
              </button>
              <button disabled={!canPublish} onClick={() => void action("publish", "/api/publish")} type="button">
                <ExternalLink size={16} /> {t.publish}
              </button>
              <button disabled={!canRollback} onClick={() => void action("rollback", "/api/rollback")} type="button">
                <RefreshCcw size={16} /> {t.rollback}
              </button>
            </div>

            <label className="request-box">
              <span>{t.request}</span>
              <textarea value={request} onChange={(event) => setRequest(event.target.value)} />
            </label>

            <div className="proposal">
              <div className="panel-title">
                <ShieldCheck size={18} />
                <span>{t.proposal}</span>
              </div>
              {state?.project?.proposal ? (
                <>
                  <strong>{state.project.proposal.summary}</strong>
                  <div className="path-list">
                    {state.project.proposal.changed_paths.map((path) => <code key={path}>{path}</code>)}
                  </div>
                </>
              ) : (
                <p className="muted">{t.noProposal}</p>
              )}
            </div>
            {error ? <div className="error">{error}</div> : null}
            <div className="agent-trace">
              <div className="panel-title">
                <Sparkles size={18} />
                <span>{t.trace}</span>
              </div>
              {busy === "agent" ? (
                <div className="trace-live">
                  <span aria-hidden="true" />
                  <strong>{t.agentWorking}</strong>
                </div>
              ) : null}
              {(state?.agent_logs.length ?? 0) > 0 ? (
                <div className="trace-list" ref={traceListRef}>
                  {state?.agent_logs.map((entry, index) => (
                    <div className={`trace-row trace-${entry.kind}`} key={`${entry.kind}-${index}`}>
                      <span>{entry.kind}</span>
                      <p>{entry.text}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="muted">{busy === "agent" ? t.waitingTrace : t.noProposal}</p>
              )}
            </div>
          </section>
        </section>
      </section>
    </main>
  );
}

function Fact({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="fact">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function OpenLink({ href, label }: { readonly href: string; readonly label: string }) {
  return (
    <a className="open-link" href={href} rel="noreferrer" target="_blank">
      <ExternalLink size={15} />
      {label}
    </a>
  );
}
