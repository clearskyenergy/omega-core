/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/omega-compute-model.js — the Omega Core Skid's own economics:
   a 75 kW IT-load compute cash flow, levered, by chipset
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ─────────────────────────────────────────────────────────────────────────────
   WHERE THIS COMES FROM
   ─────────────────────────────────────────────────────────────────────────────
   Tommy, 2026-10-05, handing over the iQGen "75 kW IT Load Cash Flow Model"
   workbook: "this is how the Omega-Compute needs to be modeled … it's an
   iQGen set but we are white labeling it Omega Core Skid and when we place it
   here are the numbers and we need to make a customer facing version and be
   able to show bankability". This file is that workbook, sheet by sheet, as
   one pure function — the browser never sees a rate, a price or a proxy
   (CLAUDE.md: pricing and financial modelling live in /api/).

     Chipset Library      → CHIPSETS (CoreWeave North America public pricing,
                            2026-10-05; NVIDIA node power)
     CapEx Reference      → CMDC (the 75 kW container CAPEX ranges, per
                            category, general-purpose air-cooled and
                            accelerated liquid-cooled, ±15%)
     Dynamic CapEx        → dynamicCapex(): the accelerated reference scaled
                            to the chipset by GPU count and the $/GPU index
     Dynamic Cash Flow    → cashFlow(): the 60-month project + debt + equity
                            model, the one the workbook shows
     Scenario Comparison  → scenarios(): every chipset under the same inputs
     Sensitivity          → sensitivity(): utilisation × price realisation

   The workbook's cell logic is kept where it is right and corrected where
   the sheet points at the wrong cell (its "Year 1 revenue" summed the
   maintenance-reserve row, its "Year 1 DSCR" divided two blank cells, its
   "5-year project multiple" was principal over CAPEX, its "fastest payback"
   picked a chipset with no price). Each correction is named in `notes`.

   ─────────────────────────────────────────────────────────────────────────────
   WHAT IS ADDED FOR OMEGA-CORE
   ─────────────────────────────────────────────────────────────────────────────
   · The LAND LEASE TO THE HOST is an operating cost of the skid — that rent
     is the whole point of putting the skid on a charging site — so it is a
     line in the cash flow (per skid per month, escalating yearly), handed in
     from the Omega-Core offer and switchable off to see the skid alone.
   · BANKABILITY: the minimum DSCR over the amortising months against the
     target, the months under it, the balloon's own coverage, and the DEBT
     CAPACITY at the target DSCR (debt service is linear in the debt amount
     for fixed terms, so the largest loan the cash flow carries at the
     target is min over amortising months of EBITDA ÷ (target × service per
     dollar)). Project and equity IRR, monthly cash flows annualised.
   · The CAPEX basis is a choice, and the DEFAULT is the Omega-Core skid
     price ClearSky recorded, $450,000 (Tommy, 2026-10-06: "use the 450k
     skid price as the default"); the workbook's CMDC range (general-purpose
     air-cooled, high, $724,471), the chipset-scaled dynamic range and a
     typed figure stay as choices. The workbook's own figures are pinned in
     the tests on its own basis.
   · A CUSTOMER view: the results and the assumptions in plain words, with
     no cost build-up, no proxy index and no third-party price sheet. The
     build-up (CMDC categories, the $/GPU index, where each price came from)
     is staff-only, as the lease card's is.

   ─────────────────────────────────────────────────────────────────────────────
   ⚠ MARKET REFERENCES, NOT UNDERWRITING
   ─────────────────────────────────────────────────────────────────────────────
   CoreWeave's rates are market reference points, not offtake. The CAPEX
   ranges are a planning estimate; the workbook's own note says to replace
   the proxy with OEM quotes before investment approval. B300 has no public
   on-demand price and GB300 none at all, so those rows say so instead of
   pricing. No taxes, no GPU degradation beyond the price decline, the debt
   service reserve is funded and not released (as the workbook has it).
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var BUILD = '2026-10-05.omega-compute-model-v1';
var SOURCES = {
  pricing: { what: 'CoreWeave Cloud Pricing — North America public rates', asOf: '2026-10-05', url: 'https://www.coreweave.com/pricing' },
  capex: { what: 'CMDC 75 kW, 20-foot container estimated CAPEX range (energy excluded), base category totals ±15%', asOf: '2026-10-05' },
  power: { what: 'NVIDIA DGX / HGX system power (DGX H100 planning guide, DGX H200, B200, A100 datasheets)' }
};

/* ── the chipset library ─────────────────────────────────────────────────
   Node $/hour is what CoreWeave publishes; $/GPU-hour is node ÷ GPUs. A
   null is a price CoreWeave does not publish, never a zero. `index` is the
   relative $/GPU CAPEX index vs H100 (the workbook's market-value proxy:
   on-demand $/GPU-hr ratio, Spot for B300, a 2.00 placeholder for GB300). */
