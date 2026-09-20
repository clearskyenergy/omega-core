# The sandbox

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

An artificial Clean Cell account you can operate end to end — size, order,
confirm, price, publish, take a deposit, release to the floor, scan units
through the benches, and watch the buyer's milestone move on its own.

    node scripts/sandbox/build.js     # -> scripts/sandbox/index.html
    node scripts/sandbox/drive.js     # drives the whole loop in Chromium

`index.html` is generated and deliberately not committed; `build.js` rebuilds
it in under a second.

## Why it is trustworthy

`build.js` reads `api/_lib/plant.js` and `api/_lib/portal.js` **verbatim** out
of the repo and rewrites exactly one line in each — `module.exports` becomes a
`window.` global. No logic is copied, re-implemented or adjusted, and the
build throws if that rewrite fails. So the sandbox's routing verdicts, its
furthest-behind milestone and its buyer projection are the ones production
computes. Change `portal.js` and the sandbox changes with it.

What is simulated, and only this: Firestore (a `localStorage` object), auth
(a role tab), Stripe (a button), and the catalogue. Every decision in between
is real code.

## The four roles

| tab          | who          | can do                                                      |
|--------------|--------------|-------------------------------------------------------------|
| Buyer        | the customer | size a system, order, watch status, read terms, request cancel |
| Clean Cell   | the tenant   | confirm, publish a price, mark deposit, release to the floor |
| Plant floor  | the bench    | scan serials through the ten stations                        |
| ClearSky     | staff        | price the order, see cost basis, run the leak test           |

The leak test is the point of the ClearSky tab: it searches the buyer's
projection for the cost basis, the margin, the ClearSky price, the unit
provenance and the internal notes, and reports each one absent. That is
`publicOrder()`'s allowlist being exercised, not an assertion about it.

## Boundaries it will actually refuse

- a scan out of sequence (`out_of_sequence`)
- a scan at a station the test rig owns (`machine_station`)
- a unit on hold still reports the furthest-behind milestone, not progress
- an unpublished price is invisible to the buyer no matter how many times
  ClearSky reprices
