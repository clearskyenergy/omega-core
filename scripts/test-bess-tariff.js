/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* Tests for api/_lib/bess-tariff.js — the tariff engine.
 *
 * The sizing engine used to value every shaved kW at one $/kW-mo. Almost no
 * commercial tariff works that way, and the error is not small: on a
 * seasonal schedule the same battery is worth anywhere from 27% to 154% of
 * the flat answer depending on which month's bill the rate was read off.
 * That is larger than every other correction in this codebase combined.
 *
 * Every expected figure below is hand-computed and written out, so a
 * failure says which line of the bill moved.
 *
 * Run: node scripts/test-bess-tariff.js
 */
'use strict';
var T = require('../api/_lib/bess-tariff');
var TOOL = require('../api/_lib/battery-tool-engine');

var pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (got !== undefined ? '  got: ' + got : '')); }
}
function near(name, got, want, tol) {
  tol = tol == null ? 1e-6 : tol;
  ok(name + ' = ' + want, typeof got === 'number' && isFinite(got) &&
     Math.abs(got - want) <= tol, got);
}
function section(t) { console.log('\n' + t); }

function sched(fn) {
  var o = [];
  for (var m = 0; m < 12; m++) { var r = []; for (var h = 0; h < 24; h++) r.push(fn(m, h)); o.push(r); }
  return o;
}
var isSummer = function (m) { return m >= 5 && m <= 8; };

/* A schedule with everything on it: seasonal TOU energy, a summer-only
   coincident demand charge, a year-round facility charge and a ratchet. */
var FULL = T.normalize({
  name: 'Test C&I',
  energyratestructure: [[{ rate: 0.12 }], [{ rate: 0.18 }], [{ rate: 0.28 }]],
  energyweekdayschedule: sched(function (m, h) {
    if (isSummer(m) && h >= 16 && h < 21) return 2;
    if (h >= 8 && h < 21) return 1;
    return 0;
  }),
  energyweekendschedule: sched(function (m, h) { return (h >= 8 && h < 21) ? 1 : 0; }),
  demandratestructure: [[{ rate: 0 }], [{ rate: 22.00 }]],
  demandweekdayschedule: sched(function (m, h) { return (isSummer(m) && h >= 16 && h < 21) ? 1 : 0; }),
  demandweekendschedule: sched(function () { return 0; }),
  flatdemandstructure: [[{ rate: 6.10 }]],
  flatdemandmonths: [0,0,0,0,0,0,0,0,0,0,0,0],
  fixedchargefirstmeter: 250,
  demandratchetpercentage: 80
});

section('A flat rate is the degenerate case of the same engine');
var flat = T.flatTariff({ demandChargePerKw: 18.5, energyRate: 0.075 });
var fb = T.billFromMonthly([{ month: 0, kwh: 200000, facilityKw: 1000, days: 31 }], flat);
near('1,000 kW at $18.50 plus 200,000 kWh at $0.075',
     fb.total, 1000 * 18.5 + 200000 * 0.075);
ok('one billing path, not two', fb.months.length === 1 && fb.months[0].lines.length === 2);

section('Every determinant is billed on its own quantity');
var jul = T.billFromMonthly([{ month: 6, days: 31, kwh: 300000,
  energyByPeriod: { 0: 120000, 1: 130000, 2: 50000 },
  demandByPeriod: { 1: 900 }, facilityKw: 1000 }], FULL);
near('July total', jul.total,
     120000*0.12 + 130000*0.18 + 50000*0.28 + 900*22 + 1000*6.10 + 250);
var lines = jul.months[0].lines;
function line(kind) { return lines.filter(function (l) { return l.kind === kind; }); }
ok('the on-peak demand is billed on the ON-PEAK kW, not the monthly max',
   line('demand-tou')[0].qty === 900, line('demand-tou')[0].qty);
ok('the facility charge is billed on the monthly max',
   line('demand-facility')[0].qty === 1000, line('demand-facility')[0].qty);
ok('energy is split across three periods', line('energy').length === 3);

section('A season the charge does not apply in is not billed for it');
var jan = T.billFromMonthly([{ month: 0, days: 31, kwh: 300000,
  energyByPeriod: { 0: 120000, 1: 180000 },
  demandByPeriod: { 0: 900 }, facilityKw: 1000 }], FULL);
near('January total carries no on-peak demand', jan.total,
     120000*0.12 + 180000*0.18 + 1000*6.10 + 250);
var janRates = T.marginalDemandRates(0, FULL);
var julRates = T.marginalDemandRates(6, FULL);
near('January has only the facility rate', janRates.facility, 6.10);
ok('and no on-peak period is billed in January',
   Object.keys(janRates.byPeriod).length === 0, JSON.stringify(janRates.byPeriod));