var CHIPSETS = [
  { key: 'h100',     name: 'NVIDIA HGX H100',                gpusPerNode: 8, vramGb: 80,  nodeKw: 10.2, onDemandNode: 49.24, spotNode: 19.71, inferenceGpu: 6.16, index: 1,        cooling: 1,    power: 1, indexBasis: 'H100 anchor — the CAPEX reference base' },
  { key: 'h200',     name: 'NVIDIA HGX H200',                gpusPerNode: 8, vramGb: 141, nodeKw: 10.2, onDemandNode: 50.44, spotNode: 20.93, inferenceGpu: 6.31, index: 1.02437,  cooling: 1,    power: 1, indexBasis: 'On-demand $/GPU-hr ratio vs H100' },
  { key: 'b200',     name: 'NVIDIA HGX B200',                gpusPerNode: 8, vramGb: 180, nodeKw: 14.3, onDemandNode: 68.8,  spotNode: 34.11, inferenceGpu: 8.6,  index: 1.39724,  cooling: 1.1,  power: 1, indexBasis: 'On-demand $/GPU-hr ratio vs H100; higher liquid-density allowance' },
  { key: 'a100',     name: 'NVIDIA A100 80GB',               gpusPerNode: 8, vramGb: 80,  nodeKw: 6.5,  onDemandNode: 21.6,  spotNode: 9.65,  inferenceGpu: 2.7,  index: 0.438668, cooling: 0.65, power: 1, indexBasis: 'On-demand $/GPU-hr ratio vs H100; air-cooled allowance' },
  { key: 'l40s',     name: 'NVIDIA L40S',                    gpusPerNode: 8, vramGb: 48,  nodeKw: 4.6,  onDemandNode: 18,    spotNode: 7.88,  inferenceGpu: 2.25, index: 0.365556, cooling: 0.6,  power: 1, indexBasis: 'On-demand $/GPU-hr ratio vs H100; air-cooled allowance' },
  { key: 'gh200',    name: 'NVIDIA GH200',                   gpusPerNode: 1, vramGb: 96,  nodeKw: 1.2,  onDemandNode: 6.5,   spotNode: null,  inferenceGpu: 6.5,  index: 1.05605,  cooling: 0.9,  power: 1, indexBasis: 'On-demand $/GPU-hr ratio vs H100; editable cooling assumption' },
  { key: 'gb200',    name: 'NVIDIA GB200 NVL72',             gpusPerNode: 4, vramGb: 186, nodeKw: 6.5,  onDemandNode: 42,    spotNode: null,  inferenceGpu: 10.5, index: 1.70593,  cooling: 1.15, power: 1, indexBasis: 'On-demand $/GPU-hr ratio vs H100; high-density liquid allowance' },
  { key: 'rtx6000',  name: 'NVIDIA RTX PRO 6000 Blackwell',  gpusPerNode: 8, vramGb: 96,  nodeKw: 6,    onDemandNode: 20,    spotNode: 11.09, inferenceGpu: 2.5,  index: 0.406174, cooling: 0.6,  power: 1, indexBasis: 'On-demand $/GPU-hr ratio vs H100; air-cooled allowance' },
  { key: 'b300',     name: 'NVIDIA HGX B300',                gpusPerNode: 8, vramGb: 270, nodeKw: 15.5, onDemandNode: null,  spotNode: 35.84, inferenceGpu: null, index: 1.81837,  cooling: 1.15, power: 1, indexBasis: 'Spot $/GPU-hr ratio vs H100 (no public on-demand price)' },
  { key: 'gb300',    name: 'NVIDIA GB300 NVL72',             gpusPerNode: 4, vramGb: 279, nodeKw: 7,    onDemandNode: null,  spotNode: null,  inferenceGpu: null, index: 2,        cooling: 1.2,  power: 1, indexBasis: 'Placeholder index; no public CoreWeave rate' }
];
var H100_GPUS_AT_75KW = 48;   /* the CAPEX reference's compute component is for 48 H100s in 75 kW */

function chipset(key) {
  for (var i = 0; i < CHIPSETS.length; i++) if (CHIPSETS[i].key === key) return CHIPSETS[i];
  return null;
}
/* $/GPU-hour on a pricing basis, or null where CoreWeave publishes none */
function gpuPrice(c, basis, customPrice) {
  if (basis === 'custom') return customPrice != null ? customPrice : null;
  if (basis === 'inference') return c.inferenceGpu;
  if (basis === 'on-demand') return c.onDemandNode != null ? c.onDemandNode / c.gpusPerNode : null;
  return c.spotNode != null ? c.spotNode / c.gpusPerNode : null;   /* spot */
}
var BASIS_LABEL = { spot: 'Spot', 'on-demand': 'On-demand', inference: 'Inference (per GPU)', custom: 'Custom $/GPU-hour' };

/* ── the CAPEX reference (per 75 kW container) ───────────────────────── */
var CMDC = {
  perItKw: 75,
  rangePct: 0.15,
  categories: [
    { key: 'container', label: 'Container and logistics',  gp: [23600, 47125],   acc: [23600, 47125],     note: 'Container, site preparation, delivery and placement' },
    { key: 'cooling',   label: 'Cooling',                  gp: [31350, 56225],   acc: [56875, 91625],     note: 'General purpose = air cooled; accelerated = liquid cooled' },
    { key: 'compute',   label: 'Compute',                  gp: [238000, 455000], acc: [1472475, 2061350], note: 'Computing capacity, racks and network' },
    { key: 'power',     label: 'Power and electrical',     gp: [43600, 71625],   acc: [44325, 73875],     note: 'Supply, distribution and protection within the unit' }
  ],
  excluded: ['Energy', 'Command and monitoring layer']
};
function cmdcTotals(config) {
  var k = config === 'accelerated-liquid' ? 'acc' : 'gp', lo = 0, hi = 0;
  CMDC.categories.forEach(function (c) { lo += c[k][0]; hi += c[k][1]; });
  var low = lo * (1 - CMDC.rangePct), high = hi * (1 + CMDC.rangePct);
  return { baseLow: lo, baseHigh: hi, low: Math.round(low), high: Math.round(high), mid: Math.round((low + high) / 2) };
}
/* The Dynamic CapEx sheet: the ACCELERATED reference, compute scaled by the
   GPUs this chipset fits and its $/GPU index, cooling and power by factor. */
function dynamicCapex(c, gpus) {
  var rows = CMDC.categories.map(function (cat) {
    var f = cat.key === 'cooling' ? c.cooling : cat.key === 'power' ? c.power
          : cat.key === 'compute' ? (gpus / H100_GPUS_AT_75KW) * c.index : 1;
    var lo = cat.acc[0] * f, hi = cat.acc[1] * f;
    return { key: cat.key, label: cat.label, low: Math.round(lo), high: Math.round(hi), mid: Math.round((lo + hi) / 2), factor: round(f, 4),
             driver: cat.key === 'compute' ? 'GPU count × relative $/GPU index' : cat.key === 'container' ? 'held at the 75 kW container' : 'chipset factor' };
  });
  var t = { low: 0, high: 0, mid: 0 };
  rows.forEach(function (r) { t.low += r.low; t.high += r.high; t.mid += r.mid; });
  return { rows: rows, low: t.low, high: t.high, mid: t.mid };
}

