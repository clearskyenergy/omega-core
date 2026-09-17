# The Steward

Jarvis's daily maintenance pass over omega-core: checks it has not been
altered, runs the tests, checks the deployment still refuses strangers, reports
on the data and fiber layers, and proposes interface fixes. It opens pull
requests. It does not merge them.

It reports **to Jarvis**, not beside him — the brief lands where Jarvis can read
it and the blocking findings land on his backlog, so a steward finding is ranked
against everything else he is tracking rather than competing with it. See
[Part of Jarvis](#part-of-jarvis).

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
npm run steward:jarvis       # what it would report to Jarvis (dry run)
npm run steward:file         # actually file the brief and the backlog items

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
| `jarvis.js` | Files that brief with Jarvis, and puts the blocking findings on his backlog. |

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

## Part of Jarvis

The pass used to file its brief as a GitHub issue, which is the one place nobody
looks while they are working. Jarvis is where the work is already tracked — the
backlog, "To do — ranked", "Needs you" — so a finding that does not reach Jarvis
is a finding that competes with Jarvis for attention and loses.

Three joins, and the steward writes nothing else anywhere:

**1. The brief, at `/api/steward`.** One document per day in `omega_steward`,
staff-gated both ways. `npm run steward:file` puts it there. A second run the
same day replaces it, so the collection is a history at daily resolution;
nothing deletes, because yesterday's brief is how you tell what changed.

**2. The backlog, through the twin's `/task` door.** The same call the editor's
"File with Jarvis" button makes, so a steward finding and a person's note land in
one queue and get ranked against each other. Only **blocking** findings are
filed, only **once** — yesterday's brief is read back first and anything already
on it is skipped, capped at eight either way. A backlog that receives 95 known
findings every morning is a backlog somebody mutes in a week, and then the one
that mattered arrives muted. If the previous brief cannot be read, it files
nothing rather than risk filing everything twice.

**3. Mission Control › System › Integrity.** The panel reads `/api/steward` and
shows the verdict, the counts and the findings, throttled to five minutes
because a brief changes once a day and the dashboard refreshes every thirty
seconds. It says "no brief filed yet" rather than rendering empty, because an
empty panel reads as all-clear.

**And Jarvis in the editor can answer from it.** `/api/jarvis-help` hands a
**staff** caller's turn the latest summary, so "is anything broken?" is answered
from today's facts. It goes in a separate system block, not in `KNOWLEDGE`: a
brief names which endpoints are unauthenticated and which sealed files moved —
ClearSky's operations, not a tenant's — and folding a daily-changing summary into
the cached block would invalidate that cache for every tenant to serve a handful
of staff. A tenant asking gets nothing.

### The three writes, and why they are functions

`client.js` refuses any endpoint not on the steward-safe list. The three things
the steward may write are **functions with their URL hardcoded**, taking no
target argument — `publishBrief()`, `fileWithJarvis()`, `lastBrief()` — so the
entirety of what it can write is those shapes to those addresses, and none of
them can be aimed at anything else by passing a name. `/api/steward` therefore
shows as *not* steward-callable in `npm run steward:api`, which is accurate:
`call('steward')` is refused, and the publisher does not go through `call()`.

All three need `--file` passed by hand or by the daily workflow. Dry run is the
default, because the steward's posture is propose-and-let-a-person-apply — the
same L2 rung Jarvis already runs on — and a publisher that wrote the moment it
was invoked would be the one part of it that did not.

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

## The caller trace, 2026-09-17

Asked of the five open endpoints: *who calls this today, and would adding a
token check break them?* Traced by hand; every line number below was read.

**None of the five callers sends an `Authorization` header.** All send
`Content-Type: application/json` and nothing else. So a server-side token check
alone WOULD break them — each fix is two-sided: the caller attaches the token,
the endpoint verifies it, and both ship together.

The client half is not new work. `editor.html` already does exactly this in
three places — `/api/rfq` (line 37330), `/api/bess-size` (115641), and a
generic helper at 154041 that attaches the header only when a token exists.
There is an `idToken()` helper at 153547 that returns null when signed out.

| endpoint | caller | verdict |
|---|---|---|
| `greenfield` | **none** | The only `greenfield` hits in the repo are the editor's site-condition UI (greenfield/brownfield), which is unrelated, plus a comment in the unreachable `commercial.js`. Gate it with no client change. Do this one first. |
| `stencil` | `editor.html:8017` | Already has a documented fallback (PATH 2, a direct Gemini call with the user's own key) and a user-facing message at 8103. Safe: wrap in `idToken()`, add the header. |
| `validation` | `editor.html:55846` | Runs inside a flow that writes to `projects` via `_db` immediately afterwards, so the user is signed in by definition at that point. Safe. |
| `score` | `tenants/osa/portfolio-data.js:1814` | Gated behind `scoringEnabled()`, which is off unless config turns it on, and the URL is overridable via `scoringCfg().relayUrl`. **JV-partner territory** — `/tenants/osa/` is governed by the JV agreement and CODEOWNERS, so the client half needs OSA's sign-off, not just ours. |
| `crm-sync` | `editor.html:72512, 72532, 72543, 72644` | See below. This one is not a cost problem. |

### `api/crm-sync.js` — the org comes from the request body

Not "it spends a paid key". The handler takes the tenant from the caller:

```js
const orgId = body && body.orgId;                 // line 65 — no token, anywhere
if (action === "delete_credentials") await SECRETS.del(orgId);      // 81
if (action === "save_credentials")  await SECRETS.save(orgId, ...); // 76
if (action === "sync")              await pushRecord(store, job);   // 108
```

`orgId` is the tenant's email domain (CLAUDE.md), so there is nothing to guess.
An unauthenticated POST can therefore, for any tenant: delete their stored CRM
credentials, overwrite them, push attacker-supplied records into their real CRM
using their own tokens, or use `action:"test"` as an oracle for which orgs have
a CRM connected and which provider. The blob itself is never returned to the
caller — that part is right.

The file's own header says it is "the ONLY place CRM credentials live".

**Precisely how much of this is live is not visible from outside.** The store
is Upstash Redis behind `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`;
if those are unset in Vercel the actions fail before touching anything and
today's impact is nil. The live probe got HTTP 400 (`"orgId required"`, which is
checked before any Redis call), so it confirms the endpoint runs and reaches the
body — not whether the store is configured. **`/api/health` does not monitor
either variable**, so nobody can answer that question without opening the Vercel
dashboard. Registering them in `EXPECTED` is a one-line fix and worth doing
regardless.

The fix derives `orgId` from the verified token instead of the body, which is
what every other endpoint in `api/` already does. Note that the handler's
`Access-Control-Allow-Headers` is `Content-Type` only (line 57), so it would
also need `Authorization` added or the browser will strip it.

---

## What it will not do

- It does not commit, push, deploy, or call an endpoint that writes — with the
  three hardcoded exceptions above, which write its own brief to its own
  collection and its own findings to Jarvis's backlog, and nothing else.
- It produces a brief and an exit code. The agent acts on the brief, and every
  action it takes arrives as a pull request a person merges.
- The UX section is mechanical. It finds what is measurably wrong, not what is
  badly designed. Taste still needs eyes.
- The auth class in the registry is derived by reading the source. It is a
  starting point for review, not a substitute for reading the file.
