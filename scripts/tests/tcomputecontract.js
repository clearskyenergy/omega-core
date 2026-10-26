#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The Omega Core skid under a CONTRACTED OFFTAKE (api/_lib/compute-contract.js,
   2026-10-25, for Solela Capital's compute-site diligence): N years of
   take-or-pay at $X a GPU-hour, Lightsmith Energy's fee, and the cost of
   controlling the site, on the skid model's own cash flow.

   Held here, each failing when its piece is removed:
     1 · one engine: the case IS the skid model's cash flow (the same IRR,
         payback, DSCR and loan as the model run with the fee folded into its
         variable costs), and the model's own answers are untouched
     2 · the partner's fee is its own line, feePct × gross, never inside opex
     3 · take-or-pay ignores utilisation, the ramp and the market decline;
         the uncontracted share is unsold, or sold merchant
     4 · the term changes the cash flow, and the loan matures inside it
     5 · the site: own, buy (the price in the capital), lease (the rent),
         takeover, a revenue share, the rate card when no rent is given
     6 · sizing on the power uses the model's facility kW, every chipset
     7 · priceFor round-trips; the 24-month payback price is the lowest
     8 · the pinned case, and the brief's reference figures reproduced
     9 · a figure out of range is set aside and named; every default named;
         nothing a tenant reads names a source; the price is read, not typed
    10 · ES5 and the header
    11 · the contract-price ladder: the point at the price given is the
         answer, the IRR without the fee is a 0% run, it rises with price,
         ±40% in $0.05 / $0.10 steps within 41 points, centred on the
         chipset's reference price when no price is given

     node scripts/tests/tcomputecontract.js */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var pass = 0, fail = 0;
function ok(c, l, x) { if (c) pass++; else { fail++; console.error('  FAIL  ' + l + (x != null ? '\n        ' + x : '')); } }
function eq(got, want, l) { ok(got === want, l, 'got ' + JSON.stringify(got) + ', want ' + JSON.stringify(want)); }
function near(got, want, tol, l) { ok(got != null && Math.abs(got - want) <= tol, l, 'got ' + got + ', want ' + want + ' ±' + tol); }
function clone(o) { return JSON.parse(JSON.stringify(o)); }
function has(r, re) { return r.notes.some(function (n) { return re.test(n); }); }

var CC = require('../../api/_lib/compute-contract');
var CM = require('../../api/_lib/omega-compute-model');
var OC = require('../../api/_lib/omega-core');
var H100 = CM.chipset('h100');

/* the pinned case (the brief, 2026-10-25): H100, one skid, $2.00 a
   GPU-hour, 72 months, Lightsmith Energy's 10%, 80% loan-to-cost as typed,
   $11,250 a month rent escalating 2.5% a year */
var PIN = { chipset: 'h100', units: 1, debt: { ltc: 0.8 },
            contract: { termMonths: 72, pricePerGpuHour: 2.00, partner: { name: 'Lightsmith Energy', feePct: 10 } },
            site: { route: 'lease', rentMonthly: 11250, rentEscalatorPct: 2.5 } };
function pin(mut, opts) { var x = clone(PIN); if (mut) mut(x); return CC.contractCase(x, opts); }
var P = CC.contractCase(PIN), PM = CC.contractCase(PIN, { months: true });

/* ═══ 8 · the pinned case ═════════════════════════════════════════════ */
eq(P.ok, true, 'the case answers');
eq(P.priced, true, 'priced: the contract price is given');
eq(P.returns.projectIrrPct, 53.1, 'the pinned case: a 53.10% project IRR');
eq(P.returns.paybackMonths, 26, 'paying back in month 26');
eq(P.capex.total, 764000, 'on the $764,000 system cost');
eq(P.debt.funded, 611200, '80% of it borrowed, as typed');
eq(P.lines.length, 6, 'six contract years');
eq(P.lines[0].revenue, Math.round(48 * 2 * 8760 * 0.98), 'year-1 revenue: 48 GPUs × $2.00 × 8,760 h × 98% up, with no utilisation');
eq(P.lines[0].rent, 135000, 'year-1 rent $11,250 × 12');
eq(P.lines[1].rent, 138375, 'escalating 2.5% in year 2');
eq(P.lines[5].residual, 76400, 'the cards worth 10% of the $764,000 at the end');
eq(P.lines[5].debtService, 0, 'the loan repaid at month 60, inside the term');
eq(P.returns.projectMultiple, 2.82, 'a 2.82x project multiple');
near(P.returns.roiPct, (P.totals.projectCashFlow / P.capex.total - 1) * 100, 0.01, 'roiPct is the project cash multiple − 1 over the term');
ok(/multiple − 1/.test(P.returns.roiBasis), 'and says so');
ok(P.bankability && P.bankability.targetDscr === 1.25 && P.bankability.meetsTarget === true && P.bankability.debtCapacityAtTarget > 0, 'bankability as the skid model gives it');
/* THE BRIEF'S REFERENCE FIGURES (54.17% / 26, 24.91% / 40, about 30% / 37)
   were run with the rent escalator typed as 0.025, which the skid model's
   lease reads as 0.025% a year, not 2.5%: the rent never rose. They
   reproduce exactly that way, and the case says how it read the figure. */
