# Modular compute siting — partner brief

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Written 18 September 2026. This is the **outward-facing** cut of
`docs/COMPUTE-SITE-QUALIFICATION.md`, for a lead-generating partner who is
bringing us sites rather than pricing them.

**What is different from the staff document, and why.** `api/compute-lease.js`
says the rate-card build-up is staff-only: a partner gets the offer range and
the rate-card version, which is everything needed in a conversation with a
host and nothing that could be taken to a competitor. So this brief carries
the **output** of the model — $/acre-year, $/MW-year — and not the per-kW and
per-acre components that produce it, the tranche multipliers, or the quality
and lateral adjustments. Keep it that way when this is forwarded.

If the gates, the tranche rule or the bands change in `api/compute-lease.js`,
change this file and `docs/COMPUTE-SITE-QUALIFICATION.md` in the same pass.

---

## 1 · The four gates

A site is a compute site only if **all four** hold. Anything that misses one
is not a smaller opportunity — it is a different opportunity.

| Gate | Requirement | Who can actually answer it |
|---|---|---|
| **Power** | ~1 MW available, with a utility will-serve or a clear path to one | The utility. Nobody else. |
| **Fiber** | 1 Gbps **bidirectional** | A carrier, in writing |
| **Zoning** | Commercial or industrial, on the exact area where the equipment sits | The jurisdiction |
| **Site control** | Identified owner or controller willing to sign a **15-year** lease | The host |

### Fiber is the hard gate

A site without 1 Gbps bidirectional **is not a compute site**, however good the
power is. A five-acre Illinois site failed on exactly this and nothing about
its power rescued it. The screening tool refuses to produce a lease number at
all on a site that fails this gate, deliberately — a number on a page is a
number somebody says out loud.

Two ways to clear it, and the host's is the better one:

- **Service on site today** at ≥ 1 Gbps symmetric. Capture the provider, the
  down/up speeds and the **current monthly cost** — a photo of the bill is
  enough. That is the gate, cleared, and no map beats it.
- **No service, but reachable.** Our screen returns a verdict — *likely /
  plausible / uncertain / unlikely* — and a lateral construction estimate at
  **$45k–$250k per mile**. That is a **path** to the gate, not the gate. The
  lease carries the amortised cost of that trench, so rent on those sites
  comes in lower. Get a **budgetary quote** to bring service in, or we are
  guessing at our own cost.

Fiber strand count beyond 1 Gbps bidirectional is still an open question
internally. **Do not promise a strand count.**

### Power — the will-serve letter is the long pole

The gate is ~1 MW with a will-serve, or a clear path to one. Capture:

- **Available load in kW or MW at the meter** — and whether that is the meter
  today or the size of the service. A hard ceiling under 1 MW kills the site;
  an upgrade path to 1 MW keeps it alive.
- **Will-serve status**: not asked / requested and pending / confirmed /
  declined. Opening a will-serve request is **free** and it is the longest
  lead item on the whole project. Open it early on every site worth having.
- **Utility and service territory** — PJM, CAISO/PG&E, FPL, ComEd, ERCOT.
  This drives the revenue stack, not just the interconnection.

One distinction worth holding onto: our grid screen measures **proximity** to
substations, voltage class and transmission. That tells you whether an upgrade
is buildable. It is **not hosting capacity** — how many kW the feeder actually
has left is a number only the utility holds. A 138 kV substation across the
road and a full feeder are entirely compatible facts. Never present one as
the other.

### Zoning — read the pad, not the parcel headline

Commercial or industrial is the gate case. Capture:

- The zoning of the **exact parcel and the exact area where the compute would
  go** — not the parcel headline, and not the neighbour's.
- Which of: commercial/industrial (ideal) · mixed-use/PUD (workable, read it
  against the plan) · agricultural (usually a conditional use) · residential
  (stop).

Agricultural and PUD sites are **not** disqualified. They cost schedule, not
the deal. Ask the AHJ what a conditional use permit costs and how long it
takes, and budget it into the **timeline**, not the rent.

### Site control — the land, and the term

