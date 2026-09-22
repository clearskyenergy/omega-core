#!/usr/bin/env node
/* scripts/test-office-ops.js — the office's new controls, offline against a
   fake Firestore: assign a finished unit to an order, a customer's request
   and the office's answer, warranty derived on the portal, many POs at once,
   and the money the customer center shows.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   node scripts/test-office-ops.js */
'use strict';
var assert = require('node:assert/strict');
var pass = 0, fail = 0;
function ok(label, yes, detail) { console.log('  ' + (yes ? 'PASS' : 'FAIL') + '  ' + label + (detail !== undefined && !yes ? '  got: ' + JSON.stringify(detail) : '')); if (yes) pass++; else fail++; }
async function rejects(label, fn, words) { try { await fn(); ok(label, false, 'did not reject'); } catch (e) { ok(label, !words || String(e.message).indexOf(words) >= 0, e.message); } }

/* ── a small Firestore: docs, subcollections, where/orderBy/limit, transactions ── */
function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
function field(v, k) { return k.split('.').reduce(function (x, p) { return x == null ? undefined : x[p]; }, v); }
function merge(a, b) { Object.keys(b).forEach(function (k) { if (k.indexOf('.') > 0) { var parts = k.split('.'), o = a; for (var i = 0; i < parts.length - 1; i++) { o[parts[i]] = o[parts[i]] && typeof o[parts[i]] === 'object' ? o[parts[i]] : {}; o = o[parts[i]]; } o[parts[parts.length - 1]] = clone(b[k]); return; } a[k] = (a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) && b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) ? merge(a[k], b[k]) : clone(b[k]); }); return a; }
var rows = new Map(), seq = 0;
function Ref(p) { this.path = p; this.id = p.split('/').pop(); }
Ref.prototype.collection = function (n) { return new Col(this.path + '/' + n); };
Ref.prototype.get = async function () { var d = rows.get(this.path); return { exists: d !== undefined, id: this.id, ref: this, data: function () { return clone(d); } }; };
function Col(p, f, cap) { this.path = p; this.f = f || []; this.cap = cap || Infinity; }
Col.prototype.doc = function (id) { return new Ref(this.path + '/' + (id || 'auto' + (++seq))); };
Col.prototype.where = function (k, op, v) { return new Col(this.path, this.f.concat([[k, v]]), this.cap); };
Col.prototype.orderBy = function () { return this; };
Col.prototype.limit = function (n) { return new Col(this.path, this.f, n); };
Col.prototype.get = async function () { var docs = [], self = this; for (var e of rows) { if (e[0].startsWith(self.path + '/') && e[0].split('/').length === self.path.split('/').length + 1 && self.f.every(function (f) { return field(e[1], f[0]) === f[1]; })) docs.push(await new Ref(e[0]).get()); } docs = docs.slice(0, self.cap); return { docs: docs, size: docs.length, empty: !docs.length, forEach: function (fn) { docs.forEach(fn); } }; };
var db = { collection: function (n) { return new Col(n); }, doc: function (p) { return new Ref(p); }, runTransaction: function (fn) { var writes = []; return Promise.resolve(fn({
  get: function (r) { return r.get(); },
  set: function (r, v, o) { writes.push(function () { rows.set(r.path, o && o.merge ? merge(clone(rows.get(r.path) || {}), v) : clone(v)); }); },
  update: function (r, v) { writes.push(function () { assert(rows.has(r.path), 'update of missing ' + r.path); rows.set(r.path, merge(clone(rows.get(r.path)), v)); }); },
  create: function (r, v) { writes.push(function () { assert(!rows.has(r.path), 'create over existing ' + r.path); rows.set(r.path, clone(v)); }); }
})).then(function (out) { writes.forEach(function (w) { w(); }); return out; }); } };
var A = { db: function () { return db; }, httpError: function (s, m) { var e = new Error(m); e.status = s; return e; }, handler: function (f) { return f; },
  FieldValue: function () { return { serverTimestamp: function () { return 'ts'; } }; }, authenticate: async function (r) { return r.caller; },
  safeOrg: function (s) { return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s || '') ? s : ''; }, isDegraded: function () { return false; } };
