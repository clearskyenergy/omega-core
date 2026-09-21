/* ═══════════════════════════════════════════════════════════════════════════
   POST /api/plant-release — accepted order → serialized works order
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   This is the missing bridge in the Cleancell flow. A public/tenant order is
   commercial evidence; a works order is a factory instruction. They must not
   be created independently, because every re-key is a chance to make a
   customer order and a physical build disagree.

   Only ClearSky staff may release an accepted order. The payment provider (or
   a staff member while payment automation is being connected) calls this
   endpoint once, with the serials and their component genealogy. The release
   is idempotent per order and is one Firestore transaction — an order cannot
   show "in fulfilment" without the works order and travelers that prove it.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var A = require('./_lib/admin');
var P = require('./_lib/plant');
var R = require('./_lib/plant-release');

function clean(value, max) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max || 160);
}
function safeISO(value, name) {
  if (value == null || value === '') return null;
  var s = clean(value, 40);
  if (isNaN(new Date(s).getTime())) throw A.httpError(400, (name || 'date') + ' must be an ISO date/time');
  return new Date(s).toISOString();
}
function workOrderId(orderId) { return 'wo_' + clean(orderId, 120); }

module.exports = A.handler(function (req) {
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {};
  var orderId = clean(b.orderId, 120);
  if (!orderId) throw A.httpError(400, 'orderId required');

  return A.authenticate(req).then(function (caller) {
    if (!caller.staff) throw A.httpError(403, 'Only ClearSky may release a works order.');
    var db = A.db(), FV = A.FieldValue();
    var orderRef = db.collection('orders').doc(orderId);
    return orderRef.get().then(function (orderSnap) {
      if (!orderSnap.exists) throw A.httpError(404, 'order not found');
      var firstOrder = orderSnap.data() || {};
      if (firstOrder.status !== 'accepted' && firstOrder.status !== 'in_fulfilment') {
        throw A.httpError(409, 'Only an accepted order can be released to the plant.');
      }
      var units, routing;
      try {
        units = R.normalizeUnits(b.units, firstOrder);
        routing = R.routingOf(b.routing || P.DEFAULT_ROUTING);
      } catch (e) {
        throw A.httpError(e.status || 400, e.message || 'Invalid works-order release');
      }
      var woId = workOrderId(orderId);
      var woRef = db.collection('plant_works_orders').doc(woId);
      var unitRefs = units.map(function (unit) {
        return db.collection('plant_units').doc(String(firstOrder.orgId).toLowerCase() + '__' + unit.serial);
      });

      return db.runTransaction(function (tx) {
        var reads = [tx.get(orderRef), tx.get(woRef)];
        unitRefs.forEach(function (ref) { reads.push(tx.get(ref)); });
        return Promise.all(reads).then(function (rows) {
          var currentSnap = rows[0], oldWo = rows[1];
          if (!currentSnap.exists) throw A.httpError(404, 'order not found');
          var order = currentSnap.data() || {};
          if (oldWo.exists) {
            var existing = oldWo.data() || {};
            if (existing.orderId !== orderId || existing.orgId !== order.orgId) {
              throw A.httpError(409, 'works-order id conflict');
            }
            return { ok: true, duplicate: true, workOrderId: oldWo.id, releasedUnits: Number(existing.releasedUnits || 0) };
          }
          if (order.status !== 'accepted' && order.status !== 'in_fulfilment') {
            throw A.httpError(409, 'order is no longer accepted');
          }
          for (var i = 0; i < unitRefs.length; i++) {
            if (rows[i + 2].exists) throw A.httpError(409, 'serial ' + units[i].serial + ' is already registered in this plant');
          }

          var roots = units.filter(function (unit) { return unit.shipUnit; });
          var due = safeISO(b.promisedShipAt, 'promisedShipAt') || order.promisedShipAt || null;
          var wo = {
            orgId: String(order.orgId || '').toLowerCase(),
            orderId: orderId,
            orderNo: order.orderNo || orderId,
            status: 'released',
            routing: routing,
            promisedShipAt: due,
            releasedUnits: units.length,
            shippingUnitCount: roots.length,
            createdBy: caller.email,
            createdAt: FV.serverTimestamp(),
            updatedAt: FV.serverTimestamp()
          };
          tx.set(woRef, wo);
          units.forEach(function (unit, index) {
            tx.set(unitRefs[index], {
              orgId: wo.orgId,
              woId: woId,
              orderId: orderId,
              orderNo: wo.orderNo,
              serial: unit.serial,
              sku: unit.sku,
              unitType: unit.unitType,
              parentSerial: unit.parentSerial,
              shipUnit: unit.shipUnit,
              trace: unit.trace,
              at: '',
              done: {},
              hold: null,
              ncr: null,
              test: null,
              createdAt: FV.serverTimestamp(),
              updatedAt: FV.serverTimestamp()
            });
          });
          tx.update(orderRef, {
            status: 'in_fulfilment',
            worksOrderId: woId,
            plantReleasedAt: FV.serverTimestamp(),
            promisedShipAt: due,
            updatedAt: FV.serverTimestamp(),
            history: FV.arrayUnion({ at: new Date().toISOString(), by: caller.email,
              what: 'released to plant · ' + roots.length + ' shipping unit' + (roots.length === 1 ? '' : 's') + ' · works order ' + woId })
          });
          return { ok: true, workOrderId: woId, releasedUnits: units.length, shippingUnits: roots.length, routing: routing };
        });
      });
    });
  });
});
