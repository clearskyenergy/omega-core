/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/mes-scan — a bench reports that a unit arrived
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Body: { stationId, token, serial, scanId, at?, gun? }

   ── THE CALLER IS A BENCH, NOT A PERSON ──────────────────────────────────
   Nobody signs in at a station. A tablet bolted to a bench cannot hold a human
   credential: it is shared, it is on all shift, and asking an operator wearing
   gloves to log in is how a floor system stops being used by Tuesday. So the
   caller we authenticate is a STATION, the same inversion api/_lib/embed.js
   makes for the public storefront.

   ── WHAT A STATION TOKEN IS WORTH, HONESTLY ──────────────────────────────
       plant_stations/{stationId}  { orgId, station, label, tokenHash, active }

   It is a bearer credential on a device sitting in a factory. It is not
   secret the way a password is: anyone who can pick up the tablet has it.
   Writing "authenticated" in a comment and moving on is how that becomes
   load-bearing. What actually holds:

     1. IT DOES EXACTLY ONE THING. Advance a unit by one station, at ITS OWN
        station, in routing order. The station key comes off the STORED
        record, never off the request — a bench cannot claim to be a different
        bench, which is the whole point of binding a scanner to a station.

     2. IT CANNOT REACH ANYTHING ELSE. No price, no customer, no order
        document, no other tenant, no release of a hold, nothing marked
        shipped. There is no endpoint that would return one.

     3. IT IS REVOCABLE AND VISIBLE. active:false kills one bench. Every scan
        is appended to plant_scans with the station that made it, so a gun
        carried to the wrong bench shows up as a station reporting units it
        should never see.

   A stolen tablet therefore buys somebody the ability to mark units present
   at one bench, in order, on a board a supervisor is watching. That is a
   proportionate worst case for a credential that has to live on a bench.

   ── IDEMPOTENT BY SCAN ID ────────────────────────────────────────────────
   Scan guns double-fire, and the bench queues scans offline and replays them
   when the wi-fi comes back. Both deliver the same scan twice. The client
   mints scanId once per trigger pull, and a replay returns the FIRST verdict
   rather than advancing the unit a second time. Without this, one dead spot
   by the roll-up door walks a unit two stations forward.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var crypto = require('crypto');
var A = require('./_lib/admin');
var P = require('./_lib/plant');

/* A bench cannot legitimately scan faster than this. Generous enough that a
   fast operator never sees it, tight enough that a loop does. */
var PER_MINUTE = 120;
var buckets = {};

function rateLimit(id) {
  var now = Date.now(), b = buckets[id];
  if (!b || now - b.start > 60000) { buckets[id] = { start: now, n: 1 }; return true; }
  b.n++;
  if (b.n > PER_MINUTE) return false;
  return true;
}

function clean(v, max) {
  return String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, max || 120);
}
function sha(v) { return crypto.createHash('sha256').update(String(v), 'utf8').digest('hex'); }

module.exports = A.handler(function (req, res) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};

  var stationId = clean(b.stationId, 120);
  var token = clean(b.token, 200);
  var scanId = clean(b.scanId, 64);
  var serial = P.serialFrom(b.serial);

  if (!stationId || !token) throw A.httpError(401, 'this scanner is not paired');
  if (!scanId) throw A.httpError(400, 'scanId required');
  if (!serial) return { ok: false, reason: 'unreadable', say: 'That code did not read as a serial. Scan the label on the frame.' };

  if (!rateLimit(stationId)) throw A.httpError(429, 'too many scans from this station');

  var db = A.db(), FV = A.FieldValue();
  var stRef = db.collection('plant_stations').doc(stationId);

  return stRef.get().then(function (ss) {
    if (!ss.exists) throw A.httpError(401, 'unknown scanner');
    var st = ss.data() || {};
    if (st.active === false) throw A.httpError(403, 'this scanner has been deactivated');
    /* Constant-time compare on the hash, so a wrong token cannot be narrowed
       down by timing the response. */
    var want = Buffer.from(String(st.tokenHash || ''), 'utf8');
    var got = Buffer.from(sha(token), 'utf8');
    if (want.length !== got.length || !crypto.timingSafeEqual(want, got)) {
      throw A.httpError(401, 'this scanner is not paired');
    }

    var orgId = String(st.orgId || '').toLowerCase();
    /* THE STATION COMES OFF THE RECORD, NEVER THE REQUEST. */
    var station = String(st.station || '');
    var scanRef = db.collection('plant_scans').doc(orgId + '__' + scanId);

    return db.runTransaction(function (tx) {
      return tx.get(scanRef).then(function (prev) {
        if (prev.exists) {
          /* A replay. Hand back what we decided the first time. */
          var p = prev.data() || {};
          return { replayed: true, verdict: p.verdict || { ok: true, action: 'duplicate', say: 'Already recorded.' } };
        }
        var uRef = db.collection('plant_units').doc(orgId + '__' + serial);
        return tx.get(uRef).then(function (us) {
          var unit = us.exists ? us.data() : null;
          if (unit && String(unit.orgId || '').toLowerCase() !== orgId) unit = null;

          var woP = unit && unit.woId
            ? tx.get(db.collection('plant_works_orders').doc(unit.woId))
            : Promise.resolve(null);

          return Promise.resolve(woP).then(function (wos) {
            var wo = wos && wos.exists ? wos.data() : null;
            var routing = P.routingOf(wo);
            var verdict = P.judgeScan(unit, station, routing);
            var now = new Date().toISOString();

            /* Every scan is recorded, including the refused ones. A bench that
               keeps refusing is the signal that a label is damaged or a unit
               skipped a step, and it is invisible if only successes are kept. */
            tx.set(scanRef, {
              orgId: orgId, scanId: scanId, stationId: stationId, station: station,
              serial: serial, woId: (unit && unit.woId) || null,
              gun: clean(b.gun, 40) || null,
              at: now, clientAt: clean(b.at, 40) || null,
              verdict: verdict, ok: !!verdict.ok,
              createdAt: FV.serverTimestamp()
            });

            var patch = P.applyScan(unit, verdict, now);
            if (patch) {
              patch.updatedAt = FV.serverTimestamp();
              patch.lastStationId = stationId;
              tx.update(uRef, patch);
            }
            tx.update(stRef, { lastSeenAt: FV.serverTimestamp(), lastSerial: serial });

            return {
              replayed: false, verdict: verdict,
              unit: unit ? { serial: serial, wo: unit.woId || null, at: patch ? patch.at : String(unit.at || '') } : null,
              routing: routing.map(function (s) { return { key: s.key, label: s.label }; })
            };
          });
        });
      });
    }).then(function (out) {
      var v = out.verdict;
      return {
        ok: !!v.ok, action: v.action || null, reason: v.reason || null, say: v.say || '',
        serial: serial, station: station, stationLabel: String(st.label || station),
        replayed: !!out.replayed, unit: out.unit || null, routing: out.routing || null
      };
    });
  });
});
