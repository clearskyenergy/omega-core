/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Phase 5: a tenant adds modules to a paid package. Server-only money math;
 * the browser displays what this returns. Pay first, prorated to the
 * tenant's billing date. A $0 addition inside a tier whose current cycle is
 * already paid in QuickBooks activates immediately (Tommy, 2026-09-26,
 * option 1); anything owed becomes a CHANGE invoice on the workspace's rail
 * and the modules switch on when package-billing.reconcile sees it paid.
 * On the Stripe rail (2026-09-27) a card on file is charged the moment the
 * change is confirmed and the modules switch on in the same request; with
 * no card, or a card the bank refuses, the change waits on its pay link.
 * Removals are recorded for the quarterly review and change nothing today.
 */
'use strict';
var S = require('./package-billing'), B = require('./pricebook'), P = require('./subscription-pricing'), M = require('./modules');
var R = require('./proration'), Q = require('./qbo-billing'), BP = require('./billing-profile'), U = require('./usage');
function fail(message, status) { var e = new Error(message); e.status = status || 409; throw e; }
function iso(now) { return R.iso(now); }
/* how the workspace pays, said once */
function card(b) { return S.railOf(b) === 'stripe' && b.stripe && b.stripe.cardOnFile && b.stripe.card ? b.stripe.card : null; }
function cardName(c) { return c ? (c.brand ? c.brand.charAt(0).toUpperCase() + c.brand.slice(1) : 'Card') + ' ending ' + (c.last4 || '····') : 'your card'; }
function railWords(b) {
  var stripe = S.railOf(b) === 'stripe', c = card(b);
  return { stripe: stripe, where: stripe ? 'by card' : 'in QuickBooks', provider: stripe ? 'your card' : 'QuickBooks',
    activation: stripe ? (c ? 'Charged to your ' + cardName(c) + ' now. It switches on the moment the charge clears.' : 'Pay by card on the next page. It switches on the moment the payment clears.')
      : 'Billed in QuickBooks. It switches on as soon as the payment clears' };
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
  if (b.packagingState !== 'paid') return { canApply: false, reason: 'Pay your current invoice first. Additions are available once it is paid.' };
  if ((b.interval || 'monthly') === 'annual') return { canApply: false, reason: 'Additions to an annual prepay are quoted by ClearSky. Contact support.' };
  /* the renewal is due and not issued yet: a change now would bill the whole
     new cycle and the renewal would bill it again */
  if (b.nextInvoiceOn && b.nextInvoiceOn <= iso(now)) return { canApply: false, reason: 'Your renewal is being issued today. Add modules once it has gone through; that usually takes under an hour.' };
  if (!b.billingDay || !S.customerOf(b)) return { canApply: false, reason: 'Billing is not set up for this workspace yet.' };
  return { canApply: true };
}
function pending(records) {
  return records.filter(function (r) { return S.kindOf(r) === 'change' && r.state === 'unpaid' && S.invoiceRef(r); })
    .map(function (r) { return { id: r.id, add: r.add, names: names(r.add), plan: r.plan, totalCents: r.totalCents, display: P.money(r.totalCents), paymentLink: r.paymentLink || null, date: r.date, expiresOn: r.cycle.end, state: r.state }; });
}
async function records(c) { return (await c.root.collection('billing').doc('current').collection('invoices').orderBy('date').get()).docs.map(function (d) { return d.data(); }); }
function names(list) { return (list || []).map(function (k) { return M.get(k) ? M.get(k).name : k; }); }
function ordinal(d) { var s = ['th', 'st', 'nd', 'rd'], v = d % 100; return d + (s[(v - 20) % 10] || s[v] || s[0]); }
/* On the card rail the invoice record is written BEFORE the card is charged
   (as the renewal's 'prepared' record is), so a charge whose request dies
   before its final write still has a record for Stripe's event and the
   runner to settle — never money nobody can see. */
