import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAction, usePneumaState, useWireConnection } from "@pneuma-framework/viewer-react";

/**
 * Right-column build-phase agent companion. Permanent (no toggle) — bookmarks
 * keeps a fixed two-column shell since the main content has its own tab
 * switcher and doesn't compete for width the way a long-form doc would.
 */
export function ChatPanel() {
  const [draft, setDraft] = useState("");
  const [sentMessages, setSentMessages] = useState<string[]>([]);
  const sendAction = useAction();
  const { status } = useWireConnection();
  const { turns, toasts } = usePneumaState();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const turnIds = Object.keys(turns);
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

  function submit(e: FormEvent): void {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    const ok = sendAction({ kind: "user-message", text });
    if (!ok) return;
    setSentMessages((prev) => [...prev, text]);
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
