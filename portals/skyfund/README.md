# SkyFund — community investment in compute & energy projects

`/portals/skyfund/` · routes `/skyfund` (storefront) and `/skyfund/sponsor`
(sponsor console; `/invest` and `/invest/sponsor` are kept as aliases) · © 2025–2026 ClearSky Energy Solutions LLC.

Crowdfunding for the projects the platform already designs. A sponsor
(a developer with a ClearSky-OMEGA workspace) lists a compute container, a
microgrid, a battery, a solar array or a charging hub. The offer is a
**percent of the project's distributable cash** — its PPA, its compute
lease, or both — for a fixed term, split into **units** ($50 or $100). An
investor buys units and owns that pro-rata share for the term. The
storefront reads like Indiegogo (cards, progress, perks, story, updates);
the investor's holdings read like Fundrise (portfolio value, projected
annual income, distributions).

Built to house style: one HTML file per surface, ES5, no build step,
Firebase compat SDK from the CDN, Vercel rewrites. Installable on a phone
today through `manifest.webmanifest`; a native wrapper (Capacitor) can load
the same URL later without touching these files.

---

## What actually runs

| file | what |
|---|---|
| `index.html` | the storefront: explore, campaign page, invest flow, portfolio, account, how-it-works |
| `sponsor.html` | tenant console: draft → submit; story/updates/investors; ClearSky review, launch, close, confirm, refund, declare distributions |
| `samples.js` | four sample campaigns, shown (marked) when nothing is live; seeded for real by `scripts/seed-invest-demo.js` |
| `manifest.webmanifest` | PWA manifest so the storefront installs to a home screen |
| `../../api/invest.js` | **all money and eligibility logic** — quote, pledge, cancel, submit, review, close, confirm, refund, distribute |
| `../../api/invest-webhook.js` | Stripe → pledge paid / cancelled / refunded (its own endpoint and secret) |
| `../../api/_lib/invest-math.js` | the pure engine: units, ownership %, year-by-year projection, IRR, MOIC, payback, eligibility rules |
| `../../api/_lib/invest-ledger.js` | the only code that changes a pledge's state; idempotent transactions that keep campaign counters honest |

Why the storefront does **not** load `omega-tenant.js`: that runtime routes a
signed-in person to their tenant's hostname and refuses hosts it does not
know — right for the workspace, wrong for a retail investor with a gmail
address. Like `/portals/finance/`, this is its own product surface and boots
Firebase directly from `/config.js`.

Why every number comes from `/api/invest`: CLAUDE.md's IP rule. Browser code
is public; the projection formula and the eligibility rules are the product.
The page collects an amount and renders what the server returns. `quote`
answers without a token (it reads only the public campaign doc) so a visitor
can move the slider before creating an account; everything else needs one.

---

## The mechanism, with numbers

Campaign: goal $500,000 in 5,000 units of $100. Offer: 40% of distributable
cash for 10 years; the sponsor's model says $180,000/yr distributable in the
first full year, +2%/yr, first cash 6 months after close.

An investor puts in $5,000 → 50 units → 1% of the offering → **0.4% of the
project's distributable cash**. Year one pays half a year ($360); year two
$734; the ten-year stream totals ≈ $7,524, a 1.50× multiple, ≈ 7.6% IRR,
payback in year 8. Those are the figures the calculator shows, and the ones
`scripts/tests/tinvest.js` checks by hand.

The **headline** on a card (target yield, IRR, multiple, payback) is the same
engine run for one unit, computed server-side at launch and stored on the
campaign document, so cards never call the API.

---

## Data model (`firestore.rules` → COMMUNITY INVESTMENT block)

