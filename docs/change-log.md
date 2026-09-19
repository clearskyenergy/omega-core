# The change log — who changed what, and when

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Every commit, pull request, review and deployment, recorded against the
person who made it, and readable a week at a time on **Changes** in
JARVIS Mission Control (`/mission`).

```
GitHub  ──signed webhook──▶  api/hook-github.js  ─┐
                                                  ├─▶  change_log/{id}  ──▶  api/change-log.js  ──▶  /mission · Changes
Vercel  ──signed webhook──▶  api/hook-vercel.js  ─┘                            (counts the week)
```

Nothing in a browser writes to or reads the collection: `firestore.rules`
denies `change_log` outright, and the three functions above reach it with the
Admin SDK, which bypasses rules. The rollup is counted in `api/change-log.js`
and arrives finished — a record about who did what is not assembled anywhere
it could be edited before it is read.

---

## Setting it up

Four things, once. Until the first two are done the Changes screen will say so
rather than showing an empty week.

### 1 · Two secrets in Vercel

Vercel → Project → Settings → Environment Variables. Both are strings you
choose or are given; neither is ever committed.

| Variable | Value |
|---|---|
| `GITHUB_WEBHOOK_SECRET` | any long random string — you will paste the same one into GitHub |
| `VERCEL_WEBHOOK_SECRET` | the signing secret Vercel shows **once**, when you create the webhook in step 3 |
| `CHANGELOG_VIEWERS` | *(optional)* comma-separated addresses allowed to read the report without being staff |

Generate the GitHub one with `openssl rand -hex 32`.

### 2 · A webhook on each repository

GitHub → repo → Settings → Webhooks → **Add webhook**.

- **Payload URL** `https://<your host>/api/hook-github`
- **Content type** `application/json`
- **Secret** the same string as `GITHUB_WEBHOOK_SECRET`
- **Events** *Let me select individual events* → Pushes, Pull requests,
  Pull request reviews, Branch or tag creation, Branch or tag deletion,
  Releases. (Sending everything is fine too — anything else is ignored.)

Save. GitHub fires a `ping`; a green tick means the secret matches. Repeat for
every repository you want in the report — the receiver accepts any repo that
signs correctly and records which one it was, so adding the next one is adding
a webhook, not a deploy.

### 3 · One webhook for the Vercel team

Vercel → Team Settings → Webhooks → **Create Webhook**.

- **Endpoint** `https://<your host>/api/hook-vercel`
- **Projects** all of them, or the ones you want logged
- **Events** Deployment created, Deployment succeeded, Deployment error,
  Deployment canceled, Deployment promoted, Project created, Project removed,
  Domain created

Copy the signing secret it shows on creation into `VERCEL_WEBHOOK_SECRET` and
redeploy, or the receiver has nothing to check signatures against.

### 4 · Backfill the weeks before today

A webhook only knows what happened after it existed. This reads the same
history back out of the GitHub API:

```bash
GITHUB_TOKEN=ghp_…  FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" \
  npm run changelog:backfill -- --weeks 8            # dry run, prints the report
GITHUB_TOKEN=ghp_…  FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" \
  npm run changelog:backfill -- --weeks 8 --apply
```

It keys rows exactly as the receiver does — a commit is its sha — so running
it twice, or running it over weeks the webhook has already covered, changes
nothing. `--repo owner/name` is repeatable and defaults to this clone's
`origin`.

---

## Who can read it

`api/change-log.js` answers to, in order: a staff email domain, a `role: staff`
custom claim, an `omega_staff/{uid}` document, or an address listed in
`CHANGELOG_VIEWERS`. Everyone else gets a 403 and the screen says which of
those to fix. This is ClearSky's own engineering activity — no tenant sees it
and it is not scoped by `orgId`.

---

## What it does not record

Worth knowing before the report is read as complete.

- **Vercel settings changes.** Environment variables, build settings, domain
  DNS, team membership and role changes are not webhook events on any Vercel
  plan. They appear only in the team Audit Log, which is Enterprise-only and
  has no webhook and no public API. Deployments, projects and domains are the
  whole of what Vercel will tell you.
- **Pushes bigger than a webhook carries.** GitHub puts at most 20 commits in
  a push payload. A larger push records the 20 it sent plus one row saying so,
  linking to the compare view — rather than silently undercounting somebody's
  week. The backfill picks the rest up if you re-run it.
- **Commits on branches that never merged**, in the backfill only. It walks
  the default branch, because a commit that sits on five branches would
  otherwise be counted five times. The webhook records every branch as it
  happens.
- **Work that left no trace in either system.** A conversation, a decision, a
  spreadsheet. The report is a record of what GitHub and Vercel observed, and
  the screen is titled accordingly.

## Shapes

`change_log/{id}` — the id is derived from the event (a commit's sha, a
review's id, a deployment id plus its state), never from the webhook delivery
id, so a redelivery overwrites its own row instead of doubling a number.

| field | |
|---|---|
| `source` | `github` \| `vercel` |
| `kind` | `commit`, `pr_opened`, `pr_merged`, `pr_closed`, `review`, `branch_created`, `branch_deleted`, `release`, `push_truncated`, `deploy_started`, `deploy_ready`, `deploy_error`, `deploy_canceled`, `deploy_promoted`, `project_created`, `project_removed`, `domain_created` |
| `at` | ISO 8601, when the **provider** says it happened |
| `week` / `day` | ISO week and civil date, in `America/Chicago` — so a Sunday-evening commit lands in the week it felt like, and a week is one equality clause rather than a range scan |
| `actorKey` | GitHub login, lowercased; the commit email where there is no login; `unknown` rather than a guess |
| `actor` | `{ login, name, email, avatar, bot, agent }` — `agent` is a `Co-Authored-By: Claude` trailer, which is a tag and not a judgement |
| `repo` / `project` / `target` | where, and which branch or environment |
| `title` | the human sentence, written server-side |
| `url`, `n` | where to look, and how big it was |

`GET /api/change-log?week=YYYY-Www&back=n&limit=n` returns
`{ week, range, prev, next, current, totals, people[], repos[], days, events[], gaps }`.

## Tests

`npm run test:changelog` — runs with `firebase-admin` stubbed out of
`require.cache`, so it needs no credential and no network. It covers the two
things that go wrong invisibly: the Chicago week boundary, and the three ways
one event can be counted twice (a redelivered webhook, a merge carrying
commits GitHub has already seen, and Vercel's `succeeded`/`ready` pair).
