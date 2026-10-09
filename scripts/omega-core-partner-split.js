#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/omega-core-partner-split.js — how a capital partner gets paid back
   on an Omega-Core skid, and how ClearSky gets paid, under three structures
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Tommy, 2026-10-06: "the need here is to get a bankable solution to present
   to Barry to deploy capex and then we need to design the split on how he
   makes his money back and how we get [paid] and how he can deploy the
   assets in his portfolio."

   This runs the skid's own cash flow (api/_lib/omega-compute-model.js, the
   iQGen 75 kW workbook as one pure function) UNLEVERED — the partner's
   capital in place of the workbook's bank debt — with the host's land lease
   as a cost (the market reference in api/_lib/omega-core.js RATE_CARD until
   ClearSky sets a rent) and ClearSky's operating fee as a cost, and then
   splits what is left three ways a capital partner and an operator commonly
   agree. Nothing here is a term sheet: every split parameter is a PROPOSED
   placeholder, printed with the result, for Tommy to set. The figures are
   staff-only, like the model's build-up; they never go to a prospect.

   Usage: node scripts/omega-core-partner-split.js [--electricity 0.10]
            [--fixed 2500] [--lease 1000] [--pref 12] [--split 50] [--opfee 10]
            [--yield 12] [--rs1 35] [--rs2 15] [--json]
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var M = require('../api/_lib/omega-compute-model.js');
var OC = require('../api/_lib/omega-core.js');

var args = process.argv.slice(2);
function opt(name, dflt) { var i = args.indexOf('--' + name); return i >= 0 && args[i + 1] != null ? Number(args[i + 1]) : dflt; }

/* ── the PROPOSED split, every figure a placeholder for Tommy ──────────── */
var P = {
  skidPriceUsd: 450000,                              /* the recorded skid price: what the partner pays per skid */
  opFeePct: opt('opfee', 10) / 100,                  /* ClearSky's operating fee, % of gross revenue, above the line */
  prefPct: opt('pref', 12) / 100,                    /* structure 1: the partner's preferred return, a year, on unreturned capital */
  splitToPartnerPct: opt('split', 50) / 100,         /* structure 1: the partner's share of cash after capital + pref */
  leaseYieldPct: opt('yield', 12) / 100,             /* structure 2: the yield the fixed lease is sized to give the partner */
  revShareUntil1x: opt('rs1', 35) / 100,             /* structure 3: the partner's share of gross revenue until 1.0x capital */
  revShareAfter1x: opt('rs2', 15) / 100,             /* structure 3: after 1.0x */
  residualPct: 0.30,                                 /* the FMV band's base at year 5 (RATE_CARD.fmvAtYear5.base) */
  hostLease: { monthly: opt('lease', OC.RATE_CARD.monthlyPerSkid.base), escalatorPct: OC.RATE_CARD.escalatorPct.base, source: 'market' },
  electricity: opt('electricity', null),            /* $/kWh delivered; the model's default when not given */
  fixedOpexMonthly: opt('fixed', null)               /* site, insurance, admin a month; the workbook's $5,000 when not given */
};

/* The cases. Spot is the workbook's own basis (CoreWeave's public spot rate,
   a market reference, not offtake); the contracted cases take a realisation
   under spot and a utilisation under the workbook's 85%, which is what an
   aggregator's revenue share or a reserved contract at a discount looks like. */
var CASES = [
  { key: 'merchant',   label: 'Merchant spot (the workbook)',         utilization: 0.85, priceRealization: 1.00 },
  { key: 'contracted', label: 'Contracted base (75% of spot, 70%)',   utilization: 0.70, priceRealization: 0.75 },
  { key: 'downside',   label: 'Downside (60% of spot, 60% busy)',     utilization: 0.60, priceRealization: 0.60 },
  { key: 'stress',     label: 'Stress (50% of spot, 50% busy)',       utilization: 0.50, priceRealization: 0.50 }
];

