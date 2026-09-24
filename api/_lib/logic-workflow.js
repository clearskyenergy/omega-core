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
  if(order.poIntake&&!order.poIntake.convertedAt)throw A.httpError(409,'Review and map the uploaded PO to catalog items before pricing');
  if (!X.enabled(ctx)) throw A.httpError(409, 'Enable the Omega Logic subscription and fulfillment configuration first');
  var conf = ctx.config, tenantBilled = conf.accounting === 'tenant';
  /* Two ways an order is billed. QUICKBOOKS (default): ClearSky invoices the
     customer from its QuickBooks and the workflow reconciles payments there.
     TENANT: the OEM invoices its own customer on its own paper (its number,
     its bank); the office records "invoice issued" and "payment received"
     here (issueInvoice / recordPayment), and the same release, ready and
     ship machinery follows. No processing fee is added to the customer's
     total in tenant mode: ClearSky's charge to the OEM is a separate line. */
  if (!tenantBilled && (!conf.realmId || !conf.itemRef || conf.accountingApproved !== true)) throw A.httpError(409, 'Connect ClearSky QuickBooks and approve the installment item/tax treatment first');
  // Terms are keyed by the real customer account, not an arbitrary public form field.
  var root = A.db().collection('omega_orgs').doc(order.orgId), override = null, stampAccount = null;
  var pointer = await root.collection('customer_index').doc(String(order.customer.email).toLowerCase()).get();
  if (pointer.exists) {
    var cs = await root.collection('customers').doc(P.id(pointer.data().customerId)).get();
    if (cs.exists && cs.data().status !== 'disabled') override = cs.data().terms;
    /* Pricing is where the office reviews an order: from here it belongs to
       the customer ACCOUNT, so everyone on it sees it. Not for an order an
       anonymous visitor typed on the public storefront — their email proves
       nothing until they sign in. */
    if (cs.exists && !order.customerId && ['embed', 'config-link'].indexOf(order.source) < 0) stampAccount = cs.id;
  }
  var commercial = P.snapshot(total, conf.terms, override, tenantBilled ? { percent: 0, fixed: 0 } : conf.fee);
  if (tenantBilled) commercial.billing = 'tenant';
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
    var firstInvoice = invoicePlan(orderId, 'deposit', commercial.depositCents); if (tenantBilled && firstInvoice.amountCents) firstInvoice.status = 'to_issue';
    var priced = { logic: { enabled: true, commercial: commercial, accounting: tenantBilled ? 'tenant' : 'quickbooks', realmId: tenantBilled ? null : String(conf.realmId), itemRef: tenantBilled ? null : String(conf.itemRef),
      acceptedAt: accept ? new Date().toISOString() : null, createdAt: new Date().toISOString(), nextRunAt: Date.now(),
      invoices: { deposit: firstInvoice },
      payout: { mode: 'wire', status: 'awaiting_cleared_funds', sentCents: 0 }, leaseUntil: 0 },
      tenantPricing: { total: commercial.totalCents / 100, currency: 'USD', publishedToCustomer: true },
      status: accept ? 'accepted' : 'quoted', updatedAt: A.FieldValue().serverTimestamp() };
    if (stampAccount && !o.customerId) priced.customerId = stampAccount;
    tx.update(ref, priced);
    event(tx, ref, caller.email, tenantBilled ? 'Customer price approved; the OEM issues the deposit invoice on its own paper' : 'Customer price approved; installment invoice queued');
    return { ok: true, commercial: commercial };
  });
}
/* TENANT-BILLED: the office records the invoice it issued (number, date) and
   each payment that landed (amount, date, bank reference). Cumulative and
   idempotent by bank reference; a stage is satisfied when what was received
   covers what was invoiced, and release / ready / ship follow exactly as
   they do from a QuickBooks receipt. */
