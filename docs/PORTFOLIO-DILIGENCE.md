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
workspace keeps today's portfolio, unchanged. Thomas approved the layout on
2026-10-25 (the mockup in *What the pages will draw*).

| File | What it is |
|---|---|
| `api/_lib/portfolio/diligence.js` | the rule: pure, ES5, no Firestore, no clock |
| `api/_lib/portfolio/grid-screen.js` | the Grid Atlas screen (see below) |
| `api/_lib/portfolio/loi-package.js` | the LOI package (see below) |

`api/site-crm.js` stays the one door that writes the record. The suites
`tdiligence.js` (22 cases), `tgridscreen.js` (8) and `tloipackage.js` (6) run
in `npm test` through `npm run test:portfolio`.

**Where this stands (2026-10-25).** Built: the three libraries, Lightsmith in
`api/_lib/partners.js`, the tests, the enable script and this note. **Not
wired yet:** the door actions, the pages and their render check. They touch
the same files as the open "portfolio site-record data bugs" fix
(clearskyenergy/omega-core#382), so they land after it. The contract case is
open as clearskyenergy/omega-core#381.

## The switch, and who may act

The switch is
`omega_orgs/{org}/billing/current.toolOverrides['portfolio-diligence'] === true`,
literally (`D.enabled(billing)`). Only staff write it, with
`scripts/enable-portfolio-diligence.js`. The register reads
`toolOverrides['portfolio-assets']` the same way. `'true'`, `1`, an add-on
or a `toolAccess` entry does not turn it on.

Where it is off, every diligence action answers 403, the GET answers carry
no diligence, and the pages draw nothing new. Where it is on, the answers
carry the view and the pages draw from it.

Who may act:

- **Any editor of the workspace may make every diligence change**: owner,
  admin or **member** (the door's edit capability; `ctx.canEdit`). That
  covers the call, gates, confirming on a document, control, offtake and
  reversing an exclusion (with a reason). The main session set this on
  2026-10-25: the workspace's one person, tom@solelacapital.com, is a
  member. No diligence change is held back for an owner or administrator.
- **A viewer only reads.**
- **The switch and the enable script are ClearSky staff's.**

## The workspace's own lists

These are Solela's, so they are config and never constants in core
(CLAUDE.md: core is never edited for one tenant). They live at
`billing/current.portfolioDiligence`:

| key | Solela's value | used for |
|---|---|---|
| `intakeTypes` | overbuilt service · operating charging site · dark charging site · stranded interconnection · half-built project · portfolio / estate | what kind of site came in |
| `hostDeals` | ground lease · revenue share · hybrid | how the host is paid |
| `exclusions` | residential charging; amenity-only charging | automatic pass |
| `offtake` | partner Lightsmith Energy, 6-year term, 10% fee; `stated`: Lightsmith's own claims (25–55% return, about a 2-year payback, cards in about 36 weeks), `verified: false` | defaults, the band, the lead time |
| `target` | Lightsmith's target deal, $25–35M | the tally |
| `removalMonths` | 6 | the term check |

The seed is `tenants/solelacapital/portfolio-diligence.json`. `.vercelignore`
keeps it off the site because it carries a partner's terms, as it keeps
`billing.json`; `tdiscreet.js` checks this. `D.validateConfig` checks the
seed and names every problem. `D.normalizeConfig` is what the door reads:
lenient, it drops a bad entry and lists it.

The libraries' code names none of these values (`tdiligence.js` D02,
`tloipackage.js` P06). The workspace's name on the pages is its own record's
name.

## The record: `omega_orgs/{org}/sites/{id}.diligence`

The record is Admin SDK only, like the rest of the site, so no rules change
is needed. Each change is one pure call, `D.change(stored, action, input,
ctx)`, which returns the next record and the event. The door writes both in
one transaction, with its `omega_audit` row. A change that changes nothing
answers `unchanged`, and nothing is written.

The person's actions are `decide`, `stage`, `gate`, `control`, `offtake`,
`chargers`, `profile` (intake type and host deal) and `survey`. The system's
own action is `screen`. `history[]` keeps every change, with who and when,
capped at 200.

### Stages and the call

The order is Lightsmith's: brought-in → screened → **pursue** → loi-sent →
offtake → msa → confirmed, plus **passed**. The keys are the data model's.
The words are the approved mockup's: the pursue stage reads **Earmarked**,
and the call **Earmark** (`STAGE_LABEL`, `CALL_LABEL`). Each forward move
must be earned, and a jump checks every step it skips:

| to | needs |
|---|---|
| screened | power, interconnection and fiber each past *open* |
| pursue (Earmarked) | the call: Earmark (E) |
| loi-sent | the LOI recorded as sent (the LOI package does it) |
| offtake | an offtaker named, on a term sheet or executed |
| msa | the offtake gate confirmed (the contract on the Files) |
| confirmed | every gate confirmed, economics included, and the site survey done with its report on the Files |

A move back needs a note of at least five characters. A move back before
Earmarked also clears the earmark, so the stage and the call always agree.

The calls:

- **Pass** (P) needs a reason, and the stage it was passed from is kept.
- **Reopen** goes back no further than screened.

### Exclusions

An exclusion is one of the workspace's rules, matched on a **recorded**
value: `hostType`, the intake's `locationType`, `tags`, `chargers.use` or
`intakeType`. It matches exact values, ignoring case, and never guesses
from a longer phrase.

A matched site is passed by the rule. This is derived at read time and
never stored. Its reason and the field and value it matched are shown, and
a corrected fact lifts it.

Any editor may reverse an exclusion with a reason. The reversal is kept in
`exclusionOverrides.<rule>` (who, their role, when, why, and what the rule
matched on) and stands through later changes.

### The seven gates

The gates are power · interconnection · fiber · site control · chips ·
offtake · economics. On the register their short names are Pwr · IX · Fbr ·
Ctl · Chip · Off · $. Each one is `{ state, value{}, source,
evidenceFileId, by, at }`.

| state | shown as | rule |
|---|---|---|
| open | Open, grey | nothing checked yet |
| screened | Screened, blue (chips: **Chosen**) | **public data only**, `source.kind` `public`; chips may also rest on the sizing (`model`) |
| working | **In progress**, amber | in hand with a counterparty |
| confirmed | Confirmed, green | a **document on the site's Files** (stored, not archived), of a kind that confirms the gate |
| fails | Fails, red | needs a reason |

| gate | confirmed by | the value names |
|---|---|---|
| power | utility will-serve letter | the kW it commits to; the power path |
| interconnection | will-serve letter or interconnection agreement | the utility; approved import/export, queue, study |
| fiber | carrier quote | the carrier; `carriers[]`, `symmetric1g`, `lateralMi` |
| site control | the route's paper (below) | the route's own facts |
| chips | chip allocation or purchase order | the chipset; GPUs, units, supplier, lead time, delivery |
| offtake | offtake contract or MSA, with the offtake executed | the offtake block |
| economics | never by hand (below) | the economics on file |

A field that is not sent stays as it is, and a field sent blank is cleared.
A confirmation is checked again on every write. If its document later
leaves the Files, the gate reads In progress with `EVIDENCE_GONE` (one
site's view checks this; a register list trusts the stored state).

**The card's words.** For every gate, `view().lines` gives the card's one
sentence, its source line, and the one next action where there is one. The
mockup's wording for the power gate, for example, is "800 kW service, 350
kW peak, so 450 kW free · 69 kV substation 1.4 mi", with the source line
"Site facts · Grid Atlas". The next action has the form `{ key, label,
task, moves }`, for example "Log will-serve request". The door logs the
task and moves the gate to In progress. Anything not on the record says
so.

### Control: four routes

`diligence.control` holds the route and the route's own terms. The
register's agreements (`assets.js`) hold the paper, linked by
`agreementId`. A signed agreement's `endDate` and `computePermitted` win
over a typed figure, and any disagreement is said.

| route | its terms | confirmed by |
|---|---|---|
| own | owner entity | the deed |
| buy | price, deposit, closing date, contingencies | the signed purchase agreement; the deed closes it (`NOT_CLOSED` until then) |
| lease | rent, escalator, term, start/end, renewals, compute (and storage) permitted | the signed lease, which must permit compute |
| takeover | current host, end date or term left, rent or revenue share, consent to assign, the amendment, who keeps the equipment at term end | the assignment **and** the amendment |

An EVCS-style host agreement limits use to charging and hands the equipment
to the host at term end, so both must be amended. A takeover is confirmed
only when all of these hold:

- the assignment and the amendment are both on the Files;
- consent to assign is granted (or not required);
- the amendment is signed and permits compute and storage;
- the equipment is not handed to the host.

Changing the route takes a confirmed control gate back to In progress.

### The term check

Control must outlast the offtake term plus the removal window. The end of
control comes from:

- **lease**: the signed lease, else the end entered, else start plus term,
  else today plus term (said);
- **takeover**: the signed host agreement, else the end entered, else the
  term left as of a date, else the intake's reported remaining term (a
  snapshot, said);
- **own** and **buy**: hold the site for as long as they hold it.

The required end is the offtake start (or **today**, said, when there is no
start date, so the build time is not counted), plus the offtake term, plus
`removalMonths`. A shortfall is `CONTROL_TERM_SHORT` with the months.
Renewal options are never counted.

### Power: what the site measured, never what it is rated

On a charger site, the headroom is the service less the chargers'
**measured** peak, through the register's own `power.js headroom()`. The
nameplate is never subtracted and never stands in for a missing peak.

The measured peak is taken in this order:

1. a full year of interval data;
2. a peak typed in diligence with its source ("nameplate" is refused);
3. the existing peak on the record;
4. a partial interval series;
5. the intake's reported power, only once its definition is resolved.

Disagreements, dark chargers and overloads are flagged.

The power gate's path decides `availableKw` (the mockup's "kW free"):

