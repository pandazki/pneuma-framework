# M43 Enterprise Governance Demo

**Status:** canonical M43 demo  
**Chinese version:** [README.zh-CN.md](./README.zh-CN.md)

This example proves the minimum `pneuma-rc-0.3.0` enterprise governance flow:

```text
Builder intent
  -> Build Agent proposal
  -> reviewer route
  -> Build Assurance publish gate
  -> published app
  -> owner rollback
```

It is intentionally a small in-memory Creation Host demo. It is not a production IAM, workflow, audit, credential, or provider-sync system.

## Provider Baseline

0.3.0 should not be mock-only, so this demo uses:

| Provider | Shape |
|---|---|
| GitHub | Real public-read API for `pandazki` public repositories. No OAuth required. |
| Linear | Mock provider shaped like real Linear workspace/team/project/issue/status/assignee data. |

The governance model does not special-case GitHub or Linear. Provider data becomes app content and evidence pressure.

## Roles

| Role | Subject | Demo responsibility |
|---|---|---|
| Builder | `user:bob` | Proposes the Dev Activity Board change. Self-approval is denied. |
| Reviewer | `user:rachel` | Approves standard source/change risk. |
| Owner | `user:olivia` | Can rollback. |
| Operator | `user:otto` | Can inspect release/runtime state. |
| End User | `user:erin` | Sees the Published Application board. |

## Run

```bash
bun test examples/m43-enterprise-governance-demo/enterprise-governance.test.ts
bun run examples/m43-enterprise-governance-demo/run.ts
```

Expected output:

```text
m43 propose: awaiting reviewer
m43 self approval: denied
m43 reviewer approval: allowed
m43 publish: active
m43 rollback: completed
```

To open the browser demo:

```bash
bun run examples/m43-enterprise-governance-demo/server.ts
```

Then open the printed URL.

## What Is Proven

- Real public provider data and mock enterprise provider data can feed a governed generated-app proposal.
- Builder self-approval does not satisfy enterprise review.
- Reviewer approval can satisfy the standard route.
- Build Assurance blocks publish until governance allows.
- End User only sees the published app state.
- Owner rollback produces an explicit state change.

## What Is Not Claimed

- Production identity.
- Production credential storage.
- Real Linear auth.
- Assignment queues or notifications.
- Compliance audit retention.
- Hosted deployment or zero-downtime rollout.