/* ── defaults: the workbook's visible Dynamic Cash Flow sheet ─────────── */
var DEFAULTS = {
  chipset: 'h100',
  pricingBasis: 'spot',            /* the cash-flow sheet's basis */
  customGpuHour: 6.16,
  priceRealization: 1,
  itLoadKw: 75,
  reservedOverhead: 0.05,
  pue: 1.2,
  utilization: 0.85,
  uptime: 0.98,
  electricity: 0.15,               /* $/kWh delivered */
  networkStoragePct: 0.05,
  otherVariablePct: 0.03,
  fixedOpexMonthly: 5000,          /* site / insurance / admin */
  termMonths: 60,
  ramp: [0.5, 0.65, 0.8, 1],       /* months 1, 2, 3, 4+ as a share of steady state */
  priceChangePct: -0.08,           /* a year */
  electricityEscalationPct: 0.03,
  fixedOpexEscalationPct: 0.03,
  maintenanceReservePct: 0.02,
  residualPct: 0.10,               /* of initial CAPEX, in the final month */
  capexBasis: 'skid',              /* skid (the default) | cmdc | dynamic | custom */
  capexConfig: 'general-air',      /* cmdc: general-air | accelerated-liquid */
  capexCase: 'high',               /* low | mid | high */
  capexCustom: null,
  skidPriceUsd: 450000,            /* the Omega-Core skid as ClearSky recorded it */
  includeLease: true,
  debt: { ltc: 0.7, rate: 0.10, maturityMonths: 60, interestOnlyMonths: 6, balloonPct: 0.10, feePct: 0.02, reserveMonths: 3, targetDscr: 1.25 }
};
/* what a typed input may be: outside it, the default is used and the
   result says so (the lease card's rule) */
var LIMITS = {
  customGpuHour: [0, 100], priceRealization: [0.2, 2], itLoadKw: [10, 500], reservedOverhead: [0, 0.5], pue: [1, 2.5],
  utilization: [0.05, 1], uptime: [0.5, 1], electricity: [0, 1], networkStoragePct: [0, 0.5], otherVariablePct: [0, 0.5],
  fixedOpexMonthly: [0, 100000], termMonths: [12, 180], priceChangePct: [-0.5, 0.5], electricityEscalationPct: [-0.1, 0.2],
  fixedOpexEscalationPct: [-0.1, 0.2], maintenanceReservePct: [0, 0.3], residualPct: [0, 0.6], capexCustom: [10000, 20000000],
  ltc: [0, 0.95], rate: [0, 0.4], maturityMonths: [6, 240], interestOnlyMonths: [0, 60], balloonPct: [0, 0.9], feePct: [0, 0.1],
  reserveMonths: [0, 24], targetDscr: [1, 3]
};

/* ── helpers ──────────────────────────────────────────────────────────── */
function num(v) {
  if (typeof v === 'number') return isFinite(v) ? v : null;
  if (typeof v === 'string' && v.trim() !== '') { var n = Number(v); return isFinite(n) ? n : null; }
  return null;
}
function obj(v) { return v && typeof v === 'object' && !Array.isArray(v) ? v : {}; }
function round(v, d) { var m = Math.pow(10, d || 0); return Math.round(v * m) / m; }
function r2(v) { return v == null ? null : round(v, 2); }
function pct(v) { return v == null ? null : round(v * 100, 2); }
function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

/* Read the inputs: the defaults, with every typed figure that is inside
   its range, and a note for each one set aside. A percent typed as 85 (not
   0.85) is read as a percent when the field is a share. */
