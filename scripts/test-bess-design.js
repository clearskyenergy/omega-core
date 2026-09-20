/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
/* Tests for api/_lib/bess-design-engine.js.
 *
 * The first block is a cell-for-cell regression against the Electrical
 * Engineering Design Calculator R3.0i on its own worked example. Those
 * numbers are the contract: the engine exists because a spreadsheet nobody
 * can audit was being emailed to customers, and a port that quietly drifts
 * from it is worse than no port at all.
 *
 * Run: node scripts/test-bess-design.js
 */
'use strict';
var E = require('../api/_lib/bess-design-engine');

var pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (got !== undefined ? '  got: ' + got : '')); }
}
function eq(name, got, want, tol) {
  tol = tol == null ? 1e-9 : tol;
  var good = (typeof want === 'number')
    ? (typeof got === 'number' && isFinite(got) && Math.abs(got - want) <= tol)
    : got === want;
  ok(name + ' = ' + want, good, JSON.stringify(got));
}
function section(t) { console.log('\n' + t); }

/* ------------------------------------------------------------------ *
 *  The R3.0i worked example, exactly as the workbook states it.
 * ------------------------------------------------------------------ */
var WB = {
  loadMw: 1, durationH: 4, dodPct: 90, rtePct: 93, otherEffPct: 100,
  cRate: 0.5, unitMwh: 5, pcsUnitMw: 0.135,
  chargeGridMw: 0.5, chargeOtherMw: 0, chargeWindowH: 16,
  pcsOutputKv: 0.4, systemKv: 33, powerFactor: 0.85,
  transformerBuffer: 1.25, breakerBuffer: 1.25, impedancePct: 6,
  transformerCategory: 'Dry Type', vectorGroup: 'Yyn0',
  cableCa: 0.94, cableCg: 0.8, cableCi: 1, cableLengthM: 50,
  gridFaultMva: 500, cycleLife: 6000, cyclesPerDay: 1, cycleDaysPerYear: 300
};

section('R3.0i workbook — capacity chain (BESS Sizing I5:I8, E6:E7)');
var r = E.design(WB);
eq('initial energy MWh', r.capacity.initialMwh, 4);
eq('after depth of discharge', r.capacity.afterDodMwh, 4.4445);
eq('after round-trip', r.capacity.afterRteMwh, 4.6088);
eq('required capacity', r.capacity.requiredMwh, 4.6088);
eq('battery units', r.capacity.units, 1);
eq('installed capacity', r.capacity.installedMwh, 5);
ok('energy-limited, not C-rate limited', r.capacity.binding === 'energy', r.capacity.binding);

section('R3.0i workbook — converters and charging (I26:I27, I22:I23)');
eq('converter units', r.pcs.units, 8);
eq('total converter power MW', r.pcs.totalMw, 1.08, 1e-9);
eq('available charging power MW', r.pcs.chargeMw, 0.5);
eq('full charge time h', r.pcs.fullChargeH, 9.4, 1e-9);
ok('charge fits the window', r.pcs.fullChargeH <= r.pcs.chargeWindowH);

section('R3.0i workbook — transformer (E8, I30, I31, E42)');
eq('required duty kVA', r.transformer.requiredKva, 1589);
eq('rating MVA', r.transformer.ratingMva, 1.6);
eq('units', r.transformer.units, 1);
ok('identified as a step-up', /Step-Up/.test(r.transformer.kind), r.transformer.kind);

section('R3.0i workbook — currents, breakers and cable (I34, I35, I38, J39)');
eq('primary current A', r.electrical.primaryCurrentA, 1834);
eq('primary design current A (NEC 125%)', r.electrical.primaryBreaker.designA, 2293);
eq('primary breaker frame A', r.electrical.primaryBreaker.frameA, 2500);
eq('AC cable size mm2', r.electrical.primaryCable.sizeMm2, 300);
eq('AC cable runs', r.electrical.primaryCable.runs, 9);
eq('total derating factor', r.electrical.primaryCable.totalDerating, 0.752, 1e-9);
eq('secondary current A', r.electrical.secondaryCurrentA, 23);
eq('secondary breaker frame A', r.electrical.secondaryBreaker.frameA, 63);
eq('secondary cable size mm2', r.electrical.secondaryCable.sizeMm2, 6);

