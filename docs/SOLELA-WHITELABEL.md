# Solela Capital — the platform on a Solela-attached domain

2026-11-09, Tommy: a white-labeled version of the workspace, reached from
solelacapital.com, signed in there, "the workspace should not have any
omega or clearsky references". This note is the runbook for the PLATFORM
side. (The standalone Solela front door — the branded sign-in + pod-hub
home that deep-links into the platform — is its own repository,
`clearskyenergy/solela-workspace`, and is not part of this deploy.)

## What this branch changed

- `omega-workspace-shell.js`: under an ACTIVE white label the chrome head
  wears the tenant's platform from the first paint — the attribution line
  is `OmegaWhiteLabel.attribution()` ('' when the contract removes our
  name; the old first paint flashed a literal "Powered by ClearSky OMEGA"),
  the mark is the tenant's `whiteLabel.markUrl`, else the short name's
  initial — never the Ω — and the tab title swaps "Omega Workspace" for the
  tenant's platform name. No white label: unchanged (Ω · Omega Workspace ·
  by ClearSky). Held by `scripts/tests/twlchrome.js`, cut from the source.
- `tenants/solelacapital/portfolio-diligence.json` `whiteLabel` now carries
  `attribution: 'none'` — the written decision the block's note used to say
  was still owed. `scripts/enable-portfolio-diligence.js` stages it (added
  only where the record has none; dry run above, `--apply --confirm-org` to
  write) and mirrors `tenant_public` through the one allowlist.
- `tenants/solelacapital/logos/` — the official logo pack (angular-S
  monogram, horizontal and stacked lockups, white and black), served, for
  the console to point `whiteLabel.markUrl` and `logoUrl` at.

## The steps to live (in order)

1. **Deploy** this branch (Vercel, as usual).
2. **Stage the white label**:
   `node scripts/enable-portfolio-diligence.js --org solelacapital.com --apply --confirm-org solelacapital.com`
   (idempotent; adds `attribution: 'none'` to the record and re-mirrors
   `tenant_public` for every hostname on the record).
3. **The mark** (console, staff): on the master console's account page set
   `whiteLabel.markUrl = /tenants/solelacapital/logos/solela-monogram-white.svg`
   and, if unset, `logoUrl` to the same path — the enable script
   deliberately stages only platformName/shortName/attribution.
   Or from the repo: `node scripts/set-white-label.js --org solelacapital.com`
   (a dry run; `--apply --confirm-org` writes) stages the mark, the accent,
   the ink and the support address from `tenants/solelacapital/white-label.json`
   and re-mirrors `tenant_public`; it never touches `attribution` or
   `logoUrl` (`docs/WHITE-LABEL.md`, the name-only runbook).
4. **Attach the domain** (the hostname decided with Solela, e.g.
   `portal.solelacapital.com`):
   - Vercel: add the domain to the one platform project.
   - Solela's DNS: CNAME `portal` → `cname.vercel-dns.com`.
   - Firebase console → Authentication → Settings → Authorized domains:
     add the hostname (Google sign-in; email + password works without it).
   - `omega_orgs/solelacapital.com.domains[]`: add the hostname (console;
     branding fields are staff/owner-writable), then re-run step 2 so
     `tenant_public/{host}` exists for it — `omega-sso.js` boots on a
     hostname only when a tenant record carries it, and `kit.js home()`
     then routes Solela's people there.
5. **Check**: open `https://<host>/workspace` signed in as a
   solelacapital.com member — the rail head reads Solela Capital with the
   S monogram and no attribution line; the tab title reads Solela Capital;
   staff can preview from any signed-in page with
   `?wlpreview=solelacapital.com`.

## What is deliberately NOT done here

- `whiteLabel.enabled` is untouched: it opens the PUBLIC storefront, a
  separate sale (`api/_lib/storefront.js`).
- The ~40 literal "ClearSky-OMEGA" strings inside individual tools convert
  as they are touched (`data-omega-platform`, `docs/WHITE-LABEL.md`), as
  before; this branch converted the workspace chrome.
- No Firestore write happens from this branch by itself — step 2 and the
  console do it, audited.
