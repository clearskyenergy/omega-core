#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-customer-surfaces.js — what the supplier's CUSTOMER is
   offered and shown, end to end offline
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

     - a `component` (what a product is made of) is never offered to a
       customer or accepted from one: the PO sheet, One PO to several
       sites, the design tool's list and its quote (CUST-04)
     - an order from a PO reads the six public words, never the internal
       status; a PO in review says its state and door plainly (CUST-05)
     - every order names the supplier the one way the page does (CUST-06)
     - a site reaches the customer key by key: what the office typed about
       it (interconnection, contact, end customer, notes) stays in the
       office unless it is the customer's own entry (CUST-21)
   api/po-intake.js, api/customer-po.js, api/customer-design.js,
   api/my-orders.js and api/my-sites.js over the in-memory Firestore
   double; api/logic-custody.js as the office. Every company, person and
   address here is fictional. No network.
     node scripts/test-customer-surfaces.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var assert = require('node:assert/strict');
var FD = require('./_lib/firestore-double'), DB = FD.DB, mock = FD.mock;
var db;
var A = { db: function () { return db; }, safeOrg: function (v) { return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v || '') ? v : ''; }, httpError: function (s, m) { var e = new Error(m); e.status = s; return e; },
  authenticate: async function (r) { return r.caller; }, handler: function (f) { return f; }, canActInOrg: async function (c, o) { return c.orgId === o; }, isDegraded: function () { return false; },
  FieldValue: function () { return { serverTimestamp: function () { return '2026-09-24T12:00:00Z'; }, arrayUnion: function () { return { union: Array.from(arguments) }; } }; } };
mock('../api/_lib/admin', A);
mock('../api/_lib/mail', { configured: function () { return false; }, send: async function () { return { ok: false }; }, esc: String, button: function () { return ''; }, wlLayout: function () { return ''; } });
var Pt = require('../api/_lib/portal'), intake = require('../api/po-intake'), customerPo = require('../api/customer-po'), design = require('../api/customer-design'),
  myOrders = require('../api/my-orders'), mySites = require('../api/my-sites'), custody = require('../api/logic-custody');
