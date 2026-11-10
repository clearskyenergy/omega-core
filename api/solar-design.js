/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   GET  /api/solar-design   nameplates only
   POST /api/solar-design   layout, shade, strings, hourly energy, price
   The numbers come from api/_lib/solar-design.js. A signed-in member
   of a workspace that holds Omega Maximus, or staff, may run a design. */
'use strict';
var A = require('./_lib/admin');
var E = require('./_lib/embed');
var S = require('./_lib/solar-design');

module.exports = A.handler(function (req, res) {
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return { version: S.VERSION, catalog: S.catalog() };
  }
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  return A.authenticate(req).then(function (caller) {
    if (!caller || !(caller.orgId || caller.staff)) throw A.httpError(403, 'Sign in to run a solar design.');
    E.rateLimit('solar-design:' + (caller.uid || caller.email || caller.orgId), 20);
    return require('./_lib/package-access').withModuleAnyPlan(caller, 'maximus').then(function () { return design(req, res); });
  });
});
/* The design itself, once the caller may have it. */
function design(req, res) {
  var b = req.body && typeof req.body === 'object' ? req.body : {};
  var size = 0;
  try { size = JSON.stringify(b).length; } catch (e) { size = 0; }
  if (size > 400000) throw A.httpError(413, 'This site is too large to design in one request.');
  res.setHeader('Cache-Control', 'no-store');
  return S.design(b);
}