function mock(p, e) { require.cache[require.resolve(p)] = { id: require.resolve(p), filename: require.resolve(p), loaded: true, exports: e }; }
mock('../api/_lib/admin', A);
var CTX = { orgId: 'cleancell.us', org: { name: 'Clean Cell' }, billing: {}, config: { terms: { depositPct: 30, dueDays: 0 } } };
var X = { authorize: async function (c, org, write) { if (!org) throw A.httpError(400, 'Valid org required'); if (write && !c.admin) throw A.httpError(403, 'An active OEM administrator is required'); return CTX; },
  context: async function () { return CTX; }, owner: function (c) { return !!(c && c.owner); }, requireOwner: function (c) { if (!c.owner) throw A.httpError(403, 'owner'); }, subscribed: function () { return true; }, enabled: function () { return true; } };
mock('../api/_lib/logic-access', X);
mock('../api/_lib/logic-brand', function () { return { name: 'Clean Cell' }; });
mock('../api/_lib/mail', { send: async function () {} });
mock('../api/_lib/buyer-design', { entitlement: function () { return { status: 'none' }; } });
mock('../api/_lib/qbo', { load: async function () { return null; } });
var W = { event: function (tx, ref, by, what) { tx.create(ref.collection('events').doc(), { at: new Date().toISOString(), by: by, what: what }); } };
mock('../api/_lib/logic-workflow', W);
var res = { setHeader: function () {} };
var ORG = 'cleancell.us', admin = { email: 'pm@cleancell.us', admin: true, uid: 'u1' }, member = { email: 'm@cleancell.us', admin: false };

