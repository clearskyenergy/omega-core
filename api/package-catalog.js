/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Authorized read-only projection and quote. Never changes a subscription.
 */
'use strict';
var A = require('./_lib/admin'), B = require('./_lib/pricebook'), M = require('./_lib/modules'), P = require('./_lib/subscription-pricing');
module.exports = A.handler(async function (req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') throw A.httpError(405, 'GET or POST required');
  res.setHeader('Cache-Control', 'private, no-store');
  var caller = await A.authenticate(req), body = req.method === 'POST' ? (req.body || {}) : (req.query || {});
  var org = A.safeOrg(body.orgId || caller.orgId);
  if (!org || (!caller.staff && org !== caller.orgId)) throw A.httpError(403, 'Own organization required');
  if (!caller.staff && (!caller.claims || caller.claims.email_verified !== true)) throw A.httpError(403, 'Verified email required');
  var db = A.db(), billing = await A.billingOf(org);
  var tenant = await db.doc('omega_orgs/' + org).get();
  if (!caller.staff) {
    if (!tenant.exists || ['active', 'pending'].indexOf(tenant.data().status) < 0) throw A.httpError(403, 'Organization unavailable');
    var member = await db.doc('omega_orgs/' + org + '/members/' + caller.uid).get();
    if (!member.exists || member.data().status === 'disabled') throw A.httpError(403, 'Active membership required');
  }
  var version = caller.staff && body.pricebookVersion ? body.pricebookVersion : (billing.pricebookVersion || B.VERSION);
  var book = await B.load(db, version);
  if (!caller.staff && !book.enabled) throw A.httpError(403, 'Packaging is not enabled');
  var rows = M.catalog().map(function (m) { m.priceCents = book.modules[m.key].priceCents; m.priceDisplay = P.money(m.priceCents) + '/month'; return m; });
  var result = { orgId: org, pricebookVersion: version, modules: rows, starters: M.starters(), canManage: await A.isTenantAdmin(caller, org) };
  if (req.method === 'POST') {
    var allowed = ['orgId', 'modules', 'plan', 'builders', 'viewers'];
    if (caller.staff) allowed = allowed.concat(['pricebookVersion', 'credit', 'serviceFee']);
    if (Object.keys(body).some(function (k) { return allowed.indexOf(k) < 0; })) throw A.httpError(400, 'Unsupported quote field');
    result.quote = P.quote(body.modules, book, { plan: body.plan, builders: body.builders, viewers: body.viewers,
      credit: caller.staff ? body.credit : billing.credit, serviceFee: caller.staff ? body.serviceFee : billing.serviceFee, now: Date.now() });
  }
  return result;
});
