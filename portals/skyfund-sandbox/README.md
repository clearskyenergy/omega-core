# SkyFund sandbox — the phone-installable MVP demo

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Live at `https://silmarillion.clearskyomega.com/skyfund-sandbox` (any host on
the omega-core Vercel project serves it at that path). On an iPhone: open it in
Safari, Share → Add to Home Screen. On Android / desktop Chrome: the Install
button on the Account page, or the browser's install icon.

**Nothing here is real.** Sign-in accepts any email with no password, checkout
is a simulated sheet, holdings and distributions live in the phone's
localStorage. The `#sandbox` route (Account → sandbox controls) resets the
device or fast-forwards a quarter so distributions appear.

## Where it comes from

This folder is a BUILD OUTPUT, not source. The source is on branch
`claude/compute-crowdfunding-platform-pjuv16` (built from commit `ddd780b`):

- `portals/skyfund/index.html` — the real storefront, unchanged in logic
- `scripts/skyfund-sandbox/shim.js` — stands in for Firebase, `/api/invest`
  and Stripe; becomes `sandbox.js` here with the per-unit projection tables
  (computed once by `api/_lib/invest-math.js`, so the engine never ships)
- `scripts/build-skyfund-sandbox.js` — produces the relative-path folder used
  for a claude.ai artifact link

## Rebuilding

Once the branch is on main:

    node scripts/build-skyfund-sandbox.js /tmp/skyfund-build
    node scripts/tests/tskyfundsandbox.js

then re-root the relative paths onto `/skyfund-sandbox` (the build targets
`./` for artifact hosting; Vercel's `trailingSlash: false` makes a
relative-path page at `/skyfund-sandbox` resolve its assets at `/`):

- `index.html`: `href="manifest.webmanifest"`, `href|src="brand/…"`,
  `src="samples.js"`, `src="sandbox.js"` → prefix `/skyfund-sandbox/`;
  `var swUrl = 'sw.js', swScope = './'` → `'/skyfund-sandbox/sw.js'`,
  `'/skyfund-sandbox'`; `apple-mobile-web-app-title` → `SkyFund` (the
  home-screen label; `short_name` already says the same on Android)
- `manifest.webmanifest`: `start_url` and `scope` → `/skyfund-sandbox`;
  icon `src` → prefix `/skyfund-sandbox/`
- `samples.js`, `sandbox.js`, `sw.js`, `brand/` — copied as-is

`vercel.json` carries the two rewrites (`/skyfund-sandbox`,
`/skyfund-sandbox/(.*)` → this folder) and `Service-Worker-Allowed:
/skyfund-sandbox` on `sw.js`, so the worker's scope can cover the page URL,
which has no trailing slash. Same pattern the branch uses for `/skyfund`.
