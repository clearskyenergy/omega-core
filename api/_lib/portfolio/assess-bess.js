/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/assess-bess.js — a grid-participation battery on a
   site's FREE capacity: the size, ten years of cash and the returns
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE, ES5, no clock, no Firestore. The site assessment (assess.js) hands
   it the kW a site has free and where the site is; it answers a battery of
   that power at the set's duration, its capital after the credit and the
   rebate, the grid value stack year by year (regulation and reserves on
   the inverter's MW, capacity and arbitrage on the fading MWh), the
   operating costs, the member-level taxes, the incentive-swept loan, and
   the returns: project IRR and NPV before tax and unlevered, equity IRR and
   NPV after tax, payback and the term loan's coverage.

   THE CONVENTIONS, SAID ONCE
   · Grid-side revenue ONLY (through an aggregator): no behind-the-meter
     bill savings are counted, and charging settles at the wholesale price.
   · The inverter's MW does not fade; usable MWh fades by the degradation
     rate unless the set augments. Regulation and reserves are paid on MW,
     capacity and arbitrage on MWh.
   · The credit is sold (transfer price × the gross credit); the rebate is
     taxable income in year one unless the set treats it as a price
     reduction. Depreciable basis is the cost less half the gross credit.
   · Losses do not shelter other income unless the set says so: they carry
     forward against the project's own income.
   · A project whose credit and rebate cover its cost has NO net investment:
     its IRR is not defined and is answered null with the reason, never a
     large number.

   THE SET IS A REFERENCE, AND SAYS WHERE IT IS FROM. The default revenue
   rates are the PJM ComEd zone's (public benchmarks, 2025–26), the rebate
   is Illinois's distributed-storage rebate, and the income and property
   tax lines are Illinois and Cook County figures. A site in that zone is
   priced on its own market; a site elsewhere is priced on the same
   reference and the answer says so (`market.fit`), with the rebate off
   outside Illinois. A workspace's own figures replace any of them through
   `assumptions` (billing/current.portfolioAssessment.bess, read by
   assess.js); nothing here is a tenant's.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var VERSION = 'omega-bess-grid-v1';

var SET = {
  durationHours: 4,
  bessPricePerKwh: 175,            /* hardware, not construction */
  softCostPct: 0.08,               /* of hardware */
  /* construction: the reference system's estimate ($400,000 for 3,421 kWh), carried per kWh so it scales with the battery */
  epcPerKwh: 400000 / 3421,
  interconnectionUsd: 25000,       /* service upgrade and metering allowance, in the credit's basis */
  itcRate: 0.30, itcTransferPrice: 0.92,
  rebatePerKwh: 250, rebateStates: ['IL'], rebateMaxKw: 5000, rebateAsPriceReduction: false,
  roundTripEfficiency: 0.87, degradation: 0.02, years: 10, discountRate: 0.08, revenueEscalation: 0,
  /* the grid value stack, $ per kW-year, gross */
  revenue: { regulation: 180, capacity: 68, arbitrage: 35, reserves: 10 },
  aggregatorSharePct: 0.15, platformFeePct: 0.20, platformFixedPerKw: 0,
  fixedOmPerKw: 12, variableOmPerMwh: 2, insurancePct: 0.005, cyclesPerYear: 250, chargePricePerMwh: 35,
  tax: { federal: 0.37, state: 0.0645, bonusPct: 1, lossesUsable: false, lossLimit: 1, macrs: [0.20, 0.32, 0.192, 0.1152, 0.1152, 0.0576] },
  propertyTax: { valuePerKwh: 65, assessmentLevel: 0.25, equalizer: 3.03, rate: 0.07, lifeYears: 15, floorPct: 0.3, escalation: 0 },
  debt: { pctOfCapex: 1, rate: 0.08, termYears: 10, bridgeMonths: 6, sweepIncentives: true },
  augment: false, augmentPerKwh: 150,
  market: { key: 'pjm-comed', label: 'PJM, ComEd zone', utilities: ['comed', 'commonwealth edison'],
    /* the states PJM serves in whole or in part: a site there is in the market, not the zone */
    states: ['IL', 'OH', 'PA', 'NJ', 'MD', 'DE', 'VA', 'WV', 'DC', 'KY', 'IN', 'MI', 'NC', 'TN'] }
};
var LIMITS = { powerKw: [1, 200000] };

function num(v) { return v == null || v === '' || !isFinite(Number(v)) ? null : Number(v); }
function r2(v) { return v == null ? null : Math.round(v * 100) / 100; }
function fmt(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ','); }
function usd(n) { return (n < 0 ? '−$' : '$') + fmt(Math.abs(n)); }

