# Standing up a capital partner

Worked through for **Helios Energy** (`heliosnrgy.com`), but nothing below is
specific to them — the same three steps stand up any capital partner.

A capital partner is not a developer tenant with different branding. Their
product surface is the **financing portal**, their data lives in the `fin_*`
collections, and their dashboard answers one question: *what arrived, and what
do I owe an answer on?*

---

## 1. The seed

`tenants/helios/tenant.json` carries the tenant record and, new for this,
a `financePartner` block:

```json
"financePartner": { "orgKey": "helios", "orgName": "Helios Energy", "role": "partner" }
```

`orgKey` is the single scope for everything downstream — `fin_orgs/{orgKey}`,
`fin_profiles.orgKey`, and `room.forOrg` on a delivered deal. It is written
into deal documents, so **renaming it later orphans every delivery**. Pick it
once.

`requiredTools: ["financing"]` pins the financing portal to their dashboard.
`omega-tool.js` honours `requiredTools`, so it is preloaded and cannot be
removed from the board.

## 2. The accounts

```bash
FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" node scripts/provision-finance-partner.js --tenant helios
```

Dry run by default — it prints the plan and writes nothing. Add `--apply` to
write. It is idempotent: an existing account is never clobbered unless
`--reset-password` is also passed.

**The password is never in this repository.** This repo is public; a password
committed here is a password published, and rotating it afterwards does not
remove it from the history or from any clone. The script reads
`INITIAL_PASSWORD` from the environment:

```bash
FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" INITIAL_PASSWORD='…' \
  node scripts/provision-finance-partner.js --tenant helios --apply
```

With `INITIAL_PASSWORD` unset it creates the accounts with no password and
prints a one-time reset link for each, which is the better default: nobody but
the account holder ever knows it.

What it writes: `omega_orgs/{orgId}` (+ `billing/current`), `fin_orgs/{orgKey}`,
the Firebase Auth users, and `fin_profiles/{uid}` **pre-approved** with
`role` and `orgKey`. Pre-approval is the point of provisioning — a
self-signed-up profile is created `approved: false` and sees nothing.

## 3. Routing a deal into their room

`api/dealroom-send.js` reads `room.forOrg` off the project, falling back to
`fin_settings/dealroom.defaultOrg`. To deliver to Helios, the project's
`room.forOrg` must be `helios`, and the notification addresses come from
`fin_settings/dealroom.orgs.helios` (an array), falling back to
`.recipients`. Both are editable by an administrator on the deal room page —
a partner changes analysts more often than we deploy.

Delivery sets `room.state = 'delivered'`, `room.deliveredAt`, `room.notifiedTo`
and appends to `room.history`. The dashboard panels key off exactly that.

---

## The dashboard

Three panels, in `index.html`. They read `fin_projects` and the partner's own
offers — never `projects` — so on a developer's board they draw nothing and
say so, rather than charting somebody else's pipeline.

| Panel | Question it answers | Source |
|---|---|---|
| **Deal Room — new arrivals** | What landed, and which ones have I not answered? | `fin_projects where room.forOrg == orgKey and room.state == 'delivered'` |
| **Offers I have made** | How many are live, accepted, declined, and for how much? | `fin_projects/{deal}/offers/{myUid}` |
| **Investments** | What do I actually own? | the same offers, `status == 'accepted'` |

Investments counts **accepted offers only**. A pipeline number presented as a
position is a lie, and this is a board a capital partner will read as one.

### Why offers are read per-deal and not with a collection group

An offer lives at `fin_projects/{deal}/offers/{uid}` where the uid is the
**document id**. The portal synthesises it in memory with `{uid: d.id}` and
never stores it as a field, so `collectionGroup('offers').where('uid','==',…)`
matches nothing — it would have reported "no offers" to a partner who had made
ten. It would also have needed a new rule and a composite index, neither of
which is deployed.

Reading `offers/{myUid}` under each delivered deal needs neither: the existing
nested rule already allows `isPartner() && offerId == request.auth.uid`.

**Stated limit:** this counts offers on deals **in that partner's deal room**.
An offer made on an open marketplace deal that was never delivered to them is
not counted. Closing that gap needs two things, in this order:

1. write `uid` as a field in the offer body (`portals/finance/index.html`,
   the `submitOffer` write) and backfill existing offers;
2. add a collection-group rule, which the nested `match` does **not** cover:

```
match /{path=**}/offers/{offerId} {
  allow read: if request.auth != null && offerId == request.auth.uid;
}
```

plus the single-field index Firestore will prompt for. Until both are done the
panel is correct about the deal room and silent about the marketplace — which
is why it is labelled "Offers I have made" against deals in the room.
