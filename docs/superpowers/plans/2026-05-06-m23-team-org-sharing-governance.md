# M23 Team / Org Sharing Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the first test-backed sharing governance contracts so a Creation Host can declare ownership, lineage, rights, revocation, and credential rebinding evidence for shared/forked Generated Applications.

**Architecture:** Add a pure `packages/core/src/sharing-governance.ts` contract module and export it from `@pneuma-framework/core`. Extend Host authoring diagnostics and `doctor-host` after the core contract is green. Keep the contract Host-owned and manifest-first: no real OAuth, no enterprise identity provider, no marketplace, no credential broker, and no generated-app runtime policy mutation.

**Tech Stack:** Bun test, TypeScript, existing `@pneuma-framework/core` package exports, existing CLI scaffold/doctor patterns.

---

### Task 1: Core Sharing Governance Contract

**Files:**
- Create: `packages/core/src/sharing-governance.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/sharing-governance.test.ts`

- [x] **Step 1: Write the failing core tests**

Create `packages/core/test/sharing-governance.test.ts` with tests for manifest validation, credential evidence validation, and pure decision evaluation:

```ts
import { describe, expect, test } from "bun:test";
import {
  evaluateSharingGovernance,
  validateCredentialRebindingEvidence,
  validateSharingGovernanceManifest,
  type CredentialRebindingEvidence,
  type SharingGovernanceManifest,
} from "../src/index.js";

describe("Sharing governance contracts", () => {
  const governance: SharingGovernanceManifest = {
    schema_version: 1,
    governance_id: "dev-board-sharing",
    artifact_id: "dev-board-share",
    app_id: "dev-board",
    version_id: "v3",
    owner: "user:bob",
    maintainers: ["user:bob"],
    operators: ["user:bob"],
    lineage: {
      source_artifact_id: "dev-board-share",
      source_app_id: "dev-board",
      source_version_id: "v3",
    },
    rights: [
      {
        id: "charlie-install",
        subject: "user:charlie",
        actions: ["install"],
        scope: "artifact",
      },
      {
        id: "dave-fork",
        subject: "user:dave",
        actions: ["install", "fork"],
        scope: "forks",
      },
      {
        id: "maintainer-operate",
        subject: "role:maintainer",
        actions: ["share", "approve", "publish", "rollback", "revoke"],
        scope: "published-app",
      },
    ],
    credential_rebinding_policy: {
      required: true,
      requirements: [
        {
          id: "github-user-token",
          provider_id: "github",
          scopes: ["repo"],
          binding_mode: "per-user",
          placement: "host-broker",
          required: true,
        },
        {
          id: "linear-user-token",
          provider_id: "linear",
          scopes: ["read"],
          binding_mode: "per-user",
          placement: "host-broker",
          required: true,
        },
      ],
    },
    revocation: {
      revoked: false,
    },
  };

  const charlieEvidence: CredentialRebindingEvidence = {
    schema_version: 1,
    evidence_id: "charlie-dev-board-bindings",
    artifact_id: "dev-board-share",
    app_id: "dev-board",
    subject: "user:charlie",
    bindings: [
      {
        requirement_id: "github-user-token",
        provider_id: "github",
        status: "bound",
        bound_at: "2026-05-06T00:00:00.000Z",
        credential_ref: "credref:charlie-github",
      },
      {
        requirement_id: "linear-user-token",
        provider_id: "linear",
        status: "bound",
        bound_at: "2026-05-06T00:00:00.000Z",
        credential_ref: "credref:charlie-linear",
      },
    ],
  };

  test("accepts a valid sharing governance manifest", () => {
    expect(validateSharingGovernanceManifest(governance)).toMatchObject({
      ok: true,
      issues: [],
    });
  });

  test("rejects missing owner and invalid subject references", () => {
    const result = validateSharingGovernanceManifest({
      ...governance,
      owner: "",
      maintainers: ["bob"],
      rights: [
        {
          id: "bad-action",
          subject: "user:charlie",
          actions: ["download"],
          scope: "artifact",
        },
      ],
    } as unknown as SharingGovernanceManifest);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "sharing_governance.owner.invalid",
      "sharing_governance.maintainer.subject.invalid",
      "sharing_governance.right.action.invalid",
    ]);
  });

  test("owner can revoke without credential rebinding evidence", () => {
    expect(evaluateSharingGovernance(governance, {
      action: "revoke",
      subject: "user:bob",
    })).toMatchObject({
      allowed: true,
      reason_code: "owner",
      missing_credential_requirement_ids: [],
    });
  });

  test("explicit grant with complete credential evidence allows install", () => {
    expect(evaluateSharingGovernance(governance, {
      action: "install",
      subject: "user:charlie",
      credential_rebinding_evidence: charlieEvidence,
    })).toMatchObject({
      allowed: true,
      reason_code: "explicit-grant",
      matched_grants: ["charlie-install"],
      missing_credential_requirement_ids: [],
    });
  });

  test("missing credential rebinding denies install even with an explicit grant", () => {
    expect(evaluateSharingGovernance(governance, {
      action: "install",
      subject: "user:charlie",
    })).toMatchObject({
      allowed: false,
      reason_code: "missing-credential-rebinding",
      matched_grants: ["charlie-install"],
      missing_credential_requirement_ids: ["github-user-token", "linear-user-token"],
    });
  });

  test("missing grant denies publish", () => {
    expect(evaluateSharingGovernance(governance, {
      action: "publish",
      subject: "user:charlie",
      credential_rebinding_evidence: charlieEvidence,
    })).toMatchObject({
      allowed: false,
      reason_code: "missing-grant",
      matched_grants: [],
    });
  });

  test("revoked manifest denies all actions", () => {
    expect(evaluateSharingGovernance({
      ...governance,
      revocation: {
        revoked: true,
        reason: "Security review failed.",
        revoked_by: "user:bob",
        revoked_at: "2026-05-06T00:00:00.000Z",
      },
    }, {
      action: "install",
      subject: "user:charlie",
      credential_rebinding_evidence: charlieEvidence,
    })).toMatchObject({
      allowed: false,
      reason_code: "revoked",
    });
  });

  test("validates credential rebinding evidence without exposing secrets", () => {
    expect(validateCredentialRebindingEvidence(charlieEvidence, governance)).toMatchObject({
      ok: true,
      issues: [],
    });
  });

  test("rejects credential evidence with secret-like material or unknown requirements", () => {
    const result = validateCredentialRebindingEvidence({
      ...charlieEvidence,
      bindings: [
        {
          requirement_id: "missing-token",
          provider_id: "github",
          status: "bound",
          credential_ref: "credref:unknown",
          access_token: "ghp_should-not-live-here",
        },
      ],
    } as unknown as CredentialRebindingEvidence, governance);

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toEqual([
      "credential_rebinding.binding.requirement_unknown",
      "credential_rebinding.secret_material.forbidden",
    ]);
  });
});
```

