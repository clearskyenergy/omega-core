/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
/* ====================================================================== *
 *  PRO FORMA ENGINE — the after-tax cash flow of one site, and every
 *  figure an investor one-pager quotes from it.
 *  ------------------------------------------------------------------    *
 *  The method is NREL SAM's Single Owner cash flow (ssc cmod_singleowner
 *  and common_financial), because that is what the reference investor
 *  decks were built with: their year-1 distribution rebuilds to the cent
 *  from SAM's reserve arithmetic, and their levelized price and LCOE from
 *  SAM's own formulas. Where SAM has a convention it is kept, however odd
 *  it looks - reserve interest on LAST year's balances, a working-capital
 *  reserve sized on NEXT year's opex, the major-equipment reserve's
 *  inflated level deposits, replacements depreciated as 5-year MACRS,
 *  state tax first and deductible federally, total returns summed over
 *  years 0..N - because a pro forma that disagrees with the deck an
 *  investor already holds is a pro forma nobody trusts.
 *
 *  scripts/tests/tproformaengine.js rebuilds the three decks through run()
 *  and fails the test run when a change here moves a published figure
 *  outside its tolerance. Where a deck used a non-default (a 7% state rate
 *  for a California site, a roof counted as credit property) the TEST
 *  says so; the defaults here follow the law as of September 2026 and are
 *  never bent to match a deck.
 *
 *  What this adds to SAM, each off or SAM-neutral by default:
 *    - basis and ITC per capex line and asset, with the §48E rate build,
 *      the OBBBA solar in-service deadline and the storage phase-down;
 *    - 7- and 39-year classes, bonus, the mid-quarter convention, and
 *      state depreciation that may decouple from federal bonus;
 *    - a standalone tax position: NOLs carried forward under the 80%
 *      limit, and a directly claimed ITC held to §38(c) and carried;
 *    - ITC transfer under §6418;
 *    - debt sized on LTC, DSCR or the lesser, level or sculpted, never
 *      past 90% of installed cost, with a DSRA and the fee amortised for
 *      tax;
 *    - battery revenue from the OMEGA sizing engine's year-by-year savings
 *      schedule, and its pack replacements funded from a reserve;
 *    - demand response, EV charging and other revenue;
 *    - sensitivities, and warnings drawn from the tax research.
 *
 *  Pure: no I/O, no clock, no randomness. Rates arrive as PERCENT (2.5 is
 *  2.5%); IRRs leave as fractions (0.0814). Money is nominal dollars and
 *  is never rounded here - the renderer rounds.
 * ====================================================================== */

var VERSION = 'pf-1';

/* ---------------------------------------------------------------------- *
 *  Depreciation tables
 * ---------------------------------------------------------------------- */

/* A straight-line schedule in percent: firstYear of a full year's
   deduction in the year placed in service, full years after, and the
   remainder in the year after the last full one. */
function straightLine(years, firstYear) {
  var out = [firstYear * 100 / years], k;
  for (k = 1; k < years; k++) out.push(100 / years);
  if (firstYear < 1) out.push((1 - firstYear) * 100 / years);
  return out;
}

/* IRS Publication 946 (2025), Appendix A, in percent. Table A-1 is the
   half-year convention; A-2 to A-5 the mid-quarter convention for
   property placed in service in quarters one to four. 15-year straight
   line is Table A-8 exactly as SAM ships it, so the calibration runs on
   SAM's own numbers; the other straight-line schedules are computed,
   which is all the published tables do before rounding. */
var MACRS = {
  halfYear: {
    macrs5: [20, 32, 19.2, 11.52, 11.52, 5.76],
    macrs7: [14.29, 24.49, 17.49, 12.49, 8.93, 8.92, 8.93, 4.46],
    macrs15: [5, 9.5, 8.55, 7.7, 6.93, 6.23, 5.9, 5.9, 5.91, 5.9, 5.91, 5.9, 5.91, 5.9, 5.91, 2.95],
    sl15: [3.33, 6.67, 6.67, 6.67, 6.67, 6.67, 6.67, 6.66, 6.67, 6.66, 6.67, 6.66, 6.67, 6.66, 6.67, 3.33],
    sl20: straightLine(20, 0.5)
  },
  midQuarter: {
    macrs5: [
      [35, 26, 15.6, 11.01, 11.01, 1.38],
      [25, 30, 18, 11.37, 11.37, 4.26],
      [15, 34, 20.4, 12.24, 11.3, 7.06],
      [5, 38, 22.8, 13.68, 10.94, 9.58]
    ],
    macrs7: [
      [25, 21.43, 15.31, 10.93, 8.75, 8.74, 8.75, 1.09],
      [17.85, 23.47, 16.76, 11.97, 8.87, 8.87, 8.87, 3.34],
      [10.71, 25.51, 18.22, 13.02, 9.3, 8.85, 8.86, 5.53],
      [3.57, 27.55, 19.68, 14.06, 10.04, 8.73, 8.73, 7.64]
    ],
    macrs15: [
      [8.75, 9.13, 8.21, 7.39, 6.65, 5.99, 5.9, 5.91, 5.9, 5.91, 5.9, 5.91, 5.9, 5.91, 5.9, 0.74],
      [6.25, 9.38, 8.44, 7.59, 6.83, 6.15, 5.91, 5.9, 5.91, 5.9, 5.91, 5.9, 5.91, 5.9, 5.91, 2.21],
      [3.75, 9.63, 8.66, 7.8, 7.02, 6.31, 5.9, 5.9, 5.91, 5.9, 5.91, 5.9, 5.91, 5.9, 5.91, 3.69],
      [1.25, 9.88, 8.89, 8, 7.2, 6.48, 5.9, 5.9, 5.9, 5.91, 5.9, 5.91, 5.9, 5.91, 5.9, 5.17]
    ]
  },
  schedule: schedule
};

/* The share of a year's straight-line deduction taken in the year placed
   in service under the mid-quarter convention: placed mid-quarter, so
   10.5, 7.5, 4.5 or 1.5 months of the first year. */
var MQ_FIRST_YEAR = [0.875, 0.625, 0.375, 0.125];

/* The fraction of a class's basis deducted in each year from the year it
   is placed in service; [0] is that first year. pisMonth is 'YYYY-MM'.
   39-year property is nonresidential real property: straight line and
   mid-MONTH whatever the convention for everything else (§168(d)(2)),
   falling back to SAM's half-year when the month is unknown. */
function schedule(cls, convention, pisMonth) {
  var month = monthNumber(pisMonth), pct;
  if (cls === 'none') return [];
  if (cls === 'sl39') {
    pct = straightLine(39, month ? (12.5 - month) / 12 : 0.5);
  } else if (convention === 'mid-quarter' && month) {
    var q = Math.ceil(month / 3);
    pct = MACRS.midQuarter[cls] ? MACRS.midQuarter[cls][q - 1]
                                : straightLine(cls === 'sl15' ? 15 : 20, MQ_FIRST_YEAR[q - 1]);
  } else {
    pct = MACRS.halfYear[cls];
  }
  if (!pct) return [];
  return pct.map(function (x) { return x / 100; });
}

/* Bonus (§168(k)) is applied to the MACRS classes only. The straight-line
   buckets of SAM's split stand for whatever the preparer put there, and
   leaving them without bonus is the conservative reading. */
var BONUS_CLASSES = ['macrs5', 'macrs7', 'macrs15'];
var ALLOC_CLASSES = ['macrs5', 'macrs7', 'macrs15', 'sl15', 'sl20', 'sl39', 'none'];
var LINE_CLASSES = ['energy', 'macrs5', 'macrs7', 'macrs15', 'sl15', 'sl20', 'sl39', 'none'];

/* ---------------------------------------------------------------------- *
 *  State corporate income tax, 2026
 * ---------------------------------------------------------------------- */

/* Percent, from the Tax Foundation's "State Corporate Income Tax Rates and
   Brackets, 2026", top bracket. New York and New Jersey take the rate
   below their $5M and $10M large-company brackets and Connecticut leaves
   out its 10% surtax on $100M-plus companies, as the tax research for
   this tool does: one project company sits far below all three. Maine's
   and Oregon's top brackets start at $3.5M and $1M, so a small project
   pays less than the rate shown; the rate is editable per run. Nevada,
   Ohio, Texas and Washington tax gross receipts instead and South Dakota
   and Wyoming neither; they carry 0, since a receipts tax is an
   operating cost, not an income tax. Georgia stays at 5.19%: its 2026
   trigger was not met. */
var STATE_TAX = {
  AL: 6.5, AK: 9.4, AZ: 4.9, AR: 4.3, CA: 8.84, CO: 4.4, CT: 7.5, DE: 8.7, DC: 8.25, FL: 5.5,
  GA: 5.19, HI: 6.4, ID: 5.3, IL: 9.5, IN: 4.9, IA: 7.1, KS: 7, KY: 5, LA: 5.5, ME: 8.93,
  MD: 8.25, MA: 8, MI: 6, MN: 9.8, MS: 5, MO: 4, MT: 6.75, NE: 4.55, NV: 0, NH: 7.5,
  NJ: 9, NM: 5.9, NY: 6.5, NC: 2, ND: 4.31, OH: 0, OK: 4, OR: 7.6, PA: 7.49, RI: 7,
  SC: 5, SD: 0, TN: 6.5, TX: 0, UT: 4.5, VT: 8.5, VA: 6, WA: 0, WV: 6.5, WI: 7.9, WY: 0
};

var STATE_NAMES = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado',
  CT: 'Connecticut', DE: 'Delaware', DC: 'the District of Columbia', FL: 'Florida', GA: 'Georgia',
  HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois', IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky',
  LA: 'Louisiana', ME: 'Maine', MD: 'Maryland', MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota',
  MS: 'Mississippi', MO: 'Missouri', MT: 'Montana', NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire',
  NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York', NC: 'North Carolina', ND: 'North Dakota',
  OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania', RI: 'Rhode Island',
  SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah', VT: 'Vermont',
  VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming'
};

/* ---------------------------------------------------------------------- *
 *  §48E rate
 * ---------------------------------------------------------------------- */

/* FEOC material-assistance cost ratio thresholds by year construction
   begins (§7701(a)(52)(B)); construction beginning after 2025 only. */
var FEOC = {
  solar: { 2026: 40, 2027: 45, 2028: 50, 2029: 55, 2030: 60 },
  storage: { 2026: 55, 2027: 60, 2028: 65, 2029: 70, 2030: 75 }
};

/* The solar deadline (§48E(e)(4), as OBBBA wrote it): solar that begins
   construction after July 4, 2026 earns nothing unless it is placed in
   service by December 31, 2027. Month precision makes July 2026 the last
   month that can be grandfathered; the warnings say only its first four
   days are. */
var SOLAR_BOC_CUTOFF = '2026-07';
var SOLAR_PIS_DEADLINE = '2027-12';

/* Storage's §48E rate by the year construction begins: the applicable
   year is 2032, so full through 2033, then 75%, 50%, nothing. */
function storagePhaseDown(bocYear) {
  if (!bocYear || bocYear <= 2033) return 1;
  if (bocYear === 2034) return 0.75;
  if (bocYear === 2035) return 0.5;
  return 0;
}

/* itcRate({pwa, energyCommunity, domesticContent, lowIncome, ratePctOverride},
           {asset:'solar'|'storage', under1MWac, kwAc, bocMonth, pisMonth})
   -> {ratePct, build:[{label, pts}], statutory, ...}

   The build is what the deck prints, so its points always add up to the
   rate. The 30% base needs prevailing wage & apprenticeship OR a facility
   under 1 MW AC (§48E(a)(2)(B)); the energy-community and domestic-content
   adders are 10 points on that base and 2 on the 6% one. The low-income
   bonus is solar only, under 5 MW AC, and a flat 10 or 20 points
   (§48E(h)). An entered rate replaces the build and is flagged unless it
   equals what the build gives. The deadline and the phase-down are
   timing rules, not rate components, so they apply to an entered rate as
   well: nobody gets to type their way past a statute. */
function itcRate(cfg, ctx) {
  cfg = cfg || {};
  ctx = ctx || {};
  var solar = ctx.asset !== 'storage';
  var kwAc = isFiniteNum(ctx.kwAc) ? ctx.kwAc : null;
  var under1 = ctx.under1MWac != null ? !!ctx.under1MWac : (kwAc != null && kwAc < 1000);
  var full = !!cfg.pwa || under1, add = full ? 10 : 2;
  var build = [{
    label: full ? (cfg.pwa ? 'Base rate (prevailing wage & apprenticeship)' : 'Base rate (under 1 MW AC)')
                : 'Base rate (no prevailing wage & apprenticeship)',
    pts: full ? 30 : 6
  }];
  if (cfg.energyCommunity) build.push({ label: 'Energy community adder', pts: add });
  if (cfg.domesticContent) build.push({ label: 'Domestic content adder', pts: add });
  var li = Number(cfg.lowIncome) || 0, liApplied = 0;
  if (li > 0 && solar && !(kwAc != null && kwAc >= 5000)) {
    build.push({ label: 'Low-income bonus', pts: li });
    liApplied = li;
  }
  var built = sumPts(build), rate = built, statutory = true;
  if (cfg.ratePctOverride != null && isFiniteNum(Number(cfg.ratePctOverride))) {
    rate = Number(cfg.ratePctOverride);
    statutory = Math.abs(rate - built) < 1e-9;
    if (!statutory) build = [{ label: 'Entered rate (not a statutory combination)', pts: rate }];
  }
  var boc = ctx.bocMonth || '', pis = ctx.pisMonth || '', cliff = false, factor = 1;
  if (solar && boc && pis && boc > SOLAR_BOC_CUTOFF && pis > SOLAR_PIS_DEADLINE) {
    cliff = true;
    if (rate) build.push({ label: 'In service after 2027, construction after July 4, 2026: no credit', pts: -rate });
    rate = 0;
  }
  if (!solar && boc) {
    factor = storagePhaseDown(Number(boc.slice(0, 4)));
    if (factor < 1 && rate) {
      build.push({ label: 'Phase-down (construction begins ' + boc.slice(0, 4) + ': ' + factor * 100 + '%)',
                   pts: rate * factor - rate });
      rate = rate * factor;
    }
  }
  return { ratePct: rate, build: build, statutory: statutory, builtPct: built,
           cliff: cliff, phaseDown: factor, lowIncomeApplied: liApplied };
}

function sumPts(build) {
  var s = 0, i;
  for (i = 0; i < build.length; i++) s += build[i].pts;
  return s;
}

/* ---------------------------------------------------------------------- *
 *  Inputs: defaults, reading, validation
 * ---------------------------------------------------------------------- */

var ASSETS = ['solar', 'storage', 'blended', 'ev', 'roof', 'controller', 'interconnection', 'other'];
var BESS_MODES = ['bundled', 'shared-savings', 'fixed', 'host-owned'];

/* What a capex line is assumed to be when it does not say (tax research
   §8): solar, storage and their integral parts are energy property on
   SAM's split; a campus-level controller, EV chargers (§30C ended June 30,
   2026), roofs (building structure) and anything else are not credit
   property. Chargers sold as a service are 5-year property (asset class
   57.0), a roof is 39-year real property, and an unexplained cost is
   not depreciated until someone says what it is. Interconnection is
   eligible only for a facility of 5 MW AC or less (see readCapex). */
var LINE_DEFAULTS = {
  solar: { itcEligible: 1, depClass: 'energy' },
  storage: { itcEligible: 1, depClass: 'energy' },
  blended: { itcEligible: 1, depClass: 'energy' },
  interconnection: { itcEligible: 1, depClass: 'energy' },
  controller: { itcEligible: 0, depClass: 'macrs5' },
  ev: { itcEligible: 0, depClass: 'macrs5' },
  roof: { itcEligible: 0, depClass: 'sl39' },
  other: { itcEligible: 0, depClass: 'none' }
};

