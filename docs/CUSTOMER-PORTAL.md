# The buyer portal — accounts, terms and order status for a tenant's customers

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Decided 2026-09-20. This is the design; nothing in it is built yet. Read
`docs/WHITE-LABEL.md` first — this sits on top of it, and the storefront
described there is the thing that creates the orders this portal reads.

---

## 1. A buyer is a third kind of identity

OMEGA has had two until now:

- **Staff** — `omega_staff/{uid}`, `isOmegaStaff()`.
- **Tenant members** — keyed by email domain. `userOrg()` is literally
  `orgAlias(request.auth.token.email.split('@')[1].lower())`.

A Clean Cell customer is neither, and trying to make them one of the two is
where this design would go wrong. **A buyer is a person with orders.** They get
a portal, not a workspace.

This RESOLVES the question recorded in `tenants/cleancell/tenant.json` under
`_noteFunnel` — *"whether a Clean Cell-referred customer becomes their own
tenant or a collaborator on Clean Cell's workspace via org_members."* The
answer is **neither, at first**. Becoming a tenant is a later, separate event
with a commercial trigger (§6), not something that happens because somebody
bought a battery.

### Why not just give them an orgId

The live rule is:

```
match /orders/{orderId} {
  allow read: if signedIn()
              && (resource.data.get('orgId', '') == userOrg() || … || isAdmin());
  allow create, update: if false;
  allow delete: if false;
}
```

An order's `orgId` is the TENANT's (`cleancell.us`). So:

- Resolve a buyer to `cleancell.us` and **they can read Clean Cell's entire
  order queue** — every customer, every price.
- Resolve them to their own email domain and they read nothing.

Neither is a portal. The join is the **verified email on the order**, and it
is never an org.

### Why the buyer must never read `orders/{id}` at all

The order document carries `pricing`, `cost`, `margin`, `tenantPricing`,
`fulfilment`, `provenance`, and a `history[]` stamped with staff emails.

**Firestore rules hide documents, not fields.** This is the same constraint
already written up for `tokenHash` in `firestore.rules.plant.addendum`. There
is no shape of read rule that returns the order without the margin in it.

So the portal reads through an endpoint that builds its response **key by
key** — the pattern `api/embed-config.js` established and which that file's
header warns must never be replaced with a spread. A buyer reading ClearSky's
cost basis and Clean Cell's margin off their own order page ends the
partnership; this is the only thing standing between those two outcomes.

---

## 2. The buyer record

```
omega_orgs/{orgId}/buyers/{emailLower}
  email, name, company, phone
  uid                 stamped on first sign-in; audit only, never the key
  plan                'free' | 'designer'
  status              'active' | 'suspended'
  terms {
    netDays, discountPct, priceList, creditLimit, poRequired, notes
  }
  termsSource         'manual' | 'salesforce'
  termsUpdatedAt, termsUpdatedBy
  createdAt, lastSeenAt
```

**Keyed by lowercased email, not uid**, for the same reason
`org_members/{emailLower}` already is: Clean Cell must be able to set a
customer's terms BEFORE that person has ever signed in. A uid-keyed record
cannot exist until the account does, which would mean no terms on the first
order — exactly when they matter.

**The record lives under the tenant, not globally.** A buyer's relationship is
with Clean Cell, not with OMEGA. The same person buying from two OMEGA tenants
gets two buyer records, and that is correct rather than a duplication bug:
their terms with Clean Cell are not their terms with anybody else.

Rules: `allow read, write: if isTenantAdmin(orgId) || isOmegaStaff()`. The
buyer never reads this collection directly either — their own view is
projected by the endpoint, same as orders.

### Terms are a field, not an integration

`termsSource` exists so a Salesforce sync can write this record later without
a schema change. **Do not build a Salesforce connector on spec.** Ship the
field and the manual admin UI; add `POST /api/buyers-sync` when there is a
real Salesforce instance to point it at and somebody has said which object
maps to which field.

---

