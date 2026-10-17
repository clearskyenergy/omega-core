# CRM relaunch — architecture

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

Written 2026-10-17. Thomas asked for the whole system to become CRM-based: every object a person creates attaches to a customer, a customer's projects live on a portfolio, and those records can sync with the CRM that company already runs. The bar on the plan is a customer journey: each person can see the next step from the first touch through an installed system that is being watched.

This document is the journey, the map, the model, and the rollout. The code that lands with it is a foundation only:

- `omega-crm-foundation.js` — the attachment rules, pure, no database.
- `crm-foundation.html` — a preview of the customer portfolio and the customer profile, on its own route, with sample data.
- `scripts/tests/tcrmfoundation.js` — holds both.

Nothing here is wired into Site Map, Omega Prime, orders, the workspace rail, Firestore rules, or a live tenant. Editor v2 and the analysis-tool audit can keep moving; they call this model later, they do not fork it. The workspace home is being cleaned up on its own route (`/workspace-v2`). This change does not edit that page, `workspace.html`, or `omega-workspace-shell.js`. The stage words match, so the two can be joined later without a second vocabulary.

---

## The journey comes first

Four people walk the same project. The words are the ones the workspace home uses through Order, then the two steps after its track:

First touch → Customer → Site → Design → Analyze → Propose → Order → Install → Monitor

`progress` in `omega-crm-foundation.js` picks the first stage that is not done, so a sent proposal stays the open step even when a priced order already exists. `panel` is the one sentence and the one next action for whoever is looking. A finished step says what happened and points at the open step. A later step says what it is waiting on and points at the open step. The open step is a form this preview can complete in the browser, or a hand-off onto the person who actually does it. There is no disabled control and no note that leaves you nowhere.

The sample is Concord Energy. Alex Chen is sales. Helen Cho is the capital partner at Helios. Riley Brooks is operations. Jordan Blake is the customer at Riverside Logistics. Harbor Market is a lead with a web form and nobody to call. Northline Grocers is a Prime project whose bill is in review and whose Pipedrive stage disagrees. Riverside is a Site Map project with a proposal out and an order priced.

### Sales (Alex Chen)

The portfolio is the book, conflict first, then the earliest open stage.

1. **First touch.** Harbor's Saturday form is already on the account. That step is done.
2. **Customer.** Save the person. A project is not opened with no one to call.
3. **Site and Design.** Hold a project at an address. In the product this is Prime or Site Map. The preview keeps it in the browser, on the account.
4. **Analyze.** Mark the bill reviewed. If the CRM stage was edited on both sides, settle that stage first. Kilowatts stay the figure Omega holds either way, and the button after the choice is the bill, not a dead note.
5. **Propose.** Send the proposal, then log the follow-up. On Riverside, Jordan has a portal, so the next button opens the proposal they see. On Harbor, which has no portal sign-in in the sample, Alex records the acceptance on the same account.
6. **Order.** After acceptance, operations confirms. Alex can open that step.
7. **Install.** Operations names the week and marks the crew done. Alex sees the same words.
8. **Monitor.** Log this week's check. The step stays open on purpose: a watched site is a repeating check-in, not a blank ending.

### Partner (Helen Cho, Helios)

Helen sees only accounts shared with `helios.example`. In the sample that is Riverside. She does not see Harbor, Northline, the CRM connection, or the project cost.

Her open step is the capital request. Saying she is interested opens the proposal Jordan sees, which is the acceptance that unblocks the install week. Later steps name who acts (operations sets the week) and open that person's step. Other customers are not on her list; a link to one says so and sends her back.

### Operations (Riley Brooks)

The same book, read as a queue.

Harbor and Northline are still sales's: the person, the site, the bill, and the CRM stage. Riley's button opens Alex's step. It does not pretend operations designs the site.

Riverside's order is priced and the proposal is not accepted. Riley asks sales to follow up. Once that note is on the account, the next button opens the proposal Jordan sees. After Jordan accepts, Riley confirms the order, sets the install week, and marks the crew done. The watch is the same repeating check sales logs.

### End customer (Jordan Blake)

Jordan sees Riverside only, in plain words: Your proposal, Your order, Installation, Watching it run. No other accounts, no CRM screen, no project cost.

The open step is the proposal. Accepting it opens the order, and the next button is operations confirming it. Jordan can ask a question about the install; that opens the step where the week is set. When the crew is marked done, Jordan asks for this week's check. The account stays on that step.

### What the preview shows, and what the workspace home owns

`/crm-foundation.html#/as/installer` is the sales book. The same page with `partner`, `ops`, or `customer` is the other three. Reloading restores the sample. Nothing is saved. The route is not in the product navigation.

`/workspace-v2` owns the signed-in home. When that home offers a way to find a customer, it should open this portfolio (later, the real Customers page). Until that link exists the routes stay separate, on the same stage words through Order: Customer, Site, Design, Analyze, Propose, Order. Install and Monitor are the track that follows. This change does not edit the v2 files.

