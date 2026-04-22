import { useState, type FormEvent } from "react";
import { addBookmark } from "./api.js";

export function AddBookmark({ onAdded }: { onAdded: () => void }) {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: FormEvent): Promise<void> {
    e.preventDefault();
    const u = url.trim();
    if (!u) return;
    setBusy(true); setErr(null);
    try { await addBookmark(u); setUrl(""); onAdded(); }
    catch (x) { setErr((x as Error).message); }
    finally { setBusy(false); }
  }

  return (
    <form className="add-bm" onSubmit={submit}>
      <input
        type="url"
        required
        placeholder="Paste a URL · 贴一个 URL"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        disabled={busy}
      />
      <button type="submit" disabled={busy}>{busy ? "…" : "Add · 添加"}</button>
      {err && <span style={{ color: "var(--accent)" }}>{err}</span>}
    </form>
  );
}
