import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  RELEASE_PRIORITIES,
  RELEASE_RISKS,
  RELEASE_STATUSES,
  type Health,
  type ReleaseItem,
  type ReleaseItemWithEvents,
  type ReleasePriority,
  type ReleaseRisk,
  type ReleaseStatus,
  type ReleaseSummary,
} from "../shared/contracts";

const STATUS_LABEL: Record<ReleaseStatus, string> = {
  queued: "Queued",
  in_progress: "In progress",
  blocked: "Blocked",
  shipped: "Shipped",
};

function envOf(item: ReleaseItem): string | undefined {
  // `environment` is added by an evolution; read it defensively so the v0 UI
  // keeps working before the field exists.
  const value = (item as Record<string, unknown>).environment;
  return typeof value === "string" ? value : undefined;
}

function StatusPill({ status }: { status: ReleaseStatus }) {
  return (
    <span className={`status-pill s-${status}`}>
      <span className="led" />
      {STATUS_LABEL[status]}
    </span>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.round(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export function App() {
  const [items, setItems] = useState<ReleaseItem[]>([]);
  const [summary, setSummary] = useState<ReleaseSummary | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [selected, setSelected] = useState<ReleaseItemWithEvents | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (keepId?: string) => {
    try {
      const [itemsRes, summaryRes, healthRes] = await Promise.all([
        fetch("/api/items"),
        fetch("/api/summary"),
        fetch("/api/health"),
      ]);
      const nextItems: ReleaseItem[] = await itemsRes.json();
      setItems(nextItems);
      setSummary(await summaryRes.json());
      setHealth(await healthRes.json());
      const focusId = keepId ?? selected?.id ?? nextItems[0]?.id;
      if (focusId) {
        const detail = await fetch(`/api/items/${focusId}`);
        if (detail.ok) setSelected(await detail.json());
      }
      setError(null);
    } catch {
      setError("Could not reach the release API.");
    } finally {
      setLoading(false);
    }
  }, [selected?.id]);

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const select = useCallback(async (id: string) => {
    const res = await fetch(`/api/items/${id}`);
    if (res.ok) setSelected(await res.json());
  }, []);

  const transition = useCallback(
    async (id: string, toStatus: ReleaseStatus) => {
      await fetch(`/api/items/${id}/transition`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ toStatus }),
      });
      await refresh(id);
    },
    [refresh],
  );

  return (
    <div className="deck">
      <header className="masthead">
        <div className="wordmark">
          <span className="wordmark-glyph" aria-hidden />
          <div>
            <h1>Release Deck</h1>
            <span className="tag">operations board</span>
          </div>
        </div>
        {summary && (
          <div className="signals" role="group" aria-label="Release summary">
            <div className="signal">
              <span className="v">{summary.byStatus.queued}</span>
              <span className="k">Queued</span>
            </div>
            <div className="signal">
              <span className="v">{summary.byStatus.in_progress}</span>
              <span className="k">In flight</span>
            </div>
            <div className="signal">
              <span className="v">{summary.byStatus.blocked}</span>
              <span className="k">Blocked</span>
            </div>
            <div className="signal is-risk">
              <span className="v">{summary.atRisk}</span>
              <span className="k">At risk</span>
            </div>
          </div>
        )}
      </header>

      <div className="stage">
        <section>
          <p className="section-label">
            The queue
            {health && (
              <span className={`persistence ${health.persistence === "neon" ? "" : "is-memory"}`}>
                <span className="led" />
                {health.persistence === "neon" ? "Neon" : "preview"}
              </span>
            )}
          </p>

          {loading ? (
            <div className="queue">
              <div className="skeleton" />
              <div className="skeleton" />
              <div className="skeleton" />
            </div>
          ) : error ? (
            <div className="empty">
              <strong>Off the air</strong>
              <span>{error}</span>
            </div>
          ) : items.length === 0 ? (
            <div className="empty">
              <strong>The deck is clear</strong>
              <span>No release work yet. Queue the first item from the panel on the right.</span>
            </div>
          ) : (
            <div className="queue">
              {items.map((item) => {
                const env = envOf(item);
                return (
                  <button
                    key={item.id}
                    className={`card${selected?.id === item.id ? " is-active" : ""}`}
                    onClick={() => void select(item.id)}
                  >
                    <div className="card-top">
                      <h3 className="card-title">{item.title}</h3>
                      <StatusPill status={item.status} />
                    </div>
                    {item.summary && <p className="card-summary">{item.summary}</p>}
                    <div className="card-meta">
                      <span className="owner">{item.owner}</span>
                      <span className="dot-sep" />
                      <span className={`chip prio-${item.priority}`}>{item.priority}</span>
                      <span className={`chip risk-${item.risk}`}>risk: {item.risk}</span>
                      {env && <span className="chip env">{env}</span>}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        <aside className="panel">
          {selected ? (
            <>
              <div className="fade-in">
                <h2>{selected.title}</h2>
                <span className="panel-id">{selected.id}</span>
              </div>
              <div className="transitions">
                {RELEASE_STATUSES.filter((s) => s !== selected.status).map((s) => (
                  <button
                    key={s}
                    className={`move s-${s}`}
                    onClick={() => void transition(selected.id, s)}
                  >
                    → {STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
              <div>
                <p className="section-label">Timeline</p>
                <div className="timeline">
                  {selected.events
                    .slice()
                    .reverse()
                    .map((e) => (
                      <div key={e.id} className={`event ${e.toStatus ? `s-${e.toStatus}` : ""}`}>
                        <div className="event-rail">
                          <span
                            className="event-mark"
                            style={e.toStatus ? { background: `var(--st-${e.toStatus})` } : undefined}
                          />
                          <span className="event-line" />
                        </div>
                        <div className="event-body">
                          <span className="event-msg">{e.message}</span>
                          <span className="event-time">{timeAgo(e.createdAt)}</span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </>
          ) : (
            <div className="empty">
              <strong>Select a release</strong>
              <span>Pick an item from the queue to see its timeline and move it forward.</span>
            </div>
          )}

          <Composer onCreated={(id) => void refresh(id)} />
        </aside>
      </div>
    </div>
  );
}

function Composer({ onCreated }: { onCreated: (id: string) => void }) {
  const [title, setTitle] = useState("");
  const [owner, setOwner] = useState("");
  const [priority, setPriority] = useState<ReleasePriority>("medium");
  const [risk, setRisk] = useState<ReleaseRisk>("low");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !owner.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title, owner, priority, risk }),
      });
      if (res.ok) {
        const created: ReleaseItem = await res.json();
        setTitle("");
        setOwner("");
        onCreated(created.id);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="composer" onSubmit={submit}>
      <p className="section-label">Queue a release</p>
      <div className="field">
        <label htmlFor="title">Title</label>
        <input
          id="title"
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Promote 4.8.0 to production"
        />
      </div>
      <div className="row-2">
        <div className="field">
          <label htmlFor="owner">Owner</label>
          <input
            id="owner"
            className="input"
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder="Release Eng"
          />
        </div>
        <div className="field">
          <label htmlFor="priority">Priority</label>
          <select
            id="priority"
            className="select"
            value={priority}
            onChange={(e) => setPriority(e.target.value as ReleasePriority)}
          >
            {RELEASE_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label htmlFor="risk">Risk</label>
        <select
          id="risk"
          className="select"
          value={risk}
          onChange={(e) => setRisk(e.target.value as ReleaseRisk)}
        >
          {RELEASE_RISKS.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
      </div>
      <button className="btn-primary" type="submit" disabled={busy}>
        {busy ? "Queuing…" : "Queue release"}
      </button>
    </form>
  );
}