[[2, 54.17, 26], [1.6, 24.91, 40], [1.67, 30, 37]].forEach(function (t) {
  var x = pin(function (p) { p.contract.pricePerGpuHour = t[0]; p.site.rentEscalatorPct = 0.025; });
  eq(x.returns.projectIrrPct, t[1], 'the reference at $' + t[0].toFixed(2) + ' (rent escalator read as 0.025%): ' + t[1] + '%');
  eq(x.returns.paybackMonths, t[2], 'and month ' + t[2]);
});
ok(has(pin(function (p) { p.site.rentEscalatorPct = 0.025; }), /rent escalator of 0\.025 is read as 0\.025%/), 'a …Pct under 1 is read as typed AND said: the reference run\'s slip');
eq(pin(function (p) { p.contract.pricePerGpuHour = 1.6; }).returns.projectIrrPct, 23.47, 'with the rent truly rising 2.5%: $1.60 is 23.47%');
eq(pin(function (p) { p.contract.pricePerGpuHour = 1.67; }).returns.projectIrrPct, 28.64, 'and $1.67 is 28.64%');

/* ═══ 1 · one engine ══════════════════════════════════════════════════ */
var M = CM.evaluate({ chipset: 'h100', pricingBasis: 'custom', customGpuHour: 2, termMonths: 72, utilization: 1, priceChangePct: 0, ramp: [1, 1, 1, 1],
                      otherVariablePct: 0.13, debt: { ltc: 0.8 } },
                    { units: 1, skidPriceUsd: OC.PRODUCT.systemCostUsd, lease: { monthly: 11250, escalatorPct: 2.5 } }).cashFlow;
eq(P.returns.projectIrrPct, M.returns.projectIrrPct, 'the same project IRR as the skid model run with the 10% fee inside its variable costs: one engine');
eq(P.returns.paybackMonths, M.returns.projectPaybackMonth, 'the same payback');
eq(P.bankability.minDscrAmortizing, M.bankability.minDscrAmortizing, 'the same minimum DSCR');
eq(P.bankability.debtCapacityAtTarget, M.bankability.debtCapacityAtTarget, 'the same debt capacity');
eq(P.debt.initialEquity, M.debt.initialEquity, 'the same equity put in');
eq(P.returns.equityMultiple, M.returns.equityCashMultiple, 'the same equity multiple');
near(P.totals.ebitda, M.totals.ebitda, 6, 'the same EBITDA over the term');
var put = M.debt.initialEquity;
var eqFlows = [-put].concat(M.months.map(function (mm, i) { return mm.equity + (i === 0 ? put : 0); }));
near(P.returns.equityIrrPct, CM.irr(eqFlows) * 100, 0.01, 'the equity IRR dates the equity put in at month 0 and month 1 at month 1, as the project IRR does');
ok(P.returns.equityIrrPct < M.returns.equityIrrPct, 'which reads lower than the skid model\'s own figure (' + M.returns.equityIrrPct + '%, month 1 dated at month 0)');
eq(CM.evaluate({ capexBasis: 'cmdc' }, { units: 1 }).cashFlow.years[0].revenue, 755699, 'the skid model\'s own answer is untouched (its workbook pin)');
ok(!('partnerFee' in CM.evaluate({}, {}).cashFlow.months[0]) && !('contracted' in CM.evaluate({}, {}).cashFlow.years[0]), 'and carries no contract field without a deal');
eq(CM.evaluate({}, {}).cashFlow.pricingBasis, 'spot', 'nor a contract basis');
eq(P.lines[0].revenue, P.lines[0].contracted, 'all of it contracted at 100% take-or-pay');

/* ═══ 2 · the fee: its own line, feePct × gross, never inside opex ═══ */
P.lines.forEach(function (l) { near(l.partnerFee, l.revenue * 0.10, 1, 'year ' + l.year + ': the fee is 10% of gross'); });
near(P.totals.partnerFee, P.totals.revenue * 0.10, 4, 'and over the term');
PM.months.forEach(function (mm) { if (Math.abs(mm.partnerFee - mm.revenue * 0.1) > 0.01) ok(false, 'month ' + mm.m + ': the fee is 10% of that month\'s gross'); });
ok(PM.months.length === 72, 'opts.months gives the 72 monthly rows');
P.lines.forEach(function (l) { near(l.revenue - l.partnerFee - l.power - l.siteCost - l.opex, l.ebitda, 3, 'year ' + l.year + ': revenue − fee − power − site − opex = EBITDA'); });
var F20 = pin(function (p) { p.contract.partner.feePct = 20; });
eq(F20.lines[0].opex, P.lines[0].opex, 'a bigger fee leaves opex alone: the fee is never inside it');
near(P.lines[0].ebitda - F20.lines[0].ebitda, P.lines[0].revenue * 0.10, 2, 'and comes off EBITDA, line for line');
var fixedY1 = 0; for (var m = 0; m < 12; m++) fixedY1 += 5000 * Math.pow(1.03, m / 12);
near(P.lines[0].opex, P.lines[0].revenue * (0.05 + 0.03 + 0.02) + fixedY1, 2, 'opex is network 5% + other 3% + maintenance 2% of revenue + the fixed cost: no fee, no power, no rent');
eq(P.partner.name, 'Lightsmith Energy', 'the partner is named');
eq(P.partner.verified, false, 'and its stated terms are marked unverified');
var NOP = pin(function (p) { p.contract.partner = false; });
eq(NOP.totals.partnerFee, 0, 'partner: false pays no fee');
ok(NOP.returns.projectIrrPct > P.returns.projectIrrPct, 'and earns more');
eq(pin(function (p) { p.contract.partner = { name: 'Acme Compute' }; }).partner.feePct, 10, 'another partner with no fee typed takes the default 10%');

