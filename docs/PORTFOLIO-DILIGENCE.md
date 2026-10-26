# Portfolio diligence: compute-site due diligence on the register

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Solela Capital (`solelacapital.com`) is a family office that buys electrical
capacity nobody is using: overbuilt commercial service, operating and dark EV
charging sites, stranded interconnections, half-built projects. It puts
storage, charging and high-density compute on that capacity and keeps it
(owner-operator, no flipping). In its own words: "The power is already in the
ground. We put it to work." Compute offtake goes through Lightsmith Energy,
which finds the buyer and takes 10% of compute revenue.

This adds a due-diligence workflow to Portfolio & Assets so that one person
can move fast through incoming sites, check each one and mark the ones to
take under control. It is **switched on for one workspace**. Every other
workspace keeps today's portfolio, unchanged.

The rule is `api/_lib/portfolio/diligence.js`: pure, ES5, no Firestore, no
clock. `api/site-crm.js` stays the one door that writes the record. The rule
is held by `scripts/tests/tdiligence.js`, which runs in `npm test` through
`npm run test:portfolio`.

**Where this stands (2026-10-25).** The library, its tests, the enable
script and this note are built. The door actions, the pages and their render
check are **not wired yet**. They touch the same files as the open
"portfolio site-record data bugs" fix (`api/site-crm.js` siteView,
`site-bridge.js`, `assets.js` and `register.js` archive/lifecycle,
`portfolio.html`, `site-crm.html`, the two portfolio test files), so they
wait for that PR to land on main. See *What is not built* at the end.

## The switch

`omega_orgs/{org}/billing/current.toolOverrides['portfolio-diligence'] === true`,
literally (`D.enabled(billing)`). Only staff write it, and the register reads
`toolOverrides['portfolio-assets']` the same way. `'true'`, `1`, an add-on
or a `toolAccess` entry does not turn it on.

Where it is off:

- every diligence action answers 403;
- the GET answers carry no diligence;
- the pages draw nothing new.

Where it is on, the GET answers carry the view, and the pages draw from it.

`scripts/enable-portfolio-diligence.js` switches it on. Thomas runs it after
he creates the workspace in the console (see *Switching it on*).

## The workspace's own lists

These are Solela's, so they are config and never constants in core
(CLAUDE.md: core is never edited for one tenant). They live at
`billing/current.portfolioDiligence`:

| key | Solela's value | used for |
|---|---|---|
| `intakeTypes` | overbuilt service · operating charging site · dark charging site · stranded interconnection · half-built project · portfolio / estate | what kind of site came in |
| `hostDeals` | ground lease · revenue share · hybrid | how the host is paid |
| `exclusions` | residential charging; amenity-only charging | automatic pass (below) |
| `offtake` | partner Lightsmith Energy, 6-year term, 10% fee; `stated`: Lightsmith's own claims, `verified: false` | the offtake defaults |
| `target` | Lightsmith's target deal, $25–35M | the tally |
| `removalMonths` | 6 | the term check |

The seed is `tenants/solelacapital/portfolio-diligence.json`.
`.vercelignore` keeps it off the site because it carries a partner's
terms, the same way it keeps `billing.json` off; `tdiscreet.js` checks this.

`D.validateConfig` checks the seed before anything is written and names
every problem. `D.normalizeConfig` is what the door reads: it is lenient,
drops a bad entry and lists it. `tdiligence.js` D02 checks that the
library's code names none of these values.

With no config, every list is empty and every default is absent. The view
says so: for example, "No offtake term … the term cannot be checked".

## The record: `omega_orgs/{org}/sites/{id}.diligence`

The record is Admin SDK only, like the rest of the site, so no rules change
is needed. Each change is one pure call, `D.change(stored, action, input,
ctx)`, which returns the next record and the event. The door writes both in
one transaction, with its `omega_audit` row. A change that changes nothing
answers `unchanged`, and nothing is written.

There are eight actions: `decide`, `stage`, `gate`, `control`, `offtake`,
`chargers`, `profile` (intake type and host deal) and `survey`.

`history[]` keeps every change, with who and when, capped at 200.

### Stages

The order is Lightsmith's: brought-in → screened → pursue → loi-sent →
offtake → msa → confirmed, plus **passed**. Each forward move must be
earned, and a jump checks every step it skips:

| to | needs |
|---|---|
| screened | power, interconnection and fiber each past *open* |
| pursue | the call: Pursue (it is a decision, never a drag) |
| loi-sent | the LOI recorded as sent (or signed) |
| offtake | an offtaker named, on a term sheet or executed |
| msa | the offtake gate confirmed (the contract on the Files) |
| confirmed | every gate confirmed, economics included, and the site survey done with its report on the Files |

A move back needs a note of at least five characters. A move back before
Pursue also clears the Pursue decision, so the stage and the call always
agree.

