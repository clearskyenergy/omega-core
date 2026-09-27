/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Admin-SDK subscription orchestration. Preview is read-only. All activation
 * writes require an explicitly marked sandbox tenant and enabled sandbox book.
 */
'use strict';
var B = require('./pricebook'), P = require('./subscription-pricing'), Policy = require('./package-billing-policy');
var Mode = require('./packaging-mode');
var BP = require('./billing-profile'), Q = require('./qbo-billing'), D = require('./billing-driver'), M = require('./modules'), R = require('./proration'), U = require('./usage'), AO = require('./addons');
function fail(message, status) { var e = new Error(message); e.status = status || 409; throw e; }
function clean(b) { var out = Object.assign({}, b); delete out.activationLock; return out; }
function basis(c) { return Q.key(B.stable({ org: c.org, billing: clean(c.billing), profile: c.profile, book: c.book })); }
async function context(db, orgId, version, options) {
  var root = db.doc('omega_orgs/' + orgId), lenient = !!(options && options.lenient);
  var rows = await Promise.all([root.get(), root.collection('billing').doc('current').get(), root.collection('billing').doc('profile').get()]);
  if (!rows[0].exists && !lenient) fail('Organization not found', 404);
  var billing = rows[1].exists ? rows[1].data() : {};
  /* lenient (a request that moves no money: a legacy opt-in, the summary):
     a legacy tenant with no omega_orgs record yet reads as active, exactly
     as every gate fails OPEN on a missing record; an unseeded book reads as
     the code's own, exactly as the public price list (api/offerings) does.
     Every write that moves money still runs guard(), which refuses both. */
  var book;
  try { book = await B.load(db, version || billing.pricebookVersion || B.VERSION); }
  catch (e) { if (!lenient || !/not seeded/i.test(String(e && e.message))) throw e; book = B.proposed(); }
  return { root: root, org: rows[0].exists ? rows[0].data() : { status: 'active', missingRecord: true }, billing: billing, profile: rows[2].exists ? rows[2].data() : null, book: book };
}
/* Two modes, both explicit (api/_lib/packaging-mode.js), judged for the
   provider this workspace bills through (billing-driver.providerOf).
   SANDBOX: a Stripe test key (or QBO_ENV=sandbox), a tenant marked
   packagingSandbox, an enabled book. LIVE: PACKAGING_LIVE=true AND a live
   Stripe key (or QBO_ENV=production), an enabled book under a release
   version (for QuickBooks, synced to the production company); every tenant
   may then buy. */
var live = Mode.live;
/* `rail` names the provider when the caller knows it (a legacy plan's
   add-ons bill through QuickBooks: api/_lib/addons.js); else the
   workspace's own (billing-driver.providerOf). */