- [x] **Step 2: Run the test to verify RED**

Run:

```bash
bun test packages/core/test/sharing-governance.test.ts
```

Expected: fail because `evaluateSharingGovernance`, `validateCredentialRebindingEvidence`, `validateSharingGovernanceManifest`, and related types are not exported.

- [x] **Step 3: Implement the minimal core contract**

Create `packages/core/src/sharing-governance.ts` with these exported types and functions:

```ts
import type { CredentialRequirement } from "./host-authoring.js";

export type SharingSubjectKind = "user" | "role" | "org" | "team";
export type SharingSubjectRef = `${SharingSubjectKind}:${string}`;
export type SharingAction =
  | "share"
  | "fork"
  | "install"
  | "approve"
  | "publish"
  | "rollback"
  | "revoke";
export type SharingScope = "artifact" | "forks" | "published-app";

export interface SharingGovernanceIssue {
  readonly severity: "error" | "warning";
  readonly code: string;
  readonly message: string;
  readonly path?: string;
}

export interface SharingGovernanceCheck<T> {
  readonly ok: boolean;
  readonly subject: T;
  readonly issues: readonly SharingGovernanceIssue[];
}

export interface SharingRightGrant {
  readonly id: string;
  readonly subject: SharingSubjectRef;
  readonly actions: readonly SharingAction[];
  readonly scope: SharingScope;
}

export interface SharingGovernanceManifest {
  readonly schema_version: 1;
  readonly governance_id: string;
  readonly artifact_id: string;
  readonly app_id: string;
  readonly version_id: string;
  readonly owner: SharingSubjectRef;
  readonly maintainers: readonly SharingSubjectRef[];
  readonly operators: readonly SharingSubjectRef[];
  readonly lineage: {
    readonly source_artifact_id?: string;
    readonly source_app_id?: string;
    readonly source_version_id?: string;
    readonly forked_from_governance_id?: string;
  };
  readonly rights: readonly SharingRightGrant[];
  readonly credential_rebinding_policy: {
    readonly required: true;
    readonly requirements: readonly CredentialRequirement[];
  };
  readonly revocation: {
    readonly revoked: boolean;
    readonly reason?: string;
    readonly revoked_by?: SharingSubjectRef;
    readonly revoked_at?: string;
  };
}

export interface CredentialRebindingEvidence {
  readonly schema_version: 1;
  readonly evidence_id: string;
  readonly artifact_id: string;
  readonly app_id: string;
  readonly subject: SharingSubjectRef;
  readonly bindings: readonly {
    readonly requirement_id: string;
    readonly provider_id: string;
    readonly status: "bound" | "missing" | "revoked";
    readonly bound_at?: string;
    readonly credential_ref?: string;
  }[];
}

export interface SharingGovernanceRequest {
  readonly action: SharingAction;
  readonly subject: SharingSubjectRef;
  readonly credential_rebinding_evidence?: CredentialRebindingEvidence;
}

export interface SharingGovernanceDecision {
  readonly allowed: boolean;
  readonly action: SharingAction;
  readonly subject: SharingSubjectRef;
  readonly reason_code:
    | "explicit-grant"
    | "owner"
    | "maintainer"
    | "operator"
    | "revoked"
    | "missing-grant"
    | "missing-credential-rebinding";
  readonly matched_grants: readonly string[];
  readonly missing_credential_requirement_ids: readonly string[];
}
```

