# Editor geometry tests

Pure-function tests for the parcel-frame planner, the separation ruler and the
PV azimuth choice. They work by extracting named functions straight out of
`editor.html` — there is no build step and no module system, so extraction is
the only way to reach them from node.

They exist because these three landed as "verified" on syntax checks alone,
and the sweep that the whole frame feature depends on had never executed once.

## Running

    node scripts/tests/extract.js
    for t in tsw tfr tp tg tfence tpoi tsolarfence tobb tyard; do node scripts/tests/$t.js; done

`extract.js` writes `sweep.js`, `geo.js`, `pv.js` and `fence.js` next to itself.
Several names exist twice in `editor.html` — `cluster` and `compounds` each live
in two modules — so a duplicate name is an error unless you say which one you
want (`cluster#2`). That check exists because the first version of these tests
silently extracted the wrong `compounds` and passed nothing. Everything
is regenerated from `editor.html`, so the tests always run against what is
actually in the file rather than a copy that can drift.

## What each covers

| file    | covers |
|---------|--------|
| tsw.js  | `_sweepFrameToWorld` end to end on a synthetic build: pad centres, rects, polyline order, conduits, elements, solar exclusion, pre-existing work left alone, and that placed blocks land inside the real parcel |
| tfr.js  | `_omegaFrame` — that it measures the polygon being PLANNED and not whichever shape happens to carry `isSiteBoundary`, that the parcel comes out square to the grid, and that a square parcel disengages the feature |
| tg.js   | hull-to-hull separation against the axis-aligned boxes it replaced |
| tp.js   | PV azimuth window and ordering |
| tyard.js | the interconnection yard actually DRAWS — a box at its true footprint for every engine equipment kind, labels that fit inside their own box, nothing invented for a shape with no footprint. Writes `yard-preview.svg` to look at |
| tobb.js | the fence is the MINIMUM-AREA rectangle round its contents, measured from geometry — the case that mattered is solar, written as a polygon whose points already carry the turn while its `rot` stays 0 |
| tpoi.js | a transformer or substation you place is the POINT OF INTERCONNECT, not campus gear — it gets its own compound and stops the yard fence stretching hundreds of feet across empty ground to reach it |
| tsolarfence.js | each compound is fenced in its OWN angle: solar sits at the sun's angle while the campus sits at the parcel's, and one global frame inflated the solar fence |
| tfence.js | `equipFrame` / `boxOf` — that a fence follows the equipment's angle when the equipment agrees on one, stays square when it does not, measures a block at its true size, and routes ties parallel to the fence lines |
| tautopilot.js | the URL autopilot (`OmegaAutopilot`) — static, no extraction: the module exists once and is ES5, every global it calls is defined in `editor.html` (the design named a `_saveProject` that does not exist), it stops before the POI and never picks a catalogue unit, `_siteScoreRefresh` is defined exactly once, the Parcels layer no longer writes sample data, and `_bgbState()`/`_bgbCurKind` are exported. Prints the smoke URL; the run itself (map, parcel, roads, build, the two human stops) is checked in a browser |
| tmdcimport.js | modular data-center units bulk-uploaded from a spreadsheet: `OmegaImport.MDC_SPEC` reads a vendor line card in the vendor's units (MW, metres, millimetres), refuses a hedge and a floor breach, derives a stable key from manufacturer + model so a re-upload is an update, and the template imports cleanly; then `_dcCatalogSync` / `_e3DcDoc` cut out of `editor.html` and run against a stubbed registry — a live unit lands in `DC_CATALOG` and `DERC_DC` at its real footprint, the published seed copy and an archived unit do not, and an update keeps the creator and the notes the sheet does not carry. No extract step; static, like tautopilot |
| tositescreen.js | a partner's site list and their screening scorecard onto the OSA deals (`tenants/osa/site-screen.js`, pure; `ingest-data.js` run in a vm with its three globals stubbed): "Edge Compute" reads as `compute`, a batch default fills an empty size and never overrides a given one, the same site under the same partner is an update, a scorecard with a ceiling row and a band table parses with the pass line taken from the rubric's own words, rows match their deals across the partner's name prefix and never across partners, the compute-screen result keeps the gates and the asks and never the priced offer, and the editor link carries the autopilot parameters for a compute site. Static checks on the page and the deal model follow. No extract step |
| tparcel.js | `/api/parcel.js` offline (no extract step; `_lib/admin` and `fetch` are stubbed): which county layer a point is asked of and in what order, an ArcGIS or GeoJSON ring turned into an open `[lat,lng]` ring, acres measured off it, the Cook/DuPage/Lake and Regrid answers normalised to the contract, and that a bad token, a bad body or a point outside coverage asks nobody upstream and echoes no upstream body |
| treportchrome.js | the report's site map is a picture of the SITE: the Patch 67 capture wrapper is cut out of `editor.html` and run against a fake #sc — every placed element (`.cel`) is visible when `_captureFullCanvas()` takes the picture, the compass, the COORDINATES / TERRAIN KEY frames, legend, ruler and toasts are not, everything comes back afterwards (a failed capture included) and a panel the user closed stays closed. In `npm test`. It exists because `.cel` was on the hide list and the report showed the trench on an empty lot |

## A note on angles

A fence rectangle at 22° and one at 112° with its sides swapped are the SAME
rectangle, so a fence angle only means anything mod 90. Two assertions here were
written without that and failed on correct output.

## Not covered

The live integration: `run -> design -> draw -> drawCampus -> FenceTie`. That
needs a signed-in editor with a drawn parcel, so it is still a person's job.
