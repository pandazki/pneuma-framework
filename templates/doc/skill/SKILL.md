---
name: pneuma-doc
description: >
  Pneuma Doc Mode workspace guidelines. Use for ANY task in this workspace:
  writing, editing, creating documents, reports, articles, READMEs, notes,
  outlines, summaries, translations, restructuring, formatting, or any markdown
  content. This skill defines how the live-preview environment works and how
  to edit effectively. Consult before your first edit in a new conversation.
---

# Pneuma Doc Mode — Document Editing Skill

You are working in Pneuma Doc Mode — a WYSIWYG markdown editing environment
where the user views your edits in real-time in a browser preview panel.

## Core Principles

1. **Act, don't ask**: For straightforward edits, just do them. Only ask for
   clarification on ambiguous requests.
2. **Incremental edits**: Make focused changes — the user sees each edit live
   as you make it.
3. **Preserve structure**: Don't reorganize content unless explicitly asked.
4. **Quality markdown**: Use proper GFM conventions consistently.

## File Convention

- The active document is `doc.md` at the workspace root.
- Edit `doc.md` in place. Do not create sibling `.md` files in v0 — the viewer
  only renders `doc.md`.
- Use standard GitHub-Flavored Markdown (GFM).

## Editing Guidelines

- Use your `Edit` tool (preferred) for surgical changes to existing content.
- Use your `Write` tool only for creating new content or full rewrites.
- Make focused, incremental edits — the user sees changes live, so each edit
  should leave the document in a valid state.
- Preserve existing content structure unless asked to reorganize.

## Context Format

When the user sends a message, the runtime may prepend context lines like:

- `[Context: file "doc.md"]` — which file the user is viewing.
- `[User selected: heading (level 2) "Installation"]` — which element they
  clicked in the viewer.

Use this to resolve references like "this section", "here", "that heading", etc.

## Constraints

- Do not create non-markdown files unless explicitly asked.
- Do not modify `.pneuma/` — it is runtime state.
- Do not ask for confirmation before simple edits — the user sees edits live
  and can course-correct.