function readInputs(raw) {
  raw = obj(raw);
  var d = JSON.parse(JSON.stringify(DEFAULTS)), notes = [];
  function share(v) { return v != null && v > 1 && v <= 100 ? v / 100 : v; }
  function take(k, into, isShare, label) {
    var v = num(raw[k]); if (v == null) return;
    if (isShare) v = share(v);
    var lim = LIMITS[k];
    if (lim && (v < lim[0] || v > lim[1])) { notes.push((label || k) + ' of ' + v + ' is outside ' + lim[0] + '–' + lim[1] + '; the default (' + into[k] + ') is used.'); return; }
    into[k] = v;
  }
  if (raw.chipset != null) { if (chipset(String(raw.chipset))) d.chipset = String(raw.chipset); else notes.push('Chipset "' + raw.chipset + '" is not in the library; H100 is used.'); }
  if (raw.pricingBasis != null) { if (BASIS_LABEL[raw.pricingBasis]) d.pricingBasis = raw.pricingBasis; else notes.push('Pricing basis "' + raw.pricingBasis + '" is not spot, on-demand, inference or custom; spot is used.'); }
  take('customGpuHour', d, false, 'Custom $/GPU-hour'); take('priceRealization', d, true, 'Price realization'); take('itLoadKw', d, false, 'IT load');
  take('reservedOverhead', d, true, 'Reserved IT overhead'); take('pue', d, false, 'PUE'); take('utilization', d, true, 'Utilization');
  take('uptime', d, true, 'Uptime'); take('electricity', d, false, 'Electricity $/kWh'); take('networkStoragePct', d, true, 'Network + storage %');
  take('otherVariablePct', d, true, 'Other variable OpEx %'); take('fixedOpexMonthly', d, false, 'Fixed OpEx'); take('termMonths', d, false, 'Term (months)');
  if (num(raw.priceChangePct) != null) { var pc = num(raw.priceChangePct); if (Math.abs(pc) > 1 && Math.abs(pc) <= 100) pc = pc / 100; if (pc < LIMITS.priceChangePct[0] || pc > LIMITS.priceChangePct[1]) notes.push('Annual price change of ' + pc + ' is outside the range; -8% is used.'); else d.priceChangePct = pc; }
  take('electricityEscalationPct', d, true, 'Electricity escalation'); take('fixedOpexEscalationPct', d, true, 'Fixed OpEx escalation');
  take('maintenanceReservePct', d, true, 'Maintenance reserve'); take('residualPct', d, true, 'Residual value %');
  if (Array.isArray(raw.ramp) && raw.ramp.length) {
    var rr = raw.ramp.slice(0, 12).map(function (v) { var n = share(num(v)); return n == null || n < 0 || n > 1 ? null : n; });
    if (rr.indexOf(null) >= 0) notes.push('A ramp step was outside 0–1; the default ramp is used.'); else d.ramp = rr;
  }
  if (raw.capexBasis != null) { if (['cmdc', 'dynamic', 'skid', 'custom'].indexOf(raw.capexBasis) >= 0) d.capexBasis = raw.capexBasis; else notes.push('CAPEX basis "' + raw.capexBasis + '" is unknown; the skid price is used.'); }
  if (raw.capexConfig != null) { if (raw.capexConfig === 'general-air' || raw.capexConfig === 'accelerated-liquid') d.capexConfig = raw.capexConfig; else notes.push('CAPEX configuration "' + raw.capexConfig + '" is unknown; general-purpose air-cooled is used.'); }
  if (raw.capexCase != null) { if (['low', 'mid', 'high'].indexOf(raw.capexCase) >= 0) d.capexCase = raw.capexCase; else notes.push('CAPEX case "' + raw.capexCase + '" is unknown; high is used.'); }
  take('capexCustom', d, false, 'Custom CAPEX');
  if (d.capexBasis === 'custom' && d.capexCustom == null) { notes.push('A custom CAPEX basis needs a figure; the skid price is used.'); d.capexBasis = 'skid'; }
  if (raw.includeLease != null) d.includeLease = !(raw.includeLease === false || raw.includeLease === 'false' || raw.includeLease === 0 || raw.includeLease === '0' || raw.includeLease === 'no');
  var rd = obj(raw.debt);
  /* the debt fields may also arrive flat (a form) */
  ['ltc', 'rate', 'maturityMonths', 'interestOnlyMonths', 'balloonPct', 'feePct', 'reserveMonths', 'targetDscr'].forEach(function (k) {
    var v = num(rd[k] != null ? rd[k] : raw['debt' + k.charAt(0).toUpperCase() + k.slice(1)]);
    if (v == null) return;
    if (['ltc', 'rate', 'balloonPct', 'feePct'].indexOf(k) >= 0) v = share(v);
    var lim = LIMITS[k];
    if (v < lim[0] || v > lim[1]) { notes.push('Debt ' + k + ' of ' + v + ' is outside ' + lim[0] + '–' + lim[1] + '; the default (' + d.debt[k] + ') is used.'); return; }
    d.debt[k] = v;
  });
  if (d.debt.interestOnlyMonths >= d.debt.maturityMonths) { notes.push('The interest-only period must end before maturity; 6 months is used.'); d.debt.interestOnlyMonths = Math.min(6, d.debt.maturityMonths - 1); }
  d.notes = notes;
  return d;
}

/* ── capacity: whole-node fit inside the IT ceiling ──────────────────── */
function capacity(c, I) {
  var budgetKw = Math.max(0, I.itLoadKw * (1 - I.reservedOverhead));
  var nodes = c.nodeKw > 0 ? Math.floor(budgetKw / c.nodeKw) : 0;
  var gpus = nodes * c.gpusPerNode, installedKw = nodes * c.nodeKw;
  return { budgetKw: r2(budgetKw), nodes: nodes, gpus: gpus, installedKw: r2(installedKw), headroomKw: r2(Math.max(0, I.itLoadKw - installedKw)),
           facilityKw: r2(installedKw * I.pue), totalVramGb: gpus * c.vramGb };
}

/* ── CAPEX on the chosen basis ───────────────────────────────────────── */
function capexOf(c, cap, I) {
  var cm = cmdcTotals(I.capexConfig), dyn = dynamicCapex(c, cap.gpus);
  var out = { basis: I.capexBasis, cmdc: { config: I.capexConfig, low: cm.low, mid: cm.mid, high: cm.high }, dynamic: { low: dyn.low, mid: dyn.mid, high: dyn.high }, skidPriceUsd: I.skidPriceUsd };
  if (I.capexBasis === 'skid') { out.amount = I.skidPriceUsd; out.label = 'Omega-Core skid price as recorded ($' + fmt(I.skidPriceUsd) + ')'; }
  else if (I.capexBasis === 'custom') { out.amount = Math.round(I.capexCustom); out.label = 'Entered CAPEX'; }
  else if (I.capexBasis === 'dynamic') { out.amount = dyn[I.capexCase]; out.label = 'Chipset-scaled estimate, ' + I.capexCase + ' (' + c.name + ')'; }
  else { out.amount = cm[I.capexCase]; out.label = '75 kW container estimate, ' + (I.capexConfig === 'accelerated-liquid' ? 'accelerated liquid-cooled' : 'general-purpose air-cooled') + ', ' + I.capexCase; }
  out.perItKw = I.itLoadKw > 0 ? Math.round(out.amount / I.itLoadKw) : null;
  return out;
}

