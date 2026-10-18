# Omega Prime v2

Live Prime stays at `/omega-prime` (`omega-prime.html` on
silmarillion.clearskyomega.com). v2 is a second route, `/omega-prime-v2`
(`omega-prime-v2.html`). It does not replace the live page, it does not
register the Prime service worker, and it does not change `config.js`.

The shared launch switch `omega-experience` is not on main or on PR #338
yet. `OmegaPrimeV2.experienceRoute()` calls `OmegaExperience.route('prime')`
when that function exists and accepts only `/omega-prime-v2` or
`/omega-prime`. Until then the answer is null, launchers keep sending
people to live Prime, and this page says so in the banner. The page does
not redirect itself.

## Parity

| | Live Prime | Prime v2 |
|---|---|---|
| Route | `/omega-prime` | `/omega-prime-v2` |
| Steps | Site, Grid Atlas, Circuit, Load, Site Map, Quote, Omega Logic | The same seven, in the same order |
| Substation and transmission layers | Queried in the page from the Grid Atlas mirrors, dark and satellite | The same URLs, from `omega-grid-layers.js` (the list in `grid-atlas.html` and `grid-atlas-national.js`). The page does not carry a second copy |
| Nearest substation card | Opens when the marker is clicked | Opens on its own, with source and the date the view was queried. Layer list verified 2026-09-17 |
| Grid Atlas score | Not on this page | Beside the card, from `omega-grid-atlas-client.js` → `POST /api/grid-atlas`, and the map still draws if that call fails |
| ComEd hosting at the parcel | `omega-comed-layers.js` `probePoint`, net of queued DER, compared with the unit | The same probe. Illinois is not sent to `/api/hosting-capacity` |
| Verdict | Fits / Fits only smaller / Needs a study, from `POST /api/grid-verdict` | The same engine, through the same `omega-grid-verdict.js` |
| Source line | The verdict’s own sentence | Plus one line: ComEd hosting-capacity service, resolved at the point (layer N); BESS_HC and Feeder_Q; queue date; OMEGA grid verdict version and the time it was asked |
| Other states | ComEd only; elsewhere the page says no utility map | CA, MA and NY use the shared registry in `api/_lib/hosting-capacity.js` (`POST /api/hosting-capacity`). The figure is named generation or PV, and it says it was not resolved at the parcel. Any other state says no open layer |
| Load | Rate book for the ZIP, twelve peaks typed, skippable | The same. The card cites the rate book and the day it was read. The book has no tariff effective date, and the card says the bill decides |
| Unit list | Tenant products, then the FENECON XXL | The same `omega-prime-project.js` `units()` |
| Site Map | Creates `projects/{id}`, sketch on `prime.layout`, Run on `prime.run`, no drawing keys. Open is `/editor.html?id=&from=prime` | The same hand-off, so `omega-prime-handoff.js` still opens the Guided Build. The record is written with `set` on an id Prime chose |
| Pad | Clearance and transformer offsets computed in the browser | `POST /api/prime-fit`. The page sends feet and draws the answer. A missing footprint is named as a 20 × 8 ft stand-in |
| Quote | BOM and a link into Site Map. Filing the RFQ stays on the BOM | The same. The price line names `api/price-site` and the day |
| Omega Logic | Quote Desk, Omega Logic, Custody | The same three links |
| Customer | Not on the project | Required to save. Screening does not ask. The assignment is `omega-editor-v2-assign.js` (`omega.assignment/1`, `omega.project-ref/1`). The party link is `omega-crm-foundation.js`. A local id `c_<slug>` is marked `prime-v2-local` until a CRM id is passed. The browser does not write `customers` |
| Progress | The step buttons | Step n of 7, and a readiness score out of 100 from sourced figures. A study verdict counts. Skipping the bill lowers the score and still allows design |
| Phone | Installable app, service worker scope `/omega-prime` | Responsive, including the layer and basemap controls at 390px. No worker. `/omega-prime-v2` is outside that scope, so an installed Prime does not control this route |
| EV, solar, compute | Marked next | Still next |

## Click-through for Thomas

On the preview (or `silmarillion.clearskyomega.com/omega-prime-v2` once this
branch is deployed). Live Prime at `/omega-prime` should look as it does
today. Do not use an installed Prime icon for v2; open the address in the
browser. An installed icon still opens live Prime.

