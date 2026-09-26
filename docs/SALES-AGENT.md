# The sales agent: getting users and subscribers once the value ladder is live

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Status: **design, with the first rung built** (the board endpoint, §3).
Written 2026-09-26. Companion to `docs/VALUE-LADDER-PACKAGING.md` (what we
sell and for how much) and `docs/PACKAGING-ROADMAP.md` (how the package,
the trial and the billing get built). Those two own the catalog, the price
book, the proposal tool and every screen a customer buys from; this file
does not repeat them and nothing here carries a price or a module list.

---

## 0. What it is, in one paragraph

An agent with two jobs. **Convert and keep:** every workspace that signs up
gets watched from the first day, and the person who signed up hears from
us at the right moments (not approved yet, approved but never signed in,
signed in but nothing built, trial ending, trial over, payment overdue,
paying but idle). **Bring in new accounts:** the fifteen target accounts in
VALUE-LADDER §9, then companies like them, worked with the discovery
questions in VALUE-LADDER §3.7 and handed to the proposal tool. It runs as
a scheduled Claude session (a Claude Code routine) that reads ONE endpoint,
`GET /api/growth`, and acts only through doors that already exist: Gmail
drafts, calendar holds, the proposal tool, and a log of what it did. It
climbs the same ladder Jarvis climbs in the editor: **observe → propose →
act within limits.** It starts on the first rung, and the founder decides
when it steps up.

---

## 1. What already exists (do not rebuild)

| Piece | Where | What it gives the agent |
|---|---|---|
| Self-serve signup, approval | `start.html`, `api/tenant-signup.js`, `api/tenant-approve.js` | `omega_orgs/{org}` with `createdAt`, `approvedAt`, `signup.email`; `billing/current.trialEndsAt`; the person to talk to |
| Access requests | `access_requests/{uid}` | a person who signed up before a tenant record existed; `upgradeRequested`, `nudges` when they press Upgrade on the pending strip |
| Presence | `team_members/{org}__{email}.lastSeen` | the last time anyone opened the dashboard (written by `index.html` only, §2) |
| Projects | `projects` (`orgId`, `createdAt`) | activation: did they build anything |
| Payment | `billing/current.lastPaidAt`, `subscriptionDue`, `amountDue`, `status`, `paymentFailedAt` (`api/stripe-webhook.js`, `tenant-billing.js`) | paying, past due |
| Email | `api/_lib/mail.js` (Gmail SMTP, nodemailer; templates `signupReceived`, `approved`, `invite`…) | the transactional channel; every caller and limit is in that file's header |
| Master console | `admin/admin-console.js` `renderTenants()`: pending signups, filter pills (trial ending, overdue, due soon) | the staff view of the same funnel; **the packaging build is rewriting this console, so this design adds nothing to it** |
| The AI call pattern | `api/jarvis-help.js`: key chain `AI_KEY_<ORG>` → `ANTHROPIC_API_KEY`, cached system block, a forced answer tool, `_lib/ai-errors.js` | how a server function asks Claude, if the agent ever needs to from `/api/` |
| Machine credentials | `api/_lib/agent-auth.js`, `scripts/agent-key.js` (`omega_ak_…`, SHA-256 stored, scopes, revocable) | the credential a scheduled session holds; needs a `growth:read` scope (§8, rung 2) |
| Usage telemetry | `omega-events.js` → `api/events.js` → the twin's `twin_events` | tool opens and runs, sampled; **not readable from this repo** (`docs/EVENT-LAYER.md`) |
| Targets and the pitch | VALUE-LADDER §9 (fifteen accounts, trial end dates, "start with", "next"), §3.6 starter packs by type, §3.7 the ten discovery questions | the first book of business and the words |
| The proposal tool | VALUE-LADDER §8, packaging phase 6 (in build) | turns a conversation into a priced, branded proposal; the agent hands off to it, never prices |

Two things exist and do nothing, worth knowing before assuming they work:
`omega_orgs/clearsky-usa.com/notifications` is written at signup and read by
nothing; and `mail.js`'s footer and `config.js`'s `upgradeEmail` /
`supportEmail` still say `csebuilders.com`, which is retired as a staff
domain, so the dashboard's "Request access" mailto goes to an address
nobody has confirmed is read (§10, decision 1).