### The call

- **Pursue** (E on the register): take the site under control. It moves the
  site to Pursue.
- **Pass** (P): needs a reason. The site moves to passed, and the stage it
  was passed from is kept.
- **Reopen**: clears a pass. The site goes back no further than screened,
  to be looked at again.

### Exclusions

An exclusion is one of the workspace's rules, matched on a **recorded**
value. These are the fields it can read:

- `hostType`;
- the intake's `locationType` fact;
- `tags`;
- `chargers.use`;
- `intakeType`.

It matches exact values, ignoring case, and never guesses from a longer
phrase.

A matched site **is passed by the rule**. This is derived at read time and
never stored. The reason shown is the rule's, and the field and value it
matched are named. If someone corrects the fact, the pass lifts.

Only the **owner** can reverse an exclusion, and the reversal needs a
reason. It is kept in `exclusionOverrides.<rule>` (who, when, why, and what
the rule matched on) and stands through later changes. A person's own call
on an excluded site is kept under the rule's pass, ready for when the owner
reverses it.

### The seven gates

The gates are power · interconnection · fiber · control · chips · offtake ·
economics. Each one is `{ state, value{}, source, evidenceFileId, by, at }`.

| state | rule |
|---|---|
| open | nothing checked yet |
| screened | **public data only**: `source.kind` is `public` and the source is named |
| working | in hand with a counterparty |
| confirmed | a **document on the site's Files** (stored, not archived), of a kind that confirms the gate, and an owner's or administrator's word |
| fails | needs a reason |

| gate | confirmed by | the value names |
|---|---|---|
| power | utility will-serve letter | the kW it commits to; the power path |
| interconnection | will-serve letter or interconnection agreement | the utility; approved import/export, queue, study |
| fiber | carrier quote | the carrier on the quote; `carriers[]`, `symmetric1g`, `lateralMi` |
| control | the route's paper (below) | the route's own facts |
| chips | chip allocation or purchase order | the chipset; GPUs, units, supplier, lead time, delivery |
| offtake | offtake contract or MSA, with the offtake executed | the offtake block |
| economics | never by hand (below) | the economics on file |

A field that is not sent stays as it is, and a field sent blank is cleared
(the site CRM's convention).

A confirmation is checked again on every write. If its document later
leaves the Files, the gate reads **working** with `EVIDENCE_GONE`. One
site's view checks this; a register list trusts the stored state.

### Control: four routes

`diligence.control` holds the route and the route's own terms. The
register's agreements subcollection (`assets.js`) holds the paper, linked
by `agreementId`. A signed agreement's `endDate` and `computePermitted` win
over a typed figure, and any disagreement is said (`TERMS_DIFFER`).

| route | its terms | confirmed by |
|---|---|---|
| own | owner entity | the deed |
| buy | price, deposit, closing date, contingencies | the signed purchase agreement; the deed closes it (`NOT_CLOSED` until then) |
| lease | rent, escalator, term, start/end, renewals, compute (and storage) permitted | the signed lease, which must permit compute |
| takeover | current host, end date or term left, rent or revenue share, consent to assign, the amendment, who keeps the equipment at term end | the assignment **and** the amendment |

Why the takeover needs both: an EVCS-style host agreement limits use to
charging and hands the equipment to the host at term end. Both must be
amended. So a takeover is confirmed only when all of these hold:

- the assignment and the amendment are both on the Files;
- consent to assign is granted (or not required);
- the amendment is signed and permits compute and storage;
- the equipment is kept by the owner or removed, not handed to the host.

Until then the view says `CONSENT_NEEDED`, `HOST_AGREEMENT_CHARGING_ONLY` or
`EQUIPMENT_REVERTS_TO_HOST`.

Changing the route takes a confirmed control gate back to working, because
the confirmation was for the old route.

At wiring, `D.AGREEMENT_TYPES` (`deed`, `purchase_agreement`, `assignment`,
`amendment`) join `assets.js` `AGREEMENT_TYPES`.

### The term check

Control must outlast the offtake term plus the removal window. The end of
control comes from:

- **lease**: the signed lease, else the lease end entered, else start plus
  term, else today plus term (said);
- **takeover**: the signed host agreement, else the end entered, else the
  term left as of a date, else the intake's reported remaining term
  (`TERM_FROM_SNAPSHOT`: a snapshot, not a signed date);
- **own** and **buy**: hold the site for as long as they hold it.

The required end is the offtake start (or **today**, said, when the offtake
has no start date, so the build time before it is not counted), plus the
offtake term (the site's own, else the workspace default), plus
`removalMonths`.

A shortfall is `CONTROL_TERM_SHORT` with the months, for example: "Control
ends 2030-01-01, 40 months before the 6-year offtake term plus the 6-month
removal window ends (2033-04-25)". Renewal options are never counted.

### Power: what the site measured, never what it is rated

On a charger site, the headroom is the service less the chargers'
**measured** peak. The nameplate (`installedKw`, or `chargers.kw`) is never
subtracted and never stands in for a missing peak. With no measured peak the
headroom is unknown, and the view says the nameplate was not used. The
arithmetic is the register's own headroom contract (`power.js headroom()`).

The measured peak is taken in this order:

1. a full year of interval data;
2. a peak typed in diligence with its source (bill, utility, meter or
   network; "nameplate" is refused);
3. the existing peak on the record;
4. a partial interval series (`PEAK_PARTIAL`);
5. the intake's reported power, only once its definition (peak, or a p95
   active-interval average) is resolved by review. Until then it is named
   and not used (`PEAK_DEFINITION_UNRESOLVED`).

The service figure is the binding documented limit (approved import,
service, transformer) where there is one, else the figure typed, else the
record's.

The view also flags:

- dark chargers (`DARK_CHARGERS`: when switched back on, their load comes
  off this headroom);
- an overload;
- peak sources more than 10% apart;
- service figures that disagree;
- a typed nameplate that differs from the record's.

The power gate's **path** decides `availableKw`, the power the compute can
have:

- `existing-service`: the headroom;
- `new-service`: the will-serve kW;
- `interconnection`: the approved import, for a stranded interconnection or
  a half-built project.

### The offtake

The offtake is `{ partner, loiStatus, offtaker, termYears, pricePerGpuHour,
takeOrPayPct, feePct, status, startDate }`.

- The partner, term and fee fall back to the workspace default, and the
  view says which (`defaulted`, `OFFTAKE_DEFAULTS`).
- `partner: false` is a direct deal; blank hands the site back to the
  default.

The offtaker is the parked Compute desk's counterparty shape (from
`wip/compute-desk-2026-10-13`: key, name, contact, settlement, rate basis,
minimum units, technical acceptance, note). Its price, term and status are
the offtake's own fields, so each fact has one home. The desk's own
payload is accepted: `ratePerGpuHour` → `pricePerGpuHour`, `termMonths` →
`termYears`, `status` → `status`. The desk itself is not revived.

