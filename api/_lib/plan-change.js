/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Phase 5: a tenant adds modules to a paid package. Server-only money math;
 * the browser displays what this returns. Pay first, prorated to the
 * tenant's billing date. A $0 addition inside a tier whose current cycle is
 * already paid activates immediately (Tommy, 2026-09-26, option 1);
 * anything owed becomes a CHANGE invoice on the workspace's own rail
 * (billing-driver: Stripe, or QuickBooks for a workspace billed there) and
 * the modules switch on when package-billing.reconcile sees it paid. Removals
 * are recorded for the quarterly review and change nothing today. A plan
 * billed outside the engine opts in and out by REQUEST (optIns / optOuts on
 * its billing record, priced where there is a price, ClearSky mailed) or, for
 * a module its plan can switch on exactly, buys it as an add-on by card
 * (api/_lib/addons.js); every open request can be withdrawn, and activation
 * onto a package answers them (package-billing prepare).
 */
'use strict';
var S = require('./package-billing'), B = require('./pricebook'), P = require('./subscription-pricing'), M = require('./modules');
var R = require('./proration'), Q = require('./qbo-billing'), D = require('./billing-driver'), BP = require('./billing-profile'), U = require('./usage'), AO = require('./addons'), Policy = require('./package-billing-policy');
function fail(message, status) { var e = new Error(message); e.status = status || 409; throw e; }
function iso(now) { return R.iso(now); }
/* The tenant's records without insisting on the price book: a request that
   prices nothing (an opt-out, a withdrawal) and the summary of a plan billed
   outside the engine must not fail because no book is seeded yet. `book` is
   null then, and anything that would price says so instead of guessing. */
async function bare(db, orgId) {
  try { return await S.context(db, orgId); }
  catch (e) {
    if (e.status === 404) throw e;
    var root = db.doc('omega_orgs/' + orgId), rows = await Promise.all([root.get(), root.collection('billing').doc('current').get()]);
    if (!rows[0].exists) fail('Organization not found', 404);
    return { root: root, org: rows[0].data(), billing: rows[1].exists ? rows[1].data() : {}, profile: null, book: null };
  }
}
/* The quarterly review a removal waits for: the first date, today or later,
   that is a whole number of review periods (the book's policy.reviewDays, 90
   by default) after the subscription began. No start on record, no date: the
   page then says "the next quarterly review" rather than inventing one. */
function reviewOn(billing, book, now) {
  var start = Policy.instant((billing.subscription || {}).since);
  if (!isFinite(start)) return null;
  var days = (book && book.policy && book.policy.reviewDays) || 90, first = R.date(R.iso(start)), today = R.date(iso(now));
  var k = Math.max(1, Math.ceil((today - first) / (days * R.DAY)));
  return R.iso(first + k * days * R.DAY);
}
/* The monthly fee for a set of modules, priced the way summary() prices the
   subscription (the plan the tenant chose, the same logins, fee and credit);
   the lowest plan when the chosen one no longer fits; null when the book
   cannot price it. Used for the before → after a removal shows. */
function monthlyFor(b, book, modules, now) {
  var sub = b.subscription && Array.isArray(b.subscription.modules) ? b.subscription : { modules: b.modules, plan: b.plan };
  var opts = { plan: sub.plan || 'auto', builders: b.builders, viewers: b.viewers, serviceFee: b.serviceFee, credit: b.credit, interval: b.interval, now: now };
  if (!book) return null;
  try { return P.quote(M.normalize(modules), book, opts).display.monthly; }
  catch (e) { try { return P.quote(M.normalize(modules), book, Object.assign({}, opts, { plan: 'auto' })).display.monthly; } catch (e2) { return null; } }
}
function mail(name, o) {
  return Promise.resolve().then(function () { return require('./mail').templates[name](o); }).catch(function (e) { console.warn('[plan-change] ' + name + ' mail skipped:', e && e.message); });
}
function keys(list, name) {
  if (!Array.isArray(list) || !list.length || list.length > 24) fail('Choose at least one module to ' + name, 400);
  var out = [];
  list.forEach(function (k) {
    if (typeof k !== 'string' || !M.get(k)) fail('Unknown module', 400);
    if (k === 'lite') fail('Omega Design is always included', 400);
    if (out.indexOf(k) < 0) out.push(k);
  });
  return out;
}
/* Everything a requested module needs that the tenant does not own yet. */
function closure(owned, add) {
  var out = [];
  function take(k) { if (owned.indexOf(k) >= 0 || out.indexOf(k) >= 0) return; M.get(k).requires.forEach(take); out.push(k); }
  add.forEach(take);
  return out;
}
function scaled(lines, numerator, denominator) {
  var out = lines.map(function (l) { return Object.assign({}, l, { quantity: 1, amountCents: Math.round(l.amountCents * numerator / denominator) }); });
  var target = Math.round(lines.reduce(function (n, l) { return n + l.amountCents; }, 0) * numerator / denominator);
  var rounded = out.reduce(function (n, l) { return n + l.amountCents; }, 0);
  if (out.length) out[0].amountCents += target - rounded;
  return out;
}
/* The invoice lines for the DIFFERENCE between two quotes, at list-price
 * cents scaled to the rest of the cycle. Inside a tier nothing is owed for
 * editor-side modules. Moving to a tier is one line on that plan's item.
 * Leaving a tier for Lite + modules lists the added modules at list and books
 * the remainder (the bundled modules now at list) against the plan left, so
 * every line lands on an item QuickBooks already has. Logic parts are their
 * own lines (the bundle when the fifth part completes it); a credit delta is
 * one discount line. */
function deltaLines(before, after, book, cycleDays, remainingDays) {
  var lines = [], planName = function (p) { return p === 'alacarte' ? 'Lite + modules' : book.plans[p].name; };
  var addedEditor = after.modules.filter(function (k) { return before.modules.indexOf(k) < 0 && M.get(k).shelf !== 'platform'; });
  var editorSide = function (q) { return q.recurringCents - q.logicCents - q.loginCents; };
  var editorDelta = editorSide(after) - editorSide(before);
  if (after.plan !== 'alacarte') {
    if (after.plan !== before.plan && editorDelta > 0) lines.push({ itemKey: 'plan:' + after.plan, name: planName(after.plan) + ' plan · change from ' + planName(before.plan) + ', rest of this cycle', quantity: 1, amountCents: editorDelta });
  } else {
    var addedSum = 0;
    addedEditor.forEach(function (k) { addedSum += book.modules[k].priceCents; lines.push({ itemKey: 'module:' + k, name: M.get(k).name + ' · rest of this cycle', quantity: 1, amountCents: book.modules[k].priceCents }); });
    if (before.plan !== 'alacarte' && editorDelta - addedSum !== 0) lines.push({ itemKey: 'plan:' + before.plan, name: 'Leaving ' + planName(before.plan) + ' · bundled modules now at list price, rest of this cycle', quantity: 1, amountCents: editorDelta - addedSum });
  }
  var logicDelta = after.logicCents - before.logicCents;
  if (logicDelta > 0) {
    var addedLogic = after.modules.filter(function (k) { return before.modules.indexOf(k) < 0 && M.get(k).shelf === 'platform'; });
    var bundleNow = after.lines.some(function (l) { return l.itemKey === 'logic-bundle'; });
    if (bundleNow) lines.push({ itemKey: 'logic-bundle', name: book.logicBundle.name + ' · rest of this cycle', quantity: 1, amountCents: logicDelta });
    else addedLogic.forEach(function (k) { lines.push({ itemKey: 'module:' + k, name: M.get(k).name + ' · rest of this cycle', quantity: 1, amountCents: book.modules[k].priceCents }); });
  }
  var creditDelta = after.creditCents - before.creditCents;
  if (creditDelta > 0) lines.push({ itemKey: 'credit', name: 'Transformation credit', quantity: 1, amountCents: -creditDelta });
  return scaled(lines, remainingDays, cycleDays).filter(function (l) { return l.amountCents !== 0; });
}
function state(c, now) {
  var b = c.billing;
  if (b.packaged !== true) return { canApply: false, reason: 'This workspace is not on a subscription package.' };
  if (c.org.status !== 'active') return { canApply: false, reason: 'Your workspace is not active.' };
  if (b.packagingState === 'trial') return { canApply: false, reason: 'Your trial runs the package proposed at approval. Additions start after your first payment.' };
  if (b.packagingState !== 'paid') return { canApply: false, reason: 'Pay your current invoice first. Additions are available once the payment clears.' };
  if ((b.interval || 'monthly') === 'annual') return { canApply: false, reason: 'Additions to an annual prepay are quoted by ClearSky. Contact support.' };
  if (!b.billingDay || !D.customerId(b, D.providerOf(b))) return { canApply: false, reason: 'Billing is not set up for this workspace yet.' };
  return { canApply: true };
}
/* a change whose invoice can no longer be paid: voided or refunded at the
   provider ('reversed'), or cancelled with its invoice voided at once (Stripe) */
