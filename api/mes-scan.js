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
var A = require('./_lib/admin');
var P = require('./_lib/plant');
var S = require('./_lib/plant-station');
var W = require('./_lib/plant-work');

/* The product list is the one place a bench's steps are written down
   (plant-work.js). One document read per scan; a plant with no stations on
   its bills gets an empty index and behaves exactly as before. */
function catalogIndex(snap) {
  var by = {}, rows = snap && snap.exists ? (snap.data() || {}).products || [] : [];
  rows.forEach(function (p) { if (p && p.sku && ['__proto__', 'constructor', 'prototype'].indexOf(String(p.sku)) < 0) by[p.sku] = p; });
  return by;
}
function catalogRef(db, orgId) { return db.collection('omega_orgs').doc(orgId).collection('storefront').doc('config'); }
function stockRef(db, orgId) { return db.collection('omega_orgs').doc(orgId).collection('fulfillment').doc('materials'); }
function safeKey(k) { return ['__proto__', 'constructor', 'prototype'].indexOf(k) < 0; }
/* Check-only steps live on the works order's copy of the routing. */
function checksOf(wo, station) { var s = (wo && wo.routing || []).filter(function (x) { return x && x.key === station; })[0]; return s && Array.isArray(s.checks) ? s.checks : []; }

/* ── ISSUE A PART / CONFIRM A STEP ────────────────────────────────────────
   Body: { stationId, token, scanId, serial, action: 'issue', code, qty?, lot? }
         { stationId, token, scanId, serial, action: 'step-done', stepId }

   Same credential, same idempotency, same append-only log as a scan. What it
   moves: the quantity for THIS unit comes off fulfillment/materials
   stock[sku].onHand and onto the unit's work record and the works order's
   issued totals, so the materials plan stops demanding it. The shelf can go
   short (a count was wrong) — the issue is still recorded, the shelf is
   floored at zero and the response says so, because a bench that refuses to
   build over a bad count stops the line to protect a number. */
function issueOrStep(db, FV, b, checked, scanId, serial) {
  var stRef = checked.ref, st = checked.data, orgId = String(st.orgId || '').toLowerCase(), station = String(st.station || '');
  var scanRef = db.collection('plant_scans').doc(orgId + '__' + scanId);
  return db.runTransaction(function (tx) {
    return tx.get(scanRef).then(function (prev) {
      if (prev.exists) {
        var p = prev.data() || {};
        if (p.serial !== serial) throw A.httpError(409, 'Scan identifier already belongs to another event');
        return { replayed: true, verdict: p.verdict || { ok: true, action: 'duplicate', say: 'Already recorded.' }, work: null };
      }
      var uRef = db.collection('plant_units').doc(orgId + '__' + serial);
      return tx.get(uRef).then(function (us) {
        var unit = us.exists ? us.data() : null;
        if (unit && String(unit.orgId || '').toLowerCase() !== orgId) unit = null;
        var woRef = unit && unit.woId ? db.collection('plant_works_orders').doc(unit.woId) : null;
        return Promise.all([woRef ? tx.get(woRef) : null, tx.get(catalogRef(db, orgId)), tx.get(stockRef(db, orgId)), tx.get(stRef)]).then(function (rows) {
          var wo = rows[0] && rows[0].exists ? rows[0].data() : null, by = catalogIndex(rows[1]), stockDoc = rows[2].exists ? rows[2].data() || {} : {};
          var live = rows[3];
          if (!live.exists || live.data().active === false || live.data().tokenHash !== st.tokenHash) throw A.httpError(403, 'Station credential revoked');
          var routing = P.routingOf(wo), product = unit && unit.sku && by[unit.sku] ? by[unit.sku] : null;
          var steps = W.stepsFor(product, station, by, checksOf(wo, station)), now = new Date().toISOString();
          var verdict = b.action === 'issue' ? W.judgeIssue(unit, station, routing, steps, b.code, b.qty) : W.judgeStepDone(unit, station, routing, steps, b.stepId);
          if (unit && unit.orderId && verdict.ok) {
            return tx.get(db.collection('orders').doc(unit.orderId)).then(function (commercial) {
              if (!commercial.exists || commercial.data().cancelRequested || (commercial.data().logic || {}).paymentException || ['cancelled', 'shipped', 'complete'].indexOf(commercial.data().status) >= 0) {
                verdict = { ok: false, reason: 'order_blocked', say: 'This order is stopped or already shipped. Contact the office.' };
              }
              return finish();
            });
          }
          return finish();
          function finish() {
            var stockShort = false, patchWork = null;
            if (verdict.ok && verdict.action === 'issue') patchWork = W.applyIssue(unit, station, verdict, now, b.lot);
            if (verdict.ok && verdict.action === 'step-done') patchWork = W.applyStepDone(unit, station, verdict, now);
            tx.set(scanRef, { orgId: orgId, scanId: scanId, stationId: checked.id, station: station, kind: b.action, serial: serial, woId: (unit && unit.woId) || null,
              code: S.clean(b.code, 120) || null, stepId: S.clean(b.stepId, 40) || null, lot: S.clean(b.lot, 80) || null,
              qty: verdict.qty || null, sku: verdict.sku || null, at: now, verdict: verdict, ok: !!verdict.ok, createdAt: FV.serverTimestamp() });
            if (patchWork) {
              var work = {}, k;
              for (k in (unit.work || {})) if (safeKey(k) && Object.prototype.hasOwnProperty.call(unit.work, k)) work[k] = unit.work[k];
              work[station] = patchWork;
              tx.update(uRef, { work: work, updatedAt: FV.serverTimestamp(), lastStationId: checked.id });
              if (verdict.action === 'issue') {
                var stock = stockDoc.stock && typeof stockDoc.stock === 'object' ? stockDoc.stock : {}, entry = safeKey(verdict.sku) && stock[verdict.sku] && typeof stock[verdict.sku] === 'object' ? stock[verdict.sku] : {};
                var onHand = Number(entry.onHand) || 0, left = onHand - verdict.qty;
                if (left < 0) { stockShort = true; left = 0; }
                var nextEntry = Object.assign({}, entry, { onHand: Math.round(left * 10000) / 10000, lastIssuedAt: now, lastIssuedTo: serial });
                var nextStock = Object.assign({}, stock); nextStock[verdict.sku] = nextEntry;
                tx.set(stockRef(db, orgId), { stock: nextStock, revision: (Number(stockDoc.revision) || 0) + 1, updatedAt: now, updatedBy: 'station:' + checked.id }, { merge: true });
                if (woRef && wo) {
                  var issued = Object.assign({}, wo.issued || {}); issued[verdict.sku] = Math.round(((Number(issued[verdict.sku]) || 0) + verdict.qty) * 10000) / 10000;
                  tx.update(woRef, { issued: issued });
                }
              }
              tx.update(stRef, { lastSeenAt: FV.serverTimestamp(), lastSerial: serial });
            }
            var after = unit ? Object.assign({}, unit, { work: Object.assign({}, unit.work || {}, patchWork ? (function () { var o = {}; o[station] = patchWork; return o; })() : {}) }) : null;
            return { replayed: false, verdict: verdict, stockShort: stockShort, work: after && String(after.at) === station ? W.statusOf(after, station, steps) : null };
          }
        });
      });
    });
  }).then(function (out) {
    var v = out.verdict;
    return { ok: !!v.ok, action: v.action || null, reason: v.reason || null, say: (v.say || '') + (out.stockShort ? ' The shelf count for it was already short — tell the office.' : ''),
      serial: serial, station: station, stationLabel: String(st.label || station), replayed: !!out.replayed, work: out.work || null, stockShort: !!out.stockShort };
  });
}

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

