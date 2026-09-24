#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-customer-accounts.js — a workspace's customers are ACCOUNTS
   with people on them, end to end offline
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Omega Logic is ClearSky's product, a tenant is a workspace in it, and the
   workspace's customers (Amperage Capital) are sub-accounts with several
   people each. Every active person on an account sees and works the
   ACCOUNT; a colleague's first sign-in asks to join rather than splitting
   the company; the owner and the office manage the people; custody and
   billing follow the account; the customer app is the tenant-branded one.
   api/_lib/buyer-accounts.js, api/my-orders.js, api/my-account.js,
   api/buyers.js, api/po-intake.js, api/logic-custody.js over the in-memory
   Firestore double. No network.
     node scripts/test-customer-accounts.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
var FD = require('./_lib/firestore-double'), DB = FD.DB, mock = FD.mock;
var db;
var A = { db: function () { return db; }, safeOrg: function (v) { return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v || '') ? v : ''; }, httpError: function (s, m) { var e = new Error(m); e.status = s; return e; },
  authenticate: async function (r) { return r.caller; }, handler: function (f) { return f; }, canActInOrg: async function (c, o) { return c.orgId === o; }, isDegraded: function () { return false; },
  FieldValue: function () { return { serverTimestamp: function () { return '2026-09-24T12:00:00Z'; }, arrayUnion: function () { return { union: Array.from(arguments) }; } }; } };