---

## 1. How the system is shaped today

One Vercel project (`omega-core`) serves every tenant from this repo. Static HTML and `omega-*.js` run in the browser. `api/` is the serverless boundary. Firebase project `clearsky-portal` is the only database: Auth (Google and email) and Firestore. Files sit in Firebase Storage. Tenant identity is `orgId`, the email domain, lowercased, with a personal workspace keyed by its host slug instead (`personal: true` on `omega_orgs`).

The browser is public. Pricing, scoring, dispatch, and financial models stay in `/api/`. Firestore rules are the security boundary. Rules hide documents, not fields, which is why a customer never reads their own account document: it carries terms.

### 1.1 Surfaces

| Surface | Where | Who it is for |
|---|---|---|
| Workspace home | `workspace.html`, `index.html` (classic shell) | A signed-in tenant. Rail, Today, projects, modules, billing. |
| Site Map | `editor.html` (~the drawing). Companion scripts `omega-*.js`. | Designers. Saves `projects/{id}`. |
| Omega Prime | `omega-prime.html`, `omega-prime-project.js` | A guided path that creates the same `projects/{id}`. |
| Editor Lite | `editor-lite.html`, `api/customer-design.js` | A supplier's customer. Designs live under that customer's account. |
| Tools catalogue | `marketplace.html`, `omega-tools.js` | Every tool, gated by the plan. Sells nothing. |
| Site register | `portfolio.html`, `site-crm.html`, `api/site-crm.js` | The tenant's energy sites. This is already called Portfolio. |
| Orders and the office | `orders.html`, `omega-logic.html`, `office/app.html`, `api/orders.js`, `api/logic-office.js` | Omega Logic. The supplier's commercial desk. |
| Customer CRM (today) | `portals/customer/admin.html`, `api/crm.js`, `api/buyers.js` | The supplier's view of a buyer account: people, activity, documents, orders, sites, timeline. |
| Customer portal | `portals/customer/index.html`, `portals/customer/app.html` | The buyer. Key-by-key projections. Does not load `omega-tenant.js`. |
| Finance marketplace | `portals/finance/` | Capital partners and sponsors. `fin_projects`, separate from `projects`. |
| Plant, custody, materials | `plant/`, `logic-*.html`, `api/logic-*.js` | Manufacturing and logistics. Units, POs, sites of a shipped product. |
| Public storefront | `embed/` | Unauthenticated. An order is a request. |
| Signup and billing | `start.html`, `login.html`, `api/tenant-signup.js`, `api/plan-change.js` | A workspace, its package, Stripe or QuickBooks. |
| Admin | `admin/`, `logic-admin.html`, `console/` | ClearSky staff. |

Auth is Firebase Auth. `omega-tenant.js` (after `omega-brand.js`) resolves the tenant, entitlements, and where home is. `api/_lib/admin.js` `authenticate()` is the server twin. Custom claims `role` and `orgId` are minted by `api/set-role.js`. A personal address is homed by the claim, then the email domain (`userOrg()` in both rules files).

### 1.2 Where a "project" already lives

There is more than one.

| Record | Path | What it is | Customer today |
|---|---|---|---|
| Site Map / Prime project | `projects/{id}` | The drawing, `orgId` of the owner, `orgsInvolved[]` for a joint-development roster, `mapState`, `grid`, `load`, `bessList`, capex rollup. Prime writes it through `omega-prime-project.js` `projectDoc` (`type: 'bess'`, `prime.v`). | No customer field. The editor save allowlist has no `customerId`. |
| Editor Lite design | `omega_orgs/{org}/customers/{id}/projects/{designId}` | A buyer's guided design. Rules deny the browser. | The path is the customer. |
| Finance deal | `fin_projects/{id}` | A capital opportunity. Partners read it by the finance rules. | The sponsor's project, not a buyer account. |
| Site | `omega_orgs/{org}/sites/{id}` | The energy-asset register and the custody end-site, on one record. | Optional `crm.customerId` from `crm-link` on `api/site-crm.js`. Custody also carries `customerId` for the account that owns the unit. |
| Top-level prospect | `sites/{id}` | Site Finder's sales board. Client-writable. | Not the register. Do not merge it into the customer model. |
| Order | `orders/{id}` | Created only through `api/orders.js`. | `customerId` when the buyer is an admitted person on an account (`buyer-accounts.stampableAccount`). |
| Customer portfolio upload | `omega_orgs/{org}/customers/{id}/portfolios/{pid}` | A buyer uploads a site list for screening (`api/customer-portfolio.js`). | Already under the account. Private. Leave it. |
| Tool memory | `toolData/{orgId}/tools/{key}` | One document per tool per tenant (`omega-tools.js`). | Not per run and not per customer. A bill analysis saved here cannot be attached to one client without a new record. |

### 1.3 Where a customer already lives

`docs/CUSTOMER-PORTAL.md` and `docs/OMEGA-LOGIC-ECOSYSTEM.md` are the current design, and they are built.

