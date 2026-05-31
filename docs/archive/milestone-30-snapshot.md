# Milestone 30 Snapshot — Host Credential Broker Utilities

**Date:** 2026-05-09  
**Status:** Closed as a post-RC stabilization milestone. This is not a `pneuma-rc-0.1.4` release tag.  
**Input:** Downstream DevBoard pressure: Hosts can declare credential requirements and rebinding evidence, but still had to hand-roll sessions, OAuth state, callback binding, credential refs, and provider-shaped test fixtures.

## What M30 Proved

M30 makes the credential rebinding support path concrete without claiming production identity:

```text
CredentialRequirement
  -> OAuth state for provider + subject
  -> OAuth callback code exchange
  -> HostCredentialBinding with credential_ref
  -> no-secret CredentialRebindingEvidence
  -> broker-only secret resolution
```

The boundary is intentionally narrow:

```text
Framework owns safe helper shape.
Creation Host owns real identity, persistence, encryption, refresh, and UX.
```

## Closed Findings

| Finding | M30 result |
|---|---|
| Hosts reimplemented cookie parsing, multiple `Set-Cookie`, and logout revoke discipline | Added session/cookie helpers and `InMemoryHostSessionStore`. |
| Hosts stored credential metadata and secret material too close together | Added `InMemoryHostCredentialBroker` and no-secret `HostCredentialBinding` metadata. |
| Credential rebinding evidence was easy to hand-write incorrectly | Added `createCredentialRebindingEvidenceFromBindings`. |
| OAuth state maps were Host-specific and easy to under-scope | Added `InMemoryOAuthStateStore` with provider, subject, requirement, expiry, and single-use semantics. |
| OAuth callback-to-credential binding had no shared path | Added `createOAuth2Provider` and `bindOAuthCallbackCredential`. |
| Each downstream Host wrote its own provider-shaped OAuth mock | Added `startMockOAuthServer` test fixture. |

## Boundary Decisions

M30 does not add hosted auth, production secret persistence, provider SDKs, token refresh, cloud KMS, or an account-linking UI. It gives downstream Hosts a common reference implementation and test contract.

The `InMemory*` classes are useful for local examples and tests. Production Hosts should persist equivalent records using their chosen storage and secret boundary while preserving the same fail-closed semantics.

## Developer-Facing Changes

New guide:

- [Host Credential Broker Utilities](../developer/credential-broker.md) / [中文版](../developer/credential-broker.zh-CN.md)

New ADR:

- [ADR-0037: Host Credential Broker Utilities](../architecture/adr/0037-host-credential-broker-utilities.md)

New core exports:

- `serializeHostCookie`, `readHostCookie`, `appendHostSetCookie`
- `InMemoryHostSessionStore`
- `InMemoryHostCredentialBroker`
- `createCredentialRebindingEvidenceFromBindings`
- `InMemoryOAuthStateStore`
- `createOAuthAuthorizeUrl`, `createOAuth2Provider`
- `bindOAuthCallbackCredential`
- `startMockOAuthServer`

## Verification

Commands run from the M30 worktree:

```bash
bun test packages/core/test/host-sessions.test.ts packages/core/test/host-credentials.test.ts packages/core/test/host-oauth.test.ts
bun test packages/core/test/host-authoring.test.ts packages/core/test/sharing-governance.test.ts packages/core/test/agent-backend/run-turn.test.ts packages/core/test/host-sessions.test.ts packages/core/test/host-credentials.test.ts packages/core/test/host-oauth.test.ts
bun run typecheck
tmp_config=$(mktemp -d) && printf '{"auths":{}}\n' > "$tmp_config/config.json" && DOCKER_CONFIG="$tmp_config" bun test
```

Final results:

- Host credential/session/OAuth suite: `12 pass`, `0 fail`, `49 expect() calls`.
- Related authoring/governance/backend suite: `42 pass`, `0 fail`, `112 expect() calls`.
- Typecheck: passed.
- Full suite with a temporary Docker config: `1254 pass`, `0 fail`, `4686 expect() calls` across `190 files`.

## Next

Recommended next milestone:

1. Pressure a downstream Host against these utilities and decide whether to promote persistent Host stores, provider-specific adapters, or account-linking UI helpers.

M30 deliberately keeps the credential lane small. It lets downstream Hosts understand and use the credential tools; it does not make credential operations a hosted product surface.
