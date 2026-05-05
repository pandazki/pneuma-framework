# Creation Host Authoring And Sharing Frame

**Status:** Working frame, not an ADR.

**Purpose:** Preserve the post-M21 discussion about how a Developer builds a custom Creation Host, and how that sets up the later team/org sharing and enterprise-security problem.

## Scenario

Assume a Mac desktop product called **my-awesome-widget** (`mawidget`).

Alice is the Developer. She builds `mawidget` on top of pneuma-framework.

Bob installs `mawidget` and, as a Builder, creates an app called `dev-board`. He chooses a profile offered by `mawidget`:

```text
sqlite local database + local Docker deployment
```

After many versions, `dev-board` becomes Bob's daily development board:

- Linear project management;
- GitHub issues and pull requests;
- GitHub CI status;
- Apple Notes;
- Bob's personal workflow preferences.

Bob shares `dev-board` with Charlie and Dave.

Charlie is also on macOS. He accepts Bob's default profile, starts the app locally, authorizes his own Linear/GitHub accounts, and uses local Apple Notes.

Dave uses Linux and wants cloud deployment. He forks instead of directly using Bob's app. During fork he chooses a different profile:

```text
remote Postgres database + Docker image for target server platform
```

He provides his AWS Postgres credential, removes Apple Notes, builds a Linux-compatible Docker image, deploys it himself, and initializes his own provider authorizations.

## Main Conclusion

The next large product/design problem is not only:

> How does Bob build an app?

It is:

> How does Alice build a Creation Host that safely gives Bob, Charlie, and Dave governed Build Agent sessions, share/fork recipes, provider choices, credential boundaries, and deployment paths?

That makes the immediate next design lane:

```text
Creation Host Authoring Kit
```

The later design lane is:

```text
Team / org sharing and enterprise governance
```

The second depends on the first. Enterprise sharing will be weak if Alice cannot first express the Host's build-agent package, provider matrix, credential boundary, and share/fork rules.

## Roles In This Scenario

| Role | In the scenario | What they control |
|---|---|---|
| Developer | Alice | `mawidget` Creation Host, profiles, adapters, Build Agent Package, credential model, share/fork semantics. |
| Builder | Bob | `dev-board` generated app, app evolution, resource bindings, approvals, versions. |
| Installer / Re-binder | Charlie | Own provider credentials and local resource bindings while reusing Bob's app recipe. |
| Forking Builder / Deployer | Dave | Forked app, alternate provider profile, removed capabilities, deployment target. |
| Build Agent Package author | Alice | Stable instructions, tools, constraints, tests, review rules for Bob/Dave's Build Agent sessions. |
| Build Agent Session owner | Bob / Dave | Per-app/per-session runtime instance bound to their app, profile, credentials, workspace, approvals. |

## Data Boundary: What Lives In The App Database

Do not treat `app.db` as one undifferentiated bucket.

| Data | Stored in app DB? | Notes |
|---|---:|---|
| App definition | Yes | Tables, Operations, Views, Policies, capabilities, version metadata. |
| Runtime app data | Yes | Bob's dashboard rows, sync cursors, local cache, materialized issues/PRs/CI/note summaries. |
| Provider resource selections | Yes | GitHub repository names/ids, Linear workspace/team/project ids, Apple Notes folder ids. These are bindings, not secrets. |
| Credential metadata | Yes, as refs only | `credential_ref`, provider account id, scopes, expiry, status. |
| Credentials / tokens | No | Real secrets belong in Keychain, OS secret store, cloud secret manager, KMS, or deployment env. |
| Share/init defaults | Yes if materialized locally | Portable defaults may be inserted by init recipe. |
| Bob's derived external cache | No for sharing | Charlie/Dave should re-sync external data under their own credentials. |
| App history / audit / rollout evidence | Yes | Local evidence for creation, approval, publish, restart, rollback. |

Important distinction:

```text
resource selection = what the app is configured to look at
credential secret  = how the runtime authenticates to access it
external cache     = derived data copied locally for product use
```

Only the first and third normally belong in the app DB. Secrets do not.

## Sharing Boundary

Bob should not share a raw database.

Bob should share an installable artifact plus an initialization recipe:

```text
dev-board.share
  app definition
  version manifest
  runtime/build contract
  required providers and scopes
  default views / operations / policies
  init recipe
  no Bob tokens
  no Bob private synced data
```

Portable data should be initialized through a recipe, ideally through semantic framework/Host operations rather than raw SQL:

```text
portable defaults
  -> init recipe
  -> semantic operation
  -> local app DB rows
  -> evidence
```

This makes sharing:

- idempotent;
- provider-portable;
- auditable;
- independent of Bob's private cache;
- compatible with Charlie's re-binding and Dave's fork.

## Provider Switching And Forking

SQLite-to-Postgres should not be understood as "dump the SQLite DB into Postgres."

The desired contract is:

```text
same app definition
same framework primitive semantics
same init recipe
different storage provider
external data re-bound and re-synced
```

This can be close to seamless only if Alice has already declared and tested profile parity:

```text
local-sqlite-docker
remote-postgres-docker
```

Both profiles must satisfy the same semantic contract:

- CellType encoding;
- query/filter/sort/pagination behavior;
- Operation behavior;
- app_history/audit/policy behavior;
- init/share/fork recipe behavior;
- rollout evidence behavior;
- explicit fail-closed behavior for unsupported capabilities.

Dave's fork then means:

```text
take Bob's app definition and portable recipe
  -> choose a different Host profile
  -> re-bind credentials
  -> remove unsupported Apple Notes capability
  -> publish for target platform
```

## Build Agent Package Vs Build Agent Session

Bob has his own Build-phase Agent during app creation. But that agent is not configured from scratch by Bob.

Alice prepares a versioned **Build Agent Package** as part of `mawidget`.

When Bob creates or evolves `dev-board`, `mawidget` starts a per-app/per-session **Build Agent Session** using Alice's package.

```text
Build Agent Package
  authored by Alice
  belongs to mawidget / Host profile
  versioned and reviewed
  defines knowledge, policy, tools, and checks

Build Agent Session
  created for Bob's app/session
  uses opencode or another backend
  bound to Bob's app, workspace, profile, credentials, approvals
  consumes Alice's package
```

For Dave:

```text
same Build Agent Package
different Build Agent Session context
  profile = remote-postgres-docker
  apple_notes = disabled
  github credential_ref = dave/github
  linear credential_ref = dave/linear
  deployment target = linux/docker/amd64
```

This distinction is central. Pneuma should help Alice produce and govern the package. The Creation Host should instantiate sessions from that package.

## Provider-Specific Behavior Rule

The Build Agent may know which profile is active for shared context with the Builder:

```text
profile = remote-postgres-docker
capabilities.relational_store = true
capabilities.apple_notes = false
```

But the Build Agent should not write provider-specific implementation logic in normal Builder mode.

Allowed:

```text
call semantic Host/framework tools
read provider capability matrix
ask for approval when changing capabilities
explain unsupported features
```

Forbidden in normal Builder mode:

```text
write raw Postgres SQL because provider = postgres
assume SQLite file paths
edit deployment scripts directly
store provider secrets in app DB
branch app behavior on provider quirks
```

Provider-specific implementation belongs to Alice's Developer/adapter-authoring layer, not Bob's Build Agent Session.

## Creation Host Authoring Kit

The first next major workstream should help Alice build `mawidget` as a Creation Host.

It should help Alice create, validate, and maintain:

- Build Agent system prompt;
- tool allowlist;
- provider capability matrix;
- credential boundary;
- init/share/fork recipe;
- SQLite/Postgres parity tests;
- "agent must not provider-special-case" rule;
- review checklist;
- post-generation verification;
- Host docs / Builder docs.

The output should not be only Markdown. It should include machine-readable assets such as:

```text
mawidget.host.json
profiles/*.json
provider-capabilities.json
agent-policy.md
agent-tool-allowlist.json
share-recipe.schema.json
contract-tests/
```

Potential framework commands:

```bash
pneuma-framework validate-host-authoring ./mawidget
pneuma-framework validate-agent-package ./mawidget/agent-package
pneuma-framework test-profile-parity local-sqlite-docker remote-postgres-docker
pneuma-framework doctor-share-recipe ./dev-board.share
```

Potential Developer Assistant:

```text
Host Authoring Assistant
  -> reads Alice's software architecture and chosen providers
  -> drafts Build Agent Package
  -> generates profile capability matrix
  -> generates contract tests
  -> reviews provider-special-casing risk
  -> checks docs and post-generation verification
```

This assistant is analogous in spirit to a Codex/Claude skill, but domain-specific to Creation Host authoring.

## Next Problem: Team / Org Sharing And Enterprise Governance

After the Creation Host Authoring Kit is coherent, the next large problem is sharing and enterprise safety:

```text
who may share
who may fork
who may approve
who may bind credentials
who may publish
who may deploy
who may revoke access
who can audit what happened
```

Likely concerns:

- organization identity model;
- workspace/team/project boundaries;
- app ownership and transfer;
- share artifact signing/provenance;
- fork permissions;
- provider credential brokering;
- per-user vs shared credentials;
- approval delegation;
- admin policy management;
- revocation and rotation;
- audit retention;
- deployment target governance;
- data export/import policy;
- cross-user derived-cache isolation.

This should not be solved before the Authoring Kit. Enterprise governance needs the Host contract and Build Agent Package boundary to be explicit first.

## Open Decisions To Carry Forward

| Question | Current leaning |
|---|---|
| Is Build Agent Package a first-class framework concept? | Likely yes, but only after one Creation Host Authoring Kit slice proves the shape. |
| Should provider capability matrix live in core or Host profile metadata? | Start as Host-owned metadata with framework validation helpers. Promote only if multiple Hosts converge. |
| Should profile parity tests be a framework package? | Yes as a test-kit, not as a prescribed provider implementation. |
| Can Build Agent sessions ever access provider-specific docs? | Only in explicit Developer/adapter-authoring mode, not normal Builder mode. |
| Is share artifact signing required before RC? | No. Required before team/org distribution claims. |
| Should credentials ever be included in share artifacts? | No. Include credential requirements and refs, never secrets. |