Implement:

```ts
export function validateSharingGovernanceManifest(
  manifest: SharingGovernanceManifest,
): SharingGovernanceCheck<SharingGovernanceManifest> { /* pure validation */ }

export function validateCredentialRebindingEvidence(
  evidence: CredentialRebindingEvidence,
  manifest: SharingGovernanceManifest,
): SharingGovernanceCheck<CredentialRebindingEvidence> { /* pure validation */ }

export function evaluateSharingGovernance(
  manifest: SharingGovernanceManifest,
  request: SharingGovernanceRequest,
): SharingGovernanceDecision { /* pure decision helper */ }
```

Implementation rules:

- subject refs must match `^(user|role|org|team):[a-zA-Z0-9][a-zA-Z0-9._/@-]{0,126}$`;
- ids must be kebab-case using the same pattern as M22 (`/^[a-z][a-z0-9-]{1,62}$/`);
- allowed actions are the seven `SharingAction` values;
- revoked manifests deny every action with `reason_code: "revoked"`;
- owner allows every action with `reason_code: "owner"`;
- maintainers allow `share`, `approve`, `publish`, `rollback`, `revoke`;
- operators allow `publish` and `rollback`;
- explicit grants allow their listed actions;
- `install`, `fork`, and `publish` require all required credential requirements to have matching `bound` evidence for the same artifact/app/subject;
- secret-like keys are rejected anywhere in credential evidence.

Modify `packages/core/src/index.ts`:

```ts
export {
  evaluateSharingGovernance,
  validateCredentialRebindingEvidence,
  validateSharingGovernanceManifest,
} from "./sharing-governance.js";
export type {
  CredentialRebindingEvidence,
  SharingAction,
  SharingGovernanceCheck,
  SharingGovernanceDecision,
  SharingGovernanceIssue,
  SharingGovernanceManifest,
  SharingGovernanceRequest,
  SharingRightGrant,
  SharingScope,
  SharingSubjectKind,
  SharingSubjectRef,
} from "./sharing-governance.js";
```

- [x] **Step 4: Run core tests to verify GREEN**

Run:

```bash
bun test packages/core/test/sharing-governance.test.ts
```

Expected: all sharing-governance tests pass.

- [x] **Step 5: Commit Task 1**

```bash
git add packages/core/src/sharing-governance.ts packages/core/src/index.ts packages/core/test/sharing-governance.test.ts
git commit -m "feat: add sharing governance contracts"
```

### Task 2: Developer Diagnostics Integration

**Files:**
- Modify: `packages/core/src/developer-experience.ts`
- Test: `packages/core/test/developer-experience.test.ts`

- [x] **Step 1: Write failing diagnostics tests**

Extend `packages/core/test/developer-experience.test.ts` imports:

```ts
import type {
  CredentialRebindingEvidence,
  SharingGovernanceManifest,
} from "../src/index.js";
```

Add valid fixtures after `validShareArtifact`:

```ts
const validSharingGovernance: SharingGovernanceManifest = {
  schema_version: 1,
  governance_id: "starter-sharing",
  artifact_id: "starter-share",
  app_id: "starter-app",
  version_id: "v0",
  owner: "user:alice",
  maintainers: ["user:alice"],
  operators: ["user:alice"],
  lineage: {},
  rights: [
    {
      id: "builder-install",
      subject: "user:bob",
      actions: ["install", "fork"],
      scope: "artifact",
    },
  ],
  credential_rebinding_policy: {
    required: true,
    requirements: validShareArtifact.credential_requirements,
  },
  revocation: {
    revoked: false,
  },
};

const validCredentialRebindingEvidence: CredentialRebindingEvidence = {
  schema_version: 1,
  evidence_id: "bob-starter-bindings",
  artifact_id: "starter-share",
  app_id: "starter-app",
  subject: "user:bob",
  bindings: [
    {
      requirement_id: "github-user-token",
      provider_id: "github",
      status: "bound",
      bound_at: "2026-05-06T00:00:00.000Z",
      credential_ref: "credref:bob-github",
    },
  ],
};
```

Add tests:

```ts
test("diagnoses valid sharing governance files", () => {
  const report = diagnoseCreationHostAuthoring({
    agent_package: validAgentPackage,
    provider_capabilities: validProviderMatrix,
    share_artifact: validShareArtifact,
    sharing_governance: validSharingGovernance,
    credential_rebinding_evidence: validCredentialRebindingEvidence,
  });

  expect(report.ok).toBe(true);
  expect(report.summary).toMatchObject({
    sharing_governance_checked: true,
    credential_rebinding_checked: true,
  });
  expect(report.authoring_checks.map((check) => [check.kind, check.ok])).toContainEqual([
    "sharing_governance",
    true,
  ]);
  expect(report.authoring_checks.map((check) => [check.kind, check.ok])).toContainEqual([
    "credential_rebinding",
    true,
  ]);
  expect(formatCreationHostAuthoringDiagnosticsReport(report)).toContain(
    "authoring sharing_governance: ok",
  );
});

test("diagnoses invalid sharing governance files", () => {
  const report = diagnoseCreationHostAuthoring({
    sharing_governance: {
      ...validSharingGovernance,
      owner: "",
    },
    credential_rebinding_evidence: {
      ...validCredentialRebindingEvidence,
      bindings: [
        {
          requirement_id: "missing-token",
          provider_id: "github",
          status: "bound",
          credential_ref: "credref:missing",
          access_token: "ghp_should-not-live-here",
        },
      ],
    } as unknown as CredentialRebindingEvidence,
  });

  expect(report.ok).toBe(false);
  expect(report.authoring_checks.flatMap((check) => check.issues.map((issue) => issue.code))).toEqual([
    "sharing_governance.owner.invalid",
    "credential_rebinding.binding.requirement_unknown",
    "credential_rebinding.secret_material.forbidden",
  ]);
});
```

