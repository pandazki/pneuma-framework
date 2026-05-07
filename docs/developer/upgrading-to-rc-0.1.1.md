# Upgrading Downstream Hosts To pneuma-rc-0.1.1

**Audience:** downstream Creation Host projects currently using `pneuma-rc-0.1.0`
**Chinese version:** [upgrading-to-rc-0.1.1.zh-CN.md](./upgrading-to-rc-0.1.1.zh-CN.md)

`pneuma-rc-0.1.1` is a developer-contract patch. It does not change the four-layer product model or require a redesign of an existing Host. The main upgrade work is to point your local dependency at the new RC checkout and optionally replace hard-coded framework conventions with exported constants/helpers.

## 1. Update The Local Framework Path

If your downstream project references the local RC checkout in `package.json`, update every `@pneuma-framework/*` path from:

```json
"file:/Users/pandazki/Codes/pneuma-framework-rc-0.1.0/packages/core"
```

to:

```json
"file:/Users/pandazki/Codes/pneuma-framework-rc-0.1.1/packages/core"
```

Use the matching package directory for each package:

```text
/Users/pandazki/Codes/pneuma-framework-rc-0.1.1/packages/core
/Users/pandazki/Codes/pneuma-framework-rc-0.1.1/packages/core-domain
/Users/pandazki/Codes/pneuma-framework-rc-0.1.1/packages/runtime
/Users/pandazki/Codes/pneuma-framework-rc-0.1.1/packages/cli
/Users/pandazki/Codes/pneuma-framework-rc-0.1.1/packages/viewer-react
```

Then reinstall:

```bash
bun install
```

## 2. Replace Runtime Magic Strings

If your Host hard-codes the runtime SQLite env var:

```ts
process.env.PNEUMA_SQLITE_PATH = sqlitePath;
```

prefer:

```ts
import { PNEUMA_SQLITE_PATH_ENV } from "@pneuma-framework/runtime";

process.env[PNEUMA_SQLITE_PATH_ENV] = sqlitePath;
```

Set it before importing any module that constructs `AppConfig`.

If your Host hard-codes the framework-internal HTTP token names:

```ts
"PNEUMA_INTERNAL_HTTP_TOKEN"
"x-pneuma-internal-token"
```

prefer:

```ts
import {
  PNEUMA_INTERNAL_HTTP_TOKEN_ENV,
  PNEUMA_INTERNAL_HTTP_TOKEN_HEADER,
} from "@pneuma-framework/runtime";
```

The token is still an internal local-process pattern, not public authentication.

## 3. Replace Handwritten Service Markers

If your runtime prints marker lines directly:

```ts
console.log(`##pneuma:service-ready api ${url}`);
console.log("##pneuma:ready");
console.log("##pneuma:stopping");
```

prefer:

```ts
import {
  printReadyMarker,
  printServiceReadyMarker,
  printStoppingMarker,
} from "@pneuma-framework/core";

printServiceReadyMarker("api", url);
printReadyMarker();
printStoppingMarker();
```

## 4. Check Authoring Manifests

If your Host writes Authoring Kit or Sharing Governance files by hand, reread:

- [Creation Host Contract](./creation-host-contract.md)
- [AppConfig Authoring](./app-config-authoring.md)
- [Runtime Composition](./runtime-composition.md)
- [Release Rollout Authoring](./release-rollout-authoring.md)

Common RC 0.1.1 shape reminders:

- `CredentialRequirement` is a full object, not an id string.
- `ShareArtifactManifest.app_id` and `SharingGovernanceManifest.app_id` are literal generated-app ids.
- `credential_rebinding_policy.requirements` is a full `CredentialRequirement[]`.
- `init_recipe.steps[].kind` is only `"semantic-operation"` in this RC.
- Sharing subjects are concrete refs such as `user:alice`, `role:maintainer`, `org:acme`, or `team:platform`; wildcard install is Host-owned distribution policy for now.

## 5. Run Downstream Verification

Recommended minimum:

```bash
bun install
bun run typecheck
bun test
```

If your project has a Host doctor command, run it against the same files you will ship:

```bash
bun /Users/pandazki/Codes/pneuma-framework-rc-0.1.1/packages/cli/src/index.ts doctor-host \
  --workspace <your-host-workspace> \
  --profiles <profiles.json> \
  --agent-package <agent-package.json> \
  --provider-capabilities <provider-capabilities.json> \
  --share-artifact <share-artifact.json> \
  --sharing-governance <sharing-governance.json> \
  --credential-rebinding <credential-rebinding.json>
```

Docker-backed smoke tests can still be run separately, but treat Docker credential-helper stalls as environment issues rather than RC 0.1.1 migration failures.

## 6. Expected Impact

Expected:

- fewer hard-coded framework strings in Host runtime code;
- clearer manifest validation failures;
- fewer trips into framework source to discover AppConfig, runtime, or rollout shapes.

Not expected:

- no required data migration;
- no required app-definition rewrite;
- no required change to the four-layer model;
- no new production OAuth/session/security primitive in this patch.
