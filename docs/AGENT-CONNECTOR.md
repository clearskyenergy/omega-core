# Connecting a ChatGPT agent to the site portfolio

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

This is how the CFA/OGI JV ChatGPT agent (or any machine) reads the
portfolio's larger sites, gets a site's traced outline as KML and a KMZ
download link, and uploads new sites with their outline — through the same
`deals` records the OSA portfolio shows, with the same scoring engine, and
without a person signing in.

```
ChatGPT Custom GPT ──Action (bearer key)──▶ /api/agent/sites          list · upload
                                           /api/agent/site-outline   ring · KML · KMZ link
                                                      │
                                                      ▼
                                         Firestore `deals` (the OSA portfolio)
                                                      ▲
   Google Earth  ◀── click the KMZ link ── /api/agent/kmz  (signed, no key)
```

## 1. Mint a key (ClearSky, once per agent)

The key is a bearer credential. Firestore stores only its SHA-256; the
plaintext is printed once and never again.

```sh
FIREBASE_SERVICE_ACCOUNT="$(cat sa.json)" \
  node scripts/agent-key.js --org ogisolar.com --label "CFA/OGI JV GPT" --apply
```

- `--org` is the org the key acts **as**: the string in `deals.orgsInvolved[]`.
  For the JV that is a member firm's domain — `ogisolar.com` — not "OGI" and
  not "osa". The key then sees exactly the deals that firm's people see in
  the OSA portfolio, and files new sites as that firm's referrals.
- `--scopes sites:read` for a read-only agent. Default is read and write.
- `--expires 2027-01-01` to time-box it. `--list` and `--revoke <id prefix>`
  manage existing keys. Everything is dry-run without `--apply`.

The key goes to the person configuring the GPT, by a channel that is not a
chat log, a ticket, or this repository (it is public).

## 2. Configure the Custom GPT

In ChatGPT: **Explore GPTs → Create → Configure → Actions → Create new action**.

1. **Import from URL**: `https://silmarillion.clearskyomega.com/api/agent/openapi`
   (any OMEGA host works; the document names the host it was fetched from,
   so a `*.vercel.app` preview tests against itself).
2. **Authentication**: *API Key* · Auth Type *Bearer* · paste the key.
3. Privacy policy URL: the platform's terms page.

Suggested instructions for the GPT (edit freely):

> You are the CFA/OGI JV site assistant. You can list the JV's sites from
> OMEGA (biggest first), fetch a site's traced outline as KML plus a KMZ
> download link, and upload sites with their outline.
>
> When asked for "the larger sites", call `listSites` with `minAcres` and/or
> `minMw` the user names (default: minAcres 100). Present name, state,
> acres, MW, stage and grid score in a table, biggest first, and say how
> many were excluded. For a specific site call `getSiteOutline` and give the
> user the `kmzUrl` verbatim as a link to open in Google Earth; summarise
> the outline (acres, vertices, transmission and substations found) from
> the response — never describe a ring the response does not contain.
> When the user gives you a site (name, address, MW, a KML/KMZ, or a list of
> coordinates), call `uploadSites`; supply `externalId` when the user has an
> id so re-uploads update instead of duplicating. Report per-site results
> exactly as returned (created / updated / unchanged / error).
>
> Every acreage and score is screening evidence from hand-traced geometry.
> Say so when it matters; never call it a survey, a utility study or an
> interconnection clearance.

## 3. What the agent can and cannot do

| Operation | What it touches | Scope |
|---|---|---|
| `listSites` | reads `deals` where `orgsInvolved` contains the key's org | `sites:read` |
| `getSiteOutline` | reads one such deal; builds KML/KMZ from its `outline` | `sites:read` |
| `uploadSites` | creates a deal at `referred`, originated by the key's org, channel `Agent`; or additively updates a match | `sites:write` |

An update may add an outline, fill a blank size/address/state/type, append
a note, and set an `externalId`. It **never** changes `origination`,
`stage`, `funding` or `viability` — those are the decisions the portfolio
locks on purpose (top of `tenants/osa/portfolio-data.js`). A Grid Atlas
score already on a deal is not overwritten by a traced one.

"Larger" is acres first, MW second. Acres come from the traced outline when
there is one (geodesic area of the ring), else from the stated figure.
Sites with only a pin have no acreage and sort below any outlined site.

Dead, parked and discarded sites are excluded unless `includeDead=true`.

## 4. Where the outline comes from

`deals/{id}.outline` is new with this feature:

```
outline: { ring:[[lng,lat],…] closed, acres, statedAcres, centroid:[lng,lat],
           source:'kmz'|'agent-kmz'|'agent-kml'|'agent', fileName, tracedAt, by,
           features:[{type, kind, name, coords, kv?, owner?, diameterIn?}], flags[] }
```

It is written by three paths, all through one builder, `OmegaSiteIntel.outline()`
in `omega-site-intel.js`:

- the OSA portfolio's **Score from KMZ** button, which used to keep the score
  and drop the shape (`tenants/osa/portfolio.html`, `doScoreFromKmz`);
- `uploadSites` with `kml` or `kmzBase64` — the file is parsed, the parcel
  ring kept, transmission/substation/gas placemarks kept as features, and
  the site scored with the same engine (`source:'site-intel'`) when there is
  something to measure against;
- `uploadSites` with a bare `outline` ring, which is measured but not scored.

Sites traced before this shipped have a score and no shape. Their
`getSiteOutline` answer says so and the KML carries a pin; re-score them from
the KMZ button, or have the agent re-upload the file, and the ring appears.

## 5. The KMZ link

`getSiteOutline` returns the KML inline (an Action can only read text) and a
`kmzUrl` a person clicks. The link needs no header, so it carries an HMAC
over (deal id, org, expiry) that `/api/agent/kmz` verifies before reading
anything; it lasts seven days, and a link minted for one deal or one org does
not open another. The file is built on request from the deal's `outline`, so
it is always current; nothing is stored in a bucket.

Signing key: `OMEGA_AGENT_LINK_SECRET` in Vercel, or — so it works the day it
deploys — a digest of the service-account private key already present. Set
the explicit variable when you want to rotate links independently of the
credential. `/api/health` reports whether it is set.

## 6. Operating notes

- Keys live in `agent_keys/{sha256}`; `firestore.rules` denies the
  collection to every client, explicitly. Only the Admin SDK reads it.
- The Admin SDK bypasses `firestore.rules`, so the org scoping is done in
  code (`api/agent/*.js`) and every write goes through `newDealDoc` /
  `updateDoc` in `api/_lib/agent-sites.js`, never a spread of the request.
- `lastUsedAt` on the key row is the audit signal; `activity[]` on each
  deal names the key's label on every write it makes.
- Limits: 100 sites per upload, 4 MB of KML or 6 MB of base64 KMZ per site
  (Vercel's body limit is smaller still), 2,000 ring vertices, 60 features
  of 500 points each — so a deal document stays well inside Firestore's 1 MB.
- Tests: `node scripts/test-agent-sites.js` (in `npm test` and CI). They run
  the handlers against an in-memory Firestore, no credential needed.