mock('../api/_lib/admin', A);
mock('../api/_lib/mail', { configured: function () { return false; }, send: async function () { return { ok: false }; }, esc: String, button: function () { return ''; }, wlLayout: function () { return ''; } });
var B = require('../api/_lib/buyer-accounts'), myOrders = require('../api/my-orders'), myAccount = require('../api/my-account'), buyers = require('../api/buyers'), intake = require('../api/po-intake'), custody = require('../api/logic-custody');
var ORG = 'cleancell.us', O = 'omega_orgs/' + ORG, AMP = 'acct_amperage';
function person(email, extra) { return Object.assign({ uid: email.split('@')[0], email: email, orgId: email.split('@')[1], claims: { email_verified: true } }, extra || {}); }
var SHANNON = person('shannon@amperagecapital.com'), CFO = person('cfo@amperagecapital.com'), JANE = person('jane@amperagecapital.com'), STRANGER = person('buyer@elsewhere.com');
var OFFICE = { uid: 'pm', email: 'pm@cleancell.us', orgId: ORG, claims: { email_verified: true } };
var res = { headers: {}, setHeader: function (k, v) { this.headers[k] = v; }, end: function (b) { this.body = b; } };
function call(api, method, body, caller) { return api({ method: method, body: method === 'POST' ? Object.assign({ org: ORG }, body) : undefined, query: method === 'GET' ? Object.assign({ org: ORG }, body || {}) : {}, caller: caller }, res); }
async function rejects(p, status, re) { try { await p; } catch (e) { assert.equal(e.status, status, e.message); if (re) assert.match(e.message, re); return e; } throw new Error('expected a ' + status); }
var count = 0; async function test(name, fn) { await fn(); count++; console.log('PASS ' + name); }
function seed() {
  db = new DB();
  db.seed(O, { name: 'Clean Cell', status: 'active', whiteLabel: { platformName: 'Clean Cell Power Platform', shortName: 'Clean Cell', attribution: 'powered-by', attributionText: 'Powered by ClearSky OMEGA' } });
  db.seed(O + '/billing/current', { addons: ['omega-logic'], status: 'active' }); db.seed(O + '/fulfillment/config', { enabled: true, terms: { depositPct: 30, dueDays: 0 } });
  db.seed(O + '/members/pm', { email: 'pm@cleancell.us', role: 'admin', status: 'active' });
  db.seed(O + '/storefront/config', { products: [{ sku: 'R60', name: 'R60 skid', kind: 'product', warrantyYears: 10 }] });
  /* Amperage Capital, set up by the office (as the intake script does): a company with its domain, Shannon its owner */
  db.seed(O + '/customers/' + AMP, { orgId: ORG, name: 'Amperage Capital', nameLower: 'amperage capital', accountType: 'company', domain: 'amperagecapital.com', status: 'active', source: 'office', terms: { depositPct: 30 }, createdAt: '2026-09-22T00:00:00Z' });
  db.seed(O + '/customers/' + AMP + '/users/shannon@amperagecapital.com', { email: 'shannon@amperagecapital.com', name: 'Shannon Johnson', role: 'owner', status: 'active' });
  db.seed(O + '/customer_index/shannon@amperagecapital.com', { customerId: AMP });
  /* another customer of the same workspace */
  db.seed(O + '/customers/acct_other', { orgId: ORG, name: 'Other Co', status: 'active', source: 'self', terms: {} });
  db.seed(O + '/customers/acct_other/users/buyer@elsewhere.com', { email: 'buyer@elsewhere.com', role: 'owner', status: 'active' });
  db.seed(O + '/customer_index/buyer@elsewhere.com', { customerId: 'acct_other' });
  /* the live Amperage order as it was first entered: billed to Shannon, NO customerId */
  db.seed('orders/amp1', { orgId: ORG, orderNo: 'CC-AMP-1', status: 'in_fulfilment', createdAt: '2026-09-22T10:00:00Z', customer: { email: 'shannon@amperagecapital.com', name: 'Shannon Johnson', company: 'Amperage Capital' }, items: [{ sku: 'R60', name: 'R60 skid', qty: 56 }], purchaseOrder: { number: 'CCUS-3V3I' } });
  /* an order stamped for the account, billed to a colleague */
  db.seed('orders/amp2', { orgId: ORG, orderNo: 'CC-AMP-2', status: 'new', createdAt: '2026-09-23T10:00:00Z', customerId: AMP, customer: { email: 'ap@amperagecapital.com', name: 'AP', company: 'Amperage Capital' }, items: [{ sku: 'R60', qty: 2 }] });
  /* someone else's order, and one for Amperage's person but stamped for ANOTHER account, and one in another workspace */
  db.seed('orders/oth1', { orgId: ORG, orderNo: 'CC-OTH-1', status: 'new', createdAt: '2026-09-21T10:00:00Z', customerId: 'acct_other', customer: { email: 'buyer@elsewhere.com' }, items: [] });
  db.seed('orders/cross', { orgId: ORG, orderNo: 'CC-X', status: 'new', createdAt: '2026-09-20T10:00:00Z', customerId: 'acct_other', customer: { email: 'shannon@amperagecapital.com' }, items: [] });
  db.seed('orders/elsewhere', { orgId: 'joules.example', orderNo: 'J-1', status: 'new', createdAt: '2026-09-20T10:00:00Z', customer: { email: 'shannon@amperagecapital.com' }, items: [] });
  /* a PO still under office review is not an order yet */
  db.seed('orders/po_review', { orgId: ORG, orderNo: 'PO-IN-1', status: 'po_review', createdAt: '2026-09-24T10:00:00Z', customerId: AMP, customer: { email: '', company: 'Amperage Capital' }, poIntake: { number: 'X', createdAt: '2026-09-24T10:00:00Z' }, items: [] });
}
function nos(list) { return list.map(function (o) { return o.orderNo; }).sort(); }

