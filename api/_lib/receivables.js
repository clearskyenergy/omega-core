/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/receivables.js — the rules of a tenant-billed receivable
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE: no Firestore, no clock (callers pass `today` / `at`), no network,
   and no require but ./office-stage — scripts/build-app-sandbox.js bundles
   this file into the sandboxes and the render fixture applies it, so the
   sandbox shows what the product computes.

   What it decides, for an order the OEM invoices on its own paper
   (logic.accounting === 'tenant'):
   - settle(inv): paid / balance / satisfied / status, from the payments that
     are NOT voided. The one recompute; the dashboard's "Received" sums the
     paidCents it produces.
   - recordPlan: a payment, idempotent by bank reference (refKey folds case
     and spacing). A placeholder reference (the intake template's
     "REPLACE WITH THE BANK REFERENCE…", TBD, N/A…) is refused on every
     path, forever. A reference that was voided is never silently received
     again: the office may reinstate it with a reason (a NEW entry that
     points at the voided one); a provider sync never may. qbo: and stripe:
     references are the ledger sync's alone — except that the office may
     take back its own void of one, which stays the provider's entry.
     ONE invoice takes its payments from ONE place: an invoice in the
     workspace's QuickBooks refuses a hand entry, and a provider receipt is
     a conflict while hand-recorded payments stand on the invoice.
   - voidPlan: a payment is VOIDED, never deleted. When the order is in the
     plant on the deposit being voided, the office chooses: keep building on
     the PO (a credit release) or hold (paymentHold + paymentException). A
     provider's void cannot ask, so it holds.
   - releasePlan: release on PO before the deposit (logic.creditRelease),
     which release() treats as satisfying the deposit gate — and nothing
     else: shipment still needs the deposit and the balance recorded.
   - editPlan: an issued invoice's number / issue date / due date, with the
     history of what changed. Amounts are never edited here.
   - rows / filter / totals / ledger / csv: the receivables ledger by
     customer ACCOUNT with aging (current, 1–30, 31–60, 61–90, 90+).
   The one writer that applies these plans is api/_lib/logic-workflow.js.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var S = require('./office-stage');

var STAGES = ['deposit', 'balance'], BUCKETS = ['current', '1-30', '31-60', '61-90', '90+'];
var MSG_PAY = 'This order is billed through QuickBooks; payments are reconciled there';
var MSG_EDIT = 'This order is billed through QuickBooks; edit the invoice there';
var NAME = { quickbooks: 'QuickBooks', stripe: 'Stripe' };
var MSG_REL = 'Release on PO is for orders the OEM invoices itself; a ClearSky-billed order releases on its QuickBooks receipt';

function fail(status, message) { var e = new Error(message); e.status = status; return e; }
function refKey(ref) { return String(ref || '').trim().replace(/\s+/g, ' ').toUpperCase(); }
function isPlaceholder(ref) { return /REPLACE|PLACEHOLDER|\bTBD\b|\bTODO\b|\bPENDING\b|NOT\s+(YET\s+)?RECEIVED|DELETE\s+THIS|^X+$|^0+$|^N\/?A$/i.test(String(ref).trim()); }
function reservedSource(ref) { var s = String(ref || ''); return /^qbo:/i.test(s) ? 'quickbooks' : /^stripe:/i.test(s) ? 'stripe' : null; }
function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s == null ? '' : s)) && !isNaN(Date.parse(s)); }
function clean(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, n || 200); }
function poOf(o) { o = o || {}; return (o.purchaseOrder && o.purchaseOrder.number) || o.poNumber || (o.poIntake && o.poIntake.number) || null; }
function ms(d) { return Date.parse(String(d).slice(0, 10) + 'T00:00:00Z'); }
function daysBetween(a, b) { return Math.round((ms(b) - ms(a)) / 86400000); }
function addDays(d, n) { return new Date(ms(d) + n * 86400000).toISOString().slice(0, 10); }
function bucket(days) { return days <= 0 ? 'current' : days <= 30 ? '1-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+'; }
function usd(c) { return (Number(c || 0) / 100); }

