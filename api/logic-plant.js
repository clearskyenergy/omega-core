/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A = require('./_lib/admin'), X = require('./_lib/logic-access'), P = require('./_lib/logic-policy');
var R = require('./_lib/plant-release'), Plant = require('./_lib/plant'), S = require('./_lib/plant-station');
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  var caller = await A.authenticate(req), b = req.body || {}, org = A.safeOrg(req.method === 'GET' ? req.query.org : b.org);
  var ctx = await X.authorize(caller, org, req.method !== 'GET'), db = A.db();
  if (req.method === 'GET') {
    if (req.query.serial) {
      var serial = Plant.serialFrom(req.query.serial);
      if (!serial) throw A.httpError(400, 'Invalid serial');
      var row = await db.collection('plant_units').doc(org + '__' + serial).get();
      if (!row.exists) throw A.httpError(404, 'Serial not found');
      var u = row.data(), family = await db.collection('plant_units').where('orgId', '==', org).where('rootSerial', '==', u.rootSerial || u.serial).limit(401).get();
      var events = await db.collection('plant_scans').where('orgId', '==', org).where('serial', '==', serial).orderBy('createdAt', 'desc').limit(100).get();
      return { unit: u, genealogy: family.docs.map(function (d) { return d.data(); }), events: events.docs.map(function (d) { return d.data(); }), eventsLimited: events.size === 100, genealogyLimited: family.size > 400 };
    }
    var rows = await Promise.all([
      db.collection('plant_works_orders').where('orgId', '==', org).orderBy('createdAt', 'desc').limit(100).get(),
      db.collection('plant_units').where('orgId', '==', org).orderBy('createdAt', 'desc').limit(100).get()
    ]);
    return { name: ctx.org.name || org, worksOrders: rows[0].docs.map(function (d) { return Object.assign({ id: d.id }, d.data()); }),
      units: rows[1].docs.map(function (d) { return d.data(); }), limited: rows.some(function (s) { return s.size === 100; }) };
  }
  if (req.method !== 'POST') throw A.httpError(405, 'GET or POST only');
  if (b.action === 'station') {
    if (Plant.indexOf(Plant.DEFAULT_ROUTING, b.station) < 0) throw A.httpError(400, 'Unknown station');
    var crypto = require('crypto'), token = crypto.randomBytes(32).toString('hex'), ref = db.collection('plant_stations').doc();
    await ref.create({ orgId: org, station: b.station, label: String(b.label || b.station).slice(0, 100),
      tokenHash: S.sha(token), machine: Plant.MACHINE_STATIONS.indexOf(b.station) >= 0, active: true,
      createdBy: caller.email, createdAt: A.FieldValue().serverTimestamp() });
    return { stationId: ref.id, token: token, machine: Plant.MACHINE_STATIONS.indexOf(b.station) >= 0 };
  }
  if (b.action !== 'register' && b.action !== 'stock') throw A.httpError(400, 'Unknown action');
  var requestId = P.id(b.requestId), woId = b.action === 'stock' ? 'stock_' + P.key(org + ':' + requestId) : P.id(b.workOrderId);
  var woRef = db.collection('plant_works_orders').doc(woId), receiptRef = woRef.collection('registrations').doc(requestId);
  return db.runTransaction(async function (tx) {
    var old = await tx.get(woRef), receipt = await tx.get(receiptRef);
    var digest = P.key(JSON.stringify(b.units));
    if (receipt.exists) {
      if (receipt.data().digest !== digest) throw A.httpError(409, 'Registration ID was already used for different units');
      return { ok: true, duplicate: true, workOrderId: woId };
    }
    var wo = old.exists ? old.data() : null;
    if (b.action === 'register' && (!wo || wo.orgId !== org)) throw A.httpError(404, 'Works order not found');
    if (wo && wo.orgId !== org) throw A.httpError(403, 'Wrong plant');
    if (wo && wo.orderId) {
      var order = await tx.get(db.collection('orders').doc(wo.orderId));
      if (!order.exists || order.data().cancelRequested || (order.data().logic || {}).paymentException) throw A.httpError(409, 'Order is on hold');
    }
    var requested = b.action === 'stock' ? (b.units || []).filter(function (u) { return u.shipUnit === true; }).map(function (u) { return { sku: u.sku, qty: 1 }; }) : wo.requirements;
    var counts = Object.assign({}, wo && wo.registeredCounts || {}), remaining = P.quantities(requested);
    Object.keys(counts).forEach(function (sku) { remaining[sku] = Math.max(0, (remaining[sku] || 0) - counts[sku]); });
    var units = R.normalizeUnits(b.units, { items: Object.keys(remaining).map(function (sku) { return { sku: sku, qty: remaining[sku] }; }) });
    units.forEach(function (u) { if (!u.parentSerial && !u.shipUnit) throw A.httpError(400, 'Each component must belong to a shipping assembly'); });
    var refs = units.map(function (u) { return db.collection('plant_units').doc(org + '__' + u.serial); });
    var previous = await Promise.all(refs.map(function (r) { return tx.get(r); }));
    if (previous.some(function (s) { return s.exists; })) throw A.httpError(409, 'A serial is already registered; no units were changed');
    units.forEach(function (u, i) {
      if (u.shipUnit) counts[u.sku] = (counts[u.sku] || 0) + 1;
      tx.create(refs[i], Object.assign({}, u, { orgId: org, woId: woId, orderId: wo && wo.orderId || null,
        orderNo: wo && wo.orderNo || null, rootSerial: P.rootSerial(u, units), inventoryStatus: wo && wo.orderId ? 'allocated' : 'building',
        at: '', done: {}, hold: null, ncr: null, test: null, createdAt: A.FieldValue().serverTimestamp(), updatedAt: A.FieldValue().serverTimestamp() }));
    });
    var patch = { registeredCounts: counts, status: 'released', releasedUnits: (wo && wo.releasedUnits || 0) + units.length,
      shippingUnitCount: (wo && wo.shippingUnitCount || 0) + units.filter(function (u) { return u.shipUnit; }).length };
    if (!old.exists) tx.create(woRef, Object.assign(patch, { orgId: org, orderId: null, orderNo: 'STOCK', requirements: requested,
      inventory: true, routing: Plant.DEFAULT_ROUTING, createdAt: A.FieldValue().serverTimestamp(), createdBy: caller.email }));
    else tx.update(woRef, patch);
    tx.create(receiptRef, { digest: digest, by: caller.email, count: units.length, at: new Date().toISOString() });
    return { ok: true, workOrderId: woId, registered: units.length };
  });
});
