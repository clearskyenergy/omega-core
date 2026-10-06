# Compute offtake: the side strategy for selling Omega-Core capacity

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Written 6 October 2026 for the Sales desk (Nora Hale, `sales@clearsky-usa.com`)
and the Office. Tommy, 2026-10-06, on the Office view: "I need sales team to
target compute off takers we need to find contracts so we can sell compute to
Google and other organizations." The standing step is 6b in
`.claude/agents/sales-agent.md`; this file is the strategy it runs. The
offer itself is `docs/OMEGA-CORE.md` and the skid's economics are
`api/_lib/omega-compute-model.js`; nothing here changes either.

The goal, in one line: **meetings that lead to signed offtake** (a capacity
contract, a reservation, a host or provider agreement) so the skids are
bankable before they are built in volume. The platform pipeline keeps
running; this rides beside it in the same book, under its own tag.

---

## 1. What we are selling, in the words the desk may use

| Fact | Say it as | Source |
|---|---|---|
| The unit | One transportable skid: a 75 kW edge-compute cabinet with a 60 kW / 61 kWh battery, on its own utility service and meter, placed on an EV charging site in a metro. ClearSky owns and operates it. | `docs/OMEGA-CORE.md` |
| What is in it | About 48 NVIDIA H100-class GPUs (6 HGX nodes) per skid at today's default; the chipset is a choice (H200, B200, L40S) the model prices side by side. | `omega-compute-model.js` `capacity()` with the defaults: 6 nodes, 48 GPUs, 61.2 kW installed of 75 |
| Where | US metro charging sites: near highways, fleet depots and retail, on grid power already built for charging, with fiber (1 Gbps, both ways) as the hard gate. | `api/_lib/omega-core.js` gates |
| Scale | One skid is a pilot. A portfolio is many skids across a region, each sited by the platform's own qualification (power, location, fiber). | the lease, the gates |
| Term | Five-year minimum per site; at the end the skid is removed or the host buys it at fair market value. | `docs/OMEGA-CORE.md` |
| Resilience | The battery carries up to 60 kW of the 75 kW load for about an hour. Never sell it as a full UPS. | `docs/OMEGA-CORE.md` |
| Bankability | A levered 60-month cash flow by chipset with DSCR, debt capacity and IRR exists as a staff-run customer view; it is shown in a meeting, never pasted into mail. | `POST /api/omega-core` `compute.customer` |

What the desk NEVER writes: a $/GPU-hour, a rate card, a discount, a term
sheet, a total capacity we do not have, "operating" or "deployed" (no skid
is recorded as placed on a site as of this writing: Tommy fills in the first
site when there is one), a chipset we have not bought, a utility's answer we
do not hold, "guaranteed uptime". A question about any of those is answered
with the meeting. The market reference rates and the CAPEX ranges in the
model are staff-only (`disclosed`), exactly as the lease card's build-up is.

## 2. Who buys compute, honestly, and in what order

<!-- TARGETS: filled from the 2026-10-06 research; see §2a–2c -->

## 3. The ask, the titles, the words

**The ask is one meeting**: a 20-minute call on Omega-Core capacity, for
Thomas, Andrew in copy, booked the way the Routine books demos (30-minute
slots, 08:30–14:30 Central). A buyer that has a published door (a host,
provider or capacity-partner application) gets the application prepared for
Thomas to submit AND the meeting ask; the form never replaces the call.

**Titles to look for** (the company's own site or public LinkedIn, never a
guessed address): Head / VP / Director of **Supply**, **Capacity**,
**Infrastructure Partnerships**, **Data Center Strategy**, **Compute
Procurement**, **Cloud Partnerships**, **Edge Infrastructure**; at an AV or
fleet company, **Fleet Operations** or **Depot / Charging Infrastructure**.
A founder or CTO at a company under about 200 people.

**The message** (Tommy's voice, under 120 words, one ask; §7 of
`docs/SALES-AGENT.md` holds):

- Name the thing on *their* page: the program, the GPU type they list, the
  metro they say they want, the contract they announced.
- One sentence of what we are: ClearSky places and operates battery-backed
  75 kW GPU skids on metro EV charging sites, each on its own meter, sited
  by its own grid-and-fiber qualification.
- One sentence of why them: capacity where the users and the vehicles are,
  on power that is already built, in months rather than years.
- The ask: twenty minutes with Thomas on whether a pilot skid in <their
  metro> fits their <program / contract>.
- The signature block the Routine prescribes.

