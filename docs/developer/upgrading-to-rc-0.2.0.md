# Upgrading Downstream Hosts To pneuma-rc-0.2.0

**Audience:** downstream Creation Host projects currently using `pneuma-rc-0.1.3` or a post-RC local checkout  
**Chinese version:** [upgrading-to-rc-0.2.0.zh-CN.md](./upgrading-to-rc-0.2.0.zh-CN.md)

`pneuma-rc-0.2.0` is the first post-assurance release train. It collects the M26-M37 stabilization work into a versioned developer contract and adds a local package-consumption gate so a fresh downstream Bun/TypeScript Host can install framework packages without monorepo workspace magic.

This release does not change the four-layer product model:

```text
pneuma-framework
  -> Creation Host
  -> Generated Application
  -> Published Application
```

## 1. Update Local Package Paths

If your downstream Host references a local framework checkout, update each dependency path to the new `pneuma-rc-0.2.0` checkout or worktree:

```json
{
  "dependencies": {
    "@pneuma-framework/core": "file:/absolute/path/to/pneuma-framework-rc-0.2.0/packages/core",
    "@pneuma-framework/core-domain": "file:/absolute/path/to/pneuma-framework-rc-0.2.0/packages/core-domain",
    "@pneuma-framework/runtime": "file:/absolute/path/to/pneuma-framework-rc-0.2.0/packages/runtime",
    "@pneuma-framework/cli": "file:/absolute/path/to/pneuma-framework-rc-0.2.0/packages/cli"
  },
  "devDependencies": {
    "@types/bun": "latest"
  }
}
```

Then reinstall:

```bash
bun install
```

RC 0.2.0 package manifests no longer require downstream projects to understand `workspace:*` dependencies for the developer-facing packages. When you consume local source packages through `file:`, install `@types/bun` so TypeScript can typecheck Bun/Node APIs exposed by the source package boundary.

## 2. Use Focused Public Subpaths For Host Contracts

Do not import every Host contract from the package root. The root export remains a broad compatibility surface and may pull lifecycle, MCP, backend, or runtime-adjacent modules you do not need.

Prefer focused public subpaths:

| Need | Import from |
|---|---|
| BuildThread transcript and packing | `@pneuma-framework/core/build-thread` |
| Creation Host project/version store | `@pneuma-framework/core/creation-host` |
| `doctor-host` validators and readiness summaries | `@pneuma-framework/core/developer-experience` |
| Authoring Kit validators | `@pneuma-framework/core/host-authoring` |
| Sharing governance validators | `@pneuma-framework/core/sharing-governance` |
| Portable artifact safety | `@pneuma-framework/core/portable-artifact-safety` |
| Code Change Lane | `@pneuma-framework/core/code-change-lane` |
| Build Assurance and review packets | `@pneuma-framework/core/build-assurance` |
| Durable assurance cases | `@pneuma-framework/core/build-assurance-store` |
| Recovery drill matrix | `@pneuma-framework/core/build-assurance-recovery` |
| Release rollout state | `@pneuma-framework/core/release-rollout` |
| Release rollout file store | `@pneuma-framework/core/release-rollout-store` |
| HostExtension slots | `@pneuma-framework/core/host-extension` |
| Host sessions/cookies | `@pneuma-framework/core/host-sessions` |
| Host credential refs/rebinding helpers | `@pneuma-framework/core/host-credentials` |
| OAuth helpers and fixtures | `@pneuma-framework/core/host-oauth` |
| Runtime constants | `@pneuma-framework/runtime/constants` |
| Runtime readiness polling | `@pneuma-framework/runtime/runtime-ready` |

## 3. Adopt The Current Creation Loop Vocabulary

If your Host still treats the agent loop as plain chat plus ad hoc execution logs, migrate toward the current vocabulary:

