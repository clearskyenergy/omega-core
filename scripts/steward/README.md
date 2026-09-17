# The Steward

An agent that runs omega-core every day: checks it has not been altered, runs
the tests, checks the deployment still refuses strangers, reports on the data
and fiber layers, and proposes interface fixes. It opens pull requests. It does
not merge them.

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

---

## Run it

```
npm run steward              # the full daily pass, prints the brief
npm run steward:guard        # integrity only — this is what CI gates on
npm run steward:api          # the endpoint registry: what exists, who may call it
npm run steward:ux           # UX/accessibility findings across every page
npm run steward:data         # data layers + fiber sources
npm run steward:accept       # fold today's findings into the baseline (reviewed)

node scripts/steward/run.js --offline     # no network
node scripts/steward/run.js --out brief.md
```

Nothing needs installing. No dependencies, no build step, ES5 — the same
constraint the rest of the repo runs under.

---

## The five parts

| file | answers |
|---|---|
| `guard.js` | Did anything change that should not have? |
| `probe.js` | Is the deployment up, and does every endpoint still refuse an anonymous caller? |
| `data-watch.js` | Are the grid/fiber/land layers current, and are their upstreams answering? |
| `ux-review.js` | What is mechanically wrong for a user, on all ~72 pages? |
| `api-registry.js` | What is the API surface, and who is allowed to call each part? |
| `run.js` | All of the above, in one brief, in the order that makes the answers trustworthy. |

---

## "Protect it from being altered"

A repository cannot prevent its own editing. What it can do is make an
unreviewed change impossible to make quietly. Three layers do that here, and
only the third is new:

1. **CODEOWNERS** puts a human on the pull request. Already in the repo.
2. **`.github/workflows/tests.yml`** fails the PR when the code stops working.
   Already in the repo.
3. **`guard.js`** fails the PR when the code stops obeying CLAUDE.md — which
   nothing checked before, because a repo with no build step has no compiler
   to check it.

### The ratchet

The repo carries real debt today: files with no copyright header, twenty-one
hand-mirrored copies of the org-alias map, six endpoints with no token check.
A guard that failed on all of it would be switched off within a week.

So every finding has a stable key, and `baseline.json` lists the ones already
known. **Guard fails only on a key that is not in the baseline** — that is, on
breakage introduced by the change under review. Existing debt stays visible in
the brief without blocking anyone.

Paying debt down means deleting lines from `baseline.json`. That is a normal
pull request, and a good one.

### Sealed files

Nine files are exempt from the ratchet because a change to any of them changes
who can reach what:

```
firestore.rules   storage.rules            api/_lib/admin.js
omega-sso.js      api/_lib/verify-token.js omega-tenant.js
vercel.json       .vercelignore            CODEOWNERS
```

Their hashes live in `baseline.json`. Changing one fails the build with
`SEALED FILE CHANGED` until the new hash is committed by
`npm run steward:accept` **in the same pull request**. The hash does not stop
the edit. It stops the edit from being invisible, and CODEOWNERS does the rest.

### What guard checks

| check | the failure it catches |
|---|---|
| `es5` | ES2015 in a file an embedded browser downloads and cannot transpile |
| `sealed` | a change to the security boundary |
| `secret` | a literal credential committed to the repo |
| `served-server-code` | serverless source sitting in the static tree, downloadable |
| `browser-env` | `process.env` in a page the browser downloads |
| `core-copy` | a tenant folder carrying a fork of a core file |
| `org-alias` | one mirror of `orgAlias()` folding a different set of domains than the rest |
| `roster-read` | a bare `orgsInvolved` in rules — fails the whole evaluation on older documents |
| `boot-order` | a sign-in page that skips `omega-tenant.js` or loads it before `omega-brand.js` |
| `api-auth` | an endpoint with no token check, especially one spending a paid key |
| `header` | shipped source with no copyright line |

---

## API access

> Short version: the steward is an ordinary Firebase user in a staff domain. It
> is not an admin credential, and it cannot become one.

"Give it access to all our APIs" has an obvious reading — a service-account key
with admin rights — and that reading is wrong here for three reasons the repo
already knows:

1. `api/_lib/verify-token.js` exists *because* creating a service-account key on
   `clearsky-portal` is refused by the org policy
   `constraints/iam.disableServiceAccountKeyCreation`. Weakening that so a bot
   can run nightly is a bad trade.