function dead(r) { return r.state === 'reversed' || (r.state === 'cancelled' && r.voided === true); }
function pending(records) {
  return records.filter(function (r) { return S.kindOf(r) === 'change' && r.state === 'unpaid' && D.issued(r); })
    .map(function (r) { return { id: r.id, add: r.add, names: names(r.add), plan: r.plan, totalCents: r.totalCents, display: P.money(r.totalCents), paymentLink: r.paymentLink || null, payWith: D.name(D.recordProvider(r)), date: r.date, expiresOn: r.cycle.end, state: r.state }; });
}
async function records(c) { return (await c.root.collection('billing').doc('current').collection('invoices').orderBy('date').get()).docs.map(function (d) { return d.data(); }); }
function names(list) { return (list || []).map(function (k) { return M.get(k) ? M.get(k).name : k; }); }
function ordinal(d) { var s = ['th', 'st', 'nd', 'rd'], v = d % 100; return d + (s[(v - 20) % 10] || s[v] || s[0]); }
/* Pure quote from a loaded context. `rows` are the tenant's invoice records. */
function quote(c, rows, input, now) {
  var b = c.billing, book = c.book, gate = state(c, now), open = pending(rows);
  var sub = b.subscription && Array.isArray(b.subscription.modules) ? b.subscription : { modules: b.modules, plan: b.plan };
  var owned = M.normalize(sub.modules), add = closure(owned, keys(input.add, 'add'));
  if (!add.length) fail('Those modules are already in your package', 400);
  var target = M.normalize(owned.concat(add));
  var opts = { builders: b.builders, viewers: b.viewers, serviceFee: b.serviceFee, credit: b.credit, interval: b.interval, now: now };
  var before;
  try { before = P.quote(owned, book, Object.assign({ plan: sub.plan || 'auto' }, opts)); }
  catch (e) { before = P.quote(owned, book, Object.assign({ plan: 'auto' }, opts)); }
  // The plan stays what the tenant chose. A cheaper tier is OFFERED (steer),
  // never applied silently; the tenant takes it by passing plan explicitly.
  var requested = input.plan == null ? (sub.plan || 'auto') : input.plan;
  if (['auto', 'alacarte', 'field', 'pro'].indexOf(requested) < 0) fail('Invalid plan', 400);
  var after;
  try { after = P.quote(target, book, Object.assign({ plan: requested }, opts)); }
  catch (e) { if (requested === 'auto') throw e; after = P.quote(target, book, Object.assign({ plan: 'auto' }, opts)); }
  var today = iso(now), cycle = R.cycle(today, b.billingDay || 1);
  var lines = deltaLines(before, after, book, cycle.days, cycle.remainingDays);
  var totalCents = lines.reduce(function (n, l) { return n + l.amountCents; }, 0);
  if (totalCents < 0) { lines = []; totalCents = 0; }
  var monthlyDelta = after.monthlyCents - before.monthlyCents, included = totalCents === 0;
  var steer = null;
  if (after.recommendation && after.recommendation.plan !== after.plan && after.recommendation.savingsCents > 0) {
    steer = { plan: after.recommendation.plan, savingsCents: after.recommendation.savingsCents,
      display: 'Switch to ' + (after.recommendation.plan === 'alacarte' ? 'Lite + modules' : book.plans[after.recommendation.plan].name) + ' and save ' + P.money(after.recommendation.savingsCents) + '/month.' };
  }
  var feeNote = after.serviceFee.amountCents !== before.serviceFee.amountCents ? 'Your annual service fee at renewal becomes ' + after.serviceFee.display + ' (now ' + before.serviceFee.display + ').' : null;
  var blocked = gate.canApply && open.length ? { canApply: false, reason: 'A change is waiting for payment: ' + open[0].add.map(function (k) { return M.get(k).name; }).join(', ') + '. Pay it on the invoice page or cancel it first.' } : gate;
  /* the renewal is due and not issued yet: a paid change now would bill the
     whole new cycle, and the renewal would bill it again once the change is
     in the subscription (a $0 addition or a pack bills nothing twice) */
  if (blocked.canApply && totalCents > 0 && b.nextInvoiceOn && b.nextInvoiceOn <= today) blocked = { canApply: false, reason: 'Your renewal is being issued today. Add modules once it has gone through; that usually takes under an hour.' };
  var basis = { org: c.root.id, book: book.version, owned: owned, add: add, plan: after.plan, cycle: cycle, lines: lines, total: totalCents, billing: { plan: sub.plan, credit: b.credit, builders: b.builders, viewers: b.viewers, interval: b.interval, serviceFee: b.serviceFee } };
  /* The same addition asked for again in this cycle has the same id as the
     one asked for before. Cancelled, its invoice is still open at the
     provider (cancel never voids it), so apply REVIVES that change on that
     invoice rather than issuing a second one a customer could also pay.
     Only when that invoice is dead (voided or refunded: 'reversed') is the
     next request a new change, with its own id and invoice. */
  var reissued = rows.filter(function (r) { return S.kindOf(r) === 'change' && dead(r) && r.cycle && r.cycle.start === cycle.start; }).length;
  if (reissued) basis.reissued = reissued;
  var id = Q.key(B.stable(basis));
  /* a cancelled change of this cycle for any of these modules whose invoice
     is still open, asked for on another day (another price, so another id):
     never a second invoice beside it; pay that one, or ClearSky voids it */
  var stillOpen = rows.filter(function (r) { return S.kindOf(r) === 'change' && r.state === 'cancelled' && !dead(r) && D.issued(r) && r.cycle && r.cycle.start === cycle.start && r.id !== 'change-' + id && (r.add || []).some(function (k) { return add.indexOf(k) >= 0; }); });
  if (blocked.canApply && stillOpen.length) blocked = { canApply: false, reason: 'Your cancelled request for ' + names(stillOpen[0].add).join(', ') + ' still has an open ' + D.name(D.recordProvider(stillOpen[0])) + ' invoice' + (stillOpen[0].paymentLink ? ' (' + stillOpen[0].paymentLink + ')' : '') + '. Pay that invoice to switch it on, or ask ClearSky to void it and request again.' };
  return { orgId: c.root.id, previewId: id, effectiveAt: now, add: add, addNames: names(add), modules: target, plan: after.plan, planBefore: before.plan, planDisplay: after.display.plan,
    before: { plan: before.plan, monthlyCents: before.monthlyCents, display: before.display.monthly },
    after: { plan: after.plan, monthlyCents: after.monthlyCents, display: after.display.monthly, fit: after.display.fit },
    monthlyDeltaCents: monthlyDelta, todayCents: totalCents, included: included, lines: lines,
    cycle: { start: cycle.start, end: cycle.end, days: cycle.days, remainingDays: cycle.remainingDays }, billingDay: b.billingDay,
    activation: included ? 'immediate' : 'on-payment', steer: steer, serviceFeeNote: feeNote, canApply: blocked.canApply, reason: blocked.reason || null, pending: open,
    display: {
      today: included ? 'Included in your ' + after.display.plan + ' plan: no charge today.' : P.money(totalCents) + ' today (' + cycle.remainingDays + ' of ' + cycle.days + ' days left until your billing date, ' + cycle.end + ')',
      then: 'then ' + after.display.monthly + ' on the ' + ordinal(b.billingDay || 1) + (monthlyDelta === 0 ? ' (unchanged)' : monthlyDelta > 0 ? ' (up from ' + before.display.monthly + ')' : ' (down from ' + before.display.monthly + ')'),
      activation: included ? 'It switches on now.' : 'Billed through ' + D.name(D.providerOf(b)) + '. It switches on as soon as the payment clears; pay before ' + cycle.end + ' or the request expires.' } };
}
async function preview(db, orgId, input, now) { var c = await S.context(db, orgId); return quote(c, await records(c), input, now); }
async function apply(db, orgId, input, caller, now, deps) {
  var c = await S.context(db, orgId); S.guard(c);
  if (typeof input.previewId !== 'string' || !/^[a-f0-9]{48}$/.test(input.previewId)) fail('Preview changed; review the current quote before subscribing');
  var current = c.root.collection('billing').doc('current'), op = current.collection('operations').doc('change-' + input.previewId);
  var fingerprint = Q.key(B.stable({ add: input.add, plan: input.plan == null ? null : input.plan }));
  // A retry of a finished request returns its result before anything is re-quoted.
  var done = await op.get();
  if (done.exists && done.data().state === 'done') {
    if (done.data().requestFingerprint !== fingerprint) fail('A change id cannot be reused with different inputs');
    var mine = current.collection('invoices').doc('change-' + input.previewId), had = await mine.get();
    if (had.exists && dead(had.data())) fail('Your package changed; review the current quote before subscribing');
    if (had.exists && had.data().state === 'cancelled') return revive(db, c, mine, input, done.data().result, caller, now);
    return done.data().result;
  }
  var rows = await records(c), p = quote(c, rows, input, now);
  if (input.previewId !== p.previewId) fail('Preview changed; review the current quote before subscribing');
  var at = input.effectiveAt;
  if (!Number.isSafeInteger(at) || at > now || now - at > 10 * 60000) fail('Refresh the quote');
  if (!p.canApply) fail(p.reason);
  var record = { kind: 'change', id: 'change-' + p.previewId, date: iso(now), cycle: { start: p.cycle.start, end: p.cycle.end }, period: { start: iso(now), end: p.cycle.end },
    add: p.add, modules: p.modules, plan: p.plan, planBefore: p.planBefore, lines: p.lines, subtotalCents: p.todayCents, totalCents: p.todayCents, pricebookVersion: c.book.version,
    marker: 'OMEGA change ' + orgId + ' / ' + iso(now) + ' / ' + p.previewId.slice(0, 12), by: caller.email, createdAt: now, monthlyCents: p.after.monthlyCents };
  var replay = await db.runTransaction(async function (tx) {
    var old = await tx.get(op), live = await tx.get(current), invoices = await tx.get(current.collection('invoices').orderBy('date'));
    if (old.exists && old.data().state === 'done') return old.data().result;
    var fresh = live.data() || {}, again = quote(Object.assign({}, c, { billing: fresh }), invoices.docs.map(function (d) { return d.data(); }), input, now);
    if (again.previewId !== p.previewId || !again.canApply) fail('Your package changed; review the current quote before subscribing');
    if (fresh.changeLock && fresh.changeLock.until > now) fail('A change is already being processed; retry shortly');
    tx.set(current, { changeLock: { id: record.id, until: now + 120000 } }, { merge: true });
    tx.set(op, { state: 'running', at: now, by: caller.email, requestFingerprint: fingerprint }, { merge: true });
    return null;
  });
  if (replay) return replay;
  try {
    var issued = null, provider = D.providerOf(c.billing), customerOf = D.customerId(c.billing, provider), payWith = D.name(provider);
    if (p.todayCents > 0) issued = await D.driver(c.book, provider, deps).invoice(record, BP.stored(c.profile), customerOf);
    return await db.runTransaction(async function (tx) {
      var live = await tx.get(current), invoices = await tx.get(current.collection('invoices').orderBy('date')), fresh = live.data() || {};
      if (!fresh.changeLock || fresh.changeLock.id !== record.id) fail('Change inputs moved; retry');
      var stored = Object.assign({}, record, issued ? Object.assign({ state: 'unpaid' }, D.invoiceFields(provider, issued.id, customerOf), { totalCents: issued.totalCents, paymentLink: issued.payUrl, issuedAt: now })
        : Object.assign({ state: 'paid', provider: provider, paidCents: 0, paymentLink: null, activatedAt: now }, provider === 'stripe' ? { stripeInvoiceId: null, stripeCustomerId: customerOf } : { qboInvoiceId: null, qboCustomerId: customerOf }));
      tx.set(current.collection('invoices').doc(record.id), stored);
      var all = invoices.docs.map(function (d) { return d.data(); }).concat([stored]), after = fresh;
      if (!issued) after = Object.assign({}, fresh, { subscription: Object.assign({}, fresh.subscription || {}, { modules: p.modules, plan: p.plan, changedAt: now }) });
      var patch = S.displayAfter(S.accessAfterInvoices(after, all, c.book, now), after, c.book, now);
      if (!issued) patch.subscription = after.subscription;
      patch.changeLock = null; patch.updatedAt = now; patch.updatedBy = caller.email;
      tx.update(current, patch);
      if (issued) tx.set(c.root.collection('notifications').doc('package-change-' + record.id), { kind: 'billing', read: false, createdAt: now,
        text: 'Your subscription change invoice is ready: ' + P.money(issued.totalCents) + '. Pay it on the invoice page to switch on ' + p.add.map(function (k) { return M.get(k).name; }).join(', ') + '.',
        packageMail: 'packageInvoice', mailState: 'pending', paymentLink: issued.payUrl, amountDisplay: P.money(issued.totalCents), payWith: payWith });
      var result = { ok: true, changeId: record.id, state: issued ? 'awaiting_payment' : 'active', add: p.add, addNames: names(p.add), plan: p.plan,
        todayCents: stored.totalCents, display: P.money(stored.totalCents), paymentLink: stored.paymentLink, payWith: payWith, expiresOn: p.cycle.end, modules: patch.modules || fresh.modules };
      tx.set(op, { state: 'done', result: result, completedAt: now }, { merge: true });
      var event = { at: now, by: caller.email, action: issued ? 'change-requested' : 'change-included', changeId: record.id,
        was: { modules: fresh.modules, plan: fresh.plan }, changed: { add: p.add, plan: p.plan, totalCents: stored.totalCents, modules: patch.modules || fresh.modules, state: stored.state } };
      tx.set(current.collection('history').doc(record.id), event); tx.set(c.root.collection('admin_audit').doc(record.id), event);
      return result;
    });
  } catch (e) {
    await db.runTransaction(async function (tx) {
      var live = await tx.get(current), old = await tx.get(op), fresh = live.data() || {};
      if (old.exists && old.data().state === 'done') return;
      if (fresh.changeLock && fresh.changeLock.id === record.id) tx.update(current, { changeLock: null });
      tx.set(op, { state: 'retry', failedAt: now }, { merge: true });
    });
    throw e;
  }
}
/* The same change asked for again after its cancel, while its invoice is
   still open at the provider: it waits for payment again on that invoice. */
