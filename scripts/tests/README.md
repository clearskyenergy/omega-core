# Editor geometry tests

Pure-function tests for the parcel-frame planner, the separation ruler and the
PV azimuth choice. They work by extracting named functions straight out of
`editor.html` — there is no build step and no module system, so extraction is
the only way to reach them from node.

They exist because these three landed as "verified" on syntax checks alone,
and the sweep that the whole frame feature depends on had never executed once.

## Running

    node scripts/tests/extract.js
    for t in tsw tfr tp tg tfence tpoi tsolarfence tobb; do node scripts/tests/$t.js; done

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
| tobb.js | the fence is the MINIMUM-AREA rectangle round its contents, measured from geometry — the case that mattered is solar, written as a polygon whose points already carry the turn while its `rot` stays 0 |
| tpoi.js | a transformer or substation you place is the POINT OF INTERCONNECT, not campus gear — it gets its own compound and stops the yard fence stretching hundreds of feet across empty ground to reach it |
| tsolarfence.js | each compound is fenced in its OWN angle: solar sits at the sun's angle while the campus sits at the parcel's, and one global frame inflated the solar fence |
| tfence.js | `equipFrame` / `boxOf` — that a fence follows the equipment's angle when the equipment agrees on one, stays square when it does not, measures a block at its true size, and routes ties parallel to the fence lines |

## A note on angles

A fence rectangle at 22° and one at 112° with its sides swapped are the SAME
rectangle, so a fence angle only means anything mod 90. Two assertions here were
written without that and failed on correct output.

## Not covered

The live integration: `run -> design -> draw -> drawCampus -> FenceTie`. That
needs a signed-in editor with a drawn parcel, so it is still a person's job.
