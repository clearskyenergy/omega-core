/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A = require('./admin');
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
async function authorize(c, org, write) {
  if (!c.claims.email_verified) throw A.httpError(403, 'Verify your email first');
  var ctx = await context(org);
  if (owner(c)) return ctx;
  if (!(await A.canActInOrg(c, ctx.orgId)) || c.staff) throw A.httpError(403, 'Not your OEM workspace');
  var m = await A.db().doc('omega_orgs/' + ctx.orgId + '/members/' + c.uid).get();
  var d = m.exists ? m.data() : {};
  if (d.status === 'disabled' || !d.role || (write && ['owner', 'admin'].indexOf(d.role) < 0)) throw A.httpError(403, 'An active OEM ' + (write ? 'administrator' : 'member') + ' is required');
  if (!subscribed(ctx)) throw A.httpError(403, 'Omega Logic subscription is not active');
  return ctx;
}
module.exports = { owner: owner, requireOwner: requireOwner, context: context, subscribed: subscribed, enabled: enabled, authorize: authorize };
