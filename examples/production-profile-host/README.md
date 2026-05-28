# Production Profile Host Harness

**Status:** M53 integration harness, built on the M52 production Generated App profile.

This example is the first step after `production-generated-app-profile`. It acts as a small Creation Host harness:

```text
Builder selects the production profile
  -> Host copies the scaffold into a project workspace
  -> complete v0 can be previewed or published immediately
  -> code agent edits a draft workspace
  -> Host runs the scaffold's own checks
  -> passing draft becomes a proposal
  -> Builder approval applies a new generated-app version
  -> published runtime starts from the applied version
```

The harness deliberately starts test-first, then exposes a small bilingual browser workbench. Its purpose is to
prove that the M52 scaffold is usable as a Creation Host profile before the larger product flow is layered on top.

Run:

```bash
bun test --cwd examples/production-profile-host
```

Run the click-level browser E2E:

```bash
bun run --cwd examples/production-profile-host e2e
```

Run the browser workbench:

```bash
bun run --cwd examples/production-profile-host build
PORT=8899 bun run --cwd examples/production-profile-host serve
```

Open:

```text
http://127.0.0.1:8899/
```

Run the browser workbench with the real Codex app-server lane:

```bash
bun run --cwd examples/production-profile-host build
PORT=8900 PNEUMA_PRODUCTION_PROFILE_AGENT=codex-app-server \
  bun run --cwd examples/production-profile-host serve
```

The same browser/API flow will then call Codex against the draft workspace. The Host still owns the proposal
gate: Codex must edit declared product roots and the generated app `verify` command must pass before the
proposal appears.

Run published runtimes against Neon:

```bash
PNEUMA_PRODUCTION_PROFILE_DATABASE_URL="$DATABASE_URL" \
  PORT=8900 PNEUMA_PRODUCTION_PROFILE_AGENT=codex-app-server \
  bun run --cwd examples/production-profile-host serve
```

Run publish through the Vercel REST API instead of a local Bun process:

```bash
PNEUMA_PRODUCTION_PROFILE_DATABASE_URL="$DATABASE_URL" \
PNEUMA_VERCEL_TOKEN="$VERCEL_TOKEN" \
PNEUMA_VERCEL_PROJECT=production-generated-app-profile \
PNEUMA_PRODUCTION_PROFILE_DEPLOY=vercel-api \
PORT=8900 PNEUMA_PRODUCTION_PROFILE_AGENT=codex-app-server \
  bun run --cwd examples/production-profile-host serve
```

In this mode `Publish runtime` performs the cloud release lane:

```text
run generated-app db:migrate against Neon
  -> upload the active version files through Vercel REST API
  -> create a production deployment
  -> wait for READY
  -> smoke /api/health and /api/items
  -> return deployment id and URL as Host evidence
```

Notes:

- Preview remains an in-memory disposable sandbox so preview clicks do not pollute the production database.
- Local publish runs the generated app migration before serving; Vercel publish runs the same migration before creating the cloud deployment.
- Published runtime seeds demo data only when the target tables are empty.
- Do not commit the database URL or Vercel token; pass them through the environment or a local secret manager.

What it proves:

- the scaffold can be copied as a portable generated-app artifact;
- protected deployment/profile files stay unchanged;
- deterministic and later real code-agent lanes can modify declared editable roots;
- the generated app's own `verify` script is the Host's pre-proposal gate;
- the applied version can start as a local published runtime or be deployed through the Vercel API and expose the changed API shape.

Current browser flow:

```text
Create from profile
  -> preview complete v0
  -> publish complete v0
  -> ask deterministic build agent for optional v1 evolution
  -> start draft preview for v1
  -> approve and apply
  -> publish runtime
  -> rollback
```

Product semantics:

- Creating from a profile yields a complete `v0` Generated Application.
- `v0` can be previewed and published immediately.
- Asking the code agent is optional evolution into a checked `v1` proposal, not a prerequisite for first publish.
- Preview runs from a disposable sandbox copy, so preview data is destroyed when the preview stops.

Current real-agent evidence:

- Codex app-server edited the production scaffold draft.
- The draft changed contracts, demo data, Drizzle schema/migration, repository mapping, React UI, tests, and profile evidence.
- `bun run verify` passed before proposal.
- preview, approve/apply, publish, published `/api/items`, and rollback were smoked through the Host API.
- The code-agent prompt treats successful Vite Node-version warnings as non-blocking environment noise, so it stays focused on the product request.
