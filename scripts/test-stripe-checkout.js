#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-stripe-checkout.js — a workspace pays its plan by card
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   api/stripe-checkout.js and its branch in api/stripe-webhook.js, end to end
   offline over the Firestore double with a stubbed `stripe` module and no
   network (Tommy, 2026-09-27: Plan & billing's Payment method said "Ask
   ClearSky"; "that should be where stripe lives and they can input and make
   a payment"):
     · Pay by card charges what billing/current says is owed, never the
       browser's number, on Stripe's Checkout, keeping the card;
     · the doors it refuses (a package, QuickBooks, a Stripe subscription or
       open invoice, nothing owed, a member, an unverified email, no key);
     · the webhook and the page's return record the payment ONCE: amountDue
       less what was paid, lastPaidAt, the next due a month on, a history row,
       the card as the customer's default, one alert to ClearSky;
     · the receipt invoice never reaches the tenant branch (which would move
       subscriptionDue to the day it was paid), and the tenant branch still
       answers everything else;
     · Add a card saves one and charges nothing;
     · /api/stripe-invoices names the card on file and stores nothing.
     node scripts/test-stripe-checkout.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var assert = require('node:assert/strict'), Module = require('module'), Readable = require('stream').Readable;
var FD = require('./_lib/firestore-double'), DB = FD.DB, mock = FD.mock;
var db;
var A = { db: function () { return db; }, safeOrg: function (v) { v = String(v || '').toLowerCase(); return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v) ? v : ''; }, httpError: function (s, m) { var e = new Error(m); e.status = s; return e; },
  authenticate: async function (r) { return r.caller; }, handler: function (f) { return f; }, isDegraded: function () { return false; },
  isTenantAdmin: async function (c, o) {
    if (c.staff) return true;
    if (c.orgId !== o) return false;
    var m = await db.collection('omega_orgs').doc(o).collection('members').doc(c.uid).get();
    return m.exists && m.data().status !== 'disabled' && (m.data().role === 'owner' || m.data().role === 'admin');
  },
  canActInOrg: async function (c, o) { return c.staff || c.orgId === o; },
  FieldValue: function () { return { serverTimestamp: function () { return '2026-09-27T16:17:00Z'; } }; } };
mock('../api/_lib/admin', A);
mock('../api/_lib/qbo-sales', { invoice: async function () { throw new Error('no QuickBooks in this test'); }, reconcile: async function () { throw new Error('no QuickBooks in this test'); } });
mock('../api/_lib/qbo', { load: async function () { return {}; } });

/* ── the Stripe stub: remembers what it made; the webhook's constructEvent
   hands back whatever event the test queued (the signature is Stripe's) ── */
var S, nextEvent;
function resetStripe() {
  S = { seq: 0, customers: {}, created: [], updates: [], sessions: {}, made: [], keys: [], open: [], intents: {}, setups: {}, retrieveFails: false };
  nextEvent = null;
}
function fakeStripe(key) {
  return {
    customers: {
      create: async function (p, o) { var id = 'cus_N' + (++S.seq); S.created.push({ params: p, opts: o, key: key }); S.customers[id] = Object.assign({ id: id, object: 'customer', invoice_settings: {} }, JSON.parse(JSON.stringify(p))); return S.customers[id]; },
      retrieve: async function (id, o) {
        if (S.retrieveFails) throw new Error('Stripe is down');
        var c = S.customers[id]; if (!c) { var e = new Error('No such customer'); e.code = 'resource_missing'; e.statusCode = 404; throw e; }
        c = JSON.parse(JSON.stringify(c));
        if (o && o.expand && typeof c.invoice_settings.default_payment_method === 'string') c.invoice_settings.default_payment_method = S.pms[c.invoice_settings.default_payment_method] || c.invoice_settings.default_payment_method;
        return c;
      },
      update: async function (id, p) { S.updates.push({ id: id, params: p }); S.customers[id].invoice_settings = Object.assign({}, S.customers[id].invoice_settings, p.invoice_settings); return S.customers[id]; }
    },
    checkout: { sessions: {
      create: async function (p, o) { var id = 'cs_test_' + (++S.seq); S.made.push(p); S.keys.push(o && o.idempotencyKey); S.sessions[id] = Object.assign({ id: id, object: 'checkout.session', status: 'open', payment_status: 'unpaid', url: 'https://checkout.stripe.com/c/pay/' + id }, JSON.parse(JSON.stringify(p))); return S.sessions[id]; },
      retrieve: async function (id) { var s = S.sessions[id]; if (!s) { var e = new Error('No such session'); e.statusCode = 404; throw e; } return JSON.parse(JSON.stringify(s)); }
    } },
    invoices: { list: async function (p) { return { data: p.status === 'open' ? S.open.slice() : (S.invoiceList || []).slice() }; } },
    paymentIntents: { retrieve: async function (id) { return JSON.parse(JSON.stringify(S.intents[id])); } },
    setupIntents: { retrieve: async function (id) { return JSON.parse(JSON.stringify(S.setups[id])); } },
    paymentMethods: { list: async function () { return { data: S.attached || [] }; } },
    webhooks: { constructEvent: function (buf, sig) { if (sig !== 'good') throw new Error('bad'); return nextEvent; } }
  };
}
var load = Module._load;
Module._load = function (request) { if (request === 'stripe') return fakeStripe; return load.apply(this, arguments); };
process.env.STRIPE_SECRET_KEY = 'sk_test_fixture'; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fixture';

