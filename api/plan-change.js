/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * A tenant's owner or administrator changes their own package: quote,
 * subscribe (pay first), cancel a pending change, request a removal.
 * Members are refused; ClearSky staff may act for a tenant. Sandbox only.
 */
'use strict';
var A = require('./_lib/admin'), C = require('./_lib/plan-change');
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET' && req.method !== 'POST') throw A.httpError(405, 'GET or POST required');
  var caller = await A.authenticate(req), input = req.method === 'GET' ? req.query || {} : req.body || {};
  var orgId = A.safeOrg(input.orgId || caller.orgId);
  if (!orgId) throw A.httpError(400, 'Valid organization required');
  if (!caller.staff) {
    if (!caller.claims || caller.claims.email_verified !== true) throw A.httpError(403, 'Verified email required');
    if (orgId !== caller.orgId) throw A.httpError(403, 'Own organization required');
    if (!(await A.isTenantAdmin(caller, orgId))) throw A.httpError(403, 'Ask your workspace administrator to change the plan');
  }
  if (req.method === 'GET') return C.summary(A.db(), orgId);
  var fields = ['orgId', 'action', 'add', 'plan', 'previewId', 'effectiveAt', 'changeId', 'remove', 'reason', 'meter', 'enabled'];
  if (Object.keys(input).some(function (k) { return fields.indexOf(k) < 0; })) throw A.httpError(400, 'Unsupported field');
  var now = Date.now();
  switch (input.action) {
    case 'quote': return C.preview(A.db(), orgId, input, now);
    case 'apply': return C.apply(A.db(), orgId, input, caller, now);
    case 'cancel': return C.cancel(A.db(), orgId, input.changeId, caller, now);
    case 'request-removal': return C.removal(A.db(), orgId, input, caller, now, false);
    case 'withdraw-removal': return C.removal(A.db(), orgId, input, caller, now, true);
    case 'pack-quote': return C.packQuote(await require('./_lib/package-billing').context(A.db(), orgId), input.meter, now);
    case 'pack-buy': return C.packBuy(A.db(), orgId, input, caller, now);
    case 'auto-topup': return C.autoTopup(A.db(), orgId, input.enabled, caller, now);
    default: throw A.httpError(400, 'Action must be quote, apply, cancel, request-removal, withdraw-removal, pack-quote, pack-buy or auto-topup');
  }
});
