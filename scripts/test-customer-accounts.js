#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-customer-accounts.js — a workspace's customers are ACCOUNTS
   with people on them, end to end offline
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   Omega Logic is ClearSky's product, a tenant is a workspace in it, and the
   workspace's customers (Harbor Ridge Capital) are sub-accounts with several
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
var ORG = 'cleancell.us', O = 'omega_orgs/' + ORG, HRC = 'acct_harbor';
function person(email, extra) { return Object.assign({ uid: email.split('@')[0], email: email, orgId: email.split('@')[1], claims: { email_verified: true } }, extra || {}); }
var DANA = person('dana@harborridge.example'), CFO = person('cfo@harborridge.example'), JANE = person('jane@harborridge.example'), STRANGER = person('buyer@elsewhere.com');
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
  /* Harbor Ridge Capital, set up by the office (as the intake script does): a company with its domain, Dana its owner */
  db.seed(O + '/customers/' + HRC, { orgId: ORG, name: 'Harbor Ridge Capital', nameLower: 'harbor ridge capital', accountType: 'company', domain: 'harborridge.example', status: 'active', source: 'office', terms: { depositPct: 30 }, createdAt: '2026-09-22T00:00:00Z' });
  db.seed(O + '/customers/' + HRC + '/users/dana@harborridge.example', { email: 'dana@harborridge.example', name: 'Dana Whitfield', role: 'owner', status: 'active' });
  db.seed(O + '/customer_index/dana@harborridge.example', { customerId: HRC });
  /* another customer of the same workspace */
  db.seed(O + '/customers/acct_other', { orgId: ORG, name: 'Other Co', status: 'active', source: 'self', terms: {} });
  db.seed(O + '/customers/acct_other/users/buyer@elsewhere.com', { email: 'buyer@elsewhere.com', role: 'owner', status: 'active' });
  db.seed(O + '/customer_index/buyer@elsewhere.com', { customerId: 'acct_other' });
  /* the live Harbor Ridge order as it was first entered: billed to Dana, NO customerId */
  db.seed('orders/hrc1', { orgId: ORG, orderNo: 'CC-HRC-1', status: 'in_fulfilment', createdAt: '2026-09-22T10:00:00Z', customer: { email: 'dana@harborridge.example', name: 'Dana Whitfield', company: 'Harbor Ridge Capital' }, items: [{ sku: 'R60', name: 'R60 skid', qty: 56 }], purchaseOrder: { number: 'HR-PO-1001' } });
  /* an order stamped for the account, billed to a colleague */
  db.seed('orders/hrc2', { orgId: ORG, orderNo: 'CC-HRC-2', status: 'new', createdAt: '2026-09-23T10:00:00Z', customerId: HRC, customer: { email: 'ap@harborridge.example', name: 'AP', company: 'Harbor Ridge Capital' }, items: [{ sku: 'R60', qty: 2 }] });
  /* someone else's order, and one for Harbor Ridge's person but stamped for ANOTHER account, and one in another workspace */
  db.seed('orders/oth1', { orgId: ORG, orderNo: 'CC-OTH-1', status: 'new', createdAt: '2026-09-21T10:00:00Z', customerId: 'acct_other', customer: { email: 'buyer@elsewhere.com' }, items: [] });
  db.seed('orders/cross', { orgId: ORG, orderNo: 'CC-X', status: 'new', createdAt: '2026-09-20T10:00:00Z', customerId: 'acct_other', customer: { email: 'dana@harborridge.example' }, items: [] });
  db.seed('orders/elsewhere', { orgId: 'joules.example', orderNo: 'J-1', status: 'new', createdAt: '2026-09-20T10:00:00Z', customer: { email: 'dana@harborridge.example' }, items: [] });
  /* a PO still under office review is not an order yet */
  db.seed('orders/po_review', { orgId: ORG, orderNo: 'PO-IN-1', status: 'po_review', createdAt: '2026-09-24T10:00:00Z', customerId: HRC, customer: { email: '', company: 'Harbor Ridge Capital' }, poIntake: { number: 'X', createdAt: '2026-09-24T10:00:00Z' }, items: [] });
}
function nos(list) { return list.map(function (o) { return o.orderNo; }).sort(); }