async function revive(db, c, ref, input, result, caller, now) {
  var current = c.root.collection('billing').doc('current');
  return db.runTransaction(async function (tx) {
    var snap = await tx.get(ref), live = await tx.get(current), invoices = await tx.get(current.collection('invoices').orderBy('date')), fresh = live.data() || {};
    var rows = invoices.docs.map(function (d) { return d.data(); }), r = snap.data();
    if (!r || r.state !== 'cancelled' || dead(r)) fail('Your package changed; review the current quote before subscribing');
    /* still the same request, still allowed: nothing else is waiting, the cycle and the price are unchanged */
    var again = quote(Object.assign({}, c, { billing: fresh }), rows, input, now);
    if (again.previewId !== input.previewId) fail('Your package changed; review the current quote before subscribing');
    if (!again.canApply) fail(again.reason);
    tx.update(ref, { state: 'unpaid', cancelledAt: null, cancelledBy: null, reopenedAt: now, reopenedBy: caller.email });
    var all = rows.map(function (d) { return d.id === r.id ? Object.assign({}, d, { state: 'unpaid' }) : d; });
    tx.update(current, S.displayAfter(S.accessAfterInvoices(fresh, all, c.book, now), fresh, c.book, now));
    var event = { at: now, by: caller.email, action: 'change-reopened', changeId: r.id, invoiceId: D.invoiceId(r),
      was: { state: 'cancelled' }, changed: { state: 'unpaid', note: 'Asked for again after its cancel: it waits on the same ' + D.name(D.recordProvider(r)) + ' invoice, never a second one.' } };
    tx.set(current.collection('history').doc(r.id + '-reopen-' + now), event); tx.set(c.root.collection('admin_audit').doc(r.id + '-reopen-' + now), event);
    return Object.assign({}, result, { state: 'awaiting_payment', paymentLink: r.paymentLink || result.paymentLink || null, reopened: true });
  });
}
async function cancel(db, orgId, changeId, caller, now, deps) {
  var c = await S.context(db, orgId);
  if (typeof changeId !== 'string' || !/^change-[a-f0-9]{48}$/.test(changeId)) fail('Invalid change id', 400);
  var current = c.root.collection('billing').doc('current'), ref = current.collection('invoices').doc(changeId);
  /* on Stripe the invoice is voided first, so it cannot be paid after the
     tenant said no (a paid one is refused: it is switching on). QuickBooks'
     stays open until staff void it, as before. */
  var before = await ref.get(), voided = false;
  if (before.exists && S.kindOf(before.data()) === 'change' && before.data().state === 'unpaid' && D.recordProvider(before.data()) === 'stripe') {
    await D.driver(c.book, 'stripe', deps).voidOpen(before.data()); voided = true;
  }
  return db.runTransaction(async function (tx) {
    // Every read before any write, as Firestore transactions require.
    var snap = await tx.get(ref), live = await tx.get(current), invoices = await tx.get(current.collection('invoices').orderBy('date')), fresh = live.data() || {};
    if (!snap.exists || S.kindOf(snap.data()) !== 'change') fail('No such change', 404);
    var r = snap.data(); if (r.state !== 'unpaid') fail('Only a change waiting for payment can be cancelled');
    tx.update(ref, Object.assign({ state: 'cancelled', cancelledAt: now, cancelledBy: caller.email }, voided ? { voided: true, paymentLink: null } : {}));
    var all = invoices.docs.map(function (d) { return d.id === changeId ? Object.assign({}, d.data(), { state: 'cancelled' }) : d.data(); });
    tx.update(current, S.displayAfter(S.accessAfterInvoices(fresh, all, c.book, now), fresh, c.book, now));
    var event = { at: now, by: caller.email, action: 'change-cancelled', changeId: changeId, invoiceId: D.invoiceId(r),
      was: { state: r.state }, changed: { state: 'cancelled', note: voided ? 'Its Stripe invoice was voided, so it cannot be paid.' : 'The ' + D.name(D.recordProvider(r)) + ' invoice stays open until staff void it; a payment after this is flagged for review.' } };
    tx.set(current.collection('history').doc(changeId + '-cancel'), event); tx.set(c.root.collection('admin_audit').doc(changeId + '-cancel'), event);
    return { ok: true, changeId: changeId, state: 'cancelled' };
  });
}
/* The catalog owns every dependency. Removing a prerequisite includes its
 * dependents; keeping a dependent also keeps its prerequisites. Lite stays.
 * This is a review request, never an immediate grant or invoice change. */
