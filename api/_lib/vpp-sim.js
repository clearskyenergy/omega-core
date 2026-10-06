/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/vpp-sim.js — VPP EARNINGS SIMULATOR (server only, pure, ES5)

   WHAT IT ANSWERS. "If this site's battery were enrolled in a managed
   virtual power plant — the DividendVPP model (Molecule Systems execution +
   Lightsmith optimisation) — what would it earn a year, stream by stream?"
   From a ZIP code, the site type and whatever load data the customer has:

     interval   an 8760 (hourly) or 15-minute file, one year of kW/kWh
     bills      12–24 months of bills: kWh, peak kW, $ (any of them)
     profile    nothing but an annual kWh (or not even that) — a shaped
                load for the site type, labelled as such

   The same intake DividendVPP's own "earnings estimator" onboarding asks
   for. It runs an hour-by-hour dispatch of the battery against the site's
   own load and tariff (bill savings: demand charges and time-of-use
   arbitrage, priced by the ONE tariff engine, bess-tariff.js) and stacks
   the grid-service programmes open at that ZIP on top, picking one per
   exclusivity group the way an operator must (a kW sold to ELRP cannot be
   sold again to DSGS for the same hours).

   WHAT IT IS NOT. It is not DividendVPP's number. Molecule has not
   published an estimator API (moleculesystems.com/developer: "coming
   soon"), so this is OUR simulation of what such a platform can stack,
   carrying their PUBLISHED commercial terms (70% owner / 20% platform /
   10% installer on programme earnings, no upfront fee). When their API is
   available, api/_lib/vpp-provider.js swaps the provider and every page
   that reads /api/vpp-estimate follows.

   HONESTY RULES (the same as value-stack.js, whose PJM figures are reused):
     - every stream carries a tier: 'computed' (from THIS site's load and
       tariff), 'published' (a dated public figure) or 'planning' (a rate
       this platform carries for screening; the ref says what replaces it);
     - a stream the site cannot earn is listed under `missing` with the
       reason, never silently dropped and never defaulted to a number;
     - the load source and the tariff source are stated on the result,
       with a confidence that follows the weaker of the two.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var T = require('./bess-tariff');
var V = require('./value-stack');

var VERSION = 'vpp-sim-1';
var HOURS_YEAR = 8760;
var YEAR_START_DOW = 3;        /* the simulated calendar is 2025: 1 Jan = Wednesday */
var DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
var SEGMENTS = ['residential', 'commercial', 'industrial'];
var SUMMER = [5, 6, 7, 8];     /* Jun–Sep, month index 0–11 */

/* DividendVPP's published split (moleculesystems.com/dividend-vpp,
   read 2026-09-29): programme earnings, not bill savings, which never leave
   the customer's meter. */
var SPLIT = { owner: 0.70, platform: 0.20, installer: 0.10,
  ref: 'DividendVPP published revenue share: 70% asset owner, 20% platform, 10% installer/partner; ' +
       'no upfront platform fee (moleculesystems.com/dividend-vpp).' };

function num(v, d) { var n = Number(v); return (v == null || v === '' || !isFinite(n)) ? d : n; }
function r2(n) { return Math.round(n * 100) / 100; }
function r0(n) { return Math.round(n); }
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
function has(o, k) { return !!o && Object.prototype.hasOwnProperty.call(o, k); }

/* ── WHERE: ZIP → state → market ─────────────────────────────────────────
   The first three digits of a US ZIP name a sectional centre, and those map
   to states in published ranges. The market is the state's ISO/RTO, with
   the few states that straddle two refined by prefix. It is a screening
   answer and says so: the utility is inferred, and the page lets the user
   correct the market. */
var ZIP3 = [
  [5, 5, 'NY'], [6, 9, 'PR'], [10, 27, 'MA'], [28, 29, 'RI'], [30, 38, 'NH'], [39, 49, 'ME'],
  [50, 54, 'VT'], [55, 55, 'MA'], [56, 59, 'VT'], [60, 69, 'CT'], [70, 89, 'NJ'],
  [100, 149, 'NY'], [150, 196, 'PA'], [197, 199, 'DE'], [200, 205, 'DC'], [206, 219, 'MD'],
  [220, 246, 'VA'], [247, 268, 'WV'], [270, 289, 'NC'], [290, 299, 'SC'], [300, 319, 'GA'],
  [320, 349, 'FL'], [350, 369, 'AL'], [370, 385, 'TN'], [386, 397, 'MS'], [398, 399, 'GA'],
  [400, 427, 'KY'], [430, 459, 'OH'], [460, 479, 'IN'], [480, 499, 'MI'], [500, 528, 'IA'],
  [530, 549, 'WI'], [550, 567, 'MN'], [569, 569, 'DC'], [570, 577, 'SD'], [580, 588, 'ND'],
  [590, 599, 'MT'], [600, 629, 'IL'], [630, 658, 'MO'], [660, 679, 'KS'], [680, 693, 'NE'],
  [700, 714, 'LA'], [716, 729, 'AR'], [730, 749, 'OK'], [750, 799, 'TX'], [800, 816, 'CO'],
  [820, 831, 'WY'], [832, 838, 'ID'], [840, 847, 'UT'], [850, 865, 'AZ'], [870, 884, 'NM'],
  [885, 885, 'TX'], [889, 898, 'NV'], [900, 961, 'CA'], [967, 968, 'HI'], [970, 979, 'OR'],
  [980, 994, 'WA'], [995, 999, 'AK']
];

var MARKETS = {
  CAISO: 'California ISO', ERCOT: 'ERCOT (Texas)', PJM: 'PJM Interconnection',
  NYISO: 'New York ISO', ISONE: 'ISO New England', MISO: 'MISO', SPP: 'Southwest Power Pool',
  SE: 'Southeast (vertically integrated utilities)', WEST: 'West (vertically integrated utilities)',
  HI: 'Hawaii', AK: 'Alaska', PR: 'Puerto Rico'
};
var STATE_MARKET = {
  CA: 'CAISO', TX: 'ERCOT', NY: 'NYISO',
  MA: 'ISONE', RI: 'ISONE', NH: 'ISONE', ME: 'ISONE', VT: 'ISONE', CT: 'ISONE',
  NJ: 'PJM', PA: 'PJM', DE: 'PJM', MD: 'PJM', DC: 'PJM', VA: 'PJM', WV: 'PJM', OH: 'PJM',
  IL: 'MISO', MN: 'MISO', IA: 'MISO', WI: 'MISO', MI: 'MISO', IN: 'MISO', MO: 'MISO',
  AR: 'MISO', LA: 'MISO', MS: 'MISO', ND: 'MISO',
  KS: 'SPP', OK: 'SPP', NE: 'SPP', SD: 'SPP',
  NC: 'SE', SC: 'SE', GA: 'SE', FL: 'SE', AL: 'SE', TN: 'SE', KY: 'SE',
  AZ: 'WEST', NV: 'WEST', CO: 'WEST', UT: 'WEST', NM: 'WEST', ID: 'WEST', MT: 'WEST',
  WY: 'WEST', OR: 'WEST', WA: 'WEST',
  HI: 'HI', AK: 'AK', PR: 'PR'
};
/* Prefix refinements where a state straddles two markets. */
var ZIP3_MARKET = [
  [600, 611, 'PJM', 'ComEd (northern Illinois)'],
  [640, 649, 'SPP', 'Evergy (Kansas City)'],
  [790, 791, 'SPP', 'Xcel/SPS (Texas Panhandle)'],
  [798, 799, 'WEST', 'El Paso Electric'],
  [410, 410, 'PJM', 'Duke Energy Kentucky'],
  [270, 279, 'SE', 'Duke / Dominion NC']
];
var CLIMATE = {  /* monthly load multipliers by climate, Jan..Dec */
  hot:   [0.85, 0.82, 0.86, 0.92, 1.05, 1.20, 1.30, 1.30, 1.17, 0.98, 0.86, 0.87],
  mixed: [1.05, 0.98, 0.92, 0.88, 0.95, 1.10, 1.22, 1.20, 1.02, 0.90, 0.92, 1.04],
  cold:  [1.18, 1.10, 1.00, 0.90, 0.88, 0.98, 1.08, 1.06, 0.94, 0.92, 1.00, 1.14],
  mild:  [1.02, 0.98, 0.97, 0.96, 0.97, 1.00, 1.05, 1.07, 1.04, 0.98, 0.96, 1.00]
};
var STATE_CLIMATE = {
  TX: 'hot', AZ: 'hot', NV: 'hot', FL: 'hot', LA: 'hot', MS: 'hot', AL: 'hot', GA: 'hot',
  SC: 'hot', OK: 'hot', AR: 'hot', NM: 'hot', CA: 'mixed', HI: 'mild', PR: 'mild',
  MN: 'cold', ND: 'cold', SD: 'cold', WI: 'cold', MI: 'cold', ME: 'cold', VT: 'cold',
  NH: 'cold', MT: 'cold', WY: 'cold', AK: 'cold', ID: 'cold', IA: 'cold'
};
/* Annual AC yield, kWh per kW-dc, for a fixed south-facing array. NREL
   PVWatts ranges by region, rounded; a screening figure. */
var SOLAR_YIELD = { AZ: 1750, NV: 1720, NM: 1700, CA: 1620, UT: 1560, CO: 1520, TX: 1480,
  HI: 1500, FL: 1400, OK: 1420, KS: 1420, GA: 1350, NC: 1330, SC: 1350, AL: 1320 };

function zip3Of(zip) {
  var m = /^\s*(\d{5})(?:-\d{4})?\s*$/.exec(String(zip == null ? '' : zip));
  return m ? { zip: m[1], z3: parseInt(m[1].slice(0, 3), 10) } : null;
}

function locate(zip, marketOverride) {
  var z = zip3Of(zip);
  if (!z) return { ok: false, error: 'A five-digit US ZIP code is needed.' };
  var state = null, i;
  for (i = 0; i < ZIP3.length; i++) if (z.z3 >= ZIP3[i][0] && z.z3 <= ZIP3[i][1]) { state = ZIP3[i][2]; break; }
  if (!state) return { ok: false, error: 'ZIP ' + z.zip + ' is not a US state ZIP this simulator covers.' };
  var market = STATE_MARKET[state] || 'SE', area = null;
  for (i = 0; i < ZIP3_MARKET.length; i++) {
    if (z.z3 >= ZIP3_MARKET[i][0] && z.z3 <= ZIP3_MARKET[i][1]) { market = ZIP3_MARKET[i][2]; area = ZIP3_MARKET[i][3]; break; }
  }
  var inferred = true;
  if (marketOverride && has(MARKETS, marketOverride)) { market = marketOverride; inferred = false; }
  var nyc = state === 'NY' && ((z.z3 >= 100 && z.z3 <= 104) || (z.z3 >= 110 && z.z3 <= 116));
  return {
    ok: true, zip: z.zip, state: state, market: market, marketName: MARKETS[market],
    area: area || (nyc ? 'Con Edison (New York City)' : null), nyc: nyc,
    comed: state === 'IL' && z.z3 >= 600 && z.z3 <= 611,
    climate: STATE_CLIMATE[state] || 'mixed',
    solarYield: SOLAR_YIELD[state] || 1250,
    marketInferred: inferred
  };
}

/* ── THE LOAD ────────────────────────────────────────────────────────────
   Always an 8760 of hourly kW by the end, with a label saying where it
   came from. */

/* Normalised 24-hour shapes (weekday, weekend), mean 1.0. */
var SHAPES = {
  residential: {
    wd: [0.55, 0.50, 0.48, 0.47, 0.48, 0.60, 0.85, 1.00, 0.90, 0.78, 0.74, 0.74,
         0.76, 0.80, 0.88, 1.00, 1.20, 1.45, 1.65, 1.70, 1.62, 1.42, 1.08, 0.75],
    we: [0.60, 0.54, 0.50, 0.49, 0.49, 0.55, 0.70, 0.88, 1.02, 1.08, 1.10, 1.10,
         1.10, 1.10, 1.12, 1.18, 1.30, 1.45, 1.55, 1.55, 1.46, 1.30, 1.00, 0.76]
  },
  commercial: {
    wd: [0.45, 0.43, 0.42, 0.42, 0.44, 0.55, 0.80, 1.15, 1.45, 1.60, 1.68, 1.72,
         1.72, 1.74, 1.72, 1.66, 1.55, 1.35, 1.05, 0.80, 0.65, 0.55, 0.50, 0.47],
    we: [0.45, 0.43, 0.42, 0.42, 0.43, 0.46, 0.52, 0.60, 0.68, 0.72, 0.75, 0.76,
         0.76, 0.76, 0.75, 0.72, 0.68, 0.62, 0.56, 0.52, 0.50, 0.48, 0.46, 0.45]
  },
  industrial: {
    wd: [0.78, 0.76, 0.75, 0.75, 0.78, 0.88, 1.05, 1.18, 1.22, 1.24, 1.25, 1.24,
         1.20, 1.24, 1.25, 1.24, 1.20, 1.10, 1.00, 0.95, 0.90, 0.86, 0.82, 0.80],
    we: [0.70, 0.68, 0.68, 0.68, 0.68, 0.70, 0.74, 0.78, 0.80, 0.82, 0.82, 0.82,
         0.82, 0.82, 0.82, 0.80, 0.78, 0.76, 0.74, 0.72, 0.72, 0.71, 0.70, 0.70]
  },
  /* Two host shapes the compute site pro forma (compute-site.js) builds on;
     the VPP intake still offers its three segments only. A multifamily
     HOUSE meter (corridors, garage, lifts, amenity HVAC) is flat with an
     evening shoulder; a retail meter follows opening hours. */
  multifamily: {
    wd: [0.80, 0.76, 0.74, 0.73, 0.75, 0.85, 1.00, 1.08, 1.02, 0.96, 0.94, 0.95,
         0.97, 0.98, 1.00, 1.04, 1.12, 1.22, 1.30, 1.30, 1.24, 1.14, 1.00, 0.88],
    we: [0.82, 0.78, 0.76, 0.75, 0.75, 0.80, 0.90, 1.00, 1.06, 1.08, 1.08, 1.08,
         1.08, 1.06, 1.06, 1.08, 1.14, 1.22, 1.28, 1.28, 1.22, 1.12, 1.00, 0.88]
  },
  retail: {
    wd: [0.45, 0.43, 0.42, 0.42, 0.43, 0.48, 0.60, 0.85, 1.20, 1.45, 1.55, 1.60,
         1.62, 1.62, 1.60, 1.58, 1.55, 1.50, 1.40, 1.20, 0.95, 0.70, 0.55, 0.48],
    we: [0.45, 0.43, 0.42, 0.42, 0.43, 0.46, 0.55, 0.78, 1.10, 1.38, 1.50, 1.56,
         1.58, 1.58, 1.56, 1.52, 1.46, 1.36, 1.20, 1.00, 0.80, 0.62, 0.52, 0.47]
  }
};
var DEFAULT_ANNUAL_KWH = { residential: 10800, commercial: 300000, industrial: 2400000, multifamily: 450000, retail: 350000 };

function dayOfWeek(dayIndex) { return (YEAR_START_DOW + dayIndex) % 7; }
function isWeekend(dayIndex) { var d = dayOfWeek(dayIndex); return d === 0 || d === 6; }
function monthStarts() {
  var out = [], h = 0; for (var m = 0; m < 12; m++) { out.push(h); h += DAYS[m] * 24; } return out;
}
var MONTH_START = monthStarts();
function monthOfHour(h) { var m = 11; while (m > 0 && h < MONTH_START[m]) m--; return m; }

/* An hourly shape for one month (raw, not scaled), with a small
   deterministic day-to-day ripple so a month is not 30 identical days —
   a battery sized against identical days under-counts the one bad day. */
function shapeMonth(segment, m) {
  var s = SHAPES[segment] || SHAPES.commercial, out = [];
  for (var d = 0; d < DAYS[m]; d++) {
    var day = MONTH_START[m] / 24 + d, we = isWeekend(day);
    var ripple = 1 + 0.08 * Math.sin(day * 1.7) + 0.05 * Math.sin(day * 0.37 + 1.3);
    var row = we ? s.we : s.wd;
    for (var h = 0; h < 24; h++) out.push(row[h] * ripple);
  }
  return out;
}

/* Scale a month's raw shape to hit a target kWh and, when known, a target
   peak. The shape is raised to a power p (found by bisection) until its
   peak-to-mean ratio is the bill's, then scaled to the kWh: the mean and
   the peak both land exactly and no hour ever goes negative, which a
   linear stretch cannot promise on a peaky month. */
function fitMonth(raw, kwh, peakKw) {
  var n = raw.length, i, avg = kwh / n, out = new Array(n);
  function ratio(p) {
    var mean = 0, mx = 0;
    for (var k = 0; k < n; k++) { var v = Math.pow(raw[k], p); mean += v; if (v > mx) mx = v; }
    mean /= n; return { r: mx / mean, mean: mean };
  }
  var p = 1;
  if (peakKw > avg) {
    var want = peakKw / avg, lo = 0, hi = 1;
    while (ratio(hi).r < want && hi < 64) hi *= 2;
    for (var it = 0; it < 50; it++) { var mid = (lo + hi) / 2; if (ratio(mid).r < want) lo = mid; else hi = mid; }
    p = hi;
  }
  var mean = ratio(p).mean;
  for (i = 0; i < n; i++) out[i] = Math.pow(raw[i], p) / mean * avg;
  return out;
}

/* One interval file → hourly kW. Accepts a bare column of numbers or a CSV
   whose LAST numeric column is the load; kWh-per-interval is converted when
   the caller says so. 8760/8784 hourly or 35040/35136 quarter-hourly. */
function parseInterval(text, unit) {
  var lines = String(text || '').split(/\r?\n/), vals = [], i;
  for (i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    if (!line) continue;
    var cells = line.split(/[,\t;]/), v = null;
    for (var c = cells.length - 1; c >= 0; c--) {
      var s = cells[c].replace(/["\s$]/g, '');
      if (s !== '' && /^-?\d*\.?\d+(e-?\d+)?$/i.test(s)) { v = parseFloat(s); break; }
    }
    if (v == null) continue;           /* a header or a blank row */
    vals.push(v);
  }
  return intervalToHourly(vals, unit);
}
function intervalToHourly(vals, unit) {
  if (!Array.isArray(vals)) return { ok: false, error: 'The interval data is not a list of readings.' };
  var n = vals.length, per;
  if (n === 8760 || n === 8784) per = 1;
  else if (n === 35040 || n === 35136) per = 4;
  else if (n === 17520 || n === 17568) per = 2;
  else return { ok: false, error: 'An interval file must be one year: 8,760 hourly or 35,040 fifteen-minute readings (' + fmt(n) + ' found).' };
  var kwh = unit === 'kwh', out = [], bad = 0;
  for (var h = 0; h < HOURS_YEAR; h++) {
    var s = 0;
    for (var j = 0; j < per; j++) {
      var v = Number(vals[h * per + j]);
      if (!isFinite(v)) { bad++; v = 0; }
      s += kwh ? v * per : v;           /* kWh in a 1/per-hour interval → kW */
    }
    out.push(Math.max(0, s / per));
  }
  if (bad > n * 0.02) return { ok: false, error: fmt(bad) + ' readings are not numbers.' };
  var notes = [];
  if (n === 8784 || n === 35136 || n === 17568) notes.push('A leap-year file: the last day was dropped to fit the 8,760-hour calendar.');
  if (bad) notes.push(fmt(bad) + ' unreadable readings were read as zero.');
  return { ok: true, kw: out, notes: notes, readings: n };
}

/* Bills: [{month:'2025-07'|0-11, kwh, peakKw, cost}] — 12 to 24 rows. With
   24 the two years are averaged by calendar month, which is what a year of
   bills cannot tell you on its own: whether this summer was the odd one. */
function billsToMonths(bills) {
  if (!Array.isArray(bills) || !bills.length) return { ok: false, error: 'No bills were given.' };
  if (bills.length > 24) return { ok: false, error: 'Send at most 24 months of bills.' };
  var acc = [], i;
  for (i = 0; i < 12; i++) acc.push({ n: 0, kwh: 0, kwhN: 0, peak: 0, peakN: 0, cost: 0, costN: 0 });
  for (i = 0; i < bills.length; i++) {
    var b = bills[i] || {}, m = null;
    if (typeof b.month === 'number') m = b.month;
    else { var mm = /^(\d{4})-(\d{1,2})/.exec(String(b.month || '')); if (mm) m = parseInt(mm[2], 10) - 1; }
    if (m == null || !(m >= 0 && m <= 11)) return { ok: false, error: 'Bill ' + (i + 1) + ' has no month (use YYYY-MM).' };
    var kwh = num(b.kwh, null), pk = num(b.peakKw, null), cost = num(b.cost, null);
    if (kwh == null && cost == null) return { ok: false, error: 'Bill ' + (i + 1) + ' needs kWh or a dollar amount.' };
    if ((kwh != null && kwh < 0) || (pk != null && pk < 0) || (cost != null && cost < 0)) return { ok: false, error: 'Bill ' + (i + 1) + ' has a negative figure.' };
    var a = acc[m]; a.n++;
    if (kwh != null) { a.kwh += kwh; a.kwhN++; }
    if (pk != null && pk > 0) { a.peak += pk; a.peakN++; }
    if (cost != null) { a.cost += cost; a.costN++; }
  }
  var months = [], covered = 0;
  for (i = 0; i < 12; i++) {
    var x = acc[i];
    months.push({ month: i, kwh: x.kwhN ? x.kwh / x.kwhN : null, peakKw: x.peakN ? x.peak / x.peakN : null,
                  cost: x.costN ? x.cost / x.costN : null });
    if (x.n) covered++;
  }
  return { ok: true, months: months, covered: covered, rows: bills.length };
}

function buildLoad(input, loc, segment) {
  var intake = input.load || {}, clim = CLIMATE[loc.climate], notes = [], m, i;
  if (intake.type === 'interval') {
    var p = Array.isArray(intake.values) ? intervalToHourly(intake.values, intake.unit)
                                          : parseInterval(intake.text, intake.unit);
    if (!p.ok) return p;
    return { ok: true, kw: p.kw, source: 'interval', quality: 'high', notes: p.notes,
             label: 'Your interval data (' + fmt(p.readings) + ' readings)' };
  }
  if (intake.type === 'bills') {
    var b = billsToMonths(intake.bills);
    if (!b.ok) return b;
    if (b.covered < 12) {
      /* Fill the missing calendar months by the climate curve, anchored on
         the months we have — and say so. */
      var sum = 0, wsum = 0;
      for (m = 0; m < 12; m++) if (b.months[m].kwh != null) { sum += b.months[m].kwh; wsum += clim[m]; }
      if (!wsum) return { ok: false, error: 'The bills carry no kWh, so the load cannot be shaped.' };
      for (m = 0; m < 12; m++) if (b.months[m].kwh == null) b.months[m].kwh = sum / wsum * clim[m];
      notes.push((12 - b.covered) + ' calendar month(s) had no bill and were filled from the climate curve.');
    }
    var kw = [], anyPeak = false, fromCost = false;
    for (m = 0; m < 12; m++) {
      var mo = b.months[m];
      if (mo.kwh == null) { fromCost = true; mo.kwh = 0; }
      if (mo.peakKw) anyPeak = true;
      var fit = fitMonth(shapeMonth(segment, m), mo.kwh, mo.peakKw);
      for (i = 0; i < fit.length; i++) kw.push(fit[i]);
    }
    if (fromCost) notes.push('A month with dollars but no kWh was left at zero load; add the kWh for a fair answer.');
    if (!anyPeak && segment !== 'residential') notes.push('No bill carried a peak kW, so each month\'s peak comes from the ' + segment + ' load shape — add the billed demand for a real demand-charge figure.');
    return { ok: true, kw: kw, source: 'bills', quality: (anyPeak || segment === 'residential') && b.covered >= 12 ? 'medium' : 'low',
             notes: notes, months: b.months, label: b.rows + ' month(s) of bills, shaped hour by hour for a ' + segment + ' site' };
  }
  var annual = num(intake.annualKwh, null), assumed = false;
  if (!(annual > 0)) { annual = DEFAULT_ANNUAL_KWH[segment]; assumed = true; }
  var wsum2 = 0; for (m = 0; m < 12; m++) wsum2 += clim[m] * DAYS[m];
  var out = [];
  for (m = 0; m < 12; m++) {
    var target = annual * clim[m] * DAYS[m] / wsum2;
    var f = fitMonth(shapeMonth(segment, m), target, null);
    for (i = 0; i < f.length; i++) out.push(f[i]);
  }
  return { ok: true, kw: out, source: 'profile', quality: 'low',
           notes: [assumed ? 'No load was given: a typical ' + segment + ' site of ' + fmt(annual) + ' kWh a year was assumed.'
                           : 'A ' + segment + ' load shape scaled to ' + fmt(annual) + ' kWh a year.'],
           label: assumed ? 'Typical ' + segment + ' load (assumed)' : 'Typical ' + segment + ' shape at your annual kWh' };
}

/* Hourly PV output for kWdc at the site's yield: a half-sine day whose
   length follows the season, scaled to the annual yield. */
function solarProfile(kwdc, loc) {
  if (!(kwdc > 0)) return null;
  var raw = [], sum = 0, m, d, h;
  for (m = 0; m < 12; m++) {
    var season = Math.cos((m - 5.5) / 12 * 2 * Math.PI);        /* +1 midsummer */
    var len = 12 + 2.2 * season, rise = 12 - len / 2, amp = 0.78 + 0.22 * season;
    for (d = 0; d < DAYS[m]; d++) for (h = 0; h < 24; h++) {
      var t = h + 0.5, v = 0;
      if (t > rise && t < rise + len) v = amp * Math.pow(Math.sin(Math.PI * (t - rise) / len), 1.3);
      raw.push(v); sum += v;
    }
  }
  var scale = kwdc * loc.solarYield / sum, out = new Array(raw.length);
  for (h = 0; h < raw.length; h++) out[h] = raw[h] * scale;
  return out;
}

/* ── THE TARIFF ──────────────────────────────────────────────────────────
   A regional PLANNING rate (URDB shape, priced by bess-tariff.js), unless
   the caller brings a URDB record or their own rates. Bills that carry
   dollars calibrate it: the modelled bill for their load is scaled to what
   they actually paid. */
var RATE_BOOK = {
  /*        on-peak window        residential on/off  C&I energy on/off, demand $/kW-mo */
  CAISO: { win: [16, 21], res: [0.55, 0.36], com: [0.30, 0.20, 24], ind: [0.22, 0.15, 26], resWinter: [0.45, 0.38] },
  ERCOT: { win: [15, 20], res: [0.17, 0.13], com: [0.10, 0.08, 9],  ind: [0.08, 0.06, 10] },
  PJM:   { win: [14, 19], res: [0.20, 0.14], com: [0.12, 0.09, 14], ind: [0.09, 0.07, 16] },
  NYISO: { win: [14, 18], res: [0.30, 0.22], com: [0.21, 0.16, 28], ind: [0.15, 0.11, 24] },
  ISONE: { win: [13, 18], res: [0.34, 0.27], com: [0.23, 0.18, 18], ind: [0.18, 0.14, 15] },
  MISO:  { win: [14, 19], res: [0.18, 0.13], com: [0.12, 0.09, 14], ind: [0.08, 0.06, 16] },
  SPP:   { win: [15, 19], res: [0.16, 0.12], com: [0.11, 0.08, 12], ind: [0.07, 0.05, 14] },
  SE:    { win: [14, 19], res: [0.22, 0.11], com: [0.12, 0.09, 13], ind: [0.08, 0.06, 15] },
  WEST:  { win: [16, 19], res: [0.28, 0.11], com: [0.13, 0.09, 16], ind: [0.09, 0.07, 16] },
  HI:    { win: [17, 22], res: [0.48, 0.36], com: [0.40, 0.33, 20], ind: [0.34, 0.28, 22] },
  AK:    { win: [17, 21], res: [0.26, 0.24], com: [0.22, 0.20, 14], ind: [0.18, 0.16, 15] },
  PR:    { win: [18, 22], res: [0.30, 0.26], com: [0.28, 0.24, 18], ind: [0.25, 0.21, 18] }
};

function touSchedule(win) {
  var wd = [], we = [], m, h;
  for (m = 0; m < 12; m++) {
    var a = [], b = [];
    for (h = 0; h < 24; h++) { a.push(h >= win[0] && h < win[1] ? 1 : 0); b.push(0); }
    wd.push(a); we.push(b);
  }
  return { wd: wd, we: we };
}

function buildTariff(input, loc, segment, calibScale) {
  var rt = input.tariff || {};
  if (rt.urdb && typeof rt.urdb === 'object') {
    var tu = T.normalize(rt.urdb);
    if (!tu.hasEnergy && !tu.hasFlatDemand && !tu.hasTouDemand) return { ok: false, error: 'That URDB tariff carries no energy or demand charges.' };
    return { ok: true, tariff: tu, source: 'urdb', label: 'Your tariff: ' + tu.name, win: null };
  }
  var book = RATE_BOOK[loc.market] || RATE_BOOK.SE;
  var win = [clamp(num(rt.peakStart, book.win[0]), 0, 23), clamp(num(rt.peakEnd, book.win[1]), 1, 24)];
  if (win[1] <= win[0]) win = book.win.slice();
  var res = segment === 'residential', row = res ? book.res : (segment === 'industrial' ? book.ind : book.com);
  var on = num(rt.onPeakRate, row[0]), off = num(rt.offPeakRate, row[1]);
  var demand = res ? num(rt.demandCharge, 0) : num(rt.demandCharge, row[2]);
  var own = rt.onPeakRate != null || rt.offPeakRate != null || rt.demandCharge != null;
  var k = calibScale || 1, sched = touSchedule(win);
  var raw = {
    name: own ? 'Your rates' : ('Planning ' + (res ? 'residential TOU' : segment + ' TOU + demand') + ' rate, ' + loc.market),
    energyratestructure: [[{ rate: off * k }], [{ rate: on * k }]],
    energyweekdayschedule: sched.wd, energyweekendschedule: sched.we,
    flatdemandstructure: demand > 0 ? [[{ rate: demand * k }]] : [],
    flatdemandmonths: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    fixedchargefirstmeter: res ? 12 : 45
  };
  if (res && book.resWinter && !own) {
    /* A seasonal residential rate (California's): winter months price at the winter pair. */
    raw.energyratestructure.push([{ rate: book.resWinter[1] * k }], [{ rate: book.resWinter[0] * k }]);
    for (var m = 0; m < 12; m++) if (SUMMER.indexOf(m) < 0) {
      for (var h = 0; h < 24; h++) { raw.energyweekdayschedule[m][h] += 2; raw.energyweekendschedule[m][h] = 2; }
    }
  }
  return { ok: true, tariff: T.normalize(raw), source: own ? 'user' : 'planning', win: win,
           rates: { onPeak: r2(on * k), offPeak: r2(off * k), demand: r2(demand * k) },
           label: raw.name + ' — on-peak ' + win[0] + ':00–' + win[1] + ':00 weekdays' +
                  (own ? '' : '. A screening rate, not this customer\'s tariff; their bill or a URDB record replaces it.') };
}

/* The tariff a load is billed on: the caller's own rates or URDB record,
   else the market's planning rate, scaled so the modelled bill matches the
   dollars on the bills when three or more months carry them. The one
   calibration rule, shared with the compute site pro forma. */
function calibratedTariff(input, loc, segment, L) {
  var tf = buildTariff(input, loc, segment, 1);
  if (!tf.ok) return tf;
  var calib = null;
  if (L.source === 'bills' && tf.source === 'planning') {
    var paid = 0, paidMonths = [], mi;
    for (mi = 0; mi < 12; mi++) if (L.months[mi].cost != null) { paid += L.months[mi].cost; paidMonths.push(mi); }
    if (paidMonths.length >= 3) {
      var loadOnly = bill(L.kw, tf.tariff), modelled = 0;
      for (mi = 0; mi < paidMonths.length; mi++) modelled += loadOnly.months[paidMonths[mi]].subtotal;
      if (modelled > 0) {
        var k = clamp(paid / modelled, 0.4, 2.5);
        tf = buildTariff(input, loc, segment, k);
        calib = { factor: r2(k), note: 'The planning rate was scaled by ' + r2(k) + '× so the modelled bill matches the ' +
                  paidMonths.length + ' month(s) of dollars on the bills' + (k !== paid / modelled ? ' (capped)' : '') + '.' };
      }
    }
  }
  return { ok: true, tf: tf, calib: calib };
}

/* Hourly energy price and a demand-billed flag, read back off the
   normalised tariff so a URDB record and a planning rate dispatch alike. */
function priceSeries(t) {
  var price = new Float64Array(HOURS_YEAR), h;
  for (h = 0; h < HOURS_YEAR; h++) {
    var m = monthOfHour(h), day = Math.floor(h / 24), hr = h % 24;
    var p = (isWeekend(day) ? t.energyWeekend : t.energyWeekday)[m][hr];
    var tiers = t.energyRates[p] || t.energyRates[0];
    price[h] = tiers ? tiers[0].rate : 0;
  }
  return price;
}

function bill(kw, t) {
  var clipped = new Array(kw.length);
  for (var i = 0; i < kw.length; i++) clipped[i] = kw[i] > 0 ? kw[i] : 0;
  var b = T.billFromProfile({ kw: clipped, dt: 1, startMonth: 0, startDayOfWeek: YEAR_START_DOW }, t);
  var energy = 0, demand = 0, fixed = 0, i2, j;
  for (i2 = 0; i2 < b.months.length; i2++) {
    var L = b.months[i2].lines;
    for (j = 0; j < L.length; j++) {
      if (L[j].kind === 'energy' || L[j].kind === 'adder') energy += L[j].amount;
      else if (L[j].kind.indexOf('demand') === 0) demand += L[j].amount;
      else fixed += L[j].amount;
    }
  }
  return { total: b.total, energy: energy, demand: demand, fixed: fixed, months: b.months };
}

/* ── THE BATTERY ─────────────────────────────────────────────────────── */
function defaultBattery(segment, peakKw) {
  if (segment === 'residential') return { kw: 5, kwh: 13.5 };
  var kw = Math.max(25, Math.round(peakKw * 0.25 / 25) * 25);
  return { kw: kw, kwh: kw * 2 };
}

/* The hour-by-hour dispatch. Per month, the demand target is the lowest
   level every day of that month can be held to with the battery's power
   and one day's usable energy (binary search). Each hour then:
     1. over the target → discharge the excess (the demand charge first);
     2. an event hour (the DR programme's summer peak days) → discharge
        what the programme would ask, holding charge for it that morning;
     3. the day's dearest price → discharge what is not reserved for later
        peaks today (TOU arbitrage), never below zero net load (no export);
     4. solar surplus or the day's cheapest price → charge, never lifting
        net load above the target. */
function dispatch(load, solar, bat, t, events) {
  var n = HOURS_YEAR, P = bat.kw, E = bat.kwh * bat.dod, rte = bat.rte;
  var net0 = new Float64Array(n), h;
  for (h = 0; h < n; h++) net0[h] = load[h] - (solar ? solar[h] : 0);
  var price = priceSeries(t);
  var demandBilled = t.hasFlatDemand || t.hasTouDemand;

  var target = new Float64Array(12);
  for (var m = 0; m < 12; m++) {
    var a = MONTH_START[m], b = a + DAYS[m] * 24, peak = 0;
    for (h = a; h < b; h++) if (net0[h] > peak) peak = net0[h];
    if (!demandBilled || peak <= 0) { target[m] = Infinity; continue; }
    var lo = Math.max(0, peak - P), hi = peak;
    for (var it = 0; it < 30; it++) {
      var mid = (lo + hi) / 2, ok = true;
      for (var d0 = a; d0 < b && ok; d0 += 24) {
        /* a day passes when its energy above the line fits the battery AND
           the hours below the line leave room to put it back */
        var need = 0, refill = 0;
        for (h = d0; h < d0 + 24; h++) {
          if (net0[h] > mid) need += net0[h] - mid;
          else refill += Math.min(P, mid - net0[h]);
        }
        if (need > E || need > refill * rte) ok = false;
      }
      if (ok) hi = mid; else lo = mid;
    }
    target[m] = hi;
  }

  var net = new Float64Array(n), soc = E, cycles = 0, dis = 0, eventKwh = 0, shaveHours = 0;
  var eventSet = {}; for (var e = 0; e < events.length; e++) eventSet[events[e]] = true;
  for (var day = 0; day < 365; day++) {
    var s = day * 24, mo = monthOfHour(s), T0 = target[mo];
    var pMax = -Infinity, pMin = Infinity;
    for (h = s; h < s + 24; h++) { if (price[h] > pMax) pMax = price[h]; if (price[h] < pMin) pMin = price[h]; }
    var spread = pMax * rte - pMin > 0.005;
    /* energy still needed today, from each hour on, for peaks and events */
    var reserve = new Float64Array(25);
    for (h = s + 23; h >= s; h--) {
      var req = 0;
      if (net0[h] > T0) req = Math.min(P, net0[h] - T0);
      if (eventSet[h]) req = Math.max(req, Math.min(P, E / 4));
      reserve[h - s] = reserve[h - s + 1] + req;
    }
    for (h = s; h < s + 24; h++) {
      var x = net0[h], d = 0, c = 0;
      var later = reserve[h - s + 1];
      if (x > T0) d = Math.min(P, x - T0, soc);
      if (eventSet[h]) { var want = Math.min(P, E / 4, soc, Math.max(0, x)); if (want > d) d = want; }
      if (d === 0 && spread && price[h] >= pMax - 1e-9) {
        d = Math.max(0, Math.min(P, x, soc - later));
      }
      if (d > 0) {
        if (x > T0) shaveHours++;
        if (eventSet[h]) eventKwh += d;
        soc -= d; dis += d; net[h] = x - d; continue;
      }
      var room = (E - soc) / Math.sqrt(rte);
      if (x < 0) c = Math.min(P, -x, room);                       /* solar surplus */
      else if (!spread || price[h] <= pMin + 1e-9) c = Math.min(P, room, Math.max(0, T0 - x));
      c = Math.max(0, c);
      soc += c * Math.sqrt(rte);
      net[h] = x + c;
    }
  }
  cycles = dis / Math.max(E, 1e-9);
  return { net: net, net0: net0, targets: target, cycles: cycles, dischargedKwh: dis,
           eventKwh: eventKwh, shaveHours: shaveHours };
}

/* The summer peak days a DR programme would call: the N weekdays with the
   highest site load in the event months, the programme's window on each. */
function pickEvents(load, count, win) {
  var days = [], m, d;
  for (m = 0; m < SUMMER.length; m++) {
    var mi = SUMMER[m];
    for (d = 0; d < DAYS[mi]; d++) {
      var day = MONTH_START[mi] / 24 + d;
      if (isWeekend(day)) continue;
      var pk = 0; for (var h = win[0]; h < win[1]; h++) pk = Math.max(pk, load[day * 24 + h]);
      days.push({ day: day, pk: pk });
    }
  }
  days.sort(function (a, b) { return b.pk - a.pk || a.day - b.day; });
  var hours = [];
  for (var i = 0; i < Math.min(count, days.length); i++) for (var hh = win[0]; hh < win[1]; hh++) hours.push(days[i].day * 24 + hh);
  return hours;
}

/* ── THE PROGRAMMES ──────────────────────────────────────────────────────
   One row per programme a managed VPP could enrol this battery in. `group`
   is the exclusivity set: within a group only the best-paying programme is
   counted, because the same kW cannot be sold twice for the same hours.
   Rates are PLANNING figures unless tier says otherwise; `ref` names the
   programme and what replaces the figure. */
var PROGRAMS = [
  { id: 'ca.elrp', name: 'Emergency Load Reduction Program (ELRP)', markets: ['CAISO'], group: 'ca-dr',
    segments: SEGMENTS, kind: 'event', perKwh: 2.00, events: 12, hours: 4, win: [16, 21],
    bank: { paidBy: 'the utility, under the CPUC\u2019s ELRP budget', vehicle: 'enrolment through an A.6 VPP aggregator', tenor: 'programme year; paid per called event' },
    ref: 'CPUC ELRP pays $2/kWh of incremental reduction in called events (4–9 pm, May–October, at most 60 called hours a year); residential batteries enrol through an A.6 VPP aggregator. The pilot is authorized through 2027 (D.23-12-005). Event count varies with the summer — 12 four-hour events is a planning year.' },
  { id: 'ca.dsgs', exportOk: true, name: 'Demand Side Grid Support (DSGS) Option 3', markets: ['CAISO'], group: 'ca-dr',
    segments: ['residential', 'commercial'], kind: 'capacity', perKwYear: 62.10, minHours: 2,
    bank: { paidBy: 'the CEC (state programme funds)', vehicle: 'DSGS aggregator agreement', tenor: 'summer season (May\u2013Oct), re-enrolled yearly' },
    ref: 'CEC DSGS Option 3 (storage VPP), Fifth Edition guidelines (adopted 27 April 2026): $62.10\u2013$82.80/kW-year of verified summer capacity by duration (2\u20134 hours), plus a 30% bonus for the 2025 and 2026 programme years; 2026 enrolment is limited to aggregators that participated in October 2025, and no 2027 rates are published yet. The season\'s published rate for the resource\'s duration replaces this floor figure.' },
  { id: 'ca.ra', name: 'Resource Adequacy via DR aggregator (CBP / DRAM)', markets: ['CAISO'], group: 'ca-dr',
    segments: ['commercial', 'industrial'], kind: 'capacity', perKwYear: 42, minHours: 4,
    bank: { paidBy: 'the load-serving entity, via the DR aggregator', vehicle: 'CBP / DRAM aggregator contract', tenor: 'monthly May\u2013Oct commitments; contracts run 1\u20133 years' },
    ref: 'Capacity Bidding Program / DRAM monthly capacity payments May–October. Planning figure; the aggregator\'s contract replaces it.' },

  { id: 'ercot.ader', exportOk: true, name: 'ERCOT ADER (Aggregated DER) via retail VPP', markets: ['ERCOT'], group: 'ercot-grid',
    segments: ['residential', 'commercial'], kind: 'capacity', perKwYear: 45, minHours: 1,
    bank: { paidBy: 'the retail electric provider running the VPP', vehicle: 'retail VPP participation agreement', tenor: 'the REP contract term' },
    ref: 'ERCOT\'s ADER pilot lets a retail-provider VPP sell aggregated batteries into energy and ancillary services; Phase 3 (2026) raised the registered-capacity cap to 500 MW. Planning figure from REP battery-programme credits.' },
  { id: 'ercot.ers', name: 'Emergency Response Service (ERS)', markets: ['ERCOT'], group: 'ercot-grid',
    segments: ['commercial', 'industrial'], kind: 'capacity', perKwYear: 28, minHours: 2,
    bank: { paidBy: 'ERCOT', vehicle: 'ERS standby contract through a qualified scheduling entity', tenor: 'four standby terms a year (two four-month, two two-month), re-bid' },
    ref: 'ERCOT ERS standby payments by contract term (Dec–Mar, Apr–May, Jun–Sep, Oct–Nov; pay-as-bid). Planning figure; the term\'s clearing price replaces it.' },
  { id: 'ercot.4cp', name: 'Transmission 4CP avoidance', markets: ['ERCOT'], group: 'ercot-4cp',
    segments: ['commercial', 'industrial'], kind: 'capacity', perKwYear: 60, minHours: 2, minPeakKw: 700,
    bank: { paidBy: 'nobody \u2014 a transmission charge avoided on the host\u2019s own bill', vehicle: 'no contract; operational performance in the four summer peaks', tenor: 'resets every year on the four coincident peaks' },
    ref: 'An IDR-metered ERCOT customer\'s transmission charge is set by its load in the four summer coincident peaks; each kW off those intervals avoids roughly $5/kW-month for a year. Planning figure; the TDSP\'s TCOS rate replaces it.' },

  { id: 'pjm.capacity', name: 'PJM capacity via curtailment service provider', markets: ['PJM'], group: 'pjm-cap',
    segments: SEGMENTS, kind: 'pjm',
    bank: { paidBy: 'PJM settlement, via a curtailment service provider', vehicle: 'CSP agreement', tenor: 'one delivery year per auction, cleared about three years ahead' },
    ref: 'Accredited kW × the Base Residual Auction clearing price (value-stack.js, PJM\'s own documents).' },
  { id: 'pjm.plc', name: 'Capacity tag (PLC) reduction — 5CP', markets: ['PJM'], group: 'pjm-cap',
    segments: ['commercial', 'industrial'], kind: 'capacity', perKwYear: 100, minHours: 3,
    bank: { paidBy: 'nobody \u2014 a supply capacity charge avoided on the host\u2019s own bill', vehicle: 'no contract; 5CP performance', tenor: 'resets each delivery year' },
    ref: 'Holding load down in PJM\'s five coincident summer peaks lowers the site\'s capacity tag and the supply bill\'s capacity charge for the next year. Planning figure below the $325/MW-day clearing price, since not every peak is caught.' },
  { id: 'pjm.comedvpp', name: 'ComEd Scheduled Dispatch VPP (Rider SDVPP)', markets: ['PJM'], comedOnly: true, group: 'pjm-cap',
    segments: SEGMENTS, kind: 'capacity', perKwYear: 10, minHours: 2,
    bank: { paidBy: 'ComEd, under Rider SDVPP (approved; tariff sheets effective 16 July 2026)', vehicle: 'Rider SDVPP enrolment — service begins no later than 1 March 2027', tenor: 'five-year programme term; paid per season (June–September)' },
    ref: 'ComEd\'s Rider SDVPP (the PA 104-0458 compliance filing, ICC-stamped 1 June 2026, tariff sheets effective 16 July 2026) pays $10 per kW of performance per season, measured 4–6 pm weekdays June–September. It replaced the withdrawn Rider VPP / BYODLR proposal; the $150/kW-year planning figure carried before it had no primary source and is retired.' },

  { id: 'ny.dlm', name: 'Utility DLM (Con Edison CSRP + DLRP)', markets: ['NYISO'], group: 'ny-dlm',
    segments: SEGMENTS, kind: 'capacity', perKwYear: 30, perKwYearNyc: 120, minHours: 4,
    bank: { paidBy: 'Con Edison / the New York utility', vehicle: 'DLM programme agreement', tenor: 'summer season, annual reservation rates' },
    ref: 'New York utility Dynamic Load Management programmes pay per kW-month over the summer; Con Edison\'s network tiers pay several times upstate rates. Planning figures; the utility\'s current reservation rates replace them.' },
  { id: 'ny.scr', name: 'NYISO ICAP Special Case Resource', markets: ['NYISO'], group: 'ny-icap',
    segments: ['commercial', 'industrial'], kind: 'capacity', perKwYear: 25, perKwYearNyc: 55, minHours: 4,
    bank: { paidBy: 'NYISO, via a responsible interface party', vehicle: 'SCR enrolment through an RIP', tenor: 'monthly strip auctions by zone' },
    ref: 'NYISO capacity through a responsible interface party. Planning figure; the strip auction clearing price for the zone replaces it.' },

  { id: 'ne.connected', exportOk: true, name: 'ConnectedSolutions / Energy Storage Solutions', markets: ['ISONE'], states: ['MA', 'RI', 'CT', 'NH'], group: 'ne-dr',
    segments: SEGMENTS, kind: 'capacity', perKwYear: 200, minHours: 2,
    bank: { paidBy: 'the utility (Eversource, National Grid, Rhode Island Energy)', vehicle: 'ConnectedSolutions / Energy Storage Solutions participation agreement', tenor: 'summer season; rates set per programme year' },
    ref: 'Massachusetts and Rhode Island C&I ConnectedSolutions Daily Dispatch pays a published $200/kW-summer (2024–2026 programme years; residential pays $225–275), and Connecticut\'s Energy Storage Solutions — restructured 1 April 2026 to active dispatch only, the upfront incentive closed to new applicants — pays C&I $325 (small/medium) or $275 (large) per kW-year in years 1–5. Planning figure at the MA/RI published rate.' },
  { id: 'ne.gmp', exportOk: true, name: 'Green Mountain Power battery programme', markets: ['ISONE'], states: ['VT'], group: 'ne-dr',
    segments: ['residential', 'commercial'], kind: 'capacity', perKwYear: 100, minHours: 2,
    bank: { paidBy: 'Green Mountain Power', vehicle: 'BYOD programme agreement', tenor: 'programme term' },
    ref: 'GMP\'s bring-your-own-device battery programme pays an upfront $850–950 per kW (three- and four-hour discharge) for a ten-year commitment; the planning figure annualises it.' },
  { id: 'ne.fcm', name: 'ISO-NE Forward Capacity Market via aggregator', markets: ['ISONE'], group: 'ne-dr',
    segments: ['commercial', 'industrial'], kind: 'capacity', perKwYear: 36, minHours: 2,
    bank: { paidBy: 'ISO-NE, via an active demand capacity resource aggregator', vehicle: 'FCM capacity supply obligation through the aggregator', tenor: 'one capacity commitment period per FCA' },
    ref: 'ISO-NE FCM capacity through an active demand capacity resource aggregator. Planning figure; the FCA clearing price replaces it.' },
  { id: 'ne.cps', exportOk: true, name: 'Massachusetts Clean Peak Standard', markets: ['ISONE'], states: ['MA'], needsSolar: true, group: 'ne-cps',
    segments: SEGMENTS, kind: 'capacity', perKwYear: 30, minHours: 2,
    bank: { paidBy: 'obligated retail suppliers buying Clean Peak certificates', vehicle: 'CPEC minting and sale', tenor: 'certificate market; minting factors decline by vintage' },
    ref: 'Clean Peak Energy Certificates for storage charged from qualifying renewables and discharged in the seasonal peak. DOER\'s May 2026 emergency rulemaking reset the 2026–2030 minimum standards and raised the alternative compliance payment to $65/MWh. Planning figure.' },

  { id: 'miso.dr', exportOk: true, name: 'Utility battery / load-response programme', markets: ['MISO'], group: 'miso',
    segments: SEGMENTS, kind: 'capacity', perKwYear: 40, minHours: 2,
    bank: { paidBy: 'the utility', vehicle: 'utility battery / load-response programme agreement', tenor: 'annual programme year' },
    ref: 'MISO-area utility programmes (Xcel, Ameren, DTE, Consumers and others). Planning figure; the utility\'s tariff replaces it.' },
  { id: 'miso.lmr', name: 'MISO capacity (Load Modifying Resource)', markets: ['MISO'], group: 'miso',
    segments: ['commercial', 'industrial'], kind: 'capacity', perKwYear: 35, minHours: 4,
    bank: { paidBy: 'MISO, via a registered market participant', vehicle: 'LMR registration and the PRA', tenor: 'seasonal auctions, re-cleared yearly' },
    ref: 'MISO Planning Resource Auction capacity through a market participant. The auction clears very differently by season and zone; planning figure.' },
  { id: 'spp.dr', exportOk: true, name: 'Utility battery / load-response programme', markets: ['SPP'], group: 'spp',
    segments: SEGMENTS, kind: 'capacity', perKwYear: 30, minHours: 2,
    bank: { paidBy: 'the utility', vehicle: 'utility programme agreement', tenor: 'annual programme year' },
    ref: 'SPP-area utility demand-response and battery programmes. Planning figure.' },
  { id: 'se.dr', exportOk: true, name: 'Utility battery programme (BYOD)', markets: ['SE'], group: 'se',
    segments: SEGMENTS, kind: 'capacity', perKwYear: 45, minHours: 2,
    bank: { paidBy: 'the utility', vehicle: 'utility battery programme agreement', tenor: 'programme term, typically annual' },
    ref: 'Southeast utility battery programmes (e.g. Duke PowerPair / PowerShare, Georgia Power). Planning figure; the utility\'s programme terms replace it.' },
  { id: 'west.dr', exportOk: true, name: 'Utility battery programme (BYOD)', markets: ['WEST'], group: 'west',
    segments: SEGMENTS, kind: 'capacity', perKwYear: 50, minHours: 2,
    bank: { paidBy: 'the utility', vehicle: 'utility battery programme agreement', tenor: 'programme term, typically annual' },
    ref: 'Western utility battery programmes (e.g. APS Storage Rewards, Xcel Colorado Renewable Battery Connect, NV Energy, Portland General). Planning figure.' },
  { id: 'hi.bb', exportOk: true, name: 'Hawaiian Electric Battery Bonus / BYOD', markets: ['HI'], group: 'hi',
    segments: ['residential', 'commercial'], kind: 'capacity', perKwYear: 60, minHours: 2,
    bank: { paidBy: 'Hawaiian Electric', vehicle: 'grid-services programme agreement', tenor: 'programme term' },
    ref: 'Hawaiian Electric grid-services programmes for customer batteries. Planning figure.' }
];

/* A behind-the-meter battery sells a reduction in the site's own load, so
   the kW it can commit is capped at what the site draws in the summer
   peak — a 250 kW battery on an 80 kW building is an 80 kW resource.
   Programmes that meter the battery itself (exportOk: the residential and
   BYOD battery programmes) take its full rating. */
function programValue(p, ctx) {
  var bat0 = ctx.battery, E = bat0.kwh * bat0.dod, perf = ctx.performance;
  var shed = p.exportOk ? bat0.kw : Math.min(bat0.kw, ctx.shedKw), capped = shed < bat0.kw;
  var bat = { kw: shed, kwh: bat0.kwh, dod: bat0.dod };
  var capNote = capped ? ' Capped at the site\'s ' + r2(shed) + ' kW summer peak load (no export).' : '';
  if (p.kind === 'pjm') {
    /* PJM classes storage by its RATED duration, nameplate kWh over kW. */
    var st = V.stack({ kw: bat.kw, hours: bat0.kwh / bat0.kw });
    var cap = null, i;
    for (i = 0; st && i < st.streams.length; i++) if (st.streams[i].id === 'pjm.capacity') cap = st.streams[i];
    if (!cap) return { skip: 'PJM accredits storage in duration classes from four hours; a ' + r2(bat0.kwh / bat0.kw) + '-hour battery has no class, so nothing is claimed.' };
    return { usd: cap.usd * perf, tier: 'published', how: cap.how + ' At ' + Math.round(perf * 100) + '% performance.' + capNote, ref: cap.ref, url: cap.url };
  }
  if (p.kind === 'event') {
    var perEvent = Math.min(bat.kw * p.hours, E);
    var kwh = perEvent * p.events * perf;
    return { usd: kwh * p.perKwh, tier: 'planning',
             how: p.events + ' events × ' + r2(perEvent) + ' kWh delivered (' + fmt(bat.kw) + ' kW for up to ' + p.hours + ' h, ' +
                  Math.round(perf * 100) + '% performance) × $' + p.perKwh.toFixed(2) + '/kWh.' + capNote, ref: p.ref };
  }
  var rate = (ctx.loc.nyc && p.perKwYearNyc) ? p.perKwYearNyc : p.perKwYear;
  var kwCommitted = Math.min(bat.kw, E / (p.minHours || 1));
  return { usd: kwCommitted * rate * perf, tier: 'planning',
           how: r2(kwCommitted) + ' kW committed (' + fmt(bat.kw) + ' kW for ' + (p.minHours || 1) + ' h' +
                (kwCommitted < bat.kw ? ', limited by ' + r2(E) + ' usable kWh' : '') + ') × $' + rate + '/kW-yr × ' +
                Math.round(perf * 100) + '% performance.' + capNote, ref: p.ref };
}

function programs(ctx) {
  var loc = ctx.loc, seg = ctx.segment, chosen = {}, all = [], missing = [], i;
  for (i = 0; i < PROGRAMS.length; i++) {
    var p = PROGRAMS[i];
    if (p.markets.indexOf(loc.market) < 0) continue;
    if (p.states && p.states.indexOf(loc.state) < 0) continue;
    if (p.comedOnly && !loc.comed) continue;
    var why = null;
    if (p.segments.indexOf(seg) < 0) why = 'Not open to ' + seg + ' sites.';
    else if (p.needsSolar && !(ctx.solarKw > 0)) why = 'Needs storage charged from on-site renewables; no solar was entered.';
    else if (p.minPeakKw && ctx.peakKw < p.minPeakKw) why = 'Applies to interval-metered sites above ' + fmt(p.minPeakKw) + ' kW peak (this site: ' + fmt(ctx.peakKw) + ' kW).';
    var v = why ? null : programValue(p, ctx);
    if (v && v.skip) { why = v.skip; v = null; }
    var row = { id: p.id, name: p.name, group: p.group, category: 'grid' };
    if (!v) { row.eligible = false; row.why = why; missing.push(p.name + ' — ' + why); all.push(row); continue; }
    row.eligible = true; row.usd = r0(v.usd); row.tier = v.tier; row.how = v.how; row.ref = v.ref; if (v.url) row.url = v.url;
    if (p.bank) row.bank = p.bank;
    all.push(row);
    if (!chosen[p.group] || chosen[p.group].usd < row.usd) chosen[p.group] = row;
  }
  var picked = [];
  for (i = 0; i < all.length; i++) {
    var r = all[i];
    if (!r.eligible) continue;
    if (chosen[r.group] === r) { r.counted = true; picked.push(r); }
    else { r.counted = false; r.why = 'Same hours as ' + chosen[r.group].name + ', which pays more — one of the two.'; }
  }
  if (!all.length) missing.push('No grid-service programme is on file for ' + (MARKETS[loc.market] || loc.market) + ' yet.');
  return { picked: picked, all: all, missing: missing };
}

/* ── THE RUN ─────────────────────────────────────────────────────────── */
function validate(input) {
  var errs = [];
  if (!input || typeof input !== 'object') return [{ field: '', message: 'Send the site as a JSON object.' }];
  if (!zip3Of(input.zip)) errs.push({ field: 'zip', message: 'A five-digit US ZIP code is needed.' });
  if (input.segment != null && SEGMENTS.indexOf(input.segment) < 0) errs.push({ field: 'segment', message: 'Site type is residential, commercial or industrial.' });
  var b = input.battery || {};
  if (b.kw != null && !(num(b.kw, 0) > 0 && num(b.kw, 0) <= 100000)) errs.push({ field: 'battery.kw', message: 'Battery power must be between 0 and 100,000 kW.' });
  if (b.kwh != null && !(num(b.kwh, 0) > 0 && num(b.kwh, 0) <= 800000)) errs.push({ field: 'battery.kwh', message: 'Battery energy must be between 0 and 800,000 kWh.' });
  if (b.kw != null && b.kwh != null && num(b.kwh, 0) / num(b.kw, 1) > 12) errs.push({ field: 'battery.kwh', message: 'More than twelve hours of storage is outside what this simulator models.' });
  if (input.solarKw != null && !(num(input.solarKw, -1) >= 0 && num(input.solarKw, 0) <= 100000)) errs.push({ field: 'solarKw', message: 'Solar must be between 0 and 100,000 kW-dc.' });
  var l = input.load || {};
  if (l.type && ['interval', 'bills', 'profile'].indexOf(l.type) < 0) errs.push({ field: 'load.type', message: 'Load is interval, bills or profile.' });
  if (l.type === 'interval' && typeof l.text !== 'string' && !Array.isArray(l.values)) errs.push({ field: 'load.text', message: 'Attach the interval file.' });
  if (l.type === 'interval' && typeof l.text === 'string' && l.text.length > 4000000) errs.push({ field: 'load.text', message: 'The interval file is larger than one year of readings.' });
  if (l.type === 'bills' && !Array.isArray(l.bills)) errs.push({ field: 'load.bills', message: 'Enter at least one month of bills.' });
  var s = input.split;
  if (s && typeof s === 'object') {
    var tot = num(s.owner, 0) + num(s.platform, 0) + num(s.installer, 0);
    if (Math.abs(tot - 1) > 0.001 || num(s.owner, -1) < 0 || num(s.platform, -1) < 0 || num(s.installer, -1) < 0)
      errs.push({ field: 'split', message: 'The revenue split must be three shares that add up to 100%.' });
  }
  return errs;
}

function simulate(input) {
  var errs = validate(input);
  if (errs.length) return { ok: false, errors: errs };
  var segment = input.segment || 'commercial';
  var loc = locate(input.zip, input.market);
  if (!loc.ok) return { ok: false, errors: [{ field: 'zip', message: loc.error }] };

  var L = buildLoad(input, loc, segment);
  if (!L.ok) return { ok: false, errors: [{ field: 'load', message: L.error }] };
  var load = L.kw, h, peakKw = 0, annualKwh = 0;
  for (h = 0; h < HOURS_YEAR; h++) { annualKwh += load[h]; if (load[h] > peakKw) peakKw = load[h]; }
  if (!(annualKwh > 0)) return { ok: false, errors: [{ field: 'load', message: 'The load adds up to zero kWh.' }] };

  var solarKw = num(input.solarKw, 0), solar = solarProfile(solarKw, loc);
  var b0 = input.battery || {}, def = defaultBattery(segment, peakKw);
  var bat = { kw: num(b0.kw, def.kw), kwh: num(b0.kwh, null), dod: 0.9, rte: clamp(num(b0.rte, 0.88), 0.6, 0.98), assumed: b0.kw == null };
  if (bat.kwh == null) bat.kwh = b0.kw == null ? def.kwh : bat.kw * 2;
  var perf = clamp(num(input.performance, 0.9), 0.5, 1);

  /* Tariff, calibrated to the bills' dollars when they carry any. */
  var ct = calibratedTariff(input, loc, segment, L);
  if (!ct.ok) return { ok: false, errors: [{ field: 'tariff', message: ct.error }] };
  var tf = ct.tf, calib = ct.calib;
  var netNoBat = new Array(HOURS_YEAR);
  for (h = 0; h < HOURS_YEAR; h++) netNoBat[h] = load[h] - (solar ? solar[h] : 0);
  var t = tf.tariff;

  var evWin = tf.win || RATE_BOOK[loc.market].win;
  var events = pickEvents(netNoBat, 12, [evWin[0], Math.min(24, evWin[0] + 4)]);
  var D = dispatch(load, solar, bat, t, events);
  var before = bill(Array.prototype.slice.call(D.net0), t);
  var after = bill(Array.prototype.slice.call(D.net), t);

  var streams = [];
  var demandSave = before.demand - after.demand, energySave = before.energy - after.energy;
  if (t.hasFlatDemand || t.hasTouDemand) {
    streams.push({ id: 'bill.demand', name: 'Demand charges avoided', category: 'bill', usd: r0(demandSave), tier: 'computed', counted: true,
      how: 'Monthly peak held down by the battery, priced on the tariff\'s demand charges hour by hour. Before $' + fmt(before.demand) + ' → after $' + fmt(after.demand) + ' a year.',
      ref: tf.label });
  } else {
    streams.push({ id: 'bill.demand', name: 'Demand charges avoided', category: 'bill', usd: 0, tier: 'computed', counted: false,
      how: 'This tariff has no demand charge.', ref: tf.label });
  }
  streams.push({ id: 'bill.tou', name: 'Time-of-use energy (net of losses)', category: 'bill', usd: r0(energySave), tier: 'computed', counted: true,
    how: 'Charged in the cheapest hours (or from solar surplus) and discharged in the dearest, net of ' + Math.round(bat.rte * 100) +
         '% round-trip losses. Energy before $' + fmt(before.energy) + ' → after $' + fmt(after.energy) + '.', ref: tf.label });

  var shedKw = 0;
  for (h = MONTH_START[SUMMER[0]]; h < MONTH_START[SUMMER[SUMMER.length - 1]] + DAYS[SUMMER[SUMMER.length - 1]] * 24; h++) if (D.net0[h] > shedKw) shedKw = D.net0[h];
  var ctx = { loc: loc, segment: segment, battery: bat, performance: perf, solarKw: solarKw, peakKw: peakKw, shedKw: shedKw };
  var G = programs(ctx);
  for (var i = 0; i < G.all.length; i++) if (G.all[i].eligible) streams.push(G.all[i]);

  var split = input.split && typeof input.split === 'object'
    ? { owner: num(input.split.owner, 0.7), platform: num(input.split.platform, 0.2), installer: num(input.split.installer, 0.1), ref: 'Your split.' }
    : SPLIT;
  var billTotal = 0, gridTotal = 0, best = null;
  for (i = 0; i < streams.length; i++) {
    var st = streams[i];
    if (!st.counted) continue;
    if (st.category === 'bill') billTotal += st.usd; else gridTotal += st.usd;
    if (!best || st.usd > best.usd) best = st;
  }
  var gross = billTotal + gridTotal;
  var ownerGrid = gridTotal * split.owner;

  /* A day to draw: the site's highest-load summer weekday. */
  var sampleDay = 0, sp = -1;
  for (h = MONTH_START[6]; h < MONTH_START[7]; h++) if (D.net0[h] > sp && !isWeekend(Math.floor(h / 24))) { sp = D.net0[h]; sampleDay = Math.floor(h / 24); }
  var day = [];
  for (h = sampleDay * 24; h < sampleDay * 24 + 24; h++) {
    day.push({ hour: h % 24, load: r2(load[h]), solar: solar ? r2(solar[h]) : 0, net: r2(D.net[h]),
               battery: r2(D.net0[h] - D.net[h]), event: events.indexOf(h) >= 0 });
  }
  var monthly = [];
  for (var mo = 0; mo < 12; mo++) {
    var a = MONTH_START[mo], z = a + DAYS[mo] * 24, pk0 = 0, pk1 = 0, kwh0 = 0;
    for (h = a; h < z; h++) { if (D.net0[h] > pk0) pk0 = D.net0[h]; if (D.net[h] > pk1) pk1 = D.net[h]; kwh0 += load[h]; }
    monthly.push({ month: mo, kwh: r0(kwh0), peakKw: r2(pk0), peakAfterKw: r2(pk1),
                   billBefore: r0(before.months[mo] ? before.months[mo].subtotal : 0),
                   billAfter: r0(after.months[mo] ? after.months[mo].subtotal : 0) });
  }

  var qRank = { high: 3, medium: 2, low: 1 };
  var tq = tf.source === 'planning' ? (calib ? 'medium' : 'low') : 'high';
  var confidence = qRank[L.quality] <= qRank[tq] ? L.quality : tq;
  var missing = G.missing.slice();
  missing.push('Wholesale energy arbitrage — a behind-the-meter battery reaches wholesale prices only through a retail or aggregator programme; not counted beyond those listed.');
  missing.push('Backup power / resilience — real value, but it is paid in avoided outage cost, not a cheque; not counted.');
  missing.push('One-time incentives (SGIP, state rebates, the federal ITC) — see the Pro Forma; this is recurring earnings only.');

  return {
    ok: true, version: VERSION, provider: 'simulated',
    site: { zip: loc.zip, state: loc.state, market: loc.market, marketName: loc.marketName, area: loc.area,
            marketInferred: loc.marketInferred, segment: segment, climate: loc.climate },
    load: { source: L.source, label: L.label, quality: L.quality, notes: L.notes, annualKwh: r0(annualKwh), peakKw: r2(peakKw) },
    solar: solarKw > 0 ? { kwdc: solarKw, annualKwh: r0(solarKw * loc.solarYield), yield: loc.solarYield } : null,
    battery: { kw: bat.kw, kwh: bat.kwh, usableKwh: r2(bat.kwh * bat.dod), rte: bat.rte, assumed: bat.assumed,
               cyclesPerYear: r0(D.cycles), dischargedKwh: r0(D.dischargedKwh) },
    tariff: { source: tf.source, label: tf.label, rates: tf.rates || null, calibration: calib },
    bill: { before: r0(before.total), after: r0(after.total), savings: r0(before.total - after.total) },
    streams: streams, missing: missing,
    totals: {
      gross: r0(gross), billSavings: r0(billTotal), gridEarnings: r0(gridTotal),
      owner: r0(billTotal + ownerGrid), platform: r0(gridTotal * split.platform), installer: r0(gridTotal * split.installer),
      perKw: r2(gross / bat.kw), bestSingle: best ? { id: best.id, name: best.name, usd: best.usd } : null,
      stackUplift: best && best.usd > 0 ? r2(gross / best.usd) : null
    },
    split: { owner: split.owner, platform: split.platform, installer: split.installer, ref: split.ref, appliesTo: 'grid-service earnings; bill savings stay with the customer' },
    monthly: monthly, sampleDay: { day: sampleDay, hours: day },
    confidence: confidence,
    disclaimer: 'A simulation of what a managed VPP (the DividendVPP model) could stack at this site, run by ClearSky-OMEGA. ' +
                'It is not a Molecule Systems or Lightsmith quote; planning figures are marked and replaced by the programme\'s own terms.'
  };
}

module.exports = {
  VERSION: VERSION, SPLIT: SPLIT, MARKETS: MARKETS, PROGRAMS: PROGRAMS, RATE_BOOK: RATE_BOOK,
  locate: locate, parseInterval: parseInterval, billsToMonths: billsToMonths, fitMonth: fitMonth,
  validate: validate, simulate: simulate,
  /* The site builders the compute site pro forma (compute-site.js) reuses,
     so a load, a tariff and a bill are made one way on this platform. */
  site: {
    HOURS_YEAR: HOURS_YEAR, DAYS: DAYS, MONTH_START: MONTH_START, YEAR_START_DOW: YEAR_START_DOW,
    SHAPES: SHAPES, CLIMATE: CLIMATE,
    isWeekend: isWeekend, monthOfHour: monthOfHour, buildLoad: buildLoad, buildTariff: buildTariff,
    calibratedTariff: calibratedTariff, bill: bill, priceSeries: priceSeries, solarProfile: solarProfile
  },
  /* for the page: what may be chosen, no rates */
  options: function () {
    var m = []; for (var k in MARKETS) if (has(MARKETS, k)) m.push({ key: k, name: MARKETS[k] });
    return { segments: SEGMENTS, markets: m, split: { owner: SPLIT.owner, platform: SPLIT.platform, installer: SPLIT.installer, ref: SPLIT.ref } };
  }
};