2. An admin credential bypasses `firestore.rules` entirely, and CLAUDE.md is
   explicit that the rules *are* the security boundary. A steward that runs
   outside the boundary it exists to protect cannot be reasoned about.
3. A daily agent needs to read nearly everything and write nearly nothing.
   Those are different grants and should not be one credential.

### Setting it up

1. Create a Firebase Auth user in a staff domain — `steward@csebuilders.com`.
   `isStaffEmail()` in `api/_lib/admin.js` will recognise it, so `/api/health`
   and the staff-gated read endpoints answer it.
2. Add an `omega_staff/{uid}` document with role `rep` if the endpoints you
   want it to reach check that collection rather than the email domain.
3. Put these in GitHub Actions secrets (and nowhere else):

   ```
   FIREBASE_WEB_API_KEY      the public web API key — public by design
   OMEGA_STEWARD_EMAIL       steward@csebuilders.com
   OMEGA_STEWARD_PASSWORD    that account's password
   OMEGA_API_BASE            https://silmarillion.clearskyomega.com
   ```

4. `node scripts/steward/client.js --whoami` confirms the identity without
   printing the token.

### The rails

- **Only endpoints marked `stewardSafe`** in `api-registry.js` are callable on
  a schedule. That list is short, hand-reviewed and read-only: `health`,
  `network-proximity`, `grid-atlas`, `parcel`, `push-key`. Everything else
  refuses in `client.js`, before the network.
- **Writes need a person.** `OMEGA_STEWARD_ALLOW_WRITES=1` *and* an explicit
  `--allow-writes` on the command line. A cron job sets neither.
- **A call budget per run** (`OMEGA_STEWARD_MAX_CALLS`, default 60), so a loop
  cannot become a bill.
- **The token is never logged or written to disk**, and every response is
  scrubbed of key-shaped strings before it is printed or put in a brief.
- **No credential is a supported state.** The probe's most valuable check —
  does every endpoint refuse an anonymous caller — needs no identity by
  definition, and runs on a fresh clone with nothing configured.

### Revoking it

Disable the Firebase user. That is the whole procedure. Nothing else holds a
credential, and nothing cached survives the hour the ID token expires in.

---

## What it found on the first run, 2026-09-17

Recorded here because a baseline with no explanation is just a list.

- **Nine serverless-function sources were being served as static text**,
  including the Grid Atlas scoring model (`/grid-atlas.js`) and the CRM proxy
  whose header says it is "the ONLY place CRM credentials live". Vercel treats
  only root `/api` as functions; every other copy is a file, and the root is
  the web. Fixed the same day in `.vercelignore` — nothing referenced them, so
  nothing changed but their reachability.
- **Five endpoints answer an anonymous caller and spend a paid vendor key** —
  `crm-sync`, `greenfield`, `score`, `stencil`, `validation`. Confirmed against
  the live deployment, not just the source: each answered a POST with no token
  at all. `stencil` and `validation` also send `Access-Control-Allow-Origin: *`.
  Anyone with the URL can make these cost money. A sixth, `grid-atlas`, is open
  but spends nothing. **Not fixed** — adding auth changes behaviour for whatever
  calls them today, and that is a decision for a person, not a first commit.
- **Twenty-one independent copies of the org-alias map.** CLAUDE.md calls it a
  known wart and estimates three.
- **A Google Maps key is hardcoded** in `sales-proposal.html`, which the file's
  own comment already flags, along with the referrer restriction it needs.
- `data/land-listings.json` is past its 30-day budget and says so itself: a
  seed file of July 2026 listings with approximate coordinates.

The same run confirmed the healthy side: **24 endpoints correctly refuse a
caller with no token**, and three 200s that first looked like missing gates
(`network-proximity`, `render`, `push-key`) turned out to be deliberate — two
status banners on `GET` with the real work gated behind `POST`, and a public
VAPID key. Those three are why `probe.js` asks the method that does the work
and why `api-registry.js` carries an `INTENTIONALLY_OPEN` list: a check that
cries wolf is a check nobody reads.

Each of the findings above is in `baseline.json` as known debt, so they appear in the brief
every morning without blocking anyone — until somebody deletes the line.

---

## What it will not do

- It does not commit, push, deploy, or call an endpoint that writes.
- It produces a brief and an exit code. The agent acts on the brief, and every
  action it takes arrives as a pull request a person merges.
- The UX section is mechanical. It finds what is measurably wrong, not what is
  badly designed. Taste still needs eyes.
- The auth class in the registry is derived by reading the source. It is a
  starting point for review, not a substitute for reading the file.