```
cf_campaigns/{id}                 the listing. PUBLIC read when status ∈ live|funded|closed
  status      draft → review → live → funded | closed
  sponsorOrgId, sponsorName, type: compute|microgrid|bess|solar|ev
  title, tagline, story, images[], perks[], faq[], documents[], risks[]
  goal, minRaise, unitPrice, unitsTotal, minInvestment, deadline
  offer{ kind: ppa|compute|hybrid, sharePct, termYears, distributableAnnual,
         escalatorPct, degradationPct, codMonths, exitValue, platformFeePct }
  raised, unitsSold, backers      ← LEDGER-OWNED. Pinned on every sponsor write.
  headline{…}                     ← server-computed at launch. Pinned too.
cf_campaigns/{id}/updates/{u}     sponsor posts
cf_investors/{uid}                profile; status/kyc/accreditedVerified pinned (ClearSky sets)
cf_pledges/{id}                   THE CAP TABLE. write: false for every browser.
  investorUid, campaignId, sponsorOrgId (denormalised for the sponsor's read),
  amount, units, pctOfOffering, pctOfProject, projectedAnnual, perkId,
  status: pending → paid | cancelled ; paid → refunded
  paymentProvider: stripe|manual, stripeSessionId, stripePaymentIntent, attest{…}
cf_distributions/{id}             declared payouts: period, distributable, crowdPool, perUnit, unitsSold
cf_settings/rules                 minInvestment, maxInvestment, nonAccreditedAnnualCap,
                                  accreditedRequiredAbove, allowedCountries[], requireKyc
Storage cf_campaigns/{org}/{id}/  cover images and documents. PUBLIC read, sponsor/staff write.
```

Every status transition is a server action. A sponsor can write a draft and
narrative fields on a live campaign, and can never write a status, a
counter or a headline. `check-rules.js` passes on the merged file.

Queries the pages run, and why no composite index is needed: the storefront
filters `status in [live, funded]` (provable against the public-read rule);
the sponsor console filters `sponsorOrgId ==` and, for pledges,
`sponsorOrgId == && campaignId ==` (equality-only, merged single-field
indexes); the portfolio filters `investorUid ==`. Sorting is client-side.

---

## Money flow

1. **Quote** — `POST /api/invest {action:'quote', campaignId, amount}` →
   units, ownership, year-by-year stream, IRR, payback; personalised with
   eligibility when a token is present.
