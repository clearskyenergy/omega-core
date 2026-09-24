# Omega Logic — the ecosystem map

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Decided 2026-09-24 with Tom Gilmer. This is the map every surface is built
against; the API contracts at the end are what the pages call.

## Who is who

```
ClearSky                      makes Omega Logic (like Intuit makes QuickBooks)
└── an Omega Logic customer   a WORKSPACE: Clean Cell (orgId cleancell.us)
    │                         downloads ONE app — the Omega Logic app
    └── their customers       ACCOUNTS: Amperage Capital, InCharge Energy
        │                     each a company with several people on it
        └── the customer app  the TENANT's app (its name, its icon), one per supplier
```

- **Every Omega Logic customer downloads the same app.** `/office/app` is the
  Omega Logic app, with no company in its address: it opens on "Sign in to
  Omega Logic" (`omega-logic-signin.js`: Google, a sign-in link by email, or
  a password) and `api/logic-workspaces.js` says where this person goes —
  one company straight in, several to choose from (Switch on the company
  line of the header), none said plainly; the ClearSky owner sees every
  workspace. Its icon and name are ClearSky's (the Hex grid Ω, one static
  `/office/app.webmanifest`); the workspace is named inside.
- **Their customers get the supplier's app.** `/portals/customer/app?org=` —
  the tenant's white-label name and icon, one install per supplier.
- Everything the customer does in their app is visible to the supplier in the
  CRM. Nothing is typed twice.

## The hex hub

Both apps open on the HEX HUB (`omega-hexhub.js`): seven cells in a
honeycomb, the way the Ω in the app icon holds seven lit cells. One in the
middle, six around it. A cell is a hub of the business; a badge is what
needs a person. Below the hub, QuickBooks-style panels list what is in each
hub. The desktops show the same hub at the top of their home page.

