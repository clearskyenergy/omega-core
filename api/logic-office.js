/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A = require('./_lib/admin'), X = require('./_lib/logic-access'), P = require('./_lib/logic-policy');
var W = require('./_lib/logic-workflow'), Q = require('./_lib/qbo'), S = require('./_lib/office-stage');
function clean(v, n) { return String(v || '').trim().slice(0, n || 200); }
function links(org, key) {
  var q = '?org=' + encodeURIComponent(org);
  return { office: '/omega-logic' + q, factory: '/plant/' + q, customer: '/portals/customer/' + q, customers: '/portals/customer/admin.html' + q,
    start: '/customer-start.html' + q, customerApp: '/portals/customer/app' + q, officeApp: '/office/app' + q, plantApp: '/plant/app' + q,
    urls:'/logic-urls.html'+q,manager:'/plant/manager.html'+q,catalog:'/logic-catalog.html'+q,materials:'/logic-materials.html'+q,board:'/plant/work-orders.html'+q,logistics:'/logic-logistics.html'+q,poInbox:'/po-inbox?office=1&org='+encodeURIComponent(org),
    storefront: key ? '/embed/storefront.html?k=' + encodeURIComponent(key) : null,
    setup: '/whitelabel-setup.html' + q, editor: '/editor-lite.html' + q, preview: '/editor-lite.html' + q,
    mission: '/mission?view=logic&org=' + encodeURIComponent(org), subscription: '/account-settings.html' };
}
module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'no-store');
  var caller = await A.authenticate(req), owner = X.owner(caller), db = A.db(), b = req.body || {};
  var org = A.safeOrg(req.method === 'GET' ? req.query.org : b.org);
  if (req.method === 'GET' && !org) {
    X.requireOwner(caller);
    var query = db.collection('omega_orgs').orderBy('__name__');
    if (req.query.after) { var after = A.safeOrg(req.query.after); if (!after) throw A.httpError(400, 'Invalid cursor'); query = query.startAfter(after); }
    var all = await query.limit(100).get(), list = [];
    // Registry-controlled presentation only; hiding a prospect neither deletes its account nor changes access.
    all.forEach(function (s) { var d = s.data(); if (d.logicDirectoryHidden !== true && !d.supersededBy && (d.omegaLogic === true || d.vertical === 'oem' || (d.whiteLabel || {}).enabled)) list.push({ orgId: s.id, name: d.name || s.id, status: d.status, links: links(s.id) }); });
    return { owner: true, tenants: list, next: all.size === 100 ? all.docs[99].id : null };
  }
  var ctx = await X.authorize(caller, org, req.method !== 'GET');
  if (req.method === 'GET') {
    if (req.query.order) {
      X.requireOwner(caller);
      var auditRef = db.collection('orders').doc(P.id(req.query.order)), auditOrder = await auditRef.get();
      if (!auditOrder.exists || auditOrder.data().orgId !== org) throw A.httpError(404, 'Order not found');
      var audit = await auditRef.collection('events').orderBy('at', 'desc').limit(100).get();
      return { events: audit.docs.map(function (d) { return d.data(); }), limited: audit.size === 100 };
    }
    var rows = await Promise.all([
      db.collection('orders').where('orgId', '==', org).orderBy('createdAt', 'desc').limit(100).get(),
      db.collection('embed_keys').where('orgId', '==', org).get(),
      db.doc('omega_orgs/' + org + '/storefront/config').get()
    ]);
    var key = rows[1].docs.filter(function (s) { return s.data().active !== false; })[0];
    /* A company PO that has not been converted is not an order yet; it has
       its own review queue (po-inbox). The office counts it here and lists
       only real orders — the same rule api/logic-logistics.js applies. */
    var intake = { review: 0, needsInfo: 0, declined: 0 };
    var orders = rows[0].docs.filter(function (s) {
      var o = s.data(); if (!o.poIntake || o.poIntake.convertedAt) return true;
      if (o.status === 'po_declined') intake.declined++; else if (o.status === 'po_needs_information') intake.needsInfo++; else intake.review++;
      return false;
    }).map(function (s) {
      var o = s.data();
      return { id: s.id, orderNo: o.orderNo, stage: S.stageOf(o), rep: o.rep || null, totalCents: o.logic && o.logic.commercial ? o.logic.commercial.totalCents : null,
        createdAt: o.createdAt && typeof o.createdAt.toDate === 'function' ? o.createdAt.toDate().toISOString() : (typeof o.createdAt === 'string' ? o.createdAt : null), customer: { name: (o.customer || {}).name || '', email: (o.customer || {}).email || '' },
        items: o.items || [], status: o.status, cancelRequested: !!o.cancelRequested, worksOrderId: o.worksOrderId || null,
        logic: o.logic ? { commercial: o.logic.commercial, invoices: o.logic.invoices, acceptedAt: o.logic.acceptedAt,
          releasedAt: o.logic.releasedAt || null, requirements: o.logic.requirements || [], allocatedSerials: o.logic.allocatedSerials || [],
          lastError: o.logic.lastError || null, paymentException: o.logic.paymentException || null,
          payout: owner ? o.logic.payout : null } : null, shipment: o.shipment || null,
        requests: Array.isArray(o.requests) ? o.requests.slice(-20) : [] };
    });
    var conf = Object.assign({ enabled: false, terms: { depositPct: 30, dueDays: 0 }, fee: { percent: 0.25, fixed: 0 } }, ctx.config);
    if (!owner) { delete conf.realmId; delete conf.itemRef; delete conf.accountingApproved; }
    return { owner: owner, org: org, name: ctx.org.name || org, brand: require('./_lib/logic-brand')(ctx.org), active: X.enabled(ctx), config: conf,
      bundle: { name: 'Omega Logic', included: ['OEM order operations', 'White-label website sizer / platform lite', 'White-label sitemap editor resale'],
        subscriptionSeparate: true, subscriptionDue: ctx.billing.subscriptionDue || null },
      products: rows[2].exists ? (rows[2].data().products || []).length : 0,
      links: links(org, key && key.id), orders: orders, limited: rows[0].size === 100, intake: intake, totals: S.totals(orders), finance: S.finance(orders, owner) };
  }
  if (req.method !== 'POST') throw A.httpError(405, 'GET or POST only');
  if (b.action === 'configure') {
    X.requireOwner(caller);
    var terms = P.terms(b.terms), fee = { percent: Number(b.fee && b.fee.percent), fixed: Number(b.fee && b.fee.fixed || 0) };
    P.snapshot(100, terms, null, fee);
    var qbo = await Q.load(), realm = qbo && qbo.realmId;
    if (b.enabled && (!realm || !/^\d+$/.test(String(b.itemRef || '')) || b.accountingApproved !== true)) throw A.httpError(409, 'Connect QuickBooks and confirm an accountant-approved installment item before activating');
    var batch = db.batch(), root = db.collection('omega_orgs').doc(org);
    batch.set(root.collection('fulfillment').doc('config'), { enabled: b.enabled === true, terms: terms, fee: fee,
      realmId: realm || null, itemRef: clean(b.itemRef, 40), accountingApproved: b.accountingApproved === true,
      payoutMode: 'wire', updatedBy: caller.email, updatedAt: new Date().toISOString() }, { merge: true });
    // Bundle entitlement does not charge a card or invent a subscription price.
    if (b.enabled) batch.set(root.collection('billing').doc('current'), {
      addons: A.FieldValue().arrayUnion('omega-logic', 'whitelabel'),
      bundle: 'omega-logic', bundleIncludes: ['platform-lite', 'white-label-sitemap-resale']
    }, { merge: true });
    await batch.commit(); return { ok: true };
  }
  if (b.action === 'terms') {
    X.requireOwner(caller);
    var email = clean(b.email, 160).toLowerCase();
    if (!/^[^@/\s]+@[^@/\s]+\.[^@/\s]+$/.test(email)) throw A.httpError(400, 'Valid customer email required');
    var root = db.collection('omega_orgs').doc(org), ptr = root.collection('customer_index').doc(email);
    return db.runTransaction(async function (tx) {
      var s = await tx.get(ptr), cid = s.exists ? P.id(s.data().customerId) : P.key(org + ':' + email);
      var ref = root.collection('customers').doc(cid), customer = await tx.get(ref);
      if (!s.exists) tx.create(ptr, { email: email, customerId: cid });
      if (!s.exists) tx.create(ref.collection('users').doc(email), { email: email, role: 'owner', createdAt: new Date().toISOString() });
      tx.set(ref, Object.assign(customer.exists ? {} : { orgId: org, name: email, plan: 'free', status: 'active', source: 'office', createdAt: new Date().toISOString() },
        { terms: P.terms(ctx.config.terms, b.terms), termsUpdatedBy: caller.email, termsUpdatedAt: new Date().toISOString() }), { merge: true });
      return { ok: true };
    });
  }
  var orderId = P.id(b.orderId), ref = db.collection('orders').doc(orderId), row = await ref.get();
  if (!row.exists || row.data().orgId !== org) throw A.httpError(404, 'Order not found in this workspace');
  if (b.action === 'price') return W.price(orderId, b.total, caller, b.accept === true);
  if (b.action === 'accept') { X.requireOwner(caller); if (!row.data().logic) throw A.httpError(409, 'Approve the customer price first'); return W.price(orderId, row.data().logic.commercial.baseCents / 100, caller, true); }
  if (b.action === 'sync') { X.requireOwner(caller); return W.processOrder(orderId); }
  if (b.action === 'ready') return W.finish(orderId, caller);
  if (b.action === 'ship') {
    X.requireOwner(caller);
    var fresh = await W.processOrder(orderId);
    if (!fresh.ok) throw A.httpError(409, 'Reconcile QuickBooks successfully before recording shipment');
    if (!b.shipment) throw A.httpError(400, 'Shipment details required');
    return W.finish(orderId, caller, b.shipment);
  }
  if (b.action === 'request-resolve') {
    /* Answer a customer's request (api/my-orders.js POST). This records the
       answer the customer reads; the change itself — an address, a line, a
       cancellation — goes through the control that owns it. */
    var rid = String(b.requestId || '').slice(0, 40), answer = String(b.answer || '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, 2000);
    if (!rid) throw A.httpError(400, 'Which request?');
    if (answer.length < 2) throw A.httpError(400, 'Write the answer the customer will read');
    return db.runTransaction(async function (tx) {
      var s = await tx.get(ref), o = s.data() || {}, list = Array.isArray(o.requests) ? o.requests.slice() : [], i = -1;
      list.forEach(function (r, k) { if (r && r.id === rid) i = k; });
      if (i < 0) throw A.httpError(404, 'Request not found');
      if (list[i].status !== 'open') return { ok: true, duplicate: true };
      var now = new Date().toISOString();
      list[i] = Object.assign({}, list[i], { status: 'resolved', answer: answer, answeredBy: caller.email, answeredAt: now });
      tx.update(ref, { requests: list, openRequests: list.filter(function (r) { return r && r.status === 'open'; }).length, updatedAt: A.FieldValue().serverTimestamp() });
      W.event(tx, ref, caller.email, 'Answered customer request (' + list[i].kind + '): ' + answer.slice(0, 200));
      return { ok: true };
    });
  }
  if (b.action === 'cancel') {
    return db.runTransaction(async function (tx) {
      var s = await tx.get(ref), o = s.data();
      if (['shipped', 'complete'].indexOf(o.status) >= 0) throw A.httpError(409, 'Use the returns process for shipped orders');
      var hold = { cancelRequested: true };
      if (o.logic) hold['logic.paymentException'] = 'Cancellation requested; refund and stock disposition require ClearSky review';
      tx.update(ref, hold);
      W.event(tx, ref, caller.email, 'Cancellation requested; production/dispatch blocked. No automatic refund or inventory release.');
      return { ok: true };
    });
  }
  if (b.action === 'cleared' || b.action === 'wire_sent') {
    X.requireOwner(caller);
    var bankRef = clean(b.bankReference, 120);
    if (bankRef.length < 4) throw A.httpError(400, 'Bank confirmation reference required');
    return db.runTransaction(async function (tx) {
      var s = await tx.get(ref), o = s.data(), l = o.logic;
      if (!l || l.paymentException || o.cancelRequested) throw A.httpError(409, 'Resolve the order exception first');
      var payout = Object.assign({}, l.payout), amount = P.cents(b.amount);
      if (b.action === 'cleared') {
        var paid = Object.keys(l.invoices).reduce(function (n, k) { return n + (l.invoices[k].paidCents || 0); }, 0);
        if (amount > paid || amount < (payout.clearedCents || 0)) throw A.httpError(400, 'Cleared total must be cumulative and cannot exceed recorded payments');
        payout.clearedCents = amount;
        payout.eligibleCents = Math.min(l.commercial.baseCents, Math.round(amount * l.commercial.baseCents / l.commercial.totalCents));
        payout.clearanceReference = bankRef;
      } else {
        // Cumulative amount and immutable reference make repeat confirmations harmless.
        if (amount > (payout.eligibleCents || 0) || amount < (payout.sentCents || 0)) throw A.httpError(400, 'Cumulative wires cannot exceed cleared OEM proceeds');
        payout.sentCents = amount; payout.wireReference = bankRef;
      }
      payout.pendingCents = (payout.eligibleCents || 0) - (payout.sentCents || 0);
      payout.status = payout.pendingCents > 0 ? 'wire_ready' : ((payout.sentCents || 0) > 0 ? 'wire_recorded' : 'awaiting_cleared_funds');
      payout.updatedAt = new Date().toISOString();
      tx.update(ref, { 'logic.payout': payout }); W.event(tx, ref, caller.email, b.action + ' cumulative USD ' + (amount / 100) + ' · bank reference ' + bankRef);
      return { ok: true, payout: payout };
    });
  }
  throw A.httpError(400, 'Unknown action');
});