- `existing-service`: the headroom;
- `new-service`: the will-serve kW;
- `interconnection`: the approved import, for a stranded interconnection or
  a half-built project.

### The offtake

The offtake is `{ partner, loiStatus, offtaker, termYears, pricePerGpuHour,
takeOrPayPct, feePct, status, startDate }`.

- **Defaults.** The partner, term and fee fall back to the workspace's
  defaults, and the view says which. `partner: false` is a direct deal.
- **The offtaker.** It is the parked Compute desk's counterparty (key, name,
  contact, settlement, rate basis, minimum units, acceptance, note). Its
  price, term and status are the offtake's own fields. The desk's payload
  is accepted (`ratePerGpuHour`, `termMonths`), and the desk is not revived.
- **Confirmation.** A confirmed offtake goes back to In progress if any of
  these change: a signed term, the buyer, or the offtake is no longer
  executed.

### Economics and the contract case

Economics is never a person's word. The contract case is `contractCase`,
in clearskyenergy/omega-core#381 (`api/_lib/compute-contract.js`), and its
own output is read through `D.economicsFromCase`:

- `returns`: project IRR, ROI, payback, multiple, IRR without the fee,
  revenue and partner fee a year, all in **percents**. It is null until the
  contract has a price.
- `capex.total`
- `sizing`: units, GPUs, `itKw`, and `byChipset`, which gives the sizing
  chips with the chosen one marked.
