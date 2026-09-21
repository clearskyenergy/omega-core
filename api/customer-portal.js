/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Public sign-in presentation only: no account, terms, keys or orders. */
'use strict';
var A = require('./_lib/admin'), B = require('./_lib/buyer-accounts'), brand = require('./_lib/logic-brand'), links = require('./_lib/customer-links');
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') throw A.httpError(405, 'GET only');
  var org = A.safeOrg(req.query.org);
  if (!org) throw A.httpError(400, 'Valid supplier required');
  try {
    var ctx = await B.context(org), offer = ctx.billing.customerEditorLite || {};
    var price = Number(offer.monthlyPriceCents);
    var entry = links.paths(org); entry.storefront = await links.publicStorefront(A.db(), org);
    return { org: org, brand: brand(ctx.org), links: entry, account: { free: true, signup: true }, editorLite: {
      monthlyPriceCents: Number.isSafeInteger(price) && price > 0 ? price : 79900, currency: 'USD', interval: 'month',
      checkoutAvailable: false, includes: ['Guided site design', 'Site-map exports', 'Project quoting', 'Supplier ordering']
    } };
  } catch (e) {
    if (e.status && e.status < 500) throw e;
    throw A.httpError(503, 'The customer portal is temporarily unavailable.');
  }
});
