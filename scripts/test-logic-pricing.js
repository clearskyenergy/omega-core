#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-logic-pricing.js — who approves a price and accepts an order
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   D1 (2026-09-24): a workspace's owner or admin (active) approves the price
   and accepts the orders the workspace bills ITSELF; ClearSky prices
   everything billed through its QuickBooks and may act everywhere; a
   member or viewer never may; every price and acceptance records who and
   when. One rule (logic-access.requirePricer, reading office-stage
   billingOf), enforced at the office door AND inside the workflow's one
   writer (logic-workflow price), and told to the office page as each
   order's `can` / `waitingOn` (office-stage actions).

   The end-to-end checks drive api/logic-office.js and api/_lib/
   logic-workflow.js against the in-memory Firestore double. No network.

     NODE_PATH=node_modules node scripts/test-logic-pricing.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var assert = require('node:assert/strict');
var FD = require('./_lib/firestore-double'), DB = FD.DB, mock = FD.mock;

/* the Admin SDK refuses `undefined`: so does every write here */
function noUndefined(v, where) {
  if (v === undefined) throw new Error('undefined written at ' + where);
  if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { noUndefined(v[k], where + '.' + k); });
}
var realTx = DB.prototype.runTransaction;
DB.prototype.runTransaction = function (fn) {
  return realTx.call(this, function (tx) {
    return fn({ get: tx.get,
      create: function (r, v) { noUndefined(v, r.path); return tx.create(r, v); },
      set: function (r, v, o) { noUndefined(v, r.path); return tx.set(r, v, o); },
      update: function (r, v) { noUndefined(v, r.path); return tx.update(r, v); } });
  });
};
['set', 'update', 'create'].forEach(function (m) { var real = FD.Ref.prototype[m]; FD.Ref.prototype[m] = function (v, o) { noUndefined(v, this.path); return real.call(this, v, o); }; });

var db;
var A = { db: function () { return db; }, safeOrg: function (v) { return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v || '') ? v : ''; },
  httpError: function (s, m) { var e = new Error(m); e.status = s; return e; }, orgOf: function (e) { return String(e || '').toLowerCase().split('@')[1] || ''; },
  authenticate: async function (req) { return req.caller; }, handler: function (fn) { return fn; },
  canActInOrg: async function (c, org) { if (c.staff || c.orgId === org) return true; var g = await db.collection('org_members').doc(String(c.email).toLowerCase()).get(); return g.exists && g.data().active !== false && g.data().orgId === org; },
  isTenantAdmin: async function (c, org) { return !!c.staff || c.orgId === org; },
  FieldValue: function () { return { serverTimestamp: function () { return '2026-09-24T12:00:00Z'; }, arrayUnion: function () { return { union: Array.from(arguments) }; } }; } };
mock('../api/_lib/admin', A);
/* pricing never reaches QuickBooks: invoices are the worker's, later */
mock('../api/_lib/qbo-sales', { invoice: async function () { throw new Error('QuickBooks called while pricing'); }, reconcile: async function () { throw new Error('QuickBooks called while pricing'); } });
mock('../api/_lib/qbo', { load: async function () { return { realmId: '123' }; } });

var S = require('../api/_lib/office-stage'), X = require('../api/_lib/logic-access'), W = require('../api/_lib/logic-workflow'), office = require('../api/logic-office');

