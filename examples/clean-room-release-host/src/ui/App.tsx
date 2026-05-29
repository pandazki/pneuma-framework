import { useCallback, useEffect, useState } from "react";

// --- shapes mirrored from the host API ------------------------------------
interface BundleManifest {
  files: { path: string; bytes: number; sha: string }[];
  totalBytes: number;
  signature: string;
}
interface VersionMeta {
  versionId: string;
  appSchemaSignature: string;
  bundle: BundleManifest;
  changedPaths: string[];
  request: string | null;
}
interface Proposal {
  draftId: string;
  agent: string;
  request: string;
  changedPaths: string[];
  diff: { added: string[]; changed: string[]; removed: string[] };
  verifyTail: string;
  appSchemaSignatureBefore: string;
  appSchemaSignatureAfter: string;
  bundleBefore: BundleManifest;
  bundleAfter: BundleManifest;
  agentNote: string;
}
interface PublishReceipt {
  target: string;
  versionId: string;
  url: string;
  persistence: string;
  dbSchema: { columns: { table: string; column: string; type: string }[]; signature: string };
  migrateTail: string;
  deploymentId?: string;
  files?: number;
}
interface ProjectView {
  id: string;
  displayName: string;
  versions: string[];
  activeVersionId: string;
  versionMeta: VersionMeta[];
  proposal: Proposal | null;
  published: PublishReceipt | null;
}
interface Config {
  agentDefault: string;
  databaseConfigured: boolean;
  vercelConfigured: boolean;
  neonBranchConfigured: boolean;
  deployTargets: string[];
}

async function api<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error((json as { message?: string }).message ?? `request failed: ${path}`);
  return json as T;
}

const fmtKb = (b: number) => `${(b / 1024).toFixed(1)} kB`;

type StageState = "idle" | "active" | "done";
const STAGES = ["Create", "Preview", "Evolve", "Proposal", "Apply", "Publish", "Rollback"] as const;

