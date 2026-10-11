/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/economics.js — dated cash flows, XIRR, payback, the
   EVCS legacy per-pod parity model and portfolio aggregation (spec §9.1)
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. Rules enforced here:
   - IRR from cash flows only; no valid root → status 'not-defined' with a
     reason, never 0% (T28). Several sign changes → every root found is
     disclosed and status 'ambiguous'.
   - Portfolio IRR from AGGREGATED dated flows; site IRRs are never averaged
     (T27).
   - Missing required costs → 'incomplete' with the list, no return.
   - Equal-period (monthly) convention is labelled as such when no dates.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var DAY = 86400000;
function npvRate(flows, r, t0) { return flows.reduce(function (a, f) { return a + f.amount / Math.pow(1 + r, (f.t - t0) / (365 * DAY)); }, 0); }
function signChanges(xs) { var n = 0, prev = 0; xs.forEach(function (x) { var s = x > 0 ? 1 : x < 0 ? -1 : 0; if (s && prev && s !== prev) n++; if (s) prev = s; }); return n; }

/* Root search on an annual-rate grid, then bisection in each bracket. */
function roots(f, lo, hi) {
  var out = [], N = 4000, a = lo, fa = f(a);
  for (var i = 1; i <= N; i++) {
    var b = lo + (hi - lo) * i / N, fb = f(b);
    if (!isFinite(fa)) { a = b; fa = fb; continue; }
    if (fa === 0) out.push(a);
    else if (fa * fb < 0) { var x = a, y = b, fx = fa; for (var k = 0; k < 200; k++) { var m = (x + y) / 2, fm = f(m); if (fx * fm <= 0) y = m; else { x = m; fx = fm; } } out.push((x + y) / 2); }
    a = b; fa = fb;
  }
  return out;
}
/* flows: [{date:'YYYY-MM-DD'|ms, amount}] → annualised XIRR. */
function xirr(flows) {
  if (!flows || flows.length < 2) return { status: 'not-defined', reason: 'Fewer than two cash flows' };
  var fl = flows.map(function (f) { return { t: typeof f.date === 'number' ? f.date : Date.parse(f.date + 'T00:00:00Z'), amount: +f.amount }; });
  if (fl.some(function (f) { return !isFinite(f.t) || !isFinite(f.amount); })) return { status: 'not-defined', reason: 'A cash flow has no valid date or amount' };
  var t0 = Math.min.apply(null, fl.map(function (f) { return f.t; })), sc = signChanges(fl.slice().sort(function (a, b) { return a.t - b.t; }).map(function (f) { return f.amount; }));
  if (sc === 0) return { status: 'not-defined', reason: 'Cash flows never change sign (no investment or no return)' };
  var rs = roots(function (r) { return npvRate(fl, r, t0); }, -0.99, 10);
  if (!rs.length) return { status: 'not-defined', reason: 'No rate makes NPV zero', signChanges: sc };
  if (rs.length > 1) return { status: 'ambiguous', reason: 'Non-conventional cash flows: ' + rs.length + ' IRRs', roots: rs, signChanges: sc };
  return { status: 'ok', irr: rs[0], signChanges: sc };
}
/* Equal-period IRR (per period), labelled convention; annualised by compounding. */
function periodIrr(amounts, periodsPerYear) {
  var f = function (r) { return amounts.reduce(function (a, x, i) { return a + x / Math.pow(1 + r, i); }, 0); }, sc = signChanges(amounts);
  if (sc === 0) return { status: 'not-defined', reason: 'Cash flows never change sign' };
  var rs = roots(f, -0.99, 3);
  if (!rs.length) return { status: 'not-defined', reason: 'No rate makes NPV zero' };
  if (rs.length > 1) return { status: 'ambiguous', roots: rs, reason: 'Non-conventional cash flows: ' + rs.length + ' IRRs' };
  return { status: 'ok', periodic: rs[0], annualized: Math.pow(1 + rs[0], periodsPerYear || 12) - 1, convention: 'equal-period (monthly), not dated' };
}
function payback(amounts) { var c = 0; for (var i = 0; i < amounts.length; i++) { c += amounts[i]; if (c >= -1e-6 && i > 0) return i; } return null; }
function npv(amounts, annualRate, ppy) { if (annualRate == null) return { status: 'not-defined', reason: 'No discount rate supplied' }; var r = Math.pow(1 + annualRate, 1 / (ppy || 12)) - 1; return { status: 'ok', value: amounts.reduce(function (a, x, i) { return a + x / Math.pow(1 + r, i); }, 0), rate: annualRate }; }

/* EVCS legacy per-pod model (WB2 Monthly) driven ONLY by an assumption set:
   { itKwPerPod, pue, gpuPerPod, gpuPrice, utilization, uptime, priceChange,
     powerPrice, costEscalation, fixedOpexMonth, networkPct, maintPct,
     podCapex, bessCapex, liquidity, bessOmYear, investorResidual,
     ramp:[m1,m2,m3], newcoPrice, termMonths } */
