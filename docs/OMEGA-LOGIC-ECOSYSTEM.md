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
  Omega Logic app. Opened with no `?org=`, it signs in and resolves the
  workspace from the verified email's domain (orgId IS the email domain); a
  ClearSky owner picks a workspace. Its icon and name are ClearSky's
  (the Hex grid Ω); the workspace is named inside.
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

### `api/crm.js` — the supplier's CRM (workspace members; archiving is admin)

```
GET  ?org=&customerId=                 { customerId, company, contacts[], activity[],
                                         followUps[], files[], timeline[] }
GET  ?org=&customerId=&file=<id>       the document (attachment)
GET  ?org=&followUps=1                 open follow-ups across all accounts (Today)
POST { org, customerId, action, … }
  contact-save    { id?, name, title, email, phone, notes, primary }
  contact-archive { id }
  log             { type: call|email|meeting|note|task, subject, body, at?,
                    contactId?, orderId?, followUpAt? }
  done            { id }                follow-up completed
  file-upload     { file: { name, base64 }, category, note, shared }
  file-share      { id, shared }
  file-archive    { id }
```

Stored under `omega_orgs/{org}/customers/{id}/contacts|activity|files`;
documents in private Storage `crm/{org}/{customerId}/{fileId}`, served only
by the endpoint, never by URL.

### `api/my-files.js` — the customer's documents (verified email, active person)

```
GET  ?org=                    documents the supplier shared + the account's own uploads
GET  ?org=&file=<id>          one of those
POST { org, action: 'upload', file: { name, base64 }, category, note }
```

### Pay links

`logic-office` `invoice-issued` takes an optional `payUrl` (https) for a
tenant-billed invoice — the supplier's own payment link. The customer's
Pay hub shows it; QuickBooks-billed invoices keep QuickBooks' link.

### `api/customer-subscribe.js` — the design tool

```
GET  ?org=                         { available, monthlyPriceCents, yearlyPriceCents, status, expiresAt }
POST { org, plan: 'month'|'year' } { url }  → Stripe Checkout (subscription)
POST { org, action: 'manage' }     { url }  → Stripe billing portal
```

## Not built

- Paying the supplier its share of Editor Lite subscriptions (Stripe Connect).
- Card or ACH payment of a tenant-billed invoice inside the app: the Pay hub
  opens the supplier's own payment link.
- Email and calendar sync into the CRM activity log (calls are logged by hand).
- A supplier-branded sign-in email.
