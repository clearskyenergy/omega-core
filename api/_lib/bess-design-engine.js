/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var CAP = require('./bess-capacity');
/* ====================================================================== *
 *  BESS ELECTRICAL DESIGN ENGINE                                         *
 *  ------------------------------------------------------------------    *
 *  The Battery Sizer answers "how many kW and kWh does the bill justify".  *
 *  This answers the question that comes next: what does that system       *
 *  actually consist of, and is it buildable.                              *
 *                                                                         *
 *  Ported from the ClearSky electrical engineering workbooks:             *
 *    Electrical Engineering Design Calculator R3.0i                       *
 *    BESS Sizing Calculator R2.3+                                         *
 *    Payback Period Table Rev.0                                           *
 *                                                                         *
 *  Every number here is derived, not looked up from a product sheet, so    *
 *  it runs server-side: the standard-size tables, the derating method and  *
 *  the degradation/replacement schedule are the product, and the browser   *
 *  is public. The tool posts inputs and renders what comes back.           *
 *                                                                         *
 *  Units are stated on every field name. The workbook mixes MW, kW, kVA    *
 *  and A on one sheet; conflating them is the failure mode this file is    *
 *  written to avoid.                                                       *
 * ====================================================================== */

var SQRT3 = 1.7320508075688772;

/* ---------------------------------------------------------------------- *
 *  Standard size tables (IEC / common manufacturer ranges).
 *  These are the "Lookup Tables" sheet. Rounding UP to a real orderable
 *  size is the whole point: a calculated 1,589 kVA duty is bought as a
 *  1,600 kVA transformer, and every downstream current follows the size
 *  actually bought, not the duty.
 * ---------------------------------------------------------------------- */
var TABLES = {
  /* IEC 60076 transformer ratings, kVA */
  transformerKva: [25,50,75,100,160,200,250,315,400,500,630,800,1000,1250,1600,
                   2000,2500,3150,4000,5000,6300,8000,10000,12500],
  /* Breaker / switchgear rated current, A */
  breakerA: [63,100,160,250,400,630,800,1000,1250,1600,2000,2500,3200,4000,5000,6300],
  /* Busduct rated current, A */
  busductA: [400,630,800,1000,1250,1600,2000,2500,3200,4000,5000,6300],
  /* CT primary ratios, A */
  ctPrimaryA: [5,10,15,20,25,30,40,50,60,75,100,150,200,300,400,500,600,800,
               1000,1200,1500,2000,2500,3000,4000,5000],
  /* Breaker breaking capacity Icu, kA */
  icuKa: [16,20,25,31.5,36,40,50,65,80,100],
  /* CT burden ratings, VA */
  ctBurdenVa: [2.5,5,10,15,20,30]
};

/* Cable ampacity, single run, direct in ground. Index-aligned with the
   size labels and the mV/A/m voltage-drop figures beside them. */
var CABLE = {
  sizeMm2:   [1.5,2.5,4,6,10,16,25,35,50,70,95,120,150,185,240,300],
  ampAc:     [21,28,36,44,58,75,96,115,135,167,197,223,251,281,324,365],
  ampDc:     [25,33,43,53,71,91,116,139,164,203,239,271,306,343,395,446],
  mvPerAmAc: [29,18,11,7.3,4.4,2.8,1.75,1.25,0.93,0.63,0.47,0.38,0.30,0.25,0.195,0.165],
  mvPerAmDc: [33,20,12.7,8.4,5.1,3.2,2.02,1.44,1.07,0.73,0.54,0.44,0.35,0.29,0.225,0.19]
};

/* ---------------------------------------------------------------------- *
 *  Small helpers. The capacity chain compounds four roundings, so a helper
 *  that is a decimal place out shows up as a whole extra container on a
 *  large system rather than as a rounding difference.
 * ---------------------------------------------------------------------- */
function num(v, d) {
  var n = Number(v);
  return (v == null || v === '' || !isFinite(n)) ? d : n;
}
/* Excel's ROUNDUP goes AWAY from zero, which Math.ceil does not do for a
   negative value. Everything in this file is a positive magnitude, but the
   helper is written to match the spreadsheet rather than to match the cases
   that happen to reach it today. The epsilon keeps a binary-float 4.60880000004
   from rounding up to 4.6089 and buying a container nobody needs. */
function roundUp(v, dp) {
  var f = Math.pow(10, dp || 0), x = v * f;
  var r = v < 0 ? Math.floor(x + 1e-9) : Math.ceil(x - 1e-9);
  return r / f;
}
function round(v, dp) {
  var f = Math.pow(10, dp || 0);
  return Math.round(v * f) / f;
}
/* First standard size at or above x; the largest size if x exceeds the
   table. Callers that must not exceed the table divide by a unit count
   first, exactly as the workbook does. */
function stdUp(table, x) {
  for (var i = 0; i < table.length; i++) if (table[i] >= x - 1e-9) return table[i];
  return table[table.length - 1];
}
function maxOf(table) { return table[table.length - 1]; }
function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

/* ====================================================================== *
 *  1.  CAPACITY CHAIN
 *  Nameplate is not usable energy. The load wants MWh at the meter; the
 *  battery has to hold more, in this order, because each loss applies to
 *  the output of the one before it:
 *      energy at the load
 *    / depth of discharge        — what the cells are allowed to give up
 *    / sqrt(round-trip)          — the discharge half of the round trip
 *    / other efficiency          — transformer, auxiliaries, cable
 *  Then the C-rate floor: a 0.5C battery cannot deliver 1 MW from less
 *  than 2 MWh however little energy the duty needs, so the larger of the
 *  two governs and the tool says which one bound the answer.
 * ====================================================================== */
function capacityChain(inp) {
  var loadMw    = num(inp.loadMw, 1);
  var durationH = num(inp.durationH, 4);
  var unitMwh   = num(inp.unitMwh, 5);

  /* The chain itself lives in bess-capacity.js, shared with the sizing
     engine. Two copies of this arithmetic is how the sizer and the
     schedule came to disagree about what "nameplate" meant. */
  var c = CAP.chain(loadMw * durationH, loadMw, {
    dodPct: inp.dodPct, rtePct: inp.rtePct, otherEffPct: inp.otherEffPct,
    cRate: inp.cRate, unitMwh: unitMwh
  });

  return {
    loadMw: loadMw, durationH: durationH,
    dodPct: c.dodPct, rtePct: c.rtePct, otherEffPct: c.otherEffPct,
    cRate: c.cRate, unitMwh: unitMwh,
    initialMwh: c.usableMwh,
    afterDodMwh: c.afterDodMwh,
    afterRteMwh: c.afterRteMwh,
    afterOtherMwh: c.afterOtherMwh,
    cRateFloorMwh: c.cRateFloorMwh,
    cRateBound: c.cRateBound,
    requiredMwh: c.requiredMwh,
    units: c.units,
    installedMwh: c.installedMwh,
    spareMwh: c.spareMwh,
    /* What the INSTALLED pack delivers, not what the duty asked for: the
       quantised pack is usually larger, and the lifecycle table has to
       know the real number. */
    usableMwh: round(CAP.usableFromNameplateMwh(c.installedMwh, {
      dodPct: c.dodPct, rtePct: c.rtePct, otherEffPct: c.otherEffPct }), 4),
    effectiveCRate: c.installedMwh > 0 ? round(loadMw / c.installedMwh, 4) : 0,
    /* What bound the answer, in one word, so the UI never has to guess. */
    binding: c.binding
  };
}

