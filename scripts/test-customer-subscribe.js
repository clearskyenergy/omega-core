#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-customer-subscribe.js — the money a supplier's customer sees
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Two things, end to end offline over the Firestore double, with a stubbed
   `stripe` module and no network:
   1. Editor Lite for the CUSTOMER account (api/customer-subscribe.js and its
      branch in api/stripe-webhook.js): the offer, Checkout with the
      supplier's price and our metadata, the grant on the ACCOUNT from the
      webhook (granted, past due, revoked, deduped, never the tenant's own
      billing), the billing portal, and the prices in api/tenant-billing.js.
   2. Tenant-billed pay links (api/logic-office.js invoice-issued →
      api/_lib/logic-workflow.js → api/_lib/portal.js): https only, stored on
      the invoice, shown to the customer on tenant-billed orders only.
     node scripts/test-customer-subscribe.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var assert = require('node:assert/strict'), Module = require('module'), Readable = require('stream').Readable;
var FD = require('./_lib/firestore-double'), DB = FD.DB, mock = FD.mock;
var db;
var A = { db: function () { return db; }, safeOrg: function (v) { return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v || '') ? v : ''; }, httpError: function (s, m) { var e = new Error(m); e.status = s; return e; },
  authenticate: async function (r) { return r.caller; }, handler: function (f) { return f; }, isDegraded: function () { return false; },
  canActInOrg: async function (c, o) { return c.staff || c.orgId === o; }, isTenantAdmin: async function (c, o) { return c.staff; },
  FieldValue: function () { return { serverTimestamp: function () { return '2026-09-24T12:00:00Z'; }, arrayUnion: function () { return { union: Array.from(arguments) }; } }; } };
mock('../api/_lib/admin', A);
mock('../api/_lib/qbo-sales', { invoice: async function () { throw new Error('no QuickBooks in this test'); }, reconcile: async function () { throw new Error('no QuickBooks in this test'); } });
mock('../api/_lib/qbo', { load: async function () { return {}; } });

/* ── the Stripe stub: records every call; the webhook's constructEvent hands
   back whatever event the test queued (the signature check is Stripe's) ── */
var calls, nextEvent, subs, seq = 0;
function resetStripe() { seq = 0; calls = { customers: [], sessions: [], portals: [], retrieve: [] }; subs = {}; nextEvent = null; }
function fakeStripe(key) {
  return {
    customers: { create: async function (p, o) { calls.customers.push({ params: p, opts: o, key: key }); return { id: 'cus_T' + (++seq) }; } },
    checkout: { sessions: { create: async function (p) { calls.sessions.push(p); return { id: 'cs_test_' + (++seq), url: 'https://checkout.stripe.com/c/pay/cs_test_' + seq }; } } },
    billingPortal: { sessions: { create: async function (p) { calls.portals.push(p); return { url: 'https://billing.stripe.com/p/session/' + (++seq) }; } } },
    subscriptions: { retrieve: async function (id) { calls.retrieve.push(id); return JSON.parse(JSON.stringify(subs[id])); } },
    webhooks: { constructEvent: function (buf, sig, secret) { if (sig !== 'good') throw new Error('bad'); return nextEvent; } }
  };
}
var load = Module._load;
Module._load = function (request) { if (request === 'stripe') return fakeStripe; return load.apply(this, arguments); };
process.env.STRIPE_SECRET_KEY = 'sk_test_fixture'; process.env.STRIPE_WEBHOOK_SECRET = 'whsec_fixture';

var subscribe = require('../api/customer-subscribe'), hook = require('../api/stripe-webhook'), billingApi = require('../api/tenant-billing');
var D = require('../api/_lib/buyer-design'), X = require('../api/_lib/logic-access'), portal = require('../api/_lib/portal'), office = require('../api/logic-office');

var ORG = 'cleancell.us', O = 'omega_orgs/' + ORG, AMP = 'acct_amperage';
function person(email, extra) { return Object.assign({ uid: email.split('@')[0], email: email, orgId: email.split('@')[1], claims: { email_verified: true } }, extra || {}); }
var SHANNON = person('shannon@amperagecapital.com'), CFO = person('cfo@amperagecapital.com'), NEWBIE = person('new@amperagecapital.com'), STRANGER = person('nobody@elsewhere.com');
var OFFICE = { uid: 'pm', email: 'pm@cleancell.us', orgId: ORG, staff: false, claims: { email_verified: true } };
var STAFF = { uid: 'tom', email: 'tom@clearsky-usa.com', orgId: 'clearsky-usa.com', staff: true, claims: { email_verified: true } };
var res = { headers: {}, setHeader: function (k, v) { this.headers[k] = v; } };
function call(api, method, body, caller) { return api({ method: method, body: method === 'POST' ? Object.assign({ org: ORG }, body) : undefined, query: method === 'GET' ? Object.assign({ org: ORG }, body || {}) : {}, caller: caller }, res); }
async function rejects(p, status, re) { try { await p; } catch (e) { assert.equal(e.status, status, e.message); if (re) assert.match(e.message, re); return e; } throw new Error('expected a ' + status); }
var count = 0; async function test(name, fn) { await fn(); count++; console.log('PASS ' + name); }