var ORG = 'cleancell.us', O = 'omega_orgs/' + ORG, NW = 'company_northwind';
function person(email) { return { uid: email.split('@')[0], email: email, orgId: email.split('@')[1], claims: { email_verified: true } }; }
var BUYER = person('ops@northwind.example'), OFFICE = { uid: 'pm', email: 'pm@cleancell.us', orgId: ORG, claims: { email_verified: true } };
var res = { headers: {}, setHeader: function (k, v) { this.headers[k] = v; }, end: function (b) { this.body = b; } };
function call(api, method, body, caller) { return api({ method: method, body: method === 'POST' ? Object.assign({ org: ORG }, body) : undefined, query: method === 'GET' ? Object.assign({ org: ORG }, body || {}) : {}, caller: caller }, res); }
async function rejects(p, status, re) { try { await p; } catch (e) { assert.equal(e.status, status, e.message); if (re) assert.match(e.message, re); return e; } throw new Error('expected a ' + status); }
var count = 0; async function test(name, fn) { await fn(); count++; console.log('PASS ' + name); }
var FUTURE = new Date(Date.now() + 30 * 86400000).toISOString();
var PRODUCTS = [
  { sku: 'CC-R60K', name: 'R60 skid', kind: 'product', category: 'bess', kw: 60, kwh: 120, widthFt: 8, depthFt: 4, designEnabled: true, warrantyYears: 10 },
  { sku: 'CC-SVC', name: 'Commissioning visit', kind: 'service' },
  { sku: 'CELL-280', name: '280 Ah LFP cell', kind: 'component', unit: 'ea', supplier: 'Cell Supplier Co' },
  { sku: 'BMS-1', name: 'Rack BMS', kind: 'component' },
  { sku: 'OLD-1', name: 'Retired cabinet', kind: 'product', active: false },
  { sku: 'PH-1', name: 'PLACEHOLDER SPEC', kind: 'product', placeholder: true }
];
function seed() {
  db = new DB();
  db.seed(O, { name: 'Clean Cell', status: 'active', whiteLabel: { enabled: true, platformName: 'Clean Cell Power Platform', shortName: 'Clean Cell', attribution: 'powered-by' } });
  db.seed(O + '/billing/current', { addons: ['omega-logic'], status: 'active', editorLite: { enabled: true, modules: ['bess'] } });
  db.seed(O + '/fulfillment/config', { enabled: true, terms: { depositPct: 30, dueDays: 0 } });
  db.seed(O + '/members/pm', { email: 'pm@cleancell.us', role: 'admin', status: 'active' });
  db.seed(O + '/storefront/config', { products: PRODUCTS });
  db.seed(O + '/customers/' + NW, { orgId: ORG, name: 'Northwind Storage', accountType: 'company', domain: 'northwind.example', status: 'active', source: 'office', terms: {},
    editorLite: { status: 'trial', source: 'owner-trial', expiresAt: FUTURE }, createdAt: '2026-09-01T00:00:00Z' });
  db.seed(O + '/customers/' + NW + '/users/ops@northwind.example', { email: 'ops@northwind.example', name: 'Robin Ops', role: 'owner', status: 'active' });
  db.seed(O + '/customer_index/ops@northwind.example', { customerId: NW });
  /* an order ClearSky has priced to the tenant: 'quoted' is an internal step */
  db.seed('orders/po_q1', { orgId: ORG, orgName: 'Cleancell', orderNo: 'PO-IN-Q1', status: 'quoted', customerId: NW, createdAt: '2026-09-20T10:00:00Z', customer: { email: 'ops@northwind.example', company: 'Northwind Storage' },
    items: [{ sku: 'CC-R60K', name: 'R60 skid', qty: 4 }], purchaseOrder: { number: 'NW-100' }, delivery: { destinations: [], legs: [] },
    poIntake: { number: 'NW-100', source: 'customer-bulk', createdAt: '2026-09-20T10:00:00Z', convertedAt: '2026-09-20T10:00:00Z', files: [] } });
  db.seed('orders/po_f1', { orgId: ORG, orgName: 'Cleancell', orderNo: 'CC-26-5001', status: 'in_fulfilment', customerId: NW, createdAt: '2026-09-19T10:00:00Z', customer: { email: 'ops@northwind.example', company: 'Northwind Storage' },
    items: [{ sku: 'CC-R60K', name: 'R60 skid', qty: 2 }], purchaseOrder: { number: 'NW-099' }, delivery: { destinations: [], legs: [] } });
  /* a PO the office asked about */
  db.seed('orders/po_ask', { orgId: ORG, orderNo: 'PO-IN-ASK', status: 'po_needs_information', customerId: NW, createdAt: '2026-09-22T10:00:00Z', customer: { company: 'Northwind Storage' }, items: [],
    poIntake: { number: 'NW-101', source: 'customer', createdAt: '2026-09-22T10:00:00Z', reviewNote: 'Which site is store 12?', files: [] } });
}
function line(no, sku, qty) { return { number: no, lines: [{ sku: sku, qty: qty || 1 }], destination: { name: 'Store 4', line1: '400 Main St', city: 'Fresno', state: 'CA', zip: '93710', country: 'US' }, requestedDate: '', notes: '' }; }
function skus(list) { return (list || []).map(function (p) { return p.sku; }).sort(); }

