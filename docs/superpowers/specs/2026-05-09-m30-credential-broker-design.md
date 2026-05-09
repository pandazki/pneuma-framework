# M30 Credential Broker Utilities Design

**Status:** Implementation design for M30  
**Date:** 2026-05-09  
**Owner:** Codex  

## Goal

Give downstream Creation Hosts a small, safe, understandable way to implement Builder-owned provider authorization without reinventing cookie parsing, session hashing, OAuth state handling, credential refs, revocation, and no-secret rebinding evidence.

## Boundary

M30 is not production IAM and not a hosted secret manager. It is a framework utility layer for local/reference Hosts.

The framework owns:

- no-secret credential binding metadata;
- host-broker credential refs;
- session-cookie hashing and revocation helpers;
- OAuth state issue/consume helpers;
- a generic OAuth2 provider adapter shape;
- an in-process mock OAuth fixture for downstream tests;
- developer docs that explain how a Host wires GitHub/Linear-like providers without putting tokens in app data or share artifacts.

The Host still owns:

- real OAuth app registration;
- real secret encryption / Keychain / KMS / vault storage;
- real user authentication;
- account-linking product UX;
- provider-specific API clients;
- production rotation, retention, and audit policy.

## Core Concepts

### HostCredentialBroker

The broker stores two separable facts:

```text
Credential binding metadata:
  credential_ref, requirement_id, provider_id, subject_ref, account_ref, scopes, status

Credential secret:
  opaque token / OAuth access token / refresh token
```

Portable manifests and credential rebinding evidence only carry metadata and `credential_ref`. Raw credential values are only returned by explicit broker resolution.

### HostSessionStore

Creation Hosts commonly need a cookie-backed Builder session before OAuth callback can bind a provider account. The framework helper stores only `sha256(cookie)`, never the raw cookie value. Logout revokes the server-side session row; clearing the client cookie alone is not enough.

### OAuth State

OAuth callback state is single-use and expires. A Host issues state before redirecting the Builder to a provider, then consumes that state in the callback before exchanging the code.

### Generic OAuth2 Provider Adapter

The adapter is provider-shaped but not provider-owned by core:

```text
authorization URL builder
code exchange
account fetch
```

A Host can wrap GitHub, Linear, GitLab, OpenRouter, or a mock provider behind the same interface. Core ships a mock OAuth server fixture only for tests and examples.

## Downstream Experience

A downstream Host should be able to:

1. create a Builder session with a secure cookie;
2. issue OAuth state for a credential requirement;
3. exchange a callback code through a provider adapter;
4. bind the returned token to a host-broker `credential_ref`;
5. emit `CredentialRebindingEvidence` with no secrets;
6. revoke the binding and session in tests;
7. validate the behavior with an in-process mock OAuth server.

## Non-Goals

- No database package or migration runner.
- No encryption implementation.
- No provider-specific production GitHub/Linear client.
- No browser UI.
- No public install primitive.
- No multi-tenant identity provider integration.

## Verification

M30 must include tests proving:

- session store hashes raw cookies and revokes on logout;
- cookie helpers correctly serialize, parse, and append multiple `Set-Cookie` headers;
- OAuth state is one-time and provider/subject scoped;
- credential broker resolves secrets only through explicit broker calls;
- rebinding evidence contains no token-like material;
- revoked or expired bindings fail closed;
- mock OAuth fixture can drive a complete callback-to-binding flow.