2. **Pledge** — `{action:'pledge', …attest}` → eligibility is checked
   server-side (platform rules merged with the campaign's own minimum, the
   investor's profile, and what they have committed this calendar year),
   a `cf_pledges` row is created `pending`, and a **Stripe Checkout Session**
   (mode `payment`, 30-minute expiry, `metadata.kind = cf_pledge`) is
   returned. The page redirects to Stripe. With no `STRIPE_SECRET_KEY` the
   pledge is created in **manual mode** and funding instructions are emailed;
   staff confirm receipt in the console.
3. **Webhook** — `checkout.session.completed` → `markPaid`: one transaction
   flips the pledge to `paid` and increments `raised`, `unitsSold`, and
   `backers` (distinct investors). Retries are no-ops. Delayed bank debits
   sit as `processing` until `async_payment_succeeded`.
4. **Close** — staff close a live campaign as `funded` (units final,
   proceeds net of platform fee recorded) or `failed` (every paid Stripe
   pledge refunded through the API, manual ones flagged `refundDue`,
   pending ones cancelled).
5. **Distribute** — on a funded campaign, staff enter the period's
   distributable cash; the crowd pool is `distributable × sharePct` and
   per-unit is pool ÷ units sold. Investors see their share
   (`perUnit × units`) in the portfolio. **Paying it out to bank accounts
   is not built** — Stripe Connect payouts or an ACH file are the next step;
   the row's `status` moves from `declared` to `paid` when that lands.

Pending pledges do **not** reserve units: an abandoned checkout must not hold
inventory. Oversubscription is refused at pledge time against `unitsSold`.

---

## Environment (Vercel)

| var | needed for |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT` | **required** — `/api/invest` and the webhook write Firestore. Without it `_lib/admin.js` answers 503 and the storefront degrades to browsing samples. The org policy that blocks key creation (see `api/_lib/verify-token.js`) has to be resolved for this surface; a pledge cannot be written as the caller. |
| `STRIPE_SECRET_KEY` | card/bank checkout. Absent → manual mode. |
| `STRIPE_INVEST_WEBHOOK_SECRET` | signing secret of the **separate** Stripe endpoint `https://<host>/api/invest-webhook` (falls back to `STRIPE_WEBHOOK_SECRET` if you reuse one). Subscribe it to `checkout.session.*` and `charge.refunded`. |
| `INVEST_BASE_URL` | optional; success/cancel URLs default to the request origin. |
| `MAIL_*` | receipts and the review alert; best-effort as everywhere else. |

---

## Go live, in order

1. Deploy `firestore.rules` and `storage.rules`; grep the live rules for
   `cf_campaigns` and `cfCountersHeld`.
2. `FIREBASE_SERVICE_ACCOUNT=… node scripts/seed-invest-demo.js --apply`
   (writes the four samples as real campaigns + `cf_settings/rules`).
3. Open `/skyfund`. Cards paint without sign-in; the calculator quotes.
4. Sign in with any email, pledge $500 → manual mode works without Stripe;
   confirm it from `/skyfund/sponsor` as staff; watch `raised` move.
5. Add Stripe keys + the webhook endpoint; repeat with a test card.
6. In the admin console, "Import / Update Applications" so tenants see
   **Community Investment** in the marketplace palette.

---

## Regulatory note — read before real money

Selling a share of a project's cash flow to the public is an offer of a
security. In the US that goes through a registered intermediary under
**Regulation Crowdfunding** (a funding portal or broker-dealer, with per-
investor limits and Form C), an accredited-only exemption (**Reg D
506(c)**, with verification), or a qualified offering (**Reg A+**). This
codebase is the product experience and the ledger; it is **not** a
registered funding portal. The eligibility rules in `cf_settings/rules`
(`nonAccreditedAnnualCap`, `accreditedRequiredAbove`, `allowedCountries`,
`requireKyc`) are the platform's own floor and are changed from the console
without a deploy — counsel sets the ceiling, chooses the exemption, and
decides whether ClearSky partners with a registered portal or registers.
Until then, keep campaigns in review, or restrict `allowedCountries` and
set `requireKyc: true`. The risk disclosure text on the page is a starting
point, not a reviewed document.

---

## Brand — SkyFund, powered by OMEGA

`brand/` holds the app icon and lockups; `brand/index.html` is the brand
sheet. OMEGA is the brand, SkyFund is the app: the icon is a dawn seen
through the OMEGA glyph (the same path as `clearsky-omega-mark.svg`), the
lockup says "powered by OMEGA" with the platform's neon gradient on navy.

| file | use |
|---|---|
| `skyfund-icon.svg` | master, 1024 viewBox; top bars |
| `skyfund-icon-{1024,512,192,180,32}.png`, `-maskable-512.png` | PWA / launcher / iOS home screen / favicon |
| `skyfund-lockup-{dark,light}.svg`, `skyfund-wordmark-{dark,light}.svg` | headers, decks, documents; text outlined, no fonts needed |

Everything is generated — edit the script, not the files:

```
pip install fonttools uharfbuzz pillow
python3 scripts/skyfund-brand.py --archivo Archivo.ttf --inter Inter.ttf   # SVGs (fonts: see the script header)
# PNGs: render skyfund-icon.svg at 1024 in headless Chromium, crop, downscale with Pillow (LANCZOS)
```

## Test it on a phone — the sandbox

The real storefront, with the Firebase SDK, `/api/invest` and Stripe swapped
for a simulation that lives in the browser (`scripts/skyfund-sandbox/shim.js`).
Sign in with any email, invest through a simulated checkout, fast-forward a
quarter from the **Controls** sheet to see a distribution land. State stays on
the device; nothing touches Firestore, Stripe or ClearSky. The four sample
projects' figures were computed once by the real engine per unit at build
time, so the engine never ships in the sandbox either.

```
node scripts/build-skyfund-sandbox.js [outDir]   # default scripts/out/skyfund-sandbox (gitignored)
```

Publish the output folder anywhere static (a claude.ai Artifact, a Vercel
preview, `python3 -m http.server`) and open it on the phone; "Add to Home
Screen" installs it through the bundled manifest. `scripts/tests/tskyfundsandbox.js`
drives the shim the way the page does and runs in CI.

Layers of testing, cheapest first:

1. **Sandbox on a phone** (above) — every screen and flow, no backend.
2. **Node tests** (below) — the engine, the API end to end, the sandbox shim.
3. **Vercel preview of the branch** — `/skyfund` on the preview host serves
   the real pages against the real Firestore. Cards paint from Firestore or
   fall back to the samples; sign-in works only if the preview hostname is
   in Firebase Auth → Authorized domains; the API needs the env vars above.
4. **Real backend** — the "Go live, in order" steps above, in manual mode
   first (no Stripe), then with Stripe test keys and card 4242 4242 4242 4242.

## Tests

```
node scripts/tests/tinvest.js            # the engine, by hand-worked cases
node scripts/tests/tinvest-samples.js    # sample headlines still match the engine
node scripts/tests/tinvestapi.js         # /api/invest with a stubbed Firestore
node scripts/check-html-scripts.js portals/skyfund/index.html portals/skyfund/sponsor.html
node scripts/check-rules.js firestore.rules
```

All four run in CI through `.github/workflows/tests.yml` (the `t*.js` loop).
