# Packaging Phase 6 — the Subscription Proposal and signup discovery

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Draft PR (stacked on Phase 5, [#140](https://github.com/clearskyenergy/omega-core/pull/140));
the PR link is recorded in the roadmap status table once opened. Vercel
builds the branch at
`https://omega-core-git-codex-packaging-phase-6-clearsky-usa.vercel.app`.
No live organization, trial, billing date, QuickBooks record, environment
variable or deployed rule was changed. Runtime flags remain off by default;
the proposed book remains disabled in the seed. No email was sent to anyone:
the mailer is a stand-in in every test and render.

## What changed

**One discovery, two doors.** The twelve questions of VALUE-LADDER §3.7, the
money question, the recommendation, the price and the Order Form live in
`api/_lib/subscription-proposal.js` and are served by
`POST /api/subscription-proposal`. A ClearSky sales rep uses them in the
proposal tool; a company signing up on its own walks the same questions on
`start.html`. Both end in the same `proposedPackage` on `billing/current`,
which approval turns into the trial and the first invoice, and which the
editor's workspaces and gates (Phases 2–3) then reflect.

**The rep's tool** (`subscription-proposal.html`, on the Pro Forma pattern):
Company · How they work today · Package · Value · Terms · Deck · Send, a
live rail, and `subscription-proposal-logic.js` drawing seven US-Letter
pages (cover, what we heard, your package, value in their numbers, terms,
the Agreement's Order Form with the Module Schedule and signature blocks,
next steps) that print to PDF from the browser. Any verified
`@clearsky-usa.com` address may use it. The Package tab's "Send as
proposal" opens it on that tenant with the rail's terms. `?id=` reopens a
saved proposal; the tool lists recent ones.

**Server-only numbers.** `recommend` maps answers to modules ("this
quarter" → the package, "within the year" → the next rungs) and always
returns at least Lite; `selection` runs the rep's terms through the same
`Policy.terms` activation uses (floor, fit, credit vs annual prepay, fee
reason); `pricing` is `P.quote` on the signed price book; `value` compares
what they said they pay with the recurring price and values included usage
at their own unit cost, and shows nothing it was not told; `terms` and
`orderForm` are computed here and only drawn by the pages.

**Records and the customer's view.** `subscription_proposals/{id}` (Admin
SDK only; closed to browsers in `firestore.rules`) holds the prospect, the
answers, the selection, the computed pricing, the rep's notes and a bounded
history. States: `draft` → `sent` → `accepted` | `declined` | `expired`
(30 days). Sending stores only the SHA-256 of the key and emails a link to
`proposal.html?id=&key=`, which draws the same deck without an account; the
customer projection never carries notes, history or the hash. Editing a
sent proposal withdraws it (back to draft, key gone); resending issues a
new key.

**Accepting never prices.** A company with no workspace accepts by signing
up with the key: `api/tenant-signup.js` verifies it, takes the proposal's
package, terms and credit as `proposedPackage`, and marks the proposal
accepted in the same transaction. A tenant on a paid package accepts by
signing in: the server routes it through Phase 5's `plan-change` (a
pay-first change invoice). Any other tenant's acceptance writes the
proposal as its `proposedPackage` and tells staff to activate. Only the
prospect's own owner or admin may accept; staff cannot accept for them.

**Signup discovery.** `start.html` gained "How you work today" between the
company details and billing: the questions, the spend, "Recommend my
package" (the server's answer with its price and the difference in their
numbers), a picker that starts from the recommendation with the live server
price, and the answers stored as `billing/current.signupDiscovery` for the
rep who approves. From a proposal link the picker is read-only on the
package the rep priced.

**One brand rule.** `brandOf` moved from `api/proforma.js` into
`api/_lib/deck-brand.js`; the Pro Forma and the proposal draw a deck with
the same mark, colours, tagline and white-label attribution.

## Verification

- Full `npm test` and `npm run check:pages` passed locally after every change.
- `scripts/test-subscription-proposal.js`: 89 assertions on the Firestore
  double with mail and QuickBooks stand-ins, in `npm run test:packaging`:
  discovery validation and recommendation rules (next rungs, Logic parts
  bringing Office, many sites → Site Intelligence, the EV overage note, never
  below Lite); price, value, terms and Order Form against the pricing
  library; annual prepay excluding the credit; staff-only actions; context;
  recommend and price for a signed-in prospect; save, send (keyed link, hash
  stored, email), the customer view and its projection, wrong key and wrong
  id, withdraw-on-edit and resend; a prospect refused in place and staff
  refused; signup with the key (withdrawn key refused, package and credit
  carried, accepted in the transaction); signup with a discovery (stored,
  recommended package proposed, malformed answers refused before any write);
  a paid tenant's acceptance through plan-change (one sandbox invoice,
  nothing switched on, idempotent); an unpackaged tenant's acceptance as a
  proposed package with a staff notice; decline; expiry.
