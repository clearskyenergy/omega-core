/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   POST /api/prime-fit { unit:{lFt,wFt}, area:{wFt,hFt} }
   The pad check for Omega Prime v2. The browser sends the rectangle it
   measured and draws what comes back (api/_lib/prime-fit.js). Same sign-in
   as the grid verdict: a workspace member holding Grid Atlas, Site Finder,
   site intel, or Compute. */
'use strict';
var A = require('./_lib/admin');
var Fit = require('./_lib/prime-fit');
var MODULES = ['gridatlas', 'siteintel', 'sitefinder', 'compute'];

module.exports = A.handler(function (req, res) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  return A.authenticate(req).then(function (caller) {
    if (!caller || !(caller.orgId || caller.staff)) throw A.httpError(403, 'A workspace sign-in is required');
    return require('./_lib/package-access').withCaller(caller, MODULES, { produce: false }).then(function () {
      var b = req.body && typeof req.body === 'object' ? req.body : {};
      var out;
      try { out = Fit.fit(b); }
      catch (e) { throw A.httpError(e.status || 400, e.message); }
      res.setHeader('Cache-Control', 'no-store');
      return out;
    });
  });
});