function settle(inv) {
  inv = inv || {};
  var paid = (inv.payments || []).reduce(function (n, p) { return p && !p.voidedAt ? n + (Number(p.amountCents) || 0) : n; }, 0);
  var amount = Number(inv.amountCents) || 0;
  var status = amount === 0 ? 'not_required' : paid >= amount ? 'paid' : paid > 0 ? 'part_paid' : inv.id ? 'awaiting_payment' : 'to_issue';
  return { paidCents: paid, balanceCents: amount - paid, satisfied: paid >= amount, status: status };
}
function dueDate(inv, terms) {
  inv = inv || {};
  if (inv.dueAt) return inv.dueAt;
  var base = inv.issuedAt || (inv.id ? inv.date : null);
  if (!base) return null;
  return addDays(base, (terms && terms.dueDays) || 0);
}

function tenant(o, msg) { var l = o && o.logic; if (!l || l.accounting !== 'tenant') throw fail(409, msg); return l; }
function stageInv(l, stage) {
  if (STAGES.indexOf(stage) < 0) throw fail(400, 'stage must be deposit or balance');
  var inv = l.invoices && l.invoices[stage];
  if (!inv) throw fail(409, 'No ' + stage + ' invoice on this order yet' + (stage === 'balance' ? ' — verify ready first' : ''));
  return inv;
}
function holdMessage(ref, stage, reason) { return 'Payment ' + ref + ' on the ' + stage + ' invoice was voided (' + String(reason).slice(0, 120) + '). Fulfilment is on hold until the payment is recorded or the order is released on its PO.'; }

