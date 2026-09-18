# White-label storefronts — Clean Cell USA and after

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Written 2026-09-18 for the Clean Cell USA arrangement. This is the design, the
runbook, and — in the last section — an honest list of what is not built.

---

## The arrangement being built

> Clean Cell sells. ClearSky fulfils.

A customer on **cleancell.us** sizes and orders a battery system. They never
see ClearSky, never make an OMEGA account, and never leave Clean Cell's
website. The order lands in **our** queue and **we** manage it through
fulfilment. Clean Cell's own engineers, meanwhile, design real projects in the
editor and can hand any design to a customer as a one-click order link.

That is three surfaces, and they are genuinely different problems:

| # | Surface | Who is looking | What it needed |
|---|---------|----------------|----------------|
| 1 | The signed-in workspace | Clean Cell's own staff | The platform renamed. They know whose software it is; the chrome should still say theirs. |
| 2 | The public storefront | Clean Cell's **customer** | A page with no sign-in, framed by their website, with no trace of us. **This did not exist.** |
| 3 | The order desk | ClearSky + Clean Cell | A queue, a price, a lifecycle. **This did not exist.** |

---

## 1 · Renaming the platform

`omega-brand.js` already paints the tenant's name and logo. What it could not
do was change what the *platform* is called: `platformName()` read one key off
`/config.js` and every deployment answered `ClearSky-OMEGA`.

**`omega-whitelabel.js`** owns that one question. It loads directly after
`omega-tenant.js` and reads a block off the tenant record:

```js
omega_orgs/{orgId}.whiteLabel = {
  enabled:         true,
  platformName:    'Clean Cell Power Platform',
  shortName:       'Clean Cell',          // chips, badges, tight spaces
  attribution:     'powered-by',          // 'powered-by' | 'none'
  attributionText: 'Powered by ClearSky OMEGA',
  markUrl:         '/tenants/cleancell/mark-white.png',
  supportEmail:    'support@cleancell.us',
  accent:          '#2B5FA8',
  embed:           { … }                  // surface 2, below
}
```

It wraps `OmegaBrand.platformName`, so every existing caller — `paintAuth`'s
`#auth-platform`, `paintTitle`'s fallback, anything written against the
documented API — gets the white-labelled answer with no edit. Same technique
`omega-tenant.js` uses on `OmegaBrand.resolve`.

**The block is mirrored to `tenant_public`,** because the first screen a
tenant's user sees is the login page and there is no user yet to authorise an
`omega_orgs` read. A door that says ClearSky-OMEGA has already given the game
away. Only the allowlisted subset crosses — `api/_lib/whitelabel.js` is the
single place that decides which keys, shared by all three writers.

### Attribution is a contract term

`attribution` defaults to **`'powered-by'`** and that default is deliberate.
Removing our name from a product we operate is something a customer *buys*; it
must never happen because somebody forgot a field. Set `'none'` only for an
account whose agreement says so.

For Clean Cell the two surfaces differ on purpose: `'powered-by'` on the
signed-in chrome, `'none'` on the public storefront. Their staff know whose
platform it is; their customer is on their website, where there is only one
company in the conversation.

### What this cannot reach, and why we are not pretending otherwise

Text baked into a tool's markup or into a PDF it draws. `grep -c 'ClearSky'`
across the tool estate finds dozens. Sweeping every text node would mean
rewriting arbitrary customer content on every render — a worse bug than the
one it fixes.

So a tool opts in:

```html
<span data-omega-platform>ClearSky-OMEGA</span>
<span data-omega-attribution></span>       <!-- filled, or hidden -->
<img data-omega-mark src="/clearsky-omega-mark-white.png">
```

Images whose `src` *is* the ClearSky mark are swapped without opting in, since
that pattern is unambiguous. Everything else is converted as it is touched.

