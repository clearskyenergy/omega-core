/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/proforma.js — compute pro forma math, pure (no Firestore, no Admin)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The EVCS compute + BESS screening case as a versioned assumption set, from
   WB2 (EVCS_Solela_Site_Model.xlsx) Inputs. Reference parity: one pod yields
   project IRR ≈ 0.005407871, investor IRR ≈ 0.004339862, 59-month payback
   (Summary B6:B8). These are workbook-case results, not return promises.

   Cash-flow shape (Monthly B:J): month 0 books the full investor capital as
   the outflow; months 1..60 book GPU revenue minus power, opex, reserves.
   The waterfall pays the investor 100% of SPV cash until capital is
   recovered, then investorResidualShare (80%) to the investor and the rest
   to NewCo. NewCo's gross power spread is reported separately and never
   mixed into investor distributions.

   Sizing: sizePodsFromPower(kw, a) fits whole pods into available power
   (itKwPerPod * pue per pod); runProforma accepts sizeFromPowerKw to size
   the run instead of an explicit pod count, and records the derivation in
   inputs.sizing / results.sizing. deriveAvailableKw(site) reads a site
   record's availablePowerMw, or derives service-minus-peak.

   Rules, per the build spec:
   - No valid IRR root → { defined: false }. Never a fabricated 0%.
   - Portfolio IRR is recomputed from aggregated dated cash flows, never an
     average of site IRRs (see portfolioIrr).
   - A scenario is immutable: new inputs = new scenarioId, inputsHash binds
     the exact inputs + assumption version.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var crypto = require('crypto');

function fail(status, message) { var e = new Error(message); e.status = status; return e; }

/* Versioned assumption sets. Any change to a value below is a NEW version;
   scenarios record the version they ran under, so old results stay
   reproducible. evcs-compute-v1 is the EVCS workbook case, kept for
   existing scenarios. omega-compute-v1 is the same math under a neutral
   label and is the default for new runs in every workspace. */
var BASE_ASSUMPTIONS = {
  months: 60,
  hoursPerMonth: 730,
  itKwPerPod: 75,
  pue: 1.2,
  gpuPerPod: 48,
  gpuPricePerHour: 2.46375,
  billableUtilization: 0.85,
  technicalUptime: 0.98,
  annualGpuPriceChange: -0.08,
  powerPricePerKwh: 0.15,
  annualCostEscalation: 0.03,
  fixedOpexPerPodMonth: 5000,
  networkVariablePctRevenue: 0.08,
  maintenanceReservePctRevenue: 0.02,
  gpuPodCapex: 1986375,
  bessCapexPerPod: 100000,
  openingLiquidityPerPod: 25000,
  bessOmPerYear: 4000,
  investorResidualShare: 0.8,
  ramp: { 1: 0.5, 2: 0.65, 3: 0.8 },
  newCoUtilityCostPerKwh: 0.13
};

var ASSUMPTION_VERSIONS = ['evcs-compute-v1', 'omega-compute-v1'];
var DEFAULT_ASSUMPTION_VERSION = 'omega-compute-v1';

/* The versioned set: base values plus the version label. */
function assumptionSet(version) {
  var v = version || DEFAULT_ASSUMPTION_VERSION;
  if (ASSUMPTION_VERSIONS.indexOf(v) < 0)
    throw fail(400, 'Unknown assumption version: ' + v + ' (known: ' + ASSUMPTION_VERSIONS.join(', ') + ')');
  var a = {}, k;
  for (k in BASE_ASSUMPTIONS) a[k] = BASE_ASSUMPTIONS[k];
  a.ramp = { 1: 0.5, 2: 0.65, 3: 0.8 };
  a.version = v;
  return a;
}
/* Backward-compat: ASSUMPTIONS is the EVCS workbook set. */
var ASSUMPTIONS = assumptionSet('evcs-compute-v1');