- its echo of the contract terms
- `priceFor`
- the price **`ladder`**: the slider's rows, each banded by `D.ladderOf`
  against the partner's stated range ("Inside Lightsmith Energy's 25–55%
  range (as stated, unverified)").

So the page does no arithmetic.

| gate | when |
|---|---|
| open | nothing on file |
| screened | screening figures: the compute model, the pod case, or a contract case not on the offtake's own terms (or with no price yet) |
| working | the contract case on the offtake's own price, term and take-or-pay, before the offtake and control are confirmed |
| confirmed | the contract case on the confirmed offtake and control |

Until the case is wired, the gate shows the site's `latestModel`, else its
`latestProforma`.

### The site survey

`{ state: open|scheduled|done, date, fileId, note }`. A survey is done only
when its report is on the Files.

## The Grid Atlas screen (`grid-screen.js`)

`screen.js` beside it is the customer portfolio's BESS screening
disposition, so this library has its own name. It reads public data through
the platform's **own** server code. The door invokes each handler
in-process with the caller's headers, the `api/portfolio-enrich.js`
pattern, so every handler runs its own sign-in and plan gate:

- **`/api/grid-atlas`**: the point, geocoded from the address, and the
  nearest substation's name, kV and distance in miles.
- **`/api/network-proximity`**: fiber at the point.
  - Carrier names come from FCC broadband data and need `FCC_BB_KEY`, which
    is not set. Without it the screen says "carrier names need the FCC
    key", never "no fiber".
  - 1 Gbps symmetric is read off the speeds.
  - The carrier hotel is PeeringDB's nearest facility with 100+ networks.
  - It also gives the lateral estimate.