export function App() {
  const [config, setConfig] = useState<Config | null>(null);
  const [project, setProject] = useState<ProjectView | null>(null);
  const [trace, setTrace] = useState<string[]>([]);
  const [request, setRequest] = useState("Add an `environment` field (production / staging / development) to release items, end to end.");
  const [agent, setAgent] = useState("deterministic");
  const [target, setTarget] = useState("local");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void api<Config>("/api/config").then((c) => {
      setConfig(c);
      setAgent(c.agentDefault);
      if (c.vercelConfigured) setTarget("vercel");
    });
    // Restore the most recent project on load so a refresh keeps showing the
    // live proposal / publish state instead of resetting to an empty studio.
    void api<ProjectView[]>("/api/projects")
      .then((list) => {
        const latest = list[list.length - 1];
        if (latest) setProject(latest);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const tick = () => void api<{ lines: string[] }>("/api/trace").then((t) => setTrace(t.lines)).catch(() => {});
    tick();
    const id = setInterval(tick, 1500);
    return () => clearInterval(id);
  }, []);

  const run = useCallback(async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    setError(null);
    try {
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  }, []);

  const refresh = useCallback(async (id: string) => {
    setProject(await api<ProjectView>(`/api/projects/${id}`));
  }, []);

  const stageState = (stage: (typeof STAGES)[number]): StageState => {
    const p = project;
    const applied = (p?.versions.length ?? 0) > 1;
    switch (stage) {
      case "Create":
        return p ? "done" : busy === "create" ? "active" : "idle";
      case "Preview":
        return busy === "preview" ? "active" : previewUrl ? "done" : "idle";
      case "Evolve":
        return busy === "agent" ? "active" : p?.proposal || applied ? "done" : "idle";
      case "Proposal":
        return p?.proposal ? "active" : applied ? "done" : "idle";
      case "Apply":
        return busy === "approve" ? "active" : applied ? "done" : "idle";
      case "Publish":
        return busy === "publish" ? "active" : p?.published ? "done" : "idle";
      case "Rollback":
        return busy === "rollback" ? "active" : "idle";
    }
  };

  const stageHints: Record<(typeof STAGES)[number], string> = {
    Create: "copy scaffold → v0",
    Preview: "disposable memory",
    Evolve: "code-agent draft",
    Proposal: "verify gate passed",
    Apply: "materialize vNext",
    Publish: "migrate + serve",
    Rollback: "previous version",
  };

  return (
    <div className="console">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">R</span>
          <div>
            <h1>Release Host</h1>
            <span className="sub">creation studio · control plane</span>
          </div>
        </div>
        {config && (
          <div className="config">
            <span className={`badge ${config.agentDefault === "codex-app-server" ? "codex" : ""}`}>
              <span className="led" />
              agent: {config.agentDefault}
            </span>
            <span className={`badge ${config.databaseConfigured ? "on" : ""}`}>
              <span className="led" />
              neon: {config.databaseConfigured ? "connected" : "off"}
            </span>
            <span className={`badge ${config.vercelConfigured ? "on" : ""}`}>
              <span className="led" />
              vercel: {config.vercelConfigured ? "ready" : "off"}
            </span>
            <span className={`badge ${config.neonBranchConfigured ? "on" : ""}`}>
              <span className="led" />
              neon branch: {config.neonBranchConfigured ? "ready" : "off"}
            </span>
          </div>
        )}
      </header>

      <div className="pipeline">
        {STAGES.map((stage, i) => {
          const st = stageState(stage);
          return (
            <div key={stage} className={`stage is-${st}`}>
              <span className="num">
                <span className="led" />
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="name">{stage}</span>
              <span className="hint">{stageHints[stage]}</span>
            </div>
          );
        })}
      </div>

      {error && <div className="notice">{error}</div>}

      <div className="grid">
        <div>
          {/* project + lifecycle controls */}
          <section className="panel">
            <h2>Project</h2>
            {!project ? (
              <>
                <p className="muted">
                  Instantiate the production profile. Creating from a profile yields a complete{" "}
                  <code>v0</code> you can preview or publish immediately — the agent is optional evolution.
                </p>
                <div className="actions">
                  <button
                    className={`btn primary ${busy === "create" ? "busy" : ""}`}
                    disabled={busy !== null}
                    onClick={() =>
                      run("create", async () => {
                        const p = await api<ProjectView>("/api/projects", {});
                        setProject(p);
                        setPreviewUrl(null);
                      })
                    }
                  >
                    Create from profile
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="kv">
                  <dt>project</dt>
                  <dd>{project.id}</dd>
                  <dt>active</dt>
                  <dd>{project.activeVersionId}</dd>
                  <dt>versions</dt>
                  <dd>{project.versions.join(" · ")}</dd>
                </div>
                <div className="actions">
                  <button
                    className={`btn ${busy === "preview" ? "busy" : ""}`}
                    disabled={busy !== null}
                    onClick={() =>
                      run("preview", async () => {
                        const r = await api<{ url: string }>(`/api/projects/${project.id}/preview`, {});
                        setPreviewUrl(r.url);
                        window.open(r.url, "_blank");
                      })
                    }
                  >
                    Start preview
                  </button>
                  {previewUrl && (
                    <a className="btn" href={previewUrl} target="_blank" rel="noreferrer">
                      Open preview ↗
                    </a>
                  )}
                  <button
                    className={`btn ${busy === "rollback" ? "busy" : ""}`}
                    disabled={busy !== null || project.versions.length < 2}
                    onClick={() =>
                      run("rollback", async () => {
                        await api(`/api/projects/${project.id}/rollback`, {});
                        setPreviewUrl(null);
                        await refresh(project.id);
                      })
                    }
                  >
                    Rollback
                  </button>
                </div>
                {previewUrl && (
                  <p className="muted">
                    Preview runs from a disposable in-memory copy — preview actions never touch the
                    production database.
                  </p>
                )}
              </>
            )}
          </section>

          {/* evolve */}
          {project && (
            <section className="panel">
              <h2>Evolve</h2>
              <p className="muted">
                {project.proposal ? (
                  <>
                    A proposal is pending. Run the agent again to <strong>refine it</strong> — fixes
                    and additions stack onto the same draft until you approve. The scaffold&apos;s{" "}
                    <code>verify</code> re-gates every turn.
                  </>
                ) : (
                  <>
                    Ask the code agent for a product change. It edits a draft workspace; the
                    scaffold&apos;s own <code>verify</code> is the pre-proposal gate.
                  </>
                )}
              </p>
              <div className="field req-row">
                <input
                  className="input"
                  value={request}
                  onChange={(e) => setRequest(e.target.value)}
                  placeholder="Describe the evolution…"
                />
                <select className="select" style={{ width: "auto" }} value={agent} onChange={(e) => setAgent(e.target.value)}>
                  <option value="deterministic">deterministic</option>
                  <option value="codex-app-server">codex-app-server</option>
                </select>
                <button
                  className={`btn primary ${busy === "agent" ? "busy" : ""}`}
                  disabled={busy !== null}
                  onClick={() =>
                    run("agent", async () => {
                      await api<Proposal>(`/api/projects/${project.id}/agent`, { request, agent });
                      await refresh(project.id);
                    })
                  }
                >
                  {project.proposal ? "Refine proposal" : "Run agent"}
                </button>
              </div>
            </section>
          )}

          {/* proposal */}
          {project?.proposal && (
            <section className="panel">
              <h2>Proposal — checked, ready for decision</h2>
              <p className="muted">{project.proposal.agentNote}</p>
              <div className="kv">
                <dt>app schema</dt>
                <dd className="sig">
                  <span className="from">{project.proposal.appSchemaSignatureBefore}</span>
                  <span className="arrow">→</span>
                  <span className="to">{project.proposal.appSchemaSignatureAfter}</span>
                </dd>
                <dt>bundle</dt>
                <dd className="sig">
                  {fmtKb(project.proposal.bundleBefore.totalBytes)} · {project.proposal.bundleBefore.signature}
                  <span className="arrow">→</span>
                  <span className="to">
                    {fmtKb(project.proposal.bundleAfter.totalBytes)} · {project.proposal.bundleAfter.signature}
                  </span>
                </dd>
              </div>
              <div>
                <p className="muted" style={{ marginBottom: 6 }}>changed paths</p>
                <div className="paths">
                  {project.proposal.changedPaths.map((p) => (
                    <span key={p} className={`path ${project.proposal!.diff.added.includes(p) ? "added" : ""}`}>
                      {p}
                    </span>
                  ))}
                </div>
              </div>
              <div className="actions">
                <button
                  className={`btn ${busy === "preview-draft" ? "busy" : ""}`}
                  disabled={busy !== null}
                  onClick={() =>
                    run("preview-draft", async () => {
                      const r = await api<{ url: string }>(`/api/projects/${project.id}/preview`, {
                        target: "draft",
                      });
                      setPreviewUrl(r.url);
                      window.open(r.url, "_blank");
                    })
                  }
                >
                  Preview draft ↗
                </button>
                {config?.neonBranchConfigured && (
                  <button
                    className={`btn ${busy === "rehearse" ? "busy" : ""}`}
                    disabled={busy !== null}
                    title="Clone real data into a throwaway Neon branch, migrate the draft, and preview against it"
                    onClick={() =>
                      run("rehearse", async () => {
                        const r = await api<{ url: string; branchId?: string }>(
                          `/api/projects/${project.id}/preview`,
                          { target: "draft", data: "neon-branch" },
                        );
                        setPreviewUrl(r.url);
                        window.open(r.url, "_blank");
                      })
                    }
                  >
                    Rehearse on Neon branch ↗
                  </button>
                )}
                <button
                  className={`btn primary ${busy === "approve" ? "busy" : ""}`}
                  disabled={busy !== null}
                  onClick={() =>
                    run("approve", async () => {
                      await api(`/api/projects/${project.id}/approve`, {});
                      setPreviewUrl(null);
                      await refresh(project.id);
                    })
                  }
                >
                  Approve & apply
                </button>
              </div>
              <p className="muted">
                Refine before approving: run the agent again and changes stack onto this proposal.
                Preview the draft to test it first.
              </p>
            </section>
          )}

          {/* publish */}
          {project && (
            <section className="panel">
              <h2>Publish</h2>
              <div className="actions">
                <select className="select" style={{ width: "auto" }} value={target} onChange={(e) => setTarget(e.target.value)}>
                  {(config?.deployTargets ?? ["local"]).map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <button
                  className={`btn primary ${busy === "publish" ? "busy" : ""}`}
                  disabled={busy !== null || !config?.databaseConfigured}
                  onClick={() =>
                    run("publish", async () => {
                      await api(`/api/projects/${project.id}/publish`, { target });
                      await refresh(project.id);
                    })
                  }
                >
                  Publish {project.activeVersionId}
                </button>
              </div>
              {!config?.databaseConfigured && (
                <p className="muted">Set DATABASE_URL to publish against Neon.</p>
              )}
              {project.published && <PublishedReceipt receipt={project.published} />}
            </section>
          )}
        </div>

        {/* right column: evidence */}
        <div>
          {project && (
            <section className="panel">
              <h2>Version history</h2>
              <div className="versions">
                {project.versionMeta.map((m) => (
                  <div key={m.versionId} className="version">
                    <span className={`vtag ${m.versionId === project.activeVersionId ? "active" : ""}`}>
                      {m.versionId}
                      {m.versionId === project.activeVersionId ? " ●" : ""}
                    </span>
                    <span className="vmeta">
                      {m.appSchemaSignature.includes("environment") ? "schema+env · " : "base schema · "}
                      bundle {m.bundle.signature} · {fmtKb(m.bundle.totalBytes)}
                      {m.request ? ` · ${m.changedPaths.length} paths` : ""}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          <section className="panel">
            <h2>Trace</h2>
            <div className="trace">
              {trace.length === 0 ? (
                <span className="muted">Host activity will stream here.</span>
              ) : (
                trace.map((l, i) => (
                  <span key={i} className="ln">
                    {l}
                  </span>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function PublishedReceipt({ receipt }: { receipt: PublishReceipt }) {
  return (
    <div className="receipt">
      <div className="kv" style={{ marginBottom: 10 }}>
        <dt>target</dt>
        <dd>{receipt.target}</dd>
        <dt>version</dt>
        <dd>{receipt.versionId}</dd>
        <dt>persistence</dt>
        <dd>{receipt.persistence}</dd>
        {receipt.deploymentId && (
          <>
            <dt>deployment</dt>
            <dd>{receipt.deploymentId}</dd>
          </>
        )}
      </div>
      <a className="published-link" href={receipt.url} target="_blank" rel="noreferrer">
        {receipt.url} ↗
      </a>
      <p className="muted" style={{ margin: "10px 0 6px" }}>
        Neon schema ({receipt.dbSchema.columns.length} columns)
      </p>
      <div className="schema-cols">
        {receipt.dbSchema.columns.map((c) => (
          <span key={`${c.table}.${c.column}`} className={`col ${c.column === "environment" ? "fresh" : ""}`}>
            {c.table}.{c.column}
          </span>
        ))}
      </div>
    </div>
  );
}