```
omega_orgs/{orgId}                         the tenant
  customers/{customerId}                   a company the tenant sells to
    users/{email}                          people who may sign in
    contacts/{id}                          people who may never sign in
    activity/{id}                          calls, email, meetings, notes, tasks
    files/{id}                             documents, both directions
    projects/{id}                          Editor Lite designs
    portfolios/{id}                        uploaded site packages
  customer_index/{email}                   email → customerId
  crm_followups/{customerId__activityId}   open follow-ups across accounts
```

An account has `name`, `status`, `domain` (typed by the office, never inferred), `terms`, `agreements`, `editorLite`. People, contacts, activity, and files are Admin SDK only. The timeline in `api/_lib/crm.js` is derived on read from orders, POs, documents, activity, custody, sites, and designs. It is not stored twice.

The same person buying from two tenants gets two accounts. That is the relationship, not a duplicate.

Terms can already record `termsSource: 'manual' | 'salesforce'`. No Salesforce connector was built on that field, on purpose.

### 1.4 Analysis tools, and what they persist

`omega-tools.js` `SEED_TOOLS` is the catalogue. The groups a relaunch has to attach:

| Group | Tools | Persistence today |
|---|---|---|
| Design | Site Map `editor`, Prime `omegaprime`, sandbox, site optimizer, power flow, conductor sizing, site discovery | A project, or nothing. |
| Interconnection | Grid Atlas, interconnection screener and study, ComEd capacity, Site Finder | A `grid` block on the project when the panel in Site Map ran; otherwise a session. |
| Finance | BESS pro forma, DCFC pro forma, value stack, VPP simulator, compute pro forma, investment analysis, battery sizer, ISO calculator, data-center and compute power calculators, cost estimator | Server math in `api/_lib/*`. Results land on a project (`capex`, `latestModel` on a site) or in `toolData`, or only on screen. |
| Sales | Sales proposal, EV workbook, parcel and BESS screening, compute land lease | A proposal page, a screening run, or a file. Not a customer. |
| Permitting | Permit creator, project intake, site lifecycle | Intake records, not a customer account. |
| Operations | Field service, fleet command, owner reporting, O&M, SLA, degradation | Plant and fleet records. |
| Marketplace | Financing partners, opportunity, procurement, aggregators | `opportunities`, `rfqs`, `fin_projects`. |

The audit of these tools is a separate piece of work. This relaunch does not move their math. It gives a finished run somewhere to hang once that audit says the run is stored.

### 1.5 The CRM proxy that already exists

`api/crm-sync.js` (and the same file at the repo root, `api-crm-sync.js`) pushes a job to Monday, Salesforce, HubSpot, or Zoho. It stores credentials in Upstash Redis under `slc:crm:{orgId}`. The browser posts `orgId` in the body. The handler does not verify a Firebase token.

That proxy is not the relaunch's sync. It is unauthenticated, one-way, and it is not tied to a customer account. Milestone 5 locks or retires it. This change does not call it and does not point the preview at it.

### 1.6 What is already a CRM, and what is not

Omega Logic's customer hub is a CRM for a supplier's buyers: account, contacts, activity, documents, orders, a derived timeline. The site register is a CRM for sites, with `crm-link` pointing a site at `customers/{id}`.

Neither one is the system Thomas described. A Site Map project and a Prime project are still unattached. A bill analysis is still a tool session. A sales proposal is still a page. There is no per-tenant OAuth connection to HubSpot, Pipedrive, Zoho, GoHighLevel, or a solar CRM, and no inbound webhook that can conflict with a field on a project.

---

## 2. The model

Keep every collection in §1. Add a party link beside them. Do not copy a project into a customer document, and do not make `customerId` the only relationship a project can have: a garage has a customer, a utility, and a capital partner at the same time.

### 2.1 Entities