- **`/api/hosting-capacity`** (as a load): the serving utility by territory
  and, where the utility publishes it (ComEd and the registry's others),
  the circuit's load hosting figure.
- **The rate book by ZIP** (`api/_lib/utility-rates`): used only when the
  territory names no utility, and never its fallback or a state default
  (the book answers PG&E for a Los Angeles ZIP).

It never reads the three geodataviewer layers that `docs/FIBER-AUDIT.md`
calls fabricated (no server endpoint does), or a licensed vendor's geometry.

**How a screen runs.** `api/site-crm.js` has 60 seconds a call. The grid
(up to about 38 s) and the network (up to about 34 s) together can exceed
that, so a site is screened in **two phases**: `grid`, then `network` (fiber
and hosting in parallel). A many-site screen is a **job** (the register's
`site_jobs`), one phase a step, resumable. With the key set, FCC lookups
count against the deployment's daily allowance (`FCC_DAILY_CAP` 90, under
the FCC's 100 a day an IP). When it is used up, the network check is
skipped and the note says when the names come.

**Where the answer goes.** It is `diligence.screen { located, power{substation, kv,
distanceMi}, fiber{carriers[], symmetric1g, lateralMi, carrierHotelMi, …},
hosting, utility, at, sources, notes, errors }`. `D.change('screen')` moves
gates to **Screened**, never Confirmed:

- power, on the substation at a usable point;
- interconnection, only on a published hosting figure (a utility alone is
  not a screen of it);
- fiber, only on carriers read at the address (a hotel or a lateral alone
  is not).

It never moves a gate a person took further. It refreshes only a gate it
screened itself (`source.screen`), and an approximate address screens
nothing.

## The LOI package (`loi-package.js`) and Lightsmith in `partners.js`

**Who it goes to.** Lightsmith is in `api/_lib/partners.js` the Terra way:
its address comes from `LIGHTSMITH_ENERGY_EMAIL`, else
`fin_settings/dealroom.orgs.lightsmith`, never a constant. No address means
409 and nothing is mailed. It carries `loiPackage`: it is sent one package
for many sites, never the one-site partner mail. The partner a workspace
sends to is its config's `offtake.partner`.

**What it carries.** One package for the earmarked set (`L.select`): each
site's location, power for compute and its basis, the substation, the
utility, the compute (units, GPUs, kW and chipset, from the contract case,
the chosen chips, the compute model or the design), the fiber, and the
control route with its term and any shortfall. It also carries the totals
and the chip mix. It **never** carries the workspace's IRR, capex, cost
basis or price.

**How it is sent.** The package id is one per set and day, so a second
press is the same package. The mail is one table. Names are escaped, and
every blank reads as not on file. After it is mailed, `L.sent` records the
LOI as sent and moves each site to LOI sent by the diligence's own rules,
and returns the `partners.<key>` record. Nothing moves if nothing was
mailed. There are at most 100 sites a package and 5 packages a day.

## What the pages will draw (the approved mockup)

The rows in the mockup are samples. The pages show real data only. The
pages draw this only when the server's answer says diligence is on.

- **Stage strip:** a count for each of Brought in, Screened, Earmarked, LOI
  sent, Offtake, MSA and Confirmed (`D.pipeline`).
- **Tally card**, under the workspace's own name (`D.tally`):
  - the earmarked sites, MW, skids and capex;
  - a bar against the target band from config;
  - **Send LOI package to** *partner*;
  - **Open** *workspace* **view** (the earmarked sites only).

  Each sum says how many sites it covers.
- **Pipeline table:**
  - the site with "N kW free · N skids";
  - the seven chips in their colours;
  - the IRR (contract case, else the screening figure);
  - the stage: an Earmarked pill, Passed with its reason, or an Earmark
    button;
  - **Screen with Grid Atlas** (the job);
  - the legend with **J/K** next/previous, **E** earmark, **P** pass.
- **Site diligence card** (the register's side panel, and the site record's
  Diligence tab):
  - the header: kW free, skids, chip, the stage pill, Pass, Next site →;
  - the seven gate rows, each with its pill, sentence, source line and
    action (`lines`);
  - the sizing chips, one a chipset (`sizing`);
  - the economics block: the contract-price slider over the server's
    `ladder`, showing project IRR, payback, cash multiple and ROI over the
    term, the band sentence, and capex, revenue a year, partner fee a year
    and IRR without the fee.

`D.schema(config)` carries the vocabulary, so no page keeps its own copy.

**Land first** what Thomas will use first (the main session's order): the
intake type, the chargers, the four control routes, the seven gates, and
Earmark/Pass, in the register and on the site record. Then, in the same PR:
the stage strip, the tally, the screen, the LOI package and the keys.

## The door (planned)

- **Actions**: `POST /api/site-crm { org, site, action:
  'diligence-<decide|stage|gate|control|offtake|chargers|profile|survey>', … }`.
  Each one:
  1. answers 403 unless `D.enabled(billing)`;
  2. needs edit (a viewer is refused);
  3. reads the site, its Files and its agreements in a transaction;
  4. runs `D.change`;
  5. writes `diligence`;
  6. audits `sitecrm-diligence-<action>`.
- **The screen**: `diligence-screen-start {ids}` and `diligence-screen-step
  {jobId}` on `site_jobs`. Each step runs one phase of one site with the
  handlers bound to the caller's headers, applies `D.change('screen')`, and
  counts FCC lookups on a deployment-wide daily counter.
- **The LOI package**: `diligence-loi {ids?, note?}`. In order:
  1. it reads the config's partner;
  2. it answers 409 when there is no address;
  3. it claims the package id in a transaction;
  4. it sends one mail, with the sender in copy;
  5. if the mail went, then per site: `L.sent`, `partners.<key>` and an
     audit row;
  6. it keeps the `partner_requests` record.

  The one-site `send-to-partner` refuses a partner with `loiPackage`.
- **A gate's next action**: logs the task (the site CRM's `log`, type
  task, on Today) and applies the gate move.
- **One site**: `GET ?site=` adds `diligence: D.view(…)` with the Files,
  agreements and contract case, plus `schema`.
- **The register list** adds a row per site (`D.row`), plus `pipeline` and
  `tally`.
- **Tests** in `scripts/test-site-crm.js`: switched off → 403; a member
  writes and it is audited; confirmed without a document refused; a viewer
  refused. `check:workspace` gets a render pass.

## Switching it on

1. Create the workspace in the master console (**New tenant**). Done
   2026-10-25: `omega_orgs/solelacapital.com`, enterprise, with Thomas as a
   member.
2. Dry run. This is offline and in memory, writes nothing, and prints the
   exact write:
   ```bash
   node scripts/enable-portfolio-diligence.js --org solelacapital.com
   ```
3. Apply. The main session does this after the PR merges and deploys:
   ```bash
   node scripts/enable-portfolio-diligence.js --org solelacapital.com --apply --confirm-org solelacapital.com
   ```
   It refuses in any of these cases:
   - `--confirm-org` does not repeat the org;
   - the seed is missing or invalid;
   - `omega_orgs/{org}` or its `billing/current` does not exist.

   It never creates a tenant, user, member or billing record. It turns the
   flag on and keeps every other override. It adds the seed's lists only
   where the workspace has none, and it writes one audit row.
4. **Lightsmith's address**: set `LIGHTSMITH_ENERGY_EMAIL` in Vercel (or
   `fin_settings/dealroom.orgs.lightsmith`). Until then the LOI package
   refuses with 409 and mails nothing.
