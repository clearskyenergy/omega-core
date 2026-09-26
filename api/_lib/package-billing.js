/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Admin-SDK subscription orchestration. Preview is read-only. All activation
 * writes require an explicitly marked sandbox tenant and enabled sandbox book.
 */
'use strict';
var B = require('./pricebook'), P = require('./subscription-pricing'), Policy = require('./package-billing-policy');
var Mode = require('./packaging-mode');
var BP = require('./billing-profile'), Q = require('./qbo-billing'), M = require('./modules'), R = require('./proration'), U = require('./usage');
function fail(message, status) { var e = new Error(message); e.status = status || 409; throw e; }
function clean(b) { var out = Object.assign({}, b); delete out.activationLock; return out; }
function basis(c) { return Q.key(B.stable({ org: c.org, billing: clean(c.billing), profile: c.profile, book: c.book })); }
async function context(db, orgId, version) {
  var root = db.doc('omega_orgs/' + orgId);
  var rows = await Promise.all([root.get(), root.collection('billing').doc('current').get(), root.collection('billing').doc('profile').get()]);
  if (!rows[0].exists) fail('Organization not found', 404);
  var billing = rows[1].exists ? rows[1].data() : {};
  var book = await B.load(db, version || billing.pricebookVersion || B.VERSION);
  return { root: root, org: rows[0].data(), billing: billing, profile: rows[2].exists ? rows[2].data() : null, book: book };
}
/* Two modes, both explicit (api/_lib/packaging-mode.js). SANDBOX: QBO_ENV=sandbox,
   a tenant marked packagingSandbox, an enabled sandbox book. LIVE:
   PACKAGING_LIVE=true AND QBO_ENV=production, an enabled book under a release
   version synced to the production company; every tenant may then buy. */