/* ====================================================================== *
 *  2.  POWER CONVERSION SYSTEM AND THE CHARGE WINDOW
 *  PCS count is set by the larger of discharge duty and charge duty — a
 *  site that charges at 2 MW needs the converters for it even if it only
 *  ever discharges at 1 MW.
 * ====================================================================== */
function pcsSizing(cap, inp) {
  var unitMw      = num(inp.pcsUnitMw, 0.135);
  var chargeGridMw= num(inp.chargeGridMw, 0);
  var chargeOtherMw= num(inp.chargeOtherMw, 0);
  var windowH     = num(inp.chargeWindowH, 16);

  var dischargeMw = cap.loadMw;
  var chargeMw    = round(chargeGridMw + chargeOtherMw, 4);
  var dutyMw      = Math.max(dischargeMw, chargeMw);
  var units       = unitMw > 0 ? Math.ceil(dutyMw / unitMw - 1e-9) : 0;
  var totalMw     = round(units * unitMw, 6);

  /* Energy that has to go back in, at the battery terminals, and the
     narrowest of the three things that limit how fast it can. */
  var rechargeMwh = cap.installedMwh * (cap.dodPct / 100) / Math.sqrt(cap.rtePct / 100);
  var cRateLimitMw= cap.cRate * cap.installedMwh;
  var limits      = [];
  if (cRateLimitMw > 0) limits.push({ mw: cRateLimitMw, by: 'battery C-rate' });
  if (chargeMw > 0)     limits.push({ mw: chargeMw,     by: 'available charging power' });
  if (totalMw > 0)      limits.push({ mw: totalMw,      by: 'converter rating' });

  var governing = null;
  for (var i = 0; i < limits.length; i++) {
    if (!governing || limits[i].mw < governing.mw) governing = limits[i];
  }

  var solarOnly = !(chargeMw > 0);
  var fullChargeH = (!solarOnly && governing && governing.mw > 0)
    ? roundUp(rechargeMwh / governing.mw, 1) : null;

  return {
    unitMw: unitMw, units: units, totalMw: totalMw,
    dischargeMw: dischargeMw, chargeMw: chargeMw,
    chargeGridMw: chargeGridMw, chargeOtherMw: chargeOtherMw,
    cRateLimitMw: round(cRateLimitMw, 4),
    rechargeMwh: round(rechargeMwh, 4),
    fullChargeH: fullChargeH,
    chargeLimitedBy: solarOnly ? null : (governing ? governing.by : null),
    chargeWindowH: windowH,
    solarOnly: solarOnly,
    coversDuty: totalMw >= dutyMw - 1e-9
  };
}

/* ====================================================================== *
 *  3.  TRANSFORMER
 *  Whether one is needed at all is a design decision, not an input: a
 *  voltage change forces one, and so does needing a local neutral for
 *  island or black-start duty on a system whose converters have none.
 * ====================================================================== */
function transformerSizing(pcs, inp) {
  var pcsKv    = num(inp.pcsOutputKv, 0.4);
  var systemKv = num(inp.systemKv, 33);
  var pf       = clamp(num(inp.powerFactor, 0.85), 0.01, 1);
  var buffer   = num(inp.transformerBuffer, 1.25);
  var category = inp.transformerCategory || 'Dry Type';
  var vector   = inp.vectorGroup || 'Yyn0';
  var impedancePct = num(inp.impedancePct, 6);
  var hasNeutral   = String(inp.pcsHasNeutral || 'No') === 'Yes';
  var connection   = inp.connectionType || '3P4W+E';
  var gridStability= inp.gridStability || 'Stable';
  var blackStart   = inp.blackStart || 'Not Required';

  var kind, needed = true;
  if (pcsKv < systemKv)      kind = 'Step-Up Transformer';
  else if (pcsKv > systemKv) kind = 'Step-Down Transformer';
  else if (!hasNeutral && connection !== '3P3W+E (No Neutral)' &&
           (gridStability !== 'Stable' || blackStart !== 'Not Required')) {
    kind = 'Isolation Transformer';
  } else { kind = 'No Need Transformer'; needed = false; }

  if (!needed) {
    return { needed: false, kind: kind, requiredKva: 0, units: 0, ratingKva: 0,
             ratingMva: 0, installedKva: 0, category: category, vectorGroup: vector,
             impedancePct: impedancePct, primaryKv: pcsKv, secondaryKv: systemKv,
             neutralOk: true, neutralNote: 'No transformer needed for this design.',
             aboveLargestStandard: false };
  }

  /* Duty is the converter fleet in kVA, grown by the sizing buffer. */
  var requiredKva = roundUp(pcs.totalMw * 1000 / pf * buffer, 0);
  var units       = Math.max(1, Math.ceil(requiredKva / maxOf(TABLES.transformerKva) - 1e-9));
  var ratingKva   = stdUp(TABLES.transformerKva, requiredKva / units);

  /* A neutral has to come from somewhere. Only these vector groups have a
     star point on the secondary; the others leave an islanded system with
     no reference and the check has to fail rather than warn. */
  var neutralGroups = ['Dyn11', 'Dyn1', 'Yyn0', 'Yzn11'];
  var neutralRequired = !hasNeutral && connection !== '3P3W+E (No Neutral)' &&
                        (gridStability !== 'Stable' || blackStart !== 'Not Required');
  var neutralOk = !neutralRequired || neutralGroups.indexOf(vector) >= 0;

  return {
    needed: true,
    kind: kind + ', ' + pcsKv + '/' + systemKv + 'kV',
    shortKind: kind,
    requiredKva: requiredKva,
    units: units,
    ratingKva: ratingKva,
    ratingMva: round(ratingKva / 1000, 3),
    installedKva: units * ratingKva,
    category: category,
    vectorGroup: vector,
    impedancePct: impedancePct,
    primaryKv: pcsKv,
    secondaryKv: systemKv,
    buffer: buffer,
    neutralRequired: neutralRequired,
    neutralOk: neutralOk,
    neutralNote: neutralRequired
      ? (neutralOk ? 'Neutral available from vector group ' + vector + '.'
                   : 'Island or black-start duty needs a neutral, and ' + vector +
                     ' has no secondary star point. Use Dyn11, Dyn1, Yyn0 or Yzn11.')
      : 'Neutral not required for this duty.',
    aboveLargestStandard: units > 1
  };
}

/* ====================================================================== *
 *  4.  CABLE
 *  Ampacity tables are published at a reference condition nobody installs
 *  in. Divide the design current by the product of the derating factors
 *  to get the ampacity the table must show, then split across runs.
 * ====================================================================== */