function stageOf(l, stage) { if (['deposit', 'balance'].indexOf(stage) < 0) throw A.httpError(400, 'stage must be deposit or balance'); var inv = l.invoices[stage]; if (!inv) throw A.httpError(409, 'No ' + stage + ' invoice on this order yet' + (stage === 'balance' ? ' — verify ready first' : '')); return inv; }
async function issueInvoice(orderId, stage, b, caller) {
  var db = A.db(), ref = db.collection('orders').doc(P.id(orderId)), number = String(b && b.number || '').trim().slice(0, 80), date = String(b && b.date || '').slice(0, 10);
  if (!number) throw A.httpError(400, 'Invoice number required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) throw A.httpError(400, 'Invoice date must be YYYY-MM-DD');
  return db.runTransaction(async function (tx) {
    var s = await tx.get(ref); if (!s.exists) throw A.httpError(404, 'Order not found');
    var o = s.data(), l = o.logic; if (!l || l.accounting !== 'tenant') throw A.httpError(409, 'This order is billed through QuickBooks; invoices are issued there');
    var inv = stageOf(l, stage); if (!inv.amountCents) throw A.httpError(409, 'Nothing is due at this stage');
    if (inv.id && inv.id !== number) throw A.httpError(409, 'Invoice ' + inv.id + ' is already recorded for this stage');
    var updated = Object.assign({}, inv, { id: number, issuedAt: date, issuedBy: caller.email, status: inv.satisfied ? 'paid' : 'awaiting_payment', paidCents: inv.paidCents || 0 });
    var changes = {}; changes['logic.invoices.' + stage] = updated; tx.update(ref, changes);
    if (inv.id !== number) event(tx, ref, caller.email, stage + ' invoice ' + number + ' issued ' + date + ' for USD ' + (inv.amountCents / 100));
    return { ok: true, duplicate: inv.id === number, invoice: updated };
  });
}
async function recordPayment(orderId, stage, b, caller) {
  var db = A.db(), ref = db.collection('orders').doc(P.id(orderId)), amount = P.cents(b && b.amount), date = String(b && b.date || '').slice(0, 10), bankRef = String(b && b.bankReference || '').trim().slice(0, 120);
  if (!amount) throw A.httpError(400, 'Amount received required');
  if (bankRef.length < 4) throw A.httpError(400, 'Bank confirmation reference required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) throw A.httpError(400, 'Payment date must be YYYY-MM-DD');
  var out = await db.runTransaction(async function (tx) {
    var s = await tx.get(ref); if (!s.exists) throw A.httpError(404, 'Order not found');
    var o = s.data(), l = o.logic; if (!l || l.accounting !== 'tenant') throw A.httpError(409, 'This order is billed through QuickBooks; payments are reconciled there');
    if (o.cancelRequested || l.paymentException) throw A.httpError(409, 'Resolve the order exception first');
    var inv = stageOf(l, stage); if (!inv.id) throw A.httpError(409, 'Record the ' + stage + ' invoice number first');
    var payments = (inv.payments || []).slice();
    if (payments.some(function (x) { return x.bankReference === bankRef; })) return { ok: true, duplicate: true, invoice: inv };
    payments.push({ amountCents: amount, date: date, bankReference: bankRef, by: caller.email, at: new Date().toISOString() });
    var paid = payments.reduce(function (n, x) { return n + x.amountCents; }, 0);
    if (paid > inv.amountCents) throw A.httpError(400, 'Payments would exceed the invoice: USD ' + (paid / 100) + ' against ' + (inv.amountCents / 100));
    var updated = Object.assign({}, inv, { payments: payments, paidCents: paid, satisfied: paid >= inv.amountCents, balanceCents: inv.amountCents - paid, status: paid >= inv.amountCents ? 'paid' : 'part_paid', checkedAt: new Date().toISOString() });
    var changes = {}; changes['logic.invoices.' + stage] = updated; changes['logic.nextRunAt'] = Date.now(); tx.update(ref, changes);
    event(tx, ref, caller.email, stage + ' invoice ' + inv.id + ': USD ' + (amount / 100) + ' received ' + date + ' · bank reference ' + bankRef + (updated.satisfied ? ' · paid in full' : ' · USD ' + (updated.balanceCents / 100) + ' outstanding'));
    return { ok: true, invoice: updated };
  });
  if (!out.duplicate) { var run = await processOrder(orderId); out.workflow = run; }
  return out;
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
      if (o.logic.accounting === 'tenant') continue; /* issued and paid on the OEM's paper: recordPayment() keeps the stage; nothing to reconcile */
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
      var shippedAt = new Date().toISOString(), shipAcct = await require('./buyer-accounts').accountOfOrder(A.db(), o.orgId, o);
      tx.update(ref, { status: 'shipped', shipment: { carrier: String(shipment.carrier).slice(0, 80), tracking: String(shipment.tracking).slice(0, 120), shippedAt: shippedAt } });
      event(tx, ref, caller.email, 'Shipment recorded with passed serial genealogy');
      /* custody (api/_lib/custody.js): every shipping unit leaves the plant */
      var C = require('./custody');
      units.docs.forEach(function (d) { var u = d.data(); if (!u.shipUnit) return; var v = C.judge(u, 'ship', {}); if (!v.ok) return; var ap = C.apply(u, 'ship', { at: shippedAt, note: 'Shipped ' + String(shipment.carrier).slice(0, 80) + ' ' + String(shipment.tracking).slice(0, 120) }, caller.email, shippedAt, 'logistics'); if (shipAcct && !C.custodyOf(u).customerId) ap.patch['custody.customerId'] = shipAcct; ap.event.orderId = ref.id; tx.update(d.ref, ap.patch); tx.create(d.ref.collection('custody_events').doc(), Object.assign({ orgId: o.orgId, serial: u.serial }, ap.event)); });
    } else if (!l.invoices.balance) {
      var balancePlan = invoicePlan(ref.id, 'balance', l.commercial.balanceCents); if (l.accounting === 'tenant' && balancePlan.amountCents) balancePlan.status = 'to_issue';
      tx.update(ref, { 'logic.invoices.balance': balancePlan, 'logic.readyAt': new Date().toISOString(), 'logic.nextRunAt': Date.now() });
      event(tx, ref, caller.email, l.accounting === 'tenant' ? 'Quality release complete; the OEM issues the final invoice' : 'Quality release complete; final invoice queued');
    }
    return { ok: true };
  });
}
module.exports = { price: price, release: release, processOrder: processOrder, finish: finish, event: event, issueInvoice: issueInvoice, recordPayment: recordPayment };
