#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Omega-Core: the skid in the Compute options, the CleanCell R60 in the
   battery catalog, and Output › Omega-Core qualifying a charging site on
   power, location and fiber with the host's land lease and the 5-year terms
   (Tommy, 2026-10-02).

   Held here, each failing when its piece is removed:
     1 · the model (api/_lib/omega-core.js): the product facts, the three
         gates, fiber as the hard gate (compute-lease's own), the drawing's
         transformer never passing the power gate, fewer skids when the power
         carries fewer, the lease and buyout arithmetic, what the Run's
         numbers become, and who sees the card
     2 · the door (api/omega-core.js): Omega Compute in a package, the body
     3 · the editor: the catalog row, the flyout, the stamp at placement,
         the skid kept OUT of the host's load, cost and site type, the
         Output button, its owner module, its icon, the client module, the
         project field saved and restored, and the R60 entry
     4 · the client's collect(), run against a drawing

     node scripts/tests/tomegacore.js */
'use strict';
var fs = require('fs'), path = require('path'), vm = require('vm');
var ROOT = path.join(__dirname, '..', '..');
var ED = fs.readFileSync(path.join(ROOT, 'editor.html'), 'utf8');
var pass = 0, fail = 0;
function ok(c, l, x) { if (c) pass++; else { fail++; console.error('  FAIL  ' + l + (x != null ? '\n        ' + x : '')); } }
function eq(got, want, l) { ok(got === want, l, 'got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)); }
function bodyFrom(src, needle) {
  var at = src.indexOf(needle);
  if (at < 0 || src.indexOf(needle, at + 1) >= 0) throw new Error(needle + ' must appear exactly once');
  var k = src.indexOf('{', at), d = 0;
  for (;; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) break; } }
  return src.slice(at, k + 1);
}
function clone(o) { return JSON.parse(JSON.stringify(o)); }

/* ═══ 1 · the model ═══════════════════════════════════════════════════ */
var D = require('../_lib/firestore-double');
var OC = require('../../api/_lib/omega-core');
var CL = require('../../api/compute-lease')._model;

eq(OC.PRODUCT.systemCostUsd, 450000, 'the system costs $450,000 a skid');
eq(OC.PRODUCT.compute.kw, 75, '75 kW of compute');
eq(OC.PRODUCT.battery.kwh, 61.44, 'the R60: 61.44 kWh (datasheet)');
eq(OC.PRODUCT.battery.kw, 60, 'the R60: 60 kW through the Sol-Ark 60K');
eq(OC.PRODUCT.battery.maxAcA, 72.3, 'the R60: 72.3 A max AC output (datasheet)');
eq(OC.PRODUCT.skid.lengthIn + 'x' + OC.PRODUCT.skid.depthIn, '336x87', 'the skid is 336 x 87 in');
eq(OC.PRODUCT.skid.heightIn, 82.75, '82.75 in overall');
eq(OC.TERMS.minTermYears, 5, 'a 5-year minimum');
ok(/turn the meter off/.test(OC.TERMS.remove) && /fair market value/.test(OC.TERMS.buyout), 'the end of term: removal and meter off, or a buyout at fair market value');
ok(/own utility service and meter/.test(OC.TERMS.meter), 'the skid is on its own meter');
eq(OC.serviceAmps(135, 480, 0.95), 225, 'a skid at full peak is a 225 A 480 V service');
eq(OC.RATE_CARD.lateralPerMile, CL.RATE_CARD.lateralPerMile, 'one fiber-lateral band with compute-lease');

/* the reference charging site: everything on evidence */
var GOOD = {
  site: { name: 'Main St Charging', address: '1 Main St, Edison, NJ', lat: 40.52, lng: -74.41 },
  drawing: { units: 1, chargers: { dcfcUnits: 4, dcfcKw: 600, l2Units: 2, l2Kw: 38, ports: 10 }, xfmrKva: 1500, dcLoadKw: 0 },
  run: { capex: 1400000, incentive: 300000, annualRevenue: 220000, at: '2026-10-01T00:00:00Z' },
  evidence: {
    gridAtlas: { score: 80, nearestSubKm: 1.2, maxKv: 69 },
    network: { verdict: 'likely', reasons: ['metro fiber at 0.1 mi'], lateral: { mi: 0, costLow: 0, costHigh: 0 } },
    parcel: { ok: true, zoning: 'C-3', owner: 'MAIN ST HOLDINGS LLC', apn: '12-34', county: 'Middlesex' }
  },
  rep: { availableKw: 400, willServe: 'confirmed', fiberOnSite: 'yes', fiberDownMbps: 1000, fiberUpMbps: 1000,
         hostWilling: 'yes', termYears: 5, endOfTerm: 'remove' }
};
var r = OC.evaluate(GOOD, {});
eq(r.verdict, 'qualified', 'a charging site with a will-serve, commercial zoning and gig fiber qualifies');
eq(r.gates.power.status, 'pass', 'power passes on the utility\'s confirmed figure');
eq(r.gates.location.status, 'pass', 'location passes: chargers drawn, commercial zoning, located');
eq(r.gates.fiber.status, 'pass', 'fiber passes on 1 Gbps symmetric on site');
eq(r.units.proposed, 1, 'one skid proposed');
eq(r.offer.monthlyPerSkid.base, 1000, 'the lease opens at $1,000 a skid a month');
eq(r.offer.annual.base, 12000, '$12,000 a year');
eq(r.offer.termTotal.base, Math.round(CL.escalatedTotal(12000, 0.025, 5)), 'the term total escalates 2.5% over 5 years');
eq(r.host.run.netCost, 1100000, 'the Run\'s capex less its incentives');
eq(r.host.paybackYearsBefore, 5, 'payback before: 1.1M / 220k');
eq(r.host.paybackYearsAfter, Math.round(1100000 / 232000 * 10) / 10, 'payback after: the lease added to the Run\'s revenue');
eq(r.host.revenueUpliftPct, Math.round(12000 / 220000 * 1000) / 10, 'the lease as a share of year-one revenue');
eq(r.program.systemCost, 450000, 'ClearSky\'s system cost for one skid');
eq(JSON.stringify(r.program.fmvAtEndPerSkid), JSON.stringify({ low: 90000, base: 135000, high: 180000 }), 'fair market value at year 5: 20 / 30 / 40% of $450k, indicative');
eq(r.terms.minTermYears, 5, 'the terms carry the 5-year minimum');
eq(r.terms.endOfTerm.preference, 'remove', 'and the host\'s end-of-term preference');
ok(/appraisal/.test(r.disclaimer), 'the disclaimer says FMV is an appraisal');
eq(r.rateCard.disclosed, false, 'a tenant does not see the card build-up');
ok(!r.rateCard.buildUp, 'no build-up off staff');
ok(OC.evaluate(GOOD, { disclose: true }).rateCard.buildUp, 'staff see the build-up');

/* THE RENT (Tommy, 2026-10-03: "idk the lease amounts yet we will need to
   manually input that or go with a market standard"): no rent is set, so the
   card is a market reference — never an offer, whatever the verdict — until
   a rent is typed for the site. */
eq(r.offer.source, 'market', 'with no rent typed, the lease is the market reference');
eq(r.offer.indicative, true, 'and a market reference is never an offer, even on a qualified site');
ok(/market reference, not an offer/.test(r.offer.label), 'its heading says so');
ok(r.offer.market && r.offer.market.sources.length >= 2 && r.offer.market.sources.every(function (x) { return /^https:\/\//.test(x.url) && x.figure; }),
   'and names the comparables it is read off, each with a source');
ok(r.findings.some(function (f) { return /No Omega-Core rent is set/.test(f.text); }), 'the findings say no rent is set');
ok(r.host.notes.some(function (n) { return /market reference.s base/.test(n); }), 'the host figures say they are on the reference');
ok(/has not set an Omega-Core rent/.test(r.disclaimer), 'and so does the disclaimer');
eq(r.rateCard.basis, 'market-reference', 'a tenant sees what the card is');
ok(!r.rateCard.monthlyPerSkid && !r.rateCard.sources, 'but not the card itself');
eq(OC.RATE_CARD.version, 'omega-core-lease-v2', 'the card is versioned past the seed');
var rent = clone(GOOD); rent.rep.leaseMonthly = 1200;
var rr = OC.evaluate(rent, {});
eq(rr.offer.source, 'entered', 'a rent typed for the site replaces the reference');
eq(JSON.stringify(rr.offer.monthlyPerSkid), JSON.stringify({ low: 1200, base: 1200, high: 1200 }), 'one figure, not a range');
eq(rr.offer.escalatorPct.base, 2.5, 'escalating at the reference base when none is typed');
eq(rr.offer.termTotal.base, Math.round(CL.escalatedTotal(14400, 0.025, 5)), 'priced over the term');
eq(rr.offer.indicative, false, 'a qualified site at a typed rent is not marked indicative');
ok(/at the entered rent/.test(rr.offer.label) && !rr.offer.market, 'its heading says the rent was entered, with no reference beside it');
eq(rr.host.leaseAnnual, 14400, 'the host\'s figures follow the typed rent');
eq(rr.host.paybackYearsAfter, Math.round(1100000 / 234400 * 10) / 10, 'payback after, on the typed rent');
eq(rr.program.leaseTermTotal, rr.offer.termTotal.base, 'and so does ClearSky\'s outlay');
ok(!rr.findings.some(function (f) { return /No Omega-Core rent is set/.test(f.text); }), 'no "no rent" finding once one is typed');
rent.rep.leaseEscalatorPct = 3;
eq(OC.evaluate(rent, {}).offer.termTotal.base, Math.round(CL.escalatedTotal(14400, 0.03, 5)), 'a typed escalator is used');
rent.rep.leaseMonthly = '1500';
eq(OC.evaluate(rent, {}).offer.monthlyPerSkid.base, 1500, 'a numeric string is a rent');
[0, -100, 25000, '', '1,200', true, [900]].forEach(function (bad) {
  var b = clone(GOOD); b.rep.leaseMonthly = bad;
  eq(OC.evaluate(b, {}).offer.source, 'market', 'a rent of ' + JSON.stringify(bad) + ' is not a rent');
});
var big = clone(GOOD); big.rep.leaseMonthly = 25000;
ok(OC.evaluate(big, {}).findings.some(function (f) { return /\$25,000 per skid per month was entered/.test(f.text); }), 'a rent set aside is said, never clamped');
var escOnly = clone(GOOD); escOnly.rep.leaseEscalatorPct = 3;
ok(OC.evaluate(escOnly, {}).findings.some(function (f) { return /escalator was entered without a rent/.test(f.text); }), 'an escalator alone waits for a rent');
var escBad = clone(GOOD); escBad.rep.leaseMonthly = 1000; escBad.rep.leaseEscalatorPct = 40;
eq(OC.evaluate(escBad, {}).offer.escalatorPct.base, 2.5, 'an escalator over 10% is set aside for the base');
var openRent = OC.evaluate({ rep: { leaseMonthly: 1100 } }, {});
eq(openRent.verdict, 'needs-qualification', 'a typed rent never qualifies a site');
eq(openRent.offer.indicative, true, 'and on an open site it stays indicative');
ok(/indicative until the site qualifies/.test(openRent.offer.label), 'and is headed so');
var noLease = clone(GOOD); noLease.rep.willServe = 'none'; noLease.rep.leaseMonthly = 1200;
eq(OC.evaluate(noLease, {}).offer, null, 'a site that does not qualify gets no lease, typed rent or not');

/* THE SKID'S OWN ECONOMICS (Tommy, 2026-10-05, handing over the iQGen 75 kW
   cash-flow workbook: "this is how the Omega-Compute needs to be modeled …
   white labeling it Omega Core Skid … customer facing version … show
   bankability"). api/_lib/omega-compute-model.js is that workbook; its
   visible sheet's figures are pinned here so the model cannot drift. */
var CM = OC.COMPUTE;
function near(got, want, tol, l) { ok(got != null && Math.abs(got - want) <= tol, l, 'got ' + got + ', want ' + want + ' ±' + tol); }
eq(CM.evaluate({}, {}).capex.amount, 450000, 'the default CAPEX is the recorded $450,000 skid price (Tommy, 2026-10-06: "use the 450k skid price as the default")');
eq(CM.evaluate({}, {}).capex.basis, 'skid', 'on the skid basis');
eq(CM.evaluate({ capexBasis: 'nonsense' }, {}).capex.amount, 450000, 'an unknown basis falls back to the skid price, and says so');
var W = CM.evaluate({ capexBasis: 'cmdc' }, { units: 1 });   /* the workbook's own figures: H100, spot, GP air-cooled high, 70% LTC */
eq(W.chipset.key, 'h100', 'the default chipset is the H100 the workbook anchors on');
eq(W.capacity.nodes, 6, '6 nodes fit 75 kW less 5% overhead at 10.2 kW a node');
eq(W.capacity.gpus, 48, '48 GPUs');
eq(W.capacity.installedKw, 61.2, '61.2 kW installed');
eq(W.capacity.facilityKw, 73.44, '73.44 kW at the meter (PUE 1.2)');
eq(W.capex.amount, 724471, 'CAPEX on the workbook\'s own basis: the CMDC general-purpose air-cooled high end, $724,471');
ok(!/CMDC|CoreWeave/.test(JSON.stringify([W.capex, W.notes, W.customer])), 'a tenant\'s capex label, notes and customer view name no internal cost reference');
eq(OC.evaluate({ rep: { compute: { chipset: 'a100' } } }, {}).compute.chipset.key, 'a100', 'the dialog\'s inputs ride inside rep.compute and reach the model');
eq(W.capex.perItKw, 9660, '$9,660 an IT kW');
var wcf = W.cashFlow, wm = wcf.months;
eq(wcf.debt.funded, 507130, 'debt funded 507,130 (70% LTC)');
eq(wcf.debt.fee, 10143, 'a 2% fee');
eq(wcf.debt.reserve, 12678, 'a 3-month debt service reserve');
eq(wcf.debt.equityCapex, 217341, 'equity in the CAPEX');
eq(wcf.debt.initialEquity, 240162, 'initial equity required');
near(wcf.debt.principalAfterIo, 8452.16, 0.01, 'monthly principal after interest-only');
near(wm[0].revenue, 35956.4, 0.5, 'month-1 revenue at a 50% ramp on spot pricing');
near(wm[0].electricity, 3940.42, 0.05, 'month-1 electricity');
near(wm[0].ebitda, 23420.3, 0.5, 'month-1 EBITDA');
near(wm[0].equity, -220968, 1, 'month-1 equity cash flow: the equity, fee and reserve out, less operations and interest');
near(wm[6].debtService, 12678.2, 0.1, 'month 7: the first amortising payment');
near(wm[6].dscr, 3.865, 0.001, 'month-7 DSCR 3.87x');
near(wm[59].residual, 72447.1, 0.1, 'the 10% residual in month 60');
near(wm[59].balloon, 50713, 0.5, 'the 10% balloon in month 60');
eq(wm[59].debtEnding, 0, 'the debt is repaid at maturity');
eq(wcf.years.length, 5, 'five years');
eq(wcf.years[0].revenue, 755699, 'year-1 revenue (the sheet\'s own cell summed the wrong row)');
eq(wcf.years[0].ebitda, 531735, 'year-1 EBITDA');
eq(wcf.years[0].debtService, 100369, 'year-1 debt service');
eq(wcf.years[0].equity, 191203, 'year-1 equity cash flow');
eq(wcf.years[1].revenue, 764368, 'year-2 revenue');
eq(wcf.years[4].equity, 269077, 'year-5 equity cash flow (residual and balloon in)');
eq(wcf.returns.projectPaybackMonth, 17, 'project payback month 17');
eq(wcf.returns.equityPaybackMonth, 7, 'equity payback month 7');
near(wcf.returns.year1Dscr, 5.3, 0.01, 'year-1 DSCR is EBITDA over debt service, not two blank cells');
near(wcf.returns.projectCashMultiple, 3.27, 0.01, '5-year project multiple is cash over CAPEX, not principal over CAPEX');
ok(wcf.returns.equityIrrPct > 100 && wcf.returns.projectIrrPct > 50, 'IRRs are annualised from the monthly flows');
eq(wcf.bankability.meetsTarget, true, 'bankability: the minimum amortising DSCR clears 1.25x');
near(wcf.bankability.minDscrAmortizing, 3.149, 0.001, 'the minimum is month 59, 3.15x');
eq(wcf.bankability.monthsBelowTarget, 0, 'no month under the target');
eq(wcf.bankability.balloonMonth, 60, 'the balloon month is named apart');
near(wcf.bankability.balloonMonthDscr, 0.47, 0.01, 'and its own cover from operations');
ok(wcf.bankability.debtCapacityAtTarget > wcf.debt.funded, 'debt capacity at the target exceeds the loan assumed');
eq(wcf.lease.included, false, 'with no offer there is no rent in the cash flow');
eq(W.disclosed, false, 'a tenant does not see the build-up');
ok(!W.buildUp && W.customer && W.customer.headline.length >= 8 && W.customer.assumptions.length >= 6, 'but gets the customer view: headline figures and plain-word assumptions');
ok(!JSON.stringify(W.customer).match(/CMDC|CoreWeave|index/), 'the customer view names no cost reference, price sheet or proxy');
ok(CM.evaluate({}, { disclose: true }).buildUp.corrections.length >= 4, 'staff see the build-up, with the workbook\'s corrections named');
/* the hidden Revenue Model / Scenario Comparison world: on-demand, $0.10 */
var SC = CM.evaluate({ pricingBasis: 'on-demand', electricity: 0.10 }, {}).scenarios;
var h100 = SC.rows[0], l40s = SC.rows.filter(function (x) { return x.key === 'l40s'; })[0], gb200 = SC.rows.filter(function (x) { return x.key === 'gb200'; })[0];
near(h100.annualRevenue, 2155850, 2, 'scenario H100: $2.156M a year on demand');
near(h100.contribution, 1859048, 2, 'contribution $1.859M');
near(h100.capexMid, 1935625, 2, 'chipset-scaled CAPEX midpoint $1,935,625');
near(h100.paybackMonths, 12.5, 0.05, 'payback 12.5 months');
near(h100.cashOnCashYieldPct, 96.04, 0.01, 'cash-on-cash yield 96.0%');
eq(l40s.nodes + '/' + l40s.gpus, '15/120', 'L40S: 15 nodes, 120 GPUs in the same 75 kW');
eq(SC.bestYield, 'gb200', 'GB200 NVL72 has the best yield');
near(gb200.cashOnCashYieldPct, 99.98, 0.01, 'at 99.98%');
eq(SC.fastestPayback, 'gb200', 'and the fastest payback — never a chipset with no price');
ok(SC.rows.filter(function (x) { return !x.priced; }).length === 2, 'B300 and GB300 have no public on-demand price and say so');
var SE = CM.evaluate({ pricingBasis: 'on-demand' }, {}).sensitivity;
near(SE.annualRevenue[4][4], 2155850, 2, 'sensitivity: 85% utilisation at 100% price is the base');
near(SE.annualRevenue[0][0], 760888, 2, '50% utilisation at 60% price');
eq(CM.cmdcTotals('general-air').high, 724471, 'the CMDC general-purpose high end');
eq(CM.cmdcTotals('accelerated-liquid').low, 1357684, 'the accelerated low end');
/* what Omega-Core adds */
var LC = CM.evaluate({}, { units: 2, lease: { monthly: 1000, escalatorPct: 2.5, source: 'market' } });
eq(LC.cashFlow.lease.included, true, 'the host\'s rent is a cost of the skid');
eq(LC.cashFlow.months[0].lease, 1000, 'a skid a month');
eq(LC.cashFlow.months[12].lease, 1025, 'escalating yearly');
eq(LC.cashFlow.returns.year1Ebitda, 531735 - 12000, 'and comes off EBITDA');
eq(LC.totals.capex, 450000 * 2, 'two skids: the totals scale');
eq(LC.totals.year1Revenue, 755699 * 2, 'revenue too');
eq(CM.evaluate({ includeLease: 'no' }, { lease: { monthly: 1000, escalatorPct: 2.5 } }).cashFlow.lease.included, false, 'switched off, the skid is shown alone');
var SK = CM.evaluate({}, {}).cashFlow;
eq(SK.debt.funded, 315000, 'on the skid price the debt is $315,000 at 70%');
ok(SK.returns.projectPaybackMonth < W.cashFlow.returns.projectPaybackMonth, 'and the project pays back sooner than on the container range');
ok(/\$450,000/.test(CM.evaluate({}, {}).customer.headline[2].value), 'the customer view carries the skid price');
eq(CM.evaluate({ capexBasis: 'custom', capexCustom: 600000 }, {}).capex.amount, 600000, 'and so is a typed figure');
eq(CM.evaluate({ capexBasis: 'dynamic', capexCase: 'mid' }, {}).capex.amount, 1935626, 'and the chipset-scaled estimate');
var BB = CM.evaluate({ chipset: 'b200', pricingBasis: 'on-demand', utilization: 85, debt: { ltc: 60, rate: 9 } }, {});
eq(BB.chipset.key + '/' + BB.capacity.gpus, 'b200/32', 'B200: 4 nodes of 14.3 kW, 32 GPUs');
eq(BB.inputs.utilization, 0.85, 'a percent typed as 85 is read as 85%');
eq(BB.inputs.debt.ltc + '/' + BB.inputs.debt.rate, '0.6/0.09', 'debt fields too');
var BAD = CM.evaluate({ chipset: 'zzz', utilization: 150, electricity: 'x', debt: { ltc: 99 } }, {});
ok(BAD.notes.some(function (t) { return /not in the library/.test(t); }) && BAD.notes.some(function (t) { return /Utilization of 150/.test(t); }) && BAD.inputs.debt.ltc === 0.7, 'an input out of range is set aside and said, never clamped into a number nobody typed');
ok(CM.evaluate({ chipset: 'gb300' }, {}).notes.some(function (t) { return /no public spot price/.test(t); }), 'a chipset with no price on the basis says so instead of pricing');
/* through the Omega-Core door */
eq(r.compute && r.compute.units, 1, 'the Omega-Core answer carries the compute model on the skids proposed');
eq(r.compute.cashFlow.lease.monthly, 1000, 'with the offer\'s base rent as a cost');
eq(OC.evaluate(rent, {}).compute.cashFlow.lease.monthly, 1500, 'or the rent typed');
var many4 = clone(GOOD); many4.rep.units = 6; many4.rep.availableKw = 300;
eq(OC.evaluate(many4, {}).compute.units, 4, 'on the skids the power carries');
eq(OC.evaluate(GOOD, { disclose: true }).compute.disclosed, true, 'staff see the compute build-up through the door');
eq(OC.evaluate(GOOD, {}).compute.disclosed, false, 'a tenant does not');
eq(OC.evaluate({ rep: {}, compute: { chipset: 'h200' } }, {}).compute.chipset.key, 'h200', 'the rep\'s compute inputs reach the model');

/* NO FALSE RESULTS: a firm answer only on a confirmed fact */
eq(OC.evaluate(GOOD, {}).verdictLabel, 'Qualified', 'Qualified, in those words');
var drawnOnly = clone(GOOD); delete drawnOnly.rep.availableKw; drawnOnly.rep.willServe = 'unknown';
eq(OC.evaluate(drawnOnly, {}).gates.power.qualification, 'needs-qualification', 'room on the drawing alone needs qualification, never "clears"');
eq(OC.evaluate(drawnOnly, {}).verdict, 'needs-qualification', 'so the site does too');
var capped = clone(GOOD); capped.rep.availableKw = 100;
eq(OC.evaluate(capped, {}).gates.power.qualification, 'clears-with-conditions', 'the utility\'s 100 kW confirmed: one skid with its recharge capped clears with conditions');
eq(OC.evaluate(capped, {}).verdict, 'conditional', 'and the site qualifies with conditions');
var pendingWs = clone(GOOD); pendingWs.rep.willServe = 'requested';
eq(OC.evaluate(pendingWs, {}).verdict, 'needs-qualification', 'a will-serve still pending needs qualification');
var declinedV = clone(GOOD); declinedV.rep.willServe = 'none';
eq(OC.evaluate(declinedV, {}).verdict, 'not-qualified', 'a declined will-serve is a confirmed "does not qualify"');
var reachable = clone(GOOD); reachable.rep.fiberOnSite = 'no';
eq(OC.evaluate(reachable, {}).gates.fiber.qualification, 'needs-qualification', 'fiber reachable but not on site needs a carrier');

/* fiber is the hard gate and it is compute-lease's own */
var noFiber = clone(GOOD); noFiber.rep.fiberOnSite = 'no'; noFiber.evidence.network = { verdict: 'unlikely', reasons: [] };
var nf = OC.evaluate(noFiber, {});
eq(nf.verdict, 'needs-qualification', 'no fiber and the public record says unlikely: needs further qualification, never a false "no"');
eq(nf.gates.fiber.qualification, 'likely-fails', 'the fiber gate reads "unlikely — confirm", not a confirmed fail');
eq(nf.offer, null, 'and no lease is priced on it: fiber is still the hard gate');
eq(nf.verdictLabel, 'Needs further qualification', 'in those words');
eq(JSON.stringify(OC.gateFiber(GOOD.rep, GOOD.evidence).status), JSON.stringify(CL.gateFiber(GOOD.rep, GOOD.evidence).status), 'the fiber gate is compute-lease\'s gateFiber');
var withFile = OC.gateFiber({}, { fiberOnFile: { nearestRoute: { distanceM: 1609.344, operator: 'Zayo' } } });
ok(withFile.basis.some(function (b) { return /1 mi \(Zayo\)/.test(b); }), 'fiber already on the project is reported');
eq(withFile.status, CL.gateFiber({}, {}).status, 'and never moves the gate');

/* location */
var resi = clone(GOOD); resi.rep.zoningCode = 'R-1';
eq(OC.evaluate(resi, {}).gates.location.status, 'fail', 'residential zoning fails location');
eq(OC.evaluate(resi, {}).verdict, 'not-qualified', 'entered by the rep, it is a confirmed "does not qualify"');
eq(OC.evaluate(resi, {}).verdictLabel, 'Does not qualify', 'in those words');
var resiRec = clone(GOOD); resiRec.evidence.parcel.zoning = 'R-1';
var rr = OC.evaluate(resiRec, {});
eq(rr.verdict, 'needs-qualification', 'a county record alone saying residential needs qualification, never a false "no"');
eq(rr.offer, null, 'and no lease is quoted on it');
ok(/confirm/.test(rr.gates.location.headline), 'the headline asks for the check');
var noEv = clone(GOOD); noEv.drawing.chargers = {};
eq(OC.evaluate(noEv, {}).gates.location.status, 'conditional', 'no chargers drawn: conditional — Omega-Core is for charging sites');
var noPt = clone(GOOD); noPt.site = {};
eq(OC.evaluate(noPt, {}).gates.location.status, 'unconfirmed', 'no map point: unconfirmed');

/* power */
var declined = clone(GOOD); declined.rep.willServe = 'none';
eq(OC.evaluate(declined, {}).gates.power.status, 'fail', 'a declined will-serve fails power');
var tiny = clone(GOOD); tiny.rep.availableKw = 50;
eq(OC.evaluate(tiny, {}).gates.power.status, 'fail', 'the utility\'s 50 kW is under one skid: fails');
var drawn = clone(GOOD); delete drawn.rep.availableKw; drawn.rep.willServe = 'unknown';
var dp = OC.evaluate(drawn, {}).gates.power;
eq(dp.status, 'conditional', 'the drawn transformer shows room: conditional, never pass');
eq(dp.headroomSource, 'drawing', 'and says the headroom is the drawing\'s');
eq(dp.headroomKw, Math.round(1500 * 0.95 - 638), 'headroom = kVA x pf - the host\'s drawn chargers');
var full = clone(drawn); full.drawing.xfmrKva = 500;
var fullR = OC.evaluate(full, {});
eq(fullR.gates.power.qualification, 'likely-fails', 'a full drawn transformer is "unlikely — confirm", never a confirmed fail on a drawing alone');
eq(fullR.verdict, 'needs-qualification', 'so the site needs further qualification');
eq(fullR.offer, null, 'and no lease is quoted on room the only evidence says is not there — never more skids as the room shrinks');
var many = clone(GOOD); many.rep.units = 6; many.rep.availableKw = 300;
var mr = OC.evaluate(many, {});
eq(mr.units.supported, 4, '300 kW carries 4 skids at the compute load');
eq(mr.units.proposed, 4, 'the lease is priced on the 4 the power carries, never the 6 asked');
eq(mr.offer.monthly.base, 4000, '4 skids at base');
ok(mr.findings.some(function (f) { return /supports 4 of the 6/.test(f.text); }), 'and says so');
var nothing = OC.evaluate({ rep: {} }, {});
eq(nothing.gates.power.status, 'unconfirmed', 'nothing known: power unconfirmed');
eq(nothing.verdict, 'needs-qualification', 'nothing known: needs further qualification — never disqualified for not asking');
eq(nothing.offer.indicative, true, 'and its lease range is marked indicative, not an offer');
ok(/not an offer/.test(nothing.verdictReason), 'and says so');
ok(nothing.asks.length >= 4, 'and a call list');
eq(nothing.offer.units, 1, 'one skid by default');

/* the review's findings, each pinned */
var conf = OC.evaluate({ rep: { willServe: 'confirmed' } }, {});
eq(conf.gates.power.status, 'conditional', 'a confirmed will-serve with no kW figure is room to read, not unconfirmed');
ok(!conf.asks.some(function (a) { return /open a will-serve request/.test(a.ask); }), 'and it never asks to open the will-serve it already has');
var pend = OC.evaluate({ rep: { willServe: 'requested' } }, {});
ok(pend.asks.some(function (a) { return /chase the pending will-serve/.test(a.ask); }), 'a pending will-serve is chased, not re-opened');
var fullA = OC.evaluate(full, {});
ok(!fullA.asks.some(function (a) { return /drawing shows room/.test(a.ask); }), 'a full drawn transformer never also says the drawing shows room');
var six = clone(full); six.rep.units = 6;
eq(OC.evaluate(six, {}).offer, null, 'six asked on a full drawn transformer: still no lease, not six skids priced');
var cappedH = clone(GOOD); cappedH.rep.availableKw = 100;
eq(OC.evaluate(cappedH, {}).gates.power.headline, 'Room at the compute load — recharge capped', 'a utility-confirmed figure never reads "utility to confirm"');
var down = clone(GOOD); down.rep.units = 3; down.rep.availableKw = 140;
var dr = OC.evaluate(down, {});
eq(dr.units.proposed, 1, '140 kW carries one skid');
eq(dr.gates.power.status, 'pass', 'and the power gate is judged on the one priced, not the three asked');
ok(/Asked for 3 skids; the power carries 1/.test(dr.gates.power.basis[0]), 'and says so first');
eq(dr.verdict, 'qualified', 'so a site that carries what is priced qualifies');
var junk = clone(GOOD); junk.rep.availableKw = []; junk.rep.willServe = 'unknown'; delete junk.drawing.xfmrKva;
eq(OC.evaluate(junk, {}).gates.power.status, 'unconfirmed', 'an array is unanswered, never 0 kW and a fail');
junk.rep.availableKw = true;
eq(OC.evaluate(junk, {}).gates.power.status, 'unconfirmed', 'a boolean too');
eq(OC.evaluate(noPt, {}).gates.location.headline, 'No map point', 'the location headline names what is open');
var big = clone(GOOD); big.rep.units = 25; big.rep.availableKw = 5000; big.rep.termYears = 20;
var br = OC.evaluate(big, {});
eq(br.units.requested, 25, 'what was asked is reported as asked');
eq(br.units.proposed, 20, 'and one screen prices up to 20');
ok(br.findings.some(function (f) { return /Asked for 25 skids/.test(f.text); }) && br.findings.some(function (f) { return /20-year term/.test(f.text); }), 'both clamps are said, not silent');
ok(!OC.evaluate(noEv, {}).asks.some(function (a) { return /confirm it is a charging site/.test(a.ask); }), 'no ask points at a field the dialog does not have');

/* terms and the Run */
var shortT = clone(GOOD); shortT.rep.termYears = 3;
eq(OC.evaluate(shortT, {}).offer.termYears, 5, 'a term under 5 years is priced at the 5-year minimum');
ok(OC.evaluate(shortT, {}).asks.some(function (a) { return /program minimum is 5/.test(a.ask); }), 'and the host is told the minimum');
var longT = clone(GOOD); longT.rep.termYears = 10;
eq(OC.evaluate(longT, {}).program.fmvAtEndPerSkid.base, Math.round(450000 * 0.09 / 1000) * 1000, 'a longer term leaves less value: 0.3^2 at year 10');
var noRun = clone(GOOD); delete noRun.run;
var nr2 = OC.evaluate(noRun, {});
eq(nr2.host.paybackYearsBefore, null, 'no Run: no payback invented');
ok(nr2.host.notes.some(function (n) { return /Run the site/.test(n); }), 'and it asks for the Run');
var stale = clone(GOOD); stale.run.stale = true;
ok(OC.evaluate(stale, {}).host.notes.some(function (n) { return /changed after the last Run/.test(n); }), 'a stale Run is said');
var noRev = clone(GOOD); noRev.run.annualRevenue = 0;
eq(OC.evaluate(noRev, {}).host.revenueUpliftPct, null, 'a Run with no revenue: no uplift percentage');
var nrv = OC.evaluate(noRev, {}).host;
eq(nrv.paybackYearsAfter, null, 'the lease alone does not repay $1.1M inside 5 years, and no number pretends it does');
ok(nrv.notes.some(function (n) { return /inside the 5-year term/.test(n); }), 'and it says so');
var slow = clone(GOOD); slow.run.annualRevenue = 100000;
eq(OC.evaluate(slow, {}).host.paybackYearsAfter, Math.round((10 + (1100000 - 100000 * 10 - OC.evaluate(slow, {}).offer.termTotal.base) / 100000) * 10) / 10,
   'past the term the lease stops: payback counts only the rent contracted');

/* ═══ 2 · the door ═════════════════════════════════════════════════════ */
var ctx, member, org, readsFail = false;
D.mock('../api/_lib/verify-token', {
  authenticateWithTier: function () { return Promise.resolve(ctx); },
  readAsCaller: function (token, p) { if (readsFail) return Promise.reject(Object.assign(new Error('PERMISSION_DENIED raw'), { status: 403 })); return Promise.resolve(/\/members\//.test(p) ? member : org); },
  httpError: function (status, message) { return Object.assign(new Error(message), { status: status }); }
});
delete require.cache[require.resolve('../../api/compute-lease')];
var handler = require('../../api/omega-core');
function setup(modules, tier, orgId) {
  org = { status: 'active', name: 'Concord Energy' }; member = { role: 'member', status: 'active' };
  ctx = { caller: { uid: 'u1', email: 'a@' + (orgId || 'example.com'), orgId: orgId || 'example.com', emailVerified: true, staff: false },
          tier: tier || 'enterprise',
          billing: modules ? { packaged: true, packagingState: 'paid', accessUntil: Date.now() + 86400000, modules: modules, toolOverrides: {}, addons: [] }
                           : { tier: tier || 'enterprise', toolOverrides: {} } };
}
function call(method, body) {
  var out = {}, res = { setHeader: function () {}, status: function (n) { out.status = n; return res; }, json: function (j) { out.body = j; return res; } };
  return Promise.resolve(handler({ method: method, headers: { authorization: 'Bearer t' }, body: body || {} }, res)).then(function () { return out; });
}
function expect(code, label, body) { return call('POST', body === undefined ? { rep: {} } : body).then(function (o) { eq(o.status, code, label + (o.status !== code ? ' — ' + JSON.stringify(o.body && o.body.error) : '')); return o; }); }
var doorChecks = [
  function () { setup(null); return call('GET').then(function (o) {
    eq(o.status, 200, 'GET answers'); eq(o.body.product.name, 'Omega-Core', 'with the product\'s name and size');
    ok(!/450000/.test(JSON.stringify(o.body)), 'never the price on an unauthenticated GET');
    ok(!o.body.rateCard.monthlyPerSkid, 'and never the lease card'); }); },
  function () { setup(null); return expect(400, 'a body without rep:{} is a 400', {}); },
  function () { setup(null); return expect(200, 'a legacy Enterprise member is answered').then(function (o) {
    eq(o.body.brand.name, 'Concord Energy', 'carrying their own brand'); }); },
  function () { setup(null, 'trial'); return expect(403, 'a legacy trial does not open the compute cap: refused, as the button is hidden'); },
  function () { setup(null, 'standard'); return expect(403, 'nor does Standard'); },
  function () { setup(null, 'standard'); ctx.billing.addOns = { live: ['compute'], accessUntil: Date.now() + 86400000 };
    return expect(200, 'Standard with a live Omega Compute add-on is answered'); },
  function () { setup(null, 'trial', 'sunesol.com'); return expect(200, 'a JV org opens compute on any tier'); },
  function () { setup(null); ctx.billing.toolAccess = ['gridatlas']; return expect(403, 'a product without Site Map is refused'); },
  function () { setup(null); ctx.billing.toolAccess = ['editor', 'gridatlas']; return expect(200, 'a product with Site Map is answered'); },
  function () { setup(null); member.toolAccess = ['gridatlas']; return expect(403, 'a member without Site Map is refused'); },
  function () { setup(null); member.status = 'disabled'; return expect(403, 'a disabled member is refused'); },
  function () { setup(null); ctx.billing.toolOverrides = { omegacore: false }; return expect(403, 'Omega-Core switched off refuses it'); },
  function () { setup(null); ctx.billing.toolOverrides = { computelease: false }; return expect(403, 'the Land Lease tool switched off refuses it'); },
  function () { setup(null); org.status = 'pending'; return expect(403, 'a workspace still being set up is refused'); },
  function () { setup(null); org.status = 'suspended'; return expect(403, 'a suspended workspace is refused'); },
  function () { setup(null); org = null; return expect(200, 'a missing omega_orgs record fails open, as the editor gate does'); },
  function () { setup(['lite']); return expect(403, 'a package without Omega Compute is refused'); },
  function () { setup(['lite']); ctx.billing.toolOverrides = { omegacore: true, computelease: true }; ctx.billing.addons = ['compute'];
    return expect(403, 'and no override or addon forges it'); },
  function () { setup(['lite', 'compute']); return expect(200, 'Omega Compute in the package: answered'); },
  function () { setup(null); ctx.billing.toolOverrides = { editor: false }; return expect(403, 'Site Map switched off refuses it'); },
  function () { setup(['lite', 'compute']); member.toolAccess = ['computeproforma']; return expect(403, 'a packaged member without Site Map in their tools is refused'); },
  function () { setup(['lite', 'compute']); member.toolAccess = ['editor']; return expect(200, 'and with it, answered'); },
  function () { setup(null); readsFail = true; return expect(503, 'a failed read is try-again, never a pass').then(function (o) {
    readsFail = false; ok(!/PERMISSION_DENIED/.test(JSON.stringify(o.body)), 'and never the raw error'); }); },
  function () { setup(null, 'trial'); ctx.caller.staff = true; return expect(200, 'staff are answered').then(function (o) { ok(!!o.body.rateCard.buildUp, 'and see the card'); }); }
];

/* ═══ 3 · the editor ═══════════════════════════════════════════════════ */
function editorChecks() {
  /* the catalog row, evaluated as tztmm.js does */
  var sb = {}; vm.createContext(sb);
  vm.runInContext(ED.slice(ED.indexOf('var DC_CATALOG = {'), ED.indexOf('/* END ZTMM PLANNER */')) + ';this.DC=DC_CATALOG;', sb);
  var row = sb.DC.dc_omegacore;
  ok(row && row.omegaCore === true && row.ownMeter === true, 'DC_CATALOG has dc_omegacore, on its own meter');
  eq(row && row.lf + 'x' + row.wf, '28x7.25', 'the skid draws 28 x 7.25 ft (336 x 87 in)');
  eq(row && row.kw, 75, '75 kW of compute');
  eq(row && row.bessKwh, 61.44, 'the R60 on the skid: 61.44 kWh');
  eq(row && row.bessKey, 'CC-R60', 'one source for the battery: BESS_CATALOG[\'CC-R60\']');
  ok(!/450/.test(JSON.stringify(row)), 'the price is not in the browser');
  ok(/onclick="rbFlyDo\('fly-dc',function\(\)\{derSetDc\('dc_omegacore'\)\}\)"[^>]*>.*Omega-Core Skid/.test(ED), 'Draw › Data Ctr has Omega-Core Skid');

  /* placement stamps the flag and the battery */
  var P = { S: { shapes: [], shapeStyle: '' }, DC_CATALOG: sb.DC, _derDcId: 'dc_omegacore', uid: function () { return 'x1'; },
            renderShape: function () {}, updShapeCount: function () {}, pushHist: function () {}, _derSnapPt: function (p) { return p; },
            _derScaled: function () { return false; }, _derBanner: function () {} };
  vm.createContext(P);
  vm.runInContext(ED.slice(ED.indexOf('var DERC_DC = (function () {'), ED.indexOf('/* Wind turbines (kW nameplate each)')), P);
  vm.runInContext(bodyFrom(ED, 'function _derDcSpec(id){'), P);
  vm.runInContext(bodyFrom(ED, 'function _derPlaceDcPad(p){'), P);
  vm.runInContext('_derPlaceDcPad({x:10,y:20})', P);
  var sh = P.S.shapes[0];
  ok(sh && sh.kind === 'derdc' && sh.omegaCore === true && sh.ownMeter === true, 'a placed skid carries omegaCore and ownMeter');
  eq(sh && sh.bessKwh, 61.44, 'and its battery');
  ok(sh && !sh.bessKey && sh.ocBessKey === 'CC-R60', 'under its own key, so no host reader takes the skid\'s battery for the site\'s');
  ok(/if \(x && x\.bessKey && !x\.omegaCore\) seed = x\.bessKey;/.test(ED), 'the engineering build never seeds its BESS step from the skid');
  P._derDcId = 'dc_triton'; vm.runInContext('_derPlaceDcPad({x:0,y:0})', P);
  ok(!P.S.shapes[1].omegaCore, 'an ordinary pod does not');

  /* the host's load never includes the skid */
  var L = { S: { shapes: [sh, P.S.shapes[1]], elements: [] }, DERC_DC: P.DERC_DC, _eqRole: function () { return null; } };
  vm.createContext(L);
  vm.runInContext(bodyFrom(ED, 'function derTotals(st){'), L);
  vm.runInContext(bodyFrom(ED, 'function omegaDer(){'), L);
  var t = vm.runInContext('derTotals()', L), od = vm.runInContext('omegaDer()', L);
  eq(t.dcLoadKw, 120, 'derTotals: only the pod is host load');
  eq(t.ocUnits + '/' + t.ocKw + '/' + t.ocBessKwh, '1/75/61.44', 'derTotals counts the skid as itself');
  eq(od.dcLoadKw, 120, 'omegaDer: the skid is not in the site load');
  eq(od.ocUnits, 1, 'omegaDer counts it as Omega-Core');

  /* every reader of host compute, cost and site type skips it */
  [['the data-centre electrical ROM', 'function omegaDataCenterROM(', /sh\.omegaCore/],
   ['the one-line export', 'function omegaOneLineExport(', /sh\.omegaCore\) return;/],
   ['the BOM (its own line, not a pod)', 'function buildBOM(', /Omega-Core skid \(Solela Edge Compute \+ CleanCell R60\)/],
   ['the spec sheet (its own row)', 'function exportSpecSheet(', /Omega-Core skid \\u00d7/],
   ['the proposal type', 'function _proposalTypeFromDrawing(', /sh\.kind==='derdc' && !sh\.omegaCore/],
   ['the Results rail (its own row)', 'function omegaRenderResults(', /'Omega-Core'\+unitSfx/]
  ].forEach(function (c) { var b = ''; try { b = bodyFrom(ED, c[1]); } catch (e) {} ok(c[2].test(b), c[0] + ' keeps the skid off the host', c[1]); });
  var pods = ED.slice(ED.indexOf('  function pods() {\n    var n = 0, kw = 0;'), ED.indexOf('  function pods() {\n    var n = 0, kw = 0;') + 400);
  ok(/sh\.omegaCore\) return;/.test(pods), 'OmegaComputeCost.pods: a skid is never priced as a $30k/kW pod');
  ok(/if \(!sh \|\| sh\.kind !== 'derdc' \|\| sh\.omegaCore\) return;   \/\* not the host's compute \*\//.test(ED), 'OmegaRecord.podsOnDrawing skips it');
  ok(/if \(k === 'derdc' && sh\.omegaCore\) return null;/.test(ED), 'the supply links do not treat it as a load');
  ok(/add\('omegacore', '\\u25a6', 'Omega-Core skid \(own meter\)', sh\.kw, sh\.bessKwh\)/.test(ED), 'the legend gives it its own row with its kWh');
  ok(/case 'derdc':\s*\n\s*\/\* Omega-Core is its own row/.test(ED), 'and so does the campus census');
  ok(/if\(_r && DERC_DC\[_r\] && !DERC_DC\[_r\]\.omegaCore\)/.test(ED), 'a palette element of it is not host load either');
  ok(/is: function \(sh\) \{ return sh\.kind === 'derdc' && !sh\.omegaCore; \}/.test(ED), 'Fence & Tie never fences it into the host compound or ties it to the host controller');
  ok(/if\(cfg\.trench && ems && !spec\.omegaCore\)/.test(bodyFrom(ED, 'function placeDcClusterAt(p){')), 'the cluster dialog never trenches a host EMS feed to a skid');
  ok(/if\(it\.notHostScope\) return;/.test(ED) && /_ocItem\.notHostScope = true/.test(ED), 'its BOM line is never priced into the host\'s electrical bid');
  ok(/filter\(function \(it\) \{ return !it\.notHostScope; \}\)/.test(ED), 'nor sent out for quote');
  ok(/if\(sh\.kind==='derdc' && sh\.omegaCore\)\{ ocSkids\+\+; continue; \}/.test(ED) && /separate 480 V utility service and meter, not interconnected/.test(ED), 'the permit notes call it a separate service, never host DER under NEC 705');
  ok(/inv\.separateService/.test(ED), 'and the permit inventory lists it apart from the DER');
  ok((ED.match(/\(o\.omegaCore \? null : MAP\[o\.kind\]\)/g) || []).length >= 9 && /!sh\.omegaCore && _O2_CAMPUS_OF_KIND\[sh\.kind\]/.test(ED)
     && /\(o\.omegaCore \? null : MAPK\[o\.kind\]\)/.test(ED), 'moving, turning or fitting the host\'s compute campus never drags the skid, nor the skid the campus');
  var o2 = { S: { shapes: [{ id: 'f1', kind: 'rect', omegaCampus: 'compute', campusLabel: 'COMPUTE', pts: [{ x: 0, y: 0 }, { x: 100, y: 100 }] },
                           { id: 'pod', kind: 'derdc', pts: [{ x: 50, y: 50 }] }, { id: 'skid', kind: 'derdc', omegaCore: true, pts: [{ x: 900, y: 900 }] }] } };
  vm.createContext(o2);
  vm.runInContext(ED.slice(ED.indexOf('var _O2_CAMPUS_OF_KIND = {'), ED.indexOf('function _o2WithFences(targets){')), o2);
  vm.runInContext(bodyFrom(ED, 'function _o2WithFences(targets){'), o2);
  var picked = vm.runInContext("_o2WithFences([{kind:'shape',id:'skid'}])", o2);
  eq(picked.map(function (x) { return x.id; }).join(','), 'skid', 'selecting the skid brings no host compute fence with it');

  /* the Output button, its owner, its icon, its module */
  ok(/<button class="rbtn" id="rb-omega-core" onclick="rbRun\(openOmegaCore\)" data-cap="compute"/.test(ED), 'Output › Omega-Core, on the compute cap');
  ok(/<span class="rb-lbl">Omega-Core<\/span>/.test(ED), 'labelled Omega-Core');
  ok(/function openOmegaCore\(\)\{\s*if \(window\.OmegaCoreQualify/.test(ED), 'the opener is a plain global (guardLaunchers wraps it)');
  var iCL = ED.indexOf('<script src="/omega-compute-lease.js"></script>'), iOC = ED.indexOf('<script src="/omega-core-qualify.js"></script>');
  ok(iCL > 0 && iOC > iCL, 'the module loads after the lookup client it uses');
  var M = require('../../api/_lib/modules');
  eq(M.owners('rb-omega-core', 'rbRun(openOmegaCore)').join(','), 'compute', 'Omega Compute owns the button, as it owns derSetDc');
  ok((M.get('compute').legacyGates || []).indexOf('compute') >= 0, 'and its legacy gate already carries the compute cap');
  var icons = require('../../omega-ribbon-icons.js');
  ok(icons.pathFor('Omega-Core', 'Omega-Core') !== icons.FALLBACK, 'the button has its own icon');
  var mod = fs.readFileSync(path.join(ROOT, 'omega-core-qualify.js'), 'utf8');
  ok(!/=>|\bconst\b|\blet\b|`/.test(mod), 'the module is ES5');
  ok(/© 2025–2026 ClearSky Energy Solutions LLC/.test(mod), 'and carries the header');
  ok(!/450000|450,000|monthlyPerSkid\s*:\s*\{|fmvAtYear5/.test(mod), 'no price, lease card or buyout band in the browser');
  ok(/OmegaComputeLease/.test(mod) && /\.evidence\(/.test(mod), 'it fans out through OmegaComputeLease.evidence, not a second copy');
  ok(/rescore\(\)\.then\(function \(r\) \{ if \(r && !st\.evidence\) screen\(\); \}\)/.test(mod) && /if \(st\.refused\)/.test(mod), 'a caller the door refused never sets off the metered lookups');
  ok(/function close\(\) \{[^}]*st\.gen\+\+/.test(mod) && (mod.match(/if \(!live\(gen, pid\)\) return/g) || []).length >= 4, 'a request that lands after the dialog closed (or moved project) answers nothing and writes nothing');
  ok(/answered\('oc-units', 'units'\)/.test(mod) && /answered\('oc-zoningCode', 'zoningCode'\)/.test(mod) && /function touched\(id\) \{ if \(id\) st\.dirty\[id\] = true; \}/.test(mod), 'a prefill the rep never touched is not saved as an answer');
  ok(/root\.omegaSetStale\(true\)/.test(mod) && /The Run priced nothing on this drawing/.test(mod), 'Run the site really runs, and never claims a Run that did not happen');
  ok(/try \{ u = root\._currentUser/.test(mod) && /catch \(e0\) \{ call = Promise\.reject\(e0\); \}/.test(mod), 'a Firebase that never started is "sign in", never a dialog stuck busy');
  ok(/f\.saved = readRep\(\) \|\| rep;/.test(mod), 'what was typed while a request ran survives the repaint');
  ok(/'Needs further qualification'/.test(mod) && /section\(o\.label \|\| 'Land lease'\)/.test(mod) && /esc\(r\.offer\.label \|\| 'Land lease'\)/.test(mod),
     'the dialog says "Needs further qualification" and heads the lease, on screen and printed, with the server\'s words');
  ok(/inp\('oc-leaseMonthly'/.test(mod) && /r\.leaseMonthly = lm/.test(mod) && /r\.leaseEscalatorPct = le/.test(mod), 'the rent and its escalator are typed in the dialog and sent');
  ok(/sel\('occ-chipset'/.test(mod) && /sel\('occ-pricingBasis'/.test(mod) && /sel\('occ-capex'/.test(mod) && /sel\('occ-includeLease'/.test(mod) && /r\.compute = c/.test(mod), 'the compute inputs are chosen in the dialog and sent as rep.compute');
  ok(!/8760|10\.2|49\.24|19\.71|724471|CMDC|1\.25/.test(mod), 'no rate, node power, price, CAPEX figure or DSCR target in the browser');
  ok(/function computeHtml\(c, r\)/.test(mod) && /Bankability/.test(mod) && /debtCapacityAtTarget/.test(mod), 'the dialog shows the compute economics and the bankability block');
  ok(/print\(\\'customer\\'\)/.test(mod) && /print\(\\'full\\'\)/.test(mod) && /function printCustomer\(r, f\)/.test(mod) && /c\.disclosed && c\.buildUp/.test(mod), 'a customer version and a full report print; the build-up only where the server disclosed it');
  ok(/o\.market\.sources/.test(mod) && /rel="noopener"/.test(mod), 'a market reference is shown with its sources');

  /* the project field, saved and restored */
  var save = bodyFrom(ED, 'async function saveProject(');
  ok(/^\s*omegaCore:\s+S\.omegaCore\s+\|\| null,/m.test(save), 'S.omegaCore is in the save payload literal');
  ok(/S\.omegaCore\s+= \(d\.omegaCore\s+&& typeof d\.omegaCore==='object'\)/.test(bodyFrom(ED, 'async function _loadProject(')), 'and restored on load');

  /* the CleanCell R60 */
  var bc = ED.slice(ED.indexOf('const BESS_CATALOG = {'), ED.indexOf('/* ── THE TENANT\'S OWN PRODUCTS LEAD'));
  var R = vm.runInNewContext('(' + bc.slice(bc.indexOf('{'), bc.lastIndexOf('}') + 1) + ')')['CC-R60'];
  ok(R && R.kwh === 61.44 && R.kw === 60 && R.acCurrent === 72.3, 'BESS_CATALOG CC-R60: 61.44 kWh, 60 kW, 72.3 A');
  ok(R && R._incPCS === true && R.xfmr === 'N/A' && R.evSkid === true, 'its PCS is integrated, no transformer, and it is an EV skid');
  eq(R && R.usable, null, 'usable kWh is unpublished and stays null');
  ok(R && /Rev A/.test(R.verified), 'it cites the datasheet');
  ok(/'CC-R60':\s*\{ l:'28\\'-0"',\s*w:'7\\'-3"'.*lf:28\.0, wf:7\.25/.test(ED), 'its 336 x 87 in skid is on the BESS Pad list');
  ok(/<option value="CC-R60">/.test(ED), 'and in BESS Config');
  ok(/_setChk\('inc-pcs',  m\._incPCS===true   \|\| _big\);/.test(ED), 'the catalog\'s own YES on its PCS wins over the size rule; a blank tenant flag does not');
  ok(R && R._incXfmr === true && R._incDisco === false, 'the R60 adds no transformer (native 277/480 V) and keeps the site AC disconnect');
  ok(/\['usable','eqcost'\]\.forEach\(function\(k\)\{ var el=document\.getElementById\('bm-'\+k\); if\(el && m\[k\]==null\) el\.value=''; \}\);/.test(ED), 'an unpublished usable kWh or price clears the field, never saves 700 kWh on a 61 kWh battery');
  var place = bodyFrom(ED, 'function _doPlaceBesPad(p,spec,opts){');
  ok(/a\.key==='pcs'   && _ce\._incPCS===true/.test(place) && /a\.key==='xfmr'  && _ce\._incXfmr===true/.test(place) && /a\.key==='disco' && _ce\._incDisco===true/.test(place), 'every BESS Pad path places the R60 with its disconnect and without a second PCS or a transformer');
  ok(!/data-auto-off/.test(ED), 'and the modal no longer second-guesses the box');
  ok(/'CC-R60':[^\n]*h:'6\\'-10\.75"'[^\n]*hf:6\.9 \}/.test(ED) && R && /82\.75 in overall/.test(R.verified) && /2200 H mm/.test(R.cabinet),
     'its height is the drawing\'s 82.75 in overall (Tommy, 2026-10-05), with the datasheet\'s cabinet kept as the cabinet');
  ok((ED.match(/&& !p\.evSkid\)/g) || []).length === 2, 'the auto-sizer never recommends an EV skid');
}

/* ═══ 4 · the client's collect() ═══════════════════════════════════════ */
function clientChecks() {
  var W = {
    S: { shapes: [{ kind: 'derdc', omegaCore: true }, { kind: 'derdc' }, { kind: 'evunit' }],
         costRollup: { capex: 900000, netCost: 800000, incentive: 100000, annualRevenue: 150000, at: 1759300000000 },
         resultsStale: false, omegaFiber: { nearestRoute: { distanceM: 800 } } },
    _projectId: 'p1', _COST_LOW: 800000, _COST_HIGH: 1100000, _EV_TOTAL: 500000,
    _npxSiteLatLon: function () { return { lat: 40.5, lon: -74.4 }; },
    evChargerTotals: function () { return { dcfcKw: 480, dcfcUnits: 2, l2Kw: 0, l2Units: 0, ports: 4 }; },
    omegaDcLoadKw: function () { return 120; },
    _SITE_DATA: { parcelZoning: 'C-2' },
    localStorage: { getItem: function () { return JSON.stringify({ activeId: 'a', scenarios: { a: { data: { p0_service_amps: '800A', p0_service_v: '277/480', p0_xfmr_kva: '1,000 kVA' } } } }); } }
  };
  W.window = W;
  var docEls = { 'addr-in': { value: '9 Oak Ave' }, pname: { value: 'Oak Charging' } };
  W.document = { getElementById: function (id) { return docEls[id] || null; } };
  vm.createContext(W);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'omega-core-qualify.js'), 'utf8'), W);
  var f = W.OmegaCoreQualify.collect();
  eq(f.drawing.units, 1, 'collect: one skid on the drawing (the pod is not one)');
  eq(f.drawing.chargers.dcfcUnits, 2, 'collect: the chargers');
  eq(f.drawing.dcLoadKw, 120, 'collect: the host\'s own compute');
  eq(f.drawing.xfmrKva, 1000, 'collect: the transformer from the site intake, read as the form saves it ("1,000 kVA")');
  eq(f.drawing.service.amps, 800, 'collect: the host service amps from the intake ("800A")');
  eq(f.drawing.service.volts, 480, 'collect: and its voltage from the select ("277/480")');
  eq(f.run.capex, 900000, 'collect: the Run\'s capex');
  eq(f.run.lines.ev, 500000, 'collect: the cost sheet\'s own lines');
  eq(f.site.lat, 40.5, 'collect: the site point');
  eq(f.site.address, '9 Oak Ave', 'collect: the address');
  eq(f.parcelZoning, 'C-2', 'collect: the parcel zoning to prefill');
  eq(f.fiberOnFile.nearestRoute.distanceM, 800, 'collect: the fiber on file');
  /* and the server takes exactly that shape */
  var back = OC.evaluate({ site: f.site, drawing: f.drawing, run: f.run, evidence: { fiberOnFile: f.fiberOnFile }, rep: {} }, {});
  eq(back.host.run.capex, 900000, 'the server reads the collected Run');
  eq(back.gates.power.headroomSource, 'drawing', 'and the collected transformer');
}

(function main() {
  var chain = Promise.resolve();
  doorChecks.forEach(function (fn) { chain = chain.then(fn); });
  chain.then(function () { editorChecks(); clientChecks(); })
    .then(function () {
      console.log('omega-core: ' + pass + ' passed, ' + fail + ' failed');
      if (fail) process.exitCode = 1;
    }, function (e) { console.error(e); process.exitCode = 1; });
})();