- Who owns or controls the site, and is our contact the owner, a tenant, or an
  option holder?
- Will they sign a land lease or space use agreement?
- **What term will they consider?** We price 15 years.
- What area can be carved out? We price a **minimum of 0.5 acres** — pad,
  clearances, transformer and access.

A host who will sign five years is not a smaller version of this deal. The
containers cannot be financed against a five-year ground lease. Test a 15-year
term with renewal options, or an initial term plus two five-year extensions,
before writing the site off.

---

## 2 · The three questions that set the rent

The tranche is about **what the host will give**, not how good the site is. A
perfect site with a landlord who wants rent and nothing else is Tranche 1, and
that is a good outcome, not a downgrade. The direction is the sales story:
**the more you give us, the more you get.**

| Tranche | The host | What they give | What they get |
|---|---|---|---|
| **1 · Simple land lease** | Wants rent, minimal education, fastest to signature | Space, power, fiber | Market-rate ground lease |
| **2 · Energy + compute** | Engaged, open to a deeper structure on their asset | The above, **plus rights to improve the asset** — canopies, on-site generation, storage | Lease at a premium, plus the improvements |
| **3 · Meter transfer** | Passive owner who will hand over the meter and operational control | All of the above, **plus the meter** | The highest consideration of the three |

Three questions settle it. Ask them in these words:

1. *"Would you keep the meter in your name, share it, or hand it over
   entirely?"* → keep = T1 · share = T2 · **transfer = T3**
2. *"Would you be open to us putting solar canopies, generation or storage on
   the property as part of this?"* → **yes = T2** · no = T1
3. *"Do you want to be involved in how the site is run, or do you want a
   cheque and no phone calls?"* → passive = T1 · engaged = probe for T2

**An unasked question prices at the Tranche 1 floor, never the premium.** That
is deliberate — not asking can cost us upside, but it can never over-commit
somebody in the room.

---

## 3 · The seven-question front-of-funnel intake

Enough to run a full screen and produce an indicative lease range. Anything
not answered comes back **unconfirmed** — never as a failure — and lands on
the call list.

1. Site address, **with city and state** (without them the geocoder silently
   picks one of the dozens of streets with that name and the whole screen
   measures the wrong place)
2. ZIP and utility / service territory
3. Available load — kW or MW
4. Fiber on site? Provider, speed, monthly cost
5. Zoning of the area where the equipment would go
6. Who owns or controls the site
7. Parking / pad space available

---

## 4 · What the land is worth — indicative

Rate card `compute-lease-rate-card-v1`, as of 2026-09-18.

**⚠ These are a defensible internal build-up, not verified market
comparables.** They are quotable as *indicative, subject to verification* and
must not be presented as ClearSky's final commercial position until the seed
bands are replaced with real comps and the rate-card version is bumped. Every
proposal the tool prints carries its rate-card version for exactly this
reason.

### The headline: rent follows the megawatt, not the acre

This is the single most important thing to understand before quoting a
per-acre number. The lease is driven mainly by **contracted load**, with
ground rent on the fenced pad as a floor under it. So the same site pays
roughly the same rent whether you carve out one acre or five — which means the
per-acre figure moves dramatically with how much land is in the lease, and on
its own it is a misleading number.

**Per 1 MW site, 15-year term, fiber already on site:**

| | Hold at (floor) | Open at | Ceiling (internal) |
|---|---|---|---|
| Tranche 1 | ~$35,000 /yr | **~$63,000 /yr** | ~$103,000 /yr |
| Tranche 2 | ~$45,000 /yr | **~$82,000 /yr** | ~$134,000 /yr |
| Tranche 3 | ~$53,000 /yr | **~$96,000 /yr** | ~$157,000 /yr |

That is roughly **$5,300–$8,000 per month** at the opening number, escalating
annually, beginning at commercial operation. Over a 15-year term at the base
escalator that totals roughly **$1.3M (T1) to $1.7M (T3)** on a single 1 MW
site.

### Translated to dollars per acre-year

Same 1 MW site, Tranche 1, varying only the size of the carve-out:

