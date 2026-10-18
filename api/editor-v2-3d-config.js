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

module.exports = function (req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('GET only');
    return;
  }
  var body = publicStatus(process.env);
  res.statusCode = 200;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(JSON.stringify(body));
};

module.exports.publicStatus = publicStatus;