| Entity | System of record | Proposed path | Notes |
|---|---|---|---|
| Organization | `omega_orgs/{orgId}` | unchanged | Installer, developer, EPC, OEM. Status, vertical, billing, white label. |
| User and role | `omega_orgs/{org}/members/{uid}`, claims | unchanged | owner, admin, member, viewer. Staff is `omega_staff`. An outside collaborator is `org_members`, a grant, not a member. |
| Customer account | `omega_orgs/{org}/customers/{id}` | unchanged | The company. Terms stay on it. Browsers still cannot read it. |
| Contact | `customers/{id}/contacts/{id}` and `users/{email}` | unchanged | A contact may never sign in. A user does. The link may name either, by id. |
| Site | `omega_orgs/{org}/sites/{id}` | unchanged | Facts, model, capital. `crm.customerId` remains the register's own pointer until links are backfilled. |
| Project | `projects/{id}` | unchanged, plus an optional denormalized `customerId` written only by the link endpoint | The drawing stays here. `orgId` still never moves. |
| Design | the drawing on the project, or `customers/{id}/projects/{id}` for Editor Lite | a link of kind `design` | Not a second drawing. |
| Analysis | new, when a tool stores a run | `omega_orgs/{org}/analyses/{id}` | Do not overload `toolData`, which is one blob per tool. |
| Proposal | sales proposal output, subscription proposals stay where they are | `omega_orgs/{org}/proposals/{id}` for a customer-facing proposal | `subscription_proposals` is the platform's own sales quote to a tenant. Different object. |
| Order | `orders/{id}` | unchanged | Already stamped with `customerId`. The link repeats it so one query lists the account. |
| Document | `customers/{id}/files/{id}`, Storage `crm/{org}/{customerId}/{fileId}` | a link of kind `document` | Bytes stay where they are. The link is how a project shows the file. |
| Activity | `customers/{id}/activity/{id}` | unchanged | Timeline stays derived. |
| Party link | new | `omega_orgs/{org}/party_links/{linkId}` | The attachment. |
| CRM connection | new | `omega_orgs/{org}/crm_connections/{provider}` | Status and the remote account. Not the tokens. |
| CRM secret | new | `omega_orgs/{org}/crm_secrets/{provider}` | Refresh token. Admin SDK only. |
| CRM object link | new | `omega_orgs/{org}/crm_objects/{provider__kind__objectId}` | Remote id, hashes, conflict. |
| CRM event | new | `omega_orgs/{org}/crm_events/{id}` | Append-only webhook receipt. |

`linkId` is `kind + '__' + objectId + '__' + role + '__' + accountId`. The same attachment posted twice is an update, not a second row. `omega-crm-foundation.js` `linkIdOf` is that rule.

### 2.2 The party link

```
kind         project | site | design | analysis | proposal | order | document
objectId     the id in the collection that already holds it
accountId    customers/{id} under the SAME tenant
contactId    optional contacts/{id} or a user email key
role         see below
title        optional, 120 characters
sharedWith   org ids allowed to receive the public projection, at most 8
createdAt, createdBy, updatedAt     stamped by the endpoint
```

Roles (`ROLES` in the library):

| Role | How many on one object | Meaning |
|---|---|---|
| `customer` | one | The account this workspace serves. The portfolio groups on this role. |
| `client` | many | The end client when they are not the customer (an installer's client's tenant). |
| `host` | many | Site host. Often the same account as the customer. |
| `utility` | many | Serving utility. |
| `epc` | many | EPC. |
| `installer` | many | Installer, when this workspace is the developer or the OEM. |
| `capital` | many | Capital partner. |
| `partner` | many | Any other firm on the work (Terra on a solar scope, a distributor). |
| `stakeholder` | many | A named party that is none of the above. |

`applyLink` refuses a second `customer`. It accepts the same customer again and updates the contact. Other roles may repeat with different accounts.

`primaryAccount(links, kind, objectId)` is the customer, or null. A draft with null is allowed. Quote, proposal, and order are the gates that require one (milestone 3), not the first save.

### 2.3 Permissions

Unchanged identities:

- A tenant member reads and works the tenant's projects as the rules already allow. A viewer does not write.
- A collaborator on `orgsInvolved[]` reads and updates the project and must hand `orgId` and the roster back unchanged. Delete stays with the owner.
- A buyer reads through `api/my-orders.js`, `api/my-account.js`, `api/my-files.js`, `api/my-sites.js`. Never through a party link.
- Staff (`isOmegaStaff`) keeps the access those endpoints already give. A preview painted with `?wlpreview=` still changes paint only.

New records are Admin SDK only, `allow read, write: if false`, the same posture as contacts and activity. Reasons:

- A party link names a capital partner and a share list. A browser that can write `sharedWith` can publish a customer into another tenant.
- A CRM secret is a refresh token. It does not belong in a document a member can read. Rules hide documents, not fields.
- The customer account still carries terms. Linking a project to it must not open a new read path onto that document.

Who the endpoint lets in:

| Action | Who |
|---|---|
| Read the portfolio and a profile | a member of the tenant. A viewer reads. Projections omit `terms`, margin, and cost basis. |
| Create or update a link | owner, admin, or member. A viewer is refused. |
| Share with another organization | owner or admin. |
| Connect a CRM, disconnect it | owner or admin. |
| Resolve a sync conflict | owner or admin. |

Cross-tenant. An installer and their client are two `omega_orgs` when the client has a workspace, and one account under the installer when they do not. The account is not promoted to a tenant because a project was created. A later share (`sharedWith`) copies a public projection into the other tenant's CRM connection. It does not copy terms, the drawing's cost basis, or the order's margin. Joint development (`orgsInvolved`) stays the way two tenants edit one drawing. It is not the CRM share.

A personal workspace uses the same links under its slug `orgId`. A customer on a public mailbox is a contact or an account under that workspace. They do not become a tenant.

### 2.4 Denormalized `customerId`

Orders already store it. Sites store `crm.customerId`. Projects do not.