A confirmed offtake goes back to working if any of these change: a signed
term, the buyer, or the offtake is no longer executed.

`partners.<partner key>` on the site (`partners.lightsmith`) is read for
the view and never written here: the LOI hand-off is not built.

### Economics and the contract case

Economics is never a person's word.

- **The contract case**, `contractCase(input)`, is being built in a parallel
  session. Once it is on main, the door passes its answer, mapped by
  `D.economicsFromCase`: IRR, ROI, payback, multiple, units, GPUs, and capex
  as units × the unit cost it ran on, plus `priceFor{25,30,55}`. The gate is
  **confirmed** only when the offtake and control are confirmed and the case
  ran on the contract's own price, term and take-or-pay.
- **Until then**, the gate shows the site's `latestModel` (the compute
  model: after-tax IRR, ROI as the multiple less one, payback, skids, total
  project cost), else its `latestProforma` (the pod case). These are
  screening figures, so the gate reads **working** and says so. With
  nothing on file it reads **open**.

Lightsmith's stated returns (25–55%, a payback of about two years) are
`offtake.stated`, `verified: false`. They are shown as the partner's own
claims and never fed into these figures.

### The site survey

Lightsmith's order puts a site survey before *confirmed*. The survey is
`{ state: open|scheduled|done, date, fileId, note }`. A survey is done only
when its report is on the Files.

## What the pages will draw (wired after the data-bug PR)

The pages draw this only when the server's answer says diligence is on.

- **Register** (`portfolio.html`):
  - a pipeline strip with a count per stage (`D.pipeline`);
  - a seven-chip column, one chip per gate, by state;
  - stage and decision columns;
  - filters by stage (a stage, `live`, `passed`) and by gate (`fiber:open`,
    `any:fails`; `D.filterRows`);
  - keyboard triage: **J/K** next/previous, **E** pursue, **P** pass with a
    reason.
- **Tally**: a running total of the pursued sites against Lightsmith's
  $25–35M target (`D.tally`): sites, MW available for compute, compute MW
  placed on the designs, units (and what they are), and capex. Each sum
  says how many sites it covers, because a missing figure is missing,
  never zero.
- **Site record** (`site-crm.html`), a Diligence tab:
  - the seven gates with their evidence;
  - the control-route form and the term check;
  - the chargers and the headroom;
  - the offtake, the survey and the history;
  - Pursue and Pass.

The vocabulary is `D.schema(config)`, so no page keeps its own copy.

## The door (planned)

