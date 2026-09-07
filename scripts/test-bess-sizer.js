#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-bess-sizer.js — invariants for the BESS sizing engine
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The engine lives inside editor.html, so this extracts the IIFE and runs it
   in node. Testing the shipped source rather than a copy is the whole point:
   a copy drifts, and every bug below was in code that read correctly.

   These are not unit tests of arithmetic. They are the four things that were
   ACTUALLY WRONG, written down so they cannot come back quietly:

     1. Arbitrage claimed more than one cycle a day — 455 cycles, 1.25x the
        physical ceiling, moving payback from 7.8 years to 4.4.
     2. Every candidate was disqualified as recharge-tight on any site with a
        morning and an afternoon peak, so the eligible list was always empty
        and the fallback picked the smallest battery in the sweep: 29 kW on a
        1,150 kW site.
     3. A shave deeper than a month's peak-to-baseline made eventsAbove
        return one event spanning the whole month, asking for 1,366,666 kWh
        and $546 million.
     4. Savings were credited for the swept shave on every month, including
        months physically capped well below it — 2.5x overstatement.

   Run: node scripts/test-bess-sizer.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');

var HTML = path.join(__dirname, '..', 'editor.html');
var src = fs.readFileSync(HTML, 'utf8');
var i = src.indexOf('  if (window.OmegaBessSizerEngine) return;');
if (i < 0) { console.error('FAIL: the sizer engine is not in editor.html any more'); process.exit(1); }
i = src.lastIndexOf('(function () {', i);
var j = src.indexOf('window.OmegaBessSizerEngine =', i);
var k = src.indexOf('})();', j);
var sandbox = { window: {}, console: console };
sandbox.window.window = sandbox.window;
vm.createContext(sandbox);
vm.runInContext('var window = this.window;\n' + src.slice(i, k + 5), sandbox);
var E = sandbox.window.OmegaBessSizerEngine;

var fails = 0, checks = 0;
function ok(cond, name, detail) {
  checks++;
  if (cond) { console.log('  ok   ' + name); return; }
  fails++;
  console.log('  FAIL ' + name + (detail ? '\n         ' + detail : ''));
}

/* A year of hourly kW with TWO peaks a day — the shape of a facility with a
   shift change, and the case the old recharge test disqualified outright. */
function twoPeakYear() {
  var days = [31,28,31,30,31,30,31,31,30,31,30,31], out = [];
  for (var m = 0; m < 12; m++) {
    var seasonal = 0.75 + 0.25 * Math.sin((m - 3) / 12 * 2 * Math.PI) + (m === 6 ? 0.15 : 0);
    for (var d = 0; d < days[m]; d++) {
      for (var h = 0; h < 24; h++) {
        var v = 400;
        if (h >= 9  && h < 12) v = 1000 * seasonal;
        if (h >= 14 && h < 17) v = 1000 * seasonal * 0.98;
        if (h >= 7  && h < 9)  v = 560;
        if (h >= 17 && h < 20) v = 520;
        out.push(Math.round(v));
      }
    }
  }
  return out;
}

function tariff(o) {
  return Object.assign({ demandChargePerKw: 18, energyRate: 0.11, touSpread: 0,
    ratchetPct: 0, capexPerKwh: 400, capexPerKw: 250, maxC: 0.5, targetPaybackYr: 7 }, o || {});
}

var vals = twoPeakYear();
var D = E.derate();
var annualPeak = Math.max.apply(null, vals);

console.log('\nBESS sizer — ' + vals.length + ' hourly intervals, ' + annualPeak + ' kW peak\n');

/* ── 1. nothing may claim more than one cycle a day ──────────────────── */
var spread = E.sizeFromInterval(vals, { intervalMin: 60, tariff: tariff({ touSpread: 0.15 }) });
ok(spread.ok, 'sizes with a TOU spread', spread.error);
var overCycled = (spread.candidates || []).filter(function (c) {
  return (c.arbitrageKwh || 0) > c.nameplateKwh * D * 365 * 1.0001;
});
ok(overCycled.length === 0,
   'no candidate arbitrages more than one cycle a day',
   overCycled.length ? overCycled.length + ' of ' + spread.candidates.length + ' do' : '');

