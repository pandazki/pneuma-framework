import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { join } from "node:path";
import { APP_NAME, type HistoryEntry } from "./artifact";
import type { AppStatus, AppSummary } from "./host";

// ---------------------------------------------------------------------------
// Pictures of apps, for the owner page.
//
// A person cannot tell their apps apart by name alone, so the page shows a
// picture of each. The Host takes it when a version is live (the address serves
// it, so its probe answered) and when a waiting change carries a preview, and
// otherwise leaves the app alone: a picture wakes a sleeping app, so it is
// taken again only after `refreshAfterMs`, never because someone opened the page.
//
// The picture is taken by a headless browser the Host talks to over the Chrome
// DevTools Protocol: in compose a small service beside the Host, on a developer's
// machine a local Chrome started with --remote-debugging-port. Every picture is
// taken in a fresh browser context, so no cookie reaches it: an app that asks
// visitors to sign in shows the runtime's sign-in page, and that is recorded as a
// miss, not stored. Pictures live in the Host's own state directory, never in an
// app directory, which the agent can write.
//
// The page being pictured runs its own scripts, and a preview's are not yet
// approved by anyone. So every request the page makes in its own process (the
// page, its subresources, fetch and XHR, its workers) is held at the DevTools
// Fetch domain, and only its own origin and https go on: nothing over plain
// http elsewhere, which is how every service beside it on the compose network
// (the runtime's admin API, which takes writes without a login, among them) is
// reached. Two kinds of request are not held: a WebSocket handshake, which the
// Fetch domain does not pause, and whatever a frame from another site asks
// for, since Chrome runs such a frame in a process of its own. Through them a
// pictured page can still send requests to those services: a handshake is a
// GET whose answer the page cannot read, and an https frame from another site
// sent plain-http GETs and POSTs in a trial with headless Chrome 158. The
// README ("Pictures") says what that leaves on the compose stack.
//
// Nothing about releasing, approving or undoing waits for or depends on this.
// Without a browser, or when it does not answer, the page shows a placeholder.
// ---------------------------------------------------------------------------

export type CaptureResult =
  | { readonly ok: true; readonly image: Uint8Array; readonly url: string }
  | {
      readonly ok: false;
      /** `needs_sign_in`: the runtime sent the browser to its sign-in page. `elsewhere`: it ended up at another address. */
      readonly reason: "unreachable" | "needs_sign_in" | "elsewhere" | "error";
      readonly detail: string;
    };

/** Takes a picture of one address. Never throws: a failure is a result. */
export interface Screenshotter {
  capture(url: string): Promise<CaptureResult>;
}

export interface CdpOptions {
  /** The browser's DevTools HTTP endpoint, e.g. http://screenshot:9222 or http://127.0.0.1:9222. */
  readonly endpoint: string;
  readonly width?: number;
  readonly height?: number;
  /** How long to wait for the page's load event. A page that never finishes loading is still pictured after this. */
  readonly loadTimeoutMs?: number;
  /** A pause after load, for pages that draw themselves with script. */
  readonly settleMs?: number;
}

/** The runtime's sign-in page (PneumaSpace's `local` identity: gateway/src/identity.ts). */
const SIGN_IN_PATH = "/_pneuma-space/login";

type CdpMessage = { id?: number; method?: string; params?: any; result?: any; error?: { message: string }; sessionId?: string };

/** One DevTools WebSocket connection: commands by id, events to listeners. */
class Cdp {
  private next = 0;
  private readonly waiting = new Map<number, { resolve: (value: any) => void; reject: (err: Error) => void }>();
  private readonly listeners = new Set<(message: CdpMessage) => void>();

  private constructor(private readonly ws: WebSocket) {
    ws.onmessage = (event) => {
      let message: CdpMessage;
      try {
        message = JSON.parse(String(event.data)) as CdpMessage;
      } catch {
        return;
      }
      if (message.id !== undefined) {
        const waiter = this.waiting.get(message.id);
        this.waiting.delete(message.id);
        if (message.error) waiter?.reject(new Error(message.error.message));
        else waiter?.resolve(message.result ?? {});
        return;
      }
      for (const listener of this.listeners) listener(message);
    };
    ws.onclose = () => {
      for (const waiter of this.waiting.values()) waiter.reject(new Error("the browser closed the connection"));
      this.waiting.clear();
    };
  }

