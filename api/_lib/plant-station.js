/* Shared station-token verification for plant scanners and test rigs.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';

var crypto = require('crypto');
var A = require('./admin');

function clean(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max || 120);
}
function stationIdOf(value) { return clean(value, 120); }
function tokenOf(value) { return clean(value, 200); }
function sha(value) { return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex'); }

/* The comparison is deliberately timing-safe. The token is a device secret,
   but this endpoint is internet-facing; making a bad token faster to reject
   than a nearly-correct one is an avoidable oracle. */
function verify(db, stationId, token) {
  if (!stationId || !token) return Promise.reject(A.httpError(401, 'this scanner is not paired'));
  var ref = db.collection('plant_stations').doc(stationId);
  return ref.get().then(function (snap) {
    if (!snap.exists) throw A.httpError(401, 'unknown scanner');
    var station = snap.data() || {};
    if (station.active === false) throw A.httpError(403, 'this scanner has been deactivated');
    var want = Buffer.from(String(station.tokenHash || ''), 'utf8');
    var got = Buffer.from(sha(token), 'utf8');
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) {
      throw A.httpError(401, 'this scanner is not paired');
    }
    return { ref: ref, id: stationId, data: station };
  });
}

module.exports = { clean: clean, stationIdOf: stationIdOf, tokenOf: tokenOf, sha: sha, verify: verify };
