import { marked } from "marked";
import type { BookmarkWithInterpretations } from "../../server/api-types.js";

export function TimelineView({ bookmarks }: { bookmarks: BookmarkWithInterpretations[] }) {
  if (bookmarks.length === 0) {
    return (
      <p style={{ color: "var(--ink-muted)", textAlign: "center", padding: "var(--sp-3xl)" }}>
        No bookmarks yet. Paste a URL above to begin · 还没有书签，粘贴一个 URL 开始。
      </p>
    );
  }
  return (
    <div className="bm-timeline">
      {bookmarks.map((b) => (
        <article key={b.id} className="bm-timeline__card">
          <h3>{b.title ?? b.url}</h3>
          <div className="url">
            <a href={b.url} target="_blank" rel="noreferrer">{b.url}</a>
            {" · "}
            {new Date(b.fetched_at).toLocaleString()}
          </div>
          {b.interpretations.map((ip) => (
            <div key={ip.id} className="bm-timeline__lens">
              <div className="bm-timeline__lens-name">{ip.lens_name}</div>
              <div
                className="bm-timeline__lens-body"
                dangerouslySetInnerHTML={{ __html: marked.parse(ip.body) as string }}
              />
            </div>
          ))}
        </article>
      ))}
    </div>
  );
}
