# White-label storefronts — Clean Cell USA and after

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Written 2026-09-18 for the Clean Cell USA arrangement. This is the design, the
runbook, and — in the last section — an honest list of what is not built.

---

## The arrangement being built

> Clean Cell sells. ClearSky fulfils.

Clean Cell is a **battery manufacturer**. They are not trying to sell software
— they are trying to sell more batteries, and the platform is how. So the
funnel matters more than the feature list:

| Step | What the customer does | Account needed? | What it is for |
|---|---|---|---|
| **1 · Size** | Types their bill. Gets kW / kWh. | No | The taste. Anonymous and instant. |
| **2 · See it on their site** | Types their address. Gets their own lot drawn to scale, and drags the yard to where they would really put it. | No (a named lead) | Proof it fits, on their own property. |
| **3 · Order the product** | Confirms and submits. ClearSky fulfils. | No | **Sale one: batteries.** |
| **4 · Ask about the designer** | Sees what the site designer does and asks for an account. | — | **Sale two: a white-labelled OMEGA account,** which Clean Cell helps sell. |
| **5 · Design the site** | The full editor, branded as the manufacturer. | **Yes — an approved, active account** | The product they just bought. |

**The storefront is the taste. The designer is the next sale.**

Steps 1–3 are deliberately open: a manufacturer's customer should be able to
size, see and buy without meeting a form. Step 5 is deliberately shut. Giving
the designer away at the bottom of a storefront funnel sells nothing and puts
strangers inside the platform — `omega-editor-gate.js` is the door.

Step 2 is the one that earns the sale, and it is also the only step that costs
real money — which is why a named lead is the ticket for it (see
**The metered call** below). The spend and the value land in the same place:
every lookup we pay for has already produced a lead for Clean Cell.

A customer on **cleancell.us** does all three without ever seeing ClearSky,
making an OMEGA account, or leaving Clean Cell's website. The order lands in
**our** queue and **we** manage it through fulfilment. Clean Cell's own
engineers, meanwhile, design real projects in the editor and can hand any
design to a customer as a one-click order link.

That is four surfaces, and they are genuinely different problems:

| # | Surface | Who is looking | What it needed |
|---|---------|----------------|----------------|
| 1 | The signed-in workspace | Clean Cell's own staff | The platform renamed. They know whose software it is; the chrome should still say theirs. |
| 2 | The public storefront | Clean Cell's **customer** | A page with no sign-in, framed by their website, with no trace of us. **This did not exist.** |
| 3 | The site study | Clean Cell's **customer** | Their own parcel, drawn, with the system on it. **This did not exist.** |
| 4 | The designer pitch + gate | Clean Cell's **customer**, then ClearSky sales | An enquiry in the same queue, and a door on the editor. **This did not exist.** |
| 5 | The order desk | ClearSky + Clean Cell | A queue, a price, a lifecycle. **This did not exist.** |

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

## 3 · The site study — "show me it on my site"

`POST /api/embed-layout` → `_lib/geocode.js` → `api/parcel.js` →
`_lib/site-fit.js` → an SVG plan the customer can drag.

```
address ──geocode(free)──> lat/lng ──parcel(metered, cached)──> ring
                                                                 │
                                   _lib/site-fit.js ─────────────┘
                                   · project to local feet (x east, y north)
                                   · raster the buildable envelope (setback)
                                   · largest inscribed rectangle  → proposed yard
                                   · pack the footprint, with access aisles
                                   → parcel outline, yard, unit blocks, counts
```

### This is NOT `api/site-plan.js`, and it must not become it

`api/site-plan.js` is the real constrained layout: it places the battery **and
the switchgear** and routes the conduit. It demands a surveyed parcel, a
**confirmed service wall**, reviewed obstacle rectangles and a documented
clearance basis, and it returns `needs_input` rather than invent any of them.