module.exports = A.handler(function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};

  var stationId = S.stationIdOf(b.stationId);
  var token = S.tokenOf(b.token);
  var scanId = S.clean(b.scanId, 64);
  var serial = P.serialFrom(b.serial);

  if (!stationId || !token) throw A.httpError(401, 'this scanner is not paired');
  if (b.action === 'describe') {
    if (!rateLimit(stationId)) throw A.httpError(429, 'too many requests from this station');
    return S.verify(A.db(), stationId, token).then(async function (checked) {
      var st = checked.data, org = await A.db().collection('omega_orgs').doc(st.orgId).get();
      return { ok: true, station: st.station, stationLabel: st.label || st.station,
        lineId:st.lineId||'',location:st.location||'',instructions:st.instructions||'',revision:st.revision||0,machine:!!st.machine,
        brand: require('./_lib/logic-brand')(org.exists ? org.data() : { name: 'Plant' }) };
    });
  }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(scanId)) throw A.httpError(400, 'Valid scanId required');
  if (!serial) return { ok: false, reason: 'unreadable', say: 'That code did not read as a serial. Scan the label on the frame.' };

  if (!rateLimit(stationId)) throw A.httpError(429, 'too many scans from this station');

  var db = A.db(), FV = A.FieldValue();
  if (b.action === 'issue' || b.action === 'step-done') {
    return S.verify(db, stationId, token).then(function (checked) { return issueOrStep(db, FV, b, checked, scanId, serial); });
  }
  return S.verify(db, stationId, token).then(function (checked) {
    var stRef = checked.ref, st = checked.data;
    var orgId = String(st.orgId || '').toLowerCase();
    /* THE STATION COMES OFF THE RECORD, NEVER THE REQUEST. */
    var station = String(st.station || '');
    var scanRef = db.collection('plant_scans').doc(orgId + '__' + scanId);

    return db.runTransaction(function (tx) {
      return tx.get(scanRef).then(function (prev) {
        if (prev.exists) {
          /* A replay. Hand back what we decided the first time. */
          var p = prev.data() || {};
          if (p.serial !== serial || p.stationId !== stationId) throw A.httpError(409, 'Scan identifier already belongs to another event');
          return { replayed: true, verdict: p.verdict || { ok: true, action: 'duplicate', say: 'Already recorded.' },instructions:(p.context||{}).instructions||'',parameters:(p.context||{}).parameters||'',workOrder:p.woId||null };
        }
        var uRef = db.collection('plant_units').doc(orgId + '__' + serial);
        return tx.get(uRef).then(function (us) {
          var unit = us.exists ? us.data() : null;
          if (unit && String(unit.orgId || '').toLowerCase() !== orgId) unit = null;

          var woP = unit && unit.woId
            ? tx.get(db.collection('plant_works_orders').doc(unit.woId))
            : Promise.resolve(null);

          return Promise.resolve(woP).then(async function (wos) {
            var wo = wos && wos.exists ? wos.data() : null;
            var routing = P.routingOf(wo);
            /* The steps at the bench it is LEAVING gate the arrival here. */
            var by = unit ? catalogIndex(await tx.get(catalogRef(db, orgId))) : {};
            var product = unit && unit.sku && by[unit.sku] ? by[unit.sku] : null;
            var leaving = unit && unit.at ? W.statusOf(unit, unit.at, W.stepsFor(product, unit.at, by, checksOf(wo, unit.at))) : null;
            var verdict = P.judgeScan(unit, station, routing, { open: leaving ? leaving.open : [] });
            var currentStation = await tx.get(stRef);
            if (!currentStation.exists || currentStation.data().active === false || currentStation.data().tokenHash !== st.tokenHash) throw A.httpError(403, 'Station credential revoked');
            var liveStation=currentStation.data();
            if(wo&&wo.lineId&&wo.lineId!==liveStation.lineId)verdict={ok:false,reason:'wrong_line',say:'Assign this station to the work order’s line before scanning. Ask the plant manager to review it.'};
            var step=wo&&(wo.routing||[]).filter(function(s){return s.key===station;})[0]||{};
            if (unit && unit.orderId) {
              var commercial = await tx.get(db.collection('orders').doc(unit.orderId));
              if (!commercial.exists || commercial.data().cancelRequested || (commercial.data().logic || {}).paymentException || ['cancelled', 'shipped', 'complete'].indexOf(commercial.data().status) >= 0) {
                verdict = { ok: false, reason: 'order_blocked', say: 'This order is stopped or already shipped. Contact the office.' };
              }
            }
            var now = new Date().toISOString();

            /* Every scan is recorded, including the refused ones. A bench that
               keeps refusing is the signal that a label is damaged or a unit
               skipped a step, and it is invisible if only successes are kept. */
            tx.set(scanRef, {
              orgId: orgId, scanId: scanId, stationId: stationId, station: station,
              serial: serial, woId: (unit && unit.woId) || null,
              gun: S.clean(b.gun, 40) || null,
              at: now, clientAt: S.clean(b.at, 40) || null,
              context:{lineId:liveStation.lineId||null,location:liveStation.location||'',stationRevision:liveStation.revision||0,flowVersion:wo&&wo.flowVersion||0,
                instructions:step.instructions||liveStation.instructions||'',parameters:step.parameters||''},
              verdict: verdict, ok: !!verdict.ok,
              createdAt: FV.serverTimestamp()
            });

            var patch = P.applyScan(unit, verdict, now);
            if (patch) {
              if (patch.at === 'ready' && unit.shipUnit && !unit.orderId) patch.inventoryStatus = 'available';
              patch.updatedAt = FV.serverTimestamp();
              patch.lastStationId = stationId;
              tx.update(uRef, patch);
              /* A shipping unit reaching Ready is a finished one: the works
                 order's count lets the materials plan stop demanding its parts. */
              if (patch.at === 'ready' && unit.shipUnit && wo && unit.woId && safeKey(String(unit.sku || ''))) {
                var rc = Object.assign({}, wo.readyCounts || {}); rc[unit.sku] = (Number(rc[unit.sku]) || 0) + 1;
                tx.update(db.collection('plant_works_orders').doc(unit.woId), { readyCounts: rc });
              }
            }
            var work = unit && verdict.ok ? W.statusOf(Object.assign({}, unit, { at: station }), station, W.stepsFor(product, station, by, checksOf(wo, station)))
                     : (verdict.reason === 'work_open' ? leaving : null);
            tx.update(stRef, { lastSeenAt: FV.serverTimestamp(), lastSerial: serial });

            return {
              replayed: false, verdict: verdict,
              unit: unit ? { serial: serial, wo: unit.woId || null, at: patch ? patch.at : String(unit.at || '') } : null,
              routing: routing.map(function (s) { return { key: s.key, label: s.label }; })
              ,instructions:step.instructions||liveStation.instructions||'',parameters:step.parameters||'',workOrder:unit&&unit.woId||null,
              work: work, product: product ? String(product.name || product.sku).slice(0, 120) : (unit && unit.sku ? String(unit.sku) : null)
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
        ,instructions:out.instructions||'',parameters:out.parameters||'',workOrder:out.workOrder||null,
        work: out.work || null, product: out.product || null
      };
    });
  });
});
