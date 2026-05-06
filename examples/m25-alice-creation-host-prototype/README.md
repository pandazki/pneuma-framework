# M25 Alice Creation Host Prototype

Developer-facing reference prototype for the pre-RC Creation Host story.

M24 proved the contract set can carry the mawidget / dev-board sharing and fork story. M25 turns that contract pressure into a runnable product-shaped prototype from Alice's point of view:

```text
Alice learns the framework boundary
  -> authors a Creation Host profile
  -> packages Bob's Build Agent
  -> declares provider capability contracts
  -> creates Bob's dev-board Generated Application
  -> validates Charlie install and Dave fork evidence
  -> forms an RC judgment
```

This example intentionally lives under `examples/`. It consumes framework contracts and validators, but it is not a new core package API.

## Story Kit

Use the story kit when presenting the prototype to a team:

- [STORY.md](./STORY.md)
- [STORY.zh-CN.md](./STORY.zh-CN.md)

The story kit includes four bilingual visual anchors:

- [Four Product Layers](../../docs/architecture/assets/m25-story-product-model.png)
- [Role Journey](../../docs/architecture/assets/m25-story-role-journey.png)
- [Contract Stack](../../docs/architecture/assets/m25-story-contract-stack.png)
- [Install vs Fork](../../docs/architecture/assets/m25-story-install-vs-fork.png)

## Run

```bash
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun run examples/m25-alice-creation-host-prototype/run.ts --port 8886
```

Open:

```text
http://127.0.0.1:8886/
```

Smoke test:

```bash
PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH" bun run examples/m25-alice-creation-host-prototype/run.ts --smoke-exit
```

## What To Look For

- The first screen starts with Alice's Developer question, not Bob's generated app.
- Each stage has a Developer question, mental shift, Alice action, framework contract references, and evidence ids.
- The generated `dev-board` preview is present, but it is subordinate to the Creation Host authoring path.
- The evidence ledger ties the prototype back to M22 / M23 / M24 contracts: Build Agent Package, Provider Capability Matrix, Share Artifact, Sharing Governance, Credential Rebinding Evidence, and fail-closed fork/install probes.

## Not A Claim

M25 does not implement a real macOS app, OAuth, credential broker, Postgres adapter, signed artifact transport, marketplace, or production sharing UI. It is a pre-RC developer-cognition and demo prototype.
