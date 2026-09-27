/* ═══════════════════════════════════════════════════════════════════════════
   api/_lib/qbo-statement.js — a legacy tier's statement from ClearSky's QuickBooks
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   PURE: no Firestore, no clock (callers pass `today`), no network. The
   endpoint that reaches QuickBooks is api/qbo-invoices.js.

   WHO THIS IS FOR. A workspace on a legacy tier that ClearSky invoices BY
   HAND from its QuickBooks company (billing/current.paymentProvider
   'quickbooks' or 'manual'). Its billing record only ever held what somebody
   typed into the master console — amountDue, subscriptionDue, lastPaidAt,
   amountPaid — so Plan & billing said "No billing account yet" to a
   customer QuickBooks had already invoiced three times and was chasing for
   an overdue $1,299 (Concord Energy, 2026-09-27). This reads the ledger
   instead: every invoice to the bound customer, what is still open, what is
   overdue, and the last payment.

   THE BINDING IS NOT THE PACKAGING ENGINE'S. billing/current.qboCustomerId
   is the engine's own customer (OMEGA-<orgId>, found or created by
   qbo-billing.customer and rewritten from the billing profile); a customer
   somebody made by hand — a person's name, an email on another domain —
   put there would make the engine's next activation or profile save refuse
   it ("customer needs review"). So a hand-invoiced tier is bound in a field
   the engine never reads:

     billing/current.invoicedTo = { provider: 'quickbooks', customerId,
                                    realmId, name, boundAt, boundBy }

   written only by /api/tenant-billing after QuickBooks confirmed the
   customer. realmId is the company it was confirmed in, so a sandbox
   connection (or any other company) never answers for it.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var P = require('./logic-policy');

var ID = /^\d{1,20}$/;
function isDate(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s == null ? '' : s)); }
function cents(v) { var n = Number(v); return isFinite(n) ? Math.round(n * 100) : 0; }
function money(c) { return (c < 0 ? '-$' : '$') + (Math.abs(c) / 100).toLocaleString('en-US', { minimumFractionDigits: c % 100 ? 2 : 0, maximumFractionDigits: 2 }); }
function daysBetween(from, to) { return Math.round((Date.parse(to + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000); }

/* The binding, or null. Every id that reaches a QuickBooks query is digits
   only, which is also what keeps the query string closed. */
function binding(bill) {
  var b = bill && bill.invoicedTo;
  if (!b || b.provider !== 'quickbooks') return null;
  var id = String(b.customerId == null ? '' : b.customerId), realm = String(b.realmId == null ? '' : b.realmId);
  return ID.test(id) && ID.test(realm) ? { customerId: id, realmId: realm, name: b.name ? String(b.name) : null } : null;
}
function customerId(v) { var s = String(v == null ? '' : v).trim(); return ID.test(s) ? s : null; }
function limit(v) { var n = parseInt(v, 10); return Math.min(Math.max(isFinite(n) ? n : 24, 1), 50); }
function invoiceSql(id, n) { return "select * from Invoice where CustomerRef = '" + customerId(id) + "' orderby TxnDate desc maxresults " + limit(n); }
function paymentSql(id, n) { return "select * from Payment where CustomerRef = '" + customerId(id) + "' orderby TxnDate desc maxresults " + limit(n); }
function customerSql(id) { return "select * from Customer where Id = '" + customerId(id) + "' and Active IN (true, false)"; }
/* QuickBooks keeps a voided invoice at $0 and writes "Voided" into its
   private note (qbo-billing.reconcile reads it the same way) */
function voided(inv) { return /\bvoided\b/i.test(String(inv.PrivateNote || '')) && cents(inv.TotalAmt) === 0; }
function payLink(inv) { return P.paymentLink(inv && (inv.InvoiceLink || inv.invoiceLink)); }

/* One invoice as the page shows it. `paidOn` is the latest payment QuickBooks
   applied to it; the invoice alone does not say when it was paid. */