5. **Off**: staff set `toolOverrides['portfolio-diligence']` to `false`.
   Nothing on the sites is deleted.

## What is not built (honest list)

**Wiring**
- **The door, the pages and the render check.** These are the actions,
  views, job and package send above, the `test-site-crm.js` cases, the
  `check:workspace` pass and the CLAUDE.md paragraph. They wait for #382 to
  land on main.
- **The new agreement types and fields in `assets.js`.** The types
  `deed`, `purchase_agreement`, `assignment` and `amendment` are not yet in
  its list. Purchase terms, consent and the end-of-term equipment live on
  `diligence.control`.

**Data not on hand yet**
- **The contract case** is not on main. Until it is, economics is screening
  figures, the slider has no ladder, and Confirmed is unreachable.
- **Carrier names** need `FCC_BB_KEY` in Vercel. Without it fiber stays
  Open after a screen, with the carrier hotel and the lateral estimate
  shown and the key named.
- **Hosting figures** exist only where the utility publishes them. Most
  sites keep interconnection Open after a screen, with the utility named.

**Limits of the checks**
- **Lightsmith's stated terms are unverified.** They are recorded and shown
  as stated. They band the slider and give the lead time, and are never
  used as figures.
- **Documents are not read.** A person names what a file is. The library
  checks it is on this site's Files, stored and not archived.
- **Exclusions match exact recorded values only.** A site with nothing
  recorded is not excluded.
- **The removal window is a setting, not a contract figure.** The six
  months is Solela's. The term is counted from today when the offtake has
  no start date. Renewal options are never counted.
- **A list trusts a stored confirmation.** Only one site's view checks that
  the evidence is still on the Files.
- **The chargers' nameplate can have two copies.** One typed in diligence
  sits beside the record's `installedKw`. A difference is flagged, not
  reconciled.

**Not changed**
- **No bulk triage.** The keys act on one site at a time.
- **No mail beyond the LOI package**, and no notifications.
- **No rules change.** Sites are Admin SDK only.
- **Colleague auto-join is not locked** for `solelacapital.com` (decided for
  now).