function guard(c, rail) {
  if (process.env.PACKAGING_BILLING_ENABLED !== 'true') fail('Packaging billing is disabled');
  var provider = rail || D.providerOf(c.billing);
  if (Mode.live(provider)) {
    if (provider === 'stripe') {
      if (!c.book.enabled || c.book.version !== B.VERSION || /-proposed$/.test(c.book.version)) fail('An enabled release price book is required to bill live through Stripe');
      return;
    }
    if (!c.book.enabled || c.book.version !== B.VERSION || c.book.qbo.env !== 'production' || !c.book.qbo.realmId) fail('An enabled price book synced to the production QuickBooks company is required');
    return;
  }
  if (!Mode.sandbox(provider)) fail(provider === 'stripe' ? 'Packaging billing through Stripe needs a Stripe test key (or PACKAGING_LIVE=true with a live key)' : 'Packaging billing requires QBO_ENV=sandbox (or PACKAGING_LIVE=true with QBO_ENV=production)');
  if (c.org.packagingSandbox !== true) fail('An explicitly marked sandbox tenant is required');
  if (provider === 'stripe') { if (!c.book.enabled || c.book.version !== B.VERSION) fail('An enabled price book is required'); return; }
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
    /* a legacy tenant predates signedUpAt (self-serve signup, 2026-09-06):
       its record's own dates anchor the billing day, else today does */
    if (!isFinite(signup)) signup = Policy.instant(c.org.createdAt);
    if (!isFinite(signup)) signup = Policy.instant(c.org.approvedAt);
    if (!isFinite(signup)) signup = now;
    if (signup > now) fail('Original signup date is required');
    patch = Object.assign({}, selected, M.resolve(['lite']), { packaged: true, modules: ['lite'], subscription: Policy.subscription(selected, at), packagingState: 'awaiting_payment',
      proposedPackage: selected, billingDay: new Date(signup).getUTCDate(), nextInvoiceOn: R.iso(at), subscriptionStartedAt: at,
      accessUntil: at, status: 'active' });
  } else fail('Action must be approve or activate', 400);
  /* the rail this workspace bills through, named on the record from the first step */
  var provider = D.providerOf(c.billing);
  patch = Object.assign({}, patch, { billingProvider: provider, paymentProvider: provider });
  if (provider === 'quickbooks') patch.qboEnv = c.book.qbo.env; else delete patch.qboEnv;
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
    /* the customer record as the workspace's own rail will get it */
    customer: D.providerOf(c.billing) === 'stripe' ? require('./stripe-billing').wanted(p.profile, c.root.id) : BP.customer(p.profile, c.root.id), provider: D.providerOf(c.billing),
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
    var provider = D.providerOf(c.billing), q = D.driver(c.book, provider, deps), customer = await q.customer(orgId, p.profile, D.customerId(c.billing, provider));
    var issued = p.plan ? await q.invoice(p.plan, p.profile, customer) : null;
    return await db.runTransaction(async function (tx) {
      var fresh = await reread(tx, db, c);
      guard(fresh);
      if (!fresh.billing.activationLock || fresh.billing.activationLock.id !== p.id || basis(fresh) !== p.source) fail('Activation inputs changed; refresh and retry');
      var patch = Object.assign({}, p.patch, D.customerFields(provider, customer, c.book), {
        activationLock: null, updatedAt: now, updatedBy: caller.email });
      patch.serviceFee = Object.assign({}, patch.serviceFee, { by: caller.email, at: now });
      if (issued) {
        patch.paymentLink = issued.payUrl; patch.amountDue = issued.totalCents / 100;
        patch.nextInvoiceOn = p.plan.nextInvoiceOn; patch.firstInvoiceOn = p.plan.date; patch.serviceFeeNextOn = p.plan.serviceFeeNextOn;
        tx.set(current.collection('invoices').doc(p.plan.date), Object.assign({}, p.plan, { state: 'unpaid' }, D.invoiceFields(provider, issued.id, customer),
          { totalCents: issued.totalCents, paymentLink: issued.payUrl, createdAt: now }));
        tx.set(c.root.collection('notifications').doc('package-invoice-' + p.plan.date), { kind: 'billing', read: false, createdAt: now,
          text: 'Your subscription invoice is ready: ' + P.money(issued.totalCents) + '. Pay it by card on the invoice page to continue.',
          packageMail: 'packageInvoice', mailState: 'pending', paymentLink: issued.payUrl, amountDisplay: P.money(issued.totalCents), payWith: D.name(provider) });
      }
      B.freeze(tx, db.doc('pricebook/' + c.book.version), fresh.book, now);
      tx.set(current, patch, { merge: true });
      /* a workspace moving onto a Stripe package while it still has an old
         Stripe tier subscription: that subscription keeps charging the card
         unless someone cancels it. ClearSky is told, once, at the move. */
      if (provider === 'stripe' && fresh.billing.stripeSubscriptionId && fresh.billing.packaged !== true) {
        tx.set(db.doc('omega_orgs/clearsky-usa.com/notifications/billing-review-legacy-sub-' + orgId), { kind: 'billing-review', read: false, createdAt: now, orgId: orgId, staffMail: 'billingAlert', mailState: 'pending',
          text: (c.org.name || orgId) + ' moved onto a Stripe package while its old Stripe subscription ' + fresh.billing.stripeSubscriptionId + ' is on record. Cancel that subscription in Stripe so the card is not charged twice.' });
      }
      /* the organization record says it is packaged, and in which company:
         the live runner finds its tenants by packagedLive (a sandbox signup
         is also `packaged`, and the production runner must never poll it),
         the sandbox runner by packagingSandbox */
      if (p.action !== 'approve') tx.set(c.root, { packaged: true, packagedLive: Mode.live(provider), updatedAt: now }, { merge: true });
      if (p.action === 'approve') {
        tx.update(c.root, { status: 'active', approvedAt: now, approvedBy: caller.email, packagingTrialUsedAt: now, packaged: true, packagedLive: Mode.live(provider) });
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
  var provider = D.providerOf(b), customerOf = D.customerId(b, provider);
  if (!D.bound(b, provider, c.book)) fail('The billing customer does not belong to this deployment\'s ' + D.name(provider) + ' account');
  var current = c.root.collection('billing').doc('current'), ref = current.collection('invoices').doc(b.nextInvoiceOn);
  var plan = await db.runTransaction(async function (tx) {
    var existing = await tx.get(ref), live = await tx.get(current), latest = live.data();
    var ending = R.cycle(R.addDays(b.nextInvoiceOn, -1), latest.billingDay || 1), used = await tx.get(c.root.collection('usage').doc(ending.start));
    if (existing.exists && D.issued(existing.data())) return null;
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
    var issued = await D.driver(c.book, provider, deps).invoice(plan, BP.stored(c.profile), customerOf);
    return await db.runTransaction(async function (tx) {
      var live = await tx.get(current), invoice = await tx.get(ref), latest = live.data();
      if (D.issued(invoice.data())) return { alreadyIssued: true };
      if (!latest.invoiceLock || latest.invoiceLock.date !== plan.date) fail('Invoice reservation changed; retry');
      var due = latest.pastDueSince || plan.date;
      var state = latest.packagingState === 'trial' ? 'awaiting_payment' : latest.packagingState;
      tx.update(ref, Object.assign({ state: 'unpaid' }, D.invoiceFields(provider, issued.id, customerOf),
        { totalCents: issued.totalCents, paymentLink: issued.payUrl, issuedAt: now }));
      tx.update(current, { nextInvoiceOn: plan.nextInvoiceOn, firstInvoiceOn: latest.firstInvoiceOn || plan.date,
        serviceFeeNextOn: plan.serviceFeeNextOn, invoiceLock: null, pastDueSince: due,
        packagingState: state, paymentLink: issued.payUrl, amountDue: issued.totalCents / 100,
        accessUntil: state === 'paid' ? R.date(R.addDays(R.businessDays(due, c.book.policy.failedPaymentGraceBusinessDays), 1)) : latest.accessUntil || now });
      tx.set(current.collection('history').doc('invoice-' + plan.date), Object.assign({ at: now, by: 'billing-run', action: 'invoice-issued',
        date: plan.date, amountCents: issued.totalCents }, D.invoiceFields(provider, issued.id, customerOf)));
      tx.set(c.root.collection('notifications').doc('package-invoice-' + plan.date), { kind: 'billing', read: false, createdAt: now,
        text: 'Your subscription invoice is ready: ' + P.money(issued.totalCents) + '. Pay it by card on the invoice page to continue.',
        packageMail: 'packageInvoice', mailState: 'pending', paymentLink: issued.payUrl, amountDisplay: P.money(issued.totalCents), payWith: D.name(provider) });
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
/* an add-on on a plan billed outside the engine (api/_lib/addons.js) is never
   a subscription invoice: it neither opens a package nor counts against one */
function kindOf(r) { return r.kind === 'change' ? 'change' : r.kind === 'pack' ? 'pack' : r.kind === 'addon' ? 'addon' : 'subscription'; }
/* a failure that is ours, not the invoice's: no answer, a 5xx, QuickBooks refusing our connection, or the guard */
function clearskySide(e) { return !e || !e.status || e.status >= 500 || e.status === 401 || e.status === 403 || e.status === 429 || e.clearsky === true; }
function bought(billing, last) {
  var sub = billing.subscription && Array.isArray(billing.subscription.modules) ? billing.subscription : { modules: last.modules, plan: last.plan };
  return { modules: M.normalize(sub.modules), plan: sub.plan };
}
function accessAfterInvoices(billing, records, book, now) {
  var subs = records.filter(function (r) { return kindOf(r) === 'subscription' && D.issued(r); }).sort(function (a, b) { return a.date.localeCompare(b.date); });
  var changes = records.filter(function (r) { return kindOf(r) === 'change'; });
  var paid = subs.filter(function (r) { return r.state === 'paid'; }), lastPaid = paid.length ? paid[paid.length - 1].date : '';
  /* a reversed cycle (refunded, voided) is superseded by a LATER cycle paid
     in full: the tenant has paid since, and a person was told when it was
     reversed. Without this one refund locked the workspace for good while
     its renewals kept being billed and paid. */
  var unpaid = subs.filter(function (r) { return r.state !== 'paid' && !(r.state === 'reversed' && r.date < lastPaid); });
  var openChanges = changes.filter(function (r) { return r.state === 'unpaid' && D.issued(r); }).sort(function (a, b) { return a.date.localeCompare(b.date); });
  var openPacks = records.filter(function (r) { return kindOf(r) === 'pack' && r.state === 'unpaid' && D.issued(r); });
  var owing = unpaid.concat(openChanges, openPacks);
  var patch = { amountDue: owing.reduce(function (n, r) { return n + Math.max(0, (r.totalCents || 0) - (r.paidCents || 0)); }, 0) / 100 };
  if (subs.length || openChanges.length) patch.paymentLink = unpaid.length && unpaid[0].state !== 'reversed' ? unpaid[0].paymentLink || null : (openChanges.length ? openChanges[0].paymentLink || null : null);
  /* A reconciliation error (a QuickBooks call that failed validation, or
     three failed reads in a row) is a PERSON's problem, flagged here for the
     console and the runner's alert. Access is judged from the invoice states
     last read from QuickBooks and is never cut by ClearSky's own bookkeeping:
     a connection or configuration fault on our side must not read every
     paying tenant out of its workspace (launch review, 2026-09-26). */
  patch.reconciliationRequired = subs.some(function (r) { return r.reconcileError; }) || changes.some(function (r) { return r.reconcileError; });
  if (!subs.length) return patch;
  /* the first invoice voided before anything was paid: nothing to pay against; a person re-issues or closes */
  if (!paid.length && subs.some(function (r) { return r.state === 'reversed'; })) return Object.assign(patch, { packagingState: 'awaiting_payment', accessUntil: now, reissueRequired: true });
  if (unpaid.some(function (r) { return r.state === 'reversed'; })) return Object.assign(patch, { packagingState: 'unpaid', accessUntil: now });
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
function subscriptionAfterChange(billing, record, from, to, subs, changes) {
  var sub = billing.subscription && Array.isArray(billing.subscription.modules) ? billing.subscription : null;
  if (!sub) return null;
  var modules = sub.modules.slice(), plan = sub.plan;
  if (to === 'paid' && from !== 'paid') { (record.add || []).forEach(function (k) { if (modules.indexOf(k) < 0) modules.push(k); }); if (record.plan) plan = record.plan; }
  else if (to === 'reversed' && from === 'paid') {
    /* a module stays when something else still paid for it: a later cycle
       that billed it, or another change that added it and is paid */
    var covered = function (k) {
      return subs.some(function (r) { return r.state === 'paid' && r.date >= (record.cycle ? record.cycle.end : '9999') && (r.modules || []).indexOf(k) >= 0; })
        || (changes || []).some(function (r) { return r.id !== record.id && r.state === 'paid' && (r.add || []).indexOf(k) >= 0; });
    };
    var lost = (record.add || []).filter(function (k) { return !covered(k); });
    if (lost.length) { modules = modules.filter(function (k) { return lost.indexOf(k) < 0; }); if (lost.length === (record.add || []).length) plan = record.planBefore || plan; }
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
  var c = await context(db, orgId), legacy = c.billing.packaged !== true;
  /* a plan billed outside the engine is reconciled only for its add-ons
     (api/_lib/addons.js, QuickBooks' rail); its own tier, amount due and
     pay link are never this function's to write */
  guard(c, legacy ? 'quickbooks' : undefined);
  if (legacy && !c.billing.addOns) return { skipped: true };
  var current = c.root.collection('billing').doc('current'), collection = current.collection('invoices');
  /* the runner's bounded read pages by document id, which is unique: paged by
     date, every record sharing a date across a page edge was never read */
  var bounded = options && options.limit ? Math.min(10, Math.max(1, options.limit)) : 0, query = bounded ? collection.orderBy('__name__') : collection.orderBy('date');
  if (bounded) {
    if (c.billing.reconcileCursor) query = query.startAfter(c.billing.reconcileCursor);
    query = query.limit(bounded);
  }
  var rows = await query.get(), results = [], drivers = {};
  /* each invoice is read back from the provider it was issued on */
  function driverFor(record) { var p = D.recordProvider(record); return drivers[p] || (drivers[p] = D.driver(c.book, p, deps)); }
  for (var i = 0; i < rows.docs.length; i++) {
    var doc = rows.docs[i], record = doc.data(); if (!D.issued(record)) continue;
    var invoiceId = D.invoiceId(record), providerName = D.name(D.recordProvider(record));
    var receipt, error = false, transient = false, note = null;
    // A failure on ClearSky's side (no status, 5xx, or QuickBooks refusing
    // OUR connection: 401, 403, 429, the guard) keeps the record as it was
    // and is retried; only a validation failure, or three such failures in a
    // row, marks the record for review. Neither cuts the tenant's access.
    try { receipt = await driverFor(record).reconcile(record); } catch (e) { note = String(e.message || e).slice(0, 200); if (clearskySide(e)) transient = true; else error = true; }
    var state = error || transient ? record.state : receipt.reversed ? 'reversed' : receipt.satisfied ? 'paid' : 'unpaid', review = error;
    /* the provider may read paid and still want a person (part of it refunded) */
    if (!error && !transient && receipt.review) { review = true; note = String(receipt.review).slice(0, 200); }
    await db.runTransaction(async function (tx) {
      var invoices = await tx.get(collection.orderBy('date')), old = await tx.get(doc.ref), live = await tx.get(current);
      var snapshot = old.data(), billing = live.data(), subUpdate = null, addOnMove = null, outside = billing.packaged !== true;
      if (D.invoiceId(snapshot) !== invoiceId) fail('Invoice binding changed');
      /* another reconcile (or a cancel) moved this record after it was read:
         its verdict is newer than this one, which is dropped */
      if (snapshot.state !== record.state) { state = snapshot.state; return; }
      /* money that was received went back: a person looks, once */
      if (kindOf(snapshot) === 'subscription' && state === 'reversed' && snapshot.state === 'paid' && !error && !transient) { review = true; note = note || 'a paid invoice was refunded or voided'; }
      var retries = transient ? (snapshot.reconcileRetries || 0) + 1 : 0;
      if (transient && retries >= 3) { error = true; review = true; }
      var subs = invoices.docs.map(function (d) { return d.data(); }).filter(function (r) { return kindOf(r) === 'subscription' && D.issued(r); });
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
        subUpdate = subscriptionAfterChange(Object.assign({}, billing, { __book: c.book }), snapshot, snapshot.state, state, subs,
          invoices.docs.map(function (d) { return d.data(); }).filter(function (r) { return kindOf(r) === 'change'; }));
      }
      /* an add-on purchase (api/_lib/addons.js) waits like a change: unpaid
         past the period it would cover, it expires; paid late, it is still
         honoured and a person looks. A renewal is simply owed. */
      if (kindOf(snapshot) === 'addon' && !error && !transient) {
        if (snapshot.purpose !== 'renewal') {
          var passed = !!(snapshot.cycle && snapshot.cycle.end && R.iso(now) >= snapshot.cycle.end);
          if (state === 'unpaid') state = snapshot.state === 'cancelled' ? 'cancelled' : (passed || snapshot.state === 'expired') ? 'expired' : 'unpaid';
          if (state === 'paid' && snapshot.state !== 'paid' && (passed || snapshot.state === 'cancelled' || snapshot.state === 'expired')) review = true;
        }
        addOnMove = AO.boughtAfter(billing, snapshot, snapshot.state, state);
      }
      var update = { state: state, reconcileError: error, reconcileRetries: retries, reconciledAt: now, reviewRequired: review, reconcileNote: error || transient ? note : null };
      if (!error && !transient) { update.paymentLink = receipt.payUrl || null; update.paidCents = receipt.paidCents; }
      /* money landed on a subscription invoice: the tenant hears (the first one opens the workspace), and so does ClearSky */
      if (kindOf(snapshot) === 'subscription' && state === 'paid' && snapshot.state !== 'paid') {
        var first = !subs.some(function (r) { return r.state === 'paid' && r.date !== snapshot.date; });
        tx.set(c.root.collection('notifications').doc('package-paid-' + snapshot.date), { kind: 'billing', read: false, createdAt: now, packageMail: 'paid', mailState: 'pending', first: first,
          text: 'Payment received: ' + P.money(snapshot.totalCents) + (first ? '. Your workspace is open.' : '. Thank you.'), amountDisplay: P.money(snapshot.totalCents), date: snapshot.date, invoiceId: invoiceId, payWith: providerName });
        tx.set(db.collection('omega_orgs').doc('clearsky-usa.com').collection('notifications').doc('billing-paid-' + orgId + '-' + invoiceId), { kind: 'payment', read: false, createdAt: now, orgId: orgId, staffMail: 'paidAlert', mailState: 'pending',
          text: 'Payment received: ' + (c.org.name || orgId) + ' ' + P.money(snapshot.totalCents) + (first ? ' (first invoice: the workspace is open)' : ''), amountDisplay: P.money(snapshot.totalCents), invoiceId: invoiceId, payWith: providerName, first: first });
      }
      /* money landed on an add-on: the tenant hears what switched on, ClearSky hears the money */
      if (kindOf(snapshot) === 'addon' && state === 'paid' && snapshot.state !== 'paid') {
        var what = (snapshot.purpose === 'renewal' ? snapshot.modules : snapshot.add) || [], label = what.map(function (k) { var m = M.get(k); return m ? m.name : k; }).join(', ');
        tx.set(c.root.collection('notifications').doc('addon-paid-' + snapshot.id), { kind: 'billing', read: false, createdAt: now, packageMail: 'paid', mailState: 'pending', first: false,
          text: 'Payment received: ' + P.money(snapshot.totalCents) + '. ' + label + (snapshot.purpose === 'renewal' ? (what.length > 1 ? ' are' : ' is') + ' renewed.' : (what.length > 1 ? ' are' : ' is') + ' on.'), amountDisplay: P.money(snapshot.totalCents), date: snapshot.date, invoiceId: invoiceId, payWith: providerName });
        tx.set(db.collection('omega_orgs').doc('clearsky-usa.com').collection('notifications').doc('billing-paid-' + orgId + '-' + invoiceId), { kind: 'payment', read: false, createdAt: now, orgId: orgId, staffMail: 'paidAlert', mailState: 'pending',
          text: 'Payment received: ' + (c.org.name || orgId) + ' ' + P.money(snapshot.totalCents) + ' (add-on' + (snapshot.purpose === 'renewal' ? ' renewal' : '') + ': ' + label + ')', amountDisplay: P.money(snapshot.totalCents), invoiceId: invoiceId, payWith: providerName, first: false });
      }
      /* a person has to look: once per invoice, in ClearSky's own inbox and by mail */
      if (review && !snapshot.reviewRequired) {
        tx.set(db.collection('omega_orgs').doc('clearsky-usa.com').collection('notifications').doc('billing-review-' + orgId + '-' + invoiceId), { kind: 'billing-review', read: false, createdAt: now, orgId: orgId, staffMail: 'billingAlert', mailState: 'pending',
          text: 'Accounting review: ' + providerName + ' invoice ' + invoiceId + ' for ' + (c.org.name || orgId) + (note ? ' (' + note + ')' : '') + '. Access is unchanged until you decide.', invoiceId: invoiceId });
      }
      var all = invoices.docs.map(function (d) { return d.id === doc.id ? Object.assign({}, d.data(), update) : d.data(); });
      var patch;
      if (outside) {
        /* only the add-ons and the grants they wrote; the plan's own fields stay the plan's */
        patch = AO.settle(addOnMove ? Object.assign({}, billing, { addOns: Object.assign({}, billing.addOns || {}, addOnMove) }) : billing, all, c.book, now);
      } else {
        var afterBilling = subUpdate ? Object.assign({}, billing, { subscription: subUpdate }) : billing;
        patch = displayAfter(accessAfterInvoices(afterBilling, all, c.book, now), afterBilling, c.book, now);
        if (subUpdate) patch.subscription = subUpdate;
        if (state === 'paid' && snapshot.state !== 'paid') patch.lastPaidAt = now;
      }
      tx.update(doc.ref, update); tx.update(current, patch);
      if (outside && (snapshot.state !== state || !!snapshot.reconcileError !== error)) {
        var added = { at: now, by: D.recordProvider(record) + '-reconciliation', action: 'addon-' + state, invoiceId: invoiceId, reviewRequired: review,
          was: { state: snapshot.state || null, live: (billing.addOns && billing.addOns.live) || [] }, changed: { state: state, live: patch.addOns.live, addOnState: patch.addOns.state } };
        tx.set(current.collection('history').doc(), added); tx.set(c.root.collection('admin_audit').doc(), added);
      } else if (!outside && (snapshot.state !== state || !!snapshot.reconcileError !== error || billing.packagingState !== patch.packagingState)) {
        var event = { at: now, by: D.recordProvider(record) + '-reconciliation', action: (kindOf(snapshot) === 'change' ? 'change-' : kindOf(snapshot) === 'pack' ? 'pack-' : 'invoice-') + state, invoiceId: invoiceId, reviewRequired: review,
          was: { state: snapshot.state, packagingState: billing.packagingState }, changed: { state: state, packagingState: patch.packagingState, modules: patch.modules || billing.modules } };
        tx.set(current.collection('history').doc(), event); tx.set(c.root.collection('admin_audit').doc(), event);
      }
    });
    results.push({ invoiceId: invoiceId, kind: kindOf(record), state: state, was: record.state, changed: record.state !== state, reviewRequired: review });
  }
  if (bounded) await current.update({ reconcileCursor: rows.docs.length === bounded ? rows.docs[rows.docs.length - 1].id : null });
  return { invoices: results };
}
module.exports = { context: context, guard: guard, live: live, canApply: canApply, prepare: prepare, display: display, preview: preview, apply: apply,
  issue: issue, reconcile: reconcile, accessAfterInvoices: accessAfterInvoices, displayAfter: displayAfter, kindOf: kindOf, bought: bought };
