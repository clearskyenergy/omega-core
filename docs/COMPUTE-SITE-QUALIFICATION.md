# Compute site qualification — the SOQ baseline

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Written 18 September 2026. This is the front-of-funnel package a rep works
from on day one: what a site has to have, how to classify the host, what to
ask, and what to say when they push back.

**It is the same model the software runs.** The gates, the tranche rule and
the offer band in this document are `api/compute-lease.js`, and the tool that
renders them is `/compute-proposal.html`. If you change one, change the other
in the same pass — a playbook that disagrees with the tool is worse than
either alone, because a rep will trust whichever they read last.

Everything here is a **baseline to start from**, not a finished position. The
lease numbers in particular are a seed; see *Where the numbers come from*.

---

## 1 · Minimum site requirements

Four gates. A site passes only if **all four** hold. This is the list that has
held since the Compute Economics Discussion on 3 September.

| Gate | Requirement | Who can answer it |
|---|---|---|
| **Power** | ~1 MW available, with a utility will-serve or a clear path to one | The utility. Nobody else. |
| **Fiber** | 1 Gbps **bidirectional** | A carrier, in writing |
| **Zoning** | Commercial or industrial, on the exact area where the equipment sits | The jurisdiction |
| **Site control** | Identified owner or controller willing to sign a 15-year lease | The host |

### Fiber is the hard gate

A site without 1 Gbps bidirectional **is not a compute site**, regardless of
how good the power is. The five-acre Illinois site failed on exactly this and
nothing about its power rescued it. The tool refuses to price a lease on a
site that fails this gate, and so should you.

Two ways to clear it, and the host's is better than ours:

- **Service on site today** at ≥ 1 Gbps symmetric. Get the provider, the
  down/up speeds and the **current monthly cost** — a photo of the bill is
  enough. This is the gate, cleared.
- **No service, but reachable.** Grid Atlas's Network Proximity returns a
  verdict — *likely / plausible / uncertain / unlikely* — and a lateral
  estimate at $45k–$250k per mile. That is a **path** to the gate, not the
  gate. The lease carries the amortised cost of the trench, so the rent on
  those sites comes in lower. Capture a **budgetary quote** to bring service
  in, or we are guessing at our own cost. The tool uses that quote **in place
  of** the per-mile estimate — quoting a $45k–$250k band over the top of a
  real number the host already has in an email loses an argument you had
  already won.

> ⚠ Fiber strand count beyond 1 Gbps bidirectional is still undefined. Open
> question from the same meeting. Do not promise a strand count.

### Power

The gate is ~1 MW with a will-serve, or a clear path to one. What to capture:

- **Available load in kW or MW at the meter** — and whether that is the meter
  today or the size of the service. A hard ceiling under 1 MW kills the site;
  an upgrade path to 1 MW keeps it alive.
- **Will-serve status**: not asked / requested and pending / confirmed /
  declined. Opening a will-serve request is free and it is the long pole.
  Open it on every site you are serious about, early.
- **Utility and service territory** — PJM, CAISO/PG&E, FPL, ComEd, ERCOT.
  This drives the revenue stack, not just the interconnection.

**What Grid Atlas can and cannot tell you.** It measures distance to the
nearest substation, its voltage class and distance to transmission. That is
*proximity*, and it tells you whether an upgrade is buildable. It is **not
hosting capacity** — how many kW the feeder actually has left is a number only
the utility holds. Never present one as the other. A 138 kV substation across
the road and a full feeder are entirely compatible facts.

### Zoning

Commercial or industrial is the gate case. What to capture:

- The zoning of the **exact parcel and area where the compute would go** — not
  the parcel headline, and not the neighbour's.
- Whether it is commercial/industrial (ideal), mixed-use/PUD (workable, read
  it against the plan), agricultural (usually a conditional use — that is
  time, not a refusal), or residential (stop).

Agricultural and PUD sites are not disqualified. They cost schedule. Ask the
AHJ what a conditional use permit costs and how long it takes, and budget it
into the **timeline**, not the rent.