---

## 2. The funnel and its signals

```
signup ──► pending ──► approved ──► first sign-in ──► first project ──► trial ends ──► paid ──► renews
   │           │            │              │                │                │           │
createdAt   status       approvedAt    team_members     projects        trialEndsAt  lastPaidAt
signup.email pending     approvedBy    .lastSeen        .createdAt      (14 days      subscriptionDue
access_requests                        (dashboard        (orgId)         from approval amountDue
.nudges                                 only)                            once phase 4  status past_due
                                                                          lands)
```

Stage words the code uses (`api/_lib/growth.js`):

- **lifecycle**: `pending` · `trial` · `paying` · `past-due` · `suspended` · `cancelled`
- **activity**: `never-seen` · `exploring` (signed in, no project) · `building` · `idle` (30 days)

Gaps the agent must live with, and the fix for each:

- **Presence is the dashboard's.** Only `index.html` writes `lastSeen`; a
  person who only ever opens the editor or a phone app looks `never-seen`.
  Fix: one merge write of `lastSeen` from `omega-tenant.js` after
  entitlements land, so every signed-in page counts. Small, but it is the
  shared runtime the packaging phases are also editing, so it waits for
  their merge (§8).
- **Tool use lives in the twin.** `twin_events` is not readable here. The
  agent judges engagement by projects and presence; the twin can add "tools
  run last 14 days" per org later through a read-only export.
- **Trial end is not yet "14 days from approval".** Today `trialEndsAt` is
  set at signup (`TRIAL_DAYS`, 30) and approval does not move it. Packaging
  phase 0/4 makes it 14 days from approval and adds the day-11 email. The
  board reads whatever `trialEndsAt` says, so it is right before and after.

---

## 3. Rung 1, built: the board (`GET /api/growth`)

Staff only (`caller.staff`: a verified `@clearsky-usa.com` address), GET
only, writes nothing. It assembles, per workspace, the facts a browser
could not join (org record, `billing/current`, member count, newest
`lastSeen` across the team, project count capped at 500, newest project,
a pending access request for that domain) and hands them to the pure
judgement in `api/_lib/growth.js`. Tests: `scripts/tests/tgrowth.js`.

```
GET /api/growth              the board: every workspace, most urgent first
GET /api/growth?org=<orgId>  one workspace, with `facts` (what the call was made from)
```

A row:

```json
{ "orgId": "cleancell.us", "name": "Clean Cell", "vertical": "oem",
  "who": "owner@cleancell.us", "lifecycle": "trial", "activity": "building",
  "tier": "trial", "members": 3, "projects": 4,
  "days": { "sinceSignup": 41, "sinceApproval": 40, "sinceSeen": 0.2, "sinceProject": 3, "trialLeft": 2.6 },
  "flags": ["trial-ending"], "priority": 3,
  "action": "Send Clean Cell the proposal: trial ends in 3 days",
  "why": "4 projects drawn; they have something to lose." }
```

`priority`: 0 nothing to do · 1 watch · 2 this week · 3 today. The board
also returns `summary` (pending, trial, trialEnding, paying, pastDue,
idle, today) and `today[]` (orgId, action, who).

The rules, so nobody has to read the code to know why a name is on
today's list:

| Situation | Threshold | Priority | Action |
|---|---|---|---|
| Signed up, not approved | ≥ 1 day waiting | 3 | Approve or call (says how long, and how many times they pressed Upgrade) |
| Signed up this morning | < 1 day | 2 | Approve today |
| Trial ends soon | ≤ 3 days | 3 | Send the proposal (the reason is what they built, or that nobody signed in) |
| Trial over, unpaid | any | 3 | Send the proposal or close |
| Approved, nobody signed in | ≥ 2 days after approval | 3 | Welcome call |
| Signed in, no project | ≥ 3 days since last seen | 2 | Offer a guided build |
| Building on trial | | 1 | Watch; line up the proposal for the last three days |
| Past due (amount past its date, failed payment, or `status: past_due`) | any | 3 | Reach them before access is affected |
| Paying, nobody in 30 days (or never) | 30 days | 2 | Churn risk |
| Paying and active | | 0 | Healthy; next rung at the quarterly right-size |
| Suspended | | 1 | Decide: billing conversation or a clean close |
| Cancelled | | 0 | Win-back only if something changed |