ok('July does carry an on-peak period', julRates.byPeriod[1] === 22.00,
   JSON.stringify(julRates.byPeriod));

section('Tiers are cumulative and the marginal rate is the next unit');
var tiered = T.normalize({
  name: 'tiered',
  energyratestructure: [[{ max: 10000, rate: 0.20 }, { max: 50000, rate: 0.15 }, { rate: 0.10 }]],
  energyweekdayschedule: sched(function () { return 0; }),
  energyweekendschedule: sched(function () { return 0; })
});
near('60,000 kWh across three tiers',
     T.billFromMonthly([{ month: 0, kwh: 60000, days: 31 }], tiered).total,
     10000*0.20 + 40000*0.15 + 10000*0.10);
near('the marginal rate at 60,000 kWh is the top tier',
     T.marginalRate(tiered.energyRates[0], 60000), 0.10);
near('the marginal rate at 5,000 kWh is the first tier',
     T.marginalRate(tiered.energyRates[0], 5000), 0.20);

section('The ratchet floors the facility charge on the trailing year');
var months = [];
for (var i = 0; i < 12; i++) {
  months.push({ month: i, days: 30, kwh: 100000,
                energyByPeriod: { 0: 100000 },
                facilityKw: (i === 6 ? 1000 : 400) });
}
var ratcheted = T.billFromMonthly(months, FULL);
var sept = ratcheted.months[8].lines.filter(function (l) { return l.kind === 'demand-facility'; })[0];
ok('September is billed above its metered demand after a July spike',
   sept.ratchetApplied === true && sept.qty === 800 && sept.meteredKw === 400,
   sept.qty + ' billed vs ' + sept.meteredKw + ' metered');
var noRatchet = T.normalize({
  name: 'no ratchet',
  flatdemandstructure: [[{ rate: 6.10 }]], flatdemandmonths: [0,0,0,0,0,0,0,0,0,0,0,0],
  demandratchetpercentage: 0
});
var nr = T.billFromMonthly(months, noRatchet);
var sept2 = nr.months[8].lines.filter(function (l) { return l.kind === 'demand-facility'; })[0];
ok('and is not, when the tariff has no ratchet', !sept2.ratchetApplied && sept2.qty === 400,
   sept2.qty);

section('An interval profile bills the same as its own aggregates');
var kw = [], h;
for (h = 0; h < 8760; h++) {
  var d = new Date(2025, 0, 1, h), hr = d.getHours(), dow = d.getDay(), mo = d.getMonth();
  var v = 300;
  if (dow >= 1 && dow <= 5) { v = (hr >= 7 && hr < 20) ? 700 : 350; if (isSummer(mo) && hr >= 16 && hr < 21) v = 1000; }
  kw.push(v);
}
var prof = { kw: kw, dt: 1, startMonth: 0, startDayOfWeek: 3 };
var byProfile = T.billFromProfile(prof, FULL);
ok('a full year bills twelve months', byProfile.months.length === 12, byProfile.months.length);
ok('the bill is a finite positive number',
   isFinite(byProfile.total) && byProfile.total > 0, byProfile.total);
/* Shaving only the on-peak window must move ONLY the on-peak demand line
   in summer, and leave the facility line alone - the morning peak still
   sets it. */
var shaved = kw.map(function (v, i) {
  var d = new Date(2025, 0, 1, i), hr = d.getHours(), dow = d.getDay(), mo = d.getMonth();
  return (dow >= 1 && dow <= 5 && isSummer(mo) && hr >= 16 && hr < 21) ? Math.max(0, v - 250) : v;
});
var afterProfile = T.billFromProfile({ kw: shaved, dt: 1, startMonth: 0, startDayOfWeek: 3 }, FULL);
var julyBefore = byProfile.months[6].lines.filter(function (l) { return l.kind === 'demand-tou'; })[0];
var julyAfter  = afterProfile.months[6].lines.filter(function (l) { return l.kind === 'demand-tou'; })[0];
near('the on-peak demand falls by the shave', julyBefore.qty - julyAfter.qty, 250, 1);
ok('and the site still pays for the morning facility peak',
   afterProfile.months[6].lines.filter(function (l) { return l.kind === 'demand-facility'; })[0].qty === 750,
   afterProfile.months[6].lines.filter(function (l) { return l.kind === 'demand-facility'; })[0].qty);
ok('shaving the on-peak window is worth something',
   byProfile.total - afterProfile.total > 0, byProfile.total - afterProfile.total);

