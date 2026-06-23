# Upgrading From 0.4.0 To 0.5.0

**Audience:** a Developer who built on `pneuma-framework` 0.4.0 and is bumping to 0.5.0
**Chinese version:** [migration-0.4-to-0.5.zh-CN.md](./migration-0.4-to-0.5.zh-CN.md)

## The one-line summary

0.5.0 changes your **consumption experience** and freezes the **public API contract**. It does **not** change runtime behavior. The build → evolve → approve → publish loop — including the real-Codex code-agent lane — behaves exactly as it did in 0.4.0. What got better is how cleanly you can install the framework as a dependency, and the fact that the published surface is now an explicit, committed semver contract.

This release does not change the four-layer product model:

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

If you upgrade, re-install, and your imports already resolved in 0.4.0, almost nothing in your Host should need to change. The notes below are ordered by how likely they are to affect you.

## 1. Provider-named BuildThread helpers are REMOVED (breaking)

**This is the one change that will actually break a 0.4.0 consumer's build.** Five legacy build-thread message helpers are **removed in 0.5.0** — no longer exported from `@pneuma-framework/core`. Importing any of them now fails. You **must** migrate to the replacements before (or as part of) upgrading.

| Removed | Replacement |
|---|---|
| `PackedAgentMessage` (type) | `BuildTurnRoleContentMessage` |
| `AnthropicMessage` (type) | `BuildTurnRoleContentMessage` |
| `OpencodeMessage` (type) | `BuildTurnRoleContentMessage` |
| `pneumaTurnsToAnthropicMessages` (fn) | `packBuildTurnsForRoleContent` |
| `pneumaTurnsToOpencodeMessages` (fn) | `packBuildTurnsForRoleContent` |

The removed types were thin aliases of `BuildTurnRoleContentMessage`, and the removed functions were thin wrappers over `packBuildTurnsForRoleContent` — so the swap is mechanical and behavior-preserving:

```ts
// before (no longer compiles under 0.5.0)
import { pneumaTurnsToAnthropicMessages } from "@pneuma-framework/core/build-thread";
const messages = pneumaTurnsToAnthropicMessages(turns, opts);

// after
import { packBuildTurnsForRoleContent } from "@pneuma-framework/core/build-thread";
const messages = packBuildTurnsForRoleContent(turns, opts);
```

The point of the move: provider-native message shapes belong in your backend adapter, not in core. `packBuildTurnsForRoleContent` returns provider-neutral role/content messages; translate them into a provider-specific request payload inside your adapter. See the CHANGELOG's **Removed** section.

## 2. `@pneuma-framework/host-kit` no longer ships `workspace:*` deps

In 0.4.0, `host-kit` was the one developer-facing package that still declared `workspace:*` dependencies. That broke `file:` consumption from a project outside the monorepo — a downstream `bun install` would fail with `Workspace dependency "@pneuma-framework/core" not found` (and the same for `runtime`).

0.5.0 converts those to `file:` dependencies, and host-kit is now exercised by the local-package-consumption gate so the regression cannot silently return.

**Action:** if you added an `overrides` block (or any manual pin) in your downstream `package.json` to work around the `workspace:*` leak, **remove it** after upgrading. It is no longer needed and can mask future drift.

## 3. `scaffold-host` emits installable framework dependency paths

In 0.4.0, when the CLI was itself installed via `file:`, a freshly scaffolded Host could emit broken framework dependency paths (it assumed an in-monorepo layout), so the scaffolded project's `bun install` failed.

0.5.0 resolves those paths through the package graph (`import.meta.resolve`) instead, so a Host scaffolded outside the monorepo installs cleanly.

**Action:** if you hit a broken-path / failed-install scaffold under 0.4.0 and patched its `package.json` by hand, re-scaffold with the 0.5.0 CLI and the paths will resolve correctly.

## 4. The public API is now frozen (non-breaking)

0.5.0 replaced every wildcard `export *` barrel with explicit `export { … }` / `export { type … }` lists across the published packages:

- `@pneuma-framework/core-domain` — 41 stars enumerated.
- `@pneuma-framework/runtime` — 5 stars enumerated.
- `@pneuma-framework/core` — its single `runtime-data-governance` star enumerated.

This is a **non-breaking** freeze. No symbol was added, removed, or relocated — every name reachable in 0.4.0 stays reachable from the same import path. The package `exports` maps were not touched. Your imports do not change.

What changes is the contract around them: from 0.5.0, the enumerated barrels are the committed public surface. Within 0.5.x, additions are minor/patch; any removal or relocation of a currently reachable symbol is a breaking change reserved for a future major-intent train. In practice, you can now rely on what you import.

> Deferred on purpose: the `@pneuma-framework/core-domain` SQLite/Drizzle layer is intentionally left in the main public barrel for 0.5.0 to keep this freeze non-breaking. Moving it behind a dedicated `/sqlite` subpath is a breaking change deliberately pushed to 0.6.0.

## 5. Boundary declaration and the Vanilla SDK correction

Two documentation-level clarifications worth knowing as a consumer:

- The README now carries a **Scope & boundaries** section: the runtime is Bun-only, and there is an explicit list of what the framework owns versus what is Host-owned (multi-tenant identity / IAM, hosted secret vaults, real provider SDKs, cloud deployment control planes, compliance/audit retention).
- The charter no longer promises a built-in **Vanilla JS SDK**. The framework ships a **React SDK on top of an open wire protocol**; a vanilla / other-stack SDK is **bring-your-own**. If you were waiting for an official vanilla SDK to land, build against the open wire protocol instead.

Neither of these removes any code you depend on; they correct what the framework promises.

## 6. CI gate split (relevant if you fork or contribute)

The repo now has a CI split:

- a **required offline gate** — typecheck, package/template test suites, and the local-package-consumption gate — on every push and pull request;
- a separate, **non-blocking live gate** for the network-bound example E2E suites.

This only matters if you fork the repo or contribute upstream. It does not affect consuming the published packages.

## Upgrade checklist

1. **Bump your dependency references to 0.5.0.** Update each `file:` path (or version) for `@pneuma-framework/core`, `@pneuma-framework/core-domain`, `@pneuma-framework/runtime`, `@pneuma-framework/host-kit`, and `@pneuma-framework/cli` to your 0.5.0 checkout/tag.
2. **Run `bun install` to re-link.** Do not skip this. A stale install after the version bump surfaces as duplicate-type errors and ~2 failing tests; a clean reinstall fixes it.
   ```bash
   bun install
   ```
3. **Remove any host-kit `overrides` workaround** you added in 0.4.0 for the `workspace:*` leak.
4. **Re-scaffold if you hit the 0.4.0 scaffold path bug** — generate a fresh Host with the 0.5.0 CLI rather than hand-patching the old one.
5. **Replace the five removed build-thread helpers** with `BuildTurnRoleContentMessage` and `packBuildTurnsForRoleContent`. (Required — they are gone in 0.5.0; leaving any import in place will break your build.)
6. **Run your typecheck and tests.**
   ```bash
   bun run typecheck
   bun test
   ```

If all six pass, you are on 0.5.0 with a frozen, semver-stable surface and clean `file:` consumption.

## Read next

- [Getting Started](./getting-started.md) — build your first Creation Host.
- [BuildThread](./build-thread.md) — the framework-owned semantic transcript and packing helpers.
- The prior upgrade guides, for history: [0.1.1](./upgrading-to-rc-0.1.1.md), [0.1.2](./upgrading-to-rc-0.1.2.md), [0.1.3](./upgrading-to-rc-0.1.3.md), [0.2.0](./upgrading-to-rc-0.2.0.md).
