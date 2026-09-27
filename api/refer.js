/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * /api/refer — Refer & earn (api/_lib/refer.js holds every rule).
 *
 *   GET                         the workspace's link, credits, referrals and
 *                               invitations; any verified member reads their
 *                               own, ClearSky staff any (?orgId=)
 *   POST { action: 'link' }     make the workspace's share link (once)
 *   POST { action: 'invite', email, name?, company?, note? }
 *                               email a company the link (20 a day)
 *   POST { action: 'apply', code }
 *                               put a $500 code on the bill: an owner or
 *                               administrator of the workspace, or staff
 *   staff only (the tenant's Referrals panel in /admin/tenant.html):
 *   POST { action: 'qualify', orgId }            the referred workspace paid outside QuickBooks and Stripe
 *   POST { action: 'attribute', orgId, referrerOrgId }   record a referral made outside the link
 *   POST { action: 'decline', orgId, reason }    not a real referral: no credit
 *   POST { action: 'settle', code, note }        a hand-invoiced credit was taken off an invoice
 *   POST { action: 'void', code, reason }        withdraw a code nothing was taken off yet
 *
 * A member's own organization only; a workspace that is not active can read
 * but not refer. Nothing here prices anything: the reward is the library's
 * one constant and a credit comes off an invoice only in the billing engine.
 */
'use strict';
var A = require('./_lib/admin'), R = require('./_lib/refer');
var STAFF = ['qualify', 'attribute', 'decline', 'settle', 'void'];
var FIELDS = ['orgId', 'action', 'email', 'name', 'company', 'note', 'code', 'referrerOrgId', 'reason'];
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'GET' && req.method !== 'POST') throw A.httpError(405, 'GET or POST required');
  var caller = await A.authenticate(req), input = req.method === 'GET' ? req.query || {} : req.body || {};
  var orgId = A.safeOrg(input.orgId || caller.orgId), action = req.method === 'GET' ? 'summary' : input.action;
  if (!orgId) throw A.httpError(400, 'Valid organization required');
  if (req.method === 'POST' && Object.keys(input).some(function (k) { return FIELDS.indexOf(k) < 0; })) throw A.httpError(400, 'Unsupported field');
  if (STAFF.indexOf(action) >= 0 && !caller.staff) throw A.httpError(403, 'ClearSky staff only');
  if (!caller.staff) {
    if (!caller.claims || caller.claims.email_verified !== true) throw A.httpError(403, 'Verified email required');
    if (orgId !== caller.orgId) throw A.httpError(403, 'Own organization required');
    if (action === 'apply' && !(await A.isTenantAdmin(caller, orgId))) throw A.httpError(403, 'An owner or administrator of the workspace applies a credit to the bill');
  }
  var db = A.db(), now = Date.now();
  switch (action) {
    /* the console's view (who referred this workspace, the audit fields) for staff looking at a
       tenant; a staffer's own workspace page gets the member's view unless it asks (?staff=true) */
    case 'summary': return R.summary(db, orgId, now, { staff: caller.staff === true && (orgId !== caller.orgId || input.staff === 'true') });
    case 'link': {
      var org = await db.doc('omega_orgs/' + orgId).get();
      if (!org.exists || org.data().status !== 'active') throw A.httpError(409, 'Your workspace can refer companies once it is active');
      return R.link(db, orgId, caller, now);
    }
    case 'invite': return R.invite(db, orgId, input, caller, now);
    case 'apply': return R.apply(db, orgId, input.code, caller, now);
    case 'qualify': return R.qualify(db, orgId, caller, now);
    case 'attribute': {
      var referrer = A.safeOrg(input.referrerOrgId);
      if (!referrer) throw A.httpError(400, 'referrerOrgId must be the referring workspace’s domain');
      return R.attribute(db, orgId, referrer, caller, now);
    }
    case 'decline': return R.decline(db, orgId, caller, now, input.reason);
    case 'settle': return R.settle(db, input.code, caller, now, input.note);
    case 'void': return R.voidCredit(db, input.code, caller, now, input.reason);
    default: throw A.httpError(400, 'Action must be link, invite, apply, qualify, attribute, decline, settle or void');
  }
});
