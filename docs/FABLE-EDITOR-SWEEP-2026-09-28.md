# Fable execution guide: OMEGA customer journey and editor sweep

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Prepared September 27, 2026 for Tommy Gilmer. First pass: **Monday, September 28**. Independent second pass: **Saturday, October 3**. Dates use America/Chicago. These are requested work dates, not a verification of either assistant's usage-reset time or an automatic schedule.

## 1. Mission and order of work

Make OMEGA easy to enter, easy to understand, dependable to use, and convincing in a live demonstration to a serious developer, EPC, or OEM. A prospect must be able to move from a site to a saved, coherent, shareable concept without losing context, retyping the same information, or needing an operator to rescue the workflow.

Prioritize in this order:

1. Correct access, correct workspace, and preservation of customer work.
2. A complete primary journey with consistent numbers and outputs.
3. Clear navigation, useful defaults, and understandable recovery.
4. Measured startup and interaction performance.
5. Visual consistency and demo presentation.

This is a broad sweep delivered in small, verified changes. Do not replace the editor engine, redesign billing, or rewrite the entire application to achieve a cleaner screen. Preserve advanced capabilities and existing customer workflows. Repair the underlying function when a button is broken; do not remove a working capability to improve appearances.

The September 27 task created this guide only. It did not implement editor changes, certify production, send outreach, or authorize a new live billing action. When Tommy starts the implementation run, carry the authorized sweep through implementation and verification. Follow established session permissions; do not treat a historical handoff's account of approvals as new authorization for unrelated external actions.

## 2. Strategy the experience must serve

