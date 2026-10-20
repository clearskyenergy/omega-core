/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   GET /api/utility-rates?zip=60601  (or ?state=IL)
   GET /api/utility-rates?eia=963&zip=08401  (or ?utility=ace&zip=08401)
   The serving utility and its planning-grade rates for ONE place, from the
   rate book in api/_lib/utility-rates.js. A signed-in member of a workspace
   (or staff) may ask; the answer is one record, never the table and never
   the ZIP prefixes a utility covers. The editor caches it per ZIP prefix.
   Cached privately for a day: the book changes by release, not by minute.

   2026-10-17: the circuit step now names the serving utility at the point
   (POST /api/hosting-capacity → utility.eiaId / utility.key), and the Load
   step passes it here, so Atlantic City reads Atlantic City Electric and
   New Haven reads UI instead of whatever the ZIP prefix's first claim was.
   The utility's name comes from the hosting registry (one list), or, for a
   co-op or city the registry knows only as a group, the `name` the
   territory answer carried. An id this cannot name falls back to the ZIP. */
'use strict';
var A = require('./_lib/admin'), U = require('./_lib/utility-rates');
module.exports = A.handler(function (req, res) {
  if (req.method !== 'GET') throw A.httpError(405, 'GET only');
  return A.authenticate(req).then(function (caller) {
    if (!caller || !(caller.orgId || caller.staff)) throw A.httpError(403, 'A workspace sign-in is required');
    var q = req.query || {}, zip = String(q.zip || '').replace(/\D/g, '').slice(0, 5), state = String(q.state || '').replace(/[^A-Za-z]/g, '').slice(0, 2);
    var eia = String(q.eia || '').replace(/\D/g, '').slice(0, 8), key = String(q.utility || '').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 40);
    var rec = null;
    if (eia || key) {
      var HS = require('./_lib/hosting-sources');
      var e = key ? HS.byKey(key) : HS.byEia(eia);
      if (!eia && e && e.eiaIds && e.eiaIds.length) eia = e.eiaIds[0];
      var named = String(q.name || '').replace(/[^\w &.,'()\/-]/g, '').trim().slice(0, 80);
      var display = e && e.type !== 'group' ? e.display : named;
      var st = e && e.states && e.states.length === 1 ? e.states[0] : (zip.length >= 3 ? U.stateForZip(zip) : state.toUpperCase());
      rec = U.byEia(eia, { display: display, state: st, zip: zip });
    }
    if (!rec) rec = zip.length >= 3 ? U.lookup(zip) : (state ? U.fromState(state) : U.lookup(''));
    if (!rec) throw A.httpError(404, 'No utility on file for ' + (state || zip));
    res.setHeader('Cache-Control', 'private, max-age=86400');
    return rec;
  });
});