function cableSizing(designA, volts, opts) {
  var ca = num(opts.ca, 0.94), cg = num(opts.cg, 0.80), ci = num(opts.ci, 1.00);
  var lengthM = num(opts.lengthM, 50);
  var buffer  = num(opts.buffer, 1.25);
  var vdLimitPct = num(opts.vdLimitPct, 3);
  var dc = !!opts.dc;
  var amps = dc ? CABLE.ampDc : CABLE.ampAc;
  var mv   = dc ? CABLE.mvPerAmDc : CABLE.mvPerAmAc;
  var derate = ca * cg * ci;

  if (!(derate > 0) || !(volts > 0) || !(designA > 0)) {
    return { valid: false,
             note: 'A voltage, a design current or a derating factor is zero or negative. ' +
                   'Nothing on this cable schedule means anything until it is corrected.' };
  }

  var requiredAmpacity = roundUp(designA / derate, 0);
  var runs = requiredAmpacity <= maxOf(amps) ? 1
           : Math.ceil(requiredAmpacity / maxOf(amps) - 1e-9);
  var perRun = requiredAmpacity / runs;
  var idx = 0;
  while (idx < amps.length - 1 && amps[idx] < perRun - 1e-9) idx++;

  /* Voltage drop is carried by the OPERATING current, not the buffered
     design current: the buffer buys headroom, it does not flow. */
  var operatingA = buffer > 0 ? designA / buffer : designA;
  var dropV = round(mv[idx] * (operatingA / runs) * lengthM / 1000, 2);
  var dropPct = round(dropV / volts * 100, 2);

  return {
    valid: true,
    designA: round(designA, 0),
    operatingA: round(operatingA, 0),
    deratingCa: ca, deratingCg: cg, deratingCi: ci,
    totalDerating: round(derate, 4),
    requiredAmpacity: requiredAmpacity,
    sizeMm2: CABLE.sizeMm2[idx],
    runs: runs,
    lengthM: lengthM,
    spec: CABLE.sizeMm2[idx] + 'mm² × ' + runs + ' run' + (runs > 1 ? 's' : ''),
    dropV: dropV,
    dropPct: dropPct,
    dropLimitPct: vdLimitPct,
    dropOk: dropPct <= vdLimitPct + 1e-9
  };
}

/* ====================================================================== *
 *  5.  SWITCHGEAR AND BREAKERS
 *  NEC 210.20(A)/215.3: a continuous load is protected at 125% of its
 *  rating. The battery discharges for hours, so it is continuous.
 * ====================================================================== */
function breakerSelection(currentA, buffer) {
  var designA = currentA * buffer;
  var units = Math.max(1, Math.ceil(designA / maxOf(TABLES.breakerA) - 1e-9));
  var frameA = stdUp(TABLES.breakerA, designA / units);
  return {
    currentA: round(currentA, 0),
    designA: roundUp(designA, 0),
    frameA: frameA,
    units: units,
    spec: frameA + 'A × ' + units + ' unit' + (units > 1 ? 's' : ''),
    aboveLargestStandard: units > 1
  };
}

function lineCurrentA(powerKw, kv, pf, threePhase) {
  if (!(kv > 0) || !(pf > 0)) return 0;
  var w = powerKw * 1000;
  return threePhase ? w / (kv * 1000 * pf * SQRT3) : w / (kv * 1000 * pf);
}

/* ====================================================================== *
 *  6.  FAULT LEVEL — IEC 60909
 *  Two methods, both kept. The quick one adds impedance magnitudes and is
 *  slightly conservative; the R/X one splits each impedance by its X/R
 *  ratio and adds them as vectors, which is what a protection study does.
 *
 *  The fault is computed AT A NAMED BUS, because a step-up BESS has two
 *  and they are nothing like each other. The converters sit on the LV bus
 *  and the utility on the MV bus; the same transformer impedance referred
 *  to 0.4 kV and to 33 kV differs by the square of the turns ratio, so a
 *  figure taken at the wrong bus can be two orders of magnitude out and
 *  still look like a plausible number. Every piece of gear is checked
 *  against the fault at the bus it is actually bolted to.
 * ====================================================================== */
function faultLevel(tx, inp, busKv, busLabel, converterKw) {
  var method = inp.faultMethod === 'quick' ? 'quick' : 'rx';
  var txXr   = num(inp.transformerXr, 10);
  var gridXr = num(inp.gridXr, 10);
  var gridMva= num(inp.gridFaultMva, 500);
  var separateBus = String(inp.busArrangement || '') === 'separate';

  if (!tx.needed || !(tx.ratingKva > 0) || !(busKv > 0)) {
    return { applicable: false, busLabel: busLabel, busKv: busKv || null,
             note: 'No transformer in this design, so there is no transformer-limited ' +
                   'fault level to compute. Take the fault duty at the point of ' +
                   'connection from the utility study.' };
  }

  var contributing = separateBus ? 1 : tx.units;
  var fullLoadA = round(tx.ratingKva / (SQRT3 * busKv), 2);

  /* Both impedances are referred to THIS bus. Paralleled transformers put
     their impedances in parallel, so the fault current rises roughly in
     proportion to how many sit on the common bus. */
  var zTx = (tx.impedancePct / 100) * (busKv * busKv * 1000) / tx.ratingKva /
            Math.max(contributing, 1);
  var zGrid = gridMva > 0 ? (busKv * busKv) / gridMva : 0;

  var rTx = zTx / Math.sqrt(1 + txXr * txXr), xTx = rTx * txXr;
  var rGrid = zGrid / Math.sqrt(1 + gridXr * gridXr), xGrid = rGrid * gridXr;
  var rTot = rTx + rGrid, xTot = xTx + xGrid;

  var zTot = method === 'quick' ? (zTx + zGrid) : Math.sqrt(rTot * rTot + xTot * xTot);
  if (!(zTot > 0)) {
    return { applicable: false, busLabel: busLabel, busKv: busKv,
             note: 'Total impedance computed as zero; check the transformer rating and %Z.' };
  }

  var gridSideKa = round(busKv / (SQRT3 * zTot), 3);

  /* The converters are a source too, and on the LV bus they are not a
     small one. Unlike a machine they are current-limited by firmware to a
     fixed multiple of rated current, so this is a bounded contribution,
     not an impedance — it adds to the duty the LV gear must break. */
  var invMult = num(inp.inverterFaultMultiple, 1.2);
  var inverterKa = 0;
  if (converterKw > 0 && invMult > 0) {
    inverterKa = round(converterKw * 1000 / (SQRT3 * busKv * 1000) * invMult / 1000, 3);
  }
  var iscKa = round(gridSideKa + inverterKa, 2);

  var faultMva = round(SQRT3 * busKv * iscKa, 2);
  var kappa = xTot > 0 ? (1.02 + 0.98 * Math.exp(-3 * rTot / xTot)) : 1.8;
  var peakKa = round(method === 'quick' ? iscKa * 2.5 : kappa * Math.SQRT2 * iscKa, 2);

  return {
    applicable: true,
    busLabel: busLabel,
    method: method === 'quick' ? 'Reactance only (quick)' : 'R and X (IEC 60909)',
    busKv: busKv,
    contributingUnits: contributing,
    fullLoadA: fullLoadA,
    transformerZ: round(zTx, 6),
    gridZ: round(zGrid, 6),
    totalZ: round(zTot, 6),
    xOverR: rTot > 0 ? round(xTot / rTot, 2) : null,
    kappa: round(kappa, 3),
    gridSideKa: gridSideKa,
    inverterKa: inverterKa,
    inverterFaultMultiple: invMult,
    iscKa: iscKa,
    faultMva: faultMva,
    peakKa: peakKa,
    gridFaultMva: gridMva,
    stiffSourceAssumed: !(gridMva > 0)
  };
}

