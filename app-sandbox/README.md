# Omega Logic phone sandboxes — the three apps with nothing behind them

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Four pages, one sample Clean Cell, kept on the phone:

- `/app-sandbox/plant` — the plant app (the two builders)
- `/app-sandbox/office` — the office app (project manager, procurement, commissioning)
- `/app-sandbox/customer` — the customer app (the buyer; Editor Lite first)
- `/app-sandbox/bench` — the bench screen the plant app's *Scan* opens

On an iPhone: open one in Safari, Share → **Add to Home Screen**. On Android
or desktop Chrome: the browser's **Install**. Each page has its own manifest,
so the three apps install as three icons — Clean Cell's plant, office and
customer marks.

**Nothing here is real.** Sign-in accepts any email (the plant and office
apps sign you in as `demo@cleancell.us`; the customer app as whatever you
type, and `ops@riverside.example` is the account with the history). The
sample — a catalog with bills of materials, one work order with six
cabinets on the floor, three orders, a company account with a PO under
review, a customer with a site plan on trial — lives in this browser's
localStorage. What you do (answer a request, assign a unit, key in a stack
of POs, issue parts at the bench, size a system, send a PO) changes it, on
this phone only. **Reset** in the purple strip starts the sample over.

What IS real: the pages are the product's pages, unmodified in their logic,
and every number is computed by the product's own libraries (the board, the
map, the materials plan, the bench steps, the sizing), bundled — not copied
— into `sandbox.js`. What is NOT: the endpoints (answered on the page), the
desktop pages the apps link to (a tap says so), pricing, invoices, e-mail.

The bench is pre-paired as a **roaming phone** (`st-phone`); pair it to any
other ID with any token and it is Bay 2 · Rack assembly. The unit to scan is
`CC418-26-44190`; the parts to issue are `CC-MOD-52` and `CC-HARN`.

## Where it comes from

This folder is a BUILD OUTPUT. Do not edit it. The source is

- `plant/app.html`, `office/app.html`, `portals/customer/app.html`,
  `plant/station.html` — the real pages
- `scripts/_lib/logic-fixtures.js` — the sample and every endpoint's answer
  (also what `npm run check:pages` renders against)
- `scripts/_lib/app-sandbox-shim.js` — stands in for Firebase auth and
  `/api/`; the strip and Reset
- `scripts/build-app-sandbox.js` — bundles the two above with the pure
  libraries, rewrites the pages (every rewrite asserted), writes the
  manifests and the worker

Rebuild with `npm run build:sandbox`. The same four pages go out as private
test links (one Claude artifact per app, every path relative, no service
worker, the other apps' links written into the strip) with
`node scripts/build-app-sandbox.js --artifacts <dir> '{"plant":"https://…",…}'`;
each artifact is its own origin, so the sample on one is not the sample on
another. `scripts/tests/tappsandbox.js` fails
`npm test` when the committed folder is not what a rebuild produces.