/* ── the monthly cash flow (the Dynamic Cash Flow sheet) ─────────────── */
function cashFlow(c, cap, capex, I, lease) {
  var D = I.debt, T = I.termMonths, H = 8760 / 12;
  var price = gpuPrice(c, I.pricingBasis, I.customGpuHour);
  var priced = price != null && price > 0;
  var p = (priced ? price : 0) * I.priceRealization;
  var debt = capex * D.ltc, fee = debt * D.feePct, equityCapex = capex - debt;
  var ioInterest = debt * D.rate / 12;
  var principalMo = D.maturityMonths <= D.interestOnlyMonths ? 0 : debt * (1 - D.balloonPct) / Math.max(1, D.maturityMonths - D.interestOnlyMonths);
  var reserve = ioInterest * D.reserveMonths;
  var leaseMo = (I.includeLease && lease && lease.monthly > 0) ? lease.monthly : 0;
  var leaseEsc = lease && lease.escalatorPct != null ? lease.escalatorPct / 100 : 0;

  var months = [], cumProject = -capex, cumEquity = 0, opening = debt, projectPayback = null, equityPayback = null;
  var sum = { revenue: 0, electricity: 0, network: 0, other: 0, fixed: 0, maintenance: 0, lease: 0, opex: 0, ebitda: 0, fcf: 0, residual: 0,
              interest: 0, principal: 0, balloon: 0, debtService: 0, equity: 0 };
  for (var m = 1; m <= T; m++) {
    var ramp = I.ramp[Math.min(m, I.ramp.length) - 1], yrs = (m - 1) / 12;
    var rev = cap.gpus * p * H * I.utilization * I.uptime * ramp * Math.pow(1 + I.priceChangePct, yrs);
    var elec = cap.facilityKw * H * I.electricity * I.uptime * ramp * Math.pow(1 + I.electricityEscalationPct, yrs);
    var net = rev * I.networkStoragePct, oth = rev * I.otherVariablePct;
    var fixed = I.fixedOpexMonthly * Math.pow(1 + I.fixedOpexEscalationPct, yrs);
    var maint = rev * I.maintenanceReservePct;
    var ls = leaseMo * Math.pow(1 + leaseEsc, Math.floor((m - 1) / 12));
    var opex = elec + net + oth + fixed + maint + ls;
    var ebitda = rev - opex, fcf = ebitda;
    var residual = m === T ? capex * I.residualPct : 0;
    var interest = m > D.maturityMonths ? 0 : opening * D.rate / 12;
    var principal = (D.ltc === 0 || m <= D.interestOnlyMonths || m > D.maturityMonths) ? 0 : Math.min(opening, principalMo);
    var balloon = (debt > 0 && m === D.maturityMonths) ? Math.min(Math.max(0, opening - principal), debt * D.balloonPct) : 0;
    var ds = interest + principal + balloon;
    var equity = (m === 1 ? -equityCapex - fee - reserve : 0) + fcf - ds + residual;
    var ending = Math.max(0, opening - principal - balloon);
    cumProject += fcf + residual; cumEquity += equity;
    if (projectPayback == null && cumProject >= 0) projectPayback = m;
    if (equityPayback == null && cumEquity >= 0) equityPayback = m;
    months.push({ m: m, revenue: r2(rev), electricity: r2(elec), network: r2(net), other: r2(oth), fixed: r2(fixed), maintenance: r2(maint), lease: r2(ls),
                  opex: r2(opex), ebitda: r2(ebitda), fcf: r2(fcf), residual: r2(residual), cumProject: r2(cumProject),
                  debtOpening: r2(opening), interest: r2(interest), principal: r2(principal), balloon: r2(balloon), debtService: r2(ds), debtEnding: r2(ending),
                  equity: r2(equity), cumEquity: r2(cumEquity), dscr: ds > 0 ? round(ebitda / ds, 3) : null,
                  amortizing: principal > 0 && balloon === 0 });
    sum.revenue += rev; sum.electricity += elec; sum.network += net; sum.other += oth; sum.fixed += fixed; sum.maintenance += maint; sum.lease += ls;
    sum.opex += opex; sum.ebitda += ebitda; sum.fcf += fcf; sum.residual += residual;
    sum.interest += interest; sum.principal += principal; sum.balloon += balloon; sum.debtService += ds; sum.equity += equity;
    opening = ending;
  }
  Object.keys(sum).forEach(function (k) { sum[k] = Math.round(sum[k]); });

  /* annual summary */
  var years = [];
  for (var y = 0; y * 12 < T; y++) {
    var slice = months.slice(y * 12, y * 12 + 12), a = { year: y + 1, revenue: 0, opex: 0, lease: 0, ebitda: 0, debtService: 0, equity: 0, minDscr: null };
    slice.forEach(function (mm) {
      a.revenue += mm.revenue; a.opex += mm.opex; a.lease += mm.lease; a.ebitda += mm.ebitda; a.debtService += mm.debtService; a.equity += mm.equity;
      if (mm.amortizing && mm.dscr != null && (a.minDscr == null || mm.dscr < a.minDscr)) a.minDscr = mm.dscr;
    });
    a.dscr = a.debtService > 0 ? round(a.ebitda / a.debtService, 2) : null;
    ['revenue', 'opex', 'lease', 'ebitda', 'debtService', 'equity'].forEach(function (k) { a[k] = Math.round(a[k]); });
    years.push(a);
  }

  /* bankability */
  var amort = months.filter(function (mm) { return mm.amortizing && mm.dscr != null; });
  var minDscr = amort.length ? Math.min.apply(null, amort.map(function (mm) { return mm.dscr; })) : null;
  var below = amort.filter(function (mm) { return mm.dscr < D.targetDscr; }).length;
  var balloonMonth = months.filter(function (mm) { return mm.balloon > 0; })[0] || null;
  /* debt service is linear in the loan for fixed terms: the largest loan the
     amortising months carry at the target DSCR */
  var capacityAtTarget = null;
  if (debt > 0 && amort.length) {
    capacityAtTarget = Infinity;
    amort.forEach(function (mm) { var perDollar = mm.debtService / debt; var dmax = mm.ebitda / (D.targetDscr * perDollar); if (dmax < capacityAtTarget) capacityAtTarget = dmax; });
    capacityAtTarget = Math.max(0, Math.round(capacityAtTarget));
  }
  var initialEquity = equityCapex + fee + reserve;
  var projectFlows = [-capex].concat(months.map(function (mm) { return mm.fcf + mm.residual; }));
  var equityFlows = months.map(function (mm) { return mm.equity; });
  var out = {
    priced: priced, gpuHourPrice: priced ? r2(price) : null, realizedGpuHour: priced ? r2(p) : null,
    pricingBasis: I.pricingBasis, pricingBasisLabel: BASIS_LABEL[I.pricingBasis],
    capex: Math.round(capex),
    debt: { funded: Math.round(debt), fee: Math.round(fee), reserve: Math.round(reserve), equityCapex: Math.round(equityCapex), initialEquity: Math.round(initialEquity),
            interestOnlyPayment: r2(ioInterest), principalAfterIo: r2(principalMo), ltc: D.ltc, rate: D.rate, maturityMonths: D.maturityMonths,
            interestOnlyMonths: D.interestOnlyMonths, balloonPct: D.balloonPct, balloon: Math.round(debt * D.balloonPct), feePct: D.feePct, reserveMonths: D.reserveMonths,
            balanceAtTermEnd: months.length ? Math.round(months[months.length - 1].debtEnding) : null },
    lease: { included: leaseMo > 0, monthly: r2(leaseMo), escalatorPct: lease ? lease.escalatorPct : null, termTotal: sum.lease },
    months: months, years: years, totals: sum,
    returns: {
      projectPaybackMonth: projectPayback, equityPaybackMonth: equityPayback,
      projectCashMultiple: capex > 0 ? round((sum.fcf + sum.residual) / capex, 2) : null,
      equityCashMultiple: initialEquity > 0 ? round((sum.equity + initialEquity) / initialEquity, 2) : null,
      projectIrrPct: pct(irr(projectFlows)), equityIrrPct: pct(irr(equityFlows)),
      year1Revenue: years[0] ? years[0].revenue : 0, year1Ebitda: years[0] ? years[0].ebitda : 0, year1DebtService: years[0] ? years[0].debtService : 0,
      year1Dscr: years[0] ? years[0].dscr : null, year1EquityCashFlow: years[0] ? years[0].equity : 0,
      residualValue: Math.round(capex * I.residualPct)
    },
    bankability: {
      targetDscr: D.targetDscr, minDscrAmortizing: minDscr, monthsBelowTarget: below, amortizingMonths: amort.length,
      meetsTarget: minDscr != null ? minDscr >= D.targetDscr : null,
      balloonMonth: balloonMonth ? balloonMonth.m : null, balloonMonthDscr: balloonMonth ? balloonMonth.dscr : null,
      debtCapacityAtTarget: capacityAtTarget, ltcAtTarget: capacityAtTarget != null && capex > 0 ? round(Math.min(capacityAtTarget, capex) / capex, 3) : null,
      debtRepaidInTerm: months.length ? months[months.length - 1].debtEnding === 0 : null
    }
  };
  return out;
}