- `scripts/tests/tproformaapi.js` (179) still passes on the shared brand
  library; `scripts/test-tenant-signup.js` (39) still passes.
- `scripts/render-subscription-proposal.js`: 39 checks and 15 screenshots. The rep tool,
  the customer page and both signup paths run the real
  `api/subscription-proposal.js` and `api/tenant-signup.js` handlers over
  the in-memory Firestore: the recommendation, the picker, the credit-window
  price, the value page, the seven-page deck with the Order Form, save,
  send (the keyed email), the customer's view with its signup link, signup
  from the link (read-only package, accepted with the workspace), and
  self-serve signup through the questions to a stored recommendation.
  Nothing is invoiced anywhere in it.
- `scripts/render-packaging-billing.js` now also checks the Package tab's
  "Send as proposal" link and the signup page's discovery step (71 checks, 25 screenshots).

## Screenshots

| Screen | Light | Dark |
|---|---|---|
| Rep tool · Company | [image](screenshots/packaging-phase-6/proposal-company-light.png) | |
| Rep tool · How they work today, recommendation | [image](screenshots/packaging-phase-6/proposal-discovery-light.png) | [image](screenshots/packaging-phase-6/proposal-discovery-dark.png) |
| Rep tool · Package and rail | [image](screenshots/packaging-phase-6/proposal-package-light.png) | [image](screenshots/packaging-phase-6/proposal-package-dark.png) |
| Rep tool · Value | [image](screenshots/packaging-phase-6/proposal-value-light.png) | |
| Rep tool · Deck (seven pages, Order Form) | [image](screenshots/packaging-phase-6/proposal-deck-light.png) | [image](screenshots/packaging-phase-6/proposal-deck-dark.png) |
| Rep tool · Send | [image](screenshots/packaging-phase-6/proposal-send-light.png) | [image](screenshots/packaging-phase-6/proposal-send-dark.png) |
| Customer's page | [image](screenshots/packaging-phase-6/proposal-customer-light.png) | [image](screenshots/packaging-phase-6/proposal-customer-dark.png) |
| Signup from a proposal link | [image](screenshots/packaging-phase-6/signup-proposal.png) | |
| Signup · How you work today | [image](screenshots/packaging-phase-6/signup-discovery.png) | |
| Signup · billing with the recommended package | [image](screenshots/packaging-phase-6/signup-recommended.png) | |

## Sandbox enablement and operator checks

The flags are Phase 4's (`PACKAGING_BILLING_ENABLED=true`,
`PACKAGING_SIGNUP_ENABLED=true`, `QBO_ENV=sandbox`, the enabled proposed
book). Nothing new is required to prepare, send or accept a proposal; the
paths that move money keep their own guards. To exercise it:

1. As a rep, open `/subscription-proposal.html`, walk a prospect through the
   questions, adjust the package, save, download the PDF, send.
2. Open the emailed link as the prospect; accept by signing up; approve in
   the Package tab (the proposal's package is preselected); the trial and
   the first invoice follow Phase 4.
3. Send a proposal to an existing paid sandbox tenant; accept as its owner;
   pay the change invoice; reconciliation switches the modules on (Phase 5).
4. Sign up without a proposal and answer the questions; check
   `billing/current.signupDiscovery` on the record.
5. Real sandbox acceptance with the connected QuickBooks company has
   **not** been performed.

## Remaining acceptance and release debt

- The PDF is the browser's print of the deck; no server-side PDF is stored
  (`subscription_proposals` carries no file). Email delivery is best-effort
  and recorded as `mailState`; the link is always shown to the rep.
- Senders are staff only (VALUE-LADDER §11.9 default); a White Label tenant
  sending under its own brand is not enabled, though the deck already draws
  the sender's brand.
- Enterprise and annual-prepay changes for existing tenants are quoted, not
  self-served; a proposal to a tenant on a trial or unpaid package becomes
  its proposed package for staff to activate.
- The customer page's in-place acceptance signs in with Google; email and
  password sign-in is not offered there.
- Retention of prospect data in `subscription_proposals` (answers, spend,
  contact) is not defined; nothing is deleted.
- Roadmap §11.3 stands: members never see the subscribe control; the
  signup discovery is shown to the person signing up only.
- No connected sandbox send or acceptance, hosted acceptance, price-book
  sign-off, production merge, rule deployment or live migration is claimed.
  The rules block for `subscription_proposals` is in the file and passes the
  structural check; it is not deployed.
- The release debt carried from the Phase 4 review remains as listed in
  `PACKAGING-PHASE-5-VALIDATION.md`.