/* a shallow-by-block merge: a typed figure replaces the set's, a key the set
   does not have is set aside and named */
function merge(over, notes) {
  var out = JSON.parse(JSON.stringify(SET));
  if (!over || typeof over !== 'object') return out;
  Object.keys(over).forEach(function (k) {
    if (!(k in SET)) { notes.push('assumptions.' + k + ' is not one of the battery set’s figures; it is set aside.'); return; }
    var base = SET[k], v = over[k];
    if (base && typeof base === 'object' && !Array.isArray(base)) {
      if (!v || typeof v !== 'object') return;
      Object.keys(v).forEach(function (j) { if (j in base && v[j] != null) out[k][j] = v[j]; else if (!(j in base)) notes.push('assumptions.' + k + '.' + j + ' is set aside.'); });
    } else if (v != null) out[k] = v;
  });
  return out;
}

function npv(rate, flows) { var t = 0; for (var i = 0; i < flows.length; i++) t += flows[i] / Math.pow(1 + rate, i + 1); return t; }
/* the annual IRR of flows[0..n] (flows[0] at year 0): bisection on a sign change; null where none */
function irr(flows) {
  function f(r) { var t = 0; for (var i = 0; i < flows.length; i++) t += flows[i] / Math.pow(1 + r, i); return t; }
  var lo = -0.99, hi = 10, flo = f(lo), fhi = f(hi);
  if (!isFinite(flo) || !isFinite(fhi) || flo * fhi > 0) return null;
  for (var i = 0; i < 200; i++) { var mid = (lo + hi) / 2, fm = f(mid); if (Math.abs(fm) < 1e-7) return mid; if (flo * fm < 0) { hi = mid; fhi = fm; } else { lo = mid; flo = fm; } }
  return (lo + hi) / 2;
}
function pmt(rate, n, pv) { return rate === 0 ? pv / n : pv * rate / (1 - Math.pow(1 + rate, -n)); }

/* where the site sits against the set's market: zone | market | reference.
   `where.market` is the resolved ISO of the SITE (omega-iso-market.js,
   handed in by the assessment: { iso, label, bess? } — this engine stays
   dependency-free because the Solela workspace carries a byte-copy of it).
   With it, a reference read NAMES the market the site is actually in and
   what its structure pays a battery, instead of only "not in that market". */
function marketFit(A, where) {
  where = where || {};
  var st = String(where.state || '').toUpperCase().trim(), ut = String(where.utility || '').toLowerCase();
  var site = where.market && where.market.iso ? where.market : null;
  var inZone = !!ut && A.market.utilities.some(function (u) { return ut.indexOf(u) >= 0; });
  if (inZone) return { key: A.market.key, label: A.market.label, fit: 'zone', siteIso: site ? site.iso : 'pjm', siteLabel: site ? site.label : A.market.label,
    words: 'Priced on the site’s own market: ' + A.market.label + '.' };
  if (site ? site.iso === 'pjm' : (st && A.market.states.indexOf(st) >= 0)) return { key: A.market.key, label: A.market.label, fit: 'market', siteIso: 'pjm', siteLabel: site ? site.label : A.market.label,
    words: 'A screening figure: the site is in PJM, but the rates are the ' + A.market.label + ' reference, not its own zone’s' + (ut ? '' : ' (the utility is not on file)') + '.' };
  var words;
  if (site && site.iso === 'none') words = 'A screening figure at reference rates: the grid value stack priced here is the ' + A.market.label + ' benchmark, but this site has ' + site.label + (st ? ' (' + st + ')' : '') + '. ' + (site.bess ? site.bess + ' ' : '') + 'The benchmark stack does not transfer: replace it with the utility’s own programs before relying on it.';
  else if (site) words = 'A screening figure at reference rates: the grid value stack priced here is the ' + A.market.label + ' benchmark, but this site is in ' + site.label + (st ? ' (' + st + ')' : '') + '. ' + (site.bess ? site.bess + ' ' : '') + 'Replace the rates with ' + site.label + '’s own before relying on it.';
  else words = 'A screening figure at reference rates: the grid value stack is the ' + A.market.label + ' benchmark, and this site' + (st ? ' (' + st + ')' : '') + ' is not in that market. Replace the rates with its own market’s before relying on it.';
  return { key: A.market.key, label: A.market.label, fit: 'reference', siteIso: site ? site.iso : null, siteLabel: site ? site.label : null, words: words };
}