function preparedRecord(c, orgId, record, cents) {
  if (S.railOf(c.billing) !== 'stripe' || !(cents > 0)) return null;
  var SB = require('./stripe-billing');
  return Object.assign({}, record, { state: 'prepared' }, S.issuedFields('stripe', { id: SB.refOf(record.marker), charge: null }, S.customerOf(c.billing), orgId),
    { totalCents: cents, paymentLink: SB.payLink(SB.homeOf(c.org), orgId, record.id), preparedAt: record.createdAt });
}
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
  var words = railWords(b);
  var blocked = gate.canApply && open.length ? { canApply: false, reason: 'A change is waiting for payment: ' + open[0].add.map(function (k) { return M.get(k).name; }).join(', ') + '. Pay it ' + words.where + ' or cancel it first.' } : gate;
  var basis = { org: c.root.id, book: book.version, owned: owned, add: add, plan: after.plan, cycle: cycle, lines: lines, total: totalCents, billing: { plan: sub.plan, credit: b.credit, builders: b.builders, viewers: b.viewers, interval: b.interval, serviceFee: b.serviceFee } };
  /* the same addition asked for again after a cancel in this cycle is a NEW
     change: without this its id — and so its operation and its invoice
     record — would be the cancelled one's, and apply would hand back the
     cancelled result and its dead pay link */
  var reopened = rows.filter(function (r) { return S.kindOf(r) === 'change' && r.state === 'cancelled' && r.cycle && r.cycle.start === cycle.start; }).length;
  if (reopened) basis.reopened = reopened;
  var id = Q.key(B.stable(basis));
  return { orgId: c.root.id, previewId: id, effectiveAt: now, add: add, addNames: names(add), modules: target, plan: after.plan, planBefore: before.plan, planDisplay: after.display.plan,
    before: { plan: before.plan, monthlyCents: before.monthlyCents, display: before.display.monthly },
    after: { plan: after.plan, monthlyCents: after.monthlyCents, display: after.display.monthly, fit: after.display.fit },
    monthlyDeltaCents: monthlyDelta, todayCents: totalCents, included: included, lines: lines,
    cycle: { start: cycle.start, end: cycle.end, days: cycle.days, remainingDays: cycle.remainingDays }, billingDay: b.billingDay,
    activation: included ? 'immediate' : 'on-payment', steer: steer, serviceFeeNote: feeNote, canApply: blocked.canApply, reason: blocked.reason || null, pending: open,
    rail: S.railOf(b), cardOnFile: card(b) ? cardName(card(b)) : null,
    display: {
      today: included ? 'Included in your ' + after.display.plan + ' plan: no charge today.' : P.money(totalCents) + ' today (' + cycle.remainingDays + ' of ' + cycle.days + ' days left until your billing date, ' + cycle.end + ')',
      then: 'then ' + after.display.monthly + ' on the ' + ordinal(b.billingDay || 1) + (monthlyDelta === 0 ? ' (unchanged)' : monthlyDelta > 0 ? ' (up from ' + before.display.monthly + ')' : ' (down from ' + before.display.monthly + ')'),
      activation: included ? 'It switches on now.' : words.stripe ? words.activation : words.activation + '; pay before ' + cycle.end + ' or the request expires.' } };
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
  var prepared = preparedRecord(c, orgId, record, p.todayCents);
  var replay = await db.runTransaction(async function (tx) {
    var old = await tx.get(op), live = await tx.get(current), invoices = await tx.get(current.collection('invoices').orderBy('date'));
    if (old.exists && old.data().state === 'done') return old.data().result;
    var fresh = live.data() || {}, again = quote(Object.assign({}, c, { billing: fresh }), invoices.docs.map(function (d) { return d.data(); }), input, now);
    if (again.previewId !== p.previewId || !again.canApply) fail('Your package changed; review the current quote before subscribing');
    if (fresh.changeLock && fresh.changeLock.until > now) fail('A change is already being processed; retry shortly');
    tx.set(current, { changeLock: { id: record.id, until: now + 120000 } }, { merge: true });
    tx.set(op, { state: 'running', at: now, by: caller.email, requestFingerprint: fingerprint }, { merge: true });
    if (prepared) tx.set(current.collection('invoices').doc(record.id), prepared);
    return null;
  });
  if (replay) return replay;
  try {
    var issued = null, rail = S.railOf(c.billing);
    if (p.todayCents > 0) issued = await S.driverFor(c.book, rail, deps).invoice(record, BP.stored(c.profile), S.customerOf(c.billing), { org: orgId, recordId: record.id, host: require('./stripe-billing').homeOf(c.org) });
    var charged = !!(issued && issued.charge && issued.charge.status === 'succeeded'), declined = !!(issued && issued.charge && issued.charge.status === 'failed');
    return await db.runTransaction(async function (tx) {
      var live = await tx.get(current), invoices = await tx.get(current.collection('invoices').orderBy('date')), fresh = live.data() || {};
      if (!fresh.changeLock || fresh.changeLock.id !== record.id) fail('Change inputs moved; retry');
      var stored = Object.assign({}, record, issued ? Object.assign({ state: 'unpaid' }, S.issuedFields(rail, issued, S.customerOf(c.billing), orgId), { totalCents: issued.totalCents, paymentLink: charged ? null : issued.payUrl, issuedAt: now })
        : { state: 'paid', qboInvoiceId: null, qboCustomerId: c.billing.qboCustomerId || null, paidCents: 0, paymentLink: null, activatedAt: now });
      tx.set(current.collection('invoices').doc(record.id), stored);
      var all = invoices.docs.map(function (d) { return d.data(); }).concat([stored]), after = fresh;
      if (!issued) after = Object.assign({}, fresh, { subscription: Object.assign({}, fresh.subscription || {}, { modules: p.modules, plan: p.plan, changedAt: now }) });
      var patch = S.displayAfter(S.accessAfterInvoices(after, all, c.book, now), after, c.book, now);
      if (!issued) patch.subscription = after.subscription;
      patch.changeLock = null; patch.updatedAt = now; patch.updatedBy = caller.email;
      tx.update(current, patch);
      if (issued && !charged) tx.set(c.root.collection('notifications').doc('package-change-' + record.id), { kind: 'billing', read: false, createdAt: now,
        text: 'Your subscription change invoice is ready: ' + P.money(issued.totalCents) + '. ' + (declined ? 'Your card on file was declined: pay by card' : 'Pay ' + railWords(fresh).where) + ' to switch on ' + p.add.map(function (k) { return M.get(k).name; }).join(', ') + '.',
        packageMail: 'packageInvoice', mailState: 'pending', paymentLink: issued.payUrl, amountDisplay: P.money(issued.totalCents), provider: rail });
      var result = { ok: true, changeId: record.id, state: issued ? 'awaiting_payment' : 'active', add: p.add, addNames: names(p.add), plan: p.plan,
        todayCents: stored.totalCents, display: P.money(stored.totalCents), paymentLink: stored.paymentLink, expiresOn: p.cycle.end, modules: patch.modules || fresh.modules,
        rail: rail };
      if (declined) result.cardDeclined = true;
      tx.set(op, { state: 'done', result: result, completedAt: now }, { merge: true });
      var event = { at: now, by: caller.email, action: issued ? 'change-requested' : 'change-included', changeId: record.id,
        was: { modules: fresh.modules, plan: fresh.plan }, changed: { add: p.add, plan: p.plan, totalCents: stored.totalCents, modules: patch.modules || fresh.modules, state: stored.state } };
      tx.set(current.collection('history').doc(record.id), event); tx.set(c.root.collection('admin_audit').doc(record.id), event);
      return result;
    }).then(async function (result) {
      /* the card on file paid: settle the change now, so the modules are on when this answers */
      var settled = await S.settleCharged(db, orgId, rail, issued, record.id, now, deps);
      if (!charged) return result;
      /* charged but not settled in this request (Stripe slow to answer): it IS
         paid; the webhook or the runner switches it on. Never a pay button. */
      if (!settled || settled.state !== 'paid') { result = Object.assign({}, result, { state: 'charged', charged: true, paymentLink: null, card: cardName(card(c.billing)) }); await op.set({ result: result }, { merge: true }); return result; }
      try { var Runner = require('./package-billing-runner'), mailer = (deps && deps.mail) || require('./mail'); await Runner.deliver(db, orgId, now, mailer); await Runner.staffDeliver(db, now, mailer); } catch (e) {}
      var after = (await current.get()).data() || {};
      result = Object.assign({}, result, { state: 'active', charged: true, paymentLink: null, modules: after.modules || result.modules, card: cardName(card(after)) });
      await op.set({ result: result }, { merge: true });
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
    var event = { at: now, by: caller.email, action: 'change-cancelled', changeId: changeId, invoiceId: S.invoiceRef(r),
      was: { state: r.state }, changed: { state: 'cancelled', note: S.recordRail(r) === 'stripe' ? 'Its card checkout is closed; a payment that still lands is flagged for review.' : 'The QuickBooks invoice stays open until staff void it; a payment after this is flagged for review.' } };
    tx.set(current.collection('history').doc(changeId + '-cancel'), event); tx.set(c.root.collection('admin_audit').doc(changeId + '-cancel'), event);
    return { ok: true, changeId: changeId, state: 'cancelled', record: r };
  }).then(async function (out) {
    if (S.recordRail(out.record) === 'stripe') { try { await require('./stripe-billing').close(out.record); } catch (e) { console.warn('[plan-change] checkout not closed:', e && e.message); } }
    return { ok: true, changeId: changeId, state: 'cancelled' };
  });
}
/* The catalog owns every dependency. Removing a prerequisite includes its
 * dependents; keeping a dependent also keeps its prerequisites. Lite stays.
 * This is a review request, never an immediate grant or invoice change. */
