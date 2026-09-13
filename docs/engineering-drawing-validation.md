# Editable drawing export — validation report

Branch `feat/editable-drawing-export`, commits `772a1a3` and `79c36ab`.
Written 2026-09-13 against the attached `omega-editable-drawing-update.zip`
(SHA256SUMS verified, 9/9 files).

**This is not an engineering approval and nothing here is stamp-ready.** It
records what was integrated, what was tested, and what was not.

---

## 1. The drop could not be applied as sent

Its `editor.html` was based on repository HEAD but three regions had been
rolled back to a pre-`a4b571e` state. Copying the file over would have
reintroduced them. Verified by running the repository's own regression test
against the supplied file: **3 assertions failed.**

| Region | What the drop did | Action |
|---|---|---|
| Interconnect provenance | Removed `source: data\|proxy\|estimate` from all five factors, removed `evidencePct`/`dataWeight`/`proxyWeight`, reverted the three-tier badge to two-state | **Rejected** — HEAD restored |
| Pre-qual confirmation gate | `zoningOk === true` → `!== false`, so an unticked box scored as confirmed | **Kept server-side** (below) |
| Pre-qual live sizing | Removed `_pqSyncLiveSystem`, returning to a fixed 1 MW / 3.5 MWh benchmark | **Kept server-side** (below) |

Three of the drop's own changes are genuine improvements and were taken:
parcel-fetch request sequencing with a `moved` state, HTML-escaping of parcel
fields before they reach the panel (an XSS fix), and a Project Intelligence
panel that reports what is on the canvas instead of a decision score built
from invented scenario multipliers.

## 2. A missing endpoint

`editor.html` in the drop POSTs to `/api/site-prequal`. **That endpoint exists
neither in the repository nor in the zip**, so every site screening would have
returned 404. Moving the rubric server-side is correct — CLAUDE.md requires
scoring to live in `/api/` — but only the client half shipped.

`api/site-prequal.js` was written, ported from the client implementation
rather than reinvented so the numbers do not move, with the tenant-active and
billing gates the other endpoints use. It also settles the disagreement the
drop left open: it scores the configured design when the caller sends one,
keeps the published benchmark when it does not, and **labels which it scored**
rather than silently rescaling one into the other.

## 3. Requirement 1 — unsupported SVG features

Counted across `editor.html`'s own generators, comments stripped:

| Feature | Occurrences | Status |
|---|---|---|
| Rounded rectangles (`rx`/`ry`) | 220 | Converted, via the path grammar |
| Images with `preserveAspectRatio` | 30 | Converted (`meet`→contain, `slice`→cover) |
| Marker references / definitions | 12 / 7 | Converted to real geometry at vertices |
| `<use>` instances | 10 | Converted, including `<symbol>` viewBox fitting |
| Elliptical arcs | 9 | Converted to cubics (F.6.5, F.6.6) |
| Clip paths | 2 | Converted (rectangular only) |
| Smooth curves (`S`/`T`) | 1 | Converted, reflected in user space |
| `tspan`, `mask`, `filter` | 0 | Still refuse — nothing emits them |

Still refused deliberately: non-rectangular clip paths (needs polygon
booleans; approximating one moves a property line), rotated clip paths,
reflected/skewed images and text, rich `tspan` text, and any remote `href`.
Refusals name the sheet and the object. **No sheet is rasterised and no object
is dropped to make an export succeed.** Objects wholly outside a clip are not
emitted — the clip already hid them, so drawing them would *add* content the
sheet does not show.

## 4. What was tested, and how

### Passed — node, 44/44
`teditable-pptx`, `tdrawing-critical` (both supplied), plus `tsvgpath` (30
assertions on arc and rounded-corner geometry), `tprequal` (31 assertions on
the rubric, the three-state capacity flag and the auth gates), `tnofakedata`,
and the 39 pre-existing repository tests. `node scripts/check-html-scripts.js`
parses all 68 HTML files.

### Passed — real browser, 18/18
`scripts/tests/compiler-dom-harness.html` exercises `compile()` against the
live DOM — `getCTM`, `getComputedStyle`, `<use>` expansion, marker placement,
clip intersection — which the node tests structurally cannot reach and which
the handoff document recorded as never having been run.

