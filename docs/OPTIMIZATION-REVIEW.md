# OMEGA optimization review — September 13, 2026

This package updates the existing tool. It does not certify the application as
perfect, establish engineering approval, or claim Blender feature parity.
No Blender export is included.

## What changed

| Area | Implemented changes |
| --- | --- |
| Shared 2D/3D model | Rectangular equipment centering; shape-outline/table transform consistency; native object selection and ground-plane move; numeric rotation, uniform scale, model height, elevation and color; native rectangular block; existing undo/redo; geometry checks reachable from Output. Changes use the editor's existing state and history. |
| Model integrity | Uncalibrated geometry edits are blocked. Invalid numeric transforms are rejected before mutation. Suspicious overlaps remain visible and receive review warnings. Geometry checks identify symbol/physical-footprint differences, invalid coordinates and zero-length conduit runs. |
| Editor battery sizing | Monthly candidates now contain the actual power and per-month shave fields used by economics. Charging appears at the meter; full round-trip recharge losses and ending stored energy are charged. State starts empty and carries through the year. Zero-load months stay aligned. Leap days belong to February. Ratchets use prior observed months. Invalid loads/tariffs fail closed. Unscheduled arbitrage is excluded from payback. |
| Standalone Battery Sizer | State of charge carries across months rather than resetting to full. Peak-day charts use the evaluated dispatch. Import rejects invalid/negative loads and missing, duplicate or out-of-order timestamp intervals. Server response rendering preserves unknown/non-payback values. Editing inputs invalidates an old result. Break-even economics use escalation and installed-power costs consistently. |
| Grid Atlas fiber | Licensed and imported terrestrial routes participate in nearest-route analysis. Subsea and generic communication lines no longer establish terrestrial fiber proximity. Aggregator routes are not labeled verified. Distance never establishes on-net service. Individual failures and stale responses are handled. Carrier/survey GeoJSON can be imported. |
| Server integration | Both sizing engines use authenticated `/api/bess-size`. Licensed fiber uses an authenticated, same-origin `/api/fiber-proxy`. Vendor credentials remain server-side. Existing Battery Sizer Standard access is preserved; Grid Atlas remains available under its current tool-access policy. |

## Use in the editor

Open **Output → Reports → 3D Site Visualizer**. Click an object to select it.
The Modeling panel can move, rotate, uniformly scale, or change its modeled
height, base elevation and color. **Move** enables ground-plane dragging.
**Apply to 2D + 3D** commits a shared-state edit. Undo/Redo use existing editor
history. **2D / 3D Model Checks** is also available from Output.

These controls edit site objects, not arbitrary Blender mesh topology. There
is no sculpting, modifier stack, booleans, UV editor, rigging, or animation
system added. Equipment scaling changes conceptual geometry; it does not
change manufacturer ratings or validate clearances. Inspect footprint warnings
before treating an icon or modeled cabinet as an approved physical envelope.

## Validation performed

`npm run test:optimizer` runs:

- 29 existing sizing/import regression checks, updated to load the server engine.
- 12 additional model/sizing/fiber regression checks, including a separate
  dispatch that checks the standalone result's metered peaks and savings.
- 5 native modeling checks: element and shape transforms, invalid-input
  atomicity, calibration gate, and absence of Blender export.
- 6 sizing API access/input checks with mocked authentication.
- 2 standalone result-rendering contracts with a mocked DOM; interval and
  monthly results generate report HTML without missing/NaN values. This totals 54 focused code/contract checks.
- Inline-script syntax and local script-reference checks for the three edited pages.

These are code and contract checks. A live browser acceptance run was attempted,
but this runtime has no installed Chromium executable. No screenshots, live
WebGL interactions, authenticated staging calls, real utility bills, or licensed
carrier API responses were validated. Do not interpret mocked API tests as a
live authentication or tenant-isolation audit.

## Remaining requirements and limits

1. Deploy both sizing HTML pages and the new API modules together on staging.
   The sizing tools now require an authenticated server; copying the HTML alone
   will not supply the sizing engine. Verify Standard and higher-tier access,
   denied access, and any organization-specific overrides against live billing.
2. Exercise existing project load/save, map zoom/pan, calibration, 2D and 3D
   edits, undo/redo, bonded conduits, and project reopening with real projects.
   The new in-app modeling interaction needs a real browser acceptance pass.
3. Run reference utility datasets and reconcile kW, kWh, demand determinants,
   charging costs, tariffs and recommendations independently. The editor annual
   engine assumes an evenly spaced full year beginning on a month boundary.
   The standalone sizer annualizes short periods and labels that limitation.
   Monthly bills still require assumed load shapes/peak duration. Negative net
   load, solar/storage co-dispatch, demand-window schedules, prior-year ratchet
   history, outages/reserves and detailed degradation are not fully modeled.
4. Supply the actual licensed or carrier/survey fiber routes. Configure
   `FIBER_VENDOR_KEY`, `FIBER_VENDOR_BASE`, and the same-origin
   `CLEARSKY_CONFIG.fiberProxyUrl` after confirming the vendor's real request
   contract and permitted use. The proxy's GeoJSON bbox contract must match the
   subscription. No complete nationwide data or carrier serviceability evidence
   was available. Imported GeoJSON is session-only; keep the source file.
5. Review plot-plan/one-line engineering, fencing, grounding, clearances,
   schematics and editable-PowerPoint output separately with an engineer.
   This pass did not validate every drawing generator or establish stamp readiness.
6. ~~`portals/finance/battery-sizer.html` is an older separate copy and was not
   changed.~~ **Resolved 2026-09-20.** That copy carried the whole sizing engine
   inline and had drifted from the canonical tool (nameplate computed as
   usable/DoD, omitting the discharge half of the round trip). The finance
   hostnames now serve `/battery-sizer.html`; the file that remains is a
   redirect. Grid Atlas's heuristic scores still need consolidation; this
   package does not imply they were audited.

OSM fiber filtering follows the project's
[telecommunications tagging guidance](https://wiki.openstreetmap.org/wiki/Telecoms).
OSM coverage is partial and is not a carrier route inventory.

## Claude Code / staging handoff

Use this package as the updated source snapshot. Read `AGENTS.md`, `MERGE.md`,
and this review, then run `npm run test:optimizer`. Review the changes against
production, deploy to staging using the repository's existing Vercel workflow,
and perform the acceptance checks above. Keep unresolved checks visible;
do not describe the tool as perfect or engineering-approved based on these tests.