function removalSelection(billing, wanted, withdraw) {
  /* a plan billed outside the engine opts out by request (opt-out); a page
     from before that door existed still posts here, and is told to reload */
  if (billing.packaged !== true) fail('This workspace is not on a subscription package: Opt out sends ClearSky a request instead (reload the page).');
  var owned = M.normalize(billing.subscription && Array.isArray(billing.subscription.modules) ? billing.subscription.modules : billing.modules);
  wanted.forEach(function (k) { if (owned.indexOf(k) < 0) fail(M.get(k).name + ' is not in your package', 400); });
  return { owned: owned, modules: closeOver(owned, wanted, withdraw) };
}
function closeOver(owned, wanted, withdraw) {
  var selected = wanted.slice(), changed = true;
  while (changed) {
    changed = false;
    owned.forEach(function (k) {
      if (withdraw && selected.indexOf(k) >= 0) M.get(k).requires.forEach(function (r) {
        if (r !== 'lite' && selected.indexOf(r) < 0) { selected.push(r); changed = true; }
      });
      if (!withdraw && selected.indexOf(k) < 0 && M.get(k).requires.some(function (r) { return selected.indexOf(r) >= 0; })) { selected.push(k); changed = true; }
    });
  }
  return owned.filter(function (k) { return selected.indexOf(k) >= 0; });
}
/* Removals never change access today; they queue for the quarterly review.
 * Dry run and apply read the same current subscription inside a transaction;
 * a changed dependency set requires the owner to review it again. */