function seed(billing) {
  db = new DB(); resetStripe();
  db.seed(O, { name: 'Clean Cell', status: 'active', whiteLabel: { enabled: true, platformName: 'Clean Cell Power Platform', attribution: 'powered-by' } });
  db.seed(O + '/billing/current', Object.assign({ addons: ['omega-logic'], status: 'active', tier: 'standard', stripeCustomerId: 'cus_TENANT', editorLite: { enabled: true, modules: ['bess'] } }, billing || {}));
  db.seed(O + '/fulfillment/config', { enabled: true, accounting: 'tenant', terms: { depositPct: 30, dueDays: 0 } });
  db.seed(O + '/members/pm', { email: 'pm@cleancell.us', role: 'admin', status: 'active' });
  db.seed(O + '/customers/' + AMP, { orgId: ORG, name: 'Amperage Capital', status: 'active', source: 'office', accountType: 'company', createdAt: '2026-09-22T00:00:00Z' });
  [['shannon', 'owner', 'active'], ['cfo', 'user', 'active'], ['new', 'user', 'pending']].forEach(function (p) {
    var email = p[0] + '@amperagecapital.com';
    db.seed(O + '/customers/' + AMP + '/users/' + email, { email: email, role: p[1], status: p[2] });
    db.seed(O + '/customer_index/' + email, { customerId: AMP });
  });
}
var PRICED = { customerEditorLite: { monthlyPriceCents: 79900, yearlyPriceCents: 799000, currency: 'USD' } };
function account() { return db.data.get(O + '/customers/' + AMP); }

/* the webhook, as Vercel calls it: raw bytes in, status + JSON out. A
   subscription event is what Stripe holds at that moment, so the stub's
   live subscription becomes the payload — unless `stale`: an event that
   arrives late, after Stripe's copy has moved on. */
async function deliver(evt, sig, stale) {
  nextEvent = evt;
  var o = evt && evt.data && evt.data.object;
  if (!stale && o && /^customer\.subscription\./.test(evt.type)) subs[o.id] = JSON.parse(JSON.stringify(o));
  var req = Readable.from([Buffer.from(JSON.stringify({ id: evt && evt.id }))]); req.method = 'POST'; req.headers = { 'stripe-signature': sig || 'good' };
  var out = { code: 0, body: null, status: function (c) { this.code = c; return this; }, json: function (b) { if (this.body == null) this.body = b; return this; }, send: function (b) { this.body = b; return this; }, end: function () { return this; } };
  await hook(req, out); return out;
}
var NOW = Math.floor(Date.parse('2026-09-24T12:00:00Z') / 1000), MONTH = 30 * 86400;
function sub(id, status, extra) {
  return Object.assign({ id: id, object: 'subscription', customer: 'cus_T1', status: status, current_period_end: NOW + MONTH, collection_method: 'charge_automatically',
    items: { data: [{ price: { recurring: { interval: 'month' }, metadata: {} } }] },
    metadata: { kind: 'customer-editor-lite', org: ORG, customerId: AMP, email: 'cfo@amperagecapital.com', plan: 'month' } }, extra || {});
}
function evt(id, type, object, created) { return { id: id, type: type, created: created || NOW, data: { object: object } }; }
async function checkoutDone(again) {
  if (!again) await call(subscribe, 'POST', { plan: 'month' }, CFO);
  subs.sub_A = sub('sub_A', 'active');
  return deliver(evt('evt_done', 'checkout.session.completed', { id: 'cs_1', object: 'checkout.session', mode: 'subscription', customer: 'cus_T1', subscription: 'sub_A',
    metadata: { kind: 'customer-editor-lite', org: ORG, customerId: AMP, email: 'cfo@amperagecapital.com', plan: 'month' } }));
}

