// The owner page's own parts, composed from Beautiful UI's primitives (web/beautifui). Everything that came from
// the record or an app is rendered as text by React; no markup from data is ever inserted.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { buttonVariants } from "../beautifui/atoms/Button";
import { Monogram } from "../beautifui/atoms/EntityChip";
import { Collapsible } from "../beautifui/primitives/ToolChips";
import { TaskPill } from "../beautifui/primitives/TaskRows";
import { SentPill } from "../beautifui/primitives/Recommendation";
import { SegmentLinks, ThemeToggle } from "../beautifui/site";
import { absoluteTime, hue, isMac, relativeTime, useNow, useOwner, usePage, useUi } from "./lib";
import type { Fact, Hint, Rich, Shot, Tone } from "./model";

// --- words and moments ----------------------------------------------------------

export function RichText({ rich }: { rich: Rich }) {
  const { lang } = usePage();
  const now = useNow();
  return (
    <>
      {rich.parts.map((stamp, i) => {
        if (typeof stamp === "string") return <span key={i}>{stamp}</span>;
        return (
          <time key={i} dateTime={stamp.at} title={absoluteTime(lang, stamp.at)}>
            {stamp.mode === "rel" ? relativeTime(lang, stamp.at, now) : absoluteTime(lang, stamp.at)}
          </time>
        );
      })}
    </>
  );
}

// --- icons ------------------------------------------------------------------------

export const ArrowOut = ({ size = 9 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M7 17L17 7M7 7h10v10" />
  </svg>
);

const SearchIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
    <circle cx="11" cy="11" r="7" />
    <path d="M21 21l-4.3-4.3" />
  </svg>
);

// --- links that look like the library's buttons and chips -------------------------

export function ButtonLink({ href, variant, size = "sm", external, children, className = "" }: { href: string; variant: "primary" | "secondary" | "ghost" | "accent" | "quiet"; size?: "xs" | "sm" | "md"; external?: boolean; children: ReactNode; className?: string }) {
  return (
    <a href={href} className={`${buttonVariants({ variant, size })} ${className}`} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
      {children}
    </a>
  );
}

/** ContextCards' source chip, as a link out. */
export function SourceChip({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex h-6 max-w-full shrink-0 items-center gap-1.5 rounded-full bg-inset px-2 text-[12px] font-medium text-ink-2 shadow-btn transition-[background-color,color] duration-150 hover:bg-hover hover:text-ink"
    >
      <span className="truncate">{children}</span>
      <ArrowOut />
    </a>
  );
}

const TONE_PILL: Record<Tone, "green" | "red" | "orange" | "neutral" | "accent"> = { neutral: "neutral", green: "green", orange: "orange", red: "red", accent: "accent" };

export function StatePill({ tone, children }: { tone: Tone; children: ReactNode }) {
  return <TaskPill tone={TONE_PILL[tone]}>{children}</TaskPill>;
}

export function AppMark({ name, mark }: { name: string; mark: string }) {
  return <Monogram color={hue(name)}>{mark}</Monogram>;
}

// --- pictures -----------------------------------------------------------------

