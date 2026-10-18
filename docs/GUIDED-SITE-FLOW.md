# Guided Site Flow — screen, build, quote

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

**Decision (2026-10-16, Tommy):** the FENECON demo sandbox's process "was
perfect and how it should be all the time. That's how the Grid Atlas should
work, and we should have the Grid Atlas built into the editor."

This document is that process written down as the product's target. The
sandbox (a published claude.ai artifact, "OMEGA FENECON Sandbox") is a
clickable picture of it with sample figures; the live demo guide
(`omega-demo.js`, `?demo=fenecon-il`) walks the same path on the real
pages as they are today. Where today's product differs from the target,
the gap is listed at the end.

## The path

One site, one direction, no detours. Each stage answers one question and
hands the site to the next.

| # | Stage | Question it answers | Today | Target |
|---|-------|---------------------|-------|--------|
| 1 | Workspace | Which site is waiting? | `workspace.html` hub, Today | unchanged |
| 2 | Grid Atlas | Is the grid near enough, at the right voltage? | `grid-atlas.html` | **inside Site Map** (below) |
| 3 | Hosting capacity | Does the circuit under the parcel have room for *this* unit? | `clearsky-sitefinder.html` (ComEd) | **inside Site Map**, every utility we read |
| 4 | Load | What does the site pay for demand? | Site Map bill import | unchanged |
| 5 | Unit | Which product, with its real specs? | BESS Guided Build, `#bm-catalog` | unchanged |
| 6 | Build | Where does it go and how is it connected? | Site Map Draw | unchanged |
| 7 | Run | What does it cost to install and what does it earn? | Site Map Run (`omegaRunRollup`) | unchanged |
| 8 | Quote | Who prices the unit? | BOM → `rfq.html` | unchanged |
| 9 | Order | What happens when the client says yes? | Omega Logic | unchanged |

## How Grid Atlas should work

The sandbox's Grid Atlas does four things in order, and each one is a
single obvious action:

