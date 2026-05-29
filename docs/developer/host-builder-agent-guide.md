# Building a pneuma Creation Host — a guide for code agents

**Audience:** an LLM / code agent that is building or extending a Creation Host on
`pneuma-framework`. **Chinese version:** [host-builder-agent-guide.zh-CN.md](./host-builder-agent-guide.zh-CN.md)

This is contract-first and imperative on purpose. Read it before you write Host
code. When in doubt, obey the invariants here over your own instinct — they
encode the framework's reason for existing. Run the **self-check** (last section)
before you emit a proposal or claim a task is done.

---

## 0. The one mental model

```
pneuma-framework  →  Creation Host  →  Generated Application  →  Published Application
   (primitives,        (Builder-facing      (app definition,         (a released version
    governance,         product you           data, versions,          End Users open)
    contracts)          build/extend)         build transcript)
```

Three roles can collapse into one person: **Developer** builds the Host;
**Builder** uses the Host to create/evolve a Generated App by talking to a
**Build-phase Agent** (that's the lane you operate in); **End User** uses a
Published App.

Never collapse the four layers. If a task says "the pneuma app", resolve whether
it means Creation Host, Generated Application, or Published Application before
acting.

## 1. The litmus test (use this to decide ownership of ANY piece)

> Does it touch the **stack / domain / UI / data shape / deploy target / identity**?

- **Yes → it is Host- or profile-owned.** The framework gives a contract or a
  slot, never an implementation. Do not push it into framework packages.
- **No (pure sequencing / governance / mechanics) → it may be framework-owned**
  and you should reach for the framework's contract/helper instead of
  re-implementing.

Examples — Host-owned: Bun/Hono/React/Drizzle choice, the business domain, the
product UI, the persistence backend, auth, the deploy provider. Framework-owned:
the lifecycle state machine, the fail-closed gating, receipt/evidence shapes,
the code-agent-lane protocol, workspace/version/diff mechanics.

## 2. The governance backbone = the loop (honor this state machine)

```
create-from-profile → (preview) → code-agent draft → VERIFY GATE
  → proposal → approve/apply (vNext) → publish (+ receipt) → (rollback)
```

Invariants — these are non-negotiable:

1. **Create-from-profile yields a complete `v0`.** Agent work is *optional
   evolution*, never a prerequisite for first preview/publish.
2. **The scaffold's own `verify` is the pre-proposal gate.** A draft becomes a
   Builder-visible proposal only if `verify` passes. No exceptions.
3. **Fail-closed everywhere.** A missing/ambiguous signal (agent timeout, a
   check that did not run, a protected file touched) must block, not pass. A
   timeout is *not* success — kill, verify, and only proceed if checks still
   pass.
4. **Approval gates mutation.** Apply only after explicit approval; deny before
   any mutation, never after.
5. **Migrations are additive / forward-only / idempotent** (`ADD COLUMN IF NOT
   EXISTS`, `CREATE TABLE IF NOT EXISTS`). Never author a destructive
   down-migration as part of rollback.
6. **Rollback is code/version only.** It does not revert the database and does
   not redeploy. Reverting the live deployment requires re-publishing the
   rolled-back version; reverting data, if ever wanted, is a separate *explicit*
   corrective proposal — never an automatic drop.
7. **Preview is disposable and must not write production data.** Use an
   in-memory copy, or rehearse on an isolated database branch.

## 3. The contracts you must honor

Fill these shapes; do not invent parallel ones. (Names are the canonical
vocabulary; see `CONTEXT.md`.)

- **Proposal** — `{ changedPaths, diff, verifyTail, appSchemaSignature
  before/after, bundle before/after, agentNote }`. Computed against the *active
  version* so it shows the full accumulated delta.
- **Publish / Deploy receipt** — `{ target, versionId, url, persistence,
  deploymentId?, files?, dbSchema, migrateTail }`. A publish must return
  structured evidence, including an access path; "deployed" ≠ "reachable".
- **Runtime/Data receipt** — evidence of what happened to runtime/provider data
  after an approved change. Required when published data is carried forward or
  evolved.
- **Observation evidence** — after each apply capture `{ appSchemaSignature,
  bundleManifest, dbSchema }` so an evolution's effect is concrete, not asserted.
- **Editable vs protected roots** — the profile declares both. A draft that
  changes a protected path (deploy/infra/contract files) is rejected *before*
  verify runs. Enforce on `changedPaths`, not on the agent's promises.
- **Code-agent lane** — run one turn against a *draft workspace* (a copy, never
  the active source); detect completion via a backend-specific **signal set**;
  on timeout kill → verify → fail-closed.

## 4. Rules

DO:
- Materialize versions as `vN` directories; keep `v0` pristine.
- Compute diffs by content (sha), enforce protected roots on the diff.
- Treat "turn done" as a *set* of backend signals; keep a generous, configurable
  timeout as a fail-closed backstop.
- Return typed receipts/evidence even when a step is a no-op.
- Let forward-compatible code ignore extra DB columns/tables (select only known
  columns).

NEVER:
- Push stack/domain/UI/data into framework packages.
- Let a code agent edit the active source directly — always a draft + approval.
- Trust an agent transcript over a passing `verify`.
- Auto-drop schema or auto-revert data on rollback.
- Seed/fabricate rows at request time in a published runtime (seed at migrate
  time, only when empty).
- Silently truncate or skip a check and report success.

## 5. Real-world gotchas (you will hit these; pre-empt them)

- **Code-agent completion-event drift.** A backend (e.g. `codex app-server`
  0.128) may signal turn completion via `thread/status/changed` → `idle` and
  only sometimes via `turn/completed`. Match a signal *set* (and `idle` only
  after `active`). The fail-closed verify is what makes a missed signal safe.
- **Turn duration is variable.** The same prompt can finish in ~360s once and
  exceed 600s another time. Use a generous cap (e.g. 900s); a genuine overrun is
  a real timeout, not the event bug — fail-closed still yields a correct
  proposal.
- **Cloud deploy protection.** A fresh deploy target may gate all URLs behind
  auth (e.g. Vercel Deployment Protection → 401), so a `READY` deployment is not
  reachable. The receipt needs an access/bypass notion, not just a URL.
- **Provider control-plane vs connection string.** A Postgres connection string
  cannot drive branching/admin (e.g. Neon needs an API key; org-scoped keys
  cannot list user projects and need an explicit project id).
- **Database branching for rehearsal.** Branch is copy-on-write from production
  (real data); run the draft migration against the *branch*; preview against it;
  delete the branch on stop. Data is never merged back — only the verified
  forward migration reaches production at publish.
- **Port allocation.** Pick a genuinely free port for ephemeral runtimes; a fixed
  counter collides with orphaned processes and a stale process can answer your
  health check.

## 6. Self-check (run before emitting a proposal or claiming done)

1. Did the scaffold's `verify` actually pass on the draft? (Not "the agent said
   so.")
2. Did the change touch only editable roots? (Check the diff.)
3. Is the schema change additive/idempotent, with a forward migration?
4. Did I capture before/after schema + bundle evidence?
5. Is preview/rehearsal isolated from production data?
6. Does any new "deployed" claim include a *reachable* check, not just a URL?
7. Am I pushing anything stack/domain/UI/data-shaped into the framework? (If so,
   stop — make it a Host contract instead.)
8. If something failed or was skipped, did I say so plainly (fail-closed),
   instead of reporting success?

## 7. Anti-patterns to refuse

- "Just edit the active app directly, it's faster." → No; draft + verify +
  approval.
- "Rollback should also drop the new column." → No; additive + explicit
  corrective proposal.
- "The deploy returned an ID, call it published." → No; smoke a reachable
  endpoint.
- "Add the framework a Vercel/Neon/Bun dependency." → No; reference adapter,
  opt-in, core never depends on it.
- "Preview against the production database to use real data." → No; branch or
  in-memory rehearsal.

---

If you internalize sections 1–2 (litmus test + loop invariants) you will rarely
go wrong; the rest is detail. The framework owns sequencing and governance; you
own every effect through closures and adapters. Keep the four layers visible.
