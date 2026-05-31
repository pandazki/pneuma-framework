# M2.5 Explicit Policy Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit deny semantics, deny precedence, and governed default-posture mutation to the M2 policy model.

**Architecture:** `PolicySet` owns rule/default-posture invariants. `PolicyEvaluator` owns deny precedence. Runtime persists rule effects in `pneuma_policy_rules` and app-level posture in a new `pneuma_policy_settings` system-owned Table. Core `definition.apply` routes both rule-effect and default-posture changes through `policy:mutate` authorization.

**Tech Stack:** Bun tests, TypeScript, `@pneuma-framework/core-domain`, `@pneuma-framework/runtime`, `@pneuma-framework/core`.

---

### Task 1: Domain Semantics

**Files:**
- Modify: `packages/core-domain/src/aggregates/policy-set.ts`
- Modify: `packages/core-domain/src/services/policy-evaluator.ts`
- Test: `packages/core-domain/test/aggregates/policy-set.test.ts`
- Test: `packages/core-domain/test/services/policy-evaluator.test.ts`

- [x] **Step 1: Write failing aggregate tests**

Add tests proving:

```ts
test("PolicyRule effect defaults to allow and accepts deny", () => {
  const p = new PolicySet({ app_id: "app" });
  p.addRule(rule({ id: "deny-contractors", effect: "deny" }));
  expect(p.rules[0]?.effect).toBe("deny");
  p.addRule(rule({ id: "allow-reviewers" }));
  expect(p.rules[1]?.effect ?? "allow").toBe("allow");
});

test("PolicyRule rejects invalid effect", () => {
  expect(() =>
    new PolicySet({
      app_id: "app",
      rules: [rule({ id: "bad", effect: "block" as never })],
    })
  ).toThrow(PolicySetInvariantViolation);
});
```

- [x] **Step 2: Run aggregate tests and verify RED**

Run:

```bash
bun test packages/core-domain/test/aggregates/policy-set.test.ts
```

Expected: fail because `PolicyRule` has no `effect` support or validation.

- [x] **Step 3: Implement `PolicyEffect`**

Add:

```ts
export type PolicyEffect = "allow" | "deny";
```

Then add optional `effect?: PolicyEffect` to `PolicyRule` and `PolicyRuleUpdate`, validate it in `assertPolicyRule`, and preserve/update it in `updateRule`.

- [x] **Step 4: Write failing evaluator tests**

Add tests proving:

```ts
test("explicit deny wins over explicit allow independent of rule order", () => {
  const policy = new PolicySet({
    app_id: "app",
    default_posture: { app: "restricted" },
    rules: [
      rule({ id: "allow-reviewers", allow: [Subjects.role("reviewer")], do: ["read"], on: Resources.view("review_queue") }),
      rule({ id: "deny-contractors", effect: "deny", allow: [Subjects.role("contractor")], do: ["read"], on: Resources.view("review_queue") }),
    ],
  });
  const evaluator = new PolicyEvaluator(policy.compile());
  const decision = evaluator.check("read", Resources.view("review_queue"), ctxForRoles(["reviewer", "contractor"]));
  expect(decision).toEqual({
    decision: "deny",
    reason: "explicit-deny",
    matched_rule_ids: ["deny-contractors"],
  });
});
```

- [x] **Step 5: Run evaluator tests and verify RED**

Run:

```bash
bun test packages/core-domain/test/services/policy-evaluator.test.ts
```

Expected: fail because current evaluator treats all matching rules as allow.

- [x] **Step 6: Implement deny precedence**

Update `PolicyEvaluator.check()` to collect deny and allow matches separately. Return `explicit-deny` first when any deny rule matches; otherwise return `explicit-allow`; otherwise keep default posture logic.

- [x] **Step 7: Verify GREEN**

Run:

```bash
bun test packages/core-domain/test/aggregates/policy-set.test.ts packages/core-domain/test/services/policy-evaluator.test.ts
```

Expected: all tests pass.

### Task 2: Policy Projection Rows