async function removal(db, orgId, input, caller, now, withdraw) {
  var c = await S.context(db, orgId), wanted = keys(input.remove, 'remove'), verified = emailVerified(caller);
  var current = c.root.collection('billing').doc('current'), sent = null;
  var result = await db.runTransaction(async function (tx) {
    var live = await tx.get(current), fresh = live.data() || {}, list = (fresh.removalRequests || []).slice();
    var selection = removalSelection(fresh, wanted, withdraw), remove = selection.modules;
    /* what is already queued is part of the preview: a removal queued or
       withdrawn between the dry run and the confirm changes the fee from the
       review, so the confirm must be reviewed again */
    var queued = list.map(function (r) { return r && r.module; }).filter(function (k) { return typeof k === 'string'; });
    var previewId = Q.key(B.stable({ orgId: orgId, owned: selection.owned, modules: remove, withdraw: !!withdraw, queued: queued }));
    var note = withdraw ? 'The opt-out request is withdrawn for these modules. Access and billing are unchanged.' : 'Queued for the quarterly review with ClearSky. Access and charges stay unchanged until that review; this does not issue a refund.';
    /* what the review changes, in money: the fee on what is owned and on
       what is left once EVERYTHING queued for that review goes (this request
       and every opt-out already waiting for it, review finding 0), and the
       day it happens. Both are priced ON the review day, at its last
       instant, so a transformation credit counts only if it still runs then:
       a paid activation's credit ends part-way through the first review day
       (review finding 1). No review date on record: priced today. The menu
       states it before anything is written; the server is the only one that
       prices. */
    var money = {};
    if (!withdraw) {
      var leaving = remove.slice(), also = [];
      queued.forEach(function (k) { if (leaving.indexOf(k) < 0) { leaving.push(k); also.push(k); } });
      var rev = reviewOn(fresh, c.book, now), at = rev ? R.date(rev) + R.DAY - 1 : now;
      money = { beforeDisplay: monthlyFor(fresh, c.book, selection.owned, at),
        afterDisplay: monthlyFor(fresh, c.book, selection.owned.filter(function (k) { return leaving.indexOf(k) < 0; }), at),
        reviewOn: rev, alsoLeaving: names(also.filter(function (k) { return selection.owned.indexOf(k) >= 0; })) };
    }
    if (input.dryRun === true) return Object.assign({ previewId: previewId, modules: remove, names: names(remove), withdraw: !!withdraw,
      note: withdraw ? 'Confirming will withdraw the opt-out request for these modules. Access and billing will stay unchanged.' : 'Confirming queues these modules for the quarterly review with ClearSky. Access and charges stay unchanged until that review; this does not issue a refund.' }, money);
    if (input.previewId !== previewId) fail('Your package changed; review the opt-out request again');
    remove.forEach(function (k) {
      var i = -1; list.forEach(function (r, n) { if (r.module === k) i = n; });
      if (withdraw) { if (i >= 0) list.splice(i, 1); }
      else if (i < 0) list.push({ module: k, requestedAt: now, by: caller.email, reason: typeof input.reason === 'string' ? input.reason.slice(0, 300) : '' });
    });
    tx.update(current, { removalRequests: list, updatedAt: now, updatedBy: caller.email });
    var id = 'removal-' + Q.key(B.stable({ w: wanted, withdraw: !!withdraw, at: now }));
    var event = { at: now, by: caller.email, emailVerified: verified, action: withdraw ? 'removal-withdrawn' : 'removal-requested', changed: { modules: remove, removalRequests: list, note: note } };
    tx.set(current.collection('history').doc(id), event); tx.set(c.root.collection('admin_audit').doc(id), event);
    if (!withdraw) sent = Object.assign({ names: names(remove), reason: typeof input.reason === 'string' ? input.reason.slice(0, 300) : '' }, money);
    return { ok: true, removalRequests: list, modules: remove, names: names(remove), note: note };
  });
  /* ClearSky hears about an opt-out the moment it is queued, with the date
     and the fee it moves to, so the review is prepared rather than found */
  if (sent) await mail('removalAlert', Object.assign({ company: c.org.name || orgId, orgId: orgId, by: caller.email, verified: verified }, sent));
  return result;
}
async function summary(db, orgId) {
  var c = await S.context(db, orgId, null, { lenient: true }), rows = c.org.missingRecord ? [] : await records(c), b = c.billing, now = Date.now(), monthly = null, planDisplay = null;
  var sub = b.subscription && Array.isArray(b.subscription.modules) ? b.subscription : { modules: b.modules, plan: b.plan };
  if (b.packaged === true) {
    try {
      var q = P.quote(M.normalize(sub.modules), c.book, { plan: sub.plan || 'auto', builders: b.builders, viewers: b.viewers, serviceFee: b.serviceFee, credit: b.credit, interval: b.interval, now: now });
      monthly = q.display.monthly; planDisplay = q.display.plan;
    } catch (e) { monthly = b.monthlyDisplay || null; }
  }
  /* every invoice the workspace has, newest first: the Account panel lists
     them with the pay link while unpaid (Phase 10B: pay in settings) */
  var invoices = rows.slice().reverse().slice(0, 24).map(function (r) {
    return { id: r.id || r.date, kind: S.kindOf(r), state: r.state, date: r.date, period: r.period || null, totalCents: r.totalCents, display: P.money(r.totalCents),
      paymentLink: r.state === 'unpaid' ? (r.paymentLink || null) : null, payWith: D.name(D.recordProvider(r)), names: r.add ? names(r.add) : S.kindOf(r) === 'addon' && r.modules ? names(r.modules) : null,
      purpose: r.purpose || null, paidAt: r.paidAt || null };
  });
  return { orgId: orgId, packaged: b.packaged === true, packagingState: b.packagingState || null, plan: sub.plan || null, planDisplay: planDisplay, modules: b.modules || ['lite'], subscription: sub.modules || ['lite'],
    moduleNames: names(b.modules || ['lite']), subscriptionNames: names(sub.modules || ['lite']),
    interval: b.interval || 'monthly', billingDay: b.billingDay || null, nextInvoiceOn: b.nextInvoiceOn || null, monthlyDisplay: monthly,
    accessUntil: b.accessUntil == null ? null : b.accessUntil, paidThrough: b.paidThrough || null, amountDue: b.amountDue == null ? null : b.amountDue,
    amountDueDisplay: b.amountDue == null ? null : P.money(Math.round(b.amountDue * 100)), paymentLink: b.paymentLink || null, invoices: invoices,
    provider: D.providerOf(b), payWith: D.name(D.providerOf(b)),
    gate: state(c, Date.now()), pending: pending(rows), removalRequests: b.removalRequests || [],
    /* what a plan billed outside the engine has asked for, as stored, and
       the day a packaged removal is reviewed: every card reads one summary */
    optIns: b.optIns || {}, optOuts: b.optOuts || {}, nextReviewOn: reviewOn(b, c.book, now),
    /* a plan billed outside the engine: its add-ons (api/_lib/addons.js), bought, on, owed */
    addOns: b.packaged === true ? null : AO.view(b, rows, now),
    recent: rows.filter(function (r) { return S.kindOf(r) === 'change' && r.state !== 'unpaid'; }).slice(-5).map(function (r) { return { id: r.id, add: r.add, names: names(r.add), state: r.state, date: r.date, display: P.money(r.totalCents || 0) }; }) };
}
/* ── Opt in on a plan billed OUTSIDE the engine (Tommy, 2026-09-27: "when
   I click opt in it should be using the pricing and adding this to my
   monthly subscription fee"). A legacy tenant (billing.packaged !== true)
   holds a tier, not a package, and its invoices are Stripe's or ClearSky's
   paper, so this engine cannot quote or charge it. What it can do is take
   the opt-in WITH THE PRICE ON RECORD: the module and what it requires,
   priced from the book, written to billing/current.optIns[key] with who
   and when, a history row, an admin_audit row, and a note to ClearSky —
   who moves the workspace onto a subscription package from /admin/tenant
   (its Package tab preselects what is held and requested), where the
   addition lands on the monthly invoice. Nothing is charged here. A
   packaged workspace is refused and sent to quote/apply. */
var LOGIC = ['logic-office', 'logic-plant', 'logic-materials', 'logic-logistics', 'logic-customer'];
var NO_BILLING = 'Billing is not set up for this workspace yet. Email ClearSky and the module is added when it is.';
/* what the SERVER knows a legacy record holds of Omega Logic: every
   department, by its add-on (opting out of Office takes them all) */
function legacyLogic(b) { return (b.addons || []).indexOf('omega-logic') >= 0 ? LOGIC.slice() : []; }
/* a missing status is a legacy record, active (tenantActive() in the rules and
   omega-tenant.js read it the same way); only an explicit one refuses */
function activeHere(c) { if ((c.org.status || 'active') !== 'active') fail('Your workspace is not active.', 409); }
/* a REQUEST is filed on the owner or administrator ROLE alone (api/plan-change.js);
   the entry, the history and audit rows and ClearSky's mail say whether the
   address was verified */
