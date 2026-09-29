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
   exclusivity group the way an operator must (the same kW cannot be sold
   twice for the same hours).

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
       with a confidence that follows the weaker of the two;
     - a programme paid per kWh DELIVERED is priced off the dispatch's own
       event hours, never off nameplate, and the bill streams carry the
       cost of holding charge for it;
     - a programme closed to a new enrolment is listed with its dated
       reason, never counted; programme status is dated, not live;
     - bill savings (the tariff's, and the PLC / 4CP tags on the
       customer's own bill) stay with the customer; only grid-programme
       earnings are split.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var T = require('./bess-tariff');
var V = require('./value-stack');

var VERSION = 'vpp-sim-2';
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
/* 008 (the US Virgin Islands, VI WAPA's grid) is deliberately absent, so
   locate() refuses it rather than pricing it on Puerto Rico's; 201 is
   Northern Virginia (Ashburn, Dulles, Reston), not DC. */
var ZIP3 = [
  [5, 5, 'NY'], [6, 7, 'PR'], [9, 9, 'PR'], [10, 27, 'MA'], [28, 29, 'RI'], [30, 38, 'NH'], [39, 49, 'ME'],
  [50, 54, 'VT'], [55, 55, 'MA'], [56, 59, 'VT'], [60, 69, 'CT'], [70, 89, 'NJ'],
  [100, 149, 'NY'], [150, 196, 'PA'], [197, 199, 'DE'], [200, 200, 'DC'], [201, 201, 'VA'],
  [202, 205, 'DC'], [206, 219, 'MD'],
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
/* Prefix refinements where a state straddles two markets: the first row
   that covers the ZIP3 wins, so a narrow row sits before a broad one. A
   ZIP3 is still a sectional centre, not a utility boundary; the area label
   says which utility the refinement assumed, and the page lets the user
   correct the market. */
var ZIP3_MARKET = [
  [600, 611, 'PJM', 'ComEd (northern Illinois)'],
  [640, 649, 'SPP', 'Evergy (Kansas City)'],
  [790, 791, 'SPP', 'Xcel/SPS (Texas Panhandle)'],
  [798, 799, 'WEST', 'El Paso Electric'],
  [885, 885, 'WEST', 'El Paso Electric'],
  [776, 777, 'MISO', 'Entergy Texas (Beaumont / Port Arthur)'],
  [755, 756, 'SPP', 'SWEPCO (northeast Texas)'],
  [711, 711, 'SPP', 'SWEPCO (Shreveport)'],
  [727, 727, 'SPP', 'SWEPCO / OG&E (northwest Arkansas)'],
  [729, 729, 'SPP', 'OG&E / SWEPCO (Fort Smith)'],
  [466, 468, 'PJM', 'Indiana Michigan Power (South Bend / Fort Wayne)'],
  [473, 473, 'PJM', 'Indiana Michigan Power (Muncie)'],
  [410, 410, 'PJM', 'Duke Energy Kentucky'],
  [411, 412, 'PJM', 'Kentucky Power (Ashland)'],
  [415, 418, 'PJM', 'Kentucky Power (Pikeville / Hazard)'],
  [279, 279, 'PJM', 'Dominion Energy North Carolina (PJM DOM zone)'],
  [278, 278, 'SE', 'Duke Energy Progress area (Rocky Mount and Wilson are municipal systems, not Duke; Roanoke Rapids and Halifax are Dominion, in PJM — correct the utility or the market there)'],
  [270, 277, 'SE', 'Duke Energy (North Carolina)'],
  [289, 289, 'SE', 'TVA distributors (far western North Carolina: Murphy Electric Power Board and the area EMCs), not Duke'],
  [280, 288, 'SE', 'Duke Energy (North Carolina)']
];
/* PJM states with no retail choice whose regulator has closed PJM demand
   response to retail customers except through the utility (FERC Order 719
   lets a state's retail regulator do that; FERC lists IN, KY and NC among
   the states that did). The refinements above put Dominion North Carolina,
   I&M Indiana and Kentucky Power (and Duke Energy Kentucky) in PJM, which
   is right for the zone and the transmission, but there a bundled bill
   carries no capacity charge set by a PJM capacity tag, and a curtailment
   service provider cannot enrol the site: the one route is the utility's
   own Commission-approved tariff. Dated as read; clearing a state here
   reopens both rows. */
var PJM_BUNDLED = {
  NC: { name: 'North Carolina',
        dr: 'Closed here: the North Carolina Utilities Commission opted Dominion Energy North Carolina\'s retail customers out of PJM wholesale demand response when Dominion moved its North Carolina transmission into PJM ("Order Opting Out of Retail Customer Participation in Wholesale Demand Response Programs", Docket E-22, Sub 418, 2010-03-11; PJM\'s list of RERRA orders, read 2026-09-29). Not counted.' },
  IN: { name: 'Indiana',
        dr: 'Closed here: Indiana end-use customers "shall not be enrolled or otherwise participate in RTO demand response programs directly or through curtailment service providers or other aggregators" — only through their utility\'s IURC-approved tariff (IURC Cause 43566, order of 2010-07-28; read 2026-09-29). Not counted.' },
  KY: { name: 'Kentucky',
        dr: 'Closed here: "No retail electric customer is authorized to participate directly or indirectly in any PJM wholesale market, including but not limited to DR programs … except under a tariff or special contract on file with the Commission" (Kentucky PSC Case 2017-00129, order of 2017-06-06, restating the conditions of the Kentucky Power, Duke Energy Kentucky and EKPC moves into PJM; read 2026-09-29). Not counted.' }
};
function bundledPlcWhy(st) {
  return 'Not on this bill: ' + PJM_BUNDLED[st].name + ' has no retail choice, so a bundled bill carries no supply capacity charge set by a PJM capacity tag (PLC); the utility recovers its capacity in its rates. Not counted.';
}

/* New York by utility, because the two New York City rates follow two
   different territories: Con Edison's Dynamic Load Management follows its
   service territory (New York City and Westchester), the NYISO SCR price
   follows NYC's own capacity zone (Zone J). Long Island and the Rockaways
   are PSEG Long Island (LIPA), NYISO Zone K — neither Con Edison's
   programmes nor its rates. Queens ZIPs 11004 and 11005 sit in the 110
   prefix but are Con Edison, in the city. */
var NY_CONED_ZIP5 = { '11004': true, '11005': true };
function nyArea(z3, zip5) {
  if (NY_CONED_ZIP5[zip5] || (z3 >= 100 && z3 <= 104) || (z3 >= 111 && z3 <= 114))
    return { conEd: true, zoneJ: true, li: false, area: 'Con Edison (New York City, NYISO Zone J)' };
  if (z3 >= 106 && z3 <= 108) return { conEd: true, zoneJ: false, li: false, area: 'Con Edison (Westchester)' };
  if (z3 === 105) return { conEd: true, zoneJ: false, li: false, area: 'Con Edison (Westchester; parts of 105xx, and Putnam County, are NYSEG or Central Hudson — confirm the utility)' };
  if (z3 === 110 || (z3 >= 115 && z3 <= 119))
    return { conEd: false, zoneJ: false, li: true, area: 'PSEG Long Island (LIPA, NYISO Zone K)' };
  return { conEd: false, zoneJ: false, li: false, area: null };
}
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
  var ny = state === 'NY' ? nyArea(z.z3, z.zip) : { conEd: false, zoneJ: false, li: false, area: null };
  if (!area) area = ny.area;
  var inferred = true;
  /* An override that moves the site to another market also drops the area:
     the label named the utility of the market it came with, and a label
     that contradicts the market is worse than none. */
  if (marketOverride && has(MARKETS, marketOverride)) {
    if (marketOverride !== market) area = null;
    market = marketOverride; inferred = false;
  }
  return {
    ok: true, zip: z.zip, state: state, market: market, marketName: MARKETS[market],
    area: area, conEd: ny.conEd, zoneJ: ny.zoneJ, li: ny.li,
    nyc: ny.zoneJ,          /* New York City proper (kept for callers of the old flag) */
    comed: state === 'IL' && z.z3 >= 600 && z.z3 <= 611,
    pjmBundled: market === 'PJM' && has(PJM_BUNDLED, state) ? state : null,
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
  }
};
var DEFAULT_ANNUAL_KWH = { residential: 10800, commercial: 300000, industrial: 2400000 };

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

/* One interval file → hourly kW on the simulated calendar.

   Reading a CSV. Lines end in CRLF, LF or a lone CR (Excel for Mac). The
   delimiter is the one the most sampled lines carry (from the top and the
   middle of the file), so a stray tab in a title line never decides it.
   Cells are split with double quotes honoured (a quoted "1,234.5" is one
   reading, not two), and a cell carrying a currency sign is never a
   reading. In a tab or semicolon file a comma inside a number is read the
   way the file itself shows it: decimal commas ("0,25", "1.234,5") where
   only a decimal comma fits, a thousands separator ("1,250.0") where only
   that fits — and a reading whose comma could be either ("1,250") is
   refused with its row, never guessed. A reading that carries digits but
   is not a number is refused the same way, never read as zero.

   The load column. When a header row names the columns, the load is the
   column headed usage / kWh / kW / demand / load (money words match as
   whole words: cost, price, rate, charge — "Integrated Demand" is not a
   rate). A column that measures something else — power factor, kVA,
   kVAR, volts, amps — is never the load, and neither is one whose last
   word is a time part ("Usage Hour", "Usage Date") unless it names kW or
   kWh. Two load columns are narrowed by the unit the caller chose (an
   explicit kWh or kW first, then the looser words: usage / energy, or
   demand / load), and still two is refused rather than guessed. Without a
   header, one numeric column is the load and more than one is refused. A
   cell longer than any real reading is skipped before it is tested, and
   the number test runs in linear time, so a hostile cell cannot pin the
   function.

   Rows. Once the first reading carries a date or a clock time, a row
   without one is a note or a footer (a "Total" line) and is skipped, and a
   stamped row whose reading is blank or "N/A" is a gap: counted, read as
   zero within 2%, and said so. In a file with no stamps, a row that starts
   with Total / Sum / Average / Max is a footer.

   The calendar. The simulation runs on 2025 (1 Jan a Wednesday), and
   billing, TOU windows and summer events are laid on it by hour. The date
   column is read on every row: its day/month order is settled across the
   whole file (a first part over 12 anywhere is a day, a second part over
   12 anywhere is a day; a two-digit year is the part that holds still),
   month names and 20250605 are read too, and a file that runs newest-first
   is read oldest-first. Its first date places it — or `startDate` for a
   bare list; a file's own date wins over a `startDate` and the note says
   so: 29 Feb is removed, a year that runs past 365 days loses its last
   day, a 364-day remainder repeats its last day, and the series is wrapped
   so each reading lands on its own calendar date, then moved by the shift
   of up to three days that lands the most of its weekends on the
   calendar's weekends, counted over every day (a year that crosses New
   Year or 29 Feb cannot line up everywhere; the note says how many days
   differ). With no date anywhere the readings are READ AS STARTING 1
   JANUARY, and the result says so. 8760/8784 hourly, 17520/17568
   half-hourly or 35040/35136 quarter-hourly; kWh-per-interval is converted
   when the caller says so. */
var NUM_RE = /^-?(?:\d+(?:\.\d+)?|\.\d+)(?:e-?\d+)?$/i;   /* linear: no two quantifiers compete for a digit */
var MAX_CELL = 32;                                         /* no reading is longer; a longer cell is never tested */
var LOAD_HEAD = /(usage|consumption|kwh|\bkw\b|demand|load|value|reading|import|delivered|energy|power)/i;
var MONEY_HEAD = /(\bcost|\$|€|£|\bprice|\bamount|\bcharges?\b|\busd\b|dollar|\brates?\b)/i;
var EXPORT_HEAD = /(export|generat|solar|\bpv\b|received)/i;   /* what left the site is not its load */
var NOT_LOAD_HEAD = /(factor|\bpf\b|kvar|\bkvah?\b|reactive|apparent|volt|\bamps?\b|ampere|frequency|\bhz\b|temperature|\btemp\b)/i;
var TIME_TAIL = /\b(?:hour|hr|he|time|date|day|interval|period|start|end|ending|beginning|month|year)\s*(?:\([^)]*\))?\s*$/i;
var UNIT_TOKEN = /\bkwh?\b/i;
var FOOTER = /^\s*(?:grand\s+)?(?:total|totals|sum|average|mean|avg|min|minimum|max|maximum)\b/i;
var CLOCK = /^\s*\d{1,2}:\d{2}/;
var CURRENCY = /[$€£¥]/;
var MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
var MONTH_FULL = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
var SHIFTS = [0, 1, -1, 2, -2, 3, -3];                     /* ties go to the smaller move */
var MAX_TEXT = 4300000;   /* characters: a year of 15-minute rows with an account id and a revision stamp on each is ~3.2 MB; under Vercel's 4.5 MB body */