section('R3.0i workbook — Payback Period (Grid), Malaysian tariff as published');
var life = E.lifecycle(
  { installedMwh: 1.044, rtePct: 88, dodPct: 90, durationH: 4 },
  { totalMw: 0.540 },
  { capex: 832000, replacementCapex: 832000, opexPctOfCapex: 2, discountRate: 8,
    escalation: 3, minSohPct: 70, sohFadePctPerYear: 1.5, auxPct: 0,
    demandRatePerKw: 89.27, onPeakRate: 0.2983, offPeakRate: 0.2983,
    fuelAdjRate: 0.0138, utilityTaxPct: 1.6, peakDaysPerMonth: 26,
    demandWindowH: 4, analysisYears: 20 });
eq('year 1 state of health %', life.rows[0].sohPct, 98.5);
eq('year 1 demand reduction kW', life.rows[0].mdReductionKw, 217.1, 0.05);
eq('year 1 demand savings', life.rows[0].demandSavings, 232513, 1);
eq('year 1 net', life.rows[0].net, 207889, 1);
eq('simple payback yr', life.paybackYears, 3.91, 0.01);
eq('discounted payback yr', life.discountedPaybackYears, 4.86, 0.01);
eq('NPV', life.npv, 1422244, 1);
eq('IRR %', +(life.irr * 100).toFixed(2), 26.11, 0.01);
eq('20-year cumulative', life.cumulativeSavings, 3905774, 1);
ok('no replacement inside 20 years', life.replacements === 0, life.replacements);

/* ------------------------------------------------------------------ *
 *  Behaviour the workbook implies but never states in one place.
 * ------------------------------------------------------------------ */
section('C-rate is a floor on capacity, not a comment');
var fast = E.design({ loadMw: 1, durationH: 1, cRate: 0.5, unitMwh: 0.5, dodPct: 100,
                      rtePct: 100, otherEffPct: 100 });
ok('short duration becomes power-limited', fast.capacity.binding === 'c-rate', fast.capacity.binding);
eq('capacity is set by the C-rate floor', fast.capacity.requiredMwh, 2);
var slow = E.design({ loadMw: 1, durationH: 8, cRate: 0.5, unitMwh: 0.5, dodPct: 100,
                      rtePct: 100, otherEffPct: 100 });
ok('long duration stays energy-limited', slow.capacity.binding === 'energy', slow.capacity.binding);

section('Converter count follows the larger of charge and discharge duty');
var chargeHeavy = E.design({ loadMw: 1, durationH: 4, pcsUnitMw: 0.5, chargeGridMw: 3 });
ok('sized for the 3 MW charge, not the 1 MW discharge',
   chargeHeavy.pcs.totalMw >= 3, chargeHeavy.pcs.totalMw);

section('Fault level is taken at the bus the gear sits on');
ok('converter-bus fault is the low-voltage one', r.electrical.fault.busKv === 0.4, r.electrical.fault.busKv);
ok('system-bus fault is reported separately', r.electrical.systemFault.busKv === 33,
   r.electrical.systemFault.busKv);
ok('the two differ by orders of magnitude, as the turns ratio requires',
   r.electrical.fault.iscKa > r.electrical.systemFault.iscKa * 20,
   r.electrical.fault.iscKa + ' vs ' + r.electrical.systemFault.iscKa);
ok('switchgear Icu is chosen against the converter bus',
   r.electrical.switchgear.faultKa === r.electrical.fault.iscKa);
ok('Icu is a standard rating at or above the duty with margin',
   r.electrical.switchgear.icuKa >= r.electrical.fault.iscKa * r.electrical.switchgear.margin,
   r.electrical.switchgear.icuKa);
var noInv = E.design(Object.assign({}, WB, { inverterFaultMultiple: 0 }));
ok('converter contribution can be excluded and the total drops',
   noInv.electrical.fault.iscKa < r.electrical.fault.iscKa,
   noInv.electrical.fault.iscKa + ' vs ' + r.electrical.fault.iscKa);