**What the jurisdiction says outranks the code, in both directions.** The
model reads a zoning string against a pattern table; a planner reads the
ordinance. So `zoningUseStatus` overrides: a written *prohibited* fails a
parcel the table likes, and a written *permitted* retires the conditional-use
schedule risk on a PUD or an ag parcel and lifts it to a pass. Nothing
rescues residential, and silence changes nothing — not asking is never a
failure.

### Site control

- Who owns or controls the site, and is our contact the owner, a tenant, or an
  option holder?
- Will they sign a land lease or space use agreement?
- **What term will they consider?** We price 15 years.
- What area can be carved out? We price a minimum of 0.5 acres — pad,
  clearances, transformer and access.

A host who will sign five years is not a smaller version of this deal. The
containers cannot be financed against a five-year ground lease. Test a
15-year term with renewal options, or an initial term plus two five-year
extensions, before you write the site off.

---

## 2 · Tranche mapping

The tranche is about **what the host will give**, not how good the site is. A
perfect site with a landlord who wants rent and nothing else is Tranche 1, and
that is a good outcome, not a downgrade.

| Tranche | The host | What they give | What they get |
|---|---|---|---|
| **1 · Simple land lease** | Wants rent, minimal education, fastest to signature | Space, power, fiber | Market-rate ground lease |
| **2 · Energy + compute** | Engaged, open to a deeper structure on their asset | Space, power, fiber, **rights to improve the asset** — canopies, on-site generation, storage | Lease at a premium, plus the improvements |
| **3 · Meter transfer** | Passive owner who will hand over the meter and operational control | All of the above, **plus the meter** | The highest consideration of the three |

The direction matters and it is the sales story: **the more you give us, the
more you get.** Tranche 3 is the premium position, not the fallback.

### The three questions that classify a prospect

These are the only data points a rep needs to capture to place a host. They
are fields in the tool and the tool will not guess without them.

| Field | Ask it like this | Answers |
|---|---|---|
| `meterPosture` | "Would you keep the meter in your name, share it, or hand it over entirely?" | keep → T1 · share → T2 · transfer → **T3** |
| `openToEnergyStructure` | "Would you be open to us putting solar canopies, generation or storage on the property as part of this?" | yes → **T2** · no → T1 |
| `hostEngagement` | "Do you want to be involved in how the site is run, or do you want a cheque and no phone calls?" | passive → T1 · engaged → probe for T2 |

**An unasked question prices at the Tranche 1 floor, never the premium.** That
is deliberate: not asking can cost us upside, but it can never over-commit a
rep in the room.

---

## 3 · Discovery question set

Hard-code these as fields. Anything not answered comes back **unconfirmed** —
never as a failure — and lands on the tool's call list.

### Front of funnel — the two-minute version

1. Site address (with **city and state**; without them the geocoder picks one
   of the dozens of streets with that name rather than admitting it cannot
   tell, and the whole screen measures the wrong place)
2. ZIP and utility / service territory
3. Available load — kW or MW
4. Fiber on site? Provider, speed, monthly cost
5. Zoning of the area where the equipment would go
6. Who owns or controls the site
7. Parking / pad space available

That is enough to run a screen and produce an indicative lease range.

### Full capture — the fields behind the gates

**Power** — available MW · will-serve status · utility · service territory ·
existing demand at the meter (if any) · transformer capacity

**Fiber** — service on site yes/no · down Mbps · up Mbps · monthly cost ·
provider · budgetary quote to bring service in (where there is none)

**Zoning** — zoning code · classification · jurisdiction / AHJ · whether the
use is permitted, conditional or prohibited

**Site control** — owner of record · our contact's role (owner / tenant /
option holder) · willing to lease yes/exploring/no · maximum term · leasable
acres · existing encumbrances

**Tranche** — meter posture · open to energy structure · engagement

**Commercial** — decision maker · timeline · other parties talking to them

All of the above are **live fields** on `/compute-proposal.html` as of rate
card v1 / build `compute-lease-v2.capture`. Two of them are answers that move
a gate — `zoningUseStatus` and `fiberLateralQuote`, above. The rest are
context: they are echoed back on the response under `capture`, they are saved
with the site, and the empty ones land on the call list. None of them can fail
a site on its own, which is the point — a screen that never asks who signs
produces a beautifully qualified site with no path to a signature.

