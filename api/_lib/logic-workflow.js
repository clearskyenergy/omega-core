/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Durable per-order workflow. All money in integer cents. No browser-paid flags. */
'use strict';
var A = require('./admin'), P = require('./logic-policy'), X = require('./logic-access');
var Q = require('./qbo-sales'), Plant = require('./plant');
function physical(items){var rows=(items||[]).filter(function(i){return i.kind!=='service';});return rows.length?P.quantities(rows):{};}
function event(tx, ref, by, what) {
  tx.create(ref.collection('events').doc(), { at: new Date().toISOString(), by: by, what: what });
}
function invoicePlan(id, stage, amount) {
  return { amountCents: amount, requestId: P.key(id + ':' + stage + ':v1'), date: new Date().toISOString().slice(0, 10), status: amount ? 'queued' : 'not_required' };
}
async function price(orderId, total, caller, accept) {
  X.requireOwner(caller);
  var ref = A.db().collection('orders').doc(P.id(orderId)), initial = await ref.get();
  if (!initial.exists) throw A.httpError(404, 'Order not found');
  var order = initial.data(), ctx = await X.context(order.orgId);
  if (!X.enabled(ctx)) throw A.httpError(409, 'Enable the Omega Logic subscription and fulfillment configuration first');
  var conf = ctx.config;
  if (!conf.realmId || !conf.itemRef || conf.accountingApproved !== true) throw A.httpError(409, 'Connect ClearSky QuickBooks and approve the installment item/tax treatment first');
  // Terms are keyed by the real customer account, not an arbitrary public form field.
  var root = A.db().collection('omega_orgs').doc(order.orgId), override = null;
  var pointer = await root.collection('customer_index').doc(String(order.customer.email).toLowerCase()).get();
  if (pointer.exists) {
    var cs = await root.collection('customers').doc(P.id(pointer.data().customerId)).get();
    if (cs.exists && cs.data().status !== 'disabled') override = cs.data().terms;
  }
  var commercial = P.snapshot(total, conf.terms, override, conf.fee);
  P.quantities(order.items);
  return A.db().runTransaction(async function (tx) {
    var row = await tx.get(ref), o = row.data();
    if (!row.exists || o.cancelRequested || ['cancelled', 'shipped', 'complete'].indexOf(o.status) >= 0) throw A.httpError(409, 'Order is not open for pricing');
    if (o.logic) {
      if (o.logic.commercial.baseCents !== commercial.baseCents) throw A.httpError(409, 'Invoiced price is locked; issue an accounting adjustment before repricing');
      if (accept && !o.logic.acceptedAt) {
        tx.update(ref, { 'logic.acceptedAt': new Date().toISOString(), 'logic.nextRunAt': Date.now(), status: 'accepted' });
        event(tx, ref, caller.email, 'Commercial order accepted');
      }
      return { ok: true, duplicate: true };
    }
    if (JSON.stringify(o.items) !== JSON.stringify(order.items) || o.customer.email !== order.customer.email) throw A.httpError(409, 'Order changed; reload');
    tx.update(ref, { logic: { enabled: true, commercial: commercial, realmId: String(conf.realmId), itemRef: String(conf.itemRef),
      acceptedAt: accept ? new Date().toISOString() : null, createdAt: new Date().toISOString(), nextRunAt: Date.now(),
      invoices: { deposit: invoicePlan(orderId, 'deposit', commercial.depositCents) },
      payout: { mode: 'wire', status: 'awaiting_cleared_funds', sentCents: 0 }, leaseUntil: 0 },
      tenantPricing: { total: commercial.totalCents / 100, currency: 'USD', publishedToCustomer: true },
      status: accept ? 'accepted' : 'quoted', updatedAt: A.FieldValue().serverTimestamp() });
    event(tx, ref, caller.email, 'Customer price approved; installment invoice queued');
    return { ok: true, commercial: commercial };
  });
}
async function release(ref) {
  var db = A.db();
  return db.runTransaction(async function (tx) {
    var snap = await tx.get(ref), o = snap.data(), l = o.logic;
    if (o.cancelRequested || o.status === 'cancelled' || !l.acceptedAt || l.releasedAt) return;
    var dep = l.invoices.deposit;
    if (dep.amountCents && !dep.satisfied) return;
    var wanted = physical(o.items), services=(o.items||[]).filter(function(i){return i.kind==='service';}),selected = [], allNodes = [];
    // A bounded allocation is conservative: unexamined stock becomes manufacture demand.
    var roots = await tx.get(db.collection('plant_units').where('orgId', '==', o.orgId).where('inventoryStatus', '==', 'available').limit(100));
    for (var doc of roots.docs) {
      var u = doc.data();
      if (!u.shipUnit || u.orderId || !wanted[u.sku] || !P.ready(u)) continue;
      var children = await tx.get(db.collection('plant_units').where('orgId', '==', o.orgId).where('rootSerial', '==', u.serial).limit(201));
      if (children.size > 200 || children.empty || children.docs.some(function (d) { var n = d.data(); return !P.ready(n) || !!n.orderId; })) continue;
      if (allNodes.length + children.size > 350) continue;
      wanted[u.sku]--; selected.push(u.serial); allNodes = allNodes.concat(children.docs);
    }
    var woId = 'wo_' + ref.id, woRef = db.collection('plant_works_orders').doc(woId), oldWo = await tx.get(woRef);
    var config=await tx.get(db.collection('omega_orgs').doc(o.orgId).collection('fulfillment').doc('config'));
    var flow=require('./plant-flow').current(config.exists?config.data():{});
    if (oldWo.exists) throw A.httpError(409, 'Existing works order needs reconciliation before automatic release');
    var demand = Object.keys(wanted).filter(function (s) { return wanted[s] > 0; }).map(function (s) { return { sku: s, qty: wanted[s] }; });
    tx.create(woRef, { orgId: o.orgId, orderId: ref.id, orderNo: o.orderNo, status: demand.length ? 'awaiting_serials' : services.length?'awaiting_services':'ready',serviceRequirements:services,
      routing: flow.routing,flowVersion:flow.version,lineId:flow.lines[0].id, requirements: demand, allocatedSerials: selected, registeredCounts: {},
      createdAt: A.FieldValue().serverTimestamp(), releasedUnits: allNodes.length, shippingUnitCount: selected.length });
    allNodes.forEach(function (d) {
      var u = d.data();
      tx.update(d.ref, { orderId: ref.id, orderNo: o.orderNo, woId: woId, inventoryStatus: 'allocated',
        sourceWoId: u.sourceWoId || u.woId, allocatedAt: new Date().toISOString() });
    });
    tx.update(ref, { status: 'in_fulfilment', worksOrderId: woId, 'logic.releasedAt': new Date().toISOString(),
      'logic.allocatedSerials': selected, 'logic.requirements': demand, plantReleasedAt: A.FieldValue().serverTimestamp() });
    event(tx, ref, 'omega-logic', 'Deposit verified; ' + selected.length + ' finished units reserved; manufacturing requirements released');
  });
}
async function processOrder(orderId) {
  var db = A.db(), ref = db.collection('orders').doc(P.id(orderId));
  var lease = require('crypto').randomBytes(16).toString('hex');
  var acquired = await db.runTransaction(async function (tx) {
    var s = await tx.get(ref), l = s.exists && s.data().logic;
    if (!l || l.leaseUntil > Date.now() || s.data().status === 'cancelled') return false;
    tx.update(ref, { 'logic.lease': lease, 'logic.leaseUntil': Date.now() + 180000 }); return true;
  });
  if (!acquired) return { skipped: true };
  try {
    var o = (await ref.get()).data(), ctx = await X.context(o.orgId);
    if (!X.enabled(ctx)) throw A.httpError(409, 'OEM subscription/configuration is inactive; automation paused');
    for (var stage of ['deposit', 'balance']) {
      o = (await ref.get()).data();
      var inv = o.logic.invoices[stage];
      if (!inv || !inv.amountCents) continue;
      if (!inv.id) {
        var created = await Q.invoice(o, stage), patch = {};
        patch['logic.invoices.' + stage + '.id'] = created.id;
        patch['logic.customerRef'] = created.customerRef;
        await ref.update(patch); o = (await ref.get()).data();
      }
      var result = await Q.reconcile(o, stage);
      await db.runTransaction(async function (tx) {
        var s = await tx.get(ref), current = s.data(), previous = current.logic.invoices[stage];
        if (current.logic.lease !== lease) throw A.httpError(409, 'Workflow lease changed');
        var updated = Object.assign({}, previous, result, { status: result.satisfied ? 'paid' : 'awaiting_payment', checkedAt: new Date().toISOString() });
        var changes = {}; changes['logic.invoices.' + stage] = updated;
        if (previous.satisfied && !result.satisfied) {
          changes['logic.paymentException'] = 'Payment reversed or reallocated; fulfillment blocked pending review';
          event(tx, ref, 'quickbooks', 'Payment reversal detected; fulfillment blocked');
        }
        tx.update(ref, changes);
      });
    }
    o = (await ref.get()).data();
    if (!o.logic.paymentException) await release(ref);
    o = (await ref.get()).data();
    if (o.logic.releasedAt && !o.logic.invoices.balance && !o.cancelRequested && !o.logic.paymentException) {
      try { await finish(orderId, { email: 'omega-logic' }); }
      catch (notReady) { if (notReady.status !== 409) throw notReady; }
    }
    if(o.logic.releasedAt&&(o.items||[]).length&&o.items.every(function(i){return i.kind==='service';})){
      await db.runTransaction(async function(tx){var snap=await tx.get(ref),current=snap.data(),l=current.logic,work=await tx.get(db.collection('plant_works_orders').doc(current.worksOrderId));
        if(current.status==='complete'||current.cancelRequested||l.paymentException||!work.exists||!work.data().serviceCompletion||!l.invoices.balance||(l.commercial.balanceCents&&!l.invoices.balance.satisfied))return;
        tx.update(ref,{status:'complete','logic.completedAt':new Date().toISOString()});event(tx,ref,'omega-logic','Services accepted and final payment verified; no hardware shipment required');});
    }
    await ref.update({ 'logic.lastError': null, 'logic.nextRunAt': Date.now() + 300000, 'logic.leaseUntil': 0,
      'logic.lastRunAt': new Date().toISOString(), 'logic.attempts': 0 });
    return { ok: true };
  } catch (e) {
    await db.runTransaction(async function (tx) {
      var s = await tx.get(ref), l = s.data().logic;
      if (l.lease !== lease) return;
      var attempts = (l.attempts || 0) + 1;
      tx.update(ref, { 'logic.lastError': String(e.message).slice(0, 300), 'logic.attempts': attempts,
        'logic.nextRunAt': Date.now() + Math.min(3600000, 30000 * Math.pow(2, Math.min(attempts, 7))), 'logic.leaseUntil': 0 });
    });
    return { ok: false, error: e.message };
  }
}
async function finish(orderId, caller, shipment) {
  var db = A.db(), ref = db.collection('orders').doc(P.id(orderId));
  return db.runTransaction(async function (tx) {
    var s = await tx.get(ref); if (!s.exists) throw A.httpError(404, 'Order not found');
    var o = s.data(), l = o.logic;
    if (!l || !l.releasedAt || l.paymentException || l.lastError || o.cancelRequested || o.status === 'cancelled') throw A.httpError(409, 'Order is not released or is blocked; reconcile accounting before dispatch');
    var units = await tx.get(db.collection('plant_units').where('orgId', '==', o.orgId).where('orderId', '==', ref.id).limit(401));
    var wanted = physical(o.items),services=(o.items||[]).filter(function(i){return i.kind==='service';});
    if(services.length){var serviceWo=await tx.get(db.collection('plant_works_orders').doc(o.worksOrderId));if(!serviceWo.exists||!serviceWo.data().serviceCompletion)throw A.httpError(409,'Record service completion evidence in Plant manager before final billing');}
    if ((units.empty&&Object.keys(wanted).length) || units.size > 400 || units.docs.some(function (u) { return !P.ready(u.data()); })) throw A.httpError(409, 'Every serialized component must pass testing and reach Ready without a hold');
    units.docs.forEach(function (d) { var u = d.data(); if (u.shipUnit) wanted[u.sku] = (wanted[u.sku] || 0) - 1; });
    if (Object.keys(wanted).some(function (sku) { return wanted[sku] !== 0; })) throw A.httpError(409, 'Shipping units do not match the complete order');
    if (shipment) {
      if (o.delivery) throw A.httpError(409, 'Use Logistics and receiving for orders with a destination plan');
      if (l.commercial.balanceCents && !(l.invoices.balance || {}).satisfied) throw A.httpError(409, 'Final payment must be recorded before shipment');
      if (!shipment.carrier || !shipment.tracking) throw A.httpError(400, 'Carrier and tracking / bill-of-lading number required');
      tx.update(ref, { status: 'shipped', shipment: { carrier: String(shipment.carrier).slice(0, 80), tracking: String(shipment.tracking).slice(0, 120), shippedAt: new Date().toISOString() } });
      event(tx, ref, caller.email, 'Shipment recorded with passed serial genealogy');
    } else if (!l.invoices.balance) {
      tx.update(ref, { 'logic.invoices.balance': invoicePlan(ref.id, 'balance', l.commercial.balanceCents), 'logic.readyAt': new Date().toISOString(), 'logic.nextRunAt': Date.now() });
      event(tx, ref, caller.email, 'Quality release complete; final invoice queued');
    }
    return { ok: true };
  });
}
module.exports = { price: price, release: release, processOrder: processOrder, finish: finish, event: event };