That is correct, and it is exactly why it can never serve a public storefront:
**every visitor would get `needs_input`** and a list of evidence they have
never heard of. Pointing the embed at it would have looked like reuse and
shipped a dead feature.

So the study answers a deliberately weaker question — *does a system this size
plausibly fit in this yard* — and says nothing about where anything goes. If
someone later asks to "just add the conduit route", the answer is no: that is
`site-plan`'s job and `site-plan`'s evidence bar.

### Why a raster and not polygon offsetting

Correct polygon offsetting is a real geometry library, it degenerates on the
self-touching and near-collinear rings that assessor data is full of, and a
subtly wrong inset produces a confident drawing that is wrong by six feet.

A distance raster cannot degenerate: each cell asks "am I inside the ring, and
at least `setbackFt` from every edge?" with an exact point-to-segment
distance. When a parcel is too big to raster finely the grid **coarsens and
says so** (`assumptions.gridCoarsened`), which undercounts rather than
overcounts — so a reader knows which way the error runs.

### The aisle, and the 378 containers

The first packing pass used clearance alone and reported **378 containers on a
3.67-acre lot**. Geometrically exact; physically absurd — nothing could be
delivered, serviced or reached by a fire apparatus, and no authority would
permit it. A storefront that printed it would have been caught by the first
engineer who saw it, and rightly.

Units now pack in **blocks of `rowsPerBlock` rows with an `aisleFt` drive
between blocks** (default: 2 rows, 20 ft). Those are stated on the drawing as
assumptions, not buried in code. They are **not** a code determination —
NFPA 855 separation, the local fire code and the manufacturer's own
installation manual all govern and none is consulted anywhere in the file.

Conservative on purpose: undercounting a yard loses nothing, because a real
engineer refines it. Overcounting sells a system that cannot be installed.

### It draws what they need, and reports what fits

The customer came to see *their* system on *their* lot. Drawing the yard's
maximum instead answers a question nobody asked and, on a large parcel,
produces a wall of two hundred containers that reads as a sales fantasy. So
`unitsDrawn` is capped at what the sizing called for, and `unitsThatFit`
reports the capacity beside it — the genuinely useful second number for
somebody thinking about phase two.

### The customer drags the yard, and the server clamps it

The largest empty rectangle on a lot is very often **the front lawn**. Only
the owner knows that, so the proposed yard is a starting point they drag and
resize, and the study re-runs.

The dragged rectangle is **clamped, never trusted** — a box overhanging the
setback would otherwise let the browser choose its own answer and put a
container in the street. `clampToRaster` erodes from whichever side actually
has a blocked cell, converging on the largest legal rectangle inside what they
asked for. A box whose interior still has a hole (an L-shaped lot) falls back
to the proposed yard rather than being forced.

Dragging re-runs with the **lat/lng**, not the address, so it never
re-geocodes; and it almost always hits the parcel cache, so it is free.

### The metered call, and who pays for it

Everything else on the public surface is free to serve. This one is not:
`api/parcel.js` reaches **Regrid, billed per lookup**. A storefront on the
open internet pointed at a paid upstream with no account behind it is a bill
waiting to happen, and "we'll watch it" is not a control.

Three controls, deliberately different in kind:

1. **A named lead is the ticket.** With `requireContactForLayout` on (the
   default), `embed-layout` refuses without an `orderId` — the receipt from an
   enquiry already filed through `embed-order`. That row carries a name and an
   email. So every lookup we pay for has produced a lead for the tenant.
   Checked against the org (one tenant's order id cannot unlock another's) and
   aged out at 24 h (a receipt is not a permanent free pass).
2. **A daily cap per org**, in a Firestore transaction. Instance memory cannot
   hold a spend limit — every cold start would get a fresh allowance. The
   claim is *inside* the cache-miss branch, so **a cache hit never spends
   somebody's allowance**.
3. **The cache** `api/parcel.js` already keeps at about a metre.

The geocoder is free either way (Census, then Nominatim), so a mistyped
address costs nothing and is answered plainly.