| Leased area | Hold at | **Open at** | Ceiling |
|---|---|---|---|
| 0.5 acres (model minimum) | $69,000 | **$126,000** | $206,000 |
| 1 acre | $36,000 | **$66,000** | $108,000 |
| 2 acres | $20,000 | **$36,000** | $58,000 |
| 5 acres | $10,000 | **$18,000** | $29,000 |
| 10 acres | $6,600 | **$12,000** | $19,000 |

**The usable answer: roughly $12,000 to $125,000 per acre-year**, with the
common case — 1 MW on a one-to-two-acre carve-out — opening around
**$36,000–$66,000 per acre-year**. Tranche 2 adds about 15% and Tranche 3
about 35% on top of any row above.

For comparison, utility-solar farmland ground rent runs $500–$2,000 per
acre-year. The gap is the point: this is not a land play, it is a
**serviced-capacity** play, and the per-acre number only looks large because
the footprint is small.

### What moves a site inside the range

- **More megawatts.** A 2 MW site roughly doubles the rent; 5 MW roughly
  quintuples it. This is the largest single lever by far.
- **Tranche.** Meter transfer and improvement rights are worth more than the
  dirt.
- **Evidence rather than promises.** A confirmed will-serve, industrial
  zoning on the pad itself and a signed-ready owner push toward the top of
  the band. Unconfirmed answers pull toward the floor.
- **Fiber laterals pull it down.** Where fiber has to be trenched in, the
  amortised cost of the lateral comes out of the rent — capped, so a bad
  trench can never drive rent to zero, but a three-mile lateral takes roughly
  a third off the opening number.

### How to quote it

Open at the opening number. Hold at the floor. The ceiling is **internal** — a
host who has seen the top of the band has already been given it. Quote the
number the tool produces for that specific site, not a number from this table;
this table is calibration, the tool is the answer.

---

## 5 · What the host pays, and what they get

Baseline answers that hold up:

- **Cost to the host: nothing.** No capital contribution, no operating
  obligation. We pay for the equipment, installation, electrical
  interconnection and any utility upgrade, bringing fiber to the pad, the
  power the equipment consumes, insurance, permitting, maintenance and
  monitoring — and removal and restoration at end of term.
- **What goes on the property:** modular compute equipment in standard
  shipping-container enclosures on a small fenced pad, with a transformer and
  a fiber connection. Unstaffed, quiet, about the footprint of two parking
  spaces per unit.
- **Their power bill and operations are unaffected** — our load sits behind
  its own meter or an agreed submeter. Access for service visits is the only
  call on their time.
- **End of term:** we remove the equipment and restore the pad, at our cost,
  and that obligation is written into the lease.
- **Who the counterparty is:** ClearSky screens and sites; development and
  financing are carried by consortium partners. Be straight about this. A host
  who discovers later that the entity on the lease is different will treat
  everything else as equally loose.

**Do not quote container capital cost.** The figure circulating internally for
a 20-ft compute container is flagged as unverified and must not go in front of
a partner or a host until it is checked.

---

## 6 · How a site gets screened

Send the seven answers from §3 and the site gets run through
`/compute-proposal.html`, which calls three evidence services in parallel —
grid (substations, voltage, transmission), fiber proximity (the verdict and
lateral estimate) and the county parcel record (zoning, owner, acreage) — and
returns:

- the four gate cards, each with its evidence and its status
- the verdict and the tranche, or exactly which of the three questions is
  still missing
- the indicative lease band, with its rate-card version
- *What closes this site* — the call list of everything still unconfirmed

Turnaround is minutes per site once the address is in hand. Sites that clear
the gates are referred on for full development, financing and deployment.

---

## 7 · Related

- `docs/COMPUTE-SITE-QUALIFICATION.md` — the full staff playbook, including
  the rate-card build-up this brief deliberately omits
- `api/compute-lease.js` — the gate model, the tranche rule and the rate card
- `compute-proposal.html` — the screening tool
- `api/network-proximity.js` — the fiber verdict and lateral estimate
- `api/grid-atlas.js` — substations, voltage, transmission
