/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A = require('./admin'), S = require('./office-stage');
function owner(c) { return String(c.email || '').toLowerCase() === 'tom@clearsky-usa.com' && c.claims.email_verified === true; }
function requireOwner(c) { if (!owner(c)) throw A.httpError(403, 'Omega Logic control is restricted to the verified ClearSky owner account'); }
async function context(orgId) {
  orgId = A.safeOrg(orgId);
  if (!orgId) throw A.httpError(400, 'Valid org required');
  var root = A.db().collection('omega_orgs').doc(orgId);
  var rows = await Promise.all([root.get(), root.collection('billing').doc('current').get(), root.collection('fulfillment').doc('config').get()]);
  if (!rows[0].exists) throw A.httpError(404, 'OEM account not provisioned');
  return { orgId: orgId, org: rows[0].data(), billing: rows[1].exists ? rows[1].data() : {}, config: rows[2].exists ? rows[2].data() : {} };
}
function subscribed(ctx) {
  var b = ctx.billing;
  return ctx.org.status === 'active' &&
    ((b.addons || []).indexOf('omega-logic') >= 0 || b.omegaLogic === true) &&
    ['suspended', 'cancelled', 'past_due'].indexOf(b.status) < 0;
}
function enabled(ctx) { return subscribed(ctx) && ctx.config.enabled === true; }
/* The context also carries the caller's standing in the workspace as
   `member` ({ role, status } off omega_orgs/{org}/members/{uid}; null for
   the ClearSky owner, who is nobody's member). */
async function authorize(c, org, write) {
  if (!c.claims.email_verified) throw A.httpError(403, 'Verify your email first');
  var ctx = await context(org);
  ctx.member = null;
  if (owner(c)) return ctx;
  if (!(await A.canActInOrg(c, ctx.orgId)) || c.staff) throw A.httpError(403, 'Not your OEM workspace');
  var m = await A.db().doc('omega_orgs/' + ctx.orgId + '/members/' + c.uid).get();
  var d = m.exists ? m.data() : {};
  if (d.status === 'disabled' || !d.role || (write && ['owner', 'admin'].indexOf(d.role) < 0)) throw A.httpError(403, 'An active OEM ' + (write ? 'administrator' : 'member') + ' is required');
  if (!subscribed(ctx)) { var ie = A.httpError(403, 'Omega Logic subscription is not active'); ie.reason = 'inactive'; throw ie; }
  ctx.member = { role: d.role, status: d.status || 'active' };
  return ctx;
}

/* ── D1 (2026-09-24): who approves a price and accepts an order ──────────
   ClearSky (the verified owner account) prices and accepts everything, and
   is the only one who may on an order billed through ClearSky's
   QuickBooks. On an order the workspace bills ITSELF (office-stage
   billingOf: the order's own mode once priced, else
   fulfillment/config.accounting === 'tenant') an ACTIVE owner or admin of
   that workspace may too. A member or viewer never may. The workflow's one
   writer (logic-workflow price) calls requirePricer before it writes, so
   every door to a price goes through this one rule; the order's event log
   records who and when. */
var officeAdmin = S.officeAdmin;
/* What the office is told about the person looking (office-stage access();
   actions() turns it into each order's can/waitingOn). Takes authorize()'s
   context. */
function access(c, ctx) { return S.access(owner(c), ctx && ctx.member, !!ctx && enabled(ctx)); }
async function requirePricer(c, ctx, order) {
  if (!ctx || !ctx.orgId || !order || order.orgId !== ctx.orgId) throw A.httpError(404, 'Order not found in this workspace');
  if (owner(c)) return 'clearsky';
  if (S.billingOf(order, (ctx.config || {}).accounting) !== 'tenant') throw A.httpError(403, 'ClearSky approves the price and accepts this order: it is billed through ClearSky’s QuickBooks');
  if (!c.claims || c.claims.email_verified !== true) throw A.httpError(403, 'Verify your email first');
  if (c.staff || !(await A.canActInOrg(c, ctx.orgId))) throw A.httpError(403, 'Not your OEM workspace');
  var m = await A.db().doc('omega_orgs/' + ctx.orgId + '/members/' + c.uid).get(), d = m.exists ? m.data() : null;
  if (!officeAdmin(d)) throw A.httpError(403, 'The workspace owner or an administrator approves prices and accepts orders');
  if (!subscribed(ctx)) { var ie = A.httpError(403, 'Omega Logic subscription is not active'); ie.reason = 'inactive'; throw ie; }
  return d.role;
}
module.exports = { owner: owner, requireOwner: requireOwner, context: context, subscribed: subscribed, enabled: enabled, authorize: authorize,
  officeAdmin: officeAdmin, access: access, requirePricer: requirePricer };
