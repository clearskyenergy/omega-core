# MERGE.md — how omega-core was assembled from 16 legacy repos

Measured on 2026-09-06 against the sixteen repository snapshots. Every
"canonical" pick below is the SUPERSET build unless stated; nothing was
hand-merged inside a multi-megabyte file. Items under **TODO** are the
ports Claude Code does next, in order.

## Canonical picks

| file | taken from | why |
|---|---|---|
| `editor.html` | **ogisolar** (162,782 lines, OMEGA v4.24) | superset: osa = ogisolar −28 OGI-only functions; salesdemo = ogisolar −8. Joules/NextNRG/omega/sunesol/walters family (145,666 lines) is ogisolar −17,785 lines. |
| `index.html` | **joules.ai** (312 KB) | superset of cir (+6), concord/ogisolar (+217); zero tenant strings. Loads omega-brand + omega-tenant. |
| `projects.html` | **nextnrg** (52 KB) | +434/−84 vs the 7-way shared build. Hardcoded `nextnrg.com` fallback REPLACED with config/email-domain resolution. |
| `marketplace.html` | **nextnrg** (62 KB) | +341/−101 vs shared. Hardcoded WORKSPACES literal demoted to `LEGACY_WORKSPACES` fallback. |
| `omega-tools.js` | **clearsky-portal** (39.9 KB) | largest registry; nextnrg/sunesol carry a 19.6 KB subset. Added `catalog()` alias. |
| `omega-brand.js`, `omega-terms.js`, `omega-sso.js` | identical across 7–10 repos | byte-identical; verified by hash. |
| `omega-assets.js`, `omega-delivery.js` | joules/cir/walters | identical where present; treated as core optional modules. |
| `omega-legal.js`, `omega-legal-docs.js` | salesdemo | signing gate; core module. |
| every other `*.html` tool | largest copy across repos | see `git log` for the per-file source. |
| `api/*.js` (legacy 11) | largest copy across repos | `score.js` from osa, `validation.js` from nextnrg, rest from clearsky-portal. |

## What moved where

