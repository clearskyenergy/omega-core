/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The pro forma engine (api/_lib/proforma-engine.js), calibrated against
   the three reference investor decks it was reverse-engineered from and
   checked against the tax tables and rules it encodes.

   The decks are NREL SAM "PV Battery / Single Owner" runs. CALIBRATION is
   the acceptance test: each deck is rebuilt through the public run() API,
   never the internals, and every published figure must land inside the
   tolerance the build contract set, or the test run fails. A deck that
   used a non-default input has it set explicitly below, with the reason:
   the engine's defaults follow the law as of September 2026 and are never
   bent to match a deck.

   Run: node scripts/tests/tproformaengine.js
*/
'use strict';
var path = require('path');
var E = require(path.join(__dirname, '..', '..', 'api', '_lib', 'proforma-engine.js'));

var pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (got !== undefined ? '  got: ' + JSON.stringify(got) : '')); }
}
function eq(name, got, want) { ok(name, got === want, got); }
function near(name, got, want, tol) {
  ok(name, typeof got === 'number' && isFinite(got) && Math.abs(got - want) <= (tol == null ? 1e-6 : tol), got);
}
function section(t) { console.log('\n' + t); }

function isPlain(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
/* Fixture override: objects merge, everything else (arrays, null) replaces. */
function merge(into, over) {
  var out = {}, k;
  for (k in into) out[k] = into[k];
  for (k in over) out[k] = isPlain(over[k]) && isPlain(into[k]) ? merge(into[k], over[k]) : over[k];
  return out;
}
function sum(a) { return a.reduce(function (x, y) { return x + y; }, 0); }
function col(r, key) { return r.rows.map(function (row) { return row[key]; }); }
function codes(r) { return r.warnings.map(function (w) { return w.code; }); }
function warning(r, code) { return r.warnings.filter(function (w) { return w.code === code; })[0] || null; }
function sens(r, key) { return r.sensitivity.filter(function (s) { return s.key === key; })[0] || null; }
function fieldOf(r) { return (r.errors || []).map(function (e) { return e.field; }); }
function money(v) { return Math.round(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function pad(s, n, right) { s = String(s); while (s.length < n) s = right ? s + ' ' : ' ' + s; return s; }

/* Every number in a result is finite; null is the only stand-in. */
function allFinite(v, where) {
  if (typeof v === 'number') return isFinite(v) ? null : where;
  if (v === undefined) return where;
  if (v && typeof v === 'object') {
    var k, bad;
    for (k in v) { bad = allFinite(v[k], where + '.' + k); if (bad) return bad; }
  }
  return null;
}

/* ---------------------------------------------------------------------- *
 *  Fixtures
 * ---------------------------------------------------------------------- */

/* A solar + storage site with its costs on separate lines, as the page
   builds them, and dates that clear every deadline. */
function site(over) {
  return merge({
    years: 20,
    project: { name: 'Test site', state: 'CA', bocMonth: '2026-05', pisMonth: '2027-06' },
    solar: { kwDc: 500, kwAc: 400, kwh1: 700000 },
    bess: { kw: 250, kwh: 1000 },
    capex: { lines: [
      { id: 'solar', label: 'Solar', amount: 1000000, asset: 'solar' },
      { id: 'bess', label: 'Storage', amount: 500000, asset: 'storage' }
    ] },
    revenue: { ppa: { rate1: 0.20 } },
    opex: { lines: [{ id: 'om', label: 'O&M', perYear: 20000 }] }
  }, over || {});
}

/* Solar alone in Texas (no state income tax), $1M on SAM's split: the
   numbers in the basis tests below are worked by hand from it. */
function solarOnly(over) {
  return merge({
    years: 20,
    project: { name: 'Solar only', state: 'TX', bocMonth: '2026-05', pisMonth: '2027-06' },
    solar: { kwDc: 500, kwh1: 700000 },
    capex: { lines: [{ id: 'solar', label: 'Solar', amount: 1000000, asset: 'solar' }] },
    revenue: { ppa: { rate1: 0.20 } },
    opex: { lines: [{ id: 'om', label: 'O&M', perYear: 20000 }] }
  }, over || {});
}

/* The sizing engine's year-by-year schedule, as proforma-sizing returns it:
   nominal savings, escalated, faded by state of health, reset on the
   replacement year. */
function sizingSchedule(n, y1, escPct, fadePct, replYear) {
  var out = [], age = 1, t;
  for (t = 1; t <= n; t++) {
    if (t === replYear) age = 1;
    var soh = Math.pow(1 - fadePct / 100, age - 1), e = Math.pow(1 + escPct / 100, t - 1);
    out.push({ year: t, soh: soh, savingsRatio: soh, grossSavings: y1 * soh * e * 1.05,
               lossCost: y1 * 0.05 * soh * e, netSavings: y1 * soh * e });
    age++;
  }
  return out;
}

function bessOnly(over) {
  return merge({
    years: 20,
    project: { name: 'Battery only', state: 'IL', bocMonth: '2027-03', pisMonth: '2027-09' },
    bess: { kw: 500, kwh: 2000, sizing: {
      system: { kw: 500, nameplateKwh: 2000 }, schedule: sizingSchedule(20, 150000, 3, 2, 14),
      replacements: [{ year: 14, cost: 400000 }], throughputKwhYr: 300000 } },
    capex: { lines: [
      { id: 'bess', label: 'Battery', amount: 900000, asset: 'storage' },
      { id: 'cont', label: 'Contingency', amount: 50000, asset: 'blended' }
    ] },
    revenue: { bess: { mode: 'shared-savings', sharePct: 80 } },
    opex: { lines: [{ id: 'om', label: 'O&M', perYear: 5000 }] }
  }, over || {});
}

/* ---- the three decks ---------------------------------------------------- */

/* Topanga: 315 kW DC solar + 300 kW / 1,800 kWh storage, unlevered, full
   tax appetite, 28 years. */
var TOPANGA = {
  years: 28,
  project: { name: 'Topanga', city: 'Canoga Park', state: 'CA', bocMonth: '2027-02', pisMonth: '2027-10' },
  /* The deck's AC energy falls 0.4642%/yr (fitted: SAM's 0.5%/yr DC
     degradation less clipping and the battery), and its revenue per kWh
     drifts 0.0577%/yr below the escalated price, which is SAM pricing net
     hourly energy while dividing by gross. Both are set because this deck
     needs them; neither is a default. Year-1 revenue is on the GROSS
     530,984 kWh (x $0.225 = $119,471), so net starts equal to gross. */
  solar: { kwDc: 315, kwh1: 530984, netKwh1: 530984, degradationPct: 0.4642, netDriftPct: 0.0577 },
  bess: { kw: 300, kwh: 1800 },
  controller: true,
  /* One installed cost for solar, storage and controller, as the deck gives
     it; a blended line takes the (equal) solar and storage rate. The deck
     prints $1,780,063 and its $1,785,564 of total uses needs the half
     dollar. */
  capex: { lines: [{ id: 'installed', label: 'Installed cost', amount: 1780063.5, asset: 'blended' }] },
  revenue: { ppa: { rate1: 0.225, escalatorPct: 2.5, basis: 'net' } },
  opex: { lines: [{ id: 'opex', label: 'Operating cost', perYear: 22001, escalatorPct: 2.5 }] },
  /* 40% = the 30% base (under 1 MW AC) + the 10-point energy community
     adder: a statutory build, so no override. */
  tax: { itc: { solar: { energyCommunity: true }, storage: { energyCommunity: true } } }
};

/* Sunnyside: 409 kW DC solar + 300 kW / 1,800 kWh storage, unlevered. */
var SUNNYSIDE = {
  years: 28,
  project: { name: 'Sunnyside', city: 'Torrance', state: 'CA', bocMonth: '2027-02', pisMonth: '2027-10' },
  /* Fitted AC decline 0.4787%/yr. Revenue is on the NET 627,794 kWh
     (x $0.25 = $156,949) while the levelized price divides by the gross
     627,859. */
  solar: { kwDc: 409, kwh1: 627859, netKwh1: 627794, degradationPct: 0.4787 },
  bess: { kw: 300, kwh: 1800 },
  controller: true,
  capex: { lines: [{ id: 'installed', label: 'Installed cost', amount: 2350251, asset: 'blended' }] },
  revenue: { ppa: { rate1: 0.25, escalatorPct: 2.5, basis: 'net' } },
  opex: { lines: [{ id: 'opex', label: 'Operating cost', perYear: 24385, escalatorPct: 2.5 }] },
  tax: {
    /* The deck's own error: SAM's 7% default state rate left in place for a
       California site (8.84%). STATE_RATE_MISMATCH has to say so. */
    statePct: 7,
    /* "36% flat federal ITC" is not a §48E combination. Entered as the deck
       entered it; NON_STATUTORY_RATE has to say so. */
    itc: { solar: { ratePctOverride: 36 }, storage: { ratePctOverride: 36 } }
  }
};

/* Taft: 328 kW DC solar + 125 kW / 500 kWh storage + 125 kW EV charging,
   levered, no tax appetite, credit sold. */
function taft(itc) {
  itc.monetization = 'transfer';
  itc.transferPrice = 0.92;
  return {
    years: 28,
    project: { name: 'Taft', city: 'Hollywood', state: 'FL', bocMonth: '2027-01', pisMonth: '2027-10' },
    /* 475,600 kWh contracted at $0.29 less the deck's 2% availability haircut:
       475,600 x 0.29 x 0.98 = $135,166, its year-1 PPA revenue. */
    solar: { kwDc: 328, kwh1: 475600, degradationPct: 0.5, availabilityLossPct: 2 },
    bess: { kw: 125, kwh: 500 },
    ev: { kw: 125 },
    controller: true,
    capex: { lines: [
      { id: 'solar', label: 'Solar', amount: 777360, asset: 'solar', itcEligible: 0.9 },
      /* The deck's qualifying basis is 90% of ALL capex, roof and EV make-
         ready included. Neither is §48E property (a roof is building; a
         charger earns depreciation only), and by default the engine gives
         them no credit. They are entered as solar ONLY to reproduce the
         deck. */
      { id: 'roof', label: 'Roofing repairs', amount: 565000, asset: 'solar', itcEligible: 0.9 },
      { id: 'evready', label: 'EV charger make-ready', amount: 120000, asset: 'solar', itcEligible: 0.9 },
      { id: 'bess', label: 'Battery', amount: 120000, asset: 'storage', itcEligible: 0.9 },
      /* Counted eligible by the deck; CONTROLLER_INTEGRAL has to ask. */
      { id: 'controller', label: 'Microgrid controller', amount: 68500, asset: 'controller', itcEligible: 0.9 },
      { id: 'contingency', label: 'Contingency', amount: 26921, asset: 'blended' }
    ] },
    /* "Pure 5-yr MACRS" on everything. */
    allocation: { macrs5: 100 },
    /* The deck carries $9,600 of EV revenue and labels it "$80/kW-yr on
       125 kW", which multiplies to $10,000; $9,600 is $76.80 on 125 kW. */
    revenue: { ppa: { rate1: 0.29, escalatorPct: 2.5, basis: 'gross' }, ev: { perKwYear: 76.8, escalatorPct: 0 } },
    opex: { lines: [{ id: 'opex', label: 'Operating cost', perYear: 8997, escalatorPct: 2.5 }] },
    /* No working-capital reserve in the deck's uses. */
    reserves: { wcMonths: 0 },
    tax: {
      /* California's 8.84% on a Florida site (5.5%), as the deck states it. */
      statePct: 8.84,
      /* No tax appetite: federal losses carried at the 80% limit, state
         losses not carried (the reverse-engineered fit). */
      appetite: 'nol', nolLimitPct: 80, stateNol: false,
      itc: itc
    },
    /* The lesser of 45% of CAPEX and a 1.35x DSCR, sculpted; the 45% binds. */
    debt: { sizing: 'min', ltcPct: 45, ratePct: 7.5, tenorYears: 15, dscrMin: 1.35, shape: 'sculpted',
            feePct: 1.5, dsraMonths: 6 }
  };
}
/* "26.6% Section 48E rate - 20% base plus a 33% basis increase for step-up
   capital". The deck applied 26.6% to the un-stepped qualifying basis and
   depreciated the un-stepped basis. The engine steps up the credit basis
   and the 5-year depreciable basis together, as a fair-market-value
   step-up does, so the calibration enters the deck's effective 26.6%;
   the 20% x 1.33 form is run too, must give the same credit and must
   still land inside the tolerance. */
var TAFT = taft({ solar: { ratePctOverride: 26.6 }, storage: { ratePctOverride: 26.6 } });
var TAFT_STEPUP = taft({ solar: { ratePctOverride: 20 }, storage: { ratePctOverride: 20 }, stepUpPct: 33 });

/* ====================================================================== */

section('depreciation tables sum to 100% (IRS Pub. 946 Appendix A)');
['macrs5', 'macrs7', 'macrs15', 'sl15', 'sl20'].forEach(function (c) {
  near('half-year ' + c + ' adds to 100', sum(E.MACRS.halfYear[c]), 100, 0.005);
});
['macrs5', 'macrs7', 'macrs15'].forEach(function (c) {
  E.MACRS.midQuarter[c].forEach(function (tab, q) {
    near('mid-quarter ' + c + ' Q' + (q + 1) + ' adds to 100', sum(tab), 100, 0.005);
  });
});
eq('5-year MACRS runs six tax years', E.MACRS.halfYear.macrs5.length, 6);
eq('7-year MACRS runs eight', E.MACRS.halfYear.macrs7.length, 8);
eq('15-year MACRS runs sixteen', E.MACRS.halfYear.macrs15.length, 16);
/* Every published figure, digit for digit: a typo that still sums to 100
   moves depreciation between years and no total would notice. */
var IRS = {
  'halfYear.macrs5': '20/32/19.2/11.52/11.52/5.76',
  'halfYear.macrs7': '14.29/24.49/17.49/12.49/8.93/8.92/8.93/4.46',
  'halfYear.macrs15': '5/9.5/8.55/7.7/6.93/6.23/5.9/5.9/5.91/5.9/5.91/5.9/5.91/5.9/5.91/2.95',
  'halfYear.sl15': '3.33/6.67/6.67/6.67/6.67/6.67/6.67/6.66/6.67/6.66/6.67/6.66/6.67/6.66/6.67/3.33',
  'midQuarter.macrs5.0': '35/26/15.6/11.01/11.01/1.38',
  'midQuarter.macrs5.1': '25/30/18/11.37/11.37/4.26',
  'midQuarter.macrs5.2': '15/34/20.4/12.24/11.3/7.06',
  'midQuarter.macrs5.3': '5/38/22.8/13.68/10.94/9.58',
  'midQuarter.macrs7.0': '25/21.43/15.31/10.93/8.75/8.74/8.75/1.09',
  'midQuarter.macrs7.1': '17.85/23.47/16.76/11.97/8.87/8.87/8.87/3.34',
  'midQuarter.macrs7.2': '10.71/25.51/18.22/13.02/9.3/8.85/8.86/5.53',
  'midQuarter.macrs7.3': '3.57/27.55/19.68/14.06/10.04/8.73/8.73/7.64',
  'midQuarter.macrs15.0': '8.75/9.13/8.21/7.39/6.65/5.99/5.9/5.91/5.9/5.91/5.9/5.91/5.9/5.91/5.9/0.74',
  'midQuarter.macrs15.1': '6.25/9.38/8.44/7.59/6.83/6.15/5.91/5.9/5.91/5.9/5.91/5.9/5.91/5.9/5.91/2.21',
  'midQuarter.macrs15.2': '3.75/9.63/8.66/7.8/7.02/6.31/5.9/5.9/5.91/5.9/5.91/5.9/5.91/5.9/5.91/3.69',
  'midQuarter.macrs15.3': '1.25/9.88/8.89/8/7.2/6.48/5.9/5.9/5.9/5.91/5.9/5.91/5.9/5.91/5.9/5.17'
};
Object.keys(IRS).forEach(function (k) {
  var t = k.split('.').reduce(function (o, p) { return o[p]; }, E.MACRS);
  eq(k + ' matches Publication 946', t.join('/'), IRS[k]);
});
var m = 0, monthsOk = true;
for (m = 1; m <= 12; m++) {
  var s39 = E.MACRS.schedule('sl39', 'half-year', '2027-' + (m < 10 ? '0' : '') + m);
  if (Math.abs(sum(s39) - 1) > 1e-12 || s39.length !== 40) monthsOk = false;
}
ok('39-year mid-month adds to 100% over 40 years for every month placed in service', monthsOk);
near('39-year, placed in service in January: 2.457% in year 1 (Table A-7a prints 2.461)',
  E.MACRS.schedule('sl39', 'half-year', '2027-01')[0] * 100, 2.461, 0.005);
near('39-year, October: 0.534% in year 1 (Table A-7a prints 0.535)',
  E.MACRS.schedule('sl39', 'half-year', '2027-10')[0] * 100, 0.535, 0.002);
near('39-year, years 2-39 at 1/39', E.MACRS.schedule('sl39', 'half-year', '2027-10')[5], 1 / 39, 1e-15);
near('39-year with no month falls back to SAM\'s half year', E.MACRS.schedule('sl39', 'half-year', '')[0], 0.5 / 39, 1e-15);
['sl15', 'sl20'].forEach(function (c) {
  [1, 4, 7, 10].forEach(function (mo) {
    near(c + ' mid-quarter from month ' + mo + ' adds to 100%',
      sum(E.MACRS.schedule(c, 'mid-quarter', '2027-' + (mo < 10 ? '0' : '') + mo)), 1, 1e-12);
  });
});
eq('mid-quarter picks the table by the quarter of the in-service month (Oct = Q4)',
  E.MACRS.schedule('macrs5', 'mid-quarter', '2027-10')[0], 0.05);
eq('half-year ignores the month', E.MACRS.schedule('macrs5', 'half-year', '2027-10')[0], 0.2);
eq('mid-quarter without a month falls back to half-year', E.MACRS.schedule('macrs7', 'mid-quarter', '')[0], 0.1429);
eq('the non-depreciable class has no schedule', E.MACRS.schedule('none', 'half-year', '2027-01').length, 0);
try { E.MACRS.halfYear.macrs5[0] = 99; } catch (e) { /* frozen: strict mode throws */ }
eq('the published tables cannot be edited by a caller', E.MACRS.halfYear.macrs5[0], 20);

section('state corporate rates, 2026');
var STATES = ('AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH ' +
              'NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY').split(' ');
eq('all 50 states and DC, nothing else', Object.keys(E.STATE_TAX).sort().join(), STATES.slice().sort().join());
ok('every rate is a percent between 0 and 12', STATES.every(function (s) {
  return typeof E.STATE_TAX[s] === 'number' && E.STATE_TAX[s] >= 0 && E.STATE_TAX[s] <= 12;
}));
eq('the research\'s rates: CA 8.84, FL 5.5, NY 6.5, NJ 9, IL 9.5, MA 8, TX 0',
  [E.STATE_TAX.CA, E.STATE_TAX.FL, E.STATE_TAX.NY, E.STATE_TAX.NJ, E.STATE_TAX.IL, E.STATE_TAX.MA, E.STATE_TAX.TX].join(),
  '8.84,5.5,6.5,9,9.5,8,0');
eq('2026 changes: NE 4.55, NC 2, PA 7.49, and GA stays 5.19 (trigger not met)',
  [E.STATE_TAX.NE, E.STATE_TAX.NC, E.STATE_TAX.PA, E.STATE_TAX.GA].join(), '4.55,2,7.49,5.19');

section('§48E rate build');
function rate(cfg, ctx) { return E.itcRate(cfg, ctx); }
var STOR = { asset: 'storage', under1MWac: false }, SOLAR = { asset: 'solar', under1MWac: false, kwAc: 2000 };
eq('no PWA, 1 MW or more: 6%', rate({ pwa: false }, STOR).ratePct, 6);
eq('+ energy community on the 6% base: 8%', rate({ pwa: false, energyCommunity: true }, STOR).ratePct, 8);
eq('+ domestic content too: 10%', rate({ pwa: false, energyCommunity: true, domesticContent: true }, STOR).ratePct, 10);
eq('PWA met: 30%', rate({ pwa: true }, STOR).ratePct, 30);
eq('under 1 MW AC without PWA: 30%', rate({ pwa: false }, { asset: 'storage', under1MWac: true }).ratePct, 30);
eq('under 1 MW read off the size when not stated', rate({ pwa: false }, { asset: 'solar', kwAc: 999 }).ratePct, 30);
eq('30% + energy community: 40%', rate({ pwa: true, energyCommunity: true }, STOR).ratePct, 40);
eq('30% + both adders: 50%', rate({ pwa: true, energyCommunity: true, domesticContent: true }, STOR).ratePct, 50);
eq('solar low-income +10 on 30: 40%', rate({ pwa: true, lowIncome: 10 }, SOLAR).ratePct, 40);
eq('solar low-income +20 on 50: 70%', rate({ pwa: true, energyCommunity: true, domesticContent: true, lowIncome: 20 }, SOLAR).ratePct, 70);
eq('low-income is flat points on the 6% base too: 16%', rate({ pwa: false, lowIncome: 10 }, SOLAR).ratePct, 16);
eq('storage takes no low-income bonus', rate({ pwa: true, lowIncome: 20 }, STOR).ratePct, 30);
eq('no low-income bonus at 5 MW AC or more', rate({ pwa: true, lowIncome: 10 }, { asset: 'solar', kwAc: 5000 }).ratePct, 30);
var b40 = rate({ pwa: true, energyCommunity: true }, STOR);
ok('the build lines add up to the rate', sum(b40.build.map(function (x) { return x.pts; })) === b40.ratePct, b40.build);
ok('a built rate is statutory', b40.statutory === true);
var o36 = rate({ pwa: true, ratePctOverride: 36 }, STOR);
ok('an entered 36% replaces the build and is flagged non-statutory', o36.ratePct === 36 && o36.statutory === false, o36);
ok('an entered rate equal to the build is statutory', rate({ pwa: true, ratePctOverride: 30 }, STOR).statutory === true);
var cliff = rate({ pwa: true }, { asset: 'solar', kwAc: 400, bocMonth: '2026-08', pisMonth: '2028-01' });
ok('solar begun after July 2026 and in service after 2027: 0%, and the build says why',
  cliff.ratePct === 0 && cliff.cliff && sum(cliff.build.map(function (x) { return x.pts; })) === 0, cliff);
eq('the deadline holds against an entered rate too',
  rate({ pwa: true, ratePctOverride: 40 }, { asset: 'solar', kwAc: 400, bocMonth: '2027-01', pisMonth: '2028-03' }).ratePct, 0);
eq('begun by July 2026: no deadline', rate({ pwa: true }, { asset: 'solar', kwAc: 400, bocMonth: '2026-07', pisMonth: '2029-06' }).ratePct, 30);
eq('in service in December 2027: in time', rate({ pwa: true }, { asset: 'solar', kwAc: 400, bocMonth: '2027-03', pisMonth: '2027-12' }).ratePct, 30);
eq('storage has no in-service deadline', rate({ pwa: true }, { asset: 'storage', under1MWac: true, bocMonth: '2027-03', pisMonth: '2029-01' }).ratePct, 30);
eq('storage begun 2033: full rate', rate({ pwa: true }, { asset: 'storage', bocMonth: '2033-12' }).ratePct, 30);
eq('storage begun 2034: 75% of the rate', rate({ pwa: true }, { asset: 'storage', bocMonth: '2034-01' }).ratePct, 22.5);
eq('storage begun 2035: 50%', rate({ pwa: true, energyCommunity: true }, { asset: 'storage', bocMonth: '2035-06' }).ratePct, 20);
eq('storage begun 2036: nothing', rate({ pwa: true }, { asset: 'storage', bocMonth: '2036-01' }).ratePct, 0);

section('basis, credit and the §50(c) haircut (worked by hand: $1M solar, 30%, SAM split)');
var base = E.run(solarOnly());
ok('the base case runs', base.ok === true, base.errors);
near('qualifying basis is the 90% in 5-year MACRS: $900,000', base.tax.itc.qualifyingBasis, 900000, 1e-6);
near('ITC at 30%: $270,000', base.tax.itc.face, 270000, 1e-6);
near('depreciable basis is 97% before the haircut: $970,000', base.tax.depreciableBasis, 970000, 1e-6);
near('haircut is half the credit: $135,000', base.tax.haircut, 135000, 1e-6);
near('depreciable after the haircut: $835,000', base.tax.depreciableAfterHaircut, 835000, 1e-6);
near('the haircut comes off the 5-year class only: $765,000', base.tax.classes.macrs5, 765000, 1e-6);
eq('the other classes are untouched (1.5 / 2.5 / 3 / 3%)',
  [base.tax.classes.macrs15, base.tax.classes.sl15, base.tax.classes.sl20, base.tax.classes.none].join(), '15000,25000,30000,30000');
near('year-1 federal depreciation: 20% / 5% / 3.33% / 2.5% of the classes',
  base.rows[0].depreciationFed, 765000 * 0.2 + 15000 * 0.05 + 25000 * 0.0333 + 30000 * 0.025, 1e-6);
var step = E.run(solarOnly({ tax: { itc: { stepUpPct: 20 } } }));
near('a 20% step-up lifts the credit basis to $1,080,000', step.tax.itc.qualifyingBasis, 1080000, 1e-6);
near('and the credit to $324,000', step.tax.itc.face, 324000, 1e-6);
near('and the 5-year basis with it: 900,000 + 180,000 - 162,000', step.tax.classes.macrs5, 918000, 1e-6);
var roofed = E.run(solarOnly({ capex: { lines: [
  { id: 'solar', label: 'Solar', amount: 1000000, asset: 'solar' },
  { id: 'roof', label: 'Roof', amount: 390000, asset: 'roof' },
  { id: 'ev', label: 'Chargers', amount: 100000, asset: 'ev' },
  { id: 'misc', label: 'Permits', amount: 10000, asset: 'other' }] }, project: { pisMonth: '2027-10' } }));
near('by default a roof, chargers and other costs earn no credit', roofed.tax.itc.face, 270000, 1e-6);
eq('a roof is 39-year property, chargers 5-year, an unexplained cost not depreciated',
  [roofed.capex.lines[1].depClass, roofed.capex.lines[2].depClass, roofed.capex.lines[3].depClass].join(), 'sl39,macrs5,none');
near('the whole roof is 39-year basis, untouched by the credit', roofed.capex.lines[1].depBasisByClass.sl39, 390000, 1e-9);
near('year-1 depreciation adds the roof\'s mid-month share and the chargers\' 20%',
  roofed.rows[0].depreciationFed - base.rows[0].depreciationFed, 390000 * 2.5 / 468 + 100000 * 0.2, 1e-6);
near('year 2 adds a full 1/39 of the roof and 32% of the chargers',
  roofed.rows[1].depreciationFed - base.rows[1].depreciationFed, 10000 + 32000, 1e-6);
var itcSum = sum(roofed.capex.lines.map(function (l) { return l.itc; }));
near('line credits add up to the face', itcSum, roofed.tax.itc.face, 1e-6);
var eligTaft = E.run(TAFT);
near('a blended line takes the weighted eligible share and rate of the solar and storage lines',
  eligTaft.capex.lines[5].itcEligible, 0.9, 1e-12);

section('bonus depreciation and state conformity');
var bonus = E.run(solarOnly({ tax: { bonusPct: 100 } }));
near('100% bonus: the MACRS classes go in year 1 federally', bonus.rows[0].depreciationFed,
  765000 + 15000 + 25000 * 0.0333 + 30000 * 0.025, 1e-6);
near('a non-conforming state keeps the regular schedule', bonus.rows[0].depreciationState, base.rows[0].depreciationFed, 1e-6);
near('federal year 2 is straight line only', bonus.rows[1].depreciationFed, 25000 * 0.0667 + 30000 * 0.05, 1e-6);
var bonusCa = E.run(solarOnly({ tax: { bonusPct: 100, stateBonusConforms: true } }));
near('a conforming state follows the bonus', bonusCa.rows[0].depreciationState, bonus.rows[0].depreciationFed, 1e-6);
var bonus60 = E.run(solarOnly({ tax: { bonusPct: 60 } }));
near('60% bonus: 60% in year 1, the rest on the table',
  bonus60.rows[0].depreciationFed, 0.6 * 780000 + 0.4 * (765000 * 0.2 + 15000 * 0.05) + 25000 * 0.0333 + 30000 * 0.025, 1e-6);
ok('bonus lifts the after-tax IRR and not the pre-tax one',
  bonus.metrics.afterTaxIrr > base.metrics.afterTaxIrr && Math.abs(bonus.metrics.preTaxIrr - base.metrics.preTaxIrr) < 1e-12);

section('mid-quarter convention');
var mq = E.run(solarOnly({ project: { pisMonth: '2027-10' }, tax: { convention: 'mid-quarter' } }));
near('Q4: 5% of the 5-year basis, 1.25% of 15-year, 1/8 of a straight-line year', mq.rows[0].depreciationFed,
  765000 * 0.05 + 15000 * 0.0125 + 25000 * 0.125 / 15 + 30000 * 0.125 / 20, 1e-6);
near('and 38% of the 5-year basis in year 2', mq.rows[1].depreciationFed,
  765000 * 0.38 + 15000 * 0.0988 + 25000 / 15 + 30000 / 20, 1e-6);
ok('the mid-quarter convention costs return', mq.metrics.afterTaxIrr < base.metrics.afterTaxIrr);
ok('choosing it clears the mid-quarter warning', codes(mq).indexOf('MID_QUARTER') < 0);

section('debt: sizing, shape, DSRA, fee');
var ltcRun = E.run(site({ debt: { sizing: 'min', ltcPct: 30 } }));
eq('the lesser of LTC and DSCR: the 30% LTC binds', ltcRun.debt.sizingBinding, 'ltc');
near('debt is 30% of installed cost, not of total uses', ltcRun.debt.amount, 450000, 1e-6);
ok('and the DSCR capacity is larger', ltcRun.debt.dscrCapacity > ltcRun.debt.amount);
near('fee is 1.5% of the debt, in the uses', ltcRun.debt.fee, 6750, 1e-6);
near('the fee is amortised over the tenor for tax', sum(col(ltcRun, 'feeAmortization')), 6750, 1e-6);
near('principal repays the loan exactly', sum(col(ltcRun, 'principal')), 450000, 1e-6);
var dsrs = ltcRun.rows.slice(0, 15).map(function (r) { return r.dscr; });
ok('a sculpted loan holds one coverage ratio every year', Math.max.apply(null, dsrs) - Math.min.apply(null, dsrs) < 1e-9, dsrs);
ok('and it is above the 1.35x floor when the LTC binds', ltcRun.debt.dscrMin >= 1.35);
near('DSRA at close is 6 months of year-1 debt service', ltcRun.debt.dsra0, ltcRun.rows[0].debtService / 2, 1e-6);
near('the DSRA is released in the final loan year', ltcRun.rows[14].dsraFunding, -ltcRun.rows[14].debtService / 2, 1e-6);
near('and its funding nets to zero over the term', ltcRun.debt.dsra0 + sum(col(ltcRun, 'dsraFunding')), 0, 1e-6);
eq('nothing is owed after the tenor', ltcRun.rows[15].debtService + ltcRun.rows[15].interest, 0);
near('equity is total uses less debt', ltcRun.sourcesUses.equity, ltcRun.sourcesUses.totalUses - 450000, 1e-6);
near('uses add up', sum(ltcRun.sourcesUses.uses.map(function (u) { return u.amount; })), ltcRun.sourcesUses.totalUses, 1e-6);
near('sources add up', sum(ltcRun.sourcesUses.sources.map(function (u) { return u.amount; })), ltcRun.sourcesUses.totalUses, 1e-6);
var dscrRun = E.run(site({ debt: { sizing: 'min', ltcPct: 80 } }));
eq('an 80% LTC is more than the cash covers: the DSCR binds', dscrRun.debt.sizingBinding, 'dscr');
near('sculpted to exactly 1.35x', dscrRun.debt.dscrMin, 1.35, 1e-9);
var pv = 0, r1 = 0.075;
dscrRun.rows.slice(0, 15).forEach(function (row, i) { pv += row.cfads / 1.35 / Math.pow(1 + r1, i + 1); });
near('the loan is the present value of CFADS / 1.35 at the loan rate', dscrRun.debt.amount, pv, 1e-6);
var level = E.run(site({ debt: { sizing: 'dscr', shape: 'level' } }));
var lds = level.rows.slice(0, 15).map(function (r) { return r.debtService; });
ok('a level loan pays the same every year', Math.max.apply(null, lds) - Math.min.apply(null, lds) < 1e-9, lds);
near('DSCR-sized level debt: the thinnest year sits at 1.35x', level.debt.dscrMin, 1.35, 1e-9);
ok('a level loan supports less debt than a sculpted one at the same floor', level.debt.amount < dscrRun.debt.amount);
var levelLtc = E.run(site({ debt: { sizing: 'ltc', ltcPct: 40, shape: 'level', ratePct: 6, tenorYears: 10 } }));
near('level LTC payment is the annuity', levelLtc.rows[0].debtService, 600000 * 0.06 / (1 - Math.pow(1.06, -10)), 1e-6);
var heavy = E.run(site({ debt: { sizing: 'ltc', ltcPct: 95, tenorYears: 10 } }));
ok('an LTC that breaches the floor is modelled and flagged', heavy.debt.dscrMin < 1.35 && codes(heavy).indexOf('DSCR_BELOW_MIN') >= 0);
var noCash = E.run(site({ revenue: { ppa: { rate1: 0.01 } }, debt: { sizing: 'dscr' } }));
ok('cash that covers no debt gives no debt, and says so', noCash.ok && noCash.debt.amount === 0 &&
  noCash.metrics.levered === false && codes(noCash).indexOf('DEBT_NOT_SUPPORTED') >= 0);
var cfadsOk = ltcRun.rows.every(function (r) {
  return Math.abs(r.cfads - (r.ebitda + r.reserveInterest - r.equipReserve - r.bessReserve - r.replacementFromCash)) < 1e-6;
});
ok('CFADS is EBITDA + reserve interest - reserve deposits every year', cfadsOk);

/* The review's case: a 28c PPA (about Topanga's levelized price) sized on
   a 1.25x DSCR over 20 years at 6.5% would lend 118% of installed cost,
   leaving negative equity, no IRR and a payback of zero. */
var strong = E.run(site({ revenue: { ppa: { rate1: 0.28 } }, debt: { sizing: 'dscr', tenorYears: 20, ratePct: 6.5, dscrMin: 1.25 } }));
ok('DSCR sizing on strong cash stops at 90% of installed cost and says the cap binds',
  strong.debt.sizingBinding === 'cap' && Math.abs(strong.debt.amount - 1350000) < 1e-6 &&
  strong.debt.dscrCapacity > strong.capex.total && strong.debt.ceilingCapacity === 1350000, strong.debt);
ok('so the equity is positive and the IRR and payback are real numbers',
  strong.sourcesUses.equity > 0 && strong.metrics.afterTaxIrr !== null && strong.metrics.paybackYears > 0, strong.metrics);
ok('the capped loan is named in a warning and in the assumptions', warning(strong, 'DEBT_CAPPED') &&
  /118% of installed cost/.test(warning(strong, 'DEBT_CAPPED').text) &&
  strong.assumptions.some(function (a) { return /capped at 90% of installed cost/.test(a); }));
ok('a capped sculpted loan covers more than its floor', strong.debt.dscrMin > 1.25, strong.debt.dscrMin);
var ltc95 = E.run(site({ debt: { sizing: 'ltc', ltcPct: 95 } }));
ok('an entered 95% loan-to-cost is capped at 90% too', ltc95.debt.sizingBinding === 'cap' &&
  Math.abs(ltc95.debt.amount - 1350000) < 1e-6 && /A 95% loan-to-cost/.test(warning(ltc95, 'DEBT_CAPPED').text));
ok('a loan under the ceiling raises no cap', codes(ltcRun).indexOf('DEBT_CAPPED') < 0 && codes(dscrRun).indexOf('DEBT_CAPPED') < 0);
/* The worst case for equity: 100% loan-to-cost, nothing else in the uses,
   cash strong enough for any DSCR. */
var equityOk = [], equityBad = [];
['min', 'ltc', 'dscr'].forEach(function (sizing) {
  ['sculpted', 'level'].forEach(function (shape) {
    [0.2, 0.28, 0.45].forEach(function (ppa) {
      var r = E.run(site({ revenue: { ppa: { rate1: ppa } }, reserves: { wcMonths: 0 },
        debt: { sizing: sizing, shape: shape, ltcPct: 100, dscrMin: 1, feePct: 0, dsraMonths: 0, tenorYears: 20, ratePct: 5 } }));
      var tag = sizing + '/' + shape + '/' + ppa;
      if (r.ok && r.sourcesUses.equity >= 0.1 * r.capex.total - 1e-6 && r.debt.amount <= 0.9 * r.capex.total + 1e-6 &&
          Math.abs(r.sourcesUses.equity + r.sourcesUses.debt - r.sourcesUses.totalUses) < 1e-6) equityOk.push(tag);
      else equityBad.push(tag);
    });
  });
});
ok('equity is positive in every sizing mode and shape (' + equityOk.length + ' runs)', equityBad.length === 0, equityBad);

/* A pack replacement paid from cash in year 10 turns that year's CFADS
   negative: a sculpted loan takes nothing and capitalises the interest. */
function dryYear(debt) {
  return bessOnly({ bess: { sizing: { schedule: sizingSchedule(20, 250000, 3, 0, 0), replacements: [{ year: 10, cost: 300000 }] } },
                    bessReplacement: { mode: 'expense' }, opex: { lines: [{ id: 'om', label: 'O&M', perYear: 10000 }] }, debt: debt });
}
var dry = E.run(dryYear({ sizing: 'min' }));
ok('the fixture: year 10 has negative CFADS and the sculpted loan takes nothing',
  dry.rows[9].cfads < 0 && dry.rows[9].debtService === 0 && dry.debt.shape === 'sculpted', dry.rows[9]);
ok('that year is a breach at 0x in the row and in the minimum, not skipped',
  dry.rows[9].dscr === 0 && dry.debt.dscrMin === 0 && dry.metrics.dscrMin === 0, dry.debt.dscrMin);
near('the average leaves the unserviced year out: the sculpted ratio of the others', dry.debt.dscrAvg, dry.rows[0].dscr, 1e-9);
near('the interest that year is added to the balance', dry.rows[9].principal, -dry.rows[9].interest, 1e-9);
near('and the loan still repays', sum(col(dry, 'principal')), dry.debt.amount, 1e-6);
ok('the breach is flagged, naming the year and the capitalised interest',
  codes(dry).indexOf('DSCR_BELOW_MIN') >= 0 && /^In year 10 .*sculpted loan takes nothing/.test(warning(dry, 'NEGATIVE_CFADS').text) &&
  warning(dry, 'NEGATIVE_CFADS').text.indexOf(money(dry.rows[9].interest)) >= 0, warning(dry, 'NEGATIVE_CFADS'));
var dryLevel = E.run(dryYear({ sizing: 'ltc', shape: 'level' }));
ok('a level loan in the same year shows the negative ratio as the minimum and says the owner pays',
  dryLevel.rows[9].dscr < 0 && dryLevel.debt.dscrMin === dryLevel.rows[9].dscr &&
  /from equity/.test((warning(dryLevel, 'NEGATIVE_CFADS') || {}).text || ''), dryLevel.debt);
ok('positive cash in every loan year raises no breach', codes(ltcRun).indexOf('NEGATIVE_CFADS') < 0 &&
  codes(E.run(dryYear({ sizing: 'min', tenorYears: 9 }))).indexOf('NEGATIVE_CFADS') < 0);

section('tax appetite: NOLs and the §38(c) credit limit');
var nol = E.run(site({ tax: { appetite: 'nol' } }));
var limitOk = nol.rows.every(function (r) {
  return r.itc <= Math.max(0, r.fedTax - 0.25 * Math.max(0, r.fedTax - 25000)) + 1e-6;
});
ok('the credit never offsets more than §38(c) allows', limitOk);
near('credit used + carried + lapsed = the credit', nol.tax.itc.used + nol.tax.itc.carriedForward + nol.tax.itc.expired,
  nol.tax.itc.face, 1e-6);
ok('no tax is negative without appetite', nol.rows.every(function (r) { return r.fedTax >= 0 && r.stateTax >= 0; }));
var nolUse = nol.rows.every(function (r, i) {
  if (r.fedTaxableIncome <= 0) return true;
  var prior = i ? nol.rows[i - 1].nolFederal : 0, used = Math.min(prior, 0.8 * r.fedTaxableIncome);
  return Math.abs(r.fedTax - 0.21 * (r.fedTaxableIncome - used)) < 1e-6;
});
ok('federal losses offset at most 80% of a later year\'s income', nolUse);
ok('a standalone owner is paid its after-tax cash', nol.rows.every(function (r) { return Math.abs(r.distribution - r.afterTaxCash) < 1e-9; }));
ok('without appetite the returns are lower than with it', nol.metrics.afterTaxIrr < E.run(site()).metrics.afterTaxIrr);
var noStateNol = E.run(site({ tax: { appetite: 'nol', stateNol: false } }));
ok('state losses not carried: state tax is the rate on positive income only',
  noStateNol.rows.every(function (r) { return Math.abs(r.stateTax - 0.0884 * Math.max(0, r.stateTaxableIncome)) < 1e-6; }));
var lapse = E.run(solarOnly({ years: 30, revenue: { ppa: { rate1: 0.05 } }, tax: { appetite: 'nol' } }));
ok('a credit the income cannot absorb lapses after 20 years', lapse.tax.itc.expired > 0 && lapse.rows[21].itcCarryforward === 0,
  lapse.tax.itc);
ok('and the warning says how much', /lapses unused/.test((warning(lapse, 'ITC_CARRYFORWARD') || {}).text || ''));
var sold = E.run(site({ tax: { appetite: 'nol', itc: { monetization: 'transfer', transferPrice: 0.9 } } }));
near('a transferred credit is cash in year 1 at the price', sold.rows[0].itc, sold.tax.itc.face * 0.9, 1e-6);
near('but the haircut still uses the full credit', sold.tax.haircut, sold.tax.itc.face / 2, 1e-6);
ok('and nothing is carried', sold.tax.itc.carriedForward === 0 && codes(sold).indexOf('ITC_CARRYFORWARD') < 0);
ok('a sale uses the whole credit; the cash is the face at the price',
  sold.tax.itc.used === sold.tax.itc.face && Math.abs(sold.tax.itc.cash - 0.9 * sold.tax.itc.face) < 1e-6);
var fullSold = E.run(site({ tax: { itc: { monetization: 'transfer' } } }));
near('full appetite + transfer: the investor is paid pre-tax cash plus the sale', fullSold.metrics.year1Distribution,
  fullSold.rows[0].preTaxCash + fullSold.rows[0].itc, 1e-6);

section('IRR and payback');
near('irr of [-100, 110] is 10%', E.irr([-100, 110]), 0.1, 1e-12);
var i2 = E.irr([-100, 60, 60]);
near('NPV is zero at the IRR', -100 + 60 / (1 + i2) + 60 / Math.pow(1 + i2, 2), 0, 1e-9);
near('a loss-making flow has a negative IRR', E.irr([-100, 50]), -0.5, 1e-12);
near('a 400% IRR is found', E.irr([-1, 5]), 4, 1e-9);
eq('no sign change: all positive -> null', E.irr([100, 10, 10]), null);
eq('no sign change: all negative -> null', E.irr([-100, -10]), null);
eq('all zero -> null', E.irr([0, 0, 0]), null);
eq('a non-finite flow -> null', E.irr([-100, NaN, 200]), null);
eq('not a list -> null', E.irr('x'), null);
var info = {}, mr = E.irr([-1000, 2310, -1330], info);
ok('two sign changes, two roots: flagged', info.multiple === true && info.roots.length === 2 && info.signChanges === 2, info);
ok('both roots zero the NPV', info.roots.every(function (x) { return Math.abs(-1000 + 2310 / (1 + x) - 1330 / Math.pow(1 + x, 2)) < 1e-6; }));
ok('the root returned is the one nearest 10%', Math.abs(mr - 0.0916) < 0.001, mr);
var one = {};
E.irr([-100, 60, 60], one);
ok('a conventional flow has one root and no flag', one.multiple === false && one.roots.length === 1 && one.signChanges === 1);
near('payback [-100, 50, 50] is 2 years', E.payback([-100, 50, 50]), 2, 1e-12);
near('payback interpolates within the year', E.payback([-100, 60, 60]), 1 + 40 / 60, 1e-12);
eq('never paid back -> null', E.payback([-100, 10, 10]), null);
near('paid back, then undone by a later loss: payback is when it is paid back for good', E.payback([-100, 150, -100, 100]), 2.5, 1e-12);
eq('paid back and undone for good -> null', E.payback([-100, 150, -100, -10]), null);
eq('nothing to pay back -> 0', E.payback([0, 5]), 0);
eq('no flows -> null', E.payback([]), null);

section('battery revenue from the sizing schedule');
var sh = E.run(bessOnly());
var schedRows = bessOnly().bess.sizing.schedule;
ok('shared savings: the owner takes 80% of each year\'s net savings', sh.rows.every(function (r, i) {
  return Math.abs(r.bessRevenue - 0.8 * schedRows[i].netSavings) < 1e-6 && Math.abs(r.hostSavings - schedRows[i].netSavings) < 1e-6;
}));
var ho = E.run(bessOnly({ revenue: { bess: { mode: 'host-owned' } } }));
near('host-owned: all of it', ho.rows[5].bessRevenue, schedRows[5].netSavings, 1e-6);
var fx = E.run(bessOnly({ revenue: { bess: { mode: 'fixed', fixedPerKwMonth: 12, escalatorPct: 2 } } }));
near('fixed fee: $/kW-month x kW x 12', fx.rows[0].bessRevenue, 12 * 500 * 12, 1e-6);
near('escalating at its own rate', fx.rows[1].bessRevenue, 12 * 500 * 12 * 1.02, 1e-6);
var bundled = E.run(site({ bess: { sizing: { schedule: sizingSchedule(20, 40000, 3, 2, 0) } } }));
ok('bundled: the host keeps the savings, reported but not revenue',
  bundled.rows[0].bessRevenue === 0 && Math.abs(bundled.rows[0].hostSavings - 40000) < 1e-6 && bundled.revenue.hostSavingsY1 === 40000);
eq('savings revenue with no sizing is refused', fieldOf(E.run(bessOnly({ bess: { sizing: null } })))[0], 'bess.sizing');
eq('a schedule shorter than the term is refused', fieldOf(E.run(bessOnly({ years: 25 }))).join(), 'bess.sizing.schedule');
var shortBundled = E.run(site({ years: 25, bess: { sizing: { schedule: sizingSchedule(20, 40000, 3, 2, 0) } } }));
ok('bundled with a short schedule still runs and says so', shortBundled.ok && codes(shortBundled).indexOf('SIZING_TERM_SHORT') >= 0);
var pvCost = sh.year0.equity, pvDis = 0;
sh.rows.forEach(function (r, i) {
  var v = Math.pow(1.08, -(i + 1));
  pvCost += (r.revenue - r.afterTaxCash) * v;
  pvDis += 300000 * schedRows[i].soh * v;
});
near('LCOS: the owner\'s annual costs over discharge that falls with state of health', sh.metrics.lcosCents, pvCost / pvDis * 100, 1e-9);
ok('LCOS for storage alone, LCOE for anything with solar', sh.metrics.lcoeCents === null &&
  base.metrics.lcosCents === null && base.metrics.lcoeCents > 0);

section('battery replacement');
var none = E.run(bessOnly({ bessReplacement: { mode: 'none' } }));
var deposits = col(sh, 'bessReserve');
near('reserve: level deposits in years 1-14 add up to the replacement', sum(deposits.slice(0, 14)), 400000, 1e-6);
eq('and stop after it', sum(deposits.slice(14)), 0);
eq('the replacement is shown in its year', sh.rows[13].replacementCapex, 400000);
eq('paid from the reserve, not from the year\'s cash', sh.rows[13].replacementFromCash, 0);
near('it is new 5-year property from its year (20%, then 32%)',
  sh.rows[13].depreciationFed - none.rows[13].depreciationFed, 80000, 1e-6);
near('and 32% of it the year after', sh.rows[14].depreciationFed - none.rows[14].depreciationFed, 128000, 1e-6);
var ex = E.run(bessOnly({ bessReplacement: { mode: 'expense' } }));
eq('expense: paid from that year\'s cash', ex.rows[13].replacementFromCash, 400000);
near('which is where the pre-tax cash drops', ex.rows[13].preTaxCash - none.rows[13].preTaxCash, -400000, 1e-6);
ok('excluding it lifts the returns and is flagged', none.metrics.afterTaxIrr > sh.metrics.afterTaxIrr &&
  codes(none).indexOf('BESS_REPLACEMENT_EXCLUDED') >= 0);
var two = E.run(bessOnly({ bess: { sizing: { replacements: [{ year: 8, cost: 300000 }, { year: 16, cost: 350000 }] } } }));
near('a second replacement is saved for from the one before', two.rows[8].bessReserve, 350000 / 8, 1e-6);

section('reserves (SAM)');
var top = E.run(TOPANGA);
near('working-capital reserve at close: 3 months of year-1 opex', top.sourcesUses.uses.filter(function (u) {
  return u.key === 'reserve'; })[0].amount, 22001 / 4, 1e-6);
near('released in the final year', top.rows[27].wcFunding, -22001 * Math.pow(1.025, 27) / 4, 1e-6);
near('equipment deposit: $0.10/W x 315,000 W x 1.025^14 / 15', top.rows[0].equipReserve, 0.1 * 315000 * Math.pow(1.025, 14) / 15, 1e-6);
near('the inverter replacement in year 15 at its inflated cost', top.rows[14].replacementCapex, 0.1 * 315000 * Math.pow(1.025, 14), 1e-6);
eq('no deposit for a cycle ending after year 28', top.rows[15].equipReserve, 0);
near('reserve interest on last year\'s balances: 1.75% x the year-0 working-capital reserve', top.rows[0].reserveInterest,
  0.0175 * 22001 / 4, 1e-9);
var twoCycles = E.run(solarOnly({ years: 30 }));
near('a second 15-year cycle ending in year 30 is funded at its own inflated cost',
  twoCycles.rows[15].equipReserve, 0.1 * 500000 * Math.pow(1.025, 29) / 15, 1e-6);

section('demand response, EV charging, other revenue');
var dr = E.run(site({ revenue: { dr: { perYear: 25000 } } })), noDr = E.run(site());
ok('DR not in the base: shown in its column, left out of revenue, flagged as upside', dr.rows[0].drRevenue === 25000 &&
  dr.rows[0].revenue === noDr.rows[0].revenue && dr.revenue.year1.dr === 25000 &&
  codes(dr).indexOf('DR_UPSIDE') >= 0 && dr.revenue.drInBase === false);
near('and the returns ignore it', dr.metrics.afterTaxIrr, noDr.metrics.afterTaxIrr, 1e-12);
var drIn = E.run(site({ revenue: { dr: { perYear: 25000, perKwYear: 20, inBase: true } } }));
near('DR in the base: $/yr plus $/kW-yr on the battery kW', drIn.rows[0].drRevenue, 25000 + 20 * 250, 1e-9);
ok('counted in revenue and returns', drIn.metrics.afterTaxIrr > dr.metrics.afterTaxIrr && codes(drIn).indexOf('DR_UPSIDE') < 0);
var evr = E.run(site({ ev: { kw: 150 }, revenue: { ev: { perKwYear: 80, escalatorPct: 1 } } }));
near('EV revenue is $/kW-yr x charger kW', evr.rows[0].evRevenue, 12000, 1e-9);
near('escalating at its own rate', evr.rows[1].evRevenue, 12120, 1e-9);
var oth = E.run(site({ revenue: { other: [{ label: 'Rent', perYear: 1000, escalatorPct: 10 }] } }));
near('other revenue escalates line by line', oth.rows[2].otherRevenue, 1210, 1e-9);

section('levelized price and availability');
var gross = E.run(site({ solar: { availabilityLossPct: 0 } })), lossy = E.run(site({ solar: { availabilityLossPct: 2 } }));
near('an availability loss cuts revenue 2%', lossy.rows[0].ppaRevenue, gross.rows[0].ppaRevenue * 0.98, 1e-6);
near('but the levelized PPA price stays a price', lossy.metrics.lppaCents, gross.metrics.lppaCents, 1e-9);
ok('while LCOE per kWh sold rises', lossy.metrics.lcoeCents > gross.metrics.lcoeCents);
var flat = E.run(site({ solar: { degradationPct: 0 }, revenue: { ppa: { escalatorPct: 0 } } }));
near('a flat price with flat output levelizes to itself', flat.metrics.lppaCents, 20, 1e-9);

section('warnings');
var cliffRun = E.run(site({ project: { bocMonth: '2026-09', pisMonth: '2028-02' } }));
ok('solar begun after July 4, 2026 and in service in 2028: critical, and its credit is zero',
  warning(cliffRun, 'SOLAR_CLIFF') && warning(cliffRun, 'SOLAR_CLIFF').level === 'critical' &&
  cliffRun.tax.itc.byAsset.solar.amount === 0 && cliffRun.tax.itc.byAsset.storage.amount > 0);
eq('critical warnings come first', cliffRun.warnings[0].level, 'critical');
var risk = E.run(site({ project: { bocMonth: '2027-02', pisMonth: '2027-10' } }));
ok('begun after the cutoff but in service by 2027: a warning, and a slip case in the sensitivities',
  warning(risk, 'SOLAR_CLIFF').level === 'warn' && sens(risk, 'itcSlip') !== null);
var slipDirect = E.run(site({ project: { bocMonth: '2027-02', pisMonth: '2028-01' } }));
near('the slip case is the same project placed in service in 2028', sens(risk, 'itcSlip').afterTaxIrr,
  slipDirect.metrics.afterTaxIrr, 1e-12);
ok('the warning quotes the slip case\'s IRR', warning(risk, 'SOLAR_CLIFF').text.indexOf((slipDirect.metrics.afterTaxIrr * 100).toFixed(2)) >= 0);
var grand = E.run(site({ project: { bocMonth: '2026-06', pisMonth: '2029-03' } }));
ok('begun by July 2026, in service after 2027: the grandfather and its safe harbor are named',
  /December 31, 2030/.test((warning(grand, 'SOLAR_BOC_GRANDFATHER') || {}).text || '') && codes(grand).indexOf('SOLAR_CLIFF') < 0);
ok('safe dates raise neither', codes(E.run(site())).indexOf('SOLAR_CLIFF') < 0);
[[2026, '40%', '55%'], [2027, '45%', '60%']].forEach(function (y) {
  var w = warning(E.run(site({ project: { bocMonth: y[0] + '-02', pisMonth: '2027-11' } })), 'FEOC');
  ok('FEOC for ' + y[0] + ' starts: solar ' + y[1] + ', storage ' + y[2],
    w && w.level === 'warn' && w.text.indexOf(y[1] + ' for solar') >= 0 && w.text.indexOf(y[2] + ' for storage') >= 0, w);
});
[[2028, '65%'], [2029, '70%'], [2030, '75%'], [2032, '75%']].forEach(function (y) {
  var w = warning(E.run(bessOnly({ project: { bocMonth: y[0] + '-02', pisMonth: y[0] + '-11' } })), 'FEOC');
  ok('FEOC for ' + y[0] + ' storage starts: ' + y[1], w && w.text.indexOf(y[1] + ' for storage') >= 0, w);
});
eq('construction begun in 2025 predates FEOC', codes(E.run(site({ project: { bocMonth: '2025-11' } }))).indexOf('FEOC'), -1);
eq('an attestation turns FEOC into a note', warning(E.run(site({ tax: { itc: { feocAttested: true } } })), 'FEOC').level, 'info');
var ev = E.run(site({ ev: { kw: 100 }, capex: { lines: [
  { id: 'solar', label: 'Solar', amount: 1000000, asset: 'solar' },
  { id: 'bess', label: 'Storage', amount: 500000, asset: 'storage' },
  { id: 'ev', label: 'Chargers', amount: 90000, asset: 'ev', itcEligible: 1 },
  { id: 'roof', label: 'Roof', amount: 200000, asset: 'roof', itcEligible: 1 },
  { id: 'ctl', label: 'Controller', amount: 50000, asset: 'controller', itcEligible: 1 }] } }));
ok('EV: §30C is over, and an eligible share entered on a charger is ignored',
  warning(ev, 'EV_NO_CREDIT').level === 'warn' && ev.capex.lines[2].itc === 0);
ok('a roof marked eligible earns nothing and is flagged', codes(ev).indexOf('ROOF_INELIGIBLE') >= 0 && ev.capex.lines[3].itc === 0);
var roofAsEnergy = E.run(site({ capex: { lines: [
  { id: 'solar', label: 'Solar', amount: 1000000, asset: 'solar' },
  { id: 'roof', label: 'Roof', amount: 200000, asset: 'roof', itcEligible: 1, depClass: 'energy' }] } }));
ok('even filed under energy property a roof earns nothing',
  roofAsEnergy.capex.lines[1].itc === 0 && roofAsEnergy.capex.lines[1].itcBasis === 0 && codes(roofAsEnergy).indexOf('ROOF_INELIGIBLE') >= 0);
var evAsEnergy = E.run(site({ ev: { kw: 100 }, capex: { lines: [
  { id: 'solar', label: 'Solar', amount: 1000000, asset: 'solar' },
  { id: 'ev', label: 'Chargers', amount: 90000, asset: 'ev', itcEligible: 1, depClass: 'macrs5' }] } }));
eq('and nor does a charger filed as 5-year property', evAsEnergy.capex.lines[1].itc, 0);
ok('a controller counted eligible takes the storage rate and asks for the integral test',
  codes(ev).indexOf('CONTROLLER_INTEGRAL') >= 0 && ev.capex.lines[4].itcRatePct === 30);
eq('EV with no credit claimed is only a note', warning(E.run(site({ ev: { kw: 100 } })), 'EV_NO_CREDIT').level, 'info');
ok('October in service under half-year: mid-quarter warning', codes(risk).indexOf('MID_QUARTER') >= 0);
ok('June does not', codes(E.run(site())).indexOf('MID_QUARTER') < 0);
var pwa = E.run(site({ solar: { kwDc: 1500, kwAc: 1200 }, bess: { kw: 1000 }, tax: { itc: { solar: { pwa: false }, storage: { pwa: false } } } }));
ok('1 MW or more without PWA: 6% and a warning for each asset',
  codes(pwa).filter(function (c) { return c === 'PWA'; }).length === 2 && pwa.tax.itc.byAsset.solar.ratePct === 6);
var li = E.run(site({ tax: { itc: { solar: { lowIncome: 10 }, storage: { lowIncome: 10 } } } }));
eq('low-income: the solar needs an allocation, the storage entry is ignored',
  codes(li).filter(function (c) { return c === 'LOW_INCOME'; }).length, 2);
eq('phase-down from 2034 is a warning', warning(E.run(bessOnly({ project: { bocMonth: '2034-05', pisMonth: '2035-01' } })), 'STORAGE_PHASEDOWN').level, 'warn');
eq('and 2036 critical', warning(E.run(bessOnly({ project: { bocMonth: '2036-05', pisMonth: '2037-01' } })), 'STORAGE_PHASEDOWN').level, 'critical');
ok('a tax-exempt host is told to use a PPA, not a lease', codes(E.run(site({ project: { hostTaxExempt: true } }))).indexOf('TAX_EXEMPT_HOST') >= 0);
ok('a transfer notes the SFE bar', codes(sold).indexOf('TRANSFER_SFE') >= 0);
ok('a battery sized by hand is flagged', codes(E.run(site())).indexOf('NO_SIZING') >= 0 && codes(sh).indexOf('NO_SIZING') < 0);
ok('a battery resized after sizing is flagged', codes(E.run(bessOnly({ bess: { kw: 600 } }))).indexOf('SIZING_MISMATCH') >= 0);
ok('no state: no state tax, and it says so', codes(E.run(site({ project: { state: '' } }))).indexOf('STATE_TAX_MISSING') >= 0);
eq('the state rate comes from the table', E.run(site({ project: { state: 'NY' } })).tax.statePct, 6.5);
/* A 90%-levered battery that collects its credit up front and then bleeds
   cash: the after-tax flow turns positive and back, and has two IRRs. */
function bleeder(appetite) {
  return {
    years: 15, project: { name: 'Bleeder', state: 'TX' },
    bess: { kw: 500, kwh: 2000 },
    capex: { lines: [{ id: 'b', label: 'Battery', amount: 1000000, asset: 'storage' }] },
    revenue: { bess: { mode: 'fixed', fixedPerKwMonth: 1 } },
    opex: { lines: [{ perYear: 60000 }] },
    reserves: { wcMonths: 0 },
    tax: { appetite: appetite, itc: { monetization: 'transfer', transferPrice: 1, storage: { energyCommunity: true, domesticContent: true } } },
    debt: { sizing: 'ltc', ltcPct: 90, shape: 'level', tenorYears: 10, feePct: 0, dsraMonths: 0, ratePct: 5 }
  };
}
var twin = E.run(bleeder('full')), twinInfo = {};
E.irr([-twin.year0.equity].concat(col(twin, 'afterTaxCash')), twinInfo);
ok('two IRRs in a real run: flagged, with both roots named',
  twinInfo.roots.length === 2 && warning(twin, 'MULTIPLE_IRR') &&
  twinInfo.roots.every(function (x) { return warning(twin, 'MULTIPLE_IRR').text.indexOf((x * 100).toFixed(1) + '%') >= 0; }), twinInfo);
var never = E.run(bleeder('nol'));
ok('a project that never pays back has no IRR and no payback, and nothing breaks',
  never.ok && never.metrics.afterTaxIrr === null && never.metrics.paybackYears === null &&
  never.metrics.irrBuild.total === null && allFinite(never, 'result') === null);
ok('every warning is one plain sentence with a level and a code', [cliffRun, risk, ev, pwa, li, sh, twin, E.run(TAFT)].every(function (r) {
  return r.warnings.every(function (w) {
    return ['critical', 'warn', 'info'].indexOf(w.level) >= 0 && /^[A-Z_]+$/.test(w.code) &&
      /\.$/.test(w.text) && w.text.indexOf('\n') < 0 && !/undefined|NaN|null/.test(w.text);
  });
}));

section('a blended cost line split between solar and storage');
/* One installed cost for solar and storage, as the reference decks enter
   it, with rates that differ (storage in an energy community). The system
   at preset costs: 500 kW DC x $2.40/W = $1.2M against 1,000 kWh x $400 +
   250 kW x $250 = $462,500. */
var ALL_IN = { capex: { lines: [{ id: 'x', label: 'All in', amount: 1500000, asset: 'blended' }] },
               tax: { itc: { storage: { energyCommunity: true } } } };
var SYS_SHARE = 1200000 / (1200000 + 462500);
var allIn = E.run(site(ALL_IN));
ok('a single blended line between two different rates runs instead of being refused', allIn.ok === true, allIn.errors);
eq('and validate() agrees', E.validate(site(ALL_IN)).length, 0);
near('with nothing on the site to weigh it by, it is split by the system at preset costs',
  allIn.capex.lines[0].solarSharePct, SYS_SHARE * 100, 1e-9);
near('its rate is the two rates weighted by that split', allIn.capex.lines[0].itcRatePct, SYS_SHARE * 30 + (1 - SYS_SHARE) * 40, 1e-9);
near('and so is its credit', allIn.tax.itc.face, 1500000 * 0.9 * (SYS_SHARE * 0.3 + (1 - SYS_SHARE) * 0.4), 1e-6);
ok('the stand-in split is a warning that names it and asks for the real one',
  warning(allIn, 'BLENDED_SPLIT').level === 'warn' && /72% solar and 28% storage/.test(warning(allIn, 'BLENDED_SPLIT').text) &&
  /enter the solar share/.test(warning(allIn, 'BLENDED_SPLIT').text), warning(allIn, 'BLENDED_SPLIT'));
var entered = E.run(site(merge(ALL_IN, { capex: { lines: [{ id: 'x', label: 'All in', amount: 1500000, asset: 'blended', solarSharePct: 25 }] } })));
near('a solar share entered on the line replaces it', entered.capex.lines[0].itcRatePct, 0.25 * 30 + 0.75 * 40, 1e-9);
ok('and needs no note', codes(entered).indexOf('BLENDED_SPLIT') < 0);
var sizedSplit = E.run(site(merge(ALL_IN, { bess: { sizing: { settings: { capexPerKwh: 300, capexPerKw: 0 } } } })));
near('the battery costs the sizing run was made at are used when it carries them', sizedSplit.capex.lines[0].solarSharePct,
  1200000 / (1200000 + 300000) * 100, 1e-9);
var withLines = E.run(site({ capex: { lines: [
  { id: 'solar', label: 'Solar', amount: 1000000, asset: 'solar' }, { id: 'bess', label: 'Storage', amount: 500000, asset: 'storage' },
  { id: 'cont', label: 'Contingency', amount: 75000, asset: 'blended' }] }, tax: { itc: { storage: { energyCommunity: true } } } }));
near('beside solar and storage lines it takes their weights, as before', withLines.capex.lines[2].itcRatePct,
  (1000000 * 30 + 500000 * 40) / 1500000, 1e-9);
ok('and needs no note', codes(withLines).indexOf('BLENDED_SPLIT') < 0);
var soloShare = E.run(solarOnly({ capex: { lines: [{ id: 's', label: 'Solar', amount: 1000000, asset: 'solar' },
  { id: 'c', label: 'Contingency', amount: 50000, asset: 'blended', solarSharePct: 40 }] } }));
ok('on a site with one asset a blended line is that asset, whatever share it carries',
  soloShare.capex.lines[1].solarSharePct === 100 && soloShare.capex.lines[1].itcRatePct === 30);
var pastIn = E.run(site(merge(ALL_IN, { project: { bocMonth: '2026-09', pisMonth: '2028-03' } })));
ok('past the solar deadline the deck-shaped input runs: solar at 0%, the storage share keeps its credit',
  pastIn.ok && warning(pastIn, 'SOLAR_CLIFF').level === 'critical' &&
  Math.abs(pastIn.capex.lines[0].itcRatePct - (1 - SYS_SHARE) * 40) < 1e-9 && pastIn.tax.itc.face > 0, pastIn.errors || pastIn.capex.lines[0]);
var atRisk = E.run(site({ project: { bocMonth: '2027-02', pisMonth: '2027-10' },
  capex: { lines: [{ id: 'x', label: 'Installed cost', amount: 1500000, asset: 'blended' }] } }));
var atRiskSlipped = E.run(site({ project: { bocMonth: '2027-02', pisMonth: '2028-01' },
  capex: { lines: [{ id: 'x', label: 'Installed cost', amount: 1500000, asset: 'blended' }] } }));
ok('at risk, the slip case the research asks for is in the sensitivities', sens(atRisk, 'itcSlip') !== null,
  atRisk.sensitivity.map(function (s) { return s.key; }));
near('and it is the same project placed in service in 2028', sens(atRisk, 'itcSlip').afterTaxIrr, atRiskSlipped.metrics.afterTaxIrr, 1e-12);
ok('the deadline warning quotes it', warning(atRisk, 'SOLAR_CLIFF').text.indexOf((atRiskSlipped.metrics.afterTaxIrr * 100).toFixed(2)) >= 0);
ok('equal base rates make the split moot, so the note is only a note, about the slip case',
  warning(atRisk, 'BLENDED_SPLIT').level === 'info' && /slip case/.test(warning(atRisk, 'BLENDED_SPLIT').text));
var allStorage = E.run(site(merge(ALL_IN, { project: { bocMonth: '2026-09', pisMonth: '2028-03' },
  capex: { lines: [{ id: 'x', label: 'All in', amount: 1500000, asset: 'blended', solarSharePct: 0 }] } })));
ok('a blended line entered as all storage makes no solar claim, so the solar deadline does not apply to it',
  codes(allStorage).indexOf('SOLAR_CLIFF') < 0 && allStorage.capex.lines[0].itcRatePct === 40);

section('a battery-only project hears nothing about solar');
var batteryRuns = [
  bessOnly({ project: { bocMonth: '', pisMonth: '' } }),
  bessOnly({ project: { bocMonth: '2027-03', pisMonth: '' } }),
  bessOnly({ project: { bocMonth: '2034-05', pisMonth: '2035-01' } }),
  bessOnly({ project: { bocMonth: '2036-05', pisMonth: '2037-01' } }),
  bessOnly({ project: { bocMonth: '2027-03', pisMonth: '2027-11' }, revenue: { bess: { mode: 'fixed', fixedPerKwMonth: 20 } },
             debt: { sizing: 'min' }, tax: { itc: { feocAttested: true } } }),
  bessOnly({ bess: { kw: 1500, kwh: 6000, sizing: null }, ev: { kw: 100 }, revenue: { bess: { mode: 'fixed', fixedPerKwMonth: 20 } },
             capex: { lines: [{ id: 'b', label: 'Battery', amount: 3000000, asset: 'storage' },
                              { id: 'c', label: 'Controller', amount: 50000, asset: 'controller', itcEligible: 1 },
                              { id: 'i', label: 'Interconnection', amount: 80000, asset: 'interconnection' },
                              { id: 'x', label: 'Contingency', amount: 100000, asset: 'blended' }] },
             tax: { appetite: 'nol', itc: { storage: { pwa: false, lowIncome: 10, ratePctOverride: 36 } } } }),
  bessOnly({ tax: { itc: { monetization: 'transfer' } }, bessReplacement: { mode: 'none' }, revenue: { dr: { perYear: 10000 } } }),
  dryYear({ sizing: 'min' }), dryYear({ sizing: 'ltc', ltcPct: 95, shape: 'level' }), bleeder('full'), bleeder('nol')
];
var solarWords = [];
batteryRuns.forEach(function (input, i) {
  var r = E.run(input);
  if (!r.ok) { solarWords.push('run ' + i + ' refused: ' + JSON.stringify(r.errors)); return; }
  r.warnings.concat(r.assumptions.map(function (a) { return { code: 'assumption', text: a }; }),
    r.sensitivity.map(function (s) { return { code: 'sensitivity', text: s.label }; })).forEach(function (w) {
    if (/\bsolar\b|\bPV\b/i.test(w.text)) solarWords.push('run ' + i + ' ' + w.code + ': ' + w.text);
  });
});
ok('no warning, assumption or sensitivity of ' + batteryRuns.length + ' battery-only runs mentions solar', solarWords.length === 0, solarWords);
eq('without dates, a battery is told only what it claims', (warning(E.run(batteryRuns[0]), 'TIMING_MISSING') || {}).text,
  'Without a beginning-of-construction month the model cannot test the FEOC threshold year or the storage phase-down, ' +
  'so the credits shown assume both are met.');
eq('a battery needs no in-service month for its credit tests', codes(E.run(batteryRuns[1])).indexOf('TIMING_MISSING'), -1);
eq('solar and storage without dates still hear all three', (warning(E.run(site({ project: { bocMonth: '', pisMonth: '' } })), 'TIMING_MISSING') || {}).text,
  'Without beginning-of-construction and placed-in-service months the model cannot test the solar in-service deadline, ' +
  'the FEOC threshold year or the storage phase-down, so the credits shown assume all three are met.');
eq('with a construction start, only the solar deadline waits on the in-service month',
  (warning(E.run(site({ project: { bocMonth: '2027-01', pisMonth: '' } })), 'TIMING_MISSING') || {}).text,
  'Without a placed-in-service month the model cannot test the solar in-service deadline, so the credits shown assume it is met.');
ok('every new warning is one plain sentence with a level and a code', [strong, ltc95, dry, dryLevel, allIn, pastIn, atRisk].every(function (r) {
  return r.warnings.every(function (w) {
    return ['critical', 'warn', 'info'].indexOf(w.level) >= 0 && /^[A-Z_]+$/.test(w.code) &&
      /\.$/.test(w.text) && w.text.indexOf('\n') < 0 && !/undefined|NaN|null|Infinity/.test(w.text);
  });
}));

section('sensitivities');
var sen = E.run(site({ tax: { itc: { monetization: 'transfer' } }, bess: { sizing: { schedule: sizingSchedule(20, 40000, 3, 2, 0) } },
                     revenue: { bess: { mode: 'shared-savings' } } }));
eq('capex, PPA, production, savings and transfer price, each both ways',
  sen.sensitivity.map(function (s) { return s.key; }).join(),
  'capex-10,capex+10,ppa-10,ppa+10,production-5,production+5,savings-10,savings+10,transfer88,transfer93');
ok('cheaper capex, a better price and more output all raise the IRR',
  sens(sen, 'capex-10').delta > 0 && sens(sen, 'capex+10').delta < 0 && sens(sen, 'ppa+10').delta > 0 &&
  sens(sen, 'production+5').delta > 0 && sens(sen, 'savings+10').delta > 0 && sens(sen, 'transfer93').delta > 0);
near('delta is the change from the base IRR', sens(sen, 'capex-10').delta,
  sens(sen, 'capex-10').afterTaxIrr - sen.metrics.afterTaxIrr, 1e-15);
var feeSens = E.run(bessOnly({ revenue: { bess: { mode: 'fixed', fixedPerKwMonth: 20 } } }));
eq('a fixed-fee battery flexes its fee', feeSens.sensitivity.map(function (s) { return s.key; }).join(),
  'capex-10,capex+10,bessRevenue-10,bessRevenue+10');

section('inputs: defaults, reading, refusal');
var D = E.defaults();
eq('defaults carry the contract\'s top-level fields', Object.keys(D).join(),
  'years,project,solar,bess,ev,controller,capex,allocation,revenue,opex,reserves,bessReplacement,tax,debt,discountPct,inflationPct');
eq('SAM\'s split adds to 100', D.allocation.macrs5 + D.allocation.macrs15 + D.allocation.sl15 + D.allocation.sl20 + D.allocation.none, 100);
ok('optional blocks default absent and derived values unset', D.solar === null && D.debt === null && D.tax.statePct === null &&
  D.reserves.equipment.watts === null);
eq('the debt block starts at 45% / 7.5% / 15 yr / 1.35x', [E.defaults('debt').ltcPct, E.defaults('debt').ratePct,
  E.defaults('debt').tenorYears, E.defaults('debt').dscrMin].join(), '45,7.5,15,1.35');
ok('legal line defaults: roof, chargers and a campus controller earn no credit',
  E.defaults('lines').roof.itcEligible === 0 && E.defaults('lines').ev.itcEligible === 0 && E.defaults('lines').controller.itcEligible === 0);
D.years = 99;
eq('defaults() hands out a copy', E.defaults().years, 25);
eq('an unknown block has no defaults', E.defaults('nope'), null);
var echo = E.run(site());
ok('the merged inputs are echoed with derived values resolved', echo.inputs.tax.statePct === 8.84 &&
  echo.inputs.reserves.equipment.watts === 500000 && echo.inputs.discountPct === 8 && echo.inputs.allocation.macrs7 === 0);
var strings = E.run(merge(site(), { years: '20', solar: { kwh1: '700000' }, revenue: { ppa: { rate1: '0.2' } }, tax: { bonusPct: '0' } }));
eq('numbers typed as strings read the same', strings.metrics.afterTaxIrr, E.run(site()).metrics.afterTaxIrr);
var frozen = JSON.stringify(TOPANGA);
E.run(TOPANGA);
eq('run() does not touch its input', JSON.stringify(TOPANGA), frozen);
eq('same inputs, same numbers', JSON.stringify(E.run(TAFT)), JSON.stringify(E.run(TAFT)));

function refused(name, input, field) {
  var r = E.run(input);
  ok(name + ' -> ' + field, r.ok === false && fieldOf(r).indexOf(field) >= 0, r.errors || r.ok);
}
refused('a project with no name', site({ project: { name: '' } }), 'project.name');
refused('a negative battery', site({ bess: { kw: -5 } }), 'bess.kw');
refused('a split that does not add to 100', site({ allocation: { macrs5: 90 } }), 'allocation');
refused('an unknown depreciation class', site({ allocation: { macrs5: 50, bogus: 50 } }), 'allocation.bogus');
refused('a PPA with no solar', bessOnly({ revenue: { ppa: { rate1: 0.2 } } }), 'revenue.ppa');
refused('a solar line with no solar', bessOnly({ capex: { lines: [{ id: 's', label: 'Solar', amount: 5, asset: 'solar' }] } }), 'capex.lines[0].asset');
refused('two lines with one id', site({ capex: { lines: [{ id: 'a', label: 'A', amount: 1, asset: 'solar' }, { id: 'a', label: 'B', amount: 1, asset: 'solar' }] } }), 'capex.lines[1].id');
refused('no installed cost', site({ capex: { lines: [] } }), 'capex.lines');
refused('a month written wrong', site({ project: { bocMonth: 'Feb 2027' } }), 'project.bocMonth');
refused('in service before construction begins', site({ project: { bocMonth: '2027-06', pisMonth: '2027-01' } }), 'project.pisMonth');
refused('a loan longer than the term', site({ debt: { tenorYears: 25 } }), 'debt.tenorYears');
refused('mid-quarter with no in-service month', site({ project: { pisMonth: '' }, tax: { convention: 'mid-quarter' } }), 'project.pisMonth');
refused('a 0% LTC', site({ debt: { ltcPct: 0 } }), 'debt.ltcPct');
refused('a 15-point low-income bonus', site({ tax: { itc: { solar: { lowIncome: 15 } } } }), 'tax.itc.solar.lowIncome');
refused('a state spelled out', site({ project: { state: 'California' } }), 'project.state');
refused('a 60-year term', site({ years: 60 }), 'years');
refused('a battery fee with no battery', solarOnly({ revenue: { bess: { mode: 'fixed' } } }), 'revenue.bess.mode');
refused('a blended line\'s solar share over 100%',
  site({ capex: { lines: [{ id: 'x', label: 'All in', amount: 10, asset: 'blended', solarSharePct: 120 }] } }), 'capex.lines[0].solarSharePct');
eq('validate() passes a good input', E.validate(site()).length, 0);
eq('validate() agrees with run() on a refusal', E.validate(site({ years: 60 }))[0].field, 'years');
var garbage = [undefined, null, 42, 'x', [], [1], true, { years: {} }, { capex: 'x' }, { capex: { lines: [null, 3, 'x'] } },
  { solar: [], bess: 'big', debt: 7, tax: { itc: 'none' } }, { project: { name: 'x' }, revenue: { other: [null] }, opex: { lines: [5] } },
  { project: { name: 'x' }, bess: { kw: 1, kwh: 1, sizing: { schedule: 'x', replacements: [null] } } }, { allocation: [] }];
var threw = null;
garbage.forEach(function (g) {
  try {
    var r = E.run(g);
    if (!r || r.ok !== false || !Array.isArray(r.errors) || !r.errors.length) threw = 'accepted ' + JSON.stringify(g);
  } catch (e) { threw = e.message + ' on ' + JSON.stringify(g); }
});
ok('garbage is refused with errors, never thrown', threw === null, threw);
ok('every refusal names a field and says what is wrong', E.run({ capex: { lines: [{}] } }).errors.every(function (e) {
  return typeof e.field === 'string' && typeof e.message === 'string' && /\.$/.test(e.message);
}));

section('the result carries every field of the contract');
var shape = E.run(TAFT);
function hasAll(obj, keys) { return keys.filter(function (k) { return !obj || !Object.prototype.hasOwnProperty.call(obj, k); }); }
var SHAPE = [
  ['result', shape, 'ok version inputs sourcesUses capex tax revenue opex debt metrics rows year0 sensitivity warnings assumptions'],
  ['sourcesUses', shape.sourcesUses, 'uses sources totalUses equity debt'],
  ['capex', shape.capex, 'total perWdc lines'],
  ['capex line', shape.capex.lines[0], 'id label amount asset itcEligible depClass itcBasis itcRatePct itc depBasisByClass'],
  ['tax', shape.tax, 'itc depreciableBasis depreciablePctOfCost depreciableAfterHaircut haircut bonusPct convention classes ' +
    'federalPct statePct combinedPct appetite recaptureEnd boc pis'],
  ['tax.itc', shape.tax.itc, 'face cash monetization transferPrice byAsset qualifyingBasis qualifyingPctOfCost'],
  ['tax.itc.byAsset.solar', shape.tax.itc.byAsset.solar, 'ratePct build basis amount'],
  ['tax.itc.byAsset.storage', shape.tax.itc.byAsset.storage, 'ratePct build basis amount'],
  ['revenue', shape.revenue, 'year1 ppaRate1 escalatorPct solarKwh1 solarNetKwh1 hostSavingsY1'],
  ['revenue.year1', shape.revenue.year1, 'ppa bess dr ev other total'],
  ['opex', shape.opex, 'year1Total escalatorPct'],
  ['debt', shape.debt, 'amount ratePct tenorYears shape sizingBinding ltcCapacity dscrCapacity ceilingCapacity fee dsra0 ' +
    'dscrMin dscrAvg annualDebtService1'],
  ['metrics', shape.metrics, 'afterTaxIrr preTaxIrr afterTaxIrrExItc irrBuild npv paybackYears totalReturns totalDistributions ' +
    'moic year1Distribution distributionsDuringDebt distributionsAfterDebt lppaCents lcoeCents lcosCents levered'],
  ['metrics.irrBuild', shape.metrics.irrBuild, 'cashOnly depreciation itc total'],
  ['row', shape.rows[0], 'year solarKwh solarNetKwh ppaRevenue bessRevenue hostSavings drRevenue evRevenue otherRevenue revenue opex ' +
    'ebitda reserveInterest wcFunding equipReserve bessReserve replacementCapex dsraFunding interest principal debtService dscr ' +
    'depreciationFed depreciationState stateTax fedTax itc preTaxCash afterTaxCash distribution cumulativeAfterTax'],
  ['year0', shape.year0, 'equity afterTaxCash'],
  ['sensitivity entry', shape.sensitivity[0], 'key label afterTaxIrr delta'],
  ['warning', shape.warnings[0], 'level code text']
];
SHAPE.forEach(function (s) {
  var missing = hasAll(s[1], s[2].split(' '));
  ok(s[0] + ' has ' + s[2].split(' ').length + ' contract fields', missing.length === 0, missing);
});
eq('version pf-1, in the result and the module', shape.version + ' ' + E.VERSION, 'pf-1 pf-1');
eq('28 rows for a 28-year term', shape.rows.length, 28);
eq('the recapture period ends five years after October 2027', E.run(TOPANGA).tax.recaptureEnd, '2032-10');
eq('an unlevered run has no debt block', E.run(TOPANGA).debt, null);
ok('assumptions are plain sentences', shape.assumptions.length > 10 && shape.assumptions.every(function (a) {
  return typeof a === 'string' && /\.$/.test(a) && !/undefined|NaN|null/.test(a);
}));

section('the result holds together');
[['Topanga', top], ['Taft', E.run(TAFT)], ['battery only', sh], ['levered level', level]].forEach(function (x) {
  var r = x[1], name = x[0];
  ok(name + ': every number is finite', allFinite(r, 'result') === null, allFinite(r, 'result'));
  near(name + ': total returns are the after-tax flows of years 0..N', r.metrics.totalReturns,
    -r.year0.equity + sum(col(r, 'afterTaxCash')), 1e-6);
  near(name + ': the last cumulative after-tax cash is the total return', r.rows[r.rows.length - 1].cumulativeAfterTax,
    r.metrics.totalReturns, 1e-6);
  ok(name + ': pre-tax cash reconciles every year', r.rows.every(function (w) {
    return Math.abs(w.preTaxCash - (w.ebitda + w.reserveInterest - w.interest - w.principal - w.wcFunding - w.equipReserve -
      w.bessReserve - w.replacementFromCash - w.dsraFunding)) < 1e-6;
  }));
  ok(name + ': after-tax cash is pre-tax less taxes plus the credit', r.rows.every(function (w) {
    return Math.abs(w.afterTaxCash - (w.preTaxCash - w.stateTax - w.fedTax + w.itc)) < 1e-6;
  }));
  var cf = [-r.year0.equity].concat(col(r, 'afterTaxCash')), irr = r.metrics.afterTaxIrr, npv0 = 0;
  cf.forEach(function (c, t) { npv0 += c / Math.pow(1 + irr, t); });
  near(name + ': NPV at the IRR is zero', npv0 / r.year0.equity, 0, 1e-9);
  near(name + ': the credit by asset adds up to the face', r.tax.itc.byAsset && ['solar', 'storage', 'blended'].reduce(function (s, k) {
    return s + (r.tax.itc.byAsset[k] ? r.tax.itc.byAsset[k].amount : 0);
  }, 0), r.tax.itc.face, 1e-6);
  var classSum = ['macrs5', 'macrs7', 'macrs15', 'sl15', 'sl20', 'sl39'].reduce(function (s, k) { return s + r.tax.classes[k]; }, 0);
  near(name + ': the classes add up to the depreciable basis after the haircut', classSum, r.tax.depreciableAfterHaircut, 1e-6);
  ok(name + ': the IRR build steps add up to the total', Math.round((r.metrics.irrBuild.cashOnly + r.metrics.irrBuild.depreciation +
    r.metrics.irrBuild.itc) * 10) === Math.round(r.metrics.irrBuild.total * 10));
});

section('speed');
var times = [], k;
for (k = 0; k < 15; k++) { var t0 = process.hrtime(); E.run(TAFT); var d = process.hrtime(t0); times.push(d[0] * 1e3 + d[1] / 1e6); }
times.sort(function (x, y) { return x - y; });
ok('a 28-year levered run with its sensitivities takes under 50 ms (median ' + times[7].toFixed(1) + ' ms)', times[7] < 50, times[7]);

/* ====================================================================== */

section('CALIBRATION — the three reference decks through run()');
var table = [];
function cal(deck, figure, published, model, tol, dp, contract) {
  var good = typeof model === 'number' && isFinite(model) && Math.abs(model - published) <= tol;
  table.push({ deck: deck, figure: figure, published: published, model: model, tol: tol, dp: dp || 0, contract: contract !== false, good: good });
  if (contract !== false) ok(deck + ' ' + figure + ' within ±' + tol, good, model);
}
/* The build as a deck prints it: 4.8 (0.9) +4.2 = 8.1. */
function buildText(b) {
  function step(x) { return x < 0 ? '(' + Math.abs(x).toFixed(1) + ')' : '+' + x.toFixed(1); }
  return b[0].toFixed(1) + ' ' + step(b[1]) + ' ' + step(b[2]) + ' = ' + b[3].toFixed(1);
}
function calBuild(deck, r, want) {
  var b = r.metrics.irrBuild, got = buildText([b.cashOnly, b.depreciation, b.itc, b.total]);
  table.push({ deck: deck, figure: 'IRR build (pts)', published: buildText(want), model: got, tol: 'exact', contract: true,
               good: got === buildText(want) });
  eq(deck + ' IRR build ' + buildText(want), got, buildText(want));
}

var T = top, S = E.run(SUNNYSIDE), F = E.run(TAFT), FS = E.run(TAFT_STEPUP);
ok('all three decks run', T.ok && S.ok && F.ok && FS.ok, [T.errors, S.errors, F.errors, FS.errors]);

cal('Topanga', 'ITC', 640823, T.tax.itc.face, 1);
cal('Topanga', 'Basis after haircut', 1406250, T.tax.depreciableAfterHaircut, 1);
cal('Topanga', 'Total uses', 1785564, T.sourcesUses.totalUses, 1);
cal('Topanga', 'Year-1 distribution', 94462, T.metrics.year1Distribution, 2);
cal('Topanga', 'After-tax IRR (%)', 8.14, T.metrics.afterTaxIrr * 100, 0.02, 3);
calBuild('Topanga', T, [4.8, -0.9, 4.2, 8.1]);
cal('Topanga', 'LPPA (c/kWh)', 28.10, T.metrics.lppaCents, 0.2, 3);
cal('Topanga', 'LCOE (c/kWh)', 27.84, T.metrics.lcoeCents, 0.2, 3);
cal('Topanga', 'Payback (yrs)', 10.4, T.metrics.paybackYears, 0.1, 2);
cal('Topanga', 'Total returns', 1757498, T.metrics.totalReturns, 0.01 * 1757498);

cal('Sunnyside', 'ITC', 761481, S.tax.itc.face, 1);
cal('Sunnyside', 'Year-1 distribution', 128665, S.metrics.year1Distribution, 2);
cal('Sunnyside', 'After-tax IRR (%)', 8.01, S.metrics.afterTaxIrr * 100, 0.03, 3);
calBuild('Sunnyside', S, [5.1, -0.8, 3.7, 8]);
cal('Sunnyside', 'Payback (yrs)', 10.7, S.metrics.paybackYears, 0.1, 2);
cal('Sunnyside', 'Total uses', 2356347, S.sourcesUses.totalUses, 1, 0, false);
cal('Sunnyside', 'Basis after haircut', 1899002, S.tax.depreciableAfterHaircut, 1, 0, false);
cal('Sunnyside', 'LPPA (c/kWh)', 31.39, S.metrics.lppaCents, 0.2, 3, false);
cal('Sunnyside', 'LCOE (c/kWh)', 31.39, S.metrics.lcoeCents, 0.2, 3, false);
cal('Sunnyside', 'Total returns', 2433298, S.metrics.totalReturns, 0.01 * 2433298, 0, false);

cal('Taft', 'ITC face', 401661, F.tax.itc.face, 1);
cal('Taft', 'ITC cash at $0.92', 369528, F.tax.itc.cash, 1);
cal('Taft', 'Debt', 755001, F.debt.amount, 1);
cal('Taft', 'Financing fee', 11325, F.debt.fee, 1);
cal('Taft', 'After-tax IRR (%)', 10.36, F.metrics.afterTaxIrr * 100, 0.5, 3);
cal('Taft 20%x1.33', 'ITC face', 401661, FS.tax.itc.face, 1);
cal('Taft 20%x1.33', 'ITC cash at $0.92', 369528, FS.tax.itc.cash, 1);
cal('Taft 20%x1.33', 'After-tax IRR (%)', 10.36, FS.metrics.afterTaxIrr * 100, 0.5, 3);
cal('Taft', 'Total returns', 2134881, F.metrics.totalReturns, 0.01 * 2134881, 0, false);
cal('Taft', 'Equity', 974445, F.sourcesUses.equity, 0.005 * 974445, 0, false);
cal('Taft', 'Total uses', 1729446, F.sourcesUses.totalUses, 0.005 * 1729446, 0, false);
cal('Taft', 'DSRA', 40340, F.debt.dsra0, 0.1 * 40340, 0, false);
cal('Taft', 'Year-1 distribution', 421054, F.metrics.year1Distribution, 0.02 * 421054, 0, false);
cal('Taft', 'Payback (yrs)', 10.85, F.metrics.paybackYears, 0.5, 2, false);
eq('Taft: the 45% LTC binds, not the 1.35x DSCR', F.debt.sizingBinding, 'ltc');
ok('Taft: coverage stays above the 1.35x floor', F.debt.dscrMin >= 1.35, F.debt.dscrMin);
near('Taft: a step-up changes the depreciation, not the credit', FS.tax.itc.face, F.tax.itc.face, 1e-6);
near('Taft: the step-up lifts the 5-year basis by 33% of the qualifying basis',
  FS.tax.depreciableBasis - F.tax.depreciableBasis, 0.33 * F.tax.itc.qualifyingBasis, 1e-6);
ok('Taft: year 1 pays the credit sale and the rest of the debt term pays far less',
  F.metrics.year1Distribution > 350000 && F.metrics.distributionsDuringDebt.max < 100000 &&
  F.metrics.distributionsAfterDebt.min > F.metrics.distributionsDuringDebt.max, F.metrics);
ok('the decks\' own errors are flagged, not fixed: Sunnyside\'s 7% and 36%, Taft\'s 8.84% in Florida',
  codes(S).indexOf('STATE_RATE_MISMATCH') >= 0 && codes(S).indexOf('NON_STATUTORY_RATE') >= 0 &&
  codes(F).indexOf('STATE_RATE_MISMATCH') >= 0 && codes(T).indexOf('STATE_RATE_MISMATCH') < 0);
/* Both decks enter one blended installed cost and begin construction after
   July 2026, which is the slip scenario the tax research asks for; it used
   to vanish for want of a split. They now carry it, and the published
   figures above did not move to make room. */
ok('Topanga and Sunnyside carry the solar slip case, and their deadline warnings quote it', [T, S].every(function (r) {
  var slip = sens(r, 'itcSlip'), w = warning(r, 'SOLAR_CLIFF'), note = warning(r, 'BLENDED_SPLIT');
  return slip && slip.afterTaxIrr < r.metrics.afterTaxIrr && w && w.text.indexOf((slip.afterTaxIrr * 100).toFixed(2) + '%') >= 0 &&
    note && note.level === 'info';
}), [sens(T, 'itcSlip'), sens(S, 'itcSlip')]);

console.log('\n  published vs model' + '\n  ' + pad('deck', 14, true) + pad('figure', 26, true) + pad('published', 22) + pad('model', 22) +
  pad('diff', 12) + '  tolerance');
table.forEach(function (row) {
  var pub, mod, diff = '';
  if (typeof row.model === 'number') {
    pub = row.dp ? row.published.toFixed(row.dp) : money(row.published);
    mod = row.dp ? row.model.toFixed(row.dp) : money(row.model);
    diff = row.dp ? (row.model - row.published).toFixed(row.dp) : ((row.model / row.published - 1) * 100).toFixed(2) + '%';
  } else { pub = row.published; mod = row.model; }
  var tol = typeof row.tol === 'number' ? (row.tol < 1 || row.dp ? '±' + row.tol.toFixed(row.dp ? Math.max(2, row.dp - 1) : 0)
    : '±' + money(row.tol)) : row.tol;
  console.log('  ' + pad(row.deck, 14, true) + pad(row.figure, 26, true) + pad(pub, 22) + pad(mod, 22) + pad(diff, 12) + '  ' +
    pad(tol, 10, true) + (row.contract ? (row.good ? ' ok' : ' MISS') : ' (shown only)'));
});
console.log('  Topanga reproduces SAM\'s own figures to the cent with the fitted 0.4642%/yr decline and 0.0577%/yr net drift;');
console.log('  Taft\'s debt is sculpted on pre-tax CFADS (the contract), where the deck\'s DSRA implies an after-tax sculpt.');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
