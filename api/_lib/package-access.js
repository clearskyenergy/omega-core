/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * One packaged entitlement decision for API producers and browser projection.
 * Legacy billing is unchanged. A browser projection is presentation only.
 */
'use strict';
var M = require('./modules');
function deny(message) { var e = new Error(message); e.status = 403; throw e; }
function instant(v) {
  if (v && typeof v.toMillis === 'function') return v.toMillis();
  return typeof v === 'number' ? v : Date.parse(v);
}
function project(caller, billing, org, member, now) {
  billing = billing || {};
  if (billing.packaged !== true) return { packaged: false };
  if (caller.staff) return { packaged: true, staff: true, canPreview: true, starters: M.starters(), readOnly: false, modules: M.catalog().map(function (m) { return m.key; }),
    caps: ['all'], toolAccess: M.catalog().reduce(function (out, m) { return out.concat(m.tools); }, []), catalog: M.catalog(), notSold: M.notSold(), readOnlyRibbon: M.readOnlyRibbon() };
  if (!(caller.emailVerified === true || caller.claims && caller.claims.email_verified === true)) deny('Verified email required');
  if (!org || org.status !== 'active' || !member || (member.status && member.status !== 'active')) deny('Active organization membership required');
  if (['owner', 'admin', 'member', 'viewer'].indexOf(member.role) < 0) deny('Workspace role required');
  now = now == null ? Date.now() : now;
  var grants;
  try { grants = M.resolve(billing.modules); } catch (e) { deny('Invalid package; contact your administrator'); }
  if (Array.isArray(member.toolAccess)) grants.toolAccess = grants.toolAccess.filter(function (k) { return member.toolAccess.indexOf(k) >= 0; });
  var state = billing.packagingState, canWork = state === 'paid';
  if (state === 'trial') {
    var start = instant(billing.trialStartedAt), end = instant(billing.trialEndsAt);
    canWork = isFinite(start) && isFinite(end) && end > start && end - start <= 14 * 86400000 && now >= start && now < end;
  }
  // Renewal fallback is a server-written Lite grant after an earlier paid
  // period. It cannot resurrect premium modules or an unpaid first trial.
  if (state === 'past_due_lite') canWork = grants.modules.length === 1 && grants.modules[0] === 'lite' && isFinite(instant(billing.paidThrough));
  canWork = canWork && billing.accessUntil != null && isFinite(instant(billing.accessUntil)) && now < instant(billing.accessUntil);
  var notice = null;
  if (state === 'trial' && canWork && now >= instant(billing.trialStartedAt) + 10 * 86400000) {
    notice = { text: 'Your trial ends on ' + new Date(instant(billing.trialEndsAt)).toISOString().slice(0, 10) + '. Your plan: ' + (billing.plan || 'Lite + modules') + (billing.monthlyDisplay ? ', ' + billing.monthlyDisplay : '') + '.', payUrl: null };
  } else if (!canWork) notice = { text: 'This workspace is read-only. Your saved projects remain available. Pay to continue creating and exporting.', payUrl: require('./logic-policy').paymentLink(billing.paymentLink) };
  else if (state === 'past_due_lite') notice = { text: 'Payment is overdue. Your workspace has returned to Lite. Your saved work remains available.', payUrl: require('./logic-policy').paymentLink(billing.paymentLink) };
  return { packaged: true, staff: false, readOnly: !canWork || member.role === 'viewer', modules: grants.modules,
    accessUntil: billing.accessUntil == null ? null : instant(billing.accessUntil), billingNotice: notice,
    tier: grants.tier, addons: grants.addons, caps: grants.caps, toolAccess: grants.toolAccess, catalog: M.catalog(), notSold: M.notSold(), readOnlyRibbon: M.readOnlyRibbon() };
}
function requireModule(view, key, options) {
  options = options || {};
  if (!view.packaged || view.staff) return;
  var keys = Array.isArray(key) ? key : [key];
  keys = keys.filter(function (k) { return view.modules.indexOf(k) >= 0; });
  if (!keys.length) deny('This module is not in your package');
  if (options.produce !== false && view.readOnly) deny('This workspace is read-only');
  var tools = options.tools || keys.reduce(function (out, k) { return out.concat(M.get(k).tools); }, ['editor']);
  if (Array.isArray(view.toolAccess) && !tools.some(function (k) { return view.toolAccess.indexOf(k) >= 0; })) deny('Your member access does not include this tool');
}
/* For endpoints already using verify-token.authenticateWithTier. Its caller
 * token reads membership and org under the existing Firestore rules. */
async function withToken(req, ctx, key, options) {
  if (!ctx.billing || ctx.billing.packaged !== true || ctx.caller.staff) return ctx;
  var V = require('./verify-token'), token = String(req.headers.authorization || '').replace(/^Bearer /, '');
  var root = 'omega_orgs/' + encodeURIComponent(ctx.caller.orgId);
  var records = await Promise.all([V.readAsCaller(token, root), V.readAsCaller(token, root + '/members/' + encodeURIComponent(ctx.caller.uid))]);
  var view = project(ctx.caller, ctx.billing, records[0], records[1], Date.now());
  requireModule(view, key, options); ctx.packageAccess = view; return ctx;
}
/* For Admin-SDK endpoints. Existing operation-specific ownership checks still
 * run; this only checks the package held by the caller's organization. */
async function withCaller(caller, key, options) {
  var A = require('./admin');
  options = options || {};
  var orgId = options.orgId || caller.orgId;
  if (caller.staff) return { packaged: false, staff: true };
  var billing = await A.billingOf(orgId);
  if (billing.packaged !== true) return { packaged: false };
  if (orgId !== caller.orgId) deny('Packaged production requires own organization membership');
  var root = A.db().collection('omega_orgs').doc(orgId);
  var records = await Promise.all([root.get(), root.collection('members').doc(caller.uid).get()]);
  var view = project(caller, billing, records[0].exists ? records[0].data() : null, records[1].exists ? records[1].data() : null, Date.now());
  requireModule(view, key, options); return view;
}
/* Customer Editor Lite has its own buyer authorization and persistence. This
 * projection is drawing chrome only, never a platform membership or API grant. */
function customerDrawing(active) {
  var v = M.resolve(['lite']);
  v.packaged = true; v.staff = false; v.readOnly = active !== true;
  v.catalog = M.catalog(); v.notSold = M.notSold(); v.readOnlyRibbon = M.readOnlyRibbon();
  return v;
}
module.exports = { customerDrawing: customerDrawing, project: project, requireModule: requireModule, withToken: withToken, withCaller: withCaller };