- [x] **Step 2: Run diagnostics test to verify RED**

Run:

```bash
bun test packages/core/test/developer-experience.test.ts
```

Expected: fail because `DiagnoseCreationHostAuthoringOptions` does not accept `sharing_governance` or `credential_rebinding_evidence`.

- [x] **Step 3: Implement diagnostics integration**

Modify `packages/core/src/developer-experience.ts`:

- import `validateSharingGovernanceManifest`, `validateCredentialRebindingEvidence`, and their types;
- extend `CreationHostAuthoringCheckKind` with `"sharing_governance"` and `"credential_rebinding"`;
- extend `CreationHostAuthoringDiagnostics.summary` with `sharing_governance_checked` and `credential_rebinding_checked`;
- extend `DiagnoseCreationHostAuthoringOptions` with optional `sharing_governance` and `credential_rebinding_evidence`;
- in `diagnoseCreationHostAuthoring`, push checks for the two new files when provided;
- validate credential rebinding evidence against the provided sharing governance manifest when both are provided;
- update `formatCreationHostAuthoringDiagnosticsReport` to print the new summary booleans.

- [x] **Step 4: Run diagnostics tests to verify GREEN**

Run:

```bash
bun test packages/core/test/developer-experience.test.ts
```

Expected: all developer-experience tests pass.

- [x] **Step 5: Commit Task 2**

```bash
git add packages/core/src/developer-experience.ts packages/core/test/developer-experience.test.ts
git commit -m "feat: diagnose sharing governance files"
```

### Task 3: CLI And Scaffold Integration

**Files:**
- Modify: `packages/cli/src/parse-args.ts`
- Modify: `packages/cli/src/index.ts`
- Test: `packages/cli/test/developer-experience.test.ts`

- [x] **Step 1: Write failing CLI tests**

Extend `packages/cli/test/developer-experience.test.ts` imports:

```ts
import {
  validateCredentialRebindingEvidence,
  validateSharingGovernanceManifest,
  type CredentialRebindingEvidence,
  type SharingGovernanceManifest,
} from "@pneuma-framework/core";
```

Extend `parseArgs supports doctor-host with workspace and profiles file` expected object with:

```ts
sharingGovernance: "/tmp/sharing-governance.example.json",
credentialRebinding: "/tmp/credential-rebinding.example.json",
```

and include these flags in the parsed args:

```ts
"--sharing-governance",
"/tmp/sharing-governance.example.json",
"--credential-rebinding",
"/tmp/credential-rebinding.example.json",
```

In `scaffold-host writes a starter Creation Host project`, assert files exist and validate:

```ts
expect(existsSync(join(target, "sharing-governance.example.json"))).toBe(true);
expect(existsSync(join(target, "credential-rebinding.example.json"))).toBe(true);

const sharingGovernance = JSON.parse(
  readFileSync(join(target, "sharing-governance.example.json"), "utf8"),
) as SharingGovernanceManifest;
const credentialRebinding = JSON.parse(
  readFileSync(join(target, "credential-rebinding.example.json"), "utf8"),
) as CredentialRebindingEvidence;
expect(validateSharingGovernanceManifest(sharingGovernance).ok).toBe(true);
expect(validateCredentialRebindingEvidence(credentialRebinding, sharingGovernance).ok).toBe(true);
```

Extend `doctor-host validates authoring files when provided` with the two new flags and expected output:

```ts
"--sharing-governance",
join(target, "sharing-governance.example.json"),
"--credential-rebinding",
join(target, "credential-rebinding.example.json"),
```