/* ====================================================================== *
 *  7.  BUSDUCT — the alternative when the cable answer is a trench full
 *  of parallel runs. Thermal rating is one check; short-circuit withstand
 *  at the stated duration is a separate, mandatory one.
 * ====================================================================== */
function busductSizing(powerKw, kv, pf, inp, fault) {
  var buffer = num(inp.breakerBuffer, 1.25);
  var lengthM= num(inp.busductLengthM, 20);
  var rmOhm  = num(inp.busductRmOhmPerM, 0.10);
  var xmOhm  = num(inp.busductXmOhmPerM, 0.08);
  var durationS = num(inp.faultDurationS, 1);

  var currentA = roundUp(lineCurrentA(powerKw, kv, pf, true) * buffer, 0);
  var ratingA = stdUp(TABLES.busductA, currentA);
  var sinPhi = Math.sqrt(Math.max(0, 1 - pf * pf));
  var dropV = round(SQRT3 * (currentA / buffer) * lengthM * (rmOhm * pf + xmOhm * sinPhi) / 1000, 2);

  return {
    currentA: currentA,
    ratingA: ratingA,
    aboveLargestStandard: currentA > maxOf(TABLES.busductA),
    lengthM: lengthM,
    dropV: dropV,
    dropPct: kv > 0 ? round(dropV / (kv * 1000) * 100, 2) : 0,
    requiredIcwKa: fault && fault.applicable ? fault.iscKa : null,
    faultDurationS: durationS
  };
}

/* ====================================================================== *
 *  8.  CURRENT TRANSFORMERS
 *  Metering and protection CTs are different animals. A metering CT is
 *  built to be accurate at rated current and saturates early on purpose;
 *  using one for protection gives a low reading at the exact moment the
 *  relay needs a true one.
 * ====================================================================== */
function ctSizing(loadA, inp, fault) {
  var buffer   = num(inp.ctBuffer, 1.25);
  var secondaryA = num(inp.ctSecondaryA, 5);
  var burdenVa = num(inp.ctBurdenVa, 5);
  var leadM    = num(inp.ctLeadLengthM, 20);
  var leadMm2  = num(inp.ctLeadMm2, 2.5);
  var leadTempC= num(inp.ctLeadTempC, 75);
  var accuracy = inp.ctAccuracyClass || '0.5S';
  var rct      = num(inp.ctRct, 0.5);
  var rl       = num(inp.ctRl, 0.3);
  var rr       = num(inp.ctRr, 0.1);
  var alf      = num(inp.ctAlf, 20);

  var requiredPrimaryA = roundUp(loadA * buffer, 2);
  var ratioPrimaryA = stdUp(TABLES.ctPrimaryA, requiredPrimaryA);

  /* Copper at 0.0175 ohm*mm2/m at 20 degC, corrected for operating
     temperature, over the round trip of the lead run. */
  var leadOhm = leadMm2 > 0
    ? 0.0175 * (1 + 0.00393 * (leadTempC - 20)) * 2 * leadM / leadMm2 : 0;
  var leadBurdenVa = round(secondaryA * secondaryA * leadOhm, 2);
  var totalBurdenVa = round(burdenVa + leadBurdenVa, 2);
  var burdenRatingVa = stdUp(TABLES.ctBurdenVa, totalBurdenVa);

  var out = {
    requiredPrimaryA: requiredPrimaryA,
    ratioPrimaryA: ratioPrimaryA,
    secondaryA: secondaryA,
    ratio: ratioPrimaryA + '/' + secondaryA + 'A',
    connectedBurdenVa: burdenVa,
    leadBurdenVa: leadBurdenVa,
    totalBurdenVa: totalBurdenVa,
    burdenRatingVa: burdenRatingVa,
    accuracyClass: accuracy,
    meteringSpec: 'CT ratio ' + ratioPrimaryA + '/' + secondaryA + 'A, burden ' +
                  burdenRatingVa + 'VA, class ' + accuracy,
    protection: null
  };

  if (fault && fault.applicable && ratioPrimaryA > 0) {
    var secFaultA = round(fault.iscKa * 1000 / ratioPrimaryA * secondaryA, 2);
    var vkV = round(2 * secFaultA * (rct + rl + rr), 2);
    var requiredAlf = round(fault.iscKa * 1000 / ratioPrimaryA, 2);
    out.protection = {
      faultAtSecondaryA: secFaultA,
      kneePointV: vkV,
      statedAlf: alf,
      requiredAlf: requiredAlf,
      alfOk: alf >= requiredAlf,
      spec: 'Class PX, knee point ≥ ' + vkV + 'V (Rct ' + rct + ' + Rl ' + rl +
            ' + Rr ' + rr + ' Ω)',
      note: alf >= requiredAlf
        ? 'Stated ALF of ' + alf + ' meets the calculated requirement of ' + requiredAlf + '.'
        : 'A Class P CT at ALF ' + alf + ' saturates before full fault current; the ' +
          'calculation needs ALF ' + requiredAlf + '. Use a higher ALF or the Class PX ' +
          'knee-point specification above.'
    };
  }
  return out;
}

/* ====================================================================== *
 *  9.  SOLAR STRING LENGTH
 *  Two independent limits, and the design has to satisfy both. Voc at the
 *  coldest the site gets is the highest voltage the string will ever
 *  reach and is a destruction limit. Vmp across the temperature band is an
 *  operating limit: outside the MPPT window the inverter cannot track.
 * ====================================================================== */
