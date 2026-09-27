/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * A tenant's owner or administrator changes their own package: quote,
 * subscribe (pay first), cancel a pending change, request a removal.
 * Members are refused a change and may read the summary; ClearSky staff may
 * act for a tenant. A plan billed outside the engine opts in and out: a
 * module its plan switches on exactly is bought as an ADD-ON by card
 * (`addon-quote` prices it, `addon-buy` issues the QuickBooks invoice and it
 * switches on when paid; `addon-cancel` with `addOnId` withdraws a purchase
 * still waiting, with `remove` stops a paid add-on at the end of the month
 * paid for, and `withdraw-addon-cancel` keeps it: api/_lib/addons.js);
 * anything else is a REQUEST: `opt-in` records a priced request (nothing
 * charged) and `opt-out` its mirror (nothing removed); both have a dry run
 * for the confirm panel and a withdraw (which has one too).
 * `resolve-opt-in` / `resolve-opt-out` are ClearSky's answer to such a
 * request (staff only; the library refuses anyone else). The engine's guard
 * decides where it bills.
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
    if (!caller.claims || caller.claims.email_verified !== true) throw A.httpError(403, 'Verified email required');
    if (orgId !== caller.orgId) throw A.httpError(403, 'Own organization required');
    /* the summary (GET) is the workspace's own billing, which every verified
       member of the org may read (the rules let a member read billing/current;
       Plan & billing shows it); a CHANGE stays with an owner or administrator */
    if (req.method !== 'GET' && !(await A.isTenantAdmin(caller, orgId))) throw A.httpError(403, 'Ask your workspace administrator to change the plan');
  }
  if (req.method === 'GET') return C.summary(A.db(), orgId);
  var fields = ['orgId', 'action', 'add', 'plan', 'previewId', 'effectiveAt', 'changeId', 'addOnId', 'remove', 'reason', 'meter', 'enabled', 'dryRun', 'status'];
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
    case 'withdraw-opt-in': return C.withdraw(A.db(), orgId, input, caller, now, 'optIns');
    case 'opt-out': return C.optOut(A.db(), orgId, input, caller, now);
    case 'withdraw-opt-out': return C.withdraw(A.db(), orgId, input, caller, now, 'optOuts');
    case 'resolve-opt-in': return C.resolve(A.db(), orgId, input, caller, now, 'optIns');
    case 'resolve-opt-out': return C.resolve(A.db(), orgId, input, caller, now, 'optOuts');
    case 'addon-quote': return AO.preview(A.db(), orgId, input, now, caller.staff);
    case 'addon-buy': return AO.buy(A.db(), orgId, input, caller, now);
    /* one door, two forms: addOnId cancels a purchase still waiting for
       payment; remove[] stops a paid add-on at the end of the month paid for */
    case 'addon-cancel':
      if (input.addOnId != null && input.remove != null) throw A.httpError(400, 'Name a purchase or modules, not both');
      return input.remove != null ? AO.stop(A.db(), orgId, input, caller, now, false) : AO.cancel(A.db(), orgId, input.addOnId, caller, now);
    case 'withdraw-addon-cancel': return AO.stop(A.db(), orgId, input, caller, now, true);
    default: throw A.httpError(400, 'Action must be quote, apply, cancel, request-removal, withdraw-removal, pack-quote, pack-buy, auto-topup, reconcile-now, opt-in, withdraw-opt-in, opt-out, withdraw-opt-out, resolve-opt-in, resolve-opt-out, addon-quote, addon-buy, addon-cancel or withdraw-addon-cancel');
  }
});