  static open(url: string, timeoutMs: number): Promise<Cdp> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url);
      const timer = setTimeout(() => {
        ws.close();
        reject(new Error(`no answer from ${url} within ${timeoutMs} ms`));
      }, timeoutMs);
      ws.onopen = () => {
        clearTimeout(timer);
        resolve(new Cdp(ws));
      };
      ws.onerror = () => {
        clearTimeout(timer);
        reject(new Error(`could not connect to ${url}`));
      };
    });
  }

  send(method: string, params: Record<string, unknown> = {}, sessionId?: string, timeoutMs = 15_000): Promise<any> {
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiting.delete(id);
        reject(new Error(`${method} did not answer within ${timeoutMs} ms`));
      }, timeoutMs);
      this.waiting.set(id, {
        resolve: (value) => (clearTimeout(timer), resolve(value)),
        reject: (err) => (clearTimeout(timer), reject(err)),
      });
      this.ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  on(listener: (message: CdpMessage) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  close(): void {
    try {
      this.ws.close();
    } catch {
      // Already closed.
    }
  }
}

/**
 * Chrome answers its DevTools HTTP endpoint only to a Host header that is an IP address or `localhost`. A
 * compose service name is neither, so the name is looked up first and the endpoint is called by address.
 */
async function devtoolsOrigin(endpoint: string): Promise<string> {
  const url = new URL(endpoint);
  const bare = url.hostname.replace(/^\[|\]$/g, "");
  if (!isIP(bare) && bare !== "localhost") {
    const { address, family } = await lookup(bare);
    url.hostname = family === 6 ? `[${address}]` : address;
  }
  return url.origin;
}

