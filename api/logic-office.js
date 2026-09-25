/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var A = require('./_lib/admin'), X = require('./_lib/logic-access'), P = require('./_lib/logic-policy');
var W = require('./_lib/logic-workflow'), Q = require('./_lib/qbo'), S = require('./_lib/office-stage'), R = require('./_lib/receivables');
function clean(v, n) { return String(v || '').trim().slice(0, n || 200); }
function links(org, key) {
  var q = '?org=' + encodeURIComponent(org);
  return { office: '/omega-logic' + q, factory: '/plant/' + q, customer: '/portals/customer/' + q, customers: '/portals/customer/admin.html' + q,
    start: '/customer-start.html' + q, customerApp: '/portals/customer/app' + q, officeApp: '/office/app' + q, plantApp: '/plant/app' + q,
    urls:'/logic-urls.html'+q,manager:'/plant/manager.html'+q,catalog:'/logic-catalog.html'+q,materials:'/logic-materials.html'+q,board:'/plant/work-orders.html'+q,logistics:'/logic-logistics.html'+q,poInbox:'/po-inbox?office=1&org='+encodeURIComponent(org),
    storefront: key ? '/embed/storefront.html?k=' + encodeURIComponent(key) : null,
    setup: '/whitelabel-setup.html' + q, editor: '/editor-lite.html' + q, preview: '/editor-lite.html' + q,
    mission: '/mission?view=logic&org=' + encodeURIComponent(org), subscription: '/account-settings.html', accounting: '/logic-accounting.html' + q };
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
    var intake = { review: 0, needsInfo: 0, declined: 0, waiting: [] };
    /* D1: who may price and accept which order (office-stage access(),
       turned into each order's `can` and `waitingOn` by actions() — the
       rule logic-access.requirePricer enforces when the button is pressed). */
    var who = S.access(owner, ctx.member, X.enabled(ctx)), billing = (ctx.config || {}).accounting === 'tenant' ? 'tenant' : 'quickbooks';
    var orders = rows[0].docs.filter(function (s) {
      var o = s.data(); if (!o.poIntake || o.poIntake.convertedAt) return true;
      if (o.status === 'po_declined') intake.declined++; else if (o.status === 'po_needs_information') intake.needsInfo++; else intake.review++;
      /* the Review list names whose PO waits (OFF-03): a company with one
         opens that PO, a company with several opens its own queue */
      if (o.status !== 'po_declined' && intake.waiting.length < 20) intake.waiting.push({ id: s.id, customerId: o.customerId || null, company: (o.customer || {}).company || '',
        poNumber: (o.poIntake || {}).number || '', status: o.status || null, createdAt: (o.poIntake || {}).createdAt || null });
      return false;
    }).map(function (s) {
      var o = s.data(), act = S.actions(o, who, billing);
      return { id: s.id, orderNo: o.orderNo, poNumber: R.poOf(o), stage: act.stage, can: act.can, waitingOn: act.waitingOn, billing: S.billingOf(o, billing), rep: o.rep || null, totalCents: o.logic && o.logic.commercial ? o.logic.commercial.totalCents : null,
        createdAt: o.createdAt && typeof o.createdAt.toDate === 'function' ? o.createdAt.toDate().toISOString() : (typeof o.createdAt === 'string' ? o.createdAt : null), customer: { name: (o.customer || {}).name || '', email: (o.customer || {}).email || '', company: (o.customer || {}).company || '' }, customerId: o.customerId || null,
        items: o.items || [], status: o.status, cancelRequested: !!o.cancelRequested, worksOrderId: o.worksOrderId || null,
        logic: o.logic ? { commercial: o.logic.commercial, invoices: o.logic.invoices, acceptedAt: o.logic.acceptedAt, accounting: o.logic.accounting || null,
          pricedAt: o.logic.createdAt || null, pricedBy: o.logic.pricedBy || null, acceptedBy: o.logic.acceptedBy || null,
          releasedAt: o.logic.releasedAt || null, requirements: o.logic.requirements || [], allocatedSerials: o.logic.allocatedSerials || [],
          lastError: o.logic.lastError || null, paymentException: o.logic.paymentException || null,
          creditRelease: o.logic.creditRelease || null, paymentHold: o.logic.paymentHold || null,
          payout: owner ? o.logic.payout : null } : null, shipment: o.shipment || null,
        requests: Array.isArray(o.requests) ? o.requests.slice(-20) : [] };
    });
    /* OFF-02: the money tiles are the receivables ledger's own totals — the
       same rows() and totals() Accounting prints — never a sum the page
       makes. Totals only: byCustomer names customers and stays on Accounting. */
    var receivables = R.totals(R.rows(rows[0].docs.map(function (s) { return { id: s.id, order: s.data(), account: null }; }),
      new Date().toISOString().slice(0, 10), { provider: (((ctx.config || {}).ledgerSync) || {}).provider || 'none' }));
    delete receivables.byCustomer;
    var conf = Object.assign({ enabled: false, terms: { depositPct: 30, dueDays: 0 }, fee: { percent: 0.25, fixed: 0 } }, ctx.config);
    if (!owner) { delete conf.realmId; delete conf.itemRef; delete conf.accountingApproved; }
    /* access.prices: 'all' (ClearSky), 'workspace' (an owner or admin: what
       the workspace bills itself) or 'none'; access.team: may add and disable
       people on the Team page (api/logic-team.js). */
    return { owner: owner, org: org, name: ctx.org.name || org, brand: require('./_lib/logic-brand')(ctx.org), active: X.enabled(ctx), config: conf,
      access: { role: who.role, prices: who.clearsky ? 'all' : (who.admin ? 'workspace' : 'none'), team: who.clearsky || who.admin }, billing: billing,
      bundle: { name: 'Omega Logic', included: ['OEM order operations', 'White-label website sizer / platform lite', 'White-label sitemap editor resale'],
        subscriptionSeparate: true, subscriptionDue: ctx.billing.subscriptionDue || null },
      products: rows[2].exists ? (rows[2].data().products || []).length : 0,
      links: links(org, key && key.id), orders: orders, limited: rows[0].size === 100, intake: intake, receivables: receivables, totals: S.totals(orders), finance: S.finance(orders, owner) };
  }
  if (req.method !== 'POST') throw A.httpError(405, 'GET or POST only');
  if (b.action === 'configure') {
    X.requireOwner(caller);
    var terms = P.terms(b.terms), fee = { percent: Number(b.fee && b.fee.percent), fixed: Number(b.fee && b.fee.fixed || 0) };
    P.snapshot(100, terms, null, fee);
    var accounting = b.accounting === 'tenant' ? 'tenant' : 'quickbooks';
    var qbo = accounting === 'tenant' ? null : await Q.load(), realm = qbo && qbo.realmId;
    if (accounting !== 'tenant' && b.enabled && (!realm || !/^\d+$/.test(String(b.itemRef || '')) || b.accountingApproved !== true)) throw A.httpError(409, 'Connect QuickBooks and confirm an accountant-approved installment item before activating');
    var batch = db.batch(), root = db.collection('omega_orgs').doc(org);
    batch.set(root.collection('fulfillment').doc('config'), { enabled: b.enabled === true, terms: terms, fee: fee, accounting: accounting,
      realmId: realm || null, itemRef: accounting === 'tenant' ? '' : clean(b.itemRef, 40), accountingApproved: accounting === 'tenant' ? false : b.accountingApproved === true,
      payoutMode: 'wire', updatedBy: caller.email, updatedAt: new Date().toISOString() }, { merge: true });
    // Bundle entitlement does not charge a card or invent a subscription price.
    if (b.enabled) batch.set(root.collection('billing').doc('current'), {
      addons: A.FieldValue().arrayUnion('omega-logic', 'whitelabel'),
      bundle: 'omega-logic', bundleIncludes: ['platform-lite', 'white-label-sitemap-resale']
    }, { merge: true });
    await batch.commit(); return { ok: true };
  }
  /* Customer terms have ONE writer: api/buyers.js 'terms', keyed by the
     account. The branch that used to live here created an account per email
     and split companies; it is gone on purpose. */
  var orderId = P.id(b.orderId), ref = db.collection('orders').doc(orderId), row = await ref.get();
  if (!row.exists || row.data().orgId !== org) throw A.httpError(404, 'Order not found in this workspace');
  /* D1: ClearSky prices and accepts everything; a workspace owner or admin
     what the workspace bills itself. Checked here for a plain refusal, and
     again inside the workflow's one writer (W.price) before it writes. */
  if (b.action === 'price') { await X.requirePricer(caller, ctx, row.data()); return W.price(orderId, b.total, caller, b.accept === true); }
  if (b.action === 'accept') { await X.requirePricer(caller, ctx, row.data()); if (!row.data().logic) throw A.httpError(409, 'Approve the customer price first'); return W.price(orderId, row.data().logic.commercial.baseCents / 100, caller, true); }
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
  /* Tenant-billed orders: the OEM's office records its own invoice and the
     money that landed. An active OEM administrator may do this — it is their
     invoice — as may the ClearSky owner (every POST passed
     X.authorize(caller, org, true) above). The rules are api/_lib/receivables.js;
     the one writer is api/_lib/logic-workflow.js; the accounting page
     (logic-accounting.html) posts these same actions. */
  /* payUrl: the supplier's own pay link for that invoice (optional; https,
     checked in logic-workflow). Only passed through when the caller sent
     the key, so an office that leaves it out keeps the link it has. */
  if (b.action === 'invoice-issued') {
    var inv = { number: b.number, date: b.date, dueAt: b.dueAt };
    if (Object.prototype.hasOwnProperty.call(b, 'payUrl')) inv.payUrl = b.payUrl;
    return W.issueInvoice(orderId, b.stage, inv, caller);
  }
  if (b.action === 'payment-received') return W.recordPayment(orderId, b.stage, { amount: b.amount, date: b.date, bankReference: b.bankReference, reinstate: b.reinstate === true, reason: b.reason }, caller);
  /* A recorded payment is never deleted: it is voided with a reason, and the
     invoice goes back to what has really been received. When the order is in
     the plant on that deposit, keepBuilding says what happens next. */
  if (b.action === 'payment-void') return W.voidPayment(orderId, b.stage, { bankReference: b.bankReference, reason: b.reason,
    keepBuilding: b.keepBuilding === true || b.keepBuilding === false ? b.keepBuilding : undefined, poNumber: b.poNumber }, caller);
  /* Only the fields the body carries change; `dueAt: ''` (or null) is "back to terms". */
  if (b.action === 'invoice-edit') {
    var edit = { reason: b.reason };
    ['number', 'issuedAt', 'dueAt'].forEach(function (k) { if (b[k] !== undefined) edit[k] = b[k]; });
    return W.editInvoice(orderId, b.stage, edit, caller);
  }
  if (b.action === 'release-on-po') return W.releaseOnPo(orderId, { reason: b.reason, poNumber: b.poNumber }, caller);
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