**Files:**
- Modify: `packages/core-domain/src/lifecycle/pneuma-policy-rules.ts`
- Create: `packages/core-domain/src/lifecycle/pneuma-policy-settings.ts`
- Modify: `packages/core-domain/src/index.ts`
- Test: `packages/core-domain/test/lifecycle/pneuma-policy-rules.test.ts`
- Test: `packages/core-domain/test/lifecycle/pneuma-policy-settings.test.ts`

- [x] **Step 1: Write failing policy-rule projection tests**

Add tests proving `effect` round-trips and legacy rows default to allow:

```ts
expect(pneumaPolicyRuleEntryToRow({ ...entry(), effect: "deny" }).getCell("effect")).toBe("deny");
expect(policyRuleFromPneumaPolicyRuleEntry(rowToPneumaPolicyRuleEntry(legacyRow)).effect ?? "allow").toBe("allow");
```

- [x] **Step 2: Run projection test and verify RED**

Run:

```bash
bun test packages/core-domain/test/lifecycle/pneuma-policy-rules.test.ts
```

Expected: fail because `effect` is not encoded.

- [x] **Step 3: Implement policy-rule effect projection**

Add `effect` column to `createPneumaPolicyRulesTable`, add `effect?: PolicyEffect` to `PneumaPolicyRuleEntry`, encode `effect ?? "allow"` to rows, decode missing/undefined effect as `"allow"`, and reject unknown effect.

- [x] **Step 4: Write failing policy-settings tests**

Create tests for:

```ts
createPneumaPolicySettingsTable("app")
pneumaPolicySettingEntryToRow(entry)
rowToPneumaPolicySettingEntry(row)
policyDefaultPostureFromSettingEntry(entry)
```

Expected row shape:

```ts
{
  setting_id: "default_posture",
  value: { app: "restricted" },
  created_by: "agent:x",
  created_by_kind: "agent",
  definition_version: 1
}
```

- [x] **Step 5: Implement policy-settings projection**

Create `pneuma-policy-settings.ts` with:

```ts
export const PNEUMA_POLICY_SETTINGS_TABLE_ID = "pneuma_policy_settings";
export type PolicySettingId = "default_posture";
export interface PneumaPolicySettingEntry {
  readonly id: string;
  readonly app_id: string;
  readonly setting_id: PolicySettingId;
  readonly value: { readonly app: "public" | "restricted" };
  readonly created_by: string;
  readonly created_by_kind: ActorKind;
  readonly definition_version: number;
}
```

Use `PolicySet.setDefaultPosture()` once for validation.

- [x] **Step 6: Verify GREEN**

Run:

```bash
bun test packages/core-domain/test/lifecycle/pneuma-policy-rules.test.ts packages/core-domain/test/lifecycle/pneuma-policy-settings.test.ts
```

Expected: all tests pass.

### Task 3: Runtime Injection, Loader, and HTTP Introspection

**Files:**
- Modify: `packages/runtime/src/framework-operations.ts`
- Modify: `packages/runtime/src/definition-loader.ts`
- Modify: `packages/runtime/src/http.ts`
- Modify: `packages/runtime/src/runtime.ts`
- Test: `packages/runtime/test/framework-operations.test.ts`
- Test: `packages/runtime/test/api-config.test.ts`
- Test: `packages/runtime/test/runtime.test.ts`

- [x] **Step 1: Write failing runtime tests**

Add tests proving:

```ts
createPneumaPolicySettingsTable is injected
set_default_posture appears in runtime operations
add_policy_rule persists effect: deny
update_policy_rule can change effect
policy.explain returns explicit-deny
set_default_posture persists a setting row and affects policy after restart
/api/config includes policy_rules[].effect and policy_default_posture
```

- [x] **Step 2: Run runtime tests and verify RED**

Run:

```bash
bun test packages/runtime/test/framework-operations.test.ts packages/runtime/test/api-config.test.ts packages/runtime/test/runtime.test.ts
```