(async function () {
  console.log('\nthe offer');
  await test('no price set (or Editor Lite off, or no Stripe key): unavailable, and checkout is refused', async function () {
    seed();
    var g = await call(subscribe, 'GET', {}, SHANNON);
    assert.equal(g.available, false); assert.equal(g.monthlyPriceCents, null); assert.equal(g.yearlyPriceCents, null); assert.equal(g.status, 'inactive'); assert.equal(g.entitled, false);
    await rejects(call(subscribe, 'POST', { plan: 'month' }, SHANNON), 409, /does not offer/);
    assert.equal(calls.sessions.length + calls.customers.length, 0, 'Stripe is never called without a price');
    seed(Object.assign({}, PRICED, { editorLite: { enabled: false, modules: ['bess'] } }));
    assert.equal((await call(subscribe, 'GET', {}, SHANNON)).available, false, 'the supplier has Editor Lite off');
    seed(PRICED); var key = process.env.STRIPE_SECRET_KEY; delete process.env.STRIPE_SECRET_KEY;
    try { assert.equal((await call(subscribe, 'GET', {}, SHANNON)).available, false, 'no Stripe key on the server'); } finally { process.env.STRIPE_SECRET_KEY = key; }
    seed({ customerEditorLite: { monthlyPriceCents: 79900 } });
    var m = await call(subscribe, 'GET', {}, SHANNON); assert.equal(m.available, true); assert.equal(m.yearlyPriceCents, null);
    await rejects(call(subscribe, 'POST', { plan: 'year' }, SHANNON), 409, /yearly/);
    await rejects(call(subscribe, 'POST', { plan: 'weekly' }, SHANNON), 400);
  });
  await test('only a verified, active person on an account sees the offer or starts a checkout', async function () {
    seed(PRICED);
    await rejects(call(subscribe, 'GET', {}, NEWBIE), 403, /waiting for approval/);
    await rejects(call(subscribe, 'POST', { plan: 'month' }, NEWBIE), 403);
    await rejects(call(subscribe, 'GET', {}, STRANGER), 403);
    await rejects(call(subscribe, 'GET', {}, person('cfo@amperagecapital.com', { claims: { email_verified: false } })), 403, /confirm your email/);
    assert.equal(calls.sessions.length, 0);
  });

  console.log('\ncheckout');
  await test('checkout: the supplier\'s price, a subscription, our metadata (never orgId), one Stripe customer per account', async function () {
    seed(PRICED);
    var g = await call(subscribe, 'GET', {}, CFO);
    assert.deepEqual([g.available, g.monthlyPriceCents, g.yearlyPriceCents, g.currency], [true, 79900, 799000, 'USD']);
    var r = await call(subscribe, 'POST', { plan: 'year' }, CFO);
    assert.match(r.url, /^https:\/\/checkout\.stripe\.com\//);
    var s = calls.sessions[0], li = s.line_items[0];
    assert.equal(s.mode, 'subscription'); assert.equal(s.customer, 'cus_T1'); assert.equal(li.quantity, 1);
    assert.deepEqual([li.price_data.currency, li.price_data.unit_amount, li.price_data.recurring.interval], ['usd', 799000, 'year']);
    assert.match(li.price_data.product_data.name, /Clean Cell Power Platform · Editor Lite/, 'white-labelled as the supplier\'s');
    var want = { kind: 'customer-editor-lite', org: ORG, customerId: AMP, email: 'cfo@amperagecapital.com', plan: 'year' };
    assert.deepEqual(s.metadata, want); assert.deepEqual(s.subscription_data.metadata, want);
    assert(!('orgId' in s.metadata) && !('orgId' in calls.customers[0].params.metadata), 'orgId would route it to the TENANT\'s billing branch');
    assert.equal(calls.customers[0].key, 'sk_test_fixture', 'the env key, as api/stripe-create.js');
    assert.match(calls.customers[0].opts.idempotencyKey, /cleancell\.us-acct_amperage/);
    assert.match(s.success_url, /^https:\/\/silmarillion\.clearskyomega\.com\/portals\/customer\/app\?org=cleancell\.us&tab=design&checkout=done$/);
    assert.match(s.cancel_url, /checkout=cancelled/);
    assert.deepEqual(db.data.get('stripe_customers/cus_T1'), Object.assign({}, db.data.get('stripe_customers/cus_T1'), { kind: 'customer-editor-lite', org: ORG, customerId: AMP }));
    assert.equal(db.data.get(O + '/billing/current').stripeCustomerId, 'cus_TENANT', 'the tenant\'s own Stripe customer is untouched');
    await call(subscribe, 'POST', { plan: 'month', from: 'portal' }, SHANNON);
    assert.equal(calls.customers.length, 1, 'a colleague\'s checkout reuses the ACCOUNT\'s Stripe customer');
    assert.equal(calls.sessions[1].customer, 'cus_T1'); assert.equal(calls.sessions[1].line_items[0].price_data.unit_amount, 79900);
    assert.match(calls.sessions[1].success_url, /\/portals\/customer\/\?org=cleancell\.us&checkout=done#design$/);
    assert(Array.from(db.data.keys()).some(function (k) { return k.indexOf('omega_audit/') === 0 && db.data.get(k).action === 'customer-editor-lite-checkout'; }));
  });

  console.log('\nthe webhook grants the ACCOUNT');
  await test('checkout completed grants the account (source provider, active, unexpired) and the design tool opens for everyone on it', async function () {
    seed(PRICED); var tenantBefore = JSON.stringify(db.data.get(O + '/billing/current'));
    var out = await checkoutDone();
    assert.equal(out.code, 200); assert.equal(out.body.customerEditorLite.applied, 'active');
    var g = account().editorLite;
    assert.deepEqual([g.source, g.status, g.plan, g.stripeCustomerId, g.stripeSubscriptionId, g.subscribedBy], ['provider', 'active', 'month', 'cus_T1', 'sub_A', 'cfo@amperagecapital.com']);
    assert.equal(g.expiresAt, new Date((NOW + MONTH) * 1000).toISOString());
    var ctx = await X.context(ORG);
    assert.equal(D.entitlement(ctx, account(), null).active, true, 'buyer-design accepts it');
    var view = await call(subscribe, 'GET', {}, SHANNON);
    assert.deepEqual([view.status, view.entitled, view.plan, view.canManage], ['active', true, 'month', true]);
    assert.equal(JSON.stringify(db.data.get(O + '/billing/current')), tenantBefore, 'the supplier\'s billing/current is not touched');
    assert.equal(db.data.get('stripe_events/evt_done').applied, 'active');
    var audit = Array.from(db.data.values()).filter(function (v) { return v && v.action === 'customer-editor-lite'; });
    assert.equal(audit.length, 1); assert.equal(audit[0].customerId, AMP); assert.equal(audit[0].grant.status, 'active'); assert.equal(audit[0].was, null);
    await rejects(call(subscribe, 'POST', { plan: 'year' }, SHANNON), 409, /already has/);
  });
  await test('the same event twice is one grant; an older event never overwrites a newer one', async function () {
    seed(PRICED); await checkoutDone();
    var again = await checkoutDone(true);
    assert.equal(again.body.customerEditorLite.duplicate, true);
    assert.equal(Array.from(db.data.values()).filter(function (v) { return v && v.action === 'customer-editor-lite'; }).length, 1);
    await deliver(evt('evt_pd', 'customer.subscription.updated', sub('sub_A', 'past_due'), NOW + 100));
    var stale = await deliver(evt('evt_old', 'customer.subscription.updated', sub('sub_A', 'active'), NOW - 100), null, true);
    assert.match(stale.body.customerEditorLite.ignored, /older/);
    assert.equal(account().editorLite.status, 'past_due');
  });
  await test('past due: no design access, but Manage stays reachable; renewed: active again', async function () {
    seed(PRICED); await checkoutDone();
    await deliver(evt('evt_pd', 'customer.subscription.updated', sub('sub_A', 'past_due'), NOW + 10));
    assert.equal(D.entitlement(await X.context(ORG), account(), null).active, false);
    var v = await call(subscribe, 'GET', {}, CFO); assert.equal(v.status, 'past_due'); assert.equal(v.canManage, true, 'the person who subscribed may manage');
    await deliver(evt('evt_ok', 'customer.subscription.updated', sub('sub_A', 'active', { current_period_end: NOW + 2 * MONTH }), NOW + 20));
    assert.equal(account().editorLite.status, 'active'); assert.equal(D.entitlement(await X.context(ORG), account(), null).active, true);
  });
  await test('cancelled: the grant is revoked; a lapse of ANOTHER subscription never revokes a trial or the live one', async function () {
    seed(PRICED); await checkoutDone();
    var other = await deliver(evt('evt_x', 'customer.subscription.deleted', sub('sub_OTHER', 'canceled'), NOW + 5));
    assert.match(other.body.customerEditorLite.ignored, /not the subscription/); assert.equal(account().editorLite.status, 'active');
    var gone = await deliver(evt('evt_del', 'customer.subscription.deleted', sub('sub_A', 'canceled', { ended_at: NOW + 50 }), NOW + 50));
    assert.equal(gone.body.customerEditorLite.applied, 'inactive');
    var g = account().editorLite; assert.equal(g.status, 'inactive'); assert.equal(g.source, 'provider');
    assert.equal(D.entitlement(await X.context(ORG), account(), null).active, false, 'revoked');
    assert.equal((await call(subscribe, 'GET', {}, SHANNON)).status, 'inactive');
    assert.equal(db.data.get(O + '/billing/current').tier, 'standard', 'a customer cancelling never sets the SUPPLIER to trial');
    /* a supplier's trial is not revoked by a stray lapse */
    seed(PRICED); db.data.get(O + '/customers/' + AMP).editorLite = { status: 'trial', source: 'owner-trial', expiresAt: '2099-01-01T00:00:00Z' };
    db.seed('stripe_customers/cus_T1', { kind: 'customer-editor-lite', org: ORG, customerId: AMP });
    await deliver(evt('evt_inc', 'customer.subscription.created', sub('sub_B', 'incomplete'), NOW));
    assert.equal(account().editorLite.source, 'owner-trial', 'an incomplete checkout leaves the trial alone');
  });
  await test('a subscription event with no metadata is still ours by the pointer; a pointer to another account is refused', async function () {
    seed(PRICED); db.seed('stripe_customers/cus_T1', { kind: 'customer-editor-lite', org: ORG, customerId: AMP });
    var bare = sub('sub_C', 'active'); bare.metadata = {};
    var r = await deliver(evt('evt_bare', 'customer.subscription.updated', bare));
    assert.equal(r.body.customerEditorLite.applied, 'active'); assert.equal(account().editorLite.stripeSubscriptionId, 'sub_C');
    var inv = await deliver(evt('evt_inv', 'invoice.paid', { id: 'in_1', customer: 'cus_T1', lines: { data: [] } }));
    assert(inv.body.customerEditorLite.ignored, 'invoice events for a customer are acknowledged, not sent to the tenant branch');
    assert.equal(db.data.get(O).status, 'active'); assert.equal(db.data.get(O + '/billing/current').lastPaidAt, undefined);
    db.seed('stripe_customers/cus_T9', { kind: 'customer-editor-lite', org: ORG, customerId: 'acct_someone_else' });
    var spoof = sub('sub_D', 'active', { customer: 'cus_T9' });
    assert.match((await deliver(evt('evt_spoof', 'customer.subscription.updated', spoof))).body.customerEditorLite.ignored, /another account/);
    assert.equal(account().editorLite.stripeSubscriptionId, 'sub_C');
  });
  await test('out of order: a late "created" never re-grants a cancelled subscription, and a stale event for an ended one never displaces the live one', async function () {
    seed(PRICED);
    /* (A) the deletion is delivered first, then the creation it followed */
    var del = await deliver(evt('evt_Adel', 'customer.subscription.deleted', sub('sub_A', 'canceled', { ended_at: NOW + 60, canceled_at: NOW + 60 }), NOW + 60));
    assert.match(del.body.customerEditorLite.ignored, /not the subscription/);
    var late = await deliver(evt('evt_Anew', 'customer.subscription.created', sub('sub_A', 'active'), NOW), null, true);
    assert.equal(late.code, 200); assert(late.body.customerEditorLite.ignored, 'Stripe holds it as canceled now');
    assert.equal(account().editorLite, undefined, 'no grant for a cancelled subscription');
    assert.equal(D.entitlement(await X.context(ORG), account(), null).active, false);
    assert.deepEqual(calls.retrieve, ['sub_A', 'sub_A'], 'every subscription event re-reads the subscription');
    /* (B) a yearly sub_B is live; a stale 'updated' for the ended sub_A arrives days late */
    var YEAR = 365 * 86400, yearly = { data: [{ price: { recurring: { interval: 'year' }, metadata: {} } }] };
    await deliver(evt('evt_Bnew', 'customer.subscription.created', sub('sub_B', 'active', { current_period_end: NOW + YEAR, items: yearly }), NOW + 100));
    assert.equal(account().editorLite.stripeSubscriptionId, 'sub_B');
    var old = await deliver(evt('evt_Aold', 'customer.subscription.updated', sub('sub_A', 'active', { current_period_end: NOW - 86400 }), NOW - 5 * 86400), null, true);
    assert(old.body.customerEditorLite.ignored);
    var g = account().editorLite;
    assert.deepEqual([g.stripeSubscriptionId, g.status, g.plan], ['sub_B', 'active', 'year'], 'the paying customer keeps the yearly grant');
    assert.equal(D.entitlement(await X.context(ORG), account(), null).active, true);
    var gone = await deliver(evt('evt_Bdel', 'customer.subscription.deleted', sub('sub_B', 'canceled', { ended_at: NOW + 200 }), NOW + 200));
    assert.equal(gone.body.customerEditorLite.applied, 'inactive', 'sub_B\'s own lapse still ends it');
  });
  await test('an event about our Stripe customer that carries no grant (customer.created / .updated) is acknowledged, never sent to the tenant branch', async function () {
    seed(PRICED); var tenantBefore = JSON.stringify(db.data.get(O + '/billing/current'));
    var cus = { id: 'cus_T1', object: 'customer', email: 'cfo@amperagecapital.com', metadata: { kind: 'customer-editor-lite', org: ORG, customerId: AMP } };
    for (var type of ['customer.created', 'customer.updated']) {
      var r = await deliver(evt('evt_' + type.replace('.', ''), type, cus));
      assert.equal(r.code, 200, type + ' must not 500 (Stripe would retry it for days)');
      assert.match(r.body.customerEditorLite.ignored, /not a grant event/);
    }
    assert.equal(calls.retrieve.length, 0); assert.equal(account().editorLite, undefined);
    assert.equal(JSON.stringify(db.data.get(O + '/billing/current')), tenantBefore, 'the supplier\'s billing/current is not touched');
  });
  await test('an event whose object has no customer (a Customer made by a payment link or in the dashboard) is acknowledged, not a 500', async function () {
    seed(PRICED); var tenantBefore = JSON.stringify(db.data.get(O + '/billing/current'));
    /* Firestore refuses where('==', undefined); the stand-in does the same */
    var lookups = [];
    db.collectionGroup = function () { return { where: function (f, op, v) { lookups.push(v); if (v === undefined) throw new Error('Cannot use "undefined" as a Firestore value'); return { limit: function () { return { get: async function () { return { empty: true, docs: [] }; } }; } }; } }; };
    try {
      for (var type of ['customer.created', 'customer.updated']) {
        var r = await deliver(evt('evt_x' + type.replace('.', ''), type, { id: 'cus_DASH', object: 'customer', email: 'someone@example.com', metadata: {} }));
        assert.equal(r.code, 200, type + ' with no customer field must not 500 (Stripe would retry it for days)');
        assert.match(String(r.body.ignored), /no customer on customer\./);
      }
      var other = await deliver(evt('evt_xinv', 'invoice.paid', { id: 'in_x', customer: 'cus_NOBODY', lines: { data: [] } }));
      assert.equal(other.code, 200); assert.match(String(other.body.ignored), /no org for cus_NOBODY/, 'a customer id still gets its lookup');
    } finally { delete db.collectionGroup; }
    assert.deepEqual(lookups, ['cus_NOBODY'], 'no billing lookup by an undefined customer');
    assert.equal(JSON.stringify(db.data.get(O + '/billing/current')), tenantBefore, 'the supplier\'s billing/current is not touched');
  });
  await test('the tenant\'s own Stripe events still run the original branches, and a bad signature is refused', async function () {
    seed(PRICED);
    var paid = await deliver(evt('evt_t1', 'invoice.paid', { id: 'in_t', customer: 'cus_TENANT', metadata: { orgId: ORG }, lines: { data: [{ period: { end: NOW + MONTH } }] } }));
    assert.equal(paid.code, 200); var b = db.data.get(O + '/billing/current'); assert(b.lastPaidAt); assert.equal(b.amountDue, 0);
    await deliver(evt('evt_t2', 'customer.subscription.deleted', { id: 'sub_TEN', customer: 'cus_TENANT', metadata: { orgId: ORG }, items: { data: [] } }));
    assert.equal(db.data.get(O + '/billing/current').tier, 'trial', 'the tenant branch is unchanged');
    assert.equal(account().editorLite, undefined, 'and never touches a customer account');
    assert.equal((await deliver(evt('evt_t3', 'invoice.paid', {}), 'forged')).code, 400);
  });

  console.log('\nmanage');
  await test('manage: the owner or the subscriber opens the billing portal for the ACCOUNT\'s Stripe customer; a colleague cannot', async function () {
    seed(PRICED);
    await rejects(call(subscribe, 'POST', { action: 'manage' }, SHANNON), 409, /no Editor Lite subscription/);
    await checkoutDone();
    db.seed(O + '/customers/' + AMP + '/users/jane@amperagecapital.com', { email: 'jane@amperagecapital.com', role: 'user', status: 'active' });
    db.seed(O + '/customer_index/jane@amperagecapital.com', { customerId: AMP });
    await rejects(call(subscribe, 'POST', { action: 'manage' }, person('jane@amperagecapital.com')), 403, /owner/);
    var r = await call(subscribe, 'POST', { action: 'manage' }, SHANNON);
    assert.match(r.url, /^https:\/\/billing\.stripe\.com\//); assert.equal(calls.portals[0].customer, 'cus_T1');
    assert.match(calls.portals[0].return_url, /\/portals\/customer\/app\?org=cleancell\.us&tab=design$/);
    await call(subscribe, 'POST', { action: 'manage' }, CFO);
    assert.equal(calls.portals.length, 2); await rejects(call(subscribe, 'POST', { action: 'refund' }, SHANNON), 400);
  });

  console.log('\nthe prices');
  await test('tenant-billing takes the yearly price beside the monthly one, merges, validates, staff only', async function () {
    seed({ customerEditorLite: { monthlyPriceCents: 79900, currency: 'USD', interval: 'month' } });
    var r = await billingApi({ method: 'POST', body: { orgId: ORG, customerEditorLite: { yearlyPriceCents: 799000 } }, caller: STAFF }, res);
    assert.deepEqual(r.changed.sort(), ['customerEditorLite', 'updatedAt', 'updatedBy']);
    assert.deepEqual(db.data.get(O + '/billing/current').customerEditorLite, { monthlyPriceCents: 79900, yearlyPriceCents: 799000, currency: 'USD', interval: 'month' }, 'a price left out is kept');
    await billingApi({ method: 'POST', body: { orgId: ORG, customerEditorLite: { monthlyPriceCents: null } }, caller: STAFF }, res);
    assert.equal(db.data.get(O + '/billing/current').customerEditorLite.monthlyPriceCents, null, 'null withdraws a plan');
    assert.equal((await call(subscribe, 'GET', {}, SHANNON)).monthlyPriceCents, null);
    await rejects(billingApi({ method: 'POST', body: { orgId: ORG, customerEditorLite: { yearlyPriceCents: 12.5 } }, caller: STAFF }, res), 400, /whole cents/);
    await rejects(billingApi({ method: 'POST', body: { orgId: ORG, customerEditorLite: { yearlyPriceCents: 50 } }, caller: STAFF }, res), 400);
    await rejects(billingApi({ method: 'POST', body: { orgId: ORG, customerEditorLite: { costCents: 1 } }, caller: STAFF }, res), 400);
    await rejects(billingApi({ method: 'POST', body: { orgId: ORG, customerEditorLite: { yearlyPriceCents: 700000 } }, caller: OFFICE }, res), 403);
    var hist = Array.from(db.data.keys()).filter(function (k) { return k.indexOf(O + '/billing/current/history/') === 0; });
    assert.equal(hist.length, 2, 'every price change is in the billing history');
  });

  console.log('\ntenant-billed pay links');
  function pricedOrder(id, accounting, invoice) {
    db.seed('orders/' + id, { orgId: ORG, orderNo: 'CC-' + id, status: 'accepted', customerId: AMP, createdAt: 1, items: [{ sku: 'R60', qty: 1 }], customer: { email: 'shannon@amperagecapital.com' },
      tenantPricing: { total: 1000, currency: 'USD', publishedToCustomer: true },
      logic: { accounting: accounting, acceptedAt: '2026-09-24T00:00:00Z', commercial: { baseCents: 100000, feeCents: 0, totalCents: 100000, depositCents: 30000, balanceCents: 70000, terms: { depositPct: 30, dueDays: 0 } },
        invoices: { deposit: Object.assign({ amountCents: 30000, status: accounting === 'tenant' ? 'to_issue' : 'queued' }, invoice || {}) } } });
  }
  function issue(body) { return office({ method: 'POST', body: Object.assign({ org: ORG, action: 'invoice-issued', orderId: 'ten', stage: 'deposit', number: 'INV-100', date: '2026-09-24' }, body), caller: OFFICE }, res); }
  await test('invoice-issued refuses a pay link that is not https to a named site', async function () {
    seed(); pricedOrder('ten', 'tenant');
    for (var bad of ['http://pay.cleancell.us/inv/100', 'javascript:alert(1)', 'https://user:pw@pay.cleancell.us/x', 'https://10.0.0.1/pay', 'https://localhost/pay', 'https://pay.cleancell.us/a b', 'pay.cleancell.us/100', 'https://pay.cleancell.us/' + 'x'.repeat(1000), 42]) {
      await rejects(issue({ payUrl: bad }), 400, /https/);
    }
    assert.equal(db.data.get('orders/ten').logic.invoices.deposit.id, undefined, 'nothing was recorded');
  });
  await test('the pay link is stored on the invoice, can be added, changed or removed later, and reaches the customer', async function () {
    seed(); pricedOrder('ten', 'tenant');
    var r = await issue({ payUrl: 'https://pay.cleancell.us/inv/100' });
    assert.equal(r.invoice.payUrl, 'https://pay.cleancell.us/inv/100'); assert.equal(r.invoice.status, 'awaiting_payment');
    var o = db.data.get('orders/ten'); assert.equal(o.logic.invoices.deposit.payUrl, 'https://pay.cleancell.us/inv/100'); assert.equal(o.logic.invoices.deposit.payUrlBy, 'pm@cleancell.us');
    assert.equal(portal.publicOrder(o).checkout.invoices[0].payUrl, 'https://pay.cleancell.us/inv/100');
    assert.equal(portal.publicOrder(o).checkout.invoices[0].number, 'INV-100');
    assert.equal((await issue({})).duplicate, true, 'the same invoice again with no link keeps the link');
    assert.equal(db.data.get('orders/ten').logic.invoices.deposit.payUrl, 'https://pay.cleancell.us/inv/100');
    var ch = await issue({ payUrl: 'https://pay.cleancell.us/inv/100?v=2' }); assert.equal(ch.payLinkChanged, true); assert.equal(ch.duplicate, false);
    assert.equal(portal.publicOrder(db.data.get('orders/ten')).checkout.invoices[0].payUrl, 'https://pay.cleancell.us/inv/100?v=2');
    await issue({ payUrl: null }); assert.equal(portal.publicOrder(db.data.get('orders/ten')).checkout.invoices[0].payUrl, null, 'null removes it');
    var events = Array.from(db.data.keys()).filter(function (k) { return k.indexOf('orders/ten/events/') === 0; }).map(function (k) { return db.data.get(k).what; });
    assert(events.some(function (w) { return /pay link changed/.test(w); }) && events.some(function (w) { return /pay link removed/.test(w); }), 'each change is on the order\'s events');
    await rejects(issue({ number: 'INV-OTHER', payUrl: 'https://pay.cleancell.us/x' }), 409, /already recorded/);
  });
  await test('the customer sees a supplier pay link on tenant-billed orders only; QuickBooks orders keep QuickBooks\' link', async function () {
    seed();
    pricedOrder('qbo', 'quickbooks', { payUrl: 'https://pay.cleancell.us/inv/9', id: 'I9' });
    assert.equal(portal.publicOrder(db.data.get('orders/qbo')).checkout.invoices[0].payUrl, null, 'a non-QuickBooks link on a QuickBooks order is never shown');
    pricedOrder('qbo2', 'quickbooks', { payUrl: 'https://connect.intuit.com/portal/app/CommerceNetwork/view/x' });
    assert.match(portal.publicOrder(db.data.get('orders/qbo2')).checkout.invoices[0].payUrl, /intuit\.com/);
    pricedOrder('pre', 'tenant', { payUrl: 'https://pay.cleancell.us/inv/7' });
    assert.equal(portal.publicOrder(db.data.get('orders/pre')).checkout.invoices[0].payUrl, null, 'not before the invoice is issued');
    pricedOrder('bad', 'tenant', { id: 'INV-7', payUrl: 'javascript:alert(1)' });
    assert.equal(portal.publicOrder(db.data.get('orders/bad')).checkout.invoices[0].payUrl, null, 'a record written some other way is checked again on the way out');
    pricedOrder('cx', 'tenant', { id: 'INV-8', payUrl: 'https://pay.cleancell.us/inv/8' }); var cx = db.data.get('orders/cx'); cx.cancelRequested = true;
    assert.equal(portal.publicOrder(cx).checkout.invoices[0].payUrl, null, 'never on an order being cancelled');
    await rejects(office({ method: 'POST', body: { org: ORG, action: 'invoice-issued', orderId: 'qbo2', stage: 'deposit', number: 'X', date: '2026-09-24', payUrl: 'https://pay.cleancell.us/x' }, caller: OFFICE }, res), 409, /QuickBooks/);
  });

  Module._load = load;
  console.log('\n' + count + ' customer subscription and pay-link tests passed. No network.');
})().catch(function (e) { console.error(e); process.exit(1); });
