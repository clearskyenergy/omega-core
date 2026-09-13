# SkyFund sandbox — the phone-installable MVP demo

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Two pages:

- `/skyfund-sandbox` — the investor storefront
- `/skyfund-sandbox/sponsor` — the sponsor console, where a partner lists a
  site and ClearSky reviews and launches it

Live on `https://silmarillion.clearskyomega.com` (any host on the omega-core
Vercel project serves both paths). On an iPhone: open it in Safari, Share →
Add to Home Screen. On Android / desktop Chrome: the Install button on the
Account page, or the browser's install icon. The manifest scope covers both
pages, so the console opens inside the installed app.

**Nothing here is real.** Sign-in accepts any email with no password, checkout
is a simulated sheet, holdings and distributions live in the phone's
localStorage. The Controls button in the purple strip resets the device or
fast-forwards a quarter so a distribution is paid into the portfolio.

On the sponsor console the email domain decides the role, the way the real
console mirrors `isPlatformAdmin()`: `@csebuilders.com` is ClearSky,
anything else is a sponsor for that domain. The demo loop is

1. sign in as `partner@northgatecompute.com` — their draft listing (a 1.5 MW
   container park already operating) is waiting; edit it, Submit for review
2. sign in as `demo@csebuilders.com` — Review queue → Launch
3. back on the storefront it is live at 18.0% target yield, and investable

A campaign invented on the phone can be drafted and submitted but not
launched: pricing runs on `api/_lib/invest-math.js` on the platform, and only
the five sample projects carry figures it computed at build time.

## Where it comes from

This folder is a BUILD OUTPUT, not source. The source is on branch
`claude/compute-crowdfunding-platform-pjuv16` (built from commit `f931243`):

- `portals/skyfund/index.html` — the real storefront, unchanged in logic
- `portals/skyfund/sponsor.html` — the real sponsor console, likewise
- `scripts/skyfund-sandbox/shim.js` — stands in for Firebase (auth, Firestore,
  Storage), `/api/invest` and Stripe; becomes `sandbox.js` here with the
  per-unit projection tables computed once by `api/_lib/invest-math.js`, so
  the engine never ships
- `scripts/skyfund-sandbox/draft-sample.js` — the fifth listing, seeded as a
  draft so the console has something to review and launch
- `scripts/build-skyfund-sandbox.js` — produces the relative-path folder

## Rebuilding

Once the branch is on main:

    node scripts/build-skyfund-sandbox.js /tmp/skyfund-build
    node scripts/tests/tskyfundsandbox.js

then re-root the relative paths onto `/skyfund-sandbox`. The build targets
`./` so the folder also works from a static link; Vercel's
`trailingSlash: false` makes a relative-path page at `/skyfund-sandbox`
resolve its assets at `/`, so every reference is rewritten:

- `index.html` and `sponsor.html`: `brand/…`, `samples.js`, `sandbox.js`,
  `manifest.webmanifest`, `sponsor.html`, `index.html` → `/skyfund-sandbox/…`;
  the worker URL and scope; `apple-mobile-web-app-title` → `SkyFund`
- `manifest.webmanifest`: `start_url`, `scope` and icon `src`
- `sandbox.js`: the two `location.href` hops between the pages
- `samples.js`, `sw.js`, `brand/` — copied as-is

The script that does it is kept with the session scratch, not the repo; it is
twenty lines of asserted string replacement, and every rewrite fails loudly if
the build changes shape. Reproduce it from the list above.

`vercel.json` carries the two rewrites (`/skyfund-sandbox`,
`/skyfund-sandbox/(.*)` → this folder) and `Service-Worker-Allowed:
/skyfund-sandbox` on `sw.js`, so the worker's scope can cover the page URL,
which has no trailing slash. Same pattern the branch uses for `/skyfund`.
