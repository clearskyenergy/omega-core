/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/office-stage.js — where an order is, and what happens next
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE. The order list, the workspace header and the stage counts on the
   office page all read this one derivation, so "awaiting deposit" means the
   same thing everywhere it is printed and the office never re-derives it in
   the browser. The inputs are the order fields api/logic-office.js already
   projects; nothing here reads Firestore or decides what a caller may see.
   The caller's standing arrives already verified (logic-access builds it);
   access()/actions() only turn it into what the office is shown, and the
   gate that refuses a price is logic-access.requirePricer, on the same
   billingOf() rule.

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

/* HOW AN ORDER IS BILLED decides who approves its price (D1, 2026-09-24).
   'tenant': the workspace invoices its customer on its own paper, so its
   owner or an administrator approves the price and accepts the order.
   'quickbooks': ClearSky invoices from its QuickBooks, so ClearSky does.
   A priced order carries its own mode (logic.accounting, or the snapshot's
   commercial.billing) and that wins; until it is priced the workspace's
   setting (fulfillment/config.accounting) says how it will be billed.
   ONE rule: logic-access.requirePricer (the server gate) and actions()
   (what the office is shown) both read it from here. */
function billingOf(o, fallback) {
  var l = (o && o.logic) || null;
  if (l) return l.accounting === 'tenant' || (l.commercial && l.commercial.billing === 'tenant') ? 'tenant' : 'quickbooks';
  return fallback === 'tenant' ? 'tenant' : 'quickbooks';
}

/* `owner` marks a next step only ClearSky can take (price, accept, ship,
   settle); the office shows it as waiting on ClearSky rather than as a
   button the OEM cannot press. Price and accept are ClearSky's only on an
   order billed through ClearSky's QuickBooks: on a tenant-billed order the
   workspace's owner or administrator takes them (opts.billing is the
   workspace's setting, for an order not priced yet). */
function stageOf(o, opts) {
  o = o || {};
  var l = o.logic || null, status = text(o.status, 40), inv = (l && l.invoices) || {};
  var clearskyPrices = billingOf(o, opts && opts.billing) !== 'tenant';
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
  if (!l) return out('quote', 'Approve the customer price', clearskyPrices);
  if (!l.acceptedAt) return out('priced', 'Accept the order', clearskyPrices);
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

/* The standing that may take the price/accept step on a tenant-billed
   order: an ACTIVE owner or admin of the workspace (a member doc with no
   status predates the field and is active). access() is what the office
   is told about the person looking; the server builds it from the verified
   caller (logic-access) and nothing else. */
function officeAdmin(m) { return !!m && (m.status || 'active') === 'active' && (m.role === 'owner' || m.role === 'admin'); }
function access(clearsky, member, enabled) {
  clearsky = clearsky === true;
  return { clearsky: clearsky, admin: !clearsky && officeAdmin(member), enabled: enabled === true, role: clearsky ? 'clearsky' : ((member && member.role) || null) };
}

/* What the person looking at the office may do on this order, and who the
   price/accept step waits on when it is not them (D1). PURE: the caller's
   standing comes in as `access` (access() above, built on the server):
     access.clearsky  the ClearSky owner — prices and accepts everything
     access.admin     an active owner or admin of THIS workspace — prices
                      and accepts what the workspace bills itself
     access.enabled   Omega Logic is switched on for the workspace (the
                      workflow refuses to price otherwise)
   `billing` is the workspace's setting (fulfillment/config.accounting).
   Returns { stage, can: { price, accept }, waitingOn } where waitingOn is
   'clearsky' (ClearSky's step), 'admin' (the workspace owner or an
   administrator's step) or null (nobody but the office, or the viewer). */
function actions(o, access, billing) {
  o = o || {}; access = access || {};
  var stage = stageOf(o, { billing: billing }), l = o.logic || null, mode = billingOf(o, billing);
  var open = !o.cancelRequested && ['cancelled', 'shipped', 'complete'].indexOf(text(o.status, 40)) < 0;
  var may = access.enabled !== false && (access.clearsky === true || (access.admin === true && mode === 'tenant'));
  var can = { price: !!(may && open && !l), accept: !!(may && open && l && !l.acceptedAt) };
  var step = stage.key === 'quote' || stage.key === 'priced', waitingOn = null;
  if (step && !can.price && !can.accept) waitingOn = mode === 'tenant' && access.enabled !== false ? 'admin' : 'clearsky';
  else if (!step && stage.owner && access.clearsky !== true) waitingOn = 'clearsky';
  return { stage: stage, can: can, waitingOn: waitingOn };
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
    /* released on PO: the order has moved past 'deposit' but the deposit is still owed */
    else if (key !== 'cancelled') f.expectedDepositCents += creditOpen(o);
    if (key === 'release' || key === 'production') f.expectedBalanceCents += Math.max(0, (Number(c.totalCents) || 0) - (Number(c.depositCents) || 0));
    if (key === 'balance' && inv.balance) f.expectedBalanceCents += Math.max(0, (Number(inv.balance.amountCents) || 0) - (Number(inv.balance.paidCents) || 0));
    if (f.wire && l.payout) { f.wire.eligibleCents += Number(l.payout.eligibleCents) || 0; f.wire.sentCents += Number(l.payout.sentCents) || 0; f.wire.pendingCents += Number(l.payout.pendingCents) || 0; }
  });
  return f;
}

