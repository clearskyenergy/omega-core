/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/mes-test-result — signed EOL-test evidence from a machine bench
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   A human scanner can report that a unit arrived at a bench. It cannot report
   an EOL pass — the test rig does that, using a station token flagged
   `machine:true`. Passes advance to EOL. Failures keep the unit at its prior
   station, put it on hold, and preserve the readings and failure code in the
   same immutable plant_scans ledger as every other factory event.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var A = require('./_lib/admin');
var P = require('./_lib/plant');
var S = require('./_lib/plant-station');

var PER_MINUTE = 120;
var buckets = {};
function rateLimit(id) {
  var now = Date.now(), bucket = buckets[id];
  if (!bucket || now - bucket.start > 60000) { buckets[id] = { start: now, n: 1 }; return true; }
  bucket.n++;
  return bucket.n <= PER_MINUTE;
}
function resultOf(raw) {
  var v = String(raw == null ? '' : raw).trim().toLowerCase();
  if (v === 'pass') return true;
  if (v === 'fail') return false;
  throw A.httpError(400, 'result must be pass or fail');
}
function codeOf(raw, name, required) {
  var code = S.clean(raw, 100).toUpperCase();
  if (required && !code) throw A.httpError(400, name + ' is required for a failed test');
  if (code && !/^[A-Z0-9._-]+$/.test(code)) throw A.httpError(400, name + ' contains unsupported characters');
  return code || null;
}

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var body = req.body || {};
  var stationId = S.stationIdOf(body.stationId);
  var token = S.tokenOf(body.token);
  var scanId = S.clean(body.scanId, 64);
  var serial = P.serialFrom(body.serial);
  if (!stationId || !token) throw A.httpError(401, 'this test rig is not paired');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(scanId)) throw A.httpError(400, 'Valid scanId required');
  if (!serial) throw A.httpError(400, 'serial is unreadable');
  if (!rateLimit(stationId)) throw A.httpError(429, 'too many results from this test rig');
  var passed = resultOf(body.result);
  var measurements;
  try { measurements = P.measurementsOf(body.measurements); }
  catch (e) { throw A.httpError(400, e.message || 'Invalid measurements'); }
  var failureCode = codeOf(body.failureCode, 'failureCode', !passed);
  var ncr = codeOf(body.ncr, 'ncr', false);

  var db = A.db(), FV = A.FieldValue();
  return S.verify(db, stationId, token).then(function (checked) {
    var stationRef = checked.ref, station = checked.data || {};
    var orgId = String(station.orgId || '').toLowerCase();
    var stationKey = String(station.station || '').toLowerCase();
    if (station.machine !== true || P.MACHINE_STATIONS.indexOf(stationKey) < 0) {
      throw A.httpError(403, 'this paired station is not authorised to submit machine test results');
    }
    var scanRef = db.collection('plant_scans').doc(orgId + '__' + scanId);
    return db.runTransaction(function (tx) {
      return tx.get(scanRef).then(function (prior) {
        if (prior.exists) {
          var old = prior.data() || {};
          if (old.serial !== serial || old.stationId !== stationId) throw A.httpError(409, 'Test identifier already belongs to another event');
          if (old.test && (old.test.result !== (passed ? 'pass' : 'fail') ||
              JSON.stringify(Object.keys(old.test.measurements || {}).sort().map(function (k) { return [k, old.test.measurements[k]]; })) !==
              JSON.stringify(Object.keys(measurements).sort().map(function (k) { return [k, measurements[k]]; })))) {
            throw A.httpError(409, 'Test identifier was reused for different evidence; submit a new test event ID');
          }
          return { replayed: true, verdict: old.verdict || { ok: true, action: 'duplicate', say: 'Already recorded.' }, test: old.test || null };
        }
        var unitRef = db.collection('plant_units').doc(orgId + '__' + serial);
        return tx.get(unitRef).then(function (unitSnap) {
          var unit = unitSnap.exists ? unitSnap.data() : null;
          if (unit && String(unit.orgId || '').toLowerCase() !== orgId) unit = null;
          var worksOrderRead = unit && unit.woId
            ? tx.get(db.collection('plant_works_orders').doc(unit.woId)) : Promise.resolve(null);
          return Promise.resolve(worksOrderRead).then(async function (woSnap) {
            var workOrder = woSnap && woSnap.exists ? woSnap.data() : null;
            var routing = P.routingOf(workOrder);
            var verdict = P.judgeMachineResult(unit, stationKey, routing, { pass: passed });
            var currentStation = await tx.get(stationRef);
            if (!currentStation.exists || currentStation.data().active === false || currentStation.data().tokenHash !== station.tokenHash) throw A.httpError(403, 'Station credential revoked');
            var liveStation=currentStation.data();
            if(workOrder&&workOrder.lineId&&workOrder.lineId!==liveStation.lineId)verdict={ok:false,reason:'wrong_line',say:'Assign this station to the work order’s line before testing. Contact the plant manager.'};
            if (unit && unit.orderId) {
              var commercial = await tx.get(db.collection('orders').doc(unit.orderId));
              if (!commercial.exists || commercial.data().cancelRequested || (commercial.data().logic || {}).paymentException || ['cancelled', 'shipped', 'complete'].indexOf(commercial.data().status) >= 0) {
                verdict = { ok: false, reason: 'order_blocked', say: 'This order is stopped or already shipped. Contact the office.' };
              }
            }
            var at = new Date().toISOString();
            var test = {
              station: stationKey,
              result: passed ? 'pass' : 'fail',
              measurements: measurements,
              failureCode: failureCode,
              ncr: ncr,
              program: S.clean(body.program, 100) || null,
              fixture: S.clean(body.fixture, 100) || null,
              context:{lineId:liveStation.lineId||'',location:liveStation.location||'',stationRevision:liveStation.revision||0,flowVersion:workOrder&&workOrder.flowVersion||0},
              at: at
            };
            /* The event is written even for a refusal. A machine repeatedly
               posting an out-of-sequence result is a calibration/integration
               fault, and suppressing it makes that failure invisible. */
            tx.set(scanRef, {
              orgId: orgId, scanId: scanId, stationId: stationId, station: stationKey,
              serial: serial, woId: (unit && unit.woId) || null,
              machine: true, test: test, verdict: verdict, ok: !!verdict.ok,
              clientAt: S.clean(body.at, 40) || null, createdAt: FV.serverTimestamp()
            });
            var patch = P.applyMachineResult(unit, verdict, at, test);
            if (patch) {
              patch.updatedAt = FV.serverTimestamp();
              patch.lastStationId = stationId;
              tx.update(unitRef, patch);
            }
            tx.update(stationRef, { lastSeenAt: FV.serverTimestamp(), lastSerial: serial });
            return { replayed: false, verdict: verdict, test: test,
              unit: unit ? { serial: serial, wo: unit.woId || null, at: patch ? patch.at || String(unit.at || '') : String(unit.at || ''), hold: patch ? patch.hold || null : unit.hold || null } : null };
          });
        });
      });
    }).then(function (out) {
      var verdict = out.verdict || {};
      return { ok: !!verdict.ok, action: verdict.action || null, reason: verdict.reason || null,
        say: verdict.say || '', serial: serial, station: stationKey, replayed: !!out.replayed,
        unit: out.unit || null, test: out.test || null };
    });
  });
});