function splitCells(line, delim) {
  var out = [], i;
  if (line.indexOf('"') < 0) {
    var parts = line.split(delim);
    for (i = 0; i < parts.length; i++) out.push({ s: parts[i], q: false });
    return out;
  }
  var cur = '', inQ = false, quoted = false, ch;
  for (i = 0; i < line.length; i++) {
    ch = line.charAt(i);
    if (inQ) {
      if (ch === '"') { if (line.charAt(i + 1) === '"') { cur += '"'; i++; } else inQ = false; }
      else cur += ch;
    } else if (ch === '"') { inQ = true; quoted = true; }
    else if (ch === delim) { out.push({ s: cur, q: quoted }); cur = ''; quoted = false; }
    else cur += ch;
  }
  out.push({ s: cur, q: quoted });
  return out;
}
/* How a tab or semicolon file writes a comma inside a number, read off the
   file: 'comma' where some cell can only be a decimal comma, 'group' where
   some cell can only be a thousands separator, null where neither (or
   both) shows — then a comma reading is refused, not guessed. */
function commaIsDecimal(s) {
  return (/^-?\d+,\d+$/.test(s) && !/^-?[1-9]\d{0,2}(?:,\d{3})+$/.test(s)) || /^-?\d{1,3}(?:\.\d{3})+,\d+$/.test(s);
}
function commaIsGroup(s) { return /^-?[1-9]\d{0,2}(?:,\d{3})+\.\d+$/.test(s) || /^-?[1-9]\d{0,2}(?:,\d{3}){2,}$/.test(s); }
function numberFormat(rows, delim) {
  if (delim === ',') return null;                          /* a comma inside a cell there is quoted: "1,234.5" */
  var dec = 0, grp = 0;
  for (var i = 0; i < rows.length; i++) for (var j = 0; j < rows[i].length; j++) {
    var s = rows[i][j].s.trim();
    if (s.length > MAX_CELL || s.indexOf(',') < 0) continue;
    if (commaIsDecimal(s)) dec++; else if (commaIsGroup(s)) grp++;
  }
  return dec && !grp ? 'comma' : (grp && !dec ? 'group' : null);
}
function cellNumber(c, dec) {
  if (!c) return null;
  var s = c.s.trim();
  if (!s || s.length > MAX_CELL || CURRENCY.test(s)) return null;
  if (dec === 'comma') {
    if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(s)) s = s.replace(/\./g, '').replace(',', '.');   /* 1.234,5 */
    else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');                                     /* 0,25 */
  } else if ((dec === 'group' || c.q) && /^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(s)) s = s.replace(/,/g, '');   /* "1,234.5" */
  else if (/^\d{8}$/.test(s) && parseDate(s)) return null;                                      /* 20250605 is a date */
  return NUM_RE.test(s) ? parseFloat(s) : null;
}
/* The delimiter the most sampled lines carry (then the most of it); ties
   go tab, then semicolon, then comma. Quoted text is not counted. */
function pickDelimiter(lines) {
  var ds = ['\t', ';', ','], lines1 = { '\t': 0, ';': 0, ',': 0 }, count = { '\t': 0, ';': 0, ',': 0 }, i, k, seen;
  function look(l) {
    l = l.replace(/"[^"]*"/g, '');
    for (k = 0; k < 3; k++) { var n = l.split(ds[k]).length - 1; if (n) { lines1[ds[k]]++; count[ds[k]] += n; } }
  }
  for (i = 0, seen = 0; i < lines.length && seen < 25; i++) if (lines[i].trim()) { look(lines[i]); seen++; }
  for (i = Math.floor(lines.length / 2), seen = 0; i < lines.length && seen < 25; i++) if (lines[i].trim()) { look(lines[i]); seen++; }
  var best = ds[0];
  for (k = 1; k < 3; k++) {
    var d = ds[k];
    if (lines1[d] > lines1[best] || (lines1[d] === lines1[best] && count[d] > count[best])) best = d;
  }
  return best;
}

function daysIn(y, m) { return m === 2 ? ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 29 : 28) : DAYS[m - 1]; }
function mkDate(y, m, d) {
  if (!(y >= 1900 && y <= 2100) || !(m >= 1 && m <= 12) || !(d >= 1 && d <= daysIn(y, m))) return null;
  return { y: y, m: m, d: d };
}
function monthWord(w) {
  w = String(w).toLowerCase();
  if (w === 'sept') return 9;
  for (var i = 0; i < 12; i++) if (w.length >= 3 && MONTH_FULL[i].indexOf(w) === 0) return i + 1;
  return 0;
}
function yr(y) { return y < 100 ? y + 2000 : y; }
var NUMERIC_DATE = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4}|\d{2})(?:$|[T\s,])/;
/* A date at the start of a cell: 2025-07-02, 2025/07/02, 20250702,
   2-Jul-2025, 2 July 2025, Jul 2, 2025, or a numeric 7/2/2025 or 07-02-25.
   `order` ('mdy' | 'dmy' | 'ymd') is the column's, settled across the file
   by dateOrder(); a lone date (a `startDate`) reads day first only when
   the first number cannot be a month. */
function parseDate(s, order) {
  s = String(s == null ? '' : s).trim();
  if (s.length > 40) return null;
  var m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})(?:$|[T\s,])/.exec(s);
  if (m) return mkDate(+m[1], +m[2], +m[3]);
  m = /^(\d{4})(\d{2})(\d{2})(?:$|[T\s])/.exec(s);
  if (m) return mkDate(+m[1], +m[2], +m[3]);
  m = /^(\d{1,2})[-\s\/.]([A-Za-z]{3,9})\.?[-\s\/.,]+(\d{4}|\d{2})(?:$|[T\s,])/.exec(s);
  if (m) return monthWord(m[2]) ? mkDate(yr(+m[3]), monthWord(m[2]), +m[1]) : null;
  m = /^([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})(?:$|[T\s,])/.exec(s);
  if (m) return monthWord(m[1]) ? mkDate(+m[3], monthWord(m[1]), +m[2]) : null;
  m = NUMERIC_DATE.exec(s);
  if (!m) return null;
  var a = +m[1], b = +m[2];
  if (order === 'ymd') return m[3].length === 2 ? mkDate(yr(a), b, +m[3]) : null;
  var y = yr(+m[3]);
  if (order === 'dmy') return mkDate(y, b, a);
  if (order === 'mdy') return mkDate(y, a, b);
  return a > 12 && b <= 12 ? mkDate(y, b, a) : mkDate(y, a, b);
}
/* The order of a column of numeric dates, read across all of it: a first
   part over 12 anywhere is a day (D/M), a second part over 12 anywhere is
   a day (M/D), both is a conflict; with two-digit years, a first part that
   holds still while the last one runs over a month is the year (YY-MM-DD).
   No evidence at all (it cannot happen across a year) is the US order,
   marked assumed. A column of ISO or month-name dates needs no order. */
function dateOrder(cells) {
  var maxA = 0, maxB = 0, two = true, any = false, aSeen = {}, cSeen = {}, nA = 0, nC = 0;
  for (var i = 0; i < cells.length; i++) {
    var m = NUMERIC_DATE.exec(String(cells[i] == null ? '' : cells[i]).trim());
    if (!m) continue;
    any = true;
    if (+m[1] > maxA) maxA = +m[1];
    if (+m[2] > maxB) maxB = +m[2];
    if (m[3].length !== 2) two = false;
    if (!has(aSeen, m[1])) { aSeen[m[1]] = 1; nA++; }
    if (!has(cSeen, m[3])) { cSeen[m[3]] = 1; nC++; }
  }
  if (!any) return { order: null };
  if (two && nA <= 2 && nC > 2 && maxB <= 12) return { order: 'ymd' };
  if (maxA > 12 && maxB > 12) return { order: null, conflict: true };
  if (maxA > 12) return { order: 'dmy' };
  if (maxB > 12) return { order: 'mdy' };
  return { order: 'mdy', assumed: true };
}
function addDays(dt, k) {
  var x = new Date(Date.UTC(dt.y, dt.m - 1, dt.d + k));
  return { y: x.getUTCFullYear(), m: x.getUTCMonth() + 1, d: x.getUTCDate() };
}
function dayNumber(dt) { return Math.round(Date.UTC(dt.y, dt.m - 1, dt.d) / 86400000); }
function weekdayOf(dt) { return new Date(Date.UTC(dt.y, dt.m - 1, dt.d)).getUTCDay(); }
function calDay(dt) { return MONTH_START[dt.m - 1] / 24 + dt.d - 1; }   /* 0–364 on the 365-day calendar */
function showDate(dt) { return dt.d + ' ' + MONTH_NAMES[dt.m - 1] + ' ' + dt.y; }
function perOf(n) { return n === 8760 || n === 8784 ? 1 : (n === 17520 || n === 17568 ? 2 : (n === 35040 || n === 35136 ? 4 : 0)); }

