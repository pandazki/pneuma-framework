# Visual Style Brief — Editorial Hero Illustrations

This is the style brief for milestone hero illustrations. Generate the full set in one batch using a sub-agent so the images look coordinated, not like a grab-bag.

---

## When to use

Use real illustrations only when **all three** are true:

1. The document is share-bound (will be projected, screenshotted, or sent to a non-engineering audience).
2. The illustration is the central visual of its section, not an incidental flow.
3. The illustration will be reused at least 3× (deck, snapshot, follow-up doc).

If only one or two are true, mermaid is enough. Don't burn image-generation cost on a diagram that only one person will look at.

## The shared style brief

Every milestone gets ONE shared style brief, applied to all 4–5 hero illustrations. This is what makes them look like a coherent set.

### Locked elements

These don't change between images in a single set:

- **Background** — a soft paper colour, not pure white. Cream (`#F4EFE3`), warm off-white, or a project-specific neutral.
- **Linework ink** — a single deep, slightly warm ink colour (`#1F1B16` or near). All hairline rules use this colour.
- **Two-tone accent palette** — one accent for "what this milestone added" (a calm botanical colour like sage `#7A8A6E` or muted teal); one accent for "current focus / callouts" (a warm pop like amber `#B8732A`). Use each accent for ONE purpose only.
- **Typography pairing** — a serif headline (Literata-like or other magazine serif) + a humanist sans for labels (Inter-like). The serif is for titles; the sans is for in-diagram labels.
- **Composition rules** — hairline rules instead of bordered boxes; no drop shadows; no gradient mesh; no glassmorphism; generous whitespace; pure 2D vector-style.
- **Aesthetic** — "thoughtful editorial technical diagram in a design-conscious magazine", not "SaaS dashboard", not "AI-generated stock art".

### Style brief paragraph (paste into every image prompt)

Use this paragraph as a prefix or suffix to every image prompt in the milestone's set. Substitute your project's colours where indicated.

```
Editorial-technical magazine illustration. Background: cream paper (#F4EFE3 or similar warm off-white). Linework: deep ink (#1F1B16) at hairline weight. Two-tone accent: a calm botanical colour (e.g. sage #7A8A6E) used ONLY for the milestone-added surface, and a warm pop (e.g. amber #B8732A) used ONLY for the current focus / callout. Typography: serif headline in the spirit of Literata or another magazine serif; humanist sans labels in the spirit of Inter. Crisp text rendering — labels must be legible. Hairline rules instead of bordered boxes. No drop shadows, no gradient mesh, no glassmorphism, no decorative photography, no 3D renders. The whole composition should feel like a thoughtful editorial technical diagram in a design-conscious magazine, not a SaaS dashboard. Calm, literary, confident.
```

If the project's design language already has a colour story (check `PRODUCT.md` or design tokens), substitute those values. The pattern stays the same: one paper colour + one ink + two accents (one for "added", one for "focus").

---

## Standard image set

Most milestones benefit from these four hero illustrations. Generate them as a batch.

### 1. System architecture

**Aspect ratio:** 16:9
**Filename suffix:** `m<N>-system-architecture`

Shows what was added, highlighted in the secondary accent (sage). Replaces the "system at a glance" mermaid in the milestone snapshot.

Composition pattern: 3 horizontal bands (Builder/Agent → Pipeline → Storage), with arrows from agent to pipeline, pipeline to two side-by-side card stacks (data vs definition / old vs new), and a return arrow from the new surface back up to the viewer.

Prompt scaffolding:

> Architectural diagram titled '<one-line insight>'. Three horizontal bands. TOP band: <upper layer — usually intent / builder / agent>. MIDDLE band: <pipeline / processing layer with named stages connected by hairlines>. BOTTOM band: two side-by-side card stacks — LEFT '<existing thing>' and RIGHT '<thing this milestone added>' filled with the secondary accent and labelled with a small amber annotation 'M<N> added this'. From the bottom band, a hairline dotted arrow rises to a small badge labeled '<rediscovery surface>' which connects to a panel labeled '<consumer>'. Three small floating annotations between the bands in lighter ink: '<reused thing 1>', '<reused thing 2>', '<reused thing 3>'.

### 2. End-to-end governance loop

**Aspect ratio:** 16:9
**Filename suffix:** `m<N>-governance-loop`

Shows the 6–10 station flow from intent to rollback. Replaces the "end-to-end loop" mermaid.

Composition pattern: a horizontal flowing path with numbered station cards along it, each with a small engraved-style pictogram + 1-line label. A return arc loops back from the end station to the history-snapshot station, showing reversibility.

Prompt scaffolding:

> Editorial infographic titled '<one-line title>'. <N> numbered stations arranged as a horizontal flowing path that gently curves from left to right, with a return arc looping back to station <K> from the end. Each station is a small rounded card with a tiny engraved-style pictogram and a one-line label. Station order with labels: 1. <name>, 2. <name>, ..., <N>. <name>. The connecting line between stations is a hairline ink stroke, with a soft amber tint near the current focus. Beneath the path, a short subtitle: '<one-line takeaway>'.

