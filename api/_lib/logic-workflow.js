/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Durable per-order workflow. All money in integer cents. No browser-paid flags. */
'use strict';
var A = require('./admin'), P = require('./logic-policy'), X = require('./logic-access');
var Q = require('./qbo-sales'), Plant = require('./plant');
/* The RULES of a tenant-billed receivable (settle, void, release on PO,
   invoice edits, the ledger view) are PURE and live in ./receivables so the
   render fixture and the sandbox apply the same rules; THIS file is the one
   writer that applies them to an order. The workspace's own books
   (QuickBooks / Stripe) are reached only through ./ledger-sync, loaded
   lazily: a deployment without it still records invoices and payments. */
var R = require('./receivables');
function ledgerSync() { return require('./ledger-sync'); }
var PROVIDERS = ['quickbooks', 'stripe'], PROVIDER_NAME = { quickbooks: 'QuickBooks', stripe: 'Stripe' };
function physical(items){var rows=(items||[]).filter(function(i){return i.kind!=='service';});return rows.length?P.quantities(rows):{};}
function event(tx, ref, by, what) {
  tx.create(ref.collection('events').doc(), { at: new Date().toISOString(), by: by, what: what });
}
/* One omega_audit row per accounting write, in the same transaction. The
   Admin SDK refuses `undefined`, so absent keys are dropped, never written. */
