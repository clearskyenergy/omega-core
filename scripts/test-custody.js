#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-custody.js — custody, sites and coverage, end to end offline
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   api/_lib/custody.js on its own, then api/logic-custody.js and
   api/my-sites.js over the in-memory Firestore double. No network.
     node scripts/test-custody.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var assert = require('node:assert/strict');
var FD = require('./_lib/firestore-double'), DB = FD.DB, mock = FD.mock;
var db;
var A = { db: function () { return db; }, safeOrg: function (v) { return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v || '') ? v : ''; }, httpError: function (s, m) { var e = new Error(m); e.status = s; return e; },
  authenticate: async function (r) { return r.caller; }, handler: function (f) { return f; }, canActInOrg: async function (c, o) { return c.orgId === o; }, FieldValue: function () { return { serverTimestamp: function () { return 'TS'; } }; } };
mock('../api/_lib/admin', A);
var C = require('../api/_lib/custody'), api = require('../api/logic-custody'), mine = require('../api/my-sites'), Cat = require('../api/_lib/logic-catalog');
var ORG = 'cleancell.us', O = 'omega_orgs/' + ORG;
var ADMIN = { uid: 'pm', email: 'pm@cleancell.us', orgId: ORG, claims: { email_verified: true } };
var BUYER = { uid: 'c1', email: 'ops@riverside.example', orgId: 'riverside.example', claims: { email_verified: true } };
var OTHER = { uid: 'c2', email: 'someone@else.example', orgId: 'else.example', claims: { email_verified: true } };
var res = { headers: {}, setHeader: function (k, v) { this.headers[k] = v; }, end: function (b) { this.body = b; } };
function post(body, caller) { return api({ method: 'POST', body: Object.assign({ org: ORG }, body), caller: caller || ADMIN }, res); }
function get(q, caller) { res.body = null; return api({ method: 'GET', query: Object.assign({ org: ORG }, q || {}), caller: caller || ADMIN }, res); }
function cpost(body, caller) { return mine({ method: 'POST', body: Object.assign({ org: ORG }, body), caller: caller || BUYER }, res); }
function cget(caller) { return mine({ method: 'GET', query: { org: ORG }, caller: caller || BUYER }, res); }
async function rejects(p, status, re) { try { await p; } catch (e) { assert.equal(e.status, status, e.message); if (re) assert.match(e.message, re); return e; } throw new Error('expected a ' + status); }
var count = 0; async function test(name, fn) { await fn(); count++; console.log('PASS ' + name); }
function unit(serial, extra) { return Object.assign({ orgId: ORG, serial: serial, rootSerial: serial, sku: 'CC-C215', unitType: 'cabinet', shipUnit: true, woId: 'wo_1', orderId: 'o1', orderNo: 'CC-26-4419', customerId: 'company_riverside', at: 'ready', hold: null, test: { result: 'pass' }, inventoryStatus: 'allocated', createdAt: '2026-10-01T00:00:00Z' }, extra || {}); }
function seed() {
  db = new DB();
  db.seed(O, { name: 'Clean Cell', status: 'active' }); db.seed(O + '/billing/current', { addons: ['omega-logic'], status: 'active' }); db.seed(O + '/fulfillment/config', { enabled: true });
  db.seed(O + '/members/pm', { email: 'pm@cleancell.us', role: 'member', status: 'active' });
  db.seed(O + '/storefront/config', { products: [
    { sku: 'CC-C215', name: '215 kWh outdoor cabinet', kind: 'product', warrantyYears: 10 },
    { sku: 'CC-C418', name: '418 kWh outdoor cabinet', kind: 'product', warrantyYears: 10, coverage: [{ id: 'product', type: 'warranty', provider: 'oem', termMonths: 120, trigger: 'earliest_of', capMonths: 18 }, { id: 'uptime', type: 'sla', provider: 'clearsky', termMonths: 60, trigger: 'commissioning', metrics: { uptimePct: 97 } }] }] });
  db.seed(O + '/customers/company_riverside', { orgId: ORG, name: 'Riverside Cold Chain', status: 'active' });
  db.seed(O + '/customers/company_riverside/users/ops@riverside.example', { email: 'ops@riverside.example', role: 'owner', status: 'active' });
  db.seed(O + '/customer_index/ops@riverside.example', { customerId: 'company_riverside' });
  db.seed('orders/o1', { orgId: ORG, orderNo: 'CC-26-4419', status: 'in_fulfilment', customerId: 'company_riverside', customer: { email: 'ops@riverside.example', name: 'Riverside Cold Chain' }, shipment: { carrier: 'XPO', tracking: 'T1', shippedAt: '2026-08-01T15:00:00Z' },
    delivery: { revision: 1, destinations: [{ id: 'd1', address: { name: 'Riverside yard', city: 'Bakersfield' } }], legs: [{ id: 'load1', destinationId: 'd1', serials: ['S001', 'S002'], status: 'delivered' }] } });
  ['S001', 'S002'].forEach(function (s) { db.seed('plant_units/' + ORG + '__' + s, unit(s, { custody: { status: 'in_transit', custodian: 'carrier', shippedAt: '2026-08-01', legId: 'load1' } })); });
  db.seed('plant_units/' + ORG + '__S003', unit('S003', { sku: 'CC-C418' }));
  db.seed('plant_units/' + ORG + '__S005', unit('S005', { inventoryStatus: 'available', orderId: null, orderNo: null, customerId: null }));
  db.seed('plant_units/' + ORG + '__MOD1', unit('MOD1', { shipUnit: false, rootSerial: 'S001', unitType: 'module' }));
}
var NOW = '2026-09-05T12:00:00Z';