- **Actions**: `POST /api/site-crm { org, site, action:
  'diligence-<decide|stage|gate|control|offtake|chargers|profile|survey>',
  … }`. Each one:
  1. answers 403 unless `D.enabled(billing)`;
  2. reads the site, its Files and its agreements in a transaction;
  3. runs `D.change` with the caller's role and `canReview` (owner/admin);
  4. writes `diligence`;
  5. audits `sitecrm-diligence-<action>`.
- **One site**: `GET ?site=` adds `diligence: D.view(…)` and `schema`.
- **The register list** adds a row per site (`D.row`), plus `pipeline` and
  `tally`.
- **Tests** in `scripts/test-site-crm.js`: switched off → 403; on → writes
  and audits; confirmed without a document refused. `check:workspace` gets a
  render pass.

## Switching it on

1. Create the workspace in the master console (**New tenant**), with Thomas
   as its only member. The console writes `omega_orgs/solelacapital.com`,
   `billing/current` and `tenant_public`.
2. Dry run. This is offline and in memory, writes nothing, and prints the
   exact write:
   ```bash
   node scripts/enable-portfolio-diligence.js --org solelacapital.com
   ```
3. Apply. This uses `FIREBASE_SERVICE_ACCOUNT`, or a `firebase login`
   session:
   ```bash
   node scripts/enable-portfolio-diligence.js --org solelacapital.com --apply --confirm-org solelacapital.com
   ```
   It refuses in any of these cases:
   - `--confirm-org` does not repeat the org;
   - the seed is missing or invalid;
   - `omega_orgs/{org}` or its `billing/current` does not exist.

   It never creates a tenant, a user, a member or a billing record. It turns
   the flag on and keeps every other override. It adds the seed's lists only
   where the workspace has none, so a re-run changes nothing and an edited
   list stands. It writes one `omega_audit` row
   (`portfolio-diligence-enable`).
4. **Off**: staff set `toolOverrides['portfolio-diligence']` to `false`, or
   remove it. Nothing on the sites is deleted; every action refuses and the
   pages stop drawing it.

## Files

- `api/_lib/portfolio/diligence.js`: the rule.
- `scripts/tests/tdiligence.js`: 20 cases, including one mutation test of
  the document check.
- `scripts/enable-portfolio-diligence.js`: the switch and the seed.
- `tenants/solelacapital/portfolio-diligence.json`: Solela's lists (not
  served).
- `.vercelignore` and `scripts/tests/tdiscreet.js`: the seed stays off the
  site.

## What is not built (honest list)

**Wiring**
- **The door, the pages and the render check.** These are the actions and
  views above, the `test-site-crm.js` cases, the `check:workspace` pass and
  the CLAUDE.md paragraph. They wait for the portfolio data-bug PR to land
  on main.
- **The new agreement types and fields in `assets.js`.** The types are not
  yet in its list. The purchase price, deposit, closing and contingencies
  live on `diligence.control.buy`, not on the agreement record. Consent to
  assign and who keeps the equipment at term end live on
  `control.takeover`.

**Economics**
- **The contract case.** It is not on main. Until it is wired, the economics
  gate shows the compute model or the pod case as screening, and cannot
  reach *confirmed*. `economicsFromCase` is written to the spec'd output
  (`sizing`, `returns`, `priceFor`) and is checked again when the case
  lands.
- **No IRR floor.** No minimum IRR fails the economics gate on its own.

**Out of scope**
- **The Grid Atlas auto-screen** (not in scope). The fiber value carries
  `carriers[]`, `symmetric1g` and `lateralMi`, with a public source, for it
  to land on.
- **The Lightsmith LOI hand-off** (not in scope). The LOI status is typed by
  hand, and `partners.lightsmith` is only read.

**Limits of the checks**
- **Lightsmith's stated terms are unverified.** These are a 6-year standard
  term, 25–55% return, a payback of about two years, and cards in about 36
  weeks. They are recorded as stated and never used as figures.
- **Documents are not read.** A person names what a file is. The library
  checks that the file is on this site's Files, stored and not archived. It
  does not check what the file says.
- **Exclusions match exact recorded values only.** A site with no host
  type, charger use, location type or tag on record is not excluded. Solela's
  lists are a starting point, to edit in its config.
- **The removal window is a setting, not a contract figure.** The six
  months is Solela's own setting. When the offtake has no start date, the
  term is counted from today and the build time before it is not counted;
  the site says so. Renewal options are free text and never counted.
- **A list trusts a stored confirmation.** Only one site's view checks that
  the evidence is still on the Files.
- **The chargers' nameplate can have two copies.** A nameplate typed in
  diligence sits beside the record's `installedKw`. A difference is flagged,
  not reconciled.

**Not changed**
- **No bulk triage.** The keys act on one site at a time.
- **No mail or notifications.**
- **No rules change.** Sites are Admin SDK only.
- **Colleague auto-join is not locked** for `solelacapital.com` (decided for
  now). Thomas is the only member.