var ORG = 'cleancell.us', O = 'omega_orgs/' + ORG;
function person(email, extra) { return Object.assign({ uid: email.split('@')[0], email: email, orgId: email.split('@')[1], staff: false, claims: { email_verified: true } }, extra || {}); }
var CLEARSKY = person('tom@clearsky-usa.com', { uid: 'tom', staff: true });
var OWNER = person('boss@cleancell.us'), ADMIN = person('office@cleancell.us'), MEMBER = person('floor@cleancell.us'), VIEWER = person('look@cleancell.us');
var GONE = person('gone@cleancell.us'), UNVERIFIED = person('new@cleancell.us', { claims: { email_verified: false } });
var OTHER_ADMIN = person('admin@othercorp.example'), STAFF = person('rep@csebuilders.com', { staff: true });
var res = { headers: {}, setHeader: function (k, v) { this.headers[k] = v; } };
function post(body, caller) { return office({ method: 'POST', body: Object.assign({ org: ORG }, body), caller: caller }, res); }
function get(caller) { return office({ method: 'GET', query: { org: ORG }, caller: caller }, res); }
async function rejects(p, status, re) {
  try { await p; } catch (e) { assert.equal(e.status, status, e.message); if (re) assert.match(e.message, re); return e; }
  throw new Error('expected a ' + status + (re ? ' ' + re : ''));
}
function order(id) { return db.data.get('orders/' + (id || 'q1')); }
function events(id) { return Array.from(db.data.keys()).filter(function (k) { return k.indexOf('orders/' + (id || 'q1') + '/events/') === 0; }).map(function (k) { return db.data.get(k); }); }
/* The workflow's own gate is part of D1: before it, W.price refused every
   non-ClearSky caller outright. Say so plainly when that is what failed. */
function needsWorkflowGate(e) { if (e && /restricted to the verified ClearSky owner/.test(e.message)) e.message = 'logic-workflow price() still gates on requireOwner: it must call X.requirePricer (D1). ' + e.message; throw e; }
var count = 0; async function test(name, fn) { await fn(); count++; console.log('PASS ' + name); }

function seed(accounting) {
  db = new DB();
  db.seed(O, { name: 'Clean Cell', status: 'active', vertical: 'oem' });
  db.seed(O + '/billing/current', { addons: ['omega-logic'] });
  db.seed(O + '/fulfillment/config', accounting === 'quickbooks'
    ? { enabled: true, accounting: 'quickbooks', realmId: '123', itemRef: '5', accountingApproved: true, terms: { depositPct: 30, dueDays: 0 }, fee: { percent: 0.25, fixed: 0 } }
    : { enabled: true, accounting: 'tenant', terms: { depositPct: 30, dueDays: 0 }, fee: { percent: 0.25, fixed: 0 } });
  db.seed(O + '/members/boss', { email: OWNER.email, role: 'owner', status: 'active' });
  db.seed(O + '/members/office', { email: ADMIN.email, role: 'admin', status: 'active' });
  db.seed(O + '/members/floor', { email: MEMBER.email, role: 'member', status: 'active' });
  db.seed(O + '/members/look', { email: VIEWER.email, role: 'viewer', status: 'active' });
  db.seed(O + '/members/gone', { email: GONE.email, role: 'admin', status: 'disabled' });
  db.seed(O + '/members/new', { email: UNVERIFIED.email, role: 'admin', status: 'active' });
  db.seed('omega_orgs/othercorp.example', { name: 'Other Corp', status: 'active', vertical: 'oem' });
  db.seed('omega_orgs/othercorp.example/members/admin', { email: OTHER_ADMIN.email, role: 'admin', status: 'active' });
  db.seed('orders/q1', { orgId: ORG, orderNo: 'CC-Q1', status: 'new', createdAt: '2026-09-22T10:00:00Z',
    customer: { name: 'Dana Reyes', company: 'Harbor Microgrid Co', email: 'dana@harbor-microgrid.example' }, items: [{ sku: 'CC-R60K', name: 'R60 skid', qty: 2 }] });
}

