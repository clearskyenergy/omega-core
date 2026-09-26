/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert = require('assert'), R = require('../api/_lib/proration'), BP = require('../api/_lib/billing-profile');
var B = require('../api/_lib/pricebook'), QB = require('../api/_lib/qbo-billing'), Policy = require('../api/_lib/package-billing-policy'), count = 0;
function equal(a, b) { assert.deepStrictEqual(a, b); count++; }
function rejects(fn, re) { assert.throws(fn, re); count++; }
async function refused(fn, re) { await assert.rejects(fn, re); count++; }
var profile = { legalName: 'Example Energy LLC', contactName: 'Alex Example', email: 'ap@example.test', phone: '555-0100',
  address: { line1: '100 Test Ave', city: 'Chicago', state: 'IL', postalCode: '60601', country: 'US' }, vertical: 'developer', teamSize: 4 };
async function run() {
  equal(R.cycle('2026-02-28', 31), { start: '2026-02-28', end: '2026-03-31', days: 31, remainingDays: 31 });
  equal(R.cycle('2024-02-28', 31), { start: '2024-01-31', end: '2024-02-29', days: 29, remainingDays: 1 });
  equal(R.amount(50000, '2024-02-28', 31).amountCents, 1724);
  equal(R.amount(50000, '2026-01-16', 1).amountCents, 25806);
  equal(R.amount(129900, '2026-12-31', 31).end, '2027-01-31');
  equal(R.businessDays('2026-09-25', 10), '2026-10-09');
  ['2026-02-29', '2024-02-30', '2026-13-01', '2026-1-1', ''].forEach(function (d) { rejects(function () { R.cycle(d, 1); }, /date/i); });
  [0, 32, 1.5, '1', null].forEach(function (d) { rejects(function () { R.cycle('2026-01-01', d); }, /Billing day/); });
  [-1, 0.1, NaN, Infinity].forEach(function (v) { rejects(function () { R.amount(v, '2026-01-01', 1); }, /cents/); });
  equal(BP.normalize(profile).address.line2, '');
  equal(BP.customer(profile, 'example.test').DisplayName, 'OMEGA-example.test');
  equal(BP.customer(profile, 'example.test').PrimaryEmailAddr.Address, 'ap@example.test');
  ['legalName', 'contactName', 'email', 'phone', 'address', 'vertical', 'teamSize'].forEach(function (k) {
    var p = JSON.parse(JSON.stringify(profile)); delete p[k]; rejects(function () { BP.normalize(p); }, /required|Invalid/);
  });
  rejects(function () { BP.normalize(Object.assign({}, profile, { cardNumber: 'test' })); }, /Unsupported/);
  rejects(function () { BP.normalize(Object.assign({}, profile, { poRequired: true })); }, /required|Invalid/);
  rejects(function () { BP.normalize(Object.assign({}, profile, { website: 'javascript:alert(1)' })); }, /http/);
  var proposed = B.proposed(), now = Date.parse('2026-01-10T00:00:00Z');
  var selected = Policy.terms({ modules: ['lite'], serviceFee: { mode: 'waived', reason: 'Sandbox trial' } }, proposed, now);
  var org = { status: 'pending', signedUpAt: '2026-01-01T00:00:00Z' };
  var approved = Policy.approve(org, {}, selected, proposed, now, 999);
  equal(approved.trialEndsAt - approved.trialStartedAt, 14 * R.DAY);
  equal(approved.billingDay, 1);
  equal(approved.nextInvoiceOn, '2026-01-24');
  rejects(function () { Policy.approve(org, approved, selected, proposed, now); }, /already used/);
  rejects(function () { Policy.approve(Object.assign({}, org, { packagingTrialUsedAt: now }), {}, selected, proposed, now); }, /already used/);
  rejects(function () { Policy.approve(org, { trialEndsAt: '2027-01-01' }, selected, proposed, now); }, /preserved/);
  rejects(function () { Policy.approve(Object.assign({}, org, { status: 'active' }), {}, selected, proposed, now); }, /pending/);
  [-1, NaN, Infinity, 1.5].forEach(function (d) { rejects(function () { Policy.trialDays(proposed, d); }, /configuration/); });
  var first = Policy.invoice(approved, proposed, '2026-01-24');
  equal(first.subtotalCents, 12903);
  equal(first.nextInvoiceOn, '2026-02-01');
  equal(first.lines.some(function (l) { return l.itemKey === 'service-fee'; }), false);
  var recurring = Object.assign({}, approved, { firstInvoiceOn: first.date, nextInvoiceOn: first.nextInvoiceOn, serviceFeeNextOn: first.serviceFeeNextOn });
  equal(Policy.invoice(recurring, proposed, '2026-02-01').subtotalCents, 50000);
  recurring.nextInvoiceOn = '2027-02-01';
  equal(Policy.invoice(recurring, proposed, '2027-02-01').subtotalCents, 200000); // first-year waiver ends
  var annual = Object.assign({}, recurring, { interval: 'annual', nextInvoiceOn: '2026-02-01' });
  equal(Policy.invoice(annual, proposed, '2026-02-01').subtotalCents, 500000); /* ten months of twelve (2026-09-26) */
  equal(Policy.invoice(annual, proposed, '2026-02-01').nextInvoiceOn, '2027-02-01');
  rejects(function () { Policy.terms({ modules: ['lite'], interval: 'annual', credit: true }, proposed, now); }, /excludes the transformation credit/);
  // What is billed is the subscription record (what they bought), never the grant.
  var discounted = Object.assign({}, recurring, { modules: ['lite'], subscription: { modules: ['lite', 'storage'], plan: 'alacarte' }, plan: 'alacarte', nextInvoiceOn: '2026-02-01',
    credit: { pct: 40, startsAt: '2026-01-01T00:00:00Z', endsAt: '2026-02-15T00:00:00Z' } });
  equal(Policy.invoice(discounted, proposed, '2026-02-01').subtotalCents, 60000); // credit only for 14 of 28 days
  discounted.subscription = { modules: ['lite'], plan: 'alacarte' };
  equal(Policy.invoice(discounted, proposed, '2026-02-01').subtotalCents, 50000); // floor unaffected by credit
  var book = B.proposed(); book.qbo.realmId = '123'; book.qbo.items = { 'module:lite': '1', credit: '2' };
  var requests = [], storedCustomer, storedInvoice, payment;
  var deps = { Q: { ENV: 'sandbox', IS_SANDBOX: true, API_BASE: 'https://sandbox-quickbooks.api.intuit.com', load: async function () { return { env: 'sandbox', realmId: '123' }; } },
    request: async function (path, body, id, realm) {
      requests.push({ path: path, body: body, id: id, realm: realm });
      if (path.indexOf('query?') === 0) return { QueryResponse: decodeURIComponent(path).indexOf('Customer') >= 0 ? { Customer: storedCustomer ? [storedCustomer] : [] } : { Invoice: storedInvoice ? [storedInvoice] : [] } };
      if (path === 'customer') { storedCustomer = Object.assign({}, body, { Id: 'C1', SyncToken: '1' }); return { Customer: storedCustomer }; }
      if (path === 'customer/C1') return { Customer: storedCustomer };
      if (path === 'item/1') return { Item: { Id: '1', Active: true, Taxable: true } };
      if (path === 'invoice') {
        storedInvoice = Object.assign({}, body, { Id: 'I1', TotalAmt: 550, Balance: 550, InvoiceLink: 'https://connect.intuit.com/pay/test' }); return { Invoice: storedInvoice };
      }
      if (path.indexOf('invoice/I1') === 0) return { Invoice: storedInvoice };
      if (path === 'payment/P1') return { Payment: payment };
      throw new Error('Unexpected QBO path ' + path);
    } };
  var q = QB.driver(book, deps), p = BP.normalize(profile);
  equal(await q.customer('example.test', p), 'C1');
  equal(await q.customer('example.test', p), 'C1');
  equal(requests.filter(function (r) { return r.path === 'customer'; }).length, 1);
  var changedProfile = Object.assign({}, p, { website: 'https://example.test', resaleNumber: 'CERT-1' });
  await q.customer('example.test', changedProfile, 'C1');
  equal(storedCustomer.WebAddr.URI, 'https://example.test');
  await q.customer('example.test', p, 'C1');
  equal(storedCustomer.WebAddr, null); equal(storedCustomer.ResaleNum, null);
  var customerIds = requests.filter(function (r) { return r.path === 'customer'; }).map(function (r) { return r.id; });
  equal(new Set(customerIds).size, 3); // profile A → B → A must not replay creation
  equal(require('../api/_lib/subscription-pricing').dollarInput('4250.50'), 425050);
  rejects(function () { require('../api/_lib/subscription-pricing').dollarInput('1e3'); }, /dollar amount/);
  rejects(function () { require('../api/_lib/subscription-pricing').dollarInput('0.001'); }, /dollar amount/);
  equal(R.addYears('2024-02-29', 1), '2025-02-28');
  equal(R.addYears('2024-02-29', 4), '2028-02-29');
  var plan = { marker: 'OMEGA subscription example.test / 2026-10-01', date: '2026-10-01', period: { start: '2026-10-01', end: '2026-11-01' }, lines: [{ itemKey: 'module:lite', name: 'Lite', amountCents: 50000 }] };
  var issued = await q.invoice(plan, p, 'C1');
  equal(issued.totalCents, 55000); // QuickBooks owns tax; the app does not assume $500 total.
  equal(await q.invoice(plan, p, 'C1'), issued);
  equal(requests.filter(function (r) { return r.path === 'invoice'; }).length, 1);
  equal(storedInvoice.Line[0].SalesItemLineDetail.TaxCodeRef.value, 'TAX');
  var record = Object.assign({}, plan, { qboInvoiceId: 'I1', qboCustomerId: 'C1', totalCents: issued.totalCents });
  storedInvoice.Balance = 0;
  equal((await q.reconcile(record)).satisfied, false); // zero balance/webhook alone cannot grant
  payment = { Id: 'P1', CustomerRef: { value: 'C1' }, TotalAmt: 550, Line: [{ Amount: 550, LinkedTxn: [{ TxnType: 'Invoice', TxnId: 'I1' }] }] };
  storedInvoice.LinkedTxn = [{ TxnType: 'Payment', TxnId: 'P1' }];
  equal((await q.reconcile(record)).satisfied, true);
  payment.TotalAmt = 0; payment.Line = [];
  equal((await q.reconcile(record)).satisfied, false);
  storedInvoice.PrivateNote = 'Voided ' + plan.marker; storedInvoice.TotalAmt = 0;
  equal((await q.reconcile(record)).reversed, true);
  storedInvoice.PrivateNote = plan.marker; storedInvoice.TotalAmt = 550;
  storedInvoice.Line[0].Amount = 501;
  await refused(function () { return q.reconcile(record); }, /lines changed/);
  var before = requests.length;
  deps.Q.ENV = 'production';
  await refused(function () { return q.customer('example.test', p); }, /sandbox-only/);
  equal(requests.length, before);
  deps.Q.ENV = 'sandbox'; deps.Q.load = async function () { return { env: 'production', realmId: '123' }; };
  await refused(function () { return q.invoice(plan, p, 'C1'); }, /not the requested sandbox/);
  equal(requests.length, before);
  deps.Q.load = async function () { return { env: 'sandbox', realmId: '999' }; };
  await refused(function () { return q.reconcile(record); }, /not the requested sandbox/);
  equal(requests.length, before);
  console.log('Packaging billing foundation: ' + count + ' passed; no network or live writes.');
}
run().catch(function (e) { console.error(e); process.exitCode = 1; });