**This found a release-blocking bug.** The up-front attribute sweep rejected
any `href` that was not a `data:` URI. It was written when every `href` was an
image; with `<use>` supported it rejected every symbol on the one-line
diagram. Four of eighteen cases failed until it was scoped to `<image>`.

### Passed — a real PPTX package
`deliverables/OMEGA-sample-plot-plan-EDITABLE.pptx`, compiled in the browser
from a representative sheet and written with the bundled exporter.

| Check | Result |
|---|---|
| Paper size | `11.00 in × 8.50 in` (letter landscape at `PP_DPI` 96) |
| Compiled objects → PowerPoint objects | 55 → 54 `<p:sp>` + 1 `<p:pic>` |
| Real vector freeforms | 40 `<a:custGeom>` |
| Curve segments (arcs, rounded corners) | 29 `<a:cubicBezTo>` |
| Map imagery | exactly one `<p:pic>`, separate and removable |
| Whole-sheet raster | none |

Every object carries its own Selection Pane name: `Fence run N`,
`Gate G-01 (24 ft double swing)`, `BESS-01 outline`, `BESS-01 rating`,
`Ground rod GR-01`, `Feeder BESS-01 to PCS-01`, `Dimensions · text 44`. Text
carried intact, including `SCALE: 1" = 40'` and
`NOT FOR CONSTRUCTION — REVIEW SET`.

## 5. What was NOT done or NOT verified

**Requirement 2 — one equipment graph across plot plan, one-line and
schedules: NOT DONE.** The converter now honours `data-omega-name` /
`data-omega-id` and falls back to the enclosing layer, which is the seam this
needs, and the sample sheet demonstrates it end to end. But the sheet
generators still synthesise their topology independently: the one-line does
not read the placed conduit graph, and IDs, quantities and ratings are not
reconciled across the three renderers. This is the largest remaining item.

**Requirement 3 — project-specific fencing and grounding: NOT DONE.** The drop
removed the false specifics (a defaulted conductor size, a prescribed
electrode size, the claim that every container has two grounding terminals)
and labels what remains as template assumptions. That is an improvement and it
was kept. Replacing the templates with project-driven geometry and reviewed
construction details has not been started.

**Requirement 5 — signed-in staging editor: NOT DONE, BLOCKED.** I have no
staging credentials and did not attempt to obtain any. Nothing in this report
was produced by signing in. Untested as a consequence: editing, undo,
save/reload, sheet regeneration, the browser download path, PDF export, and
the export busy-lock under real use. `api/site-prequal.js` is tested offline
against a stubbed `_lib/admin`; it has never answered a real Firebase token.

**Requirement 6 — visual inspection: PARTIAL.** The sample sheet was rendered
and inspected in a browser, and the PPTX package was inspected object by
object. Not done: opening the file in PowerPoint, comparing at printed sheet
size, or any PDF. Text placement relies on browser font metrics and has not
been checked against PowerPoint's. Sheet-to-sheet consistency was not tested —
the sample is one sheet.

**Requirement 4 — modes, tools, auth, tenant isolation, save/load: preserved
by construction, not verified by use.** No code in those paths was changed
except to *add* the missing authentication gate. Designer/Pro mode switching,
tenant isolation and save/load were not exercised in a running editor.

### Known deviations
- `xMaxYMid slice` (one occurrence) renders through `cover`, which centres the
  crop rather than pinning it right. Invisible on a near-square image; on a
  wide one it shifts the visible window.
- Independently editable lines are not native PowerPoint connectors. Moving
  equipment in PowerPoint does not drag its connections.
- PowerPoint edits do not synchronise back to OMEGA.

### Pre-existing, not from this branch
`portals/skyfund-sandbox/index.html:426` references `/skyfund-sandbox/sandbox.js`,
which does not resolve on disk. Present on `main` before this work.

## 6. Before an engineering-firm handoff

The acceptance list in `engineering-drawing-handoff.md` §"Required acceptance"
stands unchanged. Items 2, 4 and 7 map onto the three gaps above and are the
ones this pass did not close.