var stiff = E.design(Object.assign({}, WB, { gridFaultMva: 0 }));
ok('a zero source fault level means an infinite bus, and raises the duty',
   stiff.electrical.fault.stiffSourceAssumed &&
   stiff.electrical.fault.iscKa > r.electrical.fault.iscKa,
   stiff.electrical.fault.iscKa);

section('A neutral has to come from somewhere');
var island = { loadMw: 1, durationH: 4, pcsOutputKv: 0.48, systemKv: 0.48,
               blackStart: 'Required', pcsHasNeutral: 'No', connectionType: '3P4W+E' };
var bad = E.design(Object.assign({}, island, { vectorGroup: 'Dd0' }));
ok('an isolation transformer is required when voltages match but a neutral is not available',
   bad.transformer.needed, bad.transformer.kind);
ok('Dd0 fails the neutral check', !bad.transformer.neutralOk);
var good = E.design(Object.assign({}, island, { vectorGroup: 'Dyn11' }));
ok('Dyn11 passes it', good.transformer.neutralOk);
var gridTied = E.design({ loadMw: 1, durationH: 4, pcsOutputKv: 0.48, systemKv: 0.48 });
ok('a stable grid-tied system at matched voltage needs no transformer',
   !gridTied.transformer.needed, gridTied.transformer.kind);

section('Cable derating and parallel runs');
var noDerate = E.cableSizing(365, 400, { ca: 1, cg: 1, ci: 1, buffer: 1, lengthM: 50 });
eq('at the table condition a 365 A duty is one run', noDerate.runs, 1);
eq('and takes the largest listed size', noDerate.sizeMm2, 300);
var derated = E.cableSizing(365, 400, { ca: 0.94, cg: 0.8, ci: 1, buffer: 1, lengthM: 50 });
ok('derating pushes the same duty onto parallel runs', derated.runs > 1, derated.runs);
var zero = E.cableSizing(365, 400, { ca: 0, cg: 0.8, ci: 1, buffer: 1, lengthM: 50 });
ok('a zero derating factor is refused, not divided by', zero.valid === false);
var longRun = E.cableSizing(100, 400, { ca: 1, cg: 1, ci: 1, buffer: 1, lengthM: 2000,
                                        vdLimitPct: 3 });
ok('a long route fails the voltage-drop check', !longRun.dropOk, longRun.dropPct + '%');

section('Degradation books a replacement and resets the curve');
var repl = E.lifecycle(
  { installedMwh: 2, rtePct: 88, dodPct: 90, durationH: 4 },
  { totalMw: 1 },
  { capex: 2000000, replacementCapex: 2000000, sohFadePctPerYear: 3, minSohPct: 70,
    analysisYears: 20, demandRatePerKw: 20, peakDaysPerMonth: 22, demandWindowH: 4 });
ok('at 3%/yr fade the pack is replaced inside 20 years', repl.replacements >= 1, repl.replacements);
var yr = repl.firstReplacementYear;
ok('the replacement year carries the capex', repl.rows[yr - 1].replacementCapex < 0);
ok('and state of health resets to nameplate that year', repl.rows[yr - 1].sohPct === 100,
   repl.rows[yr - 1].sohPct);
ok('then fades again from there', repl.rows[yr].sohPct < 100, repl.rows[yr].sohPct);
var noRepl = E.lifecycle(
  { installedMwh: 2, rtePct: 88, dodPct: 90, durationH: 4 }, { totalMw: 1 },
  { capex: 2000000, sohFadePctPerYear: 1, minSohPct: 70, analysisYears: 20,
    demandRatePerKw: 20, peakDaysPerMonth: 22, demandWindowH: 4 });
ok('at 1%/yr it lasts the term', noRepl.replacements === 0, noRepl.replacements);
ok('and the replacement case is worth less than the one without',
   repl.npv < noRepl.npv, repl.npv + ' vs ' + noRepl.npv);

section('Solar string length takes the stricter of the two limits');
var s1 = E.solarStrings({ enabled: true, vdcMaxV: 1000, vocV: 49.04, vmpV: 40.89,
                          tMinC: 20, tMaxC: 45, kvVocPctPerC: -0.25, kvVmpPctPerC: -0.29,
                          mpptMinV: 250, mpptMaxV: 850 });