var LEGACY_KEYS = { 'IT capacity per pod (kW)': 'itKwPerPod', 'PUE': 'pue', 'GPU count per pod': 'gpuPerPod', 'GPU price ($/GPU-hour)': 'gpuPrice', 'Billable utilization': 'utilization', 'Technical uptime': 'uptime', 'Annual GPU price change': 'priceChange', 'Power purchase ($/kWh)': 'powerPrice', 'Annual cost escalation': 'costEscalation', 'Fixed OpEx per pod / month': 'fixedOpexMonth', 'Network + variable cost (% revenue)': 'networkPct', 'Maintenance reserve (% revenue)': 'maintPct', 'GPU pod CAPEX': 'podCapex', 'BESS + controls installed CAPEX / pod': 'bessCapex', 'Opening liquidity / pod': 'liquidity', 'BESS O&M + reserve / year': 'bessOmYear', 'Investor residual share': 'investorResidual', 'Month 1 ramp': 'ramp1', 'Month 2 ramp': 'ramp2', 'Month 3 ramp': 'ramp3', 'NewCo utility cost ($/kWh)': 'newcoPrice', 'BESS usable duration (hours)': 'bessHours', 'Minimum remaining site term (years)': 'minTermYears' };
function fromAssumptions(list) { var a = {}; (list || []).forEach(function (x) { var k = LEGACY_KEYS[x.driver]; if (k) a[k] = x.value; }); return a; }
var REQUIRED = ['itKwPerPod', 'pue', 'gpuPerPod', 'gpuPrice', 'utilization', 'uptime', 'priceChange', 'powerPrice', 'costEscalation', 'fixedOpexMonth', 'networkPct', 'maintPct', 'podCapex', 'bessCapex', 'liquidity', 'bessOmYear', 'investorResidual'];
function legacyPod(a, opts) {
  opts = opts || {};
  var missing = REQUIRED.filter(function (k) { return a[k] == null || !isFinite(a[k]); });
  if (missing.length) return { status: 'incomplete', missing: missing, reason: 'Required assumptions are missing; no return is computed' };
  var T = opts.termMonths || 60, H = 8760 / 12, fac = a.itKwPerPod * a.pue, capital = a.podCapex + a.bessCapex + a.liquidity, ramp = [a.ramp1, a.ramp2, a.ramp3];
  var rows = [{ month: 0, spv: -capital, investor: -capital, newco: 0 }], unrec = capital;
  for (var m = 1; m <= T; m++) {
    var r = m <= 3 && ramp[m - 1] != null ? ramp[m - 1] : 1, esc = Math.pow(1 + a.costEscalation, (m - 1) / 12);
    var rev = a.gpuPerPod * a.gpuPrice * H * a.utilization * a.uptime * r * Math.pow(1 + a.priceChange, (m - 1) / 12);
    var power = fac * H * a.powerPrice * esc, other = a.fixedOpexMonth * esc + (a.networkPct + a.maintPct) * rev + a.bessOmYear / 12 * esc, spv = rev - power - other;
    var toInv = spv <= unrec ? spv : unrec + a.investorResidual * (spv - unrec); unrec = Math.max(0, unrec - spv);
    rows.push({ month: m, revenue: rev, power: power, other: other, spv: spv, investor: toInv, newco: spv - toInv, newcoSpread: a.newcoPrice != null ? fac * H * (a.powerPrice - a.newcoPrice) * esc : null });
  }
  var spvF = rows.map(function (x) { return x.spv; }), invF = rows.map(function (x) { return x.investor; });
  return { status: 'ok', model: 'EVCS legacy per-pod v1 (WB2 Monthly parity)', capital: capital, rows: rows, projectIrr: periodIrr(spvF, 12), investorIrr: periodIrr(invF, 12), paybackMonths: payback(spvF),
    scope: 'One pod; 60 operating months; pre-tax, unlevered, no exit value; NewCo energy spread reported separately and not in project cash.' };
}

/* IQGEN hardware-specific option: per-chipset capacity at an IT ceiling
   with the SAME cash-flow engine, so options are comparable. */
function iqgenPod(set, chipset, base) {
  var c = (set.chipsets || []).filter(function (x) { return x.name === chipset; })[0];
  if (!c) return { status: 'incomplete', missing: ['chipset'], reason: 'Chipset not in the IQGEN library' };
  var budget = set.itCeilingKw * (1 - (set.reservedOverhead || 0)), nodes = Math.floor(budget / c.nodeKw + 1e-9), gpus = nodes * c.gpusPerNode;
  var price = set.pricingBasis === 'Spot' ? c.spotPerNodeHr : c.onDemandPerNodeHr;
  if (price == null) return { status: 'incomplete', missing: ['price for ' + set.pricingBasis], reason: 'No ' + set.pricingBasis + ' price for ' + chipset };
  var a = Object.assign({}, base, { gpuPerPod: gpus, gpuPrice: price / c.gpusPerNode, itKwPerPod: nodes * c.nodeKw });
  if (set.capexMid != null) a.podCapex = set.capexMid;
  var res = legacyPod(a); res.model = 'IQGEN hardware-specific v1 (' + chipset + ', ' + set.pricingBasis + ')'; res.hardware = { chipset: chipset, nodes: nodes, gpus: gpus, installedItKw: nodes * c.nodeKw }; return res;
}

/* T27: aggregate dated flows across sites; never average IRRs. */
function portfolio(siteFlows) {
  var by = {}; siteFlows.forEach(function (s) { s.flows.forEach(function (f) { by[f.date] = (by[f.date] || 0) + f.amount; }); });
  var flows = Object.keys(by).sort().map(function (d) { return { date: d, amount: by[d] }; });
  return { flows: flows, irr: xirr(flows), method: 'aggregated dated cash flows' };
}
function monthlyDates(start, amounts) { var d = new Date(start + 'T00:00:00Z'); return amounts.map(function (a, i) { var x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + i, 1)); return { date: x.toISOString().slice(0, 10), amount: a }; }); }
module.exports = { xirr: xirr, periodIrr: periodIrr, payback: payback, npv: npv, legacyPod: legacyPod, fromAssumptions: fromAssumptions, iqgenPod: iqgenPod, portfolio: portfolio, monthlyDates: monthlyDates, LEGACY_KEYS: LEGACY_KEYS };
