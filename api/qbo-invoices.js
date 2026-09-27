/* POST /api/qbo-invoices — a legacy tier's invoices, from ClearSky's QuickBooks,
   and paying one by card through Stripe.
   Body: { orgId?, limit? }                        the statement
         { orgId?, action: 'pay', invoiceId }      the card page for one open invoice
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The QuickBooks twin of /api/stripe-invoices, for a workspace ClearSky
   invoices by hand from its QuickBooks company. What QuickBooks actually
   issued and what was actually paid — never the numbers somebody typed into
   the master console (amountDue, lastPaidAt, amountPaid), which is how Plan &
   billing came to tell a customer with an overdue invoice that it had no
   billing account and would be charged nothing. The rules of the statement
   are api/_lib/qbo-statement.js; this file only reaches QuickBooks and Stripe.

   WHICH CUSTOMER. billing/current.invoicedTo, bound by ClearSky staff through
   /api/tenant-billing after QuickBooks confirmed it — never the packaging
   engine's qboCustomerId (the statement's header says why). The connected
   company must be the one the binding was confirmed in, or nothing is read:
   a sandbox connection must not answer for a production customer 8.

   PAYING (Tommy, 2026-09-27: "like any payment page", on the Stripe rail and
   the Connect to Stripe books). An owner or administrator presses Pay; this
   re-reads the invoice from QuickBooks, makes (or finds) the workspace's
   Stripe customer and ONE Stripe invoice for that invoice's open balance,
   and answers with Stripe's hosted page, where the card is entered. Nothing
   is charged here and no card touches this site. When the card clears, the
   statement shows the invoice paid (Stripe says so) until the Connect to
   Stripe app's booking lets QuickBooks say so too. Off unless the
   deployment's rail is Stripe and the key's mode matches the QuickBooks
   company (qbo-statement.payable); a workspace can always pay on the
   invoice's own QuickBooks page when QuickBooks offers one.

   RETURNS connected:false RATHER THAN AN ERROR when nothing is bound, as the
   Stripe reader does: "we have not set up your QuickBooks record" is the
   normal state of most legacy workspaces, not a failure to paint in red. A
   QuickBooks outage or a company mismatch IS an error, so the page says the
   list is unavailable instead of "nothing is owed".

   Every verified member of the workspace may read the statement — the same
   rule as the plan-change summary, because billing/current is theirs to
   read. Invoice LINES are not returned: a statement needs numbers, dates,
   amounts and the pay link, not ClearSky's descriptions. */
'use strict';
var A = require('./_lib/admin'), St = require('./_lib/qbo-statement');

function today() { return new Date().toISOString().slice(0, 10); }
function key(v) { return require('crypto').createHash('sha256').update(String(v)).digest('hex').slice(0, 48); }

/* Stripe as this deployment has it: the client, its mode ('production' for a
   live key, 'sandbox' for a test key), whether it may be read for this
   QuickBooks company and whether it may take a payment. */
function stripeSide(qboEnv) {
  var Mode = require('./_lib/packaging-mode'), env = Mode.configured('stripe'), deps = module.exports.deps;
  var client = deps && deps.stripe ? deps.stripe : env ? require('stripe')(process.env.STRIPE_SECRET_KEY) : null;
  return { client: client, live: env === 'production', read: !!client && St.readable(env, qboEnv), pay: !!client && St.payable(Mode.provider(), env, qboEnv) };
}

/* The workspace's Stripe invoices that pay QuickBooks invoices, and what was
   refunded on the paid ones (a refund puts the invoice back to unpaid). */
async function cards(SC, customer, live) {
  var rows = ((await SC.invoices.list({ customer: customer, limit: 100 })) || {}).data || [];
  rows = rows.filter(function (s) { return s.livemode === live && s.metadata && s.metadata.omegaQboInvoice; });
  var refunded = {};
  for (var i = 0; i < rows.length; i++) {
    var s = rows[i];
    var back = Number(s.post_payment_credit_notes_amount) || 0;
    if (s.status === 'paid' && s.charge) {
      var ch = typeof s.charge === 'string' ? await SC.charges.retrieve(s.charge) : s.charge;
      if (ch && ch.amount_refunded) back = Math.max(back, ch.amount_refunded);
    }
    if (back) refunded[s.id] = back;
  }
  return { rows: rows, refunded: refunded };
}