/* null in a default means "not present" for a block and "derived at run
   time" for a value: statePct comes from project.state and the equipment
   reserve's watts from the solar DC size. Sending back 0 instead would
   switch them off, which is why they are null and not 0 here. */
var DEFAULTS = {
  years: 25,
  project: { name: '', sponsor: '', host: '', hostDescription: '', hostTaxExempt: false,
             street: '', city: '', state: '', zip: '', acres: null, utility: '',
             preparedDate: '', bocMonth: '', pisMonth: '' },
  solar: null,
  bess: null,
  ev: null,
  controller: false,
  capex: { lines: [] },
  allocation: { macrs5: 90, macrs15: 1.5, sl15: 2.5, sl20: 3, none: 3 },
  revenue: {
    ppa: null,
    bess: { mode: 'bundled', sharePct: 100, fixedPerKwMonth: 0, escalatorPct: 3 },
    dr: { perYear: 0, perKwYear: 0, escalatorPct: 0, inBase: false },
    ev: { perKwYear: 0, escalatorPct: 0 },
    other: []
  },
  opex: { lines: [] },
  reserves: { wcMonths: 3, equipment: { costPerW: 0.10, freqYears: 15, watts: null }, interestPct: 1.75 },
  bessReplacement: { mode: 'reserve' },
  tax: {
    federalPct: 21, statePct: null, stateDeductible: true,
    appetite: 'full', nolLimitPct: 80, stateNol: true,
    bonusPct: 0, stateBonusConforms: false, convention: 'half-year',
    itc: {
      solar: { pwa: true, energyCommunity: false, domesticContent: false, lowIncome: 0, ratePctOverride: null },
      storage: { pwa: true, energyCommunity: false, domesticContent: false, lowIncome: 0, ratePctOverride: null },
      stepUpPct: 0, monetization: 'direct', transferPrice: 0.90, feocAttested: false
    }
  },
  debt: null,
  discountPct: 8,
  inflationPct: 2.5
};

/* The fields a present block starts from. netDriftPct is not SAM's
   input: it is the linear decline of NET energy relative to gross that
   SAM produces when it prices net hourly energy while the deck divides by
   gross, fitted on one reference deck; it stays 0 unless a caller has
   that reason to set it. */
var BLOCKS = {
  solar: { kwDc: null, kwAc: null, kwh1: null, netKwh1: null, degradationPct: 0.5,
           availabilityLossPct: 0, netDriftPct: 0 },
  bess: { kw: null, kwh: null, usableKwh: null, durationH: null, sizing: null, dischargeKwh1: null },
  ev: { kw: null },
  ppa: { rate1: null, escalatorPct: 2.5, basis: 'gross' },
  debt: { sizing: 'min', ltcPct: 45, ratePct: 7.5, tenorYears: 15, dscrMin: 1.35, shape: 'sculpted',
          feePct: 1.5, dsraMonths: 6 }
};

/* defaults() -> the full default input object. defaults(name) -> the
   starting fields of one optional block ('solar', 'bess', 'ev', 'ppa',
   'debt'), or 'lines' for the per-asset capex line defaults, so a form
   can prefill a block without copying numbers out of this file. */
function defaults(name) {
  if (name == null) return clone(DEFAULTS);
  if (name === 'lines') return clone(LINE_DEFAULTS);
  return has(BLOCKS, name) ? clone(BLOCKS[name]) : null;
}

