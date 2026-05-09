# Host Credential Broker Utilities

**Audience:** Creation Host Developers wiring account sessions, OAuth callbacks, and credential rebinding  
**Status:** M30 post-RC stabilization utility; no new release tag  
**Chinese version:** [credential-broker.zh-CN.md](./credential-broker.zh-CN.md)

M30 gives downstream Hosts a small, testable credential toolkit. It does not turn pneuma-framework into hosted identity, a secret manager, or a production OAuth service.

The problem it solves is narrower:

```text
Builder installs / forks / previews an app
  -> Host asks Builder to bind provider credentials
  -> Host stores raw token material behind a broker
  -> framework-visible artifacts receive credential_ref evidence only
  -> runtime or Host code resolves the secret through the broker when needed
```

## Boundary

Framework owns reusable safety shape:

- session cookies are random values, but stored sessions keep only `sha256(cookie)`;
- logout/revoke is server-side, not only client cookie clearing;
- multiple `Set-Cookie` headers are appended correctly;
- OAuth state is provider-scoped, subject-scoped, expiring, and single-use;
- credential bindings expose `credential_ref`, provider, subject, account, scopes, status, and timestamps;
- raw OAuth/API key material is resolved only through the Host broker;
- credential rebinding evidence contains no tokens, API keys, refresh tokens, passwords, or private keys;
- tests can use a shared in-process mock OAuth fixture.

Host still owns production decisions:

- real auth UX and user identity model;
- OAuth app registration and provider-specific consent screen;
- persistent storage, encryption, Keychain/KMS/secret-manager integration;
- token refresh and rotation policy;
- audit retention and operator workflow;
- provider-specific API clients.

## Core Flow

```text
CredentialRequirement
  -> OAuth state issued for provider + subject
  -> OAuth callback exchanges code
  -> HostCredentialBinding created
  -> credential_ref appears in CredentialRebindingEvidence
  -> raw secret stays behind broker.resolveCredential()
```

`CredentialRequirement` still comes from the Creation Host Authoring Kit:

```ts
const requirement = {
  id: "github-user-token",
  provider_id: "github",
  scopes: ["repo", "read:user"],
  binding_mode: "per-user",
  placement: "host-broker",
  required: true,
} as const;
```

M30 helpers accept `placement: "host-broker"`. Other placements such as `keychain`, `kms`, `secret-manager`, or `env` remain Host-owned adapter choices.

## Sessions And Cookies

```ts
import {
  InMemoryHostSessionStore,
  appendHostSetCookie,
  readHostCookie,
  serializeHostCookie,
} from "@pneuma-framework/core";

const sessions = new InMemoryHostSessionStore();

const created = await sessions.createSession({
  subject_ref: "user:charlie",
  ttl_ms: 7 * 24 * 60 * 60 * 1000,
});

const headers = new Headers();
appendHostSetCookie(headers, serializeHostCookie("pneuma_session", created.cookie, {
  max_age_seconds: 7 * 24 * 60 * 60,
  secure: true,
}));

const cookie = readHostCookie(request, "pneuma_session");
const session = cookie
  ? await sessions.lookupSession(cookie)
  : undefined;
```

Rules:

- store `session.cookie_hash`, not `created.cookie`;
- call `revokeSession(cookie)` on logout;
- call `sweepExpired()` from Host maintenance code if using the in-memory reference store shape as a model for persistence;
- use `Headers.append("Set-Cookie", value)`, not comma-joining, for multiple cookies.

## Credential Broker

```ts
import {
  InMemoryHostCredentialBroker,
  createCredentialRebindingEvidenceFromBindings,
} from "@pneuma-framework/core";

const broker = new InMemoryHostCredentialBroker();

const binding = await broker.bindCredential({
  requirement,
  subject_ref: "user:charlie",
  account_ref: "github:pandazki",
  scopes: ["repo", "read:user"],
  secret: {
    kind: "oauth2",
    access_token: process.env.GITHUB_TOKEN!,
    token_type: "bearer",
  },
});

const resolved = await broker.resolveCredential(binding.credential_ref);
// resolved.secret.access_token is available only through the broker.

const evidence = createCredentialRebindingEvidenceFromBindings({
  evidence_id: "charlie-dev-board-bindings",
  artifact_id: "dev-board-share",
  app_id: "dev-board",
  version_id: "v3",
  subject: "user:charlie",
  requirements: [requirement],
  bindings: [binding],
});
```

