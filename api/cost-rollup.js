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
module.exports = A.handler(function (req, res) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  return A.authenticate(req).then(function (caller) {
    if (!caller || !(caller.orgId || caller.staff)) throw A.httpError(403, 'A workspace sign-in is required');
    var q = req.body && typeof req.body === 'object' ? req.body : {};
    if (EC.size(q) > EC.MAX_ITEMS) throw A.httpError(413, 'Too many items for one estimate');
    /* whose workspace is pricing: a vendor's own workspace prices its own
       products at its rate (NextNRG, api/_lib/nextnrg.js SYSTEM_RATE); the
       body never says who */
    q.vendorOrg = caller.orgId || null;
    res.setHeader('Cache-Control', 'no-store');
    return EC.rollup(q);
  });
});
