# Issue Tracker: GitHub Issues

Issues for this repo are GitHub issues in `pandazki/pneuma-framework`. Issues about PneumaSpace, the runtime under `examples/space-all-in-one`, are GitHub issues in `pandazki/pneuma-space`. There is no local `.scratch/` tracker.

## Conventions

These are what issues #3 to #17 did:

- A finding is one issue. Its title starts with a priority, `[P2]` or `[P3]`, and its labels are GitHub's defaults (`bug`, `enhancement`, `documentation`).
- A live trial is written up as one issue (for example #3 and #17): setup, outcome per step, frictions, and what was not exercised. The issues it produces link back to it.
- A pull request names the issues it addresses (`Refs #4, #5, ...`) and the trial that produced them; the issues were closed once the change merged. The CHANGELOG entry cites the issue number, as in `(#9)`.
- An issue in the other repository is cited as `pandazki/pneuma-space#43` or `pandazki/pneuma-framework#17`.

## When A Skill Says "Publish To The Issue Tracker"

Create a GitHub issue with `gh issue create -R pandazki/pneuma-framework` (or `-R pandazki/pneuma-space` for the runtime).

## When A Skill Says "Fetch The Relevant Ticket"

Read it with `gh issue view <number> -R pandazki/pneuma-framework`. The user will normally pass the issue number directly.