**`editor.html` is the big one and is only half done.** Its `poweredByLine()`
— the attribution on twelve exports, including the proposal a designer hands a
customer — now honours the block. Its other ~29 strings, its `<title>` and its
own independent brand resolver (`CS_TENANTS` / `CS_BRAND`, ~line 69840) do
not, because that page loads neither `omega-brand.js` nor `omega-tenant.js`.
Wiring the runtime into a 162k-line page needs its own test pass; it is tracked
in `MERGE.md`. **Until then, a Clean Cell designer's editor chrome still says
OMEGA.** Their exports do not.

---

## 2 · The public storefront

### The shape

```
cleancell.us  ──<script src=…/embed/loader.js data-key=omega_pk_live_…>
                    │
                    └─ injects an <iframe> ──> OUR origin
                                                /embed/storefront
                                                    │  same-origin fetches
                                                    ├─> GET  /api/embed-config
                                                    ├─> POST /api/embed-size
                                                    └─> POST /api/embed-order
```

**Why an iframe and not inline markup.** Their CSS would style our checkout;
our CSS would move their nav; their analytics tags would read the customer's
typed address. And a cross-origin iframe is a real boundary — script on their
page cannot reach inside it. It also means our fetches are **same-origin to
us**, so the storefront needs no CORS grant and no credential crossing an
origin. (`api/_lib/admin.js`'s CORS allowlist covers only
`*.clearskyomega.com`, `*.csebuilders.com`, localhost and `*.vercel.app` —
deliberately unchanged. A design that needed it widened would have been the
wrong design.)

### The embed key, and what it is honestly worth

```
embed_keys/{omega_pk_live_…}  { orgId, label, active, origins[], scopes[] }
```

The key is **publishable**. It ships in the page source of a public website,
exactly like a Stripe `pk_live_` key. The parent origin the page reports is
likewise a client-supplied claim — anyone can `curl` the endpoint with any
header they like.

**So the key is not a security boundary, and the code does not pretend it is.**
Read the header of `api/_lib/embed.js` before changing anything here. What
actually holds:

1. **Nothing confidential is reachable.** An embed request can read public
   branding and a product list the tenant chose to publish. There is no
   endpoint that would return a project, a member, a price input, a margin or
   another tenant — not "there is one but it checks a flag".
2. **Pricing and sizing stay server-side and return results, never inputs.**
3. **An order is a request, not a transaction.** `status` is pinned to `new`,
   no payment is taken, and the browser cannot set price, status or fulfilment
   fields. The worst a forged call achieves is a junk row in a queue somebody
   reads — the same thing a contact form achieves.
4. **Rate limits**, so it does not become a million of them.

The origin allowlist and the key are therefore **accounting and hygiene**: they
say which installation a lead came from, they let us switch one site off
without touching the others, and they stop a copied snippet running somewhere
we have never heard of. Real value, correctly labelled.

Matching is on a **dot boundary**: `.cleancell.us` admits `www.cleancell.us`
and refuses `evilcleancell.us`. `scripts/test-whitelabel.js` asserts exactly
that, because the obvious `endsWith` implementation admits both.

### Rate limiting, in two places on purpose

| Where | What | Why there |
|---|---|---|
| `_lib/embed.js` | per-key per-minute, **in instance memory** | Reads. Cheap. The real ceiling is limit × warm instances, which is fine for the case that actually happens: one broken loop on one page. |
| `embed-order.js` | per-org per-UTC-day, **in a Firestore transaction** | The call with a consequence. Every cold start would otherwise get a fresh allowance. |

### What is not in the browser

`CLAUDE.md`'s IP rule at its strictest, because the caller is a stranger with
our page in front of them. `embed-size.js` runs `_lib/bess-engine.js` and
returns kW, kWh, duration and the duration sensitivity band.

It **never** returns `capexPerKwh`, `capexPerKw`, or anything derived from
them. That is not squeamishness: the engine's sweep *chooses* a recommendation
by economics, so it needs an installed-cost assumption — which is the tenant's
negotiated buy price. `summarize()` hands back `capex` and `paybackYr`, and one
division inverts either straight back to it. So the engine gets the number, the
response does not, and the sensitivity band is **rebuilt with the capex column
dropped** rather than forwarded.

