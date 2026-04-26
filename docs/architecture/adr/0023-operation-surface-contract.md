# ADR-0023: Operation Surface Contract

**Status**: Accepted
**Date**: 2026-04-27
**Deciders**: Pandazki, Codex
**Tags**: operation, view, agent, app-definition, governance

---

## Context

ADR-0018 made Operation the shared primitive for UI and Agent actions. ADR-0022 then allowed Views to mount read Operations as end-user app surface.

That exposed an ambiguity: "readable" is not the same as "safe to mount in an end-user View." Framework governance Operations such as `definition.rollback.validate` are read-only and agent-callable, but they are not application capabilities. A View mounted on such an Operation would leak framework internals into the app surface.

The first fix rejected framework Operation ids directly. That was correct as a guard, but wrong as a long-term primitive: the framework needs an explicit surface contract, not an id blacklist.

## Decision

Operation now carries a `surface` declaration:

```ts
interface OperationSurfaceDeclaration {
  agent_callable: boolean;
  public_surface: boolean;
  view_mountable: boolean;
  framework_internal: boolean;
}
```

Defaults preserve legacy behavior:

```ts
{
  agent_callable: true,
  public_surface: true,
  view_mountable: affects.reads_only,
  framework_internal: false
}
```

Framework-injected Operations explicitly use:

```ts
{
  agent_callable: true,
  public_surface: false,
  view_mountable: false,
  framework_internal: true
}
```

Invariants:

- `framework_internal=true` requires `public_surface=false`.
- `framework_internal=true` requires `view_mountable=false`.
- `view_mountable=true` requires `public_surface=true`.
- `view_mountable=true` requires `affects.reads_only=true`.

`/api/config.operations[]` exposes the normalized `surface` object. Consumers should not infer app-surface eligibility from `reads_only` alone.

## Runtime Semantics

- `add_view` accepts a source Operation only when it is read-only and `surface.view_mountable=true`.
- Definition overlay loading skips `pneuma_views` rows whose source Operation is not view-mountable.
- Operation-backed Views are now governed by semantic surface flags, not framework Operation ids.
- `OperationToolBridge` and the standalone template MCP bridge register `op.*` tools only when `surface.agent_callable !== false`.

Important boundary: `surface` is a classification and discovery contract, not an authorization system. Execution still depends on policy evaluation, confirmation rules, and future enterprise auth.

## Consequences

### Positive

- Framework governance Operations can remain agent-callable without becoming end-user app surface.
- Builder-authored read Operations are view-mountable by default, so the happy path stays simple.
- Apps can declare internal Operations that are not registered as agent tools or cannot back Views.
- `/api/config` gives viewers, bridges, and future admin tools one uniform way to reason about Operation exposure.

### Negative / Risks

- There are now two related but distinct concepts: agent tool exposure and end-user surface exposure.
- `public_surface` can be mistaken for security. It must be documented as classification unless paired with policy.
- Existing templates that do not emit `surface` rely on defaults; this is intentional but should be revisited before a stable v1 contract.

## Follow-ups

- Add policy-scoped View visibility (`view:<id>` rules plus source Operation checks).
- Decide whether direct HTTP invocation should eventually enforce a separate `api_callable` flag or remain purely policy-driven.
- Add a product-facing surface inspector that shows why an Operation is or is not visible to Agent / View / end user.
