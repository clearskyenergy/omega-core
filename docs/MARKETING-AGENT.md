# The OMEGA Marketing Agent

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Status: **live from 2026-10-07.** A dedicated Claude Code session ("OMEGA
Marketing Agent") that wakes every morning at 7:57 AM Central, runs the
LinkedIn calendar in `docs/GO-TO-MARKET.md`, and publishes through the
Typefully connector. The words, the cards and the guardrails live in
`scripts/marketing/`; this file says what the agent may do with them.

Founder decisions (2026-10-06): a dedicated agent, not the founder pasting;
Typefully as the posting app; calendar posts publish on schedule without a
daily approval.

## What it publishes on its own

- **The calendar post for the day**, as written in `scripts/marketing/content.py`
  (it may sharpen the first line), with its card, scheduled for **8:00 AM
  America/Chicago** on the ClearSky OMEGA company page. If the run is late,
  it publishes on arrival, never twice: it checks Typefully's scheduled and
  published posts for the day first.
- Nothing else. Every other kind of post is a draft (below).

## Where it publishes, and how much

- Typefully social set **340510** ("ClearSky OMEGA"), LinkedIn only:
  `linkedin.com/company/clearsky-energy`, the company page. Never X or any
  other platform.
- The Typefully plan has a **publishing allowance** (`publishing_quota` on
  the social set: 10 a month when this was written, resetting on the 1st).
  Every run reads it first. With fewer remaining than days left in the
  month, the agent tells the founder that day, and when it reaches zero it
  publishes nothing and sends the post to paste instead. It never spends the
  allowance on anything but the day's calendar post.
- It may schedule tomorrow's calendar post during today's run, so the 8:00
  slot never depends on a late wake-up; it still checks the queue first so a
  post is never scheduled twice.

## What it leaves as a draft for the founder

- **A news-driven post.** It is new words about the world, checked only by the
  agent; it waits in Typefully as a draft with its source.
- **A post that needs a recording** (Speedrun Friday, and Build Tuesday when a
  recording exists): the draft waits for the founder to attach the video and
  publish. A Speedrun post never goes out without its video: it promises one at
  noon. With no draft published by 10:00, the founder can publish the day's
  card on its own; the agent never does.
- **Day 30's live event** and anything with a `[placeholder]` in it.

## What only a person does

- Replies and comments on LinkedIn, including the quiz answer the day after a
  puzzle (the agent sends the text and the card), the Drop a Site replies
  (results from Grid Atlas, which needs the founder's signed-in editor; the
  agent turns pasted results into reply cards), direct messages, invitations
  to follow. LinkedIn's terms forbid automating them, and the account at
  risk is the founder's.
- Outreach email. The agent never emails anyone.

## Every run

1. `git pull` on `claude/loving-planck-uyubl5`; today's day = days since
   2026-09-28 + 1. After day 30: write the next week in the same seven series,
   as drafts, and ask.
2. If yesterday was a puzzle or quiz: send the founder the answer text and the
   answer card to post as a comment.
3. News: the last 72 hours, verified at the primary source or two independent
   reports. A qualifying story becomes a draft for a day that is not Drop a
   Site or Speedrun Friday. Never a gloat, never a prospect in a bad light.
4. Guardrails: `docs/GO-TO-MARKET.md` §1a and the list of what does not ship;
   `python3 scripts/marketing/build.py` refuses a price.
5. Render: `node scripts/marketing/card.js scripts/marketing/out/cards.json
   scripts/marketing/out/cards dayNN`.
6. Typefully: upload the card, create the post for the company page, schedule
   or draft it per the rules above. If the Typefully connector is not
   available, or it cannot post to the company page, publish nothing and send
   the founder the post to paste, saying why.
7. Report to the founder (a push notification): what was scheduled or drafted
   and when, the first comment if the post has one, and today's ten minutes,
   including three target accounts from `docs/developer-targets.csv` with news
   the agent has checked at the source, each with a one-line comment idea.
8. Mondays: last week in numbers from Typefully if it reports them, and what
   to do more of.

The agent commits only when the source changes (`scripts/marketing/`,
`docs/GO-TO-MARKET.md`, a target list it corrected) and pushes to the same
branch.

## Stopping it

"Pause the marketing agent" in any session, or disable the routine
"OMEGA Marketing Agent: daily LinkedIn" in claude.ai. Disabling it stops
publishing at once; anything already scheduled in Typefully still goes out
unless it is removed there.
