# NextNRG Microgrids in the system

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Written 13 October 2026 (Tommy, handing over the NextNRG Microgrids brochure,
Q4 2026: "i want their battery products and their solar products to be in the
system as something that can be sold … when i click on solar in the draw and
power gen, lets use their specs on the solar, in the battery part use their
specs and label them as nextnrg product, and in the microcontrol we want to
use their product the cost is 125k/unit so when we hit run that should show,
it needs to be auto built into the omega core skid and it should be in the
utility equipment for the draw function, from a value stack and energy
efficiency it should on average increase the efficiency of energy on a site
by 7%").

## What NextNRG sells, as the brochure puts it

A microgrid is generation, storage and loads inside one electrical boundary,
joined to the utility at one point and able to island. Solar makes the
cheapest energy on the site and is spent first; storage holds it for the
hours it is worth most and carries the critical load when the grid drops;
the **NextNRG Microgrid Controller** decides, every fifteen minutes on a
twenty-four-hour forecast, where every kilowatt comes from and goes. It is
delivered with development partners under three structures (a PPA, an
energy-savings agreement, or an outright purchase) and reported on one
dashboard (`dashboard.nextnrg.com`) with a mobile app on the same database.

| Part | Figure | Where it came from |
|---|---|---|
| Solar module | JinkoSolar **EAGLE G7B** (US branding of the N-type TOPCon line): 615–640 W, 22.77–23.69%, bifacial, 132 half cells, 1500 VDC, 2382 × 1134 × 30 mm, 32.4 kg, Type 29, IEC 61215 / 61730, UL 61730; 12-year product, 30-year linear performance at or above 87.4% | brochure p. 3–4 |
| Storage | Specified to the site, not to one product: LFP preferred, containerised ISO, 2–8 h, 85–90% AC round trip, 20-year design life at >97% availability, 300% daily throughput, liquid cooled, UL 1973 + IEC 62619, UL 1642 cells, NFPA 855, IP54; named supply Saft (Intensium Flex 3.4 / 4.3 / 5.1 MWh blocks; Intensium Max 20 High Energy 2.5 MWh NMC per 20 ft at 96% DC) and A123 (587 Ah prismatic LFP, 1P13S 41.6 V, Dukosi, Nuvation L2 BMS) | p. 5–6 |
| Controller | 15-minute dispatch, 24-hour horizon, economic / resilience / islanded with black start; Modbus TCP to the site PLC (DNP3 optional), 10 × 100/1000 Mbps, optional LTE; IP55, 500 × 750 × 210 mm, 40 kg, wall or pad, 0–40 °C; IEEE 1547, IEC 62443, NERC CIP aligned; US Patent 10,326,280 B1; **6 to 8% modelled ROI uplift**, "modelled rather than measured, and not a performance guarantee" | p. 7–8 |
| Price | **$125,000 a controller, installed** | ClearSky (Tommy, 2026-10-13) |
| System price | **$5.65 per W-DC of NextNRG solar, installed: the array, the storage beside it, the controller and the labor, as NextNRG quotes it** (`SYSTEM_RATE`, with the quote on the record); NextNRG storage with no NextNRG solar beside it, $6.00 per W of rated power. Priced by the Site Map cost engine with no contingency (a vendor's installed price), as energy property; in NextNRG's own workspace every array and battery is NextNRG's. Topanga: 368 kW-DC with a 250 kW / 1,000 kWh battery = $2,079,200 | NextNRG's Topanga one-pager, Q3 2026: $1,780,063 installed for 315 kW DC + 300 kW / 1.8 MWh + controller, $5.65/W DC (Tommy, 2026-10-14: "look at the capital sought they requested") |

## ONE record — `api/_lib/nextnrg.js`

The brochure's figures, the price and the uplift rule, pure and server-side.
The figures are public datasheet facts and ship in the page's own catalogs
too; `scripts/tests/tnextnrg.js` holds every page figure to the record, so
there is one source. Two things never reach a browser: the price (read by the
cost engine and the Omega-Core skid) and the uplift (applied by the dispatch).

## Where it lands

### Solar — Draw › Power Gen › Solar draws with their module

`DER_PV_MODULES` in `editor.html` is the one module list and NextNRG's EAGLE
G7B is its default (`DER_PV_MODULE_DEFAULT`). The module decides:

- **the density every kW-DC is built on** — `DER_PV_WPSF` is the module's own
  nameplate over its own frame, 22.0 W/ft² (it was a 20 W/ft² rule of thumb),
  and `_solarAssume()` returns the module's density for every mount unless a
  W/ft² is typed in Solar Assumptions;
- **the string sizer's module watts** (640, where it assumed 550);
- **the 3D module pattern** (the EAGLE G7B's 3.72 × 7.81 ft frame);
- **the BOM's solar line**, which names the module and carries its key
  (`NEXTNRG-PV-EAGLE-G7B`) and brand, so the RFQ can route it.

The Solar Assumptions panel (Solar → BESS sizer) has a **Module** choice; the
former generic 550 W module stays as the other option; the choice rides on
`S.solarAssume.moduleKey` with the project.

**NextNRG Solar — Custom** (Draw › Power Gen, after *Solar — Custom Area*;
Tommy: "they have a polyline in here that is a NextNRG Solar - Custom … they
be able to see their product") is the same trace with NextNRG's module chosen
for the project first (`omegaNextnrgSolarCustom`). Every auto-laid array now
records the module it was built with (`moduleKey`, `moduleWatts`), and when
that module is a product somebody sells — NextNRG's — the array carries
`product` ("NextNRG Solar PV — JinkoSolar EAGLE G7B 640 W"), `mfr` and `sku`,
which the drawing (a line under the GCR), the legend's key, the equipment key,
the electrical inventory and the BOM's solar line all name. The generic module
makes no product: a name is never invented.

### Storage — a NextNRG group in the battery catalog, nothing invented

`BESS_CATALOG` gains **four** entries labelled NextNRG, in their own optgroup
of BESS Config and on the BESS Pad footprint list: the three Saft Intensium
Flex blocks (3.4 / 4.3 / 5.1 MWh) and the Intensium Max 20 High Energy
(2.5 MWh) — **only the blocks the brochure names on its specification page**
(Tommy, 13 October 2026: "the only batteries for NextNRG that should be
showing up as NextNRG is if they've actually manually inputted something or
it's off of that spec sheet"). Each carries the requirement's standards and the
named supply. **No kW the sheet does not publish**: power is `null` with a note
(the brochure gives a 2–8 hour duration range; the PCS is sized per site), so
the designer enters kW from the site assessment. Usable kWh, weight and price
are not published and stay null. The sub-megawatt-hour C&I route the brochure
mentions is not a catalogue product and is not one here: anything else NextNRG
sells enters through their own product list (*Your equipment library*), which
is the other way a battery wears their name. No price, as nowhere in that
catalog.

### The controller — Draw › Utility (Controls), and inside every Omega-Core skid

- **Draw › Utility › Controls › NextNRG Microgrid Controller** — first in the
  Controls group of the long Utility list, which is built at install from the
  BOP catalog's `MENU` (`editor.html`, *omega/bop*); the row is
  `UTILITY_CATALOG.mgc` (abbr MGC, the enclosure's 2.5 × 1.75 ft pad face,
  specs on the row, no price), which the installer now prefers over the BOP
  entry of the same key. The guided build's own `mgcAsset()` places the same
  row.
- **The Run prices it**: `omegaCostQuantities()` counts the controllers placed
  for the host (`counts.mgc`), the server cost engine (`api/_lib/editor-cost.js`)
  prices each at the record's $125,000 as its own line (`lines.controller`,
  `totals.controller`), in scope on its own, inside the ITC basis, and the
  Results rail shows *NextNRG Microgrid Controller ×n*.
- **The BOM lists it** under Controls with its key (`NEXTNRG-MGC`) and brand.
- **It is built into every Omega-Core skid.** `DC_CATALOG.dc_omegacore` names it
  (`controller`, `controllerKey`), a placed skid remembers it, the skid is drawn
  with it (the MGC box under the Sol-Ark), the BOM line and the spec-sheet row
  name it, and the server's product record (`api/_lib/omega-core.js`
  `PRODUCT.controller`) describes what it does on the skid. **The system cost is
  the skid plus the controller: $639,000 + $125,000 = $764,000** a skid
  (`systemCostBreakdown`), which ClearSky's outlay, the fair-market-value band
  (20 / 30 / 40% at year 5: $153k / $229k / $306k) and the compute cash flow's
  skid basis all follow; the compute model's own default stays the recorded
  skid price and `omega-core.js` hands it the built skid. The host never pays
  for the skid's controller: `counts.mgc` counts utility shapes only.

### The value stack — 7%, on the server, with its caveat

The brochure's 6–8% modelled uplift is carried as the platform's **7% on the
dispatch-decided bill savings** (demand charges held down, time-of-use energy
shifted): `api/_lib/nextnrg.js` `applyUplift()`, run once by the ONE dispatch
(`api/_lib/vpp-sim.js simulate()`) when the request carries `controller`
(true, the key, or the brand). It is **not** applied to PJM capacity
(accreditation does not move), to a programme's rate (a counterparty's rate
does not move) or to a one-time incentive. Each touched stream says so in its
own working, the result carries a `controller` summary (model, percent, dollars
a year, the streams, the basis and the caveat), and every reader — the totals,
the owner's share, the lifecycle IRR, the bankability rows — sees one set of
numbers. `POST /api/value-stack` passes the flag in and the summary out; the
editor's Value Stack panel sends `controller` when a NextNRG controller is on
the drawing for the host (never for the skid's own) and shows the summary
under the streams. A legacy value stack typed by hand is unchanged.

### Selling it — the RFQ

A BOM line routes to a manufacturer by its catalogue key in `/equipment`, else
by its brand against `omega_orgs.brands[]` (`api/rfq.js`). NextNRG's lines
(battery, module, controller) all carry `manufacturer: 'NextNRG'`;
`tenants/nextnrg/tenant.json` now carries `brands: ["nextnrg"]` and the seed
copies it onto the tenant record, so a customer's RFQ with a NextNRG line
reaches `nextnrg.com`'s Quote Desk. The brand can also be set on the account
page. Seeding the live record (`scripts/seed-omega-orgs.js --apply`) or
typing the brand on `/admin/account.html?org=nextnrg.com` is a deploy step.

## What the BOM says (13 October 2026, from the first look at the BOM)

- **A battery placed from Draw › BESS Pad is on the BOM under its name.** The
  takeoff gathered batteries only from guided-build elements and from plain
  pads, and read those by a field the pad tool never writes, so a NextNRG
  unit placed from *Your equipment library* (as an assembly, with its fence
  and bollards) was on the legend and the Results and missing from the BOM.
  `buildBOM` now counts every pad and assembly off the drawing (never the
  master controller, which is drawn as a pad), rated the two ways a unit is
  rated, grouped by product: one *Energy Storage* line per product, with its
  catalogue key and brand, so the RFQ routes it.
- **A traced array lays out with its mount's racking** (2026-10-14, Tommy:
  the traced roof "is not equaling the same amount of solar production" as
  the roof rectangle — it was filling with the ground preset's 0.40 GCR and
  10 ft setback). *Solar — Custom Area* and *NextNRG Solar — Custom* open
  the Auto-Layout modal with a **Mount** choice (Ground mount, Rooftop,
  Solar canopy; it starts from the ribbon's last Solar choice), the layout
  fills with that mount's preset (`computeGroundLayout({ mount })` →
  `_solarAssume(mount)`), and the array carries the mount, so the BOM, the
  Run's $/W by mount, the legend and the label follow it at once;
  **Array — Edit Size / Capacity** can still change it, and changing it
  refills. An array traced before this (`mount: 'custom'`) still reads
  *Solar PV array (custom area)* until a mount is chosen. One solar line per
  mount as drawn.
- **An array's kW-DC can be set by hand** (Tommy, 2026-10-14: "it should
  still auto generate but people should be able to manipulate it"):
  *Array — Edit Size / Capacity* has *kW-DC — set by hand*; a number holds
  through every refill (`sh.kwOverride`, the layout's own figure kept as
  `sh.kwAuto` and shown beside it), *Clear* or a blank puts the layout's
  own back. `_derApplyKwOverride` is the one rule, run by the rectangle
  recalc, the traced relayout and the exclusion refill.
- **The rectangle array is NextNRG's too.** *Solar Roof* / *Solar Ground*
  stamp the array with the project's module exactly as the trace does
  (`_derStampModule`), and `omegaSolarIsNextnrg` reads the stamp, else the
  project's module, so an array built with the EAGLE G7B (the default) is
  priced at NextNRG's $5.65/W system rate; the generic 550 W module in
  Solar Assumptions is the road to the DOE/NREL benchmark ($2.95 / $1.98 /
  $1.12 per Wdc, Q1 2025 modeled market price; a canopy $2.75).

## Tests

`scripts/tests/tnextnrg.js` (in `npm test`, `npm run test:nextnrg`): the
record's figures, the price and the uplift rule; the cost engine's line; the
dispatch's uplift on bill streams alone, exact to the dollar, with a programme
stream untouched and the gross moving by exactly the uplift; the door; every
page catalog held to the record; the flyout, the skid, the module default, the
counts, the Run's row, the BOM lines, the Value Stack flag; no price anywhere
the page names NextNRG; the brand on the tenant record.
`scripts/tests/tomegacore.js` pins the skid at $575,000 with the breakdown.

## Not built

- **A NextNRG price list.** Every battery and module entry is *quote required*,
  as the rest of the catalog is; only the controller has a figure, ClearSky's.
- **The VPP Earnings Simulator page** has no controller toggle yet; its engine
  (`vpp-sim.js`) already honours `controller` in a request.
- **Per-block kW** for the Saft blocks: the brochure does not publish one; the
  4-hour rating is representative and labelled so.
- **The PPA / energy-savings-agreement structures** and the NextNRG dashboard
  are described, not modelled: the Pro Forma still prices an owned system.
- **A measured uplift.** 7% is the brochure's modelled midpoint; a site's own
  meter data replaces it when NextNRG's dashboard reports verified savings.
- **A controller on the one-line.** The one-line's census does not place the
  MGC yet; the drawing, the legend, the BOM and the Run do.
- **A per-block kW for the Saft blocks.** The brochure publishes none; it is
  entered per site, or comes with NextNRG's own product list.