var live = Mode.live;
function guard(c) {
  if (process.env.PACKAGING_BILLING_ENABLED !== 'true') fail('Packaging billing is disabled');
  if (Mode.live()) {
    if (!c.book.enabled || c.book.version !== B.VERSION || c.book.qbo.env !== 'production' || !c.book.qbo.realmId) fail('An enabled price book synced to the production QuickBooks company is required');
    return;
  }
  if (!Mode.sandbox()) fail('Packaging billing requires QBO_ENV=sandbox (or PACKAGING_LIVE=true with QBO_ENV=production)');
  if (c.org.packagingSandbox !== true) fail('An explicitly marked sandbox tenant is required');
  if (!c.book.enabled || c.book.version !== B.VERSION || c.book.qbo.env !== 'sandbox') fail('An enabled proposed sandbox price book is required');
}
function canApply(c) { try { guard(c); return true; } catch (e) { return false; } }
function prepare(c, input, now) {
  if (c.profile && c.profile.syncLock && c.profile.syncLock.until > now) fail('Billing profile update is running; refresh shortly');
  var at = input.effectiveAt == null ? Math.floor(now / 60000) * 60000 : input.effectiveAt;
  if (!Number.isSafeInteger(at) || at > now || now - at > 10 * 60000) fail('Refresh the activation preview');
  var profile = BP.stored(c.profile), selected = Policy.terms(input, c.book, at), action = input.action || 'approve';
  var patch;
  if (action === 'approve') patch = Policy.approve(c.org, c.billing, selected, c.book, at, process.env.TRIAL_DAYS);
  else if (action === 'activate') {
    if (c.org.status !== 'active') fail('Paid activation requires an active organization');
    /* a packaged record that is still `pending` is a signup nobody has
       approved or paid: activation is its first step, not a change */
    if (c.billing.packaged === true && c.billing.packagingState !== 'pending') fail('Use plan-change for an existing packaged subscription');
    if (c.billing.trialEndsAt != null) fail('Existing trial dates must be preserved; review the legacy tenant separately');
    /* the signup instant may sit inside the same minute the activation is
       floored to (pay-at-the-end activates seconds after the record is
       made): it must exist and not be in the future, judged against now */
    var signup = Policy.instant(c.org.signedUpAt);
    if (!isFinite(signup) || signup > now) fail('Original signup date is required');
    patch = Object.assign({}, selected, M.resolve(['lite']), { packaged: true, modules: ['lite'], subscription: Policy.subscription(selected, at), packagingState: 'awaiting_payment',
      billingProvider: 'quickbooks', paymentProvider: 'quickbooks', qboEnv: c.book.qbo.env,
      proposedPackage: selected, billingDay: new Date(signup).getUTCDate(), nextInvoiceOn: R.iso(at), subscriptionStartedAt: at,
      accessUntil: at, status: 'active' });
  } else fail('Action must be approve or activate', 400);
  var plan = action === 'activate' ? Policy.invoice(Object.assign({}, patch, selected), c.book, patch.nextInvoiceOn) : null;
  if (plan) plan.marker = 'OMEGA subscription ' + c.root.id + ' / ' + plan.date;
  var source = basis(c), id = Q.key(B.stable({ source: source, action: action, patch: patch, plan: plan }));
  return { id: id, source: source, action: action, effectiveAt: at, profile: profile, selected: selected, patch: patch, plan: plan,
    quote: P.quote(selected.modules, c.book, { plan: selected.plan, builders: selected.builders, viewers: selected.viewers,
      serviceFee: selected.serviceFee, credit: selected.credit, interval: selected.interval, now: at }) };
}
function display(c, p) {
  return { dryRun: true, orgId: c.root.id, previewId: p.id, effectiveAt: p.effectiveAt,
    quote: p.quote, billingPatch: p.patch, invoice: p.plan,
    scheduledInvoice: p.action === 'approve' ? Policy.invoice(p.patch, c.book, p.patch.nextInvoiceOn) : null,
    customer: BP.customer(p.profile, c.root.id),
    trialStartsOnApproval: p.action === 'approve', billingDay: p.patch.billingDay,
    canApply: canApply(c),
    notice: p.action === 'approve' ? 'Approval creates the sandbox customer and starts the one trial. The first invoice is issued at trial end.' : 'Access starts only after the sandbox invoice is confirmed paid.' };
}
async function preview(db, orgId, input, now) { var c = await context(db, orgId, input.pricebookVersion); return display(c, prepare(c, input, now)); }
async function reread(tx, db, c) {
  var rows = await Promise.all([tx.get(c.root), tx.get(c.root.collection('billing').doc('current')),
    tx.get(c.root.collection('billing').doc('profile')), tx.get(db.doc('pricebook/' + c.book.version))]);
  return { root: c.root, org: rows[0].data(), billing: rows[1].exists ? rows[1].data() : {}, profile: rows[2].data(), book: rows[3].data() };
}
async function apply(db, orgId, input, caller, now, deps) {
  /* Staff, or the signup itself paying at the end (api/tenant-signup.js
     payNow: the caller is the new workspace's owner, marked selfServe by
     that one path and recorded as such in the history and the audit). */
  if (!caller.staff && caller.selfServe !== true) fail('Staff only', 403);
  var c = await context(db, orgId, input.pricebookVersion); guard(c);
  var requestBody = Object.assign({}, input); delete requestBody.dryRun; delete requestBody.previewId;
  var requestFingerprint = Q.key(B.stable(requestBody));
  if (typeof input.previewId === 'string' && /^[a-f0-9]{48}$/.test(input.previewId)) {
    var previous = await c.root.collection('billing').doc('current').collection('operations').doc(input.previewId).get();
    if (previous.exists && previous.data().state === 'done') {
      if (previous.data().requestFingerprint !== requestFingerprint) fail('An activation id cannot be reused with different inputs');
      return previous.data().result;
    }
  }
  var p = prepare(c, input, now);
  if (input.previewId !== p.id) fail('Preview changed; review the current server preview before applying');
  var current = c.root.collection('billing').doc('current'), op = current.collection('operations').doc(p.id);
  var replay = await db.runTransaction(async function (tx) {
    var old = await tx.get(op), fresh = await reread(tx, db, c);
    if (old.exists && old.data().state === 'done') return old.data().result;
    guard(fresh); if (basis(fresh) !== p.source) fail('Tenant or price book changed; refresh the preview');
    var lock = fresh.billing.activationLock;
    if (lock && lock.until > now) fail('Activation is already running; retry shortly');
    tx.set(current, { activationLock: { id: p.id, until: now + 120000 } }, { merge: true });
    tx.set(op, { state: 'running', at: now, by: caller.email, action: p.action, requestFingerprint: requestFingerprint }, { merge: true });
    return null;
  });
  if (replay) return replay;
  try {
    var q = Q.driver(c.book, deps), customer = await q.customer(orgId, p.profile, c.billing.qboCustomerId);
    var issued = p.plan ? await q.invoice(p.plan, p.profile, customer) : null;
    return await db.runTransaction(async function (tx) {
      var fresh = await reread(tx, db, c);
      guard(fresh);
      if (!fresh.billing.activationLock || fresh.billing.activationLock.id !== p.id || basis(fresh) !== p.source) fail('Activation inputs changed; refresh and retry');
      var patch = Object.assign({}, p.patch, { qboCustomerId: customer, qboRealmId: c.book.qbo.realmId,
        activationLock: null, updatedAt: now, updatedBy: caller.email });
      patch.serviceFee = Object.assign({}, patch.serviceFee, { by: caller.email, at: now });
      if (issued) {
        patch.paymentLink = issued.payUrl; patch.amountDue = issued.totalCents / 100;
        patch.nextInvoiceOn = p.plan.nextInvoiceOn; patch.firstInvoiceOn = p.plan.date; patch.serviceFeeNextOn = p.plan.serviceFeeNextOn;
        tx.set(current.collection('invoices').doc(p.plan.date), Object.assign({}, p.plan, { state: 'unpaid', qboInvoiceId: issued.id,
          qboCustomerId: customer, totalCents: issued.totalCents, paymentLink: issued.payUrl, createdAt: now }));
        tx.set(c.root.collection('notifications').doc('package-invoice-' + p.plan.date), { kind: 'billing', read: false, createdAt: now,
          text: 'Your subscription invoice is ready: ' + P.money(issued.totalCents) + '. Pay in QuickBooks to continue.',
          packageMail: 'packageInvoice', mailState: 'pending', paymentLink: issued.payUrl, amountDisplay: P.money(issued.totalCents) });
      }
      B.freeze(tx, db.doc('pricebook/' + c.book.version), fresh.book, now);
      tx.set(current, patch, { merge: true });
      if (p.action !== 'approve') tx.set(c.root, { packaged: true, updatedAt: now }, { merge: true });
      /* the organization record says it is packaged: the live runner finds its tenants by this, as the sandbox runner does by packagingSandbox */
      if (p.action === 'approve') {
        tx.update(c.root, { status: 'active', approvedAt: now, approvedBy: caller.email, packagingTrialUsedAt: now, packaged: true });
        (c.org.domains || []).forEach(function (host) { tx.set(db.doc('tenant_public/' + host), { status: 'active', tier: patch.tier }, { merge: true }); });
        tx.set(c.root.collection('notifications').doc('package-approved'), { kind: 'account', read: false, createdAt: now,
          text: 'Your workspace is approved. Your trial ends on ' + R.iso(patch.trialEndsAt) + '.', packageMail: 'approved', mailState: 'pending' });
      }
      var result = { ok: true, orgId: orgId, action: p.action, trialEndsAt: patch.trialEndsAt || null,
        nextInvoiceOn: patch.nextInvoiceOn, paymentLink: patch.paymentLink || null, packagingState: patch.packagingState };
      tx.set(op, { state: 'done', result: result, completedAt: now }, { merge: true });
      var event = { at: now, by: caller.email, action: 'package-' + p.action, was: clean(c.billing), changed: patch, selfServe: caller.selfServe === true };
      tx.set(current.collection('history').doc(p.id), event);
      tx.set(c.root.collection('admin_audit').doc(p.id), event);
      return result;
    });
  } catch (e) {
    await db.runTransaction(async function (tx) {
      var snap = await tx.get(current), old = await tx.get(op), bill = snap.data() || {};
      if (old.exists && old.data().state === 'done') return;
      if (bill.activationLock && bill.activationLock.id === p.id) tx.update(current, { activationLock: null });
      tx.set(op, { state: 'retry', failedAt: now }, { merge: true });
    });
    throw e;
  }
}
async function issue(db, orgId, now, deps) {
  var c = await context(db, orgId); guard(c);
  var b = c.billing, today = R.iso(now);
  if (!b.packaged || !b.nextInvoiceOn || b.nextInvoiceOn > today) return { skipped: true };
  if (b.packagingState === 'trial' && Policy.instant(b.trialEndsAt) > now) return { skipped: true };
  if (!b.qboCustomerId || b.qboRealmId !== c.book.qbo.realmId) fail('Sandbox customer binding is required');
  var current = c.root.collection('billing').doc('current'), ref = current.collection('invoices').doc(b.nextInvoiceOn);
  var plan = await db.runTransaction(async function (tx) {
    var existing = await tx.get(ref), live = await tx.get(current), latest = live.data();
    var ending = R.cycle(R.addDays(b.nextInvoiceOn, -1), latest.billingDay || 1), used = await tx.get(c.root.collection('usage').doc(ending.start));
    if (existing.exists && existing.data().qboInvoiceId) return null;
    if (latest.nextInvoiceOn !== b.nextInvoiceOn) fail('Billing date changed; retry');
    if (latest.invoiceLock && latest.invoiceLock.until > now) fail('Invoice is already being issued');
    var prepared = existing.exists ? existing.data() : Policy.invoice(latest, c.book, latest.nextInvoiceOn, used.exists ? used.data() : null);
    prepared.marker = 'OMEGA subscription ' + orgId + ' / ' + prepared.date;
    tx.set(ref, Object.assign({}, prepared, { state: 'prepared', createdAt: prepared.createdAt || now }));
    tx.update(current, { invoiceLock: { date: prepared.date, until: now + 120000 } });
    return prepared;
  });
  if (!plan) return { skipped: true, alreadyIssued: true };
  try {
    var issued = await Q.driver(c.book, deps).invoice(plan, BP.stored(c.profile), b.qboCustomerId);
    return await db.runTransaction(async function (tx) {
      var live = await tx.get(current), invoice = await tx.get(ref), latest = live.data();
      if (invoice.data().qboInvoiceId) return { alreadyIssued: true };
      if (!latest.invoiceLock || latest.invoiceLock.date !== plan.date) fail('Invoice reservation changed; retry');
      var due = latest.pastDueSince || plan.date;
      var state = latest.packagingState === 'trial' ? 'awaiting_payment' : latest.packagingState;
      tx.update(ref, { state: 'unpaid', qboInvoiceId: issued.id, qboCustomerId: b.qboCustomerId,
        totalCents: issued.totalCents, paymentLink: issued.payUrl, issuedAt: now });
      tx.update(current, { nextInvoiceOn: plan.nextInvoiceOn, firstInvoiceOn: latest.firstInvoiceOn || plan.date,
        serviceFeeNextOn: plan.serviceFeeNextOn, invoiceLock: null, pastDueSince: due,
        packagingState: state, paymentLink: issued.payUrl, amountDue: issued.totalCents / 100,
        accessUntil: state === 'paid' ? R.date(R.addDays(R.businessDays(due, c.book.policy.failedPaymentGraceBusinessDays), 1)) : latest.accessUntil || now });
      tx.set(current.collection('history').doc('invoice-' + plan.date), { at: now, by: 'billing-run', action: 'invoice-issued',
        qboInvoiceId: issued.id, date: plan.date, amountCents: issued.totalCents });
      tx.set(c.root.collection('notifications').doc('package-invoice-' + plan.date), { kind: 'billing', read: false, createdAt: now,
        text: 'Your subscription invoice is ready: ' + P.money(issued.totalCents) + '. Pay in QuickBooks to continue.',
        packageMail: 'packageInvoice', mailState: 'pending', paymentLink: issued.payUrl, amountDisplay: P.money(issued.totalCents) });
      return { issued: true, date: plan.date, invoiceId: issued.id, paymentLink: issued.payUrl };
    });
  } catch (e) {
    await db.runTransaction(async function (tx) {
      var snap = await tx.get(current), lock = snap.data().invoiceLock;
      if (lock && lock.date === plan.date) tx.update(current, { invoiceLock: null });
    });
    throw e;
  }
}
/* What is switched on = what the tenant bought (billing.subscription),
 * gated by the payment state of the SUBSCRIPTION invoices. A change record
 * (Phase 5) only ever moves modules into or out of the subscription when
 * QuickBooks shows it paid or reversed; a late payer drops to Lite for a
 * while but never loses the package they bought. */
