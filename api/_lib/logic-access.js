/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var M = require('./modules'), X = require('./package-access');
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
/* ── Phase 8: Omega Logic follows the package ──────────────────────────
   A PACKAGED tenant (billing.packaged === true, Phases 1–7) is judged by its
   package alone: Office in modules[] and the grant live (package-access.live:
   paid, or a trial inside its dates, and before accessUntil). The parts are
   the modules bought. A legacy tenant keeps the addon / omegaLogic flags and
   holds every part; nothing changes for it. The ClearSky owner sees all. */
var LOGIC_PARTS = { plant: 'logic-plant', materials: 'logic-materials', logistics: 'logic-logistics', customer: 'logic-customer' };
function packagedModules(ctx, now) {
  var b = ctx.billing || {}; if (b.packaged !== true) return null;
  var modules; try { modules = M.normalize(b.modules); } catch (e) { return null; }
  return X.live(b, modules, now) ? modules : null;
}
function subscribed(ctx, now) {
  var b = ctx.billing || {};
  if (ctx.org.status !== 'active') return false;
  if (b.packaged === true) { var m = packagedModules(ctx, now); return !!m && m.indexOf('logic-office') >= 0; }
  return ((b.addons || []).indexOf('omega-logic') >= 0 || b.omegaLogic === true) &&
    ['suspended', 'cancelled', 'past_due'].indexOf(b.status) < 0;
}
/* The Logic parts this workspace holds (plant, materials, logistics, customer). */
function parts(ctx, now) {
  var all = Object.keys(LOGIC_PARTS); if (!subscribed(ctx, now)) return [];
  if (ctx.billing.packaged !== true) return all;
  var modules = packagedModules(ctx, now) || [];
  return all.filter(function (p) { return modules.indexOf(LOGIC_PARTS[p]) >= 0; });
}
function requirePart(ctx, part) {
  if (!part) return;
  if (!LOGIC_PARTS[part]) throw A.httpError(500, 'Unknown Omega Logic part');
  if (parts(ctx).indexOf(part) < 0) { var e = A.httpError(403, M.get(LOGIC_PARTS[part]).name + ' is not in your Omega Logic package'); e.reason = 'part'; throw e; }
}
/* A door that is not a member's — a bench or rig token (api/mes-scan.js,
   api/mes-test-result.js), a tenant administrator's hold or release
   (api/plant-control.js): a PACKAGED workspace must hold the part, judged
   exactly as authorize() judges a member; a legacy workspace, or one with
   no omega_orgs record yet, is left to the door's own rule (null). */
async function requirePartIfPackaged(orgId, part) {
  orgId = A.safeOrg(orgId);
  if (!orgId) throw A.httpError(400, 'Valid org required');
  var root = A.db().collection('omega_orgs').doc(orgId);
  var rows = await Promise.all([root.get(), root.collection('billing').doc('current').get()]);
  var billing = rows[1].exists ? rows[1].data() || {} : {};
  if (billing.packaged !== true) return null;
  var ctx = { orgId: orgId, org: rows[0].exists ? rows[0].data() || {} : {}, billing: billing, config: {}, member: null };
  if (!subscribed(ctx)) { var ie = A.httpError(403, 'Omega Logic subscription is not active'); ie.reason = 'inactive'; throw ie; }
  requirePart(ctx, part);
  return ctx;
}
function enabled(ctx) { return subscribed(ctx) && ctx.config.enabled === true; }
/* The context also carries the caller's standing in the workspace as
   `member` ({ role, status } off omega_orgs/{org}/members/{uid}; null for
   the ClearSky owner, who is nobody's member). */
async function authorize(c, org, write, part) {
  if (!c.claims.email_verified) throw A.httpError(403, 'Verify your email first');
  var ctx = await context(org);
  ctx.member = null;
  if (owner(c)) return ctx;
  if (!(await A.canActInOrg(c, ctx.orgId)) || c.staff) throw A.httpError(403, 'Not your OEM workspace');
  var m = await A.db().doc('omega_orgs/' + ctx.orgId + '/members/' + c.uid).get();
  var d = m.exists ? m.data() : {};
  if (d.status === 'disabled' || !d.role || (write && ['owner', 'admin'].indexOf(d.role) < 0)) throw A.httpError(403, 'An active OEM ' + (write ? 'administrator' : 'member') + ' is required');
  if (!subscribed(ctx)) { var ie = A.httpError(403, 'Omega Logic subscription is not active'); ie.reason = 'inactive'; throw ie; }
  requirePart(ctx, part);
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
module.exports = { owner: owner, requireOwner: requireOwner, context: context, subscribed: subscribed, enabled: enabled, authorize: authorize, parts: parts, requirePart: requirePart, requirePartIfPackaged: requirePartIfPackaged, LOGIC_PARTS: LOGIC_PARTS,
  officeAdmin: officeAdmin, access: access, requirePricer: requirePricer };
