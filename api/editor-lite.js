/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A = require('./_lib/admin'), X = require('./_lib/logic-access');
var MODULES = ['bess', 'compute', 'ev', 'solar'];
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET' && req.method !== 'POST') throw A.httpError(405, 'GET or POST only');
  var caller = await A.authenticate(req), b = req.body || {};
  var org = A.safeOrg(req.method === 'GET' ? req.query.org || caller.orgId : b.org || caller.orgId);
  var ctx = await X.authorize(caller, org, false), lite = ctx.billing.editorLite || {};
  // Preview can inspect branding, but cannot turn on unlicensed modules.
  if (!X.subscribed(ctx) || lite.enabled !== true) throw A.httpError(403, 'Editor Lite is not enabled for this account');
  var modules = MODULES.filter(function (m) { return Array.isArray(lite.modules) && lite.modules.indexOf(m) >= 0; });
  if (req.method === 'POST') {
    if (modules.indexOf(b.module) < 0) throw A.httpError(403, 'This editor module is not included in this account');
    var kw = Number(b.kw), hours = Number(b.hours);
    if (!isFinite(kw) || kw <= 0 || kw > 10000000) throw A.httpError(400, 'Target must be greater than zero and no more than 10 GW');
    if (b.module === 'bess' && (!isFinite(hours) || hours <= 0 || hours > 48)) throw A.httpError(400, 'Storage duration must be greater than zero and no more than 48 hours');
    return { module: b.module, kw: kw, kwh: b.module === 'bess' ? kw * hours : null, conceptOnly: true };
  }
  return { org: org, name: ctx.org.name || org, logoUrl: ctx.org.logoUrl || null, modules: modules,
    preview: caller.orgId !== org, projectOrg: caller.orgId,
    note: 'Concept design. Review actual equipment, clearances, electrical design and pricing before ordering.' };
});