### What the customer is NOT told

The parcel record carries an **owner name and an APN**. Neither is echoed.
This is a public page: telling a visitor who owns a lot they typed the address
of is a different product with a different consent story. Acres, zoning and
county *are* on the drawing, because they are facts about the land rather than
about a person. `scripts/tests/tembedlayout.js` asserts this against a fixture
whose owner field reads `A REAL PERSON WHO DID NOT ASK`, on both the live and
the cached path.

### One implementation of the parcel chain

`embed-layout` calls `api/parcel.js`'s own `lookup` through its `_helpers`
seam rather than carrying a copy of the source order, the timeouts, the county
extents and the "a source that failed is not *no parcel*" rule. Cook County
moved its layer in 2026; a second copy would have drifted, and the drifted one
would have been the one serving the public.

### No map tiles

A satellite backdrop would be more impressive and is a metered per-request API
with a key. The plan view is free to serve, instant, and reads as engineering
rather than marketing — which is the impression that sells a battery. A
backdrop is a deliberate later decision with a cost attached, not an
oversight.

---

## 3b · The guided build — the part that was already there

`editor.html` has a **BESS Guided Build** (Build ribbon → BESS Build, or the
Guided Build chooser → Standard). Pick BTM or FOM, confirm the system, press
*Place Configured System*, and it lays out the whole one-line —

```
BESS → PCS → AC disconnect → transformer → EMS/SCADA → switchgear
     → revenue meter → building / POI          … auto-trenched
```

— skipping the PCS, disconnect or transformer steps when the cabinet already
contains them, and re-routing the one-line accordingly (`getWizSteps()`).
There is also **Full Topology** (source → BESS → EMS → XFMR → utility), DER,
Compute, Level 2 and DCFC.

cleancell.us is on the `deluxe` tier, so this is already unlocked. Nothing had
to be built. One thing had to be **fixed**.

### It was specifying a competitor

`BESS_CATALOG` in `editor.html` ships **29 products from 7 manufacturers** —
Gotion (13), Pytes (5), Canadian Solar (5), Aspen Woods (2), CATL (2),
FENECON (1), Autel (1). The manufacturer field is `value="Gotion"`, and
`omega-bess-catalog.js` sets `DEFAULT_KEY = "gotion"`.

That is the right default for a developer or an EPC, who buys from whoever
quotes best. It is the **worst possible default for a white-labelled battery
manufacturer**: open the guided build on Clean Cell's own platform and it lays
out a Gotion container. We would have handed their sales team a tool that
specs a competitor — and nobody would have noticed until a customer did.

`omega-bess-catalog.js` had already anticipated this in its header — *"An
organisation's own product list still wins"* — but nothing implemented it, and
`editor.html` does not even load that file.

### One product list, not four

`omega-bess-products.js` reads the org's own products and merges them in. It
reads **the storefront list** — the same one an operator already has to fill
for the embed to work:

```
omega_orgs/{orgId}/storefront/config.products[]
        │
        ├─ api/embed-config.js  → the public storefront   (published subset)
        ├─ api/embed-layout.js  → the site study          (widthFt/depthFt)
        └─ omega-bess-products.js → BESS_CATALOG          (full record)
```

Before this a tenant's products could live in four places — `BESS_CATALOG`
(hardcoded, no tenant could add to it), `omega-bess-catalog.js` (published
datasheets, one brand), `equipment/{sku}` (the BOM/RFQ catalogue) and the
storefront list. A manufacturer selling their own product has **one**
catalogue. Fill it once.

### Published vs engineering fields

| Published (reaches the public) | Engineering only (never published) |
|---|---|
| `sku` `name` `blurb` `imageUrl` | `chem` `usableKwh` `durationH` `dcv` |
| `kw` `kwh` `widthFt` `depthFt` | `inverter` `inverterKva` |
| `chemistry` `warrantyYears` `leadTimeDays` | `transformer` `disconnect` |
| `priceMode` `listPrice` | `integrates{pcs,xfmr,disco}` `notes` |