var NUM_RE = /^\s*[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?\s*$/;

function err(field, message) { return { field: field, message: message }; }
function has(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
function isFiniteNum(v) { return typeof v === 'number' && isFinite(v); }
function blank(v) { return v === undefined || v === null || v === ''; }
function clone(v) { return v === undefined ? v : JSON.parse(JSON.stringify(v)); }

function toNum(v) {
  if (typeof v === 'number') return isFinite(v) ? v : NaN;
  if (typeof v === 'string' && NUM_RE.test(v)) return Number(v);
  return NaN;
}

function rangeText(o) {
  if (o.gt != null && o.max != null) return 'greater than ' + o.gt + ' and at most ' + fmtNum(o.max);
  if (o.gt != null) return 'greater than ' + o.gt;
  if (o.min != null && o.max != null) return 'between ' + fmtNum(o.min) + ' and ' + fmtNum(o.max);
  if (o.min != null) return 'at least ' + fmtNum(o.min);
  return 'at most ' + fmtNum(o.max);
}

/* A number, or a numeric string from a form. Blank takes the default (an
   error when required). On a bad value the error is recorded and the
   default returned, so every problem is reported in one pass. */
function readNum(e, field, v, o) {
  var def = o.def === undefined ? null : o.def;
  if (blank(v)) {
    if (o.req) e.push(err(field, o.label + ' is required.'));
    return def;
  }
  var n = toNum(v);
  if (isNaN(n)) { e.push(err(field, o.label + ' must be a number.')); return def; }
  var bad = (o.gt != null && !(n > o.gt)) || (o.min != null && n < o.min) || (o.max != null && n > o.max);
  if (o.int && Math.floor(n) !== n) {
    e.push(err(field, o.label + ' must be a whole number ' + rangeText(o) + '.'));
    return def;
  }
  if (bad) { e.push(err(field, o.label + ' must be ' + rangeText(o) + '.')); return def; }
  return n;
}

function readBool(e, field, v, def, label) {
  if (blank(v)) return def;
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  e.push(err(field, label + ' must be true or false.'));
  return def;
}

function readEnum(e, field, v, def, list, label) {
  if (blank(v)) return def;
  if (list.indexOf(v) < 0) {
    e.push(err(field, label + ' must be one of ' + list.join(', ') + '.'));
    return def;
  }
  return v;
}

function readStr(v, max) {
  if (typeof v === 'number' && isFinite(v)) v = String(v);
  return typeof v === 'string' ? v.trim().slice(0, max) : '';
}

function readMonth(e, field, v, label) {
  if (blank(v)) return '';
  if (typeof v === 'string' && /^(19|20)\d\d-(0[1-9]|1[0-2])$/.test(v.trim())) return v.trim();
  e.push(err(field, label + ' must be a month written YYYY-MM.'));
  return '';
}

function readDate(e, field, v, label) {
  if (blank(v)) return '';
  if (typeof v === 'string' && /^(19|20)\d\d-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v.trim())) return v.trim();
  e.push(err(field, label + ' must be a date written YYYY-MM-DD.'));
  return '';
}

/* An optional object: absent is null, anything but an object is an error. */
function readObj(e, field, v, label) {
  if (blank(v)) return null;
  if (isObj(v)) return v;
  e.push(err(field, label + ' must be an object.'));
  return null;
}

function readList(e, field, v, max, label) {
  if (blank(v)) return [];
  if (!Array.isArray(v)) { e.push(err(field, label + ' must be a list.')); return []; }
  if (v.length > max) { e.push(err(field, 'Up to ' + max + ' ' + label.toLowerCase() + ' are supported.')); return []; }
  return v;
}

/* The largest AC rating on the site, for the 5 MW interconnection test.
   Solar without an AC rating is measured at DC, the larger figure, so an
   unknown inverter never makes a big array look small. */
function facilityAcKw(o) {
  var s = o.solar ? (o.solar.kwAc || o.solar.kwDc || 0) : 0, b = o.bess ? (o.bess.kw || 0) : 0;
  return Math.max(s, b);
}

function readProject(e, v) {
  var p = readObj(e, 'project', v, 'The project') || {};
  var out = {
    name: readStr(p.name, 120),
    sponsor: readStr(p.sponsor, 120),
    host: readStr(p.host, 160),
    hostDescription: readStr(p.hostDescription, 400),
    hostTaxExempt: readBool(e, 'project.hostTaxExempt', p.hostTaxExempt, false, 'The tax-exempt host flag'),
    street: readStr(p.street, 160),
    city: readStr(p.city, 80),
    state: '',
    zip: readStr(p.zip, 10),
    acres: readNum(e, 'project.acres', p.acres, { min: 0, max: 100000, label: 'The site area (acres)' }),
    utility: readStr(p.utility, 120),
    preparedDate: readDate(e, 'project.preparedDate', p.preparedDate, 'The prepared date'),
    bocMonth: readMonth(e, 'project.bocMonth', p.bocMonth, 'The beginning-of-construction month'),
    pisMonth: readMonth(e, 'project.pisMonth', p.pisMonth, 'The placed-in-service month')
  };
  if (!out.name) e.push(err('project.name', 'A project name is required.'));
  var st = readStr(p.state, 40);
  if (st && !/^[A-Za-z]{2}$/.test(st)) e.push(err('project.state', 'The state must be a two-letter code such as CA.'));
  else out.state = st.toUpperCase();
  if (out.bocMonth && out.pisMonth && out.pisMonth < out.bocMonth) {
    e.push(err('project.pisMonth', 'The placed-in-service month cannot be before construction begins.'));
  }
  return out;
}

function readSolar(e, v) {
  var s = readObj(e, 'solar', v, 'The solar system');
  if (!s) return null;
  return {
    kwDc: readNum(e, 'solar.kwDc', s.kwDc, { req: true, gt: 0, max: 1e6, label: 'The solar DC size (kW)' }),
    kwAc: readNum(e, 'solar.kwAc', s.kwAc, { gt: 0, max: 1e6, label: 'The solar AC size (kW)' }),
    kwh1: readNum(e, 'solar.kwh1', s.kwh1, { req: true, gt: 0, max: 1e10, label: 'Year-1 solar energy (kWh)' }),
    netKwh1: readNum(e, 'solar.netKwh1', s.netKwh1, { min: 0, max: 1e10, label: 'Year-1 net solar energy (kWh)' }),
    degradationPct: readNum(e, 'solar.degradationPct', s.degradationPct,
      { def: BLOCKS.solar.degradationPct, min: 0, max: 10, label: 'Solar degradation (%/yr)' }),
    availabilityLossPct: readNum(e, 'solar.availabilityLossPct', s.availabilityLossPct,
      { def: 0, min: 0, max: 50, label: 'The availability loss (%)' }),
    netDriftPct: readNum(e, 'solar.netDriftPct', s.netDriftPct,
      { def: 0, min: 0, max: 5, label: 'The net-energy drift (%/yr)' })
  };
}

/* The sizing summary is echoed as given (the report's sizing appendix
   draws from it) with the two parts this engine reads made numeric and
   checked: the year-by-year schedule and the replacements. */
function readSizing(e, v) {
  var z = readObj(e, 'bess.sizing', v, 'The sizing result');
  if (!z) return null;
  z = clone(z);
  if (!blank(z.schedule)) {
    var rows = readList(e, 'bess.sizing.schedule', z.schedule, 60, 'Schedule years');
    z.schedule = rows.map(function (r, i) {
      var f = 'bess.sizing.schedule[' + i + ']';
      if (!isObj(r)) { e.push(err(f, 'Each schedule year must be an object.')); return { year: i + 1, netSavings: 0 }; }
      if (!blank(r.year) && Number(r.year) !== i + 1) {
        e.push(err(f + '.year', 'The sizing schedule must list years 1, 2, 3 and so on, in order.'));
      }
      var out = clone(r);
      out.year = i + 1;
      out.netSavings = readNum(e, f + '.netSavings', r.netSavings,
        { req: true, min: -1e9, max: 1e9, label: 'Year ' + (i + 1) + ' net savings' });
      out.soh = readNum(e, f + '.soh', r.soh, { min: 0, max: 2, label: 'Year ' + (i + 1) + ' state of health' });
      return out;
    });
  }
  if (!blank(z.replacements)) {
    z.replacements = readList(e, 'bess.sizing.replacements', z.replacements, 20, 'Replacements').map(function (r, i) {
      var f = 'bess.sizing.replacements[' + i + ']';
      if (!isObj(r)) { e.push(err(f, 'Each replacement must be an object.')); return { year: 1, cost: 0 }; }
      return {
        year: readNum(e, f + '.year', r.year, { req: true, int: true, min: 1, max: 60, label: 'The replacement year' }),
        cost: readNum(e, f + '.cost', r.cost, { req: true, min: 0, max: 1e10, label: 'The replacement cost' })
      };
    });
  }
  if (!blank(z.throughputKwhYr)) {
    z.throughputKwhYr = readNum(e, 'bess.sizing.throughputKwhYr', z.throughputKwhYr,
      { min: 0, max: 1e10, label: 'The sized annual discharge (kWh)' });
  }
  return z;
}

function readBess(e, v) {
  var b = readObj(e, 'bess', v, 'The battery');
  if (!b) return null;
  return {
    kw: readNum(e, 'bess.kw', b.kw, { req: true, gt: 0, max: 1e6, label: 'The battery power (kW)' }),
    kwh: readNum(e, 'bess.kwh', b.kwh, { req: true, gt: 0, max: 1e7, label: 'The battery nameplate energy (kWh)' }),
    usableKwh: readNum(e, 'bess.usableKwh', b.usableKwh, { gt: 0, max: 1e7, label: 'The usable energy (kWh)' }),
    durationH: readNum(e, 'bess.durationH', b.durationH, { gt: 0, max: 100, label: 'The duration (hours)' }),
    sizing: readSizing(e, b.sizing),
    dischargeKwh1: readNum(e, 'bess.dischargeKwh1', b.dischargeKwh1,
      { min: 0, max: 1e10, label: 'Year-1 battery discharge (kWh)' })
  };
}

function readCapex(e, v, o) {
  var c = readObj(e, 'capex', v, 'The capital cost') || {};
  var list = readList(e, 'capex.lines', c.lines, 100, 'Capex lines');
  var seen = Object.create(null), out = [];
  list.forEach(function (l, i) {
    var f = 'capex.lines[' + i + ']';
    if (!isObj(l)) { e.push(err(f, 'Each capex line must be an object.')); return; }
    var id = readStr(l.id, 64), label = readStr(l.label, 160), name = label || id || ('line ' + (i + 1));
    if (!id) e.push(err(f + '.id', 'Capex line ' + (i + 1) + ' needs an id.'));
    else if (seen[id]) e.push(err(f + '.id', 'The capex line id "' + id + '" is used twice.'));
    seen[id] = true;
    if (!label) e.push(err(f + '.label', 'Capex line ' + (i + 1) + ' needs a label.'));
    var asset = readEnum(e, f + '.asset', l.asset, 'other', ASSETS, 'The asset of "' + name + '"');
    var d = LINE_DEFAULTS[asset];
    var elig = asset === 'interconnection' && facilityAcKw(o) > 5000 ? 0 : d.itcEligible;
    var line = {
      id: id,
      label: label,
      amount: readNum(e, f + '.amount', l.amount, { req: true, min: 0, max: 1e10, label: 'The amount of "' + name + '"' }),
      asset: asset,
      itcEligible: readNum(e, f + '.itcEligible', l.itcEligible,
        { def: elig, min: 0, max: 1, label: 'The ITC-eligible share of "' + name + '"' }),
      depClass: readEnum(e, f + '.depClass', l.depClass, d.depClass, LINE_CLASSES, 'The depreciation class of "' + name + '"')
    };
    /* Only a blended line has two rates to divide between; on any other
       line a solar share could only restate the asset, so it is not read. */
    if (asset === 'blended') {
      line.solarSharePct = readNum(e, f + '.solarSharePct', l.solarSharePct,
        { min: 0, max: 100, label: 'The solar share of "' + name + '" (%)' });
    }
    out.push(line);
  });
  return out;
}

/* The allocation is taken whole when given: merging it key by key over
   SAM's split would add a caller's {macrs5: 100} to the 10% SAM spreads
   elsewhere and fail the sum for a reason nobody could see. */
function readAllocation(e, v) {
  var src = (blank(v) ? null : readObj(e, 'allocation', v, 'The depreciation allocation')) || DEFAULTS.allocation;
  var out = {}, total = 0;
  ALLOC_CLASSES.forEach(function (c) { out[c] = 0; });
  Object.keys(src).forEach(function (k) {
    if (ALLOC_CLASSES.indexOf(k) < 0) {
      e.push(err('allocation.' + k, '"' + k + '" is not a depreciation class; use ' + ALLOC_CLASSES.join(', ') + '.'));
      return;
    }
    out[k] = readNum(e, 'allocation.' + k, src[k], { def: 0, min: 0, max: 100, label: 'The ' + k + ' allocation (%)' });
    total += out[k];
  });
  if (Math.abs(total - 100) > 0.01) {
    e.push(err('allocation', 'The depreciation allocation must add up to 100% (it adds up to ' + fmtNum(total) + '%).'));
  }
  return out;
}

function readRevenue(e, v) {
  var r = readObj(e, 'revenue', v, 'The revenue') || {};
  var ppa = readObj(e, 'revenue.ppa', r.ppa, 'The PPA');
  var bs = readObj(e, 'revenue.bess', r.bess, 'The battery revenue') || {};
  var dr = readObj(e, 'revenue.dr', r.dr, 'The demand-response revenue') || {};
  var ev = readObj(e, 'revenue.ev', r.ev, 'The EV charging revenue') || {};
  var D = DEFAULTS.revenue;
  return {
    ppa: ppa ? {
      rate1: readNum(e, 'revenue.ppa.rate1', ppa.rate1, { req: true, gt: 0, max: 10, label: 'The year-1 PPA rate ($/kWh)' }),
      escalatorPct: readNum(e, 'revenue.ppa.escalatorPct', ppa.escalatorPct,
        { def: BLOCKS.ppa.escalatorPct, min: -10, max: 20, label: 'The PPA escalator (%/yr)' }),
      basis: readEnum(e, 'revenue.ppa.basis', ppa.basis, BLOCKS.ppa.basis, ['gross', 'net'], 'The PPA energy basis')
    } : null,
    bess: {
      mode: readEnum(e, 'revenue.bess.mode', bs.mode, D.bess.mode, BESS_MODES, 'The battery revenue model'),
      sharePct: readNum(e, 'revenue.bess.sharePct', bs.sharePct,
        { def: D.bess.sharePct, min: 0, max: 100, label: 'The owner\'s share of savings (%)' }),
      fixedPerKwMonth: readNum(e, 'revenue.bess.fixedPerKwMonth', bs.fixedPerKwMonth,
        { def: 0, min: 0, max: 1000, label: 'The battery fee ($/kW-month)' }),
      escalatorPct: readNum(e, 'revenue.bess.escalatorPct', bs.escalatorPct,
        { def: D.bess.escalatorPct, min: -10, max: 20, label: 'The battery fee escalator (%/yr)' })
    },
    dr: {
      perYear: readNum(e, 'revenue.dr.perYear', dr.perYear, { def: 0, min: 0, max: 1e9, label: 'Demand-response revenue ($/yr)' }),
      perKwYear: readNum(e, 'revenue.dr.perKwYear', dr.perKwYear, { def: 0, min: 0, max: 10000, label: 'Demand-response revenue ($/kW-yr)' }),
      escalatorPct: readNum(e, 'revenue.dr.escalatorPct', dr.escalatorPct,
        { def: 0, min: -10, max: 20, label: 'The demand-response escalator (%/yr)' }),
      inBase: readBool(e, 'revenue.dr.inBase', dr.inBase, false, 'The demand-response base-case flag')
    },
    ev: {
      perKwYear: readNum(e, 'revenue.ev.perKwYear', ev.perKwYear, { def: 0, min: 0, max: 100000, label: 'EV charging revenue ($/kW-yr)' }),
      escalatorPct: readNum(e, 'revenue.ev.escalatorPct', ev.escalatorPct,
        { def: 0, min: -10, max: 20, label: 'The EV revenue escalator (%/yr)' })
    },
    other: readList(e, 'revenue.other', r.other, 20, 'Other revenue lines').map(function (x, i) {
      var f = 'revenue.other[' + i + ']';
      if (!isObj(x)) { e.push(err(f, 'Each other-revenue line must be an object.')); x = {}; }
      return {
        label: readStr(x.label, 160) || 'Other revenue',
        perYear: readNum(e, f + '.perYear', x.perYear, { req: true, min: 0, max: 1e9, label: 'Other revenue ($/yr)' }),
        escalatorPct: readNum(e, f + '.escalatorPct', x.escalatorPct, { def: 0, min: -10, max: 20, label: 'Its escalator (%/yr)' })
      };
    })
  };
}

function readOpex(e, v) {
  var o = readObj(e, 'opex', v, 'The operating costs') || {};
  return readList(e, 'opex.lines', o.lines, 50, 'Opex lines').map(function (x, i) {
    var f = 'opex.lines[' + i + ']';
    if (!isObj(x)) { e.push(err(f, 'Each opex line must be an object.')); x = {}; }
    return {
      id: readStr(x.id, 64),
      label: readStr(x.label, 160) || 'Operating cost',
      perYear: readNum(e, f + '.perYear', x.perYear, { req: true, min: 0, max: 1e9, label: 'Year-1 operating cost ($)' }),
      escalatorPct: readNum(e, f + '.escalatorPct', x.escalatorPct, { def: 2.5, min: -10, max: 20, label: 'The opex escalator (%/yr)' })
    };
  });
}

function readTaxAsset(e, field, v, label) {
  var a = readObj(e, field, v, label) || {};
  var D = DEFAULTS.tax.itc.solar;
  var li = readNum(e, field + '.lowIncome', a.lowIncome, { def: 0, min: 0, max: 20, label: 'The low-income bonus' });
  if (li !== 0 && li !== 10 && li !== 20) {
    e.push(err(field + '.lowIncome', 'The low-income bonus must be 0, 10 or 20 points.'));
    li = 0;
  }
  return {
    pwa: readBool(e, field + '.pwa', a.pwa, D.pwa, 'The prevailing wage & apprenticeship flag'),
    energyCommunity: readBool(e, field + '.energyCommunity', a.energyCommunity, false, 'The energy community flag'),
    domesticContent: readBool(e, field + '.domesticContent', a.domesticContent, false, 'The domestic content flag'),
    lowIncome: li,
    ratePctOverride: readNum(e, field + '.ratePctOverride', a.ratePctOverride, { min: 0, max: 70, label: 'The entered ITC rate (%)' })
  };
}

function readTax(e, v, project, meta) {
  var t = readObj(e, 'tax', v, 'The tax settings') || {};
  var itc = readObj(e, 'tax.itc', t.itc, 'The ITC settings') || {};
  var D = DEFAULTS.tax;
  var statePct = readNum(e, 'tax.statePct', t.statePct, { min: 0, max: 20, label: 'The state tax rate (%)' });
  if (statePct == null) {
    meta.stateDefaulted = true;
    statePct = has(STATE_TAX, project.state) ? STATE_TAX[project.state] : 0;
  }
  return {
    federalPct: readNum(e, 'tax.federalPct', t.federalPct, { def: D.federalPct, min: 0, max: 50, label: 'The federal tax rate (%)' }),
    statePct: statePct,
    stateDeductible: readBool(e, 'tax.stateDeductible', t.stateDeductible, D.stateDeductible, 'The state-deductible flag'),
    appetite: readEnum(e, 'tax.appetite', t.appetite, D.appetite, ['full', 'nol'], 'The tax appetite'),
    nolLimitPct: readNum(e, 'tax.nolLimitPct', t.nolLimitPct, { def: D.nolLimitPct, min: 0, max: 100, label: 'The NOL limit (%)' }),
    stateNol: readBool(e, 'tax.stateNol', t.stateNol, D.stateNol, 'The state NOL flag'),
    bonusPct: readNum(e, 'tax.bonusPct', t.bonusPct, { def: D.bonusPct, min: 0, max: 100, label: 'Bonus depreciation (%)' }),
    stateBonusConforms: readBool(e, 'tax.stateBonusConforms', t.stateBonusConforms, D.stateBonusConforms,
      'The state bonus conformity flag'),
    convention: readEnum(e, 'tax.convention', t.convention, D.convention, ['half-year', 'mid-quarter'], 'The convention'),
    itc: {
      solar: readTaxAsset(e, 'tax.itc.solar', itc.solar, 'The solar ITC settings'),
      storage: readTaxAsset(e, 'tax.itc.storage', itc.storage, 'The storage ITC settings'),
      stepUpPct: readNum(e, 'tax.itc.stepUpPct', itc.stepUpPct, { def: 0, min: 0, max: 100, label: 'The basis step-up (%)' }),
      monetization: readEnum(e, 'tax.itc.monetization', itc.monetization, D.itc.monetization,
        ['direct', 'transfer'], 'The ITC monetization'),
      transferPrice: readNum(e, 'tax.itc.transferPrice', itc.transferPrice,
        { def: D.itc.transferPrice, min: 0.5, max: 1, label: 'The transfer price ($ per $1 of credit)' }),
      feocAttested: readBool(e, 'tax.itc.feocAttested', itc.feocAttested, false, 'The FEOC attestation')
    }
  };
}

function readDebt(e, v) {
  var d = readObj(e, 'debt', v, 'The debt');
  if (!d) return null;
  var B = BLOCKS.debt;
  var out = {
    sizing: readEnum(e, 'debt.sizing', d.sizing, B.sizing, ['min', 'ltc', 'dscr'], 'The debt sizing'),
    ltcPct: readNum(e, 'debt.ltcPct', d.ltcPct, { def: B.ltcPct, min: 0, max: 100, label: 'The loan-to-cost (%)' }),
    ratePct: readNum(e, 'debt.ratePct', d.ratePct, { def: B.ratePct, min: 0, max: 30, label: 'The interest rate (%)' }),
    tenorYears: readNum(e, 'debt.tenorYears', d.tenorYears, { def: B.tenorYears, int: true, min: 1, max: 40, label: 'The tenor (years)' }),
    dscrMin: readNum(e, 'debt.dscrMin', d.dscrMin, { def: B.dscrMin, min: 1, max: 5, label: 'The minimum DSCR' }),
    shape: readEnum(e, 'debt.shape', d.shape, B.shape, ['sculpted', 'level'], 'The repayment shape'),
    feePct: readNum(e, 'debt.feePct', d.feePct, { def: B.feePct, min: 0, max: 10, label: 'The financing fee (%)' }),
    dsraMonths: readNum(e, 'debt.dsraMonths', d.dsraMonths, { def: B.dsraMonths, min: 0, max: 24, label: 'The DSRA (months)' })
  };
  if (out.sizing !== 'dscr' && !(out.ltcPct > 0)) {
    e.push(err('debt.ltcPct', 'A loan-to-cost of 0% sizes no debt; remove the debt instead.'));
  }
  return out;
}

/* Rules that span blocks, checked once every block has been read. */
function crossCheck(e, o) {
  var total = 0;
  o.capex.lines.forEach(function (l, i) {
    total += l.amount || 0;
    if (l.asset === 'solar' && !o.solar) {
      e.push(err('capex.lines[' + i + '].asset', 'A solar cost line needs the solar system described (solar.kwDc and solar.kwh1).'));
    }
    if (l.asset === 'storage' && !o.bess) {
      e.push(err('capex.lines[' + i + '].asset', 'A storage cost line needs the battery described (bess.kw and bess.kwh).'));
    }
  });
  if (!(total > 0)) e.push(err('capex.lines', 'The installed cost must be greater than zero: add at least one capex line.'));
  if (o.revenue.ppa && !o.solar) e.push(err('revenue.ppa', 'A PPA sells solar energy, so it needs a solar system.'));
  var mode = o.revenue.bess.mode, b = o.bess;
  if (mode !== 'bundled' && !b) e.push(err('revenue.bess.mode', 'Battery revenue needs a battery.'));
  if (b && (mode === 'shared-savings' || mode === 'host-owned')) {
    var sched = b.sizing && Array.isArray(b.sizing.schedule) ? b.sizing.schedule : null;
    if (!sched || !sched.length) {
      e.push(err('bess.sizing', 'Savings-based battery revenue comes from the sizing engine\'s savings schedule: ' +
        'size the battery first, or charge a fixed fee.'));
    } else if (sched.length < o.years) {
      e.push(err('bess.sizing.schedule', 'The sizing schedule covers ' + sched.length + ' years but the analysis runs ' +
        o.years + '; size the battery over at least ' + o.years + ' years.'));
    }
  }
  if (o.tax.convention === 'mid-quarter' && !o.project.pisMonth) {
    e.push(err('project.pisMonth', 'The mid-quarter convention needs the placed-in-service month.'));
  }
  if (o.debt && o.debt.tenorYears > o.years) {
    e.push(err('debt.tenorYears', 'The loan tenor cannot run past the ' + o.years + '-year analysis term.'));
  }
}

/* raw inputs -> {inputs (merged over the defaults), errors, meta}. */
function normalize(raw) {
  var e = [], meta = {};
  if (!isObj(raw)) return { inputs: null, errors: [err('', 'The inputs must be an object.')], meta: meta };
  var o = {};
  o.years = readNum(e, 'years', raw.years, { def: DEFAULTS.years, int: true, min: 1, max: 40, label: 'The analysis term (years)' });
  o.project = readProject(e, raw.project);
  o.solar = readSolar(e, raw.solar);
  o.bess = readBess(e, raw.bess);
  var ev = readObj(e, 'ev', raw.ev, 'The EV charging');
  o.ev = ev ? { kw: readNum(e, 'ev.kw', ev.kw, { req: true, gt: 0, max: 1e6, label: 'The EV charging power (kW)' }) } : null;
  o.controller = readBool(e, 'controller', raw.controller, false, 'The controller flag');
  o.capex = { lines: readCapex(e, raw.capex, o) };
  o.allocation = readAllocation(e, raw.allocation);
  o.revenue = readRevenue(e, raw.revenue);
  o.opex = { lines: readOpex(e, raw.opex) };
  var rs = readObj(e, 'reserves', raw.reserves, 'The reserves') || {};
  var eq = readObj(e, 'reserves.equipment', rs.equipment, 'The equipment reserve') || {};
  var DR = DEFAULTS.reserves;
  o.reserves = {
    wcMonths: readNum(e, 'reserves.wcMonths', rs.wcMonths, { def: DR.wcMonths, min: 0, max: 24, label: 'The working-capital reserve (months)' }),
    equipment: {
      costPerW: readNum(e, 'reserves.equipment.costPerW', eq.costPerW,
        { def: DR.equipment.costPerW, min: 0, max: 5, label: 'The equipment reserve ($/W)' }),
      freqYears: readNum(e, 'reserves.equipment.freqYears', eq.freqYears,
        { def: DR.equipment.freqYears, int: true, min: 0, max: 40, label: 'The equipment replacement cycle (years)' }),
      watts: readNum(e, 'reserves.equipment.watts', eq.watts, { min: 0, max: 1e10, label: 'The equipment reserve watts' })
    },
    interestPct: readNum(e, 'reserves.interestPct', rs.interestPct, { def: DR.interestPct, min: 0, max: 20, label: 'Reserve interest (%)' })
  };
  if (o.reserves.equipment.watts == null) o.reserves.equipment.watts = o.solar && o.solar.kwDc ? o.solar.kwDc * 1000 : 0;
  var br = readObj(e, 'bessReplacement', raw.bessReplacement, 'The battery replacement settings') || {};
  o.bessReplacement = { mode: readEnum(e, 'bessReplacement.mode', br.mode, 'reserve', ['reserve', 'expense', 'none'], 'The replacement funding') };
  o.tax = readTax(e, raw.tax, o.project, meta);
  o.debt = readDebt(e, raw.debt);
  o.discountPct = readNum(e, 'discountPct', raw.discountPct, { def: DEFAULTS.discountPct, min: 0, max: 50, label: 'The discount rate (%)' });
  o.inflationPct = readNum(e, 'inflationPct', raw.inflationPct, { def: DEFAULTS.inflationPct, min: -5, max: 20, label: 'Inflation (%)' });
  crossCheck(e, o);
  return { inputs: o, errors: e, meta: meta };
}

/* validate(inputs) -> [{field, message}], empty when run() would model.
   Every refusal is made while reading the inputs: once they read, the
   model runs (a blended line with nothing to weigh it by is split by the
   system, not refused), so validate() and run() cannot disagree. */
function validate(raw) {
  return normalize(raw).errors;
}

/* ---------------------------------------------------------------------- *
 *  Returns arithmetic
 * ---------------------------------------------------------------------- */

/* NPV at rate r of flows [cf0, cf1, ...], by Horner's rule in 1/(1+r). */
function npvAt(cf, r) {
  var v = 1 / (1 + r), acc = 0, t;
  for (t = cf.length - 1; t >= 0; t--) acc = acc * v + cf[t];
  return acc;
}

/* Rates the NPV is sampled at before bisecting: dense where project
   returns live, sparse out to 1,000%. */
var IRR_GRID = (function () {
  var g = [-0.9999, -0.999, -0.99, -0.98, -0.95, -0.9, -0.85, -0.8, -0.7, -0.6, -0.5, -0.4, -0.3,
           -0.25, -0.2, -0.15, -0.1, -0.075, -0.05, -0.025], k;
  for (k = 0; k < 100; k++) g.push(k / 100);
  return g.concat([1, 1.25, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 10]);
})();

/* irr(flows, out?) -> fraction, or null when the NPV never changes sign
   on (-99.99%, 1,000%].

   Bisection inside every bracket the grid finds, so a flow with more
   than one IRR is DETECTED rather than one root being returned as if it
   were the answer. Levered flows with a late DSRA release or an expensed
   pack replacement can do that. With several roots it returns the one
   nearest 10% (the rate SAM and a spreadsheet's IRR start from) and
   out, when passed, gets {signChanges, roots, multiple} for the warning. */
function irr(cf, out) {
  var roots = [], i, changes = 0, last = 0;
  if (Array.isArray(cf)) {
    for (i = 0; i < cf.length; i++) {
      if (!isFiniteNum(cf[i])) { cf = null; break; }
      if (cf[i] !== 0) {
        if (last && (cf[i] > 0) !== (last > 0)) changes++;
        last = cf[i];
      }
    }
  } else cf = null;
  if (cf && cf.length >= 2 && changes > 0) {
    var a = IRR_GRID[0], fa = npvAt(cf, a);
    for (i = 1; i < IRR_GRID.length; i++) {
      var b = IRR_GRID[i], fb = npvAt(cf, b);
      if (fa === 0) roots.push(a);
      else if (fa * fb < 0) roots.push(bisect(cf, a, b, fa));
      a = b; fa = fb;
    }
    if (fa === 0) roots.push(a);
  }
  var best = null;
  roots.forEach(function (r) { if (best === null || Math.abs(r - 0.1) < Math.abs(best - 0.1)) best = r; });
  if (out) { out.signChanges = changes; out.roots = roots; out.multiple = roots.length > 1; }
  return best;
}

function bisect(cf, lo, hi, flo) {
  var k, mid, fm;
  for (k = 0; k < 200 && hi - lo > 1e-13; k++) {
    mid = (lo + hi) / 2;
    fm = npvAt(cf, mid);
    if (fm === 0) return mid;
    if ((fm > 0) === (flo > 0)) { lo = mid; flo = fm; } else hi = mid;
  }
  return (lo + hi) / 2;
}

/* payback(flows) -> years, or null if the investor is never paid back.
   The crossing year is interpolated linearly, as the decks print it:
   (t - 1) + (-cumulative at t-1) / flow in t. It is the LAST crossing:
   a cumulative that goes positive on a year-1 credit sale and then sinks
   back for good has not paid back, and for an ordinary flow, which
   crosses once, the first crossing and the last are the same year. */
function payback(cf) {
  if (!Array.isArray(cf) || !cf.length) return null;
  var cum = 0, lastNeg = -1, prev = [], t;
  for (t = 0; t < cf.length; t++) {
    if (!isFiniteNum(cf[t])) return null;
    cum += cf[t];
    prev.push(cum);
    if (cum < 0) lastNeg = t;
  }
  if (lastNeg < 0) return 0;
  if (lastNeg === cf.length - 1) return null;
  return lastNeg + (-prev[lastNeg]) / cf[lastNeg + 1];
}

/* The deck's IRR build: each step is the DIFFERENCE of IRRs rounded to a
   tenth of a point, so the printed steps add up to the printed total
   (4.8 - 0.9 + 4.2 = 8.1). Worked in integer tenths so the differences
   come out as clean decimals. */
function irrBuild(pre, exItc, at) {
  function tenths(x) { return x == null ? null : Math.round(x * 1000); }
  var a = tenths(pre), b = tenths(exItc), c = tenths(at);
  return {
    cashOnly: a == null ? null : a / 10,
    depreciation: a == null || b == null ? null : (b - a) / 10,
    itc: b == null || c == null ? null : (c - b) / 10,
    total: c == null ? null : c / 10
  };
}

/* ---------------------------------------------------------------------- *
 *  The model
 * ---------------------------------------------------------------------- */

function zeros(n) {
  var a = new Array(n + 1), i;
  for (i = 0; i <= n; i++) a[i] = 0;
  return a;
}

function monthNumber(m) {
  return typeof m === 'string' && /^\d{4}-\d{2}$/.test(m) ? Number(m.slice(5, 7)) : 0;
}

/* The §48E rate of each asset present, from its settings and the dates. */
function assetRates(inp) {
  var p = inp.project, itc = inp.tax.itc, out = { solar: null, storage: null };
  if (inp.solar) {
    var ac = inp.solar.kwAc || inp.solar.kwDc;
    out.solar = itcRate(itc.solar, { asset: 'solar', under1MWac: ac < 1000, kwAc: ac,
                                     bocMonth: p.bocMonth, pisMonth: p.pisMonth });
  }
  if (inp.bess) {
    out.storage = itcRate(itc.storage, { asset: 'storage', under1MWac: inp.bess.kw < 1000, kwAc: inp.bess.kw,
                                         bocMonth: p.bocMonth, pisMonth: p.pisMonth });
  }
  return out;
}

/* Qualifying basis, credit and depreciable basis, line by line (SAM's
   calc_basis, per line instead of per project).

   Only 5-year MACRS property qualifies: energy property is 5-year
   property (§168(e)(3)(B)(vi)), and SAM's split credits only its 5-year
   class. So a line's qualifying basis is its eligible share of the part
   that lands in 5-year MACRS, stepped up to fair market value when
   there is a step-up; the SAME step-up lifts that part's depreciable
   basis, which then loses half the credit (§50(c)(3)).

   A 'blended' line (one installed cost for solar and storage, or the
   contingency and soft costs on top of them) is part solar and part
   storage, and its rate is the two rates weighted by that split. The
   split is, in order: the solar share entered on the line; the weights of
   the site's own solar and storage lines; or, with neither, the system at
   preset costs (systemSplit). Refusing instead would lose exactly the
   deck-shaped input - one installed cost - in the case investors most
   need, a solar credit that is gone or at risk. Equal rates need no split. */
function basisOf(inp, adj, rates) {
  var alloc = inp.allocation, step = inp.tax.itc.stepUpPct / 100;
  var hasSolar = !!inp.solar, hasBess = !!inp.bess;
  var solarRate = rates.solar ? (adj.solarItcZero ? 0 : rates.solar.ratePct) : 0;
  var storageRate = rates.storage ? rates.storage.ratePct : 0;
  var lines = [], wAmt = 0, wElig = 0, wQ = 0, wRateQ = 0, wRateAmt = 0, wSolarQ = 0, wSolarAmt = 0, blended = [];

  function share5(l) { return l.depClass === 'energy' ? alloc.macrs5 / 100 : (l.depClass === 'macrs5' ? 1 : 0); }

  inp.capex.lines.forEach(function (l) {
    var amt = l.amount * adj.capex, rate = 0, elig = 0, bucket = null;
    if (l.asset === 'solar') { rate = solarRate; elig = l.itcEligible; bucket = 'solar'; }
    else if (l.asset === 'storage') { rate = storageRate; elig = l.itcEligible; bucket = 'storage'; }
    else if (l.asset === 'controller') {
      if (hasBess) { rate = storageRate; bucket = 'storage'; } else if (hasSolar) { rate = solarRate; bucket = 'solar'; }
      elig = bucket ? l.itcEligible : 0;
    } else if (l.asset === 'interconnection') {
      if (hasSolar) { rate = solarRate; bucket = 'solar'; } else if (hasBess) { rate = storageRate; bucket = 'storage'; }
      elig = bucket ? l.itcEligible : 0;
    }
    var row = { line: l, amount: amt, rate: rate, elig: elig, bucket: bucket, s5: share5(l) };
    lines.push(row);
    if (l.asset === 'blended') { blended.push(row); return; }
    if (l.asset === 'solar' || l.asset === 'storage') {
      var q = amt * elig * row.s5 * (1 + step);
      wAmt += amt; wElig += amt * elig; wQ += q; wRateQ += q * rate; wRateAmt += amt * rate;
      if (l.asset === 'solar') { wSolarQ += q; wSolarAmt += amt; }
    }
  });

  var sys = null, derived = [];
  if (blended.length) {
    var both = hasSolar && hasBess, sameRate = Math.abs(solarRate - storageRate) < 1e-12;
    var linesRate = null, linesElig = null, linesShare = null;
    if (wAmt > 0) {
      linesRate = wQ > 0 ? wRateQ / wQ : wRateAmt / wAmt;
      linesElig = wElig / wAmt;
      linesShare = wQ > 0 ? wSolarQ / wQ : wSolarAmt / wAmt;
    }
    blended.forEach(function (row) {
      var own = row.line.solarSharePct, sh;
      if (!both) {
        /* One asset on the site: the line can only be that asset, whatever
           share it carries. */
        sh = hasSolar ? 1 : (hasBess ? 0 : null);
        row.rate = linesRate != null ? linesRate : (hasSolar ? solarRate : (hasBess ? storageRate : 0));
      } else if (own != null) {
        sh = own / 100;
        row.rate = sameRate ? solarRate : sh * solarRate + (1 - sh) * storageRate;
      } else if (linesShare != null) {
        sh = linesShare;
        row.rate = linesRate;
      } else {
        sys = sys || systemSplit(inp);
        sh = sys.share;
        row.rate = sameRate ? solarRate : sh * solarRate + (1 - sh) * storageRate;
        derived.push(row.line.label || row.line.id);
      }
      row.share = sh;
      row.elig = linesElig != null ? linesElig : row.line.itcEligible;
      row.bucket = 'blended';
    });
  }

  var classes = {}, face = 0, qualifying = 0, depBefore = 0, blendSolar = 0, blendStorage = 0, blendRateQ = 0, blendRateAmt = 0;
  ALLOC_CLASSES.forEach(function (c) { classes[c] = 0; });
  var byBucket = { solar: { basis: 0, amount: 0 }, storage: { basis: 0, amount: 0 }, blended: { basis: 0, amount: 0 } };
  var out = lines.map(function (row) {
    var l = row.line, amt = row.amount, q = amt * row.elig * row.s5 * (1 + step), credit = q * row.rate / 100;
    var cls = {}, c;
    if (l.depClass === 'energy') {
      ALLOC_CLASSES.forEach(function (k) { if (alloc[k]) cls[k] = amt * alloc[k] / 100; });
    } else {
      cls[l.depClass] = amt;
    }
    if (q > 0) cls.macrs5 = (cls.macrs5 || 0) + amt * row.elig * row.s5 * step;
    for (c in cls) if (c !== 'none') depBefore += cls[c];
    if (credit > 0) cls.macrs5 -= 0.5 * credit;
    for (c in cls) classes[c] += cls[c];
    face += credit;
    qualifying += q;
    if (row.bucket) { byBucket[row.bucket].basis += q; byBucket[row.bucket].amount += credit; }
    var o = {
      id: l.id, label: l.label, amount: amt, asset: l.asset, itcEligible: row.elig, depClass: l.depClass,
      itcBasis: q, itcRatePct: row.rate, itc: credit, depBasisByClass: cls
    };
    if (row.bucket === 'blended') {
      /* Which claim the blended basis belongs to, so the deadline, FEOC
         and phase-down tests see the solar and storage in it. */
      if (row.share != null) { blendSolar += q * row.share; blendStorage += q * (1 - row.share); }
      blendRateQ += q * row.rate;
      blendRateAmt += amt * row.rate;
      o.solarSharePct = row.share == null ? null : row.share * 100;
    }
    return o;
  });
  /* One rate for the deck's blended row: the lines' own when they agree,
     else the basis-weighted average of them. */
  var blendedRate = null;
  if (blended.length) {
    blendedRate = blended[0].rate;
    if (blended.some(function (r) { return r.rate !== blended[0].rate; })) {
      var bq = byBucket.blended.basis, ba = 0;
      blended.forEach(function (r) { ba += r.amount; });
      blendedRate = bq > 0 ? blendRateQ / bq : (ba > 0 ? blendRateAmt / ba : blended[0].rate);
    }
  }
  return { lines: out, classes: classes, face: face, qualifying: qualifying, depBefore: depBefore,
           haircut: 0.5 * face, byBucket: byBucket, solarRate: solarRate, storageRate: storageRate,
           blendedRate: blendedRate, blendedSolarBasis: blendSolar, blendedStorageBasis: blendStorage,
           split: derived.length ? { lines: derived, sharePct: sys.share * 100, perWdc: sys.perWdc, perKwh: sys.perKwh,
                                     perKw: sys.perKw } : null };
}

/* What a blended line is split by when nothing on the site says: the
   system at the product's own preset costs - the page's solar $/W DC and
   the sizing engine's battery $/kWh and $/kW, or the battery costs the
   sizing run was actually made at when it carries them. It divides one
   number between two rates and nothing else, and BLENDED_SPLIT says so
   whenever it moves a figure, so it is a stand-in for the split, never a
   cost estimate. */
var SPLIT_REF = { solarPerWdc: 2.4, storagePerKwh: 400, storagePerKw: 250 };

function systemSplit(inp) {
  var s = inp.solar, b = inp.bess;
  var set = b.sizing && isObj(b.sizing.settings) ? b.sizing.settings : {};
  var perKwh = toNum(set.capexPerKwh), perKw = toNum(set.capexPerKw);
  perKwh = isFiniteNum(perKwh) && perKwh >= 0 ? perKwh : SPLIT_REF.storagePerKwh;
  perKw = isFiniteNum(perKw) && perKw >= 0 ? perKw : SPLIT_REF.storagePerKw;
  if (!(perKwh + perKw > 0)) { perKwh = SPLIT_REF.storagePerKwh; perKw = SPLIT_REF.storagePerKw; }
  var solar = s.kwDc * 1000 * SPLIT_REF.solarPerWdc, storage = b.kwh * perKwh + b.kw * perKw;
  return { share: solar / (solar + storage), perWdc: SPLIT_REF.solarPerWdc, perKwh: perKwh, perKw: perKw };
}

/* Loan size and debt service from cash available for debt service.
   The LTC candidate is a share of installed cost (the deck's "45% of
   CAPEX", not of total uses). The DSCR candidate is the most debt the
   cash covers at the minimum ratio: for a sculpted loan the present value
   of CFADS / DSCR, for a level loan the annuity that the THINNEST year
   covers. Sculpted service is CFADS / k with k set so it repays exactly.

   Whatever the rule, the loan stops at DEBT_CEILING_PCT of installed cost
   (binding 'cap'). A DSCR on strong cash can otherwise lend more than the
   project costs, which leaves the deck with negative equity, no IRR and a
   payback of zero; and total uses are installed cost plus reserves and
   the fee, so a loan held to 90% of installed cost always leaves real
   equity. The ceiling is a guard against a meaningless deck, not a view
   of what a lender would advance: DEBT_CAPPED says when it binds. */
var DEBT_CEILING_PCT = 90;

function sizeDebt(D, cfads, capex) {
  var T = D.tenorYears, r = D.ratePct / 100, pos = [0], pvPos = 0, minC = Infinity, v = 1, t;
  for (t = 1; t <= T; t++) {
    v /= 1 + r;
    pos.push(Math.max(0, cfads[t]));
    pvPos += pos[t] * v;
    if (cfads[t] < minC) minC = cfads[t];
  }
  var ann = r > 0 ? (1 - Math.pow(1 + r, -T)) / r : T;
  var ltc = D.ltcPct / 100 * capex, ceiling = DEBT_CEILING_PCT / 100 * capex;
  var dscr = D.shape === 'level' ? Math.max(0, minC) / D.dscrMin * ann : pvPos / D.dscrMin;
  var amount, binding;
  if (D.sizing === 'ltc') { amount = ltc; binding = 'ltc'; }
  else if (D.sizing === 'dscr') { amount = dscr; binding = 'dscr'; }
  else if (ltc <= dscr) { amount = ltc; binding = 'ltc'; }
  else { amount = dscr; binding = 'dscr'; }
  var requested = amount, requestedBy = binding;
  if (amount > ceiling) { amount = ceiling; binding = 'cap'; }
  var ds = zeros(cfads.length - 1), shape = D.shape;
  if (amount > 0) {
    if (shape === 'sculpted' && pvPos > 0) {
      var k = pvPos / amount;
      for (t = 1; t <= T; t++) ds[t] = pos[t] / k;
    } else {
      /* No positive cash to sculpt to: a level loan is the only shape
         that still repays, and the DSCR warning says what it costs. */
      shape = 'level';
      for (t = 1; t <= T; t++) ds[t] = amount / ann;
    }
  }
  return { amount: amount, binding: binding, ds: ds, ltcCapacity: ltc, dscrCapacity: dscr, ceiling: ceiling,
           requested: requested, requestedBy: requestedBy, shape: shape };
}

var NO_ADJ = { capex: 1, ppa: 1, production: 1, savings: 1, bessFee: 1, solarItcZero: false, transferPrice: null };

function adjust(changes) {
  var a = {}, k;
  for (k in NO_ADJ) if (has(NO_ADJ, k)) a[k] = NO_ADJ[k];
  for (k in changes) if (has(changes, k)) a[k] = changes[k];
  return a;
}

/* One full run of the cash flow. adj scales inputs for a sensitivity
   without copying them. Returns the arrays and figures assemble() and
   notes() publish; inputs that normalize() accepted always model. */
function model(inp, adj) {
  var N = inp.years, s = inp.solar, b = inp.bess, ev = inp.ev, rv = inp.revenue, tx = inp.tax, p = inp.project;
  var t, k;
  var sched = b && b.sizing && Array.isArray(b.sizing.schedule) && b.sizing.schedule.length ? b.sizing.schedule : null;
  var capexTotal = 0;
  inp.capex.lines.forEach(function (l) { capexTotal += l.amount * adj.capex; });

  /* ---- energy and revenue ---- */
  var solarKwh = zeros(N), solarNet = zeros(N), soldKwh = zeros(N), ppaRev = zeros(N);
  var bessRev = zeros(N), hostSav = zeros(N), drRev = zeros(N), evRev = zeros(N), otherRev = zeros(N);
  var revenue = zeros(N), opex = zeros(N), ebitda = zeros(N);
  var avail = s ? 1 - s.availabilityLossPct / 100 : 1;
  for (t = 1; t <= N; t++) {
    if (s) {
      /* SAM's lifetime degradation is LINEAR in year-1 output. An
         availability loss is energy never delivered, so it comes off the
         kWh sold as well as the revenue: the levelized PRICE is then
         still a price. */
      var f = Math.max(0, 1 - s.degradationPct / 100 * (t - 1));
      solarKwh[t] = s.kwh1 * adj.production * f;
      solarNet[t] = (s.netKwh1 == null ? s.kwh1 : s.netKwh1) * adj.production * f *
                    Math.max(0, 1 - s.netDriftPct / 100 * (t - 1));
      soldKwh[t] = solarKwh[t] * avail;
      if (rv.ppa) {
        ppaRev[t] = (rv.ppa.basis === 'net' ? solarNet[t] : solarKwh[t]) * avail * rv.ppa.rate1 * adj.ppa *
                    Math.pow(1 + rv.ppa.escalatorPct / 100, t - 1);
      }
    }
    /* The schedule is the host's bill savings in nominal dollars, already
       escalated and faded by the sizing engine: it is used as it stands,
       never escalated again. */
    var row = sched ? sched[t - 1] : null;
    hostSav[t] = row ? row.netSavings * adj.savings : 0;
    if (b) {
      if (rv.bess.mode === 'shared-savings') bessRev[t] = hostSav[t] * rv.bess.sharePct / 100;
      else if (rv.bess.mode === 'host-owned') bessRev[t] = hostSav[t];
      else if (rv.bess.mode === 'fixed') {
        bessRev[t] = rv.bess.fixedPerKwMonth * adj.bessFee * b.kw * 12 * Math.pow(1 + rv.bess.escalatorPct / 100, t - 1);
      }
    }
    drRev[t] = (rv.dr.perYear + rv.dr.perKwYear * (b ? b.kw : 0)) * Math.pow(1 + rv.dr.escalatorPct / 100, t - 1);
    if (ev) evRev[t] = rv.ev.perKwYear * ev.kw * Math.pow(1 + rv.ev.escalatorPct / 100, t - 1);
    for (k = 0; k < rv.other.length; k++) otherRev[t] += rv.other[k].perYear * Math.pow(1 + rv.other[k].escalatorPct / 100, t - 1);
    for (k = 0; k < inp.opex.lines.length; k++) {
      opex[t] += inp.opex.lines[k].perYear * Math.pow(1 + inp.opex.lines[k].escalatorPct / 100, t - 1);
    }
    revenue[t] = ppaRev[t] + bessRev[t] + (rv.dr.inBase ? drRev[t] : 0) + evRev[t] + otherRev[t];
    ebitda[t] = revenue[t] - opex[t];
  }

  /* ---- reserves ---- */
  /* SAM's working-capital reserve holds m months of NEXT year's opex,
     is funded at close, tops up each year and is released in year N. */
  var wc = zeros(N), wcFund = zeros(N), wcm = inp.reserves.wcMonths / 12;
  wc[0] = wcm * opex[1];
  for (t = 1; t < N; t++) wc[t] = wcm * opex[t + 1];
  for (t = 1; t <= N; t++) wcFund[t] = wc[t] - wc[t - 1];

  /* SAM's major-equipment reserve: level deposits of the cycle's
     INFLATED cost, only for cycles that end inside the term; the
     replacement is paid from the reserve, not from the year's cash. */
  var eq = inp.reserves.equipment, infl = inp.inflationPct / 100;
  var eqFund = zeros(N), eqRepl = zeros(N), eqBal = zeros(N);
  var eqOn = eq.freqYears > 0 && eq.watts > 0 && eq.costPerW > 0;
  for (t = 1; t <= N; t++) {
    if (eqOn) {
      var end = Math.ceil(t / eq.freqYears) * eq.freqYears;
      if (end <= N) eqFund[t] = eq.costPerW * eq.watts * Math.pow(1 + infl, end - 1) / eq.freqYears;
      if (t % eq.freqYears === 0) eqRepl[t] = eq.costPerW * eq.watts * Math.pow(1 + infl, t - 1);
    }
    eqBal[t] = eqBal[t - 1] + eqFund[t] - eqRepl[t];
  }

  /* The sizing engine's pack replacements, in its (today's-dollar) cost.
     'reserve' saves for each in level deposits from the one before;
     'expense' pays it out of that year's cash. Either way it is new
     5-year property with no second credit. */
  var bessFund = zeros(N), bessRepl = zeros(N), bessCash = zeros(N), bessBal = zeros(N), reps = [];
  var repMode = inp.bessReplacement.mode;
  if (b && b.sizing && Array.isArray(b.sizing.replacements)) {
    var byYear = {};
    b.sizing.replacements.forEach(function (r) {
      if (r.year >= 1 && r.year <= N && r.cost > 0) byYear[r.year] = (byYear[r.year] || 0) + r.cost;
    });
    Object.keys(byYear).map(Number).sort(function (x, y) { return x - y; })
      .forEach(function (y) { reps.push({ year: y, cost: byYear[y] }); });
  }
  if (repMode === 'reserve') {
    var prev = 0;
    reps.forEach(function (r) {
      for (t = prev + 1; t <= r.year; t++) bessFund[t] += r.cost / (r.year - prev);
      bessRepl[r.year] += r.cost;
      prev = r.year;
    });
  } else if (repMode === 'expense') {
    reps.forEach(function (r) { bessRepl[r.year] += r.cost; bessCash[r.year] += r.cost; });
  }
  for (t = 1; t <= N; t++) bessBal[t] = bessBal[t - 1] + bessFund[t] - (repMode === 'reserve' ? bessRepl[t] : 0);

  /* ---- credit and basis ---- */
  var rates = assetRates(inp);
  var B = basisOf(inp, adj, rates);

  /* ---- depreciation ---- */
  var depFed = zeros(N), depSt = zeros(N), bonus = tx.bonusPct / 100;
  ALLOC_CLASSES.forEach(function (c) {
    var basis = B.classes[c];
    if (c === 'none' || !(basis > 0)) return;
    var sch = schedule(c, tx.convention, p.pisMonth);
    var fedBonus = BONUS_CLASSES.indexOf(c) >= 0 ? basis * bonus : 0;
    var stBonus = tx.stateBonusConforms ? fedBonus : 0;
    depFed[1] += fedBonus;
    depSt[1] += stBonus;
    for (k = 0; k < sch.length && k + 1 <= N; k++) {
      depFed[k + 1] += (basis - fedBonus) * sch[k];
      depSt[k + 1] += (basis - stBonus) * sch[k];
    }
  });
  var replCapex = zeros(N), m5 = schedule('macrs5', 'half-year');
  for (t = 1; t <= N; t++) {
    replCapex[t] = eqRepl[t] + bessRepl[t];
    if (replCapex[t] > 0) {
      for (k = 0; k < m5.length && t + k <= N; k++) {
        depFed[t + k] += replCapex[t] * m5[k];
        depSt[t + k] += replCapex[t] * m5[k];
      }
    }
  }

  /* ---- debt ---- */
  /* Reserve interest is earned on LAST year's closing balances (SAM).
     The DSRA's share depends on the debt service it reserves, which
     depends on CFADS, which includes that interest: iterate to the fixed
     point, which a 1-2% reserve rate reaches in a handful of passes. */
  var ri = inp.reserves.interestPct / 100, D = inp.debt;
  var baseInt = zeros(N), resInt = zeros(N), cfads = zeros(N), dsra = zeros(N), ds = zeros(N), sized = null;
  for (t = 1; t <= N; t++) baseInt[t] = ri * (wc[t - 1] + eqBal[t - 1] + bessBal[t - 1]);
  function fillCfads() {
    for (var y = 1; y <= N; y++) {
      resInt[y] = baseInt[y] + ri * dsra[y - 1];
      cfads[y] = ebitda[y] + resInt[y] - eqFund[y] - bessFund[y] - bessCash[y];
    }
  }
  fillCfads();
  if (D) {
    var dm = D.dsraMonths / 12, iter, change;
    for (iter = 0; iter < 60; iter++) {
      sized = sizeDebt(D, cfads, capexTotal);
      change = 0;
      for (t = 1; t <= D.tenorYears; t++) {
        var nb = dm * sized.ds[t];
        change = Math.max(change, Math.abs(nb - dsra[t - 1]));
        dsra[t - 1] = nb;
      }
      fillCfads();
      if (change < 1e-9) break;
    }
    ds = sized.ds;
  }
  var amount = sized ? sized.amount : 0, T = D ? D.tenorYears : 0, rate = D ? D.ratePct / 100 : 0;
  var intr = zeros(N), prin = zeros(N), feeAm = zeros(N), dsraFund = zeros(N), dscr = [], bal = amount, dry = [];
  var fee = D ? D.feePct / 100 * amount : 0;
  for (t = 1; t <= N; t++) {
    dscr[t] = null;
    if (t <= T && amount > 0) {
      intr[t] = bal * rate;
      prin[t] = ds[t] - intr[t];
      bal -= prin[t];
      /* A loan fee is amortised over the loan for tax (§446 and the
         OID rules), not deducted at close; SAM leaves it out altogether. */
      feeAm[t] = fee / T;
      /* A loan year with no cash to service it is a covenant breach. A
         sculpted loan takes nothing that year (it sculpts to max(0, CFADS))
         and adds the interest to the balance; with no service there is no
         ratio, so it is recorded as 0x rather than left out, which would
         let the minimum skip the one year a lender tests hardest. */
      dscr[t] = ds[t] > 0 ? cfads[t] / ds[t] : 0;
      if (cfads[t] <= 0) dry.push(t);
    }
    dsraFund[t] = dsra[t] - dsra[t - 1];
  }

  /* ---- taxes, credit, cash ---- */
  var fR = tx.federalPct / 100, sR = tx.statePct / 100, nol = tx.appetite === 'nol', lim = tx.nolLimitPct / 100;
  var transfer = tx.itc.monetization === 'transfer';
  var price = adj.transferPrice != null ? adj.transferPrice : tx.itc.transferPrice;
  var face = B.face, itcCash = transfer ? face * price : face;
  var stTI = zeros(N), fedTI = zeros(N), stTax = zeros(N), fedTax = zeros(N), itcFlow = zeros(N);
  var nolFBal = zeros(N), nolSBal = zeros(N), creditBal = zeros(N);
  var nolF = 0, nolS = 0, credit = 0, creditExpired = 0, u;
  for (t = 1; t <= N; t++) {
    var base = ebitda[t] + resInt[t] - intr[t] - feeAm[t];
    stTI[t] = base - depSt[t];
    if (!nol) stTax[t] = sR * stTI[t];
    else if (tx.stateNol) {
      if (stTI[t] < 0) { nolS -= stTI[t]; stTax[t] = 0; }
      else { u = Math.min(nolS, stTI[t]); nolS -= u; stTax[t] = sR * (stTI[t] - u); }
    } else stTax[t] = sR * Math.max(0, stTI[t]);
    fedTI[t] = base - depFed[t] - (tx.stateDeductible ? stTax[t] : 0);
    if (!nol) fedTax[t] = fR * fedTI[t];
    else if (fedTI[t] < 0) { nolF -= fedTI[t]; fedTax[t] = 0; }
    else { u = Math.min(nolF, lim * fedTI[t]); nolF -= u; fedTax[t] = fR * (fedTI[t] - u); }

    if (transfer || !nol) {
      if (t === 1) itcFlow[t] = itcCash;
    } else {
      /* §38(c): a general business credit offsets net income tax only
         down to 25% of the part above $25,000; the rest carries forward
         20 years (§39) and then lapses. */
      if (t === 1) credit = face;
      if (t === 22 && credit > 0) { creditExpired = credit; credit = 0; }
      var cap = Math.max(0, fedTax[t] - 0.25 * Math.max(0, fedTax[t] - 25000));
      itcFlow[t] = Math.min(credit, cap);
      credit -= itcFlow[t];
    }
    nolFBal[t] = nolF; nolSBal[t] = nolS; creditBal[t] = credit;
  }

  var uses = capexTotal + wc[0] + dsra[0] + fee, equity = uses - amount;
  var pre = [-equity], at = [-equity], atEx = [-equity], dist = [0];
  for (t = 1; t <= N; t++) {
    pre[t] = ebitda[t] + resInt[t] - intr[t] - prin[t] - wcFund[t] - eqFund[t] - bessFund[t] - bessCash[t] - dsraFund[t];
    atEx[t] = pre[t] - stTax[t] - fedTax[t];
    at[t] = atEx[t] + itcFlow[t];
    /* What the investor is paid. With a full tax appetite the tax effects
       land on the investor's own return, so the project pays out its
       pre-tax cash (plus credit-sale proceeds); a standalone owner pays
       its own taxes, so its distributions are the after-tax cash. */
    dist[t] = nol ? at[t] : pre[t] + (transfer ? itcFlow[t] : 0);
  }

  /* ---- metrics ---- */
  var atInfo = {}, preInfo = {}, exInfo = {};
  var I = irr(at, atInfo), I0 = irr(pre, preInfo), I1 = irr(atEx, exInfo);
  var d = inp.discountPct / 100, pvRev = 0, pvKwh = 0, pvCost = equity, pvDis = 0, disc;
  var dis1 = b ? (b.dischargeKwh1 != null ? b.dischargeKwh1 : (b.sizing && isFiniteNum(b.sizing.throughputKwhYr) ? b.sizing.throughputKwhYr : null)) : null;
  var soh1 = sched && sched[0].soh > 0 ? sched[0].soh : null;
  var totalReturns = 0, totalDist = 0, sumAt = 0;
  for (t = 0; t <= N; t++) totalReturns += at[t];
  for (t = 1; t <= N; t++) {
    disc = Math.pow(1 + d, -t);
    pvRev += ppaRev[t] * disc;
    pvKwh += soldKwh[t] * disc;
    /* SAM's LCOE numerator is the owner's annual costs (taxes net of the
       credit, opex, debt service, reserve funding net of interest), which
       is revenue less after-tax cash, with the equity at year 0. */
    pvCost += (revenue[t] - at[t]) * disc;
    if (dis1 != null) {
      var sohT = soh1 && sched[Math.min(t, sched.length) - 1].soh > 0 ? sched[Math.min(t, sched.length) - 1].soh / soh1 : 1;
      pvDis += dis1 * sohT * disc;
    }
    totalDist += dist[t];
    sumAt += at[t];
  }
  var itcInDist = transfer || nol;
  var levered = amount > 0;
  var during = null, after = null;
  if (levered) {
    during = extent(dist, itcInDist ? 2 : 1, D.dsraMonths > 0 ? T - 1 : T);
    after = extent(dist, T + 1, N);
  }
  /* A year the loan takes nothing from counts against the minimum but not
     in the average: its 0x is a breach, not a ratio to be averaged. */
  var dscrMin = null, dscrSum = 0, dscrN = 0;
  for (t = 1; t <= N; t++) {
    if (dscr[t] == null) continue;
    if (dscrMin === null || dscr[t] < dscrMin) dscrMin = dscr[t];
    if (ds[t] > 0) { dscrSum += dscr[t]; dscrN++; }
  }
  var dscrAvg = dscrN ? dscrSum / dscrN : null;

  return {
    N: N, capexTotal: capexTotal, rates: rates, basis: B,
    solarKwh: solarKwh, solarNet: solarNet, soldKwh: soldKwh, ppaRev: ppaRev, bessRev: bessRev, hostSav: hostSav,
    drRev: drRev, evRev: evRev, otherRev: otherRev, revenue: revenue, opex: opex, ebitda: ebitda,
    wc: wc, wcFund: wcFund, eqFund: eqFund, eqRepl: eqRepl, bessFund: bessFund, bessRepl: bessRepl,
    bessCash: bessCash, replCapex: replCapex, reps: reps, resInt: resInt, cfads: cfads,
    debt: D ? { amount: amount, sized: sized, fee: fee, dsra0: dsra[0], dscrMin: dscrMin, dscrAvg: dscrAvg, dry: dry } : null,
    ds: ds, intr: intr, prin: prin, feeAm: feeAm, dsraFund: dsraFund, dscr: dscr,
    depFed: depFed, depSt: depSt, stTI: stTI, fedTI: fedTI, stTax: stTax, fedTax: fedTax, itcFlow: itcFlow,
    nolFBal: nolFBal, nolSBal: nolSBal, creditBal: creditBal, creditExpired: creditExpired,
    face: face, itcCash: itcCash, price: price, transfer: transfer,
    uses: uses, equity: equity, fee: fee, pre: pre, at: at, atEx: atEx, dist: dist,
    irrInfo: { at: atInfo, pre: preInfo, exItc: exInfo },
    metrics: {
      afterTaxIrr: I, preTaxIrr: I0, afterTaxIrrExItc: I1, irrBuild: irrBuild(I0, I1, I),
      npv: npvAt(at, d), paybackYears: payback(at), totalReturns: totalReturns, totalDistributions: totalDist,
      moic: equity > 0 ? sumAt / equity : null, year1Distribution: dist[1],
      distributionsDuringDebt: during, distributionsAfterDebt: after,
      lppaCents: rv.ppa && pvKwh > 0 ? pvRev / pvKwh * 100 : null,
      lcoeCents: s && pvKwh > 0 ? pvCost / pvKwh * 100 : null,
      lcosCents: !s && b && pvDis > 0 ? pvCost / pvDis * 100 : null,
      levered: levered, dscrMin: dscrMin, dscrAvg: dscrAvg
    }
  };
}

/* {min, max} of flows[from..to], or null when the range is empty. */
function extent(a, from, to) {
  if (to < from) return null;
  var lo = Infinity, hi = -Infinity, t;
  for (t = from; t <= to; t++) { if (a[t] < lo) lo = a[t]; if (a[t] > hi) hi = a[t]; }
  return { min: lo, max: hi };
}

/* ---------------------------------------------------------------------- *
 *  Publishing: result shape, sensitivities, warnings, assumptions
 * ---------------------------------------------------------------------- */

function assemble(inp, c) {
  var N = c.N, s = inp.solar, tx = inp.tax, B = c.basis, m = c.metrics, t;
  var uses = [{ key: 'capex', label: 'Installed cost', amount: c.capexTotal }];
  if (c.fee > 0) uses.push({ key: 'fee', label: 'Financing fee', amount: c.fee });
  if (c.debt && c.debt.dsra0 > 0) uses.push({ key: 'dsra', label: 'DSRA funding, ' + fmtNum(inp.debt.dsraMonths) + ' months', amount: c.debt.dsra0 });
  if (c.wc[0] > 0) uses.push({ key: 'reserve', label: 'Initial reserve funding', amount: c.wc[0] });
  var debtAmt = c.debt ? c.debt.amount : 0;
  var sources = [];
  if (debtAmt > 0) sources.push({ key: 'debt', label: 'Debt', amount: debtAmt });
  sources.push({ key: 'equity', label: 'Equity', amount: c.equity });

  function assetOut(key, rateInfo) {
    if (!rateInfo) return null;
    var bucket = B.byBucket[key];
    return { ratePct: key === 'solar' ? B.solarRate : B.storageRate, build: rateInfo.build, statutory: rateInfo.statutory,
             basis: bucket.basis, amount: bucket.amount };
  }
  var byAsset = { solar: assetOut('solar', c.rates.solar), storage: assetOut('storage', c.rates.storage), blended: null };
  if (B.byBucket.blended.basis > 0) {
    byAsset.blended = { ratePct: B.blendedRate, basis: B.byBucket.blended.basis, amount: B.byBucket.blended.amount };
  }
  /* How much of the credit's FACE is used: a sale uses all of it (the cash
     it raises is tax.itc.cash); a direct claim uses what the tax absorbs. */
  var itcUsed = 0;
  if (c.transfer) itcUsed = c.face;
  else for (t = 1; t <= N; t++) itcUsed += c.itcFlow[t];
  var afterHaircut = B.depBefore - B.haircut;
  var combined = tx.stateDeductible ? tx.federalPct + tx.statePct * (1 - tx.federalPct / 100) : tx.federalPct + tx.statePct;

  var opexLines = inp.opex.lines, dominant = null;
  opexLines.forEach(function (l) { if (!dominant || l.perYear > dominant.perYear) dominant = l; });

  var rows = [], cum = c.at[0];
  for (t = 1; t <= N; t++) {
    cum += c.at[t];
    rows.push({
      year: t, solarKwh: c.solarKwh[t], solarNetKwh: c.solarNet[t],
      ppaRevenue: c.ppaRev[t], bessRevenue: c.bessRev[t], hostSavings: c.hostSav[t], drRevenue: c.drRev[t],
      evRevenue: c.evRev[t], otherRevenue: c.otherRev[t], revenue: c.revenue[t], opex: c.opex[t], ebitda: c.ebitda[t],
      reserveInterest: c.resInt[t], wcFunding: c.wcFund[t], equipReserve: c.eqFund[t], bessReserve: c.bessFund[t],
      replacementCapex: c.replCapex[t], replacementFromCash: c.bessCash[t], dsraFunding: c.dsraFund[t],
      cfads: c.cfads[t], interest: c.intr[t], principal: c.prin[t], debtService: c.ds[t], dscr: c.dscr[t],
      feeAmortization: c.feeAm[t], depreciationFed: c.depFed[t], depreciationState: c.depSt[t],
      stateTaxableIncome: c.stTI[t], fedTaxableIncome: c.fedTI[t], stateTax: c.stTax[t], fedTax: c.fedTax[t],
      nolFederal: c.nolFBal[t], nolState: c.nolSBal[t], itc: c.itcFlow[t], itcCarryforward: c.creditBal[t],
      preTaxCash: c.pre[t], afterTaxCash: c.at[t], distribution: c.dist[t], cumulativeAfterTax: cum
    });
  }

  var debt = null;
  if (c.debt) {
    debt = {
      amount: c.debt.amount, ratePct: inp.debt.ratePct, tenorYears: inp.debt.tenorYears, shape: c.debt.sized.shape,
      sizing: inp.debt.sizing, sizingBinding: c.debt.sized.binding,
      ltcPct: c.capexTotal > 0 ? c.debt.amount / c.capexTotal * 100 : null,
      ltcCapacity: c.debt.sized.ltcCapacity, dscrCapacity: c.debt.sized.dscrCapacity,
      ceilingCapacity: c.debt.sized.ceiling,
      fee: c.fee, dsra0: c.debt.dsra0, dsraMonths: inp.debt.dsraMonths, dscrTarget: inp.debt.dscrMin,
      dscrMin: c.debt.dscrMin, dscrAvg: c.debt.dscrAvg, annualDebtService1: c.ds[1] || 0
    };
  }

  return {
    ok: true,
    version: VERSION,
    inputs: inp,
    sourcesUses: { uses: uses, sources: sources, totalUses: c.uses, equity: c.equity, debt: debtAmt },
    capex: { total: c.capexTotal, perWdc: s ? c.capexTotal / (s.kwDc * 1000) : null, lines: B.lines },
    tax: {
      itc: {
        face: c.face, cash: c.transfer ? c.itcCash : c.face, monetization: tx.itc.monetization,
        transferPrice: c.transfer ? c.price : null, stepUpPct: tx.itc.stepUpPct, byAsset: byAsset,
        qualifyingBasis: B.qualifying, qualifyingPctOfCost: c.capexTotal > 0 ? B.qualifying / c.capexTotal * 100 : null,
        used: itcUsed, expired: c.creditExpired, carriedForward: c.creditBal[N]
      },
      depreciableBasis: B.depBefore,
      depreciablePctOfCost: c.capexTotal > 0 ? B.depBefore / c.capexTotal * 100 : null,
      depreciableAfterHaircut: afterHaircut,
      haircut: B.haircut,
      bonusPct: tx.bonusPct,
      stateBonusConforms: tx.stateBonusConforms,
      convention: tx.convention,
      classes: B.classes,
      federalPct: tx.federalPct, statePct: tx.statePct, combinedPct: combined, stateDeductible: tx.stateDeductible,
      appetite: tx.appetite,
      recaptureEnd: inp.project.pisMonth ? addMonths(inp.project.pisMonth, 60) : null,
      boc: inp.project.bocMonth || null,
      pis: inp.project.pisMonth || null
    },
    revenue: {
      year1: { ppa: c.ppaRev[1], bess: c.bessRev[1], dr: c.drRev[1], ev: c.evRev[1], other: c.otherRev[1], total: c.revenue[1] },
      ppaRate1: inp.revenue.ppa ? inp.revenue.ppa.rate1 : null,
      escalatorPct: inp.revenue.ppa ? inp.revenue.ppa.escalatorPct : (inp.bess ? inp.revenue.bess.escalatorPct : null),
      solarKwh1: s ? s.kwh1 : null,
      solarNetKwh1: s ? (s.netKwh1 == null ? s.kwh1 : s.netKwh1) : null,
      hostSavingsY1: inp.bess && inp.bess.sizing && inp.bess.sizing.schedule && inp.bess.sizing.schedule.length
        ? inp.bess.sizing.schedule[0].netSavings : null,
      bessMode: inp.bess ? inp.revenue.bess.mode : null,
      drInBase: inp.revenue.dr.inBase
    },
    opex: { year1Total: c.opex[1], escalatorPct: dominant ? dominant.escalatorPct : null },
    debt: debt,
    metrics: m,
    rows: rows,
    year0: { equity: c.equity, afterTaxCash: -c.equity }
  };
}

/* The same model re-run with one input moved. Every scenario that applies
   is run; none is dropped. The one that used to be - the solar slip on a
   single blended cost line, which had nothing to weigh the two rates by -
   now splits that line by the system, and BLENDED_SPLIT says so. */
function sensitivity(inp, base) {
  var out = [], baseIrr = base.metrics.afterTaxIrr, p = inp.project, rv = inp.revenue;
  function add(key, label, changes) {
    var r = model(inp, adjust(changes));
    var v = r.metrics.afterTaxIrr;
    out.push({ key: key, label: label, afterTaxIrr: v, delta: v == null || baseIrr == null ? null : v - baseIrr });
  }
  add('capex-10', 'Installed cost −10%', { capex: 0.9 });
  add('capex+10', 'Installed cost +10%', { capex: 1.1 });
  var savingsMode = inp.bess && (rv.bess.mode === 'shared-savings' || rv.bess.mode === 'host-owned');
  if (rv.ppa) {
    add('ppa-10', 'PPA rate −10%', { ppa: 0.9 });
    add('ppa+10', 'PPA rate +10%', { ppa: 1.1 });
  } else if (inp.bess && rv.bess.mode === 'fixed') {
    add('bessRevenue-10', 'Battery fee −10%', { bessFee: 0.9 });
    add('bessRevenue+10', 'Battery fee +10%', { bessFee: 1.1 });
  }
  if (inp.solar) {
    add('production-5', 'Solar production −5%', { production: 0.95 });
    add('production+5', 'Solar production +5%', { production: 1.05 });
  }
  if (savingsMode) {
    add('savings-10', 'Battery savings −10%', { savings: 0.9 });
    add('savings+10', 'Battery savings +10%', { savings: 1.1 });
  }
  /* The slip case the research asks for: solar whose credit rides on
     the December 31, 2027 deadline or on the July 2026 grandfather, or
     whose dates are not known yet. */
  var solarBasis = base.basis.byBucket.solar.basis + (inp.solar ? base.basis.blendedSolarBasis : 0);
  var datesSafe = p.bocMonth && p.pisMonth && p.bocMonth <= SOLAR_BOC_CUTOFF && p.pisMonth <= SOLAR_PIS_DEADLINE;
  if (inp.solar && base.basis.solarRate > 0 && solarBasis > 0 && !datesSafe) {
    add('itcSlip', 'Solar misses the 2027 in-service deadline (no solar ITC)', { solarItcZero: true });
  }
  if (inp.tax.itc.monetization === 'transfer') {
    add('transfer88', 'ITC sold at $0.88', { transferPrice: 0.88 });
    add('transfer93', 'ITC sold at $0.93', { transferPrice: 0.93 });
  }
  return out;
}

var LEVEL_ORDER = { critical: 0, warn: 1, info: 2 };

function notes(inp, c, meta, sens) {
  var w = [], a = [], p = inp.project, s = inp.solar, b = inp.bess, tx = inp.tax, itc = tx.itc, B = c.basis;
  var N = c.N, rv = inp.revenue, D = inp.debt;
  function warn(level, code, text) { w.push({ level: level, code: code, text: text }); }
  var boc = p.bocMonth, pis = p.pisMonth, bocY = boc ? Number(boc.slice(0, 4)) : null;
  var solarBasis = B.byBucket.solar.basis + (s ? B.blendedSolarBasis : 0);
  var storageBasis = B.byBucket.storage.basis + (b ? B.blendedStorageBasis : 0);
  var solarClaim = !!(s && solarBasis > 0), storageClaim = !!(b && storageBasis > 0);
  var solarAc = s ? (s.kwAc || s.kwDc) : 0;

  /* -- timing: the solar deadline, FEOC and the storage phase-down -- */
  /* Named only for the credits this project claims, each with the dates it
     needs: the solar deadline both months, FEOC and the phase-down only
     the construction start. A battery is never told about a solar
     deadline, on screen or in the deck's disclosures. */
  var untested = [], needBoc = false, needPis = false;
  if (solarClaim && (!boc || !pis)) { untested.push('the solar in-service deadline'); needBoc = !boc; needPis = !pis; }
  if ((solarClaim || storageClaim) && !boc) { untested.push('the FEOC threshold year'); needBoc = true; }
  if (storageClaim && !boc) untested.push('the storage phase-down');
  if (untested.length) {
    warn('warn', 'TIMING_MISSING', 'Without ' + (needBoc && needPis ? 'beginning-of-construction and placed-in-service months'
      : needBoc ? 'a beginning-of-construction month' : 'a placed-in-service month') + ' the model cannot test ' +
      listText(untested, 'or') + ', so the credits shown assume ' +
      (untested.length === 1 ? 'it is' : untested.length === 2 ? 'both are' : 'all three are') + ' met.');
  }
  if (solarClaim && boc && pis) {
    if (boc > SOLAR_BOC_CUTOFF && pis > SOLAR_PIS_DEADLINE) {
      warn('critical', 'SOLAR_CLIFF', 'Solar that begins construction after July 4, 2026 earns no §48E credit unless it is placed in ' +
        'service by December 31, 2027 (§48E(e)(4)); this solar begins in ' + monthText(boc) + ' and goes into service in ' +
        monthText(pis) + ', so its ITC is zero.');
    } else if (boc > SOLAR_BOC_CUTOFF) {
      var slip = sens.filter(function (x) { return x.key === 'itcSlip'; })[0];
      warn('warn', 'SOLAR_CLIFF', 'Because the solar begins construction after July 4, 2026, its credit depends on being placed in ' +
        'service by December 31, 2027 (§48E(e)(4)); a slip past that date loses the whole solar ITC' +
        (slip && slip.afterTaxIrr != null ? ', which takes the after-tax IRR to ' + (slip.afterTaxIrr * 100).toFixed(2) + '%.' : '.'));
    } else if (pis > SOLAR_PIS_DEADLINE) {
      warn('warn', 'SOLAR_BOC_GRANDFATHER', 'Solar placed in service after 2027 keeps its credit only because construction began by ' +
        'July 4, 2026' + (boc === SOLAR_BOC_CUTOFF ? ' (a July 2026 start counts only on or before the 4th)' : '') +
        ' and only while it stays continuous, which the four-year safe harbor covers through December 31, ' + (bocY + 4) +
        '; confirm the start-of-construction evidence with tax counsel, since Notice 2025-42 was vacated on June 6, 2026.');
    }
  }
  if (c.face > 0 || solarClaim || storageClaim) {
    var feocY = bocY ? Math.min(Math.max(bocY, 2026), 2030) : null;
    if (!bocY || bocY >= 2026) {
      var parts = [];
      if (solarClaim && c.basis.solarRate > 0) parts.push((feocY ? FEOC.solar[feocY] : 40) + '% for solar');
      if (storageClaim && c.basis.storageRate > 0) parts.push((feocY ? FEOC.storage[feocY] : 55) + '% for storage');
      if (parts.length) {
        if (itc.feocAttested) {
          warn('info', 'FEOC', 'You have attested that the prohibited-foreign-entity material-assistance cost ratio for ' +
            (feocY ? bocY : '2026') + ' construction starts is met (at least ' + parts.join(' and ') + '); keep the supplier ' +
            'certifications that Notice 2026-15 accepts as support.');
        } else {
          warn('warn', 'FEOC', 'Construction beginning in ' + (feocY ? bocY : '2026 or later') + ' must meet the prohibited-foreign-entity ' +
            'material-assistance cost ratio — at least ' + parts.join(' and ') + (feocY ? '' : ' for 2026 starts, rising five points a year') +
            ' — or the whole credit is lost (§7701(a)(52)); Treasury\'s safe-harbor tables are still pending (Notice 2026-15).');
        }
      }
    }
  }
  if (storageClaim && c.rates.storage) {
    var f = c.rates.storage.phaseDown;
    if (f === 0) {
      warn('critical', 'STORAGE_PHASEDOWN', 'Storage whose construction begins in 2036 or later earns no §48E credit, so the storage ITC is zero.');
    } else if (f < 1) {
      warn('warn', 'STORAGE_PHASEDOWN', 'Storage whose construction begins in ' + bocY + ' earns ' + f * 100 + '% of its §48E rate ' +
        '(75% for 2034 starts, 50% for 2035, none from 2036), and the rate here is reduced to match.');
    } else if (c.rates.storage.ratePct > 0) {
      warn('info', 'STORAGE_PHASEDOWN', 'Storage keeps its full §48E rate when construction begins by the end of 2033; the rate falls ' +
        'to 75% for 2034 starts, 50% for 2035 and nothing from 2036.');
    }
  }

  /* -- the rate build -- */
  if (solarClaim && !itc.solar.pwa && solarAc >= 1000) {
    warn('warn', 'PWA', 'The solar is 1 MW AC or larger and prevailing wage & apprenticeship is not met, so its §48E base rate is 6%, ' +
      'not 30% (§48E(a)(2)).');
  }
  if (storageClaim && !itc.storage.pwa && b.kw >= 1000) {
    warn('warn', 'PWA', 'The storage is 1 MW or larger and prevailing wage & apprenticeship is not met, so its §48E base rate is 6%, ' +
      'not 30% (§48E(a)(2)).');
  }
  if (s && itc.solar.lowIncome > 0) {
    if (solarAc >= 5000) {
      warn('warn', 'LOW_INCOME', 'The low-income bonus applies only to facilities under 5 MW AC (§48E(h)), so it was not applied to this solar.');
    } else {
      warn('warn', 'LOW_INCOME', 'The low-income bonus (+' + itc.solar.lowIncome + ' points) requires a Treasury capacity allocation ' +
        'and a facility under 5 MW AC (§48E(h)); the 2027 allocation round opens February 1, 2027.');
    }
  }
  if (b && itc.storage.lowIncome > 0) {
    warn('warn', 'LOW_INCOME', 'Storage is not eligible for the §48E(h) low-income bonus, so the storage entry was ignored.');
  }
  [['solar', s, solarClaim], ['storage', b, storageClaim]].forEach(function (x) {
    var r = c.rates[x[0]];
    if (x[1] && x[2] && r && !r.statutory) {
      warn('warn', 'NON_STATUTORY_RATE', 'The ' + x[0] + ' ITC rate of ' + fmtNum(itc[x[0]].ratePctOverride) + '% was entered directly ' +
        'and is not a §48E combination (6, 8 or 10% without prevailing wage; 30, 40 or 50% with it' +
        (x[0] === 'solar' ? ', plus 10 or 20 points for low-income' : '') + ').');
    }
  });

  /* -- what qualifies -- */
  var evLines = inp.capex.lines.filter(function (l) { return l.asset === 'ev'; });
  if (inp.ev || evLines.length) {
    var evClaimed = evLines.some(function (l) { return l.itcEligible > 0; });
    warn(evClaimed ? 'warn' : 'info', 'EV_NO_CREDIT', 'The §30C charger credit ended for property placed in service after June 30, 2026, ' +
      'so EV charging equipment earns depreciation only' + (evClaimed ? '; the ITC-eligible share entered on the EV line was ignored.' : '.'));
  }
  inp.capex.lines.forEach(function (l) {
    if (l.asset === 'roof' && l.itcEligible > 0) {
      warn('warn', 'ROOF_INELIGIBLE', 'A roof is part of the building, not energy property, so it earns no §48E credit; the ITC-eligible ' +
        'share entered on "' + l.label + '" was ignored.');
    }
  });
  B.lines.forEach(function (l) {
    if (l.asset === 'controller' && l.itcBasis > 0) {
      warn('warn', 'CONTROLLER_INTEGRAL', 'A microgrid controller earns the credit only as an integral part of the ' +
        (b && s ? 'storage or solar' : (b ? 'storage' : 'solar')) + ' system, not as a campus-level controller; confirm the ' +
        'treatment of "' + l.label + '" with tax counsel.');
    }
    if (l.asset === 'interconnection' && l.itcBasis > 0 && facilityAcKw(inp) > 5000) {
      warn('warn', 'INTERCONNECTION_LIMIT', 'Interconnection costs earn the credit only for a facility of 5 MW AC or less, and this one ' +
        'is ' + fmtNum(facilityAcKw(inp)) + ' kW, so "' + l.label + '" should carry no eligible share.');
    }
  });
  /* A split taken from the system is a stand-in; say so wherever it moves
     a figure - the base credit when the two rates differ, or the slip case
     that zeroes the solar rate - and not when equal rates make it moot. */
  var slipRun = sens.some(function (x) { return x.key === 'itcSlip'; });
  var ratesDiffer = Math.abs(B.solarRate - B.storageRate) >= 1e-12;
  if (B.split && (ratesDiffer || slipRun)) {
    var sp = B.split, many = sp.lines.length > 1, sh = sp.sharePct / 100;
    var bits = [];
    if (sp.perKwh > 0) bits.push(fmtNum(b.kwh, 0) + ' kWh at $' + fmtNum(sp.perKwh) + '/kWh');
    if (sp.perKw > 0) bits.push(fmtNum(b.kw, 0) + ' kW at $' + fmtNum(sp.perKw) + '/kW');
    var rests = ratesDiffer ? (many ? 'their' : 'its') + ' ITC rate of ' + fmtNum(sh * B.solarRate + (1 - sh) * B.storageRate) + '%' +
      (slipRun ? ' and the solar deadline slip case both rest' : ' rests') : 'the solar deadline slip case rests';
    warn(ratesDiffer ? 'warn' : 'info', 'BLENDED_SPLIT', 'The blended cost line' + (many ? 's ' : ' ') +
      listText(sp.lines.map(function (x) { return '"' + x + '"'; }), 'and') + (many ? ' do' : ' does') +
      ' not say how much is solar, so ' + (many ? 'they are' : 'it is') + ' split by the system at preset costs, ' +
      fmtNum(sp.sharePct, 0) + '% solar and ' + fmtNum(100 - sp.sharePct, 0) + '% storage (' + fmtNum(s.kwDc) + ' kW DC at $' +
      sp.perWdc.toFixed(2) + '/W against ' + bits.join(' plus ') + '), and ' + rests + ' on that split; enter the solar share ' +
      'on the line, or split it into solar and storage lines, to use the real one.');
  }

  /* -- depreciation -- */
  var pisM = monthNumber(pis);
  if (pisM >= 10 && tx.convention === 'half-year' && B.depBefore > 0) {
    warn('warn', 'MID_QUARTER', 'Property placed in service in ' + monthText(pis) + ' can trigger the mid-quarter convention ' +
      '(§168(d)(3): more than 40% of the year\'s depreciable basis placed in service in the fourth quarter), which lowers ' +
      'first-year depreciation; this model uses the half-year convention.');
  }

  /* -- tax position -- */
  if (p.state && has(STATE_TAX, p.state) && Math.abs(tx.statePct - STATE_TAX[p.state]) > 0.25) {
    warn('warn', 'STATE_RATE_MISMATCH', 'The state income tax rate used (' + fmtNum(tx.statePct) + '%) differs from ' +
      STATE_NAMES[p.state] + '\'s 2026 corporate rate of ' + fmtNum(STATE_TAX[p.state]) + '%.');
  }
  if (meta.stateDefaulted && !has(STATE_TAX, p.state)) {
    warn('warn', 'STATE_TAX_MISSING', p.state ? 'There is no state rate on file for ' + p.state + ', so no state income tax is modelled.'
                                              : 'No state was given, so no state income tax is modelled.');
  }
  if (p.hostTaxExempt) {
    warn('warn', 'TAX_EXEMPT_HOST', 'A tax-exempt host should buy the power under a PPA or energy services agreement, not lease the ' +
      'system: property leased to a tax-exempt entity earns no credit (§50(b)(3)), and the agreement must be a service contract ' +
      'under §7701(e)(3) without the §7701(e)(4) disqualifiers.');
  }
  if (c.transfer && c.face > 0) {
    warn('info', 'TRANSFER_SFE', 'A §6418 credit transfer cannot be made to a specified foreign entity, and the buyer bears recapture ' +
      'if the property is disposed of within five years of being placed in service.');
  }
  if (tx.appetite === 'nol' && !c.transfer && c.face > 0) {
    var used = c.face - c.creditExpired - c.creditBal[N];
    if (used < c.face - 0.5) {
      warn('info', 'ITC_CARRYFORWARD', 'Held to the §38(c) limit, ' + money(used) + ' of the ' + money(c.face) + ' ITC is used within the ' +
        N + '-year term' + (c.creditExpired > 0 ? '; ' + money(c.creditExpired) + ' lapses unused after 20 years' : '') +
        (c.creditBal[N] > 0.5 ? '; ' + money(c.creditBal[N]) + ' is still carried forward at the end, and is not valued' : '') + '.');
    }
  }

  /* -- the battery -- */
  if (b && !b.sizing) {
    warn('warn', 'NO_SIZING', 'The battery size was entered by hand rather than sized by the sizing engine against the site\'s load, ' +
      'so no bill-savings schedule stands behind the storage economics.');
  }
  if (b && b.sizing && isObj(b.sizing.system)) {
    var sk = Number(b.sizing.system.kw), sn = Number(b.sizing.system.nameplateKwh);
    if ((sk > 0 && Math.abs(sk - b.kw) > 0.01 * sk) || (sn > 0 && Math.abs(sn - b.kwh) > 0.01 * sn)) {
      var sized = [sk > 0 ? fmtNum(sk) + ' kW' : '', sn > 0 ? fmtNum(sn) + ' kWh' : ''].filter(Boolean).join(' / ');
      warn('warn', 'SIZING_MISMATCH', 'The battery modelled (' + fmtNum(b.kw) + ' kW / ' + fmtNum(b.kwh) + ' kWh) is not the one the ' +
        'sizing engine sized (' + sized + '), so its savings schedule describes a different system.');
    }
  }
  var sched = b && b.sizing && Array.isArray(b.sizing.schedule) ? b.sizing.schedule : null;
  if (sched && sched.length && sched.length < N) {
    warn('info', 'SIZING_TERM_SHORT', 'The sizing schedule covers ' + sched.length + ' of the ' + N + ' years, so host savings after ' +
      'year ' + sched.length + ' are not shown.');
  }
  if (inp.bessReplacement.mode === 'none' && b && b.sizing && Array.isArray(b.sizing.replacements)) {
    var skipped = b.sizing.replacements.filter(function (r) { return r.year >= 1 && r.year <= N && r.cost > 0; });
    if (skipped.length) {
      warn('warn', 'BESS_REPLACEMENT_EXCLUDED', 'The battery replacement in year ' + skipped.map(function (r) { return r.year; }).join(' and ') +
        ' (' + money(skipped.reduce(function (x, r) { return x + r.cost; }, 0)) + ') is left out, but the savings after it assume a fresh pack.');
    }
  }
  if (c.drRev[1] > 0 && !rv.dr.inBase) {
    warn('info', 'DR_UPSIDE', 'Demand-response revenue of ' + money(c.drRev[1]) + ' in year one is shown as upside and is not counted ' +
      'in the base-case returns.');
  }

  /* -- debt and returns -- */
  if (D) {
    var sz = c.debt.sized;
    if (!(c.debt.amount > 0)) {
      warn('warn', 'DEBT_NOT_SUPPORTED', 'The cash available for debt service supports no debt at a ' + fmtNum(D.dscrMin) +
        '× DSCR, so the project is modelled without debt.');
    } else if (c.debt.dscrMin != null && c.debt.dscrMin < D.dscrMin - 1e-6) {
      warn('warn', 'DSCR_BELOW_MIN', 'The minimum DSCR is ' + c.debt.dscrMin.toFixed(2) + '×, below the ' + fmtNum(D.dscrMin) +
        '× covenant floor.');
    }
    if (c.debt.amount > 0 && sz.binding === 'cap') {
      warn('warn', 'DEBT_CAPPED', (sz.requestedBy === 'dscr'
        ? 'At a ' + fmtNum(D.dscrMin) + '× DSCR the cash available for debt service would support ' + money(sz.requested) +
          ' of debt, ' + fmtNum(sz.requested / c.capexTotal * 100, 0) + '% of installed cost'
        : 'A ' + fmtNum(D.ltcPct) + '% loan-to-cost would lend ' + money(sz.requested)) +
        '; debt is capped at ' + DEBT_CEILING_PCT + '% of installed cost, so the loan is ' + money(c.debt.amount) +
        ' and equity funds the rest of the uses.');
    }
    /* Negative cash in a loan year is a breach whatever the minimum says:
       name the year, and what the model did about it. */
    var dry = c.debt.amount > 0 ? c.debt.dry : [];
    if (dry.length) {
      var worst = Infinity, held = 0, paid = 0, sculptedDry = true;
      dry.forEach(function (y) {
        if (c.cfads[y] < worst) worst = c.cfads[y];
        if (c.ds[y] > 0) { sculptedDry = false; paid += c.ds[y]; } else held += c.intr[y];
      });
      var when = dry.length === 1 ? 'year ' + dry[0] : 'years ' + listText(dry.map(String), 'and');
      var cash = dry.length === 1 ? 'is ' + money(worst) : 'is at or below zero (as low as ' + money(worst) + ')';
      warn('warn', 'NEGATIVE_CFADS', 'In ' + when + ' the cash available for debt service ' + cash + ', ' + (sculptedDry
        ? 'so the sculpted loan takes nothing and ' + money(held) + ' of interest is added to the balance; a lender counts ' +
          (dry.length === 1 ? 'that' : 'each') + ' as a covenant breach, so the minimum DSCR is shown as 0×.'
        : 'so the owner pays the ' + money(paid) + ' of debt service from equity; a lender counts ' +
          (dry.length === 1 ? 'that' : 'each') + ' as a covenant breach.'));
    }
  }
  [['after-tax', c.irrInfo.at], ['pre-tax', c.irrInfo.pre]].forEach(function (x) {
    if (x[1].multiple) {
      warn('warn', 'MULTIPLE_IRR', 'The ' + x[0] + ' cash flow changes sign ' + x[1].signChanges + ' times and has more than one IRR (' +
        x[1].roots.map(function (r) { return (r * 100).toFixed(1) + '%'; }).join(', ') + '); the one nearest 10% is shown, so read ' +
        'the NPV alongside it.');
    }
  });
  w.sort(function (x, y) { return LEVEL_ORDER[x.level] - LEVEL_ORDER[y.level]; });

  /* ---- assumptions: every convention the numbers rest on ---- */
  a.push('Single-owner after-tax cash flow in nominal dollars, following NREL SAM\'s Single Owner model: year 0 is the ' +
    'investment and years 1 to ' + N + ' are full operating years (no partial first year)' +
    (c.face > 0 ? '; the ITC is realised in year 1.' : '.'));
  if (s) {
    a.push('Solar delivers ' + fmtNum(s.kwh1, 0) + ' kWh in year one and loses ' + fmtNum(s.degradationPct, 4) + '% of that each year ' +
      '(linear, as SAM applies lifetime degradation)' +
      (s.availabilityLossPct > 0 ? '; an availability loss of ' + fmtNum(s.availabilityLossPct, 4) + '% comes off the energy sold' : '') +
      (s.netDriftPct > 0 ? '; net energy falls a further ' + fmtNum(s.netDriftPct, 4) + '% of year one each year' : '') + '.');
  }
  if (rv.ppa) {
    a.push('The PPA is priced on ' + rv.ppa.basis + ' kWh at $' + fmtNum(rv.ppa.rate1, 4) + '/kWh in year one, ' +
      escText(rv.ppa.escalatorPct) + '.');
  }
  if (b) {
    var mode = rv.bess.mode;
    if (mode === 'bundled') {
      a.push('The battery\'s bill savings stay with the host as part of the bundled service; they are reported as host value, not owner revenue.');
    } else if (mode === 'fixed') {
      a.push('The owner charges $' + fmtNum(rv.bess.fixedPerKwMonth) + '/kW-month on ' + fmtNum(b.kw) + ' kW, ' +
        escText(rv.bess.escalatorPct) + '.');
    } else {
      a.push('The owner receives ' + (mode === 'host-owned' ? 'all' : fmtNum(rv.bess.sharePct) + '%') + ' of the host\'s bill savings ' +
        'from the sizing engine\'s schedule: nominal dollars, escalated and re-solved at each year\'s state of health.');
    }
    if (c.reps.length && inp.bessReplacement.mode !== 'none') {
      a.push('The battery pack is replaced in year ' + c.reps.map(function (r) { return r.year; }).join(' and ') + ' at the sizing ' +
        'engine\'s cost in today\'s dollars, ' + (inp.bessReplacement.mode === 'reserve'
          ? 'saved for in level deposits to a reserve' : 'paid from that year\'s cash') +
        ', and depreciated as 5-year MACRS with no second credit.');
    }
  }
  if (c.drRev[1] > 0) {
    a.push(rv.dr.inBase ? 'Demand-response revenue of ' + money(c.drRev[1]) + ' in year one is counted in the base case.'
                        : 'Demand-response revenue (up to ' + money(c.drRev[1]) + ' in year one) is upside and is not counted.');
  }
  if (c.evRev[1] > 0) a.push('EV charging earns ' + money(c.evRev[1]) + ' in year one ($' + fmtNum(rv.ev.perKwYear) + '/kW-yr on ' +
    fmtNum(inp.ev.kw) + ' kW), ' + escText(rv.ev.escalatorPct) + '.');
  if (c.otherRev[1] > 0) a.push('Other revenue of ' + money(c.otherRev[1]) + ' in year one is counted in the base case.');
  if (c.opex[1] > 0) a.push('Operating costs start at ' + money(c.opex[1]) + ' and each line escalates at its own rate.');
  if (inp.reserves.wcMonths > 0) {
    a.push('A working-capital reserve of ' + fmtNum(inp.reserves.wcMonths) + ' months of the next year\'s operating cost is funded at ' +
      'close, topped up each year and released in year ' + N + '.');
  }
  var eq = inp.reserves.equipment;
  if (eq.freqYears > 0 && eq.watts > 0 && eq.costPerW > 0) {
    a.push('A major-equipment reserve saves $' + eq.costPerW.toFixed(2) + '/W on ' + fmtNum(eq.watts, 0) + ' W over ' + eq.freqYears +
      '-year cycles, inflated ' + fmtNum(inp.inflationPct) + '% a year; it pays for the replacement, which is depreciated as ' +
      '5-year MACRS, and a cycle ending after year ' + N + ' is not funded.');
  }
  if (inp.reserves.interestPct > 0) a.push('Reserve balances earn ' + fmtNum(inp.reserves.interestPct) + '% on the prior year\'s balance.');
  if (c.face > 0) {
    a.push('The ITC-qualifying basis is each energy-property line\'s eligible share of its 5-year MACRS part' +
      (itc.stepUpPct > 0 ? ', stepped up ' + fmtNum(itc.stepUpPct) + '% to fair market value (depreciable basis too)' : '') +
      '; the credit is ' + (c.transfer ? 'sold under §6418 at $' + fmtNum(c.price, 3) + ' per $1, received in year 1'
                                     : 'claimed by the owner') +
      ', and the depreciable basis is reduced by half the credit (§50(c)(3)).');
    a.push('The credit vests over five years from placing in service (recapture of 100/80/60/40/20% on an earlier disposal); ' +
      'the owner is assumed to hold the project for the whole term.');
  } else {
    a.push('No investment tax credit is claimed.');
  }
  var split = ALLOC_CLASSES.filter(function (k) { return inp.allocation[k] > 0; }).map(function (k) {
    return fmtNum(inp.allocation[k]) + '% ' + CLASS_TEXT[k];
  });
  var onSplit = inp.capex.lines.some(function (l) { return l.depClass === 'energy'; });
  a.push((onSplit ? 'Energy-property cost is allocated ' + split.join(', ') + '; the ' : 'The ') +
    (tx.convention === 'mid-quarter' ? 'mid-quarter' : 'half-year') + ' convention applies' +
    (B.classes.sl39 > 0 ? ', and 39-year property uses the mid-month convention' : '') + '.');
  a.push(tx.bonusPct > 0
    ? fmtNum(tx.bonusPct) + '% bonus depreciation is taken in year 1 on the MACRS classes' +
      (tx.stateBonusConforms ? ', for state tax as well.' : '; the state does not conform and depreciates on the regular schedule.')
    : 'No bonus depreciation is taken.');
  a.push('Federal ' + fmtNum(tx.federalPct) + '% and state ' + fmtNum(tx.statePct) + '% income tax; state tax is computed first' +
    (tx.stateDeductible ? ' and deducted for federal tax' : ' and is not deductible federally') +
    ' (combined ' + fmtNum(tx.stateDeductible ? tx.federalPct + tx.statePct * (1 - tx.federalPct / 100) : tx.federalPct + tx.statePct) + '%).');
  a.push(tx.appetite === 'full'
    ? 'The owner has the tax appetite to use losses and the credit in the year they arise.'
    : 'The owner stands alone for tax: federal losses carry forward and offset up to ' + fmtNum(tx.nolLimitPct) + '% of later ' +
      'taxable income, state losses ' + (tx.stateNol ? 'carry forward' : 'are not carried') +
      (c.transfer ? '' : ', and the credit offsets tax only to the §38(c) limit, carrying forward up to 20 years') +
      '; losses and credits left at the end of the term are not valued.');
  if (c.debt && c.debt.amount > 0) {
    a.push('Debt of ' + money(c.debt.amount) + ' at ' + fmtNum(D.ratePct) + '% over ' + D.tenorYears + ' years, ' +
      (c.debt.sized.shape === 'sculpted' ? 'sculpted to a constant coverage of cash available for debt service'
                                         : 'repaid in level annual payments') +
      ', sized on ' + (D.sizing === 'ltc' ? fmtNum(D.ltcPct) + '% of installed cost'
        : D.sizing === 'dscr' ? 'a ' + fmtNum(D.dscrMin) + '× DSCR'
        : 'the lesser of ' + fmtNum(D.ltcPct) + '% of installed cost and a ' + fmtNum(D.dscrMin) + '× DSCR') +
      (c.debt.sized.binding === 'cap' ? ' and capped at ' + DEBT_CEILING_PCT + '% of installed cost' : '') +
      '; cash available for debt service is EBITDA plus reserve interest less reserve deposits' +
      (inp.bessReplacement.mode === 'expense' && c.reps.length ? ' and replacements paid from cash' : '') + '.');
    a.push('The ' + fmtNum(D.feePct) + '% financing fee is paid at close and amortised over the loan for tax' +
      (D.dsraMonths > 0 ? '; a DSRA of ' + fmtNum(D.dsraMonths) + ' months of the next year\'s debt service is funded at close ' +
        'and released at maturity' : '') + '.');
  }
  a.push('NPV' + (rv.ppa ? ', the levelized PPA price' : '') + (s ? ' and LCOE' : (b ? ' and LCOS' : '')) + ' discount at ' +
    fmtNum(inp.discountPct) + '% nominal' + (s ? '; LCOE follows SAM: the present value of the owner\'s annual costs, with the ' +
    'equity at year 0, over the present value of the kWh delivered' : '') +
    (!s && b ? '; LCOS is the same cost over the present value of battery discharge, which falls with state of health' : '') + '.');
  a.push('Total investor returns are the after-tax cash flows of years 0 to ' + N + ' added up; payback is when the ' +
    'cumulative after-tax cash turns non-negative for good, interpolated within that year; the IRR build steps are differences ' +
    'of IRRs rounded to a tenth of a point, so they add up to the total.');
  a.push('There is no salvage or terminal value' + (inp.reserves.wcMonths > 0 ? '; the working-capital reserve is released in the final year' : '') + '.');
  return { warnings: w, assumptions: a };
}

var CLASS_TEXT = {
  macrs5: '5-year MACRS', macrs7: '7-year MACRS', macrs15: '15-year MACRS', sl15: '15-year straight line',
  sl20: '20-year straight line', sl39: '39-year straight line', none: 'not depreciable'
};

/* ---------------------------------------------------------------------- *
 *  Text helpers
 * ---------------------------------------------------------------------- */

var MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September',
                   'October', 'November', 'December'];