function solarStrings(inp) {
  if (!inp || !inp.enabled) return null;
  var vdcMax = num(inp.vdcMaxV, 1000);
  var voc    = num(inp.vocV, 49.04);
  var vmp    = num(inp.vmpV, 40.89);
  var tMin   = num(inp.tMinC, 20);
  var tMax   = num(inp.tMaxC, 45);
  var kvVoc  = num(inp.kvVocPctPerC, -0.25);
  var kvVmp  = num(inp.kvVmpPctPerC, -0.29);
  var mpptMinV = num(inp.mpptMinV, 250);
  var mpptMaxV = num(inp.mpptMaxV, 850);

  var vocCold = voc * (1 + (tMin - 25) * kvVoc / 100);
  var vmpHot  = vmp * (1 + (tMax - 25) * kvVmp / 100);
  var vmpCold = vmp * (1 + (tMin - 25) * kvVmp / 100);

  var maxByVoc  = vocCold > 0 ? Math.floor(vdcMax / vocCold) : 0;
  var minByMppt = vmpHot  > 0 ? Math.ceil(mpptMinV / vmpHot) : 0;
  var maxByMppt = vmpCold > 0 ? Math.floor(mpptMaxV / vmpCold) : 0;
  var maxSeries = Math.min(maxByVoc, maxByMppt);

  return {
    vocAtMinTempV: round(vocCold, 3),
    vmpAtMaxTempV: round(vmpHot, 3),
    vmpAtMinTempV: round(vmpCold, 3),
    maxByVoc: maxByVoc,
    minByMppt: minByMppt,
    maxByMppt: maxByMppt,
    minSeries: minByMppt,
    maxSeries: maxSeries,
    feasible: maxSeries >= minByMppt && minByMppt > 0,
    note: maxSeries >= minByMppt && minByMppt > 0
      ? 'Use between ' + minByMppt + ' and ' + maxSeries + ' modules in series.'
      : 'No valid string length exists: the MPPT minimum needs ' + minByMppt +
        ' modules and the binding maximum allows ' + maxSeries +
        '. Check the inverter MPPT window against this module.'
  };
}

/* ====================================================================== *
 *  10.  LIFECYCLE ECONOMICS
 *  A 20-year table, not a single payback figure, because the two things
 *  that move it move in opposite directions: the tariff escalates while
 *  the battery fades, and somewhere in the middle the cells drop under
 *  the minimum state of health and get replaced.
 * ====================================================================== */
