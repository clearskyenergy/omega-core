# Site Finder — the phone app

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

`/sitefinder-app` is the site finder's sales process on a phone, installable
from the home screen the way the SkyFund app is: manifest and service worker
beside the page, Vercel rewrites `/sitefinder-app` and `/sitefinder-app/(.*)`
onto this folder, `Service-Worker-Allowed: /sitefinder-app` on `sw.js`.

On an iPhone: open it in Safari, Share → Add to Home Screen. On Android or
desktop Chrome: the Install button on the Account page, or the browser's
install icon.

**Everything here is real.** It signs in with the same Firebase account, in
the same workspace (the email domain, `?org=` as a staff preview), and calls
the same endpoints as `clearsky-sitefinder.html`:

| Screen | What it does | Where it comes from |
|---|---|---|
| Find | Search the listing catalogue, or **Near me** / **Search this map**; listings sorted by available kW on the serving circuit, scored and sized | `/api/site-catalog`, `omega-comed-layers.js` (layer 75, 46 m rule), `/api/site-score` |
| Site | The property facts (asking, NOI, tenant, lease expiry, brokers; "pending API integration" where Crexi keeps the data), the battery fit (one unit of the closest product), the host lease offer with the printed proposal, the call sheet, star | `omega-bess-catalog.js`, `/api/site-lease`, `omega-site-lease.js`, `omega-site-saves.js` |
| Saved | The team's saved sites with the last call | `omega-site-saves.js` |
| Account | Workspace, install, the desktop tool, sign out | |

Nothing is copied from the desktop tool: every shared file loads from the
root by absolute path. Holds and the cost estimator stay on the desktop.

Test: `SITEFINDER_BROWSER=bundled node scripts/test-sitefinder-app.js` (or
with the Chrome channel and the optional Playwright install in
`scripts/site-agent`).
