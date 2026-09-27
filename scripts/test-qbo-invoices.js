#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-qbo-invoices.js — a legacy tier's statement from QuickBooks
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   api/_lib/qbo-statement.js (pure), api/qbo-invoices.js and the invoicedTo
   binding in api/tenant-billing.js, against the shared Firestore double with
   ClearSky's QuickBooks stood in for (api/_lib/qbo accessToken, api/_lib/
   qbo-sales request). No network, no credential.

   The case it was written for (2026-09-27): a workspace ClearSky invoices by
   hand from QuickBooks read "No billing account yet … Nothing is charged
   until then" while QuickBooks held an invoice 24 days overdue. The
   statement is QuickBooks' own, bound to one customer in one company, and
   the packaging engine never adopts that customer.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var assert = require('node:assert/strict');
var FD = require('./_lib/firestore-double'), DB = FD.DB, mock = FD.mock, SD = require('./_lib/stripe-double').StripeDouble;
/* the Stripe rail and key are the tests' to set, one test at a time */
function env(vars) { Object.keys(vars).forEach(function (k) { if (vars[k] == null) delete process.env[k]; else process.env[k] = vars[k]; }); }
env({ PACKAGING_PROVIDER: null, STRIPE_SECRET_KEY: null, PACKAGING_LIVE: null });

var db;
function httpError(s, m) { var e = new Error(m); e.status = s; return e; }
mock('../api/_lib/admin', { db: function () { return db; }, httpError: httpError, handler: function (f) { return f; }, authenticate: async function (r) { return r.caller; },
  safeOrg: function (v) { var s = String(v == null ? '' : v).trim().toLowerCase(); return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(s) ? s : ''; },
  isTenantAdmin: async function (c, o) { return c.staff || (c.orgId === o && c.tenantAdmin === true); },
  FieldValue: function () { return { serverTimestamp: function () { return 'TS'; } }; } });

/* ClearSky's QuickBooks company, as the endpoints reach it */
var REALM = '9130000000000000', QB = { realmId: REALM, down: false }, calls = [], INVOICES, PAYMENTS, SINGLE, CUSTOMERS;
var QBMOD = { ENV: 'sandbox', accessToken: async function () { calls.push('token'); if (QB.down) throw httpError(409, 'QuickBooks is not connected'); return { token: 't', realmId: QB.realmId }; } };
mock('../api/_lib/qbo', QBMOD);
mock('../api/_lib/qbo-sales', { request: async function (path, body, id, realm) {
  calls.push(path);
  assert.equal(body, null, 'a read never posts');
  if (String(realm) !== String(QB.realmId)) throw httpError(409, 'ClearSky QuickBooks company does not match this order');
  var q = /^query\?query=([^&]*)/.exec(path), sql = q ? decodeURIComponent(q[1]) : '';
  if (/ from Invoice /.test(sql)) return { QueryResponse: { Invoice: INVOICES } };
  if (/ from Payment /.test(sql)) return { QueryResponse: { Payment: PAYMENTS } };
  if (/ from Customer /.test(sql)) { var cid = /Id = '(\d+)'/.exec(sql)[1]; return { QueryResponse: { Customer: CUSTOMERS.filter(function (c) { return c.Id === cid; }) } }; }
  var one = /^invoice\/(\d+)(\?include=invoiceLink)?$/.exec(path);
  if (one) return { Invoice: SINGLE[one[1]] };
  throw new Error('unexpected QuickBooks call ' + path);
} });

var St = require('../api/_lib/qbo-statement'), D = require('../api/_lib/billing-driver');
var invoicesApi = require('../api/qbo-invoices'), billingApi = require('../api/tenant-billing');