var OVERRIDABLE = ['gpuPricePerHour', 'billableUtilization', 'technicalUptime',
  'annualGpuPriceChange', 'powerPricePerKwh', 'annualCostEscalation',
  'fixedOpexPerPodMonth', 'networkVariablePctRevenue', 'maintenanceReservePctRevenue',
  'gpuPodCapex', 'bessCapexPerPod', 'openingLiquidityPerPod', 'bessOmPerYear',
  'investorResidualShare', 'newCoUtilityCostPerKwh'];
var OVERRIDE_BOUNDS = {
  gpuPricePerHour: [0, 50], billableUtilization: [0, 1], technicalUptime: [0, 1],
  annualGpuPriceChange: [-0.5, 0.5], powerPricePerKwh: [0, 2], annualCostEscalation: [-0.2, 0.5],
  fixedOpexPerPodMonth: [0, 100000], networkVariablePctRevenue: [0, 1], maintenanceReservePctRevenue: [0, 1],
  gpuPodCapex: [0, 20000000], bessCapexPerPod: [0, 5000000], openingLiquidityPerPod: [0, 1000000],
  bessOmPerYear: [0, 200000], investorResidualShare: [0, 1], newCoUtilityCostPerKwh: [0, 2]
};

function num(v, label, min, max) {
  var n = Number(v);
  if (!isFinite(n) || n < min || n > max) throw fail(400, label + ' must be a number between ' + min + ' and ' + max);
  return n;
}

function assumptions(overrides, version) {
  var a = assumptionSet(version), k, base = {};
  for (k in a) base[k] = a[k];
  base.ramp = { 1: 0.5, 2: 0.65, 3: 0.8 };
  a = base;
  var used = {};
  var o = overrides || {};
  OVERRIDABLE.forEach(function (key) {
    if (o[key] === undefined || o[key] === null) return;
    var b = OVERRIDE_BOUNDS[key];
    a[key] = num(o[key], key, b[0], b[1]);
    used[key] = a[key];
  });
  return { a: a, used: used };
}

function monthlyFlows(pods, a) {
  var facKw = a.itKwPerPod * a.pue;
  var capexEach = a.gpuPodCapex + a.bessCapexPerPod + a.openingLiquidityPerPod;
  var capex = capexEach * pods;
  var flows = [{ month: 0, revenue: 0, powerCost: 0, otherCost: 0, spvCash: -capex,
    investorCash: -capex, newCoCash: 0, unrecovered: capex, cumulativeSpv: -capex,
    cumulativeInvestor: -capex, powerSpread: 0 }];
  var unrecovered = capex, cumSpv = -capex, cumInv = -capex;
  for (var m = 1; m <= a.months; m++) {
    var y = (m - 1) / 12;
    var gpuPrice = a.gpuPricePerHour * Math.pow(1 + a.annualGpuPriceChange, y);
    var ramp = a.ramp[m] || 1;
    var revenue = a.gpuPerPod * gpuPrice * a.hoursPerMonth * a.billableUtilization * a.technicalUptime * ramp * pods;
    var esc = Math.pow(1 + a.annualCostEscalation, y);
    var power = facKw * a.hoursPerMonth * a.powerPricePerKwh * esc * pods;
    var other = revenue * (a.networkVariablePctRevenue + a.maintenanceReservePctRevenue)
      + (a.fixedOpexPerPodMonth + a.bessOmPerYear / 12) * esc * pods;
    var spv = revenue - power - other;
    var toInvestor = Math.min(Math.max(spv, 0), unrecovered)
      + a.investorResidualShare * Math.max(0, spv - unrecovered)
      + Math.min(spv, 0);
    var toNewCo = spv - toInvestor;
    unrecovered = Math.max(0, unrecovered - Math.max(spv, 0));
    cumSpv += spv; cumInv += toInvestor;
    var spread = facKw * a.hoursPerMonth * (a.powerPricePerKwh - a.newCoUtilityCostPerKwh) * pods;
    flows.push({ month: m, revenue: revenue, powerCost: power, otherCost: other,
      spvCash: spv, investorCash: toInvestor, newCoCash: toNewCo,
      unrecovered: unrecovered, cumulativeSpv: cumSpv,
      cumulativeInvestor: cumInv, powerSpread: spread });
  }
  return flows;
}

