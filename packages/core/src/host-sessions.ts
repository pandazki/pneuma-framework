import { createHash, randomBytes, randomUUID } from "node:crypto";

export interface HostCookieOptions {
  readonly http_only?: boolean;
  readonly secure?: boolean;
  readonly same_site?: "Strict" | "Lax" | "None";
  readonly path?: string;
  readonly domain?: string;
  readonly max_age_seconds?: number;
  readonly expires?: Date;
}

export interface HostSessionRecord {
  readonly session_id: string;
  readonly cookie_hash: string;
  readonly subject_ref: string;
  readonly created_at_ms: number;
  readonly updated_at_ms: number;
  readonly expires_at_ms: number;
  readonly revoked_at_ms?: number;
  readonly metadata?: Record<string, unknown>;
}

export interface CreateHostSessionInput {
  readonly subject_ref: string;
  readonly ttl_ms: number;
  readonly now_ms?: number;
  readonly cookie?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface HostSessionLookupOptions {
  readonly now_ms?: number;
}

export interface HostSessionRevokeOptions {
  readonly now_ms?: number;
}

export interface HostSessionSweepOptions {
  readonly now_ms?: number;
}

export interface CreatedHostSession {
  readonly cookie: string;
  readonly session: HostSessionRecord;
}

export function serializeHostCookie(
  name: string,
  value: string,
  options: HostCookieOptions = {},
): string {
  assertCookieName(name);
  const attrs = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path ?? "/"}`,
    `SameSite=${options.same_site ?? "Lax"}`,
  ];
  if (options.http_only !== false) attrs.push("HttpOnly");
  if (options.max_age_seconds !== undefined) attrs.push(`Max-Age=${Math.trunc(options.max_age_seconds)}`);
  if (options.expires !== undefined) attrs.push(`Expires=${options.expires.toUTCString()}`);
  if (options.domain !== undefined) attrs.push(`Domain=${options.domain}`);
  if (options.secure) attrs.push("Secure");
  return attrs.join("; ");
}

export function readHostCookie(
  source: string | Headers | Request,
  name: string,
): string | undefined {
  const header = typeof source === "string"
    ? source
    : source instanceof Headers
      ? source.get("cookie") ?? ""
      : source.headers.get("cookie") ?? "";
  for (const part of header.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const eq = trimmed.indexOf("=");
    const key = eq >= 0 ? trimmed.slice(0, eq) : trimmed;
    if (key !== name) continue;
    const rawValue = eq >= 0 ? trimmed.slice(eq + 1) : "";
    return decodeURIComponent(rawValue);
  }
  return undefined;
}

export function appendHostSetCookie(headers: Headers, cookie: string): Headers {
  headers.append("Set-Cookie", cookie);
  return headers;
}

export function hashHostSessionCookie(cookie: string): string {
  return createHash("sha256").update(cookie).digest("hex");
}

export function createHostSessionCookie(byteLength = 32): string {
  return randomBytes(byteLength).toString("base64url");
}

export class InMemoryHostSessionStore {
  private readonly sessionsByHash = new Map<string, HostSessionRecord>();

  async createSession(input: CreateHostSessionInput): Promise<CreatedHostSession> {
    if (!input.subject_ref.trim()) throw new Error("subject_ref is required");
    if (!Number.isFinite(input.ttl_ms) || input.ttl_ms <= 0) {
      throw new Error("ttl_ms must be positive");
    }
    const now = input.now_ms ?? Date.now();
    const cookie = input.cookie ?? createHostSessionCookie();
    const cookieHash = hashHostSessionCookie(cookie);
    const session: HostSessionRecord = {
      session_id: `sess_${randomUUID()}`,
      cookie_hash: cookieHash,
      subject_ref: input.subject_ref,
      created_at_ms: now,
      updated_at_ms: now,
      expires_at_ms: now + input.ttl_ms,
      metadata: input.metadata,
    };
    this.sessionsByHash.set(cookieHash, session);
    return { cookie, session };
  }

  async lookupSession(
    cookie: string,
    options: HostSessionLookupOptions = {},
  ): Promise<HostSessionRecord | undefined> {
    const now = options.now_ms ?? Date.now();
    const session = this.sessionsByHash.get(hashHostSessionCookie(cookie));
    if (session === undefined) return undefined;
    if (session.revoked_at_ms !== undefined || session.expires_at_ms <= now) return undefined;
    return session;
  }

  async revokeSession(
    cookie: string,
    options: HostSessionRevokeOptions = {},
  ): Promise<HostSessionRecord | undefined> {
    const hash = hashHostSessionCookie(cookie);
    const session = this.sessionsByHash.get(hash);
    if (session === undefined) return undefined;
    const now = options.now_ms ?? Date.now();
    const revoked = {
      ...session,
      updated_at_ms: now,
      revoked_at_ms: now,
    };
    this.sessionsByHash.set(hash, revoked);
    return revoked;
  }

  async sweepExpired(options: HostSessionSweepOptions = {}): Promise<number> {
    const now = options.now_ms ?? Date.now();
    let removed = 0;
    for (const [hash, session] of this.sessionsByHash) {
      if (session.expires_at_ms <= now) {
        this.sessionsByHash.delete(hash);
        removed++;
      }
    }
    return removed;
  }

  async listSessions(): Promise<readonly HostSessionRecord[]> {
    return [...this.sessionsByHash.values()];
  }
}

function assertCookieName(name: string): void {
  if (!/^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/.test(name)) {
    throw new Error(`invalid cookie name: ${name}`);
  }
}