```ts
expect(result.stdout).toContain("authoring sharing_governance: ok");
expect(result.stdout).toContain("authoring credential_rebinding: ok");
```

Add an unsafe sharing test:

```ts
test("doctor-host returns non-zero when sharing governance files are unsafe", async () => {
  const root = mkdtempSync(join(tmpdir(), "pneuma-cli-doctor-sharing-invalid-"));
  const target = join(root, "my-host");
  try {
    const scaffold = await runCli(["scaffold-host", target, "--name", "My Host"]);
    expect(scaffold.code).toBe(0);
    const evidencePath = join(target, "credential-rebinding.example.json");
    const evidence = JSON.parse(readFileSync(evidencePath, "utf8")) as CredentialRebindingEvidence;
    writeFileSync(evidencePath, JSON.stringify({
      ...evidence,
      bindings: [
        {
          requirement_id: "missing-token",
          provider_id: "github",
          status: "bound",
          credential_ref: "credref:missing",
          access_token: "ghp_should-not-live-here",
        },
      ],
    }));

    const result = await runCli([
      "doctor-host",
      "--workspace",
      join(target, ".pneuma-workspace"),
      "--profiles",
      join(target, "profiles.json"),
      "--sharing-governance",
      join(target, "sharing-governance.example.json"),
      "--credential-rebinding",
      evidencePath,
    ]);

    expect(result.code).toBe(1);
    expect(result.stdout).toContain("Creation Host authoring diagnostics: failed");
    expect(result.stdout).toContain("credential_rebinding.secret_material.forbidden");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
```

- [x] **Step 2: Run CLI tests to verify RED**

Run:

```bash
bun test packages/cli/test/developer-experience.test.ts
```

Expected: fail because parse args and scaffold do not support sharing governance files.

- [x] **Step 3: Implement parse/scaffold/doctor support**

Modify `packages/cli/src/parse-args.ts`:

- add optional fields `sharingGovernance?: string` and `credentialRebinding?: string`;
- parse `--sharing-governance <path>`;
- parse `--credential-rebinding <path>`.

Modify `packages/cli/src/index.ts`:

- import `SharingGovernanceManifest` and `CredentialRebindingEvidence`;
- pass resolved paths into `doctorHost`;
- extend `DoctorHostInput`;
- read the optional JSON files into `diagnoseCreationHostAuthoring`;
- scaffold `sharing-governance.example.json` and `credential-rebinding.example.json`;
- add starter helper functions:

```ts
function starterSharingGovernance(): SharingGovernanceManifest { /* valid Bob/Charlie/Dave-style sample */ }
function starterCredentialRebinding(): CredentialRebindingEvidence { /* valid no-secret sample */ }
```

The starter governance should align with the existing starter share artifact:

```text
artifact_id: starter-share
app_id: starter-app
version_id: v0
owner: user:builder
rights:
  user:builder -> install, fork, share, approve, publish, rollback, revoke
credential requirements: same as starterShareArtifact().credential_requirements
```

- [x] **Step 4: Run CLI tests to verify GREEN**

Run:

```bash
bun test packages/cli/test/developer-experience.test.ts packages/cli/test/parse-args.test.ts
```

Expected: all CLI developer-experience and parse-args tests pass.

- [x] **Step 5: Commit Task 3**

```bash
git add packages/cli/src/parse-args.ts packages/cli/src/index.ts packages/cli/test/developer-experience.test.ts
git commit -m "feat: wire sharing governance doctor"
```

### Task 4: Documentation, Snapshot, And Full Verification

**Files:**
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `CLAUDE.md`
- Modify: `docs/developer/creation-host-contract.md`
- Modify: `docs/developer/creation-host-contract.zh-CN.md`
- Modify: `docs/architecture/OPEN-QUESTIONS.md`
- Modify: `docs/architecture/README.md`
- Modify: `docs/architecture/roadmap.md`
- Create: `docs/architecture/milestone-23-snapshot.md`
- Create: `docs/architecture/milestone-23-snapshot.zh-CN.md`

