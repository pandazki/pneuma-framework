import { randomBytes } from "node:crypto";
import type { CredentialRequirement } from "./host-authoring.js";
import {
  type HostCredentialBinding,
  type HostCredentialSecret,
  type InMemoryHostCredentialBroker,
} from "./host-credentials.js";

export interface OAuthAuthorizeUrlInput {
  readonly authorization_url: string;
  readonly client_id: string;
  readonly redirect_uri: string;
  readonly scopes: readonly string[];
  readonly state: string;
  readonly response_type?: string;
  readonly extra_params?: Record<string, string>;
}

export interface OAuthStateRecord {
  readonly state: string;
  readonly provider_id: string;
  readonly subject_ref: string;
  readonly requirement_id: string;
  readonly redirect_uri: string;
  readonly created_at_ms: number;
  readonly expires_at_ms: number;
  readonly consumed_at_ms?: number;
}

export interface IssueOAuthStateInput {
  readonly provider_id: string;
  readonly subject_ref: string;
  readonly requirement_id: string;
  readonly redirect_uri: string;
  readonly ttl_ms: number;
  readonly now_ms?: number;
}

export interface ConsumeOAuthStateInput {
  readonly provider_id: string;
  readonly subject_ref: string;
  readonly now_ms?: number;
}

export interface OAuthTokenResponse {
  readonly access_token: string;
  readonly refresh_token?: string;
  readonly token_type?: string;
  readonly scopes: readonly string[];
  readonly expires_at_ms?: number;
}

export interface OAuthAccount {
  readonly account_ref: string;
  readonly display_name?: string;
  readonly raw?: unknown;
}

export interface OAuthCodeExchangeInput {
  readonly code: string;
  readonly client_id: string;
  readonly client_secret?: string;
  readonly redirect_uri: string;
}

export interface OAuthProviderAdapter {
  readonly provider_id: string;
  buildAuthorizeUrl(input: Omit<OAuthAuthorizeUrlInput, "authorization_url">): URL;
  exchangeCode(input: OAuthCodeExchangeInput): Promise<OAuthTokenResponse>;
  fetchAccount(token: OAuthTokenResponse): Promise<OAuthAccount>;
}

export interface OAuth2ProviderOptions {
  readonly provider_id: string;
  readonly authorization_url: string;
  readonly token_url: string;
  readonly account_url: string;
  readonly map_account?: (json: unknown) => OAuthAccount;
}

export interface BindOAuthCallbackCredentialInput {
  readonly provider: OAuthProviderAdapter;
  readonly broker: InMemoryHostCredentialBroker;
  readonly state_store: InMemoryOAuthStateStore;
  readonly state: string;
  readonly code: string;
  readonly requirement: CredentialRequirement;
  readonly subject_ref: string;
  readonly client_id: string;
  readonly client_secret?: string;
  readonly redirect_uri: string;
  readonly now_ms?: number;
}

export interface BoundOAuthCredential {
  readonly binding: HostCredentialBinding;
  readonly account: OAuthAccount;
  readonly evidence_binding: {
    readonly requirement_id: string;
    readonly provider_id: string;
    readonly status: "bound";
    readonly bound_at: string;
    readonly credential_ref: string;
  };
}

export interface MockOAuthServerRequest {
  readonly pathname: string;
  readonly method: string;
}

export interface MockOAuthServerCode {
  readonly code: string;
  readonly token: OAuthTokenResponse;
  readonly account: OAuthAccount;
}

export interface MockOAuthServerHandle {
  readonly base_url: string;
  readonly provider: OAuthProviderAdapter;
  readonly requests: MockOAuthServerRequest[];
  stageCode(input: MockOAuthServerCode): void;
  stop(): void;
}

