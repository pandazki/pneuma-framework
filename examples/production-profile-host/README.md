# Production Profile Host Harness

**Status:** M53 integration harness, built on the M52 production Generated App profile.

This example is the first step after `production-generated-app-profile`. It acts as a small Creation Host harness:

```text
Builder selects the production profile
  -> Host copies the scaffold into a project workspace
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

What it proves:

- the scaffold can be copied as a portable generated-app artifact;
- protected deployment/profile files stay unchanged;
- deterministic and later real code-agent lanes can modify declared editable roots;
- the generated app's own `verify` script is the Host's pre-proposal gate;
- the applied version can start as a published runtime and expose the changed API shape.

Current browser flow:

```text
Create from profile
  -> ask deterministic build agent
  -> start draft preview
  -> approve and apply
  -> publish runtime
  -> rollback
```

Current real-agent evidence:

- Codex app-server edited the production scaffold draft.
- The draft changed contracts, demo data, Drizzle schema/migration, repository mapping, React UI, tests, and profile evidence.
- `bun run verify` passed before proposal.
- preview, approve/apply, publish, published `/api/items`, and rollback were smoked through the Host API.
- The code-agent prompt treats successful Vite Node-version warnings as non-blocking environment noise, so it stays focused on the product request.
