/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A = require('./_lib/admin'), X = require('./_lib/package-access'), price = require('./_lib/editor-v2-component-cost');
module.exports = A.handler(function (req, res) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  return A.authenticate(req).then(function (caller) {
    if (!caller || !(caller.orgId || caller.staff)) throw A.httpError(403, 'A workspace sign-in is required');
    return X.withCaller(caller, 'estimate').then(function () {
      res.setHeader('Cache-Control', 'no-store');
      try { return price(req.body); } catch (e) { throw A.httpError(400, 'Invalid component quantities'); }
    });
  });
});