function monthText(m) { return MONTH_NAMES[monthNumber(m) - 1] + ' ' + m.slice(0, 4); }

function addMonths(m, k) {
  var y = Number(m.slice(0, 4)), mo = Number(m.slice(5, 7)) - 1 + k;
  y += Math.floor(mo / 12);
  mo = ((mo % 12) + 12) % 12 + 1;
  return y + '-' + (mo < 10 ? '0' : '') + mo;
}

/* 8.84 -> '8.84', 7 -> '7', 2.50 -> '2.5'; dp decimals at most. */
function fmtNum(v, dp) {
  if (!isFiniteNum(v)) return String(v);
  var d = dp == null ? 2 : dp, x = v.toFixed(d);
  if (d > 0) x = x.replace(/\.?0+$/, '');
  var neg = x.charAt(0) === '-', parts = (neg ? x.slice(1) : x).split('.'), i = parts[0], out = '';
  while (i.length > 3) { out = ',' + i.slice(-3) + out; i = i.slice(0, -3); }
  return (neg ? '-' : '') + i + out + (parts[1] ? '.' + parts[1] : '');
}

function money(v) { return (v < 0 ? '-$' : '$') + fmtNum(Math.abs(v), 0); }

/* ['a'] -> 'a'; ['a', 'b'] -> 'a or b'; ['a', 'b', 'c'] -> 'a, b or c'. */
function listText(items, word) {
  if (items.length < 2) return items.join('');
  return items.slice(0, -1).join(', ') + ' ' + word + ' ' + items[items.length - 1];
}