## 3. The surfaces

`/portals/customer/` — a fourth product surface, sibling to the existing
`/portals/finance/`.

| Page | Who | What |
|---|---|---|
| `portals/customer/index.html` | a buyer | Sign in, orders, status, documents, terms |
| `portals/customer/admin.html` | Clean Cell admin, ClearSky staff | Manage buyers, terms, plan |
| `api/my-orders.js` | a buyer's token | Projects orders key by key |
| `api/buyers.js` | tenant admin / staff | CRUD on the buyer record |

### This page must NOT load `omega-tenant.js`

The tenant boot path derives an org from the email domain, and
`api/_lib/public-domains.js` refuses public providers outright. A customer on
Gmail would be bounced to `/start.html` and asked to create a company
workspace. Wrong door entirely, and a confusing one.

The portal signs in with Firebase Auth and resolves **branding only** from the
hostname. It never resolves a workspace.

### `email_verified` is the entire security model

It appears **nowhere in `firestore.rules` today** — this is the first place it
would be load-bearing. Without it, anyone registers `bob@bigcustomer.com` with
a password account and reads Bob's orders. `api/my-orders.js` refuses an
unverified token, flatly, before it touches Firestore.

Auth: **email magic link, plus Google.** No password to forget, works for any
address, and the email is verified by construction.

### Both axes, always

Every query is scoped by `orgId` (resolved from the HOSTNAME, never the
request body) **and** `customer.email` (from the verified token). Without the
first, a buyer who also purchased from another OMEGA tenant sees that order on
Clean Cell's branded portal.

Composite index required: `orders` on `orgId ASC, customer.email ASC,
createdAt DESC`.

---

## 4. What the customer sees: milestones, not internals

The internal lifecycle in `api/orders.js` is:

```
new · confirmed · quoted · accepted · in_fulfilment · shipped · complete · cancelled
```

Do not show these raw. `quoted` and `accepted` are commercial states, and
`in_fulfilment` tells a customer nothing.

Equally, **do not pipe `plant_units.at` straight through.** It is tempting —
the scan data is right there — but the routing is Clean Cell's internal
process, and whether their customers see bench-level detail is Clean Cell's
commercial decision, not ours.

The public ladder, tenant-configurable:

| Milestone | Computed from |
|---|---|
| Received | `status: new` |
| Confirmed | `confirmed`, `quoted`, `accepted` |
| In production | `in_fulfilment` + plant station in kit…elec |
| Inspection & test | plant station in bms, eol, qa |
| Ready to ship | plant station in pack, ready |
| Shipped | `shipped`, `complete` |
| Cancelled | `cancelled` |

The valuable part is not the label. It is that **the ship date moves on its
own** as scans arrive, so nobody at Clean Cell is emailing reassurance and no
customer is phoning to ask.

---

## 5. What a buyer may do

**Read**: their orders, milestones, documents (invoice, DG paperwork, test
certificate), and their own terms as Clean Cell set them.

**Request a cancellation** — a message on the order, never a state change.
`api/orders.js` says *"the tenant may always cancel their own"*; a buyer's
cancel is not that. Their money, but Clean Cell's production slot, and a
half-built unit is not a thing a web form should be able to abandon.

**Not**: reprice, reorder at an old price, change terms, see another buyer's
anything, or read any order they are not the named customer on.

**Payment: phase two.** Order-to-cash is designed around Stripe milestones and
wiring "pay deposit" into the portal is a natural fit, but it is a real scope
step with a merchant-of-record question attached. Read-only portal first.

---

## 6. Plan status, and where the platform sale lands

`plan: 'free' | 'designer'` on the buyer record.

`free` is everybody who ever ordered a battery. `designer` is a buyer Clean
Cell has sold the white-labelled editor to — and flipping that flag is the
moment the `_noteFunnel` question finally has to be answered, because a
designer subscriber needs an actual workspace and `omega-editor-gate.js`
requires *a signed-in user of an ACTIVE tenant*.