function row(inv, today, paidOn) {
  var total = cents(inv.TotalAmt), balance = Math.max(cents(inv.Balance), 0), due = isDate(inv.DueDate) ? inv.DueDate : null;
  var late = balance > 0 && due && isDate(today) ? daysBetween(due, today) : 0;
  var state = voided(inv) ? 'void' : balance <= 0 ? 'paid' : late > 0 ? 'overdue' : 'open';
  return { id: String(inv.Id), number: inv.DocNumber ? String(inv.DocNumber) : String(inv.Id),
    date: isDate(inv.TxnDate) ? inv.TxnDate : null, dueDate: due,
    totalCents: total, balanceCents: balance, total: money(total), balance: money(balance),
    state: state, daysOverdue: state === 'overdue' ? late : 0, partPaid: state !== 'void' && balance > 0 && balance < total,
    paidOn: state === 'paid' ? (paidOn || null) : null,
    payUrl: state === 'open' || state === 'overdue' ? payLink(inv) : null };
}

/* The statement: every invoice to the customer (newest first), what is
   open, and the last payment. Rows for another customer are dropped, not
   trusted: the query asked for one customer and the answer is checked. */
function statement(id, invoices, payments, today) {
  var cid = customerId(id), paidOn = {}, name = null;
  var pays = (payments || []).filter(function (p) { return p && p.Id && String((p.CustomerRef || {}).value) === cid && isDate(p.TxnDate); });
  pays.forEach(function (p) {
    (p.Line || []).forEach(function (line) {
      (line.LinkedTxn || []).forEach(function (l) {
        if (l.TxnType !== 'Invoice') return;
        var k = String(l.TxnId);
        if (!paidOn[k] || p.TxnDate > paidOn[k]) paidOn[k] = p.TxnDate;
      });
    });
  });
  var rows = (invoices || []).filter(function (inv) { return inv && inv.Id && String((inv.CustomerRef || {}).value) === cid; }).map(function (inv) {
    if (!name && inv.CustomerRef && inv.CustomerRef.name) name = String(inv.CustomerRef.name);
    return row(inv, today, paidOn[String(inv.Id)]);
  });
  rows.sort(function (a, b) { return a.date === b.date ? (a.number < b.number ? 1 : a.number > b.number ? -1 : 0) : (a.date || '') < (b.date || '') ? 1 : -1; });
  var open = rows.filter(function (r) { return r.state === 'open' || r.state === 'overdue'; });
  var owed = open.reduce(function (n, r) { return n + r.balanceCents; }, 0);
  var last = pays.filter(function (p) { return cents(p.TotalAmt) > 0; }).sort(function (a, b) { return a.TxnDate < b.TxnDate ? 1 : a.TxnDate > b.TxnDate ? -1 : 0; })[0];
  return { customerName: name, invoices: rows,
    open: { count: open.length, overdue: open.filter(function (r) { return r.state === 'overdue'; }).length, balanceCents: owed, balance: money(owed) },
    lastPayment: last ? { date: last.TxnDate, amountCents: cents(last.TotalAmt), amount: money(cents(last.TotalAmt)) } : null };
}

/* ── Paying it by card, through Stripe (2026-09-27, Tommy: "we want this to
   be like any payment page and we want to use what you built with the
   stripe quickbooks account") ──
   The Stripe rail (docs/PAYMENTS-STRIPE.md) takes the card on Stripe's own
   hosted invoice page; the Connect to Stripe app books the payment in
   QuickBooks (docs/PAYMENTS-BROWSER-SETUP.md Part 3). OMEGA never writes a
   payment into QuickBooks: the app would book it a second time. Until the
   books apply it, QuickBooks still reads the invoice open, so the statement
   reads Stripe as well: an invoice paid by card is PAID ("being recorded in
   QuickBooks") and is never offered for payment again.

   One Stripe invoice per QuickBooks invoice AND open balance, marked
   metadata.omegaQboInvoice / omegaQboBalanceCents, so a retry finds it and
   a balance QuickBooks changed (a part payment recorded there) gets a new
   one. It carries no omegaPackage mark: the webhook's package reconcile
   never sees it.

   WHEN. Reading Stripe needs the key's mode to match the QuickBooks company
   (a live key with production, a test key with the sandbox): a test card
   must never mark a real invoice paid. Taking a payment also needs the
   deployment's rail to be Stripe (PACKAGING_PROVIDER=stripe, the switch the
   runbook flips once the Stripe account's webhook and invoice settings are
   ready); until then the invoice's own QuickBooks page is the pay link. */
