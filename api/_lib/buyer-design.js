/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A = require('./admin'), B = require('./buyer-accounts'), X = require('./logic-access');
var MODULES = ['bess', 'compute', 'ev', 'solar'];
function entitlement(ctx, account, caller) {
  var lite = ctx.billing.editorLite || {}, grant = account.editorLite || {}, expiry = Date.parse(grant.expiresAt || '');
  // Only the authenticated, verified ClearSky owner gets support access. This
  // does not create a subscription or widen the supplier's enabled modules.
  var ownerAccess = !!(caller && caller.claims && X.owner(caller)) && lite.enabled === true;
  var active = ownerAccess || (lite.enabled === true && ['active', 'trial'].indexOf(grant.status) >= 0 &&
    isFinite(expiry) && expiry > Date.now() &&
    (grant.source === 'provider' || (grant.status === 'trial' && grant.source === 'owner-trial')));
  return { active: active, status: ownerAccess ? 'owner-access' : active ? grant.status : 'inactive', expiresAt: ownerAccess ? null : grant.expiresAt || null,
    modules: MODULES.filter(function (m) { return Array.isArray(lite.modules) && lite.modules.indexOf(m) >= 0; }) };
}
async function access(caller, org) {
  if (!caller.claims || caller.claims.email_verified !== true) throw A.httpError(403, 'Verify your customer email before opening a project');
  var ctx = await B.context(org), acct = await B.lookup(A.db(), org, B.email(caller.email));
  if (!acct) throw A.httpError(403, 'Open your customer account before creating a design');
  B.active(acct);
  return { ctx: ctx, account: acct, grant: entitlement(ctx, acct.data, caller),
    projects: A.db().collection('omega_orgs').doc(org).collection('customers').doc(acct.id).collection('projects') };
}
function requireEditor(scope) {
  if (!scope.grant.active) throw A.httpError(403, 'An active customer Editor Lite subscription or approved trial is required');
}
function sizing(scope, b) {
  requireEditor(scope);
  if (scope.grant.modules.indexOf(b.module) < 0) throw A.httpError(403, 'This design module is not enabled by your supplier');
  var kw = Number(b.kw), hours = Number(b.hours);
  if (!isFinite(kw) || kw <= 0 || kw > 10000000) throw A.httpError(400, 'Enter a target greater than zero and no more than 10 GW');
  if (b.module === 'bess' && (!isFinite(hours) || hours <= 0 || hours > 48)) throw A.httpError(400, 'Storage duration must be greater than zero and no more than 48 hours');
  return { module: b.module, kw: kw, hours: b.module === 'bess' ? hours : null, kwh: b.module === 'bess' ? kw * hours : null, conceptOnly: true };
}
module.exports = { access: access, entitlement: entitlement, requireEditor: requireEditor, sizing: sizing };
