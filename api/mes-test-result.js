/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/mes-test-result — test evidence at a test station: the rig's
   result, or a supervisor's hand-recorded one
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   A human scanner can report that a unit arrived at a bench. It cannot report
   an EOL pass — the test rig does that, using a station token flagged
   `machine:true`. Passes advance to EOL. Failures keep the unit at its prior
   station, put it on hold, and preserve the readings and failure code in the
   same immutable plant_scans ledger as every other factory event.

   ── THE RIG IS THE NORMAL WAY; A SUPERVISOR IS THE FALLBACK ──────────────
   A plant whose tester cannot post here yet would otherwise stop every unit
   at BMS & firmware. So a signed-in owner or admin of the workspace (the
   same rule every Omega Logic write runs: logic-access.authorize(write)) may
   record PASS or FAIL by hand:

     { manual: true, org, serial, station, result, note, actionId,
       failureCode?, ncr?, measurements? }

   It is stored exactly where the rig's is — unit.test and a plant_scans
   event — marked source:'manual' with who, when and the note (at least
   MANUAL_NOTE_MIN characters: what was tested and with what), and an
   omega_audit row. It is judged by the SAME rules (plant.js
   judgeMachineResult): in routing order, never past a hold, and never past
   a step still open at the bench the unit is leaving — which is the gate a
   rig's pass now meets too (openAt, plant-work.js). A bench token can never
   take this path: it needs a person's verified account.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var A = require('./_lib/admin');
var P = require('./_lib/plant');
var S = require('./_lib/plant-station');
var X = require('./_lib/logic-access');
var W = require('./_lib/plant-work');

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
function codeOf(raw, name, required, said) {
  var code = S.clean(raw, 100).toUpperCase();
  if (required && !code) throw A.httpError(400, name + ' is required for a failed test');
  if (code && !/^[A-Z0-9._-]+$/.test(code)) throw A.httpError(400, said || (name + ' contains unsupported characters'));
  return code || null;
}
/* A code a PERSON typed (the hand-recorded result): the spaces between words
   are underscores ("low insulation" is LOW_INSULATION), and a refusal says
   what a code may hold, in words, not the field's key (UX-10). */
function typedCode(raw, what, eg) {
  var v = String(raw == null ? '' : raw).trim().replace(/\s+/g, '_');
  return codeOf(v, what, false, 'The ' + what + ' may use letters, digits, dot, dash and underscore only (spaces become underscores), e.g. ' + eg);
}
function sameEvidence(a, b) {
  function flat(m) { m = m || {}; return JSON.stringify(Object.keys(m).sort().map(function (k) { return [k, m[k]]; })); }
  return flat(a) === flat(b);
}

/* ── ONE PATH FOR BOTH SOURCES ───────────────────────────────────────────
   e: { orgId, serial, scanId, stationKey, passed, measurements, failureCode,
        ncr, source: 'machine'|'manual', clientAt,
        machine: { stationId, ref, tokenHash, program, fixture }   (rig)
        manual:  { by, note }                                       (person) } */