The right-hand column stays private **only** because `api/embed-config.js`
constructs its response key by key. The moment that becomes a spread, a
tenant's inverter selection is on a public web page.
`scripts/test-bess-products.js` asserts each of those field names is absent
from that file.

### `integrates{}` is the one that changes the drawing

`getWizSteps()` **skips** the PCS, disconnect and transformer steps when the
pad already contains them. A container with an internal PCS drawn with an
external one is not a cosmetic error — it is a one-line that would not be
built. Take these from the manufacturer's submittal, never from a guess.

### The merge is additive, and deliberately so

Tenant entries are namespaced by org (`CLEANCELL-CC-2000`) and a shipped entry
is **never removed or overwritten**. A saved project references a catalogue key
by name; re-rendering somebody's existing drawing as a different battery is
worse than a crowded dropdown. Their products are *prepended* to the dropdown
in their own optgroup, so theirs is what a designer reaches first.

If a tenant should not see competitors at all, that is a separate decision and
a separate change — say so rather than implementing it as a side effect here.

### Not the public embed, and not close

The guided build is thousands of lines inside `editor.html`, needs the CAD
canvas, and its placement and topology rules are browser-side. Exposing it
publicly would ship how OMEGA decides a one-line, to anyone who views source.
The site study (§ 3) is the public-safe subset: it answers *does this fit*,
not *where does everything go*.

---

## 3c · Selling the designer, not giving it away

The storefront used to link straight into the editor. That was wrong twice
over: it put strangers inside the platform, and it gave away the thing that is
meant to be **sold**.

So the storefront now **describes** the designer and takes an enquiry. The
lead lands in the same `orders` queue, marked `interest: 'platform'`, and the
Order Desk shows which kind it is and can filter to one.

**One queue on purpose.** A designer-account enquiry and a battery order are
worked by different people, but a second collection means a second desk, and
the second desk is the one nobody checks.

### The gate — `omega-editor-gate.js`

`editor.html` had **no access gate at all**. Anyone with the URL got the whole
designer. The tool registry marks it tier `STANDARD`, which hides the tile in
the portal — and, as `CLAUDE.md` puts it, *"a hidden link is not a gate; a
function that refuses is."*

The rule is: **a signed-in user of an active tenant.** That is enough on its
own, because workspaces are created `pending` and a human at ClearSky approves
them — *"has an account"* already means somebody decided they could have one.

#### It fails OPEN on a missing record, deliberately

`firestore.rules`' `tenantActive()` says it best:

> ABSENT COUNTS AS ACTIVE. Every tenant live today has no `omega_orgs` doc
> until `seed-omega-orgs` runs. A helper that failed closed on a missing doc
> would lock out all seven customers the moment it was consulted.

The same trap is in this gate. Only an **explicit** `pending`, `suspended` or
`cancelled`, or an **explicit** `toolOverrides.editor === false`, refuses. A
failed read also fails open — a designer that refuses on a flaky network is a
support call from somebody who is paying. `scripts/test-handoff.js` runs every
one of those states through `decide()` and mutation-testing confirms that
flipping the absent-record case to fail closed breaks the suite.

#### It is not the security boundary

`firestore.rules` is. Every project read and write is already scoped by
`orgId`, so somebody who bypasses the overlay gets an empty canvas they cannot
keep. **This gate decides who is shown the product** — a commercial control,
and pretending it is more would be the mistake.

#### The refusal is the pitch

A stranger who reaches the editor came from somewhere, usually a
manufacturer's storefront. *"Access denied"* wastes the one moment they are
interested. The screen is white-labelled, says what the designer does, and
offers a way to ask for an account.

### The hand-off link still works — for people who have an account

```
/editor?k=<embed key>&sku=CC-2000&qty=4&addr=4200+W+Industrial+Dr
```