var checkout = require('../api/stripe-checkout'), hook = require('../api/stripe-webhook'), invoicesApi = require('../api/stripe-invoices');
var alerts;
checkout.deps = { mail: { templates: {
  paidAlert: async function (o) { alerts.push(Object.assign({ kind: 'paid' }, o)); },
  billingAlert: async function (o) { alerts.push(Object.assign({ kind: 'review' }, o)); }
} } };

var ORG = 'concordenergyusa.com', O = 'omega_orgs/' + ORG, B = O + '/billing/current';
var ADMIN = { uid: 'u-admin', email: 'test@concordenergyusa.com', orgId: ORG, staff: false, claims: { email_verified: true } };
var MEMBER = { uid: 'u-member', email: 'rep@concordenergyusa.com', orgId: ORG, staff: false, claims: { email_verified: true } };
var UNVERIFIED = { uid: 'u-admin', email: 'test@concordenergyusa.com', orgId: ORG, staff: false, claims: { email_verified: false } };
var OUTSIDER = { uid: 'u-out', email: 'ann@northstar.example', orgId: 'northstar.example', staff: false, claims: { email_verified: true } };
var STAFF = { uid: 'tom', email: 'tom@clearsky-usa.com', orgId: 'clearsky-usa.com', staff: true, claims: { email_verified: true } };
var CONCORD = { tier: 'standard', addons: ['engineering', 'schematics', 'exports', 'permitting'], toolOverrides: {}, paymentProvider: 'manual', amountDue: 1299, subscriptionDue: '2026-09-02', lastPaidAt: '2026-08-02', amountPaid: 1299 };

function seed(billing, noRecord) {
  db = new DB(); resetStripe(); alerts = [];
  db.seed(O, { name: 'Concord Energy', status: 'active' });
  if (!noRecord) db.seed(B, Object.assign({}, CONCORD, billing || {}));
  db.seed(O + '/members/u-admin', { email: ADMIN.email, role: 'admin', status: 'active' });
  db.seed(O + '/members/u-member', { email: MEMBER.email, role: 'member', status: 'active' });
}
function bill() { return db.data.get(B); }
function history() { var out = []; db.data.forEach(function (v, k) { if (k.indexOf(B + '/history/') === 0) out.push(Object.assign({ _id: k.slice((B + '/history/').length) }, v)); }); return out; }
var res = { headers: {}, setHeader: function (k, v) { this.headers[k] = v; } };
function post(body, caller, host) { return checkout({ method: 'POST', body: body, caller: caller, headers: { host: host || 'silmarillion.clearskyomega.com' } }, res); }
async function rejects(p, status, re) { try { await p; } catch (e) { assert.equal(e.status, status, e.message); if (re) assert.match(e.message, re); return e; } throw new Error('expected a ' + status); }
var count = 0; async function test(name, fn) { await fn(); count++; console.log('PASS ' + name); }

