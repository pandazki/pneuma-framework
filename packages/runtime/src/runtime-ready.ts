export interface WaitForRuntimeReadyOptions {
  readonly url: string;
  readonly health_path?: string;
  readonly timeout_ms?: number;
  readonly interval_ms?: number;
  readonly fetch_impl?: typeof fetch;
}

export interface RuntimeReadyResult {
  readonly ok: true;
  readonly url: string;
  readonly health_url: string;
  readonly attempts: number;
  readonly elapsed_ms: number;
  readonly body: unknown;
}

export class RuntimeReadyTimeoutError extends Error {
  readonly attempts: number;
  readonly health_url: string;
  readonly last_error?: string;

  constructor(input: {
    readonly attempts: number;
    readonly health_url: string;
    readonly timeout_ms: number;
    readonly last_error?: string;
  }) {
    super(`Runtime did not become ready at ${input.health_url} within ${input.timeout_ms}ms`);
    this.name = "RuntimeReadyTimeoutError";
    this.attempts = input.attempts;
    this.health_url = input.health_url;
    this.last_error = input.last_error;
  }
}

export async function waitForRuntimeReady(
  options: WaitForRuntimeReadyOptions,
): Promise<RuntimeReadyResult> {
  const timeoutMs = options.timeout_ms ?? 5_000;
  const intervalMs = options.interval_ms ?? 100;
  const fetchImpl = options.fetch_impl ?? fetch;
  const started = Date.now();
  const healthUrl = runtimeHealthUrl(options.url, options.health_path ?? "/api/health");
  let attempts = 0;
  let lastError: string | undefined;

  while (Date.now() - started <= timeoutMs) {
    attempts += 1;
    try {
      const response = await fetchImpl(healthUrl);
      if (response.ok) {
        const body = await response.json().catch(() => undefined);
        if (!isExplicitlyNotReady(body)) {
          return {
            ok: true,
            url: normalizeRuntimeBaseUrl(options.url),
            health_url: healthUrl,
            attempts,
            elapsed_ms: Date.now() - started,
            body,
          };
        }
        lastError = "health returned ok:false";
      } else {
        lastError = `HTTP ${response.status}`;
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
    await sleep(Math.min(intervalMs, Math.max(0, timeoutMs - (Date.now() - started))));
  }

  throw new RuntimeReadyTimeoutError({
    attempts,
    health_url: healthUrl,
    timeout_ms: timeoutMs,
    last_error: lastError,
  });
}

function runtimeHealthUrl(baseUrl: string, healthPath: string): string {
  const base = `${normalizeRuntimeBaseUrl(baseUrl)}/`;
  const path = healthPath.startsWith("/") ? healthPath.slice(1) : healthPath;
  return new URL(path, base).toString();
}

function normalizeRuntimeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function isExplicitlyNotReady(body: unknown): boolean {
  return typeof body === "object" &&
    body !== null &&
    "ok" in body &&
    (body as { ok?: unknown }).ok === false;
}

function sleep(ms: number): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}