/* IRR of monthly flows, annualised; null where the flows never change sign */
function irr(flows) {
  var pos = false, neg = false;
  flows.forEach(function (f) { if (f > 0) pos = true; if (f < 0) neg = true; });
  if (!pos || !neg) return null;
  function npv(r) { var s = 0; for (var i = 0; i < flows.length; i++) s += flows[i] / Math.pow(1 + r, i); return s; }
  var lo = -0.99, hi = 10, flo = npv(lo), fhi = npv(hi);
  if (isNaN(flo) || isNaN(fhi) || flo * fhi > 0) return null;
  for (var k = 0; k < 200; k++) {
    var mid = (lo + hi) / 2, fm = npv(mid);
    if (Math.abs(fm) < 1e-7) { lo = hi = mid; break; }
    if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; }
  }
  var monthly = (lo + hi) / 2;
  return Math.pow(1 + monthly, 12) - 1;
}

/* ── every chipset under the same inputs (the Scenario Comparison) ───── */
function scenarios(I) {
  var rows = CHIPSETS.map(function (c) {
    var cap = capacity(c, I), price = gpuPrice(c, I.pricingBasis, I.customGpuHour);
    var priced = price != null && price > 0, p = (priced ? price : 0) * I.priceRealization;
    var revenue = cap.gpus * p * 8760 * I.utilization * I.uptime;
    var kwh = cap.facilityKw * 8760, elecCost = kwh * I.electricity;
    var contribution = revenue - (elecCost + revenue * I.networkStoragePct + revenue * I.otherVariablePct + I.fixedOpexMonthly * 12);
    var dyn = dynamicCapex(c, cap.gpus);
    return { key: c.key, name: c.name, nodeKw: c.nodeKw, gpusPerNode: c.gpusPerNode, nodes: cap.nodes, gpus: cap.gpus, installedKw: cap.installedKw,
             priced: priced, gpuHourPrice: priced ? r2(p) : null,
             annualRevenue: Math.round(revenue), facilityKwhYear: Math.round(kwh), electricityCost: Math.round(elecCost),
             contribution: Math.round(contribution), marginPct: revenue > 0 ? pct(contribution / revenue) : null,
             revenuePerItKwMonth: cap.installedKw > 0 ? Math.round(revenue / 12 / cap.installedKw) : null,
             capexMid: dyn.mid, paybackMonths: priced && contribution > 0 ? round(dyn.mid / contribution * 12, 1) : null,
             cashOnCashYieldPct: priced && dyn.mid > 0 ? pct(contribution / dyn.mid) : null,
             note: priced ? null : 'No public ' + BASIS_LABEL[I.pricingBasis].toLowerCase() + ' price — choose another basis or type one.' };
  });
  var pricedRows = rows.filter(function (r) { return r.priced && r.contribution > 0; });
  var best = null, fastest = null;
  pricedRows.forEach(function (r) {
    if (!best || r.cashOnCashYieldPct > best.cashOnCashYieldPct) best = r;
    if (!fastest || r.paybackMonths < fastest.paybackMonths) fastest = r;
  });
  return { rows: rows, bestYield: best ? best.key : null, fastestPayback: fastest ? fastest.key : null,
           basis: 'Unlevered, steady state, no ramp or price decline; CAPEX is the chipset-scaled midpoint.' };
}

