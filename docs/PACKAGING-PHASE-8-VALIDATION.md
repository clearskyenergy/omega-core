# Packaging Phase 8 — Omega Logic follows the package

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Branch `codex/packaging-phase-8`, stacked on Phase 7
([#142](https://github.com/clearskyenergy/omega-core/pull/142)); the draft PR
and Vercel preview links are added on push. No live organization, trial,
billing date, QuickBooks record, environment variable or deployed rule was
changed. Runtime flags remain off by default; the proposed book remains
disabled in the seed.

## Why this phase exists

Phases 1–7 priced and invoiced the Omega Logic modules — Office
(`logic-office`), Plant (`logic-plant`), Materials & Purchasing
(`logic-materials`), Logistics & Warranty (`logic-logistics`) and Customer
App (`logic-customer`) — but the Logic endpoints still read only the legacy
flags (`billing.addons` carrying `omega-logic`, or `omegaLogic: true`). A
packaged tenant that bought Office alone could open every plant, materials
and logistics screen; one that bought nothing of Omega Logic and happened to
carry an old flag could too. That was the one release-blocking finding
carried since Phase 5.

## What changed

**One rule for "is the grant live".** `api/_lib/package-access.js` exports
`live(billing, modules, now)`: paid, or a trial of at most 14 days inside its
dates, or the Lite-only renewal fallback, and always before `accessUntil`.
The editor projection (`project()`) now calls it instead of carrying the
same arithmetic inline; nothing about the editor's answer changed.

**Omega Logic reads the package.** `api/_lib/logic-access.js`:

- `subscribed(ctx)` — a packaged tenant (`billing.packaged === true`) is
  judged by its package alone: `modules[]` normalizes, the grant is live and
  Office is in it. The legacy flags are ignored for a packaged record. A
  legacy tenant is judged exactly as before.
- `parts(ctx)` — the parts held: `plant`, `materials`, `logistics`,
  `customer`, each present when its module is bought; every one on a legacy
  subscription; none when not subscribed.
- `authorize(caller, org, write, part)` — after the membership and
  subscription checks, `requirePart` refuses a part not held with a
  sentence (`Plant is not in your Omega Logic package`, HTTP 403,
  `reason: 'part'`). The ClearSky owner bypasses it as before; a part the
  code does not name is a 500, never a refusal.

**Every endpoint names the part it serves.** `logic-plant` and the manual
test result (`mes-test-result`) are Plant's; `logic-materials` is Materials &
Purchasing's; `logic-logistics` and `logic-custody` are Logistics &
Warranty's. The office, team, catalog, accounting, CRM, Customer hub, PO
intake and front-door endpoints are Office's and name no part. The customer
portal and app are the Customer App part: `buyer-accounts.context()` closes
them to a package without `logic-customer`, said to the customer as "This
customer portal is not active" (the package is the supplier's to change).

**The pages draw what was bought.** The office endpoint's `access` block
carries `parts`; the front door (`logic-workspaces`) lists `parts` per
workspace. `omega-logic-theme.js`:

- `groups()` tags each link with the part whose endpoint serves it (Build
  and the plant's Inventory and Quality & holds → plant; the materials plan,
  purchase orders and vendors → materials; shipping, custody and the fleet
  register → logistics) and drops a group left empty. `chrome()` takes
  `parts`, remembers them per workspace for the pages that do not say
  (exactly as Team is remembered), and ClearSky sees every group.
- `hub()` takes `parts` and leaves out a ring cell whose part is not held
  (Plant, Deliver, Stock). The hex grid's background cells stay, so the
  ring simply has fewer lit cells.
- `holds(parts, part)` is the one predicate: not said means everything.

The desktop dashboard passes the parts to the chrome and the hub and draws
the floor, performance and deliveries panels and the purchase-list tile only
for the parts held — and does not call their endpoints. The Omega Logic app
hides the Sites tab without Logistics & Warranty, filters its Menu panels and
rows (the Stock screen and Inventory are the plant's; the plan and the POs
are Materials & Purchasing's; the customer app and portal rows and the
customer guide are Customer App's), its shortcuts, the Today blocks and the
apps strip, feeds the hub the parts, and fetches the plant board, the
materials plan and custody only where held. Settings passes the parts on.

**Absent ≠ empty.** A response without `parts` (a legacy tenant, an older
server) shows everything, as before. A present list, even `[]`, is the
package. Showing a link is never access: every endpoint refuses on its own.

**Because screens changed**, `app-sandbox/` was rebuilt
(`npm run build:sandbox`) and the PDF guides retaken (`npm run guides`), as
the repo's guide-freshness check requires.

## Verification

- Full `npm test` and `npm run check:pages` passed locally after every change.
- `scripts/test-logic-package.js` (new, in `npm run test:logic`): 16 checks on
  the Firestore double — a packaged workspace holds exactly the parts it
  bought and each missing part is refused by name; every part bought; the
  ClearSky owner sees any workspace while `parts()` still tells the truth; a
  package without Office is closed whatever legacy flags sit beside it, and
  an invalid or string-typed package is closed too; the grant must be live
  (trial inside its dates and at most 14 days, paid before `accessUntil`,
  no `accessUntil` closed, Lite-only fallback never carries Office, a
  suspended organization closed); a legacy subscription unchanged; the
  endpoints name their parts and the Office doors name none; the customer
  portal closed to a package without Customer App and open to a legacy one;
  the office endpoint's `access.parts` for an admin, a member, a legacy
  tenant and ClearSky; the front door's `parts` per workspace and "not
  active" for a package without Office; the theme's `groups()`, `chrome()`
  (remembered per workspace, an empty list remembered as empty, unknown
  parts dropped, ClearSky unaffected) and `hub()`; the app's Menu by parts;
  the app's and dashboard's loaders and blocks; ES5.
- Existing suites updated for the new field and still green: Logic pricing
  (10), office pages (12, `has()` lifted with the menu), office chrome (15),
  front door (8), customer accounts (37), package access (141), Logic (59),
  portal (124).
- `scripts/render-logic-pages.js` gained `package-parts` (desktop) and
  `package-parts-app` (phone): the sample workspace with Office and Plant
  only shows Build, the plant's Inventory and Quality, no shipping or
  materials plan, a hub without Deliver or Stock, no deliveries panel or
  purchase-list tile; the app shows four tabs, the hub and Menu without
  Deliver or the materials rows, shortcuts without Sites or Register, the
  apps strip without Sites or Customer — and neither page called
  `/api/logic-custody`, `/api/logic-materials` or `/api/logic-logistics`.
  The fixture's own answer stays a legacy subscription, so every other check
  renders as before.

## Screenshots

From the render check's `package-parts` scenarios (the sample workspace with
Office and Plant only), captured with `node scripts/render-logic-pages.js
--shots`:

| Screen | Capture |
|---|---|
| Office dashboard · menu without Deliver or the materials plan, hub without Deliver or Stock, no deliveries panel | [image](screenshots/packaging-phase-8/package-parts.png) |
| Omega Logic app · four tabs, the hub and Menu without Deliver, shortcuts without Sites or Register | [image](screenshots/packaging-phase-8/package-parts-app.png) |

The guide screenshots (`scripts/guides/shots/`) were retaken from the
rebuilt sandboxes; every picture came out byte-identical (the sample tenant
holds every part), so only the manifest's source hashes changed and no PDF
was rebuilt.

## Sandbox enablement and operator checks

Nothing new to enable: the Logic gate reads the package Phases 4–7 already
write. To exercise it on a sandbox tenant (`packagingSandbox: true`):
activate Lite + Office + Plant from the Package tab; open `/omega-logic` —
the menu has Build and no Deliver or Stock & supply beyond Inventory; open
`/logic-materials.html?org=` directly — the page prints "Materials &
Purchasing is not in your Omega Logic package"; open the Omega Logic app —
four tabs, no Sites; sign in as one of the tenant's customers — "This
customer portal is not active" until Customer App is added; add Logistics &
Warranty through Your plan and pay the change invoice — after reconciliation
the Deliver group, the Sites tab and the custody endpoints open with no
staff action. A legacy tenant (addon `omega-logic`) must show nothing new.
Real sandbox acceptance has **not** been performed.

## Remaining acceptance and release debt

- The bench (`api/mes-scan.js`, station tokens) and hold/release
  (`api/plant-control.js`, tenant admins) do not run through `logic-access`
  and are not part-gated; a station is minted through `logic-plant`, which
  is, so a tenant without Plant cannot create one, but an existing station
  token keeps scanning. `plant-release.js` (ClearSky staff) reads the Logic
  context only to refuse releasing an Omega Logic tenant's order.
- Editor Lite for a tenant's customers (`editor-lite`, `lite-atlas`,
  `customer-design`, the Stripe subscription) is gated on the tenant's
  `editorLite.enabled` and the customer portal being open; it is not a
  priced Logic part.
- A member's remembered parts live in `sessionStorage` per workspace; a
  package change shows on the next office-endpoint load, as Team does.
- The release debt carried from earlier phases stands as listed in
  `PACKAGING-PHASE-5-VALIDATION.md`, `PACKAGING-PHASE-6-VALIDATION.md` and
  `PACKAGING-PHASE-7-VALIDATION.md`; the ordered release steps are in
  `PACKAGING-RELEASE-CHECKLIST.md`.
- No connected sandbox payment, price-book sign-off, production merge, rule
  deployment or live migration is claimed.