Where a storefront *does* show payback, it is computed from the **published
list price** of the matched product — a number the tenant already prints in
public — and `priceBasis` on the response says which happened.

### Clickjacking and `X-Frame-Options`

`vercel.json` sent `X-Frame-Options: SAMEORIGIN` on `/(.*)`, which would have
blocked the embed outright. The global rule is now `/((?!embed/).*)` and
`/embed/(.*)` gets the same hardening minus the frame deny.

Per-tenant `frame-ancestors` would be better and a static header file cannot
express it. It is not load-bearing: the storefront holds no tenant data until
the API answers, and the API's gate is the key plus the checks above. If this
ever needs to be real, serve the page through a function that sets
`frame-ancestors` from the key's `origins`.

---

## 3 · The order desk

```
orders/{orderId}
  orderNo      'CLEA-20260918-A1B2C'    human reference
  orgId        'cleancell.us'           WHOSE CUSTOMER. Their relationship.
  fulfilledBy  'clearsky'               WHO DELIVERS. The deal.
  status       new → confirmed → quoted → accepted → in_fulfilment
                   → shipped → complete | cancelled
  customer     { name, company, email, phone, address{}, notes }
  system       { kw, kwh, durationH, basis }
  items        [ { sku, name, qty, kw, kwh, listPrice } ]
  pricing      null until a human sets it
  provenance   { embedKeyId, claimedOrigin, originAllowlisted, userAgent }
  history      [ { at, by, what } ]      append-only
```

`orgId` and `fulfilledBy` are **stamped server-side** from the tenant record,
so no request can file an order into another workspace or reassign who fulfils
it.

`orders.html` is one page with two seats, decided by email domain exactly as
the rules decide it — no toggle, because a page that let you choose would be a
page whose UI disagrees with the server about who you are.

| | ClearSky | The tenant |
|---|---|---|
| Read | every storefront | their own rows |
| Price | ✅ | ❌ — their margin sits on top of our number; two writers make an unreconcilable invoice |
| Advance status | ✅ | ❌ |
| Cancel | ✅ | ✅ — their customer, their right to call it off |
| Note / assign | ✅ | ✅ |

**Reads come straight from Firestore; every write goes through
`api/orders.js`.** The rules can express "your own org's rows, or all of them
if you are staff" precisely. They *cannot* express "only ClearSky may price,
but anyone may cancel their own" without encoding a commercial arrangement in
a rules file, where the people who negotiate it will never read it.

**Delete is refused for everyone, including us.** A cancelled order is
`cancelled`. What was asked for and when survives — that is the half a dispute
turns on. Same reasoning as `legal_acceptances` and `fin_applications`.

### The designer's handoff

`POST /api/order-link` turns a project in the editor into a link the customer
can order from:

```
https://cleancell.clearskyomega.com/embed/storefront?k=<key>&c=<configId>
```

It writes a **snapshot** into `embed_configs`, not a pointer to the project.
Three reasons, worst first: a project keeps being edited and a link that
silently re-priced itself cannot be honoured; the public path would otherwise
mean reading a project for a stranger; and the snapshot is the evidence of what
was offered. `projectId` is recorded for provenance and never read on the
public path.

Expiry is not optional — default 30 days, capped at 180. A quote with no end
date is a standing offer. Withdrawing sets `revoked`; it never deletes,
because an order already placed against that configuration references it.

---

## Sending domain — the one leak still open

`_lib/mail.js` authenticates as `support@csebuilders.com`. A confirmation email
to Clean Cell's customer would arrive as
**`Clean Cell <support@csebuilders.com>`** and tell them, in the From line,
exactly who is really behind the website they just ordered from. That single
header undoes the whole feature.