/* The workspace's Stripe customer: the one on the record, else one marked for
   it (a retry after a lost write), else a new one — recorded on
   billing/current with a history row, like every billing change. */
async function stripeCustomer(SC, live, ref, bill, org, name, email, caller) {
  if (bill.stripeCustomerId) {
    var c = await SC.customers.retrieve(bill.stripeCustomerId);
    if (!c || c.deleted) throw A.httpError(409, 'The Stripe customer on this workspace needs review by ClearSky');
    if (c.livemode !== live) throw A.httpError(409, 'The Stripe customer on this workspace is in the other Stripe mode; ClearSky reviews it');
    var mark = (c.metadata || {}).omegaOrg || (c.metadata || {}).orgId;
    if (mark && mark !== org) throw A.httpError(409, 'The Stripe customer on this workspace belongs to another; ClearSky reviews it');
    return String(c.id);
  }
  var found = email ? (((await SC.customers.list({ email: email, limit: 100 })) || {}).data || []).filter(function (x) { return !x.deleted && x.livemode === live && (x.metadata || {}).omegaOrg === org; }) : [];
  if (found.length > 1) throw A.httpError(409, 'More than one Stripe customer is marked for ' + org + '; ClearSky reviews it');
  var want = { name: String(name).slice(0, 200), metadata: { omegaOrg: org, omegaBilling: 'quickbooks-invoices' } };
  if (email) want.email = email;
  var made = found[0] || await SC.customers.create(want, { idempotencyKey: key('omega-qbo-customer:' + (live ? 'live' : 'test') + ':' + org) });
  if (!made || !made.id || made.livemode !== live || (made.metadata || {}).omegaOrg !== org) throw A.httpError(409, 'Stripe did not confirm the customer; ClearSky reviews it');
  var FV = A.FieldValue();
  await ref.set({ stripeCustomerId: String(made.id), stripeLivemode: live, updatedAt: FV.serverTimestamp(), updatedBy: caller.email }, { merge: true });
  await ref.collection('history').add({ at: FV.serverTimestamp(), by: caller.email, changed: { stripeCustomerId: String(made.id), stripeLivemode: live }, was: { stripeCustomerId: null },
    reason: 'card payment of a QuickBooks invoice' });
  return String(made.id);
}