List screens cannot collection-group their way to "Riverside's projects" without an index the codebase has already been burned by (`customer_index` exists for that reason). So the link endpoint, in the same transaction as the link, may set `projects/{id}.customerId` to the `customer` role's account, and clear it when that role is moved. Stakeholders do not go on the project document. The endpoint is the only writer of that field. A client that sends `customerId` on a drawing save is ignored, so editor v2 cannot accidentally fork the rule.

---

## 3. Portfolio and profile

`portfolio.html` stays the energy-site register. Renaming it would collide with the OSA host rewrite (`/portfolio.html` → `/tenants/osa/portfolio` on `osa.clearskyomega.com`) and with every rail link that already says Portfolio.

The customer home is a new page, later. The preview of it is `/crm-foundation.html`, and it is not linked from the rail, the editor, Prime, orders, or the workspace home.

The preview leads with the journey in the section above. Four switches — Sales, Partner, Operations, Customer — change who is looking. `visibleAccounts` is the list: sales and operations see the book, a partner sees accounts in `sharedWith` for their org, a customer sees their own account. `canSee` hides the CRM connection and the project cost from the partner and the customer.

Portfolio. One card per account on that list, including a lead marked `book: 'customer'` with no project yet. A utility or a capital partner (`book: 'party'`) shows on the work, not as a card of their own. `portfolioRows` sorts a sync conflict first, then the earliest open stage, then the name. Each card is the nine steps and one button, `nextAction`. The button is the only primary control.

Profile. The same nine steps. The open step is a short form (save the contact, hold the project, mark the bill reviewed, send or accept the proposal, confirm the order, set the week, mark the crew done, log the check). Any other step explains itself and returns to the open one. Under that: the work, the people (not for a partner), the recent notes, and, for sales and operations, the CRM stage. `profileOf` still returns the account, its contacts, every object the account is on, the other parties, the activity, the documents, and the sync bundles judged by `judgeField`.

The product page should keep those as sections, fed by the live records:

| Section | What it shows | Live source, when built |
|---|---|---|
| Journey | The open step and the nine-step track | `progress` and `panel`, from the records below |
| Work | Projects, sites, designs, analyses, proposals, orders, with every party | party links joined to the existing records |
| People | Contacts and portal users | `contacts` and `users` |
| Timeline | Newest first | `api/_lib/crm.js` timeline, extended with project and analysis events |
| Documents | Files linked to the account | `files`, still served by the endpoint |
| CRM sync | One block per provider, field by field, then back to the open step | `crm_objects` plus `judgeField` |

Assign. A drawer on a piece of work, for sales and operations. Role, account, optional contact, optional note. The preview holds the result in memory and says so. The product writes a party link through the endpoint.

The preview's sample is Concord Energy. Riverside Logistics has the Site Map project, the site, the design, a finished VPP run, a sent proposal, a priced order, and a HubSpot deal in agreement. Northline Grocers has the Prime project whose stage conflicts with Pipedrive, and a bill still in review. Harbor Market is the lead. PG&E is the utility on the garage. Helios is the capital partner, shared to `helios.example`.

---

## 4. How each module attaches

Attachment is a link. The module keeps its save path. "No customer yet" stays a legal save until milestone 3's gates.

| Module | Object kind | When the link is written | Required for |
|---|---|---|---|
| Site Map save | `project` | Optional control beside save. Absent control → no link, today's save. | Sending a proposal, requesting a quote, handing to finance. |
| Omega Prime "create project" | `project` | Optional account on the hand-off into `projectDoc`. The document shape gains nothing in this foundation. | Same gates. |
| Editor Lite | `design` | The path is already the customer. A link is written so the portfolio has one list. | Already required by the portal. |
| Order create | `order` | `customerId` already stamped. The link repeats it. | Placing the order, as today for an admitted buyer. |
| Site register `crm-link` | `site` | Keep the action. It also writes the party link so the two pointers cannot diverge. | Nothing new. |
| Grid Atlas, verdict, value stack, VPP, pro forma, compute pro forma, sizers | `analysis` | The run's API writes `analyses/{id}` when the request names a `projectId` or `siteId`. No id → today's behavior, nothing stored on a customer. | Attaching is optional until the analysis audit says a run is durable. |
| Sales proposal | `proposal` | The builder posts the proposal record with the project's customer. | Sending it. |
| Bill analysis | `analysis` | Same as the other runs. A bill is not a customer. | Optional. |
| Finance marketplace | not a party link | `fin_projects` stays the deal. The portfolio can show a deal id. The capital partner is a `capital` link on the project, which is a different fact from the deal room. | Unchanged deal rules. |
| Plant, PO, custody | `order` and `site` | Already account-scoped in Omega Logic. No new customer database. | Unchanged. |
| Storefront order | `order` | An order with no account stays unlinked until the office matches it, which is today's claim-by-email. | Unchanged. |
| Helios intake, partner send | `project` | The send already requires a project. The customer on the link is included in the packet only when the sender has the right to name them. | Unchanged gates. |

Editor v2 should call `linkInput` / the future endpoint and should not add customer fields to the drawing payload. The analysis audit should treat `analyses/{id}` as the durable run, with `toolData` left as tool preferences.

