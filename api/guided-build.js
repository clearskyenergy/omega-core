/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   POST /api/guided-build { builder, input }
   The eight guided builds. The browser sends the parcel and the answers.
   The layout comes back from api/_lib/guided-build.js. A signed-in member
   of a workspace, or staff. */
'use strict';
var A = require('./_lib/admin');
var E = require('./_lib/embed');
var GB = require('./_lib/guided-build');

module.exports = A.handler(function (req, res) {
  if (req.method === 'GET') {
    res.setHeader('Cache-Control', 'no-store');
    return { version: GB.VERSION, builders: GB.list() };
  }
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  return A.authenticate(req).then(function (caller) {
    if (!caller || !(caller.orgId || caller.staff)) throw A.httpError(403, 'Sign in to place a guided build.');
    E.rateLimit('guided-build:' + (caller.uid || caller.email || caller.orgId), 40);
    var b = req.body && typeof req.body === 'object' ? req.body : {};
    var size = 0;
    try { size = JSON.stringify(b).length; } catch (e) { size = 0; }
    if (size > 400000) throw A.httpError(413, 'This site is too large to build in one request.');
    res.setHeader('Cache-Control', 'no-store');
    return GB.plan(String(b.builder || ''), b.input || {});
  });
});