Thresholds are constants at the top of `api/_lib/growth.js`
(`THRESHOLDS`), not configuration: a change to them is a decision worth a
diff.

What it deliberately does not know: prices, modules, packages, what to
propose. "Send the proposal" is the whole instruction; the proposal tool
(phase 6) prices it from the catalog, in the one place prices live.

---

## 4. How the agent runs (rung 2, to build)

A **Claude Code routine** on weekday mornings, in this repository's cloud
environment, with the founder's own Gmail and Calendar connectors. Each
run:

1. **Read** `GET /api/growth` with a machine credential (§8). Read
   `growth_log/{today}` (Admin-SDK only) to see what earlier runs already
   drafted, so a retry never drafts twice.
2. **For each `today` item**, gather context it may read: the workspace's
   facts (`?org=`), the last Gmail thread with `who` (search, read only),
   the calendar for a slot.
3. **Propose, never send.** A Gmail **draft** to `who`, in the founder's
   voice, one thread per company, short, plain, with one ask (a 20-minute
   call; "shall I send the proposal"; "your trial ends Thursday, here is
   what you built"). For a call, a tentative calendar hold. For a proposal,
   a note to run the proposal tool for that org (the tool sends; the
   agent does not).
4. **Log** each proposal to `growth_log/{today}` (orgId, action, draftId or
   eventId, at) and reply with the day's list: who, why, what was drafted,
   what needs a human decision.
5. **Stop.** No sends, no approvals, no billing, no changes to any tenant
   record. The founder opens Drafts, edits, sends or deletes.

After two weeks of drafts the founder reads, the routine may be allowed to
**send** (rung 3) for specific rows and channels, with a daily cap, the
suppression list honoured, and every send logged, and only after the
decisions in §10. Acting on billing or approval is never the agent's.

The routine's prompt is short because the facts are in the endpoint and
the words are in the ladder:

> Read CLAUDE.md and docs/SALES-AGENT.md. Call GET /api/growth with the
> growth key. For every row with priority 3, and any priority-2 row not
> touched in the last 7 days per growth_log, draft one email in Gmail to
> `who` (never send), in Tommy's voice, plain, under 120 words, one ask,
> no prices, no feature we do not ship (VALUE-LADDER §4.2). Trial-ending
> rows: say what they built and offer the proposal. Never-signed-in rows:
> offer a 20-minute setup call and hold a slot. Past-due rows: draft to
> Tommy, not to the customer. Log every draft to growth_log/{today}.
> Reply with the list and anything that needs a decision. Do not touch any
> tenant record, billing, approval or Firestore document other than
> growth_log.

---

## 5. Bringing in new accounts (rung 3, to build)

The fifteen targets come first; they are named, half are already in the
product, and their trial dates are known. For everybody else the sources
are public and vertical-shaped, the way `docs/clearsky-power-prospector`
harvests sites (pull once, join offline, score, emit a table, never a live
join in a browser):

| Vertical | Where the companies are listed | First pitch (VALUE-LADDER §3.6) |
|---|---|---|
| EV installer | utility EV make-ready approved-contractor lists (Eversource, National Grid, UI, ComEd), state EV program vendor lists | the EV workbook and closeout they already file by hand |
| Solar / BESS installer | state incentive program approved-installer lists (Mass Save, NYSERDA, Illinois Shines), NABCEP directory | storage sizing and plan sets |
| Developer, owner, capital | state interconnection queues (public), utility hosting-capacity portals, ISO queue lists | Grid Atlas and investor & finance |
| EPC / engineering | utility interconnection contractor lists, permit records | plan sets, engineering, permitting |
| OEM / distributor | the referral inbox's own senders and recipients, RFQ vendors already on the platform | white label and Omega Logic |

The power-prospector skill's `harvest_phones.py` (the skill is packaged at
`docs/clearsky-power-prospector.skill`) already pulls business name, phone,
website and category by bounding box from Overture, Foursquare and OSM; it
is the one part of that pipeline that looks at companies rather than
parcels and is the starting point for a `scripts/harvest-prospects.js` with
a source registry per vertical. Output: `prospects/{id}` (Admin-SDK
only; company, domain, vertical, source, evidence, stage, owner, next), a
`prospect-log` action on `POST /api/growth`, and prospects on the same
board as tenants so one list runs the day.