Showing a customer on a screen is not access. The endpoint checks the member, then the object's `orgId`.

---

## 5. External CRM sync

One connection per tenant per provider. The tenant connects their own HubSpot. ClearSky does not hold a single platform-wide token that can see every customer.

### 5.1 Providers

`PROVIDERS` in the library is the allowlist.

| Key | Product | Auth | Remote objects |
|---|---|---|---|
| `hubspot` | HubSpot | OAuth | companies, contacts, deals |
| `salesforce` | Salesforce | OAuth | Account, Contact, Opportunity |
| `zoho` | Zoho CRM | OAuth | Accounts, Contacts, Deals |
| `pipedrive` | Pipedrive | OAuth | organizations, persons, deals |
| `gohighlevel` | GoHighLevel | OAuth | businesses, contacts, opportunities |
| `aurora` | Aurora Solar | API key | projects, designs |
| `enerflo` | Enerflo | API key | customers, jobs, designs |
| `jobnimbus` | JobNimbus | API key | contacts, jobs |

Monday is on the old proxy and is not on this list. A solar CRM Thomas names that is not here is added to the allowlist in a later milestone, not typed into a free-text provider field.

### 5.2 OAuth, per tenant

1. Owner or admin starts the connection. The endpoint writes a one-time `state` (org, provider, nonce, expiry) and redirects to the provider.
2. The callback checks `state`, exchanges the code, and stores the refresh token in `crm_secrets/{provider}`. The connection document stores the remote account id, scopes, who connected it, and when. It does not store the token.
3. A second tenant's callback cannot land in the first tenant: `state` is bound to `orgId`, and the member is re-checked.
4. Disconnect deletes the secret and marks the connection `disconnected`. Remote records are left in the CRM. Local links are kept. Synced ids are kept so a reconnect does not duplicate deals.
5. Tokens are refreshed on the server. The browser never sees them. This replaces the old proxy's model, where the browser posted the secret and named an `orgId` with no session.

API-key providers (the solar CRMs) use the same secret document. The key is pasted once into the endpoint, not into Firestore from the client.

### 5.3 Identity

Omega's id never changes to match the CRM. `externalRef` requires a provider on the allowlist, a kind, the Omega id, the remote type, and a remote id of letters, digits, and `_. :-` only. A match is on that remote id. A name match is a suggestion on screen during the first link, never an automatic merge.

`crm_objects/{provider__kind__objectId}` holds `remoteType`, `remoteId`, `remoteUrl`, `lastPushAt`, `lastPullAt`, `lastHash`, and `conflict` or null.

The hash is of the canonical fields last successfully exchanged. It is how "both sides edited stage since the sync" is decided without a second history of the CRM.

### 5.4 Field ownership

`FIELDS` is the book. `judgeField(field, omega, remote, lastSyncAt)` is the rule.

- `omega` — company name, domain, project name, address, kW, kWh, capex. The CRM's newer value is reported and not applied. Status `kept`.
- `remote` — reserved for a pipeline field a tenant has explicitly handed to the CRM. The default book has no remote-owned field.
- `either` — phone, city, and stage. If only one side moved since `lastSyncAt`, that side wins. If both moved, status is `conflict` and the value is empty until a person picks one.

Nothing in the drawing, the cost rollup, the terms, the margin, or the order price is a CRM field.

### 5.5 Direction, webhooks, conflicts

Outbound. A link create, a stage change, and a capex change enqueue a push. The push is idempotent on `crm_objects` remote id: update that deal, or create one and store the id. A failed push retries. It does not create a second deal because the first response was lost: the create call carries the Omega id in the remote record's external-id field where the provider has one (HubSpot `omega_id`, Salesforce external id, Pipedrive the same).

Inbound. The provider's webhook hits `POST /api/crm-webhook?provider=`. The handler verifies the provider's signature, writes a `crm_events` row, and returns. A worker applies the event. The HTTP call does not do the merge, so a slow Firestore write cannot make the provider retry into a double apply. The event id is the idempotency key.

Apply. Load the `crm_objects` row by remote id. Unknown remote id is stored as an unmatched event, not as a new project. Known id: run `judgeField` per mapped field. `kept` and `taken` write the winner and a new hash. `conflict` writes `conflict` on the row and stops that field. Other fields on the same record still apply.

Resolve. An owner or admin posts the chosen value. The choice is the new Omega value, the hash updates, and the next push sends it. The preview's two buttons demonstrate the choice and do not store it.

Deletes. A deal deleted in the CRM sets the sync row `remoteDeleted`. It does not delete the project, the order, or the account.

Loop control. A push sets `lastPushAt` and the hash. An echo of that same hash within a short window is ignored.

### 5.6 What is never synced

Terms, discount, credit limit, cost basis, margin, the drawing, utility-bill interval files, a parcel owner's name, and any document the office has not marked shared. The public projection for a partner share is name, address, stage, and the product type. Capacity and capex go only to the tenant's own CRM, not to `sharedWith`.