function escText(pct) {
  if (!pct) return 'flat';
  return (pct > 0 ? 'escalating ' : 'falling ') + fmtNum(Math.abs(pct)) + '% a year';
}

/* ---------------------------------------------------------------------- *
 *  run
 * ---------------------------------------------------------------------- */

/* run(inputs) -> the published result, or {ok:false, errors:[{field,
   message}]} for inputs that cannot be modelled. Bad input never throws. */
function run(raw) {
  var n = normalize(raw);
  if (n.errors.length) return { ok: false, errors: n.errors };
  var core = model(n.inputs, NO_ADJ);
  var result = assemble(n.inputs, core);
  result.sensitivity = sensitivity(n.inputs, core);
  var nt = notes(n.inputs, core, n.meta, result.sensitivity);
  result.warnings = nt.warnings;
  result.assumptions = nt.assumptions;
  return result;
}

function deepFreeze(o) {
  Object.keys(o).forEach(function (k) { if (o[k] && typeof o[k] === 'object') deepFreeze(o[k]); });
  return Object.freeze(o);
}

/* The defaults are read by every run and handed out only as copies; a
   stray write to them would change the next tenant's numbers, so it
   fails loudly instead. */
deepFreeze(DEFAULTS);
deepFreeze(BLOCKS);
deepFreeze(LINE_DEFAULTS);

module.exports = {
  run: run,
  defaults: defaults,
  validate: validate,
  irr: irr,
  payback: payback,
  MACRS: deepFreeze(MACRS),
  STATE_TAX: deepFreeze(STATE_TAX),
  itcRate: itcRate,
  VERSION: VERSION
};