/* Pay one open invoice: the Stripe card page for exactly its open balance. */
async function pay(ctx, invoiceId) {
  var id = St.customerId(invoiceId);
  if (!id) throw A.httpError(400, 'invoiceId must be the QuickBooks invoice id');
  if (!ctx.stripe.pay) throw A.httpError(409, 'Card payment through Stripe is not switched on for this workspace yet; pay on the invoice QuickBooks emailed, or ask ClearSky');
  if (!(await A.isTenantAdmin(ctx.caller, ctx.orgId))) throw A.httpError(403, 'An owner or administrator pays the workspace’s invoices');
  var inv = ((await ctx.read('invoice/' + encodeURIComponent(id))) || {}).Invoice;
  if (!inv || String(inv.Id) !== id || String((inv.CustomerRef || {}).value) !== ctx.bound.customerId) throw A.httpError(404, 'That invoice is not one of this workspace’s');
  var r = St.row(inv, today());
  if (r.state !== 'open' && r.state !== 'overdue') throw A.httpError(409, 'Invoice ' + r.number + ' has nothing left to pay');
  var SC = ctx.stripe.client, live = ctx.stripe.live;
  var org = await A.db().collection('omega_orgs').doc(ctx.orgId).get();
  var name = (org.exists && org.data().name) || ctx.bound.name || ctx.orgId;
  var email = inv.BillEmail && inv.BillEmail.Address ? String(inv.BillEmail.Address) : null;
  var customer = await stripeCustomer(SC, live, ctx.ref, ctx.bill, ctx.orgId, name, email, ctx.caller);
  var seen = await cards(SC, customer, live), mine = seen.rows.filter(function (s) { return St.isCard(s, id, live); });
  /* paid by card already, for this balance: never a second payment */
  var after = St.withStripe({ invoices: [r], lastPayment: null }, seen.rows, seen.refunded, live).invoices[0];
  if (after.paidVia === 'stripe') return { orgId: ctx.orgId, invoiceId: id, number: r.number, paid: true, paidOn: after.paidOn };
  var ready = mine.filter(function (s) { return s.status === 'open' && Number(s.amount_due) === r.balanceCents && St.stripeLink(s.hosted_invoice_url); })[0];
  if (ready) return { orgId: ctx.orgId, invoiceId: id, number: r.number, url: St.stripeLink(ready.hosted_invoice_url), stripeInvoiceId: String(ready.id) };
  /* a card page for a balance QuickBooks no longer has (a part payment recorded there) is withdrawn, never paid */
  var stale = mine.filter(function (s) { return s.status === 'open' && Number(s.amount_due) !== r.balanceCents; });
  for (var i = 0; i < stale.length; i++) await SC.invoices.voidInvoice(stale[i].id, {}, { idempotencyKey: key('omega-qbo-void:' + stale[i].id) });
  var plan = St.cardInvoice(ctx.orgId, ctx.bound.realmId, r, customer);
  var draft = mine.filter(function (s) { return s.status === 'draft' && (s.metadata || {}).omegaQboBalanceCents === plan.meta.omegaQboBalanceCents; })[0];
  /* the key names every card page this invoice has had, so a retry replays the create and a
     new page after a refund or a withdrawn one is a new create, never a replay of the old */
  var before = mine.filter(function (s) { return s.status !== 'draft'; }).length;
  if (!draft) draft = await SC.invoices.create(plan.invoice, { idempotencyKey: key('omega-qbo-invoice:' + (live ? 'live' : 'test') + ':' + ctx.bound.realmId + ':' + id + ':' + r.balanceCents + ':' + before) });
  if (!draft || draft.livemode !== live || String(draft.customer) !== customer) throw A.httpError(409, 'Stripe did not confirm the card page; ClearSky reviews it');
  if (draft.status === 'draft') {
    var lines = ((await SC.invoices.listLineItems(draft.id, { limit: 10 })) || {}).data || [];
    if (!lines.length) await SC.invoiceItems.create(Object.assign({ invoice: draft.id }, plan.item), { idempotencyKey: key('omega-qbo-line:' + draft.id) });
    draft = await SC.invoices.finalizeInvoice(draft.id, { auto_advance: false }, { idempotencyKey: key('omega-qbo-finalize:' + draft.id) });
  }
  var url = St.stripeLink(draft.hosted_invoice_url);
  if (draft.status !== 'open' || Number(draft.amount_due) !== r.balanceCents || String(draft.currency || '').toLowerCase() !== 'usd' || (draft.metadata || {}).omegaQboInvoice !== id || !url) {
    throw A.httpError(409, 'Stripe’s card page for invoice ' + r.number + ' does not match QuickBooks; ClearSky reviews it');
  }
  return { orgId: ctx.orgId, invoiceId: id, number: r.number, url: url, stripeInvoiceId: String(draft.id) };
}

