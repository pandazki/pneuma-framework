# Design Context

## Users

Writers, creators, and builder-type developers using Pneuma Doc Mode to co-author
a markdown document by talking to a Build-phase Agent. Session is a focused,
"deep work" context — one doc, one conversation, often with mixed English and
中文. Screen is a laptop or external monitor; reading time is significant.

## Brand Personality

Three words: **literary, calm, confident.**

Pneuma means breath / living voice. The product is the framework itself made
tangible: you talk, the doc breathes into being. The interface should feel like
it was designed by someone who respects their reader — generous white space, a
real serif for reading, no dashboard theatrics, no emoji, no gradient text. The
demo this interface belongs to is called "doc mode" — the least chromey mode in
pneuma-skills by design.

## Aesthetic Direction

**Editorial writerly** — lineage from iA Writer, Notion-at-its-quietest, and
a well-made magazine. Warm paper-cream canvas, serif display and body for the
document, a humanist sans for UI chrome, hairline dividers in place of card
boxes, and a single reserved amber accent that only shows on the send affordance
and the focused element.

Theme: **light**. Writing and editing is a daytime activity; cream > white to
reduce glare without the "dark-mode cool" reflex.

Anti-references:
- Linear's dashboardy grid density (wrong register for reading)
- Discord-bubble chat UI (not a social messenger)
- Any rounded-card-with-drop-shadow template
- Tech-demo purple-cyan gradient
- Mono "terminal for terminal's sake"

## Design Principles

1. **The document is the product.** The chat panel is a companion, not a peer —
   it slides out, it's narrower, it uses a different (sans) typeface so the eye
   knows which column to privilege.
2. **Hairline over card.** A 1px rule at the top of the chat panel beats a
   bordered box. A 1px underline under a focused heading beats a highlight
   rectangle.
3. **Reserved accent.** The amber color (`oklch(52% 0.14 45)`) appears on the
   Send button, on the focus mark, and nowhere else.
4. **One serif for both languages.** Pair Literata (Latin) + Noto Serif SC (CJK)
   with matched x-height so a paragraph with mixed Chinese and English feels
   like one piece of writing, not two fonts crashed together.
5. **Silence by default.** No badges, no toasts unless something actually went
   wrong. The connection-status pill is a small dot, not a word.
