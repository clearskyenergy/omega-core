# The OMEGA loading screen

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Tommy, 2026-09-26: *"anytime we move from one page to another, we need the
OMEGA loading page; we can never flash another page or the login page; it
must be professional."*

## What it is

`omega-splash.js` is loaded **first in `<head>`** on every page a person
signs in to (43 pages; `scripts/tests/tsplash.js` fails if one is missing
or not first). It paints the OMEGA mark on navy before anything else can
paint, hides the page's own content (`html.omega-loading body > *`) until
the page is known, and shows the mark again the instant a same-origin link
is followed or the page is left (`beforeunload`), so the next page's own
splash takes over without a gap and no sign-in card is ever seen in between.

## When it ends

- `omega:auth` with `detail.user === false` — `omega-tenant.js` names the
  first answer of `onAuthStateChanged`; signed out, the sign-in card is the
  truth and the page shows it.
- `omega:entitlements` — signed in and the package known; the page is
  complete.
- `OmegaSplash.done()` — a page that decides itself: `login.html` and
  `start.html` load it with `data-hold="1"` and end it when they show a
  pane.
- the window's `load` + 400 ms — on a page with no `omega-tenant.js`
  (the editor) and no hold.
- a hard cap of 4 seconds — the dashboard's boot watchdog taught us that a
  splash which can outlive a dead page hides the failure behind a brand
  animation.

`index.html` keeps its own `#boot-splash` (with that watchdog) and loads
this one with `data-boot="no"`: leaving only.

## Rules

- A new signed-in page gets the tag first in `<head>`; the test says so.
- A page that shows something of its own before auth answers (a sign-in
  card, a step) holds and calls `done()`; never let the cap be the way it
  ends in the normal case.
- The sandboxes (`app-sandbox/`) are built from the app pages and carry the
  tag; `npm run build:sandbox` and `npm run guides` after touching them.
