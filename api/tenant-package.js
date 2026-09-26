/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A = require('./_lib/admin'), S = require('./_lib/package-billing'), M = require('./_lib/modules'), P = require('./_lib/subscription-pricing');
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET' && req.method !== 'POST') throw A.httpError(405, 'GET or POST required');
  var caller = await A.authenticate(req), input = req.method === 'GET' ? req.query || {} : req.body || {};
  var orgId = A.safeOrg(input.orgId || caller.orgId);
  if (!orgId) throw A.httpError(400, 'Valid organization required');
  if (!caller.staff && (!caller.claims || caller.claims.email_verified !== true || !(await A.isTenantAdmin(caller, orgId)))) throw A.httpError(403, 'Tenant administrator required');
  if (req.method === 'POST') {
    if (!caller.staff) throw A.httpError(403, 'Staff only');
    var fields = ['orgId', 'modules', 'pricebookVersion', 'plan', 'credit', 'builders', 'viewers', 'serviceFee', 'interval', 'action', 'dryRun', 'previewId', 'effectiveAt'];
    if (Object.keys(input).some(function (k) { return fields.indexOf(k) < 0; })) throw A.httpError(400, 'Unsupported package field');
    if (input.dryRun !== false) return S.preview(A.db(), orgId, input, Date.now());
    return S.apply(A.db(), orgId, input, caller, Date.now());
  }
  var c = await S.context(A.db(), orgId), billing = Object.assign({}, c.billing);
  billing.paymentLink = require('./_lib/logic-policy').paymentLink(billing.paymentLink);
  delete billing.activationLock; delete billing.invoiceLock;
  var history = await c.root.collection('billing').doc('current').collection('history').orderBy('at', 'desc').limit(100).get();
  var audit = caller.staff ? await c.root.collection('admin_audit').orderBy('at', 'desc').limit(100).get() : { docs: [] };
  return { orgId: orgId, name: c.org.name || orgId, status: c.org.status, canManagePackage: caller.staff, billing: billing,
    pricebookVersion: c.book.version, enabled: c.book.enabled, defaults: { credit: c.book.credit, builders: c.book.logins.builders,
      viewers: c.book.logins.viewers, annualPaidMonths: c.book.annualPaidMonths, annualTransformationCredit: c.book.policy.annualTransformationCredit === true },
    modules: P.catalog(c.book), starters: M.starters(), starterLabels: M.starterLabels(),
    history: history.docs.map(function (d) { return d.data(); }), audit: audit.docs.map(function (d) { return d.data(); }) };
});