/** A stored picture of an app, or its placeholder. A picture that does not load leaves the placeholder. */
export function Picture({ shot, name, className = "" }: { shot: Shot; name: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const show = shot.src && !failed;
  return (
    <div className={`relative aspect-[16/10] w-full overflow-hidden bg-inset ${className}`}>
      {show ? (
        <img src={shot.src!} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover object-top" style={{ animation: "fade-in 300ms ease-out both" }} />
      ) : (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-4 text-center"
          style={{ backgroundImage: "repeating-linear-gradient(-45deg, transparent 0, transparent 7px, var(--stripe) 7px, var(--stripe) 8px)" }}
        >
          <span className="flex size-8 items-center justify-center rounded-control text-[12px] font-semibold text-white shadow-hairline" style={{ background: hue(name) }}>
            {shot.monogram}
          </span>
          {shot.caption && <span className="max-w-64 text-[12px] text-ink-3 text-pretty">{shot.caption}</span>}
        </div>
      )}
    </div>
  );
}

// --- the header -----------------------------------------------------------------

export function Crumbs({ items }: { items: { text: string; href?: string }[] }) {
  // On a phone there is room for one step back, not the whole trail.
  const up = [...items].reverse().find((item) => item.href);
  return (
    <>
    {up && (
      <a href={up.href} className="-ml-1 flex min-w-0 items-center gap-1 rounded-control px-1 py-0.5 text-[12.5px] text-ink-3 transition-colors duration-150 hover:text-ink sm:hidden">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M15 18l-6-6 6-6" /></svg>
        <span className="truncate">{up.text}</span>
      </a>
    )}
    <nav aria-label="Breadcrumb" className={`min-w-0 items-center gap-1.5 text-[12.5px] text-ink-3 ${up ? "hidden sm:flex" : "flex"}`}>
      {items.map((item, i) => (
        <span key={i} className="flex min-w-0 items-center gap-1.5">
          {i > 0 && <span aria-hidden className="text-line-strong">/</span>}
          {item.href ? (
            <a href={item.href} className="truncate transition-colors duration-150 hover:text-ink">
              {item.text}
            </a>
          ) : (
            <span aria-current="page" className="truncate text-ink-2">
              {item.text}
            </span>
          )}
        </span>
      ))}
    </nav>
    </>
  );
}

/** The owner's standing in this tab, as a quiet pill; it opens a small card that says how deciding works. */
export function OwnerPill() {
  const ui = useUi();
  const { state } = useOwner();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent | KeyboardEvent) => {
      if (event instanceof KeyboardEvent ? event.key === "Escape" : !ref.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  const yes = state === "yes";
  const label = state === "checking" ? ui.owner_checking : yes ? ui.owner_yes : ui.owner_no;
  const tone = yes ? "bg-green-tint text-green" : state === "lost" ? "bg-orange-tint text-orange" : "bg-field text-ink-2 shadow-hairline";
  const dot = yes ? "bg-green" : state === "lost" ? "bg-orange" : "bg-ink-3";
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className={`inline-flex h-6 items-center gap-1.5 rounded-full px-2 text-[12px] font-medium transition-[filter] duration-150 hover:brightness-[0.97] dark:hover:brightness-110 ${tone}`}>
        <span className={`size-1.5 rounded-full ${dot}`} style={state === "checking" ? { animation: "fade-in 700ms ease-in-out infinite alternate" } : undefined} />
        {label}
      </button>
      {open && (
        <div role="dialog" aria-label={ui.owner_help_title} className="absolute left-0 top-8 z-40 w-[min(20rem,calc(100vw-2.5rem))] overflow-hidden rounded-card bg-surface shadow-overlay" style={{ animation: "pop-in 160ms cubic-bezier(0.23,1,0.32,1) both", transformOrigin: "top left" }}>
          <div className="primitive-card-pad">
            <p className="text-[13px] font-medium text-ink">{ui.owner_help_title}</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-ink-2">{state === "off" ? ui.owner_off : state === "lost" ? ui.owner_lost : ui.owner_help}</p>
            {!yes && state !== "off" && (
              <>
                <p className="mt-2 text-[12px] text-ink-3">{ui.owner_how}</p>
                <code className="mt-1 block rounded-chip bg-field px-1.5 py-1 font-mono text-[11px] text-ink-2 shadow-hairline">[host] owner link …/#owner=…</code>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function SearchButton({ onOpen }: { onOpen: () => void }) {
  const ui = useUi();
  const [mac, setMac] = useState(true);
  useEffect(() => setMac(isMac()), []);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={ui.search_open}
      className="inline-flex h-9 items-center gap-2 rounded-full bg-field px-3 text-[12px] font-medium text-ink-2 transition-[background-color,color,transform] duration-150 hover:bg-hover hover:text-ink active:scale-[0.96] max-sm:w-9 max-sm:justify-center max-sm:px-0"
    >
      <SearchIcon />
      <span className="max-sm:hidden">{ui.search}</span>
      <kbd className="rounded-[4px] bg-surface px-1 font-mono text-[10.5px] text-ink-3 shadow-hairline max-sm:hidden">{mac ? "⌘K" : "Ctrl K"}</kbd>
    </button>
  );
}

export function Header({
  crumbs,
  title,
  meta,
  pills,
  action,
  onSearch,
}: {
  crumbs: { text: string; href?: string }[];
  title: ReactNode;
  meta?: ReactNode;
  pills?: ReactNode;
  action?: ReactNode;
  onSearch: () => void;
}) {
  const page = usePage();
  const ui = page.ui;
  const remember = (lang: string) => () => {
    try {
      localStorage.setItem("pneuma-lang", lang);
    } catch {}
  };
  return (
    // Above the sections, whose entry animation makes each its own layer: the owner card opens over them.
    <header className="relative z-20 border-b border-dashed border-line px-5 pt-8 pb-7 sm:px-8 sm:pt-12 sm:pb-8" style={{ animation: "fade-in 400ms ease-out both" }}>
      <div className="flex items-center justify-between gap-3">
        <Crumbs items={crumbs} />
        <div className="flex shrink-0 items-center gap-2">
          <SearchButton onOpen={onSearch} />
          <SegmentLinks
            label={ui.language}
            active={page.lang}
            items={[
              { key: "en", text: "EN", href: page.links.en, onPick: remember("en") },
              { key: "zh", text: "中", href: page.links.zh, onPick: remember("zh") },
            ]}
          />
          <ThemeToggle labels={{ light: ui.theme_light, dark: ui.theme_dark }} />
        </div>
      </div>
      <div className="mt-8 flex flex-col gap-4 sm:mt-10 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-[21px] leading-snug font-semibold tracking-[-0.02em] text-ink text-balance [overflow-wrap:anywhere]">{title}</h1>
          {meta && <p className="mt-1 text-[12.5px] text-ink-3">{meta}</p>}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {pills}
            <OwnerPill />
          </div>
        </div>
        {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
      </div>
      {page.done && (
        <div className="mt-4">
          <SentPill>{page.done}</SentPill>
        </div>
      )}
    </header>
  );
}

// --- "Details" ------------------------------------------------------------------

export function Details({ facts, label }: { facts: readonly Fact[]; label?: string }) {
  const ui = useUi();
  if (!facts.length) return null;
  return (
    <Collapsible label={label ?? ui.details}>
      <dl className="flex flex-col gap-1.5 py-0.5">
        {facts.map((fact, i) => (
          <div key={i} className="grid gap-x-3 gap-y-0.5 sm:grid-cols-[9.5rem_minmax(0,1fr)]">
            <dt className="text-[11.5px] text-ink-3">{fact.label}</dt>
            <dd className={`min-w-0 text-ink-2 [overflow-wrap:anywhere] ${fact.mono ? "font-mono text-[11.5px] leading-[1.6]" : "text-[12px] leading-relaxed"}`}>
              {fact.href ? (
                <a href={fact.href} target="_blank" rel="noopener noreferrer" className="underline decoration-line-strong underline-offset-2 transition-colors hover:text-ink hover:decoration-current">
                  {fact.value}
                </a>
              ) : (
                fact.value
              )}
            </dd>
          </div>
        ))}
      </dl>
    </Collapsible>
  );
}

/** The last block of a view: no number, no title, the Details disclosure alone. */
export function DetailsBlock({ facts }: { facts: readonly Fact[] }) {
  if (!facts.length) return null;
  return (
    <div className="px-5 py-6 sm:px-8 sm:py-8">
      <Details facts={facts} />
    </div>
  );
}

// --- the hint: what to tell the agent ---------------------------------------------

export function Copy({ text }: { text: string }) {
  const ui = useUi();
  const [done, setDone] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      document.body.append(area);
      area.select();
      try {
        document.execCommand("copy");
      } catch {}
      area.remove();
    }
    setDone(true);
    setTimeout(() => setDone(false), 1600);
  };
  return (
    <button type="button" onClick={copy} className={`${buttonVariants({ variant: "secondary", size: "xs" })} min-w-16`} aria-live="polite">
      {done ? (
        <span className="inline-flex items-center gap-1 text-green" style={{ animation: "fade-in 150ms ease-out both" }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 6L9 17l-5-5" /></svg>
          {ui.copied}
        </span>
      ) : (
        ui.copy
      )}
    </button>
  );
}

export function HintCard({ hint, title }: { hint: Hint; title?: string }) {
  return (
    <div className="w-full overflow-hidden rounded-card bg-surface shadow-card">
      <div className="primitive-card-pad">
        {title && <p className="text-[14px] font-medium text-ink">{title}</p>}
        <p className={`${title ? "mt-1.5" : ""} text-[13px] leading-relaxed text-ink-2`}>{hint.body}</p>
      </div>
      <div className="primitive-card-footer flex items-start gap-3 border-t border-line bg-inset">
        <p className="min-w-0 flex-1 px-1 py-1 text-[12.5px] leading-relaxed text-ink [overflow-wrap:anywhere]">{hint.example}</p>
        <Copy text={hint.example} />
      </div>
    </div>
  );
}

/** SearchList's empty state, for a view with nothing in it. */
export function EmptyState({ title, body, icon }: { title: string; body?: string; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 px-4 py-10 text-center" style={{ animation: "fade-in 250ms ease-out both" }}>
      <span className="mb-1.5 flex size-8 items-center justify-center rounded-control bg-inset text-ink-3 shadow-hairline">
        {icon ?? (
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M3 9h18" />
          </svg>
        )}
      </span>
      <span className="text-[13px] font-medium text-ink">{title}</span>
      {body && <span className="max-w-80 text-[12px] text-ink-3 text-pretty">{body}</span>}
    </div>
  );
}
