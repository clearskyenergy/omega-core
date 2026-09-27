# Packaging Phase 2 — access projection and editor entry paths

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

This phase is stacked on Phase 1. The proposed price book remains disabled. No
billing record, trial, QuickBooks connection, production deployment or rule
has been changed by this phase.

## Access contract

`api/_lib/package-access.js` resolves `billing.packaged === true` from the
one `api/_lib/modules.js` catalog. Legacy billing remains on the existing
product gates. The packaged projection ignores legacy tiers, addons, org
allowlists and tool overrides; member tool lists can only narrow it, including
an explicit empty list. Verified email, an active org and active membership
are required. Only the verified server caller's `staff` flag bypasses gates.

Producing requests require `packagingState: paid`, or a current `trial`
window with `trialStartedAt` and `trialEndsAt` no more than fourteen days apart.
Other states and viewer membership are read-only. Phase 4 must write these
fields only from the approved trial/payment lifecycle; this phase does not
mint payment evidence. Invalid module combinations fail closed.

`GET /api/package-access` returns only this presentation projection, never
pricing or customer billing details. A failed billing read returns 503, rather
than an empty legacy trial. Browser resolution also stays closed on failure.
Colleagues still auto-join as members through the existing self-registration
rules before the packaged projection is requested.

## Editor entry paths

- File menu and Output exports use the same catalog ownership as the ribbon.
- Both Summary's Cost launcher and its internal Cost tab require Estimate.
- Documentation requires Plan Sets & CAD.
- Ctrl+K and Jarvis filter their shared command list and recheck at execution.
- A capture handler refuses clicks on unowned controls, including `.click()`.
- Named launchers are guarded without deleting their original implementations.
- The observer gates newly injected controls; unknown ribbon commands are hidden.
- Compute launchers outside its tab use their argument-sensitive ownership.
- AI Render is Plan Sets & CAD only, per Tommy's explicit decision.
- `customerEngine=1` alone yields an empty projection. The legitimate same-origin
  Customer Editor Lite parent supplies a server-derived Lite drawing projection
  only after its existing buyer API authorizes access. Buyer persistence remains
  separate from platform projects. This bridge is presentation, not a substitute
  for buyer/API authorization.

Packaged tool tiles are hidden rather than greyed. Existing empty member/org
allowlists are now preserved in both tenant merging paths. Mixed legacy tab
caps no longer suppress an owned Estimate/Analyze tool. Full pruning,
renumbering, workspace presets and module navigation remain Phase 3.

## Server producers

The shared decision is enforced by BESS size/design, BESS Pro Forma, Compute
Lease, Network Proximity, fiber screening/proxy, AI Render, Estimate/Site Finder
pricing, Site Finder scoring/catalog/lease, project cost, RFQ creation, guided
site layout and engineering validation submission. Operation-specific data
ownership checks remain in those endpoints. Vendor RFQ response/decision paths
retain their distinct existing role checks.

Network evidence is shared by Grid Atlas, Site Intelligence and Compute;
the Grid Atlas service also feeds Site Finder. An entitlement to a shared
service does not grant another module's editor launcher. AI Render no longer
spends provider funds when its billing read is unavailable.

Grid Atlas POST now requires the Firebase caller and billing check. The old
optional shared secret cannot represent an organization or grant a module.
Both core clients call the current host's authenticated service and no longer
retry against older external copies. External clients using `GRID_ATLAS_KEY`
must migrate to an authorized Firebase identity before release; no connection
or credential was modified here. Validation submission now sends a Firebase
token and takes sender identity from the verified caller. Tests sent no mail.

## Verification

- `npm test`: passed, including 1,329 packaging assertions.
- Packaging access: 131 assertions; producer handlers: 65; Admin producers: 12.
- Existing tool allowlist suite: 34 assertions, including six new regressions.
- The full CI geometry/routing script set also passed locally after updating
  its legacy RFQ Admin mock for the new billing read. RFQ routing now runs in
  `npm test` as well.
- Two signed-JWT regressions distinguish a missing billing document from an
  unavailable read. Existing gate tests use verified current-domain staff.
- `npm run check:pages`: passed; existing page renders, Phase 0's 12 assertions,
  Track A's 76, four server quote captures, and 29 new editor-control assertions.
- Eight images in `docs/screenshots/packaging-phase-2/`: Lite and
  Lite + Estimate + Plan Sets + Compute, light/dark, Output and File views.
- `node scripts/check-html-scripts.js editor.html`: parse/reference check.
- `node scripts/check-rules.js firestore.rules`: 158 helper definitions/calls,
  structural check only. No rules edits, emulator claim or rules deployment.

The browser fixture runs the actual ribbon/Summary markup, styles, command
palette, icon/retirement owners, capability runtime and mutation observer.
Launcher bodies are spies; producing APIs are tested separately. It is not a
full Maps, drawing engine or authenticated hosted-editor acceptance test.
The existing custody test was made deterministic for same-millisecond event
ties; no custody production behavior changed.

## Remaining release work

The historical client-engine debt in MERGE.md remains, including browser cost,
site scoring and permitting models. This phase adds no browser pricing model
and does not claim browser source is protected by hidden controls. Those ports,
full editor acceptance, the paid activation lifecycle, packaged write rules
and the 5 × 7 workspace matrix must be handled before packaged billing is
turned on. Existing tenant records remain untouched until the reviewed rollout.
