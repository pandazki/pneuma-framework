---
name: ai-bookmarks
description: >
  AI bookmarks workspace: a Bun server + SQLite app that interprets URLs through
  configurable "lenses" (each a system prompt). Edit lenses.json, add migrations,
  customize the React viewer — live preview + hot reload.
---

# AI Bookmarks — Build-phase Agent Skill

This workspace is an AI-native bookmarks app. Users paste URLs; the app fetches
content (via Jina Reader), sends it through each configured *lens* (a named
system prompt), stores the interpretations with vector embeddings in SQLite,
and displays a timeline + similarity graph. Your job as the build-phase agent
is to help the builder customize:

## Lenses

The source of truth for lenses is `workspace/lenses.json`. Shape:

```json
{
  "lenses": [
    { "name": "technical-depth", "displayName": "Technical Depth",
      "prompt": "Read as a senior engineer. What's novel? What would break at scale?" },
    { "name": "personal-relevance", "displayName": "Personal Relevance",
      "prompt": "How does this connect to the reader's ongoing interests in X/Y/Z?" }
  ]
}
```

When the builder asks to add / rename / reword a lens:
- Edit `workspace/lenses.json` directly.
- Keep `name` kebab-case (used as a DB key).
- Server hot-reloads on file change; no restart needed.

## Migrations

SQL migrations live in `workspace/migrations/NNN-description.sql`, applied in
filename order. To add a schema change:
- Create `workspace/migrations/NNN-<description>.sql` (NNN = zero-padded).
- Write the up migration (v0 does not support down).
- Run `bun run migrate` OR call the `lifecycle.migrate.run` tool.

## Viewer customization

The React viewer lives at `workspace/viewer/`. Edit `.tsx` files freely; Bun's
hot reload picks up changes. Main files:
- `src/TimelineView.tsx` — card list
- `src/GraphView.tsx` — react-flow network
- `src/styles.css` — editorial palette

## Constraints

- Do not edit `.pneuma-data/` — that's the runtime DB + framework state.
- Do not commit secrets. `OPENROUTER_API_KEY` is read from the environment at
  runtime; never embed it in source.
- Match the user's language for chat replies.

## 中文说明

这是一个 AI 书签工作区：用户贴 URL，app 按配置好的多个"lens"（不同系统提示）
解读，存进 SQLite，附带向量 embedding，前端显示时间线 + 相似度图。你作为
build-phase agent 的职责是帮 builder 自定义：lenses.json 里的 prompts、
workspace/migrations/ 下的 schema 变更、viewer 里的 React 组件。

用户说中文就用中文回复；编辑文件时 markdown/JSON 结构保持原样。