1. **Opens on the site.** The address (or the project's site point) is
   already the centre. Nobody searches twice.
2. **Screens for a project type.** One choice — BESS, EV, solar, compute —
   turns on exactly the layers that type needs (today:
   `#projectSelect` → `PRESETS`). The layer list is there for the expert,
   not required for the first answer.
3. **Inspects the nearest substation as a card.** Click it (or pin the
   site) and one card answers the question: name, voltage, transformer
   size, distance to the site, feeders out, nearest fiber — and a **verdict
   chip** stated against the unit being screened ("Short run · right
   voltage for 2.5 MW"). The verdict is the point; the numbers are the
   evidence beneath it. Today the same facts are in the Project panel
   (`#pBody`) as a list with no verdict.
4. **Hands off to the circuit.** The card's one button is "Check the
   circuit". Near is not the same as available.

## How hosting capacity should work

The sandbox's Site Finder step, which is how every utility should read:

1. **Click the parcel → the circuit.** Resolved at the point on the
   utility's own service (today `LAY.probePoint`, the way ComEd's viewer
   does).
2. **One card, four lines, stated against the unit:** published hosting,
   queued DER on the feeder (subtracted — the utility does not), room
   left, headroom after the unit. Then a verdict: **Fits** / **Fits only
   smaller** / **Needs a study**, in words a rep can say to a client.
3. **Net shading is the default** for a screen against a unit. The
   headline oversells; a rep should never see the oversold number first.
4. **Filter to the unit.** "Min. hosting" is pre-set from the chosen
   product's kW (1,000 kW for Clean Cell's LG JP-2, Prime's hero unit),
   so only circuits that can take it stay lit.
5. **Provenance on the card.** Source layer, queue source, and the
   request log one click away (today: Settings → diagnostics, `#setDiag`).
6. **One button onward:** "Send to Site Map", carrying the site, the
   circuit and the verdict onto the project.

## Grid Atlas built into the editor

Site Map is where the site already is. Grid Atlas and the hosting check
should be a **panel in Site Map**, not a separate page the rep leaves for.

- **Where:** a "Grid" tab (or a group on the existing site/screen tab),
  opening a side panel over the same map the drawing is on. The editor's
  basemap is the Atlas basemap; the layers draw under the drawing.
- **What it reads:** the project's own site point and the battery chosen
  in the Guided Build. No address typed, no kW typed.
- **What it writes:** onto the project record, through the editor's
  existing save (`saveProject()` allowlist, `savedBy` per
  `drawingWriteAllowed()`): `grid.substation {name, kv, miles}`,
  `grid.circuit {utility, id, publishedKw, queuedKw, netKw, at, source}`,
  `grid.verdict`. The Run, the RFQ and the Helios intake read these
  instead of asking again.
- **One registry, server-side.** The panel asks the national door Omega
  Prime asks (`POST /api/hosting-capacity` on `api/_lib/hosting-sources.js`
  and `api/_lib/utility-territory.js`), so no utility's map, URL or field
  is in the browser and nothing is pasted into `editor.html`
  (`docs/EDITOR-IP-AUDIT-2026-10-12.md` already counts what lives there).
  Grid Atlas's `LAYERS` stay the pages' own.
- **The verdict is server-side.** "Fits / smaller / study" is
  eligibility logic and belongs in `/api/` per the IP rule; the browser
  sends the circuit figures and the unit, and renders the answer.
- **Gate:** the panel is on the same cap as the Site Map tab that holds
  it; showing it is never access to a paid layer.
- **The standalone pages stay** for prospecting many sites at once (the
  Site Finder's list, ledger and Crexi views). The editor panel is for
  *this* site.

## The rest of the path (as in the sandbox)

- **Load:** the bill import shows tariff, monthly peaks and the demand
  charge before a battery is chosen.
- **Unit:** the product list is the tenant's own catalog; choosing a unit
  carries its spec (power, energy, usable, AC, transformer, disconnect,
  footprint, weight, EMS, price basis) into the side panel.
- **Build:** place on a pad at true footprint; the unit's own transformer
  and disconnect; conduit to the point of interconnection, measured.
- **Run:** installation cost line by line, the unit "Quote from <OEM>"
  where it is quote-required, then the value stack for that utility and
  market.
- **Quote:** the RFQ carries the BOM, the drawing, the load and the
  circuit verdict; the OEM sees the site, not the client's name, until
  acceptance.
- **Order:** price → quote sent → PO accepted → build & test → ship →
  bound to the site, in Omega Logic, and the client sees it in the
  customer app.

## Gaps between today and the target

Updated 2026-10-16, when the Grid panel landed (Analyze › **Grid Check**,
`omega-grid-panel.js`, beside Grid Atlas; `scripts/tests/tgridverdict.js`),
and 2026-10-17, when it moved onto the national door (gap 6).

1. **Closed for one site.** The substation card, the circuit at the parcel
   and the verdict are a Site Map panel: it reads the project's site point
   and the battery from the BESS Guided Build (`S.bessList`, else the model
   picked in `#bm-catalog`), takes the nearest substation from the Grid
   Atlas service the Analyze pre-screen already calls (`/api/grid-atlas`,
   the same mirrors as `LAYERS.substations`), and the serving utility and
   the circuit from the national door (gap 6), nothing pasted. Still open:
   the panel draws nothing on the map —
   Site Map's basemap is Google, and Grid Atlas's `LAYERS` and the ComEd
   hosting polygons draw on Leaflet, so drawing them "under the drawing"
   needs either a Google-Maps renderer for the same registry or `LAYERS`
   lifted out of `grid-atlas.html` into a shared module. The standalone
   pages stay for prospecting.
2. **Closed.** Both the substation and the circuit carry a verdict chip,
   from `POST /api/grid-verdict` (`api/_lib/grid-verdict.js`: distance
   bands, voltage class for the unit's size, Fits / Fits only smaller /
   Needs a study). The browser sends figures and draws the answer. Grid
   Atlas's own Project panel (`#pBody`) still lists facts with its 0–100
   score and no unit verdict.
3. **Closed in the panel** — the card leads with the net (published less
   the feeder's queued DER) and the verdict sentence states the room
   before the headline. In the Site Finder, net shading is still a setting.
4. **Closed in the panel** — the unit's kW is read, never typed. The Site
   Finder's "Min. hosting" filter is still typed.
5. **Closed on the record.** `grid.substation {name, kv, miles, km, chip,
   state}`, `grid.circuit {utility, id, substation, publishedKw, queuedKw,
   netKw, headroomKw, addressResolved, grain, at, source, basis,
   queueNetted, band, utilityKey, eiaId, coverage, ledgerId}` (a null
   `queuedKw` is a queue not published, never 0; `GV.fromHosting`) and
   `grid.verdict {key, label, say, unitKw, unitName, version, at}` ride
   `saveProject()`'s allowlist (with `savedBy`), are restored on load, and
   a re-measure of the same point keeps them. Still open: the Run, the RFQ
   and the Helios intake do not yet READ `grid.circuit` / `grid.verdict`.
6. **Closed in Omega Prime and in the panel** (2026-10-17). Hosting
   capacity is national: `POST /api/hosting-capacity` names the serving
   utility at the point (state layers, the EIA-861 national layer, Census
   places), reads its published map where one exists (15 sources across
   IL, NJ, CA, CT, MA and RI), says plainly where none is published (all of
   Florida and Arizona, Georgia Power behind an account), links the
   utility's own map or interconnection page to check it, and judges with
   the same verdict engine. Omega Prime and the Site Map Grid panel both
   ask it through `omega-grid-verdict.js` and draw every case the same way:
   the utility's name, every candidate when the territory is not confident,
   where the power comes from, the provenance and the utility's own map,
   with the queue words following the answer (subtracted, already netted,
   or not published). The editor no longer loads the ComEd module.
7. **New.** A "Send to Site Map" button on the standalone Site Finder's
   card (carrying the site, circuit and verdict onto a project) is not
   built; the editor panel answers for a project already open.

## Omega Prime sets up the project (2026-10-16)

Tommy: "it does the set up and system like the artifact sandbox."
`omega-prime.html` now runs Site → Grid Atlas → Circuit → **Load** →
Site Map → **Proposal** → **Track** and ends in a real project, a
proposal the customer approves online, and the order in the workspace's
own Omega Logic, followed to **Omega Teleios** (complete: on site, every
warranty live):

- **Unit:** Clean Cell's units are Prime's battery list (2026-10-17,
  Tommy): the workspace's own product list first (`omega-bess-products.js`,
  the ONE list; a `PLACEHOLDER SPEC` row is dropped), then Clean Cell's
  Rev H reference units biggest first, LG JP-2 (the hero), Smart Module,
  CC290/125 (`omega-cleancell-catalog.js` `entries()`), then the CleanCell
  R60, a 60 kW BESS + 2 DCFC skid. A white-labelled manufacturer's own
  workspace sees only its own units (Clean Cell's counts the Rev H units
  and the R60), and falls back to the reference list when it has none, so
  nobody gets an empty list. FENECON's Industrial XXL is offered only to
  FENECON's own workspace, first, as its own product. Specs only, never a
  price. A unit with no released footprint is `footprint: 'none'`: marked
  as a point until the rep types the submittal's L × W (`'rep'`), never a
  generic container.
- **Circuit verdict:** the server's (`/api/hosting-capacity`, judged by
  the `/api/grid-verdict` engine), asked through `omega-grid-verdict.js`,
  the client Site Map's Grid panel uses too. The page's own thresholds are
  gone.
- **Load:** the utility's planning rates for the address's ZIP
  (`/api/utility-rates`) and the twelve monthly peaks off the bill, typed
  or pasted; skippable, never filled in.
- **The project:** moving into design CREATES `projects/{id}`
  (`omega-prime-project.js projectDoc`: the tenant's `orgId` as the rules
  home the caller, the project type — `bess`, `ev`, `solar`, `compute` or
  `microgrid` (main #348) — on `type` and `prime.type`, a battery as the
  editor's battery entry by catalog key, `mapState` on the site point,
  `grid.*`, `load`); the
  sketch, the service, the conduit and the Run update it as `prime.layout`
  and `prime.run`. No drawing key is written by Prime.
- **Open in Site Map** builds exactly what Prime drew in the editor (the
  BESS area, the unit at its true footprint, its transformer and
  disconnect, the service point and the trenched conduit) with the
  editor's own functions, once, into an empty drawing, and saves it as the
  editor's own save. The Guided Build opens only when Prime placed no unit.
- **Proposal:** the customer's details, a margin on the Run's cost (or a
  total), terms; previewed, printed (with the site plan on satellite
  imagery) and sent by email or link from the seller's own letterhead
  (`api/customer-quote.js`, `omega-quote-deck.js`, the public `quote.html`).
  The Quote Desk's Customer quotes tab tracks every one.
- **Track:** the ladder from saved to Omega Teleios
  (`api/_lib/teleios.js`), with the Quote Desk, the workspace's own Omega
  Logic (the order) and the custody record one press away.

**The record, v2 (2026-10-17).** `omega-prime-project.js` is the pure
half every reader shares: `units()` (above), `arrange()` (the unit long
axis east–west, its transformer then its disconnect in a row east of it,
5 ft clear between bodies; a transformer or disconnect the unit integrates
is not drawn, so the R60 has no transformer and the LG JP-2 has both),
`conduitPath()` (L-shaped from the disconnect, else the transformer, else
the unit, to the POI) and `pathFt()` (editor.html `_groundPolyFt`'s own
formula). `layout()` is `prime.layout` v2: area, unit, transformer,
disconnect, POI and conduit as lat/lng with an FNV-1a hash of the
geometry; `upgrade()` replays a v1 sketch through `arrange()`.
`projectDoc()` writes prime v2 at creation (step, site, unit snapshot),
`patch()` the dotted update after it (`prime.*`, `grid.<part>`, `load`;
`updatedAt` and the battery entry only until Site Map has saved),
`restore()` turns a saved record into the state `/omega-prime?id=`
resumes from, and `runInput()` is what `/api/price-site` is sent, for the
page and the server's quote alike. None of it is a drawing key.

Held by `scripts/tests/tomegaprime.js` and `scripts/render-omega-prime.js`
(in `check:pages`: site to proposal to Track on the Firebase double and the
real doors, resumed, on a phone, and at Mesa AZ).

**On a phone** (2026-10-17): Omega Prime is an installable web app. The
download link is `/omega-prime/install` (iPhone: Safari → Share → Add to
Home Screen; Android: Install). The manifest, icons and service worker are
the wrapper around `omega-prime.html`. That file gains two lines after
its own style, the phone stylesheet and `omega-prime-pwa.js`; the script
writes the manifest link, the icons and the iOS tags while the page is
still parsing. The installed icon opens `/omega-prime`. The worker caches
the shell only and does not cache `/api/` or Firebase auth. Phone layout
is `omega-prime-mobile.css`.

**Every project type** (main #348): EV charging, Solar, Compute and
Microgrid list the editor's own catalogs (`omega-site-catalogs.js`, held
to `editor.html` by `tomegaprime.js`) through `PP.forType`; a microgrid is
the battery list with the solar and generator rows. A unit that is not a
battery (`PP.screenable`) is carried through as **quote required, sized in
Site Map**: the Circuit step names the serving utility and judges nothing,
the Site Map step draws it alone (no battery gear) and has no Run, the
Proposal step prices nothing (`/api/customer-quote` refuses it the same
way), and Site Map's hand-off builds none of it (`not-battery`). Push to
Prime carries the loaded address, its point (used when that address does
not geocode), the project type and the project's org; Omega Logic opens on
the project's org, else the link's, else the person's own
(`/omega-logic?org=`), never the bare directory.

Still open for Prime: a charger, array or compute unit is quoted from Site
Map, not from a Prime proposal; the bill's peaks
are typed, not read from the bill file (Site Map's bill import is the
reader); Prime's Run is `/api/price-site` and Site Map's Run is
`editor-cost`, two engines, so the project's capex rollup waits for Site
Map's own Run and the proposal is priced from Prime's layout; the value
stack is ComEd/PJM only, so elsewhere it reads "not modelled for <utility>
yet"; no server PDF is attached to the email (the link opens the proposal,
which prints).

## Demo

`/grid-atlas.html?demo=fenecon-il&q=<address>&at=<lat>,<lng>` starts
the live guide (`omega-demo.js`). Guided mode only lets the next step be
clicked; Free lets the presenter click anything; Exit switches it off in
that tab. It changes no data and calls no endpoint.
