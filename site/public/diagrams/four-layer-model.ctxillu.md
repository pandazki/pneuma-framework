---
image: four-layer-model.png
generated_at: 2026-05-30T15:30:00Z
model: gpt-image-2
backend: fal
aspect_ratio: 16:9
quality: high
text_density: balanced
---

# Spec: pneuma-framework doc-site diagrams (house style)

This sidecar captures the shared house style for the dark doc-site diagrams under
`site/public/diagrams/` (four-layer-model, governed-loop, boundaries). Reuse the
Style descriptors verbatim for any new diagram in this set so the site stays
coherent.

## Context
Conceptual diagrams for the VitePress documentation site (dark theme). Placed in
`site/architecture/*.md` and the home, in both the English and Chinese locales
(diagram labels are English; concepts are language-neutral).

## Subject
Abstract framework concepts: the four-layer product model, the governed loop, and
the framework-vs-host ownership boundary.

## Style
Dark, flat, minimal **editorial vector** — near-black charcoal background (hex
1b1b1f), slightly lighter card surfaces (hex 26262b), thin hairline borders,
off-white text (hex e8e8ea), a single **indigo accent** (hex 7c7cf0) for the
primary thread/arrows, with muted desaturated teal / green / amber as secondary
accents. Tiny minimal line icons. Generous whitespace, evenly spaced. **No
gradients, no glow, no 3d.** Clean geometric sans-serif; crisp, legible labels.

## Composition
Horizontal left-to-right flow for sequences (cards or nodes joined by thin indigo
arrows); two-column split for comparisons. 16:9.

## Text & Typography
Information-carrying — spell out exact short labels (stage names, role captions,
column items). Balanced density: short labels + tiny subtitles, no paragraphs.

## User Preferences
Match the dark VitePress site; "风格跟文档站贴切". Keep labels short and legible;
prefer clean flat editorial diagrams over decorative/atmospheric art.

## Prompt
> See git history; the four-layer prompt: four connected stage cards
> (pneuma-framework / Creation Host / Generated Application / Published
> Application) on charcoal hex 1b1b1f, indigo arrows, a Developer/Builder/End User
> role row, flat minimal editorial vector, off-white labels.

## Iteration Notes
- 2026-05-30 — initial set (four-layer-model, governed-loop, boundaries).