---

## 4 · FAQ baselines

Answers a rep can use as-is. Tune the language, keep the substance.

**"What does this cost me?"**
Nothing. There is no capital contribution and no operating obligation. We pay
for the equipment, its installation, the electrical interconnection and any
utility upgrade, bringing fiber to the pad, the power the equipment consumes,
insurance, permitting, maintenance and monitoring — and the removal and
restoration at the end of the term.

**"What do I get paid?"**
A market-rate ground lease with a fixed annual escalator, paid monthly,
beginning at commercial operation. If you are willing to let us improve the
asset further — canopies, on-site generation, storage — or to take the meter,
the consideration goes up from there. *(Quote the number the tool produces for
that specific site. Open at base. Do not quote the ceiling.)*

**"What are you actually putting on my property?"**
Modular compute equipment in standard shipping-container enclosures on a small
fenced pad, with a transformer and a fiber connection. It is unstaffed, it is
quiet, and it takes about the footprint of two parking spaces per unit.

**"How long is the commitment?"**
15 years, with renewal options. A shorter term is not a smaller version of
this deal — the equipment cannot be financed against it, which is why the term
is the one point we hold firm on.

**"Does this affect my power bill or my operations?"**
No. Our load sits behind its own meter or an agreed submeter, so your bill is
unchanged. Access for service visits is the only call on your time.

**"What happens at the end?"**
We remove the equipment and restore the pad, at our cost. That obligation is
written into the lease.

**"Who are you, exactly?"**
ClearSky screens and sites. Development and financing are carried by our
consortium partners. Be straight about this — a host who finds out later that
the counterparty on the lease is a different entity will treat everything else
you said as equally loose.

> ⚠ Do not quote container capital cost. The ~$40M figure for a 20-ft compute
> container is internally flagged as unverified and must not go in front of a
> partner or a host until it is checked.

---

## 5 · How to run a site through the tool

Two doors into the same screen, the same model and the same proposal:

- **`/compute-proposal.html`** — *Compute Land Lease* in the Sales category.
  Start here when the site is an address on a list.
- **Site Map editor → Compute tab → 3 · Size & Cost → Land Lease.** Start here
  when the site is already on the drawing; it screens the point on screen and
  you never retype the address.

Both run the same four gates and print the same document, carrying **your**
company's name and logo rather than ClearSky's. The steps below are written
for the standalone tool; the editor panel is the same fields in one modal.

1. Type the address with city and state. Press **Screen this site**.
2. Three services run in parallel and each reports separately: Grid Atlas
   (substations, voltage, transmission), Network Proximity (the fiber verdict
   and lateral estimate), and the county parcel record (zoning, owner,
   acreage). Zoning and owner prefill from the parcel — **your value always
   wins**, because you are looking at the site and the county layer is looking
   at a database that was right in 2019.
3. Fill in what you heard in the room. Each edit re-scores instantly against
   the evidence already gathered; it does **not** re-run the lookups.
4. Read the **Screen** tab: four gate cards, the verdict, the tranche, the
   lease band, and *What closes this site* — the call list.
5. Switch to **Proposal** for the four-page host-facing document. Print to PDF.

### Reading the offer band

| Band | What it is |
|---|---|
| **Hold at** (low) | The floor. Below this, walk. |
| **Open at** (base) | The opening number. This is what goes on the proposal. |
| **Ceiling** (high) | Internal only. A site that clears every gate on *evidence* rather than on a promise. |

The proposal defaults to showing the host **the opening number alone**. A host
who sees the top of the band has already been given it. The *whole band*
option exists for an internal review copy and is labelled as such.

### What the tool will not do

- It will not price a lease on a site that **fails the fiber gate**. No number
  appears at all, because a number on a page is a number a rep says out loud.
- It will not classify a tranche nobody asked about. It names the three
  questions instead.
- It does not treat an **unanswered question as a failure**. Unanswered drops
  the site to *indicative* and lands on the call list.

---

## 6 · Where the numbers come from

