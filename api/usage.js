/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Usage (Phase 7).
 *   POST { meter, clientId }  count one deliverable produced in the browser
 *                             (EV workbook export, closeout ZIP, permitting
 *                             matrix, site packet): the package gate first,
 *                             then the counter; 402 with the pack when the
 *                             allowance is used and auto top-up is off.
 *   GET  ?orgId=              this cycle's usage for the tools' badges and
 *                             Your plan; owners, admins and staff also get
 *                             the 90-day review.
 * Admin SDK only; the browser never writes a counter.
 */
'use strict';
var A = require('./_lib/admin'), U = require('./_lib/usage'), B = require('./_lib/pricebook'), X = require('./_lib/package-access');
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET' && req.method !== 'POST') throw A.httpError(405, 'GET or POST required');
  var caller = await A.authenticate(req), input = req.method === 'GET' ? req.query || {} : req.body || {}, db = A.db(), now = Date.now();
  var orgId = A.safeOrg(input.orgId || caller.orgId);
  if (!orgId) throw A.httpError(400, 'Valid organization required');
  if (!caller.staff) {
    if (!caller.claims || caller.claims.email_verified !== true) throw A.httpError(403, 'Verified email required');
    if (orgId !== caller.orgId) throw A.httpError(403, 'Own organization required');
  }
  var billing = await A.billingOf(orgId);
  if (billing.packaged !== true) return { metered: false };
  var book = await B.load(db, billing.pricebookVersion || B.VERSION);
  if (req.method === 'GET') {
    var cycle = U.cycleOf(billing, now), snap = await db.doc('omega_orgs/' + orgId + '/usage/' + cycle.start).get(), doc = snap.exists ? snap.data() : null;
    var out = { metered: true, cycle: { start: cycle.start, end: cycle.end, remainingDays: cycle.remainingDays }, autoTopup: billing.autoTopup === true, meters: U.summary(billing, book, doc) };
    var admin = caller.staff || (await A.isTenantAdmin(caller, orgId));
    out.canBuy = !caller.staff && admin && billing.packagingState === 'paid' && (billing.interval || 'monthly') === 'monthly';
    if (admin) out.review = await U.review(db, orgId, billing, book, now);
    return out;
  }
  if (Object.keys(input).some(function (k) { return ['meter', 'clientId', 'orgId'].indexOf(k) < 0; })) throw A.httpError(400, 'Unsupported field');
  if (caller.staff) return { metered: false, staff: true };
  var m = U.meter(book, input.meter);
  await X.withCaller(caller, m.module, { orgId: orgId });
  var result = await U.count(db, orgId, billing, book, m.key, input.clientId, caller.email, now, { source: 'browser' });
  return Object.assign({ metered: true }, result);
});
