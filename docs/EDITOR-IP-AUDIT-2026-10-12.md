# Editor IP audit — 2026-10-12

Why: a customer's engineer told them they could build Site Map themselves.
Tommy asked for the editor to be gone through so the IP is protected and the
copyright is on it. This is what was found, what was fixed the same day, and
what still has to move. `scripts/tests/tcopyright.js` holds the fixed part.

## What protects the IP, honestly

1. **The Terms.** `omega-legal-docs.js` §5 (accepted on every sign-in through
   `omega-terms.js`, version `2026-09-23`): no retention of code, no reverse
   engineering, no building, funding or specifying a product derived from the
   platform, and "transmission to a browser is a technical requirement and
   not a publication". That clause is the one a lawyer leads with against
   "our engineer looked at the source and rebuilt it". It is accepted by the
   USER; the customer's company is bound through the Master Terms the same
   file carries. Every page the engineer could have opened sits behind that
   acceptance (`omega-editor-gate.js` requires a signed-in user of an active
   tenant; there is no public link into `/editor`).
2. **The notice on every shipped file** — now the LLC on every one.
3. **Math in `/api/`** — where it already is (below). This is the only
   protection that works against someone who ignores 1 and 2.

What does NOT protect it: minification. CLAUDE.md said shipped JS was
minified in the Vercel build step. There is no build step and never was
(constraint one of the repo), so `editor.html` ships as 179,000 lines of
commented source, with the design reasoning in the comments. Corrected in
CLAUDE.md today. Adding a Vercel `buildCommand` that minifies into an output
directory would not break the no-build-for-development rule, but it is a
product decision and a deploy change, and it is still only a speed bump.

## Fixed today