The lease is built from two components, because a host recognises two
different things and pricing on only one of them loses the argument:

- **Pad rent** — ground rent on the fenced area, priced as a commercial or
  industrial pad site rather than farmland. It floors the deal: a 20-ft
  container is a tiny footprint and an acreage-only price on it comes out at a
  number no host would sign.
- **Capacity rent** — priced per kW-year of contracted load. This is what the
  host is actually selling. The scarce thing is not the dirt, it is an
  energised service the utility will serve at ≥ 1 MW with a meter behind it.

Then: a **site-quality adjustment** from the power, zoning and control gates;
a **tranche premium**; and, where fiber is reachable rather than present, the
**amortised lateral** deducted and capped so a bad trench can never drive the
rent to zero. Escalating annually over the term.

### ⚠ The rate card is a seed, not a comp set

The bands in `api/compute-lease.js` are a defensible build-up. They are **not
verified market comparables.** They sit in one versioned block at the top of
the file and the version rides on every response, so any proposal can be
traced back to the numbers that produced it.

**Before these are quoted as ClearSky's commercial position**, replace them
with real comps and bump `RATE_CARD.version`. A proposal sitting in somebody's
inbox has to be attributable to a version.

The bands themselves are **staff-only**. A tenant rep gets the offer range and
the version — everything they need in the room, and nothing they could take to
a competitor. Staff get the full build-up, because staff are the ones who have
to defend it.

---

## 7 · Document artifacts — state of play

| Artifact | State |
|---|---|
| Quick SOQ intake (front-of-funnel, §3) | **Live** — the left panel of `/compute-proposal.html` |
| Full §3 capture set as fields, saved per site | **Live** — utility, territory, ZIP, carrier, lateral quote, AHJ, use status, pad description, encumbrances, and the three commercial questions |
| Four-gate screen with evidence and call list | **Live** — the Screen tab |
| Indicative land lease range, 15-year | **Live** — on a seed rate card |
| Four-page host-facing proposal, print/PDF | **Live** — the Proposal tab, and from the editor's Compute panel |
| Proposal carries the tenant's logo, name and accent colour | **Live** — resolved from your `omega_orgs` record. If your logo or brand colour is missing, set it in Account Settings; the proposal falls back to the platform wordmark rather than guessing. |
| Registry published so tenants see the tool | Admin console → **Import / Update Applications**. Run `npm run tools:dry` first to see what that button would change — it publishes all 44 tools and reverts any Firestore-side edits back to the seed. |
| Detailed 32-category site assessment | **Not built.** Ravi is merging the two spreadsheets into one; nothing in Omega covers the deep assessment yet. |
| Saved per-site records, pipeline view | **Partial** — the tool saves the last site per org via the standard `toolData` contract. There is no multi-site register on this tool yet; `clearsky-sitefinder.html` is the nearest thing. |

Two things are honestly outstanding and should be said out loud rather than
implied:

1. **The 32-category assessment is not in Omega.** When the merged spreadsheet
   lands, its categories become a second tab on this tool — the simple version
   qualifies, the detailed version underwrites. Scope it off the real sheet,
   not off this list.
2. **There is no per-site register on this tool.** A rep screening twenty
   sites gets twenty screens and one saved record. That is the next build, and
   it is a small one: the tool already produces a structured result per site.

---

## 8 · Related

- `api/compute-lease.js` — the gate model, the tranche rule, the rate card and
  the tenant branding that goes on the proposal
- `omega-compute-lease.js` — the shared client: the three-way fan-out and the
  four-page proposal, used by both surfaces so they cannot drift
- `compute-proposal.html` — the standalone tool
- `editor.html` Patch 130 (`OmegaLeasePanel`) — the Compute panel door
- `scripts/test-compute-lease.js` — 94 checks over the gates, the hard gate,
  the tranche and the arithmetic. In `npm test`.
- `api/grid-atlas.js` — substations, voltage, transmission
- `api/network-proximity.js` — the fiber verdict and lateral estimate
- `api/parcel.js` — zoning, owner, acreage
- `docs/GRID-ATLAS-V2-README.md`, `docs/FIBER-AUDIT.md`