(async function () {
  console.log('\na component is never offered to a customer, nor accepted from one (CUST-04)');
  await test('the one test: a published product or service; never a component, a placeholder, a retired row or the generic concept', function () {
    assert.deepEqual(skus(Pt.orderables(PRODUCTS)), ['CC-R60K', 'CC-SVC']);
    assert.equal(Pt.orderable({ sku: 'GENERIC-BESS', name: 'Generic' }), false); assert.equal(Pt.orderable(null), false); assert.equal(Pt.orderable({ name: 'no sku' }), false);
    assert.equal(Pt.orderable({ sku: 'X', kind: 'component' }), false); assert.equal(Pt.orderable({ sku: 'X' }), true, 'a row with no kind is a product');
    assert.deepEqual(Pt.orderables(undefined), []);
  });
  await test('the PO sheet lists products and services only, to the customer and to the office', async function () {
    seed();
    assert.deepEqual(skus((await call(intake, 'GET', {}, BUYER)).products), ['CC-R60K', 'CC-SVC']);
    assert.deepEqual(skus((await call(intake, 'GET', { office: '1', customerId: NW }, OFFICE)).products), ['CC-R60K', 'CC-SVC']);
  });
  await test('a PO for a component is refused by name and never becomes an order; the rest of the stack goes through', async function () {
    seed();
    var r = await call(intake, 'POST', { action: 'submit-many', pos: [line('NW-200', 'CELL-280', 560), line('NW-201', 'CC-R60K', 4)] }, BUYER);
    assert.deepEqual(r.created.map(function (c) { return c.number; }), ['NW-201']);
    assert.equal(r.skipped.length, 1); assert.equal(r.skipped[0].number, 'NW-200'); assert.match(r.skipped[0].error, /published product or service/);
    assert.ok(!Array.from(db.data.keys()).some(function (k) { var d = db.data.get(k); return /^orders\//.test(k) && d && d.items && d.items.some(function (i) { return i.sku === 'CELL-280'; }); }), 'no order carries the cell');
  });
  await test('One PO to several sites: the list has no components, and a PO for one is refused', async function () {
    seed();
    assert.deepEqual(skus((await call(customerPo, 'GET', {}, BUYER)).products), ['CC-R60K', 'CC-SVC']);
    await rejects(call(customerPo, 'POST', { action: 'submit', poNumber: 'NW-300', items: [{ sku: 'BMS-1', qty: 2 }], destinations: [{ id: 'd1', address: { name: 'Store 4', line1: '400 Main St', city: 'Fresno', state: 'CA', zip: '93710' }, items: [{ sku: 'BMS-1', qty: 2 }] }] }, BUYER), 400, /published product or service/);
    var ok = await call(customerPo, 'POST', { action: 'submit', poNumber: 'NW-301', items: [{ sku: 'CC-R60K', qty: 2 }], destinations: [{ id: 'd1', address: { name: 'Store 4', line1: '400 Main St', city: 'Fresno', state: 'CA', zip: '93710' }, items: [{ sku: 'CC-R60K', qty: 2 }] }] }, BUYER);
    assert.equal(ok.ok, true);
  });
  await test('the design tool lists no components, and a quote for one is refused', async function () {
    seed();
    var g = await call(design, 'GET', {}, BUYER);
    assert.deepEqual(skus(g.products), ['CC-R60K', 'CC-SVC']); assert.deepEqual(skus(g.designProducts), ['CC-R60K']);
    db.seed(O + '/customers/' + NW + '/projects/p1', { name: 'Fresno store', orgId: ORG, customerId: NW, module: 'bess', target: { module: 'bess', kw: 120, kwh: 240 }, canvasJson: '{"elements":[]}', revision: 1, updatedAt: '2026-09-23T00:00:00Z' });
    await rejects(call(design, 'POST', { action: 'quote', projectId: 'p1', revision: 1, sku: 'CELL-280', qty: 10 }, BUYER), 409, /current published catalog/);
    var q = await call(design, 'POST', { action: 'quote', projectId: 'p1', revision: 1, sku: 'CC-R60K', qty: 2 }, BUYER);
    assert.equal(db.data.get('orders/' + q.orderId).items[0].sku, 'CC-R60K');
  });
  await test('the office cannot convert a reviewed PO onto a component either', async function () {
    seed();
    db.seed('orders/po_rev', { orgId: ORG, orderNo: 'PO-IN-REV', status: 'po_review', customerId: NW, createdAt: '2026-09-22T10:00:00Z', customer: { company: 'Northwind Storage' }, items: [], poIntake: { number: 'NW-400', source: 'customer', createdAt: '2026-09-22T10:00:00Z', uploadState: 'none', files: [] } });
    await rejects(call(intake, 'POST', { office: true, customerId: NW, action: 'convert', id: 'po_rev', email: 'ops@northwind.example', poNumber: 'NW-400', items: [{ sku: 'CELL-280', qty: 10 }], destinations: [{ id: 'd1', address: { name: 'Store 4', line1: '400 Main St', city: 'Fresno', state: 'CA', zip: '93710' }, items: [{ sku: 'CELL-280', qty: 10 }] }] }, OFFICE), 400, /published product or service/);
  });

  console.log('\nplain words for a PO and its order (CUST-05)');
  await test('the customer reads an order from a PO by its public milestone, never "quoted" or "in_fulfilment"', async function () {
    seed(); var d = await call(intake, 'GET', {}, BUYER), blob = JSON.stringify(d.orders);
    var q1 = d.orders.filter(function (o) { return o.orderNo === 'PO-IN-Q1'; })[0], f1 = d.orders.filter(function (o) { return o.orderNo === 'CC-26-5001'; })[0];
    assert.equal(q1.status, 'Confirmed'); assert.equal(q1.milestone.key, 'confirmed'); assert.equal(f1.status, 'In production'); assert.equal(f1.milestone.label, 'In production');
    assert.equal(blob.indexOf('quoted'), -1); assert.equal(blob.indexOf('in_fulfilment'), -1);
  });
  await test('a PO in review says its state and its door in words; the app still keys on the state', async function () {
    seed(); var d = await call(intake, 'GET', {}, BUYER);
    var ask = d.intake.filter(function (x) { return x.poNumber === 'NW-101'; })[0], done = d.intake.filter(function (x) { return x.poNumber === 'NW-100'; })[0];
    assert.equal(ask.status, 'po_needs_information'); assert.equal(ask.statusLabel, 'needs information from you'); assert.equal(ask.source, 'sent by your company'); assert.equal(ask.sourceLabel, 'sent by your company');
    assert.equal(done.statusLabel, 'entered as an order'); assert.equal(done.source, 'sent by your company on the PO sheet');
    assert.equal(JSON.stringify(d.intake).indexOf('customer-bulk'), -1, 'no door code reaches the customer');
    assert.equal(Pt.poSourceWord('office', 'Clean Cell'), 'entered by Clean Cell'); assert.equal(Pt.poSourceWord('mystery'), 'received by your supplier');
  });
  await test('the office keeps the raw status it works by, with the words beside it', async function () {
    seed(); var d = await call(intake, 'GET', { office: '1', customerId: NW }, OFFICE);
    var q1 = d.orders.filter(function (o) { return o.orderNo === 'PO-IN-Q1'; })[0], ask = d.intake.filter(function (x) { return x.poNumber === 'NW-101'; })[0];
    assert.equal(q1.status, 'quoted'); assert.equal(q1.milestone.label, 'Confirmed'); assert.equal(ask.source, 'customer'); assert.equal(ask.sourceLabel, 'sent by your company');
  });
  await test('One PO to several sites shows the same words', async function () {
    seed(); var d = await call(customerPo, 'GET', {}, BUYER);
    assert.deepEqual(d.orders.map(function (o) { return o.status; }).sort(), ['Confirmed', 'In production']);
  });

  console.log('\nthe supplier named one way (CUST-06)');
  await test('every order names the supplier by its short name, not what was stamped on it when written', async function () {
    seed(); var d = await call(myOrders, 'GET', {}, BUYER);
    assert.ok(d.orders.length >= 2); assert.ok(d.orders.every(function (o) { return o.soldBy === 'Clean Cell'; }), JSON.stringify(d.orders.map(function (o) { return o.soldBy; })));
    assert.equal(Pt.publicOrder({ orgName: 'Cleancell' }).soldBy, 'Cleancell', 'with no name passed, the stamp still says who');
  });

  console.log('\na site, key by key (CUST-21)');
  await test('a site the office set up: the customer sees where it is, never what the office typed about it', async function () {
    seed();
    var made = await call(custody, 'POST', { action: 'site', name: 'Fresno store 4', customerId: NW, address: { line1: '400 Main St', city: 'Fresno', state: 'CA', zip: '93710' },
      interconnection: { utility: 'PG&E', meterNo: 'M-7781', poi: 'MSB-2', agreementRef: 'IA-2026-19' }, contact: { name: 'Gate guard', phone: '559-555-0199' }, endCustomer: 'Resale end user', notes: 'Gate code 4411; site manager is difficult' }, OFFICE);
    var d = await call(mySites, 'GET', {}, BUYER), s = d.sites.filter(function (x) { return x.id === made.siteId; })[0], blob = JSON.stringify(s);
    assert.equal(s.name, 'Fresno store 4'); assert.equal(s.address.line1, '400 Main St'); assert.equal(s.address.zip, '93710');
    ['M-7781', 'MSB-2', 'IA-2026-19', 'Gate guard', '559-555', 'Resale end user', 'Gate code', 'difficult', 'pm@cleancell.us', 'createdBy', 'updatedBy', 'customerId', 'lifecycleSiteId', 'orgId'].forEach(function (n) { assert.equal(blob.indexOf(n), -1, n + ' reached the customer'); });
    assert.equal(s.interconnection.utility, ''); assert.equal(s.notes, ''); assert.equal(s.units, 0);
  });
  await test('a site the customer made: their own entries come back, and stay theirs after the office edits the site', async function () {
    seed();
    var mine = await call(mySites, 'POST', { action: 'site', name: 'Stockton yard', address: { line1: '9 Rail Way', city: 'Stockton', state: 'CA', zip: '95202' }, interconnection: { utility: 'PG&E', meterNo: 'CUST-12', poi: 'Switchgear B' } }, BUYER);
    assert.equal(mine.site.interconnection.poi, 'Switchgear B'); assert.equal(mine.site.interconnection.meterNo, 'CUST-12');
    await call(custody, 'POST', { action: 'site', id: mine.site.id, name: 'Stockton yard', customerId: NW, address: { line1: '9 Rail Way', city: 'Stockton', state: 'CA', zip: '95202' }, interconnection: { utility: 'PG&E', meterNo: 'CUST-12', poi: 'Switchgear B', agreementRef: 'OFFICE-IA-7' }, notes: 'Office only: slow payer' }, OFFICE);
    assert.equal(db.data.get(O + '/sites/' + mine.site.id).notes, 'Office only: slow payer', 'the office record has the note');
    var s = (await call(mySites, 'GET', {}, BUYER)).sites.filter(function (x) { return x.id === mine.site.id; })[0];
    assert.equal(s.interconnection.poi, 'Switchgear B'); assert.equal(s.interconnection.agreementRef, ''); assert.equal(s.notes, ''); assert.equal(JSON.stringify(s).indexOf('slow payer'), -1);
  });
  await test('an edit from the customer changes what they sent and never wipes what the office entered', async function () {
    seed();
    var mine = await call(mySites, 'POST', { action: 'site', name: 'Modesto lot', address: { line1: '1 Oak St', city: 'Modesto', state: 'CA', zip: '95350' }, interconnection: { utility: 'MID' } }, BUYER);
    await call(custody, 'POST', { action: 'site', id: mine.site.id, name: 'Modesto lot', customerId: NW, address: { line1: '1 Oak St', city: 'Modesto', state: 'CA', zip: '95350' }, interconnection: { utility: 'MID', accountNo: 'ACCT-55' }, contact: { name: 'Pat Office' }, notes: 'office note' }, OFFICE);
    var e = await call(mySites, 'POST', { action: 'site', id: mine.site.id, name: 'Modesto lot', address: { line1: '1 Oak St', city: 'Modesto', state: 'CA', zip: '95350' }, interconnection: { poi: 'Pad 3' } }, BUYER);
    var rec = db.data.get(O + '/sites/' + mine.site.id);
    assert.equal(rec.notes, 'office note'); assert.equal(rec.contact.name, 'Pat Office'); assert.equal(rec.interconnection.accountNo, 'ACCT-55'); assert.equal(rec.interconnection.poi, 'Pad 3'); assert.equal(rec.interconnection.utility, 'MID');
    assert.equal(e.site.interconnection.poi, 'Pad 3'); assert.equal(e.site.interconnection.utility, 'MID', 'their earlier entry is still theirs'); assert.equal(e.site.interconnection.accountNo, ''); assert.equal(e.site.notes, '');
    assert.equal(JSON.stringify(rec.customerEntries).indexOf('undefined'), -1);
  });
  await test('a site from before this change: the customer\'s own record shows until somebody else edits it', async function () {
    seed();
    db.seed(O + '/sites/site_legacy', { orgId: ORG, name: 'Old yard', customerId: NW, status: 'active', source: 'customer', address: { line1: '5 Elm St', city: 'Merced', state: 'CA', zip: '95340' }, interconnection: { utility: 'PG&E', poi: 'Main' }, notes: 'my note', createdAt: '2026-08-01T00:00:00Z', createdBy: 'ops@northwind.example', updatedAt: '2026-08-01T00:00:00Z', updatedBy: 'ops@northwind.example' });
    db.seed(O + '/sites/site_legacy2', { orgId: ORG, name: 'Old lot', customerId: NW, status: 'active', source: 'customer', address: { line1: '6 Elm St', city: 'Merced', state: 'CA', zip: '95340' }, interconnection: { poi: 'X' }, notes: 'office typed this', createdAt: '2026-08-01T00:00:00Z', createdBy: 'ops@northwind.example', updatedAt: '2026-08-03T00:00:00Z', updatedBy: 'pm@cleancell.us' });
    var d = await call(mySites, 'GET', {}, BUYER), by = {}; d.sites.forEach(function (x) { by[x.id] = x; });
    assert.equal(by.site_legacy.interconnection.poi, 'Main'); assert.equal(by.site_legacy.notes, 'my note');
    assert.equal(by.site_legacy2.interconnection.poi, ''); assert.equal(by.site_legacy2.notes, '');
  });
  await test('sites made from a list keep the customer\'s entries apart from the record', async function () {
    seed();
    var cr = await call(mySites, 'POST', { action: 'sites-create', rows: [{ name: 'Store 9', address: { line1: '900 Main St', city: 'Fresno', state: 'CA', zip: '93710' } }] }, BUYER);
    var rec = db.data.get(O + '/sites/' + cr.created[0].id);
    assert.ok(rec.customerEntries && rec.customerEntries.by === 'ops@northwind.example'); assert.equal(cr.created[0].customerId, undefined); assert.equal(cr.created[0].createdBy, undefined);
  });
  console.log('\n' + count + ' customer surface checks passed. No network calls.');
})().catch(function (e) { console.error(e); process.exit(1); });
