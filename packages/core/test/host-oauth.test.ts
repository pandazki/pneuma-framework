import { describe, expect, test } from "bun:test";
import {
  InMemoryHostCredentialBroker,
  InMemoryOAuthStateStore,
  bindOAuthCallbackCredential,
  createOAuthAuthorizeUrl,
  startMockOAuthServer,
  type CredentialRequirement,
} from "../src/index.js";

describe("Host OAuth helpers", () => {
  const requirement: CredentialRequirement = {
    id: "github-user-token",
    provider_id: "github",
    scopes: ["repo", "read:user"],
    binding_mode: "per-user",
    placement: "host-broker",
    required: true,
  };

  test("creates authorization URLs with state and scopes", () => {
    const url = createOAuthAuthorizeUrl({
      authorization_url: "https://github.example/authorize",
      client_id: "client-123",
      redirect_uri: "http://127.0.0.1:3000/oauth/callback",
      scopes: ["repo", "read:user"],
      state: "state-123",
      extra_params: { prompt: "consent" },
    });

    expect(url.toString()).toBe(
      "https://github.example/authorize?client_id=client-123&redirect_uri=http%3A%2F%2F127.0.0.1%3A3000%2Foauth%2Fcallback&scope=repo+read%3Auser&state=state-123&response_type=code&prompt=consent",
    );
  });

  test("OAuth state is provider and subject scoped, single-use, and expiring", async () => {
    const states = new InMemoryOAuthStateStore();
    const issued = await states.issueState({
      provider_id: "github",
      subject_ref: "user:charlie",
      requirement_id: "github-user-token",
      redirect_uri: "http://127.0.0.1:3000/oauth/callback",
      ttl_ms: 60_000,
      now_ms: 1000,
    });

    expect(issued.state).toHaveLength(43);
    await expect(states.consumeState(issued.state, {
      provider_id: "linear",
      subject_ref: "user:charlie",
      now_ms: 2000,
    })).rejects.toThrow("OAuth state does not match provider or subject");

    const consumed = await states.consumeState(issued.state, {
      provider_id: "github",
      subject_ref: "user:charlie",
      now_ms: 2000,
    });
    expect(consumed).toMatchObject({
      provider_id: "github",
      subject_ref: "user:charlie",
      requirement_id: "github-user-token",
    });
    await expect(states.consumeState(issued.state, {
      provider_id: "github",
      subject_ref: "user:charlie",
      now_ms: 3000,
    })).rejects.toThrow("OAuth state has already been consumed");
  });

  test("mock OAuth fixture drives callback-to-credential binding without leaking tokens", async () => {
    const mock = startMockOAuthServer({ provider_id: "github" });
    try {
      mock.stageCode({
        code: "oauth-code-1",
        token: {
          access_token: "gho_mock_secret",
          refresh_token: "refresh_mock_secret",
          token_type: "bearer",
          scopes: ["repo", "read:user"],
          expires_at_ms: 100_000,
        },
        account: {
          account_ref: "github:pandazki",
          display_name: "pandazki",
        },
      });

      const states = new InMemoryOAuthStateStore();
      const broker = new InMemoryHostCredentialBroker();
      const issued = await states.issueState({
        provider_id: "github",
        subject_ref: "user:charlie",
        requirement_id: "github-user-token",
        redirect_uri: `${mock.base_url}/callback`,
        ttl_ms: 60_000,
        now_ms: 1000,
      });

      const result = await bindOAuthCallbackCredential({
        provider: mock.provider,
        broker,
        state_store: states,
        state: issued.state,
        code: "oauth-code-1",
        requirement,
        subject_ref: "user:charlie",
        client_id: "client-123",
        client_secret: "client-secret",
        redirect_uri: `${mock.base_url}/callback`,
        now_ms: 2000,
      });

      expect(result.binding).toMatchObject({
        provider_id: "github",
        subject_ref: "user:charlie",
        account_ref: "github:pandazki",
        status: "bound",
      });
      expect(result.account.display_name).toBe("pandazki");
      expect(result.evidence_binding).toEqual({
        requirement_id: "github-user-token",
        provider_id: "github",
        status: "bound",
        bound_at: "1970-01-01T00:00:02.000Z",
        credential_ref: result.binding.credential_ref,
      });
      expect(JSON.stringify(result)).not.toContain("gho_mock_secret");
      expect(JSON.stringify(result.evidence_binding)).not.toContain("gho_mock_secret");
      expect(await broker.resolveCredential(result.binding.credential_ref, { now_ms: 3000 }))
        .toMatchObject({ secret: { access_token: "gho_mock_secret" } });
      expect(mock.requests.map((request) => request.pathname)).toEqual(["/token", "/account"]);
    } finally {
      mock.stop();
    }
  });

  test("callback binding rejects redirect URI drift before exchanging the code", async () => {
    const mock = startMockOAuthServer({ provider_id: "github" });
    try {
      mock.stageCode({
        code: "oauth-code-2",
        token: {
          access_token: "gho_should_not_exchange",
          scopes: ["repo", "read:user"],
        },
        account: {
          account_ref: "github:pandazki",
        },
      });
      const states = new InMemoryOAuthStateStore();
      const broker = new InMemoryHostCredentialBroker();
      const issued = await states.issueState({
        provider_id: "github",
        subject_ref: "user:charlie",
        requirement_id: "github-user-token",
        redirect_uri: `${mock.base_url}/callback`,
        ttl_ms: 60_000,
        now_ms: 1000,
      });

      await expect(bindOAuthCallbackCredential({
        provider: mock.provider,
        broker,
        state_store: states,
        state: issued.state,
        code: "oauth-code-2",
        requirement,
        subject_ref: "user:charlie",
        client_id: "client-123",
        redirect_uri: `${mock.base_url}/other-callback`,
        now_ms: 2000,
      })).rejects.toThrow("OAuth redirect_uri does not match issued state");

      expect(mock.requests).toEqual([]);
      expect(await broker.listCredentialBindings()).toEqual([]);
    } finally {
      mock.stop();
    }
  });
});