- [x] **Step 1: Update developer docs**

Add a "Sharing Governance Contract" section after the M22 Authoring Kit section in both developer guides. It must explain:

- `sharing-governance.example.json` records ownership, lineage, rights, and revocation;
- `credential-rebinding.example.json` records no-secret credential binding evidence;
- sharing governance is Host-level lifecycle governance, not generated-app runtime policy;
- `doctor-host` can validate the files when provided.

- [x] **Step 2: Update architecture docs**

Update:

- `README.md`: current status becomes post-M23 after implementation;
- `AGENTS.md` and `CLAUDE.md`: M23 closed and next recommended pressure becomes RC review or candidate release decision;
- `docs/architecture/OPEN-QUESTIONS.md`: remove M23 contract questions that are settled, leave signing/identity provider/org UI/credential broker as later questions;
- `docs/architecture/README.md`: add M23 snapshot links;
- `docs/architecture/roadmap.md`: mark M23 closed and RC decision as next.

- [x] **Step 3: Write bilingual M23 snapshot**

Create:

```text
docs/architecture/milestone-23-snapshot.md
docs/architecture/milestone-23-snapshot.zh-CN.md
```

Each snapshot must include:

- why M23 exists after M22;
- what changed in core/doctor/scaffold;
- Bob/Charlie/Dave walkthrough after M23;
- what M23 proves;
- what M23 does not prove;
- verification evidence from the commands in Step 4.

- [x] **Step 4: Run full verification**

Run:

```bash
bun test packages/core/test/sharing-governance.test.ts
bun test packages/core/test/developer-experience.test.ts packages/cli/test/developer-experience.test.ts
bun test packages/core-domain packages/core packages/cli
bun run typecheck
git diff --check
```

Also run the local markdown link checker used in M22:

```bash
node <<'NODE'
const fs = require('fs');
const path = require('path');
const root = process.cwd();
const roots = ['README.md', 'AGENTS.md', 'CLAUDE.md', 'docs'];
const skipDirs = new Set(['node_modules', 'dist', 'build']);
function walk(p, out = []) {
  const full = path.resolve(root, p);
  if (!fs.existsSync(full)) return out;
  const stat = fs.statSync(full);
  if (stat.isDirectory()) {
    for (const ent of fs.readdirSync(full, { withFileTypes: true })) {
      if (skipDirs.has(ent.name)) continue;
      walk(path.relative(root, path.join(full, ent.name)), out);
    }
  } else if (stat.isFile() && full.endsWith('.md')) out.push(full);
  return out;
}
const files = roots.flatMap((r) => walk(r));
const missing = [];
const linkRe = /(!?\[[^\]]*\]\(([^)]+)\))/g;
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  let m;
  while ((m = linkRe.exec(text))) {
    let raw = m[2].trim();
    if (!raw || raw.startsWith('#')) continue;
    if (/^(https?:|mailto:|file:|data:)/.test(raw)) continue;
    raw = raw.replace(/^<|>$/g, '');
    const target = raw.split('#')[0];
    if (!target || target.includes('*') || target.includes('<')) continue;
    const resolved = path.resolve(path.dirname(file), decodeURIComponent(target));
    if (!fs.existsSync(resolved)) missing.push(`${path.relative(root, file)} -> ${raw}`);
  }
}
if (missing.length) {
  console.error(`missing markdown links (${missing.length}):`);
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}
console.log(`checked ${files.length} markdown files`);
NODE
```

- [x] **Step 5: Commit Task 4**

```bash
git add README.md AGENTS.md CLAUDE.md docs/developer/creation-host-contract.md docs/developer/creation-host-contract.zh-CN.md docs/architecture/OPEN-QUESTIONS.md docs/architecture/README.md docs/architecture/roadmap.md docs/architecture/milestone-23-snapshot.md docs/architecture/milestone-23-snapshot.zh-CN.md
git commit -m "docs: close m23 sharing governance snapshot"
```