Source reviewed in the browser on September 27: [Ditch the Stack Campaign, Revision A](https://claude.ai/artifact/6tkUB5HkhqiZoJwSHYjv6W). Relevant sections: R-001, V-202, S-301, S-304, S-306 and IP-401. Account names below come from that strategy; account news and market claims were not independently re-researched for this guide.

There are two different sales journeys:

- **Small and mid-size developers/installers:** a 20-minute live build, then an approved trial. Demonstrate how one project connects screening, layout, sizing, estimate and proposal.
- **Large organizations:** a 30-minute working session and a scoped pilot for one team and one region over 90 days. Demonstrate the upstream screening and first-proposal work that complements their existing engineering tools. A proposed 90-day pilot is a commercial engagement, not permission to create a 90-day free trial.

| Priority audience from the strategy | Their entry task | What the editor must demonstrate |
|---|---|---|
| EDPR NA Distributed Generation: C&I origination and corporate programs | A corporate client provides a list of facilities | Import a batch, preserve every site's identity, compare grid evidence, shortlist, create a first layout and carry available bill/load data into sizing |
| EDPR NA DG: community-solar teams in IL, ME and MD | Compare parcels in a new market | State utility coverage and unknowns clearly; distinguish national screening from ComEd-only Site Finder; open shortlisted sites without recreating them |
| Nexamp: regional development, origination and interconnection | Decide which sites deserve engineering effort | Ranked candidates, evidence and dates, first layouts, storage fit when supported by inputs, and a useful engineering handoff |
| Altus Power and similar portfolio teams | Assess acquisition or storage-addition opportunities | Reopen existing work, compare alternatives without overwriting the baseline, export a consistent screening/concept package |
| Generac and Fortress Power: OEM/dealer channels | Dealers need to size and propose the supplier's product | Tenant catalog, correct product identity, accurate module access, branded outputs and correct buyer/tenant separation |
| PowerSecure and EPC/application-engineering teams | Produce an early microgrid or BESS package | Layout, one-line, quantities and estimate that stay consistent as the design changes |
| Smaller BESS, solar+storage and EV developers | Get a credible first answer on one site | A guided path with few decisions, clear missing inputs, dependable save/reopen and a presentable proposal |

These are **test personas**, not instructions to create prospect tenants, use prospect logos, grant access, contact people, or claim that they are customers. Build reusable project-type journeys. Keep account-specific demo scripts and sample lists outside shared core behavior.

Campaign-to-product checks:

- A contact/demo CTA must reach the intended monitored destination; verify routing using an approved test sink, not a real prospect email.
- A visitor, a pending signup, an approved trial, and a returning paid user must each get the right next action.
- Keep the strategy's no-public-pricing messaging separate from product billing and project proposal pricing. Do not hide prices, enable card payment, or change commercial terms as an incidental UX fix.
- Preserve labels for Compute limited trial, Permitting Matrix beta, and unavailable features. Verify the actual release status of AHJ, procurement and RFQ paths before advertising them.
- Show screening as screening. Published hosting capacity is not a utility commitment, available firm load capacity, an interconnection approval, or an engineering certification.
- Record actual demo times. Do not manufacture speed, savings, rankings, data coverage, or customer evidence.

## 3. First task: reconcile the working version

**Do this before making changes. The current directory is not a reliable proxy for the next release.**

Observed September 27:

| Location | Observed state | Implication |
|---|---|---|
| `/Users/tommyg/omega-core` | Branch `jarvis/witchking-onering-ironman`, HEAD `8c28d0f`; modified `editor.html` | Preserve the entire uncommitted diff. It includes tenant/project branding, proposal scope and pricing display, permit export and UI changes |
| `/Users/tommyg/omega-packaging-phase-4` | Worktree at `919f848`, branch `codex/packaging-phase-4` | Contains a newer stacked packaging implementation; inspect before duplicating onboarding or ribbon work |
| `packaging-handoff-2026-09-26/START-HERE.md` | Historical handoff says phases 0/A/1/2/3/4 were draft PRs; later phases remained | Recheck current branch/PR/deployment state. Do not assume September 26 status is still current |
| Current checkout's signup | UI says 30 days; API defaults to 30 via `TRIAL_DAYS` | Conflicts with campaign's 14 days and newer packaging's capped 14-day trial starting at approval; resolve using the intended release, not a text-only patch |

Read applicable `AGENTS.md`, `CLAUDE.md`, and all relevant `MERGE.md` entries. In the packaging worktree also read `docs/ASTRA-HANDOFF.md`, `docs/PACKAGING-ROADMAP.md`, `docs/PACKAGING-WORKSPACE-GUIDE.md`, and phase validation reports. If campaign source files such as `docs/GO-TO-MARKET.md` are absent, use the supplied artifact; they were absent from this checkout during this review.

Initial read-only commands:

```sh
git status --short
git branch --show-current
git rev-parse HEAD
git worktree list
git diff --stat
git -C /Users/tommyg/omega-packaging-phase-4 status --short
git -C /Users/tommyg/omega-packaging-phase-4 rev-parse HEAD
```

Determine the intended integration base from current work and the release stack. Use an isolated worktree/branch for the sweep, following the applicable branch convention. Do not reset, clean, stash, prune, switch, or overwrite another task's workspace. Preserve the original editor diff separately before any planned integration, and review individual changes rather than copying a whole old editor over a newer one. If two active efforts need the same code, identify the boundary and coordinate before integration.

Write a short baseline entry with the selected path, commit, preview URL, inherited changes, baseline test failures and actual commercial/access configuration. Trace conflicting documentation to current code and approved requirements. Do not quietly choose whichever version makes a test easier.

## 4. Concrete inspection leads from this checkout

These are source-review leads, **not confirmed production defects**. Line numbers move; use the symbols. No authenticated editor workflow or performance benchmark was run for this planning document.

| Evidence observed | Investigation for Fable |
|---|---|
| `editor.html` is 11,194,163 bytes and 176,618 lines locally | Profile transfer, parse/evaluation, initialization and third-party work separately. Source size alone is not a deployed performance measurement |
| `openProject()` and `createNewProject()` derive a path by appending `/editor.html` when the current URL has no `.html`; Vercel uses `cleanUrls` | Reproduce project creation/switching from both `/editor` and `/editor.html`; check for erroneous nested routes and lost query context |
| `openProjectsModal()` queries `owner`; project creation writes `uid`; error fallback attempts an unscoped collection read | Check the active implementation, legacy field compatibility and org-scoped listing. Firestore rules are not filters; a denied query must not be shown as an empty workspace |
| `openProject()` catches save failure and proceeds toward navigation | Verify that switching projects after a failed save cannot silently discard work; provide explicit retry/recovery/discard behavior |
| `_setSaved`, `saveProject`, `_loadProject`, early boot stubs, `_loadReady`, `_workDirty`, and a 60-second autosave loop interact | Exercise warm-auth reload, fast navigation, partial load, concurrent save triggers and mutations during an in-flight save |
| Top-level error/rejection handlers suppress some errors, including messages matching Firebase/gstatic | Ensure QA captures meaningful failures even if the UI suppresses them. Never make error suppression the fix |
| Numerous repeating timers update or inject UI | Profile duplicates, hidden panels, listeners and initialization on repeated open/close. Replace polling only where an observed hotspot and a safe lifecycle justify it |
| Head loads `omega-brand.js` then `omega-editor-gate.js`; no direct `omega-tenant.js` include was found | Reconcile with AGENTS' required tenant loading order. Adding the tenant runtime affects hostname locks and customer-engine behavior; give it an explicit auth/host regression pass |
| `MERGE.md` contains historical browser pricing/scoring/modeling debt | Trace active call sites on the chosen branch. Move prohibited logic touched by the sweep into authenticated, entitled APIs, record it in MERGE, and test parity; do not claim all IP debt is already gone |
| Local proposal changes add `_PROP_OPTS`, `_proposalScopeLines` and `_proposalScoped` | Preserve intended behavior; verify preview/export agreement, scope exclusions, itemized/total/no-price modes, financial sections and branding |
| `docs/editor-multisite-handoff.md` describes named-site/all-site EV workbook handoff | Confirm the actual message contract, origin/source checks, site names, stable updates and measured versus inferred footage |

## 5. Define the golden journeys before editing

Use invented organizations and fixtures, public demo sites, or authorized test projects. Never repurpose a real customer's record as a test fixture. Screenshots must exclude other customers, personal information, keys and internal commercial/model details.

### Journey A — first-time developer, one BESS site (highest priority)

1. Arrive from the campaign's demo or approved trial path. Explain the next step without implying instant approval when approval is required.
2. Enter the correct branded workspace. Create a named project and choose BESS.
3. Enter the address once; confirm its location, usable boundary and map scale. If geocoding is ambiguous or coverage is absent, explain what to correct.
4. Inspect the grid screen, dates, coverage and unknowns. Carry the same site into the design.
5. Place a guided BESS concept with an explicitly confirmed POI/service location; show missing evidence instead of silently inventing it.
6. Provide real test load/tariff data for sizing, or clearly label a sample/assumption-based concept. Keep kW, kWh, MW and MWh consistent.
7. Open the one-line, BOM and estimate. Change an equipment quantity and move a unit; verify the dependent outputs refresh or visibly require refresh.
8. Generate the scoped proposal. Open the generated file and inspect every page for layout, branding, units, quantities and stale values.
9. Save, close, reopen in a fresh browser session, and continue editing the same project.

Success: no unexplained dead ends, lost work, repeated site entry, stale financial result, or mismatched deliverable. A user can always identify the next useful action.

### Journey B — EDPR/Nexamp multi-site screening

1. Import 10 representative site files using the actual supported format. Then test a 50-site workload, including duplicate, malformed, ungeocoded and out-of-coverage records.
2. Show progress, partial results, individual failures, cancellation and retry without restarting successful work.
3. Preserve name/ID, location, units, evidence dates and missing-data state for every row. Unknown must not become zero or a confident pass/fail.
4. Sort/filter and shortlist three. Open each site into the right project/design context and return without losing the shortlist.
5. Produce a first layout for a shortlisted site and an engineering handoff. Verify reimport updates the intended record rather than silently duplicating it.
6. Save and reopen the batch/shortlist using the supported persistence path. If persistence is not implemented, identify it as a gap rather than faking successful save.

Success: the team can explain which sites deserve investigation and why the evidence is sufficient or incomplete. No claim that the entire country has ComEd-level detail.

### Journey C — OEM/dealer and white-label use

Use a configured test supplier and authorized test buyer. Verify tenant catalog precedence, product dimensions/SKUs, branding across editor and exports, and permitted module visibility. Run both tenant Editor Lite and supplier-customer Lite where those surfaces exist. Customer-engine mode must not initialize platform membership or expose platform projects. Test the real server authorization, not only the overlay.

Do not show a generic concept as an orderable SKU. For a supported quote flow, verify exactly what is transmitted, identity timing, recipient scope, double-click/retry behavior and retained project revision using mocks or an approved test sink. Do not send a live RFQ as a test.

### Journey D — secondary project types

Repeat create → configure → change → save → reopen → export for DCFC, solar+storage and Compute. Include L2 and any additional start cards on the selected branch. Compute remains labelled limited trial where applicable. Hide irrelevant navigation using the existing workspace/module model while retaining the drawing functions required by the product specification.

### Journey E — returning team and collaboration

Test an owner, admin, ordinary member, viewer, permitted JDA collaborator and unrelated tenant. Open an old project as well as a new one. Verify owner org is immutable, collaborators cannot rewrite the roster or delete the project, and cross-org task assignment remains org-level. Test project switch, two browser tabs, stale revisions and expired sessions. A viewer must not appear to have saved a write that the backend rejected.

## 6. UX and organization specification

Use a consistent conceptual progression: **Site → Design → Size & review → Estimate → Share**. Map it onto existing tabs/start cards rather than adding a second navigation system or renaming everything at once.

- **Persistent context:** project name, site, project type, current workspace and honest save status. Make the active map/tab obvious.
- **One primary action per stage:** an empty project has a clear start; a configured project has a clear next step; returning work offers continuation.
- **Progressive disclosure:** basic controls first; advanced configuration stays discoverable. Keep the canvas useful on a normal laptop.
- **States:** distinguish loading, empty, missing input, no coverage, not included, unauthorized, offline and failed. Give an actionable retry or correction where possible.
- **Async behavior:** prevent accidental duplicate requests; show progress promptly; allow cancellation when safe; ignore stale responses after site/project changes.
- **Save confidence:** distinguish browser-local recovery from server-confirmed save. Display failure persistently and protect navigation. Reopening elsewhere is the durability test.
- **Consistency:** standard labels, units, precision, button styles, form validation, panel width, spacing and close/back behavior. Do not expose internal function names as customer errors.
- **Accessibility:** keyboard access to navigation/dialogs, visible focus, labels for icons, focus return after closing, readable contrast and status announcements. Dialogs must remain operable at zoom.
- **Responsive behavior:** inspect 1440×900, 1366×768, 1024×768, 768×1024 and 390×844. A phone must have usable entry, status and review; if full editing is unsupported, say so clearly and preserve work.
- **Theme/branding:** light/dark where supported; white OMEGA mark on the navy bar; real tenant logo proportions; exported attribution and project branding consistent with the user's chosen scope.
- **Commercial states:** unowned modules, trial expiry and pending payment must follow the chosen release's authoritative access projection. Never use UI convenience to bypass backend enforcement.

Avoid animation-heavy decoration, novelty navigation, a mandatory tour, and a new parallel settings system. The editor should feel calm because actions and state are predictable.

## 7. September 28 execution sequence

These are effort allocations, not a promise that every defect fits in one day. If a data-loss or access issue consumes the day, reduce polish scope and deliver a truthful checkpoint.

| Block | Suggested allocation | Work and exit condition |
|---|---:|---|
| 0. Establish base | 10% | Reconcile branches and inherited changes; identify working preview and test identities; record baseline checks |
| 1. Walk and reproduce | 15% | Run A and B before changing UI; inventory visible controls and classify failures; capture timings and screenshots |
| 2. Repair trust | 30% | Fix verified access/routing/save/load/state-consistency defects in small patches; add regression coverage for substantive failures |
| 3. Simplify journey | 20% | Improve hierarchy, next actions, panel behavior, labels and empty/error states; preserve working capabilities |
| 4. Performance and outputs | 15% | Fix measured hotspots; validate generated files; repeat batch and large-design workloads |
| 5. Acceptance and handoff | 10% | Run focused and full required checks, preview journeys, closeout report and October 3 evidence bundle |

Use priorities in the issue ledger:

- **P0:** cross-tenant exposure, wrong owner, data loss/corruption, unauthorized action, materially incorrect outputs presented as correct. Stop release of the affected path.
- **P1:** primary journey blocked, misleading save, broken output/handoff, stale result, unusable performance or inaccessible primary control. Must pass before demonstrating that path.
- **P2:** friction, discoverability, responsive problems, inconsistent copy or visual hierarchy. Fix after P0/P1.
- **P3:** optional convenience, cosmetic refinement or future expansion. Defer when it threatens verification.

For each issue record: ID, persona/journey, priority, exact repro, expected/actual, file/function, root cause, change, regression check, preview evidence, status and any dependency. Treat baseline failures separately from new regressions without dismissing baseline failures that affect the campaign.

## 8. Performance plan and provisional budgets

Measure the same fixtures, machine, browser, viewport and network settings before/after. Record cold and warm runs separately. Include an ordinary laptop profile with 4× CPU slowdown and a documented constrained network profile where tooling supports it. Use five repeats for startup; use at least 20 sampled actions for interaction percentiles. Small samples are lab observations, not field statistics.

| Measure | Provisional acceptance target |
|---|---|
| Basic button/menu feedback | Visible response within 100 ms; sampled primary interaction latency p95 below 200 ms on the recorded normal profile |
| Cold editor ready | Aim for ≤5 s on normal broadband after valid auth is available; separately report redirect/auth, download, parse, map and project restore times |
| Warm project ready | Aim for ≤3 s on a representative saved project; usable means loaded, editable and safe to save, not merely visible |
| Site/provider/API work | Progress indicator within 200 ms; explicit bounded timeout/retry behavior; report upstream duration separately |
| Drag/pan/select | Target a 60 fps frame budget on an ordinary design; investigate main-thread tasks >50 ms and eliminate >1 s UI freezes in the golden path |
| Regression guard | No unexplained >10% regression in median critical-path timing under the same conditions; investigate variability rather than gaming the sample |
| Sustained session | 30-minute mixed-use soak, repeated panels and project switches; no monotonic retained-memory growth, accumulating listeners/timers, or work loss |

Use small, medium and stress fixtures—for example 25, 250 and 1,000 placed objects, plus 10 and 50 sites. These are proposed test workloads, not advertised supported limits. Report any practical limit honestly.

Profile before modifying. Inspect repeated DOM work, expensive geometry on pointer movement, unnecessary serialization, duplicate reads, unbounded batches, image memory and eagerly loaded export/3D libraries. Prefer targeted event-driven updates, requestAnimationFrame for rendering, debouncing/batching and on-demand optional libraries where safe. Preserve load order and old-browser compatibility. Do not add a bundler or split the canonical editor into a new architecture for this sweep.

A performance fix is incomplete if it loses undo history, omits objects, serves stale calculations, falsely marks a save complete, or breaks offline recovery. Validate the full workflow after each meaningful optimization.

## 9. Verification: what counts as proof

Maintain separate result columns for **static**, **unit/API with mocks**, **browser fixture**, and **authenticated hosted preview**. A syntax check proves parsing; a mocked request proves neither deployed entitlement nor real persistence. Mark a blocked test BLOCKED with its exact prerequisite, never PASS or silently skipped.

Commands known to exist in the reviewed checkout; run from the selected worktree and inspect its package scripts for additional packaging checks:

```sh
node scripts/check-html-scripts.js editor.html editor-lite.html start.html projects.html
npm run test:editor-mode
npm run test:optimizer
npm run test:handoff
npm run test:whitelabel
npm run test:scope
node scripts/tests/tnav.js
node scripts/tests/tautopilot.js
node scripts/tests/tundoleg.js
node scripts/tests/ttrenchft.js
node scripts/tests/ttrenchkeep.js
node scripts/tests/trfqroute.js
npm test
npm run check:pages
```

Run relevant focused checks after each change and the required full checks on the final integration. If geometry changes, follow `scripts/tests/README.md`, regenerate extracted helpers and run the matching geometry suites. If API/rules or packaging access changes, run the branch's actual authorization/emulator tests as well. Structural rules checks alone are not authorization proof. Do not weaken tests or replace the real editor with a simpler fixture to obtain green results.

Minimum acceptance matrix:

| Area | Required cases |
|---|---|
| Entry/routing | Signed out; pending; approved; returning paid; expired/unpaid as supported; direct `/editor` and `.html`; project deep link; refresh/back/forward |
| Entitlements | Owned/unowned modules; Lite/full/supplier customer modes; direct API attempt; correct staff/tenant distinctions on the intended release |
| Persistence | New/old project; manual/autosave overlap; edit during save; close/reopen; failed write; network loss; local quota; second-tab conflict; failed/partial project load |
| Site state | Different addresses across tabs; map/scale/boundary/POI; duplicate/invalid imports; unsupported utility; change site while a response is pending |
| Design state | Place/move/rotate/duplicate/delete; undo/redo; equipment/trench/conduit/one-line/BOM consistency; units and scale retained |
| Outputs | Same project/revision and quantities in estimate/proposal; no-price/total/itemized scope; tenant branding; actual PDF/image/CAD file opens and is readable |
| Team/privacy | Owner/admin/member/viewer; permitted collaborator; unrelated org denied; immutable project ownership/roster; buyer data not exposed to platform tenants |
| Accessibility/UI | Keyboard, focus, dialogs, zoom, long names, light/dark, desktop/tablet/phone, Chrome/Edge and Safari where available |
| Resilience/performance | Provider timeout, CDN failure, expired token, offline recovery, cold/warm boot, 10/50 sites, large drawing and sustained session |

Run failure injections with fixtures or controlled test services; do not disrupt real customers or providers. Hosted Vercel previews can still connect to production Firebase—verify the data boundary explicitly. Use the documented tenant preview mechanism and authorized synthetic records, not customer data edits. Do not test by disabling auth, changing tenant billing, or widening rules.

## 10. Campaign demo readiness

Prepare repeatable scripts, fixture IDs, required entitlements and reset/reopen instructions for:

1. **BESS build:** address → confirmed site/POI → layout → separation feedback → one-line → quantities.
2. **Batch screen:** 10 supported site files → completed ranking with unknowns → shortlist → first layout.
3. **Move it once:** a controlled equipment move → routing/quantities/estimate refresh; verify the actual supported dependency chain before promising automatic updates.
4. **Full run:** site/grid → layout → sizing → one-line/estimate → proposal → saved project.
5. **Secondary builds:** EV hub, solar+storage, Compute with its correct availability label.

Use outputs and authorized public/synthetic data on camera. Hide customer lists, keys, admin surfaces, proprietary rates/model internals and unrelated browser content. Keep necessary customer-entered inputs usable in the product; recording restrictions are not a reason to cripple the editor.

The artifact contains claims that need reconciliation: its account copy promises RFQs while its guardrails label procurement coming soon; older local signup says 30 days while newer packaging/campaign says 14; some generic IP text mentions showing a price-list page while the later campaign decision prohibits public price content. Resolve each against the intended release and latest approved product decisions. Do not copy contradictory claims into UI or record an unproven workflow.

If recording support is unavailable, deliver the verified click script and measured run log, and state that no video was captured. Do not describe screenshots as a one-take recording. Keep contact/publishing activity outside this engineering run unless Tommy explicitly asks for it.

## 11. Required end-of-pass handoff

In the selected implementation branch create `docs/EDITOR-SWEEP-2026-09-28-RESULTS.md` and an evidence folder such as `docs/editor-sweep/2026-09-28/`. Link every result to the exact commit and tested environment. Include:

- Selected base and final commit, changed files, integration/PR status and real preview URL.
- Baseline versus final issue ledger, with explicit P0/P1 disposition.
- Before/after screenshots for the primary journey and responsive states.
- Golden-journey results and output artifacts, with all sensitive details removed.
- Timings with fixture size, machine/browser/network profile and cold/warm distinction.
- Test commands/results and any failing or blocked hosted scenarios.
- Updated `MERGE.md` for engine moves and consequential architecture decisions.
- Demo scripts and the exact features safe to demonstrate.
- Deferred work, external blockers, and a prioritized October 3 retest list.
- Rollback reference for the changed application version; if data or rules are involved, explain compatibility explicitly. Do not assume rolling back HTML reverses a data change.

**Ready for an enterprise demonstration** means the chosen scenario passes end to end with real persisted test work and readable outputs, has no open P0/P1 on that path, and has no unproven claim in its script. **Ready for release** also requires the broader access, regression and deployment checks. Report these separately. A polished fixture alone is neither.

Production merge/deploy, commercial activation and any live rules/data operation follow the established release process and actual authorization. This guide does not require a gratuitous new permission checkpoint for ordinary reversible code fixes, and it does not convert a planned sweep into permission for unspecified live changes.

## 12. October 3: independent second pass

Begin with the results bundle and the actual current integration/release commit. Recheck intervening changes. Do not restart the redesign or assume every September 28 PASS still holds on a different deployment.

1. **Fresh-user test:** in a clean session, run A and B without relying on the first pass's click instructions. Record confusing choices and places that still require verbal coaching.
2. **Challenge prior fixes:** reproduce every original P0/P1, particularly clean URLs, save failure during navigation, stale results, multi-site identity and output consistency.
3. **Persistence and security review:** compare saved/reopened state, cross-org negative cases, Lite/customer-engine boundaries and direct API refusals. Review any changed rules/API code against the final deployed version.
4. **Adversarial inputs:** long/unicode names, blank and duplicate sites, malformed import, large geometry, missing tariff/load, expired auth, slow providers, interrupted save and second-tab edits.
5. **Performance repeat:** use the same benchmark fixtures and run settings, then the sustained-session test. Investigate deterioration rather than resetting the baseline.
6. **Pixel/content pass:** inspect every primary screen and every page of the generated proposal; check truncation, spacing, contrast, terms, beta labels, branding and units.
7. **Enterprise rehearsal:** run an EDPR multi-site demo, a Nexamp screening/handoff demo, and an OEM dealer demo with synthetic/public data. Report actual elapsed time and unassisted completion.
8. **Release decision:** close new regressions, retest affected journeys, and publish `docs/EDITOR-SWEEP-2026-10-03-RESULTS.md` with explicit demo-ready/release-ready/blocked outcomes.

The goal is demonstrated reliability and clarity. Do not claim literal perfection or certify paths that could not be exercised.

## 13. Copy/paste kickoff prompts

### For Fable on September 28

> Read `/Users/tommyg/omega-core/docs/FABLE-EDITOR-SWEEP-2026-09-28.md` and carry out its editor/customer-journey sweep. First reconcile the current release and packaging branches, preserve the existing uncommitted editor work, and read the applicable AGENTS, CLAUDE and MERGE instructions. Focus on EDPR/Nexamp multi-site screening and the BESS address-to-proposal journey, then OEM/dealer and secondary project types. Implement small verified fixes, improve navigation and measured performance, and test save/reopen and output consistency in the actual editor. Continue through the authorized implementation and verification work; document exact external blockers while completing independent work. Do not send outreach or mutate real customer/billing data as tests. Finish with the required results/evidence bundle for the October 3 review.

### For the October 3 follow-up

> Read `/Users/tommyg/omega-core/docs/FABLE-EDITOR-SWEEP-2026-09-28.md`, locate Fable's implementation branch and `docs/EDITOR-SWEEP-2026-09-28-RESULTS.md`, and perform the independent second pass in section 12 against the actual current release candidate. Reproduce the original defects, test the journeys as a fresh user, challenge persistence/access/state consistency, rerun performance measurements and inspect exported deliverables. Fix remaining issues in small verified changes without undoing approved work. Deliver the October 3 results file with evidence and clear demo/release readiness, preserving any exact unresolved blockers.
