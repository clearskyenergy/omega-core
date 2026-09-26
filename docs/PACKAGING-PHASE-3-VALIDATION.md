# Packaging Phase 3 — editor workspaces

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Implementation is behind `billing/current.packaged`. No tenant, trial, billing
date, QuickBooks company or rule deployment was changed. The proposed book
remains disabled. This is a stacked change on Phase 2.

Draft PR: [#138](https://github.com/clearskyenergy/omega-core/pull/138).
Vercel-assigned preview: [Phase 3](https://omega-core-git-codex-packaging-phase-3-clearsky-usa.vercel.app).
Consult the PR for current hosted checks/deployment status. Authenticated hosted
customer acceptance is still outstanding; the captures below are offline fixtures.

## Behavior

- One server catalog supplies module ownership, feature triplets and the
  browser MODULE_GRANTS projection. Late commands receive data-module too.
- Empty ribbon groups/tabs disappear; numbered captions close their gaps.
  The ribbon wraps at 1280px. Legacy Designer hiding cannot remove core draw
  commands or defeat All tools. Shared commands are rehomed from paid-only
  containers using catalog metadata; All tools checks their actual reachability.
  Fleet O&M and O&M Lifecycle belong to Operations in the sole catalog.
- Seven workspaces focus related commands. Mixed siteScopes take their union;
  the existing der + bess representation becomes Solar + Storage. Unknown
  historical types retain all owned tools rather than guessing a replacement.
- All tools is remembered by Firebase uid. Package access always wins.
  Engineering and Plan Sets default to Pro; an explicit mode choice wins.
- Existing results are reordered by project type without recalculating them.
  Empty project results offer the owned guided build or Site Setup.
- The single `omega-package-menu.js` gallery renders one card per unowned
  module. Prices come from `/api/package-catalog`. It reports unavailable
  pricing honestly. Checkout and prorated paid activation remain Phase 5.
- Ctrl+K and Jarvis expose unowned commands as `view-module` discovery entries;
  choosing one opens the module card, never the producer.
- Staff package previews use authenticated POST `/api/package-access` and
  `caller.staff`. They return customer-shaped presentation, perform no writes,
  and do not change caller identity or organization.
- An existing new-account freeze is fixed: a loaded empty Recent Projects
  result no longer triggers an endless fetch/render promise loop.

## Migration

`scripts/backfill-modules.js --input reviewed-org-snapshot.json` accepts an
array of `{ orgId, billing, effectiveTools }` snapshots. Capture effectiveTools
from the current workspace, alongside audit counts, before rollout. The
planner reads the existing caps runtime and sole catalog; it does not guess
current access from a tier alone. It flags custom contracts, widened access and
existing tools outside the sold catalog. It has **no apply or write path**.

Only synthetic snapshots have been tested. No live org snapshot or audit was
read, so this is not a completed live-tenant migration report.

## Verification

- Packaging tests include 531 workspace/migration/empty-project assertions,
  eight staff-preview authorization assertions and two new O&M ownership
  assertions, in addition to the prior 1,329: **1,870 packaging assertions**.
  Full `npm test` passed.
- The full canonical editor HTML, inline scripts, shared runtime and native
  MutationObservers run in the new browser matrix. No launcher spies or
  observer suppression are used. The final targeted matrix passed **180 checks**
  and produced **84 images**: 70 workspace captures (five packages × seven
  workspaces × two themes), ten tablet captures, two gallery and two
  staff-preview captures.
- Full `npm run check:pages` passed, including inherited office/plant/portal
  checks, Phase 0 (12), Track A (76), catalog (4 captures), Phase 2 (29), and
  the Phase 3 matrix (180). Desktop is 1280px; tablet landscape is 1024px.
- The editor inline-script parse check and the 158-helper structural rules
  check passed. No rules changed or deployed; this is not an emulator claim.

Browser service adapters supply a signed-in fixture identity, empty Firestore
snapshots and server-generated projections. Maps, external services and
producing APIs are offline. These captures validate the complete editor's
presentation and boot behavior, not a hosted real-user billing or Maps flow.
The existing Phase 2 API tests cover producers separately.

## Open acceptance and release work

**Export to Monday stays in Lite.** Tommy explicitly confirmed this on
2026-09-26. ROADMAP §3.3 now agrees with VALUE-LADDER and the existing catalog.
AI Render remains exclusive to Plan Sets & CAD.

The historic browser engine ports, packaged data-write rules, approval-started
trial and paid QuickBooks lifecycle remain prerequisites to enabling packaged
billing. Phase 3 does not make a client-side visibility check a security boundary.