export function createOAuthAuthorizeUrl(input: OAuthAuthorizeUrlInput): URL {
  const url = new URL(input.authorization_url);
  url.searchParams.set("client_id", input.client_id);
  url.searchParams.set("redirect_uri", input.redirect_uri);
  url.searchParams.set("scope", input.scopes.join(" "));
  url.searchParams.set("state", input.state);
  url.searchParams.set("response_type", input.response_type ?? "code");
  for (const [key, value] of Object.entries(input.extra_params ?? {})) {
    url.searchParams.set(key, value);
  }
  return url;
}

export class InMemoryOAuthStateStore {
  private readonly states = new Map<string, OAuthStateRecord>();

  async issueState(input: IssueOAuthStateInput): Promise<OAuthStateRecord> {
    if (!Number.isFinite(input.ttl_ms) || input.ttl_ms <= 0) {
      throw new Error("ttl_ms must be positive");
    }
    const now = input.now_ms ?? Date.now();
    const record: OAuthStateRecord = {
      state: randomBytes(32).toString("base64url"),
      provider_id: input.provider_id,
      subject_ref: input.subject_ref,
      requirement_id: input.requirement_id,
      redirect_uri: input.redirect_uri,
      created_at_ms: now,
      expires_at_ms: now + input.ttl_ms,
    };
    this.states.set(record.state, record);
    return record;
  }

  async consumeState(
    state: string,
    input: ConsumeOAuthStateInput,
  ): Promise<OAuthStateRecord> {
    const now = input.now_ms ?? Date.now();
    const record = this.states.get(state);
    if (record === undefined) throw new Error("OAuth state is unknown");
    if (record.consumed_at_ms !== undefined) throw new Error("OAuth state has already been consumed");
    if (record.expires_at_ms <= now) throw new Error("OAuth state has expired");
    if (record.provider_id !== input.provider_id || record.subject_ref !== input.subject_ref) {
      throw new Error("OAuth state does not match provider or subject");
    }
    const consumed = { ...record, consumed_at_ms: now };
    this.states.set(state, consumed);
    return consumed;
  }
}

export function createOAuth2Provider(options: OAuth2ProviderOptions): OAuthProviderAdapter {
  return {
    provider_id: options.provider_id,
    buildAuthorizeUrl(input) {
      return createOAuthAuthorizeUrl({
        ...input,
        authorization_url: options.authorization_url,
      });
    },
    async exchangeCode(input) {
      const body = new URLSearchParams();
      body.set("grant_type", "authorization_code");
      body.set("code", input.code);
      body.set("client_id", input.client_id);
      body.set("redirect_uri", input.redirect_uri);
      if (input.client_secret !== undefined) body.set("client_secret", input.client_secret);
      const response = await fetch(options.token_url, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!response.ok) throw new Error(`OAuth token exchange failed: ${response.status}`);
      const json = await parseOAuthTokenResponse(response);
      const accessToken = String(json.access_token ?? "");
      if (!accessToken) throw new Error("OAuth token response missing access_token");
      return {
        access_token: accessToken,
        refresh_token: stringOrUndefined(json.refresh_token),
        token_type: stringOrUndefined(json.token_type),
        scopes: scopesFromTokenJson(json),
        expires_at_ms: numberOrUndefined(json.expires_at_ms),
      };
    },
    async fetchAccount(token) {
      const response = await fetch(options.account_url, {
        headers: { authorization: `Bearer ${token.access_token}` },
      });
      if (!response.ok) throw new Error(`OAuth account fetch failed: ${response.status}`);
      const json = await response.json();
      if (options.map_account) return options.map_account(json);
      const record = json as Record<string, unknown>;
      const login = stringOrUndefined(record.login);
      const id = stringOrUndefined(record.id);
      return {
        account_ref: `${options.provider_id}:${login ?? id ?? "account"}`,
        display_name: login ?? id,
        raw: json,
      };
    },
  };
}

