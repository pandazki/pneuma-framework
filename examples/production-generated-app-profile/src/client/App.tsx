import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Clock3,
  Database,
  GitBranch,
  ListFilter,
  Plus,
  Rocket,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "./components/ui/badge";
import { Button } from "./components/ui/button";
import { Field, Input, Textarea } from "./components/ui/input";
import type { ItemPriority, ItemRisk, ItemStatus, ReleaseEvent, ReleaseItem, ReleaseSummary } from "../shared/contracts";

const statusCopy: Record<ItemStatus, string> = {
  triage: "Triage",
  in_progress: "In progress",
  blocked: "Blocked",
  ready_for_release: "Ready",
  released: "Released",
};

const riskTone: Record<ItemRisk, "neutral" | "warning" | "danger"> = {
  low: "neutral",
  medium: "neutral",
  high: "warning",
  critical: "danger",
};

const nextStatuses: ItemStatus[] = ["triage", "in_progress", "blocked", "ready_for_release", "released"];

export function App() {
  const [items, setItems] = useState<ReleaseItem[]>([]);
  const [events, setEvents] = useState<ReleaseEvent[]>([]);
  const [summary, setSummary] = useState<ReleaseSummary>({ total: 0, blocked: 0, highRisk: 0, releaseReady: 0 });
  const [activeId, setActiveId] = useState<string | null>(null);
  const [priority, setPriority] = useState<ItemPriority | "all">("all");
  const [status, setStatus] = useState<ItemStatus | "all">("all");
  const [draft, setDraft] = useState({
    title: "Confirm production deploy checklist",
    owner: "Avery",
    notes: "Add this before the release captain signs off.",
    risk: "medium" as ItemRisk,
    priority: "P2" as ItemPriority,
  });
  const [isSaving, setIsSaving] = useState(false);

  async function refresh() {
    const [itemRes, eventRes, summaryRes] = await Promise.all([
      fetch("/api/items"),
      fetch("/api/events"),
      fetch("/api/summary"),
    ]);
    const nextItems = (await itemRes.json()).items as ReleaseItem[];
    setItems(nextItems);
    setEvents((await eventRes.json()).events as ReleaseEvent[]);
    setSummary((await summaryRes.json()) as ReleaseSummary);
    setActiveId((current) => current ?? nextItems[0]?.id ?? null);
  }

  useEffect(() => {
    void refresh();
  }, []);

  const filteredItems = useMemo(
    () =>
      items.filter((item) => {
        if (priority !== "all" && item.priority !== priority) return false;
        if (status !== "all" && item.status !== status) return false;
        return true;
      }),
    [items, priority, status],
  );

  const activeItem = items.find((item) => item.id === activeId) ?? filteredItems[0] ?? items[0];
  const activeEvents = events.filter((event) => event.itemId === activeItem?.id);

  async function createItem() {
    setIsSaving(true);
    try {
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(draft),
      });
      if (!res.ok) throw new Error(await res.text());
      const { item } = (await res.json()) as { item: ReleaseItem };
      await refresh();
      setActiveId(item.id);
    } finally {
      setIsSaving(false);
    }
  }

  async function moveTo(nextStatus: ItemStatus) {
    if (!activeItem) return;
    await fetch(`/api/items/${activeItem.id}/transition`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        status: nextStatus,
        actor: "Release captain",
        message: `Moved ${activeItem.title} to ${statusCopy[nextStatus]}`,
      }),
    });
    await refresh();
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark">
          <Rocket size={20} />
        </div>
        <div>
          <p className="eyebrow">Release Operations</p>
          <h1>Operations Board</h1>
          <p className="sidebar-copy">
            A generated product scaffold for teams that need workflow depth, deploy evidence, and production-grade UI.
          </p>
        </div>
        <nav className="nav-list" aria-label="Board sections">
          <a className="nav-item active" href="#queue">
            <ListFilter size={16} />
            Queue
          </a>
          <a className="nav-item" href="#evidence">
            <ShieldCheck size={16} />
            Evidence
          </a>
          <a className="nav-item" href="#data">
            <Database size={16} />
            Data
          </a>
        </nav>
        <div className="deploy-card">
          <p className="eyebrow">Profile</p>
          <strong>Bun + Hono + React + Neon</strong>
          <span>Docker and Vercel ready, with Drizzle migrations and Zod contracts.</span>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Production generated app</p>
            <h2>Release cockpit</h2>
          </div>
          <div className="topbar-actions">
            <Badge tone="info">Neon-ready</Badge>
            <Badge tone="success">Vercel + Docker</Badge>
          </div>
        </header>

        <section className="metrics" aria-label="Release summary">
          <Metric icon={<CircleDot size={18} />} label="Total work" value={summary.total} />
          <Metric icon={<AlertTriangle size={18} />} label="High risk" value={summary.highRisk} />
          <Metric icon={<Clock3 size={18} />} label="Blocked" value={summary.blocked} />
          <Metric icon={<CheckCircle2 size={18} />} label="Ready" value={summary.releaseReady} />
        </section>

        <section className="content-grid">
          <section className="panel queue-panel" id="queue">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Active queue</p>
                <h3>Release work</h3>
              </div>
              <div className="filter-row">
                {(["all", "P0", "P1", "P2", "P3"] as const).map((value) => (
                  <button
                    className={`chip ${priority === value ? "selected" : ""}`}
                    key={value}
                    onClick={() => setPriority(value)}
                    type="button"
                  >
                    {value === "all" ? "All" : value}
                  </button>
                ))}
              </div>
            </div>

            <div className="status-row" aria-label="Status filter">
              {(["all", ...nextStatuses] as const).map((value) => (
                <button
                  className={`status-filter ${status === value ? "selected" : ""}`}
                  key={value}
                  onClick={() => setStatus(value)}
                  type="button"
                >
                  {value === "all" ? "All states" : statusCopy[value]}
                </button>
              ))}
            </div>

            <div className="item-list">
              {filteredItems.map((item) => (
                <button
                  className={`item-row ${activeItem?.id === item.id ? "active" : ""}`}
                  key={item.id}
                  onClick={() => setActiveId(item.id)}
                  type="button"
                >
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.owner} · {statusCopy[item.status]}</small>
                  </span>
                  <Badge tone={riskTone[item.risk]}>{item.risk}</Badge>
                  <span className="priority-pill">{item.priority}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="panel detail-panel" id="evidence">
            {activeItem ? (
              <>
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Selected work</p>
                    <h3>{activeItem.title}</h3>
                  </div>
                  <Badge tone={riskTone[activeItem.risk]}>{activeItem.priority}</Badge>
                </div>
                <p className="detail-copy">{activeItem.notes}</p>
                <div className="action-strip">
                  {nextStatuses.map((next) => (
                    <Button
                      disabled={activeItem.status === next}
                      key={next}
                      onClick={() => void moveTo(next)}
                      tone={next === "released" ? "primary" : "secondary"}
                    >
                      {statusCopy[next]}
                    </Button>
                  ))}
                </div>
                <div className="timeline">
                  {activeEvents.map((event) => (
                    <div className="timeline-event" key={event.id}>
                      <GitBranch size={15} />
                      <span>
                        <strong>{event.message}</strong>
                        <small>{event.actor} · {new Date(event.createdAt).toLocaleString()}</small>
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <EmptyState />
            )}
          </section>
        </section>

        <section className="panel create-panel" id="data">
          <div>
            <p className="eyebrow">Create work</p>
            <h3>Add release item</h3>
          </div>
          <div className="form-grid">
            <Field label="Title">
              <Input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
            </Field>
            <Field label="Owner">
              <Input value={draft.owner} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} />
            </Field>
            <Field label="Priority">
              <div className="segmented">
                {(["P0", "P1", "P2", "P3"] as const).map((value) => (
                  <button
                    className={draft.priority === value ? "selected" : ""}
                    key={value}
                    onClick={() => setDraft({ ...draft, priority: value })}
                    type="button"
                  >
                    {value}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Risk">
              <div className="segmented">
                {(["low", "medium", "high", "critical"] as const).map((value) => (
                  <button
                    className={draft.risk === value ? "selected" : ""}
                    key={value}
                    onClick={() => setDraft({ ...draft, risk: value })}
                    type="button"
                  >
                    {value}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Notes">
              <Textarea value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
            </Field>
            <Button disabled={isSaving} onClick={() => void createItem()} tone="primary">
              <Plus size={16} />
              {isSaving ? "Creating..." : "Create item"}
            </Button>
          </div>
        </section>
      </section>
    </main>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="metric">
      <span className="metric-icon">{icon}</span>
      <span>
        <strong>{value}</strong>
        <small>{label}</small>
      </span>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <ArrowRight size={24} />
      <strong>Select a release item</strong>
      <span>The detail panel shows transitions, evidence, and the event timeline.</span>
    </div>
  );
}