(async function () {
  console.log('\nthe account is what people see');
  await test('an account\'s orders: its stamp, or billed to one of its people; never another account\'s, another workspace\'s, or a PO under review', async function () {
    seed(); var acct = await B.lookup(db, ORG, 'shannon@amperagecapital.com');
    var r = await B.accountOrders(db, ORG, 'shannon@amperagecapital.com', acct, {});
    assert.deepEqual(r.docs.map(function (d) { return d.id; }), ['amp2', 'amp1'], 'newest first, merged by id');
    var none = await B.accountOrders(db, ORG, 'buyer@elsewhere.com', null, {});
    assert.deepEqual(none.docs.map(function (d) { return d.id; }).sort(), ['oth1'], 'no account: the caller\'s own email only');
    var one = await B.accountOrders(db, ORG, 'shannon@amperagecapital.com', acct, { orderNo: 'CC-AMP-2' });
    assert.deepEqual(one.docs.map(function (d) { return d.id; }), ['amp2']);
  });
  await test('a colleague on the account sees every order on it in the customer app, and can ask about one', async function () {
    seed(); await B.addUser(db, ORG, AMP, 'cfo@amperagecapital.com', { name: 'Chief Financial' }, 'pm@cleancell.us', { source: 'office' });
    var out = await call(myOrders, 'GET', {}, CFO);
    assert.deepEqual(nos(out.orders), ['CC-AMP-1', 'CC-AMP-2']);
    var asked = await call(myOrders, 'POST', { orderNo: 'CC-AMP-1', kind: 'information', message: 'When does the first skid ship?' }, CFO);
    assert.equal(asked.ok, true); assert.equal(db.data.get('orders/amp1').requests[0].by, 'cfo@amperagecapital.com');
    var own = await call(myOrders, 'GET', { orderNo: 'CC-AMP-1' }, SHANNON);
    assert.equal(own.orders[0].requests[0].by, 'cfo@amperagecapital.com', 'the owner sees who on the account asked');
    await rejects(call(myOrders, 'POST', { orderNo: 'CC-OTH-1', kind: 'information', message: 'Not mine at all' }, CFO), 404);
    var stranger = await call(myOrders, 'GET', {}, STRANGER);
    assert.deepEqual(nos(stranger.orders), ['CC-OTH-1', 'CC-X'], 'another account sees its own, never Amperage\'s');
  });
  await test('a suspended account, a turned-off or pending person asks nothing and sees nothing', async function () {
    seed(); await B.addUser(db, ORG, AMP, 'cfo@amperagecapital.com', {}, 'pm@cleancell.us', { source: 'office' });
    await B.setUser(db, ORG, AMP, 'cfo@amperagecapital.com', { status: 'disabled' }, 'pm@cleancell.us');
    await rejects(call(myOrders, 'POST', { orderNo: 'CC-AMP-1', kind: 'information', message: 'Hello there' }, CFO), 403, /disabled/);
    await rejects(call(myOrders, 'GET', {}, CFO), 403, /disabled/);
    db.seed(O + '/customers/' + AMP, Object.assign(db.data.get(O + '/customers/' + AMP), { status: 'suspended' }));
    await rejects(call(myOrders, 'POST', { orderNo: 'CC-AMP-1', kind: 'information', message: 'Hello there' }, SHANNON), 403, /disabled/);
  });

  console.log('\na colleague joins the company, never a company of their own');
  await test('first sign-in from the company\'s domain asks to join: pending, nothing visible, no second account', async function () {
    seed(); var before = [].concat(Array.from(db.data.keys())).filter(function (k) { return /\/customers\/[^/]+$/.test(k); }).length;
    var me = await call(myAccount, 'GET', {}, JANE);
    assert.equal(me.pending, true); assert.equal(me.company, 'Amperage Capital'); assert.equal(me.terms, undefined, 'no terms before approval');
    assert.equal(db.data.get(O + '/customer_index/jane@amperagecapital.com').customerId, AMP);
    assert.equal(db.data.get(O + '/customers/' + AMP + '/users/jane@amperagecapital.com').status, 'pending');
    assert.equal(Array.from(db.data.keys()).filter(function (k) { return /\/customers\/[^/]+$/.test(k); }).length, before, 'no new account');
    await rejects(call(myOrders, 'GET', {}, JANE), 403, /waiting for approval/);
    await rejects(call(myAccount, 'POST', { name: 'Jane' }, JANE), 403, /waiting for approval/);
    /* the owner sees the request and approves it from the app */
    var owner = await call(myAccount, 'GET', {}, SHANNON);
    assert.equal(owner.users.filter(function (u) { return u.email === 'jane@amperagecapital.com'; })[0].status, 'pending');
    var ok = await call(myAccount, 'POST', { action: 'user-status', email: 'jane@amperagecapital.com', status: 'active' }, SHANNON);
    assert.equal(ok.person.status, 'active');
    var now = await call(myOrders, 'GET', {}, JANE); assert.deepEqual(nos(now.orders), ['CC-AMP-1', 'CC-AMP-2']);
  });
  await test('a public mailbox never joins anyone; a stranger still gets an account of their own', async function () {
    seed(); var g = await call(myAccount, 'GET', {}, person('someone@gmail.com'));
    assert.equal(g.pending, undefined); assert.notEqual(g.customerId, AMP); assert.equal(g.you.role, 'owner');
  });

  console.log('\nthe owner manages the people on the account');
  await test('the owner adds a colleague at the company\'s own domain; not a public mailbox, not another domain, not twice', async function () {
    seed(); var r = await call(myAccount, 'POST', { action: 'add-user', email: 'CFO@amperagecapital.com', name: 'Chief Financial' }, SHANNON);
    assert.equal(r.person.role, 'user'); assert.equal(db.data.get(O + '/customer_index/cfo@amperagecapital.com').customerId, AMP);
    assert.ok(r.users.some(function (u) { return u.email === 'cfo@amperagecapital.com'; }));
    await rejects(call(myAccount, 'POST', { action: 'add-user', email: 'friend@gmail.com' }, SHANNON), 400, /@amperagecapital\.com/);
    await rejects(call(myAccount, 'POST', { action: 'add-user', email: 'x@competitor.com' }, SHANNON), 400);
    await rejects(call(myAccount, 'POST', { action: 'add-user', email: 'cfo@amperagecapital.com' }, SHANNON), 409);
    await rejects(call(myAccount, 'POST', { action: 'add-user', email: 'buyer@elsewhere.com' }, SHANNON), 400);
    await rejects(call(myAccount, 'POST', { action: 'add-user', email: 'ops@amperagecapital.com' }, CFO), 403, /owner/);
  });
  await test('the owner turns a colleague off and on, never themselves; roles stay with the supplier', async function () {
    seed(); await call(myAccount, 'POST', { action: 'add-user', email: 'cfo@amperagecapital.com' }, SHANNON);
    await call(myAccount, 'POST', { action: 'user-status', email: 'cfo@amperagecapital.com', status: 'disabled' }, SHANNON);
    await rejects(call(myOrders, 'GET', {}, CFO), 403, /disabled/);
    await call(myAccount, 'POST', { action: 'user-status', email: 'cfo@amperagecapital.com', status: 'active' }, SHANNON);
    assert.equal((await call(myOrders, 'GET', {}, CFO)).orders.length, 2);
    await rejects(call(myAccount, 'POST', { action: 'user-status', email: 'shannon@amperagecapital.com', status: 'disabled' }, SHANNON), 400, /your own/);
    await rejects(B.setUser(db, ORG, AMP, 'cfo@amperagecapital.com', { role: 'owner' }, 'shannon@amperagecapital.com', { owner: true }), 403);
  });
  await test('a non-owner\'s company and address edits are said to be ignored, not silently dropped', async function () {
    seed(); await B.addUser(db, ORG, AMP, 'cfo@amperagecapital.com', {}, 'pm@cleancell.us', { source: 'office' });
    var r = await call(myAccount, 'POST', { name: 'Chief', company: 'Renamed Co', address: { line1: '1 Elsewhere' } }, CFO);
    assert.deepEqual(r.ignored, ['company', 'address']); assert.equal(db.data.get(O + '/customers/' + AMP).name, 'Amperage Capital'); assert.equal(r.orders, 2, 'the account\'s orders are counted');
  });

  console.log('\nthe office\'s Customer hub opens the account');
  await test('an account by id: every person with their status, every order on it, totals across them, the app link', async function () {
    seed(); await B.addUser(db, ORG, AMP, 'cfo@amperagecapital.com', {}, 'pm@cleancell.us', { source: 'office' }); await call(myAccount, 'GET', {}, JANE);
    var d = await call(buyers, 'GET', { customerId: AMP }, OFFICE);
    assert.equal(d.company, 'Amperage Capital'); assert.equal(d.people.length, 3); assert.equal(d.people[0].role, 'owner', 'the owner first');
    assert.equal(d.people.filter(function (u) { return u.status === 'pending'; })[0].email, 'jane@amperagecapital.com');
    assert.deepEqual(d.orders.map(function (o) { return o.orderNo; }), ['CC-AMP-2', 'CC-AMP-1']);
    assert.ok(d.orders[1].stage && d.orders[1].stage.label, 'orders carry their stage');
    assert.equal(d.orders[0].billedTo.email, 'ap@amperagecapital.com');
    assert.match(d.appUrl, /\/portals\/customer\/app\?org=cleancell\.us$/);
    var byEmail = await call(buyers, 'GET', { email: 'cfo@amperagecapital.com' }, OFFICE); assert.equal(byEmail.customerId, AMP, 'any person\'s email opens the same account');
    var list = await call(buyers, 'GET', {}, OFFICE); assert.equal(list.customers.filter(function (c) { return c.id === AMP; })[0].pending, 1);
  });
  await test('the office adds a person, and moves a colleague who signed in on their own onto the company when that account is empty', async function () {
    seed(); db.seed(O + '/customers/' + AMP, Object.assign(db.data.get(O + '/customers/' + AMP), { domain: '' }));
    var solo = await call(myAccount, 'GET', {}, JANE); assert.notEqual(solo.customerId, AMP, 'no domain on file: she got her own account');
    var moved = await call(buyers, 'POST', { action: 'user-add', customerId: AMP, email: 'jane@amperagecapital.com', name: 'Jane' }, OFFICE);
    assert.equal(moved.moved, solo.customerId); assert.equal(db.data.get(O + '/customer_index/jane@amperagecapital.com').customerId, AMP);
    assert.equal(db.data.get(O + '/customers/' + solo.customerId).status, 'suspended'); assert.equal(db.data.get(O + '/customers/' + solo.customerId).supersededBy, AMP);
    assert.equal(db.data.get(O + '/customers/' + solo.customerId + '/users/jane@amperagecapital.com').status, 'disabled');
    assert.equal((await call(myOrders, 'GET', {}, JANE)).orders.length, 2);
    await rejects(call(buyers, 'POST', { action: 'user-add', customerId: AMP, email: 'buyer@elsewhere.com' }, OFFICE), 409, /another customer account/);
  });
  await test('an account with history is never moved by a page', async function () {
    seed(); await rejects(call(buyers, 'POST', { action: 'user-add', customerId: 'acct_other', email: 'shannon@amperagecapital.com' }, OFFICE), 409);
    db.seed('orders/solo', { orgId: ORG, orderNo: 'S-1', customerId: 'acct_solo', customer: { email: 'late@amperagecapital.com' } });
    db.seed(O + '/customers/acct_solo', { orgId: ORG, name: 'late@amperagecapital.com', status: 'active', source: 'self', terms: {} }); db.seed(O + '/customers/acct_solo/users/late@amperagecapital.com', { email: 'late@amperagecapital.com', role: 'owner', status: 'active' }); db.seed(O + '/customer_index/late@amperagecapital.com', { customerId: 'acct_solo' });
    await rejects(call(buyers, 'POST', { action: 'user-add', customerId: AMP, email: 'late@amperagecapital.com' }, OFFICE), 409);
  });
  await test('roles and access from the hub; an account always keeps an active owner', async function () {
    seed(); await call(buyers, 'POST', { action: 'user-add', customerId: AMP, email: 'cfo@amperagecapital.com' }, OFFICE);
    await rejects(call(buyers, 'POST', { action: 'user-status', customerId: AMP, email: 'shannon@amperagecapital.com', status: 'disabled' }, OFFICE), 409, /active owner/);
    await call(buyers, 'POST', { action: 'user-status', customerId: AMP, email: 'cfo@amperagecapital.com', role: 'owner' }, OFFICE);
    await call(buyers, 'POST', { action: 'user-status', customerId: AMP, email: 'shannon@amperagecapital.com', role: 'user' }, OFFICE);
    assert.equal(db.data.get(O + '/customers/' + AMP + '/users/cfo@amperagecapital.com').role, 'owner');
    assert.ok(Array.from(db.data.keys()).some(function (k) { return /^omega_audit\//.test(k) && db.data.get(k).action === 'buyer-user-updated'; }), 'audited');
  });
  await test('terms and the company domain by account, even with nobody on it; a public mailbox is not a company domain', async function () {
    seed(); var c = await call(intake, 'POST', { office: true, action: 'company', name: 'Northwind Storage' }, OFFICE);
    await call(buyers, 'POST', { action: 'terms', customerId: c.customerId, terms: { depositPct: 20, dueDays: 15 } }, OFFICE);
    assert.equal(db.data.get(O + '/customers/' + c.customerId).terms.depositPct, 20);
    await call(buyers, 'POST', { action: 'profile', customerId: c.customerId, company: 'Northwind Storage', status: 'active', domain: 'northwind.example' }, OFFICE);
    assert.equal(db.data.get(O + '/customers/' + c.customerId).domain, 'northwind.example');
    await rejects(call(buyers, 'POST', { action: 'profile', customerId: c.customerId, company: 'Northwind Storage', status: 'active', domain: 'gmail.com' }, OFFICE), 400, /public mailbox/);
  });
  await test('one company, one account: a second "Amperage Capital" is refused wherever it is attempted', async function () {
    seed(); var e = await rejects(call(buyers, 'POST', { action: 'create', company: 'Amperage  capital', name: 'Jane', email: 'jane@amperagecapital.com' }, OFFICE), 409, /already has an account/);
    assert.equal(e.existingCustomerId, AMP);
    db.seed(O + '/customers/legacy', { orgId: ORG, name: 'Legacy Buyer Inc', status: 'active' });
    var dup = await call(intake, 'POST', { office: true, action: 'company', name: 'legacy buyer inc' }, OFFICE);
    assert.equal(dup.duplicate, true); assert.equal(dup.customerId, 'legacy');
  });
  await test('the PO inbox\'s "add a contact" is the same one writer', async function () {
    seed(); var r = await call(intake, 'POST', { office: true, action: 'contact', customerId: AMP, email: 'cfo@amperagecapital.com', name: 'CFO' }, OFFICE);
    assert.equal(r.ok, true); assert.equal(db.data.get(O + '/customer_index/cfo@amperagecapital.com').customerId, AMP);
    await rejects(call(intake, 'POST', { office: true, action: 'contact', customerId: AMP, email: 'cfo@amperagecapital.com' }, OFFICE), 409);
  });

  console.log('\ncustody follows the account');
  function seedUnits() {
    db.seed('plant_units/' + ORG + '__AMP-001', { orgId: ORG, serial: 'AMP-001', rootSerial: 'AMP-001', sku: 'R60', shipUnit: true, orderId: 'amp1', at: 'ready', custody: { status: 'received', receivedAt: '2026-09-23' } });
    db.seed(O + '/sites/site_amp', { orgId: ORG, name: 'Amperage yard', customerId: AMP, status: 'active', address: {} });
    db.seed(O + '/sites/site_other', { orgId: ORG, name: 'Other yard', customerId: 'acct_other', status: 'active', address: {} });
  }
  await test('an office assignment ties the unit to the order\'s account (even an order with no stamp), and refuses another customer\'s site', async function () {
    seed(); seedUnits();
    await rejects(call(custody, 'POST', { action: 'move', move: 'assign', serial: 'AMP-001', siteId: 'site_other' }, OFFICE), 409, /another customer account/);
    var ok = await call(custody, 'POST', { action: 'move', move: 'assign', serial: 'AMP-001', siteId: 'site_amp' }, OFFICE);
    assert.equal(ok.custody.customerId, AMP);
  });

  await test('QuickBooks bills the ACCOUNT as one customer, whoever on it the order is billed to; a storefront buyer stays keyed by email', async function () {
    mock('../api/_lib/qbo', { accessToken: async function () { return { token: 't', realmId: '123' }; }, API_BASE: 'https://qbo.test' });
    var queried = [], realFetch = global.fetch;
    global.fetch = async function (url) { var u = decodeURIComponent(String(url)); var m = /DisplayName = '([^']+)'/.exec(u); if (m) queried.push(m[1]);
      return { ok: true, status: 200, json: async function () { return /query\?/.test(u) ? { QueryResponse: {} } : /\/customer\?/.test(u) ? { Customer: { Id: 'c1' } } : { Invoice: { Id: 'i1' } }; } }; };
    try {
      var Q = require('../api/_lib/qbo-sales');
      function ord(email, cid) { return { orgId: ORG, orderNo: 'N', customerId: cid, customer: { email: email, company: 'Amperage Capital' }, logic: { realmId: '123', itemRef: '5', commercial: { depositCents: 100, feeCents: 0, totalCents: 100, terms: { dueDays: 0 } }, invoices: { deposit: { amountCents: 100, date: '2026-09-24', requestId: 'r' } } } }; }
      await Q.invoice(ord('shannon@amperagecapital.com', AMP), 'deposit'); await Q.invoice(ord('cfo@amperagecapital.com', AMP), 'deposit'); await Q.invoice(ord('walkin@example.com'), 'deposit');
      assert.equal(queried[0], queried[1], 'one QuickBooks customer for the account'); assert.notEqual(queried[0], queried[2]);
    } finally { global.fetch = realFetch; }
  });

  console.log('\nthe customer app is the special one');
  await test('the customer\'s brand carries the contract\'s "powered by"; the kit message never calls it Omega Logic', async function () {
    var brand = require('../api/_lib/logic-brand');
    assert.equal(brand({ whiteLabel: { platformName: 'X' } }).attribution, 'Powered by ClearSky OMEGA', 'default: our name stays');
    assert.equal(brand({ whiteLabel: { platformName: 'X', attribution: 'none' } }).attribution, '');
    var K = require('../api/_lib/kit'), m = K.message(K.forOrg(ORG, { name: 'Clean Cell', brandName: 'Clean Cell Power Platform' }), 'customer');
    assert.ok(/^Here is your Clean Cell Power Platform account/.test(m));
  });
  await test('each supplier\'s customer app is its own install on a phone; Omega Logic\'s apps are one', function () {
    var M = require('../api/app-manifest');
    assert.notEqual(M.manifestFor('a.example', { name: 'A' }, 'customer').id, M.manifestFor('b.example', { name: 'B' }, 'customer').id);
    assert.equal(M.manifestFor('a.example', {}, 'office').id, '/office/app');
    assert.equal(M.manifestFor('q.example', {}, 'customer').short_name, 'Your account');
    assert.equal(M.manifestFor('q.example', { name: 'Q Co', whiteLabel: { enabled: false, platformName: 'WL' } }, 'customer').name, 'Q Co', 'a white label that is off is not shown');
  });
  await test('the rules: people join only through the endpoints, are disabled not deleted, and the Editor Lite grant is not the tenant\'s to write', function () {
    var rules = fs.readFileSync(path.join(__dirname, '..', 'firestore.rules'), 'utf8');
    var block = rules.slice(rules.indexOf('match /customers/{customerId} {'), rules.indexOf('match /customer_index/{emailLower} {'));
    var users = block.slice(block.indexOf('match /users/{emailLower} {'));
    assert.match(users, /allow create: if false;/); assert.match(users, /allow delete: if false;/); assert.match(users, /affectedKeys\(\)\.hasOnly\(\['name', 'phone', 'role', 'status', 'updatedAt'\]\)/);
    assert.match(block, /get\('editorLite', null\) == resource\.data\.get\('editorLite', null\)/); assert.match(block, /!\('editorLite' in request\.resource\.data\)/);
    assert.match(block, /get\('supersededBy', ''\) == resource\.data\.get\('supersededBy', ''\)/);
  });
  await test('the office pages\' "Omega Logic" is never overwritten with a tenant\'s customer-facing name', function () {
    var styles = {}, texts = { brand: 'Customer page', product: 'Omega Logic' };
    var els = { '[data-brand-name]': [{ set textContent(v) { texts.brand = v; } }], '[data-product-name]': [{ set textContent(v) { texts.product = v; } }] };
    var sandbox = { window: {}, document: { documentElement: { style: { setProperty: function (k, v) { styles[k] = v; }, removeProperty: function (k) { delete styles[k]; } } }, body: { classList: { add: function () {} } }, querySelectorAll: function (q) { return els[q] || []; } } };
    require('node:vm').runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'omega-logic-theme.js'), 'utf8'), sandbox);
    var T = sandbox.window.OmegaLogicTheme;
    T.apply({ primary: '#123456' }); assert.equal(texts.brand, 'Customer page', 'a colour-only preview renames nothing');
    T.apply({ name: 'Clean Cell Power Platform', primary: '#123456' }); assert.equal(texts.brand, 'Clean Cell Power Platform'); assert.equal(texts.product, 'Omega Logic');
    T.reset(); assert.equal(styles['--brand'], undefined, 'reset returns to the product\'s colours');
  });
  console.log('\n' + count + ' customer account checks passed. No network calls.');
})().catch(function (e) { console.error(e); process.exit(1); });
