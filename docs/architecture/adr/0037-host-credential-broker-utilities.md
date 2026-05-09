# ADR-0037: Host Credential Broker Utilities

**Status:** Accepted  
**Date:** 2026-05-09  
**Related:** [ADR-0021](./0021-admin-delegated-credential.md), [ADR-0032](./0032-build-thread-primitive.md), [ADR-0036](./0036-agent-backend-run-turn.md)

## Context

M22 and M23 made credential rebinding part of the Creation Host sharing model: a portable share artifact names required credentials, and the receiving Builder must re-bind their own provider account without exporting the original Builder's secrets.

Downstream DevBoard pressure then showed that every realistic Host starts reimplementing the same support code:

```text
session cookie hashing
server-side logout
OAuth state issue / consume
callback code exchange
credential_ref binding
no-secret rebinding evidence
provider-shaped OAuth test fixture
```

This code is framework-shaped, but not production identity. If each Host hand-rolls it, they will diverge on state scoping, token leakage, logout behavior, cookie parsing, and test fidelity.

## Decision

Accept a small set of Host credential utilities in `@pneuma-framework/core`:

- `serializeHostCookie`, `readHostCookie`, `appendHostSetCookie`;
- `InMemoryHostSessionStore`;
- `InMemoryHostCredentialBroker`;
- `createCredentialRebindingEvidenceFromBindings`;
- `InMemoryOAuthStateStore`;
- `createOAuthAuthorizeUrl`, `createOAuth2Provider`;
- `bindOAuthCallbackCredential`;
- `startMockOAuthServer`.

These utilities define a reference security shape:

```text
raw cookie -> hash in session store
raw token -> broker secret map / Host persistence
framework-visible evidence -> credential_ref only
OAuth state -> provider + subject + requirement scoped, expiring, single-use
```

The in-memory stores are reference implementations and test helpers. A production Host may persist the same records in SQLite, Keychain, KMS, or another Host-owned store, but it should preserve the same no-secret evidence and fail-closed semantics.

## Consequences

### Positive

- Downstream Hosts have one documented way to wire OAuth callback-to-credential binding.
- Credential rebinding evidence can be generated from bindings without exposing tokens.
- Session logout and cookie hashing are explicit framework utilities instead of tribal knowledge.
- OAuth state is scoped and single-use by default.
- Provider-shaped tests can use a shared fixture instead of ad hoc mock servers.

### Negative / Limits

- This is not hosted identity.
- This is not a production secret manager.
- The framework does not own OAuth app registration, real provider clients, token refresh, encryption at rest, or operator UX.
- The `InMemory*` stores are not durable and should not be used as production persistence.
- `startMockOAuthServer` is a test fixture, not a provider adapter.

## Verification

M30 adds tests for:

- cookie serialization, parsing, and multiple `Set-Cookie` headers;
- session cookie hashing, lookup, revoke, and expiry sweep;
- credential binding with no raw secret in metadata or evidence;
- missing scope rejection before secret storage;
- revoked and expired credential fail-closed resolution;
- OAuth authorization URL generation;
- provider/subject-scoped, single-use OAuth state;
- mock OAuth callback-to-credential binding without token leakage.
