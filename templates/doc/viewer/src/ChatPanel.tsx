import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAction, usePneumaState, useWireConnection } from "@pneuma-framework/viewer-react";

/**
 * Collapsible right-edge chat sidebar. Click the tab to toggle.
 */
export function ChatPanel() {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState("");
  const [sentMessages, setSentMessages] = useState<string[]>([]);
  const sendAction = useAction();
  const conn = useWireConnection();
  const { turns, toasts } = usePneumaState();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const turnIds = Object.keys(turns);
  // Interleave user messages with agent turns in index order — assumes each
  // user message triggers one agent turn. Not perfect (rapid user sends will
  // bunch up before replies land), but matches the common turn-taking shape.
  const items: Array<{ role: "user" | "agent"; text: string; key: string }> = [];
  for (let i = 0; i < Math.max(sentMessages.length, turnIds.length); i++) {
    const u = sentMessages[i];
    if (u !== undefined) items.push({ role: "user", text: u, key: `u-${i}` });
    const tid = turnIds[i];
    if (tid !== undefined) items.push({ role: "agent", text: turns[tid] ?? "", key: `a-${tid}` });
  }
  const latestTail = items.at(-1)?.text ?? "";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [latestTail, items.length]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const ok = sendAction({ kind: "user-message", text });
    if (!ok) return;
    setSentMessages((prev) => [...prev, text]);
    setDraft("");
  }

  return (
    <>
      <button
        aria-label={open ? "Collapse chat" : "Expand chat"}
        onClick={() => setOpen((o) => !o)}
        style={{
          position: "fixed", right: open ? 360 : 0, top: 16, zIndex: 2,
          border: "1px solid #e7e5e4",
          borderRight: open ? "none" : "1px solid #e7e5e4",
          background: "#fff", padding: "6px 10px", cursor: "pointer",
          borderRadius: "4px 0 0 4px",
          transition: "right 150ms ease",
        }}
      >{open ? "→" : "←"}</button>
      <aside
        style={{
          position: "fixed", top: 0, right: open ? 0 : -360, bottom: 0, width: 360,
          background: "#fff", borderLeft: "1px solid #e7e5e4",
          display: "flex", flexDirection: "column",
          transition: "right 150ms ease", zIndex: 1,
        }}
      >
        <header style={{ padding: "12px 16px", borderBottom: "1px solid #e7e5e4", fontSize: 14 }}>
          <strong>Chat</strong>
          <span style={{ marginLeft: 12, color: conn.status === "open" ? "#16a34a" : "#dc2626", fontSize: 12 }}>
            {conn.status}
          </span>
        </header>
        <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", padding: "12px 16px", fontSize: 14 }}>
          {items.map((it) => (
            <div
              key={it.key}
              style={{
                margin: "8px 0",
                color: it.role === "agent" ? "#0c4a6e" : "#1c1917",
                whiteSpace: it.role === "agent" ? "pre-wrap" : "normal",
              }}
            >
              <strong>{it.role === "agent" ? "Agent" : "You"}:</strong> {it.text}
            </div>
          ))}
          {toasts.map((t, i) => (
            <div key={`t-${i}`} style={{ color: t.level === "error" ? "#dc2626" : "#78716c", fontSize: 12 }}>
              {t.message}
            </div>
          ))}
        </div>
        <form onSubmit={submit} style={{ display: "flex", borderTop: "1px solid #e7e5e4" }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Type a message · 输入消息…"
            style={{ flex: 1, border: "none", padding: 12, outline: "none", fontSize: 14 }}
          />
          <button
            type="submit"
            style={{ border: "none", background: "#0ea5e9", color: "#fff", padding: "0 16px", cursor: "pointer" }}
          >Send · 发送</button>
        </form>
      </aside>
    </>
  );
}