var DAY = 86400000;
function iso(days) { return new Date(Date.now() + days * DAY).toISOString().slice(0, 10); }
var LINK = 'https://connect.intuit.com/portal/app/CommerceNetwork/view/scs-v1-fixture';
function fixtures(today) {
  var at = function (d) { return new Date(Date.parse(today + 'T00:00:00Z') + d * DAY).toISOString().slice(0, 10); };
  var who = { value: '8', name: 'Pat Example' };
  INVOICES = [
    { Id: '17', DocNumber: '1001258', TxnDate: at(-44), DueDate: at(-44), TotalAmt: 800, Balance: 0, CustomerRef: who, Line: [{ Description: 'SECRET LINE TEXT', Amount: 800 }] },
    { Id: '33', DocNumber: '1001263', TxnDate: at(-24), DueDate: at(-24), TotalAmt: 1299, Balance: 1299, CustomerRef: who, PrivateNote: 'tier 1 field', BillEmail: { Address: 'billing@harbor.example' }, Line: [{ Description: 'SECRET LINE TEXT', Amount: 1299 }] },
    { Id: '23', DocNumber: '1001259', TxnDate: at(-41), DueDate: at(-41), TotalAmt: 199.98, Balance: 0, CustomerRef: who },
    { Id: '99', DocNumber: '9999', TxnDate: at(-2), DueDate: at(-2), TotalAmt: 50, Balance: 50, CustomerRef: { value: '9', name: 'Somebody Else' }, InvoiceLink: LINK + '-other' }
  ];
  PAYMENTS = [
    { Id: 'p1', TxnDate: at(-43), TotalAmt: 800, CustomerRef: { value: '8' }, Line: [{ Amount: 800, LinkedTxn: [{ TxnId: '17', TxnType: 'Invoice' }] }] },
    { Id: 'p2', TxnDate: at(-40), TotalAmt: 199.98, CustomerRef: { value: '8' }, Line: [{ Amount: 199.98, LinkedTxn: [{ TxnId: '23', TxnType: 'Invoice' }] }] },
    { Id: 'p9', TxnDate: at(-1), TotalAmt: 50, CustomerRef: { value: '9' }, Line: [{ Amount: 50, LinkedTxn: [{ TxnId: '99', TxnType: 'Invoice' }] }] }
  ];
  SINGLE = { '33': Object.assign({}, INVOICES[1], { InvoiceLink: LINK }), '23': INVOICES[2], '99': INVOICES[3] };
  CUSTOMERS = [{ Id: '8', DisplayName: 'Pat Example', Active: true }, { Id: '7', DisplayName: 'Old Account', Active: false }];
}