Rules:

- share artifacts and governance manifests carry credential requirements, not secrets;
- credential rebinding evidence carries `credential_ref`, status, provider, requirement, and timestamp;
- `resolveCredential` fails closed for revoked or expired bindings;
- if scopes are missing, binding fails before the secret is stored.

## OAuth Callback Binding

```ts
import {
  InMemoryHostCredentialBroker,
  InMemoryOAuthStateStore,
  bindOAuthCallbackCredential,
  createOAuth2Provider,
} from "@pneuma-framework/core";

const states = new InMemoryOAuthStateStore();
const broker = new InMemoryHostCredentialBroker();

const provider = createOAuth2Provider({
  provider_id: "github",
  authorization_url: "https://github.com/login/oauth/authorize",
  token_url: "https://github.com/login/oauth/access_token",
  account_url: "https://api.github.com/user",
});

const issued = await states.issueState({
  provider_id: "github",
  subject_ref: "user:charlie",
  requirement_id: requirement.id,
  redirect_uri: "http://127.0.0.1:3000/oauth/github/callback",
  ttl_ms: 10 * 60 * 1000,
});

const authorizeUrl = provider.buildAuthorizeUrl({
  client_id: process.env.GITHUB_CLIENT_ID!,
  redirect_uri: issued.redirect_uri,
  scopes: requirement.scopes,
  state: issued.state,
});

// Redirect Builder to authorizeUrl, then handle the callback:
const result = await bindOAuthCallbackCredential({
  provider,
  broker,
  state_store: states,
  state: callbackState,
  code: callbackCode,
  requirement,
  subject_ref: "user:charlie",
  client_id: process.env.GITHUB_CLIENT_ID!,
  client_secret: process.env.GITHUB_CLIENT_SECRET!,
  redirect_uri: issued.redirect_uri,
});
```

The callback helper:

- consumes OAuth state exactly once;
- verifies provider, subject, and requirement match;
- exchanges the code through the provider adapter;
- fetches the provider account;
- binds the credential in the broker;
- returns a no-secret `evidence_binding` suitable for credential rebinding evidence.

## Test Fixture

Downstream Hosts should not hand-roll OAuth mocks for every provider-shaped test. M30 adds a generic in-process fixture:

```ts
import {
  InMemoryHostCredentialBroker,
  InMemoryOAuthStateStore,
  bindOAuthCallbackCredential,
  startMockOAuthServer,
} from "@pneuma-framework/core";

const mock = startMockOAuthServer({ provider_id: "github" });

try {
  mock.stageCode({
    code: "oauth-code-1",
    token: {
      access_token: "gho_mock_secret",
      refresh_token: "refresh_mock_secret",
      token_type: "bearer",
      scopes: ["repo", "read:user"],
    },
    account: {
      account_ref: "github:charlie",
      display_name: "charlie",
    },
  });

  // Use mock.provider with bindOAuthCallbackCredential(...)
} finally {
  mock.stop();
}
```

This fixture is for Host tests. It is not a real GitHub/Linear/OpenRouter adapter.

## Suggested Downstream Tests

Add tests that prove:

- session records never contain the raw cookie value;
- logout revokes the server-side session row;
- OAuth state cannot be reused;
- wrong provider or wrong subject cannot consume state;
- missing scopes reject before storing a secret;
- credential evidence does not contain access tokens or refresh tokens;
- revoked and expired credentials cannot be resolved;
- install/fork governance consumes credential rebinding evidence with `version_id` matching the artifact version.

## What To Replace In A Downstream Host

Usually removable:

- ad hoc cookie serializer/parser;
- comma-joined `Set-Cookie` response code;
- in-memory OAuth state map without subject/provider checks;
- raw token fields in share/install/fork evidence;
- provider mock server copied into every Host test suite.

Usually still Host-owned:

- persistent session and credential tables;
- encryption at rest;
- provider-specific refresh logic;
- account linking UI;
- app-specific runtime API clients.
