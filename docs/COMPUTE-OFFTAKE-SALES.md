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

Researched 6 October 2026 from the companies' own pages, filings and
releases; the whole list with doors, minimums, named people and evidence
URLs is `docs/compute-offtake-targets.csv` (54 companies). Tier A and B
(34) are filed as prospects, `vertical: offtaker`, tag `compute-offtake`,
each with a `COMPUTE:` next action; tier C is in the sheet as notes only.
A named person on a row is one the company's own site or a public LinkedIn
page names; no email was guessed. What the research established, honestly:

- **Nobody signs a direct contract for one skid.** No hyperscaler or AI lab
  has publicly signed third-party GPU capacity below tens of megawatts: the
  smallest standalone contracts are Cipher 168 MW, IREN 200 MW and Hut 8
  245 MW, at $3B to $45B over 5 to 15 years; the smallest disclosed tranche
  inside a bigger deal is Cipher's 56 MW add-on for Fluidstack and Google.
  One skid is about 48 GPUs, roughly a two-thousandth of that.
- **Google buys through intermediaries, at scale.** Google Cloud buys and
  resells CoreWeave capacity, backstops Fluidstack's leases with the miners
  (TeraWulf, Cipher, Hut 8) and takes equity in them, and pays SpaceX for
  xAI capacity by the month; its supplier enrollment is invitation-only.
  Microsoft's procurement page says it is not an application process.
- **The only proof of offtake for our exact thesis is a competitor's.**
  Xeal's Laitent (Sep 2026) puts GPU pods on idle EV-charging power with a
  Tier 1 inference provider committed to up to 5 MW. The buyer exists; the
  contract was 5 MW across many sites, not one.
- **So the ladder is three rungs, and the meetings this quarter are rungs
  one and two.**

### 2a. Tier A: a published door that takes a skid-sized operator today

| Company | Door | What it buys | The catch |
|---|---|---|---|
| Baseten | Partners inquiry form | Pools GPUs across 20+ clouds and regions, routed by latency; publicly courts capacity providers | Wants an API-provisionable, reliable pool |
| Vultr | Partner Portal application | A GPU cloud that already puts its racks in other people's powered space (Verizon central offices, colo halls) | We would be the site, they the operator |
| Vast.ai | Certified Data Center application (reviewed in 2 business days) | Any host lists at once; the DC tier needs 5+ GPU servers, ISO 27001, a registered business | Spot revenue, host-priced; not a reservation |
| TensorDock (Voltage Park) | Host form; hello@ published | H100/L40S hosts, 25% revenue share, paid by Stripe, 1 Gbps per location | "Must be hosted in a data center" is the argument to win |
| Spheron | Supplier form (answers in 24 h) or a partnerships call | H100/H200/B200 from data centers and neoclouds; supplier sets the floor and approves each deal; USD, monthly | Vetted on uptime history and DC tier |
| Hyperbolic | Published supply inbox; Forge onboards providers with only SSH access | On-demand, reserved and private-cloud deployments; hiring a Head of Supply for 70 to 100+ providers | Young demand book |
| Aethir | HubSpot host application | Enterprise GPU-as-a-service contracts from hosts with 8+ GPUs, 99% monthly uptime, KYC | Paid in ATH tokens; weakens bankability |
| Akash | Provider Console; GPU Provider Incentive Pilot | Open marketplace; the pilot wants one 8-GPU node in a DC or colo with partial redundancy; Prime Intellect buys its supply | Paid in AKT/USDC; auction pricing |
| io.net, Lium, Clore | Self-serve worker or provider install | Permissionless listing of H100-class nodes; Lium pays idle H100s even unrented | Token-settled; utilization, not offtake |
| NSF NAIRR | Join as a partner; published program inbox | Welcomes contributing compute partners of any size | In kind: a federal reference, not revenue |

### 2b. Tier B: strategic, metro-edge, an intro or a portfolio

| Company | Why them | The door |
|---|---|---|
| Xeal / Laitent | The competitor that signed 5 MW of charging-site inference; learn the buyer, or sell skids into its demand | Waitlist for compute customers and hosts; CEO named |
| Akamai | Building distributed inference in 20+ metros, now capacity-constrained by an $11.6B Anthropic commitment | Channel program; sales form |
| Fireworks AI, DeepInfra | Inference buyers that rent or build in the 1 to 2 MW class and just raised to expand capacity | Sales forms; no supplier page |
| Verizon Business (AI Connect), T-Mobile | Carriers turning central offices and cell sites into GPU hosts; a charging site is the same product one hop nearer the vehicles | Named executives; partner channels |
| Vapor IO, Armada | Neutral-host micro data centers in 36 metros; modular containers with an open infrastructure-partner form | Armada's form answers in 2 business days; verify Vapor IO's state first |
| Rafay | The orchestration layer Laitent runs on; turns a fleet of skids into a metered cloud and knows who wants charging-site capacity | Contact; CEO named |
| Uber Autonomous Solutions | Assembling AV depots and charging hubs in US metros with over $100M; its AV partners are the tenants | Intro only |
| Compute Exchange, Shadeform, Hydra Host, SF Compute, Nebius | Supply-side exchanges and aggregators that contract reserved capacity in USD with SLAs; Compute Exchange names energy-infrastructure operators as a supplier class; Nebius takes partner-owned facilities at MW scale | Partner programs and forms; a single skid may sit under their floor, a portfolio does not |

### 2c. The Google door, and the other hyperscalers

Google Cloud, Microsoft, Meta, OpenAI, Anthropic, NVIDIA's DGX Cloud Lepton
and Fluidstack are filed as prospects with no due date: the record holds the
door and the named executive (Mark Lohmeyer at Google Cloud, Jonathan Tinter
at Microsoft, Santosh Janardhan at Meta, Sachin Katti at OpenAI, César
Maklary at Fluidstack), and nothing goes out until Tommy decides §7.5. The
way to them that the public record supports:

1. Rung one: tier A contracts and a revenue history from the first skids.
2. Rung two: NVIDIA Cloud Partner qualification, which puts capacity on DGX
   Cloud Lepton where the hyperscalers and the neoclouds already sit, and
   an NAIRR contribution for a federal reference.
3. Rung three: a portfolio of skids measured in tens of megawatts under one
   operator contract, taken to Fluidstack (which aggregated hundreds of
   providers before it leased campuses, and now supplies Google and
   Anthropic) or to the business-development groups that originate the
   hyperscaler deals. Alphabet's own edge (Waymo) runs its compute on board
   and its cloud at Google; it is a note, not a lead.

Tier C in the sheet (CoreWeave, Crusoe, Nscale, Oracle, AWS, xAI, Together,
RunPod, the AV fleets, the colo operators, the carriers that doubt the far
edge) are sellers, builders or doubters on the public record; the desk does
not write to them.

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

## 8. Not built, and one step after deploy

- **The vertical on the filed rows.** The 34 prospects were filed on
  2026-10-06 before `offtaker` was deployed, so the server stored no
  vertical on them; `docs/compute-offtake-prospects.json` is the exact
  payload, and once the fifth vertical is live, `node scripts/sales-cli.js
  upsert docs/compute-offtake-prospects.json` fills it (the merge is
  additive: nothing typed since is overwritten, no stage moves). Until then
  the tag is the list.
- A compute-specific view on the Office or the Sales dashboard: the `SALES:
  COMPUTE` prefix and the `offtaker` vertical are what a view would read.
- A public Omega-Core page and the capacity one-pager (Marketing's, under
  approval).
- Email discovery: the desk records only published addresses.
- Any automatic filing of a buyer's application: a person submits.