/* ── THE PATH (2026-10-17, Tommy: "make it less complicated all streamlined
   just like we did with" Omega Prime) ─────────────────────────────────────
   One bar of seven steps an order walks in one direction, the way Prime
   walks a site: Price → Deposit → Build → Final payment → Ship → Deliver →
   On site, then Complete. path() says, per order and for the person
   looking, which step it is on, the verdict in one sentence, and the ONE
   next action with whose it is. The desktop office, the Omega Logic app
   and Today all read it; none of them works it out again.

   It is built on the rules above and on nothing new: stageOf()/actions()
   (D1: who prices and accepts), billingOf() (who issues an invoice), the
   order's invoices (issue versus collect), its delivery legs, and the
   custody of its units (custodyCounts below). It decides nothing a gate
   decides: every button it names is still refused by its own endpoint when
   the caller may not press it. `who` is said from the viewer's side:
     you       the person looking may do it now (Today counts it)
     admin     the workspace's owner or an administrator
     clearsky  ClearSky (an order billed through its QuickBooks, a
               single shipment, an exception only ClearSky reviews)
     customer  the customer (a payment, the site of a unit)
     plant     the plant floor
     carrier   the load is on the road
     auto      Omega Logic does it by itself (a queued invoice, a release)
   `control` names the thing to press, which each screen maps to its own
   button: price, accept, issue-deposit, record-deposit, issue-balance,
   record-balance, work-order, freight, ship, deliver, confirm, site, fix.
   "On site" is every shipping unit bound to a site (custody.siteId): the
   coverage binds there, and it is what Omega Prime's last stage reads as
   delivered and on its site. Confirming what a customer declared is the
   office's check and never holds the order back from Complete. */
var PATH = [
  { key: 'price', label: 'Price', ask: 'What will the customer pay?' },
  { key: 'deposit', label: 'Deposit', ask: 'Has the deposit arrived?' },
  { key: 'build', label: 'Build', ask: 'Is every unit built and tested?' },
  { key: 'final', label: 'Final payment', ask: 'Is it paid in full?' },
  { key: 'ship', label: 'Ship', ask: 'Is it on a truck?' },
  { key: 'deliver', label: 'Deliver', ask: 'Did it arrive whole?' },
  { key: 'site', label: 'On site', ask: 'Is every unit on its site?' }
];
var STEP_AT = {}; PATH.forEach(function (p, i) { STEP_AT[p.key] = i; });
/* custody statuses (api/_lib/custody.js STATUSES) past the road, and past
   the receiving inspection; scripts/test-office-stage.js holds them to it */
var ARRIVED = ['delivered', 'received', 'assigned', 'installed', 'commissioned', 'in_service', 'rma_open', 'returned', 'replaced', 'decommissioned'];
var RECEIVED = ARRIVED.slice(1);
/* What the custody of one order's units says, for path(): `units` are the
   order's plant_units records (only shipping units count). */
