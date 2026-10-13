/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   POST /api/cost-rollup — Site Map's Run, costed on the server. The page
   sends what is placed and what the cost sheet says (quantities, counts,
   feet, the sheet's typed figures, the compute entries) and gets back the
   lines and totals it draws (api/_lib/editor-cost.js). A signed-in member
   of a workspace, or staff; the benchmark book, the vendor price book and
   the roll-up rules never leave this side. The body is capped: a drawing
   is a few thousand quantities, never more. */
'use strict';
var A = require('./_lib/admin'), EC = require('./_lib/editor-cost');
var MAX_ITEMS = 5000;
function count(q) {
  var c = 0;
  c += Object.keys((q.fleet && q.fleet.byModel) || {}).length + ((q.configured || []).length) + ((q.ev && q.ev.items) || []).length + ((q.gen || []).length);
  return c;
}
module.exports = A.handler(function (req, res) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  return A.authenticate(req).then(function (caller) {
    if (!caller || !(caller.orgId || caller.staff)) throw A.httpError(403, 'A workspace sign-in is required');
    var q = req.body && typeof req.body === 'object' ? req.body : {};
    if (count(q) > MAX_ITEMS) throw A.httpError(413, 'Too many items for one estimate');
    res.setHeader('Cache-Control', 'no-store');
    return EC.rollup(q);
  });
});