function npvAt(flows, monthlyRate, key) {
  var s = 0;
  for (var i = 0; i < flows.length; i++) s += flows[i][key] / Math.pow(1 + monthlyRate, flows[i].month);
  return s;
}

function irrMonthly(flows, key) {
  var lo = -0.9999, hi = 10;
  var flo = npvAt(flows, lo, key), fhi = npvAt(flows, hi, key);
  if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
  for (var i = 0; i < 200; i++) {
    var mid = (lo + hi) / 2, f = npvAt(flows, mid, key);
    if (f === 0) return mid;
    if (flo * f < 0) { hi = mid; fhi = f; } else { lo = mid; flo = f; }
  }
  return (lo + hi) / 2;
}

function annualized(monthlyRate) { return Math.pow(1 + monthlyRate, 12) - 1; }
function monthlyFromAnnual(annualRate) { return Math.pow(1 + annualRate, 1 / 12) - 1; }

function paybackMonth(flows) {
  for (var i = 1; i < flows.length; i++) {
    if (flows[i].cumulativeInvestor >= 0) return flows[i].month;
  }
  return null;
}

function sumKey(flows, key, from, to) {
  var s = 0;
  for (var i = 0; i < flows.length; i++) {
    if (flows[i].month >= from && flows[i].month <= to) s += flows[i][key];
  }
  return s;
}