function audit(tx, row) {
  var clean = {};
  Object.keys(row).forEach(function (k) { if (row[k] !== undefined) clean[k] = row[k]; });
  tx.create(A.db().collection('omega_audit').doc(), clean);
}
function chosenProvider(config) { var p = ((config || {}).ledgerSync || {}).provider; return PROVIDERS.indexOf(p) >= 0 ? p : null; }
function orderView(o) {
  var l = (o && o.logic) || {};
  return { status: o.status, releasedAt: l.releasedAt || null, creditRelease: l.creditRelease || null, paymentHold: l.paymentHold || null, paymentException: l.paymentException || null };
}
function usd(c) { return (Number(c || 0) / 100).toFixed(2); }
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
  /* The account is the order's stamp, else the account that ADMITTED the
     person it is billed to (B.stampableAccount): a join request still
     waiting or turned down neither gets the company's negotiated terms nor
     puts the order on the company. */
  var root = A.db().collection('omega_orgs').doc(order.orgId), override = null, stampAccount = null;
  var acctId = order.customerId ? P.id(order.customerId) : await require('./buyer-accounts').stampableAccount(A.db(), order.orgId, order.customer.email);
  if (acctId) {
    var cs = await root.collection('customers').doc(acctId).get();
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
/* An invoice recorded while the workspace has chosen QuickBooks or Stripe
   for its own books is stamped `ledger.state: 'pending'` and pushed there
   right after (a failed push is stored on the invoice and never fails the
   issue). An invoice issued BEFORE a provider was chosen is not pushed
   automatically — it may already be in those books — and is pushed or
   linked by an explicit action on the accounting page.
   `dueAt` is only set when the office gives one; otherwise the due date is
   derived from the terms (R.dueDate). A second call with the same number is
   a duplicate and changes nothing: corrections go through editInvoice, which
   keeps their history. */
async function issueInvoice(orderId, stage, b, caller) {
  var db = A.db(), ref = db.collection('orders').doc(P.id(orderId)), number = String(b && b.number || '').trim().slice(0, 80), date = String(b && b.date || '').slice(0, 10);
  var dueAt = b && b.dueAt != null ? String(b.dueAt).trim() : '';
  if (!number) throw A.httpError(400, 'Invoice number required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date))) throw A.httpError(400, 'Invoice date must be YYYY-MM-DD');
  if (dueAt && !R.isDate(dueAt)) throw A.httpError(400, 'Due date must be YYYY-MM-DD');
  if (dueAt && dueAt < date) throw A.httpError(400, 'The due date cannot be before the invoice date');
  var stamped = false;
  var out = await db.runTransaction(async function (tx) {
    stamped = false; /* a retried transaction starts over */
    var s = await tx.get(ref); if (!s.exists) throw A.httpError(404, 'Order not found');
    var o = s.data(), l = o.logic; if (!l || l.accounting !== 'tenant') throw A.httpError(409, 'This order is billed through QuickBooks; invoices are issued there');
    var inv = stageOf(l, stage); if (!inv.amountCents) throw A.httpError(409, 'Nothing is due at this stage');
    if (inv.id && inv.id !== number) throw A.httpError(409, 'Invoice ' + inv.id + ' is already recorded for this stage');
    if (inv.id === number) return { ok: true, duplicate: true, invoice: inv };
    var other = stage === 'deposit' ? 'balance' : 'deposit';
    if (l.invoices[other] && l.invoices[other].id === number) throw A.httpError(409, 'Invoice ' + number + ' is already the ' + other + ' invoice on this order');
    var conf = await tx.get(db.collection('omega_orgs').doc(o.orgId).collection('fulfillment').doc('config'));
    var provider = chosenProvider(conf.exists ? conf.data() : {}), at = new Date().toISOString();
    var updated = Object.assign({}, inv, { id: number, issuedAt: date, issuedBy: caller.email, dueAt: dueAt || null });
    if (provider && !inv.ledger) {
      stamped = true;
      updated.ledger = { provider: provider, state: 'pending', invoiceId: null, number: null, customerId: null, company: null, hostedUrl: null, totalCents: null,
        at: at, by: caller.email, error: null, warning: null, lastPullAt: null };
    }
    Object.assign(updated, R.settle(updated));
    var changes = {}; changes['logic.invoices.' + stage] = updated; tx.update(ref, changes);
    event(tx, ref, caller.email, stage + ' invoice ' + number + ' issued ' + date + ' for USD ' + (inv.amountCents / 100) + (dueAt ? ' · due ' + dueAt : ''));
    audit(tx, { orgId: o.orgId, action: 'ledger-invoice-issued', orderId: ref.id, orderNo: o.orderNo || null, stage: stage, by: caller.email, at: at,
      after: { number: number, issuedAt: date, dueAt: dueAt || null, ledger: stamped ? provider : null } });
    return { ok: true, duplicate: false, invoice: updated };
  });
  if (stamped) {
    try { out.sync = await syncLedger(orderId, caller); }
    catch (e) { out.sync = { ok: false, error: e.message }; }
  }
  return out;
}
/* A payment is cumulative and idempotent by bank reference (R.refKey: case
   and spacing folded). A placeholder reference is refused on every path; a
   reference that was VOIDED is never silently received again — the office
   may reinstate it deliberately, with a reason, as a new entry (the voided
   one stays). opts: { source: 'office'|'quickbooks'|'stripe', external,
   amountCents (the sync's own integer, instead of b.amount), noProcess (the
   sync runs the workflow once itself) }. */
async function recordPayment(orderId, stage, b, caller, opts) {
  b = b || {}; opts = opts || {};
  var db = A.db(), ref = db.collection('orders').doc(P.id(orderId));
  var amount = opts.amountCents != null ? Number(opts.amountCents) : P.cents(b.amount);
  if (!Number.isInteger(amount) || amount < 0) throw A.httpError(400, 'Invalid amount');
  var out = await db.runTransaction(async function (tx) {
    var s = await tx.get(ref); if (!s.exists) throw A.httpError(404, 'Order not found');
    var o = s.data(), l = o.logic || {}, at = new Date().toISOString();
    var p = { amountCents: amount, date: String(b.date || '').slice(0, 10), bankReference: String(b.bankReference == null ? '' : b.bankReference), by: caller.email, at: at,
      source: opts.source || 'office', reinstate: b.reinstate === true, reason: b.reason };
    if (opts.external) p.external = opts.external;
    var plan = R.recordPlan(o, stage, p);
    if (plan.duplicate) return { ok: true, duplicate: true, invoice: plan.invoice };
    var changes = {}; changes['logic.invoices.' + stage] = plan.invoice; changes['logic.nextRunAt'] = Date.now();
    if (plan.liftHold) { changes['logic.paymentHold'] = null; changes['logic.paymentException'] = null; }
    tx.update(ref, changes);
    event(tx, ref, caller.email, plan.event);
    audit(tx, { orgId: o.orgId, action: plan.entry.reinstates != null ? 'ledger-payment-reinstated' : 'ledger-payment-recorded', orderId: ref.id, orderNo: o.orderNo || null, stage: stage,
      by: caller.email, at: at, reason: plan.entry.reinstateReason, source: plan.entry.source,
      after: { entry: plan.entry, status: plan.invoice.status, paidCents: plan.invoice.paidCents, holdLifted: !!plan.liftHold } });
    return { ok: true, invoice: plan.invoice };
  });
  if (!out.duplicate && !opts.noProcess) out.workflow = await processOrder(orderId, { sync: false });
  return out;
}
/* VOID, never delete. The entry stays with voidedAt/By/Reason/Source and the
   invoice is recomputed from what is not voided. If the order is in the
   plant on the deposit being voided, the office chooses: keep building on
   the PO (a credit release explains the release) or hold (paymentHold +
   paymentException, which every plant scan already refuses). A void from a
   provider cannot ask, so it holds. The works order, the units and
   releasedAt are never touched here. */
async function voidPayment(orderId, stage, b, caller, opts) {
  b = b || {}; opts = opts || {};
  var db = A.db(), ref = db.collection('orders').doc(P.id(orderId));
  return db.runTransaction(async function (tx) {
    var s = await tx.get(ref); if (!s.exists) throw A.httpError(404, 'Order not found');
    var o = s.data(), l = o.logic || {}, at = new Date().toISOString();
    var v = { bankReference: String(b.bankReference == null ? '' : b.bankReference), reason: b.reason, by: caller.email, at: at, source: opts.source || 'office' };
    if (b.keepBuilding === true || b.keepBuilding === false) v.keepBuilding = b.keepBuilding;
    if (b.poNumber != null) v.poNumber = b.poNumber;
    var plan = R.voidPlan(o, stage, v);
    if (plan.duplicate) return { ok: true, duplicate: true, invoice: plan.invoice, order: orderView(o) };
    var prev = l.invoices[stage], before = Object.assign({}, plan.voided);
    ['voidedAt', 'voidedBy', 'voidReason', 'voidSource'].forEach(function (k) { delete before[k]; });
    var changes = {}; changes['logic.invoices.' + stage] = plan.invoice; changes['logic.nextRunAt'] = Date.now();
    if (plan.creditRelease) changes['logic.creditRelease'] = plan.creditRelease;
    if (plan.hold) { changes['logic.paymentHold'] = plan.hold; changes['logic.paymentException'] = plan.hold.message; }
    /* The owner's "cleared receipts" (logic.payout, owner-only) was confirmed
       against what was recorded then. It is ClearSky's own settlement ledger
       and is never rewritten from here; when a void leaves it above what is
       now recorded, the event and the audit row say so, and the owner
       reviews it. */
    var recorded = Object.keys(l.invoices).reduce(function (n, k) { return n + (k === stage ? plan.invoice.paidCents : Number(l.invoices[k].paidCents) || 0); }, 0);
    var cleared = Number((l.payout || {}).clearedCents) || 0, payoutReview = cleared > recorded ? { clearedCents: cleared, recordedCents: recorded } : null;
    tx.update(ref, changes);
    event(tx, ref, caller.email, plan.event + (payoutReview ? ' · cleared receipts confirmed earlier (USD ' + usd(cleared) + ') now exceed what is recorded (USD ' + usd(recorded) + '); the owner reviews the wire settlement' : ''));
    audit(tx, { orgId: o.orgId, action: 'ledger-payment-void', orderId: ref.id, orderNo: o.orderNo || null, stage: stage, by: caller.email, at: at,
      reason: plan.voided.voidReason, source: v.source,
      before: { entry: before, status: prev.status || null, paidCents: prev.paidCents || 0 },
      after: { status: plan.invoice.status, paidCents: plan.invoice.paidCents, creditRelease: plan.creditRelease || null, hold: plan.hold || null, payoutReview: payoutReview } });
    var after = Object.assign({}, o, { logic: Object.assign({}, l, plan.creditRelease ? { creditRelease: plan.creditRelease } : {},
      plan.hold ? { paymentHold: plan.hold, paymentException: plan.hold.message } : {}) });
    return { ok: true, invoice: plan.invoice, order: orderView(after) };
  });
}
/* Correct an issued invoice's number, issue date or due date. Amounts are
   derived from the commercial snapshot and are never edited here; every
   change is kept in invoice.edits[] with what it was, and an event. */
async function editInvoice(orderId, stage, b, caller) {
  b = b || {};
  var db = A.db(), ref = db.collection('orders').doc(P.id(orderId));
  return db.runTransaction(async function (tx) {
    var s = await tx.get(ref); if (!s.exists) throw A.httpError(404, 'Order not found');
    var o = s.data(), at = new Date().toISOString(), v = { reason: b.reason, by: caller.email, at: at };
    if (b.number != null) v.number = b.number;
    if (b.issuedAt != null) v.issuedAt = b.issuedAt;
    if (b.dueAt !== undefined) v.dueAt = b.dueAt === null ? '' : b.dueAt;
    var plan = R.editPlan(o, stage, v);
    if (plan.duplicate) return { ok: true, duplicate: true, invoice: plan.invoice };
    var changes = {}; changes['logic.invoices.' + stage] = plan.invoice; tx.update(ref, changes);
    event(tx, ref, caller.email, plan.event);
    audit(tx, { orgId: o.orgId, action: 'ledger-invoice-edit', orderId: ref.id, orderNo: o.orderNo || null, stage: stage, by: caller.email, at: at,
      reason: plan.edit.reason, before: plan.edit.was, after: plan.edit.now });
    return { ok: true, invoice: plan.invoice };
  });
}
/* RELEASE ON PO: an owner/admin lets the plant start before the deposit is
   received. logic.creditRelease satisfies the deposit gate in release() —
   and nothing else: shipment still needs the deposit AND the balance
   recorded (finish()). Lifts a payment hold. */
async function releaseOnPo(orderId, b, caller) {
  b = b || {};
  var db = A.db(), ref = db.collection('orders').doc(P.id(orderId));
  var out = await db.runTransaction(async function (tx) {
    var s = await tx.get(ref); if (!s.exists) throw A.httpError(404, 'Order not found');
    var o = s.data(), at = new Date().toISOString();
    var plan = R.releasePlan(o, { reason: b.reason, poNumber: b.poNumber, by: caller.email, at: at });
    if (plan.duplicate) return { ok: true, duplicate: true, creditRelease: plan.creditRelease };
    var changes = { 'logic.creditRelease': plan.creditRelease, 'logic.nextRunAt': Date.now() };
    if (plan.liftHold) { changes['logic.paymentHold'] = null; changes['logic.paymentException'] = null; }
    tx.update(ref, changes);
    event(tx, ref, caller.email, plan.event);
    audit(tx, { orgId: o.orgId, action: 'ledger-release-on-po', orderId: ref.id, orderNo: o.orderNo || null, stage: 'deposit', by: caller.email, at: at,
      reason: plan.creditRelease.reason, after: { creditRelease: plan.creditRelease, holdLifted: !!plan.liftHold } });
    return { ok: true, creditRelease: plan.creditRelease };
  });
  if (!out.duplicate) out.workflow = await processOrder(orderId, { sync: false });
  var fresh = (await ref.get()).data() || {};
  out.order = { status: fresh.status, releasedAt: (fresh.logic || {}).releasedAt || null, worksOrderId: fresh.worksOrderId || null };
  return out;
}

/* ── the workspace's own books (QuickBooks or Stripe) ─────────────────────
   Only this file writes order money fields; ./ledger-sync only talks to the
   provider and to its own integrations/** documents. `view` is everything
   the provider may know about one invoice. */
async function configOf(orgId) {
  var c = await A.db().collection('omega_orgs').doc(orgId).collection('fulfillment').doc('config').get();
  return c.exists ? c.data() : {};
}
async function viewOf(o, orderId, stage, config) {
  var db = A.db(), org = o.orgId, c = o.customer || {}, l = o.logic || {}, inv = l.invoices[stage];
  var cid = o.customerId || await require('./buyer-accounts').accountOfOrder(db, org, o), name = null;
  if (cid) {
    try { var cs = await db.collection('omega_orgs').doc(org).collection('customers').doc(P.id(cid)).get(); if (cs.exists) name = cs.data().name || null; }
    catch (e) { if (!e.status) throw e; }
  }
  return { id: orderId, orgId: org, orderNo: o.orderNo || null, poNumber: R.poOf(o),
    customer: { name: c.name || '', company: c.company || '', email: c.email || '' },
    account: { id: cid || null, key: cid ? 'account:' + cid : 'email:' + String(c.email || '').toLowerCase(), name: name || c.company || c.name || c.email || '' },
    invoice: { stage: stage, number: inv.id || null, issuedAt: inv.issuedAt || inv.date || null, dueAt: R.dueDate(inv, (l.commercial || {}).terms), amountCents: inv.amountCents,
      ledger: inv.ledger || null, payments: inv.payments || [] },
    ledgerSync: config.ledgerSync || null };
}
var NOT_TENANT = 'This order is billed through QuickBooks; payments are reconciled there';
async function putInLedger(mode, orderId, stage, providerInvoiceId, caller) {
  var db = A.db(), ref = db.collection('orders').doc(P.id(orderId)), snap = await ref.get();
  if (!snap.exists) throw A.httpError(404, 'Order not found');
  var o = snap.data(), l = o.logic;
  if (!l || l.accounting !== 'tenant') throw A.httpError(409, NOT_TENANT);
  var inv = stageOf(l, stage), config = await configOf(o.orgId), p = chosenProvider(config);
  if (!p) throw A.httpError(409, 'Choose QuickBooks or Stripe on the accounting page first');
  if (!inv.id) throw A.httpError(409, 'Record the ' + stage + ' invoice as issued first');
  if (inv.ledger && inv.ledger.invoiceId) {
    if (mode === 'link' && (inv.ledger.provider !== p || inv.ledger.invoiceId !== providerInvoiceId)) throw A.httpError(409, 'This invoice is already linked to ' + PROVIDER_NAME[inv.ledger.provider] + ' invoice ' + inv.ledger.invoiceId);
    return { ok: true, duplicate: true, ledger: inv.ledger, payUrl: inv.payUrl || null };
  }
  var view = await viewOf(o, ref.id, stage, config), got, by = caller.email;
  try { got = mode === 'link' ? await ledgerSync().providers[p].linkInvoice(o.orgId, view, stage, providerInvoiceId) : await ledgerSync().providers[p].pushInvoice(o.orgId, view, stage); }
  catch (e) {
    /* the failure is kept on the invoice for the accounting page, then rethrown */
    await db.runTransaction(async function (tx) {
      var cur = (await tx.get(ref)).data(), ci = cur.logic.invoices[stage];
      if (ci.ledger && ci.ledger.invoiceId) return;
      var changes = {};
      changes['logic.invoices.' + stage + '.ledger'] = Object.assign({ provider: p, invoiceId: null, number: null, customerId: null, company: null, hostedUrl: null, totalCents: null, warning: null, lastPullAt: null },
        ci.ledger || {}, { provider: p, state: 'error', at: new Date().toISOString(), by: by, error: String(e.message || e).slice(0, 300) });
      tx.update(ref, changes);
    });
    throw e;
  }
  return db.runTransaction(async function (tx) {
    var cur = (await tx.get(ref)).data(), ci = cur.logic.invoices[stage], at = new Date().toISOString();
    if (ci.ledger && ci.ledger.invoiceId) {
      if (ci.ledger.invoiceId === String(got.invoiceId)) return { ok: true, duplicate: true, ledger: ci.ledger, payUrl: ci.payUrl || null };
      throw A.httpError(409, 'This invoice is already linked to ' + PROVIDER_NAME[ci.ledger.provider] + ' invoice ' + ci.ledger.invoiceId);
    }
    var hosted = /^https:\/\//.test(String(got.hostedUrl || '')) ? String(got.hostedUrl) : null;
    var ledger = { provider: p, state: mode === 'link' ? 'linked' : 'pushed', invoiceId: String(got.invoiceId), number: got.number == null ? null : String(got.number),
      customerId: got.customerId == null ? null : String(got.customerId), company: got.company == null ? null : String(got.company), hostedUrl: hosted,
      totalCents: got.totalCents == null ? null : Number(got.totalCents), at: at, by: by, error: null, warning: got.warning ? String(got.warning).slice(0, 300) : null, lastPullAt: null };
    /* what the provider said when the invoice went in (a QuickBooks total
       that differs, Stripe's per-payment cap) is a fact about that invoice:
       kept apart so a later pull with nothing to say does not erase it */
    ledger.pushWarning = ledger.warning;
    var changes = {}; changes['logic.invoices.' + stage + '.ledger'] = ledger;
    if (hosted) changes['logic.invoices.' + stage + '.payUrl'] = hosted;
    tx.update(ref, changes);
    event(tx, ref, by, mode === 'link' ? stage + ' invoice ' + ci.id + ' linked to ' + PROVIDER_NAME[p] + ' invoice ' + ledger.invoiceId
      : stage + ' invoice ' + ci.id + ' pushed to ' + PROVIDER_NAME[p] + ' (' + ledger.invoiceId + ')');
    audit(tx, { orgId: cur.orgId, action: mode === 'link' ? 'ledger-invoice-link' : 'ledger-invoice-push', orderId: ref.id, orderNo: cur.orderNo || null, stage: stage, by: by, at: at,
      source: p, after: ledger });
    return { ok: true, ledger: ledger, payUrl: hosted || ci.payUrl || null };
  });
}
function pushLedgerInvoice(orderId, stage, caller) { return putInLedger('push', orderId, stage, null, caller); }
function linkLedgerInvoice(orderId, stage, providerInvoiceId, caller) { return putInLedger('link', orderId, stage, String(providerInvoiceId || ''), caller); }
/* Push what is pending, then read the payments back from the provider and
   apply them through recordPayment / voidPayment — the same rules the office
   uses. A provider never re-receives a voided reference (a conflict, not a
   write) and never reinstates. Only the provider's refusal of the whole
   invoice throws; one payment that does not fit is a conflict on the stage. */
async function tenantSync(orderId, config) {
  var ref = A.db().collection('orders').doc(P.id(orderId)), snap = await ref.get();
  if (!snap.exists) throw A.httpError(404, 'Order not found');
  var o = snap.data();
  if (!o.logic || o.logic.accounting !== 'tenant') throw A.httpError(409, NOT_TENANT);
  config = config || await configOf(o.orgId);
  var p = chosenProvider(config);
  if (!p) return { ok: true, provider: 'none', skipped: 'none' };
  var provider = ledgerSync().providers[p], sync = { email: p + '-sync' };
  if (!(await provider.ready(o.orgId))) return { ok: true, provider: p, skipped: 'not-connected' };
  var out = { ok: true, provider: p, stages: {} };
  for (var stage of R.STAGES) {
    o = (await ref.get()).data();
    var inv = o.logic.invoices[stage];
    if (!inv || !inv.amountCents || !inv.id) continue;
    var st = { pushed: false, recorded: [], voided: [], conflicts: [], warning: null }, touched = false;
    if (inv.ledger && inv.ledger.state === 'pending' && inv.ledger.provider === p) {
      touched = true;
      try { var pushed = await putInLedger('push', orderId, stage, null, { email: 'omega-logic' }); st.pushed = !pushed.duplicate; }
      catch (e) { st.error = String(e.message || e).slice(0, 300); }
      o = (await ref.get()).data(); inv = o.logic.invoices[stage];
    }
    if (inv.ledger && inv.ledger.invoiceId && inv.ledger.provider === p) {
      touched = true;
      var pulled = await provider.pullPayments(o.orgId, await viewOf(o, ref.id, stage, config), stage), note = null;
      for (var item of pulled || []) {
        var cur = (await ref.get()).data().logic.invoices[stage], key = R.refKey(item.ref), pays = cur.payments || [];
        var active = pays.filter(function (x) { return !x.voidedAt && R.refKey(x.bankReference) === key; })[0];
        var voided = pays.filter(function (x) { return x.voidedAt && R.refKey(x.bankReference) === key; }).pop();
        if (item.warning) note = String(item.warning);
        try {
          if (active) {
            if (item.reversed) { var vr = await voidPayment(orderId, stage, { bankReference: active.bankReference }, sync, { source: p }); if (!vr.duplicate) st.voided.push(item.ref); }
            else if (Number(item.amountCents) !== active.amountCents) st.conflicts.push(item.ref + ' now applies USD ' + usd(item.amountCents) + ' in ' + PROVIDER_NAME[p] + ' (recorded USD ' + usd(active.amountCents) + '); void and re-record by hand');
          } else if (voided) {
            if (!item.reversed) st.conflicts.push(item.ref + ' was voided in Omega Logic on ' + String(voided.voidedAt).slice(0, 10) + '; not recorded again');
          } else if (!item.reversed) {
            var rec = await recordPayment(orderId, stage, { date: item.date, bankReference: item.ref }, sync, { source: p, external: item.external, amountCents: item.amountCents, noProcess: true });
            if (!rec.duplicate) st.recorded.push(item.ref);
          }
        } catch (e) {
          if (!e.status || e.status >= 500) throw e;
          st.conflicts.push(item.ref + ': ' + e.message);
        }
      }
      st.warning = st.conflicts.length ? st.conflicts[st.conflicts.length - 1] : note;
      await A.db().runTransaction(async function (tx) {
        var c = (await tx.get(ref)).data(), changes = {}, lg = (c.logic.invoices[stage] || {}).ledger;
        if (!lg) return;
        changes['logic.invoices.' + stage + '.ledger.lastPullAt'] = new Date().toISOString();
        /* the pull's own conflict or warning first; with none, the warning
           the invoice was pushed with stands */
        var w = st.warning || lg.pushWarning || null;
        changes['logic.invoices.' + stage + '.ledger.warning'] = w ? String(w).slice(0, 300) : null;
        tx.update(ref, changes);
      });
    }
    if (touched) out.stages[stage] = st;
  }
  return out;
}
/* logic.ledgerSyncError: the last sync failure on this order, written only
   when it changes and cleared on success. It is NOT logic.lastError and
   never blocks fulfilment. */
async function markSyncError(ref, provider, err) {
  var cur = ((await ref.get()).data().logic || {}).ledgerSyncError || null;
  if (err) {
    var message = String(err.message || err).slice(0, 300);
    if (!cur || cur.message !== message || cur.provider !== provider) await ref.update({ 'logic.ledgerSyncError': { provider: provider, message: message, at: new Date().toISOString() } });
  } else if (cur) await ref.update({ 'logic.ledgerSyncError': null });
}
/* The explicit sync (accounting page "Sync payments now", the Stripe webhook
   as a hint): push + pull, then run the workflow once. */
async function syncLedger(orderId, caller, opts) {
  var ref = A.db().collection('orders').doc(P.id(orderId)), snap = await ref.get();
  if (!snap.exists) throw A.httpError(404, 'Order not found');
  var o = snap.data();
  if (!o.logic || o.logic.accounting !== 'tenant') throw A.httpError(409, NOT_TENANT);
  var config = await configOf(o.orgId), p = chosenProvider(config), out;
  try { out = await tenantSync(orderId, config); }
  catch (e) {
    /* what was recorded before the failure still takes effect now */
    if (p) { await markSyncError(ref, p, e); await processOrder(orderId, { sync: false }); }
    throw e;
  }
  if (out.skipped) return out;
  await markSyncError(ref, p, null);
  out.workflow = await processOrder(orderId, { sync: false });
  return out;
}
async function release(ref) {
  var db = A.db();
  return db.runTransaction(async function (tx) {
    var snap = await tx.get(ref), o = snap.data(), l = o.logic;
    if (o.cancelRequested || o.status === 'cancelled' || !l.acceptedAt || l.releasedAt) return;
    var dep = l.invoices.deposit;
    /* The deposit gate. A credit release (release on PO, api/logic-office.js
       'release-on-po', or "keep building" when a payment is voided) is the
       one thing besides the recorded deposit that opens it. */
    if (dep.amountCents && !dep.satisfied && !l.creditRelease) return;
    var onCredit = !!(dep.amountCents && !dep.satisfied);
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
    event(tx, ref, 'omega-logic', onCredit
      ? 'Released on PO ' + (l.creditRelease.poNumber || '(no PO number)') + ' (credit release by ' + l.creditRelease.by + ') before the deposit; ' + selected.length + ' finished units reserved; manufacturing requirements released'
      : 'Deposit verified; ' + selected.length + ' finished units reserved; manufacturing requirements released');
  });
}
async function processOrder(orderId, opts) {
  opts = opts || {};
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
    /* TENANT-BILLED with the workspace's own books chosen: push what is
       pending and read the payments back BEFORE the release step, so a
       deposit paid in QuickBooks or Stripe releases in this same run. A sync
       failure is logic.ledgerSyncError on the order — never lastError, never
       a block on fulfilment. */
    o = (await ref.get()).data();
    var syncWith = o.logic.accounting === 'tenant' && opts.sync !== false ? chosenProvider(ctx.config) : null;
    if (syncWith) {
      try { await tenantSync(orderId, ctx.config); await markSyncError(ref, syncWith, null); }
      catch (syncFailed) { await markSyncError(ref, syncWith, syncFailed); }
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
        /* complete ⇒ paid in full, like shipped: an order released on its PO still owes the deposit */
        if(current.status==='complete'||current.cancelRequested||l.paymentException||!work.exists||!work.data().serviceCompletion||!l.invoices.balance||(l.commercial.balanceCents&&!l.invoices.balance.satisfied)||(l.invoices.deposit&&l.invoices.deposit.amountCents&&!l.invoices.deposit.satisfied))return;
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
      /* A credit release breaks "released ⇒ deposit paid"; shipment keeps
         "shipped ⇒ paid in full" (api/logic-logistics.js pickup refuses the
         same case). No terms-based early shipping exists. */
      if (l.invoices.deposit && l.invoices.deposit.amountCents && !l.invoices.deposit.satisfied) throw A.httpError(409, 'The deposit must be recorded before shipment (this order was released on its PO)');
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
module.exports = { price: price, release: release, processOrder: processOrder, finish: finish, event: event, issueInvoice: issueInvoice, recordPayment: recordPayment,
  voidPayment: voidPayment, editInvoice: editInvoice, releaseOnPo: releaseOnPo, pushLedgerInvoice: pushLedgerInvoice, linkLedgerInvoice: linkLedgerInvoice, syncLedger: syncLedger };
