# Omega Logic — maps, catalog and production workspaces

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

## Entry points

All links carry `?org=<supplier-org>`; access is checked server-side, not granted
by the URL. Office navigation links the catalog, URL Generator and plant manager.

- `/logic-catalog`: tenant products/services, archived rather than deleted.
- `/logic-urls`: customer walkthrough, customer login, licensed design studio,
  and the existing public battery-sizer key/embed. No station tokens or office
  credentials are included. Allow the actual website origin in Website installation.
- `/plant/work-orders`: the work-order board — a filterable grid (line, stage,
  priority, target date, progress, ready units, holds, next operation, assignee)
  with a location/stage tree, column filters, CSV/print, and a per-order detail
  card: step progress, operations checklist, activity feed derived from the
  units' scan/test/hold evidence, audited manager edits (line, priority, target
  date, assignee, notes), parts required vs registered, services and units.
  Progress is computed in `api/_lib/plant-board.js`, never in the browser.
- `/plant/manager`: line overview, paginated work orders, stations and units;
  links to immutable serial/test history and existing quality disposition.
- `/plant/manager#flow`: ClearSky-owner production routing/version editor.
- `/plant/station?stationId=<id>`: screen hint only; pairing still requires a
  station credential. A tablet with pending scans cannot be repurposed silently.

## Editor Lite

Site address loads the canonical editor's Google satellite map. Guided placement
is unavailable until the map reports success. Site and Grid Atlas are the only
view navigation; document/BOM/proposal actions are grouped under Exports. Grid
Atlas reuses the existing server engine after checking Editor Lite entitlement;
nearby infrastructure is not a utility capacity commitment.

BESS selections and unit counts are checked against this supplier's published
design catalog on the server. No platform-wide equipment picker is exposed.
When there is no dimensioned, enabled BESS product, the existing generic
`GENERIC-BESS` concept is offered, clearly marked make/model TBD. It is not a
published product, carries no selling price and cannot be ordered as that SKU.
Setting `storefront/config.genericDesign: false` disables that fallback.
Layouts are concept assemblies, not construction-ready clearance studies.

## Catalog storage and approval

Uses existing `omega_orgs/{org}/storefront/config.products`, preserving unrelated
storefront settings and legacy engineering fields. Public and office projections
are explicit allowlists. Every edit compares `catalogRevision` and records a
before/after audit event. OEM admins can maintain quote-only products/services;
ClearSky alone can publish or edit list-priced entries. Services are excluded
from battery sizing, scaled battery layouts and the BESS picker. Archived products
are excluded from new storefront selections; existing accepted snapshots remain.

Service order lines are distinct from hardware requirements. A manager records
service-completion evidence before final billing. Service-only orders complete
after that evidence and verified final payment; no fake serial or shipment is made.
Mixed orders still need every physical component passed and ready.

## Production versioning and evidence

Configuration is `fulfillment/config.production`, not a new collection. Owner
publishes an ordered route, line/location list, step instructions and parameter
instructions. New work orders snapshot this version; previously released work
orders keep their instructions. EOL → QA → Pack → Ready remain mandatory gates.

Parameters here are operator/test instructions, **not programmable measurement
limits**. The paired test rig remains responsible for its test program and
measured pass/fail results. A human arrival scan never substitutes for machine
evidence. Scan events retain station/flow version, line, location and the applicable
instructions; machine events retain their readings and station context.

Managers can edit line assignment, priority, due date, manager notes and station
screen settings with optimistic revision checks and audit records. They cannot
rewrite scan/test evidence, change a station's operation binding, or fabricate a
quality pass. Configure legacy station line assignments before sending new
line-bound work orders: mismatched or unassigned stations are refused.

## Validation and rollout

Offline transactional tests cover catalog boundaries, revision conflicts, flow
pinning, immutable quality gates, wrong-line scans, pagination and secret-free
station projections. Browser checks use explicitly labeled read-only local data;
Google Maps itself loaded a public test address and the canonical BESS guide.
No live invoices, customer accounts, hardware passes, or production scans were
created during these checks. Pair and rehearse one real scanner and EOL rig at
each deployment before operating a physical line. QuickBooks activation, bank
wire execution and paid Editor Lite checkout retain their existing launch gates.
