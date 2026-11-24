"use client";
// The frame of Beautiful UI's own site (MIT, © 2026 Shane Levine; see ./LICENSE): the page column, the dashed
// section rules with their mono numbers, the demo surface the components sit on, and the light/dark toggle.
// These are not in the registry; they are ported from the markup beautifului.dev renders (class for class), with
// the sidebar left out. Adapted: the toggle stores its choice under "pneuma-theme" and follows the system until
// the reader picks one; the site's default is dark.

import { useEffect, useState, type ReactNode } from "react";

/** `<main>` of the site: a 960px column on the striped page, set off by a hairline. */
export function PageColumn({ children }: { children: ReactNode }) {
  return <main className="relative mx-auto min-h-screen max-w-[960px] bg-page shadow-[0_0_0_1px_var(--line)]">{children}</main>;
}

/** One section of the site: a dashed rule below, a mono number, a title and a quiet line. */
export function Section({
  id,
  number,
  title,
  note,
  aside,
  children,
  index = 0,
}: {
  id?: string;
  number: string;
  title: ReactNode;
  note?: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
  index?: number;
}) {
  return (
    <section
      id={id}
      className="group flex w-full scroll-mt-8 flex-col border-b border-dashed border-line px-5 py-8 sm:px-8 sm:py-10"
      style={{ animation: `fade-up 600ms cubic-bezier(0.23,1,0.32,1) ${index * 60}ms both` }}
    >
      <div className="mb-3 flex items-start gap-2 sm:items-baseline">
        <span className="mt-0.5 font-mono text-[11px] text-ink-3 tabular-nums sm:mt-0">{number}</span>
        <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-2">
          <h2 className="whitespace-nowrap text-[13px] font-semibold text-ink">{title}</h2>
          {note && <p className="mt-0.5 text-[12.5px] text-ink-3 text-pretty sm:mt-0 sm:truncate">{note}</p>}
        </div>
        {aside && <div className="-my-1 shrink-0">{aside}</div>}
      </div>
      {children}
    </section>
  );
}

/** The demo surface: canvas, hairline, the window radius. */
export function Surface({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`relative overflow-hidden rounded-window bg-canvas p-3 shadow-hairline ${className}`}>{children}</div>;
}

type Theme = "light" | "dark";

function currentTheme(): Theme {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark") ? "dark" : "light";
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  // The foundation's .theme-switching freezes transitions so the flip is one repaint.
  root.classList.add("theme-switching");
  root.classList.toggle("dark", theme === "dark");
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove("theme-switching")));
}

export function ThemeToggle({ labels }: { labels: { light: string; dark: string } }) {
  const [theme, setTheme] = useState<Theme>(currentTheme);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(true);
    const media = matchMedia("(prefers-color-scheme: dark)");
    const follow = () => {
      let chosen: string | null = null;
      try {
        chosen = localStorage.getItem("pneuma-theme");
      } catch {}
      if (chosen) return;
      const next = media.matches ? "dark" : "light";
      applyTheme(next);
      setTheme(next);
    };
    media.addEventListener("change", follow);
    return () => media.removeEventListener("change", follow);
  }, []);
  const pick = (next: Theme) => {
    try {
      localStorage.setItem("pneuma-theme", next);
    } catch {}
    applyTheme(next);
    setTheme(next);
  };
  return (
    <div className="relative inline-grid h-9 grid-cols-2 items-center rounded-full bg-field p-0.5">
      <span
        aria-hidden="true"
        className="absolute inset-y-0.5 left-0.5 w-8 rounded-full bg-surface shadow-btn transition-transform duration-200"
        style={{ transform: `translateX(${theme === "dark" ? 32 : 0}px)`, transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)", opacity: shown ? 1 : 0 }}
      />
      <button
        type="button"
        aria-label={labels.light}
        aria-pressed={theme === "light"}
        onClick={() => pick("light")}
        className={`relative z-10 flex size-8 items-center justify-center rounded-full
          transition-colors duration-150 ${theme === "light" ? "text-ink" : "text-ink-3 hover:text-ink-2"}`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      </button>
      <button
        type="button"
        aria-label={labels.dark}
        aria-pressed={theme === "dark"}
        onClick={() => pick("dark")}
        className={`relative z-10 flex size-8 items-center justify-center rounded-full
          transition-colors duration-150 ${theme === "dark" ? "text-ink" : "text-ink-3 hover:text-ink-2"}`}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        </svg>
      </button>
    </div>
  );
}

/**
 * The same control for two links: the page's language. Built from the theme toggle's parts (track, sliding
 * thumb, two 32px stops), so the two sit together as one family.
 */
export function SegmentLinks({ items, active, label }: { items: { key: string; text: string; href: string; onPick?: () => void }[]; active: string; label: string }) {
  const index = Math.max(0, items.findIndex((item) => item.key === active));
  return (
    <nav aria-label={label} className="relative inline-grid h-9 items-center rounded-full bg-field p-0.5" style={{ gridTemplateColumns: `repeat(${items.length}, 2rem)` }}>
      <span
        aria-hidden="true"
        className="absolute inset-y-0.5 left-0.5 w-8 rounded-full bg-surface shadow-btn transition-transform duration-200"
        style={{ transform: `translateX(${index * 32}px)`, transitionTimingFunction: "cubic-bezier(0.23, 1, 0.32, 1)" }}
      />
      {items.map((item) => (
        <a
          key={item.key}
          href={item.href}
          hrefLang={item.key}
          aria-current={item.key === active ? "true" : undefined}
          onClick={item.onPick}
          className={`relative z-10 flex size-8 items-center justify-center rounded-full text-[11.5px] font-medium
            transition-colors duration-150 ${item.key === active ? "text-ink" : "text-ink-3 hover:text-ink-2"}`}
        >
          {item.text}
        </a>
      ))}
    </nav>
  );
}
