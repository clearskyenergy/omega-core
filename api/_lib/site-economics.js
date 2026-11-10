/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Screening economics only. All dollar, energy and rent arithmetic stays server-side. */
'use strict';
function number(o, k, fallback, min, max) {
  var v = o[k];
  if (v === '' || v == null) return fallback;
  if (typeof v !== 'number' && typeof v !== 'string') throw new Error(k + ' must be numeric');
  v = Number(v);
  if (!isFinite(v) || v < min || v > max) throw new Error(k + ' is outside its supported range');
  return v;
}
function evaluate(b) {
  b = b || {}; var a = b.assumptions || {}, run = b.run || {}, inventory = b.inventory || {};
  var missing = [], notes = [];
  function n(k, d, lo, hi) { return number(a, k, d, lo == null ? 0 : lo, hi == null ? 1e10 : hi); }
  function required(k) { var v = n(k, null); if (v == null) missing.push(k); return v; }
  var kw = required('computeKw'), pue = n('pue', 1.3, 1, 3);
  var utilization = n('utilizationPct', 70, 0, 100) / 100;
  var rate = required('computeRate'), energy = required('energyRate');
  var service = required('serviceKw'), other = required('otherPeakKw'), evPeak = required('evPeakKw');
  var demand = required('demandRate'), opex = required('annualOpex'), replacement = required('annualReplacement');
  var otherNet = n('otherAnnualNet', 0, -1e10), share = n('hostSharePct', 50, 0, 100) / 100;
  var years = n('recoveryYears', 5, 1, 30), target = n('returnPct', 12, 0, 100) / 100;
  var capex;
  if (a.capexMode === 'run') {
    capex = number(run, 'capex', null, 0, 1e12);
    if (!run.at || run.stale || capex == null) missing.push('fresh design cost run');
  } else {
    capex = n('batteryCost', 24000) + n('inverterCost', 2500) + n('chipCost', 250000) + (required('otherCapex') || 0);
  }
  var peak = (kw || 0) * pue;
  // Conservative full facility power all year; billable utilization is NOT idle power savings.
  var kwh = peak * 8760, billed = (kw || 0) * utilization * 8760;
  var gross = billed * (rate || 0), powerCost = kwh * (energy || 0), demandCost = peak * (demand || 0) * 12;
  var net = gross + otherNet - powerCost - demandCost - (opex || 0) - (replacement || 0);
  var capital = capex == null ? 0 : capex * (target ? target / (1 - Math.pow(1 + target, -years)) : 1 / years);
  var affordable = Math.max(0, net - capital), headroom = service == null || other == null || evPeak == null ? null : service - other - evPeak;
  var feasible = headroom != null && headroom >= peak;
  if (!(kw > 0)) missing.push('positive compute IT load');
  if (a.revenueBasis !== 'manual' && a.revenueBasis !== 'scenario') missing.push('revenue basis');
  if (!String(a.revenueNote || '').trim()) missing.push('revenue assumption source / SLA note');
  if (a.capexMode !== 'run' && a.capexMode !== 'itemized') missing.push('capex basis');
  notes.push('Compute rate is net operator receipts per utilized IT kWh, not a GPU-hour quote or a verified market price.');
  notes.push('Voltus / Google is a proposed commercial route; no SLA, offtake or revenue guarantee is verified by this model.');
  notes.push('Full compute facility power is charged for 8,760 hours; no free BESS energy, solar offset or spare EV capacity is assumed.');
  notes.push('Other annual net contribution must exclude compute receipts, compute energy and costs already entered here. The design revenue total is not automatically added.');
  notes.push('Demand charges use full incremental compute peak; replace with interval / tariff analysis before an offer.');
  notes.push('Rent is a flat annual screening budget after capital recovery and target return; no escalation, tax, financing or residual value is modeled.');
  if (headroom != null && !feasible) notes.push('Service cannot cover compute plus reserved building and EV loads. BESS kW is not continuous generation.');
  var ready = missing.length === 0 && feasible;
  return { model: 'site-economics/1', inventory: inventory, run: run, assumptions: a,
    missing: missing, notes: notes, status: missing.length ? 'incomplete' : !feasible ? 'power-constrained' : affordable <= 0 ? 'no-rent-headroom' : 'indicative',
    capex: capex, computePeakKw: peak, availableComputeKw: headroom, annualComputeKwh: kwh,
    annualBillableItKwh: billed, annualComputeRevenue: gross, annualEnergyCost: powerCost,
    annualDemandCost: demandCost, annualBeforeRent: net, annualCapitalRecovery: capital,
    breakEvenRate: billed > 0 ? (powerCost + demandCost + (opex || 0) + (replacement || 0) + capital - otherNet) / billed : null,
    offer: ready ? { annual: affordable * share, monthly: affordable * share / 12, ceilingAnnual: affordable,
      label: 'Indicative land-lease budget — subject to SLA, utility capacity, fiber, zoning and site control' } : null };
}
module.exports = { evaluate: evaluate };
