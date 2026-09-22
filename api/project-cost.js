/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   POST /api/project-cost: what it costs the company to deploy a battery on a
   site, under both routes — buy the building at the asking price, or lease
   the pad at the host-lease rent. Installed cost is priced by the same path
   as /api/price-site (same gate, same org pricing record, same model); the
   rent by api/_lib/site-lease.js; the comparison by api/_lib/project-cost.js.
   Nothing here is a bid. Non-staff never see the lease rate components. */
'use strict';
var A = require('./_lib/admin'), E = require('./_lib/embed'), PS = require('./price-site')._helpers, SL = require('./_lib/site-lease'), PC = require('./_lib/project-cost');

function bounded(b, k, lo, hi) {
  if (b[k] == null || b[k] === '') return null;
  var n = Number(b[k]);
  if (!isFinite(n) || n < lo || n > hi) throw A.httpError(400, k + ' is outside the supported range');
  return n;
}
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') throw A.httpError(405, 'POST required');
  var b = req.body;
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw A.httpError(400, 'a JSON object is required');
  var caller = await A.authenticate(req), org = A.safeOrg(b.orgId || caller.orgId);
  if (!org) throw A.httpError(400, 'Invalid workspace');
  if (!await A.canActInOrg(caller, org)) throw A.httpError(403, 'Not your workspace');
  await PS.gate(caller, org);
  E.rateLimit('project-cost:' + org, 60);
  PS.validateInput(b);
  var askPrice = bounded(b, 'askPrice', 0, 1e10), termYears = bounded(b, 'termYears', 1, 60), acres = bounded(b, 'acres', 0, 1e6), sqft = bounded(b, 'sqft', 0, 1e9);
  var pricing = await PS.orgPricing(org, b);
  var est = PS.finish(caller, org, b, pricing);
  var offer = SL.offer({ kw: est.kw, kwh: est.kwh, acres: acres, termYears: termYears });
  var out = PC.compose({ capex: est, lease: offer, askPrice: askPrice, sqft: sqft });
  if (!caller.staff) { delete offer.components; offer.rateCard = { version: offer.rateCard.version, asOf: offer.rateCard.asOf, disclosed: false }; }
  return { build: 'project-cost/1', at: new Date().toISOString(), orgId: org, site: PS.finish ? est.site : null, result: out,
    estimate: { total: est.total, kw: est.kw, kwh: est.kwh, hours: est.hours, estimateClass: est.estimateClass, estimateClassPlain: est.estimateClassPlain, estimateClassWhy: est.estimateClassWhy,
      accuracy: est.accuracy, unanswered: est.unanswered, financial: est.financial, notAQuote: est.notAQuote, supplierNote: est.supplierNote },
    offer: offer,
    disclaimer: 'An internal deployment cost for the company\'s own decision: an estimate priced from the cost model and the host-lease rate card, not a bid, a quote or an offer to the owner.' };
});