/* ═══ 3 · take-or-pay ═════════════════════════════════════════════════ */
var U50 = pin(function (p) { p.operating = { utilization: 0.5 }; });
eq(U50.lines[0].revenue, P.lines[0].revenue, 'take-or-pay ignores utilisation: 50% used is paid as all of it');
eq(U50.returns.projectIrrPct, P.returns.projectIrrPct, 'so the IRR does not move');
var PD = pin(function (p) { p.operating = { priceChangePct: -0.2, ramp: [0.2, 0.4, 0.6, 1] }; });
eq(PD.lines[5].contracted, P.lines[5].contracted, 'the market\'s price decline does not touch contracted hours');
eq(PD.lines[0].contracted, P.lines[0].contracted, 'nor does the ramp: paid from month 1');
var E3 = pin(function (p) { p.contract.escalatorPct = 3; }, { months: true });
near(E3.months[11].contracted, E3.months[0].contracted, 0.01, 'a contract escalator holds the price through the contract year');
near(E3.months[12].contracted, E3.months[0].contracted * 1.03, 0.02, 'and steps 3% on the anniversary');
var T60 = pin(function (p) { p.contract.takeOrPayPct = 60; });
near(T60.lines[0].revenue, P.lines[0].revenue * 0.6, 1, '60% take-or-pay with the rest unsold: 60% of the revenue');
eq(T60.lines[0].merchant, 0, 'nothing sold merchant');
ok(has(T60, /40% of hours not contracted is unsold/), 'and it says the rest is unsold');
var spot = CM.gpuPrice(H100, 'spot');
var TM = pin(function (p) { p.contract.takeOrPayPct = 60; p.contract.merchant = true; }, { months: true });
near(TM.months[3].merchant, 48 * spot * 730 * 0.85 * 0.98 * 0.4 * Math.pow(0.92, 3 / 12), 0.05, 'merchant: true sells the 40% at the spot reference, 85% utilised, 98% up, on the market decline');
near(TM.months[0].merchant, 48 * spot * 730 * 0.85 * 0.98 * 0.4 * 0.5, 0.05, 'and on the model\'s ramp (month 1 at 50%)');
near(TM.months[0].contracted, T60.lines[0].contracted / 12, 0.05, 'the contracted 60% unchanged beside it');
eq(TM.contract.merchantPricePerGpuHour, Math.round(spot * 100) / 100, 'the merchant price is the spot reference');
var TMU = pin(function (p) { p.contract.takeOrPayPct = 60; p.contract.merchant = true; p.operating = { utilization: 0.5 }; });
eq(TMU.lines[0].contracted, TM.lines[0].contracted, 'utilisation moves the merchant share only');
ok(TMU.lines[0].merchant < TM.lines[0].merchant, 'which it does');
var GB = pin(function (p) { p.chipset = 'gb200'; p.contract.takeOrPayPct = 60; p.contract.merchant = true; });
eq(GB.lines[0].merchant, 0, 'a chipset with no public spot price sells nothing merchant');
ok(has(GB, /no public spot price/), 'and says so');
ok(has(pin(function (p) { p.contract.merchant = true; }), /nothing to sell at 100% take-or-pay/), 'merchant at 100% take-or-pay has nothing to sell, said');

/* ═══ 4 · the term ════════════════════════════════════════════════════ */
var T36 = pin(function (p) { p.contract.termMonths = 36; });
eq(T36.lines.length, 3, 'a 36-month contract is three years of lines');
ok(T36.returns.projectIrrPct !== P.returns.projectIrrPct && T36.totals.revenue < P.totals.revenue, 'and a different cash flow');
eq(T36.debt.maturityMonths, 36, 'the loan matures inside the shorter term');
ok(has(T36, /runs past the 36-month contract/), 'and says the model\'s 60 months was shortened');
eq(T36.bankability.debtRepaidInTerm, true, 'so it is repaid in the term');
eq(T36.lines[2].residual, 76400, 'the residual lands at the end of the shorter term');
var T84 = pin(function (p) { p.contract.termMonths = 84; p.debt.maturityMonths = 96; });
eq(T84.debt.maturityMonths, 60, 'a typed maturity past the term is set aside for the model\'s 60 months');
ok(has(T84, /loan maturity of 96 months runs past the 84-month contract/), 'and said');
eq(T84.lines.length, 7, 'seven years');
ok(T84.returns.projectIrrPct > P.returns.projectIrrPct, 'a longer contract at the same price earns more');
eq(pin(function (p) { delete p.contract.termMonths; }).contract.termMonths, 72, 'the default term is Lightsmith Energy\'s 72 months');
var T30 = pin(function (p) { p.contract.termMonths = 30; });
eq(T30.lines[2].months, 6, 'a term that is not whole years ends on a part year');