/* Arbitrage must also not be credited on energy demand shaving already used. */
var anyArb = (spread.candidates || []).filter(function (c) { return c.arbitrageKwh > 0; });
ok(anyArb.every(function (c) {
     return c.arbitrageKwh <= c.nameplateKwh * D * 365 - (c.throughputKwh || 0) + 1e-6;
   }), 'arbitrage competes with demand shaving rather than adding to it');

/* ── 2. no absurd sizes anywhere in the sweep ────────────────────────── */
var base = E.sizeFromInterval(vals, { intervalMin: 60, tariff: tariff() });
ok(base.ok, 'sizes on a plain demand tariff', base.error);
var absurd = (base.candidates || []).filter(function (c) {
  return !isFinite(c.nameplateKwh) || c.nameplateKwh < 0 ||
         c.nameplateKwh > annualPeak * 24 ||          /* a day at full peak is the ceiling */
         !isFinite(c.capex) || c.capex < 0;
});
ok(absurd.length === 0,
   'no candidate exceeds a day of storage at full site peak',
   absurd.length ? 'worst: ' + Math.round(absurd[0].nameplateKwh).toLocaleString() + ' kWh' : '');

/* ── 3. a two-peak site still gets a real recommendation ─────────────── */
var strong = E.sizeFromInterval(vals, { intervalMin: 60,
  tariff: tariff({ demandChargePerKw: 35, capexPerKwh: 250, capexPerKw: 150 }) });
ok(strong.ok && strong.recommended, 'recommends on a tariff that pays', strong.error);
ok(strong.metTarget === true, 'meets the payback target when the tariff supports it');
ok(strong.recommended.powerKw > annualPeak * 0.2,
   'does not collapse to a token battery on a two-peak site',
   'got ' + Math.round(strong.recommended.powerKw) + ' kW on a ' + annualPeak + ' kW site');

/* ── 4. per-month capping is reflected in the savings, not just the size ─ */
var deep = (base.candidates || []).filter(function (c) { return c.monthsCapped > 0; })[0];
ok(!!deep, 'the sweep reaches depths some months cannot take');
if (deep) {
  var flat = E.billedDemand(base.meta.peaks, deep.shaveKw, 0);
  var perMonth = E.billedDemand(base.meta.peaks,
    deep.months.map(function (m) { return m.shaveKw; }), 0);
  var flatCost = flat.reduce(function (s, kw) { return s + kw * 18; }, 0);
  var realCost = perMonth.reduce(function (s, kw) { return s + kw * 18; }, 0);
  ok(realCost > flatCost,
     'a capped month is billed more than the swept shave would imply',
     'flat $' + Math.round(flatCost).toLocaleString() + ' vs real $' + Math.round(realCost).toLocaleString());
  ok(Math.abs(deep.demandSavingsYr - (base.baseDemandCostYr - realCost)) < 1,
     'reported savings use the per-month shave, not the swept one');
}

/* ── 5. the ratchet costs money, it does not make it ─────────────────── */
var noR = E.sizeFromInterval(vals, { intervalMin: 60, tariff: tariff({ demandChargePerKw: 35 }) });
var wiR = E.sizeFromInterval(vals, { intervalMin: 60, tariff: tariff({ demandChargePerKw: 35, ratchetPct: 0.6 }) });
ok(noR.ok && wiR.ok, 'sizes with and without a ratchet');
ok(wiR.baseDemandCostYr >= noR.baseDemandCostYr,
   'a ratchet raises the baseline bill it is measured against');

/* ── 6. the power rating is one number everywhere ────────────────────── */
var inconsistent = (base.candidates || []).filter(function (c) {
  var maxApplied = Math.max.apply(null, c.months.map(function (m) { return m.shaveKw; }));
  return Math.abs(c.powerKw - maxApplied) > 0.001;
});
ok(inconsistent.length === 0,
   'capex, C-rate and savings all price the same kW',
   inconsistent.length + ' candidates disagree');

/* ── 7. the guard the engine already promised ────────────────────────── */
ok(E.sizeFromInterval([1, 2, 3], {}).ok === false, 'refuses to size from three readings');

console.log('\n' + (fails ? fails + ' of ' + checks + ' FAILED' : 'all ' + checks + ' checks passed') + '\n');
process.exit(fails ? 1 : 0);
