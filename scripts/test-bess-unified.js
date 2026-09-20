/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* One engine, two surfaces.
 *
 * The site-map editor and the standalone Battery Sizer POST to the same
 * endpoint with different `mode` values. They used to fork into two
 * different engines that disagreed by 24% on energy from bills and 52% on
 * a real 8760 — and the editor's answer is written into the project and
 * carried into the proposal, so the same site could be quoted two ways
 * depending on which screen it was sized from.
 *
 * These tests exist so that cannot come back. They assert the two paths
 * return the SAME numbers, that the adapter emits every field the editor's
 * UI reads, and that the capacity chain matches the R3.0i workbook.
 *
 * Run: node scripts/test-bess-unified.js
 */
'use strict';
var fs = require('fs'), vm = require('vm'), path = require('path');
var ROOT = path.join(__dirname, '..');
var CAP = require('../api/_lib/bess-capacity');
var tool = require('../api/_lib/battery-tool-engine');
var adapter = require('../api/_lib/bess-size-adapter');

var pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (got !== undefined ? '  got: ' + got : '')); }
}
function near(name, a, b, tol) {
  tol = tol == null ? 1e-6 : tol;
  ok(name, typeof a === 'number' && typeof b === 'number' &&
           isFinite(a) && isFinite(b) && Math.abs(a - b) <= tol, a + ' vs ' + b);
}
function section(t) { console.log('\n' + t); }

function handler() {
  var box = { module: { exports: {} }, Date: Date, require: function (n) {
    if (n.indexOf('verify-token') >= 0) return {
      authenticateWithTier: function () {
        return Promise.resolve({ tier: 'deluxe', caller: { staff: false }, billing: {} });
      },
      httpError: function (s, m) { var e = new Error(m); e.status = s; return e; }
    };
    if (n.indexOf('battery-tool-engine') >= 0) return tool;
    if (n.indexOf('bess-size-adapter') >= 0) return adapter;
    return require(path.join(ROOT, 'api', n.replace('./', '')));
  } };
  vm.runInNewContext(fs.readFileSync(path.join(ROOT, 'api', 'bess-size.js'), 'utf8'), box);
  return box.module.exports;
}
function call(body) {
  return new Promise(function (resolve) {
    var out = {};
    var res = { setHeader: function () {}, status: function (n) { out.status = n; return this; },
                json: function (j) { out.body = j; resolve(out); return this; } };
    handler()({ method: 'POST', body: body }, res);
  });
}

var MD = [31,28,31,30,31,30,31,31,30,31,30,31];
var PEAKS = [880,860,900,940,1010,1080,1120,1100,1040,960,890,870];
var TARIFF = { demandChargePerKw: 18.5, energyRate: 0.075, ratchetPct: 0,
               capexPerKwh: 450, capexPerKw: 0, maxC: 0.5, targetPaybackYr: 7 };

/* A year of hourly kW with a weekday afternoon peak. */
function hourlyYear() {
  var v = [];
  for (var h = 0; h < 8760; h++) {
    var dt = new Date(2025, 0, 1, h), hr = dt.getHours(), dow = dt.getDay(), mo = dt.getMonth();
    var seas = 1 + 0.12 * Math.sin((mo - 3) / 12 * 2 * Math.PI);
    var kw = 300 * seas;
    if (dow >= 1 && dow <= 5 && hr >= 13 && hr < 18) kw = (760 + 240 * Math.sin((hr - 13) / 5 * Math.PI)) * seas;
    else if (dow >= 1 && dow <= 5 && hr >= 7 && hr < 20) kw = 520 * seas;
    v.push(Math.round(kw * 100) / 100);
  }
  return v;
}

