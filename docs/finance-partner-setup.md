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

### Offers: the group query, and what it needed

An offer lives at `fin_projects/{deal}/offers/{uid}` where the uid is the
**document id**. The portal recovered it in memory with `{uid: d.id}` and
never stored it as a field, so `collectionGroup('offers').where('uid','==',…)`
matched nothing — it reported "no offers" to a partner who had made several.

Three things closed that, and all three must be deployed together:

1. **The field.** `portals/finance/index.html` now writes `uid`, `dealId` and
   `dealName` into the offer body. The last two ride along because a group
   query returns the offer without its parent, and re-reading every parent
   deal to get a name defeats the point of the query.
2. **The backfill**, for offers written before that:
   ```bash
   FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" node scripts/backfill-offer-uid.js          # dry run
   FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" node scripts/backfill-offer-uid.js --apply
   ```
   It derives the uid from the document id, which is what it always was, and
   never overwrites a field that already has a value.
3. **The rule**, in `firestore.rules`. The nested
   `fin_projects/{projectId}/offers/{offerId}` match does **not** cover a group
   query: at the group path there is no `projectId` to bind, so its parent
   lookups cannot run and the query is refused outright. The new rule is the
   narrowest one that works, and is read-only — writing an offer still goes
   through the nested checks:

   ```
   match /{path=**}/offers/{offerId} {
     allow read: if signedIn() && offerId == request.auth.uid;
     allow write: if false;
   }
   ```

   Deploy it, then add the single-field index on the `offers` collection group
   that Firestore prompts for on first use.

**Until all three are live the panel still works.** A refused group query falls
back to reading `offers/{myUid}` under each delivered deal — which the nested
rule has always allowed — and the panel labels that narrower scope on screen.
A refusal must never read as "no offers" to somebody who has made ten.