---

## 6. Database and backend

Stay on Firestore in `clearsky-portal`, with Vercel functions in `api/` as the only writer of the new documents.

This repo's rule is that Firestore is the only database. The customer, the order, the project, and the rules already live there. A Postgres database beside it would split the tenant boundary in two and give the relaunch a migration of the system of record before it had a single link. Sync volume is a webhook and a push per edit, which a function and an event document handle. Upstash is already an optional cache in the old proxy; it is the wrong place for a refresh token and it is not required for the new collections.

New documents follow the closed-collection pattern already used for contacts, activity, freight quotes, and purchase orders: the rules say `allow read, write: if false`, and the Admin SDK in `api/` is the door. Indexes, when a portfolio query needs them, are `party_links` by `accountId` plus `kind`. A pilot small enough to list the tenant's links does not need the index on day one; the query shape should be chosen before the first tenant is large, not after.

Secrets. `crm_secrets` is the token store. Vercel environment variables remain the place for ClearSky's own provider app id and secret (the OAuth client), one pair per provider for the whole platform. Those are not tenant tokens. Tenant tokens never go in Vercel env, because env is one value for every tenant.

No new database is recommended. No second Firebase project.

---

## 7. Migration

Nothing moves in this change. The path after it:

1. Dry run, read only. A script lists, per tenant: projects with no customer, orders with and without `customerId`, sites with `crm.customerId`, Editor Lite designs (the path is the customer), and accounts with orders but no link. It writes a report. It does not write Firestore.
2. Backfill the easy links, idempotent, one tenant at a time, behind the flag in §8. Orders that already have `customerId` get an `order` / `customer` link. Sites with `crm.customerId` get a `site` / `customer` link. Editor Lite designs get a `design` link. The script flags, it does not delete, and a second run updates in place because the link id is stable.
3. Projects from Site Map and Prime are not guessed from a name. They stay unassigned until a person assigns them. The report is the work list.
4. Duplicate accounts (three self-serve "Acme" records) stay on the existing merge rule: a script, `mergedInto`, orders re-pointed, documents kept. The relaunch does not add a merge button.
5. The old `api/crm-sync.js` credentials, if any tenant stored them, are not imported. OAuth starts clean. A tenant who used the proxy connects again. Their remote deals are matched by the external id if one was written, otherwise they are unmatched events for a person to pair.

Rollback of a backfill is a flag off plus leaving the links in place. Links are additive. Turning the flag off hides the portfolio and stops sync. It does not strip `customerId` off an order that had one before.

---

## 8. Rollout

Each milestone is shippable on its own. Later ones are not started by this change. The flag is `omega_orgs/{org}.crmFoundation` with values `off` (default), `preview`, and `on`, written by staff. It is not a `toolOverrides` entry: that field is the tool allowlist, and a CRM is not a tool in the catalogue.

| Milestone | What a person can do when it is done | What it must not do |
|---|---|---|
| **M0. Foundation.** This change. | Open `/crm-foundation.html` and walk all four journeys, the assignment drawer, and a stage conflict that returns to the bill. Read this document. | No rules deploy, no nav entry, no write, no OAuth, no edit to the editor, Prime, orders, or the workspace home. |
| **M1. Read model.** `GET` of accounts and any links that exist. The dry-run report. | Staff can see, for one pilot tenant, which projects have no customer. | No backfill. No picker. |
| **M2. Party links.** The collection, rules denied to browsers, an audited endpoint, the easy backfill for one pilot. | An order that already has an account shows on that account's list. | No Site Map change. Unassigned projects stay unassigned. |
| **M3. Optional assignment.** A sibling control on Site Map save, on Prime's create, and on order create. Editor v2 calls the same endpoint. | A rep can attach a customer and a utility while saving. Skipping leaves today's save unchanged. | The drawing payload does not gain a required customer. A failed link call does not fail the save. |
| **M4. Customer portfolio in the product.** A rail page, flag `preview` for one tenant, then `on`. | The pilot opens Customers and sees the real accounts, the work, the people, and the derived timeline. | `portfolio.html` is still the site register. OSA's rewrite is untouched. |
| **M5. HubSpot outbound, and the old proxy.** OAuth, push of companies and deals, external id. `api/crm-sync.js` starts requiring a verified member of that org, or it is removed if nothing calls it. | The pilot's new deal appears in their HubSpot. A capacity edit in HubSpot does not change kW. | No inbound merge yet. No second provider. Tokens not in the browser. |
| **M6. Inbound and conflicts.** Signed webhooks, `crm_events`, `judgeField` applied, a resolve action. | A stage edited on both sides waits on the profile. | A conflict does not block unrelated fields, and it does not delete anything. |
| **M7. The next provider.** Salesforce (the `termsSource` field is finally used for terms only) or the solar CRM Thomas names. | That provider's allowlist entry is live for a second pilot. | No free-text provider. Solar design sync does not replace the Site Map drawing. |
| **M8. Share into another company's CRM.** `sharedWith` pushes the public projection through the other tenant's connection, or through an explicit export if they have not connected. | Helios, in the sample's shape, can see the project in their own CRM without seeing margin. | Joint-development edit rights are unchanged. Terms never ride along. |

