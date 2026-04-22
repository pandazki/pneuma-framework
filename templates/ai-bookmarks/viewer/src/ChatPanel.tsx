import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAction, usePneumaState, useWireConnection } from "@pneuma-framework/viewer-react";

/**
 * Right-column build-phase agent companion. Permanent (no toggle) — bookmarks
 * keeps a fixed two-column shell since the main content has its own tab
 * switcher and doesn't compete for width the way a long-form doc would.
 *
 * Message ordering is done chronologically, not by index-pairing. opencode
 * can emit multiple turnIds per user message (e.g. a quick ack + a tool-
 * driven follow-up), so `sentMessages[i]` does not pair 1:1 with
 * `turnIds[i]`. We capture a timestamp when each user message is submitted
 * and when each new turnId first appears, then merge-sort for display.
 */
export function ChatPanel() {
  const [draft, setDraft] = useState("");
  const [sentMessages, setSentMessages] = useState<Array<{ text: string; ts: number }>>([]);
  const [turnFirstSeen, setTurnFirstSeen] = useState<Record<string, number>>({});
  const sendAction = useAction();
  const { status } = useWireConnection();
  const { turns, toasts } = usePneumaState();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Stamp any newly-arrived turnId so we can sort it chronologically.
  useEffect(() => {
    const now = Date.now();
    setTurnFirstSeen((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const id of Object.keys(turns)) {
        if (next[id] === undefined) { next[id] = now; changed = true; }
      }
      return changed ? next : prev;
    });
  }, [turns]);

  type Item = { role: "user" | "agent"; text: string; ts: number; key: string };
  const items: Item[] = [
    ...sentMessages.map((m, i): Item => ({ role: "user", text: m.text, ts: m.ts, key: `u-${i}-${m.ts}` })),
    ...Object.keys(turns).map((tid): Item => ({
      role: "agent",
      text: turns[tid] ?? "",
      ts: turnFirstSeen[tid] ?? 0,
      key: `a-${tid}`,
    })),
  ].sort((a, b) => a.ts - b.ts);
  const latestTail = items.at(-1)?.text ?? "";

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [latestTail, items.length]);

  function submit(e: FormEvent): void {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const ok = sendAction({ kind: "user-message", text });
    if (!ok) return;
    setSentMessages((prev) => [...prev, { text, ts: Date.now() }]);
    setDraft("");
  }

  return (
    <aside className="chat" aria-label="Chat">
      <header className="chat__header">
        <h2 className="chat__title">Conversation</h2>
        <span className="chat__status" data-status={status}>{status}</span>
      </header>
      <div ref={scrollRef} className="chat__scroll">
        {items.map((it) => (
          <div key={it.key} className="msg" data-role={it.role}>
            <span className="msg__role">{it.role === "agent" ? "Agent" : "You"}</span>
            <span className="msg__body">{it.text}</span>
          </div>
        ))}
        {toasts.map((t, i) => (
          <p key={`t-${i}`} className="toast" data-level={t.level}>{t.message}</p>
        ))}
      </div>
      <form className="chat__form" onSubmit={submit}>
        <input
          className="chat__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message · 输入消息…"
          aria-label="Message input"
        />
        <button type="submit" className="chat__send" aria-label="Send message">
          Send · 发送
        </button>
      </form>
    </aside>
  );
}