function custodyCounts(units) {
  var c = { units: 0, left: 0, arrived: 0, received: 0, bound: 0, declared: 0 };
  (Array.isArray(units) ? units : []).forEach(function (u) {
    if (!u || !u.shipUnit) return;
    var cu = (u.custody && typeof u.custody === 'object') ? u.custody : {}, st = text(cu.status, 40);
    c.units++;
    if (st) c.left++;
    if (ARRIVED.indexOf(st) >= 0) c.arrived++;
    if (RECEIVED.indexOf(st) >= 0) c.received++;
    /* declared: on a site nobody at the office has confirmed (custody.confirmation) */
    if (cu.siteId) { c.bound++; if (!cu.confirmedAt) c.declared++; }
  });
  return c;
}
function invState(inv, mode) {
  inv = inv || {};
  var amount = Number(inv.amountCents) || 0, paid = Number(inv.paidCents) || 0;
  var done = !amount || inv.satisfied === true || inv.status === 'not_required' || inv.status === 'paid';
  return { amount: amount, paid: paid, done: done, toIssue: !done && mode === 'tenant' && !inv.id };
}
function sentence(v) { v = text(v, 240); return !v || /[.!?]$/.test(v) ? v : v + '.'; }
function path(o, acc, billing, units) {
  o = o || {}; acc = acc || {};
  var act = actions(o, acc, billing), st = act.stage, l = o.logic || null, inv = (l && l.invoices) || {}, mode = billingOf(o, billing);
  var status = text(o.status, 40), office = acc.clearsky === true || acc.admin === true;
  var mine = office ? 'you' : 'admin', cs = acc.clearsky === true ? 'you' : 'clearsky';
  var legs = o.delivery && Array.isArray(o.delivery.legs) ? o.delivery.legs : [];
  var moving = legs.filter(function (g) { return g && ['in_transit', 'delivered', 'accepted', 'exception'].indexOf(g.status) >= 0; });
  /* no shipping unit found for the order (none read, or older units that do
     not carry its id) is "not known", never "nothing to deliver" */
  var u = units && typeof units === 'object' && Number(units.units) > 0 ? units : null;
  function out(step, state, say, next) {
    var at = step === 'complete' ? PATH.length : (STEP_AT[step] == null ? null : STEP_AT[step]);
    return { step: step, at: at, of: PATH.length, label: step === 'complete' ? 'Complete' : (at == null ? '' : PATH[at].label), state: state, say: say,
      next: next ? { text: next[0], who: next[1] || null, control: next[2] || null } : null };
  }
  /* where it stands with nothing in the way: the step under an exception */
  function under() {
    if (status === 'complete') return 'complete';
    if (status === 'shipped' || moving.length) return 'deliver';
    if (!l || !l.acceptedAt) return 'price';
    if (!l.releasedAt) return (inv.deposit && invState(inv.deposit, mode).done) || l.creditRelease ? 'build' : 'deposit';
    if (!inv.balance) return 'build';
    return invState(inv.balance, mode).done ? 'ship' : 'final';
  }
  if (status === 'cancelled') return out(null, 'cancelled', 'Cancelled. ' + sentence(st.next), st.owner ? ['Review the refund and the stock', cs, 'fix'] : null);
  if (st.key === 'exception') {
    /* a payment hold the workspace put on its own self-billed order is lifted
       by recording the payment again (receivables.recordPlan); every other
       exception is ClearSky's to review, as the stage says */
    var hold = l && l.paymentHold && mode === 'tenant';
    return out(under(), 'attention', sentence(st.next.indexOf(st.label) === 0 ? st.next : st.label + ': ' + st.next),
      hold ? ['Record the ' + (l.paymentHold.stage === 'balance' ? 'final payment' : 'deposit') + ' again, or release it on its PO', mine, 'record-' + (l.paymentHold.stage === 'balance' ? 'balance' : 'deposit')] : ['Review and resolve it', cs, 'fix']);
  }
  if (status === 'complete') return out('complete', 'complete', 'Complete.', null);
  var total = l && l.commercial ? l.commercial.totalCents : null;
  if (st.key === 'quote') {
    var pw = act.can.price ? 'you' : act.waitingOn === 'admin' ? 'admin' : 'clearsky';
    return out('price', 'ok', 'Not priced yet.', ['Approve the customer price', pw, 'price']);
  }
  if (st.key === 'priced') {
    var aw = act.can.accept ? 'you' : act.waitingOn === 'admin' ? 'admin' : 'clearsky';
    return out('price', 'ok', 'Priced' + (total != null ? ' at ' + dollars(total) : '') + ', not accepted yet.', ['Accept the order', aw, 'accept']);
  }
  var dep = invState(inv.deposit, mode), open = creditOpen(o);
  function collect(which, s) {
    var name = which === 'deposit' ? 'deposit' : 'final payment';
    if (s.toIssue) return [which === 'deposit' ? 'Issue the deposit invoice' : 'Issue the final invoice', mine, 'issue-' + which];
    return mode === 'tenant' ? ['Record the ' + name + ' when it arrives', 'customer', 'record-' + which] : ['ClearSky’s QuickBooks records the ' + name + ' when it is paid', 'customer', null];
  }
  if (st.key === 'deposit') {
    if (!inv.deposit) return out('deposit', 'ok', 'Accepted. The deposit invoice is being made.', ['The deposit invoice is being made', 'auto', null]);
    if (dep.toIssue) return out('deposit', 'ok', 'The deposit, ' + dollars(dep.amount) + ', is not invoiced yet.', collect('deposit', dep));
    return out('deposit', 'ok', 'Awaiting the deposit: ' + dollars(dep.paid) + ' of ' + dollars(dep.amount) + ' received.', collect('deposit', dep));
  }
  if (st.key === 'release') return out('build', 'ok', sentence(st.next), ['Releasing to the plant', 'auto', null]);
  if (st.key === 'production') {
    if (open) return out('build', 'ok', 'In production. ' + sentence(st.next), collect('deposit', dep));
    return out('build', 'ok', 'In production.', ['Building and testing every unit', 'plant', 'work-order']);
  }
  var bal = invState(inv.balance, mode);
  if (st.key === 'balance' && !bal.done) {
    if (bal.toIssue) return out('final', 'ok', 'Every unit passed. The final invoice, ' + dollars(bal.amount) + ', is not issued yet.', collect('balance', bal));
    return out('final', 'ok', 'Awaiting the final payment: ' + dollars(bal.paid) + ' of ' + dollars(bal.amount) + ' received.', collect('balance', bal));
  }
  if (open) return out('final', 'ok', sentence(st.next), collect('deposit', dep));
  /* paid in full (a $0 balance is paid): ship, then the road, then the site */
  if (status !== 'shipped' && !moving.length) {
    if (o.delivery) return out('ship', 'ok', 'Paid in full. Ready to ship.', ['Plan the freight and record the pickup', mine, 'freight']);
    return out('ship', 'ok', 'Paid in full. Ready to ship.', ['Record the shipment', cs, 'ship']);
  }
  if (legs.some(function (g) { return g && g.status === 'exception'; })) return out('deliver', 'attention', 'The receiving inspection found a problem on a load.', ['Open the load and settle what was short or damaged', mine, 'deliver']);
  if (!u) return out('deliver', 'ok', 'Shipped' + (o.shipment && o.shipment.carrier ? ' with ' + text(o.shipment.carrier, 80) : '') + '.', ['Follow its units in Sites & custody', null, 'site']);
  /* part of the order is still at the plant: the rest of it ships first */
  if (u.left < u.units) return out('deliver', 'ok', u.left + ' of ' + u.units + ' units shipped' + (u.arrived ? ', ' + u.arrived + ' delivered' : '') + '.',
    o.delivery ? ['Record the pickup for the ' + (u.units - u.left) + ' still at the plant', mine, 'freight'] : ['Record the shipment', cs, 'ship']);
  if (u.received < u.units) {
    if (u.arrived > u.received) return out('deliver', 'ok', u.arrived + ' of ' + u.units + ' units delivered, ' + u.received + ' received.', ['Record the receiving inspection', mine, 'deliver']);
    return out('deliver', 'ok', (u.units - u.arrived) + ' of ' + u.units + ' units on the way.', ['Record the delivery when it arrives', 'carrier', 'deliver']);
  }
  var confirm = u.declared ? ['Confirm the site' + (u.declared === 1 ? '' : 's') + ' the customer named', mine, 'confirm'] : null;
  if (u.bound < u.units) return out('site', 'ok', u.bound + ' of ' + u.units + ' units on a site.', confirm || ['Waiting on the customer to name each unit’s site', 'customer', 'site']);
  return out('complete', 'complete', 'Complete. Every unit is on its site.', confirm);
}
/* the bar's counts: how many of the shown orders stand on each step (an
   order that needs attention counts on its step AND under attention) */
function pipeline(orders) {
  var p = { attention: 0, complete: 0, cancelled: 0 };
  PATH.forEach(function (s) { p[s.key] = 0; });
  (Array.isArray(orders) ? orders : []).forEach(function (o) {
    var x = o && o.path; if (!x) return;
    if (x.state === 'cancelled') { p.cancelled++; return; }
    if (x.state === 'complete') { p.complete++; return; }
    if (x.step && p[x.step] != null) p[x.step]++;
    if (x.state === 'attention') p.attention++;
  });
  return p;
}

module.exports = { STAGES: STAGES, ORDER: ORDER, stageOf: stageOf, billingOf: billingOf, officeAdmin: officeAdmin, access: access, actions: actions, creditOpen: creditOpen, totals: totals, finance: finance, dollars: dollars,
  PATH: PATH, path: path, custodyCounts: custodyCounts, pipeline: pipeline };