- Every notice in `editor.html` named an individual ("Copyright 2026 Tommy
  Gilmer"), while every other file, the Terms and the licensor are ClearSky
  Energy Solutions LLC. A copyright held by a person and a licence granted
  by a company is a mismatch a defendant's lawyer uses. All six notices now
  read `© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and
  Confidential.` (the author credit stays), the `<meta name="copyright">`
  says licensed-not-sold and names the Terms, and `<link rel="license">`
  points at `/terms.html`.
- The console banner ("Ownership declaration") printed `brandName()` as the
  owner — under a white label that is the TENANT's name, so Clean Cell's
  users saw "(c) 2026 Clean Cell — All rights reserved" on OUR code. It is
  the LLC by literal now, and the test refuses `brandName(` in that block.
- 56 shipped files carried no notice at all (26 root tool pages including
  `projects.html`, `index.html`, `marketplace.html`; 14 `omega-*.js`
  including `omega-sso.js`, `omega-tools.js`, `omega-boot.js`; 16 `api/`
  files including `stripe-webhook.js`, `tenant-approve.js`; the admin
  console, the ops console, the finance portal). Every one has it now.
- `scripts/tests/tcopyright.js` (in `npm test`) fails on a shipped file
  without the notice, an editor notice naming another owner, a banner that
  reads the white label, a Terms file without the reverse-engineering
  clause, or a CLAUDE.md that claims minification again.

## What runs in the browser and should not (the inventory)

Ranked by what a competitor would most want. Line numbers are today's.
Everything here is readable by any signed-in user of any tenant.

| # | What | Where in `editor.html` | Why it matters | Server home |
|---|------|------------------------|----------------|-------------|
| 1 | **DONE 2026-10-12.** Utility rate book, now `api/_lib/utility-rates.js` behind `GET /api/utility-rates`; the page keeps a per-ZIP cache (`tutilityrates.js`) | was 19992, 20197 | Demand and energy rates, demand share, ratchet and TOU flags by ZIP prefix for every utility we model. This is curated data, the kind of thing that takes months to assemble, and it is a JS object literal. | `api/_lib/bess-tariff.js` already holds tariffs for the server sizers; the editor's copy should become a `GET /api/tariff?zip=` answering only the fields the UI prints. |
| 2 | **DONE 2026-10-13.** Cost engine, now `api/_lib/editor-cost.js` behind `POST /api/cost-rollup`: the benchmark book, the $85/kWh rate and 55% install share, the Eaton DC ROM, the EV price book (Autel dealer cost beside list), the generation classes and every roll-up rule; the page sends quantities and draws lines (`teditorcost.js`, `render-editor-plan.js`) | was 28260, 29148, 29625 | The unit-rate bands and ratios ARE the pricing method. `api/price-site.js` and `api/project-cost.js` already price a site server-side for the storefront and the lease comparison; the editor's Run still prices in the browser. | Route Run's costing through `api/price-site.js` (same gate, same org pricing record); the browser keeps the item list and the editable overrides, the server returns the lines and totals. `omegaRunRollup()` and `tcostrollup.js` already pin the output shape. |
| 3 | **DONE 2026-10-13.** Site pre-qualification scorer, now `api/_lib/editor-score.js` `prequal` behind `POST /api/editor-score` (`teditorscore.js`) | was 16092 | Pure, documented weights and the Priority Go / Conditional Go thresholds. Explicitly the kind of thing CLAUDE.md lists ("site viability scoring"). | `api/site-score.js` is the authenticated, org-scoped scorer for Site Finder and already keeps weights server-side (`action:'weights'` returns only metadata). Add a `prequal` action there; the modal posts inputs and renders the breakdown it gets back. |
| 4 | **DONE 2026-10-13.** Interconnection-ease score, now `api/_lib/editor-score.js` `interconnect`; weights and curves never leave the server | was 30050 | Scoring method plus ISO friendliness table. | Same endpoint as 3. |
| 5 | **DONE 2026-10-13.** Viability Workflow judgment, now `api/_lib/editor-score.js` `viability`: factor points, disqualifiers, ordinance penalty, verdict thresholds, BTM/FTM points, the investment gate and the overall decision (`teditorscore.js`) | was 54173–54600 | The decision rules a financier would pay for. The IRR itself is fine in a browser (it is arithmetic); the thresholds are the IP. | `api/proforma.js` on `proforma-engine.js` already runs the investment math; add a `decision` block there and have the workflow post its phase answers. |
| 6 | **LEFT IN THE PAGE, on purpose (2026-10-13).** Ground layout `computeGroundLayout`: fourteen synchronous callers in drawing and sizing flows, one a GCR search loop; a server round trip would make auto-layout unusable, and its assumptions are published convention. Revisit only if a sync-safe design appears. | 15215 | Placement algorithm for pads and spacing. | `api/_lib/site-fit.js` already places products for the public site study (`api/embed-layout.js`); the editor should call the same library server-side rather than carry its own. |
| 7 | **DONE 2026-10-13.** The thirteen `eqcost` figures on `BESS_CATALOG` are `null` in the page and live in `api/_lib/editor-cost.js` `CATALOG_PRICES`, applied by catalog key; specs and footprints stay (datasheet facts). | | | |

Already server-side and NOT in this list: BESS sizing (`api/bess-size`,
`api/bess-design`), the Value Stack dispatch and rates (`api/value-stack`),
the Compute Site Pro Forma (`api/compute-proforma`), the Omega-Core
qualification, the Helios draft, the site lease and the company's cost to
deploy (`api/project-cost`), the Site Finder scorer (`api/site-score`), the
parcel lookups, the EV workbook's unit-rate bands.

## Order of moves

Each is one PR, each with a test that cuts the function out of the page and
asserts the browser no longer carries the figures:

1. ~~Rate book (#1)~~ — done the same day.
2. ~~Pre-qual + interconnect scorers (#3, #4)~~ — done 2026-10-13.
3. ~~Cost engine (#2)~~ — done 2026-10-13. Note: the site-equipment unit prices were commented "from NextNRG proposal generator" in the page; they came in with the legacy consolidation. The method, the benchmark book, the vendor price book and the ROM are ClearSky's; those unit defaults are the one table not to claim as a trade secret against that account.
4. ~~Viability thresholds (#5), catalog prices (#7)~~ — done 2026-10-13. Ground layout (#6) and the guided-build step tables stay in the page by decision (see MERGE.md 2026-10-13).

## What this does not do

- It does not stop a determined engineer reading the browser code. Nothing
  can; the Terms are what make that a breach, and the server moves are what
  make the reading worthless.
- The clickwrap binds the user who clicked. Whether the customer's COMPANY
  is bound to the Master Terms is a question of who signed what with that
  account — check `legal_acceptances` / `termsAcceptances` for the account
  in question before any letter goes out.
- A copyright registration with the U.S. Copyright Office is what unlocks
  statutory damages and fees; the notice alone does not. Not a code change.

## Beyond the editor (2026-10-13)

A scan of every other shipped page for the same classes of exposure, ranked
by signs of browser-side pricing, scoring and finance math.

| Page | Finding | Status |
|---|---|---|
| `ev-cost-workbook.html` | The Eversource rate card, the Level 2 baseline, the National Grid price book with confirmed per-plug prices, the DCFC baseline and the whole rate switch were literals in the page | **DONE 2026-10-13**: `api/_lib/ev-pricebook.js` behind `POST /api/ev-price` (`tevpricebook.js`) |
| `valuestack.html` | A ten-utility rate and programme table (`UTIL`), the federal credit table and the standalone dispatch and finance model, with no API call | Next. The editor's own Value Stack already runs on `api/_lib/value-stack.js`; this legacy page should post to it or be retired |
| `apartment-bess.html` | State incentive curation, aggregator revenue splits (`AGG_DATA`), compute tiers and the portfolio model, with no API call and no sign-in runtime loaded | Next. Move the tables and `recalc` server-side and give the page the standard sign-in |
| `clearsky-cost-estimator.html` | Loads `omega-cost-model.js`, which is presentation metadata only; prices come from `/api/price-site` | Fine |
| `sales-proposal.html` | A Google Maps browser key as a literal fallback; the Claude key is user-entered | Replace the literal with `OMEGA_CONFIG.mapsKey` only (low) |
| `proforma.html`, `bess-grid-sizing.html`, `site-optimizer.html` | Defaults and small finance helpers; engines are server-side | Fine |
