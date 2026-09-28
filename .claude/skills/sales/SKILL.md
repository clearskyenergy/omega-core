---
name: sales
description: Run ClearSky's sales agent - the morning run (approvals, demo-request replies, account emails, one LinkedIn post, prospect research), or one part of it. Use for "/sales", "run the sales agent", "sales morning", "research prospects", "draft a LinkedIn post", "who is waiting for approval", or "how are sales doing".
---

Hand the work to the `sales-agent` subagent (`.claude/agents/sales-agent.md`)
with what was asked. The subagent's file is the whole procedure; do not
restate it here or improvise a second one.

- No argument, or `morning`: the full morning run (steps 1–8).
- `approvals`: step 2 only, as a list with links.
- `research [n]`: step 7 for n candidates (default 10).
- `post [topic]`: step 5 only.
- `report`: read `node scripts/sales-cli.js dash` and summarise the funnel,
  today, and the `suggestions`, with no drafts.
- `harvest <source|--all>`: run `node scripts/harvest-prospects.js --source
  <key>` dry first and show the top of it; add `--apply` only when Tommy
  says to file it.

When the subagent returns, pass its report on as it is, shortest first. Do
not claim a draft exists that the report does not name.

$ARGUMENTS