| Need | Preferred contract |
|---|---|
| Builder conversation source of truth | [BuildThread](./build-thread.md) |
| Code agent draft -> proposal -> apply | [Code Change Lane](./code-change-lane.md) |
| Backend turn execution | `AgentBackend.runTurn` |
| Approval-time disclosure | `BuildChangeReviewPacket` |
| Post-transition state | `BuildChangeAssuranceCase` |
| Durable Host-side cases | `BuildChangeAssuranceCaseStore` |
| Failure-path tests | `BuildChangeRecoveryDrillScenario` |

The important shift is:

```text
Do not ask the Builder to approve random tool calls.
Ask the Builder to approve one coherent proposal with evidence, risk, and recovery plan.
```

## 4. Replace Provider-Named BuildThread Packing Helpers

Provider-native message shapes belong in backend adapters, not in core.

If you still use deprecated helpers such as:

```ts
pneumaTurnsToAnthropicMessages(turns)
pneumaTurnsToOpencodeMessages(turns)
```

move to the provider-neutral helper:

```ts
import { packBuildTurnsForRoleContent } from "@pneuma-framework/core/build-thread";

const messages = packBuildTurnsForRoleContent(turns, {
  capTurns: 20,
  alwaysKeepAnchor: true,
});
```

Your backend adapter can then translate role/content messages into provider-specific request payloads.

## 5. Use Shared Host Utilities Where They Remove Repeated Glue

RC 0.2.0 includes the post-RC utility surface validated by downstream pressure:

- runtime composition helpers: explicit mode, boot options, diagnostics, marker/health waiting;
- HostExtension slot validators for portable Host-owned artifacts;
- credential broker helpers for hashed sessions, OAuth state, callback binding, credential refs, and no-secret rebinding evidence;
- package-consumption smoke to protect local downstream installs.

Keep production storage, encryption, provider UI, and long-term retention in your Host.

## 6. Update Your Docs And Tests

At minimum, update your downstream README with:

- upstream commit hash or tag;
- local package paths;
- Creation Host / Generated Application / Published Application roles;
- which approval lane you use: definition, Code Change Lane, HostExtension, or Host-owned lane;
- which Build Assurance cases are expected for happy path and failure path.

Recommended verification:

```bash
bun install
bun run typecheck
bun test
```

If you are validating the upstream checkout itself, run:

```bash
bun run test:package-consumption
```

That command creates a fresh temporary downstream project, copies the developer-facing package directories into an isolated package set with no monorepo `node_modules`, installs `@pneuma-framework/core-domain`, `@pneuma-framework/core`, `@pneuma-framework/runtime`, and `@pneuma-framework/cli` by `file:` path, imports the focused public subpaths, runs `scaffold-host`, runs `doctor-host`, executes a runtime smoke, and typechecks the consumer project.

## 7. What Was Accepted Into 0.2.0

Accepted:

- Code Change Lane hardening from M26;
- runtime diagnostic/composition surface from M27;
- HostExtension slot contract from M28;
- `AgentBackend.runTurn` contract from M29;
- Host credential broker utilities from M30/M31;
- Build Change Assurance, review packets, durable cases, recovery drills, and adoption guidance from M32-M37;
- local package-consumption gate, package manifest cleanup, public Host-contract subpath exports, and downstream-safe `doctor-host` execution.

## 8. What Remains Host-Owned Or Deferred

Still Host-owned:

- code agent launch and draft workspace creation;
- approval UI and product-specific policy;
- production credential encryption and secret storage;
- provider-specific OAuth product screens;
- deployment target adapters;
- long-term audit retention;
- Runtime Agent product surface.

Deferred:

- production IAM;
- hosted compliance/audit backend;
- broad cloud deployment adapters;
- hot reload/custom code as a framework primitive;
- marketplace artifact authenticity and signed transport;
- complete Pneuma 2.x dogfood rebuild.

RC 0.2.0 is about making the current developer contract installable, testable, and understandable for the next fresh downstream validation.