async function main() {
  console.log('\nthe one rule, pure (office-stage)');
  await test('1 · billingOf: the workspace setting until priced, then the order\'s own mode', async function () {
    assert.equal(S.billingOf({}, 'tenant'), 'tenant');
    assert.equal(S.billingOf({}, 'quickbooks'), 'quickbooks');
    assert.equal(S.billingOf({}, undefined), 'quickbooks', 'nothing said is ClearSky\'s QuickBooks, the default');
    assert.equal(S.billingOf({ logic: { accounting: 'quickbooks' } }, 'tenant'), 'quickbooks', 'a QuickBooks-priced order stays ClearSky\'s after the workspace switches');
    assert.equal(S.billingOf({ logic: { accounting: 'tenant' } }, 'quickbooks'), 'tenant');
    assert.equal(S.billingOf({ logic: { commercial: { billing: 'tenant' } } }, 'quickbooks'), 'tenant', 'the commercial snapshot counts too');
    assert.equal(S.billingOf({ logic: { commercial: {} } }, 'tenant'), 'quickbooks', 'a priced order with no mode predates tenant billing');
  });
  await test('2 · stageOf: price and accept wait on ClearSky only when ClearSky bills the order', async function () {
    assert.equal(S.stageOf({ status: 'new' }).owner, true);
    assert.equal(S.stageOf({ status: 'new' }, { billing: 'quickbooks' }).owner, true);
    var q = S.stageOf({ status: 'new' }, { billing: 'tenant' });
    assert.equal(q.key, 'quote'); assert.equal(q.owner, false); assert.equal(q.next, 'Approve the customer price');
    var p = S.stageOf({ status: 'quoted', logic: { accounting: 'tenant', invoices: {} } });
    assert.equal(p.key, 'priced'); assert.equal(p.owner, false);
    assert.equal(S.stageOf({ status: 'quoted', logic: { accounting: 'quickbooks', invoices: {} } }, { billing: 'tenant' }).owner, true);
    assert.equal(S.stageOf({ status: 'in_fulfilment', logic: { accounting: 'tenant', acceptedAt: 1, releasedAt: 1, invoices: { deposit: { satisfied: true }, balance: { satisfied: true } } } }).owner, true, 'recording the shipment is still ClearSky\'s');
  });
  await test('3 · actions: who may, per order, and who it waits on otherwise', async function () {
    var admin = S.access(false, { role: 'admin', status: 'active' }, true), member = S.access(false, { role: 'member', status: 'active' }, true), sky = S.access(true, null, true);
    var disabled = S.access(false, { role: 'admin', status: 'disabled' }, true), off = S.access(false, { role: 'owner' }, false);
    var quote = { status: 'new' }, priced = { status: 'quoted', logic: { accounting: 'tenant', invoices: {} } }, qbPriced = { status: 'quoted', logic: { accounting: 'quickbooks', invoices: {} } };
    assert.deepEqual(S.actions(quote, admin, 'tenant').can, { price: true, accept: false }); assert.equal(S.actions(quote, admin, 'tenant').waitingOn, null);
    assert.deepEqual(S.actions(priced, admin, 'tenant').can, { price: false, accept: true });
    assert.deepEqual(S.actions(quote, admin, 'quickbooks').can, { price: false, accept: false }); assert.equal(S.actions(quote, admin, 'quickbooks').waitingOn, 'clearsky');
    assert.deepEqual(S.actions(qbPriced, admin, 'tenant').can, { price: false, accept: false }); assert.equal(S.actions(qbPriced, admin, 'tenant').waitingOn, 'clearsky');
    assert.deepEqual(S.actions(quote, member, 'tenant').can, { price: false, accept: false }); assert.equal(S.actions(quote, member, 'tenant').waitingOn, 'admin');
    assert.equal(S.actions(quote, disabled, 'tenant').can.price, false, 'a disabled admin is not an admin');
    assert.equal(S.access(false, { role: 'owner' }, true).admin, true, 'a member record with no status predates the field and is active');
    assert.equal(S.actions(quote, off, 'tenant').can.price, false); assert.equal(S.actions(quote, off, 'tenant').waitingOn, 'clearsky', 'Omega Logic switched off: ClearSky switches it on');
    assert.deepEqual(S.actions(quote, sky, 'quickbooks').can, { price: true, accept: false }); assert.deepEqual(S.actions(priced, sky, 'tenant').can, { price: false, accept: true });
    assert.equal(S.actions({ status: 'new', cancelRequested: true }, sky, 'tenant').can.price, false, 'a cancelled request is not priced');
    assert.equal(S.actions({ status: 'cancelled', logic: { accounting: 'tenant', invoices: {} } }, admin, 'tenant').can.accept, false);
    var ship = { status: 'in_fulfilment', logic: { accounting: 'tenant', acceptedAt: 1, releasedAt: 1, invoices: { deposit: { satisfied: true }, balance: { satisfied: true } } } };
    assert.equal(S.actions(ship, admin, 'tenant').waitingOn, 'clearsky'); assert.equal(S.actions(ship, sky, 'tenant').waitingOn, null);
    assert.equal(S.actions({ status: 'accepted', logic: { accounting: 'tenant', acceptedAt: 1, invoices: {} } }, member, 'tenant').waitingOn, null, 'a deposit being queued waits on nobody in particular');
  });

  console.log('\nthe gate (logic-access.requirePricer)');
  await test('4 · requirePricer: ClearSky always; an active owner or admin on a tenant-billed order; nobody else', async function () {
    seed('tenant'); var ctx = await X.context(ORG), q = order();
    assert.equal(await X.requirePricer(CLEARSKY, ctx, q), 'clearsky');
    assert.equal(await X.requirePricer(OWNER, ctx, q), 'owner');
    assert.equal(await X.requirePricer(ADMIN, ctx, q), 'admin');
    await rejects(X.requirePricer(MEMBER, ctx, q), 403, /owner or an administrator/);
    await rejects(X.requirePricer(VIEWER, ctx, q), 403, /owner or an administrator/);
    await rejects(X.requirePricer(GONE, ctx, q), 403, /owner or an administrator/);
    await rejects(X.requirePricer(UNVERIFIED, ctx, q), 403, /Verify/);
    await rejects(X.requirePricer(OTHER_ADMIN, ctx, q), 403, /Not your OEM workspace/);
    await rejects(X.requirePricer(STAFF, ctx, q), 403, /Not your OEM workspace/);
    await rejects(X.requirePricer(ADMIN, ctx, Object.assign({}, q, { orgId: 'othercorp.example' })), 404);
    /* the same admin, on an order billed through ClearSky's QuickBooks */
    await rejects(X.requirePricer(ADMIN, ctx, Object.assign({}, q, { logic: { accounting: 'quickbooks', invoices: {} } })), 403, /ClearSky approves/);
    seed('quickbooks'); ctx = await X.context(ORG);
    await rejects(X.requirePricer(ADMIN, ctx, order()), 403, /ClearSky approves/);
    await rejects(X.requirePricer(OWNER, ctx, order()), 403, /ClearSky approves/);
    assert.equal(await X.requirePricer(CLEARSKY, ctx, order()), 'clearsky');
    /* a lapsed subscription closes the door even to an admin */
    seed('tenant'); db.seed(O + '/billing/current', { addons: ['omega-logic'], status: 'suspended' }); ctx = await X.context(ORG);
    await rejects(X.requirePricer(ADMIN, ctx, order()), 403, /subscription/);
  });

  console.log('\nthrough the office door, into the one writer');
  await test('5 · a tenant admin prices AND accepts a tenant-billed order; who and when are on the order and its events', async function () {
    seed('tenant');
    var r = await post({ action: 'price', orderId: 'q1', total: 125000, accept: true }, ADMIN).catch(needsWorkflowGate);
    assert.equal(r.ok, true);
    var o = order();
    assert.equal(o.status, 'accepted'); assert.equal(o.logic.accounting, 'tenant'); assert.equal(o.logic.commercial.feeCents, 0);
    assert.ok(o.logic.acceptedAt && !isNaN(Date.parse(o.logic.acceptedAt)), 'accepted when');
    assert.equal(o.logic.pricedBy, ADMIN.email, 'priced by whom'); assert.equal(o.logic.acceptedBy, ADMIN.email, 'accepted by whom');
    assert.ok(o.logic.createdAt && !isNaN(Date.parse(o.logic.createdAt)), 'priced when');
    var ev = events();
    assert.equal(ev.length, 1); assert.equal(ev[0].by, ADMIN.email); assert.ok(!isNaN(Date.parse(ev[0].at)));
    assert.match(ev[0].what, /price approved/); assert.match(ev[0].what, /accepted/);
    var d = await get(ADMIN), row = d.orders[0];
    assert.equal(row.logic.pricedBy, ADMIN.email); assert.equal(row.logic.acceptedBy, ADMIN.email); assert.equal(row.logic.pricedAt, o.logic.createdAt);
  });
  await test('6 · price first, accept later: the owner of the workspace accepts; both steps name their person', async function () {
    seed('tenant');
    await post({ action: 'price', orderId: 'q1', total: 125000 }, ADMIN).catch(needsWorkflowGate);
    assert.equal(order().status, 'quoted'); assert.equal(order().logic.acceptedAt, null); assert.equal(order().logic.acceptedBy, null);
    await rejects(post({ action: 'accept', orderId: 'q1' }, MEMBER), 403);
    assert.equal(order().logic.acceptedAt, null, 'a member cannot accept');
    await post({ action: 'accept', orderId: 'q1' }, OWNER).catch(needsWorkflowGate);
    var o = order();
    assert.equal(o.status, 'accepted'); assert.equal(o.logic.pricedBy, ADMIN.email); assert.equal(o.logic.acceptedBy, OWNER.email);
    var ev = events().sort(function (a, b) { return a.at < b.at ? -1 : 1; });
    assert.equal(ev.length, 2); assert.equal(ev[0].by, ADMIN.email); assert.equal(ev[1].by, OWNER.email); assert.match(ev[1].what, /accepted/);
  });
  await test('7 · an order billed through ClearSky\'s QuickBooks: the tenant admin and owner are refused, nothing is written', async function () {
    seed('quickbooks');
    await rejects(post({ action: 'price', orderId: 'q1', total: 125000, accept: true }, ADMIN), 403, /ClearSky approves/);
    await rejects(post({ action: 'price', orderId: 'q1', total: 125000 }, OWNER), 403, /ClearSky approves/);
    assert.equal(order().logic, undefined); assert.equal(order().status, 'new'); assert.equal(events().length, 0);
    /* the workflow's own door refuses them too, whoever calls it */
    await rejects(W.price('q1', 125000, ADMIN, true), 403);
    assert.equal(order().logic, undefined);
    /* ClearSky prices it; the admin still cannot accept it */
    await post({ action: 'price', orderId: 'q1', total: 125000 }, CLEARSKY);
    assert.equal(order().logic.accounting, 'quickbooks'); assert.equal(order().logic.pricedBy, CLEARSKY.email);
    await rejects(post({ action: 'accept', orderId: 'q1' }, ADMIN), 403, /ClearSky approves/);
    assert.equal(order().logic.acceptedAt, null);
    await post({ action: 'accept', orderId: 'q1' }, CLEARSKY);
    assert.equal(order().status, 'accepted'); assert.equal(order().logic.acceptedBy, CLEARSKY.email);
  });
  await test('8 · a member or viewer cannot price or accept, at the office door or at the workflow', async function () {
    seed('tenant');
    await rejects(post({ action: 'price', orderId: 'q1', total: 125000, accept: true }, MEMBER), 403);
    await rejects(post({ action: 'price', orderId: 'q1', total: 125000, accept: true }, VIEWER), 403);
    await rejects(post({ action: 'price', orderId: 'q1', total: 125000, accept: true }, GONE), 403);
    await rejects(W.price('q1', 125000, MEMBER, true), 403);
    await rejects(W.price('q1', 125000, VIEWER, true), 403);
    await rejects(W.price('q1', 125000, OTHER_ADMIN, true), 403);
    assert.equal(order().logic, undefined); assert.equal(events().length, 0);
  });
  await test('9 · the order\'s own billing mode wins over a later change of the workspace setting', async function () {
    seed('tenant');
    await post({ action: 'price', orderId: 'q1', total: 125000 }, ADMIN).catch(needsWorkflowGate);
    db.seed(O + '/fulfillment/config', { enabled: true, accounting: 'quickbooks', realmId: '123', itemRef: '5', accountingApproved: true, terms: { depositPct: 30, dueDays: 0 }, fee: { percent: 0.25, fixed: 0 } });
    await post({ action: 'accept', orderId: 'q1' }, ADMIN).catch(needsWorkflowGate);
    assert.equal(order().status, 'accepted', 'priced as tenant-billed, accepted by the workspace');
    seed('quickbooks');
    await post({ action: 'price', orderId: 'q1', total: 125000 }, CLEARSKY);
    db.seed(O + '/fulfillment/config', { enabled: true, accounting: 'tenant', terms: { depositPct: 30, dueDays: 0 }, fee: { percent: 0.25, fixed: 0 } });
    await rejects(post({ action: 'accept', orderId: 'q1' }, ADMIN), 403, /ClearSky approves/);
    assert.equal(order().logic.acceptedAt, null, 'priced through ClearSky\'s QuickBooks, accepted by ClearSky only');
  });
  await test('10 · the office list tells each person what they may press and who it waits on', async function () {
    seed('tenant');
    db.seed('orders/q2', Object.assign({}, db.data.get('orders/q1'), { orderNo: 'CC-Q2', createdAt: '2026-09-21T10:00:00Z' }));
    await post({ action: 'price', orderId: 'q2', total: 90000 }, CLEARSKY);
    function row(d, id) { return d.orders.filter(function (x) { return x.id === id; })[0]; }
    var a = await get(ADMIN);
    /* parts: every Omega Logic part, this being a legacy (addon) subscription — Phase 8 */
    assert.deepEqual(a.access, { role: 'admin', prices: 'workspace', team: true, parts: ['plant', 'materials', 'logistics', 'customer'] }); assert.equal(a.billing, 'tenant');
    /* OFF-02 / OFF-03: the money tiles are the receivables ledger's own totals (no customer list), and the Review list names whose PO waits */
    assert.ok(a.receivables && !('byCustomer' in a.receivables) && a.receivables.toIssueCents === 2700000 && a.receivables.invoicedCents === 0, JSON.stringify(a.receivables));
    assert.ok(Array.isArray(a.intake.waiting) && a.intake.waiting.length === 0);
    assert.deepEqual(row(a, 'q1').can, { price: true, accept: false }); assert.equal(row(a, 'q1').waitingOn, null); assert.equal(row(a, 'q1').stage.owner, false); assert.equal(row(a, 'q1').billing, 'tenant');
    assert.deepEqual(row(a, 'q2').can, { price: false, accept: true });
    var m = await get(MEMBER);
    assert.deepEqual(m.access, { role: 'member', prices: 'none', team: false, parts: ['plant', 'materials', 'logistics', 'customer'] });
    assert.deepEqual(row(m, 'q1').can, { price: false, accept: false }); assert.equal(row(m, 'q1').waitingOn, 'admin');
    var v = await get(VIEWER); assert.equal(row(v, 'q1').waitingOn, 'admin'); assert.equal(v.access.prices, 'none');
    var sky = await get(CLEARSKY);
    assert.deepEqual(sky.access, { role: 'clearsky', prices: 'all', team: true, parts: ['plant', 'materials', 'logistics', 'customer'] }); assert.deepEqual(row(sky, 'q1').can, { price: true, accept: false });
    seed('quickbooks');
    a = await get(ADMIN);
    assert.equal(a.access.prices, 'workspace'); assert.deepEqual(row(a, 'q1').can, { price: false, accept: false });
    assert.equal(row(a, 'q1').waitingOn, 'clearsky'); assert.equal(row(a, 'q1').stage.owner, true); assert.equal(row(a, 'q1').billing, 'quickbooks');
    assert.deepEqual(row(await get(CLEARSKY), 'q1').can, { price: true, accept: false });
    /* switched off: nobody is offered a price the workflow would refuse */
    db.seed(O + '/fulfillment/config', { enabled: false, accounting: 'tenant', terms: { depositPct: 30, dueDays: 0 }, fee: { percent: 0.25, fixed: 0 } });
    a = await get(ADMIN); assert.equal(row(a, 'q1').can.price, false); assert.equal(row(a, 'q1').waitingOn, 'clearsky');
  });
  console.log('\n' + count + ' pricing checks passed. No network calls.');
}
main().catch(function (e) { console.error(e); process.exit(1); });
