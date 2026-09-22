/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   The BATTERY HOST LEASE: "rent us some space on your site and we pay you X
   a year for N years."

   The site finder sizes a battery against a circuit. This turns that size
   into the number a rep can put in front of the property owner: a ground
   lease for a fenced pad, paid monthly, escalating, over a fixed term. The
   host owns nothing, buys nothing and operates nothing; they rent the space
   and the interconnection path and receive rent.

   It is the sibling of api/compute-lease.js, not a copy of it: that model
   prices a compute pad and is gated on fiber, which a battery does not need.
   The arithmetic is deliberately simple enough to say out loud in a room —
   pad rent for the acres, plus a capacity rent for the kW, escalated, with a
   floor so a small system still produces a number worth a signature.

   THE RATE CARD IS BUILT FROM PUBLISHED HOST-LEASE BENCHMARKS (2024–2026),
   listed in RATE_CARD.sources so the basis can be shown and challenged:
     · battery storage ground leases $1,500–5,000/acre-yr nationally,
       $500–1,500 in lower-demand Midwest markets, $2,000–3,000 within a few
       miles of a substation (LandApp, 2025);
     · commercial rooftop host leases $40–100/kW-yr in strong markets with
       1–2.5% annual escalators (pv magazine USA, Mar 2026; Lumen, 2025);
     · Illinois has procured 3 GW of storage and Chicago-area landlords with
       spare land are the named host market (Crain's Chicago Business /
       Canary Media, 2026).
   A C&I pad is a fraction of an acre, so the per-acre figure alone would
   understate what the site is worth; the interconnection point is what is
   scarce, and the capacity term carries most of the rent. Bands are a
   market view, tuned per market as signed comps come in — per CLAUDE.md
   they live here, server-side, never in a browser file, and non-staff
   callers receive the rent, never the rates. */
'use strict';

var RATE_CARD = {
  version: 'site-lease-rate-card-v2',
  asOf: '2026-09-22',
  sources: [
    'LandApp, Battery Storage Land Lease Payments (2025): $1,500–5,000/acre-yr; Midwest $500–1,500; near a substation $2,000–3,000',
    'pv magazine USA, Commercial rooftop solar leases (13 Mar 2026): $40–100/kW-yr benchmarks, 1–2.5% escalators',
    'Lumen, How much can your building earn from a rooftop solar lease (2025): $0.25–0.85/sq ft-yr roof rent',
    'Crain\'s Chicago Business / Canary Media (2026): Illinois 3 GW storage procurement; Chicago landlords with spare land as hosts'
  ],
  /* $/kW-year of battery power, the price of the interconnection point the
     host is lending. Utility-scale storage ground leases price by the acre
     because land is what is scarce there; on a C&I pad the point of
     interconnection is what is scarce, so the capacity term dominates. */
  capacityPerKwYear: { low: 25, base: 40, high: 60 },
  /* $/acre-year for the fenced pad itself. Above farmland solar rent
     ($500–2,000/acre-yr) and below urban ground-lease comps, because the pad
     is small and the neighbour is a working business. */
  padPerAcreYear: { low: 2500, base: 4000, high: 6500 },
  /* A 20 ft container with clearances, PCS skid and a transformer pad is
     roughly 0.05 acre per unit; the smallest fenced pad worth building is
     about a tenth of an acre. Used only when the rep gives no acreage. */
  acresPerMwh: 0.05,
  minLeasedAcres: 0.1,
  floorMonthly: 500,
  escalatorPct: { low: 2.0, base: 2.5, high: 3.0 },
  termYears: 15,
  termBounds: [5, 30]
};

function num(v) { var n = Number(v); return (v === '' || v == null || !isFinite(n)) ? null : n; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function round(v, d) { var m = Math.pow(10, d || 0); return Math.round(v * m) / m; }

/* Sum of an escalating annuity: y1 + y1(1+e) + … over n years. */
function escalatedTotal(first, e, n) {
  if (!e) return first * n;
  return first * (Math.pow(1 + e, n) - 1) / e;
}

function padAcresFor(kwh) {
  return Math.max(RATE_CARD.minLeasedAcres, round((kwh || 0) / 1000 * RATE_CARD.acresPerMwh, 2));
}

/* offer({kw, kwh, acres?, termYears?}) → the three bands. Pure. */
function offer(input) {
  input = input || {};
  var kw = num(input.kw), kwh = num(input.kwh);
  if (!(kw > 0)) throw Object.assign(new Error('kw is required'), { status: 400 });
  if (!(kwh > 0)) kwh = kw * 4;
  var acresGiven = num(input.acres);
  var acres = acresGiven > 0 ? Math.max(acresGiven, RATE_CARD.minLeasedAcres) : padAcresFor(kwh);
  var term = num(input.termYears);
  term = term ? Math.round(clamp(term, RATE_CARD.termBounds[0], RATE_CARD.termBounds[1])) : RATE_CARD.termYears;
  var bands = ['low', 'base', 'high'], monthly = {}, annual = {}, termTotal = {}, components = {}, floored = [];
  bands.forEach(function (b) {
    var pad = acres * RATE_CARD.padPerAcreYear[b];
    var cap = kw * RATE_CARD.capacityPerKwYear[b];
    var gross = pad + cap;
    if (gross < RATE_CARD.floorMonthly * 12) { gross = RATE_CARD.floorMonthly * 12; floored.push(b); }
    annual[b] = Math.round(gross);
    monthly[b] = Math.round(gross / 12);
    termTotal[b] = Math.round(escalatedTotal(gross, RATE_CARD.escalatorPct[b] / 100, term));
    components[b] = { padAnnual: Math.round(pad), capacityAnnual: Math.round(cap), escalatorPct: RATE_CARD.escalatorPct[b] };
  });
  return {
    model: 'site-lease-v1',
    termYears: term, kw: kw, kwh: kwh,
    leasedAcres: round(acres, 2), acresDerived: !(acresGiven > 0),
    monthly: monthly, annual: annual, termTotal: termTotal,
    perKwYear: { low: round(annual.low / kw, 1), base: round(annual.base / kw, 1), high: round(annual.high / kw, 1) },
    escalatorPct: RATE_CARD.escalatorPct,
    floored: floored,
    components: components,
    rateCard: { version: RATE_CARD.version, asOf: RATE_CARD.asOf, termYears: RATE_CARD.termYears, floorMonthly: RATE_CARD.floorMonthly },
    basis: 'Pad rent for the fenced area plus a capacity rent for the interconnected kW, escalated annually over the term. Bands built from published 2024–2026 host-lease benchmarks (storage ground leases per acre, rooftop host leases per kW); tuned per market as signed comps come in.',
    howToUse: [
      'Open with the base figure. The low band is the walk-away; the high band is what a site with a confirmed feeder and clean title can command.',
      'Rent starts at commercial operation. Nothing is owed while the interconnection is studied.',
      'The host keeps title, keeps their meter and pays nothing. The lease covers the fenced pad and an access easement.'
    ]
  };
}

module.exports = { offer: offer, escalatedTotal: escalatedTotal, padAcresFor: padAcresFor, RATE_CARD: RATE_CARD };