1. Site. Type `3400 S Federal St, Chicago, IL 60616` and a customer name. The unit list should lead with that workspace’s own battery, then the XXL. Readiness is not 100. EV, Solar and Compute stay marked next.
2. Look at the grid. Dark map, substations and transmission on. The nearest substation card is already open and names its source and the day. Switch to Satellite. The score line is the Grid Atlas service, separate from the card.
3. Check the circuit. ComEd, resolved at the parcel. Net hosting against the unit. The verdict is Fits, Fits only smaller, or Needs a study, and the line under it names the layer, BESS_HC, Feeder_Q, the queue date, and the OMEGA grid verdict.
4. Load. The utility for 60616. Paste twelve peaks or leave them blank. Blank is allowed. The rate is marked planning grade.
5. Design it. The project saves only after the customer has a name. Drag a pad. A pad that is too small is refused by the server and the rectangle comes off the map. Place the unit, the service, conduit, Run. The side panel’s figure names `api/price-site` and the day. Readiness reaches 100 only when the address, customer, substation, verdict, peaks, placement and price are all on the page.
6. Quote. Open the project in Site Map. The address should be `/editor.html?id=…&from=prime`, and Site Map should open the BESS Guided Build. Filing the request stays on that BOM.
7. Omega Logic. Quote Desk, Omega Logic, Custody.
8. On a phone-width window, the substation, transmission and Satellite controls are still on the Grid Atlas step.

A short automated copy of this path is `npm run check:prime-v2`
(`scripts/render-omega-prime-v2.js`). The rules that do not need a browser
are `node scripts/tests/tprimev2.js`, which `npm test` runs.

## Decisions

1. The route is `/omega-prime-v2`, not `/omega-prime/v2`. A service worker scoped to `/omega-prime` would control the second path. It does not control a sibling.
2. `OmegaExperience.route('prime')` is the only switch. It is called, not reimplemented. While it is absent, nothing in the product nav points at v2. `omega-tools.js` still registers live Prime.
3. Layer URLs live only in `omega-grid-layers.js`, matched to Grid Atlas. Editor v2 should load that file rather than paste the hosts. The scored answer stays `POST /api/grid-atlas`. The map still draws the lines, because that API returns points, not the paths.
4. ComEd stays the parcel probe. CA, MA and NY go through the hosting-capacity registry. Other states are covered: false. A non-ComEd number is generation or PV and is not called a parcel result.
5. Pad size and the transformer and disconnect offsets are `POST /api/prime-fit`. A catalog row with no footprint is checked against 20 × 8 ft and the answer says that is a stand-in.
6. A customer name is required to save a project, not to screen it. The id is the CRM’s when one is passed, otherwise `c_<slug>` with source `prime-v2-local`. This page does not create `omega_orgs/{org}/customers/{id}`. That mint stays with the CRM relaunch (PR #335). The assignment and project-ref shapes are PR #339’s `omega-editor-v2-assign.js`, copied here so v2 can call them. If #335 or #339 merges first, drop the duplicate file.
7. Open in Site Map stays `/editor.html?id=&from=prime`. Editor v2 is the visual language of this page, not the place a Prime project is saved.
8. Readiness is evidence: address 15, customer 10, substation 15, circuit 20, bill peaks 10, unit placed 15, price 15. A study verdict counts. It is separate from “Step n of 7”.
9. The quote still does not file an RFQ.
10. EV, solar and compute stay next.
11. v2 is responsive and does not register a worker. The standalone auth-domain test in `config.js` is untouched, so the phone app another bot is building is not affected.
12. The grid record’s source is `omega-prime-v2`. `prime.v` is 2 and `prime.route` is `/omega-prime-v2`.
13. v2 is not in the tool catalog until the experience switch exists.
14. The rate book has no tariff effective date. The card says planning grade, the day it was read, and that the bill decides.
15. The layer-list verified date is 2026-09-17, the day those mirrors were checked. A feature rarely carries its own vintage. The page also stamps when this view was queried.

## Not built

- Turning the experience switch on, and pointing the workspace home at v2. That waits on `OmegaExperience` from the other release.
- Minting the customer account in `omega_orgs/{org}/customers`. The project holds the link; the CRM relaunch writes the account.
- Editor v2 as the Site Map a Prime project opens.
- Reading the bill file. Peaks are still typed.
- EV, solar and compute on this path.
- A v2 manifest or install icon. The installed Prime app remains live Prime.
