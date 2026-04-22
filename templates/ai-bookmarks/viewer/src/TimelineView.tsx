import { marked } from "marked";
import type { BookmarkWithInterpretations } from "../../server/api-types.js";
import type { Lens } from "../../server/lenses.js";

export function TimelineView({
  bookmarks,
  lenses,
}: {
  bookmarks: BookmarkWithInterpretations[];
  lenses: Lens[];
}) {
  if (bookmarks.length === 0) {
    return (
      <p style={{ color: "var(--ink-muted)", textAlign: "center", padding: "var(--sp-3xl)" }}>
        No bookmarks yet. Paste a URL above to begin · 还没有书签，粘贴一个 URL 开始。
      </p>
    );
  }
  const lensDisplay = new Map(lenses.map((l) => [l.name, l.displayName]));
  return (
    <div className="bm-timeline">
      {bookmarks.map((b) => {
        const done = new Set(b.interpretations.map((ip) => ip.lens_name));
        const pending = lenses.filter((l) => !done.has(l.name));
        return (
          <article key={b.id} className="bm-timeline__card">
            <h3>{b.title ?? b.url}</h3>
            <div className="url">
              <a href={b.url} target="_blank" rel="noreferrer">{b.url}</a>
              {" · "}
              {new Date(b.fetched_at).toLocaleString()}
            </div>
            {b.interpretations.map((ip) => (
              <div key={ip.id} className="bm-timeline__lens">
                <div className="bm-timeline__lens-name">{lensDisplay.get(ip.lens_name) ?? ip.lens_name}</div>
                <div
                  className="bm-timeline__lens-body"
                  dangerouslySetInnerHTML={{ __html: marked.parse(ip.body) as string }}
                />
              </div>
            ))}
            {pending.map((l) => (
              <div key={`pending-${l.name}`} className="bm-timeline__lens" data-pending="true">
                <div className="bm-timeline__lens-name">{l.displayName}</div>
                <div className="bm-timeline__lens-pending">
                  <span className="bm-timeline__spinner" aria-hidden="true" />
                  Analyzing · 解读中…
                </div>
              </div>
            ))}
          </article>
        );
      })}
    </div>
  );
}
