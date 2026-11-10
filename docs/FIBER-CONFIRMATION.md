# Fiber confirmation — who has fiber at an address, and how it gets verified (2026-11-09)

© 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

## Why

Grid Atlas could say how far a published route was from a pin. When the
inventory had no route — most of rural Oklahoma, Missouri, New Mexico — it
said "0 / 100, no route in view" and nothing else: not who serves the
address, not who to call, not what a carrier must put in writing before a
lender accepts the fiber (Tommy, 2026-11-09: "ways we can go and confirm the
fiber … I need to be able to know on an address the fiber provider and the
telecom details and all things needed to get fiber verification").

A map with no line on it is not a site with no fiber. It is a site nobody
has asked a carrier about. `omega-fiber-confirm.js` answers **who do we
ask, what do we ask, and what must come back**.

## The ladder

Four rungs, each a different kind of evidence, never merged:

| Rung | What it is | Where it comes from |
|---|---|---|
| 1 · Mapped | published route geometry near the site | the bundled inventory (`docs/FIBER-STATE-EXPANSION.md`) |
| 2 · Reported | a named provider reports fiber-to-the-premises at the address | FCC Broadband Data Collection |
| 3 · Quoted | the carrier answered the RFI with a written quote | a person files it |
| 4 · Confirmed | a service order, or the carrier's written confirmation at the offtake bandwidth | a person files it |

Public data reaches rung 2 and **never further**. Nothing in the platform
marks a site Quoted or Confirmed.

## What is read at the pin (all public, keyless, asked live)

- **FCC Broadband Data Collection, December 2025** (Esri Living Atlas): the
  site's census block, its H3 resolution-8 hex and a ~1.5 km ring of hexes —
  every provider × technology with location counts. Technology 50 is fiber
  to the premises. The ring exists because a site on the edge of town sits
  in a block with no serviceable location while the town beside it is fully
  served; a silent block is said to be silent, not empty.
- **FCC study-area boundaries, August 2024** (published by the FCC): the
  incumbent local exchange carrier of record — company, holding company,
  study area code, OCN, and price-cap vs rate-of-return (rural) regulation.
  A rate-of-return telephone cooperative has usually built fiber.

Caveat carried on every screen and brief: BDC is provider self-reported,
mass-market availability. It proves plant in the ground nearby and names the
carrier. It does **not** prove dedicated symmetrical service — only the
carrier's quote does.

## What the panel shows (Grid Atlas › pin › ◈ Confirm fiber)

1. The ladder, with the reading for each rung.
2. **Telecom at this address** — the telephone company of record; every
   wireline and fixed-wireless provider by technology with location counts;
   fiber within ~1.5 km; the census block (carriers ask for it).
3. **Carriers to ask, in order** — fiber in the block, fiber in the hex or
   ring, the incumbent, cable operators (fiber-fed plant), then operators of
   published routes. Each with *why* it is on the list; one company once.
   A link to the FCC Form 499 filer database for contact details (it
   refuses automated requests, so it is a link, never fetched).
4. **Verification package** — nine items: three public facts (providers,
   incumbent, mapped routes) and six carrier documents (serviceability
   statement, written quote, lateral scope, diversity statement, handoff and
   SLA, service order). The platform never ticks a carrier document.
5. **Copy carrier RFI** and **Copy verification brief** — plain text. Both
   wear no platform or tenant name: the sender signs them. The RFI asks for
   10 Gbps symmetrical (5 minimum), the readiness checklist's figure — edit
   it to the offtake.
6. **FCC map at this point** — the FCC's own map for a human cross-check.

The compute due-diligence profile gains two §6 rows from the same lookup:
*Carriers reporting fiber at the site (FCC)* and *Incumbent telephone
company of record*. The DD export carries the package and the telecom facts.

Also fixed on the way: **FCC Fiber Coverage** was a Utah-only layer filtered
on a field it did not have, so it never drew outside Utah and "FCC fiber
service" never read true for an Oklahoma site. It is now the national BDC
hex layer. A due-diligence profile now survives switching one extra layer on
or off, and choosing a profile re-reads the pin at once.

## A whole portfolio

```bash
node scripts/fiber-confirm-portfolio.js portfolio.csv --out work/fiber-confirm/<name>
```

One row per site — fiber status, providers in the block / hex / ring, the
incumbent, cable providers, the nearest published route and its operator,
the ordered carriers to ask, the census block, the FCC map link — plus
`fiber-verification-briefs.txt` with a brief and RFI for every site.

The sheet is deal data: output defaults to `work/` and is never committed.
Each street address goes to the US Census geocoder; an address it cannot
match falls back to the town centre and the row is marked **APPROXIMATE**,
because a town centre is not the site. A sheet with Latitude / Longitude
columns is never geocoded.

## Held by

`scripts/tests/tfiberconfirm.js` (in `npm test`), no network: the FCC rows
become the right facts; the ladder never climbs past Reported on public
data; a failed or unrun lookup is unknown, not "none"; the carrier order and
de-duplication; the package never marks a carrier document in hand; the RFI
and brief carry the address, block and bandwidth and no platform name; the
page wiring and the DD rows.

## Not built

- **No saved state.** Rungs 3 and 4 are not recorded anywhere yet: a quote
  or a serviceability letter has no place to be filed against a site. The
  site record (`sites/{id}`, the Portfolio register) is the natural home.
- **The lookup runs in the browser**, like the page's other public layers.
  `/api/fiber-screen` and the Portfolio register do not call it yet, so a
  portfolio is confirmed with the script, not from the register.
- **No carrier contact data.** The FCC filer database is linked, not read.
- **No wire-center or exchange boundaries** (which central office serves the
  address). Two state layers exist publicly; there is no national one.
- **Speeds are not shown.** This publication of the BDC carries served
  counts by technology, not each provider's advertised speed tier.
- The FCC layers are third-party services: when one is slow or down the
  panel says the lookup failed — which is not a reading — and the rest of
  the pin analysis is unaffected.