| | Omega Logic app (the supplier) | Customer app (the supplier's customer) |
|---|---|---|
| centre | **Today** — what needs a person | **Fleet** — their units, sites, where each is |
| ring | Sales · Customers (CRM) · Plant · Deliver · Stock · Money | Size · Design · POs · Pay · Shipping · Warranty |
| tabs | Home · Orders · Customers · Sites · Menu | Home · Orders · POs · Fleet · Account |

## The CRM (the supplier's Customer hub)

Opening a customer opens the ACCOUNT, in sections, the way QuickBooks'
customer hub does:

- **Overview** — money (invoiced, received, balance), open requests, the
  follow-ups due, the latest on the timeline.
- **People & contacts** — the logins on the account (approve, turn off,
  invite, add) and CRM contacts who never log in (name, title, email, phone,
  notes, primary).
- **Activity** — log a call, an email, a meeting or a note against the
  account (and a contact or an order), with an optional follow-up date;
  follow-ups show on Today until marked done.
- **Documents** — upload a contract, a drawing, a datasheet, a site survey;
  choose whether the customer sees it. What the customer uploads from their
  app lands here.
- **Orders & POs** — every order on the account, and *Enter a PO* for this
  customer (the PO sheet with the company chosen).
- **Sites & fleet** — their sites and shipped units, each opening its
  passport.
- **Timeline** — everything, newest first: orders placed, priced, invoiced,
  paid, shipped; POs received; requests asked and answered; people who joined;
  documents; logged activity.

## The customer app (Amperage Capital's)

- **Fleet** — every unit on the account: where it is, the site it runs at,
  its warranty and SLA; *going to*, received, assign, commissioned; add a site.
- **Size** — one site (quick size against the supplier's catalog, or the
  sizer from a utility bill) or a whole **portfolio** (upload a sheet; every
  site screened and sized).
- **Design** — Site Map · Editor Lite, the guided build. The customer
  subscribes monthly or yearly (the white-label product); a trial comes from
  the supplier.
- **POs** — send purchase orders (one or a stack), upload a PO document.
- **Pay** — the account's open invoices with the supplier's pay link.
- **Shipping** — loads on their way: carrier, tracking, where each is.
- **Warranty** — coverage per unit, from when to when, pending until bound to
  a site; ask a warranty question on the order.
- **Account** — the company, its people (the owner adds and approves), terms,
  documents shared by the supplier and their own uploads.

## Desktop

The same hubs and the same data on a computer: the office dashboard
(`omega-logic.html`) and the CRM page (`portals/customer/admin.html`) for the
supplier; the customer portal (`portals/customer/`) for their customer.
Nothing on the desktop is different in kind — it has more room.

## The one paid difference

The only thing a supplier's customer pays the platform for is the **design
tool** (Editor Lite's guided build), monthly or yearly, white-labelled as the
supplier's. Checkout runs on ClearSky's Stripe account with the supplier's
prices (`billing/current.customerEditorLite.monthlyPriceCents` /
`yearlyPriceCents`, set by ClearSky's owner); the webhook grants the ACCOUNT
the entitlement (`customers/{id}.editorLite`, source `provider`), so every
person on it can design. Paying the supplier's share is not built (see below).

## API contracts

All Admin SDK; the rules deny browsers on every path below.

### `api/crm.js` — the supplier's CRM

Who: a member of the workspace (`logic-access` authorize). Owner, admin and
member read and write; a viewer reads; archiving a contact or a document is
an administrator's. ClearSky's owner may open a workspace that is not
switched on yet. A lapsed subscription is refused to everyone else.

```
GET  ?org=&customerId=                 { customerId, company, status, contacts[],
                                         activity[], followUps[], files[], timeline[],
                                         canEdit, canArchive, limited }
GET  ?org=&customerId=&file=<id>       the document (attachment, nosniff)
GET  ?org=&followUps=1                 { followUps[], limited } open across all accounts
POST { org, customerId, action, … }
  contact-save    { id?, name, title, email, phone, notes, primary }
  contact-archive { id }                admin
  log             { type: call|email|meeting|note|task, subject, body, at?,
                    contactId?, orderId?, followUpAt? }
  done            { id }                follow-up or task completed
  file-upload     { file: { name, base64 }, category, note, shared }
  file-share      { id, shared }
  file-archive    { id }                admin
```

- An activity is **open** (`activity[].open`, and on Today) while it has a
  follow-up date or is a task, until it is done. A task with no date is on
  Today from the moment it is logged. `followUps[]` is earliest first, the
  undated last; `followUpAt` may be `null`.
- The order on a `log` must be the account's (stamped for it, or billed to
  one of its people: `B.accountOfOrder`); the contact's name and the order
  number are stored on the entry, so it reads the same after the contact is
  archived.
- A document is judged by its BYTES (`api/_lib/crm.js fileInput`): PDF, PNG,
  JPEG, XLSX, DOCX, CSV, TXT, 2 MB; a plain `.zip` or a renamed executable
  is refused. The same bytes and name from the same side return the stored
  one. `category` is one of contract, drawing, datasheet, site-survey,
  purchase-order (`po` is its alias), invoice, photo, utility-bill,
  warranty, other.
- The **timeline** is derived on every read, never stored: orders placed,
  priced and accepted (one entry when within a minute), invoices issued and
  paid, shipped; POs received; requests asked and answered; people who
  joined, asked, were approved; documents; logged activity and follow-ups
  done; the units bought on the account received, assigned, commissioned
  and confirmed (grouped by day and site); sites added; designs started and
  saved; the design tool's trial and subscription (`omega_audit`
  `buyer-editor-trial` / `customer-editor-lite`, or the current grant).

Stored under `omega_orgs/{org}/customers/{id}/contacts|activity|files`, the
open follow-ups indexed at `omega_orgs/{org}/crm_followups/{customerId__activityId}`
(closed, never deleted), the customer's daily upload count at
`omega_orgs/{org}/crm_upload_usage/{customerId__day}` — its own record,
because a tenant admin may write the customer record and would reset it.
Documents in private Storage `crm/{org}/{customerId}/{fileId}`, served only
by the endpoints, never by URL. Every path is `allow read, write: if false`
in `firestore.rules`; the Storage catch-all already denies `crm/**`. Every
write is audited (`omega_audit`, `crm-*`); nothing is deleted.

### `api/my-files.js` — the customer's documents (verified email, active person)

```
GET  ?org=                    { company, dailyUploads, files[], limited }
                              what the supplier shared + the account's own uploads
GET  ?org=&file=<id>          one of those (attachment)
POST { org, action: 'upload', file: { name, base64 }, category, note }
```

The same records as the CRM: an upload is on the account in the supplier's
CRM the moment it is stored, marked "theirs"; a document the office shares
appears here. Never an office-only or archived one, never another
account's. 20 uploads a day per ACCOUNT (not per person); a duplicate does
not spend one, a failed store does (the allowance bounds attempts).

### Pay links

`logic-office` `invoice-issued` takes an optional `payUrl` for a
tenant-billed invoice — the supplier's own payment page. The ONE check is
`api/_lib/portal.js tenantPayLink()`: https, a named host (not an IP or a
bare name), no user name or password, no spaces or quotes, 1,000
characters; a link that fails is refused with a 400, never dropped. Sent
again with the same number and date: a new link changes it, `null` removes
it, leaving it out keeps it; each change is stored (`payUrl`, `payUrlBy`,
`payUrlAt`) and logged on the order. The customer sees it only on a
tenant-billed invoice that has been issued, and none while a cancellation
is requested or a payment exception is open; QuickBooks-billed invoices
keep QuickBooks' own `intuit.com` link. The pages check the link again
before it becomes an href.

### `api/customer-subscribe.js` — the design tool

```
GET  ?org=        { available, monthlyPriceCents, yearlyPriceCents, currency,
                    status, expiresAt, plan, entitled, canManage }
POST { org, plan: 'month'|'year' [, from:'portal'] }   { url } → Stripe Checkout (subscription)
POST { org, action: 'manage' [, from:'portal'] }       { url } → Stripe billing portal
```

- `available` needs the supplier's Editor Lite on, a price, and
  `STRIPE_SECRET_KEY` on the server. Prices are the supplier's
  (`billing/current.customerEditorLite`, whole cents, set by ClearSky's
  owner through `tenant-billing` from `logic-admin.html`; `null` withdraws a
  plan), sent to Stripe as `price_data`.
- **Any active person** on the account may subscribe (paid by card, the
  grant is the account's). **Manage** — where it is cancelled — is the
  account OWNER's or the person who subscribed.
- One Stripe customer per customer ACCOUNT, never the tenant's own.
  Metadata `{ kind: 'customer-editor-lite', org, customerId, email, plan }`
  on the customer, the session and the subscription — deliberately `org`,
  not `orgId`, so the event can never reach the tenant's own billing branch
  in `api/stripe-webhook.js`, which calls this endpoint's `webhook()` first.
- Admin-only records: `stripe_customers/{cus_…}` → `{ kind, org,
  customerId }` (answers events with no subscription metadata) and
  `stripe_events/{evt_…}` (each event applied once). An event older than the
  one applied to the same subscription is ignored; a lapse never revokes a
  trial or a different subscription; a pointer to another account is
  refused.
- The grant: `customers/{id}.editorLite = { source: 'provider', status:
  active|past_due|inactive, plan, expiresAt, stripeCustomerId,
  stripeSubscriptionId, subscribedBy, updatedAt, stripeEventAt }` — the
  shape `api/_lib/buyer-design.js entitlement()` accepts — audited as
  `customer-editor-lite`, which the CRM timeline reads.
- A trial from the supplier's owner (`buyers` `editor-trial`) is refused
  over a paid subscription that is active or past due.

## Where each piece is

| Surface | Page | Hub, and what it reads |
|---|---|---|
| Omega Logic app | `office/app.html` | hex hub (Today; Sales · Customers · Plant · Deliver · Stock · Money) with a panel per hub; Money screen; the CRM account in seven sections (`api/buyers.js` + `api/crm.js`) |
| Office dashboard | `omega-logic.html` | the same hub beside a Today list; the invoice forms with the pay link |
| Desktop CRM | `portals/customer/admin.html` | follow-ups across accounts; an account in eight sections (Details added); `?customer=<id>#section` opens one straight away |
| Customer app | `portals/customer/app.html` | hex hub (Fleet; Size · Design · POs · Pay · Shipping · Warranty); Arriving, To pay, Needs you; documents both ways (`api/my-files.js`); subscribe (`api/customer-subscribe.js`) |
| Customer portal | `portals/customer/index.html` | the same hub and hubs as desktop views |

Every surface draws the hub with `omega-hexhub.js`; if it does not load, the
same hubs appear as plain buttons. Both apps' service workers cache it with
the shell.

## Tests and checks

- `scripts/test-crm.js` (who gets in, contacts, activity and Today, the
  documents both ways, the file checks, the daily limit, failures, the
  timeline) and `scripts/test-customer-subscribe.js` (availability,
  checkout, the webhook grant and its safeguards, Manage, pay links) run in
  `npm run test:logic`, on `scripts/_lib/firestore-double.js`.
- `npm run check:pages` renders every surface above in Chromium at phone
  and desktop widths with the one sample tenant
  (`scripts/_lib/logic-fixtures.js`: contacts, activity with a follow-up
  due and an undated task, shared and office-only documents and a customer
  upload, a tenant-billed invoice open with a pay link and one to issue,
  monthly and yearly prices) and fails on any page error, console error or
  `/api/` route the fixtures do not answer. It logs a call and a task,
  marks follow-ups done, uploads and downloads documents both ways, issues
  an invoice with a pay link (a `javascript:` one refused first), subscribes
  and opens Manage (Stripe's pages answered by the check), asks a warranty
  question and assigns a unit — then reads the result on the other side.
- The phone sandboxes (`npm run build:sandbox`) answer the same routes on
  the device. Checkout there grants the subscription at once and returns
  with `checkout=done` (over https); Manage says it is Stripe's page. A
  document's kind is judged by its name and a download is a one-page sample
  PDF: the sample keeps no bytes.

## Not built

- Paying the supplier its share of Editor Lite subscriptions (Stripe
  Connect). Checkout runs on ClearSky's account at the supplier's prices.
- Card or ACH payment of a tenant-billed invoice inside the app: the Pay
  hub opens the supplier's own payment link, or says the supplier will send
  instructions.
- Email and calendar sync into the CRM activity log (calls are logged by
  hand); rescheduling a follow-up (log a new one and mark the old done).
- A supplier-branded sign-in email.
- A workspace MEMBER opening an account: `api/buyers.js` GET is an
  administrator's. The Omega Logic app builds the account for a member from
  the company record `api/po-intake.js` gives the office and the orders
  already loaded (logins read-only); the desktop CRM shows the refusal. The
  CRM itself (`api/crm.js`) is a member's. Opening `buyers` GET to members
  is a decision, not yet taken.
- A daily upload cap for the office (the customer side is capped).
- Design access while a subscription is past due (the entitlement needs
  active or trial; the app shows *Update payment*). Stripe `invoice.*`
  events are acknowledged and change nothing — the subscription events
  carry the status.
- `api/customer-portal.js` still says `checkoutAvailable: false` and knows
  only the monthly price (the pages read `api/customer-subscribe.js`);
  `api/logic-onboard.js` `customer-editor-price` and the master console set
  the monthly price only (`logic-admin.html` sets both).
- `firestore.rules` does not name `stripe_customers` or `stripe_events`;
  they are denied because nothing matches them.
- Editing an existing site from the customer app (the endpoint takes it; the
  app only adds a site).
- A load received through custody stays *on its way* in the customer's
  Shipping until Shipping & receiving records its delivery: the ledger owns
  a load's status, custody owns the units.
- The PDF guides (`scripts/guides/*.html`) do not show the hubs, the Money
  screen or the CRM sections yet.