function removalSelection(billing, wanted, withdraw) {
  if (billing.packaged !== true) fail('This workspace is not on a subscription package');
  var owned = M.normalize(billing.subscription && Array.isArray(billing.subscription.modules) ? billing.subscription.modules : billing.modules), selected = wanted.slice();
  wanted.forEach(function (k) { if (owned.indexOf(k) < 0) fail(M.get(k).name + ' is not in your package', 400); });
  var changed = true;
  while (changed) {
    changed = false;
    owned.forEach(function (k) {
      if (withdraw && selected.indexOf(k) >= 0) M.get(k).requires.forEach(function (r) {
        if (r !== 'lite' && selected.indexOf(r) < 0) { selected.push(r); changed = true; }
      });
      if (!withdraw && selected.indexOf(k) < 0 && M.get(k).requires.some(function (r) { return selected.indexOf(r) >= 0; })) { selected.push(k); changed = true; }
    });
  }
  return { owned: owned, modules: owned.filter(function (k) { return selected.indexOf(k) >= 0; }) };
}
/* Removals never change access today; they queue for the quarterly review.
 * Dry run and apply read the same current subscription inside a transaction;
 * a changed dependency set requires the owner to review it again. */
async function removal(db, orgId, input, caller, now, withdraw) {
  var c = await S.context(db, orgId), wanted = keys(input.remove, 'remove');
  var current = c.root.collection('billing').doc('current');
  return db.runTransaction(async function (tx) {
    var live = await tx.get(current), fresh = live.data() || {}, list = (fresh.removalRequests || []).slice();
    var selection = removalSelection(fresh, wanted, withdraw), remove = selection.modules;
    var previewId = Q.key(B.stable({ orgId: orgId, owned: selection.owned, modules: remove, withdraw: !!withdraw }));
    var note = withdraw ? 'The opt-out request is withdrawn for these modules. Access and billing are unchanged.' : 'Queued for the quarterly review with ClearSky. Access and charges stay unchanged until that review; this does not issue a refund.';
    if (input.dryRun === true) return { previewId: previewId, modules: remove, names: names(remove), withdraw: !!withdraw,
      note: withdraw ? 'Confirming will withdraw the opt-out request for these modules. Access and billing will stay unchanged.' : 'Confirming queues these modules for the quarterly review with ClearSky. Access and charges stay unchanged until that review; this does not issue a refund.' };
    if (input.previewId !== previewId) fail('Your package changed; review the opt-out request again');
    remove.forEach(function (k) {
      var i = -1; list.forEach(function (r, n) { if (r.module === k) i = n; });
      if (withdraw) { if (i >= 0) list.splice(i, 1); }
      else if (i < 0) list.push({ module: k, requestedAt: now, by: caller.email, reason: typeof input.reason === 'string' ? input.reason.slice(0, 300) : '' });
    });
    tx.update(current, { removalRequests: list, updatedAt: now, updatedBy: caller.email });
    var id = 'removal-' + Q.key(B.stable({ w: wanted, withdraw: !!withdraw, at: now }));
    var event = { at: now, by: caller.email, action: withdraw ? 'removal-withdrawn' : 'removal-requested', changed: { modules: remove, removalRequests: list, note: note } };
    tx.set(current.collection('history').doc(id), event); tx.set(c.root.collection('admin_audit').doc(id), event);
    return { ok: true, removalRequests: list, modules: remove, names: names(remove), note: note };
  });
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
      paymentLink: r.state === 'unpaid' ? (r.paymentLink || null) : null, names: r.add ? names(r.add) : null, paidAt: r.paidAt || null };
  });
  return { orgId: orgId, packaged: b.packaged === true, packagingState: b.packagingState || null, plan: sub.plan || null, planDisplay: planDisplay, modules: b.modules || ['lite'], subscription: sub.modules || ['lite'],
    moduleNames: names(b.modules || ['lite']), subscriptionNames: names(sub.modules || ['lite']),
    interval: b.interval || 'monthly', billingDay: b.billingDay || null, nextInvoiceOn: b.nextInvoiceOn || null, monthlyDisplay: monthly,
    accessUntil: b.accessUntil == null ? null : b.accessUntil, paidThrough: b.paidThrough || null, amountDue: b.amountDue == null ? null : b.amountDue,
    amountDueDisplay: b.amountDue == null ? null : P.money(Math.round(b.amountDue * 100)), paymentLink: b.paymentLink || null, invoices: invoices,
    gate: state(c, Date.now()), pending: pending(rows), removalRequests: b.removalRequests || [],
    rail: b.packaged === true ? S.railOf(b) : null, card: card(b) ? { display: cardName(card(b)), expMonth: card(b).expMonth || null, expYear: card(b).expYear || null } : null,
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
async function optIn(db, orgId, input, caller, now) {
  if (orgId === 'clearsky-usa.com') fail('This is ClearSky\'s own workspace: every module is already on for ClearSky staff. To try buying a module, use a test workspace.', 409);
  var c = await S.context(db, orgId, null, { lenient: true }), b = c.billing;
  if (b.packaged === true) fail('This workspace is on a subscription package: add modules through the menu, which prices and invoices them.', 409);
  if (c.org.status !== 'active') fail('Your workspace is not active.', 409);
  var add = keys(input.add, 'add'), byKey = {};
  P.catalog(c.book).forEach(function (m) { byKey[m.key] = m; });
  var have = Object.keys(b.optIns || {}).filter(function (k) { return b.optIns[k] && b.optIns[k].status === 'requested'; });
  var logic = (b.addons || []).indexOf('omega-logic') >= 0 ? ['logic-office', 'logic-plant', 'logic-materials', 'logic-logistics', 'logic-customer'] : [];
  var wanted = closure(['lite'].concat(logic, have), add);
  if (!wanted.length) fail('Already requested', 409);
  var at = iso(now), entries = {}, cents = 0;
  wanted.forEach(function (k) { var m = byKey[k]; cents += m.priceCents; entries[k] = { key: k, name: m.name, monthlyCents: m.priceCents, display: m.priceDisplay, requestedBy: caller.email, requestedAt: at, status: 'requested', pricebookVersion: c.book.version }; });
  var current = c.root.collection('billing').doc('current'), id = 'optin-' + Q.key(B.stable({ w: wanted, at: now }));
  var event = { at: now, by: caller.email, action: 'opt-in-requested', changeId: id, was: { tier: b.tier || null, addons: b.addons || [], optIns: have },
    changed: { add: wanted, names: names(wanted), monthlyCents: cents, note: 'Recorded with its price; ClearSky moves the workspace onto a package. Nothing charged.' } };
  await db.runTransaction(async function (tx) {
    var live = await tx.get(current), fresh = live.data() || {};
    /* never make a billing record out of a request: a record holding only
       optIns would read as a plan with no tier to every gate that reads it */
    if (!live.exists) fail('Billing is not set up for this workspace yet. Email ClearSky and the module is added when it is.', 409);
    tx.set(current, { optIns: Object.assign({}, fresh.optIns || {}, entries), updatedAt: now, updatedBy: caller.email }, { merge: true });
    tx.set(current.collection('history').doc(id), event); tx.set(c.root.collection('admin_audit').doc(id), event);
  });
  try { await require('./mail').templates.optInAlert({ company: c.org.name || orgId, orgId: orgId, names: names(wanted), display: P.money(cents) + '/month', by: caller.email, tier: b.tier || null }); } catch (e) { console.warn('[plan-change] opt-in mail skipped:', e && e.message); }
  return { ok: true, requested: true, add: wanted, names: names(wanted), monthlyCents: cents, display: P.money(cents) + '/month', optIns: entries, requestedAt: at };
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
    rail: S.railOf(b), text: m.packUnits + ' more ' + m.name + ' for ' + P.money(m.packCents) + ', good until ' + cycle.end + '. ' + (S.railOf(b) === 'stripe' ? (card(b) ? 'Charged to your ' + cardName(card(b)) + '; added the moment the charge clears.' : 'Paid by card; added the moment the payment clears.') : 'Billed in QuickBooks; added the moment the payment clears.') };
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
  var prepared = preparedRecord(c, orgId, record, q.cents);
  await db.runTransaction(async function (tx) {
    var old = await tx.get(op); if (old.exists) fail('This pack purchase is already being processed; retry shortly');
    tx.set(op, { state: 'running', at: now, by: caller.email });
    if (prepared) tx.set(current.collection('invoices').doc(record.id), prepared);
  });
  try {
    var rail = S.railOf(c.billing), issued = await S.driverFor(c.book, rail, deps).invoice(record, BP.stored(c.profile), S.customerOf(c.billing), { org: orgId, recordId: record.id, host: require('./stripe-billing').homeOf(c.org) });
    var charged = !!(issued.charge && issued.charge.status === 'succeeded'), declined = !!(issued.charge && issued.charge.status === 'failed');
    var result = await db.runTransaction(async function (tx) {
      var live = await tx.get(current), fresh = live.data() || {};
      var stored = Object.assign({}, record, { state: 'unpaid' }, S.issuedFields(rail, issued, S.customerOf(c.billing), orgId), { totalCents: issued.totalCents, paymentLink: charged ? null : issued.payUrl, issuedAt: now });
      tx.set(current.collection('invoices').doc(record.id), stored);
      tx.update(current, { amountDue: (fresh.amountDue || 0) + issued.totalCents / 100, updatedAt: now, updatedBy: caller.email });
      if (!charged) tx.set(c.root.collection('notifications').doc('package-pack-' + record.id), { kind: 'billing', read: false, createdAt: now,
        text: 'Your usage pack invoice is ready: ' + P.money(issued.totalCents) + ' for ' + q.units + ' more ' + q.name + '. ' + (declined ? 'Your card on file was declined: pay by card' : 'Pay ' + railWords(fresh).where) + ' to add them.',
        packageMail: 'packageInvoice', mailState: 'pending', paymentLink: issued.payUrl, amountDisplay: P.money(issued.totalCents), provider: rail });
      var result = { ok: true, packId: record.id, state: 'awaiting_payment', meter: q.meter, units: q.units, todayCents: issued.totalCents, display: P.money(issued.totalCents), paymentLink: issued.payUrl, expiresOn: q.cycle.end, rail: rail };
      if (declined) result.cardDeclined = true;
      tx.set(op, { state: 'done', result: result, completedAt: now }, { merge: true });
      var event = { at: now, by: caller.email, action: 'pack-requested', packId: record.id, changed: { meter: q.meter, units: q.units, totalCents: issued.totalCents, state: 'unpaid', rail: rail } };
      tx.set(current.collection('history').doc(record.id), event); tx.set(c.root.collection('admin_audit').doc(record.id), event);
      return result;
    });
    var settled = await S.settleCharged(db, orgId, rail, issued, record.id, now, deps);
    if (charged) { result = Object.assign({}, result, { state: settled && settled.state === 'paid' ? 'added' : 'charged', charged: true, paymentLink: null }); await op.set({ result: result }, { merge: true }); }
    return result;
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
    return Object.assign({ orgId: orgId, packaged: bill.packaged === true, packagingState: bill.packagingState || null, paid: bill.packagingState === 'paid',
      paymentLink: bill.paymentLink || null, amountDue: bill.amountDue == null ? null : bill.amountDue, amountDueDisplay: bill.amountDue == null ? null : P.money(Math.round(bill.amountDue * 100)),
      accessUntil: bill.accessUntil == null ? null : bill.accessUntil, paidThrough: bill.paidThrough || null, nextInvoiceOn: bill.nextInvoiceOn || null, checkedAt: now }, extra || {});
  }
  if (b.packaged !== true) return out(b, { skipped: 'not packaged' });
  if (b.paymentCheckedAt && now - b.paymentCheckedAt < 8000) return out(b, { throttled: true });
  await current.set({ paymentCheckedAt: now, paymentCheckedBy: caller.email }, { merge: true });
  try { await S.reconcile(db, orgId, now, deps); } catch (e) { return out(b, { error: e.status && e.status < 500 ? e.message : (S.railOf(b) === 'stripe' ? 'Stripe' : 'QuickBooks') + ' could not be reached; try again in a moment' }); }
  /* what the look found goes out now, not at the next tick: the tenant's
     receipt (the first one says the workspace is open) and ClearSky's alert */
  try { var Runner = require('./package-billing-runner'), mailer = (deps && deps.mail) || require('./mail'); await Runner.deliver(db, orgId, now, mailer); await Runner.staffDeliver(db, now, mailer); } catch (e) {}
  var after = await current.get();
  return out(after.exists ? after.data() : {});
}
module.exports = { reconcileNow: reconcileNow, quote: quote, preview: preview, apply: apply, cancel: cancel, removal: removal, optIn: optIn, summary: summary, closure: closure, deltaLines: deltaLines, state: state,
  packQuote: packQuote, packBuy: packBuy, autoTopup: autoTopup };
