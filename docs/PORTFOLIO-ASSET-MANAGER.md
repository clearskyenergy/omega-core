# Portfolio & Energy Asset Manager — Phase 0

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

**Status:** Architecture decision note (Phase 0). Not a deployed feature.
**Spec:** OMEGA_PORTFOLIO_ASSET_MANAGER_BUILD_SPEC.md (v1.0, 2026-10-09)
**Branch:** `feature/portfolio-asset-manager`
**Repo snapshot at branch creation:** `ed9e4c6a865a5f324cc18e80fce86e4505b52373`

## 1. Product decision (confirmed)

Build **Portfolio** as the workspace system of record for energy sites,
equipment, contracts, power constraints, performance, documents and
development opportunities. Maps are linked design artifacts, not a
prerequisite for a site record.

Navigation (Projects drawer):

```text
Projects
  Portfolio       Your sites, energy assets and opportunities   → /portfolio.html
  In flight       Track active development
  All projects    Open your project workspaces
```

Page title: **Portfolio & Assets**.

## 2. Foundations found (reuse, do not rewrite)

| Foundation | Location | Reuse plan |
|---|---|---|
| Projects drawer / hub | `omega-workspace-hub.js`, `workspace.html` | Add Portfolio page entry; preserve In flight / All projects |
| Customer portfolio BESS path | `docs/PORTFOLIO-SCREENING.md`, `portals/customer/portfolio.js`, `api/customer-portfolio.js` | Site-list ingest, provenance, document match, per-site process; extend for workspace asset register |
| Portfolio lib | `api/_lib/portfolio/*` (ingest, match, quality, size, screen, aggregate, finance, xlsx, csv, zip, …) | Extend importer / provenance / analyses; no competing pipeline |
| Identities | `projects`, `sites`, `project_tasks`, `fin_projects`, `capacityAllocations`, `circuitCapacity` | Map logical model onto these; no second database |
| Tool catalog handoffs | Site Map, Grid Atlas, parcel/BESS screening, value-stack, compute pro-forma | Typed context + versioned analysis records + return links |
| Capacity infrastructure | `omega-capacity-ledger.js`, related APIs | Scoped allocation ledger for scenarios / commitments |
| Auth / tenancy | `AGENTS.md`, `firestore.rules`, `api/_lib/admin.js`, buyer-design access | Org-scoped; no widening of customer visibility |

**Constraints from AGENTS.md (non-negotiable):**
- No React rewrite, no second DB, no duplicate editor, no unconnected app.
- Static HTML + shared JS + serverless APIs + Firebase.
- Preserve existing collections and syntax conventions of each file.
- Proprietary sizing / scoring / financial logic stays server-side.

## 3. Gaps to close (from PORTFOLIO-SCREENING.md + spec)

- No workspace-level asset register UI (`portfolio.html` does not exist yet).
- Bill PDFs stored/matched but not extracted; monthly figures require manual entry for sizing.
- IRR / NPV / incentives / tax remain null with reason (by design until inputs exist).
- No office-side supplier view of customer portfolios.
- Batch analysis is client-driven; browser close pauses the run.
- EVCS-specific profile (legacy proxy screen, meter/term filters, definition flags) not yet wired for workspace Portfolio.
- Marketplace submission gates (saved nonempty map + reviewed bills) not yet enforced for this surface.

## 4. Identity mapping (Phase 0 decision)

| Spec entity | Existing / proposed |
|---|---|
| Portfolio (workspace grouping) | New under workspace scope; membership refs to sites; **do not** duplicate physical assets |
| Site | Prefer existing `sites` collection + stable `siteId`; `externalSiteIds` namespaced by source |
| Project / opportunity | Existing `projects` + linked scenario/analysis records |
| Capacity / allocation | Extend `capacityAllocations` / circuit capacity with scenario + commitment status |
| Customer-scoped intake | Keep `omega_orgs/{org}/customers/{cid}/portfolios/{pid}` path for supplier-facing BESS upload; workspace Portfolio is the owner-facing register |

Rule: adding a site to a second portfolio membership must not create another physical asset. Distinct meters sharing a transformer must not each receive the full transformer capacity.

## 5. Feature flags and rollback

- Tenant-scoped feature flag (proposed key: `portfolioAssetManager`) before widening.
- Additive only: existing customer-portfolio and projects routes remain functional (acceptance T34).
- Rollback: remove Portfolio page entry from hub; leave `/portfolio.html` inert or behind flag.

## 6. Phase plan (unchanged from spec)

| Phase | Deliverable | Exit gate |
|---|---|---|
| 0 | This note + identity map + inventory | Approved additive plan; no customer data moved |
| 1 | Usable asset register: list/detail, XLSX/CSV import, agreements, equipment, files, views, tasks | EVCS intake → 292 sites with correct nulls/units; useful without maps |
| 2 | EVCS opportunity workflow: linked scenarios, legacy screen parity, power-evidence classification | Reference totals reconcile; none presented as approved capacity |
| 3 | Connected development: editor/project links, tool handoffs, reviewed bills | Round-trip without losing identity or manual edits |
| 4 | Underwriting & finance: scenarios, value stack, map/bill gates, explicit submission | Missing map/bills block submission |
| 5 | Operating scale: performance imports, jobs, alerts | Real coverage visible; no faked telemetry |

**First customer-testable release:** Phases 0–2 plus existing-project link where already supported.

## 7. Immediate next commits on this branch

1. Restore / verify `omega-workspace-hub.js` Projects pages include Portfolio (navigation only).
2. Add `portfolio.html` shell (list view, empty states, import entry point) following existing workspace page patterns.
3. Extend `api/_lib/portfolio` only as needed for workspace-scoped site list; prefer existing customer-portfolio door where semantics fit.
4. Fixture-based tests for T01–T10 (EVCS counts and legacy parity) using private/local fixtures only.

## 8. Explicit non-goals (this release)

- 3D portfolio visualization
- Autonomous equipment dispatch
- AI deal negotiation
- Native accounting replacement
- New general-purpose sales CRM

---

Definition of done (from spec): A customer imports a fleet without drawing maps, opens any persistent energy asset, understands equipment/control/power/economics/evidence, shortlists opportunities, carries selected sites through existing OMEGA tools, and submits only a properly evidenced, authorized finance package — preserving identity, privacy, revisions, and the distinction between opportunity and verified capacity.