function parseInterval(text, unit, startDate) {
  var lines = String(text || '').replace(/^﻿/, '').split(/\r\n|\r|\n/), i, j;
  var delim = pickDelimiter(lines), rows = [], lineNo = [];
  for (i = 0; i < lines.length; i++) {
    if (!lines[i].trim()) continue;
    rows.push(splitCells(lines[i], delim)); lineNo.push(i + 1);
  }
  var dec = numberFormat(rows, delim);
  function numOf(c) { return cellNumber(c, dec); }
  function numericCount(r) { var k = 0; for (var q = 0; q < r.length; q++) if (numOf(r[q]) != null) k++; return k; }
  function colIsNumeric(from, col) {
    var seen = 0, good = 0;
    for (var q = from; q < rows.length && seen < 20; q++) { seen++; if (numOf(rows[q][col]) != null) good++; }
    return seen > 0 && good >= Math.ceil(seen * 0.9);
  }
  /* a row stamped with a date or a clock time in a cell other than the load */
  function stampedRow(r, skip) {
    for (var q = 0; q < r.length; q++) if (q !== skip && (CLOCK.test(r[q].s) || parseDate(r[q].s))) return true;
    return false;
  }
  function footerRow(r) { for (var q = 0; q < r.length; q++) { var t = r[q].s.trim(); if (t) return FOOTER.test(t); } return false; }
  /* a reading that carries digits but is not a number is a format problem,
     refused with its row — never read as zero */
  function unreadable(i2, c) {
    var t = c ? c.s.trim() : '';
    if (!/\d/.test(t)) return null;
    return 'Row ' + fmt(lineNo[i2]) + ': the reading "' + (t.length > 24 ? t.slice(0, 24) + '…' : t) + '" is not a number this simulator can read' +
           (t.indexOf(',') >= 0 ? ' (its comma could be a thousands separator or a decimal point, and the file does not show which)' : '') +
           '. Export the readings as plain numbers, or fix that cell.';
  }

  /* The header: the first row with no number in it that names a load
     column whose readings follow. */
  var head = -1, col = -1, headName = null, err = null;
  for (i = 0; i < rows.length && i < 60 && head < 0; i++) {
    var r = rows[i];
    if (numericCount(r) > 0) continue;
    var cand = [];
    for (j = 0; j < r.length; j++) {
      var name = r[j].s.trim();
      if (name.length > 60 || !LOAD_HEAD.test(name) || MONEY_HEAD.test(name) || EXPORT_HEAD.test(name) || NOT_LOAD_HEAD.test(name)) continue;
      if (TIME_TAIL.test(name) && !UNIT_TOKEN.test(name)) continue;
      if (colIsNumeric(i + 1, j)) cand.push(j);
    }
    if (!cand.length) continue;
    if (cand.length > 1) {
      var kwhUnit = unit === 'kwh', narrow = [];
      for (j = 0; j < cand.length; j++) if (kwhUnit ? /\bkwh\b/i.test(r[cand[j]].s) : /\bkw\b/i.test(r[cand[j]].s)) narrow.push(cand[j]);
      if (!narrow.length) {
        var loose = kwhUnit ? /usage|consumption|energy/i : /demand|\bload\b/i;
        for (j = 0; j < cand.length; j++) if (loose.test(r[cand[j]].s) && (kwhUnit || !/kwh/i.test(r[cand[j]].s))) narrow.push(cand[j]);
      }
      if (narrow.length !== 1) {
        var names = []; for (j = 0; j < cand.length; j++) names.push('"' + r[cand[j]].s.trim() + '"');
        err = 'The file has more than one load column (' + names.join(', ') + ') and the unit chosen (' + (kwhUnit ? 'kWh' : 'kW') +
              ') does not tell them apart; keep one column of readings.';
        break;
      }
      cand = narrow;
    }
    head = i; col = cand[0]; headName = r[col].s.trim();
  }
  if (err) return { ok: false, error: err };

  var vals = [], dataRows = [], stamps = null, v, why;
  if (head >= 0) {
    for (i = head + 1; i < rows.length; i++) {
      var row = rows[i], st = stampedRow(row, col);
      v = numOf(row[col]);
      if (stamps === null) {
        if (v == null && !st) continue;                               /* a units line or a note before the readings */
        stamps = st;
      } else if (stamps ? !st : (v == null && numericCount(row) === 0)) continue;   /* a note, a blank or a footer */
      if (!st && footerRow(row)) continue;                            /* "Total,…" in a file with no stamps */
      if (v == null && (why = unreadable(i, row[col]))) return { ok: false, error: why };
      vals.push(v == null ? NaN : v);                                 /* a gap: counted unreadable below */
      dataRows.push(i);
    }
  } else {
    for (i = 0; i < rows.length; i++) {
      var k = numericCount(rows[i]);
      if (!k) {
        /* a stamped row with no reading, once the readings are stamped: a gap */
        if (stamps === true && stampedRow(rows[i], col)) {
          if ((why = unreadable(i, rows[i][col]))) return { ok: false, error: why };
          vals.push(NaN); dataRows.push(i);
        }
        continue;                                                     /* a title or a header without a load name */
      }
      if (stamps === true && !stampedRow(rows[i], col)) continue;      /* a footer in a stamped file */
      if (stamps !== true && footerRow(rows[i])) continue;
      if (k > 1) return { ok: false, error: 'More than one column holds numbers and no header names the load; add a header row (for example "Date,kW") or keep one column of readings.' };
      for (j = 0; j < rows[i].length; j++) { var x = numOf(rows[i][j]); if (x != null) { vals.push(x); break; } }
      if (stamps === null) { col = j; stamps = stampedRow(rows[i], col); }
      dataRows.push(i);
    }
  }

  /* The dates: the first data row's date cell names the column, its order
     is settled across every row, and the first and last dates say which
     way the file runs. */
  var notes = [], start = null, dateCol = -1, dated = false, datesOff = false, undatedWhy = null, n = vals.length;
  if (dataRows.length) {
    var r0 = rows[dataRows[0]];
    for (j = 0; j < r0.length && dateCol < 0; j++) if (j !== col && parseDate(r0[j].s)) dateCol = j;
  }
  if (dateCol >= 0) {
    var dcells = []; for (i = 0; i < dataRows.length; i++) dcells.push(rows[dataRows[i]][dateCol] ? rows[dataRows[i]][dateCol].s : '');
    var ord = dateOrder(dcells);
    if (ord.conflict) {
      undatedWhy = 'The date column mixes day-first and month-first dates, so it could not be read; the readings were read as starting on 1 January. Give the first reading\'s date to place them.';
    } else {
      var firstD = null, lastD = null;
      for (i = 0; i < dcells.length && i < 50 && !firstD; i++) firstD = parseDate(dcells[i], ord.order);
      for (i = dcells.length - 1; i >= 0 && i >= dcells.length - 50 && !lastD; i--) lastD = parseDate(dcells[i], ord.order);
      if (firstD && lastD) {
        var span = dayNumber(lastD) - dayNumber(firstD);
        if (span < 0) {
          vals.reverse(); start = lastD; span = -span;
          notes.push('The file lists its newest reading first; it was read oldest first, from ' + showDate(lastD) + '.');
        } else start = firstD;
        var per0 = perOf(n), endD = start === firstD ? lastD : firstD;
        if (per0 && Math.abs(span - (n / (24 * per0) - 1)) > 1) {
          datesOff = true;
          notes.push('The dates run from ' + showDate(start) + ' to ' + showDate(endD) + ' (' + fmt(span + 1) + ' days) but the readings cover ' +
                     fmt(n / (24 * per0)) + ' days; they were laid in file order from ' + showDate(start) + '.');
        }
        if (ord.assumed) notes.push('Every date in the file could be read day-first or month-first; they were read month-first (US), so the first reading is ' + showDate(start) + '.');
      }
    }
  } else if (head >= 0) {
    for (j = 0; j < rows[head].length; j++) if (j !== col && /date|time|stamp|period|\bday\b|start/i.test(rows[head][j].s)) {
      undatedWhy = 'The file\'s date column ("' + rows[head][j].s.trim().slice(0, 40) + '") could not be read, so the readings were read as starting on 1 January. A file that starts on another date shifts every month, event and weekday — give the first reading\'s date.';
      break;
    }
  }
  var given = startDate ? parseDate(startDate) : null;
  if (start) {
    dated = true;
    if (given && dayNumber(given) !== dayNumber(start))
      notes.push('The file\'s own dates were used (first reading ' + showDate(start) + '); the start date given (' + showDate(given) + ') was not.');
  } else if (given) { start = given; dated = true; }

  if (headName) {
    var hint = /kwh/i.test(headName) ? 'kwh' : (/\bkw\b|demand/i.test(headName) ? 'kw' : null);
    if (!hint && dataRows.length) for (j = 0; j < rows[head].length; j++) {
      var u0 = rows[dataRows[0]][j];
      if (/^\s*units?\s*$/i.test(rows[head][j].s) && u0 && /^\s*kwh\s*$/i.test(u0.s)) hint = 'kwh';
    }
    for (j = 0; j < rows[head].length; j++) if (j !== col && EXPORT_HEAD.test(rows[head][j].s) && rows[head][j].s.trim().length <= 60 && colIsNumeric(head + 1, j)) {
      notes.push('The file also has an export column ("' + rows[head][j].s.trim() + '"); only "' + headName + '" was read as the load. If the site has solar, those readings are already net of it — leave Solar blank.');
      break;
    }
    if (hint && hint !== (unit === 'kwh' ? 'kwh' : 'kw'))
      notes.push('The load column ("' + headName + '") looks like ' + (hint === 'kwh' ? 'kWh per interval' : 'kW') +
                 ', but it was read as ' + (unit === 'kwh' ? 'kWh per interval' : 'kW') + ' as chosen; change the unit if that is wrong.');
  }
  var out = intervalToHourly(vals, unit, dated ? start : null, { undatedWhy: undatedWhy });
  if (out.ok) { out.notes = notes.concat(out.notes); if (datesOff) out.datesOff = true; }
  return out;
}

