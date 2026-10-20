#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-editor-lite-included.js — Editor Lite included by the supplier
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   A supplier may include Site Map · Editor Lite for its customers at no
   charge (billing/current.editorLite.customersIncluded, written only by
   ClearSky's owner through api/logic-onboard.js customer-editor-included).
   Offline over the Firestore double:
   1. the ONE rule (api/_lib/buyer-design.js entitlement): included opens
      every account with no expiry, only while Editor Lite is on; an
      account's own subscription or trial still says itself;
   2. the door to the map (D.access) still refuses a disabled account and a
      pending person — included widens the grant, never who may act;
   3. checkout (api/customer-subscribe.js) offers nothing and refuses a plan;
   4. the switch: owner only, refused before Editor Lite is on, audited in
      billing history and omega_audit, idempotent, and the bundle keeps it
      while enrolled and drops it when Editor Lite goes off.
     node scripts/test-editor-lite-included.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var assert = require('node:assert/strict');
var FD = require('./_lib/firestore-double'), DB = FD.DB, mock = FD.mock;
var db;
var A = { db: function () { return db; }, safeOrg: function (v) { return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v || '') ? v : ''; }, httpError: function (s, m) { var e = new Error(m); e.status = s; return e; },
  authenticate: async function (r) { return r.caller; }, handler: function (f) { return f; }, isDegraded: function () { return false; },
  canActInOrg: async function (c, o) { return c.staff || c.orgId === o; }, isTenantAdmin: async function (c, o) { return c.staff; },
  FieldValue: function () { return { serverTimestamp: function () { return '2026-10-16T12:00:00Z'; }, arrayUnion: function () { return { union: Array.from(arguments) }; } }; } };
mock('../api/_lib/admin', A);
process.env.STRIPE_SECRET_KEY = 'sk_test_fixture';

var subscribe = require('../api/customer-subscribe'), onboard = require('../api/logic-onboard'), D = require('../api/_lib/buyer-design');

var ORG = 'fenecon.com', O = 'omega_orgs/' + ORG, ACCT = 'acct_sunbelt';
function person(email) { return { uid: email.split('@')[0], email: email, orgId: email.split('@')[1], claims: { email_verified: true } }; }
var BUYER = person('pat@sunbelt.example'), WAITING = person('new@sunbelt.example');
var OWNER = { uid: 'tom', email: 'tom@clearsky-usa.com', orgId: 'clearsky-usa.com', staff: true, claims: { email_verified: true } };
var STAFF = { uid: 'rep', email: 'rep@clearsky-usa.com', orgId: 'clearsky-usa.com', staff: true, claims: { email_verified: true } };
var res = { headers: {}, setHeader: function (k, v) { this.headers[k] = v; } };
function call(api, method, body, caller) { return api({ method: method, body: method === 'POST' ? Object.assign({ org: ORG }, body) : undefined, query: method === 'GET' ? Object.assign({ org: ORG }, body || {}) : {}, caller: caller }, res); }
async function rejects(p, status, re) { try { await p; } catch (e) { assert.equal(e.status, status, e.message); if (re) assert.match(e.message, re); return e; } throw new Error('expected a ' + status); }
var count = 0; async function test(name, fn) { await fn(); count++; console.log('PASS ' + name); }

function seed(lite, account) {
  db = new DB();
  db.seed(O, { name: 'FENECON', status: 'active' });
  db.seed(O + '/billing/current', { addons: ['omega-logic', 'whitelabel'], tier: 'trial', customerEditorLite: { monthlyPriceCents: 79900, currency: 'USD' },
    editorLite: lite === undefined ? { enabled: true, modules: ['bess'], customersIncluded: true } : lite });
  db.seed(O + '/customers/' + ACCT, Object.assign({ orgId: ORG, name: 'Sunbelt Storage', status: 'active', source: 'self', createdAt: '2026-10-01T00:00:00Z' }, account || {}));
  [['pat', 'owner', 'active'], ['new', 'user', 'pending']].forEach(function (p) {
    var email = p[0] + '@sunbelt.example';
    db.seed(O + '/customers/' + ACCT + '/users/' + email, { email: email, role: p[1], status: p[2] });
    db.seed(O + '/customer_index/' + email, { customerId: ACCT });
  });
}
function lite() { return db.data.get(O + '/billing/current').editorLite; }
function rows(prefix) { var out = []; db.data.forEach(function (v, k) { if (k.indexOf(prefix) === 0 && k.slice(prefix.length).indexOf('/') < 0) out.push(v); }); return out; }
function ctxOf(l) { return { billing: { editorLite: l } }; }
var FUTURE = '2099-01-01T00:00:00Z', PAST = '2020-01-01T00:00:00Z';

