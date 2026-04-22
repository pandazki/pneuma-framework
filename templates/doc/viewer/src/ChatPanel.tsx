import { useEffect, useRef, useState, type FormEvent } from "react";
import { useAction, usePneumaState, useWireConnection } from "@pneuma-framework/viewer-react";

export interface ChatPanelProps {
  open: boolean;
  onToggle: () => void;
}

/**
 * Right-edge conversation companion. Visual register is intentionally quieter
 * than the document — a sans typeface, small-caps role labels, hairline
 * separators — so the reader knows the doc (left column) is the product and
 * the chat is the companion.
 */
export function ChatPanel({ open, onToggle }: ChatPanelProps) {
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
    <aside className="chat" aria-label="Chat">
      <button
        className="chat__handle"
        onClick={onToggle}
        aria-expanded={open}
        aria-label={open ? "Collapse chat panel" : "Expand chat panel"}
      >
        <span className="chat__handle-chevron" aria-hidden="true">{open ? "›" : "‹"}</span>
        <span>{open ? "Close" : "Chat"}</span>
      </button>
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