**Cold email is blocked** until `sales_config` carries the postal address
(`rules.coldEmailAllowed`): until then, a company that never wrote to us is
reached through the LinkedIn queue (Thomas pastes), a published application
door (Thomas submits), or a warm introduction. The desk never works around
`screen`.

## 4. The facts an application asks for

Most host, provider and partner doors ask the same things. The desk answers
from this table and leaves blank what it does not hold; a blank goes to
Thomas as a question, never a guess.

| Asked | Answer |
|---|---|
| Company | ClearSky Energy Solutions LLC, www.clearskyomega.com, tom@clearsky-usa.com |
| What you operate | Battery-backed 75 kW edge-compute skids on EV charging sites, own meter, ClearSky-owned and operated |
| GPUs | NVIDIA HGX H100-class, 8 per node, about 6 nodes per skid (chipset per contract) |
| Scale now / planned | Tommy fills in (first site, skids on order, the region) |
| Locations | US metros; the first region Tommy names |
| Power and cooling | 75 kW IT per skid on a new 480 V three-phase service; the battery carries 60 kW for about an hour |
| Network | 1 Gbps symmetrical fiber is the siting gate; carrier per site |
| Uptime / tier | Not a certified tier. Say what the design does and nothing more |
| Minimum term | Five years per site |
| Pricing | "To be discussed on a call"; never a figure |

## 5. The desk's day (the side-strategy block of every run)

1. `sales-cli prospects --vertical offtaker` (while the vertical is not yet
   deployed: `prospects --limit 300`, keep the rows tagged
   `compute-offtake`). The rows are the book in §2; their `next.action`
   begins `COMPUTE:` and lands in `prospectsDue`.
2. Work at least three a run, tier A first: the meeting ask by email where
   the rules allow a send, else the LinkedIn queue and the application
   email to Thomas. `screen` before every address.
3. Three of the ten LinkedIn people are compute offtakers, warm first, each
   line saying "compute".
4. Up to three of the ten research candidates may be compute targets from
   §2 not yet filed: the site, the program page, the named person, a
   published address only; `sales-cli upsert` with `vertical: offtaker`,
   the tag, `source {kind: target-list, ref: compute-offtake}`, evidence
   with the URL, a `next` due within three business days.
5. A reply is logged as `reply` and answered the same run; a meeting that
   lands is a `meeting` naming the host; a signed anything is Thomas's
   `stage` move to `won`, never the desk's.
6. Every log line of this work begins `SALES: COMPUTE …`; the `agent-run`
   summary carries `compute: worked n, meetings m, applications a`.

**A good day**: three offtaker rows worked, three compute people on the
LinkedIn email, one application prepared, every compute reply answered the
same run, zero figures in any message. A week with no meeting booked says
so in the Sunday plan with the reason.

## 6. Handoffs

- **Marketing (Mila)**: a public Omega-Core page and a one-page capacity
  sheet with no price are what every door asks for first; approval
  `#MKT-20261006-2` already asks Thomas for the page. The desk links only
  pages that exist on www.clearskyomega.com.
- **Admin (Ada)**: the Sunday plan carries one compute goal with a number
  (meetings booked) from the log's `SALES: COMPUTE` lines.
- **Software (Theo)**: nothing until a door needs a fact the platform does
  not print.

## 7. Decisions only Tommy can make

1. **The postal address** in Sales settings: until it is set, no cold email
   leaves and every compute target that never wrote to us is LinkedIn and
   applications only.
2. **The first site and the first order**: the one fact every buyer asks
   first. Until a skid is recorded as placed, the desk says "pilot" and
   never "operating".
3. **Which metro first**, and which chipset the pilot carries: the model
   prices H100, H200, B200 and L40S side by side; the application asks.
4. **Whether a capacity partner may be told the rent model** (the host's
   land lease as a cost of the skid) or only that the site is paid for.
5. **The Google door**: §2c sets out what the public record says Google and
   the other hyperscalers buy and at what size. The realistic first
   contract is not Google; the realistic way to Google is a portfolio sold
   through the intermediaries that already supply it, or Alphabet's own
   edge needs (Waymo's depots) if a conversation shows one. Tommy decides
   whether to spend the desk's hours on that door now or after the first
   tier-A contract.

## 8. Not built

- A compute-specific view on the Office or the Sales dashboard: the `SALES:
  COMPUTE` prefix and the `offtaker` vertical are what a view would read.
- A public Omega-Core page and the capacity one-pager (Marketing's, under
  approval).
- Email discovery: the desk records only published addresses.
- Any automatic filing of a buyer's application: a person submits.