function record(db, FV, e) {
  var scanRef = db.collection('plant_scans').doc(e.orgId + '__' + e.scanId);
  var rig = e.source === 'machine' ? e.machine : null, hand = e.source === 'manual' ? e.manual : null;
  return db.runTransaction(function (tx) {
    return tx.get(scanRef).then(function (prior) {
      if (prior.exists) {
        var old = prior.data() || {};
        if (old.serial !== e.serial || (rig && old.stationId !== rig.stationId) || (hand && (old.test || {}).source !== 'manual')) throw A.httpError(409, 'Test identifier already belongs to another event');
        if (old.test && (old.test.result !== (e.passed ? 'pass' : 'fail') || old.test.station !== e.stationKey || !sameEvidence(old.test.measurements, e.measurements))) {
          throw A.httpError(409, 'Test identifier was reused for different evidence; submit a new test event ID');
        }
        return { replayed: true, verdict: old.verdict || { ok: true, action: 'duplicate', say: 'Already recorded.' }, test: old.test || null };
      }
      var unitRef = db.collection('plant_units').doc(e.orgId + '__' + e.serial);
      return tx.get(unitRef).then(function (unitSnap) {
        var unit = unitSnap.exists ? unitSnap.data() : null;
        if (unit && String(unit.orgId || '').toLowerCase() !== e.orgId) unit = null;
        var worksOrderRead = unit && unit.woId
          ? tx.get(db.collection('plant_works_orders').doc(unit.woId)) : Promise.resolve(null);
        return Promise.resolve(worksOrderRead).then(async function (woSnap) {
          var workOrder = woSnap && woSnap.exists ? woSnap.data() : null;
          var routing = P.routingOf(workOrder);
          /* The steps still open at the bench the unit is leaving gate a
             test result exactly as they gate a scan (PLANT-03). */
          var open = [];
          if (unit && unit.at) {
            var cat = await tx.get(db.collection('omega_orgs').doc(e.orgId).collection('storefront').doc('config'));
            open = W.openAt(unit, workOrder, W.catalogIndex(cat.exists ? (cat.data() || {}).products : []));
          }
          var verdict = P.judgeMachineResult(unit, e.stationKey, routing, { pass: e.passed }, { open: open });
          var liveStation = {};
          if (rig) {
            var currentStation = await tx.get(rig.ref);
            if (!currentStation.exists || currentStation.data().active === false || currentStation.data().tokenHash !== rig.tokenHash) throw A.httpError(403, 'Station credential revoked');
            liveStation = currentStation.data();
            if (workOrder && workOrder.lineId && workOrder.lineId !== liveStation.lineId) verdict = { ok: false, reason: 'wrong_line', say: 'Assign this station to the work order’s line before testing. Contact the plant manager.' };
          }
          if (unit && unit.orderId) {
            var commercial = await tx.get(db.collection('orders').doc(unit.orderId));
            if (!commercial.exists || commercial.data().cancelRequested || (commercial.data().logic || {}).paymentException || ['cancelled', 'shipped', 'complete'].indexOf(commercial.data().status) >= 0) {
              verdict = { ok: false, reason: 'order_blocked', say: 'This order is stopped or already shipped. Contact the office.' };
            }
          }
          var at = new Date().toISOString();
          var test = {
            station: e.stationKey,
            result: e.passed ? 'pass' : 'fail',
            measurements: e.measurements,
            failureCode: e.failureCode,
            ncr: e.ncr,
            program: rig ? rig.program : null,
            fixture: rig ? rig.fixture : null,
            source: e.source,
            context: { lineId: rig ? liveStation.lineId || '' : (workOrder && workOrder.lineId) || '', location: rig ? liveStation.location || '' : '',
              stationRevision: rig ? liveStation.revision || 0 : 0, flowVersion: workOrder && workOrder.flowVersion || 0 },
            at: at
          };
          if (hand) { test.by = hand.by; test.note = hand.note; }
          /* The event is written even for a refusal. A machine repeatedly
             posting an out-of-sequence result is a calibration/integration
             fault, and suppressing it makes that failure invisible. */
          var event = {
            orgId: e.orgId, scanId: e.scanId, stationId: rig ? rig.stationId : null, station: e.stationKey,
            serial: e.serial, woId: (unit && unit.woId) || null,
            machine: !!rig, manual: !!hand, test: test, verdict: verdict, ok: !!verdict.ok,
            clientAt: e.clientAt || null, createdAt: FV.serverTimestamp()
          };
          if (hand) event.by = hand.by;
          tx.set(scanRef, event);
          var patch = P.applyMachineResult(unit, verdict, at, test);
          if (patch) {
            patch.updatedAt = FV.serverTimestamp();
            if (rig) patch.lastStationId = rig.stationId;
            tx.update(unitRef, patch);
          }
          if (rig) tx.update(rig.ref, { lastSeenAt: FV.serverTimestamp(), lastSerial: e.serial });
          if (hand) {
            /* who recorded what, and what the unit was before it */
            tx.create(db.collection('omega_audit').doc(), { orgId: e.orgId, action: 'plant-manual-test', serial: e.serial, station: e.stationKey,
              result: test.result, note: hand.note, failureCode: e.failureCode, verdict: { ok: !!verdict.ok, action: verdict.action || null, reason: verdict.reason || null },
              before: unit ? { at: unit.at || '', hold: unit.hold || null, test: unit.test ? { result: unit.test.result || null, source: unit.test.source || 'machine', at: unit.test.at || null } : null } : null,
              by: hand.by, at: at });
          }
          return { replayed: false, verdict: verdict, test: test,
            unit: unit ? { serial: e.serial, wo: unit.woId || null, at: patch ? patch.at || String(unit.at || '') : String(unit.at || ''), hold: patch ? patch.hold || null : unit.hold || null } : null };
        });
      });
    });
  }).then(function (out) {
    var verdict = out.verdict || {};
    return { ok: !!verdict.ok, action: verdict.action || null, reason: verdict.reason || null,
      say: verdict.say || '', serial: e.serial, station: e.stationKey, replayed: !!out.replayed,
      unit: out.unit || null, test: out.test || null, open: verdict.open || null };
  });
}