Outreach rules, whichever rung:

- **Work addresses only**, the same rule signup enforces
  (`api/_lib/public-domains.js`). One thread per company. A named person,
  never `info@`, unless that is all there is.
- **CAN-SPAM as code:** a real postal address in every message, a working
  unsubscribe honoured within a day, a subject that says what the mail is,
  the sender's real name and mailbox. `growth_suppressions/{emailLower}`
  (Admin-SDK only) is checked before every draft and every send; an
  unsubscribe, a bounce or a "stop" writes it and nothing removes it.
- **Signed-agreement tenants are off-limits** to automated mail (FENECON,
  the OSA JV) until counsel says otherwise, the same way `event_exclusions`
  keeps their telemetry out. A list, checked in code, not a memory.
- **Nothing invented.** No feature from VALUE-LADDER §4.2 is "included";
  no number outside the price book; no claim the product does not make on
  its own screens. When in doubt the draft says less.
- **A person can always take over.** Every draft and every send names the
  workspace and the reason; the founder can stop the routine with one
  toggle (`growth_config/current.enabled`, Admin-SDK only, read at the top
  of every run).

---

## 6. What the agent may touch, by rung

| | Rung 1 · observe (built) | Rung 2 · propose | Rung 3 · act within limits |
|---|---|---|---|
| `GET /api/growth` | staff token | machine key, scope `growth:read` | same |
| Firestore | nothing | `growth_log`, `growth_config` (read) | + `growth_suppressions`, `prospects`, `growth_log` sends |
| Gmail | nothing | drafts; read threads with the contact | send, with a daily cap and the suppression check |
| Calendar | nothing | tentative holds | invitations |
| Proposal tool | nothing | asks the founder to run it | runs `context` / `recommend`; a human sends |
| Tenant records, billing, approval, terms | never | never | never |
| Secrets | none | the growth key in the routine's environment, never in the repo | same |

Everything the agent writes is Admin-SDK only in the rules; browsers never
read `growth_*` or `prospects`. The endpoint stays read-only; writes get
their own actions with their own tests when rung 2 is built.

---

## 7. Messaging discipline

