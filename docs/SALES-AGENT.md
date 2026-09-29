# The sales agent: getting users and subscribers once the value ladder is live

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Status: **rungs 1 and 2 built, 3a built** (2026-09-27): the board (§3), the
sales database, the website's demo form, the harvest, the Claude Code agent
and JARVIS's Sales view (§11). Sending stays a person's (rung 3b is not
built, on purpose). Written 2026-09-26. Companion to `docs/VALUE-LADDER-PACKAGING.md` (what we
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
| Access requests | `access_requests/{uid}` | a person who signed up before a tenant record existed; `upgradeRequested`, `nudges` when they press Upgrade on the pending strip. Since 2026-09-28 also the SIGNUP IN PROGRESS: `source: 'signup'`, `signup{stage, modules, interval, priceDisplay, emailVerified, updatedAt}` written by `api/tenant-signup` `progress` from the moment the account is made on `/start.html`, `status: 'converted'` (+ `orgId`) once the workspace exists — the funnel's first step, before `omega_orgs` |
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
nothing; and the product's support address is now dev@clearsky-usa.com everywhere
(`mail.js` SUPPORT_EMAIL, `omega-tenant.js`, `config.js`), and so is the
website's (2026-09-27: every footer, the contact form, the legacy login
page). csebuilders.com is never written again.

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

## 4. How the agent runs (rung 2: built 2026-09-27, §11)

As built, `growth_log` is `sales_activity` (one log for every touch, the
agent's included) and `growth_config` is `sales_config`; the routine below is
`.claude/agents/sales-agent.md`, run by `/sales` or by JARVIS.

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

## 5. Bringing in new accounts (rung 3a: built 2026-09-27, §11)

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

1. **Sender identity and postal address.** Decided in part (2026-09-27): the
   website and the product answer at dev@clearsky-usa.com. The cold-email
   sender and the postal address every cold email carries are still open;
   they are two fields in JARVIS › Sales › Agent settings (`sales_config`),
   and until both are set the server refuses to log a cold draft. The sender
   must be a clearsky-usa.com mailbox (the endpoint refuses gmail.com and
   csebuilders.com).
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

## 11. What was built on 2026-09-27, and how to switch it on

**The database** (Firestore, Admin SDK only; `firestore.rules` closes each
explicitly). `api/_lib/sales.js` is the one rule for all of it (pure;
`scripts/tests/tsales.js`):

| Collection | What |
|---|---|
| `sales_prospects/{domain}` | a company, keyed by its work domain (a public mailbox is keyed by the address); stage `target → contacted → demo → trial → proposal → won/lost` (the twin's words); contacts, evidence, sources, next action, score |
| `sales_candidates/{companyKey}` | a name a harvest found, with its evidence (project counts in a public record); researched into a prospect or skipped, never written to |
| `sales_activity/{id}` | every touch, one flat log: `demo-request`, `email-drafted`, `email-sent`, `reply`, `call`, `meeting`, `proposal-sent`, `linkedin-drafted` / `-published` / `-stats`, `approval-nudge`, `research`, `stage`, `suppressed`, `note`, `agent-run` |
| `sales_suppressions/{email or *@domain}` | do not contact; nothing removes a row |
| `sales_config/current` | the agent's switch, sender, postal address, daily draft cap, demo link, LinkedIn channel, extra off-limits domains |
| `sales_counters/{name}` | the demo form's daily cap and the agent's daily draft count |

**The doors.** `GET|POST /api/sales` (a verified ClearSky person, or
ClearSky's ADMIN machine key with `sales:read` / `sales:write`;
`agent-auth.staffOrAgent`). `GET /api/growth` also takes that key with
`growth:read`. `POST /api/demo-request` is public: the website's form, with a
honeypot, 5 a minute per address and 100 a day; it stores the lead before it
says "Received" and mails dev@clearsky-usa.com with Reply-To the visitor.

**The rules the server enforces, not the agent's good manners:** a stage moves
forward only on the key (won, lost and backwards are a person's); a draft to
the off-limits floor (FENECON, the OSA JV firms, Lionheart, ourselves) or a
suppressed address is refused; a cold draft (they never wrote to us and are
not a customer, both READ from the records) is refused until the sender and
the postal address are set; a public mailbox that never wrote to us is
refused; the agent's drafts are capped per day; `lintPost` refuses a price, a
link to `/offerings` or a coming-soon feature sold as live in a LinkedIn post.

**The agent.** `.claude/agents/sales-agent.md` (the morning run, step by
step) and `/sales` (`.claude/skills/sales/`). Its hands are
`scripts/sales-cli.js`; it drafts in Gmail, never sends. JARVIS runs the same
agent (`~/jarvis/.claude/agents/sales-agent.md` is a link to this one;
`~/jarvis/bin/sales` is the CLI; `/sales` in JARVIS's Claude Code;
`bin/sales-daily` files the vault note `04 - Jarvis/Sales.md` weekdays 7:40
Central and raises one notification when something waits).

**The harvest.** `scripts/harvest-prospects.js` with the registry
`scripts/_lib/prospect-sources.js` (five New York open datasets on
2026-09-27: commercial solar, retail storage, storage interconnections,
Charge Ready NY, large renewables; about 900 companies at the first pass) and
`--csv` for any sheet (the account master list, a trade-show export), mapped
by `S.guessProspectMapping`. Dry by default.

**The dashboard.** JARVIS › Sales (`mission.html`, the rail) and a Sales panel
on the Command Center: signups waiting (linked to the console), time to
approve, demo requests and time to answer, drafts waiting to send, replies,
LinkedIn posts and the leads they brought (the website keeps the utm tags of
the first visit, `omega-attribution.js` in clearsky-omega-site), the funnel,
top prospects, the activity log, a form to log a reply, a call or a post's
numbers, and the agent's settings. "What to change" is
`S.suggestions()`: each line names the number it came from.
`npm run check:sales` renders it in Chromium against the real endpoint.

**Switching it on (once):**
1. Mint the key (staff, where the service account is):
   `FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" node scripts/agent-key.js --org clearsky-usa.com --admin --label "sales agent" --scopes growth:read,sales:read,sales:write --apply`.
   It prints once. Put it in `~/jarvis/.jarvis/sales.key` (or
   `~/.config/omega/sales.key`, or `OMEGA_SALES_KEY` in a cloud environment's
   secrets). Never in a repository.
2. JARVIS › Sales › Agent settings: the switch, the sender, the postal
   address, the demo link.
3. On the Mac: `~/jarvis/bin/install-agents --apply --only jarvis-sales`.
4. File the first names: `node scripts/harvest-prospects.js --all --apply`,
   and the master list with `--csv`.
5. Each morning: `/sales` (or "run the sales agent" to JARVIS), then clear
   Gmail Drafts and approve on the console.

## 12. Not built

- Rung 3b: sending by the agent, bounce handling, a scheduled cloud run (a
  Claude Code routine needs the key as an environment secret first; the
  Mac's launchd job files the note but drafts nothing on its own).
- A LinkedIn connector: there is none in the session; posts go to Gmail
  drafts (`linkedinChannel: gmail-drafts`) until a scheduler that posts to
  company pages is connected.
- Signup attribution: a demo request carries its utm source; a self-serve
  signup (`start.html`) does not yet.
- Harvest sources beyond New York; email discovery (the agent records only
  published addresses, never a guessed pattern).
- Presence from pages other than the dashboard; tool-use signals from the
  twin.
- A page for the board on the master console: JARVIS's Sales view is the
  page; the console is the packaging build's.