| destination | contents | from |
|---|---|---|
| `/admin/` | tools.csebuilders.com hub + `admin-console.js` (the MASTER INDEX) | clearsky-portal |
| `/console/` | alpha.clearskyomega.com ops console + intake + ops-data | omega-main |
| `/portals/finance/` | financing portal (fin_* collections) — separate product surface | finance-main |
| `/tenants/osa/` | JV partner portal, whole repo, own shell | osa-main |
| `/tenants/solela/` | ComEd pipeline shell (index.html) + IL data | solela-main |
| `/tenants/joules/` | omega-fleet.js, fleet.html, commission.html | joules.ai |
| `/tenants/tremco/` | tremco-netzero.js, tremco-patches.js, preview | tremco |
| `/tenants/spatco/` | spatco-ev-estimate.html | SPATCO |
| `/tenants/cir/` | intake.html, queue.html (CIR's variants) | cir |
| `/tenants/<others>/` | logos + legacy `config.js` (kept for the fallback path) | each repo |
| `/docs/` | all README/INTEGRATION/PRICING/etc. markdown | clearsky-portal, salesdemo |
| `/workers/` | `comed-proxy-worker-v10.js` only (v2–v9 dropped) | clearsky-portal |
| `/scripts/` | backfill-orgid, check-rules, build_ilshines + NEW audit/seed | mixed |

Dropped: nine superseded Cloudflare worker versions, `_test_overlay.js`,
`overlay-demo.html`, duplicate PDFs/PPTX/XLSX binaries (kept in `/docs/`
where referenced), `sunesol-portal.zip`, `demo-clearskyomega.zip`.

## NEW in omega-core

**Self-serve signup (decided 2026-09-06):** `start.html` on the hub host
`app.clearskyomega.com` → `api/tenant-signup.js` creates the tenant
PENDING (work email only; public providers refused via
`api/_lib/public-domains.js`); `api/tenant-approve.js` (staff) flips it
live. Second person from the same domain auto-joins as member.
`omega-tenant.js` handles hub routing and the "being set up" screen.
`config.js` at the root is the ONE platform config (no tenant block).

- `omega-tenant.js` — hostname → `tenant_public/{host}` → `CLEARSKY_CONFIG.tenant`; post-auth entitlements from `omega_orgs/{org}` + `billing/current` + `members/{uid}`; hostname lock; suspension gate; wraps `OmegaBrand.resolve`.
- `api/_lib/admin.js`, `api/set-role.js`, `api/opportunity.js`, `api/rfq.js`, `api/stripe-create.js`, `api/stripe-portal.js`, `api/stripe-webhook.js`, `api/tenant-branding.js`.
- `scripts/audit-counts.js`, `scripts/seed-omega-orgs.js`, `tenants/*/tenant.json`.
- `firestore.rules` / `storage.rules` with the control-plane blocks applied and `tenant_public` added.
- `vercel.json` hostname rewrites (alpha → console, tools → admin, osa/solela → tenant shells).

## TODO — Claude Code sessions, in order

1. **Port the AHJ research block into editor.html.** The Joules family has
   `renderAhj, research, pass1, pass2, mergeResearched, ask, byTemplateKey,
   sysLine, toKeys` (≈ lines 23,800–24,300 of joules.ai/editor.html);
   ogisolar's build does not. Port it verbatim; do not rewrite.
2. **Extract OGI-only functions** from `editor.html` into
   `tenants/ogisolar/ogi-ext.js`: `root_OGI, ogiPanel, tierGate, snapTier,
   typologyAuto, siteParcel, siteSolarMwAc, siteStructures,
   siteSubstationKind, selectGen, hourFive, infraGap, retrofitCost,
   scheduleRisk, exitValue, conversion, unverified` and the 8 salesdemo
   deltas (`button, coverageOf, create, drop, links, picks, rating, update`).
   Add an extension hook in editor.html that loads `/tenants/<slug>/*-ext.js`
   when `OmegaTenant.tenant.shell` names it.
3. **Joules placeholder buttons** (`omegaJoulesSoon`, two ribbon buttons)
   → `tenants/joules/joules-ext.js` via the same hook.
4. **Diff the older editor builds** — SPATCO (73 K lines), iqgen (82 K),
   tremco (110 K), cir (140 K) — against canonical and list any function
   present there and absent in canonical. Expect none; confirm.
5. **Wire `verticals/{v}.defaultWidgets`** into the index dashboard palette
   (the `dashboard_layouts` code at index.html ≈ line 5150–5215) and add
   `omega_orgs/{org}/layouts/default` as the org-level starter.
6. **Opportunity/RFQ client hooks**: in editor.html, on SKU placement call
   `POST /api/opportunity`; in the BOM panel add "Request for Quote" →
   `POST /api/rfq`. Add the Opportunities/RFQ inbox widget (reads
   `collectionGroup('recipients')` and `opportunities` where vendorOrgId).
7. **account-settings.html** → branding form (logo upload to
   `tenants/{org}/`, `POST /api/tenant-branding`), members table with role
   dropdown (`POST /api/set-role`), "Manage billing" (`POST /api/stripe-portal`).
8. **admin/admin-console.js** → point the client inventory at `omega_orgs`;
   add a PENDING SIGNUPS queue (`omega_orgs where status == 'pending'`)
   with Approve/Reject buttons calling `/api/tenant-approve`; tier/addon
   editors, subscription-due, Stripe create.
9. **Move pricing/scoring logic server-side** per CLAUDE.md IP section:
   ev-cost-workbook unit-rate bands, valuestack dispatch, proforma math.
10. **Consolidate the orgAlias map** into one exported constant imported by
    the four clients (rules stay hand-mirrored).

## Decisions made (2026-09-06)

- New workspaces go live only after ClearSky approval (`status: pending`).
- Work email required; personal providers are refused at signup.
- Same-domain colleagues auto-join as `member`.
- Trial length: 30 days (`TRIAL_DAYS` env, default 30).

## Decisions pending (Tommy)

- [ ] Remove `sunesol.com` / `ogisolar.com` from `isConsoleViewer()`?
- [ ] Flip legacy `fin_projects/{projectId}/{file}` Storage write to `if false`?
- [ ] Same for `mkt_projects/` Storage write?
- [ ] Delete the deprecated `intake_requests` rules block (confirm collection empty first)?
- [ ] Which terms gate survives: `termsAcceptances` or `legal_acceptances`?
- [ ] OSA: sign-in domain / orgId for `tenants/osa/tenant.json`.
- [ ] Verify every hostname in `tenants/*/tenant.json` (they were inferred from the recipe `<n>.csebuilders.com` / `<n>.clearskyomega.com`).

## Verification before first deploy

```
npm install
FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" npm run audit > audit-before.json
npm run seed:dry            # read tenants/*/tenant.json, print the plan
# review, then:
npm run seed:apply
firebase deploy --only firestore:rules,storage      # from this repo
# Firebase Console → Authentication → Settings → Authorized domains: add
#   app.clearskyomega.com and *.clearskyomega.com (each tenant host)
# Vercel: add app.clearskyomega.com + wildcard *.clearskyomega.com
# grep the LIVE rules for isTenantAdmin, opportunities, tenant_public
vercel --prod               # to next.clearskyomega.com first, NOT a tenant host
# sign in as each tenant via adminDomains preview; compare project counts
FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" npm run audit > audit-after.json
node scripts/audit-counts.js --diff audit-before.json audit-after.json
```