function emailVerified(caller) { return !!(caller && (caller.staff || (caller.claims && caller.claims.email_verified === true))); }
function needs(k) { return (M.get(k) || { requires: [] }).requires; }
function requested(map) { return Object.keys(map || {}).filter(function (k) { return map[k] && map[k].status === 'requested' && !!M.get(k); }); }
async function optIn(db, orgId, input, caller, now) {
  if (orgId === 'clearsky-usa.com') fail('This is ClearSky\'s own workspace: every module is already on for ClearSky staff. To try buying a module, use a test workspace.', 409);
  var c = await S.context(db, orgId, null, { lenient: true }), b = c.billing;
  if (b.packaged === true) fail('This workspace is on a subscription package: add modules through the menu, which prices and invoices them.', 409);
  activeHere(c);
  var add = keys(input.add, 'add'), byKey = {}, verified = emailVerified(caller);
  P.catalog(c.book).forEach(function (m) { byKey[m.key] = m; });
  var have = requested(b.optIns);
  /* a module on now as a paid add-on is held: never requested again, and what it needs is not pulled in */
  var wanted = closure(['lite'].concat(legacyLogic(b), have, AO.live(b, now)), add);
  if (!wanted.length) fail('Already requested', 409);
  var at = iso(now), entries = {}, cents = 0;
  /* `asked`: the person named this module, or the closure pulled it in
     (Office for Plant). Cancel request takes back a pulled-in module with
     the last request that needed it, never one asked for on its own. */
  wanted.forEach(function (k) { var m = byKey[k]; cents += m.priceCents; entries[k] = { key: k, name: m.name, monthlyCents: m.priceCents, display: m.priceDisplay, requestedBy: caller.email, requestedAt: at, status: 'requested', asked: add.indexOf(k) >= 0, emailVerified: verified, pricebookVersion: c.book.version }; });
  var current = c.root.collection('billing').doc('current'), id = 'optin-' + Q.key(B.stable({ w: wanted, at: now }));
  /* the confirm panel: the same closure and price the request would record,
     and nothing written; a workspace with no billing record is refused here
     too, so the panel never offers what the write would refuse */
  if (input.dryRun === true) {
    if (!(await current.get()).exists) fail(NO_BILLING, 409);
    return { dryRun: true, add: wanted, names: names(wanted), monthlyCents: cents, display: P.money(cents) + '/month',
      note: 'We record this with its price and tell ClearSky, who moves ' + (c.org.name || 'the workspace') + ' onto monthly billing within one business day; your first invoice carries it. Nothing is charged before you approve that invoice.' };
  }
  var event = { at: now, by: caller.email, emailVerified: verified, action: 'opt-in-requested', changeId: id, was: { tier: b.tier || null, addons: b.addons || [], optIns: have },
    changed: { add: wanted, names: names(wanted), monthlyCents: cents, note: 'Recorded with its price; ClearSky moves the workspace onto a package. Nothing charged.' } };
  await db.runTransaction(async function (tx) {
    var live = await tx.get(current), fresh = live.data() || {};
    /* never make a billing record out of a request: a record holding only
       optIns would read as a plan with no tier to every gate that reads it */
    if (!live.exists) fail(NO_BILLING, 409);
    tx.set(current, { optIns: Object.assign({}, fresh.optIns || {}, entries), updatedAt: now, updatedBy: caller.email }, { merge: true });
    tx.set(current.collection('history').doc(id), event); tx.set(c.root.collection('admin_audit').doc(id), event);
  });
  await mail('optInAlert', { company: c.org.name || orgId, orgId: orgId, names: names(wanted), display: P.money(cents) + '/month', by: caller.email, verified: verified, tier: b.tier || null });
  return { ok: true, requested: true, add: wanted, names: names(wanted), monthlyCents: cents, display: P.money(cents) + '/month', optIns: entries, requestedAt: at };
}
/* A request that is still open can be taken back (Cancel request). The
   catalog owns the dependencies both ways: cancelling the opt-in of a module
   also cancels the requested opt-ins that need it (Plant without Office is
   not a request) and the prerequisites that request PULLED IN (asked:
   false) once nothing still open needs them (cancelling Plant cancels the
   Office it brought, review finding 2; an Office asked for on its own, or
   recorded before `asked` existed, stays); cancelling an opt-OUT of a module
   keeps what it needs (keeping Plant keeps Office). Nothing about the bill
   changes either way. */
function withdrawSet(map, wanted, dependents) {
  var open = requested(map), out = [];
  wanted.forEach(function (k) { if (open.indexOf(k) < 0) fail('No request to withdraw', 409); });
  function take(k) {
    if (out.indexOf(k) >= 0 || open.indexOf(k) < 0) return; out.push(k);
    if (dependents) open.forEach(function (o) { if (needs(o).indexOf(k) >= 0) take(o); });
    else needs(k).forEach(function (r) { if (r !== 'lite') take(r); });
  }
  wanted.forEach(take);
  for (var grew = dependents; grew;) {
    grew = false;
    open.forEach(function (r) {
      if (out.indexOf(r) >= 0 || !map[r] || map[r].asked !== false) return;
      var pulled = out.some(function (o) { return needs(o).indexOf(r) >= 0; });
      var still = open.some(function (o) { return o !== r && out.indexOf(o) < 0 && needs(o).indexOf(r) >= 0; });
      if (pulled && !still) { out.push(r); grew = true; }
    });
  }
  return out;
}
async function withdraw(db, orgId, input, caller, now, field) {
  var c = await bare(db, orgId), optIn = field === 'optIns', wanted = keys(optIn ? input.add : input.remove, 'withdraw');
  /* a package's own doors: a change waiting for payment is cancelled, and a
     removal waiting for the review withdrawn, on the menu (cancel,
     withdraw-removal); a legacy request never lives on a packaged record */
  if (c.billing.packaged === true) fail(optIn ? 'This workspace is on a subscription package: a change waiting for payment is cancelled on the menu.'
    : 'This workspace is on a subscription package: an opt-out waiting for the review is withdrawn on the menu.', 409);
  var current = c.root.collection('billing').doc('current'), result = null, verified = emailVerified(caller);
  /* the confirm panel names everything the cancel takes back, from this
     rule, so the page never carries a second copy of it; nothing written */
  if (input.dryRun === true) {
    var snap = await current.get(), seen = snap.exists ? snap.data() || {} : null;
    if (!seen) fail('No request to withdraw', 409);
    var would = withdrawSet(Object.assign({}, seen[field] || {}), wanted, optIn);
    return { dryRun: true, withdrawn: would, names: names(would), note: 'Nothing about your bill changes.' };
  }
  await db.runTransaction(async function (tx) {
    var live = await tx.get(current), fresh = live.data() || {}, map = Object.assign({}, fresh[field] || {});
    if (!live.exists) fail('No request to withdraw', 409);
    var gone = withdrawSet(map, wanted, optIn), at = iso(now);
    gone.forEach(function (k) { map[k] = Object.assign({}, map[k], { status: 'withdrawn', withdrawnAt: at, withdrawnBy: caller.email }); });
    var id = (optIn ? 'optin-withdrawn-' : 'optout-withdrawn-') + Q.key(B.stable({ w: gone, at: now }));
    var event = { at: now, by: caller.email, emailVerified: verified, action: optIn ? 'opt-in-withdrawn' : 'opt-out-withdrawn', changeId: id, was: { requested: requested(fresh[field]) },
      changed: { withdrawn: gone, names: names(gone), note: 'Withdrawn before ClearSky acted on it. Nothing about the bill changes.' } };
    var patch = { updatedAt: now, updatedBy: caller.email }; patch[field] = map;
    tx.set(current, patch, { merge: true });
    tx.set(current.collection('history').doc(id), event); tx.set(c.root.collection('admin_audit').doc(id), event);
    result = { ok: true, withdrawn: gone, names: names(gone) }; result[field] = map;
  });
  /* ClearSky hears a withdrawal as it heard the request, so nothing is
     prepared for a change the workspace no longer wants */
  await mail(optIn ? 'optInAlert' : 'optOutAlert', { company: c.org.name || orgId, orgId: orgId, names: result.names, by: caller.email, verified: verified, tier: c.billing.tier || null, withdrawn: true });
  return result;
}
/* ── Opt out on a plan billed OUTSIDE the engine: the mirror of optIn. The
   tier's price is set by the tenant's agreement, so nothing is removed or
   re-priced here. The request is recorded on billing/current.optOuts[key]
   with who, when and why, a history row, an admin_audit row and a note to
   ClearSky, who confirms the effective date and any new price in writing;
   access is unchanged until then. It never touches tier, addons or
   toolAccess, and it prices nothing, so it needs no price book. A packaged
   workspace is refused and sent to the menu (request-removal). */
