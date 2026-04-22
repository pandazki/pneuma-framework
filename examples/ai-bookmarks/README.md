# ai-bookmarks — full-stack E2E walkthrough

Validates the framework's complete lifecycle (setup → dev → build → deploy
→ migrate → fork) against a real app: an AI-native bookmarks tool where
each saved URL is interpreted through configurable "lenses" (system prompts)
and placed into a similarity graph.

Sibling example: [`../opencode-chat/README.md`](../opencode-chat/README.md) —
the M3-era read-only doc viewer example.

## Prereqs

1. `opencode` on `$PATH`, OpenRouter creds registered:

   ```sh
   opencode auth login  # choose OpenRouter
   ```

2. Docker running locally (for `build` + `deploy`).
3. `OPENROUTER_API_KEY` in your shell (used by the DEPLOYED container AND
   by dev.sh so the app can actually interpret URLs):

   ```sh
   export OPENROUTER_API_KEY=sk-or-v1-...
   ```

4. (Optional but recommended) `JINA_API_KEY` for first-party embeddings.
   Without it, embeddings fall back to OpenRouter → OpenAI. Jina tends to
   give better semantic clustering for mixed-language content and is the
   template's default when the env var is present:

   ```sh
   export JINA_API_KEY=jina_...
   ```

## Walkthrough

### 1. One-time setup

```sh
rm -rf /tmp/pneuma-bookmarks
bun packages/cli/src/index.ts setup templates/ai-bookmarks --workspace /tmp/pneuma-bookmarks
```

Creates the workspace, seeds `lenses.json`, runs the first SQL migration.

### 2. Dev loop (with build-phase agent)

```sh
bun packages/cli/src/index.ts dev templates/ai-bookmarks \
  --backend opencode --workspace /tmp/pneuma-bookmarks
```

Open the printed **Builder URL**. Paste a URL — watch Jina-Reader fetch it,
OpenRouter generate lens-by-lens interpretations, the timeline fill in, and
the graph edges appear.

Try asking the agent:
- "加一个 lens 叫 'architecture rabbit hole'，读作架构师视角，3 点总结"
- "把 timeline 的卡片背景改成更浅的米色"

Watch the edit → hot reload → live preview.

### 3. Build a release image

```sh
bun packages/cli/src/index.ts build templates/ai-bookmarks --workspace /tmp/pneuma-bookmarks
```

Produces `/tmp/pneuma-bookmarks/.pneuma-build/<date>/build.manifest.json`
and a local docker image `pneuma-ai-bookmarks:<timestamp>`.

### 4. Deploy locally

```sh
bun packages/cli/src/index.ts deploy templates/ai-bookmarks \
  --workspace /tmp/pneuma-bookmarks --unattended
```

(Without `--unattended`, the viewer shows a permission-prompt banner; click
Allow.)

Container runs on `http://127.0.0.1:3001`. This is your "release mode" — a
frozen copy of the app serving the real SQLite volume.

### 5. Fork the workspace

```sh
bun packages/cli/src/index.ts fork templates/ai-bookmarks \
  --source /tmp/pneuma-bookmarks --target /tmp/pneuma-bookmarks-v2
bun packages/cli/src/index.ts dev templates/ai-bookmarks \
  --backend opencode --workspace /tmp/pneuma-bookmarks-v2
```

Fork carries your `lenses.json` + migrations but NOT the runtime DB — the
new workspace runs fresh migrations and starts empty.

### 6. Push to a registry (optional)

```sh
export PNEUMA_REGISTRY=ghcr.io/your-user
PNEUMA_DEPLOY_TARGET=registry bun packages/cli/src/index.ts deploy \
  templates/ai-bookmarks --workspace /tmp/pneuma-bookmarks --unattended
```

## Knobs

**Chat model**
- `OPENCODE_MODEL=openrouter/anthropic/claude-haiku-4.5` — cheaper build-phase agent.
- `OPENROUTER_CHAT_MODEL=anthropic/claude-sonnet-4-6` — model used for lens interpretation.

**Embedding provider** (auto-detected; override with `EMBED_PROVIDER`)
- With `JINA_API_KEY`: defaults to Jina `jina-embeddings-v3` (1024-dim).
- Without: OpenRouter → OpenAI `text-embedding-3-small` (1536-dim).
- `EMBED_PROVIDER=openrouter` forces OpenAI path even if Jina key is set.
- `EMBED_MODEL=...` picks a specific slug inside the chosen provider.

**Graph threshold**
- `BOOKMARKS_EDGE_THRESHOLD=0.5` when using Jina (Jina's cosine distribution runs lower).
- `BOOKMARKS_EDGE_THRESHOLD=0.7` when using OpenAI text-embedding-3 (tighter distribution).
- Default is `0.65` — fine for OpenAI but swallows most "related" pairs on Jina.

**Deploy**
- `PNEUMA_DEPLOY_PORT=4000` — different release container port (default 3001).
- `PNEUMA_DEPLOY_TARGET=registry` + `PNEUMA_REGISTRY=ghcr.io/...` → push instead of local run.

## Known sharp edges

- Running `deploy` WITHOUT `--unattended` routes through the viewer permission
  prompt — the CLI hangs until the builder clicks Allow in the browser.
  Set `--unattended` for scripted deploys.
- The initial setup.sh copies scaffolds — it is idempotent (skips existing
  files), so re-running it after you edit `lenses.json` won't overwrite you.
- `migrate down` is not implemented in v0. Roll-forward-only.
- Jina and OpenAI embeddings have different dimensionality. Switching
  `EMBED_PROVIDER` mid-workspace leaves a mix until each bookmark is
  re-posted (`INSERT OR REPLACE` overwrites per-lens rows). Graph edges
  between mismatched-dim rows are silently dropped (cosine returns 0).
