/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * The Stripe rail (2026-09-27, Tommy: "a customer creates an account, they
 * add billing and that's all done through Stripe, and once they do that it
 * needs to allow them to use what they paid for").
 *
 *   1. the driver (api/_lib/stripe-billing.js) against an in-memory Stripe:
 *      the mode, one customer per workspace, one invoice per plan (a retry
 *      never issues twice), and what reconcile reads back — paid, open,
 *      void, refunded, disputed, edited.
 *   2. the engine end to end on the Firestore double, with the deployment
 *      on Stripe (PACKAGING_PROVIDER=stripe): sign up and pay now → the first invoice is a Stripe
 *      invoice → the webhook sees it paid → exactly what was bought is on.
 *      The next cycle bills through Stripe; an addition is a Stripe change
 *      invoice; a workspace already on QuickBooks stays on QuickBooks.
 *   3. api/stripe-webhook.js answers a package invoice before the legacy tier
 *      path and never lets it touch the tier.
 * Nothing reaches the network.
 */
'use strict';
var assert = require('assert'), path = require('path'), Module = require('module');
var F = require('./_lib/firestore-double'), DB = F.DB, SD = require('./_lib/stripe-double').StripeDouble;
var count = 0;
function ok(name, cond, detail) { if (!cond) { console.error('FAIL ' + name + (detail !== undefined ? '\n   ' + JSON.stringify(detail).slice(0, 400) : '')); process.exitCode = 1; throw new Error(name); } count++; console.log('  ok   ' + name); }
async function refused(name, fn, re) { try { await fn(); } catch (e) { ok(name, re.test(String(e.message)), e.message); return e; } ok(name + ' (was not refused)', false); }
function env(o) { Object.keys(o).forEach(function (k) { if (o[k] == null) delete process.env[k]; else process.env[k] = o[k]; }); }
env({ PACKAGING_PROVIDER: 'stripe', PACKAGING_LIVE: null, QBO_ENV: null, STRIPE_SECRET_KEY: 'sk_test_double', PACKAGING_BILLING_ENABLED: 'true', PACKAGING_SIGNUP_ENABLED: 'true', TRIAL_DAYS: '14' });

var ST = require('../api/_lib/stripe-billing'), Mode = require('../api/_lib/packaging-mode'), D = require('../api/_lib/billing-driver');
var B = require('../api/_lib/pricebook'), BP = require('../api/_lib/billing-profile');
var profile = { legalName: 'Stripe Example LLC', contactName: 'Sam Example', email: 'ap@stripe.example', phone: '555-0100',
  address: { line1: '1 Example Way', city: 'Chicago', state: 'IL', postalCode: '60601', country: 'USA' }, vertical: 'developer', teamSize: 3 };
function book() { var b = B.proposed(); b.enabled = true; return b; }
function plan(marker, lines) {
  return { marker: marker, date: '2026-09-27', kind: 'subscription', period: { start: '2026-09-27', end: '2026-10-27' },
    lines: lines || [{ itemKey: 'module:lite', name: 'Omega Design', quantity: 1, amountCents: 50000 }, { itemKey: 'module:storage', name: 'Omega Storage', quantity: 1, amountCents: 25000 }, { itemKey: 'credit', name: 'Transformation credit', quantity: 1, amountCents: -5000 }, { itemKey: 'service-fee', name: 'Annual service fee', quantity: 1, amountCents: 0 }],
    subtotalCents: 70000, totalCents: 70000 };
}

async function driverChecks() {
  console.log('\nthe mode: a test key bills the sandbox; a live key only under the switch');
  ok('PACKAGING_PROVIDER=stripe puts packaging on the Stripe rail', Mode.provider() === 'stripe');
  env({ PACKAGING_PROVIDER: null });
  ok('unset, packaging stays on QuickBooks: a merge never moves a live money path', Mode.provider() === 'quickbooks');
  env({ PACKAGING_PROVIDER: 'stripe' });
  ok('a test key is the sandbox', Mode.sandbox() && !Mode.live() && Mode.open());
  env({ STRIPE_SECRET_KEY: null });
  ok('no key: packaging bills nowhere', !Mode.open());
  var s0 = new SD();
  var e = await refused('no key: the driver refuses before any call', function () { return ST.driver(book(), { stripe: s0 }).customer('stripe.example', profile); }, /test key/);
  ok('...and the refusal is ClearSky\'s, never the invoice\'s', e.clearsky === true && s0.calls.length === 0);
  env({ STRIPE_SECRET_KEY: 'sk_live_double' });
  ok('a live key without PACKAGING_LIVE=true is refused everywhere', !Mode.open() && !Mode.live());
  env({ PACKAGING_LIVE: 'true' });
  ok('a live key under PACKAGING_LIVE=true is live', Mode.live() && Mode.env() === 'production');
  var testObjects = new SD({ livemode: false });
  await refused('live mode never bills a test-mode customer', function () { return ST.driver(book(), { stripe: testObjects }).customer('stripe.example', profile); }, /live mode/);
  env({ STRIPE_SECRET_KEY: 'sk_test_double' });
  ok('under the live switch a test key is closed, never a sandbox: no test-card payment opens anything in production', !Mode.open('stripe') && !Mode.sandbox('stripe') && !Mode.live('stripe'));
  env({ PACKAGING_LIVE: null, STRIPE_SECRET_KEY: 'rk_test_double' });
  ok('a restricted test key is the sandbox too', Mode.sandbox());
  env({ STRIPE_SECRET_KEY: 'sk_test_double', PACKAGING_PROVIDER: 'quickbooks', QBO_ENV: 'sandbox' });
  ok('PACKAGING_PROVIDER=quickbooks keeps the QuickBooks rail, judged by QBO_ENV', Mode.provider() === 'quickbooks' && Mode.sandbox() && Mode.configured('stripe') === 'sandbox');
  env({ PACKAGING_PROVIDER: 'stripe', QBO_ENV: null });

  console.log('\none Stripe customer per workspace');
  var s = new SD(), d = ST.driver(book(), { stripe: s });
  var c1 = await d.customer('stripe.example', profile);
  var cus = s.customers_[c1];
  ok('the customer carries the workspace mark, the billing email and the address in Stripe\'s shape', cus.metadata.omegaOrg === 'stripe.example' && cus.email === 'ap@stripe.example' && cus.address.country === 'US' && cus.address.postal_code === '60601' && cus.name === 'Stripe Example LLC', cus);
  ok('a blank second address line is left off, never sent as an empty string Stripe refuses', !Object.prototype.hasOwnProperty.call(cus.address, 'line2'));
  var c2 = await d.customer('stripe.example', profile);
  ok('asked again with no id, the same customer is found (by email and mark), not a second one', c2 === c1 && s.all('customers').length === 1);
  var before = s.calls.filter(function (c) { return c === 'customers.update'; }).length;
  await d.customer('stripe.example', profile, c1);
  ok('an unchanged profile writes nothing', s.calls.filter(function (c) { return c === 'customers.update'; }).length === before);
  var moved = JSON.parse(JSON.stringify(profile)); moved.address.line1 = '2 New Street';
  await d.customer('stripe.example', moved, c1);
  ok('a changed profile updates the same customer', s.customers_[c1].address.line1 === '2 New Street' && s.all('customers').length === 1);
  await d.customer('stripe.example', profile, c1);
  ok('A → B → A is a new update, never a replay of the first', s.customers_[c1].address.line1 === '1 Example Way');
  var other = await d.customer('other.example', Object.assign({}, profile, { legalName: 'Other Co' }));
  ok('another workspace with the same billing email gets its own customer', other !== c1 && s.customers_[other].metadata.omegaOrg === 'other.example');
  await refused('a customer marked for another workspace is never billed for this one', function () { return d.customer('stripe.example', profile, other); }, /another workspace/);
  ok('the billing profile\'s country: a US spelling is US, two letters pass, anything else is left off', ST.country('United States') === 'US' && ST.country('ca') === 'CA' && ST.country('Canada') === null);

  console.log('\none invoice per plan: server lines, Stripe\'s page, never twice');
  var p = plan('OMEGA subscription stripe.example / 2026-09-27');
  var inv = await d.invoice(p, BP.normalize(profile), c1), stored = s.invoices_[inv.id];
  ok('the invoice is send_invoice, in dollars, marked with the plan, finalized and open', stored.collection_method === 'send_invoice' && stored.currency === 'usd' && stored.metadata.omegaMarker === p.marker && stored.metadata.omegaOrg === 'stripe.example' && stored.metadata.omegaPackage === 'true' && stored.status === 'open', stored);
  var items = s.all('items').filter(function (it) { return it.invoice === inv.id; });
  ok('one item per non-zero line, the credit negative, the amounts the server\'s', items.map(function (i) { return i.amount; }).sort().join() === [-5000, 25000, 50000].sort().join() && items.every(function (i) { return /Omega|credit/i.test(i.description); }), items);
  ok('the total is the plan\'s and the pay link is Stripe\'s hosted page', inv.totalCents === 70000 && /^https:\/\/invoice\.stripe\.com\//.test(inv.payUrl) && !inv.payLinkMissing, inv);
  ok('Stripe emails the invoice once', s.sent.length === 1 && s.sent[0] === inv.id);
  var again = await d.invoice(p, BP.normalize(profile), c1);
  ok('a retry finds the same invoice: nothing new issued, nothing re-sent', again.id === inv.id && s.all('invoices').length === 1 && s.sent.length === 1);
  /* a crash between the draft and its lines: the retry adds only what is missing */
  var p2 = plan('OMEGA subscription stripe.example / 2026-10-27');
  var draft = await s.invoices.create({ customer: c1, collection_method: 'send_invoice', days_until_due: 1, currency: 'usd', auto_advance: false, pending_invoice_items_behavior: 'exclude', description: 'x', metadata: { omegaPackage: 'true', omegaOrg: 'stripe.example', omegaMarker: p2.marker, omegaKind: 'subscription', omegaDate: p2.date } });
  await s.invoiceItems.create({ customer: c1, invoice: draft.id, amount: 50000, currency: 'usd', description: 'Omega Design', metadata: { omegaMarker: p2.marker, omegaLine: '0' } });
  var resumed = await d.invoice(p2, BP.normalize(profile), c1);
  ok('a half-made draft is finished, not duplicated: the missing lines only, then finalized', resumed.id === draft.id && s.all('items').filter(function (it) { return it.invoice === draft.id; }).length === 3 && s.invoices_[draft.id].status === 'open');
  await refused('an invoice with nothing to pay is refused', function () { return d.invoice(plan('OMEGA subscription stripe.example / zero', [{ itemKey: 'service-fee', name: 'Fee', quantity: 1, amountCents: 0 }]), BP.normalize(profile), c1); }, /paid subscription/);
  var nolink = new SD({ noLink: true }), dn = ST.driver(book(), { stripe: nolink }), cn = await dn.customer('stripe.example', profile);
  var missingLink = await dn.invoice(plan('OMEGA subscription stripe.example / nolink'), BP.normalize(profile), cn);
  ok('an invoice without a hosted page says so (the signup falls back to the emailed invoice)', missingLink.payUrl === null && missingLink.payLinkMissing === true);
  var gone = await d.customer('gone.example', Object.assign({}, profile, { email: 'gone@stripe.example' })); s.customers_[gone].deleted = true;
  await refused('a customer deleted in the dashboard is a review, never an invoice', function () { return d.invoice(plan('OMEGA subscription gone.example / 2026-09-27'), BP.normalize(profile), gone); }, /needs review/);
  ok('only invoice.stripe.com is a pay link', ST.payLink('https://invoice.stripe.com/i/x') && !ST.payLink('http://invoice.stripe.com/i/x') && !ST.payLink('https://evil.example/invoice.stripe.com') && !ST.payLink('https://u:p@invoice.stripe.com/i/x'));

  console.log('\nwhat reconcile reads back');
  var record = Object.assign({}, p, { stripeInvoiceId: inv.id, stripeCustomerId: c1, totalCents: inv.totalCents });
  var r = await d.reconcile(record);
  ok('open: not paid, the pay link offered', r.satisfied === false && r.reversed === false && r.paidCents === 0 && /invoice\.stripe\.com/.test(r.payUrl), r);
  s.pay(inv.id); r = await d.reconcile(record);
  ok('paid by card: satisfied, the whole amount', r.satisfied === true && r.reversed === false && r.paidCents === 70000 && r.payUrl === null, r);
  s.refund(inv.id, 20000); r = await d.reconcile(record);
  ok('a partial refund: still paid (a concession somebody made), what is left counted, and a person is told', r.satisfied === true && r.reversed === false && r.paidCents === 50000 && /part of the payment was refunded/.test(r.review || ''), r);
  s.refund(inv.id); r = await d.reconcile(record);
  ok('a full refund: reversed', r.reversed === true && r.satisfied === false, r);
  var inv2 = await d.invoice(plan('OMEGA subscription stripe.example / void'), BP.normalize(profile), c1);
  s.voidInvoice(inv2.id);
  r = await d.reconcile(Object.assign({}, plan('OMEGA subscription stripe.example / void'), { stripeInvoiceId: inv2.id, stripeCustomerId: c1, totalCents: 70000 }));
  ok('voided in the dashboard: reversed', r.reversed === true);
  var inv3 = await d.invoice(plan('OMEGA subscription stripe.example / edit'), BP.normalize(profile), c1);
  s.edit(inv3.id, 1);
  await refused('a line edited on Stripe\'s side is an accounting review, never a silent change', function () { return d.reconcile(Object.assign({}, plan('OMEGA subscription stripe.example / edit'), { stripeInvoiceId: inv3.id, stripeCustomerId: c1, totalCents: 70000 })); }, /lines changed|total changed/);
  var inv4 = await d.invoice(plan('OMEGA subscription stripe.example / dispute'), BP.normalize(profile), c1);
  s.pay(inv4.id); s.dispute(inv4.id);
  await refused('a disputed payment is an accounting review while the dispute is open', function () { return d.reconcile(Object.assign({}, plan('OMEGA subscription stripe.example / dispute'), { stripeInvoiceId: inv4.id, stripeCustomerId: c1, totalCents: 70000 })); }, /disputed/);
  var dp4 = Object.keys(s.disputes_)[0]; s.settleDispute(dp4, 'lost');
  r = await d.reconcile(Object.assign({}, plan('OMEGA subscription stripe.example / dispute'), { stripeInvoiceId: inv4.id, stripeCustomerId: c1, totalCents: 70000 }));
  ok('a dispute LOST: the money went back, the invoice reads reversed (never paid access on a chargeback)', r.reversed === true && r.satisfied === false, r);
  var inv8 = await d.invoice(plan('OMEGA subscription stripe.example / dispute-won'), BP.normalize(profile), c1); s.pay(inv8.id); s.settleDispute(s.dispute(inv8.id), 'won');
  r = await d.reconcile(Object.assign({}, plan('OMEGA subscription stripe.example / dispute-won'), { stripeInvoiceId: inv8.id, stripeCustomerId: c1, totalCents: 70000 }));
  ok('a dispute WON: still paid, and nothing left for a person', r.satisfied === true && r.reversed === false && !r.review, r);
  await refused('an invoice is never read against another customer', function () { return d.reconcile(Object.assign({}, record, { stripeCustomerId: other })); }, /customer mismatch/);
  var inv5 = await d.invoice(plan('OMEGA subscription stripe.example / credit'), BP.normalize(profile), c1);
  s.credit(inv5.id, 30000); r = await d.reconcile(Object.assign({}, plan('OMEGA subscription stripe.example / credit'), { stripeInvoiceId: inv5.id, stripeCustomerId: c1, totalCents: 70000 }));
  ok('paid partly from the customer\'s credit balance: paid in full, never read unpaid for ever', r.satisfied === true && r.paidCents === 70000 && !r.review, r);
  var inv6 = await d.invoice(plan('OMEGA subscription stripe.example / void-cancel'), BP.normalize(profile), c1), rec6 = Object.assign({}, plan('OMEGA subscription stripe.example / void-cancel'), { stripeInvoiceId: inv6.id, stripeCustomerId: c1, totalCents: 70000 });
  ok('a cancelled change\'s open invoice is voided at Stripe, so it cannot be paid', (await d.voidOpen(rec6)).voided === true && s.invoices_[inv6.id].status === 'void');
  ok('...and voiding again is harmless', (await d.voidOpen(rec6)).voided === true);
  var inv7 = await d.invoice(plan('OMEGA subscription stripe.example / paid-cancel'), BP.normalize(profile), c1); s.pay(inv7.id);
  await refused('a paid invoice is never voided: the change is switching on', function () { return d.voidOpen(Object.assign({}, rec6, { stripeInvoiceId: inv7.id })); }, /already paid/);
  /* Stripe's own words (key fragments, account ids) never reach a tenant */
  var loud = new SD(), dl = ST.driver(book(), { stripe: loud }), cl = await dl.customer('stripe.example', profile);
  loud.invoices.list = async function () { var e = new Error('Invalid API Key provided: sk_live_****abcd on account acct_123'); e.type = 'StripeAuthenticationError'; e.statusCode = 401; throw e; };
  var quiet = await refused('a Stripe error reads as a plain refusal', function () { return dl.invoice(plan('OMEGA subscription stripe.example / loud'), BP.normalize(profile), cl); }, /Stripe refused the request/);
  ok('...with no key, account or mode in it, and it is ClearSky\'s side (retried)', !/sk_|acct_|Invalid API Key/.test(quiet.message) && quiet.clearsky === true && quiet.status === 502, quiet.message);

  console.log('\nwhich events are an OMEGA package invoice');
  ok('a package invoice event names its workspace', ST.eventOrg(s.event('invoice.paid', inv.id)) === 'stripe.example');
  ok('a legacy tier invoice (no package mark) is not ours', ST.eventOrg({ type: 'invoice.paid', data: { object: { object: 'invoice', metadata: { orgId: 'legacy.example' } } } }) === null);
  ok('a subscription or customer event is not ours', ST.eventOrg({ type: 'customer.subscription.updated', data: { object: { object: 'subscription', metadata: { omegaPackage: 'true', omegaOrg: 'x.example' } } } }) === null);
  ok('a mark that is not a workspace id is ignored', ST.eventOrg({ type: 'invoice.paid', data: { object: { object: 'invoice', metadata: { omegaPackage: 'true', omegaOrg: '../omega_orgs' } } } }) === null);
}

/* ── the engine, end to end ─────────────────────────────────────────────── */
var orgId = 'stripe.example', root = 'omega_orgs/' + orgId, NOW = Date.parse('2026-09-27T15:00:00Z');
var DBREF = { db: null }, CALLER = { staff: false, uid: 'uid-owner', email: 'owner@stripe.example', orgId: orgId, role: 'owner', claims: {} };
F.mock('../api/_lib/admin', { handler: function (fn) { return fn; }, authenticate: async function () { return CALLER; }, db: function () { return DBREF.db; },
  safeOrg: function (x) { return /^[a-z0-9.-]+\.[a-z]+$/.test(x || '') ? x : null; }, orgOf: function (x) { return x.split('@')[1]; },
  isTenantAdmin: async function (c, o) { return c.staff || c.orgId === o && c.role === 'owner'; },
  /* the real rule (admin.js): staff, or an owner/admin of a workspace whose record is active */
  clientAdmin: async function (c, o) { if (c.staff) return true; if (!(c.orgId === o && c.role === 'owner')) return false; var r = await DBREF.db.doc('omega_orgs/' + o).get(); return r.exists && r.data().status === 'active'; },
  billingOf: async function (o) { var r = await DBREF.db.doc('omega_orgs/' + o + '/billing/current').get(); return r.exists ? r.data() : {}; },
  httpError: function (status, message) { var e = new Error(message); e.status = status; return e; },
  FieldValue: function () { return { serverTimestamp: function () { return Date.now(); } }; },
  init: function () { return { auth: function () { return { setCustomUserClaims: async function () {} }; } }; } });
var MAILED = [];
var mailer = { templates: new Proxy({}, { get: function (t, name) { return async function (o) { MAILED.push({ template: name, payWith: o.payWith, paymentLink: o.paymentLink }); return { ok: true }; }; } }) };
var S = require('../api/_lib/package-billing'), C = require('../api/_lib/plan-change'), Q = require('../api/_lib/qbo-billing');
function fixture() {
  var db = new DB(); db.serial = true; DBREF.db = db;
  db.seed('pricebook/' + B.VERSION, book());
  db.seed(root, { name: 'Stripe Example', status: 'active', signedUpAt: '2026-09-20T12:00:00Z', packagingSandbox: true, packaged: true, domains: ['stripe-example.clearskyomega.com'] });
  db.seed(root + '/billing/current', { packaged: true, packagingSignup: true, packagingState: 'pending', billingProvider: 'quickbooks' /* a pending signup made before Stripe was the default */, modules: ['lite'], proposedPackage: { modules: ['lite', 'storage'], interval: 'monthly' } });
  db.seed(root + '/billing/profile', profile);
  db.seed(root + '/members/uid-owner', { role: 'owner', status: 'active', email: 'owner@stripe.example' });
  return db;
}
async function engineChecks() {
  console.log('\nsign up, pay by card on Stripe\'s page, and exactly what was bought is on');
  var db = fixture(), stripe = new SD(), deps = { stripe: stripe };
  var input = { action: 'activate', modules: ['lite', 'storage'], interval: 'monthly', pricebookVersion: B.VERSION };
  var v = await S.preview(db, orgId, input, NOW);
  ok('the preview names Stripe as the rail, even for a signup recorded before the switch', v.billingPatch.billingProvider === 'stripe' && v.billingPatch.qboEnv === undefined, v.billingPatch);
  var applied = await S.apply(db, orgId, Object.assign({}, input, { previewId: v.previewId, effectiveAt: v.effectiveAt }), Object.assign({}, CALLER, { selfServe: true }), NOW, deps);
  var bill = db.data.get(root + '/billing/current'), invoices = Array.from(db.data.keys()).filter(function (k) { return k.indexOf(root + '/billing/current/invoices/') === 0; });
  var first = db.data.get(invoices[0]);
  ok('the workspace is bound to its Stripe customer, in test mode', bill.billingProvider === 'stripe' && bill.paymentProvider === 'stripe' && /^cus_/.test(bill.stripeCustomerId) && bill.stripeLivemode === false && !bill.qboCustomerId, bill);
  ok('the first invoice is a Stripe invoice on the record, with Stripe\'s pay page', invoices.length === 1 && first.provider === 'stripe' && /^in_/.test(first.stripeInvoiceId) && first.stripeCustomerId === bill.stripeCustomerId && !first.qboInvoiceId && /invoice\.stripe\.com/.test(first.paymentLink), first);
  ok('nothing is on until it is paid: Omega Design only, awaiting payment', bill.packagingState === 'awaiting_payment' && bill.modules.join() === 'lite' && applied.paymentLink === first.paymentLink);
  var noticed = db.data.get(root + '/notifications/package-invoice-' + first.date);
  ok('the invoice notice says Stripe and carries the link', noticed && noticed.payWith === 'Stripe' && noticed.paymentLink === first.paymentLink && !/QuickBooks/.test(noticed.text), noticed);
  ok('the engine priced the invoice; Stripe was handed amounts, never a price list', stripe.all('items').every(function (it) { return typeof it.amount === 'number' && !it.price; }) && stripe.invoices_[first.stripeInvoiceId].total === first.totalCents);

  var Hook = require('../api/stripe-webhook');
  var open = await Hook.packageEvent(orgId, { billing: deps, mail: mailer });
  ok('an event before payment changes nothing', db.data.get(root + '/billing/current').packagingState === 'awaiting_payment' && open.orgId === orgId);
  stripe.pay(first.stripeInvoiceId);
  var paid = await Hook.packageEvent(orgId, { billing: deps, mail: mailer });
  bill = db.data.get(root + '/billing/current');
  ok('invoice.paid: the webhook reconciles at once and the package is on', bill.packagingState === 'paid' && bill.modules.join() === 'lite,storage' && bill.toolAccess.indexOf('batterysizer') >= 0 && bill.amountDue === 0, { state: bill.packagingState, modules: bill.modules });
  var PA = require('../api/_lib/package-access');
  ok('a paid test-mode grant is live where the live switch is off (the sandbox)', PA.live(bill, bill.modules, NOW) === true);
  env({ PACKAGING_LIVE: 'true' }); var underSwitch = PA.live(bill, bill.modules, NOW); env({ PACKAGING_LIVE: null });
  ok('...and never honoured under the live switch (a Preview writing to the same Firestore)', underSwitch === false);
  ok('the invoice record reads paid, the history says who read it', db.data.get(invoices[0]).state === 'paid' && Array.from(db.data.keys()).some(function (k) { return k.indexOf(root + '/billing/current/history/') === 0 && db.data.get(k).by === 'stripe-reconciliation'; }));
  ok('the tenant\'s receipt and ClearSky\'s alert went out, naming Stripe', MAILED.some(function (m) { return m.template === 'paid'; }) && MAILED.some(function (m) { return m.template === 'paidAlert' && m.payWith === 'Stripe'; }), MAILED);
  var summary = await C.summary(db, orgId);
  ok('Plan & billing reads Stripe as the rail, the invoice paid', summary.provider === 'stripe' && summary.payWith === 'Stripe' && summary.invoices[0].state === 'paid' && summary.invoices[0].payWith === 'Stripe');
  var r = await C.reconcileNow(db, orgId, CALLER, NOW + 20000, deps);
  ok('"I\'ve paid" is the same reconcile, and says Stripe', r.paid === true && r.payWith === 'Stripe' && r.provider === 'stripe', r);

  console.log('\nthe next cycle, an addition and a refund, all on Stripe');
  bill = db.data.get(root + '/billing/current');
  var dueAt = Date.parse(bill.nextInvoiceOn + 'T12:00:00Z'), issued = await S.issue(db, orgId, dueAt, deps);
  var next = db.data.get(root + '/billing/current/invoices/' + issued.date);
  ok('the runner issues the next cycle through Stripe, to the same customer', issued.issued === true && next.provider === 'stripe' && next.stripeCustomerId === bill.stripeCustomerId && stripe.all('invoices').length === 2, issued);
  stripe.pay(next.stripeInvoiceId); await S.reconcile(db, orgId, dueAt + 1000, deps);
  var q = await C.preview(db, orgId, { add: ['gridatlas'] }, dueAt + 2000);
  ok('an addition is quoted as billed through Stripe', /Billed through Stripe/.test(q.display.activation) && q.canApply, q.display);
  var change = await C.apply(db, orgId, { add: ['gridatlas'], previewId: q.previewId, effectiveAt: dueAt + 2000 }, CALLER, dueAt + 2000, deps);
  var changeRec = db.data.get(root + '/billing/current/invoices/' + change.changeId);
  ok('the change invoice is a Stripe invoice and says so', change.payWith === 'Stripe' && changeRec.provider === 'stripe' && /^in_/.test(changeRec.stripeInvoiceId) && change.state === 'awaiting_payment', change);
  ok('...and Omega Grid is not on until it is paid', db.data.get(root + '/billing/current').modules.indexOf('gridatlas') < 0);
  stripe.pay(changeRec.stripeInvoiceId); await Hook.packageEvent(orgId, { billing: deps, mail: mailer });
  ok('paid: Omega Grid joins the subscription and is on', db.data.get(root + '/billing/current').modules.indexOf('gridatlas') >= 0 && db.data.get(root + '/billing/current').subscription.modules.indexOf('gridatlas') >= 0);
  var q2 = await C.preview(db, orgId, { add: ['estimate'] }, dueAt + 3000);
  var ch2 = await C.apply(db, orgId, { add: ['estimate'], previewId: q2.previewId, effectiveAt: dueAt + 3000 }, CALLER, dueAt + 3000, deps), rec2 = db.data.get(root + '/billing/current/invoices/' + ch2.changeId);
  await C.cancel(db, orgId, ch2.changeId, CALLER, dueAt + 4000, deps);
  var cancelled2 = db.data.get(root + '/billing/current/invoices/' + ch2.changeId);
  ok('a cancelled Stripe change is voided at Stripe: it cannot be paid after the tenant said no', stripe.invoices_[rec2.stripeInvoiceId].status === 'void' && cancelled2.state === 'cancelled' && cancelled2.voided === true && cancelled2.paymentLink === null, cancelled2);
  var q3 = await C.preview(db, orgId, { add: ['estimate'] }, dueAt + 5000);
  ok('asked again, it is a new change with its own invoice (a voided one is never revived)', q3.canApply === true && q3.previewId !== q2.previewId, q3);
  var ch3 = await C.apply(db, orgId, { add: ['estimate'], previewId: q3.previewId, effectiveAt: dueAt + 5000 }, CALLER, dueAt + 5000, deps), rec3 = db.data.get(root + '/billing/current/invoices/' + ch3.changeId);
  stripe.pay(rec3.stripeInvoiceId);
  await refused('a change already paid at Stripe cannot be cancelled: it is switching on', function () { return C.cancel(db, orgId, ch3.changeId, CALLER, dueAt + 6000, deps); }, /already paid/);
  ok('...and stays waiting for the reconcile that switches it on', db.data.get(root + '/billing/current/invoices/' + ch3.changeId).state === 'unpaid');
  await Hook.packageEvent(orgId, { billing: deps, mail: mailer });
  stripe.refund(first.stripeInvoiceId, 10000); await Hook.packageEvent(orgId, { billing: deps, mail: mailer });
  var firstNow = db.data.get(invoices[0]);
  ok('a goodwill refund on a paid cycle: still paid, the workspace stays open, and a person is told once', firstNow.state === 'paid' && firstNow.reviewRequired === true && db.data.get(root + '/billing/current').packagingState === 'paid'
    && !!db.data.get('omega_orgs/clearsky-usa.com/notifications/billing-review-' + orgId + '-' + first.stripeInvoiceId), firstNow);
  stripe.refund(next.stripeInvoiceId); await Hook.packageEvent(orgId, { billing: deps, mail: mailer });
  ok('a refunded cycle is reversed: access is cut to what was paid for', db.data.get(root + '/billing/current/invoices/' + issued.date).state === 'reversed' && db.data.get(root + '/billing/current').packagingState === 'unpaid');

  console.log('\na workspace already on QuickBooks stays on QuickBooks');
  var qdb = new DB(); qdb.serial = true; DBREF.db = qdb; var qbook = book(); qbook.qbo.realmId = '123'; qdb.seed('pricebook/' + B.VERSION, qbook);
  qdb.seed(root, { name: 'QB Example', status: 'active', packagingSandbox: true, packaged: true, signedUpAt: '2026-08-20T12:00:00Z' });
  qdb.seed(root + '/billing/current', { packaged: true, packagingState: 'awaiting_payment', billingProvider: 'quickbooks', qboCustomerId: 'C1', qboRealmId: '123', modules: ['lite'], billingDay: 20, subscription: { modules: ['lite'], plan: 'alacarte' }, stripeCustomerId: 'cus_legacy_tier' });
  qdb.seed(root + '/billing/current/invoices/2026-09-20', { date: '2026-09-20', period: { start: '2026-09-20', end: '2026-10-20' }, modules: ['lite'], lines: [], totalCents: 50000, state: 'unpaid', qboInvoiceId: 'Q-1', qboCustomerId: 'C1' });
  ok('the rail follows the record: QuickBooks customer → QuickBooks, even with the deployment on Stripe', D.providerOf(qdb.data.get(root + '/billing/current')) === 'quickbooks' && Mode.provider() === 'stripe');
  var orig = Q.driver, qcalls = 0;
  Q.driver = function () { return { reconcile: async function (rec) { qcalls++; return { satisfied: rec.qboInvoiceId === 'Q-1', reversed: false, paidCents: 50000, payUrl: null }; } }; };
  env({ QBO_ENV: 'sandbox' });
  await S.reconcile(qdb, orgId, NOW, {});
  Q.driver = orig; env({ QBO_ENV: null });
  ok('its invoices are read back from QuickBooks, and it opens when paid there', qcalls === 1 && qdb.data.get(root + '/billing/current').packagingState === 'paid');
  env({ PACKAGING_PROVIDER: 'quickbooks' });
  ok('only a packaged Stripe customer binds to Stripe: a legacy tier\'s own stripeCustomerId follows the deployment\'s rail', D.providerOf({ packaged: true, billingProvider: 'stripe', stripeCustomerId: 'cus_x' }) === 'stripe'
    && D.providerOf({ packaged: false, billingProvider: 'stripe', stripeCustomerId: 'cus_x' }) === 'quickbooks' && D.providerOf({ stripeCustomerId: 'cus_x' }) === 'quickbooks'
    && D.providerOf({ packaged: true, billingProvider: 'quickbooks', stripeCustomerId: 'cus_x', qboCustomerId: 'C9' }) === 'quickbooks');
  env({ PACKAGING_PROVIDER: 'stripe' });

  console.log('\na tenant moving off an old Stripe subscription onto a package');
  var ldb = fixture(), lstripe = new SD(), lb = ldb.data.get(root + '/billing/current');
  Object.assign(lb, { packaged: false, packagingSignup: false, packagingState: null, billingProvider: null, tier: 'standard', stripeSubscriptionId: 'sub_oldtier', stripeCustomerId: 'cus_oldtier' });
  var lv = await S.preview(ldb, orgId, input, NOW);
  await S.apply(ldb, orgId, Object.assign({}, input, { previewId: lv.previewId, effectiveAt: lv.effectiveAt }), Object.assign({}, CALLER, { staff: true, email: 'ops@clearsky-usa.com' }), NOW, { stripe: lstripe });
  var legacyNote = ldb.data.get('omega_orgs/clearsky-usa.com/notifications/billing-review-legacy-sub-' + orgId);
  ok('ClearSky is told to cancel the old subscription so the card is not charged twice', legacyNote && /sub_oldtier/.test(legacyNote.text) && legacyNote.staffMail === 'billingAlert', legacyNote);
  var moved = ldb.data.get(root + '/billing/current');
  ok('the package gets its OWN Stripe customer, never the tier\'s (which carries the tier subscription)', /^cus_/.test(moved.stripeCustomerId) && moved.stripeCustomerId !== 'cus_oldtier' && lstripe.customers_[moved.stripeCustomerId].metadata.omegaOrg === orgId, moved);
  ok('...and the tier customer is kept so its events still find the workspace', moved.legacyStripeCustomerId === 'cus_oldtier');

  console.log('\na customer from the other Stripe mode is never billed');
  var mdb = fixture(); var live = new SD({ livemode: true });
  var mv = await S.preview(mdb, orgId, input, NOW);
  await refused('test mode refuses a live-mode customer before invoicing', function () { return S.apply(mdb, orgId, Object.assign({}, input, { previewId: mv.previewId, effectiveAt: mv.effectiveAt }), Object.assign({}, CALLER, { selfServe: true }), NOW, { stripe: live }); }, /live mode/);
  ok('...and nothing was written: no binding, no invoice', !mdb.data.get(root + '/billing/current').stripeCustomerId && !Array.from(mdb.data.keys()).some(function (k) { return k.indexOf('/invoices/') > 0; }) && live.all('invoices').length === 0);
  var bdb = fixture(); bdb.data.get(root + '/billing/current').packaged = true;
  Object.assign(bdb.data.get(root + '/billing/current'), { billingProvider: 'stripe', stripeCustomerId: 'cus_x', stripeLivemode: true, packagingState: 'paid', nextInvoiceOn: '2026-09-27', billingDay: 27 });
  await refused('the runner will not issue to a customer bound in the other mode', function () { return S.issue(bdb, orgId, NOW, { stripe: new SD() }); }, /does not belong/);
}

async function webhookChecks() {
  console.log('\nthe webhook answers a package invoice first, and never touches the tier');
  var src = require('fs').readFileSync(path.join(__dirname, '../api/stripe-webhook.js'), 'utf8');
  var at = src.indexOf('StripeBilling.eventOrg(evt)'), lite = src.indexOf('CustomerLite.webhook(evt');
  ok('the package branch runs after the signature check and before every other branch', at > src.indexOf('constructEvent') && at < lite && src.indexOf("return packageEvent(pkgOrg") > at);
  /* the real handler with a signature-checking stand-in for the stripe module */
  var db = fixture(), stripe = new SD(), deps = { stripe: stripe }, load = Module._load;
  var input = { action: 'activate', modules: ['lite', 'storage'], interval: 'monthly', pricebookVersion: B.VERSION };
  var v = await S.preview(db, orgId, input, NOW);
  await S.apply(db, orgId, Object.assign({}, input, { previewId: v.previewId, effectiveAt: v.effectiveAt }), Object.assign({}, CALLER, { selfServe: true }), NOW, deps);
  var inv = Array.from(db.data.keys()).filter(function (k) { return k.indexOf(root + '/billing/current/invoices/') === 0; }).map(function (k) { return db.data.get(k); })[0];
  stripe.pay(inv.stripeInvoiceId);
  Module._load = function (request) { if (request === 'stripe') return function () { return { webhooks: { constructEvent: function (buf, sig) { if (sig !== 'signed') throw new Error('bad'); return JSON.parse(String(buf)); } } }; }; return load.apply(this, arguments); };
  try {
    var Hook = require('../api/stripe-webhook'); Hook.deps = { billing: deps, mail: mailer };
    function call(evt, sig) {
      return new Promise(function (resolve) {
        var listeners = {}, req = { method: 'POST', headers: { 'stripe-signature': sig }, on: function (n, f) { listeners[n] = f; return req; } };
        var res = { code: 200, status: function (c) { res.code = c; return res; }, json: function (b) { resolve({ code: res.code, body: b }); }, send: function (b) { resolve({ code: res.code, body: b }); }, end: function () { resolve({ code: res.code }); } };
        Hook(req, res); setImmediate(function () { listeners.data(Buffer.from(JSON.stringify(evt))); listeners.end(); });
      });
    }
    var bad = await call(stripe.event('invoice.paid', inv.stripeInvoiceId), 'forged');
    ok('an unsigned event is refused and changes nothing', bad.code === 400 && db.data.get(root + '/billing/current').packagingState === 'awaiting_payment');
    var good = await call(stripe.event('invoice.paid', inv.stripeInvoiceId), 'signed');
    var bill = db.data.get(root + '/billing/current');
    ok('a signed invoice.paid opens exactly what was bought', good.code === 200 && good.body.package && bill.packagingState === 'paid' && bill.modules.join() === 'lite,storage', good.body);
    ok('...and the legacy tier path never ran: no tier, no lastStripeEvent, status untouched', bill.lastStripeEvent === undefined && bill.tier !== 'trial' && db.data.get(root).status === 'active');
    /* an event is about ONE invoice: the handler reads that one back, never the whole history first */
    var cyc = await S.issue(db, orgId, Date.parse(bill.nextInvoiceOn + 'T12:00:00Z'), deps);
    var newer = Array.from(db.data.keys()).filter(function (k) { return k.indexOf(root + '/billing/current/invoices/') === 0; }).map(function (k) { return db.data.get(k); })
      .filter(function (r) { return r.stripeInvoiceId && r.stripeInvoiceId !== inv.stripeInvoiceId; })[0];
    stripe.pay(newer.stripeInvoiceId);
    var reads0 = stripe.calls.filter(function (c) { return c === 'invoices.retrieve'; }).length;
    var one = await call(stripe.event('invoice.paid', newer.stripeInvoiceId), 'signed');
    var reads = stripe.calls.filter(function (c) { return c === 'invoices.retrieve'; }).length - reads0, seen = one.body.package.reconciled.invoices;
    ok('a package invoice.paid reconciles only the invoice it is about (a long history never delays it)', !!cyc && one.code === 200 && seen.length === 1
      && seen[0].invoiceId === newer.stripeInvoiceId && seen[0].state === 'paid' && reads === 1 && db.data.get(root + '/billing/current').packagingState === 'paid', { seen: seen, reads: reads });
    bill = db.data.get(root + '/billing/current');
    /* a paid package invoice no OMEGA record holds: a person is told, and Stripe is asked back (never absorbed with a 200) */
    var loose = await ST.driver(book(), deps).invoice(plan('OMEGA subscription stripe.example / orphan'), BP.normalize(profile), bill.stripeCustomerId);
    stripe.pay(loose.id);
    var orphan = await call(stripe.event('invoice.paid', loose.id), 'signed');
    var orphanNote = db.data.get('omega_orgs/clearsky-usa.com/notifications/billing-orphan-' + loose.id);
    ok('a paid invoice with no OMEGA record: 500 so Stripe retries, and ClearSky is told', orphan.code === 500 && orphan.body.orphan === true && orphanNote && orphanNote.staffMail === 'billingAlert' && /no OMEGA invoice record/.test(orphanNote.text), orphan.body);
    await call(stripe.event('invoice.paid', loose.id), 'signed');
    ok('...once, however often Stripe comes back', Array.from(db.data.keys()).filter(function (k) { return k.indexOf('/notifications/billing-orphan-') >= 0; }).length === 1);
    /* the tier path never writes to a packaged workspace; an old subscription still charging it is flagged */
    db.collectionGroup = function (name) {
      return { where: function (field, op, value) { return { limit: function () { return { get: async function () {
        var docs = []; db.data.forEach(function (v, p) { var parts = p.split('/'); if (parts[parts.length - 2] === name && v[field] === value) docs.push({ ref: { parent: { parent: { id: parts[parts.length - 3] } } } }); });
        return { empty: !docs.length, docs: docs };
      } }; } }; } };
    };
    var beforeTier = JSON.stringify([db.data.get(root), db.data.get(root + '/billing/current')]);
    var tierEvt = { id: 'evt_oldtier', type: 'invoice.paid', created: 1790000000, data: { object: { id: 'in_oldtier', object: 'invoice', customer: bill.stripeCustomerId, metadata: {}, amount_paid: 9900, lines: { data: [{ period: { end: 1792600000 } }] } } } };
    var tier = await call(tierEvt, 'signed');
    ok('a non-package invoice on a packaged workspace\'s customer: answered once, nothing written', tier.code === 200 && /packaged workspace/.test(tier.body.ignored || '') && JSON.stringify([db.data.get(root), db.data.get(root + '/billing/current')]) === beforeTier, tier.body);
    ok('...and ClearSky is told an old subscription may still be charging it', /cancel it in Stripe/.test((db.data.get('omega_orgs/clearsky-usa.com/notifications/billing-review-legacy-evt_oldtier') || {}).text || ''));
    db.data.get(root + '/billing/current').legacyStripeCustomerId = 'cus_movedoff';
    var movedOff = await call({ id: 'evt_movedoff', type: 'invoice.paid', created: 1790000000, data: { object: { id: 'in_movedoff', object: 'invoice', customer: 'cus_movedoff', metadata: {} } } }, 'signed');
    ok('an event on the tier customer a workspace moved off still finds it, and is flagged, never applied', movedOff.code === 200 && /packaged workspace/.test(movedOff.body.ignored || '') && !!db.data.get('omega_orgs/clearsky-usa.com/notifications/billing-review-legacy-evt_movedoff'), movedOff.body);
    var nobody = await call({ id: 'evt_nobody', type: 'invoice.paid', created: 1790000000, data: { object: { id: 'in_x', object: 'invoice', customer: 'cus_nobody', metadata: {} } } }, 'signed');
    ok('an event for no workspace is answered once', nobody.code === 200 && /no org/.test(nobody.body.ignored || ''));
    delete db.collectionGroup;
    env({ PACKAGING_BILLING_ENABLED: 'false' });
    var off = await call(stripe.event('invoice.paid', inv.stripeInvoiceId), 'signed');
    env({ PACKAGING_BILLING_ENABLED: 'true' });
    ok('billing switched off: acknowledged (Stripe stops retrying), nothing written', off.code === 200 && off.body.package && /disabled/.test(off.body.package.ignored || ''), off.body);
  } finally { Module._load = load; Hook && (Hook.deps = null); }
}

async function legacyEndpointChecks() {
  console.log('\nthe legacy invoice list and portal: verified people only, and never a package\'s invoices');
  var db = fixture(); db.data.get(root + '/billing/current').stripeCustomerId = 'cus_pkg'; db.data.get(root + '/billing/current').packaged = true;
  var invoicesApi = require('../api/stripe-invoices'), portalApi = require('../api/stripe-portal');
  function post(api, body) { return new Promise(function (resolve) { var res = { code: 200, setHeader: function () {}, status: function (c) { res.code = c; return res; }, json: function (b) { resolve({ code: res.code, body: b }); }, end: function () { resolve({ code: res.code }); } };
    Promise.resolve(api({ method: 'POST', body: body || {}, headers: {} }, res)).then(function (out) { if (out !== undefined) resolve({ code: 200, body: out }); }, function (e) { resolve({ code: e.status || 500, body: { error: e.message } }); }); }); }
  var saved = CALLER.claims, role = CALLER.role; CALLER.claims = {}; CALLER.role = 'member';
  var r1 = await post(invoicesApi); ok('an unverified member at the domain gets no invoices', r1.code === 403 && /Verified email/.test(r1.body.error), r1);
  var r2 = await post(portalApi); ok('...and no billing portal', r2.code === 403, r2);
  /* an owner of an ACTIVE client needs no verified email (admin.clientAdmin, #200): a Team invitation leaves it unverified */
  CALLER.role = 'owner';
  var r1b = await post(invoicesApi); ok('an unverified owner of an active client reads its invoice list (#200)', r1b.code === 200, r1b);
  db.data.get(root).status = 'pending';
  var r2b = await post(portalApi); ok('...but not while the workspace is pending', r2b.code === 403 && /Verified email/.test(r2b.body.error), r2b);
  db.data.get(root).status = 'active'; CALLER.role = role;
  CALLER.claims = { email_verified: true };
  var r3 = await post(invoicesApi); ok('a packaged workspace\'s invoices are Plan & billing\'s, never this list', r3.code === 200 && r3.body.connected === false && r3.body.invoices.length === 0, r3);
  CALLER.claims = saved;
}
async function pricebookChecks() {
  console.log('\nthe price book turns on for the Stripe rail without QuickBooks items');
  var PE = require('../api/_lib/pricebook-enable'), db = new DB(); db.serial = true;
  var b = B.proposed(); db.seed('pricebook/' + b.version, b);
  var st = await PE.status(db, { Q: { load: async function () { return null; } } });
  ok('the staff page is told the rail and the mode, and no binding is asked of Stripe', st.provider === 'stripe' && st.mode === 'sandbox' && st.items.missing.length > 0);
  var dry = await PE.enable(db, false);
  ok('the dry run names Stripe and no QuickBooks company', dry.provider === 'stripe' && dry.realm === null && dry.dryRun === true && db.data.get('pricebook/' + b.version).enabled === false);
  await refused('it still needs the hash it showed', function () { return PE.enable(db, true, 'wrong'); }, /expected-hash/);
  await PE.enable(db, true, dry.expectedHash);
  ok('enabled with every QuickBooks item unbound: Stripe is handed amounts, not items', db.data.get('pricebook/' + b.version).enabled === true);
  var db2 = new DB(); db2.serial = true; db2.seed('pricebook/' + b.version, B.proposed());
  env({ STRIPE_SECRET_KEY: 'sk_live_double' });
  await refused('a live key without the live switch enables nothing', function () { return PE.enable(db2, false); }, /test key/);
  env({ STRIPE_SECRET_KEY: 'sk_test_double', PACKAGING_PROVIDER: 'quickbooks', QBO_ENV: 'sandbox' });
  await refused('on the QuickBooks rail the binding still comes first', function () { return PE.enable(db2, false); }, /Bind every QuickBooks item/);
  env({ PACKAGING_PROVIDER: 'stripe', QBO_ENV: null });
}

(async function () {
  await driverChecks();
  await engineChecks();
  await webhookChecks();
  await legacyEndpointChecks();
  await pricebookChecks();
  console.log('\nstripe billing: ' + count + ' passed, 0 failed');
})().catch(function (e) { console.error(e); process.exit(1); });