function irrMonthly(flows) {
  /* bisection on the monthly rate; flows[0] is the outlay (negative) */
  var lo = -0.99, hi = 10, i;
  function npv(r) { var s = 0; for (var k = 0; k < flows.length; k++) s += flows[k] / Math.pow(1 + r, k); return s; }
  if (npv(lo) * npv(hi) > 0) return null;
  for (i = 0; i < 200; i++) { var mid = (lo + hi) / 2; if (npv(mid) > 0) lo = mid; else hi = mid; }
  return (lo + hi) / 2;
}
function annualFromMonthly(r) { return r == null ? null : Math.pow(1 + r, 12) - 1; }
function pct(v) { return v == null ? 'n/a' : (v * 100).toFixed(1) + '%'; }
function usd(v) { return '$' + String(Math.round(v)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }

/* the unlevered project months: EBITDA after the host lease and ClearSky's operating fee */
function project(cs) {
  var raw = { utilization: cs.utilization, priceRealization: cs.priceRealization, debt: { ltc: 0 } };
  if (P.electricity != null) raw.electricity = P.electricity;
  if (P.fixedOpexMonthly != null) raw.fixedOpexMonthly = P.fixedOpexMonthly;
  var e = M.evaluate(raw, { lease: P.hostLease });
  var months = e.cashFlow.months.map(function (m) {
    var fee = m.revenue * P.opFeePct;
    return { m: m.m, revenue: m.revenue, opex: m.opex, lease: m.lease, fee: fee, cash: m.ebitda - fee, residual: m.residual || 0 };
  });
  return { eval: e, months: months, capex: e.cashFlow.capex.amount || P.skidPriceUsd, residual: Math.round(P.skidPriceUsd * P.residualPct) };
}

/* Structure 1 — the partner owns the skid, ClearSky operates: each month's
   cash pays the partner's pref, then returns his capital, then splits. The
   residual (FMV at year 5, or the host's buyout) goes to the partner. */
function waterfall(pr) {
  var cap = pr.capex, unreturned = cap, prefOwed = 0, partnerFlows = [-cap], csFlows = [0], partnerTotal = 0, csTotal = 0, payback = null, prefCoverMin = null, produced = 0;
  pr.months.forEach(function (mo, i) {
    var cash = Math.max(0, mo.cash) + (i === pr.months.length - 1 ? pr.residual : 0);
    produced += cash + mo.fee;
    var prefDue = unreturned * P.prefPct / 12 + prefOwed;
    var toPref = Math.min(cash, prefDue); prefOwed = prefDue - toPref; cash -= toPref;
    var cover = prefDue > 0 ? (Math.max(0, mo.cash)) / (unreturned * P.prefPct / 12) : null;
    if (cover != null && (prefCoverMin == null || cover < prefCoverMin)) prefCoverMin = cover;
    var toCap = Math.min(cash, unreturned); unreturned -= toCap; cash -= toCap;
    if (payback == null && unreturned <= 0.5) payback = mo.m;
    var toPartner = toPref + toCap + cash * P.splitToPartnerPct, toCs = mo.fee + cash * (1 - P.splitToPartnerPct);
    partnerFlows.push(toPartner); csFlows.push(toCs); partnerTotal += toPartner; csTotal += toCs;
  });
  return { partnerIrr: annualFromMonthly(irrMonthly(partnerFlows)), partnerMultiple: partnerTotal / cap, partnerPayback: payback, prefCoverMin: prefCoverMin,
           partnerTotal: partnerTotal, clearskyTotal: csTotal, produced: produced, clearskyYear1: csFlows.slice(1, 13).reduce(function (a, b) { return a + b; }, 0) };
}

/* Structure 2 — sale-leaseback: the partner buys the skid and leases it to
   ClearSky for a fixed monthly payment sized to his yield over the term,
   with the residual his. ClearSky keeps everything above the payment and
   carries everything below it: the partner's return is contractual. */
function leaseback(pr) {
  var n = pr.months.length, r = P.leaseYieldPct / 12, cap = pr.capex;
  var pvResidual = pr.residual / Math.pow(1 + r, n);
  var payment = (cap - pvResidual) * r / (1 - Math.pow(1 + r, -n));
  var coverMin = null, csTotal = 0, csYear1 = 0, shortMonths = 0;
  pr.months.forEach(function (mo, i) {
    var cover = mo.cash / payment; if (coverMin == null || cover < coverMin) coverMin = cover;
    var cs = mo.cash - payment + mo.fee; if (mo.cash < payment) shortMonths++;
    csTotal += cs; if (i < 12) csYear1 += cs;
  });
  return { payment: payment, partnerIrr: P.leaseYieldPct, partnerMultiple: (payment * n + pr.residual) / cap, coverMin: coverMin, shortMonths: shortMonths,
           clearskyTotal: csTotal, clearskyYear1: csYear1 };
}

/* Structure 3 — revenue share: the partner takes a share of GROSS revenue
   (first dollar, before any cost) until he has 1.0x, then a smaller share;
   ClearSky runs the skid on the rest and carries every cost. */
function revshare(pr) {
  var cap = pr.capex, got = 0, flows = [-cap], csTotal = 0, csYear1 = 0, payback = null, csNegMonths = 0;
  pr.months.forEach(function (mo, i) {
    var share = got < cap ? P.revShareUntil1x : P.revShareAfter1x, toPartner = mo.revenue * share;
    got += toPartner; if (payback == null && got >= cap) payback = mo.m;
    if (i === pr.months.length - 1) toPartner += pr.residual;
    var cs = mo.cash + mo.fee - mo.revenue * share; if (cs < 0) csNegMonths++;
    flows.push(toPartner); csTotal += cs; if (i < 12) csYear1 += cs;
  });
  return { partnerIrr: annualFromMonthly(irrMonthly(flows)), partnerMultiple: flows.slice(1).reduce(function (a, b) { return a + b; }, 0) / cap, partnerPayback: payback,
           clearskyTotal: csTotal, clearskyYear1: csYear1, clearskyNegMonths: csNegMonths };
}

var out = { proposed: P, cases: [] };
CASES.forEach(function (cs) {
  var pr = project(cs), y1 = pr.eval.cashFlow.years[0];
  out.cases.push({ key: cs.key, label: cs.label, inputs: { utilization: cs.utilization, priceRealization: cs.priceRealization, realizedGpuHour: pr.eval.cashFlow.realizedGpuHour, electricity: pr.eval.inputs.electricity, hostLeaseMonthly: P.hostLease.monthly },
    project: { capex: pr.capex, year1Revenue: y1.revenue, year1Opex: y1.opex, year1Lease: y1.lease, year1Fee: Math.round(y1.revenue * P.opFeePct), year1Cash: Math.round(y1.ebitda - y1.revenue * P.opFeePct), residual: pr.residual },
    owner: waterfall(pr), leaseback: leaseback(pr), revshare: revshare(pr) });
});

if (args.indexOf('--json') >= 0) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }

console.log('Omega-Core: the partner\'s money back and ClearSky\'s pay, one skid, 60 months, unlevered');
console.log('Proposed placeholders: op fee ' + pct(P.opFeePct) + ' of revenue · pref ' + pct(P.prefPct) + ' · split ' + pct(P.splitToPartnerPct) + ' to partner after 1x+pref · lease yield ' + pct(P.leaseYieldPct)
  + ' · rev share ' + pct(P.revShareUntil1x) + ' then ' + pct(P.revShareAfter1x) + ' · host lease ' + usd(P.hostLease.monthly) + '/mo (' + P.hostLease.source + ') · residual ' + pct(P.residualPct) + ' at month 60'
  + (P.electricity != null ? ' · electricity $' + P.electricity + '/kWh' : ' · electricity the model\'s default')
  + (P.fixedOpexMonthly != null ? ' · fixed site cost $' + P.fixedOpexMonthly + '/mo' : ' · fixed site cost the workbook\'s $5,000/mo'));
out.cases.forEach(function (c) {
  console.log('\n' + c.label + ' — ' + pct(c.inputs.utilization) + ' busy at $' + c.inputs.realizedGpuHour + '/GPU-hr realised, $' + c.inputs.electricity + '/kWh');
  console.log('  Project, year 1: revenue ' + usd(c.project.year1Revenue) + ' · opex ' + usd(c.project.year1Opex) + ' (host lease ' + usd(c.project.year1Lease) + ' inside it) · ClearSky op fee ' + usd(c.project.year1Fee) + ' · cash to split ' + usd(c.project.year1Cash));
  var o = c.owner, l = c.leaseback, r = c.revshare;
  console.log('  1 Partner owns, ClearSky operates: partner IRR ' + pct(o.partnerIrr) + ', ' + o.partnerMultiple.toFixed(2) + 'x, capital back month ' + (o.partnerPayback || '>60') + ', pref covered ' + (o.prefCoverMin == null ? 'n/a' : o.prefCoverMin.toFixed(2) + 'x at worst') + ' · ClearSky ' + usd(o.clearskyYear1) + ' yr 1, ' + usd(o.clearskyTotal) + ' over the term');
  console.log('  2 Sale-leaseback at ' + usd(l.payment) + '/mo: partner ' + pct(l.partnerIrr) + ' contractual, ' + l.partnerMultiple.toFixed(2) + 'x · lease covered ' + l.coverMin.toFixed(2) + 'x at worst, ' + l.shortMonths + ' short months · ClearSky ' + usd(l.clearskyYear1) + ' yr 1, ' + usd(l.clearskyTotal) + ' over the term');
  console.log('  3 Revenue share: partner IRR ' + pct(r.partnerIrr) + ', ' + r.partnerMultiple.toFixed(2) + 'x, 1.0x by month ' + (r.partnerPayback || '>60') + ' · ClearSky ' + usd(r.clearskyYear1) + ' yr 1, ' + usd(r.clearskyTotal) + ' over the term, ' + r.clearskyNegMonths + ' months under water');
});