So **the customer receipt is off by default.** The page confirms on screen,
which reveals nothing, and the notifications that do go out are internal
(ClearSky fulfilment, plus a row in the tenant's own inbox).

To turn it on, both of these, and in this order:

1. Add the tenant's address under Gmail → Settings → Accounts → **"Send mail
   as"** on the `MAIL_USER` mailbox and complete the confirmation. Gmail
   refuses or rewrites an unverified From — `opts.from` is a way to *use* a
   granted identity, not to spoof one.
2. Set `whiteLabel.embed.mailFrom` and `storefront.emailCustomer: true`.

`M.wlLayout(brand, …)` is the email card with none of our marks — the product
`layout()` prints CLEARSKY-OMEGA in the eyebrow and our address in the footer.
Getting the From line right and then putting our name in the body would be a
wasted precaution.

A per-tenant sending domain with its own SPF/DKIM is the proper fix and is not
built.

---

## Runbook — standing up Clean Cell

Nothing below is done by committing this branch. Each step is a decision.

```bash
# 1 · The tenant record, the white-label block and the storefront config.
#     tenants/cleancell/tenant.json carries all three.
FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" node scripts/seed-omega-orgs.js          # dry run
FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" node scripts/seed-omega-orgs.js --apply

# 2 · Rules and indexes. NOT LIVE UNTIL THIS RUNS.
firebase deploy --only firestore:rules,firestore:indexes
#   then confirm, against the LIVE rules:
#     grep -n 'match /orders' firestore.rules
#     grep -n 'match /embed_keys' firestore.rules

# 3 · The publishable key.
node scripts/seed-embed-key.js --org cleancell.us \
  --origins https://cleancell.us,.cleancell.us \
  --label "cleancell.us main site" --apply
#   prints the two-line snippet for their web developer.

# 4 · The cost basis. BY HAND, in Firestore — seed-omega-orgs.js THROWS if
#     these appear in tenant.json, because it is committed source.
#     omega_orgs/cleancell.us/storefront/config
#       capexPerKwh: <their installed $/kWh>
#       capexPerKw:  <their installed $/kW>

# 5 · The products. Nothing is orderable until real SKUs are published.
#     omega_orgs/cleancell.us/storefront/config.products = [ { sku, name,
#       kw, kwh, priceMode, listPrice, leadTimeDays, … } ]

# 6 · Vercel env: ORDER_NOTIFY=<fulfilment inbox>   (falls back to MAIL_NOTIFY)
```

### ⚠ Hostname

`cleancell.clearskyomega.com` **does not resolve.** There is no wildcard DNS
for `*.clearskyomega.com`, and `budderfly.`, `eastwestenergy.` and `walters.`
are the same. Until it is attached in Vercel, the loader snippet on
cleancell.us loads nothing.

Either attach it, or point the snippet at **`silmarillion.clearskyomega.com`**,
which does resolve. The white label is slightly weaker that way — a customer
who reads the iframe's URL in devtools sees our hostname — so attaching the
tenant hostname is worth doing before launch.

---

## Not built yet

Listed so nobody mistakes any of it for done.

- **The editor's chrome.** ~29 strings, the `<title>`, the web-app manifest,
  and its own brand resolver. Its export attribution *is* done. Tracked in
  `MERGE.md`.
- **A self-serve catalogue editor.** `omega_orgs/{org}/storefront/*` is
  ClearSky-write-only, on purpose: `listPrice` is what strangers see and we
  are the ones fulfilling at it. Giving tenants this needs an endpoint that
  validates a price change, not a rule that waves it through.
- **A tenant sending domain.** See above.
- **Payment.** An order is a request. When that changes it goes through
  `/api/` and Stripe, never a browser.
- **Per-tenant `frame-ancestors`.**
- **The editor's "publish an order link" button.** `api/order-link.js` works
  and is callable; nothing in `editor.html` calls it yet.
- **Address validation / geocoding** on the storefront. The address is a free
  string a human reads.
