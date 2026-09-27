/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * A tenant's owner or administrator changes their own package: quote,
 * subscribe (pay first), cancel a pending change, request a removal.
 * Members are refused a change and may read the summary; ClearSky staff may
 * act for a tenant. A plan billed outside the engine adds a module as an
 * add-on: `addon-quote` prices it, `addon-buy` issues the QuickBooks invoice
 * (pay by card, or the card saved there) and it switches on when paid,
 * `addon-cancel` withdraws one still waiting (api/_lib/addons.js). `opt-in`
 * still records a priced request. The engine's guard decides where it bills.
 */
'use strict';
var A = require('./_lib/admin'), C = require('./_lib/plan-change'), AO = require('./_lib/addons');
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET' && req.method !== 'POST') throw A.httpError(405, 'GET or POST required');
  var caller = await A.authenticate(req), input = req.method === 'GET' ? req.query || {} : req.body || {};
  var orgId = A.safeOrg(input.orgId || caller.orgId);
  if (!orgId) throw A.httpError(400, 'Valid organization required');
  if (!caller.staff) {
    /* a verified email, or an owner or administrator of an active client
       (admin.clientAdmin: the role vouches for them); a member reads with one */
    if ((!caller.claims || caller.claims.email_verified !== true) && !(await A.clientAdmin(caller, orgId))) throw A.httpError(403, 'Verified email required');
    if (orgId !== caller.orgId) throw A.httpError(403, 'Own organization required');
    /* the summary (GET) is the workspace's own billing, which every verified
       member of the org may read (the rules let a member read billing/current;
       Plan & billing shows it); a CHANGE stays with an owner or administrator */
    if (req.method !== 'GET' && !(await A.isTenantAdmin(caller, orgId))) throw A.httpError(403, 'Ask your workspace administrator to change the plan');
  }
  if (req.method === 'GET') return C.summary(A.db(), orgId);
  var fields = ['orgId', 'action', 'add', 'plan', 'previewId', 'effectiveAt', 'changeId', 'addOnId', 'remove', 'reason', 'meter', 'enabled', 'dryRun'];
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
    case 'addon-quote': return AO.preview(A.db(), orgId, input, now, caller.staff);
    case 'addon-buy': return AO.buy(A.db(), orgId, input, caller, now);
    case 'addon-cancel': return AO.cancel(A.db(), orgId, input.addOnId, caller, now);
    default: throw A.httpError(400, 'Action must be quote, apply, cancel, request-removal, withdraw-removal, pack-quote, pack-buy, auto-topup, reconcile-now, opt-in, addon-quote, addon-buy or addon-cancel');
  }
});
