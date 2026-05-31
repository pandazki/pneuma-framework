# M31 Downstream Credential Adoption Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove that a downstream Creation Host can adopt M30 Host credential utilities without moving production identity or secret persistence into the framework.

**Architecture:** Keep framework changes narrow: provider response parsing and documentation only. Perform the adoption in DevBoard Studio by replacing duplicated OAuth/cookie/session/evidence helpers with `@pneuma-framework/core` exports while keeping DevBoard's SQLite credential table, AES-GCM keystore, and broker endpoint Host-owned.

**Tech Stack:** Bun, TypeScript, `@pneuma-framework/core`, DevBoard Studio integration tests.

---

### Task 1: Establish The Adoption RED Test

**Files:**
- Modify downstream: `/Users/pandazki/Tmp/pneuma-framework-example-devboard-studio/test/integration/oauth-roundtrip.test.ts`
- Modify downstream: `/Users/pandazki/Tmp/pneuma-framework-example-devboard-studio/tsconfig.json`

- [x] **Step 1: Point DevBoard Studio at the M31 framework worktree**

Update `tsconfig.json` paths so `@pneuma-framework/core` resolves to `/Users/pandazki/.codex/worktrees/m31-credential-adoption/pneuma-framework/packages/core/src/index.ts`.

- [x] **Step 2: Replace the OAuth round-trip test fixture**

Change the test from DevBoard's `startMockGitHub()` helper to framework `startMockOAuthServer({ provider_id: "github" })`.

- [x] **Step 3: Verify RED**

Run:

```bash
bun test test/integration/oauth-roundtrip.test.ts
```

Expected RED: current DevBoard OAuth exchange posts JSON while the framework fixture expects OAuth form body.

### Task 2: Patch Framework OAuth Provider Compatibility

**Files:**
- Modify: `/Users/pandazki/.codex/worktrees/m31-credential-adoption/pneuma-framework/packages/core/test/host-oauth.test.ts`
- Modify: `/Users/pandazki/.codex/worktrees/m31-credential-adoption/pneuma-framework/packages/core/src/host-oauth.ts`

- [x] **Step 1: Add failing framework test for form-encoded token responses**

Add a test proving `createOAuth2Provider().exchangeCode()` can parse `application/x-www-form-urlencoded` token responses.

- [x] **Step 2: Verify RED**

Run:

```bash
bun test packages/core/test/host-oauth.test.ts
```

Expected RED: `SyntaxError: Failed to parse JSON`.

- [x] **Step 3: Implement parser**

Parse token responses by `content-type`: JSON for `application/json`, otherwise `URLSearchParams`.

- [x] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/core/test/host-oauth.test.ts
```

Expected GREEN: OAuth tests pass.

### Task 3: Adopt M30 Helpers In DevBoard Studio

**Files:**
- Modify downstream: `/Users/pandazki/Tmp/pneuma-framework-example-devboard-studio/src/host/auth/github-oauth.ts`
- Modify downstream: `/Users/pandazki/Tmp/pneuma-framework-example-devboard-studio/src/host/auth/routes.ts`
- Modify downstream: `/Users/pandazki/Tmp/pneuma-framework-example-devboard-studio/src/host/auth/sessions.ts`
- Modify downstream: `/Users/pandazki/Tmp/pneuma-framework-example-devboard-studio/src/host/projects/routes.ts`
- Modify downstream: `/Users/pandazki/Tmp/pneuma-framework-example-devboard-studio/src/host/evolution/routes.ts`
- Modify downstream: `/Users/pandazki/Tmp/pneuma-framework-example-devboard-studio/src/host/publish/routes.ts`
- Modify downstream: `/Users/pandazki/Tmp/pneuma-framework-example-devboard-studio/test/integration/authoring-kit.test.ts`

- [x] **Step 1: Delegate OAuth helper logic**

Use `createOAuthAuthorizeUrl` and `createOAuth2Provider` in `src/host/auth/github-oauth.ts`.

- [x] **Step 2: Delegate cookie helpers**

Use `serializeHostCookie`, `readHostCookie`, and `appendHostSetCookie` in Host routes.

- [x] **Step 3: Delegate session cookie hash helpers**

Use `createHostSessionCookie` and `hashHostSessionCookie` in `src/host/auth/sessions.ts`.

- [x] **Step 4: Generate credential rebinding evidence from Host refs**

Add a downstream authoring-kit test using `createCredentialRebindingEvidenceFromBindings`.

- [x] **Step 5: Align rejected code-change receipt semantics**

Accept explicit `status: "rejected"` after moving DevBoard onto the newer framework source.

### Task 4: Verify Adoption

**Files:**
- No implementation files.

- [x] **Step 1: Run downstream typecheck**

```bash
bun run typecheck
```

Expected: pass.

- [x] **Step 2: Run downstream full suite**

```bash
bun test
```

Expected: `138 pass`, `0 fail`.

- [x] **Step 3: Run framework targeted suite**

```bash
bun test packages/core/test/host-oauth.test.ts packages/core/test/host-sessions.test.ts packages/core/test/host-credentials.test.ts
```

Expected: `13 pass`, `0 fail`.

### Task 5: Document M31

**Files:**
- Create: `/Users/pandazki/.codex/worktrees/m31-credential-adoption/pneuma-framework/docs/archive/milestone-31-snapshot.md`
- Create: `/Users/pandazki/.codex/worktrees/m31-credential-adoption/pneuma-framework/docs/archive/milestone-31-snapshot.zh-CN.md`
- Modify: `/Users/pandazki/.codex/worktrees/m31-credential-adoption/pneuma-framework/docs/developer/credential-broker.md`
- Modify: `/Users/pandazki/.codex/worktrees/m31-credential-adoption/pneuma-framework/docs/developer/credential-broker.zh-CN.md`
- Modify: roadmap and canonical entry docs.

- [x] **Step 1: Record adoption result**

Write the M31 snapshot in English and Chinese.

- [x] **Step 2: Record provider response compatibility**

Document that `createOAuth2Provider` accepts JSON and form-encoded token responses.

- [x] **Step 3: Final verification and commit**

Run framework and downstream checks again, then commit framework and downstream changes separately.
