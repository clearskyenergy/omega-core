/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/office-stage.js — where an order is, and what happens next
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. The order list, the workspace header and the stage counts on the
   office page all read this one derivation, so "awaiting deposit" means the
   same thing everywhere it is printed and the office never re-derives it in
   the browser. The inputs are the order fields api/logic-office.js already
   projects; nothing here reads Firestore or decides what a caller may see.

   The stages follow the commercial protocol in docs/OMEGA-LOGIC-OPERATIONS.md:
   price → accept → deposit → release → build → balance → ship. An exception
   (payment reversal, worker error, cancellation request) outranks all of
   them because it is the one a person has to act on first.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

var STAGES = {
  exception: 'Needs attention', quote: 'Awaiting price', priced: 'Priced', deposit: 'Awaiting deposit',
  release: 'Releasing to plant', production: 'In production', balance: 'Awaiting final payment',
  ship: 'Ready to ship', shipped: 'Shipped', complete: 'Complete', cancelled: 'Cancelled'
};
var ORDER = ['exception', 'quote', 'priced', 'deposit', 'release', 'production', 'balance', 'ship', 'shipped', 'complete', 'cancelled'];

function dollars(c) { return '$' + (Number(c || 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function text(v, max) { return String(v == null ? '' : v).trim().slice(0, max || 200); }
/* RELEASED ON PO (logic.creditRelease, api/_lib/receivables.js): the plant
   may start before the deposit is received. creditOpen() is the deposit
   still open on such an order — 0 without a credit release, without a
   deposit, or once the deposit is recorded. While it is open the stage says
   so and carries `credit: true`; otherwise the stage object is exactly what
   it always was (no `credit` key). */
function out(key, next, owner, label, credit) { var r = { key: key, label: label || STAGES[key], next: next, owner: !!owner }; if (credit) r.credit = true; return r; }
function creditOpen(o) { var l = (o && o.logic) || {}, dep = (l.invoices || {}).deposit; if (!l.creditRelease || !dep || !dep.amountCents || dep.satisfied) return 0; return Math.max(0, (Number(dep.amountCents) || 0) - (Number(dep.paidCents) || 0)); }

/* `owner` marks a next step only ClearSky can take (price, accept, ship,
   settle); the office shows it as waiting on ClearSky rather than as a
   button the OEM cannot press. */
function stageOf(o) {
  o = o || {};
  var l = o.logic || null, status = text(o.status, 40), inv = (l && l.invoices) || {};
  if (status === 'cancelled') return out('cancelled', 'Refund and stock disposition need review', true);
  if (o.cancelRequested) return out('exception', 'Cancellation requested — refund and stock disposition need ClearSky review', true, 'Cancellation requested');
  if (l && (l.paymentException || l.lastError)) return out('exception', text(l.paymentException || l.lastError, 200), true);
  if (status === 'complete') return out('complete', 'Nothing further', false);
  if (status === 'shipped') {
    var p = (l && l.payout) || {};
    if (p.pendingCents > 0) return out('shipped', 'Record the completed wire · ' + dollars(p.pendingCents) + ' ready', true);
    if (p.status === 'wire_recorded') return out('shipped', 'Settled', false);
    return out('shipped', 'Confirm cleared receipts', true);
  }
  if (!l) return out('quote', 'Approve the customer price', true);
  if (!l.acceptedAt) return out('priced', 'Accept the order', true);
  if (!l.releasedAt) {
    var dep = inv.deposit;
    if (!dep) return out('deposit', 'Deposit invoice is being queued', false);
    if (dep.satisfied) return out('release', 'Deposit recorded — releasing to plant', false);
    if (l.creditRelease) return out('release', 'Released on PO ' + (l.creditRelease.poNumber || '(no PO number)') + ' — releasing to plant', false, 'Releasing on PO', creditOpen(o) > 0);
    return out('deposit', 'Awaiting deposit · ' + dollars(dep.paidCents || 0) + ' of ' + dollars(dep.amountCents) + ' recorded', false);
  }
  var bal = inv.balance, open = creditOpen(o), po = l.creditRelease ? (l.creditRelease.poNumber || '(no PO number)') : '';
  if (bal && bal.satisfied && open) return out('balance', 'Balance recorded — the deposit ' + dollars(open) + ' is still open (released on PO); record it before shipment', false, 'Awaiting deposit · on PO', true);
  if (bal && bal.satisfied) return out('ship', 'Paid in full — record the shipment', true);
  if (bal) return out('balance', 'Awaiting final payment · ' + dollars(bal.paidCents || 0) + ' of ' + dollars(bal.amountCents) + ' recorded' + (open ? ' · deposit ' + dollars(open) + ' open (released on PO)' : ''), false, null, open > 0);
  if (open) return out('production', 'Released on PO ' + po + ' · deposit ' + dollars(open) + ' not yet received', false, 'Released on PO', true);
  return out('production', 'Building — follow the work order', false);
}

/* Counts for the office header. `paidCents` is what accounting has
   recorded across the shown orders, not bank-cleared funds. */
function totals(orders) {
  var t = { orders: 0, paidCents: 0, byStage: {}, attention: 0 };
  ORDER.forEach(function (k) { t.byStage[k] = 0; });
  (Array.isArray(orders) ? orders : []).forEach(function (o) {
    var s = (o && o.stage && o.stage.key) ? o.stage.key : stageOf(o).key;
    t.orders++; t.byStage[s]++;
    if (s === 'exception') t.attention++;
    var inv = (o && o.logic && o.logic.invoices) || {};
    Object.keys(inv).forEach(function (k) { t.paidCents += Number(inv[k].paidCents) || 0; });
  });
  return t;
}

/* The financial picture the office can stand behind. Every figure is from
   accounting evidence already on the order: what has been invoiced, what
   QuickBooks recorded as paid, what is still open on issued invoices, and
   what the approved commercial snapshot says is still to be invoiced.
   "Expected" is contractual, not a forecast of when cash arrives; bank
   clearance is a separate ledger (payout) and stays owner-only. */
function finance(orders, owner) {
  var f = { recordedCents: 0, invoicedCents: 0, receivableCents: 0, expectedDepositCents: 0, expectedBalanceCents: 0,
    openValueCents: 0, shippedValueCents: 0, byStage: {}, byRep: {}, wire: owner ? { eligibleCents: 0, sentCents: 0, pendingCents: 0 } : null };
  ORDER.forEach(function (k) { f.byStage[k] = { count: 0, totalCents: 0 }; });
  (Array.isArray(orders) ? orders : []).forEach(function (o) {
    o = o || {};
    var key = (o.stage && o.stage.key) || stageOf(o).key, l = o.logic || {}, c = l.commercial || {}, inv = l.invoices || {};
    var total = o.totalCents != null ? Number(o.totalCents) || 0 : Number(c.totalCents) || 0;
    f.byStage[key].count++; f.byStage[key].totalCents += total;
    var repKey = o.rep && o.rep.name ? text(o.rep.name, 120) : 'No rep';
    if (!f.byRep[repKey]) f.byRep[repKey] = { count: 0, totalCents: 0, recordedCents: 0 };
    f.byRep[repKey].count++; f.byRep[repKey].totalCents += total;
    if (['shipped', 'complete'].indexOf(key) >= 0) f.shippedValueCents += total;
    else if (['cancelled', 'quote'].indexOf(key) < 0) f.openValueCents += total;
    Object.keys(inv).forEach(function (k) {
      var i = inv[k] || {};
      f.invoicedCents += Number(i.amountCents) || 0; f.recordedCents += Number(i.paidCents) || 0; f.byRep[repKey].recordedCents += Number(i.paidCents) || 0;
      if (!i.satisfied) f.receivableCents += Math.max(0, (Number(i.amountCents) || 0) - (Number(i.paidCents) || 0));
    });
    if (key === 'deposit') f.expectedDepositCents += inv.deposit ? Math.max(0, (Number(inv.deposit.amountCents) || 0) - (Number(inv.deposit.paidCents) || 0)) : (Number(c.depositCents) || 0);
    if (key === 'release' || key === 'production') f.expectedBalanceCents += Math.max(0, (Number(c.totalCents) || 0) - (Number(c.depositCents) || 0));
    if (key === 'balance' && inv.balance) f.expectedBalanceCents += Math.max(0, (Number(inv.balance.amountCents) || 0) - (Number(inv.balance.paidCents) || 0));
    if (f.wire && l.payout) { f.wire.eligibleCents += Number(l.payout.eligibleCents) || 0; f.wire.sentCents += Number(l.payout.sentCents) || 0; f.wire.pendingCents += Number(l.payout.pendingCents) || 0; }
  });
  return f;
}

module.exports = { STAGES: STAGES, ORDER: ORDER, stageOf: stageOf, creditOpen: creditOpen, totals: totals, finance: finance, dollars: dollars };