(async function () {
  console.log('\nthe account is what people see');
  await test('an account\'s orders: its stamp, or billed to one of its people; never another account\'s, another workspace\'s, or a PO under review', async function () {
    seed(); var acct = await B.lookup(db, ORG, 'dana@harborridge.example');
    var r = await B.accountOrders(db, ORG, 'dana@harborridge.example', acct, {});
    assert.deepEqual(r.docs.map(function (d) { return d.id; }), ['hrc2', 'hrc1'], 'newest first, merged by id');
    var none = await B.accountOrders(db, ORG, 'buyer@elsewhere.com', null, {});
    assert.deepEqual(none.docs.map(function (d) { return d.id; }).sort(), ['oth1'], 'no account: the caller\'s own email only');
    var one = await B.accountOrders(db, ORG, 'dana@harborridge.example', acct, { orderNo: 'CC-HRC-2' });
    assert.deepEqual(one.docs.map(function (d) { return d.id; }), ['hrc2']);
  });
  await test('a colleague on the account sees every order on it in the customer app, and can ask about one', async function () {
    seed(); await B.addUser(db, ORG, HRC, 'cfo@harborridge.example', { name: 'Chief Financial' }, 'pm@cleancell.us', { source: 'office' });
    var out = await call(myOrders, 'GET', {}, CFO);
    assert.deepEqual(nos(out.orders), ['CC-HRC-1', 'CC-HRC-2']);
    var asked = await call(myOrders, 'POST', { orderNo: 'CC-HRC-1', kind: 'information', message: 'When does the first skid ship?' }, CFO);
    assert.equal(asked.ok, true); assert.equal(db.data.get('orders/hrc1').requests[0].by, 'cfo@harborridge.example');
    var own = await call(myOrders, 'GET', { orderNo: 'CC-HRC-1' }, DANA);
    assert.equal(own.orders[0].requests[0].by, 'cfo@harborridge.example', 'the owner sees who on the account asked');
    await rejects(call(myOrders, 'POST', { orderNo: 'CC-OTH-1', kind: 'information', message: 'Not mine at all' }, CFO), 404);
    var stranger = await call(myOrders, 'GET', {}, STRANGER);
    assert.deepEqual(nos(stranger.orders), ['CC-OTH-1', 'CC-X'], 'another account sees its own, never Harbor Ridge\'s');
  });
  await test('a suspended account, a turned-off or pending person asks nothing and sees nothing', async function () {
    seed(); await B.addUser(db, ORG, HRC, 'cfo@harborridge.example', {}, 'pm@cleancell.us', { source: 'office' });
    await B.setUser(db, ORG, HRC, 'cfo@harborridge.example', { status: 'disabled' }, 'pm@cleancell.us');
    await rejects(call(myOrders, 'POST', { orderNo: 'CC-HRC-1', kind: 'information', message: 'Hello there' }, CFO), 403, /disabled/);
    await rejects(call(myOrders, 'GET', {}, CFO), 403, /disabled/);
    db.seed(O + '/customers/' + HRC, Object.assign(db.data.get(O + '/customers/' + HRC), { status: 'suspended' }));
    await rejects(call(myOrders, 'POST', { orderNo: 'CC-HRC-1', kind: 'information', message: 'Hello there' }, DANA), 403, /disabled/);
  });

  console.log('\na colleague joins the company, never a company of their own');
  await test('first sign-in from the company\'s domain asks to join: pending, nothing visible, no second account', async function () {
    seed(); var before = [].concat(Array.from(db.data.keys())).filter(function (k) { return /\/customers\/[^/]+$/.test(k); }).length;
    var me = await call(myAccount, 'GET', {}, JANE);
    assert.equal(me.pending, true); assert.equal(me.company, 'Harbor Ridge Capital'); assert.equal(me.terms, undefined, 'no terms before approval');
    assert.equal(db.data.get(O + '/customer_index/jane@harborridge.example').customerId, HRC);
    assert.equal(db.data.get(O + '/customers/' + HRC + '/users/jane@harborridge.example').status, 'pending');
    assert.equal(Array.from(db.data.keys()).filter(function (k) { return /\/customers\/[^/]+$/.test(k); }).length, before, 'no new account');
    await rejects(call(myOrders, 'GET', {}, JANE), 403, /waiting for approval/);
    await rejects(call(myAccount, 'POST', { name: 'Jane' }, JANE), 403, /waiting for approval/);
    /* the owner sees the request and approves it from the app */
    var owner = await call(myAccount, 'GET', {}, DANA);
    assert.equal(owner.users.filter(function (u) { return u.email === 'jane@harborridge.example'; })[0].status, 'pending');
    var ok = await call(myAccount, 'POST', { action: 'user-status', email: 'jane@harborridge.example', status: 'active' }, DANA);
    assert.equal(ok.person.status, 'active');
    var now = await call(myOrders, 'GET', {}, JANE); assert.deepEqual(nos(now.orders), ['CC-HRC-1', 'CC-HRC-2']);
  });
  await test('a public mailbox never joins anyone; a stranger still gets an account of their own', async function () {
    seed(); var g = await call(myAccount, 'GET', {}, person('someone@gmail.com'));
    assert.equal(g.pending, undefined); assert.notEqual(g.customerId, HRC); assert.equal(g.you.role, 'owner');
  });

  console.log('\nthe owner manages the people on the account');
  await test('the owner adds a colleague at the company\'s own domain; not a public mailbox, not another domain, not twice', async function () {
    seed(); var r = await call(myAccount, 'POST', { action: 'add-user', email: 'CFO@harborridge.example', name: 'Chief Financial' }, DANA);
    assert.equal(r.person.role, 'user'); assert.equal(db.data.get(O + '/customer_index/cfo@harborridge.example').customerId, HRC);
    assert.ok(r.users.some(function (u) { return u.email === 'cfo@harborridge.example'; }));
    /* CUST-22: the page is told, by the same rule, whether the form can work here */
    assert.deepEqual(r.addPeople, { ok: true, domain: 'harborridge.example', why: null });
    assert.deepEqual((await call(myAccount, 'GET', {}, DANA)).addPeople, { ok: true, domain: 'harborridge.example', why: null });
    assert.equal((await call(myAccount, 'GET', {}, CFO)).addPeople.ok, false);
    await rejects(call(myAccount, 'POST', { action: 'add-user', email: 'friend@gmail.com' }, DANA), 400, /@harborridge\.example/);
    await rejects(call(myAccount, 'POST', { action: 'add-user', email: 'x@competitor.com' }, DANA), 400);
    await rejects(call(myAccount, 'POST', { action: 'add-user', email: 'cfo@harborridge.example' }, DANA), 409);
    await rejects(call(myAccount, 'POST', { action: 'add-user', email: 'buyer@elsewhere.com' }, DANA), 400);
    await rejects(call(myAccount, 'POST', { action: 'add-user', email: 'ops@harborridge.example' }, CFO), 403, /owner/);
  });
  await test('the owner turns a colleague off and on, never themselves; roles stay with the supplier', async function () {
    seed(); await call(myAccount, 'POST', { action: 'add-user', email: 'cfo@harborridge.example' }, DANA);
    await call(myAccount, 'POST', { action: 'user-status', email: 'cfo@harborridge.example', status: 'disabled' }, DANA);
    await rejects(call(myOrders, 'GET', {}, CFO), 403, /disabled/);
    await call(myAccount, 'POST', { action: 'user-status', email: 'cfo@harborridge.example', status: 'active' }, DANA);
    assert.equal((await call(myOrders, 'GET', {}, CFO)).orders.length, 2);
    await rejects(call(myAccount, 'POST', { action: 'user-status', email: 'dana@harborridge.example', status: 'disabled' }, DANA), 400, /your own/);
    await rejects(B.setUser(db, ORG, HRC, 'cfo@harborridge.example', { role: 'owner' }, 'dana@harborridge.example', { owner: true }), 403);
  });
  await test('a non-owner\'s company and address edits are said to be ignored, not silently dropped', async function () {
    seed(); await B.addUser(db, ORG, HRC, 'cfo@harborridge.example', {}, 'pm@cleancell.us', { source: 'office' });
    var r = await call(myAccount, 'POST', { name: 'Chief', company: 'Renamed Co', address: { line1: '1 Elsewhere' } }, CFO);
    assert.deepEqual(r.ignored, ['company', 'address']); assert.equal(db.data.get(O + '/customers/' + HRC).name, 'Harbor Ridge Capital'); assert.equal(r.orders, 2, 'the account\'s orders are counted');
  });

  console.log('\nthe office\'s Customer hub opens the account');
  await test('an account by id: every person with their status, every order on it, totals across them, the app link', async function () {
    seed(); await B.addUser(db, ORG, HRC, 'cfo@harborridge.example', {}, 'pm@cleancell.us', { source: 'office' }); await call(myAccount, 'GET', {}, JANE);
    var d = await call(buyers, 'GET', { customerId: HRC }, OFFICE);
    assert.equal(d.company, 'Harbor Ridge Capital'); assert.equal(d.people.length, 3); assert.equal(d.people[0].role, 'owner', 'the owner first');
    assert.equal(d.people.filter(function (u) { return u.status === 'pending'; })[0].email, 'jane@harborridge.example');
    assert.deepEqual(d.orders.map(function (o) { return o.orderNo; }), ['CC-HRC-2', 'CC-HRC-1']);
    assert.ok(d.orders[1].stage && d.orders[1].stage.label, 'orders carry their stage');
    assert.equal(d.orders[0].billedTo.email, 'ap@harborridge.example');
    assert.match(d.appUrl, /\/portals\/customer\/app\?org=cleancell\.us$/);
    var byEmail = await call(buyers, 'GET', { email: 'cfo@harborridge.example' }, OFFICE); assert.equal(byEmail.customerId, HRC, 'any person\'s email opens the same account');
    var list = await call(buyers, 'GET', {}, OFFICE); assert.equal(list.customers.filter(function (c) { return c.id === HRC; })[0].pending, 1);
    /* OFF-05: no customer email set up here, so both views say so (the page offers Share app link) — the same rule the invite action refuses on */
    assert.equal(list.inviteEmail, false); assert.equal(byEmail.inviteEmail, false);
    await rejects(call(buyers, 'POST', { action: 'invite', customerId: HRC, email: 'cfo@harborridge.example' }, OFFICE), 409, /Share the customer app link/);
  });
  await test('the office adds a person, and moves a colleague who signed in on their own onto the company when that account is empty', async function () {
    seed(); db.seed(O + '/customers/' + HRC, Object.assign(db.data.get(O + '/customers/' + HRC), { domain: '' }));
    var solo = await call(myAccount, 'GET', {}, JANE); assert.notEqual(solo.customerId, HRC, 'no domain on file: she got her own account');
    var moved = await call(buyers, 'POST', { action: 'user-add', customerId: HRC, email: 'jane@harborridge.example', name: 'Jane' }, OFFICE);
    assert.equal(moved.moved, solo.customerId); assert.equal(db.data.get(O + '/customer_index/jane@harborridge.example').customerId, HRC);
    assert.equal(db.data.get(O + '/customers/' + solo.customerId).status, 'suspended'); assert.equal(db.data.get(O + '/customers/' + solo.customerId).supersededBy, HRC);
    assert.equal(db.data.get(O + '/customers/' + solo.customerId + '/users/jane@harborridge.example').status, 'disabled');
    assert.equal((await call(myOrders, 'GET', {}, JANE)).orders.length, 2);
    await rejects(call(buyers, 'POST', { action: 'user-add', customerId: HRC, email: 'buyer@elsewhere.com' }, OFFICE), 409, /another customer account/);
  });
  await test('an account with history is never moved by a page', async function () {
    seed(); await rejects(call(buyers, 'POST', { action: 'user-add', customerId: 'acct_other', email: 'dana@harborridge.example' }, OFFICE), 409);
    db.seed('orders/solo', { orgId: ORG, orderNo: 'S-1', customerId: 'acct_solo', customer: { email: 'late@harborridge.example' } });
    db.seed(O + '/customers/acct_solo', { orgId: ORG, name: 'late@harborridge.example', status: 'active', source: 'self', terms: {} }); db.seed(O + '/customers/acct_solo/users/late@harborridge.example', { email: 'late@harborridge.example', role: 'owner', status: 'active' }); db.seed(O + '/customer_index/late@harborridge.example', { customerId: 'acct_solo' });
    await rejects(call(buyers, 'POST', { action: 'user-add', customerId: HRC, email: 'late@harborridge.example' }, OFFICE), 409);
  });
  await test('roles and access from the hub; an account always keeps an active owner', async function () {
    seed(); await call(buyers, 'POST', { action: 'user-add', customerId: HRC, email: 'cfo@harborridge.example' }, OFFICE);
    await rejects(call(buyers, 'POST', { action: 'user-status', customerId: HRC, email: 'dana@harborridge.example', status: 'disabled' }, OFFICE), 409, /active owner/);
    await call(buyers, 'POST', { action: 'user-status', customerId: HRC, email: 'cfo@harborridge.example', role: 'owner' }, OFFICE);
    await call(buyers, 'POST', { action: 'user-status', customerId: HRC, email: 'dana@harborridge.example', role: 'user' }, OFFICE);
    assert.equal(db.data.get(O + '/customers/' + HRC + '/users/cfo@harborridge.example').role, 'owner');
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
  await test('one company, one account: a second "Harbor Ridge Capital" is refused wherever it is attempted', async function () {
    seed(); var e = await rejects(call(buyers, 'POST', { action: 'create', company: 'Harbor Ridge  capital', name: 'Jane', email: 'jane@harborridge.example' }, OFFICE), 409, /already has an account/);
    assert.equal(e.existingCustomerId, HRC);
    db.seed(O + '/customers/legacy', { orgId: ORG, name: 'Legacy Buyer Inc', status: 'active' });
    var dup = await call(intake, 'POST', { office: true, action: 'company', name: 'legacy buyer inc' }, OFFICE);
    assert.equal(dup.duplicate, true); assert.equal(dup.customerId, 'legacy');
  });
  await test('the PO inbox\'s "add a contact" is the same one writer', async function () {
    seed(); var r = await call(intake, 'POST', { office: true, action: 'contact', customerId: HRC, email: 'cfo@harborridge.example', name: 'CFO' }, OFFICE);
    assert.equal(r.ok, true); assert.equal(db.data.get(O + '/customer_index/cfo@harborridge.example').customerId, HRC);
    await rejects(call(intake, 'POST', { office: true, action: 'contact', customerId: HRC, email: 'cfo@harborridge.example' }, OFFICE), 409);
  });

  console.log('\nwho may put whom on an account');
  function selfAccount(id, email, name) {
    db.seed(O + '/customers/' + id, { orgId: ORG, name: name || email, status: 'active', source: 'self', terms: {}, agreements: [] });
    db.seed(O + '/customers/' + id + '/users/' + email, { email: email, role: 'owner', status: 'active' });
    db.seed(O + '/customer_index/' + email, { customerId: id });
  }
  await test('a self-made account whose name a customer typed is never "the company" to the office', async function () {
    seed(); selfAccount('acct_squat', 'intern@bigcorp.example', 'BigCorp');
    assert.equal(await B.findByName(db, ORG, 'BigCorp'), null);
    var made = await call(buyers, 'POST', { action: 'create', company: 'BigCorp', name: 'Buyer', email: 'buyer@bigcorp.example', domain: 'bigcorp.example' }, OFFICE);
    assert.notEqual(made.customerId, 'acct_squat'); assert.equal(db.data.get(O + '/customers/' + made.customerId).domain, 'bigcorp.example');
    var po = await call(intake, 'POST', { office: true, action: 'company', name: 'Squat Co' }, OFFICE); selfAccount('acct_sq2', 'x@squat.example', 'Squat Two');
    assert.notEqual((await call(intake, 'POST', { office: true, action: 'company', name: 'Squat Two' }, OFFICE)).customerId, 'acct_sq2');
    assert.ok(po.customerId);
  });
  await test('a typed domain is never silently dropped when the company already exists', async function () {
    seed(); db.seed(O + '/customers/legacy', { orgId: ORG, name: 'Legacy Buyer Inc', status: 'active', source: 'office' });
    var set = await call(intake, 'POST', { office: true, action: 'company', name: 'Legacy Buyer Inc', domain: 'legacybuyer.example' }, OFFICE);
    assert.equal(set.domainSet, 'legacybuyer.example'); assert.equal(db.data.get(O + '/customers/legacy').domain, 'legacybuyer.example'); assert.equal(db.data.get(O + '/customers/legacy').accountType, 'company');
    var ign = await call(intake, 'POST', { office: true, action: 'company', name: 'Harbor Ridge Capital', domain: 'other.example' }, OFFICE);
    assert.equal(ign.customerId, HRC); assert.equal(ign.domainIgnored, 'other.example'); assert.equal(db.data.get(O + '/customers/' + HRC).domain, 'harborridge.example');
  });
  await test('the office company domain is what the office TYPED, never read off the contact', async function () {
    seed(); var c = await call(buyers, 'POST', { action: 'create', company: 'Consulted Co', name: 'Advisor', email: 'advisor@bigconsulting.example' }, OFFICE);
    assert.equal(db.data.get(O + '/customers/' + c.customerId).domain, undefined);
    await rejects(call(buyers, 'POST', { action: 'create', company: 'Mailbox Co', name: 'X', email: 'x@mailbox.example', domain: 'gmail.com' }, OFFICE), 400, /public mailbox/);
    ['rr.com', 'optonline.net', 'frontier.com', 'juno.com', 'btinternet.com', 'yahoo.fr'].forEach(function (d) { assert.equal(B.companyDomain('a@' + d), '', d); });
  });
  await test('an owner of a self-made account cannot pull anybody in; an owner never adds someone with orders here', async function () {
    seed(); selfAccount('acct_intern', 'intern@bigcorp.example', 'BigCorp');
    await rejects(call(myAccount, 'POST', { action: 'add-user', email: 'ceo@bigcorp.example' }, person('intern@bigcorp.example')), 403, /supplier/);
    assert.equal((await call(myAccount, 'GET', {}, person('intern@bigcorp.example'))).addPeople.ok, false, 'a self-made account is told no before it tries');
    assert.equal(db.data.get(O + '/customer_index/ceo@bigcorp.example'), undefined);
    db.seed('orders/ap1', { orgId: ORG, orderNo: 'AP-1', createdAt: '2026-09-01T00:00:00Z', customer: { email: 'ap@harborridge.example' }, items: [] });
    await rejects(call(myAccount, 'POST', { action: 'add-user', email: 'ap@harborridge.example' }, DANA), 409, /already has orders/);
  });
  await test('someone with orders here signs in: their own account, not a join request that would fold their history in', async function () {
    seed(); db.seed('orders/ops1', { orgId: ORG, orderNo: 'OPS-1', createdAt: '2026-09-01T00:00:00Z', customer: { email: 'ops@harborridge.example', name: 'Ops' }, items: [] });
    var me = await call(myAccount, 'GET', {}, person('ops@harborridge.example'));
    assert.equal(me.pending, undefined); assert.notEqual(me.customerId, HRC);
  });
  await test('an order is stamped for an account only for a person it admitted; a turned-off colleague\'s past orders stay the account\'s', async function () {
    seed(); await call(myAccount, 'GET', {}, JANE);
    assert.equal(await B.stampableAccount(db, ORG, 'jane@harborridge.example'), null, 'pending never stamps');
    assert.equal(await B.accountOfOrder(db, ORG, { customer: { email: 'jane@harborridge.example' } }), null);
    assert.equal(await B.accountOfOrder(db, ORG, { source: 'embed', customer: { email: 'dana@harborridge.example' } }), null, 'a public page proves nothing');
    assert.equal(await B.accountOfOrder(db, ORG, { customer: { email: 'dana@harborridge.example' } }), HRC);
    await B.addUser(db, ORG, HRC, 'cfo@harborridge.example', {}, 'pm@cleancell.us', { source: 'office' });
    db.seed('orders/cfo1', { orgId: ORG, orderNo: 'CFO-1', createdAt: '2026-09-24T09:00:00Z', customer: { email: 'cfo@harborridge.example' }, items: [] });
    await B.setUser(db, ORG, HRC, 'cfo@harborridge.example', { status: 'disabled' }, 'pm@cleancell.us', {});
    var seen = await call(myOrders, 'GET', {}, DANA); assert.ok(nos(seen.orders).indexOf('CFO-1') >= 0, 'a departed colleague\'s order stays on the account');
    db.seed('orders/jane1', { orgId: ORG, orderNo: 'JANE-1', createdAt: '2026-09-24T09:00:00Z', customer: { email: 'jane@harborridge.example' }, items: [] });
    assert.ok(nos((await call(myOrders, 'GET', {}, DANA)).orders).indexOf('JANE-1') < 0, 'a request still waiting does not bring its orders');
  });
  await test('declining a request is its own state; the office can then move that login to the right company', async function () {
    seed(); await call(myAccount, 'GET', {}, JANE);
    var d = await call(myAccount, 'POST', { action: 'user-status', email: 'jane@harborridge.example', status: 'disabled' }, DANA);
    assert.match(d.note, /declined/i); var u = db.data.get(O + '/customers/' + HRC + '/users/jane@harborridge.example'); assert.equal(u.declined, true); assert.equal(u.status, 'disabled');
    assert.equal(d.users.filter(function (x) { return x.email === 'jane@harborridge.example'; })[0].declined, true);
    var other = await call(intake, 'POST', { office: true, action: 'company', name: 'Harbor Ridge Holdings' }, OFFICE);
    var moved = await call(buyers, 'POST', { action: 'user-add', customerId: other.customerId, email: 'jane@harborridge.example' }, OFFICE);
    assert.equal(moved.moved, HRC); assert.equal(db.data.get(O + '/customer_index/jane@harborridge.example').customerId, other.customerId);
    assert.equal(db.data.get(O + '/customers/' + HRC).status, 'active', 'the company she was turned away from is untouched');
    assert.equal(db.data.get(O + '/customers/' + HRC + '/users/jane@harborridge.example').movedTo, other.customerId);
    assert.ok(Array.from(db.data.keys()).some(function (k) { return /^omega_audit\//.test(k) && db.data.get(k).action === 'buyer-request-rehomed'; }));
    /* a colleague who WAS admitted is never moved by a page */
    await B.addUser(db, ORG, HRC, 'cfo@harborridge.example', {}, 'pm@cleancell.us', { source: 'office' });
    await rejects(call(buyers, 'POST', { action: 'user-add', customerId: other.customerId, email: 'cfo@harborridge.example' }, OFFICE), 409);
  });
  await test('an account with no owner yet: the office still approves a request and turns people off', async function () {
    seed(); var c = await call(intake, 'POST', { office: true, action: 'company', name: 'Acme Solar', domain: 'acmesolar.example' }, OFFICE);
    await call(intake, 'POST', { office: true, action: 'contact', customerId: c.customerId, email: 'buyer@acmesolar.example', role: 'user' }, OFFICE);
    var me = await call(myAccount, 'GET', {}, person('ops@acmesolar.example')); assert.equal(me.pending, true);
    await call(buyers, 'POST', { action: 'user-status', customerId: c.customerId, email: 'ops@acmesolar.example', status: 'active' }, OFFICE);
    await call(buyers, 'POST', { action: 'user-status', customerId: c.customerId, email: 'buyer@acmesolar.example', status: 'disabled' }, OFFICE);
    assert.equal(db.data.get(O + '/customers/' + c.customerId + '/users/ops@acmesolar.example').status, 'active');
  });
  await test('the move of a stray login re-checks INSIDE the transaction: an order landing meanwhile aborts it', async function () {
    seed(); db.seed(O + '/customers/' + HRC, Object.assign(db.data.get(O + '/customers/' + HRC), { domain: '' }));
    var solo = await call(myAccount, 'GET', {}, JANE);
    var run = db.runTransaction.bind(db);
    db.runTransaction = function (fn) { db.seed('orders/race', { orgId: ORG, orderNo: 'R-1', customerId: solo.customerId, customer: { email: 'jane@harborridge.example' }, items: [] }); db.runTransaction = run; return run(fn); };
    await rejects(call(buyers, 'POST', { action: 'user-add', customerId: HRC, email: 'jane@harborridge.example' }, OFFICE), 409, /changed while it was being moved/);
    assert.equal(db.data.get(O + '/customer_index/jane@harborridge.example').customerId, solo.customerId); assert.equal(db.data.get(O + '/customers/' + solo.customerId).status, 'active');
  });
  await test('the phone\'s domain-only Save touches only the domain; a save returns the people', async function () {
    seed(); db.seed(O + '/customers/' + HRC, Object.assign(db.data.get(O + '/customers/' + HRC), { status: 'suspended', address: { line1: '9 New Ave' } }));
    await call(buyers, 'POST', { action: 'profile', customerId: HRC, domain: 'harbor-ridge.example' }, OFFICE);
    var a = db.data.get(O + '/customers/' + HRC); assert.equal(a.status, 'suspended'); assert.equal(a.address.line1, '9 New Ave'); assert.equal(a.name, 'Harbor Ridge Capital'); assert.equal(a.domain, 'harbor-ridge.example');
    await rejects(call(buyers, 'POST', { action: 'profile', customerId: HRC }, OFFICE), 400, /Nothing to change/);
    seed(); await call(myAccount, 'GET', {}, JANE);
    var saved = await call(myAccount, 'POST', { phone: '555-0100' }, DANA); assert.equal(saved.users.length, 2);
  });
  await test('an order with no stamp is found by the account\'s admitted people even past the first page of stamped ones', async function () {
    seed(); for (var i = 0; i < 120; i++) db.seed('orders/bulk' + i, { orgId: ORG, orderNo: 'B-' + i, createdAt: '2026-01-01T00:00:' + String(i % 60).padStart(2, '0') + 'Z', customerId: HRC, customer: { email: 'ap@harborridge.example' }, items: [] });
    var acct = await B.lookup(db, ORG, 'dana@harborridge.example'), r = await B.accountOrders(db, ORG, 'dana@harborridge.example', acct, { limit: 100 });
    assert.equal(r.docs[0].id, 'hrc2', 'the newest first across the over-fetch'); assert.equal(r.docs.length, 100); assert.equal(r.truncated, true);
  });

  console.log('\nthe second review of those fixes');
  await test('a customer cannot rename a company the supplier set up (it is what the office matches on)', async function () {
    seed(); var r = await call(myAccount, 'POST', { company: 'Beta Power' }, DANA);
    assert.deepEqual(r.ignored, ['company']); assert.match(r.note, /supplier keeps the company name/); assert.equal(r.companyLocked, true);
    assert.equal(db.data.get(O + '/customers/' + HRC).name, 'Harbor Ridge Capital');
    assert.equal(await B.findByName(db, ORG, 'Beta Power'), null);
    selfAccount('acct_mine', 'me@ownco.example', 'Own Co'); var own = await call(myAccount, 'POST', { company: 'Own Company' }, person('me@ownco.example'));
    assert.equal(own.ignored, undefined); assert.equal(db.data.get(O + '/customers/acct_mine').name, 'Own Company', 'a self-made account is the customer\'s to name');
    /* the legacy scan never matches a record that carries the office key */
    db.seed(O + '/customers/' + HRC, Object.assign(db.data.get(O + '/customers/' + HRC), { name: 'Gamma Grid' }));
    assert.equal(await B.findByName(db, ORG, 'Gamma Grid'), null);
  });
  await test('a company on credit hold is still THE company; nobody makes a second one', async function () {
    seed(); db.seed(O + '/customers/' + HRC, Object.assign(db.data.get(O + '/customers/' + HRC), { status: 'suspended' }));
    await rejects(call(buyers, 'POST', { action: 'create', company: 'Harbor Ridge Capital', name: 'New', email: 'new@harborridge.example' }, OFFICE), 409, /already has an account \(suspended\)/);
    var po = await call(intake, 'POST', { office: true, action: 'company', name: 'Harbor Ridge Capital' }, OFFICE); assert.equal(po.customerId, HRC); assert.equal(po.status, 'suspended');
    assert.equal(await B.joinRequest(db, ORG, 'ops@harborridge.example', { uid: 'o' }), null, 'but nobody joins a suspended company');
  });
  await test('a login the office moved away is final on the old account: never turned back on, never reading there', async function () {
    seed(); var fund2 = person('fund2@harborridge.example'); await call(myAccount, 'GET', {}, fund2);
    await call(myAccount, 'POST', { action: 'user-status', email: 'fund2@harborridge.example', status: 'disabled' }, DANA);
    var other = await call(intake, 'POST', { office: true, action: 'company', name: 'Harbor Ridge Fund II' }, OFFICE);
    await call(buyers, 'POST', { action: 'user-add', customerId: other.customerId, email: 'fund2@harborridge.example' }, OFFICE);
    db.seed('orders/emb1', { orgId: ORG, orderNo: 'CC-EMB-1', source: 'embed', createdAt: '2026-09-24T11:00:00Z', customer: { email: 'fund2@harborridge.example' }, items: [] });
    await rejects(call(myAccount, 'POST', { action: 'user-status', email: 'fund2@harborridge.example', status: 'active' }, DANA), 409, /another customer account/);
    await rejects(call(buyers, 'POST', { action: 'user-status', customerId: HRC, email: 'fund2@harborridge.example', status: 'active' }, OFFICE), 409);
    assert.ok(nos((await call(myOrders, 'GET', {}, DANA)).orders).indexOf('CC-EMB-1') < 0);
    var owner = await call(myAccount, 'GET', {}, DANA); assert.ok(!owner.users.some(function (u) { return u.email === 'fund2@harborridge.example'; }), 'not listed on the old account');
    var hub = await call(buyers, 'GET', { customerId: HRC }, OFFICE); assert.equal(hub.movedPeople[0].email, 'fund2@harborridge.example'); assert.ok(!hub.people.some(function (u) { return u.email === 'fund2@harborridge.example'; }));
  });
  await test('an owner whose own email is at another domain cannot add people', async function () {
    seed(); await B.addUser(db, ORG, HRC, 'advisor@consultco.example', { role: 'owner' }, 'pm@cleancell.us', { source: 'office' });
    await rejects(call(myAccount, 'POST', { action: 'add-user', email: 'x@harborridge.example' }, person('advisor@consultco.example')), 403, /supplier/);
  });
  await test('every admitted person\'s orders reach the account, however many people it has', async function () {
    seed(); for (var i = 0; i < 45; i++) { await B.addUser(db, ORG, HRC, 'p' + i + '@harborridge.example', {}, 'pm@cleancell.us', { source: 'office' }); db.seed('orders/p' + i, { orgId: ORG, orderNo: 'P-' + i, createdAt: '2026-09-2' + (i % 4) + 'T00:00:00Z', customer: { email: 'p' + i + '@harborridge.example' }, items: [] }); }
    var acct = await B.lookup(db, ORG, 'dana@harborridge.example'), r = await B.accountOrders(db, ORG, 'dana@harborridge.example', acct, { limit: 100 });
    assert.ok(r.docs.some(function (d) { return d.id === 'p44'; }), 'the 45th person is not cut off');
  });

  console.log('\ncustody follows the account');
  function seedUnits() {
    db.seed('plant_units/' + ORG + '__HRC-001', { orgId: ORG, serial: 'HRC-001', rootSerial: 'HRC-001', sku: 'R60', shipUnit: true, orderId: 'hrc1', at: 'ready', custody: { status: 'received', receivedAt: '2026-09-23' } });
    db.seed(O + '/sites/site_hrc', { orgId: ORG, name: 'Harbor Ridge yard', customerId: HRC, status: 'active', address: {} });
    db.seed(O + '/sites/site_other', { orgId: ORG, name: 'Other yard', customerId: 'acct_other', status: 'active', address: {} });
  }
  await test('an office assignment ties the unit to the order\'s account (even an order with no stamp), and refuses another customer\'s site', async function () {
    seed(); seedUnits();
    await rejects(call(custody, 'POST', { action: 'move', move: 'assign', serial: 'HRC-001', siteId: 'site_other' }, OFFICE), 409, /another customer account/);
    var ok = await call(custody, 'POST', { action: 'move', move: 'assign', serial: 'HRC-001', siteId: 'site_hrc' }, OFFICE);
    assert.equal(ok.custody.customerId, HRC);
  });

  await test('QuickBooks bills the ACCOUNT as one customer, whoever on it the order is billed to; a storefront buyer stays keyed by email', async function () {
    mock('../api/_lib/qbo', { accessToken: async function () { return { token: 't', realmId: '123' }; }, API_BASE: 'https://qbo.test' });
    var queried = [], realFetch = global.fetch;
    global.fetch = async function (url) { var u = decodeURIComponent(String(url)); var m = /DisplayName = '([^']+)'/.exec(u); if (m) queried.push(m[1]);
      return { ok: true, status: 200, json: async function () { return /query\?/.test(u) ? { QueryResponse: {} } : /\/customer\?/.test(u) ? { Customer: { Id: 'c1' } } : { Invoice: { Id: 'i1' } }; } }; };
    try {
      var Q = require('../api/_lib/qbo-sales');
      function ord(email, cid) { return { orgId: ORG, orderNo: 'N', customerId: cid, customer: { email: email, company: 'Harbor Ridge Capital' }, logic: { realmId: '123', itemRef: '5', commercial: { depositCents: 100, feeCents: 0, totalCents: 100, terms: { dueDays: 0 } }, invoices: { deposit: { amountCents: 100, date: '2026-09-24', requestId: 'r' } } } }; }
      await Q.invoice(ord('dana@harborridge.example', HRC), 'deposit'); await Q.invoice(ord('cfo@harborridge.example', HRC), 'deposit'); await Q.invoice(ord('walkin@example.com'), 'deposit');
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