var OPT_OUT_NOTE = 'Your plan\'s price is set by your agreement, so nothing changes today. ClearSky confirms the effective date and any new price with you in writing; you keep access until then. Omega Design stays.';
async function optOut(db, orgId, input, caller, now) {
  var c = await bare(db, orgId), b = c.billing, remove = keys(input.remove, 'remove');
  if (b.packaged === true) fail('This workspace is on a subscription package: opt out through the menu, which queues it for the quarterly review.', 409);
  /* as optIn: a workspace awaiting approval, suspended or cancelled holds
     nothing to leave, so it files no request and ClearSky is not mailed one
     (review finding 9: a pending trial was offered Opt out of White Label) */
  activeHere(c);
  var current = c.root.collection('billing').doc('current'), verified = emailVerified(caller);
  if (!(await current.get()).exists) fail('Billing is not set up for this workspace yet. Email ClearSky to change the plan.', 409);
  /* a module on as a paid add-on is left on its own card (addon-cancel remove):
     it stops at the end of the month paid for, never by a request to ClearSky */
  var card = AO.live(b, now).filter(function (k) { return remove.indexOf(k) >= 0; });
  if (card.length) fail(names(card).join(', ') + (card.length > 1 ? ' are add-ons' : ' is an add-on') + ' you pay for by card: opt out on its card, and it stops at the end of the month you paid for.', 409);
  /* an opt-in still open on a module being left: the page offers Opt out
     only on a module the plan HOLDS (OmegaWorkspaceHub.moduleCard), so an
     open opt-in there is stale (ClearSky met it with a tier or add-on edit
     and never answered it). The opt-out closes it in the same write and the
     dry run says so; a module merely requested is cancelled, not left. */
  /* Office is what every Omega Logic department stands on: on a workspace
     holding the Omega Logic add-on, opting out of Office opts out of them all */
  var logic = legacyLogic(b);
  var all = remove.slice(); if (all.indexOf('logic-office') >= 0) logic.forEach(function (k) { if (all.indexOf(k) < 0) all.push(k); });
  var have = requested(b.optOuts), wanted = all.filter(function (k) { return have.indexOf(k) < 0; });
  if (!wanted.length) fail('Already requested', 409);
  var reason = typeof input.reason === 'string' ? input.reason.trim().slice(0, 300) : '';
  var stale = wanted.filter(function (k) { var o = (b.optIns || {})[k]; return !!(o && o.status === 'requested'); });
  /* the confirm panel's fingerprint: what leaves and what it closes. A plan
     that moved between the preview and the confirm (another opt-out, an
     Omega Logic add-on, an opt-in answered) is reviewed again. Optional, so a
     caller without a preview still files the request as recorded here */
  var previewId = Q.key(B.stable({ orgId: orgId, legacy: true, remove: wanted, closes: stale }));
  if (input.dryRun === true) return { dryRun: true, previewId: previewId, remove: wanted, names: names(wanted), closes: names(stale), note: OPT_OUT_NOTE };
  if (input.previewId != null && input.previewId !== previewId) fail('Your plan changed; review the opt-out request again');
  var at = iso(now), entries = {}, id = 'optout-' + Q.key(B.stable({ w: wanted, at: now })), merged = null, ins = null;
  wanted.forEach(function (k) { entries[k] = { key: k, name: M.get(k).name, requestedBy: caller.email, requestedAt: at, status: 'requested', reason: reason, emailVerified: verified }; });
  var event = { at: now, by: caller.email, emailVerified: verified, action: 'opt-out-requested', changeId: id, was: { tier: b.tier || null, addons: b.addons || [], optOuts: have },
    changed: { remove: wanted, names: names(wanted), reason: reason, closed: stale, note: 'Recorded for ClearSky to confirm under the agreement. Access and the plan are unchanged.' } };
  await db.runTransaction(async function (tx) {
    var live = await tx.get(current), fresh = live.data() || {};
    if (!live.exists) fail('Billing is not set up for this workspace yet. Email ClearSky to change the plan.', 409);
    merged = Object.assign({}, fresh.optOuts || {}, entries);
    var patch = { optOuts: merged, updatedAt: now, updatedBy: caller.email };
    if (stale.length) {
      ins = Object.assign({}, fresh.optIns || {});
      stale.forEach(function (k) { if (ins[k] && ins[k].status === 'requested') ins[k] = Object.assign({}, ins[k], { status: 'withdrawn', withdrawnAt: at, withdrawnBy: caller.email, withdrawnFor: 'opt-out' }); });
      patch.optIns = ins;
    }
    tx.set(current, patch, { merge: true });
    tx.set(current.collection('history').doc(id), event); tx.set(c.root.collection('admin_audit').doc(id), event);
  });
  await mail('optOutAlert', { company: c.org.name || orgId, orgId: orgId, names: names(wanted), by: caller.email, verified: verified, tier: b.tier || null, reason: reason });
  var out = { ok: true, requested: true, remove: wanted, names: names(wanted), closes: names(stale), optOuts: merged, requestedAt: at, note: OPT_OUT_NOTE };
  if (ins) out.optIns = ins;
  return out;
}
/* ── ClearSky ANSWERS a legacy request under the agreement, without moving
   the workspace onto a package (review finding 3: an opt-out honoured by a
   tier, add-on or toolOverrides edit otherwise stayed "Opting out" for
   ever, and Cancel request would then record a withdrawal of a removal that
   already happened). An opt-out is done or declined; an opt-in is
   activated or declined. Staff only (a verified ClearSky address, as
   admin.authenticate decides it); the named requests must all be open or
   nothing is written; the tenant's own words stay on the entry beside the
   answer; history and admin_audit like every write here. It records the
   answer and nothing else: the plan itself is changed where it always is
   (tenant-billing, the master console). A packaged workspace's requests
   are answered by activation (package-billing prepare) or the review. */
var ANSWERS = { optOuts: ['done', 'declined'], optIns: ['activated', 'declined'] };
async function resolve(db, orgId, input, caller, now, field) {
  if (!caller || caller.staff !== true) fail('Only ClearSky answers a request', 403);
  var status = input.status;
  if (ANSWERS[field].indexOf(status) < 0) fail('Status must be ' + ANSWERS[field].join(' or '), 400);
  var optIn = field === 'optIns', wanted = keys(optIn ? input.add : input.remove, 'answer');
  var c = await bare(db, orgId);
  if (c.billing.packaged === true) fail('A packaged workspace is answered by activation or the review', 409);
  var note = typeof input.reason === 'string' ? input.reason.trim().slice(0, 300) : '';
  var current = c.root.collection('billing').doc('current'), result = null;
  await db.runTransaction(async function (tx) {
    var live = await tx.get(current), fresh = live.data() || {}, map = Object.assign({}, fresh[field] || {}), open = requested(map), at = iso(now);
    if (!live.exists) fail('No request to answer', 409);
    wanted.forEach(function (k) { if (open.indexOf(k) < 0) fail('No open request for ' + M.get(k).name, 409); });
    wanted.forEach(function (k) {
      var answer = { status: status, resolvedAt: at, resolvedBy: caller.email }; if (note) answer.resolution = note;
      map[k] = Object.assign({}, map[k], answer);
    });
    var id = (optIn ? 'optin-' : 'optout-') + status + '-' + Q.key(B.stable({ w: wanted, status: status, at: now }));
    var event = { at: now, by: caller.email, action: (optIn ? 'opt-in-' : 'opt-out-') + status, changeId: id, was: { requested: open },
      changed: { resolved: wanted, names: names(wanted), status: status, note: note || 'Answered by ClearSky under the agreement.' } };
    var patch = { updatedAt: now, updatedBy: caller.email }; patch[field] = map;
    tx.set(current, patch, { merge: true });
    tx.set(current.collection('history').doc(id), event); tx.set(c.root.collection('admin_audit').doc(id), event);
    result = { ok: true, resolved: wanted, names: names(wanted), status: status }; result[field] = map;
  });
  return result;
}
/* ── Phase 7: buy more, like credits. A pack is paid first and lasts to the
   end of the current cycle; reconciliation adds it when QuickBooks shows it
   paid. Auto top-up is the tenant admin's switch to bill overage instead. */