/* what Stripe holds once the person has paid on Checkout: the session complete and paid, its intent succeeded */
function completePay(id, amount) {
  var s = S.sessions[id]; s.status = 'complete'; s.payment_status = 'paid'; s.amount_total = amount == null ? s.line_items[0].price_data.unit_amount : amount;
  s.payment_intent = 'pi_' + id; s.invoice = 'in_' + id;
  S.intents[s.payment_intent] = { id: s.payment_intent, object: 'payment_intent', status: 'succeeded', payment_method: 'pm_' + id, metadata: s.metadata };
  return s;
}
function completeCard(id) {
  var s = S.sessions[id]; s.status = 'complete'; s.setup_intent = 'seti_' + id;
  S.setups[s.setup_intent] = { id: s.setup_intent, object: 'setup_intent', status: 'succeeded', payment_method: 'pm_' + id, metadata: s.metadata };
  return s;
}
async function deliver(evt) {
  nextEvent = evt;
  var req = Readable.from([Buffer.from(JSON.stringify({ id: evt.id }))]); req.method = 'POST'; req.headers = { 'stripe-signature': 'good' };
  var out = { code: 0, body: null, status: function (c) { this.code = c; return this; }, json: function (b) { if (this.body == null) this.body = b; return this; }, send: function (b) { this.body = b; return this; }, end: function () { return this; } };
  await hook(req, out); return out;
}
function evt(id, type, object) { return { id: id, type: type, created: Math.floor(Date.parse('2026-09-27T16:17:00Z') / 1000), data: { object: JSON.parse(JSON.stringify(object)) } }; }
function lastSession() { return Object.keys(S.sessions).map(function (k) { return S.sessions[k]; }).pop(); }

