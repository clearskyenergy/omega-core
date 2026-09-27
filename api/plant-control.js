/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/plant-control — human quality hold and release decisions
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   A scanner and a test rig can only advance the happy path. This endpoint is
   the deliberately smaller human exception: place a quality hold or release
   an existing hold after disposition. It cannot move a unit, skip a station,
   ship goods or edit its trace. Every action is appended to plant_scans.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var A = require('./_lib/admin');
var X = require('./_lib/logic-access');
var P = require('./_lib/plant');

function clean(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || 240);
}
function controlId(value) {
  var id = clean(value, 64);
  if (!/^[A-Za-z0-9._:-]{8,64}$/.test(id)) throw A.httpError(400, 'actionId must be 8–64 safe characters');
  return id;
}
function ncrOf(value) {
  var ncr = clean(value, 80).toUpperCase();
  if (ncr && !/^[A-Z0-9._-]+$/.test(ncr)) throw A.httpError(400, 'ncr contains unsupported characters');
  return ncr;
}

/* Who may hold and release: a tenant administrator (A.isTenantAdmin), and
   also an administrator from another company acting in this workspace on
   its cross-org grant (org_members) — the same people the plant pages show
   the controls to (api/logic-plant.js controls()). */
function mayControl(db, caller, org) {
  return A.isTenantAdmin(caller, org).then(function (ok) {
    if (ok || caller.staff || caller.orgId === org || !caller.uid) return ok;
    return A.canActInOrg(caller, org).then(function (can) {
      if (!can) return false;
      return db.collection('omega_orgs').doc(org).collection('members').doc(String(caller.uid)).get().then(function (s) {
        var d = s.exists ? s.data() || {} : {};
        return d.status !== 'disabled' && (d.role === 'owner' || d.role === 'admin');
      });
    });
  });
}

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var body = req.body || {};
  var action = clean(body.action, 20).toLowerCase();
  if (action !== 'hold' && action !== 'release') throw A.httpError(400, 'action must be hold or release');
  var serial = P.serialFrom(body.serial);
  if (!serial) throw A.httpError(400, 'serial is unreadable');
  var id = controlId(body.actionId);

  return A.authenticate(req).then(function (caller) {
    var db = A.db(), FV = A.FieldValue();
    /* Units are keyed by org+serial. We do not accept an org from the browser
       unless it is shape-checked and authorised after the unit is found. */
    var org = A.safeOrg(body.orgId || caller.orgId || '');
    if (!org) throw A.httpError(400, 'a valid orgId is required');
    var unitRef = db.collection('plant_units').doc(org + '__' + serial);
    return unitRef.get().then(function (first) {
      if (!first.exists) throw A.httpError(404, 'unit not found');
      var firstUnit = first.data() || {};
      return mayControl(db, caller, firstUnit.orgId).then(function (admin) {
        if (!admin) throw A.httpError(403, 'Only a tenant administrator may control a quality hold.');
        /* Phase 9: a hold or release is the Plant part's (a packaged workspace must hold it) */
        return X.requirePartIfPackaged(firstUnit.orgId, 'plant');
      }).then(function () {
        var scanRef = db.collection('plant_scans').doc(org + '__control_' + id);
        return db.runTransaction(function (tx) {
          return Promise.all([tx.get(unitRef), tx.get(scanRef)]).then(function (rows) {
            var unitSnap = rows[0], old = rows[1];
            if (!unitSnap.exists) throw A.httpError(404, 'unit not found');
            var unit = unitSnap.data() || {};
            if (old.exists) {
              if (old.data().serial !== serial || (old.data().control || {}).action !== action) throw A.httpError(409, 'Action identifier belongs to a different quality event');
              return { ok: true, duplicate: true, unit: { serial: serial, at: unit.at || '', hold: unit.hold || null, ncr: unit.ncr || null } };
            }
            var reason = clean(body.reason, 500);
            var now = new Date().toISOString();
            var ncr = ncrOf(body.ncr) || unit.ncr || ('NCR-' + Date.now().toString(36).toUpperCase());
            var patch, what;
            if (action === 'hold') {
              if (!reason) throw A.httpError(400, 'reason is required to place a hold');
              patch = { hold: reason, ncr: ncr, holdAt: now, holdBy: caller.email, updatedAt: FV.serverTimestamp() };
              what = 'hold placed';
            } else {
              if (!unit.hold) throw A.httpError(409, 'unit is not on hold');
              if (!reason) throw A.httpError(400, 'disposition is required to release a hold');
              patch = { hold: null, ncr: null, lastNcr: ncr, holdReleasedAt: now, holdReleasedBy: caller.email, holdDisposition: reason, updatedAt: FV.serverTimestamp() };
              what = 'hold released';
            }
            tx.update(unitRef, patch);
            tx.set(scanRef, {
              orgId: unit.orgId, scanId: 'control_' + id, serial: serial, woId: unit.woId || null,
              control: { action: action, reason: reason, ncr: ncr, by: caller.email, at: now },
              verdict: { ok: true, action: action, say: what }, ok: true,
              createdAt: FV.serverTimestamp()
            });
            return { ok: true, unit: { serial: serial, at: unit.at || '', hold: patch.hold, ncr: action === 'release' ? null : ncr }, action: action };
          });
        });
      });
    });
  });
});