function sha256(obj) {
  return crypto.createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

/* How many pods fit in the available power. A pod draws itKwPerPod * pue
   kW of facility power; anything left over is headroom. */
function sizePodsFromPower(powerKwAvailable, a) {
  var perPod = a.itKwPerPod * a.pue;
  var pods = Math.floor(powerKwAvailable / perPod);
  return { pods: pods, powerKwAvailable: powerKwAvailable, powerKwPerPod: perPod,
    powerKwUsed: pods * perPod, headroomKw: powerKwAvailable - pods * perPod };
}

/* Available kW for new load, from a site record. Prefers an explicitly
   entered availablePowerMw; otherwise derives service minus existing peak.
   Returns { kw, basis, label } with kw null when neither is known. */
function deriveAvailableKw(site) {
  site = site || {};
  var mw = site.availablePowerMw;
  if (mw != null && mw !== '' && isFinite(Number(mw)) && Number(mw) > 0)
    return { kw: Number(mw) * 1000, basis: 'direct', label: 'Available power, as entered' };
  var svc = site.serviceCapacityKw, peak = site.existingPeakKw;
  if (svc != null && svc !== '' && peak != null && peak !== '' && isFinite(Number(svc)) && isFinite(Number(peak)))
    return { kw: Math.max(0, Number(svc) - Number(peak)), basis: 'service-minus-peak',
      label: 'Service capacity minus existing peak, derived' };
  return { kw: null, basis: null, label: null };
}

function runProforma(input) {
  input = input || {};
  var assumed = assumptions(input.overrides, input.assumptionVersion);
  var a = assumed.a;
  var sizing = null, pods;
  if (input.sizeFromPowerKw != null && input.sizeFromPowerKw !== '') {
    var kwAvail = num(input.sizeFromPowerKw, 'Available power', 0, 1e9);
    sizing = sizePodsFromPower(kwAvail, a);
    pods = sizing.pods;
    if (!(pods >= 1))
      throw fail(400, 'Available power (' + kwAvail + ' kW) fits no whole pod: one pod needs ' + sizing.powerKwPerPod + ' kW of facility power.');
    sizing.basis = input.sizeBasis || null;
  } else {
    pods = Math.floor(num(input.pods, 'Pods', 1, 100000));
  }
  var discountAnnual = input.discountRateAnnual == null || input.discountRateAnnual === ''
    ? 0.08 : num(input.discountRateAnnual, 'Discount rate', 0, 1);
  var label = String(input.label || '').slice(0, 120);
  var flows = monthlyFlows(pods, a);
  var pIrrM = irrMonthly(flows, 'spvCash');
  var iIrrM = irrMonthly(flows, 'investorCash');
  var capex = (a.gpuPodCapex + a.bessCapexPerPod + a.openingLiquidityPerPod) * pods;
  var results = {
    investorCapital: capex,
    pods: pods,
    facilityKw: a.itKwPerPod * a.pue * pods,
    itKw: a.itKwPerPod * pods,
    projectIrr: pIrrM == null
      ? { defined: false, note: 'Not defined: cash flows have no sign change' }
      : { defined: true, monthly: pIrrM, annual: annualized(pIrrM) },
    investorIrr: iIrrM == null
      ? { defined: false, note: 'Not defined: cash flows have no sign change' }
      : { defined: true, monthly: iIrrM, annual: annualized(iIrrM) },
    npv: npvAt(flows, monthlyFromAnnual(discountAnnual), 'investorCash'),
    discountRateAnnual: discountAnnual,
    paybackMonth: paybackMonth(flows),
    year1Revenue: sumKey(flows, 'revenue', 1, 12),
    year1InvestorCash: sumKey(flows, 'investorCash', 1, 12),
    totalRevenue: sumKey(flows, 'revenue', 1, a.months),
    months: a.months,
    sizing: sizing
  };
  var canonical = { pods: pods, discountRateAnnual: discountAnnual, overrides: assumed.used,
    assumptionVersion: a.version, label: label,
    sizeFromPowerKw: sizing ? sizing.powerKwAvailable : null,
    sizeBasis: sizing ? sizing.basis : null };
  return {
    scenarioId: 'pf_' + crypto.randomBytes(9).toString('hex'),
    assumptionVersion: a.version,
    inputs: canonical,
    inputsHash: sha256(canonical),
    cashFlows: flows,
    results: results,
    createdAt: new Date().toISOString()
  };
}

function portfolioIrr(seriesList) {
  var byMonth = {};
  (seriesList || []).forEach(function (s) {
    (s.cashFlows || []).forEach(function (f) {
      byMonth[f.month] = (byMonth[f.month] || 0) + (Number(f.investorCash) || 0);
    });
  });
  var months = Object.keys(byMonth).map(Number).sort(function (x, y) { return x - y; });
  if (!months.length) return { defined: false, note: 'Not defined: no cash flows' };
  var agg = months.map(function (m) { return { month: m, investorCash: byMonth[m] }; });
  var r = irrMonthly(agg, 'investorCash');
  return r == null
    ? { defined: false, note: 'Not defined: aggregate cash flows have no sign change' }
    : { defined: true, monthly: r, annual: annualized(r), months: months };
}

module.exports = {
  ASSUMPTION_VERSION: DEFAULT_ASSUMPTION_VERSION,
  DEFAULT_ASSUMPTION_VERSION: DEFAULT_ASSUMPTION_VERSION,
  ASSUMPTION_VERSIONS: ASSUMPTION_VERSIONS,
  ASSUMPTIONS: ASSUMPTIONS,
  assumptionSet: assumptionSet,
  sizePodsFromPower: sizePodsFromPower,
  deriveAvailableKw: deriveAvailableKw,
  runProforma: runProforma,
  monthlyFlows: monthlyFlows,
  irrMonthly: irrMonthly,
  npvAt: npvAt,
  annualized: annualized,
  paybackMonth: paybackMonth,
  portfolioIrr: portfolioIrr,
  fail: fail
};