function recordPlan(o, stage, p) {
  var l = tenant(o, MSG_PAY);
  if (o.cancelRequested || (l.paymentException && !l.paymentHold)) throw fail(409, 'Resolve the order exception first');
  var inv = stageInv(l, stage);
  if (!inv.id) throw fail(409, 'Record the ' + stage + ' invoice number first');
  if (!p.amountCents) throw fail(400, 'Amount received required');
  if (!isDate(p.date)) throw fail(400, 'Payment date must be YYYY-MM-DD');
  var ref = clean(p.bankReference, 120);
  if (clean(p.bankReference, 500).length < 4) throw fail(400, 'Bank confirmation reference required');
  if (isPlaceholder(ref)) throw fail(400, 'That bank reference is a placeholder (' + ref.slice(0, 40) + '). Record the payment when the money has landed, with the bank\'s own reference for it.');
  var src = p.source || 'office', reserved = reservedSource(ref);
  var key = refKey(ref), pays = inv.payments || [];
  var hasActive = pays.some(function (x) { return !x.voidedAt && refKey(x.bankReference) === key; });
  var vi = -1; pays.forEach(function (x, i) { if (x.voidedAt && refKey(x.bankReference) === key) vi = i; });
  /* The office may take back its OWN void of a payment the sync recorded
     (qbo:/stripe:): only a reference that provider wrote and that is now
     voided, never a new one. The entry it adds is the provider's again —
     same source, external id and amount — so later pulls match it and a real
     reversal in the books still voids it. */
  var provBack = !!reserved && src === 'office' && !hasActive && vi >= 0 && (pays[vi].source || 'office') === reserved;
  if (reserved && src !== reserved && !provBack) throw fail(400, 'References starting qbo: or stripe: are written by the ledger sync');
  if (hasActive) return { duplicate: true, invoice: inv };
  /* ONE invoice takes its payments from ONE place. An invoice that lives in
     the workspace's QuickBooks (the provider it has chosen) takes them from
     QuickBooks: a hand entry here would be counted again when the pull reads
     the same money as qbo:<id>. (A Stripe invoice still takes a wire recorded
     by hand — the documented path above Stripe's per-payment cap; the check
     on provider receipts below keeps that from counting twice.) */
  if (src === 'office' && !provBack && inv.ledger && inv.ledger.invoiceId && inv.ledger.provider === 'quickbooks' && p.ledgerProvider === 'quickbooks') {
    throw fail(409, 'This invoice is in QuickBooks (' + inv.ledger.invoiceId + '); apply the payment there and sync');
  }
  var re = null, vdate = null;
  if (vi >= 0) {
    var vd = pays[vi]; vdate = String(vd.voidedAt).slice(0, 10);
    if (src !== 'office') throw fail(409, ref + ' was voided in Omega Logic on ' + vdate + '; not recorded again');
    if (!p.reinstate) throw fail(409, 'Bank reference ' + ref + ' was recorded ' + vd.date + ' and voided ' + vdate + ' (' + clean(vd.voidReason, 80) + '). If that money has really landed, record it again with "reinstate" and say why.');
    var why = clean(p.reason, 500);
    if (why.length < 5) throw fail(400, 'Say why a voided reference is being recorded again');
    if (provBack && p.amountCents !== vd.amountCents) throw fail(400, ref + ' was recorded from ' + NAME[reserved] + ' as USD ' + usd(vd.amountCents) + '; reinstate it for that amount');
    re = { reinstates: vi, reinstateReason: why };
  }
  /* ...and the other way round: while this invoice carries payments recorded
     by hand, a provider receipt is a conflict for a person, not a second
     count of what may be the same money (a hand-recorded part payment, then
     the invoice linked to books that hold that payment too). */
  if (src !== 'office') {
    var hand = pays.filter(function (x) { return !x.voidedAt && (x.source || 'office') === 'office'; });
    if (hand.length) {
      throw fail(409, 'This invoice has payments recorded by hand (' + hand.map(function (x) { return x.bankReference; }).join(', ').slice(0, 120) + '), so the ' + NAME[src] +
        ' payment of USD ' + usd(p.amountCents) + ' is not recorded: one invoice takes its payments from one place. If ' + NAME[src] + ' holds that money, void the hand entry, then sync');
    }
  }
  var entry = { amountCents: p.amountCents, date: p.date, bankReference: ref, by: p.by, at: p.at, source: provBack ? reserved : src };
  if (p.external) entry.external = p.external;
  else if (provBack && pays[vi].external) entry.external = pays[vi].external;
  if (re) { entry.reinstates = re.reinstates; entry.reinstateReason = re.reinstateReason; }
  var payments = pays.concat([entry]);
  var invoice = Object.assign({}, inv, { payments: payments }, settle({ amountCents: inv.amountCents, id: inv.id, payments: payments }), { checkedAt: p.at });
  if (invoice.paidCents > inv.amountCents) throw fail(400, 'Payments would exceed the invoice: USD ' + usd(invoice.paidCents) + ' against ' + usd(inv.amountCents));
  var liftHold = !!(l.paymentHold && l.paymentHold.stage === stage && invoice.satisfied);
  var event = stage + ' invoice ' + inv.id + ': USD ' + usd(p.amountCents) + ' received ' + p.date + ' · bank reference ' + ref +
    (invoice.satisfied ? ' · paid in full' : ' · USD ' + usd(invoice.balanceCents) + ' outstanding') +
    (src === 'quickbooks' ? ' · from QuickBooks' : src === 'stripe' ? ' · from Stripe' : '') +
    (re ? ' · reinstated (it was voided ' + vdate + '): ' + re.reinstateReason : '') + (liftHold ? '; hold lifted' : '');
  return { invoice: invoice, entry: entry, liftHold: liftHold, event: event };
}