function intervalToHourly(vals, unit, start, opts) {
  if (!Array.isArray(vals)) return { ok: false, error: 'The interval data is not a list of readings.' };
  var n = vals.length, per = perOf(n);
  if (!per) return { ok: false, error: 'An interval file must be one year: 8,760 hourly or 35,040 fifteen-minute readings (' + fmt(n) + ' found).' };
  var nDays = n / (24 * per), keep = [], notes = [], d, dt, leapGone = null, lastDropped = false;
  if (start) {
    for (d = 0; d < nDays; d++) {
      dt = addDays(start, d);
      if (dt.m === 2 && dt.d === 29) { leapGone = dt; continue; }
      if (keep.length === 365) { lastDropped = true; continue; }
      keep.push(d);
    }
  } else {
    /* A 366-day file with no date: a leap year from 1 January, so the day
       removed is 29 Feb (the 60th), not 31 Dec. */
    for (d = 0; d < nDays; d++) if (!(nDays === 366 && d === 59)) keep.push(d);
  }
  var padded = 0;
  while (keep.length < 365) { keep.push(keep[keep.length - 1]); padded++; }

  var kwh = unit === 'kwh', hourly = new Array(HOURS_YEAR), bad = 0, kd, hh, j;
  for (kd = 0; kd < 365; kd++) {
    for (hh = 0; hh < 24; hh++) {
      var s = 0, base = (keep[kd] * 24 + hh) * per;
      for (j = 0; j < per; j++) {
        var v = Number(vals[base + j]);
        if (!isFinite(v)) { bad++; v = 0; }
        s += kwh ? v * per : v;           /* kWh in a 1/per-hour interval → kW */
      }
      hourly[kd * 24 + hh] = Math.max(0, s / per);
    }
  }
  if (bad > n * 0.02) return { ok: false, error: fmt(bad) + ' readings are not numbers.' };

  var out = hourly, aligned = false;
  if (start) {
    /* Wrap onto the calendar by date, then move by the shift of up to three
       days that puts the most of the file's weekends on the calendar's,
       counted over every placed day — not the first day alone: a year that
       crosses New Year (365 ≡ 1 mod 7) or loses 29 Feb slips a weekday
       part-way through, and no single shift lines up every day. */
    var first = addDays(start, keep[0]), c0 = calDay(first), wd0 = weekdayOf(start), fileWE = new Uint8Array(365);
    for (kd = 0; kd < 365; kd++) { var w = (wd0 + keep[kd]) % 7; fileWE[kd] = w === 0 || w === 6 ? 1 : 0; }
    var shift = 0, miss = Infinity;
    for (var si = 0; si < SHIFTS.length; si++) {
      var o = ((c0 + SHIFTS[si]) % 365 + 365) % 365, mm = 0;
      for (kd = 0; kd < 365; kd++) if (fileWE[kd] !== (isWeekend((kd + o) % 365) ? 1 : 0)) mm++;
      if (mm < miss) { miss = mm; shift = SHIFTS[si]; }
    }
    var off = ((c0 + shift) % 365 + 365) % 365;
    if (off) {
      out = new Array(HOURS_YEAR);
      var oh = off * 24;
      for (var h = 0; h < HOURS_YEAR; h++) out[(h + oh) % HOURS_YEAR] = hourly[h];
    }
    aligned = true;
    if (off || first.y !== 2025 || miss) {
      notes.push('Your readings start on ' + showDate(first) + '; each was laid on its own calendar date of the simulated year' +
                 (shift ? ', moved ' + Math.abs(shift) + ' day' + (Math.abs(shift) === 1 ? '' : 's') + ' ' + (shift > 0 ? 'later' : 'earlier') : '') +
                 (miss ? ' — weekends line up on all but ' + miss + ' of 365 days (a year that crosses New Year or 29 Feb cannot line up on every day)'
                       : (shift ? ' so weekends line up' : '')) + '.');
    }
    if (leapGone) notes.push('29 Feb ' + leapGone.y + ' was removed to fit the 365-day calendar.');
    if (lastDropped) notes.push('The file runs past a year; its last day was dropped.');
    if (padded) notes.push('The file covers ' + (365 - padded) + ' days once 29 Feb is removed; its last day was repeated to close the year.');
  } else {
    notes.push((opts && opts.undatedWhy) ||
               ('No dates were found with the readings, so they were read as starting on 1 January' +
                (nDays === 366 ? ' of a leap year (29 Feb, the 60th day, was removed)' : '') +
                '. A file that starts on another date shifts every month, event and weekday — include the date column, or give the start date.'));
  }
  if (bad) notes.push(fmt(bad) + ' unreadable readings were read as zero.');
  return { ok: true, kw: out, notes: notes, readings: n, dated: aligned };
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
  var months = [], covered = 0, withKwh = 0;
  for (i = 0; i < 12; i++) {
    var x = acc[i];
    months.push({ month: i, kwh: x.kwhN ? x.kwh / x.kwhN : null, peakKw: x.peakN ? x.peak / x.peakN : null,
                  cost: x.costN ? x.cost / x.costN : null });
    if (x.n) covered++;
    if (x.kwhN) withKwh++;
  }
  return { ok: true, months: months, covered: covered, withKwh: withKwh, rows: bills.length };
}

