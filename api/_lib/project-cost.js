/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   WHAT IT COSTS US TO DEPLOY A BATTERY HERE — buy the building, or lease the pad.

   The site finder sizes a battery against a circuit, api/_lib/cost-model.js
   prices the installed system, and api/_lib/site-lease.js prices what we
   would pay the owner to host it. This puts the three on one page for the
   company's own decision: the capex is the same either way; what differs is
   site control. Buying means the asking price up front and we own the
   building; leasing means rent over the term and we own nothing but the
   battery. Pure: it composes numbers other modules produced. */
'use strict';

function num(v) { var n = Number(v); return (v === '' || v == null || !isFinite(n)) ? null : n; }
function round(v) { return Math.round(v); }

/* First year in which cumulative escalated rent reaches the asking price:
   "leasing costs less than buying for N years". null when it never does
   within the horizon, or there is no asking price. */
function breakEvenYears(annual, escalatorPct, askPrice, horizon) {
  if (!(annual > 0) || !(askPrice > 0)) return null;
  var e = (escalatorPct || 0) / 100, cum = 0;
  for (var y = 1; y <= (horizon || 30); y++) { cum += annual * Math.pow(1 + e, y - 1); if (cum >= askPrice) return y; }
  return null;
}

/* compose({capex, lease, askPrice, sqft, lotAcres}) → the comparison.
   capex: a /api/price-site result (total{base,lo,hi}, kw, kwh, hours, perKwh,
          estimateClass…, accuracy{rangeLowUsd,rangeHighUsd}, financial{incentives,netCostUsd}).
   lease: a site-lease offer (monthly/annual/termTotal bands, termYears, escalatorPct). */
function compose(input) {
  input = input || {};
  var est = input.capex, offer = input.lease;
  if (!est || !est.total || !(est.total.base >= 0)) throw Object.assign(new Error('a priced system is required'), { status: 400 });
  if (!offer || !offer.annual || !(offer.annual.base >= 0)) throw Object.assign(new Error('a lease offer is required'), { status: 400 });
  var capexBase = round(est.total.base), kw = num(est.kw), kwh = num(est.kwh), ask = num(input.askPrice), sqft = num(input.sqft);
  var incentives = est.financial && est.financial.incentives ? round(est.financial.incentives.total || 0) : 0;
  var net = est.financial && est.financial.netCostUsd != null ? round(est.financial.netCostUsd) : Math.max(0, capexBase - incentives);
  var capex = {
    base: capexBase, rangeLow: est.accuracy ? round(est.accuracy.rangeLowUsd) : null, rangeHigh: est.accuracy ? round(est.accuracy.rangeHighUsd) : null,
    perKwh: kwh > 0 ? round(capexBase / kwh) : null, perKw: kw > 0 ? round(capexBase / kw) : null,
    estimateClass: est.estimateClass || null, estimateClassPlain: est.estimateClassPlain || null,
    incentives: incentives, net: net, assumedSize: !!est.assumedSize
  };
  var buy = ask != null && ask >= 0 ? {
    pending: false, askPrice: round(ask), siteControl: round(ask), total: capexBase + round(ask), totalNet: net + round(ask),
    perKwh: kwh > 0 ? round((capexBase + ask) / kwh) : null, pricePerSqft: sqft > 0 ? Math.round(ask / sqft * 100) / 100 : null,
    note: 'Asking price as listed; we own the building and the land, and the rest of the building can be let or used.'
  } : {
    pending: true, askPrice: null, siteControl: null, total: null, totalNet: null, perKwh: null, pricePerSqft: null,
    note: 'Asking price pending API integration — the listing is unpriced or the price has not been captured. Enter one to cost the purchase route.'
  };
  var lease = {
    monthly: round(offer.monthly.base), annual: round(offer.annual.base), termYears: offer.termYears, escalatorPct: offer.escalatorPct.base,
    siteControl: round(offer.termTotal.base), total: capexBase + round(offer.termTotal.base), totalNet: net + round(offer.termTotal.base),
    perKwh: kwh > 0 ? round((capexBase + offer.termTotal.base) / kwh) : null, leasedAcres: offer.leasedAcres,
    bands: { low: round(offer.termTotal.low), base: round(offer.termTotal.base), high: round(offer.termTotal.high) },
    note: 'Rent over the ' + offer.termYears + '-year term at the base offer, escalating ' + offer.escalatorPct.base + '% a year; we own the battery and nothing else.'
  };
  var be = buy.pending ? null : breakEvenYears(lease.annual, lease.escalatorPct, buy.askPrice, 30);
  var cheaper = buy.pending ? null : (lease.total < buy.total ? 'lease' : lease.total > buy.total ? 'buy' : 'even');
  var sentence;
  if (buy.pending) sentence = 'Leasing the pad costs ' + fmtMoney(lease.siteControl) + ' in rent over ' + lease.termYears + ' years on top of ' + fmtMoney(capexBase) + ' to build. The purchase route needs an asking price.';
  else if (cheaper === 'lease') sentence = 'Leasing costs ' + fmtMoney(buy.total - lease.total) + ' less than buying over ' + lease.termYears + ' years' + (be ? ', and rent does not reach the asking price until year ' + be : ', and rent never reaches the asking price in 30 years') + '. Buying leaves us owning the building.';
  else if (cheaper === 'buy') sentence = 'Buying costs ' + fmtMoney(lease.total - buy.total) + ' less than leasing over ' + lease.termYears + ' years' + (be ? '; rent passes the asking price in year ' + be : '') + ', and leaves us owning the building.';
  else sentence = 'Buying and leasing cost the same over ' + lease.termYears + ' years; buying leaves us owning the building.';
  return {
    model: 'project-cost-v1', kw: kw, kwh: kwh, hours: num(est.hours), termYears: lease.termYears,
    capex: capex, buy: buy, lease: lease,
    compare: { cheaper: cheaper, saving: buy.pending ? null : Math.abs(buy.total - lease.total), breakEvenYears: be, sentence: sentence },
    basis: 'Installed cost from the cost model behind /api/price-site (an estimate, not a bid); host rent from the site-lease rate card; asking price as listed. Incentives are the screening scenario, not verified for this site.'
  };
}
function fmtMoney(v) { return v == null || !isFinite(v) ? '—' : '$' + Math.round(v).toLocaleString('en-US'); }

module.exports = { compose: compose, breakEvenYears: breakEvenYears };