(async function () {
  console.log('\nthe one rule');
  await test('included opens an account with no grant, with no expiry and the supplier\'s modules', async function () {
    var e = D.entitlement(ctxOf({ enabled: true, modules: ['bess', 'nope'], customersIncluded: true }), {}, null);
    assert.deepEqual(e, { active: true, status: 'included', expiresAt: null, modules: ['bess'] });
  });
  await test('included does nothing while Editor Lite is off, and is never implied', async function () {
    assert.equal(D.entitlement(ctxOf({ enabled: false, modules: ['bess'], customersIncluded: true }), {}, null).active, false);
    assert.equal(D.entitlement(ctxOf({ enabled: true, modules: ['bess'] }), {}, null).status, 'inactive');
    assert.equal(D.entitlement(ctxOf({ enabled: true, modules: ['bess'], customersIncluded: 'yes' }), {}, null).active, false, 'only a literal true');
  });
  await test('an account\'s own live trial or subscription still says itself; a lapsed one falls back to included', async function () {
    var on = ctxOf({ enabled: true, modules: ['bess'], customersIncluded: true });
    var t = D.entitlement(on, { editorLite: { status: 'trial', source: 'owner-trial', expiresAt: FUTURE } }, null);
    assert.equal(t.status, 'trial'); assert.equal(t.expiresAt, FUTURE);
    assert.equal(D.entitlement(on, { editorLite: { status: 'active', source: 'provider', expiresAt: FUTURE } }, null).status, 'active');
    var lapsed = D.entitlement(on, { editorLite: { status: 'trial', source: 'owner-trial', expiresAt: PAST } }, null);
    assert.equal(lapsed.status, 'included'); assert.equal(lapsed.expiresAt, null);
    assert.equal(D.entitlement(on, { editorLite: { status: 'inactive', source: 'provider', expiresAt: PAST } }, null).active, true, 'a cancelled subscription still has the included map');
  });
  await test('the ClearSky owner is still owner-access', async function () {
    assert.equal(D.entitlement(ctxOf({ enabled: true, modules: ['bess'], customersIncluded: true }), {}, OWNER).status, 'owner-access');
  });

  console.log('\nthe door to the map');
  await test('an active person on an account opens the map through D.access', async function () {
    seed();
    var scope = await D.access(BUYER, ORG);
    assert.equal(scope.grant.active, true); assert.equal(scope.grant.status, 'included');
    D.requireEditor(scope);
  });
  await test('included never lets in a pending person, a disabled account or an unverified email', async function () {
    seed();
    await rejects(D.access(WAITING, ORG), 403, /waiting for approval/);
    seed(undefined, { status: 'disabled' });
    await rejects(D.access(BUYER, ORG), 403, /disabled/);
    seed();
    await rejects(D.access(Object.assign({}, BUYER, { claims: { email_verified: false } }), ORG), 403, /Verify/);
  });
  await test('switched off, the same account is back to needing a subscription or a trial', async function () {
    seed({ enabled: true, modules: ['bess'] });
    var scope = await D.access(BUYER, ORG);
    assert.equal(scope.grant.active, false);
    assert.throws(function () { D.requireEditor(scope); }, /subscription or approved trial/);
  });

  console.log('\ncheckout');
  await test('included: nothing is offered, the view says included and entitled', async function () {
    seed();
    var g = await call(subscribe, 'GET', {}, BUYER);
    assert.equal(g.available, false); assert.equal(g.included, true); assert.equal(g.status, 'included'); assert.equal(g.entitled, true); assert.equal(g.expiresAt, null);
  });
  await test('included: a plan is refused, so nobody pays for what the supplier includes', async function () {
    seed();
    await rejects(call(subscribe, 'POST', { plan: 'month' }, BUYER), 409, /included with your customer account/);
  });
  await test('not included: the priced plan is offered as before', async function () {
    seed({ enabled: true, modules: ['bess'] });
    var g = await call(subscribe, 'GET', {}, BUYER);
    assert.equal(g.available, true); assert.equal(g.included, false); assert.equal(g.monthlyPriceCents, 79900);
  });

  console.log('\nthe switch');
  await test('only ClearSky\'s owner may set it', async function () {
    seed({ enabled: true, modules: ['bess'] });
    await rejects(call(onboard, 'POST', { action: 'customer-editor-included', included: true }, STAFF), 403);
    await rejects(call(onboard, 'POST', { action: 'customer-editor-included', included: true }, BUYER), 403);
    assert.equal(lite().customersIncluded, undefined);
  });
  await test('refused before Editor Lite is on; a non-boolean is refused', async function () {
    seed({ enabled: false, modules: ['bess'] });
    await rejects(call(onboard, 'POST', { action: 'customer-editor-included', included: true }, OWNER), 409, /Omega Logic bundle/);
    await rejects(call(onboard, 'POST', { action: 'customer-editor-included', included: 'true' }, OWNER), 400);
    assert.equal(lite().customersIncluded, undefined);
  });
  await test('on: written beside enabled and modules, with a history row and an audit row', async function () {
    seed({ enabled: true, modules: ['bess'] });
    var r = await call(onboard, 'POST', { action: 'customer-editor-included', included: true }, OWNER);
    assert.equal(r.ok, true); assert.equal(r.included, true); assert.match(r.note, /No subscription or charge/);
    assert.deepEqual(lite(), { enabled: true, modules: ['bess'], customersIncluded: true });
    var h = rows(O + '/billing/current/history/'), a = rows('omega_audit/');
    assert.equal(h.length, 1); assert.equal(h[0].action, 'customer-editor-included'); assert.equal(h[0].by, OWNER.email);
    assert.deepEqual(h[0].was, { 'editorLite.customersIncluded': false }); assert.deepEqual(h[0].changed, { 'editorLite.customersIncluded': true });
    assert.equal(a.length, 1); assert.equal(a[0].orgId, ORG); assert.equal(a[0].included, true); assert.equal(a[0].was, false);
  });
  await test('the same value again writes nothing', async function () {
    seed();
    var r = await call(onboard, 'POST', { action: 'customer-editor-included', included: true }, OWNER);
    assert.equal(r.unchanged, true);
    assert.equal(rows(O + '/billing/current/history/').length, 0); assert.equal(rows('omega_audit/').length, 0);
  });
  await test('off: customers need a subscription or a trial again', async function () {
    seed();
    var r = await call(onboard, 'POST', { action: 'customer-editor-included', included: false }, OWNER);
    assert.equal(r.included, false); assert.equal(lite().customersIncluded, false); assert.equal(lite().enabled, true);
    assert.equal((await D.access(BUYER, ORG)).grant.active, false);
  });
  await test('the bundle keeps it while enrolled, and drops it when Editor Lite goes off', async function () {
    seed();
    await call(onboard, 'POST', { action: 'bundle', enabled: true, modules: ['bess', 'solar'] }, OWNER);
    assert.deepEqual(lite(), { enabled: true, modules: ['bess', 'solar'], customersIncluded: true });
    await call(onboard, 'POST', { action: 'bundle', enabled: false, modules: ['bess'] }, OWNER);
    assert.equal(lite().customersIncluded, false);
    await call(onboard, 'POST', { action: 'bundle', enabled: true, modules: ['bess'] }, OWNER);
    assert.equal(lite().customersIncluded, false, 're-enrolling is a fresh decision');
  });

  console.log('\n' + count + ' passed');
}()).catch(function (e) { console.error('FAIL', e && e.stack || e); process.exit(1); });
