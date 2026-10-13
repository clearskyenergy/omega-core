/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   GET /api/utility-rates?zip=60601  (or ?state=IL)
   The serving utility and its planning-grade rates for ONE place, from the
   rate book in api/_lib/utility-rates.js. A signed-in member of a workspace
   (or staff) may ask; the answer is one record, never the table and never
   the ZIP prefixes a utility covers. The editor caches it per ZIP prefix.
   Cached privately for a day: the book changes by release, not by minute. */
'use strict';
var A = require('./_lib/admin'), U = require('./_lib/utility-rates');
module.exports = A.handler(function (req, res) {
  if (req.method !== 'GET') throw A.httpError(405, 'GET only');
  return A.authenticate(req).then(function (caller) {
    if (!caller || !(caller.orgId || caller.staff)) throw A.httpError(403, 'A workspace sign-in is required');
    var q = req.query || {}, zip = String(q.zip || '').replace(/\D/g, '').slice(0, 5), state = String(q.state || '').replace(/[^A-Za-z]/g, '').slice(0, 2);
    var rec = zip.length >= 3 ? U.lookup(zip) : (state ? U.fromState(state) : U.lookup(''));
    if (!rec) throw A.httpError(404, 'No utility on file for ' + (state || zip));
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return rec;
  });
});
