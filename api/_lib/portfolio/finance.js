/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/portfolio/finance.js — money only where the inputs exist
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. The savings and payback come out of the same engine sweep that
   sized the site (bess-engine's sensitivity is where the storefront reads
   them too). This module decides whether those numbers may be SHOWN:

     available    a detailed size on a supplied tariff and the supplier's
                  own cost basis (storefront capexPerKwh/capexPerKw) or a
                  published list price for the fitted product
     preliminary  the engine ran on at least one assumption — a default
                  tariff, a default cost — and every one is listed
     unavailable  no tariff or no load basis: nothing is shown, and the
                  exact inputs are listed

   IRR, NPV and incentives are not computed here: the engine has no term,
   discount rate, O&M, degradation or incentive inputs on a portfolio row.
   They are listed as required rather than defaulted.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var Q = require('./quality');

function evaluate(site, sizing, opts) {
  opts = opts || {};
  var required = [], assumptions = [], tenantCost = opts.tenantCost || {}, listed = null;
  if (!sizing || sizing.status === 'unable' || sizing.status === 'screening') {
    return { status: 'unavailable', reason: sizing && sizing.status === 'screening' ? 'A screening range has no financial result' : 'No size to price', required: ['Billed peaks or interval load data', Q.ASKS.tariff.label, 'Supplier cost basis or a published list price'], assumptions: [] };
  }
  var tariffOk = Q.has(site, 'demandChargePerKw') && Q.has(site, 'energyRate');
  if (!tariffOk) required.push(Q.ASKS.tariff.label);
  var costOk = tenantCost.capexPerKwh > 0 || tenantCost.capexPerKw > 0;
  if (sizing.config && Array.isArray(opts.listPrices)) {
    var lp = opts.listPrices.filter(function (p) { return p.sku === sizing.config.sku && p.listPrice > 0; })[0];
    if (lp) listed = { sku: lp.sku, unit: lp.listPrice, total: lp.listPrice * sizing.config.qty };
  }
  if (!costOk && !listed) required.push('Supplier installed-cost basis ($/kWh and $/kW) or a published list price for the fitted product');
  if (!tariffOk) return { status: 'unavailable', reason: 'Savings need the site\'s own demand charge and energy rate', required: required, assumptions: [] };
  var e = sizing.engine || {}, capex = listed ? listed.total : e.capex, savings = e.savingsYr;
  if (listed) assumptions.push('Capital cost from the published list price of ' + sizing.config.qty + ' × ' + listed.sku + ' (equipment only; installation not included)');
  else if (costOk) assumptions.push('Capital cost from the supplier\'s installed-cost basis');
  else assumptions.push('Capital cost from engine default installed costs — indicative only');
  if (sizing.status !== 'detailed') assumptions.push('Savings computed on ' + (e.basis || 'billed') + ' data with ' + (e.confidence || 'assumed duration'));
  (sizing.assumptions || []).forEach(function (a) { if (/assumed|default/i.test(a) && assumptions.indexOf(a) < 0) assumptions.push(a); });
  var status = sizing.status === 'detailed' && (costOk || listed) && !assumptions.some(function (a) { return /default/.test(a); }) ? 'available' : 'preliminary';
  return { status: status, savingsYr: savings != null ? Math.round(savings) : null, capex: capex != null ? Math.round(capex) : null,
    paybackYr: savings > 0 && capex > 0 ? +(capex / savings).toFixed(1) : null, capexBasis: listed ? 'list-price' : (costOk ? 'supplier-cost-basis' : 'engine-default'),
    irr: null, npv: null, incentives: null, required: required.concat(['Analysis term, discount rate, O&M, degradation and incentive inputs for IRR / NPV']), assumptions: assumptions };
}

module.exports = { evaluate: evaluate };
