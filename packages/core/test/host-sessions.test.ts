import { describe, expect, test } from "bun:test";
import {
  InMemoryHostSessionStore,
  appendHostSetCookie,
  hashHostSessionCookie,
  readHostCookie,
  serializeHostCookie,
} from "../src/index.js";

describe("Host session and cookie utilities", () => {
  test("serializes and reads secure Host cookies without losing equals signs", () => {
    const cookie = serializeHostCookie("pneuma_session", "abc=123", {
      max_age_seconds: 3600,
      secure: true,
    });

    expect(cookie).toContain("pneuma_session=abc%3D123");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("Max-Age=3600");
    expect(cookie).toContain("Secure");

    expect(readHostCookie("other=1; pneuma_session=abc%3D123; theme=light", "pneuma_session"))
      .toBe("abc=123");
  });

  test("appends multiple Set-Cookie headers instead of comma-joining them", () => {
    const headers = new Headers();

    appendHostSetCookie(headers, serializeHostCookie("oauth_state", "", {
      max_age_seconds: 0,
    }));
    appendHostSetCookie(headers, serializeHostCookie("pneuma_session", "session-value", {
      max_age_seconds: 604800,
      secure: true,
    }));

    const getSetCookie = (headers as Headers & { getSetCookie(): string[] }).getSetCookie;
    expect(getSetCookie.call(headers)).toHaveLength(2);
    expect(getSetCookie.call(headers)[0]).toContain("oauth_state=");
    expect(getSetCookie.call(headers)[1]).toContain("pneuma_session=session-value");
  });

  test("stores only session cookie hashes and revokes server-side sessions", async () => {
    const store = new InMemoryHostSessionStore();
    const created = await store.createSession({
      subject_ref: "user:alice",
      ttl_ms: 60_000,
      now_ms: 1000,
      metadata: { provider: "github" },
    });

    expect(created.cookie).toBeString();
    expect(created.session.cookie_hash).toBe(hashHostSessionCookie(created.cookie));
    expect(JSON.stringify(created.session)).not.toContain(created.cookie);

    const active = await store.lookupSession(created.cookie, { now_ms: 2000 });
    expect(active).toMatchObject({
      session_id: created.session.session_id,
      subject_ref: "user:alice",
      expires_at_ms: 61_000,
    });
    expect(active?.revoked_at_ms).toBeUndefined();

    await store.revokeSession(created.cookie, { now_ms: 3000 });
    expect(await store.lookupSession(created.cookie, { now_ms: 4000 })).toBeUndefined();
  });

  test("expired sessions fail closed and can be swept", async () => {
    const store = new InMemoryHostSessionStore();
    const created = await store.createSession({
      subject_ref: "user:alice",
      ttl_ms: 10,
      now_ms: 1000,
    });

    expect(await store.lookupSession(created.cookie, { now_ms: 1005 })).toBeDefined();
    expect(await store.lookupSession(created.cookie, { now_ms: 1011 })).toBeUndefined();
    expect(await store.sweepExpired({ now_ms: 1011 })).toBe(1);
    expect(await store.listSessions()).toEqual([]);
  });
});