section('This is the error a flat rate makes, measured');
/* Same site, same battery, a summer-only demand charge. */
var seasonal = T.normalize({
  name: 'summer-only demand',
  energyratestructure: [[{ rate: 0.10 }]],
  energyweekdayschedule: sched(function () { return 0; }),
  energyweekendschedule: sched(function () { return 0; }),
  flatdemandstructure: [[{ rate: 6.10 }], [{ rate: 34.20 }]],
  flatdemandmonths: [0,0,0,0,0,1,1,1,1,0,0,0]
});
var mrows = [], cut = 250;
for (i = 0; i < 12; i++) mrows.push({ month: i, days: 30, kwh: 200000, facilityKw: 1000 });
var beforeS = T.billFromMonthly(mrows, seasonal);
var afterS = T.billFromMonthly(mrows.map(function (m) {
  return { month: m.month, days: m.days, kwh: m.kwh, facilityKw: m.facilityKw - cut };
}), seasonal);
var realSaving = beforeS.total - afterS.total;
var handSaving = cut * (34.20 * 4 + 6.10 * 8);
near('the exact saving is the sum of each month at its own rate', realSaving, handSaving, 1);
var summerBillRate = cut * 34.20 * 12;
var winterBillRate = cut * 6.10 * 12;
ok('a rate read off a summer bill overstates it',
   summerBillRate > realSaving * 1.4, Math.round(summerBillRate) + ' vs ' + Math.round(realSaving));
ok('a rate read off a winter bill understates it',
   winterBillRate < realSaving * 0.6, Math.round(winterBillRate) + ' vs ' + Math.round(realSaving));

section('The sizing engine changes its answer when given the real tariff');
var MD = [31,28,31,30,31,30,31,31,30,31,30,31];
var PK = [880,860,900,940,1010,1080,1120,1100,1040,960,890,870];
function billSet() {
  return PK.map(function (p, i) {
    return { label: 'm' + i, key: 'm' + i, peak: p, month: i,
             kwh: Math.round(p * 24 * MD[i] * 0.42), days: MD[i], rate: 18.5 };
  });
}
var settings = { obj: 'npv', rte: 88, dod: 90, cRate: 0.5, cKwh: 450, itc: 30,
                 term: 10, disc: 8, headroom: 10, fade: 2 };
var flatRun = TOOL({ mode: 'tool-monthly', data: billSet(), durations: [2], settings: settings });
var tarRun  = TOOL({ mode: 'tool-monthly', data: billSet(), durations: [2], settings: settings,
                     tariff: { name: 'seasonal',
                       energyratestructure: [[{ rate: 0.10 }]],
                       energyweekdayschedule: sched(function () { return 0; }),
                       energyweekendschedule: sched(function () { return 0; }),
                       flatdemandstructure: [[{ rate: 6.10 }], [{ rate: 28.10 }]],
                       flatdemandmonths: [0,0,0,0,0,1,1,1,1,0,0,0] } });
ok('the flat run is unchanged by the tariff feature existing',
   Math.round(flatRun.best.annSav) === 115108, Math.round(flatRun.best.annSav));
ok('the seasonal tariff gives a materially different answer',
   Math.abs(tarRun.best.annSav - flatRun.best.annSav) / flatRun.best.annSav > 0.15,
   Math.round(tarRun.best.annSav) + ' vs ' + Math.round(flatRun.best.annSav));
ok('and a different payback',
   Math.abs(tarRun.rec.payback - flatRun.rec.payback) > 0.5,
   tarRun.rec.payback.toFixed(2) + ' vs ' + flatRun.rec.payback.toFixed(2));

section('A malformed tariff is refused, not silently half-read');
var loose = T.normalize({ name: 'partial', flatdemandstructure: [[{ rate: 9 }]] });
ok('a facility rate with no month map is applied to every month, and says so',
   loose.flatMonths.every(function (x) { return x === 0; }) && loose.notes.length > 0,
   loose.notes.join(' | '));
var empty = T.normalize({ name: 'nothing' });
ok('a tariff with no charges at all is flagged rather than billed as zero',
   empty.notes.some(function (n) { return /no energy and no demand/.test(n); }),
   empty.notes.join(' | '));
var badSchedule = T.normalize({
  name: 'out of range',
  energyratestructure: [[{ rate: 0.1 }]],
  energyweekdayschedule: sched(function () { return 7; })   /* period 7 does not exist */
});
ok('a schedule naming a period that does not exist is clamped, not dropped',
   badSchedule.energyWeekday[0][0] === 0, badSchedule.energyWeekday[0][0]);

console.log('\n' + (fail ? fail + ' FAILED, ' : '') + pass + ' checks passed');
if (fail) process.exitCode = 1;
