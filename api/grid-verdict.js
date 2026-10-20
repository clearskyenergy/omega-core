/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   POST /api/grid-verdict {unit:{kw,kwh,name}, substation:{name,kv,km},
                           circuit:{utility,id,substation,publishedKw,queuedKw,
                                    addressResolved,grain}}
   Site Map's Grid panel: the browser sends what the map and the Guided
   Build already know and renders the answer — the substation's chip and
   Fits / Fits only smaller / Needs a study (api/_lib/grid-verdict.js). A
   signed-in member of a workspace, or staff, holding a module that carries
   Grid Atlas (the same set /api/grid-atlas asks). */
'use strict';
var A = require('./_lib/admin'), GV = require('./_lib/grid-verdict');
var MODULES = ['gridatlas', 'siteintel', 'sitefinder', 'compute'];
module.exports = A.handler(function (req, res) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  return A.authenticate(req).then(function (caller) {
    if (!caller || !(caller.orgId || caller.staff)) throw A.httpError(403, 'A workspace sign-in is required');
    return require('./_lib/package-access').withCaller(caller, MODULES, { produce: false }).then(function () {
      var b = req.body && typeof req.body === 'object' ? req.body : {};
      res.setHeader('Cache-Control', 'no-store');
      return GV.judge({ unit: b.unit, substation: b.substation, circuit: b.circuit });
    });
  });
});