The ladder is the offer and the proposal tool is the price; the agent's
job is timing and truth. A message is under 120 words, from a person, with
one ask. It names what the reader did in the product ("the Riverside
one-line you drew on Tuesday") because that is the only proof we have that
we were paying attention. It never says "AI", never apologises for
automation, never sends a second mail before the first is answered or a
week has passed. A trial-ending mail leads with what they built; a
never-signed-in mail leads with a setup call, not with features; a
past-due mail goes to the founder first.

---

## 8. What the value ladder hands over, and when

The agent needs these from the packaging build, in order of arrival:

1. **The trial as designed** (phases 0 and 4, landed): 14 days from
   approval; read-only after an unpaid trial end, which the board now reads
   as its own lifecycle (`read-only`, priority 3: send the invoice link or
   close). The in-product notice from day 10 exists
   (`api/_lib/package-access.js` `billingNotice`); **no day-11 email is
   sent by the platform yet**, so the agent's "trial ends" mail is the only
   one until that lands — when it does, record it on `billing/current` and
   stand the agent down that day.
   A pay-at-the-end signup (Phase 10A) that has not paid its first invoice
   is `read-only` with the flag `awaiting-payment` (2026-09-26): the action
   is a call about the invoice, not an invoice link, because the link is
   already on the pay step and in the mail; the workspace opens the moment
   QuickBooks shows it paid, and the platform mails the buyer and ClearSky
   when it does.
2. **The billing profile** (phase 4, landed): `omega_orgs/{org}/billing/profile`
   carries the billing contact and AP address; the board's `who` is that
   contact when there is one, else the signup email, else the owner.
3. **The package** (`billing/current.modules[]`, phases 1–4, landed): what
   a tenant owns. The board reads `packaged`, `packagingState` and
   `accessUntil` for the lifecycle and still says nothing about modules or
   prices on purpose.
4. **The proposal tool** (phase 6, in build): `context | recommend | price
   | save | send | accept`. The agent calls `context` and `recommend` at
   rung 3 and never `send`.
5. **Usage counters** (phase 7): "18 of 20 EV applications used" is the
   best upsell trigger there is; it becomes a flag on the board the day the
   counters exist.

The presence write in §2 is placed: `omega-tenant.js` writes
`team_members.lastSeen` once per page load on every signed-in page (the
dashboard keeps its own richer write and sets `OMEGA_PRESENCE_BY_PAGE`), so
a person who only opens a tool no longer reads as never signed in. The
editor does not load `omega-tenant.js` by design (CLAUDE.md), so an
editor-only session is still not seen; that write belongs with the editor's
own sign-in when it is next touched. The machine-key scope still waits.

---

## 9. Build order

| Rung | Work | Files | Done when |
|---|---|---|---|
| 1 (done) | The board | `api/growth.js`, `api/_lib/growth.js`, `scripts/tests/tgrowth.js` | tests green; a staff token gets the list |
| 2 | Machine credential: `growth:read` scope on `api/_lib/agent-auth.js`, accepted by `/api/growth`; `growth_log`, `growth_config` (rules: Admin-SDK only); the routine (§4) drafting in Gmail; the daily reply | `api/_lib/agent-auth.js`, `api/growth.js`, `firestore.rules`, the routine | a morning run drafts, logs and replies; a retry drafts nothing twice; the founder has read two weeks of drafts |
| 3a | Prospects: `scripts/harvest-prospects.js` with a source registry per vertical; `prospects/`; `prospect-log`; prospects on the board | `scripts/`, `api/growth.js`, `api/_lib/growth.js` | the fifteen targets and one harvested vertical on one board |
| 3b | Sending within limits: suppression list, bounce and unsubscribe handling through `mail.js`, daily cap, every send logged; reply and trial→paid rates on the board | `api/growth.js`, `api/_lib/mail.js`, rules | the founder approves rung 3 in writing per channel |

Each rung ships behind `growth_config/current.enabled` and is a decision
the founder makes, not a milestone the agent reaches.

---

## 10. Decisions for Tommy

1. **Sender identity.** Whose name and mailbox: `tom@clearsky-usa.com`, or
   a `sales@clearsky-usa.com` the founder reads. Same decision fixes
   `config.js` `upgradeEmail` / `supportEmail` and `mail.js`'s footer, which
   still point at `csebuilders.com`.
2. **Whether the agent ever sends** (rung 3), on which rows, with what
   daily cap; and whether prospects (people who never signed up) may be
   emailed by it at all, or only drafted.
3. **Off-limits accounts** beyond FENECON and the OSA JV: NextNRG's
   existing contract, anyone mid-negotiation.
4. **Presence from every page** (the `lastSeen` write in `omega-tenant.js`)
   after the packaging phases merge, so "never signed in" is true.
5. **The fifteen targets' trial dates** (Clean Cell 2026-09-30, Budderfly
   and East West Energy 2026-10-16 per VALUE-LADDER §9): the board will
   name them on the right day; the proposals need the phase-6 tool or a
   hand-built deck before then.

---

## 11. Not built

- Rungs 2 and 3: the machine credential and scope, `growth_log`,
  `growth_config`, `growth_suppressions`, `prospects`, the routine itself,
  Gmail drafting, sending, bounce handling, the harvest script, prospect
  scoring, reply and conversion rates.
- Presence from pages other than the dashboard; tool-use signals from the
  twin.
- Any rules for the `growth_*` collections (none exist yet because nothing
  writes them).
- A staff page for the board. The endpoint is the product for now; a page
  belongs with the console the packaging build is rewriting.
