# omega-core

ClearSky-OMEGA, one codebase, every tenant. Static ES5/HTML tools on Vercel,
Firebase Auth + Firestore (`clearsky-portal`), Vercel serverless `api/`.

Read **CLAUDE.md** first (constraints, data model, IP rules), then
**MERGE.md** (how this repo was assembled and what is still to port).

```
/                    core pages + shared omega-*.js runtime + tool pages
/api/                serverless: control plane (set-role, opportunity, rfq,
                     stripe-*, tenant-branding) + legacy (grid-atlas, render…)
/admin/              master index — tools.csebuilders.com
/console/            ops console — alpha.clearskyomega.com
/portals/finance/    financing marketplace
/tenants/<slug>/     per-tenant extensions, logos, tenant.json seed
/shells/<vertical>/  vertical dashboard shells (thin wrappers only)
/scripts/            audit + seed + backfill (never deployed)
/docs/               design notes carried over from the legacy repos
firestore.rules      SOURCE OF TRUTH — deploy from here
storage.rules        SOURCE OF TRUTH — deploy from here
```

## Local

```
npm install
vercel dev          # serves static + api/ on localhost (preview host → hostname lock off)
```

Env vars (Vercel project settings, never committed): `FIREBASE_SERVICE_ACCOUNT`,
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PORTAL_RETURN_URL`,
`MAIL_USER` (Workspace mailbox that sends, e.g. support@csebuilders.com),
`MAIL_PASS` (its Google App Password — 2-Step Verification must be on),
`MAIL_NOTIFY` (who gets new-signup alerts; defaults to dev@clearsky-usa.com), `MAIL_FROM` (optional display name).
Without MAIL_USER/MAIL_PASS the API still works; emails are skipped and logged.

## Tenant onboarding (new way)

1. `tenants/<slug>/tenant.json` + logo → PR.
2. `npm run seed:dry` → `npm run seed:apply` (creates `omega_orgs`, `billing/current`, `tenant_public/<host>`).
3. Attach the hostname to the Vercel project. Done — no repo, no config.js.

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
