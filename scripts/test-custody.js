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
  });
  await test('apply stamps the dates and writes one event; commissioning implies installed', function () {
    var ap = C.apply(unit('X', { custody: { status: 'assigned', siteId: 's' } }), 'commission', { at: '2026-09-04', installer: 'Riverside Electric' }, 'pm', NOW, 'scan');
    assert.equal(ap.patch['custody.status'], 'commissioned'); assert.equal(ap.patch['custody.commissionedAt'], '2026-09-04'); assert.equal(ap.patch['custody.installedAt'], '2026-09-04'); assert.equal(ap.event.method, 'scan'); assert.equal(ap.event.from, 'assigned');
    assert.throws(function () { C.apply(unit('X', { custody: { status: 'assigned' } }), 'commission', { at: '12-04-2026' }, 'pm', NOW); }, /YYYY-MM-DD/);
    assert.equal(C.day('8/20/2026'), '2026-08-20');
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
    var r = await post({ action: 'site', name: 'Bakersfield yard', customerId: 'company_riverside', address: { line1: '1200 Depot Rd', city: 'Bakersfield', state: 'CA', zip: '93307' }, interconnection: { utility: 'PG&E', meterNo: '1002233', poi: 'POI-7 480V', serviceKw: 500 }, endCustomer: 'InCharge Energy' });
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
    var c = await cpost({ action: 'commissioned', serial: 'S002', at: '2026-09-05', installer: 'Riverside Electric' }); assert.equal(c.unit.status, 'commissioned'); assert.equal(c.unit.commissionedAt, '2026-09-05');
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
    var ev = await get({ serial: 'S009' }); assert.equal(ev.events[0].type, 'detail'); assert.match(ev.events[0].note, /reseller: Valley Power Partners/);
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
    var text = 'Serial No,Site,Street,City,State,Zip,End Customer,Position,Installer,Received,Commissioned\nS007,Tehachapi wind yard,4 Ridge Rd,Tehachapi,CA,93561,InCharge,Pad 1,Riverside Electric,8/20/2026,2026-09-04\nS008,Tehachapi wind yard,4 Ridge Rd,Tehachapi,CA,93561,InCharge,Pad 2,,8/20/2026,\nS001,Tehachapi wind yard,4 Ridge Rd,Tehachapi,CA,93561,,,,8/20/2026,\nNOPE,Tehachapi wind yard,4 Ridge Rd,Tehachapi,CA,93561,,,,8/20/2026,\n';
    var dry = await post({ action: 'import', text: text, customerId: 'company_riverside', allowNewSites: true }); assert.equal(dry.dryRun, true); assert.equal(dry.mapping['Serial No'], 'serial'); assert.equal(dry.mapping['Commissioned'], 'commissionDate');
    assert.equal(dry.plan.summary.willChange, 2); assert.equal(dry.plan.summary.errors, 2); assert.equal(dry.plan.summary.newSites, 1);
    assert.deepEqual(dry.plan.items[0].actions.map(function (a) { return a.action; }), ['receive', 'assign', 'commission']); assert.deepEqual(dry.plan.items[1].actions.map(function (a) { return a.action; }), ['receive', 'assign']);
    assert.match(dry.plan.items[2].problems[0], /replaced/); assert.match(dry.plan.items[3].problems[0], /not registered/);
    await rejects(post({ action: 'import', text: text, customerId: 'company_riverside' }), 409, /does not exist; add it first/).catch(function () {}); /* new sites need allowNewSites; the row error is in the plan, not thrown */
    var noNew = await post({ action: 'import', text: text, customerId: 'company_riverside', allowNewSites: false }); assert.match(noNew.plan.items[0].problems[0], /does not exist/);
    var done = await post({ action: 'import', text: text, customerId: 'company_riverside', allowNewSites: true, dryRun: false, fileName: 'incharge-sites.csv' });
    assert.equal(done.summary.created, 1); assert.equal(done.summary.updated, 2); assert.equal(done.errors.length, 2);
    var s7 = await get({ serial: 'S007' }); assert.equal(s7.unit.custody.status, 'commissioned'); assert.equal(s7.site.name, 'Tehachapi wind yard'); assert.equal(s7.site.customerId, 'company_riverside'); assert.equal(s7.unit.coverage[0].status, 'active'); assert.equal(s7.events.length, 3); assert.equal(s7.events[0].method, 'import');
    var s8 = await get({ serial: 'S008' }); assert.equal(s8.unit.custody.status, 'assigned'); assert.equal(s8.unit.custody.position, 'Pad 2');
    var again = await post({ action: 'import', text: text, customerId: 'company_riverside', allowNewSites: true, dryRun: false }); assert.equal(again.summary.updated, 0); assert.equal(again.summary.skipped, 2); assert.equal(again.summary.created, 0);
    var batches = Array.from(db.data.keys()).filter(function (k) { return k.indexOf(O + '/custody_imports/') === 0; }); assert.equal(batches.length, 2); assert.equal(db.data.get(batches[0]).fileName, 'incharge-sites.csv');
    await post({ action: 'mapping-save', mapping: { 'Serial No': 'serial', 'Site': 'siteName', 'Bogus': 'nope' } }); assert.deepEqual(db.data.get(O + '/custody_mappings/assignment').columnMap, { 'Serial No': 'serial', 'Site': 'siteName' });
    var d = await get({}); assert.equal(d.mapping['Serial No'], 'serial');
  });
  await test('a site page lists what is bound to it', async function () { var d = await get({ site: siteId }); assert.deepEqual(d.units.map(function (u) { return u.serial; }).sort(), ['S001', 'S006']); });
  console.log('\n' + count + ' custody checks passed\n');
})().catch(function (e) { console.error('FAIL', e); process.exit(1); });