var count = 0, failed = 0;
async function test(name, fn) {
  try { await fn(); count++; console.log('PASS ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name); console.log(e && e.stack || e); }
}
async function rejects(p, status, re) {
  try { await p; } catch (e) { assert.equal(e.status, status, e.message); if (re) assert.match(e.message, re); return e; }
  throw new Error('expected a ' + status);
}

var ORG = 'harbor.example', O = 'omega_orgs/' + ORG;
var BOUND = { provider: 'quickbooks', customerId: '8', realmId: REALM, name: 'Pat Example', boundAt: 1, boundBy: 'ops@clearsky-usa.com' };
var MEMBER = { uid: 'u1', email: 'lee@harbor.example', orgId: ORG, staff: false, claims: { email_verified: true } };
var STAFF = { uid: 's1', email: 'ops@clearsky-usa.com', orgId: 'clearsky-usa.com', staff: true, claims: { email_verified: true } };
function seed(bill) {
  db = new DB(); calls = []; QB.realmId = REALM; QB.down = false; QBMOD.ENV = 'sandbox'; fixtures(iso(0));
  db.seed(O, { name: 'Harbor Solar', status: 'active' });
  db.seed(O + '/billing/current', bill || { tier: 'standard', addons: ['engineering'], paymentProvider: 'quickbooks', invoicedTo: BOUND, amountDue: 1299, subscriptionDue: iso(-24), lastPaidAt: iso(-55), amountPaid: 1299 });
}
var res = { headers: {}, setHeader: function (k, v) { this.headers[k] = v; } };
function statement(caller, body) { return invoicesApi({ method: 'POST', body: body || {}, caller: caller || MEMBER }, res); }
function billing(body, caller) { return billingApi({ method: 'POST', body: Object.assign({ orgId: ORG }, body), caller: caller || STAFF }, res); }

(async function () {
  /* ── the pure statement ── */
  await test('statement: newest first, the other customer dropped, the open invoice overdue by its days, paid ones dated by their payment', async function () {
    fixtures('2026-09-27');
    var s = St.statement('8', INVOICES, PAYMENTS, '2026-09-27');
    assert.deepEqual(s.invoices.map(function (r) { return r.number; }), ['1001263', '1001259', '1001258']);
    var open = s.invoices[0];
    assert.equal(open.state, 'overdue'); assert.equal(open.daysOverdue, 24); assert.equal(open.dueDate, '2026-09-03');
    assert.equal(open.balance, '$1,299'); assert.equal(open.total, '$1,299'); assert.equal(open.partPaid, false); assert.equal(open.payUrl, null, 'no link in the list answer');
    assert.equal(s.invoices[1].state, 'paid'); assert.equal(s.invoices[1].total, '$199.98'); assert.equal(s.invoices[1].paidOn, '2026-08-18', 'paid the day after it was issued');
    assert.equal(s.invoices[2].paidOn, '2026-08-15');
    assert.deepEqual(s.open, { count: 1, overdue: 1, balanceCents: 129900, balance: '$1,299' });
    assert.deepEqual(s.lastPayment, { date: '2026-08-18', amountCents: 19998, amount: '$199.98' }, 'the last payment is the customer\'s own, not another customer\'s later one');
    assert.equal(s.customerName, 'Pat Example');
    assert(!JSON.stringify(s).includes('SECRET LINE TEXT'), 'a statement carries no invoice lines');
  });
  await test('statement: due today is open, not overdue; a part payment says so; a voided invoice is void, never paid', async function () {
    var who = { value: '8' };
    var s = St.statement('8', [
      { Id: '1', DocNumber: 'A', TxnDate: '2026-09-27', DueDate: '2026-09-27', TotalAmt: 100, Balance: 100, CustomerRef: who },
      { Id: '2', DocNumber: 'B', TxnDate: '2026-09-20', DueDate: '2026-10-20', TotalAmt: 1299, Balance: 500, CustomerRef: who },
      { Id: '3', DocNumber: 'C', TxnDate: '2026-09-10', DueDate: '2026-09-10', TotalAmt: 0, Balance: 0, PrivateNote: 'Voided', CustomerRef: who }
    ], [], '2026-09-27');
    assert.deepEqual(s.invoices.map(function (r) { return r.state; }), ['open', 'open', 'void']);
    assert.equal(s.invoices[0].daysOverdue, 0);
    assert.equal(s.invoices[1].partPaid, true); assert.equal(s.invoices[1].balance, '$500');
    assert.equal(s.open.balance, '$600'); assert.equal(s.open.overdue, 0); assert.equal(s.lastPayment, null);
  });
  await test('statement: a pay link is QuickBooks\' own page, and only on an invoice still open', async function () {
    var who = { value: '8' };
    var s = St.statement('8', [
      { Id: '1', DocNumber: 'A', TxnDate: '2026-09-01', DueDate: '2026-09-30', TotalAmt: 10, Balance: 10, CustomerRef: who, InvoiceLink: LINK },
      { Id: '2', DocNumber: 'B', TxnDate: '2026-09-02', DueDate: '2026-09-30', TotalAmt: 10, Balance: 10, CustomerRef: who, InvoiceLink: 'https://pay.example.com/intuit.com' },
      { Id: '3', DocNumber: 'C', TxnDate: '2026-09-03', DueDate: '2026-09-30', TotalAmt: 10, Balance: 0, CustomerRef: who, InvoiceLink: LINK }
    ], [], '2026-09-27');
    var by = {}; s.invoices.forEach(function (r) { by[r.number] = r.payUrl; });
    assert.deepEqual(by, { A: LINK, B: null, C: null });
  });
  await test('binding: only a QuickBooks customer number in a named company; the SQL can carry nothing else', async function () {
    assert.deepEqual(St.binding({ invoicedTo: BOUND }), { customerId: '8', realmId: REALM, name: 'Pat Example' });
    assert.equal(St.binding({ invoicedTo: Object.assign({}, BOUND, { provider: 'stripe' }) }), null);
    assert.equal(St.binding({ invoicedTo: Object.assign({}, BOUND, { customerId: "8' or Id > '0" }) }), null);
    assert.equal(St.binding({ invoicedTo: Object.assign({}, BOUND, { realmId: '' }) }), null, 'a binding without its company answers for nobody');
    assert.equal(St.binding({ qboCustomerId: '8' }), null, 'the engine\'s customer is not a legacy binding');
    assert.equal(St.customerId(' 8 '), '8'); assert.equal(St.customerId('8x'), null);
    assert.equal(St.invoiceSql('8', 500), "select * from Invoice where CustomerRef = '8' orderby TxnDate desc maxresults 50");
    assert.equal(St.paymentSql('8'), "select * from Payment where CustomerRef = '8' orderby TxnDate desc maxresults 24");
  });
  await test('the packaging engine never adopts the hand-made customer: its customer id stays its own (OMEGA-<org> is found or made)', async function () {
    var b = { tier: 'standard', paymentProvider: 'quickbooks', invoicedTo: BOUND };
    assert.equal(D.customerId(b, 'quickbooks'), null);
    assert.equal(D.bound(b, 'quickbooks', { qbo: { realmId: REALM } }), false);
  });

  /* ── POST /api/qbo-invoices ── */
  await test('a member reads the workspace\'s own statement: the overdue invoice with its pay page, the paid ones, the last payment', async function () {
    seed();
    var out = await statement();
    assert.equal(out.connected, true); assert.equal(out.orgId, ORG); assert.equal(out.payWith, 'QuickBooks');
    assert.deepEqual(out.customer, { id: '8', name: 'Pat Example' });
    assert.deepEqual(out.invoices.map(function (r) { return r.number + ':' + r.state; }), ['1001263:overdue', '1001259:paid', '1001258:paid']);
    assert.equal(out.invoices[0].daysOverdue, 24);
    assert.equal(out.invoices[0].payUrl, LINK, 'read from the invoice itself when the list left it off');
    assert.deepEqual(out.open, { count: 1, overdue: 1, balanceCents: 129900, balance: '$1,299' });
    assert.equal(out.lastPayment.amount, '$199.98');
    assert.equal(res.headers['Cache-Control'], 'private, no-store');
    var q = calls.filter(function (c) { return /^query/.test(c); }).map(decodeURIComponent);
    assert(q[0].indexOf("from Invoice where CustomerRef = '8'") > 0 && /&include=invoiceLink$/.test(q[0]), q[0]);
    assert(q[1].indexOf("from Payment where CustomerRef = '8'") > 0, q[1]);
    assert.deepEqual(calls.filter(function (c) { return /^invoice\//.test(c); }), ['invoice/33?include=invoiceLink'], 'only the open invoice is read on its own');
    assert(!JSON.stringify(out).includes('SECRET LINE TEXT') && !JSON.stringify(out).includes('Somebody Else'), 'no lines, no other customer');
  });
  await test('a pay link that is not QuickBooks\' own page is dropped', async function () {
    seed(); SINGLE['33'].InvoiceLink = 'https://intuit.com.pay.example/x';
    var out = await statement();
    assert.equal(out.invoices[0].payUrl, null);
  });
  await test('staff read any workspace; a member of another, or an unverified address, reads none and QuickBooks is never asked', async function () {
    seed();
    assert.equal((await statement(STAFF, { orgId: ORG })).connected, true);
    calls = [];
    await rejects(statement(MEMBER, { orgId: 'other.example' }), 403, /Own organization/);
    await rejects(statement(Object.assign({}, MEMBER, { claims: { email_verified: false } })), 403, /Verified email/);
    assert.deepEqual(calls, []);
    await rejects(invoicesApi({ method: 'GET', query: {}, caller: MEMBER }, res), 405);
  });
  await test('nothing bound, or a package: not connected, and QuickBooks is never asked', async function () {
    seed({ tier: 'standard', paymentProvider: 'manual', amountDue: 1299 });
    var out = await statement();
    assert.equal(out.connected, false); assert.deepEqual(out.invoices, []); assert.match(out.note, /No QuickBooks customer/);
    seed({ packaged: true, qboCustomerId: '44', qboRealmId: REALM, invoicedTo: BOUND });
    out = await statement();
    assert.equal(out.connected, false); assert.equal(out.packaged, true);
    assert.deepEqual(calls, []);
  });
  await test('a binding made in another QuickBooks company is refused before anything is read; an unreachable QuickBooks is an error, not "nothing owed"', async function () {
    seed(); QB.realmId = '4620816365000000';
    await rejects(statement(), 409, /not the one connected/);
    assert.deepEqual(calls, ['token'], 'no query ran against the wrong company');
    seed(); QB.down = true;
    await rejects(statement(), 409, /not connected/);
  });

  /* ── the binding, through /api/tenant-billing ── */
  await test('staff bind the QuickBooks customer: confirmed in QuickBooks, the company and the name kept, billed through QuickBooks, audited', async function () {
    seed({ tier: 'standard', paymentProvider: 'manual', amountDue: 1299, subscriptionDue: '2026-09-03' });
    var out = await billing({ invoicedTo: { provider: 'quickbooks', customerId: ' 8 ' } });
    var b = db.data.get(O + '/billing/current');
    assert.equal(b.invoicedTo.provider, 'quickbooks'); assert.equal(b.invoicedTo.customerId, '8'); assert.equal(b.invoicedTo.realmId, REALM);
    assert.equal(b.invoicedTo.name, 'Pat Example'); assert.equal(b.invoicedTo.boundBy, STAFF.email); assert.equal(typeof b.invoicedTo.boundAt, 'number');
    assert.equal(b.paymentProvider, 'quickbooks'); assert.equal(b.amountDue, 1299, 'nothing else on the record moves');
    assert.equal(b.qboCustomerId, undefined, 'the engine\'s own customer field is untouched');
    assert.equal(out.invoicedTo.name, 'Pat Example');
    var hist = Array.from(db.data.keys()).filter(function (k) { return k.indexOf(O + '/billing/current/history/') === 0; }).map(function (k) { return db.data.get(k); });
    assert.equal(hist.length, 1); assert.equal(hist[0].was.invoicedTo, null); assert.equal(hist[0].was.paymentProvider, 'manual'); assert.equal(hist[0].changed.invoicedTo.customerId, '8');
    assert(calls.some(function (c) { return /from Customer where Id = '8'/.test(decodeURIComponent(c)); }));
  });
  await test('a number QuickBooks does not have, an inactive customer, or not a number: refused and nothing written', async function () {
    var before = { tier: 'standard', paymentProvider: 'manual' };
    seed(before);
    await rejects(billing({ invoicedTo: { provider: 'quickbooks', customerId: '12345' } }), 404, /no customer 12345/);
    await rejects(billing({ invoicedTo: { provider: 'quickbooks', customerId: '7' } }), 409, /inactive/);
    calls = [];
    await rejects(billing({ invoicedTo: { provider: 'quickbooks', customerId: "8' or '1'='1" } }), 400, /digits/);
    await rejects(billing({ invoicedTo: { provider: 'stripe', customerId: '8' } }), 400);
    await rejects(billing({ invoicedTo: '8' }), 400);
    assert.deepEqual(calls, [], 'a malformed binding never reaches QuickBooks');
    assert.deepEqual(db.data.get(O + '/billing/current'), before);
  });
  await test('a packaged workspace cannot be bound, and QuickBooks is not asked; a non-staff caller is refused', async function () {
    seed({ packaged: true, qboCustomerId: '44' });
    await rejects(billing({ invoicedTo: { provider: 'quickbooks', customerId: '8' } }), 409, /Package panel/);
    assert.deepEqual(calls, []);
    seed({ tier: 'standard' });
    await rejects(billing({ invoicedTo: { provider: 'quickbooks', customerId: '8' } }, MEMBER), 403);
  });
  await test('unbinding needs no QuickBooks; a provider named in the same request is kept', async function () {
    seed();
    await billing({ invoicedTo: null });
    var b = db.data.get(O + '/billing/current');
    assert.equal(b.invoicedTo, null); assert.equal(b.paymentProvider, 'quickbooks', 'unbinding does not guess a provider');
    assert.deepEqual(calls, []);
    seed({ tier: 'standard', paymentProvider: 'stripe' });
    await billing({ invoicedTo: { provider: 'quickbooks', customerId: '8' }, paymentProvider: 'manual' });
    assert.equal(db.data.get(O + '/billing/current').paymentProvider, 'manual');
  });

  /* ── paying by card, on the Stripe rail (Tommy: "like any payment page", with the Stripe and QuickBooks accounts) ── */
  var stripe, ADMIN = Object.assign({}, MEMBER, { uid: 'u2', email: 'ana@harbor.example', tenantAdmin: true });
  function useStripe(live) { stripe = new SD({ livemode: !!live }); invoicesApi.deps = { stripe: stripe }; }
  function payCall(caller, id) { return statement(caller || ADMIN, { action: 'pay', invoiceId: id || '33' }); }
  function cardInvoices() { return stripe.all('invoices').filter(function (i) { return i.metadata && i.metadata.omegaQboInvoice; }); }
  env({ PACKAGING_PROVIDER: 'stripe', STRIPE_SECRET_KEY: 'sk_test_double' });

  var first;
  await test('Pay makes the workspace\'s Stripe customer and ONE Stripe page for the open balance: nothing emailed, nothing charged here', async function () {
    seed(); useStripe(false);
    first = await payCall();
    assert.match(first.url, /^https:\/\/invoice\.stripe\.com\//); assert.equal(first.number, '1001263');
    var b = db.data.get(O + '/billing/current');
    assert(/^cus_/.test(b.stripeCustomerId)); assert.equal(b.stripeLivemode, false);
    assert.equal(b.paymentProvider, 'quickbooks'); assert.deepEqual(b.invoicedTo, BOUND, 'still invoiced in QuickBooks');
    var hist = Array.from(db.data.keys()).filter(function (k) { return k.indexOf(O + '/billing/current/history/') === 0; }).map(function (k) { return db.data.get(k); });
    assert.equal(hist.length, 1); assert.equal(hist[0].changed.stripeCustomerId, b.stripeCustomerId); assert.match(hist[0].reason, /QuickBooks invoice/);
    var cust = stripe.all('customers');
    assert.equal(cust.length, 1); assert.equal(cust[0].metadata.omegaOrg, ORG); assert.equal(cust[0].email, 'billing@harbor.example', 'the address QuickBooks bills'); assert.equal(cust[0].name, 'Harbor Solar');
    var inv = cardInvoices();
    assert.equal(inv.length, 1); assert.equal(inv[0].status, 'open'); assert.equal(inv[0].total, 129900); assert.equal(inv[0].collection_method, 'send_invoice');
    assert.equal(inv[0].metadata.omegaQboInvoice, '33'); assert.equal(inv[0].metadata.omegaQboBalanceCents, '129900'); assert.equal(inv[0].metadata.omegaPackage, undefined, 'never a package invoice');
    assert.deepEqual(stripe.sent, [], 'the customer is on the page: no invoice email from Stripe');
    assert.deepEqual(stripe.all('charges'), []);
    assert.equal(require('../api/_lib/stripe-billing').eventOrg({ type: 'invoice.paid', data: { object: Object.assign({ object: 'invoice' }, inv[0]) } }), null, 'the webhook\'s package reconcile never takes it');
  });
  await test('Pay again: the same page, never a second invoice or customer', async function () {
    var again = await payCall();
    assert.equal(again.url, first.url); assert.equal(cardInvoices().length, 1); assert.equal(stripe.all('customers').length, 1);
  });
  await test('the statement on the Stripe rail: Pay is Stripe\'s page, QuickBooks\' own link is not offered beside it, the portal can keep the card', async function () {
    INVOICES[1].InvoiceLink = LINK; calls = [];
    var out = await statement();
    assert.equal(out.canPayByCard, true); assert.equal(out.payWith, 'Stripe'); assert.equal(out.stripeCustomer, true);
    assert.equal(out.invoices[0].payUrl, first.url); assert.equal(out.invoices[0].payVia, 'stripe'); assert.equal(out.invoices[0].state, 'overdue');
    assert(!calls.some(function (c) { return /^invoice\//.test(c); }), 'no QuickBooks pay link is fetched on the Stripe rail');
    seed(); useStripe(false); INVOICES[1].InvoiceLink = LINK;
    out = await statement();
    assert.equal(out.invoices[0].payUrl, null, 'before any Stripe page: a Pay button, not QuickBooks\' link'); assert.equal(out.stripeCustomer, false);
  });
  await test('paid on Stripe\'s page: paid here at once, "being recorded in QuickBooks", the last payment, and Pay never charges twice', async function () {
    seed(); useStripe(false);
    first = await payCall(); stripe.pay(cardInvoices()[0].id);
    var out = await statement(), row = out.invoices[0];
    assert.equal(row.state, 'paid'); assert.equal(row.paidVia, 'stripe'); assert.equal(row.booked, false); assert.equal(row.paidOn, iso(0)); assert.equal(row.payUrl, null);
    assert.deepEqual(out.open, { count: 0, overdue: 0, balanceCents: 0, balance: '$0' });
    assert.equal(out.lastPayment.amount, '$1,299'); assert.equal(out.lastPayment.via, 'stripe');
    var again = await payCall();
    assert.equal(again.paid, true); assert.equal(again.url, undefined); assert.equal(cardInvoices().length, 1);
    /* the books apply it: QuickBooks reads paid, and the card is still named */
    INVOICES[1].Balance = 0; SINGLE['33'].Balance = 0;
    row = (await statement()).invoices[0];
    assert.equal(row.state, 'paid'); assert.equal(row.paidVia, 'stripe'); assert.equal(row.booked, true);
  });
  await test('refunded: owed again, and Pay opens a NEW page (never a replay of the refunded one)', async function () {
    seed(); useStripe(false);
    await payCall(); var paidId = cardInvoices()[0].id; stripe.pay(paidId); stripe.refund(paidId);
    var out = await statement();
    assert.equal(out.invoices[0].state, 'overdue'); assert.equal(out.open.count, 1);
    var fresh = await payCall();
    assert.match(fresh.url, /^https:\/\/invoice\.stripe\.com\//); assert.notEqual(fresh.stripeInvoiceId, paidId);
    assert.equal(cardInvoices().filter(function (i) { return i.status === 'open'; }).length, 1);
  });
  await test('a balance QuickBooks changed (a part payment recorded there): the old page is withdrawn, the new one is for what is left', async function () {
    seed(); useStripe(false);
    await payCall(); var old = cardInvoices()[0].id;
    INVOICES[1].Balance = 500; SINGLE['33'].Balance = 500;
    var out = await payCall();
    var inv = cardInvoices(), now = inv.filter(function (i) { return i.id === out.stripeInvoiceId; })[0];
    assert.equal(inv.filter(function (i) { return i.id === old; })[0].status, 'void');
    assert.equal(now.total, 50000); assert.equal(now.metadata.omegaQboBalanceCents, '50000');
  });
  await test('off the Stripe rail: Pay is refused and QuickBooks\' own page is the link; a card payment already made still reads paid', async function () {
    seed(); useStripe(false);
    await payCall(); stripe.pay(cardInvoices()[0].id);
    env({ PACKAGING_PROVIDER: null });
    await rejects(payCall(), 409, /not switched on/);
    var out = await statement();
    assert.equal(out.canPayByCard, false); assert.equal(out.payWith, 'QuickBooks');
    assert.equal(out.invoices[0].state, 'paid', 'the money Stripe took is not forgotten when the rail changes');
    env({ PACKAGING_PROVIDER: 'stripe' });
  });
  await test('a test key never reads or pays for a production QuickBooks company, nor a live key for the sandbox', async function () {
    seed(); useStripe(false); QBMOD.ENV = 'production';
    var out = await statement();
    assert.equal(out.canPayByCard, false); assert.deepEqual(stripe.calls, []);
    await rejects(payCall(), 409, /not switched on/);
    seed(); useStripe(true); env({ STRIPE_SECRET_KEY: 'sk_live_double' });
    out = await statement();
    assert.equal(out.canPayByCard, false); assert.deepEqual(stripe.calls, []);
    env({ STRIPE_SECRET_KEY: 'sk_test_double' });
  });
  await test('a member reads but does not open a card page; staff may; only the workspace\'s own open invoice can be paid', async function () {
    seed(); useStripe(false);
    await rejects(payCall(MEMBER), 403, /owner or administrator/);
    assert.deepEqual(stripe.calls, []);
    assert.match((await statement(STAFF, { orgId: ORG, action: 'pay', invoiceId: '33' })).url, /^https:\/\/invoice\.stripe\.com\//);
    await rejects(payCall(ADMIN, '23'), 409, /nothing left to pay/);
    await rejects(payCall(ADMIN, '99'), 404, /not one of this workspace/);
    await rejects(payCall(ADMIN, 'abc'), 400);
    await rejects(statement(ADMIN, { action: 'refund' }), 400);
    seed({ tier: 'standard', paymentProvider: 'manual' });
    await rejects(payCall(), 409, /No QuickBooks customer/);
  });
  await test('the webhook records the payment date and leaves what QuickBooks owns alone; the tier branch never sees it', async function () {
    var Hook = require('../api/stripe-webhook'), src = require('fs').readFileSync(require('path').join(__dirname, '../api/stripe-webhook.js'), 'utf8');
    var at = src.indexOf('var qbo = qboInvoiceEvent(evt)');
    assert(at > src.indexOf('StripeBilling.eventOrg(evt)') && at > src.indexOf('constructEvent(') && at < src.indexOf('CustomerLite.webhook(evt'), 'after the signature and the package branch, before every other');
    seed(); useStripe(false);
    await payCall(); var inv = cardInvoices()[0]; stripe.pay(inv.id);
    var before = db.data.get(O + '/billing/current');
    var r = await Hook.qboInvoiceEvent(stripe.event('invoice.paid', inv.id));
    var b = db.data.get(O + '/billing/current');
    assert.equal(r.paid, true); assert.equal(r.qboInvoice, '33');
    assert.equal(b.lastPaidAt, new Date(1790000000 * 1000).toISOString()); assert.equal(b.lastStripeEvent, 'invoice.paid');
    assert.equal(b.amountDue, before.amountDue); assert.equal(b.subscriptionDue, before.subscriptionDue); assert.equal(b.tier, before.tier);
    var other = stripe.event('invoice.paid', inv.id); other.data.object.customer = 'cus_someone_else';
    db.seed(O + '/billing/current', before);
    assert.match((await Hook.qboInvoiceEvent(other)).ignored, /not this workspace/);
    assert.deepEqual(db.data.get(O + '/billing/current'), before, 'a customer that is not the workspace\'s writes nothing');
    assert.match((await Hook.qboInvoiceEvent(stripe.event('invoice.finalized', inv.id))).ignored, /finalized/);
    assert.equal(Hook.qboInvoiceEvent({ type: 'invoice.paid', data: { object: { object: 'invoice', metadata: {} } } }), null, 'anything else falls through to the branches below');
  });
  invoicesApi.deps = null; env({ PACKAGING_PROVIDER: null, STRIPE_SECRET_KEY: null });

  console.log(count + ' passed, ' + failed + ' failed');
  if (failed) process.exit(1);
})().catch(function (e) { console.error(e); process.exit(1); });