function kindOf(r) { return r.kind === 'change' ? 'change' : r.kind === 'pack' ? 'pack' : 'subscription'; }
function bought(billing, last) {
  var sub = billing.subscription && Array.isArray(billing.subscription.modules) ? billing.subscription : { modules: last.modules, plan: last.plan };
  return { modules: M.normalize(sub.modules), plan: sub.plan };
}
function accessAfterInvoices(billing, records, book, now) {
  var subs = records.filter(function (r) { return kindOf(r) === 'subscription' && r.qboInvoiceId; }).sort(function (a, b) { return a.date.localeCompare(b.date); });
  var changes = records.filter(function (r) { return kindOf(r) === 'change'; });
  var paid = subs.filter(function (r) { return r.state === 'paid'; }), unpaid = subs.filter(function (r) { return r.state !== 'paid'; });
  var openChanges = changes.filter(function (r) { return r.state === 'unpaid' && r.qboInvoiceId; }).sort(function (a, b) { return a.date.localeCompare(b.date); });
  var openPacks = records.filter(function (r) { return kindOf(r) === 'pack' && r.state === 'unpaid' && r.qboInvoiceId; });
  var owing = unpaid.concat(openChanges, openPacks);
  var patch = { amountDue: owing.reduce(function (n, r) { return n + Math.max(0, (r.totalCents || 0) - (r.paidCents || 0)); }, 0) / 100 };
  if (subs.length || openChanges.length) patch.paymentLink = unpaid.length && unpaid[0].state !== 'reversed' ? unpaid[0].paymentLink || null : (openChanges.length ? openChanges[0].paymentLink || null : null);
  if (!subs.length) return patch;
  if (subs.some(function (r) { return r.reconcileError; }) || changes.some(function (r) { return r.reconcileError; })) return Object.assign(patch, { packagingState: 'reconciliation_required', accessUntil: now });
  if (subs.some(function (r) { return r.state === 'reversed'; })) return Object.assign(patch, { packagingState: 'unpaid', accessUntil: now });
  if (!paid.length) return Object.assign(patch, { packagingState: 'awaiting_payment', accessUntil: now });
  var last = paid[paid.length - 1], own = bought(billing, last);
  patch.paidThrough = last.period.end;
  if (unpaid.length) {
    var due = unpaid[0].date, grace = R.date(R.addDays(R.businessDays(due, book.policy.failedPaymentGraceBusinessDays), 1));
    if (now >= grace) return Object.assign(patch, M.resolve(['lite']), { packagingState: 'past_due_lite', plan: own.plan,
      pastDueSince: due, accessUntil: R.date(subs[subs.length - 1].period.end) });
    return Object.assign(patch, M.resolve(own.modules), { packagingState: 'paid', plan: own.plan, pastDueSince: due, accessUntil: grace });
  }
  return Object.assign(patch, M.resolve(own.modules), { packagingState: 'paid', plan: own.plan,
    proposedPackage: null, pastDueSince: null, paidThrough: last.period.end,
    accessUntil: R.date(R.addDays(R.businessDays(last.period.end, book.policy.failedPaymentGraceBusinessDays), 1)) });
}
/* A change record moving to paid or reversed edits the subscription. Paid
 * after its cycle rolled (or after a cancel) is still honoured — the
 * customer paid — and flagged so a person can invoice the gap or refund. */