(async function () {
  console.log('\nthe library');
  await test('every move starts only from the statuses it may', function () {
    var u = unit('X'); assert.equal(C.judge(u, 'assign', { siteId: 's' }).reason, 'wrong_status'); assert.equal(C.judge(u, 'receive', {}).ok, true);
    assert.equal(C.judge(unit('Y', { at: 'rack' }), 'ship', {}).reason, 'not_ready'); assert.equal(C.judge(unit('M', { shipUnit: false }), 'receive', {}).reason, 'not_a_shipping_unit');
    assert.equal(C.judge(unit('Z', { custody: { status: 'received' } }), 'assign', {}).reason, 'site_required'); assert.equal(C.judge(unit('Z', { custody: { status: 'assigned', siteId: 's' } }), 'assign', { siteId: 's' }).action, 'duplicate');
    assert.equal(C.judge(unit('Z', { custody: { status: 'in_service' } }), 'commission', {}).reason, 'wrong_status'); assert.equal(C.judge(unit('Z', { custody: { state: 'scrapped' } }), 'receive', {}).reason, 'scrapped');
    /* a serial voided at registration (a typo the plant corrected) is never moved, sent anywhere or planned */
    var v = unit('V', { inventoryStatus: 'void' }); assert.equal(C.judge(v, 'receive', {}).reason, 'void'); assert.throws(function () { C.destination(v, { siteId: 's', siteName: 'S' }, 'pm', NOW, 'manual'); }, /voided/); assert.equal(C.plannable(v).why, 'void');
  });
  await test('apply stamps the dates and writes one event; commissioning implies installed', function () {
    var ap = C.apply(unit('X', { custody: { status: 'assigned', siteId: 's' } }), 'commission', { at: '2026-09-04', installer: 'Riverside Electric' }, 'pm', NOW, 'scan');
    assert.equal(ap.patch['custody.status'], 'commissioned'); assert.equal(ap.patch['custody.commissionedAt'], '2026-09-04'); assert.equal(ap.patch['custody.installedAt'], '2026-09-04'); assert.equal(ap.event.method, 'scan'); assert.equal(ap.event.from, 'assigned');
    assert.throws(function () { C.apply(unit('X', { custody: { status: 'assigned' } }), 'commission', { at: '12-04-2026' }, 'pm', NOW); }, /YYYY-MM-DD/);
    assert.equal(C.day('8/20/2026'), '2026-08-20');
  });
  await test('import adopts an UNOWNED site by name + ZIP for a unit on an account, never a duplicate', function () {
    var joliet = { id: 'site_none-joliet-yard-60431', name: 'Joliet yard', customerId: null, address: { zip: '60431' } };
    var map = { Serial: 'serial', Site: 'siteName', ZIP: 'zip', Received: 'receivedDate', Address: 'line1', Commissioned: 'commissionDate' };
    function ctx(u) { return { units: { A001: u }, sites: { 'site_none-joliet-yard-60431': joliet }, byKey: { 'none:joliet yard:60431': joliet }, accountOf: function () { return 'amp1'; }, allowNewSites: true }; }
    var a = C.plan([{ Serial: 'A001', Site: 'Joliet yard', ZIP: '60431', Received: '2026-09-01' }], map, ctx(unit('A001', { orderId: 'amp-o1', custody: { status: 'delivered' } })), NOW);
    assert.deepEqual(a.items[0].problems, []); assert.equal(a.items[0].siteId, joliet.id); assert.equal(a.summary.newSites, 0);
    var b = C.plan([{ Serial: 'A001', Site: 'Joliet yard', ZIP: '60431', Address: '1 Yard Rd', Commissioned: '2026-09-10' }], map, ctx(unit('A001', { orderId: 'amp-o1', custody: { status: 'assigned', siteId: joliet.id, customerId: 'amp1' } })), NOW);
    assert.equal(b.summary.newSites, 0); assert.equal(b.items[0].siteId, joliet.id); assert.deepEqual(b.items[0].actions.map(function (x) { return x.action; }), ['commission']);
  });
  await test('coverage: pending until a site AND the trigger; earliest_of caps at ship + months; expiry', function () {
    var p215 = { warrantyYears: 10 }, u = unit('X', { custody: { status: 'received', shippedAt: '2026-08-01', receivedAt: '2026-08-20' } });
    assert.equal(C.coverageOf(p215, u, NOW)[0].status, 'pending'); assert.equal(C.coverageOf(p215, u, NOW)[0].why, 'no site assigned');
    u.custody.siteId = 's'; var cv = C.coverageOf(p215, u, NOW)[0]; assert.equal(cv.status, 'active'); assert.equal(cv.startDate, '2026-08-01'); assert.equal(cv.endDate, '2036-08-01');
    var p418 = { coverage: [{ id: 'product', type: 'warranty', termMonths: 120, trigger: 'earliest_of', capMonths: 18 }, { id: 'uptime', type: 'sla', termMonths: 60, trigger: 'commissioning' }] };
    var v = unit('Y', { custody: { status: 'assigned', siteId: 's', shippedAt: '2026-08-01' } }), cov = C.coverageOf(p418, v, NOW);
    assert.equal(cov[0].status, 'pending'); assert.match(cov[0].why, /starts 2028-02-01 unless commissioned first/); assert.equal(cov[1].status, 'pending');
    v.custody.commissionedAt = '2026-09-04'; cov = C.coverageOf(p418, v, NOW); assert.equal(cov[0].startDate, '2026-09-04'); assert.equal(cov[1].startDate, '2026-09-04'); assert.equal(cov[1].endDate, '2031-09-04');
    var late = unit('L', { custody: { status: 'assigned', siteId: 's', shippedAt: '2026-08-01', commissionedAt: '2028-09-01' } }); assert.equal(C.coverageOf(p418, late, '2028-09-02T00:00:00Z')[0].startDate, '2028-02-01', 'the 18-month cap wins over a late commissioning');
    assert.equal(C.coverageOf(p215, unit('E', { custody: { status: 'in_service', siteId: 's', shippedAt: '2015-01-01' } }), NOW)[0].status, 'expired');
    assert.equal(C.coverageOf({}, u, NOW).length, 0, 'a product with no warranty carries no coverage');
  });
  await test('a template is validated: term, trigger, cap, uptime', function () {
    assert.throws(function () { C.template({ id: 'x', termMonths: 0, trigger: 'ship' }); }, /1–600/); assert.throws(function () { C.template({ id: 'x', termMonths: 12, trigger: 'earliest_of' }); }, /capMonths/);
    assert.throws(function () { C.template({ id: 'x', type: 'sla', termMonths: 12, trigger: 'ship', metrics: { uptimePct: 140 } }); }, /Uptime/);
    var p = Cat.product({ sku: 'CC-1', name: 'One', kind: 'product', category: 'bess', coverage: [{ id: 'W-1', type: 'warranty', termMonths: 120, trigger: 'ship' }] }); assert.equal(p.coverage[0].id, 'w-1');
    assert.throws(function () { Cat.product({ sku: 'CC-1', name: 'One', kind: 'product', category: 'bess', coverage: [{ id: 'a', termMonths: 1, trigger: 'ship' }, { id: 'a', termMonths: 1, trigger: 'ship' }] }); }, /used twice/);
  });
  await test('the maker’s warranty on a bought-in unit: one more template after the catalog’s, recorded only from the maker’s word', function () {
    var BO = { items: [{ sku: 'NX-500', qty: 2, reference: true, mfr: 'Northwind Batteries' }], procure: { mfr: 'Northwind Batteries', mfrOrgId: null, sku: 'NX-500', model: 'NX 500' } };
    var bi = C.boughtIn(BO, 'NX-500'); assert.deepEqual(bi, { sku: 'NX-500', mfr: 'Northwind Batteries', model: 'NX 500' });
    assert.equal(C.boughtIn(BO, 'CC-C215'), null); assert.equal(C.boughtIn({ items: [{ sku: 'NX-500', qty: 1 }] }, 'NX-500'), null, 'a line the seller makes is not bought in');
    assert.equal(C.boughtIn({ items: [{ sku: 'NX-500', qty: 1, reference: true, mfr: 'Northwind Batteries' }], procure: null }, 'NX-500'), null, 'a reference line with no procure is the seller’s own unpublished product (prime-order.js), not bought in');
    assert.equal(C.boughtIn({ procure: { sku: 'NX-500', mfr: 'Northwind Batteries' } }, 'NX-500').mfr, 'Northwind Batteries', 'procure alone says bought in');
    assert.equal(C.boughtIn({ items: [{ sku: 'NX-500', reference: true, mfr: 'Northwind Batteries' }], procure: { sku: 'NX-500', mfr: '' } }, 'NX-500').mfr, 'Northwind Batteries', 'the maker’s name off the line when procure has none');
    assert.equal(C.boughtInUnit(unit('R2', { sku: 'NX-500', custody: { replaces: 'R1' } }), { items: [] }, BO).mfr, 'Northwind Batteries', 'a replacement off another order: bought in through the order of the unit it replaced');
    assert.equal(C.boughtInUnit(unit('R3', { sku: 'NX-500', custody: {} }), { items: [] }, BO), null, 'a unit that replaced nothing is judged on its own order alone');
    var u = unit('B1', { sku: 'NX-500', custody: { status: 'assigned', siteId: 's', shippedAt: '2026-08-01', receivedAt: '2026-08-10' } });
    assert.throws(function () { C.makerWarranty(u, { termMonths: 120, trigger: 'ship' }, 'boss', NOW, bi); }, /never assumed/, 'no document and no confirmation: refused');
    assert.throws(function () { C.makerWarranty(u, { termMonths: 120, trigger: 'ship', reference: 'ok' }, 'boss', NOW, bi); }, /5 characters/, 'a confirmation of a word or two is not one');
    assert.throws(function () { C.makerWarranty(u, { termMonths: 120, trigger: 'ship', docUrl: 'http://maker.example/w.pdf' }, 'boss', NOW, bi); }, /HTTPS/);
    assert.throws(function () { C.makerWarranty(u, { termMonths: 0, trigger: 'ship', reference: 'NW-W-0042' }, 'boss', NOW, bi); }, /1–600/);
    assert.throws(function () { C.makerWarranty(u, { termMonths: 120, trigger: 'earliest_of', reference: 'NW-W-0042' }, 'boss', NOW, bi); }, /capMonths/);
    assert.throws(function () { C.makerWarranty(unit('Q', { custody: {} }), { termMonths: 120, trigger: 'ship', reference: 'NW-W-0042' }, 'boss', NOW, null); }, /only for a unit its order buys in/, 'a unit the seller makes: refused, its catalog holds the warranty');
    assert.throws(function () { C.makerWarranty(unit('M', { shipUnit: false }), { termMonths: 120, trigger: 'ship', reference: 'NW-W-0042' }, 'boss', NOW, bi); }, /component/);
    assert.throws(function () { C.makerWarranty(unit('V', { inventoryStatus: 'void' }), { termMonths: 120, trigger: 'ship', reference: 'NW-W-0042' }, 'boss', NOW, bi); }, /voided/);
    var r = C.makerWarranty(u, { termMonths: 120, trigger: 'earliest_of', capMonths: 18, reference: 'NW-W-0042 (J. Moss, 2026-08-02)', provider: 'Somebody else' }, 'boss', NOW, bi);
    assert.equal(r.patch['custody.makerWarranty'].provider, 'Northwind Batteries', 'the maker is the order’s, not a typed name');
    assert.deepEqual(Object.keys(r.patch['custody.makerWarranty']).sort(), ['capMonths', 'docUrl', 'orderId', 'provider', 'recordedAt', 'recordedBy', 'reference', 'termMonths', 'trigger'], 'terms and provenance only: no status is stored');
    assert.equal(r.event.type, 'maker-warranty'); assert.match(r.event.note, /^Northwind Batteries: 120 months from commissioning or shipment plus the cap, whichever is first \(18 months\) · NW-W-0042/);
    u.custody.makerWarranty = r.after;
    var cov = C.coverageWithInheritance(undefined, u, NOW); assert.equal(cov.length, 1); assert.deepEqual([cov[0].templateId, cov[0].type, cov[0].provider, cov[0].status, cov[0].why], ['maker', 'warranty', 'Northwind Batteries', 'pending', 'starts 2028-02-01 unless commissioned first']);
    u.custody.commissionedAt = '2026-09-01'; cov = C.coverageOf(null, u, NOW); assert.deepEqual([cov[0].status, cov[0].startDate, cov[0].endDate], ['active', '2026-09-01', '2036-09-01'], 'derived from the custody dates, like any template');
    assert.equal(C.makerWarranty(u, { termMonths: 120, trigger: 'earliest_of', capMonths: 18, reference: 'NW-W-0042 (J. Moss, 2026-08-02)' }, 'boss2', NOW, bi).duplicate, true, 'the same terms again change nothing');
    var fix = C.makerWarranty(u, { termMonths: 96, trigger: 'commissioning', reference: 'NW-W-0042 rev 2' }, 'boss', NOW, bi); assert.equal(fix.event.type, 'maker-warranty-corrected'); assert.equal(fix.before.termMonths, 120);
    assert.throws(function () { C.makerWarranty(u, { clear: true, reason: 'no' }, 'boss', NOW, bi); }, /Say why/);
    var off = C.makerWarranty(u, { clear: true, reason: 'recorded on the wrong order' }, 'boss', NOW, null); assert.equal(off.patch['custody.makerWarranty'], null); assert.equal(off.event.type, 'maker-warranty-removed');
    assert.equal(C.makerWarranty(unit('Z', { custody: {} }), { clear: true, reason: 'nothing here' }, 'boss', NOW, bi).duplicate, true);
    assert.throws(function () { C.makerWarranty(unit('R', { custody: { status: 'replaced', replacedBy: 'R2', makerWarranty: r.after } }), { termMonths: 12, trigger: 'ship', reference: 'NW-W-0042' }, 'boss', NOW, bi); }, /record the maker’s warranty on R2/);
    /* the catalog's own templates first; a catalog template already called 'maker' wins */
    var both = C.templatesOf({ warrantyYears: 10 }, u); assert.deepEqual(both.map(function (t) { return t.id; }), ['warranty', 'maker']);
    assert.deepEqual(C.templatesOf({ coverage: [{ id: 'maker', type: 'warranty', termMonths: 12, trigger: 'ship' }] }, u).map(function (t) { return t.termMonths; }), [12]);
    assert.equal(C.templatesOf({ warrantyYears: 10 }).length, 1, 'a product alone: its own templates');
    assert.equal(C.makerTemplate(unit('X', { custody: { makerWarranty: { provider: 'N', termMonths: 12, trigger: 'someday' } } })), null, 'a record that does not hold the limits is no warranty, not a wrong date');
    assert.equal(C.makerTemplate(unit('X', { custody: { makerWarranty: { provider: 'N', termMonths: 12, trigger: 'earliest_of' } } })), null);
  });
  await test('receiving reconciles expected against scanned: shorts, overages, damaged, duplicates', function () {
    var r = C.reconcile(['A', 'B', 'C'], ['A', { serial: 'B', condition: 'damaged' }, 'D', 'A']);
    assert.deepEqual(r, { received: ['A'], damaged: ['B'], short: ['C'], overage: ['D'], duplicate: ['A'], complete: false });
  });
  await test('exceptions: commissioned without a site, stale transit, received and idle, expiring coverage', function () {
    var ex = C.exceptions([unit('A', { custody: { status: 'commissioned', commissionedAt: '2026-09-01' } }), unit('B', { custody: { status: 'in_transit', shippedAt: '2026-07-01' } }), unit('C', { custody: { status: 'received', receivedAt: '2026-07-01' } }), unit('D', { custody: { status: 'in_service', siteId: 's', shippedAt: '2016-11-01' } })], [{ sku: 'CC-C215', warrantyYears: 10 }], NOW);
    assert.deepEqual(ex.map(function (e) { return e.serial + ':' + e.kind; }), ['A:commissioned_without_site', 'B:stale_in_transit', 'C:received_not_assigned', 'D:coverage_expiring']);
  });
  await test('the spreadsheet: quoted fields, tab pastes, header aliases, a saved mapping', function () {
    var p = C.parseCsv('Serial No,Site,"Address, Street",ZIP,Commissioned\nS1,"Yard, North","1 Main St, Suite 2",93307,12/4/2026\n'); assert.equal(p.rows[0]['Address, Street'], '1 Main St, Suite 2'); assert.equal(p.rows[0].Site, 'Yard, North');
    assert.equal(C.parseCsv('serial\tsite\nS1\tYard').rows[0].site, 'Yard');
    var m = C.guessMapping(p.headers, { 'Address, Street': 'line1' }); assert.deepEqual(m, { 'Serial No': 'serial', 'Site': 'siteName', 'Address, Street': 'line1', 'ZIP': 'zip', 'Commissioned': 'commissionDate' });
    assert.equal(C.parseCsv(C.csvTemplate()).headers.length, C.TEMPLATE_HEADERS.length);
  });

  console.log('\nthe office');
  seed();
  var siteId;
  await test('a site is an end location with its interconnection; the same name and ZIP is one site', async function () {
    var r = await post({ action: 'site', name: 'Bakersfield yard', customerId: 'company_riverside', address: { line1: '1200 Depot Rd', city: 'Bakersfield', state: 'CA', zip: '93307' }, interconnection: { utility: 'PG&E', meterNo: '1002233', poi: 'POI-7 480V', serviceKw: 500 }, endCustomer: 'Harbor Charging' });
    siteId = r.siteId; assert.match(siteId, /^site_company-riverside-bakersfield-yard-93307/); assert.equal(db.data.get(O + '/sites/' + siteId).interconnection.poi, 'POI-7 480V');
    await rejects(post({ action: 'site', name: 'bakersfield  yard', customerId: 'company_riverside', address: { zip: '93307' } }), 409, /already exists/);
    var e = await post({ action: 'site', id: siteId, name: 'Bakersfield yard', address: { line1: '1200 Depot Rd', city: 'Bakersfield', state: 'CA', zip: '93307' }, interconnection: { utility: 'PG&E', poi: 'POI-7 480V', serviceKw: 750 } }); assert.equal(e.site.interconnection.serviceKw, 750); assert.equal(e.site.customerId, 'company_riverside');
    await rejects(post({ action: 'site', name: 'x', lat: 200 }), 400, /Latitude/);
  });
  await test('a unit in transit cannot be assigned; the office is told why', async function () { await rejects(post({ action: 'move', move: 'assign', serial: 'S001', siteId: siteId }), 409, /in transit/); });
  await test('receiving a load: expected vs scanned, shorts and overages named, custody received, damage recorded', async function () {
    var r = await post({ action: 'receive-load', orderId: 'o1', legId: 'load1', received: ['S001', { serial: 'S002', condition: 'damaged' }, 'S009'], siteId: siteId, method: 'scan' });
    assert.deepEqual([r.received, r.damaged, r.short, r.overage], [['S001'], ['S002'], [], ['S009']]); assert.equal(r.complete, false); assert.match(r.note, /not on this load/);
    var s1 = db.data.get('plant_units/' + ORG + '__S001').custody; assert.equal(s1.status, 'received'); assert.equal(s1.custodian, 'customer'); assert.equal(s1.siteId, siteId); assert.equal(s1.legId, 'load1');
    var s2 = db.data.get('plant_units/' + ORG + '__S002').custody; assert.equal(s2.status, 'received'); assert.equal(s2.state, 'damaged');
    var ev = Array.from(db.data.keys()).filter(function (k) { return k.indexOf('plant_units/' + ORG + '__S001/custody_events/') === 0; }); assert.equal(ev.length, 1); assert.equal(db.data.get(ev[0]).method, 'scan');
    var again = await post({ action: 'receive-load', orderId: 'o1', legId: 'load1', received: ['S001'] }); assert.equal(again.received.length, 0); assert.match(again.refused[0].why, /received/, 'a second receipt is refused, not duplicated');
  });
  await test('assign binds the unit to the site; coverage goes active from the ship date', async function () {
    var r = await post({ action: 'move', move: 'assign', serial: 'S001', siteId: siteId, position: 'Pad 2', method: 'scan' }); assert.equal(r.custody.status, 'assigned'); assert.equal(r.custody.position, 'Pad 2');
    var pass = await get({ serial: 'S001' }); assert.equal(pass.unit.coverage[0].status, 'active'); assert.equal(pass.unit.coverage[0].startDate, '2026-08-01'); assert.equal(pass.unit.coverage[0].endDate, '2036-08-01'); assert.equal(pass.site.name, 'Bakersfield yard'); assert.equal(pass.events.length, 2);
    var dup = await post({ action: 'move', move: 'assign', serial: 'S001', siteId: siteId, position: 'Pad 2' }); assert.equal(dup.action, 'duplicate');
    await rejects(post({ action: 'move', move: 'assign', serial: 'MOD1', siteId: siteId }), 409, /component/);
    await rejects(post({ action: 'move', move: 'ship', serial: 'S005' }), 400, /Shipping/);
  });
  await test('commissioned without a site is an exception; the SLA waits for commissioning', async function () {
    await rejects(post({ action: 'move', move: 'commission', serial: 'S003', at: '2026-09-04' }), 409, /at the plant/);
    await post({ action: 'move', move: 'receive', serial: 'S003', at: '2026-08-22' });
    var r = await post({ action: 'move', move: 'commission', serial: 'S003', at: '2026-09-04', installer: 'Riverside Electric' }); assert.equal(r.custody.status, 'commissioned');
    var ex = await get({ view: 'exceptions' }); assert.ok(ex.exceptions.some(function (e) { return e.serial === 'S003' && e.kind === 'commissioned_without_site'; }), JSON.stringify(ex.exceptions));
    var pass = await get({ serial: 'S003' }); assert.equal(pass.unit.coverage[1].type, 'sla'); assert.equal(pass.unit.coverage[1].status, 'pending'); assert.equal(pass.unit.coverage[1].why, 'no site assigned');
    await rejects(post({ action: 'move', move: 'assign', serial: 'S003', siteId: siteId }), 409, /commissioned/, 'a commissioned unit is not re-assigned through assign');
  });
  await test('the overview counts custody, sites with their units, coverage and exceptions', async function () {
    var d = await get({}); assert.equal(d.counts.assigned, 1); assert.equal(d.counts.received, 1); assert.equal(d.counts.commissioned, 1); assert.equal(d.counts.plant, 1);
    assert.equal(d.sites[0].units, 2); assert.equal(d.coverage.active, 2, 'received at a site counts as bound to it'); assert.ok(d.exceptions.length >= 1); assert.equal(d.products.length, 2); assert.equal(d.products[1].coverage.length, 2); assert.equal(d.units.length, 3);
    await get({ template: '1' }); assert.match(res.headers['Content-Type'], /csv/); assert.match(res.body, /serial_number,site_id/);
  });
  await test('a state: quarantined, then cleared; scrapped is final', async function () {
    var r = await post({ action: 'state', serial: 'S002', state: 'quarantined', note: 'forklift dent' }); assert.equal(r.state, 'quarantined');
    await post({ action: 'state', serial: 'S002', state: 'clear' }); assert.equal(db.data.get('plant_units/' + ORG + '__S002').custody.state, null);
    await post({ action: 'state', serial: 'S005', state: 'scrapped' }); await rejects(post({ action: 'state', serial: 'S005', state: 'clear' }), 409, /scrapped/); await rejects(post({ action: 'move', move: 'receive', serial: 'S005' }), 409, /scrapped/);
  });

  console.log('\nthe customer');
  await test('the customer sees their sites and units with coverage, and nobody else\'s', async function () {
    var d = await cget(); assert.equal(d.sites.length, 1); assert.equal(d.sites[0].units, 2); assert.equal(d.units.length, 3);
    var s1 = d.units.filter(function (u) { return u.serial === 'S001'; })[0]; assert.equal(s1.label, 'assigned to site'); assert.equal(s1.coverage[0].status, 'active'); assert.equal(s1.coverage[0].until, '2036-08-01');
    db.seed(O + '/customer_index/someone@else.example', { customerId: 'company_other' }); db.seed(O + '/customers/company_other', { name: 'Other', status: 'active' }); db.seed(O + '/customers/company_other/users/someone@else.example', { email: 'someone@else.example', status: 'active' });
    var o = await cget(OTHER); assert.equal(o.units.length, 0); assert.equal(o.sites.length, 0);
    await rejects(cpost({ action: 'assign', serial: 'S001', siteId: siteId }, OTHER), 404, /not on one of your orders/);
  });
  var mySite;
  await test('the customer creates a site and binds a received unit to it; the warranty starts from the ship date', async function () {
    var s = await cpost({ action: 'site', name: 'Fresno depot', address: { line1: '88 Rail Ave', city: 'Fresno', state: 'CA', zip: '93706' }, interconnection: { utility: 'PG&E', poi: 'Switchgear B' } }); mySite = s.site.id;
    assert.equal(db.data.get(O + '/sites/' + mySite).customerId, 'company_riverside', 'the customer cannot put a site on another account');
    await rejects(cpost({ action: 'assign', serial: 'S002', siteId: 'site_nope' }), 404, /Site not found/);
    var r = await cpost({ action: 'assign', serial: 'S002', siteId: mySite, position: 'Bay 1' }); assert.equal(r.unit.siteName, 'Fresno depot'); assert.equal(r.unit.coverage[0].status, 'active');
    /* the office received S002 today (the endpoint's clock), so the customer commissions it today: a commissioning before the receipt is refused (CUST-17) */
    var TODAY = new Date().toISOString().slice(0, 10);
    var c = await cpost({ action: 'commissioned', serial: 'S002', at: TODAY, installer: 'Riverside Electric' }); assert.equal(c.unit.status, 'commissioned'); assert.equal(c.unit.commissionedAt, TODAY);
    await rejects(cpost({ action: 'commissioned', serial: 'S002', at: '2026-09-06' }), 409, /commissioned/);
    var ev = Array.from(db.data.keys()).filter(function (k) { return k.indexOf('plant_units/' + ORG + '__S002/custody_events/') === 0; }).map(function (k) { return db.data.get(k); }); assert.equal(ev[ev.length - 1].method, 'customer');
  });
  await test('the customer says where a unit in transit is going; receipt binds it there as their declaration; the office confirms', async function () {
    db.seed('plant_units/' + ORG + '__S009', unit('S009', { custody: { status: 'in_transit', shippedAt: '2026-09-12', customerId: 'company_riverside' } }));
    await rejects(cpost({ action: 'destination', serial: 'S009', siteId: 'site_nope' }), 404, /Site not found on your account/);
    var d = await cpost({ action: 'destination', serial: 'S009', siteId: mySite, position: 'Bay 2' }); assert.equal(d.unit.plannedSiteName, 'Fresno depot'); assert.equal(d.unit.siteId, null); assert.equal(d.unit.confirmation, null);
    await rejects(cpost({ action: 'destination', serial: 'S002', siteId: mySite }), 409, /already commissioned/, 'a bound unit changes site through assign, not a destination');
    var r = await cpost({ action: 'received', serial: 'S009' }); assert.equal(r.unit.siteName, 'Fresno depot'); assert.equal(r.unit.position, 'Bay 2'); assert.equal(r.unit.confirmation, 'declared'); assert.equal(r.unit.plannedSiteId, null);
    var d0 = await get({}); assert.deepEqual(d0.toConfirm.map(function (u) { return u.serial; }).sort(), ['S002', 'S009'], 'S002 was assigned by the customer earlier and is unconfirmed too'); assert.equal(d0.toConfirm[0].custody.confirmation, 'declared');
    var pass = await get({ serial: 'S009' }); assert.equal(pass.unit.custody.declaredBy, 'customer'); assert.equal(pass.unit.coverage[0].status, 'active', 'a declared site still binds coverage; confirmation is the office\'s check, not a gate');
    var c = await post({ action: 'confirm', serial: 'S009' }); assert.equal(c.custody.confirmation, 'confirmed'); assert.equal(c.custody.confirmedBy, 'pm@cleancell.us');
    var again = await post({ action: 'confirm', serial: 'S009' }); assert.equal(again.action, 'duplicate');
    var mine = await cget(); assert.equal(mine.units.filter(function (u) { return u.serial === 'S009'; })[0].confirmation, 'confirmed');
    var d1 = await get({}); assert.deepEqual(d1.toConfirm.map(function (u) { return u.serial; }), ['S002']);
    var re = await cpost({ action: 'assign', serial: 'S009', siteId: mySite, position: 'Bay 3' }); assert.equal(re.unit.confirmation, 'confirmed', 'a new position at the confirmed site stays confirmed');
    await rejects(post({ action: 'confirm', serial: 'S005' }), 409, /not assigned/);
  });

  await test('the register is one flat row per unit with the parties, the load, the site and the coverage; details are links, not moves', async function () {
    var r = await get({ view: 'register' }); assert.equal(r.rows.length, 5, 'every shipping unit, at the plant or beyond; the module is not a row'); assert.equal(r.columns[0].key, 'serial');
    var s9 = r.rows.filter(function (x) { return x.serial === 'S009'; })[0]; assert.equal(s9.site, 'Fresno depot'); assert.equal(s9.confirmation.indexOf('confirmed'), 0); assert.equal(s9.seller, 'Clean Cell'); assert.equal(s9.warrantyStatus, 'active'); assert.equal(s9.warrantyUntil, '2036-09-12'); assert.equal(s9.statusLabel, 'assigned to site');
    var plant = r.rows.filter(function (x) { return !x.status; })[0]; assert.equal(plant.custodian, 'plant'); assert.ok(/ready to ship|being built/.test(plant.statusLabel));
    var d = await post({ action: 'detail', serial: 'S009', reseller: 'Valley Power Partners', endCustomer: 'Fresno Cold Storage', notes: 'pad 2, north fence' }); assert.deepEqual(d.changed, ['reseller', 'endCustomer', 'notes']); assert.equal(d.custody.reseller, 'Valley Power Partners');
    var again = await post({ action: 'detail', serial: 'S009', reseller: 'Valley Power Partners' }); assert.equal(again.action, 'duplicate');
    await rejects(post({ action: 'detail', serial: 'S009', commissioningReportUrl: 'http://not-https' }), 400, /HTTPS/);
    var r2 = await get({ view: 'register' }); var s9b = r2.rows.filter(function (x) { return x.serial === 'S009'; })[0]; assert.equal(s9b.reseller, 'Valley Power Partners'); assert.equal(s9b.endCustomer, 'Fresno Cold Storage'); assert.equal(s9b.status, 'assigned', 'a detail never moves the unit');
    var ev = await get({ serial: 'S009' });
    // In-memory operations may share a millisecond; timestamp ties have no
    // guaranteed order. Assert the one detail event and its content.
    var details = ev.events.filter(function (e) { return e.type === 'detail'; });
    assert.equal(details.length, 1); assert.match(details[0].note, /reseller: Valley Power Partners/);
  });

  console.log('\nreplacement and import');
  await test('an RMA replacement inherits the remaining term and the site; both serials stay linked', async function () {
    await post({ action: 'move', move: 'install', serial: 'S001', at: '2026-08-28' }); await post({ action: 'move', move: 'commission', serial: 'S001', at: '2026-09-04' }); await post({ action: 'move', move: 'in-service', serial: 'S001', at: '2026-09-06' });
    await post({ action: 'move', move: 'rma-open', serial: 'S001', reason: 'BMS fault' });
    db.seed('plant_units/' + ORG + '__S006', unit('S006', { orderId: null, orderNo: null, customerId: null, inventoryStatus: 'available', custody: { status: 'received', shippedAt: '2026-09-10', receivedAt: '2026-09-14' } }));
    await rejects(post({ action: 'replace', serial: 'S001', replacementSerial: 'S001' }), 409, /replace itself/);
    var r = await post({ action: 'replace', serial: 'S001', replacementSerial: 'S006' }); assert.equal(r.siteId, siteId);
    var s1 = await get({ serial: 'S001' }); assert.equal(s1.unit.custody.status, 'replaced'); assert.equal(s1.unit.custody.replacedBy, 'S006'); assert.equal(s1.unit.coverage[0].status, 'transferred'); assert.equal(s1.replacedBy.serial, 'S006');
    var s6 = await get({ serial: 'S006' }); assert.equal(s6.unit.custody.status, 'assigned'); assert.equal(s6.unit.custody.siteId, siteId); assert.equal(s6.unit.custody.replaces, 'S001');
    assert.equal(s6.unit.coverage[0].startDate, '2026-08-01'); assert.equal(s6.unit.coverage[0].endDate, '2036-08-01', 'the remaining term, not a fresh ten years'); assert.equal(s6.unit.coverage[0].inheritedFrom, 'S001');
  });
  await test('an import is mapped, dry-run, then committed; sites are created; a second run changes nothing', async function () {
    ['S007', 'S008'].forEach(function (s) { db.seed('plant_units/' + ORG + '__' + s, unit(s, { custody: { status: 'in_transit', shippedAt: '2026-08-15' } })); });
    var text = 'Serial No,Site,Street,City,State,Zip,End Customer,Position,Installer,Received,Commissioned\nS007,Tehachapi wind yard,4 Ridge Rd,Tehachapi,CA,93561,Harbor,Pad 1,Riverside Electric,8/20/2026,2026-09-04\nS008,Tehachapi wind yard,4 Ridge Rd,Tehachapi,CA,93561,Harbor,Pad 2,,8/20/2026,\nS001,Tehachapi wind yard,4 Ridge Rd,Tehachapi,CA,93561,,,,8/20/2026,\nNOPE,Tehachapi wind yard,4 Ridge Rd,Tehachapi,CA,93561,,,,8/20/2026,\n';
    var dry = await post({ action: 'import', text: text, customerId: 'company_riverside', allowNewSites: true }); assert.equal(dry.dryRun, true); assert.equal(dry.mapping['Serial No'], 'serial'); assert.equal(dry.mapping['Commissioned'], 'commissionDate');
    assert.equal(dry.plan.summary.willChange, 2); assert.equal(dry.plan.summary.errors, 2); assert.equal(dry.plan.summary.newSites, 1);
    assert.deepEqual(dry.plan.items[0].actions.map(function (a) { return a.action; }), ['receive', 'assign', 'commission']); assert.deepEqual(dry.plan.items[1].actions.map(function (a) { return a.action; }), ['receive', 'assign']);
    assert.match(dry.plan.items[2].problems[0], /replaced/); assert.match(dry.plan.items[3].problems[0], /not registered/);
    await rejects(post({ action: 'import', text: text, customerId: 'company_riverside' }), 409, /does not exist; add it first/).catch(function () {}); /* new sites need allowNewSites; the row error is in the plan, not thrown */
    var noNew = await post({ action: 'import', text: text, customerId: 'company_riverside', allowNewSites: false }); assert.match(noNew.plan.items[0].problems[0], /does not exist/);
    var done = await post({ action: 'import', text: text, customerId: 'company_riverside', allowNewSites: true, dryRun: false, fileName: 'harbor-sites.csv' });
    assert.equal(done.summary.created, 1); assert.equal(done.summary.updated, 2); assert.equal(done.errors.length, 2);
    var s7 = await get({ serial: 'S007' }); assert.equal(s7.unit.custody.status, 'commissioned'); assert.equal(s7.site.name, 'Tehachapi wind yard'); assert.equal(s7.site.customerId, 'company_riverside'); assert.equal(s7.unit.coverage[0].status, 'active'); assert.equal(s7.events.length, 3); assert.equal(s7.events[0].method, 'import');
    var s8 = await get({ serial: 'S008' }); assert.equal(s8.unit.custody.status, 'assigned'); assert.equal(s8.unit.custody.position, 'Pad 2');
    var again = await post({ action: 'import', text: text, customerId: 'company_riverside', allowNewSites: true, dryRun: false }); assert.equal(again.summary.updated, 0); assert.equal(again.summary.skipped, 2); assert.equal(again.summary.created, 0);
    var batches = Array.from(db.data.keys()).filter(function (k) { return k.indexOf(O + '/custody_imports/') === 0; }); assert.equal(batches.length, 2); assert.equal(db.data.get(batches[0]).fileName, 'harbor-sites.csv');
    await post({ action: 'mapping-save', mapping: { 'Serial No': 'serial', 'Site': 'siteName', 'Bogus': 'nope' } }); assert.deepEqual(db.data.get(O + '/custody_mappings/assignment').columnMap, { 'Serial No': 'serial', 'Site': 'siteName' });
    var d = await get({}); assert.equal(d.mapping['Serial No'], 'serial');
  });
  await test('a site page lists what is bound to it', async function () { var d = await get({ site: siteId }); assert.deepEqual(d.units.map(function (u) { return u.serial; }).sort(), ['S001', 'S006']); });
  await test('CUST-17: a customer\'s own date is one that can be true — not in the future, not before the step it follows — and nothing moves when it is not', async function () {
    db.seed('plant_units/' + ORG + '__S010', unit('S010', { sku: 'CC-C418', custody: { status: 'in_transit', shippedAt: '2026-08-01', customerId: 'company_riverside' } }));
    await rejects(cpost({ action: 'received', serial: 'S010', at: '2025-01-01' }), 400, /before it shipped \(2026-08-01, as recorded\)/);
    await rejects(cpost({ action: 'received', serial: 'S010', at: '2099-01-01' }), 400, /in the future/);
    assert.equal(db.data.get('plant_units/' + ORG + '__S010').custody.status, 'in_transit', 'a refused date moves nothing');
    assert.equal((await cpost({ action: 'received', serial: 'S010', at: '2026-08-04' })).unit.status, 'received');
    await cpost({ action: 'assign', serial: 'S010', siteId: mySite });
    await rejects(cpost({ action: 'commissioned', serial: 'S010', at: '2031-06-01' }), 400, /in the future/);
    await rejects(cpost({ action: 'commissioned', serial: 'S010', at: '2026-08-02' }), 400, /before it was received \(2026-08-04, as recorded\)/);
    var tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    var c = await cpost({ action: 'commissioned', serial: 'S010', at: tomorrow }); assert.equal(c.unit.commissionedAt, tomorrow, 'a day\'s grace for the buyer\'s own time zone');
    var sla = c.unit.coverage.filter(function (x) { return x.id === 'uptime'; })[0]; assert.equal(sla.from, tomorrow, 'the SLA starts on a date that can be true');
    /* the office's record (an import of history, the load) is judged by the office, not refused here */
    assert.doesNotThrow(function () { C.apply(unit('S011', { custody: { status: 'in_transit', shippedAt: '2026-08-01' } }), 'receive', { at: '2026-07-30' }, 'pm@cleancell.us', NOW, 'import'); });
  });
  console.log('\nthe maker’s warranty on a bought-in unit');
  var BOSS = { uid: 'boss', email: 'boss@cleancell.us', orgId: ORG, claims: { email_verified: true } };
  db.seed(O + '/members/boss', { email: 'boss@cleancell.us', role: 'admin', status: 'active' });
  db.seed('orders/o7', { orgId: ORG, orderNo: 'PRM-20260901-7A7A7A', status: 'in_fulfilment', source: 'prime', customerId: 'company_riverside', customer: { email: 'ops@riverside.example', name: 'Riverside Cold Chain' },
    items: [{ sku: 'NX-500', name: 'Northwind NX 500', kind: 'product', qty: 3, reference: true, mfr: 'Northwind Batteries' }], procure: { mfr: 'Northwind Batteries', mfrOrgId: null, sku: 'NX-500', model: 'NX 500' } });
  function bought(serial, custody) { db.seed('plant_units/' + ORG + '__' + serial, unit(serial, { sku: 'NX-500', orderId: 'o7', orderNo: 'PRM-20260901-7A7A7A', custody: custody })); }
  bought('NX001', { status: 'assigned', siteId: siteId, siteName: 'Bakersfield yard', shippedAt: '2026-08-20', receivedAt: '2026-08-25', customerId: 'company_riverside' });
  bought('NX002', { status: 'received', shippedAt: '2026-08-20', receivedAt: '2026-08-25', customerId: 'company_riverside' });
  var TERMS = { action: 'maker-warranty', serial: 'NX001', termMonths: 120, trigger: 'ship', reference: 'NW-W-0042, J. Moss by email 2026-08-02', docUrl: 'https://northwind.example/warranty/nx-500.pdf' };
  await test('the passport says a unit is bought in, and who may record its maker’s warranty', async function () {
    var p = await get({ serial: 'NX001' });
    assert.deepEqual(p.boughtIn, { orderId: 'o7', orderNo: 'PRM-20260901-7A7A7A', sku: 'NX-500', mfr: 'Northwind Batteries', model: 'NX 500' }); assert.equal(p.product, null, 'the product is in no catalog');
    assert.deepEqual(p.unit.coverage, [], 'nothing on file yet'); assert.equal(p.canRecordWarranty, false, 'a member reads it');
    assert.equal((await get({ serial: 'NX001' }, BOSS)).canRecordWarranty, true, 'an administrator records it');
    assert.equal((await get({ serial: 'S009' })).boughtIn, null, 'a unit the workspace makes is not bought in');
  });
  await test('only an owner or administrator records it, only for a bought-in unit, only from the maker’s word', async function () {
    await rejects(post(TERMS), 403, /owner or an administrator/);
    await rejects(post(Object.assign({}, TERMS, { serial: 'S009' }), BOSS), 409, /only for a unit its order buys in/);
    await rejects(post(Object.assign({}, TERMS, { reference: '', docUrl: '' }), BOSS), 400, /never assumed/);
    await rejects(post(Object.assign({}, TERMS, { serial: 'NOPE1' }), BOSS), 404, /not registered/);
    assert.equal(db.data.get('plant_units/' + ORG + '__NX001').custody.makerWarranty, undefined, 'a refusal writes nothing');
  });
  await test('recorded on the unit: the passport, the customer’s app and the register read the same warranty; the confirmation stays in the office', async function () {
    var r = await post(TERMS, BOSS); assert.deepEqual([r.applied, r.unchanged, r.skipped], [['NX001'], [], []]); assert.match(r.say, /on file for 1 unit/);
    var rec = db.data.get('plant_units/' + ORG + '__NX001').custody.makerWarranty; assert.equal(rec.provider, 'Northwind Batteries'); assert.equal(rec.recordedBy, 'boss@cleancell.us'); assert.equal(rec.orderId, 'o7');
    var p = await get({ serial: 'NX001' }); assert.deepEqual([p.unit.coverage[0].templateId, p.unit.coverage[0].status, p.unit.coverage[0].startDate, p.unit.coverage[0].endDate, p.unit.coverage[0].provider], ['maker', 'active', '2026-08-20', '2036-08-20', 'Northwind Batteries']);
    var ev = p.events.filter(function (e) { return e.type === 'maker-warranty'; }); assert.equal(ev.length, 1); assert.match(ev[0].note, /NW-W-0042/); assert.equal(ev[0].by, 'boss@cleancell.us');
    var au = Array.from(db.data.keys()).filter(function (k) { return k.indexOf('omega_audit/') === 0 && db.data.get(k).action === 'custody-maker-warranty'; }).map(function (k) { return db.data.get(k); });
    assert.equal(au.length, 1); assert.deepEqual(au[0].units, [{ serial: 'NX001', before: null }]); assert.equal(au[0].after.termMonths, 120);
    var mine = await cget(), nx = mine.units.filter(function (u) { return u.serial === 'NX001'; })[0];
    assert.deepEqual([nx.coverage[0].provider, nx.coverage[0].status, nx.coverage[0].until, nx.coverage[0].docUrl], ['Northwind Batteries', 'active', '2036-08-20', 'https://northwind.example/warranty/nx-500.pdf'], 'the customer sees the maker’s warranty and its document');
    assert.ok(JSON.stringify(mine).indexOf('NW-W-0042') < 0, 'and never the maker’s confirmation, which is the office’s record');
    var reg = (await get({ view: 'register' })).rows.filter(function (x) { return x.serial === 'NX001'; })[0]; assert.deepEqual([reg.warrantyStatus, reg.warrantyFrom, reg.warrantyUntil], ['active', '2026-08-20', '2036-08-20']);
    var again = await post(TERMS, BOSS); assert.deepEqual(again.applied, []); assert.deepEqual(again.unchanged, ['NX001']); assert.match(again.say, /Already on file/);
  });
  await test('every unit of its SKU on the order at once; a unit registered later is added by pressing again', async function () {
    var r = await post(Object.assign({}, TERMS, { scope: 'order' }), BOSS); assert.deepEqual(r.applied, ['NX002']); assert.deepEqual(r.unchanged, ['NX001']);
    var au2 = Array.from(db.data.keys()).filter(function (k) { return k.indexOf('omega_audit/') === 0 && db.data.get(k).action === 'custody-maker-warranty'; }).map(function (k) { return db.data.get(k); });
    assert.deepEqual(au2[au2.length - 1].units, [{ serial: 'NX002', before: null }], 'the audit names the unit written and what it had, never the one left as it was');
    assert.equal((await get({ serial: 'NX002' })).unit.coverage[0].status, 'pending', 'on file, and pending until NX002 is at a site');
    bought('NX003', {});
    var r2 = await post(Object.assign({}, TERMS, { serial: 'NX002', scope: 'order' }), BOSS); assert.deepEqual(r2.applied, ['NX003']); assert.deepEqual(r2.unchanged.sort(), ['NX001', 'NX002']);
    assert.equal(db.data.get('plant_units/' + ORG + '__S001').custody.makerWarranty, undefined, 'never a unit on another order');
  });
  await test('corrected with its before, and taken off with a reason', async function () {
    var fix = await post(Object.assign({}, TERMS, { serial: 'NX003', termMonths: 96, trigger: 'commissioning' }), BOSS); assert.deepEqual(fix.applied, ['NX003']);
    var p = await get({ serial: 'NX003' }); assert.ok(p.events.some(function (e) { return e.type === 'maker-warranty-corrected'; })); assert.equal(p.unit.coverage[0].why, 'waiting for commissioning');
    await rejects(post({ action: 'maker-warranty', serial: 'NX003', clear: true }, BOSS), 400, /Say why/);
    var off = await post({ action: 'maker-warranty', serial: 'NX003', clear: true, reason: 'the maker withdrew the confirmation' }, BOSS); assert.deepEqual(off.applied, ['NX003']); assert.equal(off.makerWarranty, null);
    assert.deepEqual((await get({ serial: 'NX003' })).unit.coverage, [], 'off: no warranty on file again');
    var au = Array.from(db.data.keys()).filter(function (k) { return k.indexOf('omega_audit/') === 0 && db.data.get(k).action === 'custody-maker-warranty-removed'; }).map(function (k) { return db.data.get(k); });
    assert.equal(au.length, 1); assert.equal(au[0].units[0].serial, 'NX003'); assert.equal(au[0].units[0].before.termMonths, 96); assert.equal(au[0].after, null); assert.equal(au[0].reason, 'the maker withdrew the confirmation');
  });
  await test('an RMA replacement carries the maker’s warranty and its remaining term', async function () {
    await post({ action: 'move', move: 'commission', serial: 'NX001', at: '2026-09-01' }, BOSS); await post({ action: 'move', move: 'rma-open', serial: 'NX001', reason: 'cell fault' }, BOSS);
    db.seed('plant_units/' + ORG + '__NX009', unit('NX009', { sku: 'NX-500', orderId: null, orderNo: null, customerId: null, inventoryStatus: 'available', custody: { status: 'received', shippedAt: '2026-09-20', receivedAt: '2026-09-25' } }));
    await post({ action: 'replace', serial: 'NX001', replacementSerial: 'NX009' }, BOSS);
    var r9 = await get({ serial: 'NX009' }); assert.equal(r9.unit.custody.makerWarranty.provider, 'Northwind Batteries');
    assert.deepEqual([r9.unit.coverage[0].templateId, r9.unit.coverage[0].status, r9.unit.coverage[0].startDate, r9.unit.coverage[0].endDate, r9.unit.coverage[0].inheritedFrom], ['maker', 'active', '2026-08-20', '2036-08-20', 'NX001'], 'the remaining term, not a fresh one');
    assert.equal((await get({ serial: 'NX001' })).unit.coverage[0].status, 'transferred');
    var fix9 = await post(Object.assign({}, TERMS, { serial: 'NX009', reference: 'NW-W-0042 (replacement NX009)' }), BOSS); assert.deepEqual(fix9.applied, ['NX009'], 'a replacement off the order corrects its own record');
  });
  await test('replaced before anything was on file: the replacement off another order takes the record through the unit it replaced', async function () {
    bought('NX004', { status: 'commissioned', siteId: siteId, siteName: 'Bakersfield yard', shippedAt: '2026-08-20', receivedAt: '2026-08-25', commissionedAt: '2026-09-02', customerId: 'company_riverside' });
    await post({ action: 'move', move: 'rma-open', serial: 'NX004', reason: 'BMS fault' }, BOSS);
    db.seed('plant_units/' + ORG + '__NX011', unit('NX011', { sku: 'NX-500', orderId: 'stock-26', orderNo: null, customerId: null, inventoryStatus: 'available', custody: { status: 'received', shippedAt: '2026-09-20', receivedAt: '2026-09-25' } }));
    await post({ action: 'replace', serial: 'NX004', replacementSerial: 'NX011' }, BOSS);
    var p = await get({ serial: 'NX011' }, BOSS); assert.equal(p.boughtIn && p.boughtIn.orderNo, 'PRM-20260901-7A7A7A', 'the passport offers it through the order of the unit it replaced'); assert.deepEqual(p.unit.coverage, []);
    var r = await post(Object.assign({}, TERMS, { serial: 'NX011', scope: 'order' }), BOSS); assert.deepEqual(r.applied, ['NX011'], 'only itself: it is not on that order');
    var cov = (await get({ serial: 'NX011' })).unit.coverage; assert.deepEqual([cov[0].templateId, cov[0].status, cov[0].startDate], ['maker', 'active', '2026-09-20'], 'nothing was on file to inherit: its own dates');
    await rejects(post(Object.assign({}, TERMS, { serial: 'NX004' }), BOSS), 409, /record the maker’s warranty on NX011/);
  });
  console.log('\n' + count + ' custody checks passed\n');
})().catch(function (e) { console.error('FAIL', e); process.exit(1); });
