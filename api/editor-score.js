/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   POST /api/editor-score {action:'prequal'|'interconnect'|'viability', ...facts}
   Site Map's screening scorers (api/_lib/editor-score.js): the page sends
   the facts it has — areas, parking, parcels, the ZIP, what Grid Atlas and
   the drawing say — and gets the score, the tier and the factors as it
   prints them. A signed-in member of a workspace, or staff. The weights,
   curves and thresholds stay on this side. */
'use strict';
var A = require('./_lib/admin'), ES = require('./_lib/editor-score');
module.exports = A.handler(function (req, res) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  return A.authenticate(req).then(function (caller) {
    if (!caller || !(caller.orgId || caller.staff)) throw A.httpError(403, 'A workspace sign-in is required');
    var b = req.body && typeof req.body === 'object' ? req.body : {};
    res.setHeader('Cache-Control', 'no-store');
    if (b.action === 'prequal') return ES.prequal(b);
    if (b.action === 'interconnect') return ES.interconnect(b);
    if (b.action === 'viability') return ES.viability(b);
    throw A.httpError(400, 'Unknown action');
  });
});