M0's acceptance is the test file and the preview route. Each later milestone gets its own test against the Firestore double before a tenant is switched on, the same way packaging and the site register were held.

---

## 9. Decisions Thomas has to make

The recommendation is the one the foundation is built to. A different answer changes a milestone, not the preview.

1. **What the word portfolio means.** The site register is already Portfolio. Recommendation: leave `portfolio.html` as the sites. The new page is Customers, and each customer has their work on it. The preview is labeled Customer portfolio so the idea is visible without taking the name. The stage words through Order match `/workspace-v2` (Customer, Site, Design, Analyze, Propose, Order). Install and Monitor follow that track.

2. **System of record.** Recommendation: Omega owns the company name, the address, the drawing, the capacity, and the cost. The CRM owns nothing until a tenant hands it a field. Stage is the only field both sides may edit, and a double edit waits for a person.

3. **Database.** Recommendation: stay on Firestore and Vercel functions. Do not add Postgres, Supabase, or a second Firebase project. Tenant OAuth tokens live in Admin-SDK-only documents. The platform's OAuth client id lives in Vercel env.

4. **One customer, many parties.** Recommendation: exactly one `customer` role, required only to quote, propose, or order. Any number of utilities, hosts, EPCs, capital partners, and other stakeholders. Drafts save with nobody attached, so today's editor and Prime keep working.

5. **An installer's client.** Recommendation: the account under the installer's tenant is the relationship. The end client is a `client` or `host` role, not a second copy of the project. They become their own tenant only when they buy a workspace, and a share is explicit.

6. **Sharing into another CRM.** Recommendation: each tenant syncs only through their own connection. A partner receives the public projection when an owner adds them to `sharedWith`. Capacity and money stay in the owning tenant's CRM. Joint development stays the way two tenants edit one drawing.

7. **Which CRM first.** Recommendation: HubSpot outbound first, then inbound. Salesforce second, and only for the objects in the map (Account, Contact, Opportunity), with terms still a field ClearSky writes. Aurora, Enerflo, or JobNimbus only after Thomas names the one a real tenant uses. Do not build all eight. Do not extend the unauthenticated Monday proxy; lock it in M5.

8. **Whether assignment can block a save.** Recommendation: no. The link is a second call. If it fails, the project is still saved and the screen says the customer was not attached. Quote, proposal, and order are where a missing customer refuses.

9. **Editor v2.** Recommendation: v2 does not invent customer columns on the drawing. It calls the same link endpoint the current editor will call in M3. Until that endpoint exists, v2 leaves customers alone.

10. **Analysis tools.** Recommendation: a durable run becomes `analyses/{id}` attached to a project or a site, and the customer follows from that object's link. Tools keep working with no customer. `toolData` stays preferences, not the system of record for a client's bill.

11. **Buyer visibility.** Recommendation: unchanged. The portal's key-by-key projections stay the only thing a customer reads. A party link does not grant a Firestore read.

12. **Personal workspaces.** Recommendation: same links, under the slug org. A Gmail customer is an account in that workspace, not a tenant of their own.

13. **Conflict default.** Recommendation: field-level, as `judgeField` implements. No whole-record last-write-wins. No automatic merge of two stage names. Engineering fields never take the CRM's value.

14. **Matching existing CRM records.** Recommendation: match on the stored remote id only. The first connection may suggest pairs by name and domain; a person confirms. A name is not an id.

15. **Who may connect a CRM.** Recommendation: an owner or admin of an active tenant. A member may assign parties. A viewer may read the portfolio. Staff can connect on a tenant's behalf only through the same endpoint, audited, which is how other staff writes already work.

16. **The flag.** Recommendation: `crmFoundation` on the org, default `off`. One pilot tenant at `preview` for M4, the same tenant at `on` only after M5 has pushed one deal and a kW edit in the CRM was refused.

---

## 10. What this change deliberately does not do

- It does not edit `editor.html`, `omega-prime.html`, `orders.html`, `portfolio.html`, `workspace.html`, `omega-workspace-shell.js`, the rail, or the workspace-home route (`/workspace-v2`).
- It does not edit `firestore.rules` or `storage.rules`. The collections in §2 are proposed. Adding the `allow read, write: if false` lines is M2, deployed with that endpoint.
- It does not create a customer, a project, or a token anywhere live.
- It does not add the preview to `omega-tools.js`. A catalogue entry would put it on every tenant's marketplace.
- It does not change `/api/crm-sync`. Locking that route is M5, because a silent auth change is a behavior change if any tenant still posts to it.
- It does not implement OAuth, webhooks, or a backfill script. The rules those must follow are in §5 and §7 so the next change does not invent a second map.
