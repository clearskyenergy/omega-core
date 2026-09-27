# Handoff for Astra — pick up after the 2026-09-27 session

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Owner: Tommy Gilmer (ClearSky). Repo: `clearskyenergy/omega-core`, branch
`main`. Written at the end of the Claude Code session that merged PRs #150
through #158. Paste this whole file to Astra as the opening message. It says
what is done, what is left, who can do it, and the rules that must not be
broken. The earlier handoff, `docs/ASTRA-HANDOFF.md`, still holds for
background and the commercial decisions; this file is the current to-do.

---

## 1. Where things stand

Everything the packaging and self-serve program needed in CODE is merged to
`main` and deployed by Vercel. There is no open PR from this work. Tommy's
goal is to start selling Monday 2026-09-28.

Merged this weekend (all on `main`):

- **#150–#154, #156, #157** — launch hardening (address rule in
  `api/_lib/kit.js`, `/start` routing on every host, billing runner hourly
  and never cutting access on its own bookkeeping error, paid-invoice mails,
  custom-transaction-number refusal, `SUPPORT_EMAIL`), the OMEGA loading
  screen on every signed-in page, the dashboard's *Your modules* cards, the
  editor light/dark theme audit, the admin console reading packaged tenants
  by state with prices from `GET /api/offerings`, the signup flow as sold
  (account → verified email → billing profile → Build your system → pay).
- **#158** — the Omega Workspace (`workspace.html`) reworked:
  - One view at a time. Home = hex hub + Today. All tools (`#tools`),
    Modules (`#modules`), In flight (`#flight`), Around you (`#team`,
    `#feed`) are each their own page inside `/workspace` (`data-view` on
    `#content`; `go()` switches, marks the rail and phone tabs, clears the
    hash on Home). No section scrolls any more.
  - All tools condensed on a phone: one short row per tool.
  - Every hex opens the side panel (Today lists what needs you; Projects and
    Team open their panels). Nothing on the hub moves the page.
  - **Modules page**: one card per module of the server catalog in shelf
    order, held ones Live, bought-not-on named, the rest with the server's
    price (`/api/package-catalog`, asked once) and **+ Add** opening the ONE
    package menu (`omega-package-menu.js`). A legacy plan (no packaged
    record, e.g. clearsky-usa.com on Enterprise) sees every module Live and
    nothing to add. `Modules` joined the rail; *Change plan* on a packaged
    plan strip opens it.
  - **View as a customer** (staff only): `/workspace?viewas=lite` or
    `?viewas=lite,gridatlas` paints the signed-in workspace as a packaged
    customer holding those modules through the server's existing preview
    (`POST /api/package-access {previewModules}`, refused to anyone but
    verified `@clearsky-usa.com`). Paint, never scope: nothing billed, a
    banner with Exit. Tommy uses this to see what a customer sees.
  - Checks: `npm run check:workspace` (scenarios newco, northstar,
    northstar-phone, viewas, pending, lite, store, flows), `check:dashboard`,
    `scripts/tests/tworkspacehub.js`, `tnav.js`. Docs:
    `docs/OMEGA-WORKSPACE.md`.

Verified through the QuickBooks connector on 2026-09-26 (production company
"ClearSky Energy Solutions LLC"): QuickBooks Payments on (card, ACH,
PayPal), custom transaction numbers on. `VERSION` in `api/_lib/pricebook.js`
is `2026-10` (signed off, no `-proposed`).

## 2. What is left — and who holds the key

None of this is code. Each needs a credential or an account only Tommy has.
The full ordered list with commands is `docs/PACKAGING-RELEASE-CHECKLIST.md`
§6; the unchecked boxes there are the work. In order:

1. **Seed the price book for production**
   `node scripts/seed-pricebook.js --live --realm=<production realm>` (dry
   run), then `--apply`. Needs `GOOGLE_APPLICATION_CREDENTIALS` (Firebase
   Admin service account for `clearsky-portal`) and the QuickBooks production
   realm id.
2. **Bind the items in the production company**
   `PACKAGING_LIVE=true QBO_ENV=production node scripts/qbo-sync-items.js --apply --live --realm=<realm> --income-account=<id> --taxable|--non-taxable`
   (dry run first without `--apply`). Needs QBO client id/secret with the
   production refresh token.