/* ── utilisation × price realisation (the Sensitivity sheet) ─────────── */
var SENS_UTIL = [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95], SENS_PRICE = [0.6, 0.7, 0.8, 0.9, 1, 1.1, 1.2];
function sensitivity(c, cap, I) {
  var price = gpuPrice(c, I.pricingBasis, I.customGpuHour), priced = price != null && price > 0;
  return { utilization: SENS_UTIL, priceRealization: SENS_PRICE, priced: priced,
           annualRevenue: SENS_PRICE.map(function (pr) { return SENS_UTIL.map(function (u) { return Math.round(cap.gpus * (priced ? price : 0) * pr * 8760 * u * I.uptime); }); }),
           basis: 'Annual gross revenue at steady state, ' + c.name + ' on ' + BASIS_LABEL[I.pricingBasis].toLowerCase() + ' pricing; rows are price realisation, columns utilisation.' };
}

/* ── the whole answer ────────────────────────────────────────────────── */
/* opts: { units, lease: { monthly, escalatorPct, source }, disclose } */
function evaluate(raw, opts) {
  opts = opts || {};
  var I = readInputs(raw), c = chipset(I.chipset), cap = capacity(c, I), cx = capexOf(c, cap, I);
  var units = Math.max(1, Math.round(num(opts.units) || 1));
  var lease = opts.lease && num(opts.lease.monthly) != null ? { monthly: num(opts.lease.monthly), escalatorPct: num(opts.lease.escalatorPct), source: opts.lease.source || null } : null;
  var cf = cashFlow(c, cap, cx.amount, I, lease);
  var sc = scenarios(I), sens = sensitivity(c, cap, I);
  var notes = I.notes.slice();
  if (!cf.priced) notes.push(c.name + ' has no public ' + BASIS_LABEL[I.pricingBasis].toLowerCase() + ' price, so revenue is zero here: choose another pricing basis or type a $/GPU-hour.');
  if (cf.lease.included) notes.push('The land lease to the host ($' + fmt(cf.lease.monthly) + ' a skid a month' + (lease.source === 'market' ? ', the market reference' : '') + ') is an operating cost of the skid here.');
  else if (lease && lease.monthly > 0) notes.push('The land lease to the host is switched off in this view; the skid is shown alone.');
  if (cf.debt.balanceAtTermEnd > 0) notes.push('$' + fmt(cf.debt.balanceAtTermEnd) + ' of debt is still outstanding at the end of the model term (maturity is beyond it).');
  var scale = function (v) { return v == null ? null : Math.round(v * units); };
  var out = {
    build: BUILD, units: units,
    inputs: { chipset: c.key, chipsetName: c.name, pricingBasis: I.pricingBasis, pricingBasisLabel: BASIS_LABEL[I.pricingBasis], customGpuHour: I.customGpuHour, priceRealization: I.priceRealization,
              itLoadKw: I.itLoadKw, reservedOverhead: I.reservedOverhead, pue: I.pue, utilization: I.utilization, uptime: I.uptime, electricity: I.electricity,
              networkStoragePct: I.networkStoragePct, otherVariablePct: I.otherVariablePct, fixedOpexMonthly: I.fixedOpexMonthly, termMonths: I.termMonths, ramp: I.ramp,
              priceChangePct: I.priceChangePct, electricityEscalationPct: I.electricityEscalationPct, fixedOpexEscalationPct: I.fixedOpexEscalationPct,
              maintenanceReservePct: I.maintenanceReservePct, residualPct: I.residualPct, capexBasis: I.capexBasis, capexConfig: I.capexConfig, capexCase: I.capexCase,
              capexCustom: I.capexCustom, includeLease: I.includeLease, debt: I.debt },
    chipset: { key: c.key, name: c.name, gpusPerNode: c.gpusPerNode, vramGb: c.vramGb, nodeKw: c.nodeKw },
    capacity: cap,
    capex: { basis: cx.basis, label: cx.label, amount: cx.amount, perItKw: cx.perItKw, options: { cmdc: cx.cmdc, dynamic: cx.dynamic, skid: cx.skidPriceUsd } },
    cashFlow: cf,
    scenarios: sc,
    sensitivity: sens,
    totals: { units: units, capex: scale(cx.amount), debtFunded: scale(cf.debt.funded), initialEquity: scale(cf.debt.initialEquity),
              year1Revenue: scale(cf.returns.year1Revenue), year1Ebitda: scale(cf.returns.year1Ebitda), year1EquityCashFlow: scale(cf.returns.year1EquityCashFlow),
              leaseTermTotal: scale(cf.lease.termTotal), termRevenue: scale(cf.totals.revenue), termEbitda: scale(cf.totals.ebitda) },
    chipsets: CHIPSETS.map(function (x) {
      return { key: x.key, name: x.name, gpusPerNode: x.gpusPerNode, nodeKw: x.nodeKw,
               prices: { spot: x.spotNode != null ? r2(x.spotNode / x.gpusPerNode) : null, 'on-demand': x.onDemandNode != null ? r2(x.onDemandNode / x.gpusPerNode) : null, inference: x.inferenceGpu } };
    }),
    bases: Object.keys(BASIS_LABEL).map(function (k) { return { key: k, label: BASIS_LABEL[k] }; }),
    notes: notes,
    customer: customerView(c, cap, cx, cf, I, units),
    disclaimer: 'Planning estimate. GPU-hour prices are public market reference points (CoreWeave North America, ' + SOURCES.pricing.asOf
      + '), not contracted offtake; CAPEX is an estimated range to be replaced by OEM quotes before any investment decision; no taxes, '
      + 'no GPU degradation beyond the modelled price decline, and the debt terms are assumptions, not a lender\'s offer.'
  };
  if (opts.disclose) {
    out.buildUp = { cmdc: CMDC, dynamicCapex: dynamicCapex(c, cap.gpus), chipsetLibrary: CHIPSETS, sources: SOURCES, defaults: DEFAULTS, limits: LIMITS,
                    corrections: [
                      'The workbook\'s "Year 1 revenue" summed the maintenance-reserve row; here it sums revenue.',
                      'Its "Year 1 DSCR" divided two blank cells; here it is year-1 EBITDA over year-1 debt service.',
                      'Its "5-year project cash multiple" was principal repaid over CAPEX; here it is free cash flow plus residual over CAPEX.',
                      'Its "fastest payback" picked a chipset with no price; here unpriced chipsets are excluded.',
                      'The Scenario Comparison\'s "Annual Power Cost" column was facility kWh and its "Other OpEx" the electricity cost; the labels are fixed and the contribution unchanged.'
                    ] };
    out.disclosed = true;
  } else out.disclosed = false;
  return out;
}

