# Demoing the Clean Cell white label

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Written for the Clean Cell CEO conversation. Two ways to run it: one that works
on a laptop in five minutes with nothing deployed, and one that is the real
thing on a real URL. Read **What you are actually selling** first — the demo is
two sales in a trench coat and the order they come in matters.

---

## What you are actually selling

| Step | Account? | What happens | Whose sale |
|---|---|---|---|
| 1 · Size | no | A visitor to cleancell.us types what their utility bill says. A system comes back. | the taste |
| 2 · See it on their lot | no, but named | They type their address. Their own parcel is drawn, with the containers on it, to scale. | the proof |
| 3 · Order | no | They order the batteries. Clean Cell's queue and ours are the same queue. | **battery sale** |
| 4 · Ask about the designer | — | The storefront *describes* the designer and takes an enquiry. It does not link into it. | **platform sale** |
| 5 · Design the site | **yes — approved, active** | The full editor, painted as Clean Cell. | what they bought |

Steps 1–3 are Clean Cell selling batteries on their own website, with our
engine underneath and our name nowhere on it. Step 4 is the part that pays us
twice: **their customers ask us for accounts, and Clean Cell is the one asking
on our behalf.** Step 5 is gated — `omega-editor-gate.js` — because the
designer is the product being sold, not the sample.

The storefront has no link into the editor. That is deliberate and it is the
thing to say out loud in the meeting: *nobody wanders into the platform.*

---

## A · The demo, nothing deployed  ← **use this one next week**

Works offline. No Firebase, no Vercel, no credential, no merge, no DNS.

```
npm run demo
```

Then open **http://localhost:8788/**. That is a walkthrough page with four
links in the order the sale happens — click them left to right in front of
somebody:

| | Route | What it shows |
|---|---|---|
| 1 | `/host` | **Part 1 on their website.** A mock cleancell.us with the storefront embedded, exactly the way their web developer would mount it. Size from a bill, see it on their own lot, place the order. |
| 2 | `/embed/storefront?k=preview` | The same storefront without the frame, for looking closely. |
| 3 | `/desk` | **Part 2 — the design desk they resell.** Site Map + Grid Atlas, Clean Cell-branded, beside the full 41-tool catalogue so you can show the next sale. |
| 4 | `/gate/signed-out` | The door. What somebody without an account is told. Also `/pending`, `/suspended`, `/plan`, `/active`. |

**`/desk` is not a mock-up**, and that is worth saying out loud in the room.
It loads the real `omega-tools.js` catalogue and runs the real
`OMEGATools.isUnlocked()` against the workspace a Clean Cell design customer
actually gets — `toolAccess: ['editor','gridatlas']`. Two tools on the left,
41 on the right, same catalogue and same function. If a tool ever slipped the
allowlist, that page would show it.

What it does **not** do is sign anybody in. The tiles do not open, and the page
says so on screen so you do not have to remember to. The signed-in version
needs Part B.

What is **real**: the storefront page and loader that actually ship, the sizing
engine (`api/_lib/bess-engine.js`), and the site-fit geometry
(`api/_lib/site-fit.js`). The kW, the kWh and the drawing are the numbers the
live endpoints return.

What is **stubbed**: Firestore, the parcel lookup (a fixed ring stands in for
Regrid, so it costs nothing and works on a plane), and every gate. It binds to
127.0.0.1 and authorises nothing — never expose it.

The refusal screens are on `http://localhost:8788/gate/pending` — also
`/signed-out`, `/suspended`, `/plan`, `/active`. Worth showing: the refusal is
the pitch, not an error page.

A route to walk, in order:

1. Enter a bill — say **1,400 kW** peak and **620,000 kWh** a month, four
   months. It sizes 600 kW / 1,250 kWh and offers 3 × CC-C418.
2. Enter an address. The parcel draws, the three cabinets land on it inside a
   15 ft setback with a 20 ft access aisle, and the assumptions are printed on
   the plan.
3. Place the order. It lands in the queue (the terminal logs it).

---

## B · The live demo

Four steps. Only the first needs anyone but you, and none of them needs the
Firebase Admin service-account key.

### 1 · Merge the branch

`claude/white-label-cleancell-usa-st5trq` → `main`. Vercel builds in about two
minutes. Nothing in here is reachable until then, and nothing in here changes
an existing tenant's behaviour: every new gate fails open on a missing record
(see *ABSENT COUNTS AS ACTIVE* in `omega-editor-gate.js`).

### 2 · Publish the Firestore rules

Firebase console → `clearsky-portal` → Firestore → **Rules** → paste
`firestore.rules` from the repo → **Publish**.

Four blocks are new: `embed_keys`, `embed_configs`, `orders`, and
`omega_orgs/{org}/storefront`. Until they are published, those paths are
default-deny and the setup page in step 3 will say so rather than fail
mysteriously.

Also publish `firestore.indexes.json` if the order desk reports a missing
index — two composite indexes on `orders`.

### 3 · Stand the tenant up

Sign in at **https://silmarillion.clearskyomega.com/** with your
`@csebuilders.com` account, then open:

```
https://silmarillion.clearskyomega.com/whitelabel-setup.html?org=cleancell.us
```

It reads `tenants/cleancell/tenant.json` and `tenants/cleancell/products.json`
out of the repo, shows you field-by-field what it is about to change, and
writes four documents when you press Publish:

- `omega_orgs/cleancell.us` — the brand and the `whiteLabel` block
- `omega_orgs/cleancell.us/billing/current` — tier `deluxe`, addons incl. `whitelabel`
- `omega_orgs/cleancell.us/storefront/config` — copy, flags, product list
- `embed_keys/omega_pk_live_…` — the publishable key, minted or reused

It refuses to publish a cost basis, it never touches `tenant_public`, and it
never writes anything that prices the account. The header of the file says why
for each. Every write it makes is one the rules already grant an
`@csebuilders.com` token, so it adds no privilege — it spends privilege you
already have, from a surface where the rules can see who is spending it.

### 4 · The three links

The page prints them when it finishes. They are:

| | |
|---|---|
| The storefront | `/embed/storefront.html?k=omega_pk_live_…` |
| The designer, as Clean Cell | `/editor.html?wlpreview=cleancell.us` |
| A rep's pre-configured link | the designer link plus `&k=…&sku=CC-C418&qty=2` |
| Where it lands | `/orders.html` |

**`?wlpreview=` is how you sign in and see their platform.** `orgId` is the
email domain, so no ClearSky account resolves to `cleancell.us` and there is
otherwise no way to look at a white label you sold. The parameter paints the
page as them — platform name, logo, their batteries leading the guided build —
and pins the data scope to *your* org. A brown bar across the bottom says so
while you are in it, and it is gone the moment you drop the parameter from the
URL. Staff only; a tenant who tries it gets nothing, because the read it
depends on is `isAdmin()` in the rules.

---

## What is placeholder and what is real

**Real**: the sizing, the parcel geometry, the drawing, the order path, the
gate, the white-label paint, the order desk, the hand-off link.

**Placeholder**: the four products in `tenants/cleancell/products.csv`. They are
capacity slots on the standard C&I ladder — a 215 kWh cabinet, a 418, a 1.25
MWh skid, a 5 MWh container — not Clean Cell's datasheet. Every row says so in
its `notes`, the setup page warns in orange about any row that does, and the
storefront prices everything "on request". **Narrate that in the meeting.** A
footprint drawn to scale on somebody's own lot is the most convincing kind of
wrong, and the one thing that would sink this meeting is their CEO recognising
a spec that is not theirs.

The fix takes two minutes once they send a submittal:

```
node scripts/import-products.js --org cleancell.us \
  --file ~/Downloads/cleancell-products.csv \
  --out tenants/cleancell/products.json
```

`docs/product-list-template.csv` is the sheet to send them. The importer owns
the column mapping, the unit conversion (datasheets print mm) and a footprint
sanity check, and it reports what each product *unlocks* rather than how many
rows it read — a product with no `widthFt`/`depthFt` is silently never offered
a site study, and "24 imported" does not tell you that. Re-run the setup page
afterwards; it is idempotent.

**Not set**: the cost basis. `capexPerKwh` / `capexPerKw` on
`omega_orgs/cleancell.us/storefront/config`, by hand, in the Firestore console.
It is their negotiated buy price and `scripts/seed-omega-orgs.js` throws if it
ever appears in the repo. Until it is set the sizer sweeps on generic engine
defaults, which will mis-rank the recommendation for their actual equipment —
fine for a demo, wrong for a live website.

---

## Things that will come up

**"Can we put this on our own domain?"** Yes, and today they sign in on
`silmarillion.clearskyomega.com`. `cleancell.clearskyomega.com` is in their
tenant record but has no DNS — there is no wildcard for `*.clearskyomega.com`.
Attaching it in Vercel is a five-minute job; the embed on cleancell.us itself
works either way, because the loader points at whichever host serves it.

**"Is the key a security problem?"** It is publishable, exactly like a Stripe
`pk_live_`, and it ships in their page source. The header of `api/_lib/embed.js`
is the honest argument: the key is accounting and hygiene, not a boundary. What
actually holds is that nothing confidential is reachable, the pricing and sizing
run server-side and return results rather than inputs, an order is a request
pinned to `status: 'new'` that a human confirms, and there are rate limits.

**"Does our customer see ClearSky anywhere?"** On the storefront, no — the
attribution is `none` there by contract, because their customer is on their
website and there is one company in that conversation. In the signed-in chrome
it says "Powered by ClearSky OMEGA", because their staff know whose platform it
is and the paper has not said otherwise. Both are contract terms, in
`tenants/cleancell/tenant.json`, changed when the paper changes.

**"What if their customer wants the designer?"** They ask, through the
storefront, and it lands in the same order queue marked `interest: 'platform'`.
Whether that customer becomes their own tenant or a collaborator on Clean Cell's
workspace is **not decided** — it is a commercial question about who owns the
customer relationship. It is recorded as open in `tenants/cleancell/tenant.json`
under `_noteFunnel`. Do not improvise an answer in the meeting.

**"Can we edit our own product list?"** Not yet, and the rules say so
deliberately: `products[].listPrice` is what a stranger sees and we are the ones
fulfilling. A self-serve catalogue editor is a real feature and a separate one —
it needs an endpoint that validates a price change, not a rule that waves it
through. See `docs/WHITE-LABEL.md` § Not built yet.

---

Design, architecture and the honest list of what is not built:
`docs/WHITE-LABEL.md`.