**Still open, deliberately:** whether flipping to `designer` provisions them
their own tenant (auto-approved, or pending as today) or adds them to Clean
Cell's workspace via `org_members`. The buyer record is the COMMERCIAL record;
the workspace is the PRODUCT record; they link by uid and the decision only
binds at the moment of the upgrade. Do not improvise it at build time.

Commercially, this is the best lead list in the business: a buyer with three
orders in their history is the most qualified designer prospect Clean Cell
will ever have, and the portal is where that pitch belongs.

---

## 7. Super admin

Already exists; nothing new is needed.

- `isOmegaStaff()` — admin or rep, reads across tenants.
- `isOmegaAdmin()` — admin only. Deliberately NOT rep: assigns roles and
  prices work.
- `?wlpreview=<orgId>` paints a staff session as one tenant. It **changes the
  paint and never the scope** — `scripts/test-wl-preview.js` mutation-tests
  the one line that would turn it into impersonation.

ClearSky super-admin access to Clean Cell's buyer console is therefore a rules
clause (`|| isOmegaStaff()`), not a feature.

---

## 8. The URL, and what "masking" can honestly mean

A white label whose address bar says `clearskyomega.com` is not a white label.
There are three real answers and one that looks like an answer.

**1 · The storefront is already solved.** `embed/loader.js` injects an iframe
into their page. The address bar says `cleancell.us` because the visitor IS on
`cleancell.us`; our origin appears only in view-source.

**2 · A subdomain they own — the recommendation.** `platform.cleancell.us`
CNAME'd to the same Vercel project. They add one DNS record, we attach the
domain and write `tenant_public/{hostname}`. Their domain end to end, in the
address bar, in bookmarks, in the share sheet. This is what a white label
means and it costs nothing extra — `CLAUDE.md` already describes the setup as
one Vercel project plus attached customer domains.

**3 · A path on their apex — if their host allows it.** `cleancell.us/portal`
served from Vercel via a proxy rewrite (Cloudflare Workers, a Netlify 200
redirect, or a Vercel rewrite if their marketing site is also on Vercel).
Genuinely gives their apex domain in the address bar. Depends entirely on what
their site is hosted on, so it is a conversation with their web team, not a
change here.

**What cannot be done: framing the portal to fake the URL.** Two reasons, both
hard:

- `vercel.json` sets `X-Frame-Options: SAMEORIGIN` on everything except
  `/embed/`. That exception is deliberate and narrow; the storefront is
  public and stateless, the portal is neither.
- Browser storage partitioning breaks Firebase Auth in a third-party frame.
  A sign-in that works in Chrome today and silently stops working after an
  update is worse than an honest subdomain.

It is also worse white-labelling: a framed app cannot be bookmarked, cannot be
deep-linked from a "your order has shipped" email, and shows the wrong thing
in the address bar on mobile.

---

## 9. The one pipeline

Everything in this partnership is one chain, and each link already exists or
is designed:

```
storefront (their site)  →  order  →  deposit  →  works order
        →  scans at ten benches  →  milestone  →  the buyer's portal
```

No human re-keys anything between those arrows. The portal is the last link:
it is where the scan a technician made at a bench at 06:40 becomes the reason
a customer does not phone anybody.

---

## 10. Build order

1. `api/my-orders.js` + `portals/customer/index.html` — read-only, magic-link
   auth, milestones. The whole value is here.
2. `omega_orgs/{org}/buyers/{emailLower}` + rules + `api/buyers.js` +
   `portals/customer/admin.html` — terms and plan, manually set.
3. Documents on the order (invoice, DG paperwork, FAT certificate).
4. Cancellation requests.
5. Stripe milestone payment from the portal.
6. `POST /api/buyers-sync` for Salesforce, when there is one to point at.

## What is NOT built

All of it. This document is the design, written before the code on purpose,
because §1 and §8 are both decisions that are cheap now and expensive after
somebody has shipped the obvious version.
