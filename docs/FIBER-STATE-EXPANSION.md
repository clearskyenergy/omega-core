# Fiber for the portfolio states — expansion of 2026-11-09

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

## Why

A 104-site charging portfolio (66 sites in Oklahoma) was screened in Grid
Atlas and almost every site read "no route in view": the bundled inventory
held three records for Oklahoma, six for New Mexico and none for Missouri or
Arkansas (Tommy, 2026-11-09: "go out and get all the fiber we need for these
states"). `scripts/import-state-fiber.js` is the answer: a sweep of public
route layers, and a **vetted registry** of the ones that may be bundled.

## Coverage, before and after

| State | Records before | Line parts before | Records now | Line parts now |
|---|---:|---:|---:|---:|
| Oklahoma | 3 | 6 | 1,110 | 78,627 |
| New Mexico | 6 | 215 | 264 | 11,584 |
| Missouri | 0 | 0 | 834 | 10,456 |
| Alabama | 114 | 4,910 | 1,971 | 49,143 |
| Kansas | 866 | 3,027 | 4,948 | 12,805 |
| Arkansas | 0 | 0 | 519 | 36,953 |
| Ohio | 514 | 1,549 | 4,124 | 35,202 |
| Illinois | 466 | 18,689 | 2,000 | 34,877 |

Inventory total: **44,433 records / 459,827 line parts across 44 state areas**
(was 30,580 / 218,350 across 41). Read the line parts, not the records: a tiled source packs thousands of
street segments into one record per carrier and cell. Still partial public coverage — not every
cable, not every carrier. Missing routes mean unknown, never "no fiber".

## The line the registry draws

A layer is imported only if it is

- **published by a public agency** — a DOT, a state broadband office, a
  county, a city or its utility; or
- **a carrier's own published network map** — its own organisation's layer,
  made for wholesale customers or the public.

It is **not** imported if it is a contractor's working upload, an 811 /
locate export, a design-tool export, or a carrier's internal plant records
that somebody left shared. Several such layers were public when the sweep
ran — cable, telephone and long-haul plant uploaded by locating and
engineering firms, a utility's ArcFM export of its own fiber, co-op
work-order plant — and were deliberately left out. *Reachable without a
token is not published.* Customer **drops** are never imported from any
source, and neither are wireless backhaul links.

## Sources imported

| Source id | Publisher | Records | Line parts |
|---|---|---:|---:|
| `ok-odot-broadband-lines` | Oklahoma Department of Transportation | 432 | 63,708 |
| `ok-obo-middle-mile-projects` | Oklahoma Broadband Office | 22 | 22 |
| `ok-ponca-city-fiber` | City of Ponca City, Oklahoma | 4 | 3,528 |
| `ok-owasso-city-fiber` | City of Owasso, Oklahoma | 224 | 224 |
| `fiberlight-published-cable` | FiberLight, LLC | 62 | 152 |
| `uniti-kinetic-dark-fiber` | Uniti (Windstream / Kinetic), as published | 874 | 56,828 |
| `uniti-wholesale-dark-fiber` | Uniti, as published | 1,537 | 55,682 |
| `zayo-all-fiber` | Zayo Group, as published | 1,821 | 14,995 |
| `segra-fiber-network` | Segra, as published | 386 | 16,632 |
| `ks-middle-mile-backbone` | Connected Nation (Kansas middle-mile IXP development) | 2,404 | 2,404 |
| `ks-middle-mile-lateral` | Connected Nation (Kansas middle-mile IXP development) | 452 | 452 |
| `ks-middle-mile-blown-fiber` | Connected Nation (Kansas middle-mile IXP development) | 471 | 471 |
| `ks-lawrence-leasable-fiber` | Douglas County, Kansas GIS | 389 | 389 |
| `al-aldot-fiber-utility-lines` | Alabama Department of Transportation | 326 | 326 |
| `al-adeca-awarded-middle-mile` | Alabama Department of Economic and Community Affairs | 159 | 159 |
| `al-flashfiber-rings` | Joe Wheeler EMC / FlashFiber | 756 | 756 |
| `al-flashfiber-distribution` | Joe Wheeler EMC / FlashFiber | 56 | 3,606 |
| `ar-russellville-fiber-duct` | City Corporation, Russellville, Arkansas | 8 | 12,736 |
| `mo-independence-fiber` | City of Independence, Missouri | 95 | 95 |
| `mo-monett-fiber` | City of Monett, Missouri | 262 | 262 |
| `oh-pickaway-horizon-fiber` | Pickaway County GIS, Ohio | 427 | 3,288 |
| `oh-henry-county-telephone-fiber` | Henry County Engineer, Ohio | 79 | 2,155 |
| `oh-dublin-dublink` | City of Dublin, Ohio | 323 | 323 |
| `oh-summit-county-fiber-route` | County of Summit GIS, Ohio | 518 | 518 |
| `oh-hamilton-city-overhead-fiber` | City of Hamilton, Ohio | 303 | 303 |
| `oh-kettering-fiber` | City of Kettering, Ohio | 328 | 328 |
| `oh-centerville-fiber` | City of Centerville, Ohio | 523 | 523 |
| `il-kane-county-fiber` | Kane County, Illinois | 329 | 329 |
| `il-idot-d4-fiber-links` | Tri-County Regional Planning Commission (IDOT District 4 data) | 37 | 37 |
| `il-peru-city-fiber` | City of Peru, Illinois | 246 | 246 |

Every source's URL, item, retrieval time, terms note and SHA-256 are in
`data/usa-fiber/manifest.json`. Most carry no explicit reuse licence: the
publisher's attribution is retained and terms should be verified before any
redistribution beyond screening.

### Notes that matter when reading a result

- **Oklahoma DOT "Broadband Lines"** is provider-submitted and mixed. The
  importer sorts it: wireless backhaul, customer drops and the
  civil/conduit/path duplicates of one design are dropped; proposed and
  funded builds are `planned`; a provider that states no medium — Cox, with
  48,474 lines — is labelled *"medium not stated — may be coaxial plant"*
  rather than called fiber. A line submitted jointly by several telephone
  companies is one record naming them together.
- **Carrier maps** (Uniti / Kinetic, Zayo, Segra, FiberLight, FlashFiber)
  say where the carrier's network runs, not that a strand is available:
  `routeStatus` is "Status not established" unless the publisher's own
  inventory status says built.
- **Northwest Missouri and much of rural New Mexico still have no public
  route layer.** That is what the FCC provider lookup is for — see
  `docs/FIBER-CONFIRMATION.md`.

## How it stores

- Geometry is the publisher's, rounded to six decimals (0.1 m). Nothing is
  routed, snapped, joined or drawn.
- A high-volume source is **tiled**: its segments are grouped per carrier,
  status and 0.1° cell into one multi-part record, so 60,000 street segments
  are a few hundred records the map filters by viewport. Every part is still
  the publisher's own line and `publishedLineParts` counts them. *A record
  is not a cable* — the manifest already said so; for a tiled source it is a
  carrier's lines in one cell.
- IDs are the source id plus a hash of the geometry, so a re-run that finds
  the same lines writes the same IDs and a changed source replaces only its
  own records.

## Refresh

```bash
node scripts/import-state-fiber.js --cache /path/to/cache
```

```bash
node scripts/import-published-fiber.js
```

```bash
npm run test:fiber
```

The first fetches (or reads the cache) and merges; the second rebuilds
overviews, the manifest and the API shards and must always follow. `--dry`
reports without writing; `--only <id>` runs one source; `--states` names a
different set. A registry entry without a pinned `url` resolves through the
discovery snapshot (`candidates.json` in the cache) — adding a state means
running the sweep again and **reading what it finds** before a line is
added to the registry. That reading is the control.

## Size

`data/usa-fiber` 181 → 245 MB; `data/fiber-api` (bundled into the two fiber
functions) 33 → 42 MB; the national overview 27 → 36 MB.

## Not built

- No removal pass: a source that disappears upstream stays until someone
  drops it from the registry.
- No per-source licence review beyond the registry's rule; see above.
- The sweep found far more than was imported for the states it covered —
  including dense metro plant that failed the provenance rule. If a carrier
  relationship produces an approved export, import it through this script.
- States outside the eight are untouched.