/** A Screenshotter over the Chrome DevTools Protocol: the compose service and a local Chrome speak the same. */
export function cdpScreenshotter(options: CdpOptions): Screenshotter {
  const width = options.width ?? 1024;
  const height = options.height ?? 640;
  const loadTimeoutMs = options.loadTimeoutMs ?? 20_000;
  const settleMs = options.settleMs ?? 800;
  return {
    async capture(url: string): Promise<CaptureResult> {
      let socketUrl: string;
      try {
        const origin = await devtoolsOrigin(options.endpoint);
        const res = await fetch(`${origin}/json/version`, { signal: AbortSignal.timeout(5_000) });
        if (!res.ok) throw new Error(`${origin}/json/version answered ${res.status}`);
        socketUrl = String(((await res.json()) as { webSocketDebuggerUrl?: unknown }).webSocketDebuggerUrl ?? "");
        if (!socketUrl.startsWith("ws")) throw new Error("the browser did not name its DevTools WebSocket");
      } catch (err) {
        return { ok: false, reason: "unreachable", detail: `no browser at ${options.endpoint}: ${err instanceof Error ? err.message : String(err)}` };
      }
      let cdp: Cdp;
      try {
        cdp = await Cdp.open(socketUrl, 5_000);
      } catch (err) {
        return { ok: false, reason: "unreachable", detail: err instanceof Error ? err.message : String(err) };
      }
      let context: string | undefined;
      let target: string | undefined;
      let stopFiltering: (() => void) | undefined;
      let signIn = false;
      try {
        // A fresh context: no cookie, no storage, nothing from the picture before.
        context = (await cdp.send("Target.createBrowserContext", { disposeOnDetach: true })).browserContextId as string;
        target = (await cdp.send("Target.createTarget", { url: "about:blank", browserContextId: context, width, height })).targetId as string;
        const session = (await cdp.send("Target.attachToTarget", { targetId: target, flatten: true })).sessionId as string;
        const page = (method: string, params: Record<string, unknown> = {}, timeoutMs?: number) => cdp.send(method, params, session, timeoutMs);
        await page("Page.enable");
        await page("Network.enable");
        // Every request the page makes in its own process waits here: its own origin and https go on, anything else is
        // refused. WebSocket handshakes and frames from other sites do not come here (see the top of this file).
        const asked = new URL(url);
        const offRequests = cdp.on((message) => {
          if (message.sessionId !== session || message.method !== "Fetch.requestPaused") return;
          const requestId = message.params?.requestId;
          let allowed = false;
          try {
            const target = new URL(String(message.params?.request?.url ?? ""));
            allowed = target.origin === asked.origin || target.protocol === "https:";
            // The runtime's sign-in page, under whatever name it gives itself: a miss, whether or not it may load.
            if (target.pathname.startsWith(SIGN_IN_PATH) && message.params?.resourceType === "Document") signIn = true;
          } catch {
            allowed = false;
          }
          void page(allowed ? "Fetch.continueRequest" : "Fetch.failRequest", allowed ? { requestId } : { requestId, errorReason: "BlockedByClient" }).catch(() => {});
        });
        stopFiltering = offRequests;
        await page("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
        await page("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false });
        await page("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: "light" }] }).catch(() => {});
        // headless-shell draws scrollbars; a picture of the app should not show the browser's.
        await page("Emulation.setScrollbarsHidden", { hidden: true }).catch(() => {});
        let status: number | undefined;
        let frame: string | undefined;
        let loaded!: () => void;
        const load = new Promise<void>((resolve) => (loaded = resolve));
        const off = cdp.on((message) => {
          if (message.sessionId !== session) return;
          if (message.method === "Page.loadEventFired") loaded();
          if (message.method === "Network.responseReceived" && message.params?.type === "Document" && (!frame || message.params.frameId === frame)) {
            status = Number(message.params.response?.status);
          }
        });
        try {
          const navigation = await page("Page.navigate", { url }, loadTimeoutMs);
          frame = navigation.frameId as string;
          if (navigation.errorText && signIn) return { ok: false, reason: "needs_sign_in", detail: `${url} sends visitors who are not signed in to the sign-in page` };
          if (navigation.errorText) {
            const blocked = String(navigation.errorText).includes("BLOCKED_BY_CLIENT");
            return { ok: false, reason: blocked ? "elsewhere" : "unreachable", detail: `${url}: ${blocked ? "it sends the browser to an address the picture may not load" : navigation.errorText}` };
          }
          await Promise.race([load, Bun.sleep(loadTimeoutMs)]);
          await Bun.sleep(settleMs);
        } finally {
          off();
        }
        const where = String((await page("Runtime.evaluate", { expression: "location.href", returnByValue: true })).result?.value ?? "");
        let landed: URL;
        try {
          landed = new URL(where);
        } catch {
          return { ok: false, reason: "error", detail: `${url} ended at "${where}"` };
        }
        if (landed.origin === asked.origin && landed.pathname.startsWith(SIGN_IN_PATH)) {
          return { ok: false, reason: "needs_sign_in", detail: `${url} sends visitors who are not signed in to ${landed.pathname}` };
        }
        if (landed.origin !== asked.origin || !landed.pathname.startsWith(asked.pathname)) {
          return { ok: false, reason: "elsewhere", detail: `${url} ended at ${landed.origin}${landed.pathname}` };
        }
        if (status === undefined || status >= 400) {
          return { ok: false, reason: "error", detail: `${url} answered ${status ?? "nothing"}` };
        }
        const shot = await page("Page.captureScreenshot", { format: "jpeg", quality: 80 }, 20_000);
        return { ok: true, image: Buffer.from(String(shot.data ?? ""), "base64"), url: where };
      } catch (err) {
        return { ok: false, reason: "error", detail: err instanceof Error ? err.message : String(err) };
      } finally {
        stopFiltering?.();
        if (target) await cdp.send("Target.closeTarget", { targetId: target }).catch(() => {});
        if (context) await cdp.send("Target.disposeBrowserContext", { browserContextId: context }).catch(() => {});
        cdp.close();
      }
    },
  };
}

/**
 * Maps an app's address as a person's browser opens it to the address the screenshot browser reaches it at,
 * or null for any address that is not an app on the runtime. Only such addresses are ever pictured: a preview
 * address comes from a file the agent can write, and must not point the browser anywhere else.
 */
export function runtimeAddressMapper(publicBase: string, insideBase: string): (address: string) => string | null {
  const pub = new URL(publicBase);
  const inside = new URL(insideBase);
  const prefix = `${pub.pathname.replace(/\/+$/, "")}/apps/`;
  const insidePrefix = `${inside.pathname.replace(/\/+$/, "")}/apps/`;
  return (address) => {
    let url: URL;
    try {
      url = new URL(address);
    } catch {
      return null;
    }
    if (url.origin !== pub.origin || url.username || url.password || !url.pathname.startsWith(prefix)) return null;
    if (!/^[a-z0-9-]+\/$/.test(url.pathname.slice(prefix.length))) return null;
    return `${inside.origin}${insidePrefix}${url.pathname.slice(prefix.length)}`;
  };
}

/** A waiting change's preview as the Host reports it in `status`. */
export interface PreviewView {
  /** Where it is, while it stands. */
  readonly address: string | null;
  /** true: it stands. false: it ended itself or was discarded. null: the Host has no preview to report, or could not tell. */
  readonly standing: boolean | null;
  /** The Host asked the runtime and got no answer. */
  readonly unknown: boolean;
}

/**
 * A waiting change's preview, from the `preview` field `status` gives each waiting change: `{ state: "standing",
 * address }`, `{ state: "gone" }` or `{ state: "unknown" }`. A Host that publishes previews as ephemeral apps
 * derives the preview from the change id and asks the runtime whether it still stands; one that removes the
 * preview when the submit ends reports none. `status` passes on what the pending file holds, which the agent can
 * write, so callers check the address is an app on the runtime before using it.
 */
export function previewOf(pending: unknown): PreviewView {
  const none = { address: null, standing: null, unknown: false };
  if (typeof pending !== "object" || pending === null) return none;
  const preview = (pending as { preview?: unknown }).preview;
  if (typeof preview !== "object" || preview === null) return none;
  const { state, address } = preview as { state?: unknown; address?: unknown };
  if (state === "standing") return typeof address === "string" ? { address, standing: true, unknown: false } : none;
  if (state === "gone") return { address: null, standing: false, unknown: false };
  if (state === "unknown") return { address: null, standing: null, unknown: true };
  return none;
}

export interface Picture {
  /** The file name under the pictures directory; also its URL path segment. */
  readonly file: string;
  readonly at: string;
  /** The version pictured, or `pv-<change id>` for a preview. */
  readonly key: string;
  readonly kind: "version" | "preview";
  /**
   * The change that recorded the pictured version (or the waiting change, for a preview). A version name alone is
   * not enough: an app removed and created again under the same name starts at v1 again.
   */
  readonly change?: string;
}

export interface PictureMiss {
  readonly at: string;
  readonly reason: string;
  readonly detail?: string;
}

interface AppPictures {
  shots: Picture[];
  misses: Record<string, PictureMiss>;
}

interface PictureIndex {
  schema: 1;
  apps: Record<string, AppPictures>;
}

/** What the keeper reads from the Host. `AppHost` has both. */
export interface PictureSource {
  summaries(): AppSummary[];
  status(name: string): Promise<AppStatus>;
  history(name: string): HistoryEntry[];
}

export interface KeeperOptions {
  readonly source: PictureSource;
  /** Absent: the Host has no screenshot browser, and the page shows placeholders. */
  readonly shooter?: Screenshotter;
  /** The Host's own state directory for pictures. Never inside an app directory. */
  readonly dir: string;
  readonly insideUrl: (address: string) => string | null;
  readonly log?: (line: string) => void;
  /** How often the keeper looks for a version or preview without a picture. Default one minute. */
  readonly scanEveryMs?: number;
  /** A live version's picture is taken again after this long. Default one day. 0: never. */
  readonly refreshAfterMs?: number;
  /** After a miss, the same picture is not tried again for this long. Default ten minutes. */
  readonly retryAfterMs?: number;
  /** Pictures of earlier versions kept per app. Default 3. */
  readonly keepPerApp?: number;
}

type Want = { readonly key: string; readonly kind: Picture["kind"]; readonly address: string; readonly change: string };

const FILE = /^[a-z0-9-]+--[a-z0-9-]+--\d+\.jpg$/;
const KEY = /^(v\d+|pv-[a-z0-9-]{1,40})$/;
const JPEG = [0xff, 0xd8, 0xff];

export class ScreenshotKeeper {
  private index: PictureIndex;
  private timer: ReturnType<typeof setInterval> | undefined;
  private nudgeTimer: ReturnType<typeof setTimeout> | undefined;
  private running: Promise<void> | undefined;
  private again = false;
  private readonly said = new Set<string>();

  constructor(private readonly opts: KeeperOptions) {
    mkdirSync(opts.dir, { recursive: true });
    this.index = this.load();
  }

  /** Whether a screenshot browser is configured at all. */
  get enabled(): boolean {
    return this.opts.shooter !== undefined;
  }

  start(): void {
    if (!this.enabled || this.timer) return;
    this.timer = setInterval(() => void this.scan(), this.opts.scanEveryMs ?? 60_000);
    this.timer.unref?.();
    void this.scan();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    if (this.nudgeTimer) clearTimeout(this.nudgeTimer);
    this.timer = undefined;
    this.nudgeTimer = undefined;
  }

  /** Something may have gone live or started waiting: look soon, instead of at the next scan. */
  nudge(): void {
    if (!this.enabled) return;
    if (this.nudgeTimer) clearTimeout(this.nudgeTimer);
    this.nudgeTimer = setTimeout(() => void this.scan(), 1_500);
    this.nudgeTimer.unref?.();
  }

  /** One pass over every app. Passes never overlap; a pass asked for while one runs runs once after it. */
  scan(): Promise<void> {
    if (!this.enabled) return Promise.resolve();
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = this.pass()
      .catch((err) => this.say("scan", `pictures: a pass failed (${err instanceof Error ? err.message : String(err)})`))
      .finally(() => {
        this.running = undefined;
        if (this.again) {
          this.again = false;
          void this.scan();
        }
      });
    return this.running;
  }

  /** The newest picture of a live version of the app, or null. */
  latest(name: string): Picture | null {
    const shots = this.index.apps[name]?.shots.filter((shot) => shot.kind === "version") ?? [];
    return shots.reduce<Picture | null>((best, shot) => (!best || shot.at > best.at ? shot : best), null);
  }

  /** The picture of a waiting change's preview, or null. */
  preview(name: string, changeId: string): Picture | null {
    return this.index.apps[name]?.shots.find((shot) => shot.key === `pv-${changeId}`) ?? null;
  }

  /** Why the app's live version or a preview has no picture, when the keeper tried. */
  miss(name: string, key: string): PictureMiss | null {
    return this.index.apps[name]?.misses[key] ?? null;
  }

  /** The stored file for a picture's name, or null. The name is checked; nothing outside the directory is reachable. */
  file(name: string): string | null {
    if (!FILE.test(name)) return null;
    const path = join(this.opts.dir, name);
    return existsSync(path) ? path : null;
  }

  private async pass(): Promise<void> {
    const shooter = this.opts.shooter!;
    const summaries = this.opts.source.summaries();
    const listed = new Set<string>();
    for (const summary of summaries) {
      const name = summary.app_id;
      if (!APP_NAME.test(name)) continue;
      listed.add(name);
      if ("error" in summary) continue;
      const wanted: Want[] = [];
      // What the address serves, when the Host saw it answer: a version that went live, or that undo landed on.
      if (summary.serving_version && !summary.serving_uncertain && KEY.test(summary.serving_version)) {
        const version = summary.serving_version;
        let change = "";
        try {
          change = String(this.opts.source.history(name).find((entry) => entry?.version === version && entry.kind !== "restore")?.change_id ?? "");
        } catch {
          change = "";
        }
        wanted.push({ key: version, kind: "version", address: summary.address, change });
      }
      const pendingIds = new Set<string>();
      if (Array.isArray(summary.pending) && summary.pending.length) {
        // Only status carries the whole waiting change, and whether its preview stands.
        let status: AppStatus | undefined;
        try {
          status = await this.opts.source.status(name);
        } catch {
          status = undefined;
        }
        for (const pending of status?.pending ?? []) {
          const key = `pv-${String(pending.change_id)}`;
          if (!KEY.test(key)) continue;
          pendingIds.add(key);
          const { address } = previewOf(pending);
          if (address) wanted.push({ key, kind: "preview", address, change: String(pending.change_id) });
        }
      }
      for (const want of wanted) await this.take(shooter, name, want);
      this.tidy(name, pendingIds);
    }
    for (const name of Object.keys(this.index.apps)) {
      if (!listed.has(name)) {
        for (const shot of this.index.apps[name]!.shots) this.remove(shot.file);
        delete this.index.apps[name];
      }
    }
    this.save();
  }

  private async take(shooter: Screenshotter, name: string, want: Want): Promise<void> {
    const app = (this.index.apps[name] ??= { shots: [], misses: {} });
    const now = Date.now();
    // A picture of an earlier app under the same name, or of a version recorded by another change, is not this one.
    for (const old of app.shots.filter((shot) => shot.key === want.key && (shot.change ?? "") !== want.change)) this.remove(old.file);
    app.shots = app.shots.filter((shot) => shot.key !== want.key || (shot.change ?? "") === want.change);
    const have = app.shots.find((shot) => shot.key === want.key);
    const refresh = this.opts.refreshAfterMs ?? 86_400_000;
    if (have && (want.kind === "preview" || refresh === 0 || now - Date.parse(have.at) < refresh)) return;
    const missed = app.misses[want.key];
    if (missed && now - Date.parse(missed.at) < (this.opts.retryAfterMs ?? 600_000)) return;
    const inside = this.opts.insideUrl(want.address);
    if (!inside) {
      app.misses[want.key] = { at: new Date(now).toISOString(), reason: "not_an_app_address", detail: want.address.slice(0, 200) };
      return;
    }
    const result = await shooter.capture(inside);
    if (!result.ok) {
      app.misses[want.key] = { at: new Date().toISOString(), reason: result.reason, detail: result.detail.slice(0, 300) };
      this.say(`${name}:${want.key}:${result.reason}`, `pictures: no picture of ${name} ${want.key} (${result.reason}: ${result.detail})`);
      return;
    }
    if (result.image.length < 3 || JPEG.some((byte, i) => result.image[i] !== byte)) {
      app.misses[want.key] = { at: new Date().toISOString(), reason: "error", detail: "the browser did not return a JPEG image" };
      return;
    }
    const at = new Date();
    const file = `${name}--${want.key}--${at.getTime()}.jpg`;
    const tmp = join(this.opts.dir, `.${file}.tmp`);
    writeFileSync(tmp, result.image);
    renameSync(tmp, join(this.opts.dir, file));
    if (have) this.remove(have.file);
    app.shots = [...app.shots.filter((shot) => shot.key !== want.key), { file, at: at.toISOString(), key: want.key, kind: want.kind, change: want.change }];
    delete app.misses[want.key];
    this.save();
  }

  /** Drop pictures of previews whose change no longer waits, and all but the newest few version pictures. */
  private tidy(name: string, pendingKeys: ReadonlySet<string>): void {
    const app = this.index.apps[name];
    if (!app) return;
    const keep = this.opts.keepPerApp ?? 3;
    const versions = app.shots.filter((shot) => shot.kind === "version").sort((a, b) => b.at.localeCompare(a.at));
    const drop = new Set([...versions.slice(keep), ...app.shots.filter((shot) => shot.kind === "preview" && !pendingKeys.has(shot.key))].map((shot) => shot.file));
    for (const file of drop) this.remove(file);
    app.shots = app.shots.filter((shot) => !drop.has(shot.file));
    for (const key of Object.keys(app.misses)) if (key.startsWith("pv-") && !pendingKeys.has(key)) delete app.misses[key];
  }

  private remove(file: string): void {
    if (FILE.test(file)) rmSync(join(this.opts.dir, file), { force: true });
  }

  private load(): PictureIndex {
    try {
      const raw = JSON.parse(readFileSync(join(this.opts.dir, "index.json"), "utf8")) as PictureIndex;
      if (raw?.schema !== 1 || typeof raw.apps !== "object" || raw.apps === null) throw new Error("not an index");
      for (const [name, app] of Object.entries(raw.apps)) {
        const shots = Array.isArray(app?.shots) ? app.shots.filter((shot) => FILE.test(String(shot?.file)) && KEY.test(String(shot?.key)) && existsSync(join(this.opts.dir, shot.file))) : [];
        raw.apps[name] = { shots, misses: typeof app?.misses === "object" && app.misses !== null ? app.misses : {} };
      }
      return raw;
    } catch {
      return { schema: 1, apps: {} };
    }
  }

  private save(): void {
    const file = join(this.opts.dir, "index.json");
    writeFileSync(`${file}.tmp`, `${JSON.stringify(this.index, null, 2)}\n`);
    renameSync(`${file}.tmp`, file);
  }

  /** Log a line once per distinct cause, so a browser that is down does not fill the log every minute. */
  private say(cause: string, line: string): void {
    if (this.said.has(cause)) return;
    this.said.add(cause);
    this.opts.log?.(line);
  }
}
