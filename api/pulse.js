/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   GET /api/pulse — the Omega pulse for the workspace home: what the whole
   platform did this week, counts only. Any signed-in member of any
   workspace may read it; nothing in the answer names a company, a person
   or a project (api/_lib/pulse.js is the pure part and the tested one).
   Reads the most recent rows, capped, and hands them to the library; a
   failed read counts as nothing rather than failing the page. Cached for
   five minutes per caller. */
'use strict';
var A = require('./_lib/admin'), P = require('./_lib/pulse');
var CAP = 500;
function soft(p) { return p.then(function (s) { var out = []; s.forEach(function (d) { out.push(d.data() || {}); }); return out; }, function () { return []; }); }
module.exports = A.handler(function (req, res) {
  if (req.method !== 'GET') throw A.httpError(405, 'GET only');
  return A.authenticate(req).then(function (caller) {
    if (!caller || !(caller.orgId || caller.staff)) throw A.httpError(403, 'A workspace sign-in is required');
    var db = A.db();
    return Promise.all([
      soft(db.collection('projects').orderBy('updatedAt', 'desc').limit(CAP).select('updatedAt', 'stage', 'bessKwh', 'bessKw', 'orgId').get()),
      soft(db.collection('rfqs').orderBy('createdAt', 'desc').limit(CAP).select('createdAt').get()),
      soft(db.collection('team_members').orderBy('lastSeen', 'desc').limit(CAP).select('lastSeen').get())
    ]).then(function (r) {
      res.setHeader('Cache-Control', 'private, max-age=300');
      return P.build({ projects: r[0], rfqs: r[1], members: r[2] }, Date.now(), { projects: CAP, rfqs: CAP, members: CAP });
    });
  });
});