function subscriptionAfterChange(billing, record, from, to, subs) {
  var sub = billing.subscription && Array.isArray(billing.subscription.modules) ? billing.subscription : null;
  if (!sub) return null;
  var modules = sub.modules.slice(), plan = sub.plan;
  if (to === 'paid' && from !== 'paid') { (record.add || []).forEach(function (k) { if (modules.indexOf(k) < 0) modules.push(k); }); if (record.plan) plan = record.plan; }
  else if (to === 'reversed' && from === 'paid') {
    var coveredLater = subs.some(function (r) { return r.state === 'paid' && r.date >= (record.cycle ? record.cycle.end : '9999') && (r.modules || []).some(function (k) { return (record.add || []).indexOf(k) >= 0; }); });
    if (!coveredLater) { modules = modules.filter(function (k) { return (record.add || []).indexOf(k) < 0; }); plan = record.planBefore || plan; }
  } else return null;
  modules = M.normalize(modules);
  try { P.quote(modules, billing.__book, { plan: plan }); } catch (e) { plan = P.quote(modules, billing.__book, { plan: 'auto' }).plan; }
  return Object.assign({}, sub, { modules: modules, plan: plan, changedAt: Date.now() });
}
/* Display fields that follow a grant change; used by reconcile and plan-change. */
function displayAfter(patch, billing, book, now) {
  if (!patch.modules) return patch;
  var q = P.quote(patch.modules, book, { plan: patch.plan || billing.plan, builders: billing.builders, viewers: billing.viewers,
    serviceFee: billing.serviceFee, credit: billing.credit, interval: billing.interval, now: now });
  patch.monthlyCents = q.monthlyCents; patch.monthlyDisplay = q.display.monthly; return patch;
}
async function reconcile(db, orgId, now, deps, options) {
  var c = await context(db, orgId); guard(c);
  if (!c.billing.packaged) return { skipped: true };
  var current = c.root.collection('billing').doc('current'), collection = current.collection('invoices');
  var query = collection.orderBy('date'), bounded = options && options.limit;
  if (bounded) {
    if (c.billing.reconcileCursor) query = query.startAfter(c.billing.reconcileCursor);
    query = query.limit(Math.min(10, Math.max(1, bounded)));
  }
  var rows = await query.get(), results = [], q = Q.driver(c.book, deps);
  for (var i = 0; i < rows.docs.length; i++) {
    var doc = rows.docs[i], record = doc.data(); if (!record.qboInvoiceId) continue;
    var receipt, error = false, transient = false;
    // A transport failure (no status, or 5xx from the QuickBooks call) keeps
    // the record as it was and is retried; only a validation failure, or
    // three transport failures in a row, marks the record for review.
    try { receipt = await q.reconcile(record); } catch (e) { if (!e.status || e.status >= 500) transient = true; else error = true; }
    var state = error || transient ? record.state : receipt.reversed ? 'reversed' : receipt.satisfied ? 'paid' : 'unpaid', review = error;
    await db.runTransaction(async function (tx) {
      var invoices = await tx.get(collection.orderBy('date')), old = await tx.get(doc.ref), live = await tx.get(current);
      var snapshot = old.data(), billing = live.data(), subUpdate = null;
      if (snapshot.qboInvoiceId !== record.qboInvoiceId) fail('Invoice binding changed');
      var retries = transient ? (snapshot.reconcileRetries || 0) + 1 : 0;
      if (transient && retries >= 3) { error = true; review = true; }
      var subs = invoices.docs.map(function (d) { return d.data(); }).filter(function (r) { return kindOf(r) === 'subscription' && r.qboInvoiceId; });
      // Phase 7: a pack's cycle usage document is read before any write.
      var packUsage = kindOf(snapshot) === 'pack' && snapshot.pack ? await tx.get(c.root.collection('usage').doc(snapshot.pack.cycle.start)) : null;
      if (kindOf(snapshot) === 'pack' && !error && !transient) {
        var packRolled = subs.some(function (r) { return r.date >= snapshot.pack.cycle.end; });
        if (state === 'unpaid') state = snapshot.state === 'cancelled' ? 'cancelled' : (packRolled || snapshot.state === 'expired') ? 'expired' : 'unpaid';
        if (state === 'paid' && snapshot.state !== 'paid') { if (packRolled) review = true; U.addPack(tx, c.root, snapshot.pack, packUsage.exists ? packUsage.data() : null, now); }
        else if (state === 'reversed' && snapshot.state === 'paid') U.addPack(tx, c.root, Object.assign({}, snapshot.pack, { units: -snapshot.pack.units }), packUsage.exists ? packUsage.data() : null, now);
      }
      if (kindOf(snapshot) === 'change' && !error && !transient) {
        var rolled = subs.some(function (r) { return snapshot.cycle && snapshot.cycle.end && r.date >= snapshot.cycle.end; });
        if (state === 'unpaid') state = snapshot.state === 'cancelled' ? 'cancelled' : (rolled || snapshot.state === 'expired') ? 'expired' : 'unpaid';
        if (state === 'paid' && snapshot.state !== 'paid' && (rolled || snapshot.state === 'cancelled' || snapshot.state === 'expired')) review = true;
        subUpdate = subscriptionAfterChange(Object.assign({}, billing, { __book: c.book }), snapshot, snapshot.state, state, subs);
      }
      var update = { state: state, reconcileError: error, reconcileRetries: retries, reconciledAt: now, reviewRequired: review };
      if (!error && !transient) { update.paymentLink = receipt.payUrl || null; update.paidCents = receipt.paidCents; }
      var all = invoices.docs.map(function (d) { return d.id === doc.id ? Object.assign({}, d.data(), update) : d.data(); });
      var afterBilling = subUpdate ? Object.assign({}, billing, { subscription: subUpdate }) : billing;
      var patch = displayAfter(accessAfterInvoices(afterBilling, all, c.book, now), afterBilling, c.book, now);
      if (subUpdate) patch.subscription = subUpdate;
      if (state === 'paid' && snapshot.state !== 'paid') patch.lastPaidAt = now;
      tx.update(doc.ref, update); tx.update(current, patch);
      if (snapshot.state !== state || !!snapshot.reconcileError !== error || billing.packagingState !== patch.packagingState) {
        var event = { at: now, by: 'quickbooks-reconciliation', action: (kindOf(snapshot) === 'change' ? 'change-' : kindOf(snapshot) === 'pack' ? 'pack-' : 'invoice-') + state, invoiceId: record.qboInvoiceId, reviewRequired: review,
          was: { state: snapshot.state, packagingState: billing.packagingState }, changed: { state: state, packagingState: patch.packagingState, modules: patch.modules || billing.modules } };
        tx.set(current.collection('history').doc(), event); tx.set(c.root.collection('admin_audit').doc(), event);
      }
    });
    results.push({ invoiceId: record.qboInvoiceId, state: state, reviewRequired: review });
  }
  if (bounded) await current.update({ reconcileCursor: rows.docs.length === bounded ? rows.docs[rows.docs.length - 1].data().date : null });
  return { invoices: results };
}
module.exports = { context: context, guard: guard, live: live, canApply: canApply, prepare: prepare, display: display, preview: preview, apply: apply,
  issue: issue, reconcile: reconcile, accessAfterInvoices: accessAfterInvoices, displayAfter: displayAfter, kindOf: kindOf, bought: bought };
