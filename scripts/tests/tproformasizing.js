/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The pro forma's sizing bridge (api/_lib/proforma-sizing.js), offline.

   The pro forma books a battery's savings as revenue, so the bridge has to
   hand it exactly what the one sizing engine computed for the system it
   reports - the same size, the same fade, the same replacement year - and
   refuse what /api/bess-size refuses. Synthetic loads only: an hourly year
   with a daytime plateau, a summer bump and an afternoon spike (the shape
   scripts/test-portfolio.js uses), its 15-minute twin, and twelve bills
   with a summer bump. No network, no credentials, no npm install. */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var SIZING = require(path.join(ROOT, 'api/_lib/proforma-sizing'));
var ENGINE = require(path.join(ROOT, 'api/_lib/battery-tool-engine'));
var ADAPTER = require(path.join(ROOT, 'api/_lib/bess-size-adapter'));
var CAP = require(path.join(ROOT, 'api/_lib/bess-capacity'));

var fails = 0, passes = 0;
function ok(c, m) { if (c) { passes++; console.log('  ok   ' + m); } else { fails++; console.log('  FAIL ' + m); } }
function eq(a, b, m) { ok(a === b, m + (a === b ? '' : ' (got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b) + ')')); }
function near(a, b, tol, m) {
  var good = typeof a === 'number' && typeof b === 'number' && isFinite(a) && isFinite(b) && Math.abs(a - b) <= tol;
  ok(good, m + (good ? '' : ' (' + a + ' vs ' + b + ')'));
}
function timed(fn) { var t0 = Date.now(), out = fn(); return { out: out, ms: Date.now() - t0 }; }
function allFinite(o) {
  if (typeof o === 'number') return isFinite(o);
  if (o && typeof o === 'object') { for (var k in o) if (!allFinite(o[k])) return false; }
  return true;
}
function longestArray(o) {
  var n = 0, k;
  if (Array.isArray(o)) n = o.length;
  if (o && typeof o === 'object') for (k in o) n = Math.max(n, longestArray(o[k]));
  return n;
}

/* ── fixtures ─────────────────────────────────────────────────────────── */
function kwAt(hourOfYear) {
  var h = hourOfYear % 24, d = Math.floor(hourOfYear / 24);
  return 300 + (h >= 9 && h <= 17 ? 350 : 0) + 40 * Math.sin(hourOfYear / 24 * Math.PI) +
         (d >= 151 && d < 243 ? 120 : 0) + (h === 14 && d % 7 === 2 ? 180 : 0);
}
function interval8760(days) {
  var out = [], i;
  for (i = 0; i < (days || 365) * 24; i++) out.push(Math.round(kwAt(i) * 10) / 10);
  return out;
}
function interval35040() {
  var out = [], i, q;
  for (i = 0; i < 8760; i++) for (q = 0; q < 4; q++) out.push(Math.round((kwAt(i) + (q === 2 ? 25 : 0)) * 10) / 10);
  return out;
}
function bills12(year) {
  var rows = [], m;
  for (m = 0; m < 12; m++) rows.push({ month: m, year: year || 2025, demandKw: 600 + (m >= 5 && m <= 8 ? 150 : 0), kwh: 200000 });
  return rows;
}
function monthlyReq(extra) {
  var r = { load: { mode: 'monthly', rows: bills12() }, tariff: { demandChargePerKw: 18, energyRate: 0.11 },
            bess: {}, finance: { termYears: 25 } }, k;
  for (k in (extra || {})) r[k] = extra[k];
  return r;
}
var FLAT18 = { name: 'Flat facility 18', flatdemandstructure: [[{ rate: 18 }]], flatdemandmonths: [0,0,0,0,0,0,0,0,0,0,0,0] };

/* ── 1. monthly bills ─────────────────────────────────────────────────── */
console.log('monthly bills');
var mRun = timed(function () { return SIZING.size(monthlyReq()); }), M = mRun.out;
console.log('       (' + mRun.ms + ' ms)');
ok(M.ok === true, 'twelve bills size');
eq(M.basis, 'monthly', 'basis is monthly');
eq(M.engine, 'battery-tool-engine', 'the one engine sized it');
eq(M.degradation, 'measured', 'fade is measured on the load, not assumed linear');
ok(M.system.kw > 0 && M.system.usableKwh > 0 && M.system.nameplateKwh >= M.system.usableKwh, 'a real system: kW, usable kWh, nameplate at least usable');
var chain = CAP.chainKwh(M.system.usableKwh, M.system.kw, { dodPct: 90, rtePct: 88, cRate: 0.5 });
near(M.system.nameplateKwh, chain.nameplateKwh, 1e-6, 'nameplate is the shared capacity chain of usable energy and kW');
ok([1, 2, 4, 6].indexOf(M.system.durationH) >= 0, 'the chosen duration is one that was swept (' + M.system.durationH + ' h)');
near(M.system.effectiveDurationH, M.system.usableKwh / M.system.kw, 1e-9, 'effective duration is usable energy over power');
eq(M.months.length, 12, 'twelve months');
eq(M.months[0].label + '|' + M.months[11].label, 'Jan 2025|Dec 2025', 'months carry "Mon YYYY" labels');
ok(M.months.every(function (m) { return m.afterKw <= m.peakKw + 1e-9 && m.costAfter <= m.costBefore + 1e-9; }), 'every month: the peak and the demand cost only go down');
near(M.baseDemandCostYr, 18 * (600 * 8 + 750 * 4), 1e-6, 'base demand cost is the twelve billed peaks at $18');
eq(M.schedule.length, 25, 'schedule runs the whole 25-year term');
ok(allFinite(M), 'every number in the result is finite');
ok(M.schedule.every(function (y, i) { return y.year === i + 1 && Math.abs(y.netSavings - (y.grossSavings - y.lossCost)) < 1e-9; }), 'each year: net savings are gross demand savings less charging losses');
near(M.savings.netY1, M.schedule[0].netSavings, 1e-9, 'year-one net savings are the schedule\'s year one');
near(M.savings.demandY1 - M.savings.lossY1, M.savings.netY1, 1e-9, 'year one adds up');
ok(M.savings.p90Y1 !== null && M.savings.p90Y1 <= M.savings.netY1 + 1e-9, 'the flat-topped P90 reading saves no more than the P50 one');
near(M.schedule[1].grossSavings / M.schedule[0].grossSavings, 1.03 * M.schedule[1].savingsRatio / M.schedule[0].savingsRatio, 1e-9, 'savings escalate 3%/yr on top of the measured fade');
ok(M.schedule[5].savingsRatio < 1 && M.schedule[5].soh < 1, 'a faded pack earns less than a new one');
ok(M.alternatives.length >= 2 && M.alternatives.filter(function (a) { return a.chosen; }).length === 1, 'alternatives by duration, exactly one of them the chosen system');
ok(M.alternatives.every(function (a) { return a.npv > 0; }), 'every alternative listed pays back on the screening NPV');
ok(M.alternatives.length === 4 || M.assumptions.some(function (s) { return /not listed as alternatives/.test(s); }), 'a duration that never pays back is named, not listed at a near-zero size');
var chosen = M.alternatives.filter(function (a) { return a.chosen; })[0];
ok(chosen.kw === M.system.kw && chosen.durationH === M.system.durationH && chosen.netY1 === M.savings.netY1, 'the chosen alternative IS the reported system');
eq(M.settings.obj, 'npv', 'the engine ranked by NPV');
eq(M.settings.headroom, 0, 'no headroom unless asked for');
eq(M.settings.term, 25, 'term carried into the engine');
eq(M.settings.ratchet, 0, 'no ratchet unless asked for');
ok(M.assumptions.length >= 5 && M.assumptions.every(function (s) { return typeof s === 'string' && s.length > 20; }), 'assumptions are stated in words');
eq(M.warnings.length, 0, 'a clean year of bills raises no warning');
var mJson = JSON.stringify(M);
ok(mJson.length < 20000 && longestArray(M) <= 25, 'result is small: ' + mJson.length + ' bytes, longest array ' + longestArray(M));

/* ── 2. replacement ───────────────────────────────────────────────────── */
console.log('pack replacement');
var R = SIZING.size(monthlyReq({ bess: { fadePctYr: 3, minSohPct: 80, replPerKwh: 250 } }));
ok(R.ok, 'sizes with 3%/yr fade and an 80% floor');
/* 0.97^7 = 0.808 is still above 80%; 0.97^8 = 0.784 is not, so year 9. */
eq(R.replacements.length > 0 && R.replacements[0].year, 9, 'the pack is replaced in year 9');
eq(R.schedule[8].soh, 1, 'the replacement resets state of health to new');
near(R.schedule[9].soh, 0.97, 1e-12, 'and the fade clock restarts the year after');
near(R.schedule[7].soh, Math.pow(0.97, 7), 1e-12, 'the year before it the pack is at 0.97^7');
near(R.replacements[0].cost, R.system.nameplateKwh * 250, 1e-6, 'replacement cost is nameplate x the replacement $/kWh');
eq(R.replacements.map(function (x) { return x.year; }).join(','), '9,17,25', 'and every eight years after, each new pack fading from new');
eq(R.minSohPct, 80, 'the floor is echoed');
ok(R.schedule[8].grossSavings > R.schedule[7].grossSavings, 'savings recover with the new pack');

/* ── 3. the engine's schedule is the NPV's own cash flow ──────────────── */
console.log('engine schedule');
var bills = ADAPTER.monthlyToBills(bills12(), { demandChargePerKw: 18 }).map(function (b) { b.label += ' 2025'; return b; });
var E = ENGINE({ mode: 'tool-monthly', data: bills, durations: [1, 2, 4, 6], settings: { obj: 'npv', term: 20, fade: 3, minSoh: 80 } });
var d = 0.08, npv = -E.rec.net;
E.rec.schedule.forEach(function (y) { npv += (y.savings - y.loss - y.om - y.replacement) / Math.pow(1 + d, y.year); });
near(npv, E.rec.npv, 1e-6, 'discounting the schedule reproduces the engine\'s NPV exactly');
eq(E.rec.schedule.length, 20, 'one row per year of the term');
ok(!!E.best.schedule, 'the modelled optimum keeps its schedule');
eq(E.sweep.filter(function (s) { return s.schedule; }).length, 1, 'every other sweep row drops it (only the pick, which is a sweep row, keeps one)');
var probe = ENGINE({ mode: 'tool-interval', data: ADAPTER.intervalToMonths(interval8760(), 60, 0), durations: [2], settings: { obj: 'npv' } });
ok(probe.durationProbe && !probe.durationProbe.schedule, 'the duration probe drops it too');

/* ── 4. parity with a direct engine run ───────────────────────────────── */
console.log('parity');
var direct = ENGINE({ mode: 'tool-monthly', data: ADAPTER.monthlyToBills(bills12(), { demandChargePerKw: 18 }).map(function (b) { b.label += ' 2025'; return b; }),
                      durations: M.settings.durations, settings: M.settings });
near(M.system.kw, direct.rec.kW, 1e-9, 'same kW as the engine run directly with the bridge\'s settings');
near(M.system.usableKwh, direct.rec.kWh, 1e-9, 'same usable kWh');
near(M.system.nameplateKwh, direct.rec.nameplate, 1e-9, 'same nameplate');
near(M.savings.netY1, direct.rec.schedule[0].savings - direct.rec.schedule[0].loss, 1e-6, 'same year-one saving');
near(M.schedule[24].netSavings, direct.rec.schedule[24].savings - direct.rec.schedule[24].loss, 1e-6, 'same year-25 saving');
eq(direct.rec.kW, direct.best.kW, 'with headroom forced to 0 the priced system is the optimum itself');
var withDefault = {}, k;
for (k in M.settings) if (k !== 'headroom') withDefault[k] = M.settings[k];
var loose = ENGINE({ mode: 'tool-monthly', data: ADAPTER.monthlyToBills(bills12(), { demandChargePerKw: 18 }).map(function (b) { b.label += ' 2025'; return b; }),
                     durations: M.settings.durations, settings: withDefault });
near(loose.rec.kW / loose.best.kW, 1.1, 1e-9, 'left to the engine\'s default, the priced system would be 10% larger than the one that earns the savings');
var H = SIZING.size(monthlyReq({ bess: { headroomPct: 15 } }));
near(H.system.kw / M.system.kw, 1.15, 1e-9, 'a requested headroom is priced and reported together');
near(H.savings.demandY1, M.savings.demandY1, 1e-6, 'and earns no extra saving');
ok(H.assumptions.some(function (s) { return /15% larger/.test(s); }), 'and is said in the assumptions');

/* ── 5. interval data ─────────────────────────────────────────────────── */
console.log('interval data');
var iRun = timed(function () { return SIZING.size({ load: { mode: 'interval', values: interval8760(), startMonth: 0, startYear: 2025 }, finance: { termYears: 20 } }); }), I = iRun.out;
console.log('       (' + iRun.ms + ' ms for 8,760 hourly readings)');
ok(I.ok === true, 'an hourly year sizes');
eq(I.basis, 'interval', 'basis is interval');
eq(I.load.intervalMin, 60, 'hourly read from the count');
eq(I.load.intervalDetected, true, 'and flagged as read, not stated');
eq(I.months.length, 12, 'twelve months');
eq(I.months[5].label, 'Jun 2025', 'labels follow the start month and year');
eq(I.savings.p90Y1, null, 'no P90 reading on measured data');
eq(I.schedule.length, 20, 'schedule runs the 20-year term');
ok(I.system.kw > 0 && I.savings.netY1 > 0 && I.throughputKwhYr > 0 && I.cyclesYr > 0, 'a system that saves money and cycles');
near(I.annualPeakKw, Math.max.apply(null, interval8760()), 1e-9, 'annual peak is the largest reading');
ok(allFinite(I), 'every number is finite');
ok(JSON.stringify(I).length < 20000 && longestArray(I) <= 20, 'no load array comes back (' + JSON.stringify(I).length + ' bytes)');
eq(I.warnings.length, 0, 'a clean year raises no warning');
var directI = ENGINE({ mode: 'tool-interval', data: ADAPTER.intervalToMonths(interval8760(), 60, 0), durations: I.settings.durations, settings: I.settings });
near(I.system.kw, directI.rec.kW, 1e-9, 'interval parity: same kW as a direct engine run');
near(I.savings.netY1, directI.rec.schedule[0].savings - directI.rec.schedule[0].loss, 1e-6, 'interval parity: same year-one saving');

var L = SIZING.size({ load: { mode: 'interval', values: interval8760(366), startYear: 2024 } });
ok(L.ok && L.months.length === 12, 'a leap year of hours still bills twelve months');
eq(L.load.readingsUsed, 8760, 'the one day left over is not billed as a thirteenth month');
ok(L.warnings.some(function (w) { return /leap year/.test(w); }), 'and the dropped readings are named');
ok(L.assumptions.some(function (s) { return /start month not stated/.test(s); }), 'an unstated start month is said, not hidden');

var P = SIZING.size({ load: { mode: 'interval', values: interval35040().slice(0, 8760), intervalMin: 15, startMonth: 6, startYear: 2025 } });
ok(P.ok && P.months.length === 3, 'three months of quarter-hours size, stated as three months');
eq(P.months[0].label + '|' + P.months[2].label, 'Jul 2025|Sep 2025', 'labelled from the stated start');
ok(P.warnings.some(function (w) { return /Only 3 months/.test(w); }), 'a partial year is flagged');

/* ── 6. structured tariff ─────────────────────────────────────────────── */
console.log('structured tariff');
var U = SIZING.size(monthlyReq({ tariff: { demandChargePerKw: 5, urdb: FLAT18 } }));
ok(U.ok, 'a URDB facility charge sizes');
near(U.system.kw, M.system.kw, 1e-9, 'an $18 URDB facility charge sizes the battery a flat $18 does');
near(U.savings.netY1, M.savings.netY1, 1e-6, 'and saves the same');
ok(U.assumptions.some(function (s) { return /structured tariff "Flat facility 18"/.test(s); }), 'the tariff is named in the assumptions');
var MIX = { name: 'Facility + on-peak', flatdemandstructure: [[{ rate: 8 }]], flatdemandmonths: [0,0,0,0,0,0,0,0,0,0,0,0],
            demandratestructure: [[{ rate: 0 }], [{ rate: 12 }]],
            demandweekdayschedule: Array.apply(null, Array(12)).map(function () { return Array.apply(null, Array(24)).map(function (x, h) { return h >= 12 && h < 20 ? 1 : 0; }); }) };
var W = SIZING.size(monthlyReq({ tariff: { urdb: MIX } }));
ok(W.ok && W.warnings.some(function (w) { return /onPeakKw/.test(w) && /12 of 12/.test(w); }), 'an on-peak charge with no on-peak kW on the bills is flagged, not guessed');
var rowsOn = bills12().map(function (r) { r.onPeakKw = r.demandKw * 0.95; return r; });
var WO = SIZING.size(monthlyReq({ load: { mode: 'monthly', rows: rowsOn }, tariff: { urdb: MIX } }));
ok(WO.ok && !WO.warnings.some(function (w) { return /onPeakKw/.test(w); }) && WO.baseDemandCostYr > W.baseDemandCostYr, 'with on-peak kW stated, the on-peak charge is billed and the flag clears');
var UR = SIZING.size(monthlyReq({ tariff: { urdb: { flatdemandstructure: [[{ rate: 18 }]], flatdemandmonths: [0,0,0,0,0,0,0,0,0,0,0,0], demandratchetpercentage: 80 } } }));
eq(UR.settings.ratchet, 80, 'a URDB ratchet stands in when the request states none');
var UR0 = SIZING.size(monthlyReq({ tariff: { ratchetPct: 0, urdb: { flatdemandstructure: [[{ rate: 18 }]], flatdemandmonths: [0,0,0,0,0,0,0,0,0,0,0,0], demandratchetpercentage: 80 } } }));
eq(UR0.settings.ratchet, 0, 'a stated ratchet, zero included, wins');
var IU = SIZING.size({ load: { mode: 'interval', values: interval8760() }, tariff: { urdb: FLAT18 } });
ok(IU.ok && IU.warnings.some(function (w) { return /monthly bills only/.test(w); }), 'on interval data the tariff is flagged as not applied');
near(IU.system.kw, SIZING.size({ load: { mode: 'interval', values: interval8760() } }).system.kw, 1e-9, 'and changes nothing');

/* ── 7. what does not pencil ──────────────────────────────────────────── */
console.log('when nothing pays');
var X = SIZING.size(monthlyReq({ bess: { capexPerKwh: 4000, capexPerKw: 2000 } }));
ok(X.ok && X.warnings.some(function (w) { return /No size pays back/.test(w); }), 'a battery nobody should build is sized and flagged, not hidden');
ok(X.alternatives.length === 1 && X.alternatives[0].chosen, 'and no other duration is offered as if it paid');
var flat = []; for (var fi = 0; fi < 8760; fi++) flat.push(500);
var F = SIZING.size({ load: { mode: 'interval', values: flat } });
ok(F.ok === false && F.field === 'load' && /too flat/.test(F.error), 'a flat load is refused with a reason');
var heavy = bills12(); heavy[0].kwh = 600 * 31 * 24 * 1.2;
ok(SIZING.size(monthlyReq({ load: { mode: 'monthly', rows: heavy } })).warnings.some(function (w) { return /Jan 2025/.test(w) && /around the clock/.test(w); }), 'a bill using more than its peak around the clock is flagged');
var long = bills12(); long[1].days = 33;
var LG = SIZING.size(monthlyReq({ load: { mode: 'monthly', rows: long } }));
ok(LG.ok && LG.savings.netY1 !== M.savings.netY1, 'a stated billing period changes the modelled shape');
var leapFeb = SIZING.size(monthlyReq({ load: { mode: 'monthly', rows: bills12(2024) } }));
ok(leapFeb.ok && leapFeb.savings.netY1 !== SIZING.size(monthlyReq({ load: { mode: 'monthly', rows: bills12(2023) } })).savings.netY1, 'a leap February is billed over 29 days, not the adapter\'s 28');

/* ── 8. refusals ──────────────────────────────────────────────────────── */
console.log('refusals');
function withRows(fn) { var r = bills12(); fn(r); return monthlyReq({ load: { mode: 'monthly', rows: r } }); }
var years12 = []; for (var yi = 0; yi < 8760 * 12; yi++) years12.push(300);
var CASES = [
  [null, null, /must be an object/],
  [{}, 'load', /load is required/],
  [{ load: { mode: 'daily' } }, 'load.mode', /interval' or 'monthly/],
  [{ load: { mode: 'interval', values: 'x' } }, 'load.values', /array/],
  [{ load: { mode: 'interval', values: [1, 2, 3] } }, 'load.values', /8,760 to 105,408/],
  [{ load: { mode: 'interval', values: interval8760().map(function (v, i) { return i === 99 ? -1 : v; }) } }, 'load.values', /finite nonnegative kW/],
  [{ load: { mode: 'interval', values: interval8760().map(function (v, i) { return i === 7 ? '5' : v; }) } }, 'load.values', /finite nonnegative kW/],
  [{ load: { mode: 'interval', values: interval8760().concat([1, 2, 3]) } }, 'load.intervalMin', /not one whole year/],
  [{ load: { mode: 'interval', values: interval8760(), intervalMin: 7 } }, 'load.intervalMin', /5, 10, 15, 20, 30 or 60/],
  [{ load: { mode: 'interval', values: interval8760(), startMonth: 12 } }, 'load.startMonth', /0 \(January\) to 11/],
  [{ load: { mode: 'interval', values: interval8760(), startMonth: 1.5 } }, 'load.startMonth', /0 \(January\) to 11/],
  [{ load: { mode: 'interval', values: interval8760(), startYear: 25 } }, 'load.startYear', /four-digit/],
  [{ load: { mode: 'interval', values: years12.slice(0, 105120), intervalMin: 60 } }, 'load.values', /at most 24 months/],
  [{ load: { mode: 'monthly', rows: [] } }, 'load.rows', /1 to 24/],
  [{ load: { mode: 'monthly', rows: bills12().concat(bills12(2026)).concat(bills12(2027).slice(0, 1)) } }, 'load.rows', /1 to 24/],
  [withRows(function (r) { r[3] = 'x'; }), 'load.rows[3]', /must be an object/],
  [withRows(function (r) { r[3].month = 12; }), 'load.rows[3].month', /0 \(January\) to 11/],
  [withRows(function (r) { delete r[0].year; }), 'load.rows[0].year', /four-digit/],
  [withRows(function (r) { r[2].demandKw = 0; }), 'load.rows[2]', /billed demand above zero/],
  [withRows(function (r) { r[2].kwh = -5; }), 'load.rows[2]', /nonnegative usage/],
  [withRows(function (r) { r[5].month = 2; }), 'load.rows[5]', /date order/],
  [withRows(function (r) { r[1].month = 0; }), 'load.rows[1]', /no month repeated/],
  [withRows(function (r) { r[0].days = 70; }), 'load.rows[0].days', /1 to 62 days/],
  [withRows(function (r) { r[0].onPeakKw = -1; }), 'load.rows[0].onPeakKw', /nonnegative/],
  [monthlyReq({ tariff: 'x' }), 'tariff', /must be an object/],
  [monthlyReq({ tariff: { demandChargePerKw: 'abc' } }), 'tariff.demandChargePerKw', /finite nonnegative/],
  [monthlyReq({ tariff: { energyRate: -0.1 } }), 'tariff.energyRate', /finite nonnegative/],
  [monthlyReq({ tariff: { ratchetPct: 80 } }), 'tariff.ratchetPct', /fraction between 0 and 1/],
  [monthlyReq({ tariff: { urdb: [] } }), 'tariff.urdb', /OpenEI URDB shape/],
  [monthlyReq({ tariff: { urdb: { flatdemandstructure: [[{ rate: 5000 }]] } } }), 'tariff.urdb.flatdemandstructure', /between 0 and 1000/],
  [monthlyReq({ tariff: { urdb: { demandratchetpercentage: 150 } } }), 'tariff.urdb.demandratchetpercentage', /between 0 and 100/],
  [monthlyReq({ bess: 'x' }), 'bess', /must be an object/],
  [monthlyReq({ bess: { capexPerKwh: 'lots' } }), 'bess.capexPerKwh', /finite nonnegative/],
  [monthlyReq({ bess: { rtePct: 0 } }), 'bess.rtePct', /greater than zero and at most 100/],
  [monthlyReq({ bess: { rtePct: 120 } }), 'bess.rtePct', /cannot exceed 100/],
  [monthlyReq({ bess: { dodPct: 0 } }), 'bess.dodPct', /greater than zero/],
  [monthlyReq({ bess: { cRate: 20 } }), 'bess.cRate', /C-rate/],
  [monthlyReq({ bess: { fadePctYr: 150 } }), 'bess.fadePctYr', /exceeds 100%/],
  [monthlyReq({ bess: { minSohPct: 0 } }), 'bess.minSohPct', /state of health/],
  [monthlyReq({ bess: { minSohPct: 'x' } }), 'bess.minSohPct', /Invalid bess.minSohPct/],
  [monthlyReq({ bess: { replPerKwh: -1 } }), 'bess.replPerKwh', /Invalid/],
  [monthlyReq({ bess: { headroomPct: 150 } }), 'bess.headroomPct', /at most 100/],
  [monthlyReq({ bess: { durations: [5] } }), 'bess.durations', /1, 2, 3, 4, 6 and 8/],
  [monthlyReq({ bess: { durations: [1, 2, 3, 4, 6, 8, 1] } }), 'bess.durations', /one to six/],
  [monthlyReq({ finance: { termYears: 0 } }), 'finance.termYears', /1 to 50 years/],
  [monthlyReq({ finance: { termYears: 51 } }), 'finance.termYears', /1 to 50 years/],
  [monthlyReq({ finance: { termYears: 20.5 } }), 'finance.termYears', /whole number/],
  [monthlyReq({ finance: { escalatorPct: -1 } }), 'finance.escalatorPct', /finite nonnegative/],
  [monthlyReq({ finance: { itcPct: 120 } }), 'finance.itcPct', /cannot exceed 100/]
];
CASES.forEach(function (c, i) {
  var out, threw = null;
  try { out = SIZING.size(c[0]); } catch (e) { threw = e; }
  var v = SIZING.validate(c[0]);
  ok(!threw && out && out.ok === false && out.field === c[1] && c[2].test(out.error) &&
     v.ok === false && v.field === out.field && v.error === out.error,
     'refused #' + i + ' at ' + c[1] + (threw ? ' - THREW ' + threw.message : (out && out.ok === false ? ': ' + out.error + (out.field !== c[1] ? ' [field ' + out.field + ']' : '') : ' - was accepted')));
});
eq(SIZING.validate(monthlyReq()).ok, true, 'validate() passes a good request');
var dup = SIZING.size(monthlyReq({ bess: { durations: [4, 2, 4] } }));
eq(JSON.stringify(dup.settings.durations), '[2,4]', 'durations are de-duplicated and ordered');

/* ── 9. one set of rules, one copy ────────────────────────────────────── */
console.log('shared validation');
var sizeSrc = fs.readFileSync(path.join(ROOT, 'api/bess-size.js'), 'utf8');
ok(sizeSrc.indexOf('Invalid months or battery durations') < 0 && sizeSrc.indexOf('TARIFF_LIMITS') < 0 &&
   sizeSrc.indexOf('numberKeys') < 0, 'bess-size.js carries no second copy of the checks');
ok(/toolEngine\.validate/.test(sizeSrc), 'bess-size.js validates through the shared module');
ok(ENGINE.validate === require(path.join(ROOT, 'api/_lib/bess-size-validate')), 'the engine carries the same module the bridge requires');
['api/_lib/proforma-sizing.js', 'api/_lib/bess-size-validate.js'].forEach(function (f) {
  var src = fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  var bad = [/=>/, /\bconst\b/, /\blet\b/, /`/, /\bclass\b/, /\basync\b/, /\.\.\./, /\?\./, /Object\.assign/, /\.includes\(/,
             /\.find(Index)?\(/, /\.startsWith\(/, /\.padStart\(/, /Object\.(entries|values)\(/, /Number\.isInteger/].filter(function (re) { return re.test(src); });
  ok(!bad.length, f + ' is ES5' + (bad.length ? ' (found ' + bad.join(' ') + ')' : ''));
  ok(fs.readFileSync(path.join(ROOT, f), 'utf8').indexOf('/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.') === 0, f + ' carries the header');
});

/* ── 10. performance ──────────────────────────────────────────────────── */
console.log('performance');
var big = interval35040();
var pRun = timed(function () { return SIZING.size({ load: { mode: 'interval', values: big, startYear: 2025 }, bess: { durations: [1, 2, 4, 6] }, finance: { termYears: 25 } }); });
console.log('       (' + pRun.ms + ' ms for 35,040 quarter-hour readings x 4 durations)');
ok(pRun.out.ok && pRun.out.load.intervalMin === 15, 'a quarter-hour year sizes, interval read from the count');
ok(pRun.ms < 10000, 'in under 10 s (' + pRun.ms + ' ms)');
ok(JSON.stringify(pRun.out).length < 20000, 'and the answer is still small (' + JSON.stringify(pRun.out).length + ' bytes)');

console.log('\n' + (fails ? fails + ' FAILED, ' : '') + passes + ' checks passed');
process.exitCode = fails ? 1 : 0;
