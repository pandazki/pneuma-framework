"use client";
// Beautiful UI Search (SearchList) (MIT, © 2026 Shane Levine; see ../LICENSE), from https://www.beautifului.dev/r/search.json.
// Adapted for the owner page:
//   - it opens over the page (⌘K / Ctrl K, or the search button), on a dimmed backdrop, and closes on Esc or outside;
//   - results are links, each row a monogram, a title and a quiet second line;
//   - ↑ ↓ move a highlight that glides between rows the way GlideMenu's hover layer does (the pointer moves it too),
//     Enter opens the highlighted row.
// The card, input row, clear button, empty state and row sizes are the library's.

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Monogram } from "../atoms/EntityChip";

export type PaletteItem = {
  key: string;
  title: string;
  sub: string;
  href: string;
  mark: string;
  color: string;
};

export type PaletteLabels = {
  placeholder: string;
  ariaLabel: string;
  emptyTitle: string;
  emptyHint: string;
};

export default function SearchPalette({
  open,
  onClose,
  items,
  labels,
  match,
}: {
  open: boolean;
  onClose: () => void;
  items: PaletteItem[];
  labels: PaletteLabels;
  match: (item: PaletteItem, terms: string[]) => boolean;
}) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ top: number; height: number } | null>(null);

  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results = terms.length ? items.filter((item) => match(item, terms)) : items.slice(0, 8);
  const empty = results.length === 0;
  const at = Math.min(active, Math.max(results.length - 1, 0));

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    const id = requestAnimationFrame(() => input.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useLayoutEffect(() => {
    const row = list.current?.querySelectorAll<HTMLElement>("[data-menu-row]")[at];
    if (!row || !list.current) return setBox(null);
    setBox({ top: row.offsetTop, height: row.offsetHeight });
    row.scrollIntoView({ block: "nearest" });
  }, [at, results.length, open, query]);

  if (!open) return null;

  const go = (href: string) => {
    location.href = href;
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-[oklch(0_0_0/0.18)] px-4 pt-[12vh] dark:bg-[oklch(0_0_0/0.45)]"
      style={{ animation: "fade-in 150ms ease-out both" }}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={labels.ariaLabel}
        className="w-full max-w-[420px] self-start overflow-hidden rounded-card bg-surface shadow-overlay"
        style={{ animation: "pop-in 180ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "top center" }}
      >
        {/* input row */}
        <div className="flex h-10 items-center gap-2 border-b border-line px-3 transition-colors duration-100 hover:bg-hover">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--ink-3)" strokeWidth="2" strokeLinecap="round" className="shrink-0">
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            ref={input}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive(Math.min(at + 1, results.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive(Math.max(at - 1, 0));
              } else if (event.key === "Enter" && results[at]) {
                event.preventDefault();
                go(results[at].href);
              }
            }}
            placeholder={labels.placeholder}
            aria-label={labels.ariaLabel}
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={results[at] ? `palette-${results[at].key}` : undefined}
            className="min-w-0 flex-1 bg-transparent text-[13px] text-ink outline-none placeholder:text-ink-3"
          />
          {query && (
            <button
              aria-label="Clear search"
              type="button"
              onClick={() => {
                setQuery("");
                input.current?.focus();
              }}
              className="flex size-6 items-center justify-center rounded-full text-ink-3
                transition-colors duration-100 hover:bg-line/70 hover:text-ink"
              style={{ animation: "fade-in 150ms ease-out both" }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* results / empty state */}
        {empty ? (
          <div className="flex flex-col items-center justify-center gap-1 px-4 py-8" style={{ animation: "fade-in 250ms ease-out both" }}>
            <span className="mb-1.5 flex size-8 items-center justify-center rounded-control bg-inset text-ink-3 shadow-hairline">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                <circle cx="11" cy="11" r="7" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
            </span>
            <span className="text-[13px] font-medium text-ink">{labels.emptyTitle}</span>
            <span className="text-[12px] text-ink-3">{labels.emptyHint}</span>
          </div>
        ) : (
          <div className="max-h-[50vh] overflow-y-auto p-1">
            <div ref={list} id="palette-results" role="listbox" className="relative flex flex-col gap-px">
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 rounded-[6px] bg-hover"
                style={{
                  top: box?.top ?? 0,
                  height: box?.height ?? 0,
                  opacity: box ? 1 : 0,
                  transition: "top 220ms cubic-bezier(0.23,1,0.32,1), height 220ms cubic-bezier(0.23,1,0.32,1), opacity 150ms ease",
                }}
              />
              {results.map((item, i) => (
                <a
                  key={item.key}
                  id={`palette-${item.key}`}
                  href={item.href}
                  data-menu-row
                  role="option"
                  aria-selected={i === at}
                  tabIndex={-1}
                  onMouseMove={() => i !== at && setActive(i)}
                  className="relative z-10 flex min-h-8 w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[13px] text-ink"
                  style={{ animation: "fade-in 200ms ease-out both" }}
                >
                  <Monogram color={item.color}>{item.mark}</Monogram>
                  <span className="shrink-0 font-medium">{item.title}</span>
                  <span className="min-w-0 flex-1 truncate text-[12px] text-ink-3">{item.sub}</span>
                </a>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