function voidPlan(o, stage, v) {
  var l = tenant(o, MSG_PAY), inv = stageInv(l, stage);
  if (!inv.id) throw fail(409, 'Record the ' + stage + ' invoice as issued first');
  var src = v.source || 'office', reason;
  if (src === 'office') { reason = clean(v.reason, 500); if (reason.length < 5) throw fail(400, 'Say why this payment is being voided'); }
  else reason = clean(v.reason, 500) || (src === 'quickbooks' ? 'Reversed in QuickBooks' : 'Refunded or lost dispute in Stripe');
  var key = refKey(v.bankReference), pays = inv.payments || [], at = -1;
  pays.forEach(function (x, i) { if (!x.voidedAt && refKey(x.bankReference) === key) at = i; });
  if (at < 0) {
    if (pays.some(function (x) { return x.voidedAt && refKey(x.bankReference) === key; })) return { duplicate: true, invoice: inv };
    throw fail(404, 'No recorded payment with bank reference ' + clean(v.bankReference, 120) + ' on the ' + stage + ' invoice');
  }
  var live = !!l.releasedAt && ['shipped', 'complete', 'cancelled'].indexOf(o.status) < 0 && !o.cancelRequested;
  var needsChoice = stage === 'deposit' && live && !l.creditRelease && !l.paymentHold, keep = v.keepBuilding;
  if (src !== 'office') { if (needsChoice) keep = false; }
  else if (needsChoice && typeof keep !== 'boolean') throw fail(409, 'This order is in the plant on this payment: choose keep building on the PO, or hold the order');
  var ref = pays[at].bankReference, payments = pays.slice();
  payments[at] = Object.assign({}, pays[at], { voidedAt: v.at, voidedBy: v.by, voidReason: reason, voidSource: src });
  var invoice = Object.assign({}, inv, { payments: payments }, settle({ amountCents: inv.amountCents, id: inv.id, payments: payments }), { checkedAt: v.at });
  var po = clean(v.poNumber, 80) || poOf(o);
  var creditRelease = needsChoice && keep === true ? { by: v.by, at: v.at, reason: reason, poNumber: po || null, basis: 'void', voidedReference: ref, openCents: invoice.balanceCents } : null;
  var hold = live && keep === false && !l.paymentHold ? { stage: stage, reference: ref, reason: reason, by: v.by, at: v.at, source: src, message: holdMessage(ref, stage, reason) } : null;
  var event = stage + ' invoice ' + inv.id + ': payment USD ' + usd(pays[at].amountCents) + ' (bank reference ' + ref + ') voided by ' + v.by + ' — ' + reason +
    (creditRelease ? ' · kept building on PO ' + (po || '(no PO number)') : '') + (hold ? ' · order on hold' : '');
  return { invoice: invoice, voided: payments[at], creditRelease: creditRelease, hold: hold, needsChoice: needsChoice, event: event };
}

function releasePlan(o, v) {
  var l = tenant(o, MSG_REL);
  if (!l.acceptedAt) throw fail(409, 'Accept the order first');
  if (o.cancelRequested || o.status === 'cancelled') throw fail(409, 'The order is cancelled or has a cancellation request');
  if (l.paymentException && !l.paymentHold) throw fail(409, 'Resolve the order exception first');
  var dep = l.invoices && l.invoices.deposit;
  if (!dep || !dep.amountCents) throw fail(409, 'No deposit is due on this order; it releases on acceptance');
  if (l.creditRelease && !l.paymentHold) return { duplicate: true, creditRelease: l.creditRelease };
  var st = settle(dep);
  if (st.satisfied && !l.paymentHold) throw fail(409, 'The deposit is recorded; the order releases on it');
  var reason = clean(v.reason, 500);
  if (reason.length < 5) throw fail(400, 'Say why the plant may start before the deposit is received');
  var po = clean(v.poNumber, 80) || poOf(o), liftHold = !!l.paymentHold;
  var creditRelease = { by: v.by, at: v.at, reason: reason, poNumber: po || null, basis: l.paymentHold ? 'hold-lifted' : 'po', openCents: dep.amountCents - st.paidCents };
  return { creditRelease: creditRelease, liftHold: liftHold,
    event: 'Released on PO ' + (po || '(no PO number)') + ' before the deposit was received — ' + reason + (liftHold ? '; hold lifted' : '') };
}

