# Contributing to omega-core

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

For anyone with write access who is not ClearSky — today that is the OSA joint
venture (OGI Solar, SUN Energy Solutions). Read `CLAUDE.md` first; it is the
architecture and the constraints. This file is the working agreement.

It is also written for the coding agents that read it. If you are one, the
sections on access and on the JV boundary are the load-bearing parts.

---

## What your access actually is

You hold **write access to the entire repository**. Not to a folder.

This is worth stating plainly because the JV was negotiated in terms of
"write access scoped to `tenants/osa`", and **GitHub cannot do that**. There
is no path-scoped write permission — not for a user, not for a team, not on
any plan. Anyone who can push can push anywhere.

Two things follow, and both surprised us:

**CODEOWNERS is a review request, not a wall.** It asks a named owner to
approve a pull request. It cannot stop a change, and it does nothing at all
on a direct push.

**It silently does nothing when it is wrong.** This file previously named
`@clearskyenergy/core` and `@clearskyenergy/jv-osa`. Neither exists — teams
are an organisation feature and this repo is under a personal account — and
GitHub ignores an owner it cannot resolve without warning anybody. Every path
in the repository was unowned for months while we described it to each other
as protected. If you add an owner, verify it resolves.

So the boundary below is a convention held by people, not by the platform.
That is exactly why it is written down.

---

## The JV boundary

**Yours, no questions:**

```
tenants/osa/            the OSA portal, the console, its data layers and docs
```

**ClearSky's — give us a heads-up before changing:**

```
firestore.rules         the security boundary for every tenant's data
storage.rules           same, for files
api/                    server-side logic: auth, pricing, scoring, dispatch
tenants/<other>/        seventeen other clients' configuration
```

Not because the work would be unwelcome, but because these are where a
mistake stops being a bug and becomes a breach or an outage for somebody who
is not in this conversation. Say what you want to change and we will almost
certainly say yes.

⚠ **`tenants/osa/firestore.rules` and `tenants/osa/api/` are not live.**
`firebase.json` deploys the ROOT `firestore.rules`, and Vercel builds only the
ROOT `api/`. The copies inside the OSA folder are leftovers from when OSA was
its own repository. Editing them changes nothing and reads as authoritative to
whoever opens them next.

---

## How to work

Push to `main`. No branch, no pull request, no waiting on a review. Open a
pull request when you want a second pair of eyes — by choice, not because the
repo forces you.

```
git clone https://github.com/clearskyenergy/omega-core.git
cd omega-core
# edit
git commit -am "..."
git push
```

### Before you push

There is no build step, so nothing catches a syntax error for you until a
page is blank in front of a customer. Run the same checks CI does:

```
node scripts/check-html-scripts.js      # every inline script parses, every src resolves
node scripts/test-caps.js               # capacity ledger
node scripts/test-bess-sizer.js         # sizer
node scripts/test-site-intel.js         # site intel
node scripts/tests/extract.js && for t in scripts/tests/t*.js; do node "$t"; done
```

They take seconds and need no `npm install` — that is deliberate, so there is
no excuse to skip them.

### After you push

`tests.yml` runs on every push to `main`. It does not block anything, but a
red `main` means something is broken for every tenant, not just OSA. Glance at
the Actions tab.

**A push to `main` deploys to production.** Vercel ships the repo root. There
is no staging gate between your push and `silmarillion.clearskyomega.com`.

---

## House rules that are not obvious

Full detail is in `CLAUDE.md`; these are the ones people trip on:

- **No build step, no bundler, no transpiler.** Tool files and the shared
  `omega-*.js` runtime are ES5 — `var`, `function`, callbacks — so they run in
  whatever embedded browser a field rep has. Some core pages already use
  ES2015. Match the file you are in; never introduce syntax that needs
  compiling.
- **Single-file HTML tools.** One `.html` with inline CSS and JS, optionally
  one companion `-logic.js`.
- **Pricing, scoring and financial logic lives in `/api/`, never in the
  browser.** Shipped JS is public; anything in it can be read by any tenant.
- **Firestore rules are the security boundary, not the client.** Anything the
  interface hides must also be denied by the rules. A query the rules do not
  permit is refused *entirely* — Firestore does not trim a result set — so a
  client filter and its rule have to agree exactly.
- **Never delete a Firestore document in a migration script.** Flag, don't
  drop.
- **Never commit a secret.** The Firebase web config is public by design and
  may be committed; service-account keys, Stripe keys and API keys live in
  Vercel environment variables only. This repository is public.

---

## The OSA portal

`tenants/osa/README.md` is the tour. `PROCESS.md` is the operating model —
the funnel, the gates, and which questions are feasibility versus
bankability. Worth reading before changing how a stage behaves.

Roles are in `tenants/osa/access-data.js`. The one that catches people:
**the partner tiers cannot write a deal.** `partner_admin`, `member` and
`viewer` hold no `write_deal`, and `canWritePortalDeals()` in the rules is
`isPortalAdmin() || isPortalLimitedAdmin()` — so they cannot adopt a record or
run the spreadsheet importer, which creates a deal per row. The name reads
like more than it grants.

---

## If something goes wrong

`backup/2026-09-19-pre-jv-access` is a branch pinning `main` as it stood
before write access was opened up.

```
git diff backup/2026-09-19-pre-jv-access..main          # everything since
git checkout backup/2026-09-19-pre-jv-access -- <path>  # one file back
```

Nobody will be annoyed about a revert. Breaking something and saying so
quickly is ordinary; breaking something quietly is the only real problem.