export async function bindOAuthCallbackCredential(
  input: BindOAuthCallbackCredentialInput,
): Promise<BoundOAuthCredential> {
  if (input.provider.provider_id !== input.requirement.provider_id) {
    throw new Error("OAuth provider does not match credential requirement");
  }
  const state = await input.state_store.consumeState(input.state, {
    provider_id: input.provider.provider_id,
    subject_ref: input.subject_ref,
    now_ms: input.now_ms,
  });
  if (state.requirement_id !== input.requirement.id) {
    throw new Error("OAuth state does not match credential requirement");
  }
  if (state.redirect_uri !== input.redirect_uri) {
    throw new Error("OAuth redirect_uri does not match issued state");
  }
  const token = await input.provider.exchangeCode({
    code: input.code,
    client_id: input.client_id,
    client_secret: input.client_secret,
    redirect_uri: input.redirect_uri,
  });
  const account = await input.provider.fetchAccount(token);
  const secret: HostCredentialSecret = {
    kind: "oauth2",
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    token_type: token.token_type,
    expires_at_ms: token.expires_at_ms,
  };
  const binding = await input.broker.bindCredential({
    requirement: input.requirement,
    subject_ref: input.subject_ref,
    account_ref: account.account_ref,
    scopes: token.scopes,
    secret,
    now_ms: input.now_ms,
  });
  return {
    binding,
    account,
    evidence_binding: {
      requirement_id: input.requirement.id,
      provider_id: input.requirement.provider_id,
      status: "bound",
      bound_at: new Date(binding.bound_at_ms).toISOString(),
      credential_ref: binding.credential_ref,
    },
  };
}

export function startMockOAuthServer(options: {
  readonly provider_id: string;
  readonly port?: number;
}): MockOAuthServerHandle {
  const stagedByCode = new Map<string, MockOAuthServerCode>();
  const stagedByToken = new Map<string, MockOAuthServerCode>();
  const requests: MockOAuthServerRequest[] = [];
  const server = Bun.serve({
    port: options.port ?? 0,
    async fetch(req) {
      const url = new URL(req.url);
      requests.push({ pathname: url.pathname, method: req.method });
      if (url.pathname === "/token") {
        const body = await req.formData();
        const code = String(body.get("code") ?? "");
        const staged = stagedByCode.get(code);
        if (staged === undefined) return Response.json({ error: "bad_code" }, { status: 400 });
        stagedByToken.set(staged.token.access_token, staged);
        return Response.json({
          access_token: staged.token.access_token,
          refresh_token: staged.token.refresh_token,
          token_type: staged.token.token_type,
          scopes: staged.token.scopes,
          expires_at_ms: staged.token.expires_at_ms,
        });
      }
      if (url.pathname === "/account") {
        const accessToken = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
        const staged = stagedByToken.get(accessToken);
        if (staged === undefined) return Response.json({ error: "bad_token" }, { status: 401 });
        return Response.json({
          account_ref: staged.account.account_ref,
          display_name: staged.account.display_name,
        });
      }
      return Response.json({ ok: true });
    },
  });
  const baseUrl = server.url.origin;
  return {
    base_url: baseUrl,
    provider: createOAuth2Provider({
      provider_id: options.provider_id,
      authorization_url: `${baseUrl}/authorize`,
      token_url: `${baseUrl}/token`,
      account_url: `${baseUrl}/account`,
      map_account(json) {
        const record = json as Record<string, unknown>;
        return {
          account_ref: String(record.account_ref),
          display_name: stringOrUndefined(record.display_name),
          raw: json,
        };
      },
    }),
    requests,
    stageCode(input) {
      stagedByCode.set(input.code, input);
    },
    stop() {
      server.stop(true);
    },
  };
}

function scopesFromTokenJson(json: Record<string, unknown>): readonly string[] {
  if (Array.isArray(json.scopes)) return json.scopes.map(String);
  if (typeof json.scope === "string") return json.scope.split(/\s+/).filter(Boolean);
  return [];
}

async function parseOAuthTokenResponse(response: Response): Promise<Record<string, unknown>> {
  const contentType = response.headers.get("content-type") ?? "";
  const text = await response.text();
  if (contentType.includes("application/json")) {
    return JSON.parse(text) as Record<string, unknown>;
  }
  return Object.fromEntries(new URLSearchParams(text));
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