function editPlan(o, stage, v) {
  var l = tenant(o, MSG_EDIT), inv = stageInv(l, stage), terms = (l.commercial || {}).terms;
  if (!inv.id) throw fail(409, 'Record the ' + stage + ' invoice as issued first');
  if (inv.ledger && inv.ledger.invoiceId) throw fail(409, 'This invoice is in ' + (inv.ledger.provider === 'stripe' ? 'Stripe' : 'QuickBooks') + ' (' + inv.ledger.invoiceId + '); change it there');
  var cur = { number: inv.id, issuedAt: inv.issuedAt || inv.date || null, dueAt: inv.dueAt || null }, next = Object.assign({}, cur);
  if (v.number !== undefined) {
    var n = clean(v.number, 80), other = stage === 'deposit' ? 'balance' : 'deposit', oi = l.invoices[other];
    if (!n) throw fail(400, 'Invoice number required');
    if (oi && oi.id && oi.id === n) throw fail(409, 'Invoice ' + n + ' is already the ' + other + ' invoice on this order');
    next.number = n;
  }
  if (v.issuedAt !== undefined) { if (!isDate(v.issuedAt)) throw fail(400, 'Invoice date must be YYYY-MM-DD'); next.issuedAt = v.issuedAt; }
  if (v.dueAt !== undefined) {
    if (v.dueAt === '' || v.dueAt === null) next.dueAt = null;
    else { if (!isDate(v.dueAt)) throw fail(400, 'Due date must be YYYY-MM-DD'); next.dueAt = v.dueAt; }
  }
  if (next.dueAt && next.issuedAt && next.dueAt < next.issuedAt) throw fail(400, 'The due date cannot be before the invoice date');
  var was = {}, now = {};
  ['number', 'issuedAt', 'dueAt'].forEach(function (k) { if (next[k] !== cur[k]) { was[k] = cur[k]; now[k] = next[k]; } });
  if (!Object.keys(now).length) return { duplicate: true, invoice: inv };
  var reason = clean(v.reason, 500);
  if (reason.length < 5) throw fail(400, 'Say why the invoice is being changed');
  if ((inv.edits || []).length >= 50) throw fail(409, 'This invoice has been edited 50 times; ask ClearSky');
  var edit = { at: v.at, by: v.by, reason: reason, was: was, now: now };
  var invoice = Object.assign({}, inv, { id: next.number, issuedAt: next.issuedAt, dueAt: next.dueAt, edits: (inv.edits || []).concat([edit]) });
  function due(d, which) { return d || 'terms (' + dueDate(Object.assign({}, which, { dueAt: null }), terms) + ')'; }
  var parts = [];
  if ('number' in now) parts.push('number ' + was.number + ' → ' + now.number);
  if ('issuedAt' in now) parts.push('issued ' + was.issuedAt + ' → ' + now.issuedAt);
  if ('dueAt' in now) parts.push('due ' + due(was.dueAt, inv) + ' → ' + due(now.dueAt, invoice));
  return { invoice: invoice, edit: edit, event: stage + ' invoice edited: ' + parts.join('; ') + ' — ' + reason };
}