`omega-storefront-handoff.js` still pre-configures the designer from a link:
brand, product, quantity, address, Guided Build open and ready to place. What
changed is that the **public storefront no longer hands one out**. A Clean
Cell rep can send it, or it can ride the welcome email once an account is
live. **The gate decides, not the link.**

`integrates{}` is published for this reason (see the correction note in
`api/embed-config.js`): `getWizSteps()` skips the PCS, disconnect and
transformer steps when the cabinet contains them, and without those flags the
Guided Build draws an external PCS on an all-in-one cabinet.

---

## 3d · Making the editor white-label

`editor.html` now loads `omega-brand.js` and `omega-whitelabel.js`, and
`OmegaWhiteLabel.hydrate()` reads the tenant's own `omega_orgs/{org}` record
after sign-in.

**It does NOT load `omega-tenant.js`, and that is a deliberate, stated
trade.** The tenant runtime brings the *hostname lock*: a page that currently
boots anywhere would start refusing unregistered hosts, including whatever the
site-agent MCP is pointed at. That lock is a real control and the editor
should eventually have it — as its own, separately-tested change, not as a
passenger on a branding one.

So `hydrate()` reads the one document the white label needs, directly. **It
adds branding and removes nothing**; the editor is exactly as reachable after
this as before. Written down here because *"we skipped the security control to
ship the logo"* is the sentence this note exists to prevent.

Two sources, because the editor has two kinds of visitor:

| Visitor | Brand comes from |
|---|---|
| Signed-in tenant user | `OmegaWhiteLabel.hydrate()` → their own org record |
| Anonymous storefront hand-off | `/api/embed-config` → `tenant_public` |

Still ClearSky-branded in the editor: the meta tags, the inline web-app
manifest, and ~25 further literal strings. Tracked in `MERGE.md`.

---

## 4 · The order desk

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

## 4b · The second sale is a two-tool product

Stated by Thomas, 2026-09-19, and it narrows §3c:

> Part 1 is a link that will be a button and live on their site, but will allow
> them to use some basic sizing and design features and then really the goal is
> to place an order. Part 2 is that we want to find a way to get the cleancell
> customers to become omega customers … white label the platform and **only use
> the site map editor and grid atlas** to sell them a design tool that could be
> white labeled for cleancell and hosted on their site.

So the thing being sold is not "an OMEGA account". It is **Site Map + Grid
Atlas**, white-labelled, reached from cleancell.us. Two tools, named:

| He said | Catalogue key | File |
|---|---|---|
| site map editor | `editor` — display name is literally *Site Map* | `editor.html` |
| grid atlas | `gridatlas` | `grid-atlas.html` |

### It needs no new gating machinery

```
omega_orgs/{orgId}/billing/current.toolAccess = ['editor', 'gridatlas']
```