function packQuote(c, key, now) {
  var b = c.billing, gate = state(c, now), m = U.meter(c.book, key);
  if (!m.billed) fail('This activity is not metered', 400);
  var owned = M.normalize(b.subscription && Array.isArray(b.subscription.modules) ? b.subscription.modules : b.modules);
  if (owned.indexOf(m.module) < 0) fail(m.moduleName + ' is not in your package', 400);
  var cycle = R.cycle(iso(now), b.billingDay || 1), id = Q.key(B.stable({ org: c.root.id, book: c.book.version, meter: key, cycle: cycle, cents: m.packCents, units: m.packUnits }));
  return { meter: key, module: m.module, name: m.name, units: m.packUnits, cents: m.packCents, display: P.money(m.packCents), previewId: id, effectiveAt: now,
    cycle: { start: cycle.start, end: cycle.end }, canApply: gate.canApply, reason: gate.reason || null,
    text: m.packUnits + ' more ' + m.name + ' for ' + P.money(m.packCents) + ', good until ' + cycle.end + '. Billed through ' + D.name(D.providerOf(b)) + '; added the moment the payment clears.' };
}
async function packBuy(db, orgId, input, caller, now, deps) {
  var c = await S.context(db, orgId); S.guard(c);
  var q = packQuote(c, input.meter, now);
  if (typeof input.previewId !== 'string' || input.previewId !== q.previewId) fail('Refresh the pack offer before buying');
  var at = input.effectiveAt;
  if (!Number.isSafeInteger(at) || at > now || now - at > 10 * 60000) fail('Refresh the pack offer');
  if (!q.canApply) fail(q.reason);
  var current = c.root.collection('billing').doc('current'), opId = 'pack-' + q.previewId + '-' + at, op = current.collection('operations').doc(opId);
  var done = await op.get(); if (done.exists && done.data().state === 'done') return done.data().result;
  var record = { kind: 'pack', id: opId, date: iso(now), period: { start: iso(now), end: q.cycle.end }, pack: { meter: q.meter, units: q.units, cycle: q.cycle },
    lines: [{ itemKey: 'pack:' + q.meter, name: 'OMEGA \u00b7 ' + q.name + ' \u00d7' + q.units, quantity: 1, amountCents: q.cents }], subtotalCents: q.cents, totalCents: q.cents,
    pricebookVersion: c.book.version, marker: 'OMEGA pack ' + orgId + ' / ' + iso(now) + ' / ' + q.previewId.slice(0, 12) + ' / ' + at, by: caller.email, createdAt: now };
  await db.runTransaction(async function (tx) {
    /* the same offer asked again after it failed resumes it: the same marker,
       so the provider hands back the invoice it already made, never a second */
    var old = await tx.get(op), o = old.exists ? old.data() : null;
    if (o && o.state !== 'retry' && !(o.state === 'running' && o.at < now - 120000)) fail('This pack purchase is already being processed; retry shortly');
    tx.set(op, { state: 'running', at: now, by: caller.email });
  });
  try {
    var provider = D.providerOf(c.billing), customerOf = D.customerId(c.billing, provider);
    var issued = await D.driver(c.book, provider, deps).invoice(record, BP.stored(c.profile), customerOf);
    return await db.runTransaction(async function (tx) {
      var live = await tx.get(current), fresh = live.data() || {};
      var stored = Object.assign({}, record, { state: 'unpaid' }, D.invoiceFields(provider, issued.id, customerOf), { totalCents: issued.totalCents, paymentLink: issued.payUrl, issuedAt: now });
      tx.set(current.collection('invoices').doc(record.id), stored);
      tx.update(current, { amountDue: (fresh.amountDue || 0) + issued.totalCents / 100, updatedAt: now, updatedBy: caller.email });
      tx.set(c.root.collection('notifications').doc('package-pack-' + record.id), { kind: 'billing', read: false, createdAt: now,
        text: 'Your usage pack invoice is ready: ' + P.money(issued.totalCents) + ' for ' + q.units + ' more ' + q.name + '. Pay it on the invoice page to add them.',
        packageMail: 'packageInvoice', mailState: 'pending', paymentLink: issued.payUrl, amountDisplay: P.money(issued.totalCents), payWith: D.name(provider) });
      var result = { ok: true, packId: record.id, state: 'awaiting_payment', meter: q.meter, units: q.units, todayCents: issued.totalCents, display: P.money(issued.totalCents), paymentLink: issued.payUrl, payWith: D.name(provider), expiresOn: q.cycle.end };
      tx.set(op, { state: 'done', result: result, completedAt: now }, { merge: true });
      var event = { at: now, by: caller.email, action: 'pack-requested', packId: record.id, changed: { meter: q.meter, units: q.units, totalCents: issued.totalCents, state: 'unpaid' } };
      tx.set(current.collection('history').doc(record.id), event); tx.set(c.root.collection('admin_audit').doc(record.id), event);
      return result;
    });
  } catch (e) { await op.set({ state: 'retry', failedAt: now }, { merge: true }); throw e; }
}
async function autoTopup(db, orgId, enabled, caller, now) {
  var c = await S.context(db, orgId), current = c.root.collection('billing').doc('current');
  if (c.billing.packaged !== true) fail('This workspace is not on a subscription package');
  if (typeof enabled !== 'boolean') fail('enabled must be true or false', 400);
  await current.update({ autoTopup: enabled, updatedAt: now, updatedBy: caller.email });
  var event = { at: now, by: caller.email, action: enabled ? 'auto-topup-on' : 'auto-topup-off', was: { autoTopup: c.billing.autoTopup === true }, changed: { autoTopup: enabled, note: enabled ? 'Overage is billed on the next invoice at the per-unit price.' : 'The buy-more prompt returns at the allowance.' } };
  var id = 'auto-topup-' + now; await current.collection('history').doc(id).set(event); await c.root.collection('admin_audit').doc(id).set(event);
  return { ok: true, autoTopup: enabled };
}
/* "I've paid": the owner or an administrator asks the platform to look at
   QuickBooks now rather than wait for the daily runner — after the first
   invoice at signup, a change invoice, a pack. One look per workspace every
   eight seconds; the reconciliation itself is the runner's (package-billing
   reconcile), so nothing is decided here. Returns the billing the pages
   read: state, the deadline, what is owed and where to pay it. */
async function reconcileNow(db, orgId, caller, now, deps) {
  var current = db.doc('omega_orgs/' + orgId + '/billing/current'), snap = await current.get(), b = snap.exists ? snap.data() : {};
  function out(bill, extra) {
    /* a plan billed outside the engine answers for its add-ons only: its own
       amount due and pay link are its own billing's, not this look's */
    if (bill.packaged !== true) return Object.assign({ orgId: orgId, packaged: false, addOns: AO.view(bill, null, now), checkedAt: now }, extra || {});
    return Object.assign({ orgId: orgId, packaged: bill.packaged === true, packagingState: bill.packagingState || null, paid: bill.packagingState === 'paid',
      paymentLink: bill.paymentLink || null, amountDue: bill.amountDue == null ? null : bill.amountDue, amountDueDisplay: bill.amountDue == null ? null : P.money(Math.round(bill.amountDue * 100)),
      accessUntil: bill.accessUntil == null ? null : bill.accessUntil, paidThrough: bill.paidThrough || null, nextInvoiceOn: bill.nextInvoiceOn || null,
      provider: D.providerOf(bill), payWith: D.name(D.providerOf(bill)), checkedAt: now }, extra || {});
  }
  if (b.packaged !== true && !b.addOns) return out(b, { skipped: 'not packaged' });
  if (b.paymentCheckedAt && now - b.paymentCheckedAt < 8000) return out(b, { throttled: true });
  await current.set({ paymentCheckedAt: now, paymentCheckedBy: caller.email }, { merge: true });
  try { await S.reconcile(db, orgId, now, deps); } catch (e) { return out(b, { error: e.status && e.status < 500 ? e.message : D.name(D.providerOf(b)) + ' could not be reached; try again in a moment' }); }
  /* what the look found goes out now, not at the next tick: the tenant's
     receipt (the first one says the workspace is open) and ClearSky's alert */
  try { var Runner = require('./package-billing-runner'), mailer = (deps && deps.mail) || require('./mail'); await Runner.deliver(db, orgId, now, mailer); await Runner.staffDeliver(db, now, mailer); } catch (e) {}
  var after = await current.get();
  return out(after.exists ? after.data() : {});
}
module.exports = { reconcileNow: reconcileNow, quote: quote, preview: preview, apply: apply, cancel: cancel, removal: removal, optIn: optIn, summary: summary, closure: closure, deltaLines: deltaLines, state: state,
  packQuote: packQuote, packBuy: packBuy, autoTopup: autoTopup, optOut: optOut, withdraw: withdraw, withdrawSet: withdrawSet, resolve: resolve, reviewOn: reviewOn };
