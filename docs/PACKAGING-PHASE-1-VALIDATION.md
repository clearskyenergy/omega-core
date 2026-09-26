# Phase 1 — catalog, proposed price book and sandbox item sync

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

[Draft PR #136](https://github.com/clearskyenergy/omega-core/pull/136), stacked on Track A.

The single catalog is `api/_lib/modules.js`. It records 19 modules, their
dependencies, starter packs, capability projection and command ownership.
The independent inventory checks all 45 registry keys, 192 static commands
(including File and flyouts), and 58 injected control IDs. Unknown command
ownership is empty, never an implicit Lite grant. Not-sold items are separate
from the customer catalog. AI Render belongs only to Plan Sets & CAD, per
Tommy's September 26 decision. Beta labels and current geographic limits
travel with the catalog projection.

`api/_lib/pricebook.js` owns proposed defaults for `2026-10-proposed`.
The seed is disabled and unfrozen. `seed-pricebook.js` is a local dry run by
default; applying uses create-only semantics and refuses an existing different
version. `freeze()` is provided for the later activation transaction. Used or
frozen books cannot be changed by the library or item sync; browser writes
are denied, including staff browsers. The narrow rules change is prepared,
not deployed. Structural rules validation is not an emulator authorization test.

`subscription-pricing.js` computes monthly à la carte, Field and Pro quotes,
cap eligibility, Logic pricing/bundle, logins, bounded transformation credit,
the $500 floor and service fees in integer cents. It selects the cheaper
eligible base; it never puts Logic inside a tier cap. Quote lines reconcile
with the monthly total. Annual prepay is explicitly returned **before credit**;
calendar-based credit allocation belongs to the billing lifecycle. Enterprise
and Platform require a staff contract; automatic monthly quotes refuse those
plans. The Enterprise floor, setup and included development hours are stored
in the proposed book for that later contract workflow.

`GET/POST /api/package-catalog` authenticates, validates the organization,
checks billing and active membership, and returns catalog/quote data. Cross-org
reads require `caller.staff`; unverified and disabled tenant members are
refused. Tenants cannot supply a credit, fee override, price or price-book
version. A disabled book is visible to staff only. This endpoint never writes
billing or grants access.

## QuickBooks behavior

`scripts/qbo-sync-items.js` has a local, credential-free dry run. It lists
32 items: modules, Field/Pro, the Logic bundle, additional logins, overages,
packs, transformation credit and service fee. Names come from the catalog or
price book; there is no second pricing list.

Applying requires `QBO_ENV=sandbox`, an explicit sandbox realm, an active
Income account and explicit taxability. Both deployment and stored ClearSky
connection must match before any token refresh or API request. The seed must
match too. Every request is realm-pinned. Existing incompatible/inactive
items are refused, never silently edited. Repeat runs find existing items;
creation uses a stable request ID. Item bindings are committed transactionally
only if the book is unchanged and remains unused/unfrozen. No deletion,
customer creation, invoice, payment, OAuth change or live company operation
is in this phase. Invoice prices will be explicit versioned line amounts,
not mutable QuickBooks item defaults.

Examples (IDs must be selected from the actual sandbox; never substitute the
production company):

```sh
node scripts/seed-pricebook.js
node scripts/qbo-sync-items.js
# After reviewing the seed and sandbox configuration:
node scripts/seed-pricebook.js --apply
node scripts/qbo-sync-items.js --apply --realm=SANDBOX_ID --income-account=ACCOUNT_ID --non-taxable
```

Taxability is an accounting choice; choose `--taxable` when appropriate. The
script refuses either placeholder above. It does not compute sales tax.
Intuit references: [official Item creation example](https://www.postman.com/intuit-developer/intuit-developer-quickbooks-online-accounting-api/request/4884662-cfbbed61-30a1-4a79-a354-03fa052135d0),
[request ID documentation](https://developer.intuit.com/app/developer/qbo/docs/learn/learn-basic-field-definitions#request-id).

## Validation

- `npm run test:packaging`: 1,121 assertions: catalog 323, pricing/version
  safety 559, sandbox item sync 223, catalog authorization 16.
- Full `npm test` and `npm run check:pages`: passed, including the four new quote captures.
- `npm run rules:check -- firestore.rules`: no structural problems;
  158 helper definitions and calls resolved.
- Both CLI defaults executed as local dry runs; no remote records changed.
- [Four quote captures](screenshots/packaging-phase-1/): Lite and Field,
  light/dark, from server-computed results. These are labeled verification
  fixtures, not the customer menu or editor entitlement acceptance.
- The combined Phase 0/Track A page fixtures remain in `check:pages` (40
  existing page scenarios, 12 Phase 0 and 76 Track A browser assertions).

No sandbox connection or item-write acceptance is claimed. It still needs
an available matching sandbox connection, account/tax selection and a reviewed
apply run. No production release or tenant migration occurred.

## Configurable proposed decisions

All commercial defaults remain proposed: module/plan prices, included logins
and extras, Logic bundle, usage/pack sizes and prices, 40%/90-day credit,
11-month annual prepay, fees, Enterprise floor/setup/development hours,
14-day trial ceiling, 10-business-day grace, quarterly removals, pack cycle
expiry, auto top-up off, saved-card off and the permitting beta policy.
Custom or waived service fees require a reason; waiver scope defaults to the
first year, not an automatic waiver. None of these settings changes a live
account in this phase.

Next: Phase 2 consumes this projection to close editor and backend access
paths. Legacy gates remain unchanged until then; no packaged tenant should
be enabled before that work and lifecycle validation are complete.