function readable(stripeEnv, qboEnv) { return !!stripeEnv && stripeEnv === qboEnv; }
function payable(provider, stripeEnv, qboEnv) { return provider === 'stripe' && readable(stripeEnv, qboEnv); }
function paidDay(s) { var t = s && s.status_transitions && s.status_transitions.paid_at; return t ? new Date(t * 1000).toISOString().slice(0, 10) : null; }
function stripeLink(url) { return require('./stripe-billing').payLink(url); }
/* the Stripe invoice that takes the card for one open QuickBooks invoice */
function cardInvoice(org, realm, r, customer) {
  var balance = String(r.balanceCents), meta = { omegaOrg: org, omegaQboInvoice: r.id, omegaQboDoc: r.number, omegaQboRealm: String(realm), omegaQboBalanceCents: balance };
  return { meta: meta,
    invoice: { customer: customer, collection_method: 'send_invoice', days_until_due: 1, currency: 'usd', auto_advance: false, pending_invoice_items_behavior: 'exclude',
      description: ('ClearSky Energy Solutions invoice ' + r.number + (r.date ? ' of ' + r.date : '') + (r.partPaid ? ', balance' : '')).slice(0, 500), metadata: meta },
    item: { customer: customer, amount: r.balanceCents, currency: 'usd', description: ('Invoice ' + r.number + (r.partPaid ? ' (balance of ' + r.total + ')' : '')).slice(0, 500), metadata: meta } };
}
function isCard(s, id, live) { var m = (s && s.metadata) || {}; return !!s && s.livemode === live && m.omegaQboInvoice === String(id); }
/* The statement with Stripe read in: `stripe` is the workspace's Stripe
   invoices, `refunded` the cents refunded per Stripe invoice id. */
function withStripe(st, stripe, refunded, live) {
  refunded = refunded || {};
  var paidCard = [];
  var rows = st.invoices.map(function (r) {
    var mine = (stripe || []).filter(function (s) { return isCard(s, r.id, live); }), out = Object.assign({}, r);
    var paid = mine.filter(function (s) { return s.status === 'paid'; });
    var net = paid.reduce(function (n, s) { return n + Math.max(0, (Number(s.amount_paid) || 0) - (Number(refunded[s.id]) || 0)); }, 0);
    var on = paid.map(paidDay).filter(Boolean).sort().pop() || null;
    if (net > 0) paidCard.push({ date: on, cents: net });
    if ((r.state === 'open' || r.state === 'overdue') && net > 0 && net >= r.balanceCents) {
      /* paid on Stripe's page; QuickBooks has not applied it yet */
      Object.assign(out, { state: 'paid', paidVia: 'stripe', booked: false, paidOn: on, daysOverdue: 0, payUrl: null });
    } else if (r.state === 'void' && net > 0) {
      /* the books voided the invoice for the Connect to Stripe receipt: it was paid, by card */
      Object.assign(out, { state: 'paid', paidVia: 'stripe', booked: true, paidOn: on, totalCents: net, total: money(net) });
    } else if (r.state === 'paid' && net > 0) {
      Object.assign(out, { paidVia: 'stripe', booked: true, paidOn: out.paidOn || on });
    } else if (r.state === 'open' || r.state === 'overdue') {
      var card = mine.filter(function (s) { return s.status === 'open' && Number(s.amount_due) === r.balanceCents && stripeLink(s.hosted_invoice_url); })[0];
      if (card) { out.payUrl = stripeLink(card.hosted_invoice_url); out.payVia = 'stripe'; }
    }
    return out;
  });
  var open = rows.filter(function (r) { return r.state === 'open' || r.state === 'overdue'; }), owed = open.reduce(function (n, r) { return n + r.balanceCents; }, 0);
  var last = st.lastPayment;
  paidCard.forEach(function (p) { if (p.date && (!last || p.date > last.date)) last = { date: p.date, amountCents: p.cents, amount: money(p.cents), via: 'stripe' }; });
  return Object.assign({}, st, { invoices: rows, lastPayment: last,
    open: { count: open.length, overdue: open.filter(function (r) { return r.state === 'overdue'; }).length, balanceCents: owed, balance: money(owed) } });
}

module.exports = { binding: binding, customerId: customerId, limit: limit, invoiceSql: invoiceSql, paymentSql: paymentSql, customerSql: customerSql,
  statement: statement, row: row, payLink: payLink, money: money,
  readable: readable, payable: payable, cardInvoice: cardInvoice, isCard: isCard, withStripe: withStripe, paidDay: paidDay, stripeLink: stripeLink };
