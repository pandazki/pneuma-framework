import { createContext, useContext, useEffect, useState } from "react";
import type { Lang, PageModel } from "./model";

export const PageContext = createContext<PageModel>(null as unknown as PageModel);
export const usePage = () => useContext(PageContext);
export const useUi = () => useContext(PageContext).ui;

// --- time -------------------------------------------------------------------

const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 86_400_000],
  ["month", 30 * 86_400_000],
  ["week", 7 * 86_400_000],
  ["day", 86_400_000],
  ["hour", 3_600_000],
  ["minute", 60_000],
];

const locale = (lang: Lang) => (lang === "zh" ? "zh-CN" : "en");

export function relativeTime(lang: Lang, iso: string, now: number): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return "";
  const diff = at - now;
  const format = new Intl.RelativeTimeFormat(locale(lang), { numeric: "auto" });
  for (const [unit, ms] of UNITS) if (Math.abs(diff) >= ms) return format.format(Math.round(diff / ms), unit);
  return format.format(0, "minute");
}

/** In the reader's own time zone. */
export function absoluteTime(lang: Lang, iso: string): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return iso;
  return new Intl.DateTimeFormat(locale(lang), { dateStyle: "medium", timeStyle: "short" }).format(at);
}

/** The current minute: relative times re-render once a minute. */
export function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

// --- owner ------------------------------------------------------------------

const OWNER_KEY = "pneuma-owner";

export const ownerToken = {
  get(): string | null {
    try {
      return sessionStorage.getItem(OWNER_KEY);
    } catch {
      return null;
    }
  },
  drop(): void {
    try {
      sessionStorage.removeItem(OWNER_KEY);
    } catch {}
  },
};

/**
 * "checking": this tab holds a token the Host has not confirmed yet. "yes": it may decide. "no": it holds none.
 * "lost": the Host no longer takes the one it held. "off": the Host has no owner link at all.
 */
export type OwnerState = "checking" | "yes" | "no" | "lost" | "off";

export const OwnerContext = createContext<{ state: OwnerState; lose: () => void }>({ state: "no", lose: () => {} });
export const useOwner = () => useContext(OwnerContext);

export function useOwnerState(off: boolean): { state: OwnerState; lose: () => void } {
  const [state, setState] = useState<OwnerState>(() => (off ? "off" : ownerToken.get() ? "checking" : "no"));
  useEffect(() => {
    if (state !== "checking") return;
    const token = ownerToken.get();
    if (!token) return setState("no");
    let live = true;
    fetch("/owner/session", { method: "POST", headers: { "content-type": "application/json", "x-pneuma-owner": token }, body: "{}" })
      .then((res) => {
        if (!live) return;
        if (res.ok) setState("yes");
        else {
          ownerToken.drop();
          setState("lost");
        }
      })
      .catch(() => live && setState("no"));
    return () => {
      live = false;
    };
  }, [state]);
  useEffect(() => {
    document.documentElement.dataset.owner = state;
  }, [state]);
  return {
    state,
    lose: () => {
      ownerToken.drop();
      setState("lost");
    },
  };
}

export interface ActResult {
  readonly ok: boolean;
  readonly status: number;
  readonly data: Record<string, unknown>;
  /** The owner token was refused, or the Host has no owner link: the tab can no longer decide. */
  readonly lost: boolean;
}

/** One of the page's own writes. It carries the owner token and nothing else that authorises it. */
export async function act(url: string, body: Record<string, unknown>): Promise<ActResult> {
  const token = ownerToken.get();
  if (!token) return { ok: false, status: 0, data: {}, lost: true };
  try {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", "x-pneuma-owner": token }, body: JSON.stringify(body) });
    const data = ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown>;
    const lost = data.reason === "owner_link_required" || data.reason === "owner_page_off";
    return { ok: res.ok, status: res.status, data, lost };
  } catch (err) {
    return { ok: false, status: 0, data: { error: String(err) }, lost: false };
  }
}

// --- words ------------------------------------------------------------------

export function fill(template: string, vars: Readonly<Record<string, string | number>>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole));
}

/** A stable colour per app for its monogram, from the library's own status hues. */
const HUES = ["#e08a3c", "#25a878", "#16a6c7", "#7c6cf0", "#e0598b", "#8a8f98"];
export function hue(name: string): string {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length]!;
}

export const isMac = () => /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