/* The customer's page: results and plain-word assumptions, nothing about
   how the costs were built or whose price sheet was read. */
function customerView(c, cap, cx, cf, I, units) {
  var r = cf.returns, b = cf.bankability, d = cf.debt;
  return {
    title: 'Omega Core Skid — ' + I.itLoadKw + ' kW compute, ' + c.name,
    headline: [
      { label: 'GPUs on the skid', value: cap.gpus + ' (' + cap.nodes + ' nodes)' },
      { label: 'Installed IT load', value: cap.installedKw + ' kW of ' + I.itLoadKw },
      { label: 'Capital cost', value: '$' + fmt(cx.amount) + (units > 1 ? ' a skid · $' + fmt(cx.amount * units) + ' for ' + units : '') },
      { label: 'Year-1 revenue', value: '$' + fmt(r.year1Revenue) },
      { label: 'Year-1 operating cash flow', value: '$' + fmt(r.year1Ebitda) },
      { label: 'Project payback', value: r.projectPaybackMonth ? r.projectPaybackMonth + ' months' : 'beyond the term' },
      { label: 'Equity payback', value: r.equityPaybackMonth ? r.equityPaybackMonth + ' months' : 'beyond the term' },
      { label: 'Minimum DSCR', value: b.minDscrAmortizing != null ? b.minDscrAmortizing.toFixed(2) + 'x against ' + b.targetDscr.toFixed(2) + 'x' : 'no debt' },
      { label: '5-year equity multiple', value: r.equityCashMultiple != null ? r.equityCashMultiple.toFixed(2) + 'x' : '—' },
      { label: 'Equity IRR', value: r.equityIrrPct != null ? r.equityIrrPct.toFixed(1) + '%' : '—' }
    ],
    bankability: {
      verdict: b.minDscrAmortizing == null ? 'Unlevered' : b.meetsTarget ? 'Covers the target in every amortising month' : b.monthsBelowTarget + ' of ' + b.amortizingMonths + ' amortising months fall under the target',
      minDscr: b.minDscrAmortizing, targetDscr: b.targetDscr, debtFunded: d.funded, ltcPct: pct(d.ltc), debtCapacityAtTarget: b.debtCapacityAtTarget, ltcAtTargetPct: pct(b.ltcAtTarget),
      balloon: d.balloon, balloonMonth: b.balloonMonth, balloonMonthDscr: b.balloonMonthDscr, repaidInTerm: b.debtRepaidInTerm
    },
    assumptions: [
      'Compute sold at ' + (cf.priced ? '$' + cf.realizedGpuHour.toFixed(2) + ' per GPU-hour (' + BASIS_LABEL[I.pricingBasis].toLowerCase() + ' market reference' + (I.priceRealization !== 1 ? ', ' + Math.round(I.priceRealization * 100) + '% realised' : '') + ')' : 'no public price on this basis'),
      Math.round(I.utilization * 100) + '% utilisation and ' + round(I.uptime * 100, 1) + '% uptime, ramping over the first ' + (I.ramp.length - 1) + ' months (' + I.ramp.slice(0, -1).map(function (x) { return Math.round(x * 100) + '%'; }).join(', ') + ')',
      'Compute pricing ' + (I.priceChangePct < 0 ? 'declining ' : 'rising ') + Math.abs(round(I.priceChangePct * 100, 1)) + '% a year',
      'Electricity at $' + I.electricity.toFixed(3) + '/kWh on the skid\'s own meter, PUE ' + I.pue + ', escalating ' + round(I.electricityEscalationPct * 100, 1) + '% a year',
      'Network and storage ' + Math.round(I.networkStoragePct * 100) + '% and other variable costs ' + Math.round(I.otherVariablePct * 100) + '% of revenue; a ' + Math.round(I.maintenanceReservePct * 100) + '% maintenance reserve',
      'Fixed costs $' + fmt(I.fixedOpexMonthly) + ' a month (site, insurance, admin), escalating ' + round(I.fixedOpexEscalationPct * 100, 1) + '% a year'
      + (cf.lease.included ? ', plus the land lease to the host of $' + fmt(cf.lease.monthly) + ' a month' : ''),
      'Debt: ' + Math.round(d.ltc * 100) + '% of cost at ' + round(d.rate * 100, 2) + '%, ' + d.maturityMonths + ' months with ' + d.interestOnlyMonths + ' interest-only, a ' + Math.round(d.balloonPct * 100) + '% balloon, a ' + round(d.feePct * 100, 1) + '% fee and a ' + d.reserveMonths + '-month debt service reserve',
      'Residual value ' + Math.round(I.residualPct * 100) + '% of cost at month ' + I.termMonths
    ].filter(function (x) { return !!x; })
  };
}

module.exports = {
  evaluate: evaluate, readInputs: readInputs, capacity: capacity, capexOf: capexOf, cashFlow: cashFlow, scenarios: scenarios, sensitivity: sensitivity,
  dynamicCapex: dynamicCapex, cmdcTotals: cmdcTotals, gpuPrice: gpuPrice, chipset: chipset, irr: irr,
  CHIPSETS: CHIPSETS, CMDC: CMDC, DEFAULTS: DEFAULTS, LIMITS: LIMITS, SOURCES: SOURCES, BUILD: BUILD
};
