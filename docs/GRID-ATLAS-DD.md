# Grid Atlas — Due Diligence profiles (2026-11-09)

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

## What it is

The "Screen for" profile on `grid-atlas.html` used to only switch map layers
on. Three profiles now also run a due-diligence checklist at the pin —
the screening read Rextag sells (attributed grid layers, POI proximity,
queue routing, exportable site package), mapped to the checklists a lender
actually asks for:

| Profile (preset `dd` key) | Checklist |
|---|---|
| Tesla Supercharger (`supercharger`, new preset) | 12–16 stall DC fast-charging site: power & service, host/site, demand & competition, site risk |
| BESS (`bess`) | interconnection, market & revenue, site & safety (NFPA 855 / UL 9540A), environmental |
| Data Center / Compute (`compute`) | **the Solela / Francis Energy "Site Readiness Checklist — 1 MW Modular AI Compute Deployment"**, all eight sections in its order, with its own evidence wording |

`grid-atlas-dd.js` (ES5, pure, no DOM/network) holds the definitions and
judgement; `GridAtlasDD.run(profileKey, evidence)` returns sections, a
tally, a readiness number over the measured span and an honest verdict.
The page assembles the evidence object inside `analyze()` from its own
loaded layers and renders the result under "⛭ Due Diligence".

## Honesty rules (the whole point)

Same discipline as `analyze()`'s `wScore` and `api/grid-atlas.js`:

- **unknown** — the source was never consulted (layer off, or nothing in
  the loaded view). Not a zero, never averaged into readiness.
- **open** — a human must produce the evidence (title report, will-serve,
  carrier quote). The compute items quote the Francis checklist's own
  evidence column. A map clears nothing; the disclaimer says so.
- **pass / conditional / risk** — only on a measured reading, and every
  capacity pass still says "NOT confirmed capacity".
- Readiness = measured auto items only (pass 1, conditional ½, risk 0);
  open and unknown are counted and named beside it, never inside it.

## Pieces

- Compute carries the four IT loads from the portfolio work (75 kW,
  350 kW, 1 MW, 1.77 MW IT; facility ≈ IT × 1.25) on a selector that
  re-runs the screen in place.
- §6 Connectivity reads the last `/api/fiber-screen` result: the fiber
  evidence panel (`omega-fiber-atlas.js`) stashes it on
  `window.__gaFiberScreen` and pokes `window.__gaReanalyze()`, so an open
  checklist absorbs the server screen the moment it lands. Serviceability
  stays UNCONFIRMED in the wording either way.
- §6 also carries two rows from the FCC lookup at the pin
  (`omega-fiber-confirm.js`): *Carriers reporting fiber at the site* and
  *Incumbent telephone company of record*. The whole confirmation ladder,
  the carrier RFI and the verification package are `docs/FIBER-CONFIRMATION.md`.
- `isoQueuePortal()` (beside `utilityPortal()`) routes to the seven
  ISO/RTO interconnection queues — queue position is evidence the public
  map cannot read, so the panel links to where it lives.
- Export: ⇩ Download DD report (JSON: evidence + report + coords + time)
  and ⎙ Print — an `@media print` sheet turns the Site Analysis panel into
  the report and drops the map chrome.

## Held by

`scripts/tests/tgridatlasdd.js` (in `npm test`): the eight compute
sections against the checklist, the evidence wording (ALTA/NSPS, 10/5
Gbps, 20–40 ft container), unknown-vs-measured honesty, the thresholds,
and the page wiring (script tag, preset `dd` keys, export/print, the
fiber-screen stash).

## Honest list of what is NOT built

- **Parcel / zoning auto-fill.** `api/parcel.js` (owner, APN, acres,
  zoning) is billing-gated and not called from this page; §1/§2 items stay
  open evidence. Wiring it in is the obvious next rung.
- **Hosting-capacity readings.** The panel routes to the utility portal;
  it never reads a number off one.
- **Queue positions.** Links only — no ISO queue dataset is bundled.
- **Wetlands / species layer** (checklist §7): open item, no NWI layer yet.
- **Traffic (AADT) for the Supercharger profile**: open item.
- **Saved checklist state.** Nothing persists; the JSON export is the
  record. No Firestore writes were added.
- **No new server endpoint, no new collection, no rules change.**