/* input: { powerKw, state?, utility?, market?, assumptions? }  →  the case */
function bessCase(input) {
  input = input || {};
  var notes = [], A = merge(input.assumptions, notes), kw = num(input.powerKw);
  if (kw == null || kw < LIMITS.powerKw[0]) return { ok: false, version: VERSION, reason: 'No free capacity to size a battery on', notes: notes };
  if (kw > LIMITS.powerKw[1]) return { ok: false, version: VERSION, reason: 'A battery of ' + fmt(kw) + ' kW is outside this model’s range', notes: notes };
  var st = String(input.state || '').toUpperCase().trim(), market = marketFit(A, { state: st, utility: input.utility, market: input.market });
  var R = A.revenue, T = A.tax, PT = A.propertyTax, DB = A.debt, years = Math.min(30, Math.max(1, Math.floor(A.years)));
  var mw = kw / 1000, mwh = mw * A.durationHours, kwh = mwh * 1000;

  /* ── the capital, the credit and the rebate ── */
  var hardware = kwh * A.bessPricePerKwh, soft = hardware * A.softCostPct, epc = kwh * A.epcPerKwh, total = hardware + soft + epc + A.interconnectionUsd;
  var rebateOn = A.rebateStates.indexOf(st) >= 0 && kw <= A.rebateMaxKw, rebate = rebateOn ? kwh * A.rebatePerKwh : 0, asPrice = A.rebateAsPriceReduction === true;
  var itcGross = (total - (asPrice ? rebate : 0)) * A.itcRate, itcProceeds = itcGross * A.itcTransferPrice;
  var netCapex = total - itcProceeds - rebate;
  var basis = total - 0.5 * itcGross - (asPrice ? rebate : 0), rebateTaxable = asPrice ? 0 : rebate;
  if (rebateOn) notes.push('The Illinois distributed-storage rebate (' + usd(A.rebatePerKwh) + ' a kWh, ' + usd(rebate) + ') is counted: eligibility is assumed, not confirmed.');
  else if (st) notes.push('No storage rebate is counted' + (A.rebateStates.indexOf(st) >= 0 ? ': the battery is over the rebate’s ' + fmt(A.rebateMaxKw) + ' kW ceiling.' : ' for ' + st + ': the set carries Illinois’s only.'));
  else notes.push('No storage rebate is counted: the site’s state is not on file.');
  if (market.fit !== 'zone') notes.push('Income tax and property tax are the reference set’s (Illinois, Cook County); the site’s own apply.');

  /* ── the loan: funded at construction, the incentives sweep it ── */
  var loan = DB.pctOfCapex * total, swept = DB.sweepIncentives ? Math.min(loan, itcProceeds + rebate) : 0, termBal = loan - swept;
  var bridge = swept * DB.rate * DB.bridgeMonths / 12, annualDs = termBal > 0 ? pmt(DB.rate, DB.termYears, termBal) : 0;

  var gross1kw = R.regulation + R.capacity + R.arbitrage + R.reserves, lossPerMwh = 1 / A.roundTripEfficiency - 1;
  var assessable0 = PT.valuePerKwh * kwh, effRate = PT.assessmentLevel * PT.equalizer * PT.rate;
  var rows = [], cf = [-netCapex], eq = [-netCapex + loan - swept], cum = -netCapex, cumEq = eq[0];
  var stNol = 0, fedNol = 0, debtOpen = termBal, minDscr = null, taxTotal = 0, interestTotal = 0, propTotal = 0, augTotal = 0;
  for (var a = 1; a <= years; a++) {
    var factor = A.augment ? 1 : Math.pow(1 - A.degradation, a - 1), energy = mwh * factor;
    var grossRev = kw * Math.pow(1 + A.revenueEscalation, a - 1) * ((R.regulation + R.reserves) + (R.capacity + R.arbitrage) * Math.min(1, factor));
    var agg = grossRev * A.aggregatorSharePct, plat = grossRev * A.platformFeePct + kw * A.platformFixedPerKw * (grossRev > 0 ? 1 : 0), net = grossRev - agg - plat;
    var fixedOm = kw * A.fixedOmPerKw, varOm = energy * A.cyclesPerYear * A.variableOmPerMwh, ins = total * A.insurancePct;
    var prop = assessable0 * Math.max(1 - (a - 1) / PT.lifeYears, PT.floorPct) * effRate * Math.pow(1 + PT.escalation, a - 1);
    var loss = energy * A.cyclesPerYear * lossPerMwh * A.chargePricePerMwh, aug = A.augment && a >= 2 ? kwh * A.degradation * A.augmentPerKwh : 0;
    var opex = fixedOm + varOm + ins + prop + loss + aug, ncf = net - opex;
    /* debt */
    var interest = debtOpen * DB.rate + (a === 1 ? bridge : 0), principal = debtOpen > 0 ? Math.min(debtOpen, annualDs - debtOpen * DB.rate) : 0, service = interest + principal, debtClose = debtOpen - principal;
    var termService = service - (a === 1 ? bridge : 0), dscr = termService > 0 ? ncf / termService : null;
    if (dscr != null && (minDscr == null || dscr < minDscr)) minDscr = dscr;
    /* taxes: state on its own depreciation, federal after the state's */
    var fedDep = basis * (T.bonusPct * (a === 1 ? 1 : 0) + (1 - T.bonusPct) * (T.macrs[a - 1] || 0)), stDep = basis * (T.macrs[a - 1] || 0), rebInc = a === 1 ? rebateTaxable : 0;
    var stInc = ncf + rebInc - stDep - interest, stUsed = T.lossesUsable ? 0 : (stInc > 0 ? Math.min(stNol, stInc) : 0);
    stNol = T.lossesUsable ? 0 : stNol - stUsed + Math.max(-stInc, 0);
    var stTax = (T.lossesUsable ? stInc : Math.max(stInc - stUsed, 0)) * T.state;
    var fedInc = ncf + rebInc - fedDep - stTax - interest, fedUsed = T.lossesUsable ? 0 : (fedInc > 0 ? Math.min(fedNol, T.lossLimit * fedInc) : 0);
    fedNol = T.lossesUsable ? 0 : fedNol - fedUsed + Math.max(-fedInc, 0);
    var fedTax = (T.lossesUsable ? fedInc : Math.max(fedInc - fedUsed, 0)) * T.federal, tax = stTax + fedTax, eqCf = ncf - tax - service;
    cum += ncf; cumEq += eqCf; cf.push(ncf); eq.push(eqCf); taxTotal += tax; interestTotal += interest; propTotal += prop; augTotal += aug;
    rows.push({ year: a, energyMwh: r2(energy), capacityFactor: +factor.toFixed(4), grossRevenue: r2(grossRev), aggregatorShare: r2(agg), platformFee: r2(plat), netRevenue: r2(net),
      fixedOm: r2(fixedOm), variableOm: r2(varOm), insurance: r2(ins), propertyTax: r2(prop), chargingLoss: r2(loss), augmentation: r2(aug), opex: r2(opex),
      netCashFlow: r2(ncf), cumulative: r2(cum), incomeTax: r2(tax), debtService: r2(service), equityCashFlow: r2(eqCf), cumulativeEquity: r2(cumEq), dscr: dscr == null ? null : +dscr.toFixed(2) });
    debtOpen = debtClose;
  }
  var noInvestment = cf[0] >= 0, noEquity = eq[0] >= 0;
  var projIrr = noInvestment ? null : irr(cf), eqIrr = noEquity ? null : irr(eq);
  var y1 = rows[0];
  if (noInvestment) notes.push('The credit and the rebate cover the cost, so there is no net investment at completion: an IRR is not defined. Bridge financing is still needed until they arrive.');
  notes.push('Grid-side revenue only (regulation, capacity, arbitrage, reserves through an aggregator): no bill savings for the host are counted.');
  notes.push('A battery shifts energy; it does not create utility capacity. Charging at ' + fmt(kw) + ' kW must fit the same free capacity it is sized on.');
  return {
    ok: true, version: VERSION, market: market,
    sizing: { kw: r2(kw), kwh: r2(kwh), hours: A.durationHours, basis: 'the site’s free capacity at ' + A.durationHours + ' hours' },
    capex: { hardware: r2(hardware), softCosts: r2(soft), construction: r2(epc), interconnection: r2(A.interconnectionUsd), total: r2(total),
      itcGross: r2(itcGross), itcProceeds: r2(itcProceeds), rebate: r2(rebate), rebateApplies: rebateOn, net: r2(netCapex) },
    revenue: { grossPerKwYear: gross1kw, netPerKwYear: r2(gross1kw * (1 - A.aggregatorSharePct - A.platformFeePct) - A.platformFixedPerKw),
      streams: [['regulation', 'Regulation / frequency response'], ['capacity', 'Capacity market'], ['arbitrage', 'Energy arbitrage'], ['reserves', 'Synchronized and other reserves']].map(function (s) {
        return { key: s[0], label: s[1], perKwYear: R[s[0]], year1: r2(kw * R[s[0]]), sharePct: gross1kw ? +(R[s[0]] / gross1kw * 100).toFixed(1) : null }; }) },
    year1: { netRevenue: y1.netRevenue, netCashFlow: y1.netCashFlow, incomeTax: y1.incomeTax, equityCashFlow: y1.equityCashFlow, propertyTax: y1.propertyTax, chargingLoss: y1.chargingLoss },
    projections: rows,
    returns: {
      noNetInvestment: noInvestment, irrPct: projIrr == null ? null : +(projIrr * 100).toFixed(2), irrBasis: 'project IRR, before tax, unlevered, over ' + years + ' years',
      npv: r2(npv(A.discountRate, cf.slice(1)) + cf[0]), discountRatePct: A.discountRate * 100,
      paybackYears: netCapex <= 0 ? 0 : (y1.netCashFlow > 0 ? +(netCapex / y1.netCashFlow).toFixed(2) : null), paybackWords: netCapex <= 0 ? 'Immediate: net capital is zero or less' : null,
      cumulative: r2(cum), equityIrrPct: eqIrr == null ? null : +(eqIrr * 100).toFixed(2), equityNoInvestment: noEquity, equityNpv: r2(npv(A.discountRate, eq.slice(1)) + eq[0]), cumulativeEquity: r2(cumEq),
      incomeTaxTotal: r2(taxTotal), propertyTaxTotal: r2(propTotal), augmentationTotal: r2(augTotal) },
    debt: { loan: r2(loan), repaidFromIncentives: r2(swept), termBalance: r2(termBal), bridgeInterest: r2(bridge), annualService: r2(annualDs), interestTotal: r2(interestTotal), minDscr: minDscr == null ? null : +minDscr.toFixed(2), equityAtCompletion: r2(eq[0]) },
    energyAtEnd: { mwh: rows[rows.length - 1].energyMwh, year: years },
    notes: notes
  };
}

module.exports = { VERSION: VERSION, SET: SET, LIMITS: LIMITS, bessCase: bessCase, marketFit: marketFit, irr: irr, npv: npv };