An allowlist that **wins**: checked first in `OMEGATools.isUnlocked()` and
short-circuits, so it cannot be widened by the tier, the addons,
`toolOverrides`, `requiredTools` or `unlockedTools`. The master console has had
a field for it since `admin-console.js` gained one ("blank = whatever the plan
includes"), and `billing/current` is staff-write-only in the rules, so the
customer cannot grant themselves more.

### The bug that made it a landing page rather than a product

`omega-tenant.js` read only `members/{uid}.toolAccess`. `index.html` carries
its own copy of the entitlement merge and *did* read `billing.toolAccess`, so
the restriction held on the dashboard and on no other page — and
`ws.unlockedTools`, computed in `omega-tenant.js`, contradicted it. Worse:
colleagues auto-join as `member` with **no member doc at all**, so for them the
allowlist did not exist. A design customer sold two tools had 41.

Fixed 2026-09-19. `omega-tenant.js` now reads both and **intersects** — a
member list may narrow the product, never name a tool the org did not buy,
because `members/*` is tenant-admin-writable and a union there would be an
escape hatch out of the product.

Also fixed: **absent and empty are different.** `omega-tools.js` tested
`toolAccess && .length`, so `[]` fell through to the tier and showed the tool
unlocked — while `api/fiber-screen.js`, `api/compute-lease.js` and
`effectiveTools()` all read a present-but-empty allowlist as *deny*, and
`tests/fiber-api.test.js` already asserted a 403 for it. A tile that opens onto
a 403 is the wrong direction for a client/server disagreement.
`scripts/tests/ttoolaccess.js` (28 assertions) covers both, and asserts the
product against the real `OMEGATools.catalog()` so tool 43 cannot join it
silently.

### Hosting it on their site

Part 1 (the storefront) is genuinely embeddable: no Firebase SDK, no sign-in,
same-origin iframe via `embed/loader.js` — or, as he describes it, just **a
button linking to** `https://<host>/embed/storefront.html?k=<key>`. The link
form is simpler and avoids iframes entirely; both work and the key is the same.

Part 2 is **a link, not an iframe.** It signs users in, and Firebase Auth in a
third-party iframe is broken by storage partitioning in every current browser.
The honest shape is a button on cleancell.us pointing at a Clean Cell-branded
host — `cleancell.clearskyomega.com`, or a CNAME they own like
`design.cleancell.us` attached in Vercel. Either way the white label paints
from `tenant_public/{hostname}` before sign-in, which is what §1 is for.

### Still open, and not for us to decide

Whether a Clean Cell-referred customer is **their own tenant** (own `orgId`,
own `billing.toolAccess`) or a **collaborator on Clean Cell's workspace** via
`org_members`. The mechanism above works either way; who owns the customer
relationship is a commercial question. Recorded in
`tenants/cleancell/NOTES.md` under *The funnel* (it was `_noteFunnel` in
`tenant.json`, which the site serves; the notes moved off it on 2026-09-24).

---

## 5 · Looking at what you sold

A white label is the one feature its owner cannot see. `orgId` IS the email
domain, so the only accounts that resolve to `cleancell.us` are Clean Cell's,
and ClearSky has no mailbox there. Before this, demonstrating, reviewing or
supporting a white label meant signing in as the customer or editing their
data — and CLAUDE.md already forbids the second.

**`?wlpreview=<orgId>`** on any signed-in page paints it as that tenant:
platform name, logo, accent, and their own batteries leading the guided build.

It **changes the paint and never the scope**, and that is enforced rather than
promised. `OmegaWhiteLabel.hydrate()` reads the previewed org's record for
presentation keys only and pins `CLEARSKY_CONFIG.tenant.orgId` to the
signed-in org. That line matters most on `editor.html`, which has no
`omega-tenant.js` and so is where `tenant.orgId` is *born*: written the obvious
way, the preview would silently move every project read, layout write and
`toolData` key into the customer's workspace. Nothing would throw. The page
would look right. `scripts/test-wl-preview.js` mutation-tests exactly that
line, on both the born-here and already-resolved cases.

The gate is Firestore, not the browser: preview works by reading
`omega_orgs/{other org}`, which is `isAdmin()`. A tenant who finds the
parameter gets a permission error and no preview. The `adminDomains()` check in
`omega-whitelabel.js` decides whether the *banner* and the messaging are right
for the person reading them; it is not the control.

It is deliberately **not sticky** — URL only, no sessionStorage, no cookie —
and a brown bar across the bottom names the previewed org, names the org that
still owns the data, and says how to leave. Nobody can be left in a preview
they have forgotten they are in.

### The setup page

`whitelabel-setup.html?org=<orgId>` is the last mile: it turns
`tenants/<slug>/tenant.json` plus `tenants/<slug>/products.json` into a live
storefront, from a ClearSky staff browser, with no service-account key.

Every write it makes is one the rules **already** grant an `@csebuilders.com`
token — `omega_orgs/{org}`, `billing/current`, `storefront/config`,
`embed_keys/{key}`. It adds no privilege; it spends privilege that exists, from
a surface where the rules can see who is spending it. It shows a field-by-field
diff before writing, merges rather than clobbers, reuses an existing active
embed key rather than minting a second, and refuses outright if the tenant file
carries a cost basis.

What it does **not** write, on purpose:

- `tenant_public/{hostname}` — the world-readable pre-sign-in mirror. That
  write needs the one allowlist in `api/_lib/whitelabel.js`, a browser page
  cannot `require()` it, and a hand-kept second copy would have the open
  internet as its blast radius. Stays with `scripts/seed-omega-orgs.js`.
- `amountDue`, `paymentLink`, `stripeCustomerId`, `lastPaidAt`. The page
  configures a product; it does not price an account.
- `capexPerKwh` / `capexPerKw`, ever.

`scripts/seed-embed-key.js` remains canonical for rotating a key, tightening
origins on a live one, disabling one and listing them; its header records why
browser minting is a second sanctioned path rather than a walk-back.

The operator runbook for a demo is `docs/DEMO-CLEANCELL.md`.

---

## Runbook — standing up Clean Cell

Nothing below is done by committing this branch. Each step is a decision.

Short version, no credential required: merge → publish `firestore.rules` from
the Firebase console → open `whitelabel-setup.html?org=cleancell.us` signed in
as staff → press Publish. Steps 4 (cost basis) and 6 (env) below still need
doing by hand. `docs/DEMO-CLEANCELL.md` walks it.

### Their product list

They send a spreadsheet; you import it:

```bash
node scripts/import-products.js --org cleancell.us --file cleancell.csv
#   dry run + a readiness report
FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" \
  node scripts/import-products.js --org cleancell.us --file cleancell.csv --apply
```

`docs/product-list-template.csv` is the sheet to forward to them. The report
counts **what each product unlocks**, not how many rows parsed:

```
   12  orderable on the storefront
    9  drawable on a site study and in the designer   ← 3 missing widthFt/depthFt
    7  with a stated integration answer               ← 5 will draw an external PCS
    2  showing a public list price
```

Three things it refuses or flags, because each fails silently otherwise:

- **Millimetres in a feet column.** Every container datasheet prints mm —
  Gotion's is 6058 × 2438. Pasted straight in, that is a 6,058 ft battery and
  the site study confidently reports that nothing fits on three acres. There
  is a `dimUnits` column (`ft`/`in`/`mm`/`m`/`cm`) and a plausibility check
  after conversion; an implausible footprint is refused, never drawn.
- **Blank integration flags.** Blank means *nobody answered*, not *external*.
  It imports, and it is reported, because `getWizSteps()` skips the PCS,
  disconnect and transformer steps only when told the cabinet contains them.
- **A cost basis.** A `capexPerKwh` column is a hard stop — a supplier's own
  sheet is exactly where one turns up. `listPrice` is fine; that is a number
  the tenant chose to print in public.


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

# 5 · The products. Nothing is orderable until real SKUs are published, and
#     nothing is DRAWABLE without a footprint — widthFt/depthFt are required
#     for the site study. There is no default footprint on purpose: a made-up
#     size drawn to scale on somebody's own lot is the most convincing kind
#     of wrong, so a product without one is simply not offered a study.
#     omega_orgs/cleancell.us/storefront/config.products = [ { sku, name,
#       kw, kwh, widthFt, depthFt, priceMode, listPrice, leadTimeDays, … } ]
#
# 5a · The site-study geometry, if Clean Cell's installation manual differs
#      from the defaults (15 ft setback, 5 ft between units, 20 ft aisle
#      every 2 rows). These live in tenant.json — they are assumptions, not a
#      cost basis, and a change to one should show up in a diff.
#        setbackFt, clearanceFt, aisleFt, rowsPerBlock
#
# 5b · dailyParcelCap (default 40). The hard per-day stop on the metered
#      parcel lookup. Raise it once the funnel is measured, not before.

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
- **Payment on the PUBLIC path.** An embed order is a request, and stays
  one. Money enters once a tenant prices it under Omega Logic
  (`api/_lib/logic-workflow.js`): QuickBooks installment invoices, a
  five-minute cron reconciling them, and the works order raised on a
  verified deposit. Nothing about money ever runs in a browser.
- **Per-tenant `frame-ancestors`.**
- **The editor's "publish an order link" button.** `api/order-link.js` works
  and is callable; nothing in `editor.html` calls it yet.
- **Address validation** beyond the geocoder's own match. The order's address
  is a free string a human reads; the STUDY's address is geocoded, and its
  matched form is shown so the customer can see what we looked up.
- **Buildings, drives and easements on the plan.** The study rasters the
  parcel and the setback, and nothing else. It does not know where their
  building is — which is precisely why the customer drags the yard, and why
  `unverified` says so in as many words. OSM footprints are free and would
  help; they are also unverified geometry that would make the drawing look
  more authoritative than it is, so it is a deliberate decision rather than a
  missing feature.
- **A satellite backdrop** under the plan. Metered, keyed, and a real
  decision — see § No map tiles.
- **The value stack in the embed.** `embed-size` will show an annual saving
  off the customer's own tariff when `showEconomics` is on. The full dispatch
  and revenue model (`omega-value-stack.js`, `valuestack.html`) is not on the
  public surface and should not be: it is the most valuable thing in the
  platform and it is what the signed-in product is for.

---

## After the sale: the buyer portal

Everything above is how a stranger becomes an order. What happens to that
person afterwards — signing in, seeing their order history and its live
status, and the terms the tenant set for them — is designed separately in
**`docs/CUSTOMER-PORTAL.md`** (2026-09-20).

Three things from it are worth knowing here, because they constrain this
document's surfaces:

- **A buyer is a third identity class**, neither staff nor tenant member. This
  resolves the `_noteFunnel` question as *neither* — a buyer gets a portal,
  not a workspace, and becoming a tenant stays a later event with its own
  commercial trigger.
- **The buyer creates their own record; the tenant enriches it.** The funnel
  above is *no account needed, order anyway*, so a portal that required the
  tenant to provision somebody first would contradict it. They sign in, their
  orders are claimed by verified email, they type their own details, and the
  tenant sets terms afterwards. Terms are an overlay, never a prerequisite.
- **A buyer never reads `orders/{id}`.** The document carries `pricing`,
  `cost`, `margin` and `tenantPricing`, and rules hide documents rather than
  fields, so the portal reads through an endpoint that projects key by key —
  the same rule `api/embed-config.js` already lives under.
- **The address bar is part of the white label.** A tenant-owned subdomain
  CNAME'd to the same Vercel project is the answer; framing the authenticated
  portal to disguise the URL is not, and `X-Frame-Options: SAMEORIGIN` on
  everything but `/embed/` (see § Clickjacking) is why.


### Packaged workspace presentation (Phase 3, disabled pending rollout)

When billing/current.packaged is true, the server modules projection governs
editor tools. The legacy bess-lite presentation filter no longer competes
with project focus: All tools restores every owned tool, while seven project
types prioritize relevant commands. Existing drawings remain mounted.
A staff package preview changes presentation only; it does not change the
resolved organization, customer records, module purchases or billing dates.


### Packaged billing (Phase 4, disabled pending rollout)

`modules[]` remains the entitlement source. The admin tenant record uses one
shared menu for staff selection and customer preview. Package changes are
server-priced and reviewed before activation; QuickBooks payment evidence
controls paid access. The private billing profile never reaches tenant_public,
and exemption certificates are staff-only. Approval starts the one capped
trial, with first billing at its end and recurring dates anchored to signup.
Annual prepay excludes transformation credit. Unpaid work stays readable;
project/tool-data writes and project uploads are payment-gated. Legacy buyer
Editor Lite remains a separate product. See PACKAGING-PHASE-4-VALIDATION.md
for fixture evidence and outstanding real-sandbox acceptance.
