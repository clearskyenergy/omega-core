/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * GET /api/editor-v2-3d-config — whether the optional 3D upgrades are on.
 * Names are not returned. Values are not returned. Two booleans.
 */
'use strict';

function publicStatus(env) {
  env = env || {};
  var key = env.GOOGLE_MAP_TILES_API_KEY;
  return {
    photorealistic: !!(key && String(key).trim()),
    ionTerrain: false
  };
}

var A = require('./_lib/admin'), X = require('./_lib/package-access');
module.exports = A.handler(function (req, res) {
  if (req.method !== 'GET') throw A.httpError(405, 'GET only');
  return A.authenticate(req).then(function(caller){
    if (!caller || !(caller.orgId || caller.staff)) throw A.httpError(403,'Workspace sign-in required');
    return X.withCaller(caller,'lite',{produce:false}).then(function(){
      res.setHeader('Cache-Control','private, no-store');return publicStatus(process.env);
    });
  });
});

module.exports.publicStatus = publicStatus;