Expected: fail because runtime does not inject settings table or operation.

- [x] **Step 3: Implement runtime support**

Add:

```ts
SET_DEFAULT_POSTURE_OP_ID = "set_default_posture"
SET_DEFAULT_POSTURE_HANDLER_REF = "framework://set_default_posture"
```

Inject `pneuma_policy_settings`, operation, handler, and framework allow rule. Loader should apply latest `default_posture` setting before policy explanations are used. HTTP config should expose `policy_default_posture` and `effect`.

- [x] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/runtime/test/framework-operations.test.ts packages/runtime/test/api-config.test.ts packages/runtime/test/runtime.test.ts
```

Expected: all tests pass.

### Task 4: Core definition.apply and Authorization Metadata

**Files:**
- Modify: `packages/runtime/src/definition-apply.ts`
- Modify: `packages/runtime/src/index.ts`
- Modify: `packages/core/src/lifecycle.ts`
- Modify: `packages/core/src/tools/action.ts`
- Modify: `packages/core/src/definition-authorization-metadata.ts`
- Test: `packages/runtime/test/definition-apply.test.ts`
- Test: `packages/core/test/tools/definition-apply.test.ts`
- Test: `packages/core/test/tools/definition-authorization.test.ts`

- [x] **Step 1: Write failing definition.apply tests**

Add tests proving:

```ts
definition.apply add_policy_rule with effect: deny exposes explicit deny after restart
definition.apply update_policy_rule can change effect
definition.apply set_default_posture changes policy_default_posture
definition.apply validate mode predicts default posture diff without POST/restart
authorization metadata for set_default_posture is capability policy:mutate and target policy_setting:default_posture
```

- [x] **Step 2: Run core/runtime definition tests and verify RED**

Run:

```bash
bun test packages/runtime/test/definition-apply.test.ts packages/core/test/tools/definition-apply.test.ts packages/core/test/tools/definition-authorization.test.ts
```

Expected: fail because change parsing and diffing do not understand `set_default_posture` or `effect`.

- [x] **Step 3: Implement definition.apply support**

Add `effect` to add/update policy-rule inputs and diffs. Add a new change kind:

```ts
{ kind: "set_default_posture"; app: "public" | "restricted" }
```

Map it to `set_default_posture`, predict after config, compute diffs, validate shape, parse in action tool, and authorize as `policy:mutate`.

- [x] **Step 4: Verify GREEN**

Run:

```bash
bun test packages/runtime/test/definition-apply.test.ts packages/core/test/tools/definition-apply.test.ts packages/core/test/tools/definition-authorization.test.ts
```

Expected: all tests pass.

### Task 5: Rollback and Milestone Paperwork

**Files:**
- Modify: `packages/runtime/src/framework-operations.ts`
- Test: `packages/runtime/test/framework-operations.test.ts`
- Modify: `docs/archive/milestone-2-snapshot.md`
- Modify: `docs/architecture/OPEN-QUESTIONS.md`

- [x] **Step 1: Write failing rollback tests**

Add tests proving rollback detects and executes:

```ts
updated_policy_settings: default_posture public -> restricted
restored_policy_settings: setting row deleted after target version
removed_policy_settings: setting row absent at target version
```

- [x] **Step 2: Run rollback tests and verify RED**

Run:

```bash
bun test packages/runtime/test/framework-operations.test.ts
```

Expected: fail because rollback impact ignores `pneuma_policy_settings`.

- [x] **Step 3: Implement rollback support**

Include `pneuma_policy_settings` in definition overlay snapshots, restore payload parsing, rollback impact, destructive disclosure, operation scope, backup rows, and execute persistence/deletion.

- [x] **Step 4: Update milestone docs**

Update M2 snapshot and OPEN-QUESTIONS to move explicit deny/default posture from open gap to current proof, while leaving IAM/Permission Center/concurrency as open.

- [x] **Step 5: Full verification**

Run:

```bash
bun test
bun run typecheck
git diff --check
```

Expected: all pass.