/* ── a supervisor, by hand ─────────────────────────────────────────────── */
function manual(req, body) {
  var org = A.safeOrg(body.org || body.orgId);
  if (!org) throw A.httpError(400, 'Valid org required');
  var serial = P.serialFrom(body.serial);
  if (!serial) throw A.httpError(400, 'serial is unreadable');
  var stationKey = S.clean(body.station, 32).toLowerCase();
  if (P.MACHINE_STATIONS.indexOf(stationKey) < 0) throw A.httpError(400, 'A result can be recorded by hand only at a test station (' + P.MACHINE_STATIONS.join(', ') + ')');
  var passed = resultOf(body.result);
  var note = String(body.note == null ? '' : body.note).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 1000);
  if (note.length < P.MANUAL_NOTE_MIN) throw A.httpError(400, 'Write what was tested and with what (at least ' + P.MANUAL_NOTE_MIN + ' characters)');
  var actionId = S.clean(body.actionId, 64);
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(actionId)) throw A.httpError(400, 'actionId must be 8–64 safe characters');
  var measurements;
  try { measurements = P.measurementsOf(body.measurements); }
  catch (err) { throw A.httpError(400, err.message || 'Invalid measurements'); }
  var failureCode = typedCode(body.failureCode, 'failure code', 'CELL_LOW'), ncr = typedCode(body.ncr, 'NCR number', 'NCR-26-89');
  return A.authenticate(req).then(function (caller) {
    /* owner or admin of this workspace, or ClearSky's owner — the rule
       every Omega Logic write already runs; a member or viewer is refused */
    return X.authorize(caller, org, true, 'plant').then(function () {
      if (!rateLimit('person:' + (caller.uid || caller.email))) throw A.httpError(429, 'too many results recorded; wait a minute');
      return record(A.db(), A.FieldValue(), { orgId: org, serial: serial, scanId: 'manual_' + actionId, stationKey: stationKey, passed: passed,
        measurements: measurements, failureCode: failureCode, ncr: ncr, source: 'manual', clientAt: S.clean(body.at, 40) || null,
        manual: { by: String(caller.email || '').toLowerCase(), note: note } });
    });
  });
}

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var body = req.body || {};
  if (body.manual === true) return manual(req, body);
  var stationId = S.stationIdOf(body.stationId);
  var token = S.tokenOf(body.token);
  var scanId = S.clean(body.scanId, 64);
  var serial = P.serialFrom(body.serial);
  if (!stationId || !token) throw A.httpError(401, 'this test rig is not paired');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(scanId)) throw A.httpError(400, 'Valid scanId required');
  if (/^manual_/.test(scanId)) throw A.httpError(400, 'That scanId is reserved for results recorded by hand');
  if (!serial) throw A.httpError(400, 'serial is unreadable');
  if (!rateLimit(stationId)) throw A.httpError(429, 'too many results from this test rig');
  var passed = resultOf(body.result);
  var measurements;
  try { measurements = P.measurementsOf(body.measurements); }
  catch (e) { throw A.httpError(400, e.message || 'Invalid measurements'); }
  var failureCode = codeOf(body.failureCode, 'failureCode', !passed);
  var ncr = codeOf(body.ncr, 'ncr', false);

  var db = A.db(), FV = A.FieldValue();
  return S.verify(db, stationId, token).then(async function (checked) {
    var station = checked.data || {};
    var orgId = String(station.orgId || '').toLowerCase();
    var stationKey = String(station.station || '').toLowerCase();
    if (station.machine !== true || P.MACHINE_STATIONS.indexOf(stationKey) < 0) {
      throw A.httpError(403, 'this paired station is not authorised to submit machine test results');
    }
    /* Phase 9: the rig is the Plant part's, like the bench */
    await X.requirePartIfPackaged(orgId, 'plant');
    return record(db, FV, { orgId: orgId, serial: serial, scanId: scanId, stationKey: stationKey, passed: passed, measurements: measurements,
      failureCode: failureCode, ncr: ncr, source: 'machine', clientAt: S.clean(body.at, 40) || null,
      machine: { stationId: stationId, ref: checked.ref, tokenHash: station.tokenHash, program: S.clean(body.program, 100) || null, fixture: S.clean(body.fixture, 100) || null } });
  });
});