/* ═══ 5 · the site ════════════════════════════════════════════════════ */
var OWN = pin(function (p) { p.site = { route: 'own' }; });
eq(OWN.totals.siteCost, 0, 'own: no site cost');
eq(OWN.capex.total, 764000, 'and no purchase in the capital');
ok(OWN.returns.projectIrrPct > P.returns.projectIrrPct, 'so it earns more than the lease');
var BUY = pin(function (p) { p.site = { route: 'buy', purchasePriceUsd: 250000 }; });
eq(BUY.capex.land, 250000, 'buy: the purchase price is the site\'s capital');
eq(BUY.capex.total, 764000 + 250000, 'added to capex');
eq(BUY.debt.funded, Math.round((764000 + 250000) * 0.8), 'and the loan follows it at the loan-to-cost');
eq(BUY.totals.siteCost, 0, 'a site bought pays no rent');
eq(BUY.lines[5].residual, 76400, 'the residual is the cards\', never 10% of the land');
ok(has(BUY, /not counted/), 'the land\'s value at the end is not counted, and that is said');
eq(pin(function (p) { p.site = { route: 'buy', purchasePriceUsd: 250000, landResidualPct: 100 }; }).lines[5].residual, 76400 + 250000, 'a land residual typed counts it back');
var BN = CC.contractCase({ contract: { pricePerGpuHour: 2 }, site: { route: 'buy' } });
eq(BN.priced, false, 'buy with no purchase price is not priced');
ok(BN.needs.indexOf('site.purchasePriceUsd') >= 0, 'and names what it needs');
var RENT6 = 0; for (var y = 0; y < 6; y++) RENT6 += 135000 * Math.pow(1.025, y);
near(P.totals.rent, RENT6, 2, 'lease: the rent, escalating 2.5% a year, over the term');
eq(P.totals.siteCost, P.totals.rent, 'is the site cost');
ok(P.returns.projectIrrPct < OWN.returns.projectIrrPct, 'and costs returns');
var SH = pin(function (p) { p.site = { route: 'lease', revenueSharePct: 15 }; });
eq(SH.totals.rent, 0, 'a revenue share alone: no rent');
near(SH.lines[0].revenueShare, SH.lines[0].revenue * 0.15, 1, 'the share is 15% of gross');
eq(SH.lines[0].siteCost, SH.lines[0].revenueShare, 'and is the site cost');
var BOTH = pin(function (p) { p.site.revenueSharePct = 5; });
near(BOTH.lines[0].siteCost, 135000 + BOTH.lines[0].revenue * 0.05, 1, 'rent and share together');
var TK = pin(function (p) { p.site.route = 'takeover'; });
eq(TK.totals.rent, P.totals.rent, 'takeover: the existing agreement\'s rent');
ok(has(TK, /existing site host agreement/) && has(TK, /may be assigned/), 'with the agreement\'s term and assignment to confirm');
var LN = pin(function (p) { p.site = { route: 'lease' }; });
eq(LN.site.rentMonthly, OC.RATE_CARD.monthlyPerSkid.base, 'a lease with no rent is the Omega-Core rate card\'s floor');
eq(LN.site.rentSource, 'market', 'marked the market');
eq(LN.site.rentEscalatorPct, OC.RATE_CARD.escalatorPct.base, 'at the card\'s escalator');
ok(has(LN, /market reference, not an offer/), 'and never an offer');
eq(pin(function (p) { p.site = { route: 'lease', rentPerKwMonth: 200 }; }).site.rentMonthly, 200 * OC.RATE_CARD.computeKwPerSkid, 'a rent per kW of compute × 75 kW a skid');
ok(has(pin(function (p) { p.site = { route: 'own', rentMonthly: 9000 }; }), /pays no rent or share; the rent and share typed are set aside/), 'own with a rent typed: set aside, said');
var DEF = CC.contractCase({ contract: { pricePerGpuHour: 2 } });
eq(DEF.site.route, 'lease', 'no route: the lease an Omega-Core skid pays');
ok(has(DEF, /Site control: lease \(the default/), 'named as the default');

/* ═══ 6 · sizing on the power ═════════════════════════════════════════ */
var I0 = CM.readInputs({}), fk = CM.capacity(H100, I0).facilityKw;
eq(fk, 73.44, 'an H100 skid draws 73.44 kW at the meter (6 nodes × 10.2 kW × PUE 1.2)');
var K300 = CC.contractCase({ availableKw: 300, contract: { pricePerGpuHour: 2 } });
eq(K300.sizing.units, Math.floor(300 / fk), '300 kW ÷ 73.44 kW = 4 skids');
eq(K300.sizing.gpus, 4 * 48, '192 GPUs');
eq(K300.sizing.facilityKw, 293.76, 'drawing 293.76 kW');
eq(K300.sizing.itKw, 244.8, 'on 244.8 kW of IT');
eq(K300.sizing.basis, 'availableKw', 'sized on the power');
eq(CC.contractCase({ availableKw: 147 }).sizing.units, 2, '147 kW is two skids at 73.44 kW — never the 75 kW IT ceiling (1) nor the 135 kW meter peak (1)');
eq(CC.contractCase({ availableKw: 146.88 }).sizing.units, 2, 'exactly two skids\' facility kW is two');
eq(CC.contractCase({ availableKw: 146.87 }).sizing.units, 1, 'a hundredth less is one');
ok(has(K300, /R60 recharging can add up to 60 kW/), 'and the battery\'s recharge peak is said, never hidden');
var NONE = CC.contractCase({ availableKw: 73, contract: { pricePerGpuHour: 2 } });
eq(NONE.sizing.units, 0, '73 kW carries no skid');
eq(NONE.priced, false, 'so nothing is priced');
ok(NONE.needs.indexOf('availableKw') >= 0 && has(NONE, /carries no skid/), 'and it says so');
var BTH = CC.contractCase({ units: 6, availableKw: 300, contract: { pricePerGpuHour: 2 } });
eq(BTH.sizing.units, 4, 'six asked on 300 kW: the four the power carries, never more');
ok(has(BTH, /carries 4 of the 6 skids asked/), 'and says so');
eq(K300.sizing.byChipset.length, CM.CHIPSETS.length, 'every chipset, side by side');
K300.sizing.byChipset.forEach(function (b) {
  var ck = CM.capacity(CM.chipset(b.key), I0);
  ok(b.units === Math.floor(300 / ck.facilityKw + 1e-9) && b.gpus === b.units * ck.gpus && b.gpusPerUnit === ck.gpus, b.key + ': sized on its own facility kW on the same 300 kW', JSON.stringify(b));
});
eq(K300.sizing.byChipset.filter(function (b) { return b.key === 'b200'; })[0].gpus, 128, 'B200: 4 skids of 32 GPUs on 300 kW');
eq(K300.capex.total, 4 * OC.PRODUCT.systemCostUsd, 'four skids\' capital');
eq(K300.site.rentMonthly, 4 * OC.RATE_CARD.monthlyPerSkid.base, 'the card\'s rent a skid, four times');
var U4 = CC.contractCase({ units: 4, contract: { pricePerGpuHour: 2 } });
eq(U4.sizing.basis, 'units', 'a skid count is taken as given');
eq(U4.returns.projectIrrPct, CC.contractCase({ units: 1, contract: { pricePerGpuHour: 2 } }).returns.projectIrrPct, 'and four skids earn what one does, scaled (rent and fixed costs a skid)');
near(U4.totals.revenue, 4 * DEF.totals.revenue, 6, 'four times the revenue');

/* ═══ 7 · the price each return needs ═════════════════════════════════ */
[25, 30, 55].forEach(function (t) {
  var x = pin(function (p) { p.contract.pricePerGpuHour = P.priceFor[t]; });
  near(x.returns.projectIrrPct, t, 0.05, 'priceFor[' + t + '] = $' + P.priceFor[t] + ' gives a ' + t + '% project IRR on the same engine');
  var lower = pin(function (p) { p.contract.pricePerGpuHour = P.priceFor[t] - 0.001; });
  ok(lower.returns.projectIrrPct < t, 'and a tenth of a cent less does not reach ' + t + '%');
});
ok(P.priceFor[25] < P.priceFor[30] && P.priceFor[30] < P.priceFor[55], 'a higher return needs a higher price');
[P.priceFor[25], P.priceFor[30], P.priceFor[55], P.priceForPayback[24]].forEach(function (p) {
  ok(Math.abs(p * 10000 - Math.round(p * 10000)) < 1e-6, 'a solved price is to the hundredth of a cent, rounded up so it meets its target: ' + p);
});
var at30 = P.solved.filter(function (s) { return s.target === 'projectIrrPct' && s.value === 30; })[0];
ok(at30 && at30.price === P.priceFor[30] && at30.paybackMonths > 24, 'at the 30% price the payback is month ' + (at30 && at30.paybackMonths) + ', not 24');
var pb = pin(function (p) { p.contract.pricePerGpuHour = P.priceForPayback[24]; });
ok(pb.returns.paybackMonths <= 24, 'priceForPayback[24] = $' + P.priceForPayback[24] + ' pays back by month 24');
ok(pin(function (p) { p.contract.pricePerGpuHour = P.priceForPayback[24] - 0.001; }).returns.paybackMonths > 24, 'and is the lowest that does');
ok(P.priceForPayback[24] > P.priceFor[30], 'a 24-month payback needs more than the 30% price');
ok(has(P, /The two are not the same contract price/), 'Lightsmith Energy\'s 30% and 2-year payback are said not to be one price');
var L7 = pin(function (p) { p.debt = {}; });
eq(JSON.stringify(L7.priceFor), JSON.stringify(P.priceFor), 'priceFor solves the project IRR, which no loan moves');
var NP = pin(function (p) { delete p.contract.pricePerGpuHour; });
eq(NP.priced, false, 'no contract price: not priced');
eq(NP.returns, null, 'no returns invented');
eq(NP.lines, null, 'no lines');
ok(NP.needs.indexOf('contract.pricePerGpuHour') >= 0 && has(NP, /contract price per GPU-hour .* is needed/), 'it names the price it needs');
eq(JSON.stringify(NP.priceFor), JSON.stringify(P.priceFor), 'and still says what price each return needs');
eq(NP.sizing.units, 1, 'with the sizing');
eq(CC.contractCase({ contract: { pricePerGpuHour: 0 } }).priced, false, 'a $0 price prices nothing');

/* ═══ 9 · set aside, defaults named, nothing internal named ══════════ */
var BAD = CC.contractCase({ chipset: 'zzz', units: 99999, unitCostUsd: 5, residualPct: 99,
                            contract: { termMonths: 400, pricePerGpuHour: 500, takeOrPayPct: 150, escalatorPct: 40, partner: { feePct: 90 } },
                            site: { route: 'rent-to-own' }, operating: { utilization: 3, gpuMagic: 1 } });
[[/"zzz" is not in the library/, 'an unknown chipset'], [/skid count of 99999 is outside/, 'a skid count'], [/unit cost of 5 is outside/, 'a unit cost'],
 [/residual value of 99 is outside/, 'a residual'], [/contract term \(months\) of 400 is outside/, 'a term'], [/contract price \(\$\/GPU-hour\) of 500 is outside/, 'a price'],
 [/take-or-pay share of 150 is outside/, 'a take-or-pay share'], [/contract escalator of 40 is outside/, 'an escalator'], [/partner fee of 90 is outside/, 'a fee'],
 [/route "rent-to-own" is not/, 'a route'], [/Utilization of/, 'an operating figure, in the skid model\'s own words'], [/operating\.gpuMagic is not one of/, 'an unknown operating key']
].forEach(function (t) { ok(has(BAD, t[0]), t[1] + ' out of range is set aside and named'); });
eq(BAD.chipset.key + '/' + BAD.contract.termMonths + '/' + BAD.contract.takeOrPayPct + '/' + BAD.partner.feePct + '/' + BAD.site.route + '/' + BAD.capex.unitCostUsd,
   'h100/72/100/10/lease/' + OC.PRODUCT.systemCostUsd, 'and the default is used for each, never a clamped number nobody typed');
eq(BAD.priced, false, 'a price set aside prices nothing');
[[2], true, '', '2,00'].forEach(function (v) { eq(CC.contractCase({ contract: { pricePerGpuHour: v } }).priced, false, 'a price of ' + JSON.stringify(v) + ' is not a price'); });
ok(has(CC.contractCase({ contract: { pricePerGpuHour: [2] } }), /is not a number/), 'and is said not to be one');
eq(CC.contractCase({ contract: { pricePerGpuHour: '2.00' } }).returns.projectIrrPct, DEF.returns.projectIrrPct, 'a numeric string is a price');
ok(has(pin(function (p) { p.contract.partner.feePct = 0.1; }), /partner fee of 0\.1 is read as 0\.1%/), 'a fee of 0.1 is 0.1%, and that is said');
[[/^Chipset: the NVIDIA HGX H100 \(the default\)/, 'the chipset'], [/^Term: 72 months, Lightsmith Energy/, 'the term'], [/^One skid/, 'one skid'],
 [/^Take-or-pay: 100%/, 'take-or-pay'], [/flat for the term/, 'a flat price'], [/Lightsmith Energy takes 10% of gross compute revenue/, 'the partner'],
 [/^Site control: lease/, 'the route'], [/rate card’s floor/, 'the rent'], [/escalates 2\.5% a year/, 'the rent escalator'],
 [/capital is \$764,000 a skid/, 'the unit cost'], [/^Residual: .*10%/, 'the residual'], [/operating figures: power at \$0\.150\/kWh/, 'the operating figures'],
 [/^Debt: 70% of cost \(the skid model’s default; Lightsmith Energy’s 80%/, 'the loan']
].forEach(function (t) { ok(has(DEF, t[0]), 'the default is named in notes: ' + t[1]); });
eq(DEF.debt.ltc, 0.7, 'the loan is 70% of cost by default');
eq(P.debt.ltc, 0.8, 'and 80% only when typed');
ok(has(DEF, /chipset-scaled estimate for 48 NVIDIA HGX H100 GPUs is \$1,597,275–\$2,273,975/), 'the recorded price is set beside the model\'s own estimate for the GPUs, to be confirmed');
eq(DEF.capex.chipsetEstimatePerUnit.mid, CM.dynamicCapex(H100, 48).mid, 'which is the skid model\'s, not a second figure');
eq(DEF.capex.unitCostUsd, OC.PRODUCT.systemCostUsd, 'the unit cost is the system cost on record');
eq(CC.contractCase({ unitCostUsd: 2000000, contract: { pricePerGpuHour: 2 } }).capex.unitCostSource, 'entered', 'a unit cost typed replaces it');
var tenant = JSON.stringify([DEF.notes, DEF.disclaimer, P.notes, TM.notes, K300.notes, BAD.notes, DEF.capex, DEF.sizing]);
ok(!/CoreWeave|CMDC|iQGen|workbook/i.test(tenant), 'nothing a tenant reads names the price sheet, the cost reference or the source workbook');
var src = fs.readFileSync(path.join(ROOT, 'api', '_lib', 'compute-contract.js'), 'utf8');
ok(!/764000|764,000|639000|639,000|125000|125,000/.test(src), 'the skid\'s price is read off omega-core.js, never typed here');
ok(!/for \(var m = 1; m <= /.test(src) && !/function cashFlow/.test(src), 'no month of its own: the cash flow is the skid model\'s');
ok(!/onDemandNode|spotNode|gpusPerNode:\s*\d/.test(src), 'no chipset library of its own');
ok(/require\('\.\/omega-compute-model'\)/.test(src) && /require\('\.\/omega-core'\)/.test(src), 'it reads the skid model and the product record');
eq(typeof CC.contractCase, 'function', 'contractCase is the export the portfolio wires to');

/* ═══ 11 · the contract-price ladder (a slider's points) ══════════════ */
/* The Solela portfolio's contract-price slider reads these and computes no
   return of its own (2026-10-25). */
var LD = P.ladder || [], LB = P.ladderBasis || {};
function pointAt(L, p) { return (L || []).filter(function (x) { return Math.abs(x.price - p) < 1e-9; })[0]; }
var LKEYS = ['projectIrrPct', 'paybackMonths', 'projectMultiple', 'roiPct', 'irrWithoutFeePct', 'revenuePerYear', 'partnerFeePerYear'];
ok(Array.isArray(LD) && LD.length && LD.every(function (x) { return ['price'].concat(LKEYS).every(function (k) { return k in x; }); }), 'every point carries the price and the seven figures');
eq(LB.centre, 2, 'centred on the contract price given');
eq(LB.step, 0.05, 'in $0.05 steps');
eq(LD.length, 33, '±40% of $2.00 in $0.05 steps is 33 points');
eq(LD[0].price + '…' + LD[LD.length - 1].price, '1.2…2.8', 'from $1.20 to $2.80');
ok(LD.length <= 41, 'never more than 41 points');
var MID = pointAt(LD, 2);
LKEYS.forEach(function (k) { eq(MID && MID[k], P.returns[k], 'the point at the given price is the main result: ' + k); });
[LD[0], LD[6], LD[16], LD[25], LD[32]].forEach(function (pt) {
  var z = pin(function (p) { p.contract.pricePerGpuHour = pt.price; p.contract.partner.feePct = 0; });
  eq(pt.irrWithoutFeePct, z.returns.projectIrrPct, '$' + pt.price.toFixed(2) + ': the IRR without the fee is the case run at a 0% fee');
  var w = pin(function (p) { p.contract.pricePerGpuHour = pt.price; });
  eq(pt.projectIrrPct + '/' + pt.paybackMonths + '/' + pt.roiPct, w.returns.projectIrrPct + '/' + w.returns.paybackMonths + '/' + w.returns.roiPct, '$' + pt.price.toFixed(2) + ': the point is the case run at that price');
});
eq(P.returns.irrWithoutFeePct, pin(function (p) { p.contract.partner.feePct = 0; }).returns.projectIrrPct, 'the main result\'s IRR without the fee is the 0% run too');
var rising = { price: true, projectIrrPct: true, irrWithoutFeePct: true, projectMultiple: true, roiPct: true, revenuePerYear: true, partnerFeePerYear: true }, payback = true, feeCosts = true;
for (var li = 1; li < LD.length; li++) {
  Object.keys(rising).forEach(function (k) { if (!(LD[li][k] > LD[li - 1][k])) rising[k] = false; });
  if (LD[li].paybackMonths != null && LD[li - 1].paybackMonths != null && LD[li].paybackMonths > LD[li - 1].paybackMonths) payback = false;
  if (LD[li - 1].paybackMonths != null && LD[li].paybackMonths == null) payback = false;
}
LD.forEach(function (x) { if (!(x.irrWithoutFeePct > x.projectIrrPct)) feeCosts = false; });
Object.keys(rising).forEach(function (k) { ok(rising[k], 'the ladder rises with price: ' + k + ' at every step'); });
ok(payback, 'and the payback never lengthens as the price rises');
ok(feeCosts, 'the fee costs return at every price');
near(MID.partnerFeePerYear, MID.revenuePerYear * 0.1, 1, 'the fee a year is 10% of the revenue a year');
near(MID.revenuePerYear, P.totals.revenue / 6, 3, 'revenue a year is the term\'s revenue over its six years');
var ESC = pin(function (p) { p.contract.escalatorPct = 3; });
near(ESC.returns.revenuePerYear, ESC.totals.revenue / 6, 3, 'under an escalating price too: the average a year, not year 1');
ok(ESC.returns.revenuePerYear > ESC.lines[0].revenue, 'which is more than year 1 when the price steps up');
eq(pointAt(LD, 1.2).paybackMonths, null, 'a price that never pays back inside the term says so with null, never a month');
/* the reference table sent with the request (one H100 skid, $764k, 72 months,
   10%, 80% LTC, $11,250 a month) reproduces with the rent escalator read as
   0.025% — the same slip as the first run — and at the stated 2.5% reads lower */
var SLIP = pin(function (p) { p.site.rentEscalatorPct = 0.025; }).ladder;
[[1.4, 10.13, 58, 1.34, 23.09], [2, 54.17, 26, 2.89, 73.31], [2.6, 102.19, 17, 4.44, 131.86]].forEach(function (t) {
  var x = pointAt(SLIP, t[0]);
  eq(x && [x.projectIrrPct, x.paybackMonths, x.projectMultiple, x.irrWithoutFeePct].join('/'), t.slice(1).join('/'), '$' + t[0].toFixed(2) + ' with the escalator read as 0.025%: the table sent');
});
[[1.4, 8.32, 60, 1.27, 21.61], [2, 53.1, 26, 2.82, 72.38], [2.6, 101.39, 17, 4.38, 131.14]].forEach(function (t) {
  var x = pointAt(LD, t[0]);
  eq(x && [x.projectIrrPct, x.paybackMonths, x.projectMultiple, x.irrWithoutFeePct].join('/'), t.slice(1).join('/'), '$' + t[0].toFixed(2) + ' with the rent rising 2.5% as stated');
});
var NPL = NP.ladderBasis || {}, NPLD = NP.ladder || [];
eq(NPL.centreBasis, 'spot', 'no contract price: centred on the chipset\'s public spot reference');
eq(NPL.referencePricePerGpuHour, Math.round(spot * 100) / 100, 'the H100\'s, $2.46');
eq(NPL.centre, 2.45, 'rounded to the step');
eq(NPLD.length && NPLD[0].price + '…' + NPLD[NPLD.length - 1].price, '1.5…3.4', 'so an H100 runs $1.50–$3.40');
ok(NPLD.length > 0 && NPLD.length <= 41 && NPLD.every(function (x) { return x.price >= spot * 0.6 - 1e-9 && x.price <= spot * 1.4 + 1e-9; }), 'inside ±40% of the reference, at most 41 points');
ok(has(NP, /price ladder is centred on the NVIDIA HGX H100’s public spot reference/), 'and the notes say what it is centred on');
var GHL = CC.contractCase({ chipset: 'gh200' });
eq(GHL.ladderBasis && GHL.ladderBasis.centreBasis, 'on-demand', 'a chipset with no spot price centres on its on-demand price');
ok(!!GHL.ladderBasis && /\$6\.50 \(no contract price given\)/.test(GHL.ladderBasis.words), 'written as the price it is, $6.50');
var G3 = CC.contractCase({ chipset: 'gb300' });
eq(G3.ladder, null, 'a chipset with no public price and no contract price has no ladder');
ok(has(G3, /no price ladder/), 'said so');
ok((CC.contractCase({ chipset: 'gb300', contract: { pricePerGpuHour: 9 } }).ladder || []).length > 0, 'and a contract price gives it one');
var HI = CC.contractCase({ contract: { pricePerGpuHour: 6 } }).ladderBasis;
ok(!!HI && HI.points <= 41 && HI.step === 0.25 && HI.from === 3.75 && HI.to === 8.25, 'over about $5 the step coarsens ($0.25) to keep ±40% within 41 points', JSON.stringify(HI));
eq((CC.contractCase({ contract: { pricePerGpuHour: 4 } }).ladderBasis || {}).step, 0.1, 'a $4 price is in $0.10 steps');
var ODD = pin(function (p) { p.contract.pricePerGpuHour = 2.03; });
ok(pointAt(ODD.ladder, 2.03) && pointAt(ODD.ladder, 2.03).projectIrrPct === ODD.returns.projectIrrPct, 'a price off the $0.05 grid is still a point, and is still the answer');
eq(CC.contractCase(PIN, { ladder: false }).ladder, null, 'opts.ladder: false skips it');
eq(JSON.stringify(CC.contractCase(PIN, { ladder: false }).returns), JSON.stringify(P.returns), 'and changes nothing else');
eq(CC.contractCase({ availableKw: 70, contract: { pricePerGpuHour: 2 } }).ladder, null, 'no skid, no ladder');

/* ═══ 10 · ES5 and the header ═════════════════════════════════════════ */
var code = src.replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/=>|\bconst\b|\blet\b|`|Object\.assign|\.includes\(|\.find\(|\bclass\b/.test(code), 'the module is ES5');
ok(/© 2025–2026 ClearSky Energy Solutions LLC\. Proprietary and Confidential\./.test(src), 'and carries the header');
ok(/"test": "[^"]*node scripts\/tests\/tcomputecontract\.js/.test(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')), 'and this test is in npm test');

console.log('compute-contract: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exitCode = 1;
