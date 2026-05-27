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
import { useEffect, useMemo, useState } from "react";

type Language = "en" | "zh";

interface HostState {
  readonly app_id?: string;
  readonly default_request: string;
  readonly preview_url?: string;
  readonly published_url?: string;
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
    draft: "Draft workspace",
    active: "Active version",
    statusIdle: "No project",
    statusReady: "Project created",
    statusProposal: "Proposal ready",
    statusPreview: "Preview running",
    statusPublished: "Published runtime running",
    copyOne: "The Host owns stack choices and protected files. The agent only changes declared editable roots.",
    copyTwo: "The proposal appears only after the generated app verify command passes.",
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
    draft: "Draft workspace",
    active: "当前版本",
    statusIdle: "还没有项目",
    statusReady: "项目已创建",
    statusProposal: "Proposal 已就绪",
    statusPreview: "预览运行中",
    statusPublished: "线上运行中",
    copyOne: "Host 拥有技术栈选择和 protected files。agent 只能修改声明过的 editable roots。",
    copyTwo: "只有 generated app 自己的 verify 通过后，proposal 才会出现。",
  },
} satisfies Record<Language, Record<string, string>>;

export function App() {
  const [lang, setLang] = useState<Language>("en");
  const [state, setState] = useState<HostState | undefined>();
  const [request, setRequest] = useState("Add release environment tracking so operators can separate staging and production work.");
  const [busy, setBusy] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();
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

  async function action(label: string, path: string, body?: unknown) {
    setBusy(label);
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
    if (state?.published_url) return t.statusPublished;
    if (state?.preview_url) return t.statusPreview;
    if (state?.project?.proposal) return t.statusProposal;
    if (state?.project) return t.statusReady;
    return t.statusIdle;
  }, [state, t]);

  const canAsk = Boolean(state?.project) && !busy;
  const canPreview = Boolean(state?.project?.proposal) && !busy;
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
              <Fact label={t.draft} value={state?.project?.has_draft ? "prepared" : "-"} />
              <Fact label="App ID" value={state?.app_id ?? "-"} />
            </div>
            <div className="runtime-actions">
              {state?.preview_url ? <OpenLink href={state.preview_url} label={t.openPreview} /> : null}
              {state?.published_url ? <OpenLink href={state.published_url} label={t.openPublished} /> : null}
            </div>
            <div className="notes">
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
              <button onClick={() => void action(t.create, "/api/projects")} type="button">
                <Rocket size={16} /> {t.create}
              </button>
              <button disabled={!canAsk} onClick={() => void action(t.ask, "/api/agent/draft", { request })} type="button">
                <Sparkles size={16} /> {busy === t.ask ? "..." : t.ask}
              </button>
              <button disabled={!canPreview} onClick={() => void action(t.preview, "/api/preview")} type="button">
                <Play size={16} /> {t.preview}
              </button>
              <button disabled={!canApprove} onClick={() => void action(t.approve, "/api/approve")} type="button">
                <CheckCircle2 size={16} /> {t.approve}
              </button>
              <button disabled={!canPublish} onClick={() => void action(t.publish, "/api/publish")} type="button">
                <ExternalLink size={16} /> {t.publish}
              </button>
              <button disabled={!canRollback} onClick={() => void action(t.rollback, "/api/rollback")} type="button">
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