function rows(entries, today, opts) {
  var provider = (opts && opts.provider) || 'none', out = [];
  (entries || []).forEach(function (e) {
    var o = (e && e.order) || {}, l = o.logic;
    if (!l || !l.invoices) return;
    if (o.poIntake && !o.poIntake.convertedAt) return;
    var tenantBilled = l.accounting === 'tenant', cancelled = !!(o.cancelRequested || o.status === 'cancelled');
    var live = !!l.releasedAt && ['shipped', 'complete', 'cancelled'].indexOf(o.status) < 0 && !o.cancelRequested;
    var c = o.customer || {}, acct = e.account || null, terms = (l.commercial || {}).terms;
    var customer = { key: acct ? 'account:' + acct.id : 'email:' + String(c.email || '').toLowerCase(), customerId: acct ? acct.id : null,
      name: (acct && acct.name) || c.company || c.name || c.email || '—', contact: c.name || '', email: c.email || '' };
    STAGES.forEach(function (stage) {
      var inv = l.invoices[stage];
      if (!inv || !(Number(inv.amountCents) > 0)) return;
      var received, satisfied, status;
      if (tenantBilled) { var s = settle(inv); received = s.paidCents; satisfied = s.satisfied; status = s.status; }
      else { received = Number(inv.paidCents) || 0; satisfied = inv.satisfied === true || received >= inv.amountCents; status = satisfied ? 'paid' : received > 0 ? 'part_paid' : inv.id ? 'awaiting_payment' : 'queued'; }
      var dueAt = dueDate(inv, terms), overdue = false, daysOverdue = 0, bk = null;
      if (inv.id && !satisfied && dueAt) { var d = daysBetween(dueAt, today); overdue = d > 0; daysOverdue = Math.max(0, d); bk = bucket(d); }
      var pays = (inv.payments || []).map(function (p, i) {
        return { index: i, amountCents: p.amountCents, date: p.date, bankReference: p.bankReference, by: p.by, at: p.at, source: p.source || 'office',
          voided: !!p.voidedAt, voidedAt: p.voidedAt || null, voidedBy: p.voidedBy || null, voidReason: p.voidReason || null, voidSource: p.voidSource || null,
          reinstates: p.reinstates == null ? null : p.reinstates };
      });
      var linked = !!(inv.ledger && inv.ledger.invoiceId);
      out.push({ key: (e.id || '') + ':' + stage, orderId: e.id, orderNo: o.orderNo, poNumber: poOf(o), customer: customer, stage: stage,
        billing: tenantBilled ? 'tenant' : 'quickbooks', number: inv.id || null, issuedAt: inv.issuedAt || (inv.id ? inv.date || null : null),
        dueAt: dueAt, dueAtSet: !!inv.dueAt, amountCents: inv.amountCents, receivedCents: received, balanceCents: inv.amountCents - received,
        satisfied: satisfied, status: status, overdue: overdue, daysOverdue: daysOverdue, bucket: bk, payments: pays, edits: inv.edits || [],
        creditRelease: l.creditRelease || null, released: !!l.releasedAt, releasedOnPo: stage === 'deposit' && S.creditOpen(o) > 0,
        hold: l.paymentHold || null, exception: l.paymentException || l.lastError || null, orderStatus: o.status, orderStage: S.stageOf(o),
        payUrl: /^https:\/\//.test(inv.payUrl || '') ? inv.payUrl : null, ledger: inv.ledger || null, syncError: l.ledgerSyncError ? l.ledgerSyncError.message : null,
        actions: {
          issue: tenantBilled && !inv.id && !cancelled,
          /* an invoice in the workspace's QuickBooks takes its payments from there (recordPlan) */
          record: tenantBilled && !!inv.id && !satisfied && !cancelled && (!l.paymentException || !!l.paymentHold) && !(linked && inv.ledger.provider === 'quickbooks' && provider === 'quickbooks'),
          void: tenantBilled && pays.some(function (p) { return !p.voided; }),
          voidNeedsChoice: tenantBilled && stage === 'deposit' && live && !l.creditRelease && !l.paymentHold,
          edit: tenantBilled && !!inv.id && !linked,
          releaseOnPo: tenantBilled && stage === 'deposit' && !!l.acceptedAt && !satisfied && !cancelled && (!l.releasedAt || !!l.paymentHold) &&
            (!l.creditRelease || !!l.paymentHold) && (!l.paymentException || !!l.paymentHold),
          push: tenantBilled && !!inv.id && provider !== 'none' && !linked,
          link: tenantBilled && !!inv.id && provider !== 'none' && !linked,
          pull: tenantBilled && !!(inv.ledger && inv.ledger.invoiceId && inv.ledger.provider === provider) } });
    });
  });
  return out;
}
function filter(list, f) {
  f = f || {};
  return (list || []).filter(function (r) {
    if (f.status === 'open' && ['awaiting_payment', 'part_paid'].indexOf(r.status) < 0) return false;
    if (f.status === 'to_issue' && ['to_issue', 'queued'].indexOf(r.status) < 0) return false;
    if (f.status === 'paid' && r.status !== 'paid') return false;
    if (f.customer && r.customer.key !== f.customer) return false;
    if (f.overdue && !r.overdue) return false;
    return true;
  });
}
function totals(list) {
  var t = { count: 0, invoicedCents: 0, receivedCents: 0, outstandingCents: 0, overdueCents: 0, overdueCount: 0, toIssueCents: 0, voidedCents: 0, creditReleasedCents: 0, aging: {}, byCustomer: [] }, by = {};
  BUCKETS.forEach(function (k) { t.aging[k] = 0; });
  (list || []).forEach(function (r) {
    t.count++;
    var c = by[r.customer.key] || (by[r.customer.key] = { key: r.customer.key, customerId: r.customer.customerId, name: r.customer.name, count: 0, invoicedCents: 0, receivedCents: 0, outstandingCents: 0, overdueCents: 0 });
    c.count++;
    if (r.number) { t.invoicedCents += r.amountCents; c.invoicedCents += r.amountCents; }
    t.receivedCents += r.receivedCents; c.receivedCents += r.receivedCents;
    if (r.number && !r.satisfied) { t.outstandingCents += r.balanceCents; c.outstandingCents += r.balanceCents; t.aging[r.bucket || 'current'] += r.balanceCents; }
    if (r.overdue) { t.overdueCents += r.balanceCents; t.overdueCount++; c.overdueCents += r.balanceCents; }
    if (r.status === 'to_issue' || r.status === 'queued') t.toIssueCents += r.amountCents;
    r.payments.forEach(function (p) { if (p.voided) t.voidedCents += p.amountCents; });
    if (r.releasedOnPo) t.creditReleasedCents += r.balanceCents;
  });
  t.byCustomer = Object.keys(by).map(function (k) { return by[k]; }).sort(function (a, b) { return b.outstandingCents - a.outstandingCents || String(a.name).localeCompare(String(b.name)); });
  return t;
}
function ledger(entries, today, f, opts) {
  var all = rows(entries, today, opts), shown = filter(all, f), seen = {}, customers = [];
  all.forEach(function (r) { if (!seen[r.customer.key]) { seen[r.customer.key] = true; customers.push({ key: r.customer.key, name: r.customer.name }); } });
  customers.sort(function (a, b) { return String(a.name).localeCompare(String(b.name)); });
  f = f || {};
  return { rows: shown, totals: totals(shown), allCount: all.length, filtered: !!((f.status && f.status !== 'all') || f.customer || f.overdue), customers: customers };
}
var HEADER = ['Order', 'PO', 'Customer', 'Customer key', 'Stage', 'Invoice', 'Issued', 'Due', 'Amount USD', 'Received USD', 'Balance USD', 'Status', 'Days overdue', 'Aging', 'Released on PO', 'Payments'];
function cell(v) {
  var s = v == null ? '' : String(v);
  if (/^[=+\-@]/.test(s)) s = "'" + s;
  return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
function money(c) { return (Number(c || 0) / 100).toFixed(2); }
function csv(list) {
  var lines = [HEADER.join(',')];
  (list || []).forEach(function (r) {
    lines.push([r.orderNo, r.poNumber, r.customer.name, r.customer.key, r.stage, r.number, r.issuedAt, r.dueAt, money(r.amountCents), money(r.receivedCents), money(r.balanceCents),
      r.status, r.daysOverdue, r.bucket, r.releasedOnPo ? 'yes' : '', r.payments.map(function (p) { return p.date + ' USD ' + money(p.amountCents) + ' ' + p.bankReference + (p.voided ? ' (VOIDED: ' + p.voidReason + ')' : ''); }).join(' | ')].map(cell).join(','));
  });
  return lines.join('\r\n') + '\r\n';
}

module.exports = { STAGES: STAGES, BUCKETS: BUCKETS, refKey: refKey, isPlaceholder: isPlaceholder, reservedSource: reservedSource, isDate: isDate, clean: clean, poOf: poOf,
  settle: settle, dueDate: dueDate, daysBetween: daysBetween, bucket: bucket, recordPlan: recordPlan, voidPlan: voidPlan, releasePlan: releasePlan, editPlan: editPlan,
  rows: rows, filter: filter, totals: totals, ledger: ledger, csv: csv };