(async function () {
  await test('Pay by card: an administrator is sent to Stripe Checkout for what the RECORD says is owed ($1,299), never the browser\'s number, card only, the card kept for the next payment', async function () {
    seed();
    var r = await post({ action: 'pay', amountDue: 1, amount: 1, orgId: ORG }, ADMIN);
    assert.match(r.url, /^https:\/\/checkout\.stripe\.com\//);
    assert.equal(r.display, '$1,299');
    var p = S.made[0];
    assert.equal(p.mode, 'payment');
    assert.deepEqual(p.payment_method_types, ['card']);
    assert.equal(p.line_items.length, 1);
    assert.equal(p.line_items[0].price_data.unit_amount, 129900);
    assert.equal(p.line_items[0].price_data.currency, 'usd');
    assert.equal(p.line_items[0].price_data.product_data.name, 'OMEGA Standard plan');
    assert.match(p.line_items[0].price_data.product_data.description, /Concord Energy · due 2026-09-02/);
    assert.equal(p.payment_intent_data.setup_future_usage, 'off_session');
    assert.equal(p.customer, 'cus_N1');
    assert.deepEqual([p.metadata.omegaPlanPay, p.metadata.orgId, p.metadata.cents, p.metadata.due, p.metadata.by], ['true', ORG, '129900', '2026-09-02', ADMIN.email]);
    assert.equal(p.payment_intent_data.metadata.omegaPlanPay, 'true', 'the intent carries the mark');
    assert.equal(p.invoice_creation.enabled, true);
    assert.equal(p.invoice_creation.invoice_data.metadata.omegaPlanPay, 'true', 'the receipt invoice carries the mark');
    assert.equal(p.success_url, 'https://silmarillion.clearskyomega.com/workspace?paid={CHECKOUT_SESSION_ID}#billing');
    assert.equal(p.cancel_url, 'https://silmarillion.clearskyomega.com/workspace#billing');
    assert(S.keys[0] && S.keys[0].length <= 255, 'an idempotency key within Stripe\'s limit');
    /* the customer: the legacy tenant mark, never a package's omegaOrg; written back before Checkout opens */
    assert.equal(S.created.length, 1);
    assert.equal(S.created[0].params.metadata.orgId, ORG);
    assert.equal(S.created[0].params.metadata.omegaOrg, undefined);
    assert.equal(S.created[0].params.name, 'Concord Energy');
    assert.equal(bill().stripeCustomerId, 'cus_N1');
    assert.deepEqual([bill().paymentProvider, bill().amountDue, bill().subscriptionDue], ['manual', 1299, '2026-09-02'], 'nothing is recorded as paid until Stripe says so');
    assert.equal(history().length, 0);
    /* a second click finds the customer on the record */
    await post({ action: 'pay' }, ADMIN);
    assert.equal(S.created.length, 1, 'one Stripe customer per workspace');
    assert.equal(S.made[1].customer, 'cus_N1');
    assert.equal(S.keys[1], S.keys[0], 'the same person, amount and due ask Stripe for the same session');
  });

  await test('the address Stripe returns to is the host the person came from, else the open host', async function () {
    seed();
    await post({ action: 'pay' }, ADMIN, 'concord.clearskyomega.com');
    assert.equal(S.made[0].success_url, 'https://concord.clearskyomega.com/workspace?paid={CHECKOUT_SESSION_ID}#billing');
    await post({ action: 'pay' }, ADMIN, 'bad host/../x');
    assert.equal(S.made[1].success_url, 'https://silmarillion.clearskyomega.com/workspace?paid={CHECKOUT_SESSION_ID}#billing');
  });

  await test('refused, and no Checkout opens: a member, an unverified email, another workspace, a package, QuickBooks, a Stripe subscription, an open Stripe invoice, nothing owed, no record, no key', async function () {
    seed(); await rejects(post({ action: 'pay' }, MEMBER), 403, /owner or administrator/);
    seed(); await rejects(post({ action: 'pay' }, UNVERIFIED), 403, /confirm your email/);
    seed(); await rejects(post({ action: 'pay', orgId: ORG }, OUTSIDER), 403);
    seed({ packaged: true }); await rejects(post({ action: 'pay' }, ADMIN), 409, /each invoice’s own page/);
    seed({ packaged: true }); await rejects(post({ action: 'card' }, ADMIN), 409, /each invoice’s own page/);
    seed({ paymentProvider: 'quickbooks' }); await rejects(post({ action: 'pay' }, ADMIN), 409, /QuickBooks/);
    seed({ paymentProvider: 'stripe', stripeSubscriptionId: 'sub_1' }); await rejects(post({ action: 'pay' }, ADMIN), 409, /Stripe subscription/);
    seed({ amountDue: 0 }); await rejects(post({ action: 'pay' }, ADMIN), 409, /Nothing is owed/);
    seed({ amountDue: 0.3 }); await rejects(post({ action: 'pay' }, ADMIN), 409, /under \$0\.50/);
    seed({ amountDue: 1000000 }); await rejects(post({ action: 'pay' }, ADMIN), 409, /by invoice/);
    seed(null, true); await rejects(post({ action: 'pay' }, ADMIN), 409, /no billing record/);
    seed(); await rejects(post({ action: 'refund' }, ADMIN), 400);
    seed(); S.customers.cus_OLD = { id: 'cus_OLD', invoice_settings: {}, metadata: { orgId: ORG } }; db.seed(B, Object.assign({}, CONCORD, { stripeCustomerId: 'cus_OLD' }));
    S.open = [{ id: 'in_open', status: 'open', hosted_invoice_url: 'https://invoice.stripe.com/i/x' }];
    await rejects(post({ action: 'pay' }, ADMIN), 409, /open Stripe invoice/);
    seed(); S.customers.cus_OTHER = { id: 'cus_OTHER', invoice_settings: {}, metadata: { orgId: 'northstar.example' } }; db.seed(B, Object.assign({}, CONCORD, { stripeCustomerId: 'cus_OTHER' }));
    await rejects(post({ action: 'pay' }, ADMIN), 409, /marked for another/);
    seed(); db.seed(B, Object.assign({}, CONCORD, { stripeCustomerId: 'cus_GONE' }));
    await rejects(post({ action: 'pay' }, ADMIN), 409, /not in this Stripe account/);
    seed(); delete process.env.STRIPE_SECRET_KEY;
    try { await rejects(post({ action: 'pay' }, ADMIN), 503, /not switched on/); } finally { process.env.STRIPE_SECRET_KEY = 'sk_test_fixture'; }
    assert.equal(S.made.length, 0, 'no Checkout session was opened by any refusal');
    /* ClearSky staff may act for a tenant (the page's own rule); a Stripe-tier customer made by stripe-create is used as it is */
    seed({ paymentProvider: 'stripe' }); S.customers.cus_OLD = { id: 'cus_OLD', invoice_settings: {}, metadata: { orgId: ORG } }; db.seed(B, Object.assign({}, CONCORD, { paymentProvider: 'stripe', stripeCustomerId: 'cus_OLD' }));
    await post({ action: 'pay', orgId: ORG }, STAFF);
    assert.equal(S.made[0].customer, 'cus_OLD'); assert.equal(S.created.length, 0);
  });

  await test('the webhook records the payment ONCE: amountDue less what was paid, last payment, the next due a month on, a history row, the card as the default, one alert to ClearSky', async function () {
    seed();
    await post({ action: 'pay' }, ADMIN);
    var s = completePay(lastSession().id);
    var out = await deliver(evt('evt_1', 'checkout.session.completed', s));
    assert.equal(out.code, 200);
    assert.equal(out.body.planPay.state, 'paid');
    var b = bill();
    assert.deepEqual([b.amountDue, b.amountPaid, b.paymentProvider, b.stripeCustomerId, b.subscriptionDue, b.paymentFailedAt], [0, 1299, 'stripe', 'cus_N1', '2026-10-02', null]);
    assert.match(b.lastPaidAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.notEqual(b.lastPaidAt, '2026-08-02');
    assert.deepEqual([b.tier, b.addons.length], ['standard', 4], 'the plan itself is untouched');
    var h = history();
    assert.equal(h.length, 1);
    assert.equal(h[0]._id, 'stripe-' + s.id);
    assert.deepEqual([h[0].source, h[0].via, h[0].amountCents, h[0].by, h[0].was.amountDue, h[0].was.subscriptionDue, h[0].was.paymentProvider], ['stripe-checkout', 'webhook', 129900, ADMIN.email, 1299, '2026-09-02', 'manual']);
    assert.deepEqual(S.updates, [{ id: 'cus_N1', params: { invoice_settings: { default_payment_method: 'pm_' + s.id } } }]);
    assert.equal(alerts.length, 1);
    assert.deepEqual([alerts[0].kind, alerts[0].company, alerts[0].amountDisplay, alerts[0].payWith], ['paid', 'Concord Energy', '$1,299', 'Stripe']);
    /* Stripe delivers it again: nothing moves twice */
    var again = await deliver(evt('evt_1', 'checkout.session.completed', s));
    assert.equal(again.body.planPay.duplicate, true);
    assert.equal(history().length, 1); assert.equal(bill().subscriptionDue, '2026-10-02'); assert.equal(alerts.length, 1);
    /* the receipt invoice Checkout made: ours, acknowledged, never the tenant branch (which would set subscriptionDue to the day it was paid) */
    var receipt = await deliver(evt('evt_2', 'invoice.paid', { id: 'in_' + s.id, object: 'invoice', customer: 'cus_N1', metadata: s.metadata, lines: { data: [{ period: { start: 1790000000, end: 1790000000 } }] } }));
    assert.equal(receipt.code, 200); assert.equal(receipt.body.planPay.ignored.indexOf('invoice.paid'), 0);
    assert.equal(bill().subscriptionDue, '2026-10-02'); assert.equal(bill().lastStripeEvent, undefined);
    var intent = await deliver(evt('evt_3', 'payment_intent.succeeded', S.intents[s.payment_intent]));
    assert.equal(intent.body.planPay.planPay, true);
  });

  await test('back from Stripe the page confirms the same session: recorded once, whichever door is first; another workspace\'s session, an open one and an expired one', async function () {
    seed();
    await post({ action: 'pay' }, ADMIN);
    var id = lastSession().id;
    var open = await post({ action: 'confirm', sessionId: id }, ADMIN);
    assert.equal(open.state, 'open'); assert.equal(history().length, 0); assert.equal(bill().amountDue, 1299);
    completePay(id);
    var r = await post({ action: 'confirm', sessionId: id }, ADMIN);
    assert.deepEqual([r.state, r.display, r.amountDue, r.subscriptionDue], ['paid', '$1,299', 0, '2026-10-02']);
    assert.equal(history()[0].via, 'return');
    var late = await deliver(evt('evt_9', 'checkout.session.completed', S.sessions[id]));
    assert.equal(late.body.planPay.duplicate, true); assert.equal(history().length, 1); assert.equal(alerts.length, 1);
    await rejects(post({ action: 'confirm', sessionId: 'not-a-session' }, ADMIN), 400);
    await rejects(post({ action: 'confirm', sessionId: id }, MEMBER), 403);
    /* a session made for another workspace is never recorded here */
    S.sessions.cs_test_elsewhere = { id: 'cs_test_elsewhere', object: 'checkout.session', mode: 'payment', status: 'complete', payment_status: 'paid', metadata: { omegaPlanPay: 'true', orgId: 'northstar.example' } };
    await rejects(post({ action: 'confirm', sessionId: 'cs_test_elsewhere' }, ADMIN), 404);
    seed(); await post({ action: 'pay' }, ADMIN); S.sessions[lastSession().id].status = 'expired';
    assert.equal((await post({ action: 'confirm', sessionId: lastSession().id }, ADMIN)).state, 'expired');
    assert.equal(history().length, 0);
  });

  await test('Add a card: Checkout saves a card and charges nothing; recorded as the plan\'s card with nothing owed changed and no alert', async function () {
    seed({ amountDue: 0, subscriptionDue: '2026-10-02' });
    var r = await post({ action: 'card' }, ADMIN);
    assert.match(r.url, /^https:\/\/checkout\.stripe\.com\//);
    var p = S.made[0];
    assert.equal(p.mode, 'setup'); assert.deepEqual(p.payment_method_types, ['card']); assert.equal(p.line_items, undefined);
    assert.equal(p.setup_intent_data.metadata.omegaPlanPay, 'true');
    assert.equal(p.success_url, 'https://silmarillion.clearskyomega.com/workspace?card={CHECKOUT_SESSION_ID}#billing');
    var s = completeCard(lastSession().id);
    var out = await deliver(evt('evt_c', 'checkout.session.completed', s));
    assert.equal(out.body.planPay.state, 'saved');
    var b = bill();
    assert.deepEqual([b.paymentProvider, b.stripeCustomerId, b.amountDue, b.subscriptionDue, b.lastPaidAt], ['stripe', 'cus_N1', 0, '2026-10-02', '2026-08-02']);
    assert.equal(history()[0].mode, 'setup'); assert.equal(history()[0].amountCents, undefined);
    assert.deepEqual(S.updates[0].params.invoice_settings, { default_payment_method: 'pm_' + s.id });
    assert.equal(alerts.length, 0, 'a saved card is not money');
  });

  await test('what the record says wins: ClearSky raises what is owed after Checkout opened (the rest stays owed, the due stays), lowers it (nothing owed, the overpayment is on the row), or the workspace moves onto a package (money kept, the record untouched, a person looks)', async function () {
    seed(); await post({ action: 'pay' }, ADMIN); var s1 = completePay(lastSession().id);
    db.seed(B, Object.assign({}, bill(), { amountDue: 2598 }));
    await deliver(evt('evt_a', 'checkout.session.completed', s1));
    assert.deepEqual([bill().amountDue, bill().subscriptionDue], [1299, '2026-09-02']);
    assert.match(alerts[0].what, /\$1,299 still owed/);
    seed(); await post({ action: 'pay' }, ADMIN); var s2 = completePay(lastSession().id);
    db.seed(B, Object.assign({}, bill(), { amountDue: 1000 }));
    await deliver(evt('evt_b', 'checkout.session.completed', s2));
    assert.deepEqual([bill().amountDue, bill().subscriptionDue, history()[0].overpaidCents], [0, '2026-10-02', 29900]);
    assert.match(alerts[0].what, /\$299 more than was owed/);
    seed(); await post({ action: 'pay' }, ADMIN); var s3 = completePay(lastSession().id);
    db.seed(B, Object.assign({}, bill(), { subscriptionDue: '2026-09-15' }));
    await deliver(evt('evt_d', 'checkout.session.completed', s3));
    assert.deepEqual([bill().amountDue, bill().subscriptionDue], [0, '2026-09-15'], 'a due ClearSky changed meanwhile is not moved');
    seed(); await post({ action: 'pay' }, ADMIN); var s4 = completePay(lastSession().id);
    db.seed(B, Object.assign({}, bill(), { packaged: true }));
    var out = await deliver(evt('evt_p', 'checkout.session.completed', s4));
    assert.equal(out.body.planPay.state, 'review');
    assert.deepEqual([bill().amountDue, bill().paymentProvider], [1299, 'manual']);
    assert.match(history()[0].review, /package/);
    assert.equal(alerts[0].kind, 'review'); assert.match(alerts[0].text, /\$1,299 was paid by card/);
  });

  await test('the next due: the same day next month, the month\'s last day when it is shorter, a year on for an annual plan; a date stays a date, a time stays a time', async function () {
    var N = checkout.nextDue;
    assert.equal(N('2026-09-02'), '2026-10-02');
    assert.equal(N('2026-01-31'), '2026-02-28');
    assert.equal(N('2024-01-31'), '2024-02-29');
    assert.equal(N('2026-12-15'), '2027-01-15');
    assert.equal(N('2026-09-02', true), '2027-09-02');
    assert.equal(N('2026-09-02T00:00:00.000Z'), '2026-10-02T00:00:00.000Z');
    assert.equal(N({ seconds: Date.parse('2026-03-31T00:00:00Z') / 1000 }), '2026-04-30T00:00:00.000Z');
    assert.equal(N(null), null);
    seed({ interval: 'annual', amountDue: 12990 }); await post({ action: 'pay' }, ADMIN); await deliver(evt('evt_y', 'checkout.session.completed', completePay(lastSession().id)));
    assert.equal(bill().subscriptionDue, '2027-09-02');
  });

  await test('the tenant branch still answers every other Stripe event exactly as before', async function () {
    seed({ paymentProvider: 'stripe', stripeCustomerId: 'cus_T' });
    var out = await deliver(evt('evt_t', 'invoice.paid', { id: 'in_t', object: 'invoice', customer: 'cus_T', metadata: { orgId: ORG }, lines: { data: [{ period: { start: 1790000000, end: 1792600000 } }] } }));
    assert.equal(out.code, 200); assert.equal(out.body.planPay, undefined);
    assert.deepEqual([bill().amountDue, bill().lastStripeEvent, bill().subscriptionDue], [0, 'invoice.paid', new Date(1792600000 * 1000).toISOString()]);
    assert.equal(history().length, 0);
  });

  await test('/api/stripe-invoices names the card on file (the invoice default, else the first card), read from Stripe each time; no card or a refusal is null, and the invoices still list', async function () {
    seed({ paymentProvider: 'stripe', stripeCustomerId: 'cus_T' });
    S.pms = { pm_v: { id: 'pm_v', card: { brand: 'visa', last4: '4242', exp_month: 12, exp_year: 2028 } } };
    S.customers.cus_T = { id: 'cus_T', invoice_settings: { default_payment_method: 'pm_v' }, metadata: { orgId: ORG } };
    S.invoiceList = [{ id: 'in_1', number: 'CC-0001', status: 'paid', created: 1790000000, amount_due: 129900, amount_paid: 129900, hosted_invoice_url: 'https://invoice.stripe.com/i/1' }];
    var r = await invoicesApi({ method: 'POST', body: {}, caller: ADMIN, headers: {} }, res);
    assert.deepEqual(r.card, { brand: 'visa', last4: '4242', expMonth: 12, expYear: 2028 });
    assert.equal(r.invoices[0].amountDue, 1299);
    S.customers.cus_T.invoice_settings = {}; S.attached = [{ id: 'pm_m', card: { brand: 'mastercard', last4: '4444', exp_month: 1, exp_year: 2030 } }];
    assert.equal((await invoicesApi({ method: 'POST', body: {}, caller: ADMIN, headers: {} }, res)).card.last4, '4444');
    S.attached = [];
    assert.equal((await invoicesApi({ method: 'POST', body: {}, caller: ADMIN, headers: {} }, res)).card, null);
    S.retrieveFails = true;
    var down = await invoicesApi({ method: 'POST', body: {}, caller: ADMIN, headers: {} }, res);
    assert.equal(down.card, null); assert.equal(down.invoices.length, 1);
    assert.equal(JSON.stringify(bill()).indexOf('4242'), -1, 'nothing about the card is stored');
  });

  console.log('\n' + count + ' passed');
})().catch(function (e) { console.error('FAIL', e); process.exit(1); });
