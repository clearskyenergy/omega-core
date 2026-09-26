# Packaging Phase 7 — usage counters, packs and the 90-day review

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Draft PR (stacked on Phase 6, [#141](https://github.com/clearskyenergy/omega-core/pull/141));
the PR link is recorded in the roadmap status table once opened. Vercel
builds the branch at
`https://omega-core-git-codex-packaging-phase-7-clearsky-usa.vercel.app`.
No live organization, trial, billing date, QuickBooks record, environment
variable or deployed rule was changed. Runtime flags remain off by default;
the proposed book remains disabled in the seed.

## What changed

**Counting where the deliverable is produced.** `api/_lib/usage.js` keeps
one document per billing cycle, `omega_orgs/{org}/usage/{cycleStart}`,
incremented in a transaction and idempotent by client id (an `events`
subcollection). It is an honest billing counter, not a security boundary:
the package gate still decides who may produce. Counted today: an EV
workbook export and a closeout ZIP (EV applications), a Site Finder packet
(site studies), and an RFQ (bills of materials, an activity meter for the
review only). The browser producers count through `POST /api/usage`
(`omega-usage.js`, before the export; the server may refuse with the pack
offer); the RFQ counts server-side. The permitting-matrix meter has no
producer yet: `OmegaPermitMatrix` is a catalog reference, not code.

**Included, then overage.** A billed meter's allowance is the book's
included amount plus the packs bought this cycle. At 80% the tool shows a
quiet note; at 100% the next deliverable is refused (402) with "Buy 10 more
for $500" unless auto top-up is on, in which case it goes through and the
overage is billed. `Policy.invoice` adds one line per meter for the cycle
that just ended (quantity over the allowance × the per-unit price) and
`issue()` reads that cycle's usage inside its transaction; the lines land on
the `overage:<meter>` items `scripts/qbo-sync-items.js` already syncs.
Usage never blocks opening, viewing or exporting finished work.

**Buy more, like credits.** `POST /api/plan-change` gained `pack-quote`,
`pack-buy` and `auto-topup` (owner or admin, paid monthly tenants). A pack is
its own invoice record (`kind: 'pack'`, its cycle, its QuickBooks DocNumber
and memo), paid first; reconciliation adds the units to that cycle's
`purchased` when QuickBooks shows it paid, takes them back (never below
zero) on a reversal, and never touches access. A pack good for a cycle that
has rolled expires unpaid; a late payment is flagged for review.

**Where it shows.** Your plan lists this cycle's meters with a bar, the note,
the buy-more button and the auto top-up switch (off by default). The staff
Package tab carries "Usage and the 90-day review": recorded activity against
included and packs per module, and what the review suggests — a pack or the
next tier where a meter ran over, removal where nothing was recorded in 90
days, the cheaper tier where the à la carte total exceeds it. A module
without a meter is reported as "no usage meter yet", never as unused. The
tools show the badge beside their export button (`data-usage-meter`).

## Verification

- Full `npm test` and `npm run check:pages` passed locally after every change.
- `scripts/test-usage.js`: 64 assertions on the Firestore double with
  QuickBooks and mail stand-ins, in `npm run test:packaging`: the six meters
  and the empty summary; counting keyed by cycle and idempotent by client
  id; the 80% note; the 402 refusal with the pack offer that counts nothing;
  activity meters never gated; auto top-up letting overage through; the
  endpoint (fields, members, staff, another organization, an unpackaged
  tenant, `canBuy`, the review only for owners, admins and staff); pack
  quote and purchase (stale offer, members, one invoice on the pack item,
  replay), reconciliation adding and reversing units without touching
  access, expiry after the cycle rolls; the auto top-up switch (boolean,
  admins only, audited); the review's over/remove/steer suggestions; the
  overage line on the recurring invoice through `Policy.invoice` and
  `issue()`.
- Existing suites still pass: plan change 165, activation 52, billing
  foundation 81, billing API 45, subscription proposal 89.
- `scripts/render-packaging-billing.js`: 87 checks, 31 screenshots. Your plan
  at 18 of 20 (the quiet note, activity without an allowance, the switch off
  by default), at 20 of 20 the buy-more offer → a sandbox pack invoice with
  its pay link and nothing added before payment, the switch stored, the
  staff review naming the overage, the recorded activity and the modules
  without a meter, and the closeout tool's badge beside its export.

## Screenshots

| Screen | Light | Dark |
|---|---|---|
| Your plan · usage this cycle | [image](screenshots/packaging-phase-7/your-plan-usage-light.png) | [image](screenshots/packaging-phase-7/your-plan-usage-dark.png) |
| Your plan · buy more (pack invoice) | [image](screenshots/packaging-phase-7/your-plan-buy-light.png) | [image](screenshots/packaging-phase-7/your-plan-buy-dark.png) |
| Package tab · usage and the 90-day review | [image](screenshots/packaging-phase-7/package-review-light.png) | |
| Closeout tool · the badge | [image](screenshots/packaging-phase-7/closeout-usage-badge.png) | |

## Sandbox enablement and operator checks

The flags are Phase 4's; nothing new is required. The overage and pack items
must exist in the sandbox company (`scripts/qbo-sync-items.js` creates
`overage:<meter>` and `pack:<meter>` items from the book). To exercise it:
export an EV workbook twenty-one times on a paid sandbox tenant (the
twenty-first is refused with the offer); buy the pack from Your plan and pay
it; run the runner so reconciliation adds the units; switch auto top-up on
and export again; wait for the billing date and read the overage line on the
recurring invoice. Real sandbox acceptance has **not** been performed.

## Remaining acceptance and release debt

- Permitting matrices are priced and included but not counted: the matrix
  producer does not exist in the repo yet. Storage models and site screens
  are not counted either (their producers run on the verify-token path that
  cannot write counters); the review says "no usage meter yet" for them.
- One EV workbook export or closeout ZIP counts as one application; a
  per-form count would need the producer to name the application.
- Site Finder has no static toolbar for the badge; the gate and the offer
  still apply at the packet download.
- Packs do not roll over (they expire with the cycle, roadmap §10.6
  default); no refunds on a reversal beyond taking the units back.
- Pay-first packs use the QuickBooks invoice link; the saved-card path is
  Step B.
- No connected sandbox payment, price-book sign-off, production merge, rule
  deployment or live migration is claimed. The `usage` rules block is in the
  file and passes the structural check; it is not deployed.
- The release debt carried from earlier phases stands as listed in
  `PACKAGING-PHASE-5-VALIDATION.md` and `PACKAGING-PHASE-6-VALIDATION.md`.