### 3. Coverage radar

**Aspect ratio:** 1:1
**Filename suffix:** `m<N>-adr-coverage-radar`

A radial chart with one spoke per ADR section. Coverage area filled with the secondary accent. Partial spokes have visible notches and amber annotations linking them to the next milestone.

This is the image that mermaid genuinely cannot produce, and it's the strongest argument for investing in real illustrations.

Prompt scaffolding:

> Editorial radar / spider diagram titled '<title>' with subtitle '<count> ADRs across <N> sections'. A clean N-spoke radial chart on cream paper, each spoke labeled at the rim. Labels in clockwise order starting from the top: '§1 <topic>', '§2 <topic>', ..., '§N <topic>'. Three concentric hairline rings mark 33% / 66% / 100%. The coverage area is filled with translucent <secondary accent> with a hairline outline. <list partial spokes with their %>. All other spokes reach 100%. Place a small amber dot at the tip of partial spokes with a tiny annotation 'Partial — M<N+1> surface' linked by a hairline. Central legend inside the chart: 'Full ▰▰▰▰▰' / 'Partial ▰▰▱▱▱' as a tiny legend.

### 4. Roadmap river

**Aspect ratio:** 16:9
**Filename suffix:** `m<N>-roadmap-river`

Stages 0 through K as a flowing path. Closed stages solid; current milestone marked with the focus accent + callout flag; future stages dashed and fading right.

Prompt scaffolding:

> Editorial timeline-as-river illustration titled '<Project> roadmap — Stage 0 through Stage <K>'. A horizontal flowing path / hairline river runs across the canvas with <K+1> waypoints. Stages 0-<N> are drawn with a solid hairline (closed milestones). Stage <N> is the current waypoint and is marked with an amber dot, an amber underline, and a small amber callout flag with the text 'M<N> — current snapshot'. Stages <N+1>-<K> are drawn with a dashed hairline (future stages), increasingly faded toward the right edge. Each waypoint shows the stage number above and a one-line topic below. Topics, in order: <list of stage names>. Above the river are three small section labels at the appropriate horizontal positions: 'CLOSED' (over stages 0-<N>), 'NEXT' (over stage <N+1>), 'FUTURE' (over stages <N+2>-<K>). Use <secondary accent> for closed waypoints and amber only for the M<N> callout.

---

## Sub-agent delegation pattern

Image generation produces JSON output that pollutes the main conversation. Always delegate to a sub-agent.

Pattern:

```
Spawn a general-purpose sub-agent with:

- The shared style brief (verbatim)
- The 4 image prompts (with all the project-specific labels filled in)
- The output directory (absolute path)
- The skill path for the contextual-illustrator (or whichever image tool is configured)
- Instructions to run sequentially, retry once on failure
- Instructions to return ONLY a final summary block:

  IMG1 m<N>-system-architecture: <full local path>
  IMG2 m<N>-governance-loop:    <full local path>
  IMG3 m<N>-adr-coverage-radar: <full local path>
  IMG4 m<N>-roadmap-river:      <full local path>

  Plus a one-line note on whether any retries were needed. Under 200 words total.
```

Run all four in one sub-agent invocation, sequentially. Total wall time is usually 5–10 minutes; the human can do other things meanwhile.

After the sub-agent returns, view each image (Read tool with the PNG path) before committing — sometimes a label will be misspelled or proportions will be off. If a single image is wrong, use the image-generation tool's mask-edit feature to fix that one image rather than regenerating the whole set (regenerating breaks coherence).

---

## Integration into docs

After generation:

- Replace the mermaid block in the milestone snapshot with `![<descriptive alt text including all the labels>](./spec/images/m<N>-<name>.png)`.
- Keep an ASCII fallback (e.g., a stage-overview ASCII block in `roadmap.md`) for text-only readers and accessibility.
- Update the share runbook with a slide ↔ image mapping table (see `canonical-doc-templates.md` § Reference deck assets).

Alt text matters: write it like a caption a screen reader user could understand. "End-to-end governance loop" is too vague; "End-to-end governance loop — eight numbered stations from Builder intent to Rollback, with rollback arc looping back to history" is right.

---

## Anti-patterns

- **Mermaid screenshotted into the deck.** The typography breaks at projection scale.
- **One-off image styles.** Generating images one at a time without the shared brief produces a grab-bag. The audience can tell.
- **Decorative photography or 3D renders.** This is a technical share, not a marketing landing page.
- **Glassmorphism / gradient mesh / cyan-purple gradients.** These age fast and read as "AI-generated stock art".
- **Skipping ASCII fallback.** Always keep a text version of the same content for accessibility and for text-only viewing (e.g., the `bat docs/architecture/roadmap.md` reader).
- **Regenerating the whole set when one image is off.** Use mask-edit. Regeneration breaks coherence between images.
