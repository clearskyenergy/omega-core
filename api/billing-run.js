/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A = require('./_lib/admin'), Runner = require('./_lib/package-billing-runner');
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') throw A.httpError(405, 'GET only');
  Runner.authorize(req);
  return Runner.tick(A.db(), Date.now(), { limit: 5 });
});