module.exports = A.handler(async function (req, res) {
  res.setHeader('Cache-Control', 'private, no-store');
  if (req.method !== 'POST') throw A.httpError(405, 'POST only');
  var b = req.body || {}, caller = await A.authenticate(req);
  var orgId = A.safeOrg(b.orgId || caller.orgId);
  if (!orgId) throw A.httpError(400, 'Valid organization required');
  if (!caller.staff) {
    if (!caller.claims || caller.claims.email_verified !== true) throw A.httpError(403, 'Verified email required');
    if (orgId !== caller.orgId) throw A.httpError(403, 'Own organization required');
  }
  if (b.action !== undefined && b.action !== 'pay') throw A.httpError(400, 'action must be pay, or left out for the statement');
  var ref = A.db().collection('omega_orgs').doc(orgId).collection('billing').doc('current');
  var snap = await ref.get(), bill = snap.exists ? snap.data() : {};
  if (bill.packaged === true) {
    if (b.action) throw A.httpError(409, 'A subscription package pays its invoices from its own billing summary');
    return { connected: false, orgId: orgId, packaged: true, invoices: [], note: 'A subscription package lists its invoices in its own billing summary.' };
  }
  var bound = St.binding(bill);
  if (!bound) {
    if (b.action) throw A.httpError(409, 'No QuickBooks customer is bound to this workspace yet');
    return { connected: false, orgId: orgId, invoices: [], note: 'No QuickBooks customer is bound to this workspace yet.' };
  }

  var Q = require('./_lib/qbo'), S = require('./_lib/qbo-sales');
  var auth = await Q.accessToken();
  if (String(auth.realmId) !== bound.realmId) throw A.httpError(409, 'This workspace is bound to a QuickBooks company that is not the one connected; ClearSky reviews the binding');
  function read(path) { return S.request(path, null, null, bound.realmId); }
  var stripe = stripeSide(Q.ENV);
  var ctx = { caller: caller, orgId: orgId, bill: bill, bound: bound, ref: ref, read: read, stripe: stripe };
  if (b.action === 'pay') return pay(ctx, b.invoiceId);

  var n = St.limit(b.limit);
  var invoices = ((await read('query?query=' + encodeURIComponent(St.invoiceSql(bound.customerId, n)) + '&include=invoiceLink')).QueryResponse || {}).Invoice || [];
  var payments = ((await read('query?query=' + encodeURIComponent(St.paymentSql(bound.customerId, n)))).QueryResponse || {}).Payment || [];
  var st = St.statement(bound.customerId, invoices, payments, today());
  /* what was paid by card on Stripe's page, and the card pages already open */
  if (stripe.read && bill.stripeCustomerId) {
    var seen = await cards(stripe.client, bill.stripeCustomerId, stripe.live);
    st = St.withStripe(st, seen.rows, seen.refunded, stripe.live);
  }
  /* on the Stripe rail one door pays: Stripe's page (made on the press), never QuickBooks' own link beside it */
  if (stripe.pay) st.invoices.forEach(function (r) { if ((r.state === 'open' || r.state === 'overdue') && r.payVia !== 'stripe') r.payUrl = null; });
  /* A list answer may leave InvoiceLink off; with no card page of our own, an
     open invoice is read on its own for QuickBooks' pay link (a handful at
     most: nobody owes fifty invoices). */
  if (!stripe.pay) {
    var unlinked = st.invoices.filter(function (r) { return (r.state === 'open' || r.state === 'overdue') && !r.payUrl; }).slice(0, 5);
    for (var i = 0; i < unlinked.length; i++) {
      var one = ((await read('invoice/' + encodeURIComponent(unlinked[i].id) + '?include=invoiceLink')) || {}).Invoice;
      if (one && String(one.Id) === unlinked[i].id && String((one.CustomerRef || {}).value) === bound.customerId) unlinked[i].payUrl = St.payLink(one);
    }
  }
  return { connected: true, orgId: orgId, provider: 'quickbooks', payWith: stripe.pay ? 'Stripe' : 'QuickBooks', canPayByCard: stripe.pay,
    customer: { id: bound.customerId, name: st.customerName || bound.name }, stripeCustomer: !!(stripe.read && bill.stripeCustomerId),
    invoices: st.invoices, open: st.open, lastPayment: st.lastPayment };
});
/* tests and the render check hand in a Stripe double here */
module.exports.deps = null;