3. **Enable the book** `node scripts/enable-packaging-sandbox.js` (dry run
   prints the hash), then `--apply --expected-hash=…`. Until this runs,
   `/api/package-catalog` refuses tenants with "Packaging is not enabled":
   the Modules page shows "Price on the menu" instead of dollars and the
   signup page says "opening shortly". Nothing 500s.
4. **Vercel Production env**: `PACKAGING_SIGNUP_ENABLED=true`,
   `PACKAGING_BILLING_ENABLED=true`, `PACKAGING_LIVE=true`,
   `QBO_ENV=production`, `CRON_SECRET`, `MAIL_NOTIFY`. Leave
   `TENANT_WILDCARD_LIVE` unset. Redeploy.
5. **One real signup** on a ClearSky-controlled domain with a real card: pay
   step shows QuickBooks' page, invoice lands in the production company,
   "I've paid" opens the workspace. Then refund and void; the runner marks
   the record reversed.
6. Eyeball once: a *Pay now* button on a QuickBooks invoice preview.
7. Optional, not for the first sale: `support@clearsky-usa.com` as an alias
   of `dev@clearsky-usa.com`; the `*.clearskyomega.com` wildcard
   (`TENANT_WILDCARD_LIVE`) if slug hosts are wanted.

If Tommy gives Astra the Firebase Admin JSON, the QBO client id/secret +
production realm and a Vercel token, Astra can run 1–4 itself. Otherwise
Astra walks Tommy through each command and checks the result.

Debt carried into the release (known, not blocking Monday):
`docs/PACKAGING-RELEASE-CHECKLIST.md` §7.

## 3. Things Tommy may ask for next (open, unbuilt)

- The workspace preview cannot quote: `+ Add` in `?viewas=` opens the menu
  and the server refuses the quote because clearsky-usa.com is not a
  packaged tenant. If he wants to click through a purchase as a customer, a
  test tenant on a ClearSky-controlled domain (step 5 above) is the honest
  way; do not fake a packaged record on his own org.
- The hub's ring composition and the Today card are pure libraries
  (`omega-workspace-hub.js`, `omega-workspace-today.js`); anything he wants
  changed there goes in the library and its test, never in the page.
- The Marketplace (`marketplace.html`) is still the package store for a
  packaged tenant; the workspace's Modules page is a second surface on the
  same catalog and menu. Do not add a third.
- Phone screenshots he sends are usually PRODUCTION before a deploy lands.
  Check the Vercel deployment of `main` before assuming a bug.

## 4. Rules that must not be broken (short form; CLAUDE.md is the law)

- ES5 in every `omega-*.js` and tool page; no build step.
- Pricing, quoting, activation only in `/api/`. ONE catalog
  (`api/_lib/modules.js`), ONE price book (`api/_lib/pricebook.js`), ONE
  menu (`omega-package-menu.js`), ONE address rule (`api/_lib/kit.js`
  `home()`), ONE packaging-mode rule (`api/_lib/packaging-mode.js`). Never a
  second copy of any of them.
- Staff = a VERIFIED `@clearsky-usa.com` address. Never `csebuilders.com`.
- Absent ≠ empty for `toolAccess`. Showing a link is never access.
- Never delete a Firestore document. Never write `omega_orgs` from a browser.
- No secrets in the repo. No model names or session ids in commits, PR
  bodies or code.
- Every source file carries
  `© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.`
- Never push to `main`. Branch → PR → CI green → squash merge. CI is
  `tests.yml` (unit, `check:pages`, `check:dashboard`) and `partner-scope`.
- After touching `workspace.html`, the shell or the runtime: run
  `npm run check:workspace` and `npm run check:dashboard`
  (`PLAYWRIGHT=/opt/node22/lib/node_modules/playwright` in the cloud box).
- Screenshot render noise: `git checkout -- docs/screenshots` before a commit.
- Editing `editor.html` needs a `MERGE.md` entry.

## 5. How to report back

Short, plain, no headers under 500 words. Say what is merged, what is
deployed, what is blocked and on which credential. Give Tommy the exact URL
to look at on his phone. Do not claim production is verified unless a real
page was opened and read.
