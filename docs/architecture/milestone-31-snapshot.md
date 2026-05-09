# Milestone 31 Snapshot — Downstream Credential Adoption Pressure

**Date:** 2026-05-09  
**Status:** Closed as a post-RC adoption-pressure milestone. This is not a `pneuma-rc-0.1.4` release tag.  
**Input:** M30 added Host credential utilities; M31 asks whether a downstream Creation Host can actually understand and use them without reading framework internals.

## What M31 Proved

M31 migrated DevBoard Studio onto the M30 credential helpers while preserving its Host-owned persistence and encryption boundary:

```text
DevBoard Studio
  -> framework OAuth provider + mock OAuth fixture
  -> framework cookie serialization/parsing
  -> framework session cookie hashing
  -> framework credential rebinding evidence builder
  -> Host-owned SQLite + AES-GCM keystore remain in DevBoard
```

This is the intended boundary:

```text
Framework utility shape is reusable.
Host production identity and secret storage remain Host-owned.
```

## Adoption Results

| Area | Result |
|---|---|
| OAuth authorize URL | DevBoard now delegates URL construction to `createOAuthAuthorizeUrl`. |
| OAuth code exchange | DevBoard now delegates provider-neutral code exchange to `createOAuth2Provider`. |
| OAuth test fixture | DevBoard's round-trip test now uses framework `startMockOAuthServer` instead of the GitHub-specific OAuth mock. |
| Cookie handling | DevBoard now uses `serializeHostCookie`, `readHostCookie`, and `appendHostSetCookie`. |
| Session hash discipline | DevBoard now uses `createHostSessionCookie` and `hashHostSessionCookie` while keeping its SQLite session table. |
| Credential evidence | DevBoard now generates rebinding evidence from Host credential refs via `createCredentialRebindingEvidenceFromBindings`. |
| Host-owned secret boundary | DevBoard kept encrypted credential rows and its broker endpoint. M31 did not move durable secret persistence into framework. |

## Framework Adjustment

The adoption test exposed one real framework rough edge: provider token endpoints can return `application/x-www-form-urlencoded` even when the request is otherwise valid. GitHub OAuth Apps are the common example.

M31 updates `createOAuth2Provider` so token responses can be parsed from either JSON or form-encoded bodies. The framework test suite now covers this shape.

## Downstream Adjustment

DevBoard also surfaced a non-credential type alignment issue after pointing at the newer framework source: rejected code-change receipts are now represented as `status: "rejected"` instead of being collapsed into `failed_framework`.

DevBoard updated its proposal persistence/test expectations to accept the explicit `rejected` receipt status. This is a contract alignment, not a credential feature.

## Verification

Framework commands:

```bash
bun test packages/core/test/host-oauth.test.ts packages/core/test/host-sessions.test.ts packages/core/test/host-credentials.test.ts
bun run typecheck
```

Framework results:

- Host credential/session/OAuth suite: `13 pass`, `0 fail`, `52 expect() calls`.
- Typecheck: passed.

Downstream commands in `/Users/pandazki/Tmp/pneuma-framework-example-devboard-studio`:

```bash
bun run typecheck
bun test
```

Downstream results:

- Typecheck: passed.
- Full downstream suite: `138 pass`, `0 fail`, `873 expect() calls` across `33 files`.

## Remaining Boundary

M31 deliberately does not promote DevBoard's persistent credential table, AES-GCM keystore, GitHub REST fixture, account-linking UI, or internal broker endpoint into framework APIs.

The next useful credential lane is not "production IAM in framework." It is a narrower decision: whether a future Host utility package should expose persistent-store interfaces for sessions/credential refs, while still leaving storage/encryption implementation to the Host.