(async function () {

section('The capacity chain matches the R3.0i workbook');
var wb = CAP.chain(4, 1, { dodPct: 90, rtePct: 93, otherEffPct: 100, cRate: 0.5, unitMwh: 5 });
near('after depth of discharge', wb.afterDodMwh, 4.4445);
near('after the discharge leg of round-trip', wb.afterRteMwh, 4.6088);
ok('one 5 MWh container covers it', wb.units === 1 && wb.installedMwh === 5, wb.units);
ok('energy-limited, not power-limited', wb.binding === 'energy', wb.binding);

section('Nameplate is not usable/DoD — the discharge leg counts');
var naive = 1000 / 0.9;
var real = CAP.chainKwh(1000, 100, { dodPct: 90, rtePct: 88, cRate: 0.5 }).nameplateKwh;
ok('the correct chain is larger than usable/DoD', real > naive, real + ' vs ' + naive);
/* The workbook rounds UP at four decimal places in MWh, which is 0.1 kWh, so
   a kWh-scale answer carries up to 0.1 kWh of deliberate conservatism. The
   ratio is therefore 1/sqrt(RTE) or a touch above it, never below - rounding
   that could go DOWN is the one that under-sizes a pack. */
var ratio = real / naive, exact = 1 / Math.sqrt(0.88);
ok('and larger by 1/sqrt(RTE), rounded up to the workbook grain',
   ratio >= exact && ratio - exact < 1e-3, ratio + ' vs ' + exact);
ok('the rounding never goes down',
   real >= 1000 / 0.9 / Math.sqrt(0.88) - 1e-9, real);
near('round-trips back to the usable figure',
     CAP.usableFromNameplateKwh(real, { dodPct: 90, rtePct: 88 }), 1000, 0.5);

section('The C-rate floor overrides the energy chain when it binds');
var short = CAP.chainKwh(500, 500, { dodPct: 90, rtePct: 88, cRate: 0.5 });
ok('a 1-hour duty at 0.5C is power-limited', short.binding === 'c-rate', short.binding);
near('and the pack is power/C-rate', short.nameplateKwh, 1000, 0.5);
ok('the pack runs at exactly the stated C', Math.abs(short.powerKw / short.nameplateKwh - 0.5) < 1e-6);
var long = CAP.chainKwh(2000, 500, { dodPct: 90, rtePct: 88, cRate: 0.5 });
ok('a 4-hour duty stays energy-limited', long.binding === 'energy', long.binding);

section('Both surfaces return the same answer — monthly bills');
var edMonthly = await call({ mode: 'monthly', opts: { tariff: TARIFF },
  data: PEAKS.map(function (p, i) { return { month: i, demandKw: p, kwh: Math.round(p * 24 * MD[i] * 0.42) }; }) });
var stMonthly = await call({ mode: 'tool-monthly', durations: adapter.DURATIONS,
  settings: adapter.toSettings(TARIFF),
  data: PEAKS.map(function (p, i) { return { label: 'm' + i, key: 'm' + i, peak: p,
    kwh: Math.round(p * 24 * MD[i] * 0.42), days: MD[i], rate: TARIFF.demandChargePerKw }; }) });
ok('editor path returns 200', edMonthly.status === 200, JSON.stringify(edMonthly.body).slice(0, 120));
ok('standalone path returns 200', stMonthly.status === 200, JSON.stringify(stMonthly.body).slice(0, 120));
var em = edMonthly.body.recommended, sm = stMonthly.body.rec;
near('same power', em.powerKw, sm.kW, 1e-6);
near('same nameplate', em.nameplateKwh, sm.nameplate, 1e-6);
near('same installed cost', em.capex, sm.capex, 1e-6);
near('same payback', em.paybackYr, sm.payback, 1e-9);
near('same NPV', em.npv, sm.npv, 1e-6);
ok('the editor path names the engine it used',
   edMonthly.body.engine === 'battery-tool-engine', edMonthly.body.engine);

section('Both surfaces return the same answer — 8760 interval data');
var year = hourlyYear();
var edInt = await call({ mode: 'interval', data: year,
  opts: { intervalMin: 60, startMonth: 0, tariff: TARIFF } });
ok('editor interval path returns 200', edInt.status === 200, JSON.stringify(edInt.body).slice(0, 160));
var series = adapter.intervalToMonths(year, 60, 0);
var stInt = adapter.adapt(tool({ mode: 'tool-interval', data: series,
  durations: adapter.DURATIONS, settings: adapter.toSettings(TARIFF) }),
  { tariff: TARIFF }, 'interval');
near('same power', edInt.body.recommended.powerKw, stInt.recommended.powerKw, 1e-6);
near('same nameplate', edInt.body.recommended.nameplateKwh, stInt.recommended.nameplateKwh, 1e-6);
near('same payback', edInt.body.recommended.paybackYr, stInt.recommended.paybackYr, 1e-9);
ok('interval basis is reported as measured',
   edInt.body.meta.basis === 'interval' && edInt.body.meta.confidence === 'measured',
   edInt.body.meta.confidence);

section('The adapter emits every field the editor UI reads');
var b = edMonthly.body;
['ok','meta','tariff','derate','candidates','recommended','metTarget','sensitivity',
 'annualPeak','baseDemandCostYr'].forEach(function (k) {
  ok('result.' + k + ' present', b[k] !== undefined, typeof b[k]);
});
['basis','confidence','peaks','loadFactor','assumedPeakHours','annualizationFactor'].forEach(function (k) {
  ok('meta.' + k + ' present', b.meta[k] !== undefined, typeof b.meta[k]);
});
['shaveKw','powerKw','nameplateKwh','durationH','savingsYr','capex','paybackYr',
 'cyclesYr','cRateLimited','rechargeTight','feasible','assumedDuration'].forEach(function (k) {
  ok('recommended.' + k + ' present', b.recommended[k] !== undefined, typeof b.recommended[k]);
});
ok('duration is a real number, not zero', b.recommended.durationH > 0, b.recommended.durationH);
ok('every month row carries a peak and a usage figure',
   b.meta.peaks.length === 12 && b.meta.peaks.every(function (p) {
     return p.peakKw > 0 && p.kwh > 0 && p.avgKw > 0; }));
ok('the recommendation is one of the sweep rows, by identity',
   b.candidates.indexOf(b.recommended) >= 0);
ok('sensitivity covers the durations swept',
   b.sensitivity.length > 1 && b.sensitivity.every(function (x) {
     return x.hours > 0 && x.nameplateKwh > 0 && x.capex > 0; }),
   JSON.stringify(b.sensitivity));

section('derate is the exact inverse used to restate duration');
var d = b.derate;
near('derate equals DoD x sqrt(RTE)', d, 0.9 * Math.sqrt(0.88), 1e-9);
near('nameplate x derate recovers usable energy',
     b.recommended.nameplateKwh * d, b.recommended.usableKwh, 0.5);

section('Bad input is refused rather than sized');
ok('a negative reading is refused',
   (await call({ mode: 'interval', data: [10, -5, 10], opts: { tariff: TARIFF } })).status === 400);
ok('an empty month list is refused',
   (await call({ mode: 'monthly', data: [], opts: { tariff: TARIFF } })).status === 400);
ok('a month with no demand is refused',
   (await call({ mode: 'monthly', data: [{ month: 0, demandKw: 0, kwh: 100 }], opts: { tariff: TARIFF } })).status === 400);
ok('a ratchet stated as a percentage instead of a fraction is refused',
   (await call({ mode: 'monthly', data: [{ month: 0, demandKw: 100, kwh: 1000 }],
                 opts: { tariff: { ratchetPct: 80 } } })).status === 400);
ok('an impossible C-rate is refused',
   (await call({ mode: 'monthly', data: [{ month: 0, demandKw: 100, kwh: 1000 }],
                 opts: { tariff: { maxC: 50 } } })).status === 400);
ok('a non-standard interval length is refused',
   (await call({ mode: 'interval', data: [10, 20, 30], opts: { intervalMin: 7, tariff: TARIFF } })).status === 400);

section('The ratchet unit change survives the translation');
var noRatchet = await call({ mode: 'monthly', opts: { tariff: TARIFF },
  data: PEAKS.map(function (p, i) { return { month: i, demandKw: p, kwh: Math.round(p * 24 * MD[i] * 0.42) }; }) });
var withRatchet = await call({ mode: 'monthly', opts: { tariff: Object.assign({}, TARIFF, { ratchetPct: 0.8 }) },
  data: PEAKS.map(function (p, i) { return { month: i, demandKw: p, kwh: Math.round(p * 24 * MD[i] * 0.42) }; }) });
ok('a ratchet changes the answer', withRatchet.body.recommended.savingsYr !== noRatchet.body.recommended.savingsYr,
   withRatchet.body.recommended.savingsYr + ' vs ' + noRatchet.body.recommended.savingsYr);
ok('0.8 was read as 80%, not 0.8%',
   adapter.toSettings({ ratchetPct: 0.8 }).ratchet === 80,
   adapter.toSettings({ ratchetPct: 0.8 }).ratchet);

section('No headroom is applied on the editor path');
ok('headroom stays at zero so nothing is silently grossed up',
   adapter.toSettings({}).headroom === 0, adapter.toSettings({}).headroom);

console.log('\n' + (fail ? fail + ' FAILED, ' : '') + pass + ' checks passed');
if (fail) process.exitCode = 1;
})().catch(function (e) { console.error(e); process.exitCode = 1; });