eq('max by Voc, from the R3.0i Solar sheet', s1.maxByVoc, 20);
eq('min by MPPT', s1.minByMppt, 7);
eq('max by MPPT', s1.maxByMppt, 20);
ok('a valid window exists', s1.feasible, s1.note);
var s2 = E.solarStrings({ enabled: true, vdcMaxV: 300, vocV: 49.04, vmpV: 40.89,
                          tMinC: -20, tMaxC: 45, kvVocPctPerC: -0.25, kvVmpPctPerC: -0.29,
                          mpptMinV: 600, mpptMaxV: 850 });
ok('an impossible inverter/module pairing is reported, not silently clamped',
   !s2.feasible, s2.note);

section('Design checks separate "not buildable" from "someone must decide"');
var clean = E.design({ loadMw: 0.5, durationH: 2, pcsOutputKv: 0.48, systemKv: 0.48,
                       unitMwh: 0.5, pcsUnitMw: 0.125, cableLengthM: 20, maxCableRuns: 8 });
ok('a simple matched-voltage system passes everything',
   clean.checks.overall === 'OK', clean.checks.overall + ' / ' + clean.checks.summary);
var overCharge = E.design({ loadMw: 1, durationH: 4, cRate: 0.1, unitMwh: 5,
                            chargeGridMw: 5, pcsUnitMw: 0.5 });
ok('charging past the C-rate is a FAIL, not a warning',
   overCharge.checks.overall === 'FAIL', overCharge.checks.overall);
var tightWindow = E.design({ loadMw: 1, durationH: 4, chargeGridMw: 0.05, chargeWindowH: 4 });
ok('a charge that cannot finish inside the window is a FAIL',
   tightWindow.checks.overall === 'FAIL', tightWindow.checks.overall);
ok('every check carries a status the UI knows how to colour',
   r.checks.checks.every(function (c) {
     return ['OK', 'REVIEW', 'FAIL', 'N/A'].indexOf(c.status) >= 0 && c.detail && c.name;
   }));

section('Nothing leaks NaN, Infinity or undefined into the answer');
var hostile = [
  { loadMw: 0.001, durationH: 0.1, unitMwh: 0.001, pcsUnitMw: 0.001 },
  { loadMw: 500, durationH: 12, unitMwh: 20, pcsUnitMw: 5, systemKv: 230, pcsOutputKv: 34.5 },
  { loadMw: 1, durationH: 4, chargeGridMw: 0, chargeOtherMw: 0 },
  { loadMw: 1, durationH: 4, phase: 'Single-Phase', pcsOutputKv: 0.24, systemKv: 0.24 },
  { loadMw: 1, durationH: 4, capex: 0, demandRatePerKw: 0, onPeakRate: 0, offPeakRate: 0 },
  { loadMw: 1, durationH: 4, analysisYears: 1 }
];
hostile.forEach(function (inp, i) {
  var out;
  try { out = E.design(inp); }
  catch (e) { ok('case ' + (i + 1) + ' does not throw', false, e.message); return; }
  var flat = JSON.stringify(out);
  ok('case ' + (i + 1) + ' returns clean JSON',
     flat.indexOf('null,null') < 0 && !/NaN|Infinity/.test(flat) &&
     out.capacity.units >= 0 && out.boq.length > 0,
     flat.length > 200 ? flat.slice(0, 200) + '…' : flat);
});

section('A zero-savings case reports no payback rather than a false one');
var dead = E.lifecycle({ installedMwh: 1, rtePct: 88, dodPct: 90, durationH: 4 },
  { totalMw: 0.5 },
  { capex: 5000000, demandRatePerKw: 0, onPeakRate: 0, offPeakRate: 0,
    analysisYears: 10, opexPctOfCapex: 2 });
ok('payback is null, not zero and not Infinity', dead.paybackYears === null, dead.paybackYears);
ok('NPV is negative', dead.npv < 0, dead.npv);
ok('IRR has no solution', dead.irr === null, dead.irr);

console.log('\n' + (fail ? fail + ' FAILED, ' : '') + pass + ' checks passed');
if (fail) process.exitCode = 1;