(async function () {
  /* ── seed: a company with a contact, a catalog, an order released to the plant ── */
  rows.set('omega_orgs/' + ORG + '/customer_index/ops@riverside.example', { customerId: 'company_riverside', email: 'ops@riverside.example' });
  rows.set('omega_orgs/' + ORG + '/customers/company_riverside', { orgId: ORG, name: 'Riverside Cold Chain', status: 'active', plan: 'free', terms: { depositPct: 40, dueDays: 0 } });
  rows.set('omega_orgs/' + ORG + '/customers/company_riverside/users/ops@riverside.example', { email: 'ops@riverside.example', name: 'Dana Ops', role: 'owner', status: 'active', uid: 'c1' });
  rows.set('omega_orgs/' + ORG + '/storefront/config', { products: [
    { sku: 'CAB', name: 'Cabinet', kind: 'product', warrantyYears: 10, bom: [] }, { sku: 'CAB418', name: 'Big cabinet', kind: 'product', warrantyYears: 10 }, { sku: 'INSTALL', name: 'Installation', kind: 'service' }] });
  rows.set('orders/o1', { orgId: ORG, orderNo: 'CC-1', status: 'in_fulfilment', worksOrderId: 'wo_o1', customer: { name: 'Dana Ops', email: 'ops@riverside.example', company: 'Riverside Cold Chain' },
    items: [{ sku: 'CAB', name: 'Cabinet', qty: 2 }], createdAt: '2026-09-01T00:00:00Z',
    logic: { commercial: { totalCents: 50000000, terms: { depositPct: 40, dueDays: 0 } }, invoices: { deposit: { amountCents: 20000000, paidCents: 20000000, status: 'paid' }, balance: { amountCents: 30000000, paidCents: 0, status: 'open' } }, allocatedSerials: [], requirements: [{ sku: 'CAB', qty: 2 }] } });
  rows.set('plant_works_orders/wo_o1', { orgId: ORG, orderId: 'o1', orderNo: 'CC-1', status: 'awaiting_serials', requirements: [{ sku: 'CAB', qty: 2 }], registeredCounts: {}, allocatedSerials: [], routing: [{ key: 'kit', label: 'Kitting' }, { key: 'eol', label: 'EOL' }, { key: 'qa', label: 'QA' }, { key: 'pack', label: 'Pack' }, { key: 'ready', label: 'Ready' }] });
  rows.set('plant_units/' + ORG + '__CAB-0001', { orgId: ORG, serial: 'CAB-0001', rootSerial: 'CAB-0001', sku: 'CAB', shipUnit: true, at: 'ready', inventoryStatus: 'available', woId: 'stock_1', done: {}, hold: null });
  rows.set('plant_units/' + ORG + '__CAB-0001-M1', { orgId: ORG, serial: 'CAB-0001-M1', rootSerial: 'CAB-0001', parentSerial: 'CAB-0001', sku: 'MOD', shipUnit: false, at: 'ready', inventoryStatus: 'available', woId: 'stock_1', done: {}, hold: null });
  rows.set('plant_units/' + ORG + '__CAB-0002', { orgId: ORG, serial: 'CAB-0002', rootSerial: 'CAB-0002', sku: 'CAB', shipUnit: true, at: 'pack', inventoryStatus: 'building', woId: 'stock_1', done: {}, hold: null });
  rows.set('omega_orgs/' + ORG + '/fulfillment/config', {});

  console.log('\nassign a finished unit to an order');
  var plant = require('../api/logic-plant');
  function call(body, caller) { return plant({ method: 'POST', body: Object.assign({ org: ORG }, body), caller: caller || admin }, res); }
  await rejects('a member cannot assign', function () { return call({ action: 'allocate', serial: 'CAB-0001', orderId: 'o1' }, member); }, 'administrator');
  await rejects('a unit still on the floor cannot be assigned', function () { return call({ action: 'allocate', serial: 'CAB-0002', orderId: 'o1' }); }, 'finished unit');
  var r = await call({ action: 'allocate', serial: 'CAB-0001', orderId: 'o1' });
  ok('the finished unit is assigned and the order still needs one more', r.ok && r.serial === 'CAB-0001' && r.orderNo === 'CC-1' && r.stillToBuild === 1, r);
  var u = rows.get('plant_units/' + ORG + '__CAB-0001'), child = rows.get('plant_units/' + ORG + '__CAB-0001-M1'), wo = rows.get('plant_works_orders/wo_o1'), o = rows.get('orders/o1');
  ok('  the unit and its module carry the order', u.orderId === 'o1' && u.inventoryStatus === 'allocated' && child.orderId === 'o1' && child.orderNo === 'CC-1', [u.inventoryStatus, child.orderId]);
  ok('  the works order builds one fewer and lists the serial', wo.requirements[0].qty === 1 && wo.allocatedSerials[0] === 'CAB-0001' && wo.status === 'awaiting_serials', wo);
  ok('  the order knows, and the event is written', o.logic.allocatedSerials[0] === 'CAB-0001' && o.logic.requirements[0].qty === 1 && [...rows.keys()].some(function (k) { return k.indexOf('orders/o1/events/') === 0; }));
  await rejects('assigning it again is refused', function () { return call({ action: 'allocate', serial: 'CAB-0001', orderId: 'o1' }); }, 'already assigned');
  rows.set('plant_units/' + ORG + '__CAB-0003', { orgId: ORG, serial: 'CAB-0003', rootSerial: 'CAB-0003', sku: 'CAB', shipUnit: true, at: 'ready', inventoryStatus: 'available', done: {}, hold: null });
  r = await call({ action: 'allocate', serial: 'CAB-0003', orderId: 'o1' });
  ok('the second unit completes the requirement and the works order is ready', r.stillToBuild === 0 && rows.get('plant_works_orders/wo_o1').status === 'ready', r);
  rows.set('plant_units/' + ORG + '__CAB-0004', { orgId: ORG, serial: 'CAB-0004', rootSerial: 'CAB-0004', sku: 'CAB', shipUnit: true, at: 'ready', inventoryStatus: 'available', done: {}, hold: null });
  await rejects('a third is refused: the order does not need it', function () { return call({ action: 'allocate', serial: 'CAB-0004', orderId: 'o1' }); }, 'does not need');

  console.log('\nthe customer asks for something, the office answers');
  var portal = require('../api/my-orders');
  var buyer = { email: 'ops@riverside.example', claims: { email_verified: true } };
  function ask(body, caller) { return portal({ method: 'POST', body: Object.assign({ org: ORG }, body), caller: caller || buyer }, res); }
  await rejects('an unverified email cannot ask', function () { return ask({ orderNo: 'CC-1', kind: 'information', message: 'When does it ship?' }, { email: 'ops@riverside.example', claims: {} }); }, 'confirm your email');
  await rejects('a stranger cannot ask on this order', function () { return ask({ orderNo: 'CC-1', kind: 'information', message: 'When does it ship?' }, { email: 'x@other.example', claims: { email_verified: true } }); }, 'could not find');
  await rejects('the kind must be one of ours', function () { return ask({ orderNo: 'CC-1', kind: 'refund', message: 'Give me money' }); }, 'Choose what');
  r = await ask({ orderNo: 'CC-1', kind: 'shipping', message: 'Please deliver to our Bakersfield yard instead.', address: { line1: '1200 Depot Rd', city: 'Bakersfield', state: 'CA', zip: '93307' } });
  ok('a shipping request lands on the order with the new address', r.ok && r.request.kind === 'shipping' && r.request.address.city === 'Bakersfield' && rows.get('orders/o1').requests.length === 1 && rows.get('orders/o1').openRequests === 1, r);
  ok('  and nothing on the order itself changed', rows.get('orders/o1').customer.company === 'Riverside Cold Chain' && rows.get('orders/o1').status === 'in_fulfilment');
  var office = require('../api/logic-office');
  var got = await office({ method: 'GET', query: { org: ORG }, caller: admin }, res);
  ok('the office sees the request on the order', got.orders[0].requests.length === 1 && got.orders[0].requests[0].status === 'open', got.orders[0].requests);
  await rejects('an answer needs words', function () { return office({ method: 'POST', body: { org: ORG, action: 'request-resolve', orderId: 'o1', requestId: r.request.id, answer: '' }, caller: admin }, res); }, 'Write the answer');
  var ans = await office({ method: 'POST', body: { org: ORG, action: 'request-resolve', orderId: 'o1', requestId: r.request.id, answer: 'Done — the load is re-routed to Bakersfield, same date.' }, caller: admin }, res);
  ok('the office answers and closes it', ans.ok && rows.get('orders/o1').requests[0].status === 'resolved' && rows.get('orders/o1').openRequests === 0 && rows.get('orders/o1').requests[0].answeredBy === 'pm@cleancell.us', rows.get('orders/o1').requests[0]);
  for (var i = 0; i < 10; i++) await ask({ orderNo: 'CC-1', kind: 'information', message: 'Question number ' + i });
  await rejects('ten open requests is the limit', function () { return ask({ orderNo: 'CC-1', kind: 'information', message: 'One more question' }); }, 'open requests');

  console.log('\nwhat the customer sees: the answer, and the warranty from the ship date');
  rows.set('orders/o1', Object.assign(rows.get('orders/o1'), { status: 'shipped', shipment: { carrier: 'XPO', tracking: 'T1', shippedAt: '2026-09-20T15:00:00Z' } }));
  var seen = await portal({ method: 'GET', query: { org: ORG }, caller: buyer }, res);
  var mine = seen.orders[0];
  ok('the customer reads the request and the answer', mine.requests.length === 11 && mine.requests[0].answer.indexOf('Bakersfield') > 0 && mine.requests[0].status === 'resolved', mine.requests[0]);
  ok('warranty runs from the ship date for the product\'s years', mine.items[0].warranty && mine.items[0].warranty.years === 10 && mine.items[0].warranty.from === '2026-09-20' && mine.items[0].warranty.until === '2036-09-20', mine.items[0]);
  ok('  and the office\'s own words are not in the projection', JSON.stringify(mine).indexOf('pm@cleancell.us') < 0);

  console.log('\nthe customer center: money per order');
  var buyers = require('../api/buyers');
  var acct = await buyers({ method: 'GET', query: { org: ORG, email: 'ops@riverside.example' }, caller: admin }, res);
  ok('invoiced, paid, balance and shipped per order', acct.orders[0].invoicedCents === 50000000 && acct.orders[0].paidCents === 20000000 && acct.orders[0].balanceCents === 30000000 && acct.orders[0].shippedAt === '2026-09-20T15:00:00Z', acct.orders[0]);
  ok('  totals across the account, open requests counted', acct.totals.balanceCents === 30000000 && acct.totals.openRequests === 10, acct.totals);
  ok('  the list carries brand and owner for the chrome', (await buyers({ method: 'GET', query: { org: ORG }, caller: admin }, res)).brand.name === 'Clean Cell');

  console.log('\nmany purchase orders at once');
  mock('../api/_lib/po-intake', { scope: async function (c, org, office) { return office ? { office: true, ctx: CTX } : { office: false, ctx: CTX, account: { id: 'company_riverside', user: { email: c.email } } }; }, company: async function (org, id) { var r = db.collection('omega_orgs').doc(org).collection('customers').doc(id), s = await r.get(); return { id: s.id, data: s.data(), ref: r }; }, root: function (org) { return db.collection('omega_orgs').doc(org); }, submit: async function () { throw new Error('not in this test'); }, project: function () { return {}; } });
  var intake = require('../api/po-intake');
  var dest = { name: 'InCharge Bakersfield', line1: '1200 Depot Rd', city: 'Bakersfield', state: 'CA', zip: '93307' };
  var batch = await intake({ method: 'POST', body: { org: ORG, office: true, customerId: 'company_riverside', action: 'submit-many', email: 'ops@riverside.example', pos: [
    { number: 'INC-4471', lines: [{ sku: 'CAB', qty: 4 }, { sku: 'CAB418', qty: 1 }], destination: dest, requestedDate: '2026-11-15', notes: 'dock B' },
    { number: 'INC-4472', lines: [{ sku: 'CAB', qty: 2 }], destination: Object.assign({}, dest, { name: 'InCharge Fresno', city: 'Fresno' }) },
    { number: 'INC-4473', lines: [{ sku: 'NOPE', qty: 1 }], destination: dest },
    { number: 'INC-4471', lines: [{ sku: 'CAB', qty: 1 }], destination: dest }
  ] }, caller: admin }, res);
  ok('two entered, one bad SKU and one duplicate named', batch.created.length === 2 && batch.skipped.length === 2 && /published product/.test(batch.skipped[0].error) && /Duplicate/.test(batch.skipped[1].error), batch);
  var made = rows.get('orders/' + batch.created[0].id);
  ok('  each is a mapped order awaiting pricing, with its destination and terms', made.status === 'new' && made.items.length === 2 && made.delivery.destinations[0].address.city === 'Bakersfield' && made.delivery.destinations[0].requestedDate === '2026-11-15' && made.requestedTerms.depositPct === 40 && made.purchaseOrder.number === 'INC-4471' && made.poIntake.source === 'office-bulk', made);
  var again = await intake({ method: 'POST', body: { org: ORG, office: true, customerId: 'company_riverside', action: 'submit-many', email: 'ops@riverside.example', pos: [{ number: 'INC-4472', lines: [{ sku: 'CAB', qty: 9 }], destination: dest }] }, caller: admin }, res);
  ok('an existing PO number is skipped, never overwritten', again.created.length === 0 && /already exists/.test(again.skipped[0].error) && rows.get('orders/' + batch.created[1].id).items[0].qty === 2, again);
  await rejects('a customer login cannot use the batch path', function () { return intake({ method: 'POST', body: { org: ORG, customerId: 'company_riverside', action: 'submit-many', email: 'ops@riverside.example', pos: [] }, caller: buyer }, res); }, 'Office');
  ok('the company counts the batch against its day', rows.get('omega_orgs/' + ORG + '/customers/company_riverside').poIntakeUsage.count === 2);

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