function buildLoad(input, loc, segment) {
  var intake = input.load || {}, clim = CLIMATE[loc.climate], notes = [], m, i;
  if (intake.type === 'interval') {
    var p = Array.isArray(intake.values) ? intervalToHourly(intake.values, intake.unit, parseDate(intake.startDate))
                                          : parseInterval(intake.text, intake.unit, intake.startDate);
    if (!p.ok) return p;
    /* Undated readings are placed on the calendar by assumption, which moves
       every summer event and weekday if the assumption is wrong; so are
       dated ones whose dates do not span the readings. */
    return { ok: true, kw: p.kw, source: 'interval', quality: p.dated && !p.datesOff ? 'high' : 'medium', notes: p.notes,
             label: 'Your interval data (' + fmt(p.readings) + ' readings)' };
  }
  if (intake.type === 'bills') {
    var b = billsToMonths(intake.bills);
    if (!b.ok) return b;
    if (b.withKwh < 12) {
      /* A month with no kWh — no bill at all, or dollars only — is filled by
         the climate curve, anchored on the months that do carry kWh, and
         marked so its dollars never calibrate the rate. */
      var sum = 0, wsum = 0, filled = 0, dollarsOnly = 0;
      for (m = 0; m < 12; m++) if (b.months[m].kwh != null) { sum += b.months[m].kwh; wsum += clim[m]; }
      if (!wsum) return { ok: false, error: 'The bills carry no kWh, so the load cannot be shaped.' };
      for (m = 0; m < 12; m++) if (b.months[m].kwh == null) {
        b.months[m].kwh = sum / wsum * clim[m]; b.months[m].kwhFilled = true; filled++;
        if (b.months[m].cost != null) dollarsOnly++;
      }
      notes.push(filled + ' calendar month(s) had no kWh on a bill and were filled from the climate curve' +
                 (dollarsOnly ? ' (' + dollarsOnly + ' of them carried dollars only; those dollars are not used to calibrate the rate)' : '') + '.');
    }
    var kw = [], anyPeak = false;
    for (m = 0; m < 12; m++) {
      var mo = b.months[m];
      if (mo.peakKw) anyPeak = true;
      var fit = fitMonth(shapeMonth(segment, m), mo.kwh, mo.peakKw);
      for (i = 0; i < fit.length; i++) kw.push(fit[i]);
    }
    if (!anyPeak && segment !== 'residential') notes.push('No bill carried a peak kW, so each month\'s peak comes from the ' + segment + ' load shape — add the billed demand for a real demand-charge figure.');
    return { ok: true, kw: kw, source: 'bills', quality: (anyPeak || segment === 'residential') && b.withKwh >= 12 ? 'medium' : 'low',
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
  /* The tariff's tax is one percentage on each month's subtotal, so each
     line carries exactly amount × pct of it: the three buckets are scaled
     by it and the tax line itself is not a bucket. Energy + demand + fixed
     is then the bill, and a saving on energy or demand carries its tax. */
  var energy = 0, demand = 0, fixed = 0, i2, j, tx = 1 + (t.taxPct || 0) / 100;
  for (i2 = 0; i2 < b.months.length; i2++) {
    var L = b.months[i2].lines;
    for (j = 0; j < L.length; j++) {
      if (L[j].kind === 'tax') continue;
      if (L[j].kind === 'energy' || L[j].kind === 'adder') energy += L[j].amount;
      else if (L[j].kind.indexOf('demand') === 0) demand += L[j].amount;
      else fixed += L[j].amount;
    }
  }
  return { total: b.total, energy: energy * tx, demand: demand * tx, fixed: fixed * tx, months: b.months };
}

/* ── THE BATTERY ─────────────────────────────────────────────────────── */
function defaultBattery(segment, peakKw) {
  if (segment === 'residential') return { kw: 5, kwh: 13.5 };
  var kw = Math.max(25, Math.round(peakKw * 0.25 / 25) * 25);
  return { kw: kw, kwh: kw * 2 };
}

/* The hour-by-hour dispatch. Per month, the demand target is the lowest
   level every day of that month can be held to with the battery's power,
   one day's usable energy and the hours the dispatch itself charges in
   (binary search). Each hour then:
     1. over the target → discharge the excess (the demand charge first);
     2. an event hour (the one programme paid per kWh delivered, on its
        called summer days) → discharge what the event asks, from energy no
        later over-target hour needs;
     3. the day's dearest price → discharge what is not reserved for later
        peaks and events (TOU arbitrage), never below zero net load (no
        export) — so the TOU stream is what bears the events' cost;
     4. solar surplus or the day's cheapest price → charge, never lifting
        net load above the target.
   "Reserved" is a look-ahead over the rest of the year, not just today: the
   store each hour must keep for the over-target hours (and events) still to
   come, less what the charging hours between can put back. Without it, an
   evening's arbitrage spends what tomorrow morning's demand shave needs.

   Losses: ONE model, the round trip split evenly. A kWh bought stores
   √rte; a kWh delivered takes 1/√rte out of the store, so delivered over
   bought is rte, and every "can it deliver" test reads the store as
   soc × √rte. The target bisection uses the same model. */
function dispatch(load, solar, bat, t, events, evHours) {
  var n = HOURS_YEAR, P = bat.kw, E = bat.kwh * bat.dod, rte = bat.rte, sr = Math.sqrt(rte);
  var Eout = E * sr;                                   /* what a full battery delivers */
  var net0 = new Float64Array(n), h, day, s;
  for (h = 0; h < n; h++) net0[h] = load[h] - (solar ? solar[h] : 0);
  var price = priceSeries(t);
  var demandBilled = t.hasFlatDemand || t.hasTouDemand;

  /* The dispatch's own prices per day, and whether an hour is one it
     charges from the grid in. */
  var pMaxD = new Float64Array(365), pMinD = new Float64Array(365), spreadD = [], gridCharge = new Uint8Array(n);
  for (day = 0; day < 365; day++) {
    s = day * 24;
    var pMax = -Infinity, pMin = Infinity;
    for (h = s; h < s + 24; h++) { if (price[h] > pMax) pMax = price[h]; if (price[h] < pMin) pMin = price[h]; }
    pMaxD[day] = pMax; pMinD[day] = pMin; spreadD[day] = pMax * rte - pMin > 0.005;
    for (h = s; h < s + 24; h++) gridCharge[h] = (!spreadD[day] || price[h] <= pMin + 1e-9) ? 1 : 0;
  }
  /* What the battery can buy in hour h if it is not discharging: solar
     surplus, or grid in a charging hour up to the line. */
  function canBuy(hr, line) {
    var x = net0[hr];
    if (x < 0) return Math.min(P, -x);
    return gridCharge[hr] ? Math.min(P, Math.max(0, line - x)) : 0;
  }

  var eventSet = {}; for (var e = 0; e < events.length; e++) eventSet[events[e]] = true;
  var evCap = Math.min(P, Eout / Math.max(1, evHours || 4));   /* the event spread over its hours */
  var monthAt = new Uint8Array(n), mm0;
  for (mm0 = 0; mm0 < 12; mm0++) for (h = MONTH_START[mm0]; h < MONTH_START[mm0] + DAYS[mm0] * 24; h++) monthAt[h] = mm0;

  var target = new Float64Array(12), peakM = new Float64Array(12), m;
  for (m = 0; m < 12; m++) {
    var a = MONTH_START[m], b = a + DAYS[m] * 24, peak = 0;
    for (h = a; h < b; h++) if (net0[h] > peak) peak = net0[h];
    peakM[m] = peak;
    if (!demandBilled || peak <= 0) { target[m] = Infinity; continue; }
    var lo = Math.max(0, peak - P), hi = peak;
    for (var it = 0; it < 30; it++) {
      var mid = (lo + hi) / 2, ok = true;
      for (var d0 = a; d0 < b && ok; d0 += 24) {
        /* a day passes when its energy above the line fits what the battery
           delivers AND the hours it charges in buy it back, losses included */
        var need = 0, refill = 0;
        for (h = d0; h < d0 + 24; h++) {
          if (net0[h] > mid) need += net0[h] - mid;
          else refill += canBuy(h, mid);
        }
        if (need > Eout || need > refill * rte) ok = false;
      }
      if (ok) hi = mid; else lo = mid;
    }
    target[m] = hi;
  }

  /* The day-by-day test cannot see an over-target stretch that runs past
     midnight (or past a month's end) with no charging hour between: that
     is ONE discharge, and the store may not hold it. So the targets are
     checked the way the dispatch runs — the store each hour must keep for
     the over-target hours still to come, less what the charging hours
     between put back (the same reserve the dispatch keeps below), and it
     may never need more than the battery holds. Month by month, in order,
     a month whose target breaks that is raised to the lowest one that
     holds: the dispatch serves the earlier hours first, so the later month
     is the one that would miss. `upTo` checks hours [0, upTo) with every
     later month unconstrained. */
  function reserveHolds(tg, upTo) {
    var r = 0;
    for (var hh = upTo - 1; hh >= 0; hh--) {
      var Tt = tg[monthAt[hh]], xx = net0[hh], nP = xx > Tt ? Math.min(P, xx - Tt) : 0;
      if (nP > 0) r += nP / sr;
      else if (!(eventSet[hh] && xx > 0)) r = Math.max(0, r - canBuy(hh, Tt) * sr);
      if (r > E * (1 + 1e-9) + 1e-9) return false;
    }
    return true;
  }
  var tgt = new Float64Array(12);
  for (m = 0; m < 12; m++) tgt[m] = Infinity;
  for (m = 0; m < 12; m++) {
    tgt[m] = target[m];
    var upTo = MONTH_START[m] + DAYS[m] * 24;
    if (!isFinite(target[m]) || reserveHolds(tgt, upTo)) continue;
    var lo2 = target[m], hi2 = peakM[m];            /* at its own peak the month asks nothing */
    for (var it2 = 0; it2 < 30; it2++) {
      tgt[m] = (lo2 + hi2) / 2;
      if (reserveHolds(tgt, upTo)) hi2 = tgt[m]; else lo2 = tgt[m];
    }
    tgt[m] = target[m] = hi2;
  }
  /* The store (kWh) to keep at the start of each hour: `resPeak` for the
     over-target hours to come, `resAll` for those and the events. */
  var resPeak = new Float64Array(n + 1), resAll = new Float64Array(n + 1);
  for (h = n - 1; h >= 0; h--) {
    var T = target[monthAt[h]], x0 = net0[h];
    var needP = x0 > T ? Math.min(P, x0 - T) : 0, needA = needP;
    if (eventSet[h]) needA = Math.max(needA, Math.min(evCap, Math.max(0, x0)));
    var credit = needA > 0 ? 0 : canBuy(h, T) * sr;
    resPeak[h] = Math.min(E, needP > 0 ? resPeak[h + 1] + needP / sr : Math.max(0, resPeak[h + 1] - credit));
    resAll[h] = Math.min(E, needA > 0 ? resAll[h + 1] + needA / sr : Math.max(0, resAll[h + 1] - credit));
  }

  var net = new Float64Array(n), soc = E, dis = 0, chg = 0, eventKwh = 0, shaveHours = 0;
  for (h = 0; h < n; h++) {
    day = Math.floor(h / 24);
    var T0 = target[monthAt[h]], x = net0[h], d = 0, c = 0, avail = soc * sr;
    if (x > T0) d = Math.min(P, x - T0, avail);
    if (eventSet[h]) {
      /* the event takes only what no later over-target hour needs */
      var spare = Math.max(0, (soc - d / sr - resPeak[h + 1]) * sr);
      var want = Math.min(evCap, d + spare, Math.max(0, x));
      if (want > d) d = want;
    }
    if (d === 0 && spreadD[day] && price[h] >= pMaxD[day] - 1e-9) {
      d = Math.max(0, Math.min(P, x, (soc - resAll[h + 1]) * sr));
    }
    if (d > 0) {
      if (x > T0) shaveHours++;
      if (eventSet[h]) eventKwh += d;
      soc = Math.max(0, soc - d / sr); dis += d; net[h] = x - d; continue;
    }
    var room = (E - soc) / sr;
    if (x < 0) c = Math.min(P, -x, room);                       /* solar surplus */
    /* never from the grid inside a called event: what it buys there comes
       off the reduction the event pays for, and the next charging hour
       buys it at the same price (the reserve above already gives an event
       hour no charging credit) */
    else if (gridCharge[h] && !eventSet[h]) c = Math.min(P, room, Math.max(0, T0 - x));
    c = Math.max(0, c);
    soc += c * sr; chg += c;
    net[h] = x + c;
  }
  return { net: net, net0: net0, targets: target, cycles: dis / Math.max(Eout, 1e-9), dischargedKwh: dis, chargedKwh: chg,
           socEndKwh: soc, eventKwh: eventKwh, shaveHours: shaveHours, events: events };
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
   programme and what replaces the figure.

   Row fields beyond the rate:
     kind        'capacity' — per committed kW-year; 'event' — per kWh
                 DELIVERED, priced off the dispatch's own event days;
                 'pjm' — PJM RPM capacity (value-stack.js's figures)
     exportOk    the programme meters the battery itself, so its full rating
                 counts; otherwise the kW is capped at the site's summer
                 peak (a load reduction cannot exceed the load)
     billSaving  a cut in a charge on the customer's OWN bill (a capacity or
                 transmission tag): category 'bill', so it stays with the
                 owner and out of the 70/20/10 split, while it still
                 competes in its exclusivity group
     closed      not open to a new enrolment: listed under `missing` with
                 the reason and never counted. Programme status is DATED in
                 the text, not live; clearing the field restores the row
     needsSolar  only batteries paired with on-site renewables (`solarWhy`
                 in the programme's own terms)
     pairWhy     what a row says when it loses to the row named `pairWith`
                 (programmes that can sit together, only one of which this
                 estimate models) */
var PROGRAMS = [
  { id: 'ca.elrp', name: 'Emergency Load Reduction Program (ELRP)', markets: ['CAISO'], group: 'ca-dr',
    segments: SEGMENTS, kind: 'event', perKwh: 2.00, win: [16, 21],
    eventsBySegment: { residential: 7, commercial: 3, industrial: 3 },
    hoursBySegment: { residential: 3, commercial: 4, industrial: 4 },
    pairWith: 'ca.ra',
    pairWhy: 'CBP / DRAM pays more for the same hours. Enrolled there, the site could add ELRP through Group B (B.2 for CBP, B.1 for DRAM), which pays only the reduction beyond the CBP/DRAM commitment — that top-up is not modelled, so only the better of the two is counted.',
    ref: 'CPUC ELRP pays $2/kWh of verified incremental load reduction in events called 4–9 pm, May–October, up to 60 hours a season; the pilot is approved through 2027 (elrp.sdge.com, read 2026-09-29). A home battery enrols through a VPP aggregator in sub-group A.4 (behind-the-meter storage, at least 500 kW aggregated, events of 1–3 h: 3 h here); a non-residential site through an aggregator in A.2 (events of 1–5 h: 4 h here). It pays incremental reduction against a baseline of similar non-event days, so a battery is paid for what it gives BEYOND its everyday discharge — here, the dispatch with the events minus the dispatch without them. The planning year is the recent record, not the 60-hour cap: PG&E and SCE each called seven A.4 events in 2024 (about 20 event-hours), and two (PG&E) and three (SCE) A.2 events — so 7 events for a home battery and 3 for a business here (PG&E and SCE PY2024 ELRP load-impact evaluations, Demand Side Analytics, calmac.org, read 2026-09-29). The utility\'s event record for the season replaces it.' },
  { id: 'ca.dsgs', exportOk: true, name: 'Demand Side Grid Support (DSGS) Option 3', markets: ['CAISO'], group: 'ca-dr',
    segments: ['residential', 'commercial'], kind: 'capacity', perKwYear: 60, minHours: 2,
    closed: 'Closed to a new aggregation: the CEC\'s DSGS Guidelines, 5th edition (adopted 2026-04-27, CEC-300-2026-001-CMF), limit Option 3 in the 2026 season to storage VPP aggregators that took part in October 2025, and the 2026–27 state budget funds no 2027 season (status read 2026-09-29). Not counted.',
    ref: 'CEC DSGS Option 3 (storage VPP) pays per kW of verified summer-season capacity. Planning figure; the season\'s published rate replaces it if the CEC reopens Option 3.' },
  { id: 'ca.ra', name: 'Resource Adequacy via DR aggregator (CBP / DRAM)', markets: ['CAISO'], group: 'ca-dr',
    segments: ['commercial', 'industrial'], kind: 'capacity', perKwYear: 42, minHours: 4,
    pairWith: 'ca.elrp',
    pairWhy: 'ELRP pays more for the same event hours. The two can sit together — through ELRP Group B (B.2 for CBP, B.1 for DRAM) the site keeps its CBP/DRAM payment and ELRP pays only the reduction beyond that commitment — but that top-up is not modelled, so only the better of the two is counted.',
    ref: 'Capacity Bidding Program / DRAM monthly capacity payments May–October. Planning figure; the aggregator\'s contract replaces it.' },

  { id: 'ercot.ader', exportOk: true, name: 'ERCOT ADER (Aggregated DER) via retail VPP', markets: ['ERCOT'], group: 'ercot-grid',
    segments: ['residential', 'commercial'], kind: 'capacity', perKwYear: 45, minHours: 1,
    ref: 'ERCOT\'s ADER pilot lets a retail-provider VPP sell aggregated batteries into energy and ancillary services. Planning figure from REP battery-programme credits.' },
  { id: 'ercot.ers', name: 'Emergency Response Service (ERS)', markets: ['ERCOT'], group: 'ercot-grid',
    segments: ['commercial', 'industrial'], kind: 'capacity', perKwYear: 28, minHours: 2,
    ref: 'ERCOT ERS standby payments by contract period. Planning figure; the period\'s clearing price replaces it.' },
  { id: 'ercot.4cp', billSaving: true, name: 'Transmission 4CP avoidance', markets: ['ERCOT'], group: 'ercot-4cp',
    segments: ['commercial', 'industrial'], kind: 'capacity', perKwYear: 60, minHours: 2, minPeakKw: 700,
    ref: 'An IDR-metered ERCOT customer\'s transmission charge is set by its load in the four summer coincident peaks; each kW off those intervals avoids roughly $5/kW-month for a year. A saving on the customer\'s own bill, so it stays with the owner. Planning figure; the TDSP\'s TCOS rate replaces it.' },

  { id: 'pjm.capacity', name: 'PJM capacity via curtailment service provider (Demand Resource)', markets: ['PJM'], group: 'pjm-cap',
    segments: SEGMENTS, kind: 'pjm', minHours: 4, retailDr: true },
  { id: 'pjm.plc', billSaving: true, choiceOnly: true, name: 'Capacity tag (PLC) reduction — 5CP', markets: ['PJM'], group: 'pjm-cap',
    segments: ['commercial', 'industrial'], kind: 'capacity', perKwYear: 100, minHours: 3,
    ref: 'Holding load down in PJM\'s five coincident summer peaks lowers the site\'s capacity tag and the supply bill\'s capacity charge for the next year — a saving on the customer\'s own bill, so it stays with the owner. Planning figure below the $325/MW-day clearing price, since not every peak is caught.' },
  { id: 'pjm.utility', name: 'Utility demand-response tariff', markets: ['PJM'], bundledOnly: true, group: 'pjm-cap',
    segments: ['commercial', 'industrial'], kind: 'capacity', perKwYear: 40, minHours: 4,
    segWhy: 'The demand-response tariffs on file for this route are for business customers; no route for a home battery is on file here.',
    ref: 'Where the state has closed PJM demand response to retail customers, a business reaches it only through the utility\'s own Commission-approved tariff: in Indiana, I&M\'s Rider D.R.S.1 (Demand Response Service – Emergency, IURC Cause 43566 PJM1); in Kentucky, a tariff or special contract on file with the PSC (Kentucky Power: Rider D.R.S.); in North Carolina, Dominion Energy North Carolina\'s own demand-side programmes. $40/kW-yr is the planning figure this platform carries for a utility load-response programme (as in MISO); the utility\'s tariff terms replace it.' },
  { id: 'pjm.comedvpp', exportOk: true, name: 'ComEd Rider SDVPP (Scheduled Dispatch VPP)', markets: ['PJM'], comedOnly: true, group: 'pjm-cap',
    segments: SEGMENTS, kind: 'capacity', perKwYear: 10, unit: 'kW-Season (one Season a year)', minHours: 2, tier: 'published',
    ref: 'ComEd Rider SDVPP, approved by the ICC (filed 2026-06-01 under Public Act 104-0458, effective 2026-07-16; service begins no later than 2027-03-01): $10 per kW-Season of average injection at the battery\'s smart inverter over the 4–6 pm CPT weekday window, 1 June–30 September, five-Season term. It replaced Rider VPP / BYODLR, which ComEd withdrew in ICC Docket 25-0678 on 2025-11-18. The daily summer dispatch is not taken out of the bill streams here.',
    url: 'https://icc.illinois.gov/downloads/public/filing/4/399541.pdf' },

  { id: 'ny.dlm', name: 'Utility Dynamic Load Management (CSRP + DLRP)', nameConEd: 'Con Edison Dynamic Load Management (CSRP + DLRP)',
    markets: ['NYISO'], group: 'ny-dlm',
    segments: SEGMENTS, kind: 'capacity', perKwYear: 30, perKwYearConEd: 120, minHours: 4,
    ref: 'New York utility Dynamic Load Management programmes pay per kW-month over the summer; Con Edison\'s network tiers (New York City and Westchester) pay several times upstate rates. Planning figures; the utility\'s current reservation rates replace them.' },
  { id: 'ny.scr', name: 'NYISO ICAP Special Case Resource', markets: ['NYISO'], group: 'ny-icap',
    segments: ['commercial', 'industrial'], kind: 'capacity', perKwYear: 25, perKwYearZoneJ: 55, minHours: 4,
    ref: 'NYISO capacity through a responsible interface party; New York City (Zone J) clears well above the rest of the state. Planning figure; the strip auction clearing price for the zone replaces it.' },

  { id: 'ne.connected', exportOk: true, name: 'ConnectedSolutions / Energy Storage Solutions', markets: ['ISONE'], states: ['MA', 'RI', 'CT', 'NH'], group: 'ne-dr',
    segments: SEGMENTS, kind: 'capacity', perKwYear: 225, minHours: 2,
    ref: 'Massachusetts, Rhode Island and New Hampshire ConnectedSolutions (daily summer dispatch) and Connecticut\'s Energy Storage Solutions pay per kW of average summer performance. Planning figure between the programmes\' published rates.' },
  { id: 'ne.gmp', exportOk: true, name: 'Green Mountain Power battery programme', markets: ['ISONE'], states: ['VT'], group: 'ne-dr',
    segments: ['residential', 'commercial'], kind: 'capacity', perKwYear: 100, minHours: 2,
    ref: 'GMP\'s bring-your-own-device battery programme. Planning figure.' },
  { id: 'ne.fcm', name: 'ISO-NE Forward Capacity Market via aggregator', markets: ['ISONE'], group: 'ne-dr',
    segments: ['commercial', 'industrial'], kind: 'capacity', perKwYear: 36, minHours: 2,
    ref: 'ISO-NE FCM capacity through an active demand capacity resource aggregator. Planning figure; the FCA clearing price replaces it.' },
  { id: 'ne.cps', exportOk: true, name: 'Massachusetts Clean Peak Standard', markets: ['ISONE'], states: ['MA'], needsSolar: true, group: 'ne-cps',
    segments: SEGMENTS, kind: 'capacity', perKwYear: 30, minHours: 2,
    ref: 'Clean Peak Energy Certificates for storage charged from qualifying renewables and discharged in the seasonal peak. Planning figure.' },

  { id: 'miso.dr', exportOk: true, name: 'Utility battery / load-response programme', markets: ['MISO'], group: 'miso',
    segments: SEGMENTS, kind: 'capacity', perKwYear: 40, minHours: 2,
    ref: 'MISO-area utility programmes (Xcel, Ameren, DTE, Consumers and others). Planning figure; the utility\'s tariff replaces it.' },
  { id: 'miso.lmr', name: 'MISO capacity (Load Modifying Resource)', markets: ['MISO'], group: 'miso',
    segments: ['commercial', 'industrial'], kind: 'capacity', perKwYear: 35, minHours: 4,
    ref: 'MISO Planning Resource Auction capacity through a market participant. The auction clears very differently by season and zone; planning figure.' },
  { id: 'spp.dr', exportOk: true, name: 'Utility battery / load-response programme', markets: ['SPP'], group: 'spp',
    segments: SEGMENTS, kind: 'capacity', perKwYear: 30, minHours: 2,
    ref: 'SPP-area utility demand-response and battery programmes. Planning figure.' },
  { id: 'se.dr', exportOk: true, name: 'Utility battery programme (BYOD)', markets: ['SE'], group: 'se',
    segments: SEGMENTS, kind: 'capacity', perKwYear: 45, minHours: 2,
    ref: 'Southeast utility battery programmes (e.g. Duke PowerPair / PowerShare, Georgia Power). Planning figure; the utility\'s programme terms replace it.' },
  { id: 'west.dr', exportOk: true, name: 'Utility battery programme (BYOD)', markets: ['WEST'], group: 'west',
    segments: SEGMENTS, kind: 'capacity', perKwYear: 50, minHours: 2,
    ref: 'Western utility battery programmes (e.g. APS Storage Rewards, Xcel Colorado Renewable Battery Connect, NV Energy, Portland General). Planning figure.' },
  { id: 'hi.bb', exportOk: true, name: 'Hawaiian Electric Bring Your Own Device Plus (BYOD Plus)', markets: ['HI'], group: 'hi',
    segments: ['residential', 'commercial'], kind: 'capacity', perKwYear: 60, minHours: 2,
    needsSolar: true, solarWhy: 'BYOD Plus takes only batteries paired with renewable generation; no solar was entered.',
    ref: 'Battery Bonus closed to new participants on 2024-07-01; its successor, Bring Your Own Device Plus (Rule 33, effective 2025-05-15, a five-year programme to 2030-05-14), asks a two-hour discharge every day and pays two things (hawaiianelectric.com Rule 33, Sheets 49.41-K and -L, read 2026-09-29). The ONE-TIME upfront incentive of $400 per kW committed ($800 for a qualifying low-to-moderate-income customer) is not counted here: it is listed with the other one-time incentives. The RECURRING part is a monthly Grid Service Export Credit: on a tariff other than NEM it is fixed at (retail rate − the DER tariff\'s export rate) × committed kW × 70% × 2 h × 30 days; a NEM customer already exports at the retail rate and gets nothing beyond it. $60/kW-yr is a planning figure for that recurring credit, not derived from those terms; the customer\'s own rates in that formula replace it.' }
];

/* Whether a programme is open to this site: false when it is not offered
   in this market at all (not listed), a reason when it is offered but this
   site cannot earn it (listed under `missing`), null when it is open. */
function gate(p, ctx) {
  var loc = ctx.loc;
  if (p.markets.indexOf(loc.market) < 0) return false;
  if (p.states && p.states.indexOf(loc.state) < 0) return false;
  if (p.comedOnly && !loc.comed) return false;
  if (p.bundledOnly && !loc.pjmBundled) return false;
  if (p.closed) return p.closed;
  if (p.retailDr && loc.pjmBundled) return PJM_BUNDLED[loc.pjmBundled].dr;
  if (p.choiceOnly && loc.pjmBundled) return bundledPlcWhy(loc.pjmBundled);
  if (p.segments.indexOf(ctx.segment) < 0) return p.segWhy || ('Not open to ' + ctx.segment + ' sites.');
  if (p.needsSolar && !(ctx.solarKw > 0)) return p.solarWhy || 'Needs storage charged from on-site renewables; no solar was entered.';
  if (p.minPeakKw && ctx.peakKw < p.minPeakKw) return 'Applies to interval-metered sites above ' + fmt(p.minPeakKw) + ' kW peak (this site: ' + fmt(ctx.peakKw) + ' kW).';
  return null;
}
/* The one programme paid per kWh delivered, if this site can join it: its
   events are run through the dispatch, because its money is energy the
   battery must actually have in those hours. */
function eventProgram(ctx) {
  for (var i = 0; i < PROGRAMS.length; i++) if (PROGRAMS[i].kind === 'event' && gate(PROGRAMS[i], ctx) === null) return PROGRAMS[i];
  return null;
}
function eventHours(p, segment) { return (p.hoursBySegment && p.hoursBySegment[segment]) || 4; }
function eventCount(p, segment) { return (p.eventsBySegment && p.eventsBySegment[segment]) || p.events || 0; }

/* A behind-the-meter battery sells a reduction in the site's own load, so
   the kW it can commit is capped at what the site draws in the summer
   peak — a 250 kW battery on an 80 kW building is an 80 kW resource.
   Programmes that meter the battery itself (exportOk: the residential and
   BYOD battery programmes) take its full rating. Energy is what the battery
   DELIVERS: usable kWh after the discharge half of the round trip. */
function programValue(p, ctx) {
  var bat0 = ctx.battery, perf = ctx.performance, pct = Math.round(perf * 100) + '% performance';
  var Eout = bat0.kwh * bat0.dod * Math.sqrt(bat0.rte);
  var shed = p.exportOk ? bat0.kw : Math.min(bat0.kw, ctx.shedKw), capped = shed < bat0.kw;
  var capNote = capped ? ' Capped at the site\'s ' + r2(shed) + ' kW summer peak load (no export).' : '';
  if (p.kind === 'pjm') {
    /* Behind the meter, through a CSP, the battery is a Demand Resource in
       RPM, accredited at the Demand Resource class rating — not a Capacity
       Storage Resource in the 4/6/8/10-hour classes, which are for storage
       that sells as storage. What limits a battery as DR is how long it
       can hold its reduction; that is the planning assumption here. */
    var PJ = V.PJM, H = p.minHours, limit = Eout / H, kwC = Math.min(shed, limit);
    if (!(kwC > 0)) return { skip: 'The site draws no load in the summer peak to reduce, so nothing is claimed.' };
    /* `published` only when a published figure or the site's own data sets
       the kW: the four-hour nomination is a planning assumption, and so is
       a summer peak read off an assumed load shape. */
    var byDuration = limit < shed, byAssumedPeak = !byDuration && capped && ctx.loadAssumed, ucap = kwC * PJ.drElcc;
    return { usd: ucap / 1000 * PJ.price * 365 * perf, tier: byDuration || byAssumedPeak ? 'planning' : 'published',
             how: r2(kwC) + ' kW nominated' + (byDuration ? ' (what the ' + r2(Eout) + ' kWh it delivers holds for ' + H + ' h)' : '') +
                  ' × ' + Math.round(PJ.drElcc * 100) + '% (PJM\'s Demand Resource class) = ' + r2(ucap) + ' kW UCAP, at $' +
                  PJ.price.toFixed(2) + '/MW-day × ' + pct + '.' + capNote +
                  (byAssumedPeak ? ' That peak is read off a load shape, not metered or billed demand (' + ctx.loadLabel + '), so the kW is a planning figure; interval data or billed peaks replace it.' : ''),
             ref: 'Behind the meter, through a curtailment service provider, a battery is a Demand Resource, accredited at the Demand Resource class rating — not in the 4/6/8/10-hour storage classes. From 2027/28 a Demand Resource must be available in every hour with no limit on the number of events, and a battery that runs out mid-event pays Capacity Performance penalties, so it is nominated at what it can hold for ' + H + ' hours (the duration of PJM\'s shortest storage class) — a planning assumption the CSP\'s nomination replaces. ' + PJ.priceRef + ' ' + PJ.drElccRef,
             url: PJ.priceUrl };
  }
  if (p.kind === 'event') {
    var ev = ctx.event;
    if (!ev || ev.id !== p.id) return { skip: 'Its events were not run through the dispatch, so nothing is claimed.' };
    if (!(ev.kwh > 0.005)) return { skip: 'ELRP pays only the reduction beyond the site\'s usual load in the event hours, and on the called days this battery already gives everything it can in those hours as part of its everyday dispatch (this simulation does not export past the meter; exports in an event would count, and are not modelled). Nothing is claimed.' };
    return { usd: ev.kwh * perf * p.perKwh, tier: 'planning', cost: ev.billCost, deliveredKwh: r2(ev.kwh), eventHoursKwh: r2(ev.total),
             how: ev.days + ' events × ' + ev.hours + ' h (from ' + ev.win[0] + ':00 on the site\'s highest-load summer weekdays): the dispatch delivered ' +
                  fmt(ev.kwh) + ' kWh in the event hours beyond its everyday operation (' + r2(ev.kwh / Math.max(1, ev.days)) + ' kWh an event) × ' +
                  pct + ' × $' + p.perKwh.toFixed(2) + '/kWh. Holding charge for the events ' +
                  (ev.billCost > 0.5 ? 'costs $' + fmt(ev.billCost) + ' a year of bill savings, which the bill streams carry when this is counted.' : 'costs no bill savings.'),
             ref: p.ref };
  }
  var rate = p.perKwYear, rateNote = '', loc = ctx.loc;
  if (p.perKwYearConEd && loc.conEd) rate = p.perKwYearConEd;
  if (p.perKwYearZoneJ && loc.zoneJ) rate = p.perKwYearZoneJ;
  if (loc.li && (p.perKwYearConEd || p.perKwYearZoneJ))
    rateNote = ' Long Island (PSEG Long Island, NYISO Zone K): the upstate planning rate is used, not Con Edison\'s or New York City\'s; PSEG Long Island\'s own terms replace it.';
  var kwCommitted = Math.min(shed, Eout / (p.minHours || 1));
  return { usd: kwCommitted * rate * perf, tier: p.tier || 'planning', url: p.url, kw: kwCommitted,
           how: r2(kwCommitted) + ' kW committed (' + fmt(shed) + ' kW for ' + (p.minHours || 1) + ' h' +
                (kwCommitted < shed ? ', limited by the ' + r2(Eout) + ' kWh it delivers' : '') + ') × $' + rate + '/' + (p.unit || 'kW-yr') + ' × ' +
                pct + '.' + capNote + rateNote, ref: p.ref };
}

function programs(ctx) {
  var loc = ctx.loc, chosen = {}, score = {}, all = [], missing = [], i;
  for (i = 0; i < PROGRAMS.length; i++) {
    var p = PROGRAMS[i], why = gate(p, ctx);
    if (why === false) continue;
    var v = why ? null : programValue(p, ctx);
    if (v && v.skip) { why = v.skip; v = null; }
    var row = { id: p.id, name: (p.nameConEd && loc.conEd) ? p.nameConEd : p.name, group: p.group, category: p.billSaving ? 'bill' : 'grid' };
    if (!v) { row.eligible = false; row.why = why; missing.push(row.name + ' — ' + why); all.push(row); continue; }
    row.eligible = true; row.usd = r0(v.usd); row.tier = v.tier; row.how = v.how; row.ref = v.ref; if (v.url) row.url = v.url;
    if (v.deliveredKwh != null) { row.deliveredKwh = v.deliveredKwh; row.eventHoursKwh = v.eventHoursKwh; row.billCost = r0(v.cost); }
    if (v.kw != null) row.committedKw = r2(v.kw);
    all.push(row);
    /* What an operator weighs: an event programme net of the bill savings
       that holding charge for it costs. */
    score[p.id] = v.usd - (v.cost || 0);
    if (!chosen[p.group] || score[chosen[p.group].id] < score[p.id]) chosen[p.group] = row;
  }
  var picked = [];
  for (i = 0; i < all.length; i++) {
    var r = all[i], w = chosen[r.group];
    if (!r.eligible) continue;
    if (w === r && score[r.id] > 0) { r.counted = true; picked.push(r); continue; }
    r.counted = false;
    if (!(score[r.id] > 0)) r.why = r.billCost > 0 ? 'Holding charge for its events costs $' + fmt(r.billCost) + ' a year of bill savings, more than the events pay; not enrolled.'
                                               : 'Nothing to earn at this site.';
    else {
      var pr = null; for (var k = 0; k < PROGRAMS.length; k++) if (PROGRAMS[k].id === r.id) pr = PROGRAMS[k];
      r.why = (pr && pr.pairWith === w.id && pr.pairWhy) ? pr.pairWhy : 'Same hours as ' + w.name + ', which pays more — one of the two.';
    }
  }
  if (!all.length) missing.push('No grid-service programme is on file for ' + (MARKETS[loc.market] || loc.market) + ' yet.');
  return { picked: picked, all: all, missing: missing };
}

/* ── THE RUN ─────────────────────────────────────────────────────────── */
var TOO_LONG = 'More than twelve hours of storage is outside what this simulator models.';
function validate(input) {
  var errs = [];
  if (!input || typeof input !== 'object') return [{ field: '', message: 'Send the site as a JSON object.' }];
  if (!zip3Of(input.zip)) errs.push({ field: 'zip', message: 'A five-digit US ZIP code is needed.' });
  if (input.segment != null && SEGMENTS.indexOf(input.segment) < 0) errs.push({ field: 'segment', message: 'Site type is residential, commercial or industrial.' });
  var b = input.battery || {};
  if (b.kw != null && !(num(b.kw, 0) > 0 && num(b.kw, 0) <= 100000)) errs.push({ field: 'battery.kw', message: 'Battery power must be between 0 and 100,000 kW.' });
  if (b.kwh != null && !(num(b.kwh, 0) > 0 && num(b.kwh, 0) <= 800000)) errs.push({ field: 'battery.kwh', message: 'Battery energy must be between 0 and 800,000 kWh.' });
  if (b.kw != null && b.kwh != null && num(b.kwh, 0) / num(b.kw, 1) > 12) errs.push({ field: 'battery.kwh', message: TOO_LONG });
  if (input.solarKw != null && !(num(input.solarKw, -1) >= 0 && num(input.solarKw, 0) <= 100000)) errs.push({ field: 'solarKw', message: 'Solar must be between 0 and 100,000 kW-dc.' });
  var l = input.load || {};
  if (l.type && ['interval', 'bills', 'profile'].indexOf(l.type) < 0) errs.push({ field: 'load.type', message: 'Load is interval, bills or profile.' });
  if (l.type === 'interval' && typeof l.text !== 'string' && !Array.isArray(l.values)) errs.push({ field: 'load.text', message: 'Attach the interval file.' });
  if (l.type === 'interval' && typeof l.text === 'string' && l.text.length > MAX_TEXT) errs.push({ field: 'load.text', message: 'The interval file is larger than this simulator takes (' + (MAX_TEXT / 1e6).toFixed(1) + ' million characters); export one year of hourly or 15-minute readings, without extra columns.' });
  if (l.type === 'interval' && l.startDate != null && !parseDate(l.startDate)) errs.push({ field: 'load.startDate', message: 'The start date is YYYY-MM-DD.' });
  if (l.type === 'bills' && !Array.isArray(l.bills)) errs.push({ field: 'load.bills', message: 'Enter at least one month of bills.' });
  var s = input.split;
  if (s && typeof s === 'object') {
    var tot = num(s.owner, 0) + num(s.platform, 0) + num(s.installer, 0);
    if (Math.abs(tot - 1) > 0.001 || num(s.owner, -1) < 0 || num(s.platform, -1) < 0 || num(s.installer, -1) < 0)
      errs.push({ field: 'split', message: 'The revenue split must be three shares that add up to 100%.' });
  }
  return errs;
}

function sumOver(hours, a, b) { var s = 0; for (var i = 0; i < hours.length; i++) s += a[hours[i]] - (b ? b[hours[i]] : 0); return s; }

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
  var bat = { kw: num(b0.kw, null), kwh: num(b0.kwh, null), dod: 0.9, rte: clamp(num(b0.rte, 0.88), 0.6, 0.98) };
  if (bat.kw == null && bat.kwh == null) { bat.kw = def.kw; bat.kwh = def.kwh; }
  else if (bat.kwh == null) bat.kwh = bat.kw * 2;
  /* kWh alone: the kW at the suggested battery's own duration, so a
     kWh-only request is never a 30-hour battery on a default kW. */
  else if (bat.kw == null) bat.kw = r2(Math.min(100000, bat.kwh / (def.kwh / def.kw)));
  if (bat.kwh / bat.kw > 12) return { ok: false, errors: [{ field: 'battery.kwh', message: TOO_LONG }] };
  bat.assumed = b0.kw == null && b0.kwh == null;
  bat.assumedFields = b0.kw == null && b0.kwh == null ? ['kw', 'kwh'] : (b0.kw == null ? ['kw'] : (b0.kwh == null ? ['kwh'] : []));
  var perf = clamp(num(input.performance, 0.9), 0.5, 1);

  /* Tariff, calibrated to the bills' dollars when they carry any. Only a
     month whose load came from that bill's own kWh calibrates, and only the
     energy and demand rates are scaled, so the customer charge is taken out
     of both sides first: the calibrated bill IS the dollars paid. */
  var tf = buildTariff(input, loc, segment, 1);
  if (!tf.ok) return { ok: false, errors: [{ field: 'tariff', message: tf.error }] };
  var netNoBat = new Array(HOURS_YEAR);
  for (h = 0; h < HOURS_YEAR; h++) netNoBat[h] = load[h] - (solar ? solar[h] : 0);
  var calib = null;
  if (L.source === 'bills' && tf.source === 'planning') {
    var paid = 0, paidMonths = [], mi, j;
    for (mi = 0; mi < 12; mi++) if (L.months[mi].cost != null && !L.months[mi].kwhFilled) { paid += L.months[mi].cost; paidMonths.push(mi); }
    if (paidMonths.length >= 3) {
      var loadOnly = bill(load, tf.tariff), modelled = 0, fixedPaid = 0;
      for (mi = 0; mi < paidMonths.length; mi++) {
        var bm = loadOnly.months[paidMonths[mi]];
        modelled += bm.subtotal;
        for (j = 0; j < bm.lines.length; j++) if (bm.lines[j].kind === 'fixed') fixedPaid += bm.lines[j].amount;
      }
      var varModel = modelled - fixedPaid, varPaid = paid - fixedPaid;
      if (varModel > 0) {
        var raw = varPaid / varModel, k = clamp(raw, 0.4, 2.5);
        tf = buildTariff(input, loc, segment, k);
        calib = { factor: r2(k), note: varPaid <= 0
          ? 'The bills come to no more than the planning customer charge ($' + fmt(fixedPaid) + ' over ' + paidMonths.length + ' month(s)), so the energy and demand rates were set to the ' + r2(k) + '× floor (capped).'
          : 'The planning energy and demand rates were scaled by ' + r2(k) + '× so the modelled bill matches the ' + paidMonths.length +
            ' month(s) of dollars on the bills (the customer charge is not scaled)' + (k !== raw ? ' (capped)' : '') + '.' };
      }
    }
  }
  var t = tf.tariff;

  /* The dispatch without events, and — when the site can join the
     programme paid per kWh delivered — with them. The event programme is
     worth the kWh the battery delivers in its event hours BEYOND what it
     would anyway (the reduction ELRP pays for), and it costs the bill
     savings that holding charge for the events gives up. */
  var shedKw = 0;
  for (h = MONTH_START[SUMMER[0]]; h < MONTH_START[SUMMER[SUMMER.length - 1]] + DAYS[SUMMER[SUMMER.length - 1]] * 24; h++) if (netNoBat[h] > shedKw) shedKw = netNoBat[h];
  var ctx = { loc: loc, segment: segment, battery: bat, performance: perf, solarKw: solarKw, peakKw: peakKw, shedKw: shedKw,
              loadAssumed: L.quality === 'low', loadLabel: L.label };
  var D0 = dispatch(load, solar, bat, t, [], 0);
  var before = bill(Array.prototype.slice.call(D0.net0), t);
  var after0 = bill(Array.prototype.slice.call(D0.net), t);
  var evP = eventProgram(ctx), D1 = null, after1 = null;
  if (evP) {
    var evH = eventHours(evP, segment), evWin = [evP.win[0], Math.min(evP.win[1], evP.win[0] + evH)];
    var evs = pickEvents(netNoBat, eventCount(evP, segment), evWin);
    D1 = dispatch(load, solar, bat, t, evs, evWin[1] - evWin[0]);
    after1 = bill(Array.prototype.slice.call(D1.net), t);
    ctx.event = { id: evP.id, hours: evWin[1] - evWin[0], win: evWin, days: evs.length / (evWin[1] - evWin[0]),
                  kwh: Math.max(0, sumOver(evs, D0.net, D1.net)), total: sumOver(evs, D1.net0, D1.net),
                  billCost: after1.total - after0.total };
  }
  var G = programs(ctx), withEvents = false, i;
  for (i = 0; i < G.picked.length; i++) if (evP && G.picked[i].id === evP.id) withEvents = true;
  var D = withEvents ? D1 : D0, after = withEvents ? after1 : after0, events = withEvents ? D1.events : [];

  var streams = [];
  var demandSave = before.demand - after.demand, energySave = before.energy - after.energy;
  var evNote = withEvents && ctx.event.billCost > 0.5 ? ' With the ' + evP.name.replace(/ \(.*\)$/, '') + ' events in: holding charge for them costs $' + fmt(ctx.event.billCost) + ' a year here.' : '';
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
         '% round-trip losses. Energy before $' + fmt(before.energy) + ' → after $' + fmt(after.energy) + '.' + evNote, ref: tf.label });
  for (i = 0; i < G.all.length; i++) if (G.all[i].eligible) streams.push(G.all[i]);

  var split = input.split && typeof input.split === 'object'
    ? { owner: num(input.split.owner, 0.7), platform: num(input.split.platform, 0.2), installer: num(input.split.installer, 0.1), ref: 'Your split.' }
    : SPLIT;
  /* Bill savings — the tariff's and the tag programmes' (PLC, 4CP) — stay
     with the customer; only grid-programme earnings are split. */
  var billTotal = 0, tagTotal = 0, gridTotal = 0, best = null;
  for (i = 0; i < streams.length; i++) {
    var st = streams[i];
    if (!st.counted) continue;
    if (st.category === 'bill') { billTotal += st.usd; if (st.id.indexOf('bill.') !== 0) tagTotal += st.usd; } else gridTotal += st.usd;
    if (!best || st.usd > best.usd) best = st;
  }
  var gross = billTotal + gridTotal;
  var ownerGrid = gridTotal * split.owner;

  /* A day to draw: the site's highest-load summer weekday. */
  var sampleDay = 0, sp = -1;
  for (h = MONTH_START[6]; h < MONTH_START[7]; h++) if (D.net0[h] > sp && !isWeekend(Math.floor(h / 24))) { sp = D.net0[h]; sampleDay = Math.floor(h / 24); }
  var evSet = {}; for (i = 0; i < events.length; i++) evSet[events[i]] = true;
  var day = [];
  for (h = sampleDay * 24; h < sampleDay * 24 + 24; h++) {
    day.push({ hour: h % 24, load: r2(load[h]), solar: solar ? r2(solar[h]) : 0, net: r2(D.net[h]),
               battery: r2(D.net0[h] - D.net[h]), event: !!evSet[h] });
  }
  var monthly = [];
  for (var mo = 0; mo < 12; mo++) {
    var a = MONTH_START[mo], z = a + DAYS[mo] * 24, pk0 = 0, pk1 = 0, kwh0 = 0;
    for (h = a; h < z; h++) { if (D.net0[h] > pk0) pk0 = D.net0[h]; if (D.net[h] > pk1) pk1 = D.net[h]; kwh0 += load[h]; }
    monthly.push({ month: mo, kwh: r0(kwh0), peakKw: r2(pk0), peakAfterKw: r2(pk1),
                   targetKw: isFinite(D.targets[mo]) ? r2(D.targets[mo]) : null,
                   billBefore: r0(before.months[mo] ? before.months[mo].subtotal : 0),
                   billAfter: r0(after.months[mo] ? after.months[mo].subtotal : 0) });
  }

  var qRank = { high: 3, medium: 2, low: 1 };
  var tq = tf.source === 'planning' ? (calib ? 'medium' : 'low') : 'high';
  var confidence = qRank[L.quality] <= qRank[tq] ? L.quality : tq;
  var missing = G.missing.slice();
  missing.push('Wholesale energy arbitrage — a behind-the-meter battery reaches wholesale prices only through a retail or aggregator programme; not counted beyond those listed.');
  missing.push('Backup power / resilience — real value, but it is paid in avoided outage cost, not a cheque; not counted.');
  var byod = null; for (i = 0; i < G.all.length; i++) if (G.all[i].id === 'hi.bb' && G.all[i].eligible) byod = G.all[i];
  missing.push('One-time incentives (SGIP, state rebates, the federal ITC' +
               (byod ? '; here BYOD Plus\'s upfront incentive of $400 per kW committed, $' + fmt(400 * byod.committedKw) + ' on the ' + byod.committedKw + ' kW this estimate commits' : '') +
               ') — see the Pro Forma; this is recurring earnings only.');

  return {
    ok: true, version: VERSION, provider: 'simulated',
    site: { zip: loc.zip, state: loc.state, market: loc.market, marketName: loc.marketName, area: loc.area,
            marketInferred: loc.marketInferred, segment: segment, climate: loc.climate },
    load: { source: L.source, label: L.label, quality: L.quality, notes: L.notes, annualKwh: r0(annualKwh), peakKw: r2(peakKw) },
    solar: solarKw > 0 ? { kwdc: solarKw, annualKwh: r0(solarKw * loc.solarYield), yield: loc.solarYield } : null,
    battery: { kw: bat.kw, kwh: bat.kwh, usableKwh: r2(bat.kwh * bat.dod), rte: bat.rte, assumed: bat.assumed, assumedFields: bat.assumedFields,
               cyclesPerYear: r0(D.cycles), dischargedKwh: r0(D.dischargedKwh), chargedKwh: r0(D.chargedKwh),
               eventKwh: r0(D.eventKwh) },
    tariff: { source: tf.source, label: tf.label, rates: tf.rates || null, calibration: calib },
    bill: { before: r0(before.total), after: r0(after.total), savings: r0(before.total - after.total) },
    streams: streams, missing: missing,
    totals: {
      gross: r0(gross), billSavings: r0(billTotal), gridEarnings: r0(gridTotal),
      tariffSavings: r0(billTotal - tagTotal), tagSavings: r0(tagTotal),
      owner: r0(billTotal + ownerGrid), platform: r0(gridTotal * split.platform), installer: r0(gridTotal * split.installer),
      perKw: r2(gross / bat.kw), bestSingle: best ? { id: best.id, name: best.name, usd: best.usd } : null,
      stackUplift: best && best.usd > 0 ? r2(gross / best.usd) : null
    },
    split: { owner: split.owner, platform: split.platform, installer: split.installer, ref: split.ref, appliesTo: 'grid-service earnings; bill savings (the tariff\'s and the PLC / 4CP tags) stay with the customer' },
    monthly: monthly, sampleDay: { day: sampleDay, hours: day },
    confidence: confidence,
    disclaimer: 'A simulation of what a managed VPP (the DividendVPP model) could stack at this site, run by ClearSky-OMEGA. ' +
                'It is not a Molecule Systems or Lightsmith quote; planning figures are marked and replaced by the programme\'s own terms.'
  };
}

module.exports = {
  VERSION: VERSION, SPLIT: SPLIT, MARKETS: MARKETS, PROGRAMS: PROGRAMS, RATE_BOOK: RATE_BOOK, MAX_TEXT: MAX_TEXT,
  locate: locate, parseInterval: parseInterval, intervalToHourly: intervalToHourly, parseDate: parseDate,
  billsToMonths: billsToMonths, fitMonth: fitMonth,
  validate: validate, simulate: simulate,
  /* for the page: what may be chosen, no rates */
  options: function () {
    var m = []; for (var k in MARKETS) if (has(MARKETS, k)) m.push({ key: k, name: MARKETS[k] });
    return { segments: SEGMENTS, markets: m, maxTextChars: MAX_TEXT,
             split: { owner: SPLIT.owner, platform: SPLIT.platform, installer: SPLIT.installer, ref: SPLIT.ref } };
  }
};
