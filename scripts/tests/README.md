# Editor geometry tests

Pure-function tests for the parcel-frame planner, the separation ruler and the
PV azimuth choice. They work by extracting named functions straight out of
`editor.html` — there is no build step and no module system, so extraction is
the only way to reach them from node.

They exist because these three landed as "verified" on syntax checks alone,
and the sweep that the whole frame feature depends on had never executed once.

## Running

    node scripts/tests/extract.js && node scripts/tests/tsw.js

`extract.js` writes `sweep.js`, `geo.js` and `pv.js` next to itself. Everything
is regenerated from `editor.html`, so the tests always run against what is
actually in the file rather than a copy that can drift.

## What each covers

| file    | covers |
|---------|--------|
| tsw.js  | `_sweepFrameToWorld` end to end on a synthetic build: pad centres, rects, polyline order, conduits, elements, solar exclusion, pre-existing work left alone, and that placed blocks land inside the real parcel |
| tfr.js  | `_omegaFrame` — that it measures the polygon being PLANNED and not whichever shape happens to carry `isSiteBoundary`, that the parcel comes out square to the grid, and that a square parcel disengages the feature |
| tg.js   | hull-to-hull separation against the axis-aligned boxes it replaced |
| tp.js   | PV azimuth window and ordering |

## Not covered

The live integration: `run -> design -> draw -> drawCampus -> FenceTie`. That
needs a signed-in editor with a drawn parcel, so it is still a person's job.
