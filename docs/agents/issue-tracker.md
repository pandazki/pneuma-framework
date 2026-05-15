# Issue Tracker: Local Markdown

Issues and PRDs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The PRD is `.scratch/<feature-slug>/PRD.md`
- Implementation issues are `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`
- Triage state is recorded as a `Status:` line near the top of each issue file; see `triage-labels.md` for the role strings
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## When A Skill Says "Publish To The Issue Tracker"

Create a new file under `.scratch/<feature-slug>/`, creating the directory if needed.

## When A Skill Says "Fetch The Relevant Ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.