function irr(cf) {
  function npvAt(r) {
    var s = 0;
    for (var t = 0; t < cf.length; t++) s += cf[t] / Math.pow(1 + r, t);
    return s;
  }
  var lo = -0.9, hi = 3;
  if (npvAt(lo) < 0 || npvAt(hi) > 0) return null;
  for (var i = 0; i < 200; i++) {
    var mid = (lo + hi) / 2;
    if (npvAt(mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* Linear interpolation across the year a cumulative series crosses zero. */
function crossing(years, cum) {
  for (var i = 1; i < cum.length; i++) {
    if (cum[i - 1] < 0 && cum[i] >= 0) {
      var span = cum[i] - cum[i - 1];
      if (!(span > 0)) return years[i];
      return round(years[i - 1] + Math.abs(cum[i - 1]) / span, 2);
    }
  }
  return null;
}

function lifecycle(cap, pcs, inp) {
  var years      = Math.round(clamp(num(inp.analysisYears, 20), 1, 40));
  var capex      = num(inp.capex, 0);
  var opexPct    = num(inp.opexPctOfCapex, 2) / 100;
  var discount   = num(inp.discountRate, 8) / 100;
  var escalation = num(inp.escalation, 3) / 100;
  var replCapex  = num(inp.replacementCapex, capex);
  var minSoh     = clamp(num(inp.minSohPct, 70), 1, 100) / 100;
  var fadePerYr  = num(inp.sohFadePctPerYear, 1.5) / 100;
  var auxPct     = num(inp.auxPct, 0) / 100;

  var demandRate = num(inp.demandRatePerKw, 18.5);       /* $/kW-month      */
  var onPeak     = num(inp.onPeakRate, 0.16);            /* $/kWh           */
  var offPeak    = num(inp.offPeakRate, 0.08);           /* $/kWh           */
  var fuelAdj    = num(inp.fuelAdjRate, 0);              /* $/kWh           */
  var utilTaxPct = num(inp.utilityTaxPct, 0) / 100;
  var peakDays   = num(inp.peakDaysPerMonth, 22);
  var mdHours    = num(inp.demandWindowH, cap.durationH);

  var batteryKwh = cap.installedMwh * 1000;
  var pcsKw      = pcs.totalMw * 1000;
  var rte        = cap.rtePct / 100;
  var dod        = cap.dodPct / 100;

  var rows = [], cf = [-capex], cum = [-capex], disc = [-capex];
  var yearIdx = [0];
  /* Age is years SINCE THE LAST INSTALL, and the pack has already been in
     service a year by the end of year 1 — so year 1 runs at one year of
     fade, not at nameplate. Starting the count at zero quietly credits a
     free year of capacity to every project. */
  var age = 1, replacements = 0, firstReplacementYear = null;

  for (var y = 1; y <= years; y++) {
    var soh = Math.max(0, 1 - fadePerYr * age);
    var yearCapex = 0;
    if (soh < minSoh) {
      yearCapex = -replCapex;
      replacements++;
      if (firstReplacementYear == null) firstReplacementYear = y;
      age = 0;
      soh = 1;
    }

    var esc = Math.pow(1 + escalation, y - 1);

    /* How much demand the battery can actually remove this year: the
       smaller of what the converters can push and what the faded pack
       can sustain for the whole demand window. */
    var energyLimitedKw = mdHours > 0
      ? (batteryKwh * Math.sqrt(rte) * dod * soh) / mdHours : 0;
    var mdReductionKw = Math.min(pcsKw, energyLimitedKw);

    var demandSavings = demandRate * esc * mdReductionKw * 12;
    var dischargeValue= mdReductionKw * mdHours * onPeak * esc * peakDays * 12;
    var chargeCost    = -(mdReductionKw / rte) * mdHours * offPeak * esc * peakDays * 12;
    var fuelAdjCost   = -((mdReductionKw / rte) - mdReductionKw) * mdHours * peakDays *
                         fuelAdj * esc * 12;
    var auxCost       = -(mdReductionKw / rte) * mdHours * auxPct * offPeak * esc *
                         peakDays * 12;
    var taxSaving     = (demandSavings + dischargeValue + chargeCost + auxCost) * utilTaxPct;
    var opex          = -capex * opexPct;

    var net = demandSavings + dischargeValue + chargeCost + fuelAdjCost + auxCost +
              taxSaving + opex + yearCapex;

    rows.push({
      year: y,
      sohPct: round(soh * 100, 1),
      mdReductionKw: round(mdReductionKw, 1),
      demandSavings: round(demandSavings, 0),
      dischargeValue: round(dischargeValue, 0),
      chargeCost: round(chargeCost, 0),
      fuelAdjCost: round(fuelAdjCost, 0),
      auxCost: round(auxCost, 0),
      taxSaving: round(taxSaving, 0),
      opex: round(opex, 0),
      replacementCapex: round(yearCapex, 0),
      net: round(net, 0)
    });

    cf.push(net);
    cum.push(cum[cum.length - 1] + net);
    disc.push(disc[disc.length - 1] + net / Math.pow(1 + discount, y));
    yearIdx.push(y);
    age++;
  }

  for (var i = 0; i < rows.length; i++) {
    rows[i].cumulative = round(cum[i + 1], 0);
    rows[i].discountedCumulative = round(disc[i + 1], 0);
  }

  var npv = -capex;
  for (var k = 1; k < cf.length; k++) npv += cf[k] / Math.pow(1 + discount, k);

  return {
    years: years, capex: capex,
    rows: rows,
    paybackYears: crossing(yearIdx, cum),
    discountedPaybackYears: crossing(yearIdx, disc),
    npv: round(npv, 0),
    irr: irr(cf),
    cumulativeSavings: round(cum[cum.length - 1], 0),
    year1Net: rows.length ? rows[0].net : 0,
    replacements: replacements,
    firstReplacementYear: firstReplacementYear,
    discountRate: discount, escalation: escalation
  };
}

/* Scenarios. The base case is one point on a surface; these are the four
   corners a credit committee will push on anyway. */
function sensitivity(cap, pcs, inp, base) {
  var scenarios = [
    { key: 'conservative', label: 'Conservative', capexMult: 1.10, escalation: 1.5,  discount: 12, aux: 2, opex: 2.5 },
    { key: 'stress',       label: 'Stress',       capexMult: 1.20, escalation: 0,    discount: 15, aux: 3, opex: 3.0 },
    { key: 'optimistic',   label: 'Optimistic',   capexMult: 0.90, escalation: 5.0,  discount: 6,  aux: 0, opex: 1.5 }
  ];
  var out = [{
    key: 'base', label: 'Base case',
    capex: base.capex,
    paybackYears: base.paybackYears,
    discountedPaybackYears: base.discountedPaybackYears,
    npv: base.npv, irr: base.irr
  }];
  for (var i = 0; i < scenarios.length; i++) {
    var s = scenarios[i];
    var alt = {};
    for (var k in inp) if (Object.prototype.hasOwnProperty.call(inp, k)) alt[k] = inp[k];
    alt.capex = num(inp.capex, 0) * s.capexMult;
    alt.replacementCapex = num(inp.replacementCapex, num(inp.capex, 0)) * s.capexMult;
    alt.escalation = s.escalation;
    alt.discountRate = s.discount;
    alt.auxPct = s.aux;
    alt.opexPctOfCapex = s.opex;
    var r = lifecycle(cap, pcs, alt);
    out.push({
      key: s.key, label: s.label, capex: round(alt.capex, 0),
      paybackYears: r.paybackYears,
      discountedPaybackYears: r.discountedPaybackYears,
      npv: r.npv, irr: r.irr
    });
  }
  return out;
}

/* ====================================================================== *
 *  11.  DESIGN CHECKS
 *  Three states, and the difference matters. FAIL means the design does
 *  not work as drawn. REVIEW means it works but somebody has to decide
 *  something. OK means neither.
 * ====================================================================== */
function designChecks(ctx) {
  var cap = ctx.capacity, pcs = ctx.pcs, tx = ctx.transformer;
  var checks = [];
  function add(name, status, detail) { checks.push({ name: name, status: status, detail: detail }); }

  if (!tx.needed) {
    add('Transformer within standard size range', 'N/A', 'No transformer needed for this design.');
  } else if (!tx.aboveLargestStandard) {
    add('Transformer within standard size range', 'OK',
        'One ' + tx.ratingMva + ' MVA transformer covers the ' + tx.requiredKva + ' kVA duty.');
  } else {
    add('Transformer within standard size range', 'REVIEW',
        'The ' + tx.requiredKva + ' kVA duty is above the largest standard size (' +
        maxOf(TABLES.transformerKva) + ' kVA). Use ' + tx.units + ' × ' +
        tx.ratingMva + ' MVA in parallel, and note that paralleling raises the ' +
        'fault level at the common bus roughly in proportion.');
  }

  var pb = ctx.primaryBreaker;
  add('Primary breaker within standard range',
      pb.aboveLargestStandard ? 'REVIEW' : 'OK',
      pb.aboveLargestStandard
        ? 'Design current ' + pb.designA + 'A is above the largest standard breaker (' +
          maxOf(TABLES.breakerA) + 'A). Use ' + pb.units + ' × ' + pb.frameA + 'A parallel incomers.'
        : 'One ' + pb.frameA + 'A breaker covers the design current of ' + pb.designA + 'A.');

  var cbl = ctx.primaryCable, maxRuns = num(ctx.input.maxCableRuns, 4);
  if (!cbl.valid) {
    add('AC cable runs practical after derating', 'FAIL', cbl.note);
  } else if (cbl.runs <= maxRuns) {
    add('AC cable runs practical after derating', 'OK',
        'Cable solution is ' + cbl.spec + ' after a total derating factor of ' +
        cbl.totalDerating + '.');
  } else {
    add('AC cable runs practical after derating', 'REVIEW',
        'Cable solution needs ' + cbl.runs + ' runs, above the limit of ' + maxRuns +
        '. Busduct rated ' + (ctx.busduct ? ctx.busduct.ratingA + 'A' : 'per the schedule') +
        ' is the practical alternative at this current.');
  }

  if (cbl.valid) {
    add('AC cable voltage drop within limit', cbl.dropOk ? 'OK' : 'FAIL',
        cbl.dropOk
          ? cbl.dropPct + '% over ' + cbl.lengthM + 'm, within the ' + cbl.dropLimitPct + '% limit.'
          : cbl.dropPct + '% over ' + cbl.lengthM + 'm against a ' + cbl.dropLimitPct +
            '% limit. Increase the size, add a run, or shorten the route.');
  }

  if (pcs.solarOnly) {
    add('Charging time fits the charging window', 'N/A',
        'No grid or generator charging power set, so the system charges from solar ' +
        'and no charging window applies.');
  } else if (pcs.fullChargeH == null) {
    add('Charging time fits the charging window', 'FAIL',
        'Charging power is set but nothing can deliver it: the converter rating, the ' +
        'C-rate limit and the available power are all zero.');
  } else if (pcs.fullChargeH <= pcs.chargeWindowH + 1e-9) {
    add('Charging time fits the charging window', 'OK',
        'A full charge takes ' + pcs.fullChargeH + ' h, within the ' + pcs.chargeWindowH +
        ' h window, limited by ' + pcs.chargeLimitedBy + '.');
  } else {
    add('Charging time fits the charging window', 'FAIL',
        'A full charge takes ' + pcs.fullChargeH + ' h but only ' + pcs.chargeWindowH +
        ' h are available, limited by ' + pcs.chargeLimitedBy + '. Raise the charging ' +
        'power, add converters, or accept a partial charge.');
  }

  if (!(pcs.chargeMw > 0)) {
    add('Charging power within battery C-rate', 'N/A', 'No grid or generator charging power set.');
  } else if (pcs.chargeMw <= pcs.cRateLimitMw + 1e-9) {
    add('Charging power within battery C-rate', 'OK',
        'Charging at ' + pcs.chargeMw + ' MW is inside the ' + pcs.cRateLimitMw +
        ' MW C-rate limit.');
  } else {
    add('Charging power within battery C-rate', 'FAIL',
        'Charging at ' + pcs.chargeMw + ' MW exceeds the ' + pcs.cRateLimitMw +
        ' MW C-rate limit. Reduce the charging power or add capacity.');
  }

  add('Converters cover the required power', pcs.coversDuty ? 'OK' : 'FAIL',
      pcs.coversDuty
        ? 'Total converter power of ' + round(pcs.totalMw, 3) + ' MW covers the higher of ' +
          'discharge ' + pcs.dischargeMw + ' MW and charge ' + pcs.chargeMw + ' MW.'
        : 'Total converter power of ' + round(pcs.totalMw, 3) + ' MW is below the required ' +
          Math.max(pcs.dischargeMw, pcs.chargeMw) + ' MW.');

  add('Installed capacity covers required capacity',
      cap.installedMwh >= cap.requiredMwh - 1e-9 ? 'OK' : 'FAIL',
      cap.installedMwh >= cap.requiredMwh - 1e-9
        ? 'Installed ' + cap.installedMwh + ' MWh against a required ' + cap.requiredMwh +
          ' MWh (spare ' + cap.spareMwh + ' MWh).'
        : 'Installed ' + cap.installedMwh + ' MWh is below the required ' + cap.requiredMwh + ' MWh.');

  if (!tx.needed) {
    add('Neutral point and vector group', 'N/A', tx.neutralNote);
  } else {
    add('Neutral point and vector group', tx.neutralOk ? 'OK' : 'FAIL', tx.neutralNote);
  }

  var life = ctx.batteryLife;
  add('Battery cycle life against project life',
      life.yearsToEol >= life.minimumYears ? 'OK' : 'REVIEW',
      life.yearsToEol >= life.minimumYears
        ? 'The pack reaches its rated cycle life in about ' + life.yearsToEol +
          ' years at ' + life.cyclesPerDay + ' cycle/day.'
        : 'The pack reaches its rated cycle life in about ' + life.yearsToEol +
          ' years at ' + life.cyclesPerDay + ' cycle/day, below the ' + life.minimumYears +
          '-year minimum. Budget a replacement inside the analysis period.');

  if (ctx.ct && ctx.ct.protection) {
    add('Protection CT will not saturate at fault current',
        ctx.ct.protection.alfOk ? 'OK' : 'REVIEW', ctx.ct.protection.note);
  }

  if (ctx.solar) {
    add('Solar string length has a valid window',
        ctx.solar.feasible ? 'OK' : 'FAIL', ctx.solar.note);
  }

  var fails = 0, reviews = 0;
  for (var i = 0; i < checks.length; i++) {
    if (checks[i].status === 'FAIL') fails++;
    else if (checks[i].status === 'REVIEW') reviews++;
  }
  var overall = fails ? 'FAIL' : (reviews ? 'REVIEW' : 'OK');
  return {
    checks: checks,
    fails: fails, reviews: reviews,
    overall: overall,
    summary: fails
      ? fails + ' check' + (fails > 1 ? 's' : '') + ' failed — this design is not ' +
        'buildable as it stands.'
      : (reviews
          ? reviews + ' check' + (reviews > 1 ? 's' : '') + ' need a decision — read the rows above.'
          : 'All design checks passed.')
  };
}

/* ====================================================================== *
 *  12.  BILL OF QUANTITIES
 * ====================================================================== */
function billOfQuantities(ctx) {
  var cap = ctx.capacity, pcs = ctx.pcs, tx = ctx.transformer, inp = ctx.input;
  var rows = [];
  rows.push({
    item: 'Battery unit (' + round(cap.unitMwh * 1000, 0) + ' kWh each)',
    qty: cap.units,
    remark: 'Total installed capacity ' + cap.installedMwh + ' MWh, ' +
            (inp.cooling || 'Liquid Cooling System') + ', ' +
            (String(inp.ambient || 'Inland') === 'Coastal' ? 'anti-corrosion grade C5'
                                                           : 'anti-corrosion grade C3')
  });
  rows.push({
    item: 'Power conversion system (' + round(pcs.unitMw * 1000, 0) + ' kW each)',
    qty: pcs.units,
    remark: (String(inp.blackStart || '') === 'Required' ? 'Grid-forming' : 'Grid-following') +
            ', ' + cap.cRate + 'C, bi-directional, IP65'
  });
  if (tx.needed) {
    rows.push({
      item: 'Transformer (' + tx.shortKind + ')',
      qty: tx.units,
      remark: tx.ratingMva + ' MVA, ' + tx.primaryKv + '/' + tx.secondaryKv + ' kV, ' +
              tx.category + ', vector group ' + tx.vectorGroup + ', %Z=' + tx.impedancePct + '%'
    });
  }
  rows.push({
    item: 'Primary breaker / switchgear',
    qty: ctx.primaryBreaker.units,
    remark: ctx.primaryBreaker.frameA + 'A rated at ' + tx.primaryKv + ' kV' +
            (ctx.switchgear ? ', Icu ' + ctx.switchgear.icuKa + ' kA' : '')
  });
  if (ctx.primaryCable.valid) {
    rows.push({
      item: 'AC cable, converter bus to main breaker',
      qty: ctx.primaryCable.runs,
      remark: ctx.primaryCable.spec + ', ' + ctx.primaryCable.lengthM + 'm, voltage drop ' +
              ctx.primaryCable.dropPct + '%'
    });
  }
  if (tx.needed && ctx.secondaryBreaker) {
    rows.push({
      item: 'Secondary breaker / switchgear',
      qty: ctx.secondaryBreaker.units,
      remark: ctx.secondaryBreaker.frameA + 'A rated at ' + tx.secondaryKv + ' kV, ' +
              'design current ' + ctx.secondaryBreaker.designA + 'A'
    });
  }
  if (tx.needed && ctx.secondaryCable && ctx.secondaryCable.valid) {
    rows.push({
      item: 'Secondary cable, transformer to point of connection',
      qty: ctx.secondaryCable.runs,
      remark: ctx.secondaryCable.spec + ', voltage drop ' + ctx.secondaryCable.dropPct + '%'
    });
  }
  rows.push({
    item: 'Metering CT set',
    qty: 3,
    remark: ctx.ct.meteringSpec
  });
  if (ctx.ct.protection) {
    rows.push({ item: 'Protection CT set', qty: 3, remark: ctx.ct.protection.spec });
  }
  return rows;
}

/* ====================================================================== *
 *  ENTRY POINT
 * ====================================================================== */
function design(input) {
  var inp = input || {};

  var cap = capacityChain(inp);
  var pcs = pcsSizing(cap, inp);
  var tx  = transformerSizing(pcs, inp);

  var pf = clamp(num(inp.powerFactor, 0.85), 0.01, 1);
  var threePhase = String(inp.phase || 'Three-Phase') !== 'Single-Phase';
  var breakerBuffer = num(inp.breakerBuffer, 1.25);
  var pcsKw = pcs.totalMw * 1000;

  var primaryA = roundUp(lineCurrentA(pcsKw, tx.primaryKv, pf, threePhase), 0);
  var primaryBreaker = breakerSelection(primaryA, breakerBuffer);
  /* A single-phase circuit reads the single-phase ampacity column, not the
     three-phase one: the same conductor carries more current with only two
     loaded cores in the trench, and the mV/A/m figure differs too. */
  var primaryCable = cableSizing(primaryA * breakerBuffer, tx.primaryKv * 1000, {
    ca: inp.cableCa, cg: inp.cableCg, ci: inp.cableCi, dc: !threePhase,
    lengthM: inp.cableLengthM, buffer: breakerBuffer, vdLimitPct: inp.cableVdLimitPct
  });

  var secondaryBreaker = null, secondaryCable = null, secondaryA = 0;
  if (tx.needed) {
    secondaryA = roundUp(lineCurrentA(pcsKw, tx.secondaryKv, pf, threePhase), 0);
    secondaryBreaker = breakerSelection(secondaryA, breakerBuffer);
    secondaryCable = cableSizing(secondaryA * breakerBuffer, tx.secondaryKv * 1000, {
      ca: inp.cableCa, cg: inp.cableCg, ci: inp.cableCi, dc: !threePhase,
      lengthM: num(inp.secondaryCableLengthM, num(inp.cableLengthM, 50)),
      buffer: breakerBuffer, vdLimitPct: inp.cableVdLimitPct
    });
  }

  /* Two buses, two fault levels. The converter bus carries the battery
     gear; the system bus is where the utility connects. Sizing the LV
     switchgear against the MV fault figure is the classic way to buy a
     breaker that cannot break. */
  var converterFault = faultLevel(tx, inp, tx.primaryKv, 'Converter bus (' + tx.primaryKv + ' kV)', pcsKw);
  var systemFault = tx.needed
    ? faultLevel(tx, inp, tx.secondaryKv, 'System bus (' + tx.secondaryKv + ' kV)', pcsKw)
    : { applicable: false, busLabel: 'System bus', note: 'No transformer in this design.' };
  var fault = converterFault;

  var busduct = busductSizing(pcsKw, tx.primaryKv, pf, inp, converterFault);

  var switchgear = null;
  if (converterFault.applicable) {
    var margin = num(inp.breakingCapacityMargin, 1.2);
    switchgear = {
      bus: converterFault.busLabel,
      ratedCurrentA: primaryBreaker.frameA,
      faultKa: converterFault.iscKa,
      margin: margin,
      icuKa: stdUp(TABLES.icuKa, converterFault.iscKa * margin),
      icuAboveLargestStandard: converterFault.iscKa * margin > maxOf(TABLES.icuKa),
      busbarA: primaryBreaker.frameA,
      peakWithstandKa: converterFault.peakKa
    };
  }

  /* The metering/protection CT set sits on the converter bus with the
     primary breaker, so it sees the converter-bus fault. */
  var ct = ctSizing(primaryA, inp, converterFault);
  var solar = solarStrings(inp.solar);

  /* Cycle life against project life: a pack rated for N cycles, run c
     times a day on d operating days a year, is finished in N/(c*d) years. */
  var cyclesPerDay = num(inp.cyclesPerDay, 1);
  var cycleLife    = num(inp.cycleLife, 6000);
  var cycleDays    = num(inp.cycleDaysPerYear, 300);
  var minimumYears = num(inp.minimumBatteryLifeYears, 10);
  var yearsToEol = (cyclesPerDay > 0 && cycleDays > 0)
    ? roundUp(cycleLife / cycleDays / cyclesPerDay, 2) : null;
  var batteryLife = {
    cycleLife: cycleLife, cyclesPerDay: cyclesPerDay, cycleDaysPerYear: cycleDays,
    yearsToEol: yearsToEol, minimumYears: minimumYears,
    throughputMwhPerYear: round(cap.usableMwh * cyclesPerDay * cycleDays, 1)
  };

  /* Capex: use what the caller priced if it gave one, otherwise build it
     from the same unit rates the Battery Sizer uses so the two tools
     cannot disagree about the number they are both dividing by. */
  var capex = num(inp.capex, 0);
  var capexDerived = false;
  if (!(capex > 0)) {
    capex = cap.installedMwh * 1000 * num(inp.costPerKwh, 450) +
            pcsKw * num(inp.costPerKw, 0);
    capexDerived = true;
  }
  var econInput = {};
  for (var k in inp) if (Object.prototype.hasOwnProperty.call(inp, k)) econInput[k] = inp[k];
  econInput.capex = capex;
  /* Default the replacement to the same price as the first install, but only
     when the caller said nothing. An explicit zero is a real answer — the
     replacement is under warranty — and overwriting it would silently book a
     seven-figure cost the user deliberately removed. */
  if (inp.replacementCapex == null || inp.replacementCapex === '') {
    econInput.replacementCapex = capex;
  }
  if (inp.demandWindowH == null || inp.demandWindowH === '') {
    econInput.demandWindowH = cap.durationH;
  }

  var life = lifecycle(cap, pcs, econInput);
  var scenarios = sensitivity(cap, pcs, econInput, life);

  var ctx = {
    input: inp, capacity: cap, pcs: pcs, transformer: tx,
    primaryBreaker: primaryBreaker, primaryCable: primaryCable,
    secondaryBreaker: secondaryBreaker, secondaryCable: secondaryCable,
    fault: fault, busduct: busduct, switchgear: switchgear, ct: ct,
    solar: solar, batteryLife: batteryLife
  };

  var verdict = designChecks(ctx);

  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    capacity: cap,
    pcs: pcs,
    transformer: tx,
    electrical: {
      phase: threePhase ? 'Three-Phase' : 'Single-Phase',
      powerFactor: pf,
      necBuffer: breakerBuffer,
      primaryCurrentA: primaryA,
      primaryBreaker: primaryBreaker,
      primaryCable: primaryCable,
      secondaryCurrentA: secondaryA || null,
      secondaryBreaker: secondaryBreaker,
      secondaryCable: secondaryCable,
      busduct: busduct,
      switchgear: switchgear,
      fault: converterFault,
      systemFault: systemFault,
      ct: ct
    },
    solar: solar,
    batteryLife: batteryLife,
    economics: {
      capex: round(capex, 0),
      capexDerived: capexDerived,
      lifecycle: life,
      scenarios: scenarios
    },
    checks: verdict,
    boq: billOfQuantities(ctx),
    tables: {
      transformerKva: TABLES.transformerKva,
      breakerA: TABLES.breakerA,
      busductA: TABLES.busductA,
      icuKa: TABLES.icuKa
    }
  };
}

module.exports = {
  design: design,
  capacityChain: capacityChain,
  pcsSizing: pcsSizing,
  transformerSizing: transformerSizing,
  cableSizing: cableSizing,
  breakerSelection: breakerSelection,
  faultLevel: faultLevel,
  busductSizing: busductSizing,
  ctSizing: ctSizing,
  solarStrings: solarStrings,
  lifecycle: lifecycle,
  TABLES: TABLES,
  CABLE: CABLE
};
