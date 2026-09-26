/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Phase 5: a tenant adds modules to a paid package. Server-only money math;
 * the browser displays what this returns. Pay first, prorated to the
 * tenant's billing date. A $0 addition inside a tier whose current cycle is
 * already paid in QuickBooks activates immediately (Tommy, 2026-09-26,
 * option 1); anything owed becomes a QuickBooks CHANGE invoice and the
 * modules switch on when package-billing.reconcile sees it paid. Removals
 * are recorded for the quarterly review and change nothing today.
 */
'use strict';
var S = require('./package-billing'), B = require('./pricebook'), P = require('./subscription-pricing'), M = require('./modules');
var R = require('./proration'), Q = require('./qbo-billing'), BP = require('./billing-profile');
function fail(message, status) { var e = new Error(message); e.status = status || 409; throw e; }
function iso(now) { return R.iso(now); }
function keys(list, name) {
  if (!Array.isArray(list) || !list.length || list.length > 24) fail('Choose at least one module to ' + name, 400);
  var out = [];
  list.forEach(function (k) {
    if (typeof k !== 'string' || !M.get(k)) fail('Unknown module', 400);
    if (k === 'lite') fail('Lite is always included', 400);
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
  if (b.packagingState !== 'paid') return { canApply: false, reason: 'Pay your current invoice first. Additions are available once QuickBooks shows it paid.' };
  if ((b.interval || 'monthly') === 'annual') return { canApply: false, reason: 'Additions to an annual prepay are quoted by ClearSky. Contact support.' };
  if (!b.billingDay || !b.qboCustomerId) return { canApply: false, reason: 'Billing is not set up for this workspace yet.' };
  return { canApply: true };
}
function pending(records) {
  return records.filter(function (r) { return S.kindOf(r) === 'change' && r.state === 'unpaid' && r.qboInvoiceId; })
    .map(function (r) { return { id: r.id, add: r.add, names: names(r.add), plan: r.plan, totalCents: r.totalCents, display: P.money(r.totalCents), paymentLink: r.paymentLink || null, date: r.date, expiresOn: r.cycle.end, state: r.state }; });
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
  var blocked = gate.canApply && open.length ? { canApply: false, reason: 'A change is waiting for payment: ' + open[0].add.map(function (k) { return M.get(k).name; }).join(', ') + '. Pay it in QuickBooks or cancel it first.' } : gate;
  var id = Q.key(B.stable({ org: c.root.id, book: book.version, owned: owned, add: add, plan: after.plan, cycle: cycle, lines: lines, total: totalCents, billing: { plan: sub.plan, credit: b.credit, builders: b.builders, viewers: b.viewers, interval: b.interval, serviceFee: b.serviceFee } }));
  return { orgId: c.root.id, previewId: id, effectiveAt: now, add: add, addNames: names(add), modules: target, plan: after.plan, planBefore: before.plan, planDisplay: after.display.plan,
    before: { plan: before.plan, monthlyCents: before.monthlyCents, display: before.display.monthly },
    after: { plan: after.plan, monthlyCents: after.monthlyCents, display: after.display.monthly, fit: after.display.fit },
    monthlyDeltaCents: monthlyDelta, todayCents: totalCents, included: included, lines: lines,
    cycle: { start: cycle.start, end: cycle.end, days: cycle.days, remainingDays: cycle.remainingDays }, billingDay: b.billingDay,
    activation: included ? 'immediate' : 'on-payment', steer: steer, serviceFeeNote: feeNote, canApply: blocked.canApply, reason: blocked.reason || null, pending: open,
    display: {
      today: included ? 'Included in your ' + after.display.plan + ' plan: no charge today.' : P.money(totalCents) + ' today (' + cycle.remainingDays + ' of ' + cycle.days + ' days left until your billing date, ' + cycle.end + ')',
      then: 'then ' + after.display.monthly + ' on the ' + ordinal(b.billingDay || 1) + (monthlyDelta === 0 ? ' (unchanged)' : monthlyDelta > 0 ? ' (up from ' + before.display.monthly + ')' : ' (down from ' + before.display.monthly + ')'),
      activation: included ? 'It switches on now.' : 'Billed in QuickBooks. It switches on as soon as the payment clears; pay before ' + cycle.end + ' or the request expires.' } };
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
    var issued = null;
    if (p.todayCents > 0) issued = await Q.driver(c.book, deps).invoice(record, BP.stored(c.profile), c.billing.qboCustomerId);
    return await db.runTransaction(async function (tx) {
      var live = await tx.get(current), invoices = await tx.get(current.collection('invoices').orderBy('date')), fresh = live.data() || {};
      if (!fresh.changeLock || fresh.changeLock.id !== record.id) fail('Change inputs moved; retry');
      var stored = Object.assign({}, record, issued ? { state: 'unpaid', qboInvoiceId: issued.id, qboCustomerId: c.billing.qboCustomerId, totalCents: issued.totalCents, paymentLink: issued.payUrl, issuedAt: now }
        : { state: 'paid', qboInvoiceId: null, qboCustomerId: c.billing.qboCustomerId, paidCents: 0, paymentLink: null, activatedAt: now });
      tx.set(current.collection('invoices').doc(record.id), stored);
      var all = invoices.docs.map(function (d) { return d.data(); }).concat([stored]), after = fresh;
      if (!issued) after = Object.assign({}, fresh, { subscription: Object.assign({}, fresh.subscription || {}, { modules: p.modules, plan: p.plan, changedAt: now }) });
      var patch = S.displayAfter(S.accessAfterInvoices(after, all, c.book, now), after, c.book, now);
      if (!issued) patch.subscription = after.subscription;
      patch.changeLock = null; patch.updatedAt = now; patch.updatedBy = caller.email;
      tx.update(current, patch);
      if (issued) tx.set(c.root.collection('notifications').doc('package-change-' + record.id), { kind: 'billing', read: false, createdAt: now,
        text: 'Your subscription change invoice is ready: ' + P.money(issued.totalCents) + '. Pay in QuickBooks to switch on ' + p.add.map(function (k) { return M.get(k).name; }).join(', ') + '.',
        packageMail: 'packageInvoice', mailState: 'pending', paymentLink: issued.payUrl, amountDisplay: P.money(issued.totalCents) });
      var result = { ok: true, changeId: record.id, state: issued ? 'awaiting_payment' : 'active', add: p.add, addNames: names(p.add), plan: p.plan,
        todayCents: stored.totalCents, display: P.money(stored.totalCents), paymentLink: stored.paymentLink, expiresOn: p.cycle.end, modules: patch.modules || fresh.modules };
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
async function cancel(db, orgId, changeId, caller, now) {
  var c = await S.context(db, orgId);
  if (typeof changeId !== 'string' || !/^change-[a-f0-9]{48}$/.test(changeId)) fail('Invalid change id', 400);
  var current = c.root.collection('billing').doc('current'), ref = current.collection('invoices').doc(changeId);
  return db.runTransaction(async function (tx) {
    // Every read before any write, as Firestore transactions require.
    var snap = await tx.get(ref), live = await tx.get(current), invoices = await tx.get(current.collection('invoices').orderBy('date')), fresh = live.data() || {};
    if (!snap.exists || S.kindOf(snap.data()) !== 'change') fail('No such change', 404);
    var r = snap.data(); if (r.state !== 'unpaid') fail('Only a change waiting for payment can be cancelled');
    tx.update(ref, { state: 'cancelled', cancelledAt: now, cancelledBy: caller.email });
    var all = invoices.docs.map(function (d) { return d.id === changeId ? Object.assign({}, d.data(), { state: 'cancelled' }) : d.data(); });
    tx.update(current, S.displayAfter(S.accessAfterInvoices(fresh, all, c.book, now), fresh, c.book, now));
    var event = { at: now, by: caller.email, action: 'change-cancelled', changeId: changeId, invoiceId: r.qboInvoiceId,
      was: { state: r.state }, changed: { state: 'cancelled', note: 'The QuickBooks invoice stays open until staff void it; a payment after this is flagged for review.' } };
    tx.set(current.collection('history').doc(changeId + '-cancel'), event); tx.set(c.root.collection('admin_audit').doc(changeId + '-cancel'), event);
    return { ok: true, changeId: changeId, state: 'cancelled' };
  });
}
/* Removals never change access today; they queue for the quarterly review. */
async function removal(db, orgId, input, caller, now, withdraw) {
  var c = await S.context(db, orgId), b = c.billing;
  if (b.packaged !== true) fail('This workspace is not on a subscription package');
  var wanted = keys(input.remove, 'remove'), owned = M.normalize(b.subscription && b.subscription.modules ? b.subscription.modules : b.modules);
  var current = c.root.collection('billing').doc('current');
  return db.runTransaction(async function (tx) {
    var live = await tx.get(current), fresh = live.data() || {}, list = (fresh.removalRequests || []).slice();
    wanted.forEach(function (k) {
      if (owned.indexOf(k) < 0) fail(M.get(k).name + ' is not in your package', 400);
      var i = -1; list.forEach(function (r, n) { if (r.module === k) i = n; });
      if (withdraw) { if (i >= 0) list.splice(i, 1); }
      else if (i < 0) list.push({ module: k, requestedAt: now, by: caller.email, reason: typeof input.reason === 'string' ? input.reason.slice(0, 300) : '' });
    });
    tx.update(current, { removalRequests: list, updatedAt: now, updatedBy: caller.email });
    var id = 'removal-' + Q.key(B.stable({ w: wanted, withdraw: !!withdraw, at: now }));
    var event = { at: now, by: caller.email, action: withdraw ? 'removal-withdrawn' : 'removal-requested', changed: { modules: wanted, removalRequests: list, note: 'Takes effect at the quarterly review; access is unchanged.' } };
    tx.set(current.collection('history').doc(id), event); tx.set(c.root.collection('admin_audit').doc(id), event);
    return { ok: true, removalRequests: list };
  });
}
async function summary(db, orgId) {
  var c = await S.context(db, orgId), rows = await records(c), b = c.billing, now = Date.now(), monthly = null, planDisplay = null;
  var sub = b.subscription && Array.isArray(b.subscription.modules) ? b.subscription : { modules: b.modules, plan: b.plan };
  if (b.packaged === true) {
    try {
      var q = P.quote(M.normalize(sub.modules), c.book, { plan: sub.plan || 'auto', builders: b.builders, viewers: b.viewers, serviceFee: b.serviceFee, credit: b.credit, interval: b.interval, now: now });
      monthly = q.display.monthly; planDisplay = q.display.plan;
    } catch (e) { monthly = b.monthlyDisplay || null; }
  }
  return { orgId: orgId, packaged: b.packaged === true, packagingState: b.packagingState || null, plan: sub.plan || null, planDisplay: planDisplay, modules: b.modules || ['lite'], subscription: sub.modules || ['lite'],
    interval: b.interval || 'monthly', billingDay: b.billingDay || null, nextInvoiceOn: b.nextInvoiceOn || null, monthlyDisplay: monthly,
    gate: state(c, Date.now()), pending: pending(rows), removalRequests: b.removalRequests || [],
    recent: rows.filter(function (r) { return S.kindOf(r) === 'change' && r.state !== 'unpaid'; }).slice(-5).map(function (r) { return { id: r.id, add: r.add, names: names(r.add), state: r.state, date: r.date, display: P.money(r.totalCents || 0) }; }) };
}
module.exports = { quote: quote, preview: preview, apply: apply, cancel: cancel, removal: removal, summary: summary, closure: closure, deltaLines: deltaLines, state: state };
