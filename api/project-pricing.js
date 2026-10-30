/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   POST /api/project-pricing — the preview price book (api/_lib/pricing.js).
   A signed-in member of a workspace, or staff. Unless the body asks for
   the preview, the answer names the version and returns no library
   dollars. The live Site Map and Prime engines are separate doors. */
'use strict';
var A = require('./_lib/admin');
var P = require('./_lib/pricing');

var wrapped = A.handler(function (req, res) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  return A.authenticate(req).then(function (caller) {
    if (!caller || !(caller.orgId || caller.staff)) throw A.httpError(403, 'A workspace sign-in is required');
    var q = req.body && typeof req.body === 'object' ? req.body : {};
    var size = 0;
    try { size = JSON.stringify(q).length; }
    catch (e) { throw A.httpError(400, 'The estimate body is not JSON'); }
    if (size > 200000) throw A.httpError(413, 'Too much for one estimate');
    res.setHeader('Cache-Control', 'no-store');
    return P.answer(q);
  });
});
wrapped.respond = P.answer;
module.exports = wrapped;
