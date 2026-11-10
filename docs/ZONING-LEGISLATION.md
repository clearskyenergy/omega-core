# Zoning & legislation, as reported (2026-11-09)

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

## Why

Section 2 of the site readiness checklist — Zoning & Land Use — was five
open evidence items and nothing else. Grid Atlas could not say that the
city a site sits in had paused data-center permits, or that a state bill
on large loads was moving. A competitor's tracker prompted the question
(Tommy, 2026-11-09: "take this site and find out what we can use"). What
was used is the **idea**. Every record here was gathered from a primary
public source or a news report, with the link on it. No compiled
commercial tracker is a source, and none may become one.

## What it reads at a pin

`omega-zoning-watch.js` (ES5, pure) takes the **county** of the pin — the
first five digits of the FCC census-block GEOID that the fiber lookup
already fetched — and the project type of the chosen profile, and returns

- **Local measures (county)** — the moratoria, zoning amendments and
  decisions on file for that county's governments, and
- **State measures** — the laws, bills, commission tariffs and rules on
  file for the state,

each record with its status as reported, the date, a one-line summary in
our words and the source link. Grid Atlas draws them under
*⚖ Zoning & legislation — as reported*, and the three due-diligence
profiles carry the two readings as rows (`cp-zl` / `cp-zs`, `bs-…`, `sc-…`).

## What it is not — the rules the module is built around

- **Not a legal status.** A record says what a source reported on the day
  it was read. Chamber passage is not enactment (`pending`, never
  `enacted`). There is **no pass**: the rows are *risk*, *conditional* or
  *unknown*, because a tracker that found nothing has cleared nothing.
- **Not complete.** "None on file" means the tracker holds no record for
  the county. It is conditional, and its note says the coverage is
  incomplete and to ask the planning department.
- **Not a parcel determination.** The pin gives the county, never the
  municipality. A city's measure applies inside that city, and the note
  says so. When the searched address names the city, that city's measures
  lead their rank — the hint orders, it never filters.
- **An expiry date that has passed is a question.** Moratoria get extended.
  An in-force record past its reported expiry reads "expiry date passed —
  confirm", never "lapsed" and never "in force".
- **Read the measure.** Several moratoria carry size thresholds (75 MW in
  Edmond and, after amendment, Oklahoma City; 5 MW in Bloomington; 1 MW in
  Santa Fe County). Whether a 1 MW container is caught is in the text, not
  in this tracker.
- Not legal advice.

## The dataset — `data/zoning/measures.json`

181 records for eight states, built 2026-11-09:

| State | Records | State-level | Local | Local moratoria reported in force |
|---|---:|---:|---:|---:|
| Alabama | 20 | 4 | 16 | 11 |
| Arkansas | 26 | 12 | 14 | 5 |
| Illinois | 23 | 6 | 17 | 7 |
| Kansas | 26 | 7 | 19 | 11 |
| Missouri | 26 | 9 | 17 | 9 |
| New Mexico | 18 | 10 | 8 | 4 |
| Ohio | 20 | 9 | 11 | 9 |
| Oklahoma | 22 | 12 | 10 | 8 |

By subject: 154 touch data centers / large loads, 30 battery storage, 15 EV
charging. 292 source links: 96 primary (legislature, commission, municipal),
196 news.

Each record: `id`, `state`, `level` (state · county · municipal — a township
is municipal), `jurisdiction`, `countyFips[]`, `subjects[]`, `type`,
`effect` (restrictive · enabling · procedural · fiscal), `title`, `status`
(proposed · pending · enacted · active · rejected · expired · withdrawn ·
watch), `statusDate`, `effective`, `expires`, `summary`, `note`,
`confidence`, and `sources[]` with `url`, `publisher`, `kind`
(primary · news) and `retrieved`.

### How it was gathered

Four research passes (two states each) searched for measures from 2023 on,
and were required to OPEN a supporting page for every record and to drop
any record they could not support. Nine records were then re-read against
their sources independently (Santa Fe County, City of Foley, Alabama
SB 270's enrolled text, City of Mattoon, the Ohio commission's AEP order,
Webster and Nodaway counties, Oklahoma City, Sedgwick County): all nine
matched. That is a sample, not an audit — `confidence` and `note` on each
record say what was and was not confirmed, and many dates are the report's
date rather than the vote's.

Three moratoria stated a fixed term and a start date but no end date; their
`expires` is computed and their note says so.

## Keeping it true

```bash
node scripts/check-zoning-measures.js
```

asks every source link whether it still answers and lists the dead ones
(it does not read pages and cannot see a status change). When it was built,
287 of 292 answered, none were dead, four belonged to one news site that
refuses scripts and one was rate-limited.

To add or correct a record, edit the JSON by hand with the source open,
set `retrieved`, and run `node scripts/tests/tzoningwatch.js` — it holds
the shape of every record (a status from the vocabulary, county FIPS that
belong to the state, an https source with a publisher and a date, no
commercial tracker as a source) and runs the whole file through the judge.

## A portfolio

`scripts/fiber-confirm-portfolio.js` now adds the county and the reported
local measures for data centers, battery storage and EV charging to every
row, saying for each whether the measure names the site's own city or only
shares its county.

## Not built

- **It goes stale.** Nothing refreshes it. Local measures in particular
  move monthly: this is a snapshot of 2026-11-09 and says so on screen
  ("tracker as of"). A scheduled research pass that proposes changes for
  review is the obvious next step.
- **Eight states.** Elsewhere the rows read unknown — "no coverage".
- **County, not municipality.** A point-in-city test (Census places) would
  turn "same county" into "inside the city limits".
- **Not the zoning itself.** It does not know a parcel's district or what
  is permitted there; those stay open evidence items in the checklist.
- **No bill tracking by API.** State bills were read from legislature pages
  once; a session's later actions are not followed.
- Counties without zoning authority (most of unincorporated Alabama and
  Missouri) pass moratoria whose enforceability is contested; the notes
  flag it where the source did, the tracker does not judge it.
