/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * A tenant's owner or administrator changes their own package: quote,
 * subscribe (pay first), cancel a pending change, request a removal.
 * Members are refused a change and may read the summary; ClearSky staff may
 * act for a tenant. `opt-in` records a priced request on a plan billed
 * outside the engine (nothing charged); `withdraw-opt-in` takes it back, and
 * on such a plan request-removal / withdraw-removal record an opt-out the
 * same way. Sandbox only.
 *
 * A REQUEST (those four actions) grants nothing and charges nothing: it is
 * recorded with who asked and ClearSky confirms it with the workspace. An
 * owner or administrator may file one on the ROLE alone (Tommy, 2026-09-27:
 * "it's an admin so it's already verified, it's on their tenant"): that role
 * is written only by ClearSky or the workspace's own owner through the
 * server, never by a browser (firestore.rules, members), so it is a grant to
 * that sign-in, and the record and ClearSky's mail say whether the address
 * was verified. Everything that prices, invoices, switches on or reads the
 * billing summary still needs a verified email.
 */
'use strict';
var A = require('./_lib/admin'), C = require('./_lib/plan-change');
var REQUESTS = ['opt-in', 'withdraw-opt-in', 'request-removal', 'withdraw-removal'];
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET' && req.method !== 'POST') throw A.httpError(405, 'GET or POST required');
  var caller = await A.authenticate(req), input = req.method === 'GET' ? req.query || {} : req.body || {};
  var orgId = A.safeOrg(input.orgId || caller.orgId);
  if (!orgId) throw A.httpError(400, 'Valid organization required');
  if (!caller.staff) {
    var request = req.method === 'POST' && REQUESTS.indexOf(input.action) >= 0;
    if (!request && (!caller.claims || caller.claims.email_verified !== true)) throw A.httpError(403, 'Verified email required');
    if (orgId !== caller.orgId) throw A.httpError(403, 'Own organization required');
    /* the summary (GET) is the workspace's own billing, which every verified
       member of the org may read (the rules let a member read billing/current;
       Plan & billing shows it); a CHANGE stays with an owner or administrator */
    if (req.method !== 'GET' && !(await A.isTenantAdmin(caller, orgId))) throw A.httpError(403, 'Ask your workspace administrator to change the plan');
  }
  if (req.method === 'GET') return C.summary(A.db(), orgId);
  var fields = ['orgId', 'action', 'add', 'plan', 'previewId', 'effectiveAt', 'changeId', 'remove', 'reason', 'meter', 'enabled', 'dryRun'];
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
    case 'reconcile-now': return C.reconcileNow(A.db(), orgId, caller, now);
    case 'opt-in': return C.optIn(A.db(), orgId, input, caller, now);
    case 'withdraw-opt-in': return C.withdrawOptIn(A.db(), orgId, input, caller, now);
    default: throw A.httpError(400, 'Action must be quote, apply, cancel, request-removal, withdraw-removal, pack-quote, pack-buy, auto-topup, reconcile-now, opt-in or withdraw-opt-in');
  }
});
