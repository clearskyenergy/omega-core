#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-freight.js — an order's freight plan: the master list, the
   lanes a carrier prices, the quotes the office records, and accepting one
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   api/_lib/freight.js and api/_lib/shipping-fields.js on their own (regions,
   stop order, estimates, the two sheets), then the freight actions on
   api/logic-logistics.js over the in-memory Firestore double: who may, the
   ship-from, quotes that are only ever appended to, and accept planning
   EXACTLY the legs the ledger's own plan action would. Then the catalog's
   shipping fields and the public projection that must never carry them.
   No network: the geocoder is stood in for. Every site, street, person and
   company here is fictional.
     node scripts/test-freight.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
var FD = require('./_lib/firestore-double'), DB = FD.DB, mock = FD.mock;
var db;
var A = { db: function () { return db; }, safeOrg: function (v) { return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v || '') ? v : ''; }, httpError: function (s, m) { var e = new Error(m); e.status = s; return e; },
  authenticate: async function (r) { return r.caller; }, handler: function (f) { return f; }, canActInOrg: async function (c, o) { return c.orgId === o; }, FieldValue: function () { return { serverTimestamp: function () { return 'TS'; } }; } };
mock('../api/_lib/admin', A);
mock('../api/_lib/logic-workflow', { processOrder: async function () { return { ok: true }; } });
var G = require('../api/_lib/geocode'), GEO = [];
G.geocode = function (addr) { GEO.push(addr); return Promise.resolve(/nowhere/i.test(addr) ? null : { lat: 39.9612, lng: -82.9988, matched: String(addr).toUpperCase(), source: 'census' }); };
var F = require('../api/_lib/freight'), SF = require('../api/_lib/shipping-fields'), C = require('../api/_lib/custody'), L = require('../api/_lib/order-lifecycle');
var LC = require('../api/_lib/logic-catalog'), Portal = require('../api/_lib/portal'), logistics = require('../api/logic-logistics');

var ORG = 'cleancell.us', O = 'omega_orgs/' + ORG, NOW = '2026-09-24T15:00:00.000Z';
var ADMIN = { uid: 'adm', email: 'ops@cleancell.us', orgId: ORG, claims: { email_verified: true } };
var MEMBER = { uid: 'mem', email: 'bench@cleancell.us', orgId: ORG, claims: { email_verified: true } };
var CUSTOMER = { uid: 'cust', email: 'buyer@examplegrid.example', orgId: 'examplegrid.example', claims: { email_verified: true } };
var OTHER = { uid: 'oth', email: 'admin@otheroem.example', orgId: 'otheroem.example', claims: { email_verified: true } };
var res = { headers: {}, setHeader: function (k, v) { this.headers[k] = v; } };
function get(q, caller) { return logistics({ method: 'GET', query: Object.assign({ org: ORG }, q || {}), caller: caller || ADMIN }, res); }
function post(body, caller) { return logistics({ method: 'POST', body: Object.assign({ org: ORG }, body), caller: caller || ADMIN }, res); }
async function rejects(p, status, re) { try { await p; } catch (e) { assert.equal(e.status, status, e.message); if (re) assert.match(e.message, re); return e; } throw new Error('expected a ' + status); }
var count = 0; async function test(name, fn) { await fn(); count++; console.log('PASS ' + name); }
function today() { return new Date().toISOString().slice(0, 10); }
function plusDays(n) { return new Date(Date.now() + n * 86400000).toISOString().slice(0, 10); }

/* ── fictional data: 16 sites (8 × 4 units, 8 × 3), 7 regions ─────────── */
var SITES = [
  ['s01', 'Quarry Lantern Depot', '14 Quarry Lantern Rd', 'Fairview', 'NJ', '07022', 40.8126, -73.9993, 4, 'Dana Reyes', '555-0101', '00417'],
  ['s02', 'Birch Hollow Yard', '220 Birch Hollow Ln', 'Albany', 'NY', '12207', 42.6526, -73.7562, 4, '', '', '=cmd'],
  ['s03', 'Tidewater Pad', '88 Tidewater Pkwy', 'Savannah', 'GA', '31401', 32.0809, -81.0912, 4, 'Lee Okafor', '555-0103', ''],
  ['s04', 'Magnolia Spur Lot', '410 Magnolia Spur', 'Charlotte', 'NC', '28202', 35.2271, -80.8431, 4, '', '', ''],
  ['s05', 'Cypress Bend Pad', '9 Cypress Bend Dr', 'Tampa', 'FL', '33602', null, null, 4, '', '', ''],
  ['s06', 'Dune Grass Annex', '301 Dune Grass Ave', 'Milwaukee', 'WI', '53202', 43.0389, -87.9065, 4, 'Sam Whitfield', '555-0106', ''],
  ['s07', 'Foundry Mill Bay', '77 Foundry Mill Rd', 'Toledo', 'OH', '43604', 41.6528, -83.5379, 4, '', '', ''],
  ['s08', 'Prairie Lark Yard', '88 Prairie Lark Ln', 'Joliet', 'IL', '60431', 41.525, -88.0817, 4, '', '', ''],
  ['s09', 'Mesquite Bend', '2710 Mesquite Bend Rd', 'Round Rock', 'TX', '78664', 30.5083, -97.6789, 3, '', '', ''],
  ['s10', 'Cottonwood Trace Pad', '512 Cottonwood Trace', 'Shreveport', 'LA', '71101', 32.5252, -93.7502, 3, '', '', ''],
  ['s11', 'Sandplum Site', '64 Sandplum Way', 'Tulsa', 'OK', '74103', 36.154, -95.9928, 3, '', '', ''],
  ['s12', 'Aspen Hollow', '1450 Aspen Hollow Dr', 'Boulder', 'CO', '80301', 40.015, -105.2705, 3, '', '', ''],
  ['s13', 'Ocotillo Run Flats', '3100 Ocotillo Run', 'Tucson', 'AZ', '85701', 32.2226, -110.9747, 3, '', '', ''],
  ['s14', 'Harbor Finch Yard', '915 Harbor Finch Way', 'Tacoma', 'WA', '98402', 47.2529, -122.4443, 3, '', '', ''],
  ['s15', 'Almond Row Pad', '42 Almond Row', 'Fresno', 'CA', '93721', 36.7378, -119.7871, 3, '', '', ''],
  ['s16', 'Bluestem Court Lot', '700 Bluestem Ct', 'Omaha', 'NE', '68102', 41.2565, -95.9345, 3, '', '', '']
];
var PRODUCTS = [
  { sku: 'CC-C215', name: '215 kWh outdoor cabinet', kind: 'product', widthFt: 7.2, depthFt: 4.1, heightFt: 7.5, weightLb: 5500, freightClass: '85', stackable: false, handlingNote: 'Class 9 lithium battery — see SDS',
    listPrice: 64000, priceMode: 'list', supplier: 'Hidden Vendor Inc', capexPerKwh: 180 },
  { sku: 'CC-C418', name: '418 kWh outdoor cabinet', kind: 'product', widthFt: 9, depthFt: 5 }
];
var ORIGIN = { name: 'Plant dock 2', address: { line1: '1 Example Works Rd', line2: '', city: 'Columbus', state: 'OH', zip: '43215', country: 'US' }, contact: { name: 'Dock lead', phone: '555-0199' }, hours: '7–3 weekdays', notes: '', lat: 39.9612, lng: -82.9988 };
function siteDoc(s) { return { orgId: ORG, name: s[1], customerId: null, address: { line1: s[2], line2: '', city: s[3], state: s[4], zip: s[5], country: 'US' }, lat: s[6], lng: s[7], contact: { name: s[9], phone: s[10], email: s[9] ? 'receiving@examplegrid.example' : '' }, ref: s[11], status: 'active' }; }
function serialOf(i) { return 'CCX-26-' + ('000' + i).slice(-4); }
/* 58 shipping units: 56 spread over the 16 sites, 2 with no site */
function buildUnits(orderId) {
  var out = [], i = 0;
  SITES.forEach(function (s) { for (var k = 0; k < s[8]; k++) { i++; out.push(unitDoc(i, orderId, s)); } });
  out.push(unitDoc(57, orderId, null)); out.push(unitDoc(58, orderId, null));
  return out;
}
function unitDoc(i, orderId, s) {
  var u = { orgId: ORG, serial: serialOf(i), rootSerial: serialOf(i), sku: i > 40 ? 'CC-C418' : 'CC-C215', unitType: 'cabinet', shipUnit: true, orderId: orderId, orderNo: 'CC-26-7001',
    at: i % 2 === 0 ? 'ready' : 'rack', test: i % 2 === 0 ? { result: 'pass' } : null, hold: i === 3 ? 'Awaiting BMS firmware' : null, arrivedAt: '2026-09-20T10:00:00Z', createdAt: '2026-09-01T00:00:00Z' };
  if (s) u.custody = { status: '', plannedSiteId: s[0], plannedSiteName: s[1], plannedBy: 'office', plannedAt: '2026-09-10T00:00:00Z' };
  return u;
}
function sitesMap() { var m = {}; SITES.forEach(function (s) { m[s[0]] = Object.assign({ id: s[0] }, siteDoc(s)); }); return m; }
function orderDoc(extra) {
  return Object.assign({ orgId: ORG, orderNo: 'CC-26-7001', status: 'in_fulfilment', createdAt: '2026-09-02T10:00:00Z', customerId: null, customer: { company: 'Example Grid Co.', email: 'buyer@examplegrid.example' },
    purchaseOrder: { number: 'EGC-PO-3300' }, items: [{ sku: 'CC-C215', qty: 40 }, { sku: 'CC-C418', qty: 18 }], worksOrderId: 'wo1',
    delivery: { destinations: [{ id: 'd1', address: { name: 'Example Grid Co. sites', line1: '500 Example Ave', city: 'Denver', state: 'CO', zip: '80202', country: 'US' }, items: [{ sku: 'CC-C215', qty: 40 }, { sku: 'CC-C418', qty: 18 }] }], legs: [], revision: 0 } }, extra || {});
}
function libPlan(extra) { return F.plan(Object.assign({ order: Object.assign({ id: 'oF' }, orderDoc()), units: buildUnits('oF'), sites: sitesMap(), products: PRODUCTS, origin: ORIGIN, quotes: [], promised: '2026-11-15', now: NOW }, extra || {})); }

/* every write in this test is checked for undefined before the double's
   JSON clone would hide it */
function noUndef(v, at) { if (v === undefined) throw new Error('undefined written at ' + at); if (v && typeof v === 'object') Object.keys(v).forEach(function (k) { noUndef(v[k], at + '.' + k); }); }
function seed() {
  db = new DB(); GEO.length = 0;
  var rt = db.runTransaction.bind(db);
  db.runTransaction = function (fn) { return rt(function (tx) { ['create', 'set', 'update'].forEach(function (m) { var f = tx[m]; tx[m] = function (r, v, o) { noUndef(v, r.path); return f(r, v, o); }; }); return fn(tx); }); };
  db.seed(O, { name: 'Clean Cell', status: 'active' }); db.seed(O + '/billing/current', { addons: ['omega-logic'], status: 'active' });
  db.seed(O + '/fulfillment/config', { enabled: true, terms: { depositPct: 30 } });
  db.seed(O + '/members/adm', { email: ADMIN.email, role: 'admin', status: 'active' }); db.seed(O + '/members/mem', { email: MEMBER.email, role: 'member', status: 'active' });
  db.seed('omega_orgs/otheroem.example', { name: 'Other OEM', status: 'active' }); db.seed('omega_orgs/otheroem.example/billing/current', { addons: ['omega-logic'] }); db.seed('omega_orgs/otheroem.example/members/oth', { role: 'admin', status: 'active' });
  db.seed(O + '/storefront/config', { products: PRODUCTS });
  SITES.forEach(function (s) { db.seed(O + '/sites/' + s[0], siteDoc(s)); });
  db.seed('orders/oF', orderDoc());
  db.seed('plant_works_orders/wo1', { orgId: ORG, orderId: 'oF', dueDate: '2026-11-15' });
  buildUnits('oF').forEach(function (u) { db.seed('plant_units/' + ORG + '__' + u.serial, u); });
  db.seed('plant_units/' + ORG + '__CCX-26-MOD1', { orgId: ORG, serial: 'CCX-26-MOD1', shipUnit: false, orderId: 'oF', sku: 'CC-MOD', rootSerial: serialOf(1) });
  db.seed('orders/foreign', Object.assign(orderDoc(), { orgId: 'otheroem.example' }));
}
function quoteDocs() { return Array.from(db.data.keys()).filter(function (k) { return k.indexOf(O + '/freight_quotes/') === 0; }).map(function (k) { return Object.assign({ id: k.split('/').pop() }, db.data.get(k)); }); }
function audits(action) { return Array.from(db.data.keys()).filter(function (k) { return k.indexOf('omega_audit/') === 0 && db.data.get(k).action === action; }).map(function (k) { return db.data.get(k); }); }
function snapshot() { var o = {}; db.data.forEach(function (v, k) { if (k.indexOf('/geocode_usage/') < 0) o[k] = JSON.stringify(v); }); return o; }
function parseCsv(t) {
  t = t.replace(/^\ufeff/, ''); var rows = [], row = [], cell = '', q = false;
  for (var i = 0; i < t.length; i++) { var ch = t[i];
    if (q) { if (ch === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
    else if (ch === '"') q = true; else if (ch === ',') { row.push(cell); cell = ''; } else if (ch === '\r' && t[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++; } else cell += ch; }
  row.push(cell); rows.push(row); return rows;
}
function laneOf(pl, key) { return pl.lanes.filter(function (l) { return l.key === key; })[0]; }
function quoteBody(lane, extra) { return Object.assign({ action: 'freight-quote', orderId: 'oF', laneKey: lane.key, carrier: 'Example Freight Lines', amount: '18,450.75', transitDays: 4, validUntil: plusDays(30), reference: 'EFL-Q-5521', note: 'Liftgate not needed', planKey: lane.planKey }, extra || {}); }

(async function () {
  console.log('\nthe library');
  await test('regions: every US_STATES key is in exactly one lane; a foreign or blank address is CHECK', function () {
    Object.keys(C.US_STATES).forEach(function (st) { var hits = F.REGIONS.filter(function (r) { return r.states.indexOf(st) >= 0; }); assert.equal(hits.length, 1, st); assert.equal(F.regionOf(st, 'US'), hits[0].key); });
    var all = []; F.REGIONS.forEach(function (r) { all = all.concat(r.states); }); assert.equal(all.length, Object.keys(C.US_STATES).length, 'no state outside US_STATES');
    assert.equal(F.regionOf('Texas', ''), 'SOUTHCENTRAL'); assert.equal(F.regionOf('ny', 'USA'), 'NORTHEAST'); assert.equal(F.regionOf('ON', 'CA'), 'CHECK'); assert.equal(F.regionOf('TX', 'Mexico'), 'CHECK'); assert.equal(F.regionOf('', 'US'), 'CHECK'); assert.equal(F.regionOf(null, null), 'CHECK'); assert.equal(F.regionOf('PR', 'Puerto Rico'), 'PUERTORICO');
    assert.deepEqual(F.REGIONS.map(function (r) { return r.key; }), ['NORTHEAST', 'MIDATLANTIC', 'SOUTHEAST', 'GREATLAKES', 'CENTRALPLAINS', 'SOUTHCENTRAL', 'MOUNTAIN', 'PACIFIC', 'ALASKA', 'HAWAII', 'PUERTORICO', 'CHECK']);
    assert.throws(function () { F.laneKeyOf('XX'); }, /Unknown lane/); assert.equal(F.laneKeyOf('GREATLAKES'), 'GREATLAKES');
  });
  await test('a lane key is never a state\'s two letters: it is in every load id a carrier and the customer read', function () {
    F.REGIONS.forEach(function (r) {
      assert(!Object.prototype.hasOwnProperty.call(C.US_STATES, r.key), r.key + ' reads as a state');
      assert(/^[A-Z]{5,13}$/.test(r.key), r.key);
      assert(F.LOAD_ID.test(F.nextLoadId({ orderNo: new Array(61).join('9') }, r.key, [])), r.key + ' fits a load id with the longest order number');
    });
    /* the keys a Texas, Virginia or Arizona load used to carry, read as South Carolina, Massachusetts or Montana */
    ['NE', 'MA', 'SC', 'MT', 'GL', 'ZZ'].forEach(function (k) { assert.throws(function () { F.laneKeyOf(k); }, /Unknown lane/, k); });
    assert.equal(F.regionOf('TX', 'US'), 'SOUTHCENTRAL'); assert.equal(F.regionOf('VA', 'US'), 'MIDATLANTIC'); assert.equal(F.regionOf('AZ', 'US'), 'MOUNTAIN');
    assert.equal(F.nextLoadId({ orderNo: 'CC-26-4431' }, F.regionOf('TX', 'US'), []), 'FRT-CC-26-4431-SOUTHCENTRAL-1');
  });
  await test('56 units over 16 fictional sites and 2 with none: lanes in region order, every unit once, both unsited listed, sums add up', function () {
    var pl = libPlan();
    assert.equal(pl.summary.units, 58); assert.equal(pl.summary.sites, 16); assert.equal(pl.summary.unassigned, 2); assert.equal(pl.summary.open, 56); assert.equal(pl.summary.blocked, 0);
    assert.deepEqual(pl.lanes.map(function (l) { return l.key; }), ['NORTHEAST', 'SOUTHEAST', 'GREATLAKES', 'CENTRALPLAINS', 'SOUTHCENTRAL', 'MOUNTAIN', 'PACIFIC']);
    assert(pl.lanes.length >= 5);
    assert.equal(pl.rows.length, 58); assert.equal(new Set(pl.rows.map(function (r) { return r.serial; })).size, 58);
    assert.deepEqual(pl.unassigned.map(function (u) { return u.serial; }), [serialOf(57), serialOf(58)]);
    assert.deepEqual(pl.rows.slice(-2).map(function (r) { return r.freight; }), ['No site yet', 'No site yet'], 'unassigned rows come last');
    var byLane = 0, stops = 0; pl.lanes.forEach(function (l) { byLane += l.units; stops += l.stops.length; var s = 0; l.stops.forEach(function (st) { s += st.units; }); assert.equal(s, l.units); });
    assert.equal(byLane, 56); assert.equal(stops, 16);
    assert.equal(laneOf(pl, 'GREATLAKES').units, 12); assert.equal(laneOf(pl, 'PACIFIC').units, 6);
    /* the promised plant date from the works order when not everything is ready */
    var s01 = laneOf(pl, 'NORTHEAST').stops.filter(function (s) { return s.siteId === 's01'; })[0];
    assert.equal(s01.ready.ready, 2); assert.equal(s01.ready.of, 4); assert.equal(s01.ready.date, '2026-11-15'); assert.match(s01.ready.label, /2 of 4 ready · plant date 2026-11-15/);
    assert.deepEqual(s01.contact, { name: 'Dana Reyes', phone: '555-0101' }, 'contact without the email');
    assert.equal(s01.destination.how, 'only');
    assert.equal(pl.order.poNumber, 'EGC-PO-3300'); assert.equal(pl.order.legacy, false); assert.equal(pl.originPinned, true);
    /* rows sorted by lane, then stop, then serial */
    var ne = pl.rows.filter(function (r) { return r.lane === 'Northeast'; }); assert.equal(ne.length, 8); assert.equal(pl.rows[0].lane, 'Northeast'); assert.equal(pl.rows[0].stop, 1);
    /* a stop whose site is unpinned is appended: the SE lane is "mixed" */
    var se = laneOf(pl, 'SOUTHEAST'); assert.equal(se.ordering, 'mixed'); assert.equal(se.stops[se.stops.length - 1].siteId, 's05'); assert.equal(se.stops[se.stops.length - 1].milesFromPrev, null); assert.equal(se.miles, null);
    assert.equal(laneOf(pl, 'GREATLAKES').ordering, 'nearest'); assert(laneOf(pl, 'GREATLAKES').miles > 0);
  });
  await test('nearest-neighbour order and straight-line miles, checked by hand; a tie goes to the name', function () {
    /* on the equator one degree of longitude is 2π·3958.8/360 = 69.0934 mi */
    var r = F.orderStops({ lat: 0, lng: 0 }, [{ siteId: 'a', name: 'A', lat: 0, lng: 3, address: { state: 'TX' } }, { siteId: 'b', name: 'B', lat: 0, lng: 1, address: { state: 'TX' } }, { siteId: 'c', name: 'C', lat: 0, lng: 2, address: { state: 'TX' } }]);
    assert.deepEqual(r.stops.map(function (s) { return s.siteId; }), ['b', 'c', 'a']); assert.deepEqual(r.stops.map(function (s) { return s.milesFromPrev; }), [69.1, 69.1, 69.1]); assert.deepEqual(r.stops.map(function (s) { return s.seq; }), [1, 2, 3]);
    assert.equal(r.miles, 207.3); assert.equal(r.ordering, 'nearest');
    assert.equal(F.haversineMiles({ lat: 0, lng: 0 }, { lat: 0, lng: 1 }), 69.1); assert.equal(F.haversineMiles({ lat: 0, lng: 0 }, { lat: null, lng: 1 }), null);
    /* a real-world-shaped check: Columbus → Toledo is about 116 straight-line miles */
    var m = F.haversineMiles({ lat: 39.9612, lng: -82.9988 }, { lat: 41.6528, lng: -83.5379 }); assert(m > 110 && m < 122, m);
    var tie = F.orderStops({ lat: 0, lng: 0 }, [{ siteId: 'z', name: 'Zeta', lat: 0, lng: 1 }, { siteId: 'q', name: 'Alpha', lat: 0, lng: -1 }]);
    assert.deepEqual(tie.stops.map(function (s) { return s.name; }), ['Alpha', 'Zeta']); assert.equal(tie.stops[1].milesFromPrev, 138.2);
    /* unpinned stops are appended in state order */
    var mix = F.orderStops({ lat: 0, lng: 0 }, [{ siteId: 'd', name: 'D', address: { state: 'CA' } }, { siteId: 'b', name: 'B', lat: 0, lng: 1 }, { siteId: 'e', name: 'E', address: { state: 'AZ' } }]);
    assert.deepEqual(mix.stops.map(function (s) { return s.siteId; }), ['b', 'e', 'd']); assert.equal(mix.ordering, 'mixed'); assert.equal(mix.miles, null); assert.equal(mix.stops[1].milesFromPrev, null);
    /* no origin pin: state order, no miles */
    var st = F.orderStops(null, [{ siteId: 'x', name: 'X', lat: 1, lng: 1, address: { state: 'WA', city: 'Tacoma' } }, { siteId: 'y', name: 'Y', lat: 2, lng: 2, address: { state: 'CA', city: 'Fresno' } }]);
    assert.deepEqual(st.stops.map(function (s) { return s.siteId; }), ['y', 'x']); assert.equal(st.ordering, 'state'); assert.equal(st.miles, null); assert.deepEqual(st.stops.map(function (s) { return s.milesFromPrev; }), [null, null]);
    var noOrigin = libPlan({ origin: null }); assert.equal(noOrigin.originSet, false); noOrigin.lanes.forEach(function (l) { assert.equal(l.ordering, 'state'); assert.equal(l.miles, null); });
  });
  await test('estimates add up from the catalog; a missing weight is named, nothing on file says so, nothing is guessed', function () {
    var by = {}; PRODUCTS.forEach(function (p) { by[p.sku] = p; });
    var e = F.estimate([{ sku: 'CC-C215' }, { sku: 'CC-C215' }, { sku: 'CC-C418' }], by);
    assert.deepEqual(e.weightLb, { lb: 11000, complete: false, missing: ['CC-C418'], counted: 2 });
    assert.equal(e.floorSqFt.sqft, Math.round((7.2 * 4.1 * 2 + 9 * 5) * 100) / 100); assert.equal(e.floorSqFt.complete, true);
    assert.equal(e.maxHeightFt, 7.5); assert.equal(e.heightComplete, false); assert.deepEqual(e.heightMissing, ['CC-C418']);
    /* a SKU with no stacking answer or no class is NAMED, never folded into the others' value or a "mixed" */
    assert.equal(e.stackable, 'no (not on file: CC-C418)'); assert.deepEqual(e.freightClass, ['85']); assert.equal(e.freightClassComplete, false); assert.deepEqual(e.freightClassMissing, ['CC-C418']);
    assert.deepEqual(e.handling, ['Class 9 lithium battery — see SDS', 'Do not stack']);
    var by2 = Object.assign({}, by, { 'CC-S1': { sku: 'CC-S1', stackable: true, freightClass: '100' } });
    var mix = F.estimate([{ sku: 'CC-C215' }, { sku: 'CC-S1' }], by2); assert.equal(mix.stackable, 'yes: CC-S1; no: CC-C215'); assert.deepEqual(mix.freightClass, ['85', '100']); assert.equal(mix.freightClassComplete, true);
    assert.equal(F.estimate([{ sku: 'CC-C215' }, { sku: 'CC-S1' }, { sku: 'CC-C418' }], by2).stackable, 'yes: CC-S1; no: CC-C215 (not on file: CC-C418)');
    assert.equal(F.estimate([{ sku: 'CC-S1' }, { sku: 'CC-S1' }], by2).stackable, 'yes');
    var full = F.estimate([{ sku: 'CC-C215' }, { sku: 'CC-C215' }], by); assert.deepEqual(full.weightLb, { lb: 11000, complete: true, missing: [], counted: 2 }); assert.equal(full.stackable, 'no');
    var none = F.estimate([{ sku: 'CC-C418' }], by); assert.equal(none.weightLb.counted, 0); assert.equal(none.stackable, SF.NOT_ON_FILE); assert.equal(F.estCell(none.weightLb.lb, none.weightLb.complete, none.weightLb.missing, none.weightLb.counted), 'not on file');
    assert.equal(F.estCell(11000, false, ['CC-C418'], 2), '11000 (not on file: CC-C418)'); assert.equal(F.estCell(11000, true, [], 2), 11000);
    var unknown = F.estimate([{ sku: 'NOPE' }], by); assert.deepEqual(unknown.weightLb.missing, ['NOPE']);
    assert.deepEqual(SF.describe(PRODUCTS[1]), { weight: 'not on file', dims: '9 × 5 × not on file ft', freightClass: 'not on file', stackable: 'not on file', handling: 'not on file' });
    assert.equal(SF.describe(PRODUCTS[0]).weight, '5,500 lb'); assert.equal(SF.describe(PRODUCTS[0]).stackable, 'no');
  });
  await test('freightState: open, unassigned, booked, shipped and blocked', function () {
    var base = { serial: 'U1', shipUnit: true, custody: { plannedSiteId: 's1' } }, idx = F.legIndex([{ id: 'L1', status: 'planned', serials: ['U3'] }, { id: 'L2', status: 'in_transit', serials: ['U4'] }]);
    assert.equal(F.freightState(base, idx), 'open');
    assert.equal(F.freightState({ serial: 'U2', shipUnit: true }, idx), 'unassigned');
    assert.equal(F.freightState(Object.assign({}, base, { serial: 'U3' }), idx), 'booked');
    assert.equal(F.freightState(Object.assign({}, base, { serial: 'U9', logisticsLegId: 'ELSEWHERE' }), idx), 'booked', 'a load the order does not list is still a load');
    assert.equal(F.freightState(Object.assign({}, base, { serial: 'U4' }), idx), 'shipped');
    assert.equal(F.freightState({ serial: 'U5', shipUnit: true, custody: { status: 'delivered', siteId: 's1' } }, idx), 'shipped');
    assert.equal(F.freightState({ serial: 'U6', shipUnit: true, custody: { state: 'scrapped', plannedSiteId: 's1' } }, idx), 'blocked');
    assert.equal(F.freightState({ serial: 'U7', shipUnit: true, custody: { state: 'lost' } }, idx), 'blocked');
    assert.deepEqual(F.siteOfUnit({ custody: { siteId: 'a', siteName: 'A', plannedSiteId: 'b' } }), { siteId: 'a', siteName: 'A', how: 'assigned' });
    assert.deepEqual(F.buildState({ at: 'ready', test: { result: 'pass' }, arrivedAt: '2026-09-20T10:00:00Z' }), { ready: true, label: 'Ready', since: '2026-09-20' });
    assert.equal(F.buildState({ at: 'ready', hold: 'Awaiting BMS firmware' }).label, 'On hold · Awaiting BMS firmware');
    assert.equal(F.buildState({ at: 'ready', test: { result: 'fail' } }).label, 'Test failed');
    assert.equal(F.buildState({ at: 'rack' }).label, 'Building · rack'); assert.equal(F.buildState({}).label, 'Not started');
  });
  await test('ready is the pickup gate\'s ready (logic-policy.ready): no passing test is "Awaiting test", and a component not ready holds its unit', function () {
    var P = require('../api/_lib/logic-policy');
    [{ at: 'ready', test: { result: 'pass' } }, { at: 'ready' }, { at: 'ready', test: null }, { at: 'ready', test: {} }, { at: 'ready', test: { result: 'fail' } }, { at: 'ready', test: { result: 'pass' }, hold: 'x' },
      { at: 'ready', test: { result: 'pass' }, ncr: 'NCR-1' }, { at: 'eol', test: { result: 'pass' } }, {}].forEach(function (u) {
      assert.equal(F.buildState(u).ready, !!P.ready(u), JSON.stringify(u)); assert.equal(F.unitReady(u), !!P.ready(u), JSON.stringify(u));
    });
    assert.deepEqual(F.buildState({ at: 'ready', arrivedAt: '2026-09-20T10:00:00Z' }), { ready: false, label: 'Awaiting test', since: null });
    var root = { serial: 'U1', shipUnit: true, at: 'ready', test: { result: 'pass' } };
    var parts = [{ serial: 'M-2', rootSerial: 'U1', at: 'ready', test: { result: 'pass' } }, { serial: 'M-1', rootSerial: 'U1', at: 'ready', test: { result: 'pass' }, hold: 'Cell swap' }];
    assert.deepEqual(F.buildState(root, parts), { ready: false, label: 'Component not ready · M-1 on hold', since: null });
    assert.equal(F.buildState(root, [parts[0]]).ready, true);
    assert.equal(F.buildState(root, [{ serial: 'M-3', rootSerial: 'U1', at: 'bms' }]).label, 'Component not ready · M-3 at bms');
    /* through the plan: a stop whose units are all Ready and passed says "Ready now" with today's date — the date the
       quote request promises a carrier; one untested unit, or one component on hold, and it does not */
    var o = Object.assign({ id: 'oF' }, orderDoc()), four = buildUnits('oF').slice(0, 4).map(function (u) { return Object.assign({}, u, { at: 'ready', test: { result: 'pass' }, hold: null }); });
    var stopOf = function (pl) { return laneOf(pl, 'NORTHEAST').stops.filter(function (s) { return s.siteId === 's01'; })[0]; };
    var all = stopOf(F.plan({ order: o, units: four, sites: sitesMap(), products: PRODUCTS, origin: ORIGIN, quotes: [], promised: '2026-11-15', now: NOW }));
    assert.deepEqual([all.ready.label, all.ready.date], ['Ready now', '2026-09-24']);
    var untested = four.map(function (u, i) { return i === 2 ? Object.assign({}, u, { test: null }) : u; });
    var pu = F.plan({ order: o, units: untested, sites: sitesMap(), products: PRODUCTS, origin: ORIGIN, quotes: [], promised: '2026-11-15', now: NOW });
    assert.deepEqual([stopOf(pu).ready.label, stopOf(pu).ready.date], ['3 of 4 ready · plant date 2026-11-15', '2026-11-15']); assert.equal(pu.summary.ready, 3);
    assert.equal(pu.rows.filter(function (r) { return r.serial === serialOf(3); })[0].build, 'Awaiting test');
    var comp = [{ orgId: ORG, serial: 'CCX-26-MOD9', rootSerial: serialOf(2), shipUnit: false, orderId: 'oF', at: 'ready', ncr: 'NCR-26-4' }];
    var pc = F.plan({ order: o, units: four, components: comp, sites: sitesMap(), products: PRODUCTS, origin: ORIGIN, quotes: [], promised: '2026-11-15', now: NOW });
    assert.equal(stopOf(pc).ready.label, '3 of 4 ready · plant date 2026-11-15'); assert.equal(pc.rows.filter(function (r) { return r.serial === serialOf(2); })[0].build, 'Component not ready · CCX-26-MOD9 NCR NCR-26-4');
    assert.equal(pc.rows.length, 4, 'a component is never a row of its own');
  });
  await test('a unit with no site that is already on a load or shipped is not "No site yet": it is listed apart, and the tile counts the list', function () {
    var o = orderDoc(); o.delivery.legs = [{ id: 'L1', status: 'delivered', serials: ['S1', 'S2'] }, { id: 'L2', status: 'planned', serials: ['S3'] }];
    var mk = function (sn, extra) { return Object.assign({ orgId: ORG, serial: sn, sku: 'CC-C215', shipUnit: true, orderId: 'oF', at: 'ready', test: { result: 'pass' } }, extra || {}); };
    var pl = F.plan({ order: Object.assign({ id: 'oF' }, o), units: [mk('S1', { custody: { status: 'delivered' } }), mk('S2', { custody: { status: 'received' } }), mk('S3', { logisticsLegId: 'L2' }), mk('S4')], sites: {}, products: PRODUCTS, origin: ORIGIN, quotes: [], now: NOW });
    assert.equal(pl.summary.unassigned, 1); assert.deepEqual(pl.unassigned.map(function (u) { return u.serial; }), ['S4']); assert.equal(pl.summary.unassigned, pl.unassigned.length);
    assert.deepEqual(pl.offLane.map(function (u) { return [u.serial, u.state, u.load, u.why]; }), [['S1', 'shipped', 'L1', 'Shipped'], ['S2', 'shipped', 'L1', 'Shipped'], ['S3', 'booked', 'L2', 'Booked']]);
    assert.equal(pl.summary.shipped, 2); assert.equal(pl.summary.booked, 1); assert.equal(pl.lanes.length, 0);
    assert.deepEqual(pl.rows.map(function (r) { return r.serial; }), ['S1', 'S2', 'S3', 'S4'], 'on a load first, then no site yet'); assert.equal(pl.rows[3].freight, 'No site yet');
    assert.deepEqual(libPlan().offLane, [], 'the sample order has none');
  });
  await test('destinationFor: by address, the only one, or none with the stop named', function () {
    var dA = { id: 'dA', address: { name: 'A', line1: '301 Dune Grass Avenue', city: 'Milwaukee', state: 'Wisconsin', zip: '53202' } }, dB = { id: 'dB', address: { name: 'B', line1: '1 Other St', city: 'Reno', state: 'NV', zip: '89501' } };
    var site = { name: 'Dune Grass Annex', address: { line1: '301 Dune Grass Ave', city: 'Milwaukee', state: 'WI', zip: '53202' } };
    assert.deepEqual(F.destinationFor([dB, dA], site), { id: 'dA', how: 'address', say: '' });
    var only = F.destinationFor([dB], site); assert.equal(only.id, 'dB'); assert.equal(only.how, 'only');
    var none = F.destinationFor([dB, Object.assign({}, dB, { id: 'dC' })], site); assert.equal(none.id, null); assert.equal(none.how, 'none'); assert.match(none.say, /Dune Grass Annex/);
    assert.equal(F.destinationFor(null, site).how, 'none');
  });
  await test('the two sheets: headers are the column labels, BOM and CRLF, a leading-zero ZIP kept, a formula defused, nothing a carrier should not see', function () {
    var pl = libPlan(), ex = F.exportsOf(pl, NOW);
    assert.equal(ex.master.filename, 'freight-master-CC-26-7001-2026-09-24.csv'); assert.equal(ex.quote.filename, 'freight-quote-request-CC-26-7001-2026-09-24.csv');
    [ex.master.csv, ex.quote.csv].forEach(function (t) { assert.equal(t.charAt(0), '\ufeff'); assert(t.indexOf('\r\n') > 0); assert(!/[^\r]\n/.test(t), 'every line ends CRLF'); });
    var m = parseCsv(ex.master.csv), q = parseCsv(ex.quote.csv);
    assert.deepEqual(m[0], F.MASTER_COLUMNS.map(function (c) { return c.label; })); assert.deepEqual(q[0], F.QUOTE_COLUMNS.map(function (c) { return c.label; }));
    assert.deepEqual(m[0].slice(0, 6), ['Serial', 'SKU', 'Product', 'Build status', 'Ready since', 'Freight status']);
    assert.equal(m.length - 1, 58); assert.equal(q.length - 1, 16, 'one row per stop with open units');
    var zipCol = m[0].indexOf('ZIP'), refCol = m[0].indexOf('Site ref'), lngCol = m[0].indexOf('Longitude');
    var fairview = m.filter(function (r) { return r[m[0].indexOf('City')] === 'Fairview'; })[0]; assert.equal(fairview[zipCol], '="07022"'); assert.equal(fairview[refCol], '="00417"');
    assert(ex.master.csv.indexOf('"=""07022"""') > 0, 'written the way bulk sites writes it');
    var albany = m.filter(function (r) { return r[m[0].indexOf('City')] === 'Albany'; })[0]; assert.equal(albany[refCol], "'=cmd");
    assert.equal(fairview[lngCol], '-73.9993', 'a longitude is a number, not a defused formula');
    assert.equal(fairview[m[0].indexOf('Weight lb')], '5500'); assert.equal(fairview[m[0].indexOf('Dimensions ft (W × D × H)')], '7.2 × 4.1 × 7.5');
    var c418 = m.filter(function (r) { return r[1] === 'CC-C418'; })[0]; assert.equal(c418[m[0].indexOf('Weight lb')], 'not on file'); assert.equal(c418[m[0].indexOf('Stackable')], 'not on file');
    assert.equal(m[1][m[0].indexOf('Customer PO')], 'EGC-PO-3300'); assert.equal(m[1][m[0].indexOf('Order')], 'CC-26-7001');
    /* the carrier's sheet */
    var qh = q[0], first = q[1];
    assert.equal(first[qh.indexOf('Lane')], 'Northeast'); assert.equal(first[qh.indexOf('Pick up from')], 'Plant dock 2, 1 Example Works Rd, Columbus, OH 43215');
    assert.equal(first[qh.indexOf('Stops in lane')], '2'); assert.match(first[qh.indexOf('SKUs')], /^4 × CC-C215 215 kWh outdoor cabinet$/);
    assert.equal(first[qh.indexOf('Serials')].split(' ').length, 4); assert.equal(first[qh.indexOf('Est. weight lb')], '22000');
    var s11 = q.filter(function (r) { return r[qh.indexOf('Site')] === 'Sandplum Site'; })[0]; assert.equal(s11[qh.indexOf('Est. weight lb')], '11000 (not on file: CC-C418)');
    /* the carrier prices a stop from these two: the SKU without a class or a stacking answer is named, as the weight's is */
    assert.equal(s11[qh.indexOf('Freight class')], '85 (not on file: CC-C418)'); assert.equal(s11[qh.indexOf('Stackable')], 'no (not on file: CC-C418)');
    assert.equal(first[qh.indexOf('Freight class')], '85', 'every SKU on file: the class alone');
    var s16 = q.filter(function (r) { return r[qh.indexOf('Site')] === 'Bluestem Court Lot'; })[0]; assert.equal(s16[qh.indexOf('Est. weight lb')], 'not on file');
    assert.equal(first[qh.indexOf('Earliest pickup date')], '2026-11-15');
    assert(!/Example Grid Co|EGC-PO-3300|@|18450|Hidden Vendor/.test(ex.quote.csv), 'no customer name, PO, email, amount or supplier on the carrier sheet');
    /* a stop whose units are all booked leaves the quote sheet */
    var o = orderDoc(); o.delivery.legs = [{ id: 'MAN-1', status: 'planned', serials: [serialOf(1), serialOf(2), serialOf(3), serialOf(4)], destinationId: 'd1', carrier: 'X', tracking: 'Y' }];
    var p2 = libPlan({ order: Object.assign({ id: 'oF' }, o) }); assert.equal(parseCsv(F.quoteCsv(p2)).length - 1, 15); assert.equal(laneOf(p2, 'NORTHEAST').stops[1].siteId, 's01', 'booked stop follows the open ones');
    assert.equal(laneOf(p2, 'NORTHEAST').loads[0].legId, 'MAN-1'); assert.equal(p2.rows.filter(function (r) { return r.load === 'MAN-1'; }).length, 4);
  });
  await test('the plan never carries a list price, a supplier, a cost basis or a margin', function () {
    var s = JSON.stringify(libPlan()); ['listPrice', 'supplier', 'Hidden Vendor', 'capex', 'margin', '64000', 'buyPrice'].forEach(function (k) { assert(s.indexOf(k) < 0, k); });
  });
  function unitsBy() { var m = {}; buildUnits('oF').forEach(function (u) { m[u.serial] = u; }); return m; }
  function libQuote(lane, extra, now) { var q = F.quoteInput(quoteBody(lane, extra), lane, { id: 'oF', orgId: ORG, orderNo: 'CC-26-7001' }, ADMIN.email, now || NOW); q.id = 'q-' + lane.key; return q; }
  await test('a site whose address is corrected after a price: the lane key moves, the price is stale and moved (never best), the view says where the site is now, and Accept refuses naming both', function () {
    var ne = laneOf(libPlan(), 'NORTHEAST'), q = libQuote(ne), st0 = q.stops[0], sid = st0.siteId, was = sitesMap()[sid].address;
    assert.equal(st0.line1, was.line1, 'the quote keeps the street it was priced for');
    var sites = sitesMap(); sites[sid].address = { line1: '900 Other Rd', line2: '', city: 'Buffalo', state: 'NY', zip: '14201', country: 'US' }; sites[sid].lat = null; sites[sid].lng = null;
    var ne2 = laneOf(libPlan({ sites: sites, quotes: [q] }), 'NORTHEAST'), v = ne2.quotes[0], vs = v.stops.filter(function (x) { return x.siteId === sid; })[0];
    assert.notEqual(ne2.planKey, ne.planKey, 'the address is in the lane key'); assert.equal(v.stale, true); assert.equal(v.moved, true);
    assert.equal(ne2.best, null, 'a price Accept refuses is not best'); assert.equal(ne2.state, 'needs-quote');
    assert.equal(vs.moved, true); assert.equal(vs.where, '900 Other Rd, Buffalo, NY 14201'); assert.equal(vs.city, was.city, 'the priced address is kept');
    assert.equal(v.stops.filter(function (x) { return x.siteId !== sid; })[0].moved, false);
    var chk = F.acceptCheck({ quote: q, unitsBySerial: unitsBy(), sitesById: sites, order: Object.assign({ id: 'oF' }, orderDoc()), now: NOW });
    assert.deepEqual(chk.ineligible, []); assert.equal(chk.problems.length, 1);
    assert.equal(chk.problems[0], 'Stop ' + st0.seq + ' · ' + sites[sid].name + ': the address changed since this price (priced for ' + C.oneLine(was) + '; now 900 Other Rd, Buffalo, NY 14201). Record a new price for this lane');
    /* the same street written another way is the same place: nothing moved, the price stands */
    var same = sitesMap(); same[sid].address = Object.assign({}, was, { line1: was.line1.replace(/ Rd$/, ' Road').replace(/ Ln$/, ' Lane'), state: C.US_STATES[was.state] });
    assert.notEqual(same[sid].address.line1, was.line1);
    var ne3 = laneOf(libPlan({ sites: same, quotes: [q] }), 'NORTHEAST');
    assert.equal(ne3.planKey, ne.planKey); assert.equal(ne3.quotes[0].stale, false); assert.equal(ne3.quotes[0].moved, false); assert.equal(ne3.best.id, q.id);
    assert.deepEqual(F.acceptCheck({ quote: q, unitsBySerial: unitsBy(), sitesById: same, order: Object.assign({ id: 'oF' }, orderDoc()), now: NOW }).problems, []);
  });
  await test('a quote is good through the end of its "valid until" day in the US, not the UTC day', function () {
    assert.equal(F.quoteDay('2026-09-25T00:30:00.000Z'), '2026-09-24', '7:30pm Central on the 24th');
    assert.equal(F.quoteDay('2026-09-25T09:59:00.000Z'), '2026-09-24', '11:59pm Hawaii');
    assert.equal(F.quoteDay('2026-09-25T10:00:00.000Z'), '2026-09-25');
    var eve = '2026-09-25T00:30:00.000Z', gl = laneOf(libPlan({ now: eve }), 'GREATLAKES'), q = libQuote(gl, { validUntil: '2026-09-24' }, eve);
    assert.equal(q.validUntil, '2026-09-24', 'recorded on its last evening');
    var v = laneOf(libPlan({ now: eve, quotes: [q] }), 'GREATLAKES'); assert.equal(v.quotes[0].expired, false); assert.equal(v.best.id, q.id); assert.equal(v.state, 'quoted');
    var order = Object.assign({ id: 'oF' }, orderDoc());
    assert.deepEqual(F.acceptCheck({ quote: q, unitsBySerial: unitsBy(), sitesById: sitesMap(), order: order, now: eve }).problems, [], 'and accepted');
    var next = '2026-09-25T10:30:00.000Z';
    assert.equal(laneOf(libPlan({ now: next, quotes: [q] }), 'GREATLAKES').quotes[0].expired, true, 'the day after, everywhere in the US');
    assert.match(F.acceptCheck({ quote: q, unitsBySerial: unitsBy(), sitesById: sitesMap(), order: order, now: next }).problems[0], /expired on 2026-09-24/);
    assert.throws(function () { libQuote(gl, { validUntil: '2026-09-24' }, next); }, /already expired/);
  });
  await test('nextLoadId: one past the lane\'s quote loads, however they were named, stepped past any id the ledger has', function () {
    var o = { id: 'oF', orderNo: 'CC 26/7001' };
    assert.equal(F.nextLoadId(o, 'NORTHEAST', []), 'FRT-CC-26-7001-NORTHEAST-1');
    var legs = [{ id: 'TRUCK7-S1', freight: { laneKey: 'NORTHEAST', loadId: 'TRUCK7' } }, { id: 'TRUCK7-S2', freight: { laneKey: 'NORTHEAST', loadId: 'TRUCK7' } }, { id: 'FRT-CC-26-7001-GREATLAKES-1-S1', freight: { laneKey: 'GREATLAKES', loadId: 'FRT-CC-26-7001-GREATLAKES-1' } }];
    assert.equal(F.nextLoadId(o, 'NORTHEAST', legs), 'FRT-CC-26-7001-NORTHEAST-2', 'a custom-named load counts');
    assert.equal(F.nextLoadId(o, 'NORTHEAST', legs.concat([{ id: 'FRT-CC-26-7001-NORTHEAST-2-S1' }])), 'FRT-CC-26-7001-NORTHEAST-3', 'an id the ledger already has is stepped past');
    assert.equal(F.nextLoadId({ id: 'oX' }, 'PACIFIC', null), 'FRT-oX-PACIFIC-1');
    var o2 = orderDoc(); o2.delivery.legs = legs; assert.equal(laneOf(libPlan({ order: Object.assign({ id: 'oF' }, o2) }), 'NORTHEAST').nextLoadId, 'FRT-CC-26-7001-NORTHEAST-2', 'each lane of the plan carries it');
  });

  console.log('\nthe endpoint');
  await test('GET the freight plan: the office admin gets it with both sheets; a member, a customer and another workspace are refused; another org’s order is not found', async function () {
    seed();
    var r = await get({ freight: 'oF' });
    assert.equal(r.summary.units, 58); assert.equal(r.lanes.length, 7); assert.equal(r.order.orderNo, 'CC-26-7001'); assert.equal(r.origin, null); assert.equal(r.originSet, false);
    assert.match(r.exports.master.filename, /^freight-master-CC-26-7001-\d{4}-\d{2}-\d{2}\.csv$/); assert.equal(parseCsv(r.exports.master.csv).length - 1, 58); assert.equal(parseCsv(r.exports.quote.csv).length - 1, 16);
    assert.equal(r.rows.filter(function (x) { return x.serial === 'CCX-26-MOD1'; }).length, 0, 'a component is not a shipping unit');
    assert.equal(laneOf(r, 'NORTHEAST').stops[0].ready.date, '2026-11-15', 'the works order date');
    await rejects(get({ freight: 'oF' }, MEMBER), 403, /administrator/);
    await rejects(get({ freight: 'oF' }, CUSTOMER), 403, /workspace/);
    await rejects(get({ freight: 'oF' }, OTHER), 403, /workspace/);
    await rejects(get({ freight: 'foreign' }), 404, /Order not found/);
    await rejects(get({ freight: 'nope' }), 404, /Order not found/);
    var plain = await get({}); assert(Array.isArray(plain.orders), 'the ledger GET is unchanged');
  });
  await test('freight-origin: stored on fulfillment/config.freight with an audit row, geocoded once, a miss stores no pin, a bad state is refused', async function () {
    seed();
    var r = await post({ action: 'freight-origin', origin: { name: 'Plant dock 2', address: { line1: '1 Example Works Rd', city: 'Columbus', state: 'Ohio', zip: '43215' }, contact: { name: 'Dock lead', phone: '555-0199' }, hours: '7–3 weekdays' } });
    assert.equal(r.ok, true); assert.equal(r.origin.address.state, 'OH'); assert.equal(r.origin.lat, 39.9612); assert.equal(GEO.length, 1);
    var cfg = db.data.get(O + '/fulfillment/config'); assert.equal(cfg.enabled, true, 'the rest of the config survives'); assert.equal(cfg.terms.depositPct, 30);
    assert.equal(cfg.freight.origin.name, 'Plant dock 2'); assert.equal(cfg.freight.updatedBy, ADMIN.email);
    var a = audits('freight-origin'); assert.equal(a.length, 1); assert.equal(a[0].before, null); assert.equal(a[0].after.address.city, 'Columbus');
    /* the same place again keeps its pin and looks nothing up */
    await post({ action: 'freight-origin', origin: { name: 'Plant dock 2', address: { line1: '1 Example Works Road', city: 'Columbus', state: 'OH', zip: '43215' } } });
    assert.equal(GEO.length, 1); assert.equal(db.data.get(O + '/fulfillment/config').freight.origin.lat, 39.9612); assert.equal(audits('freight-origin')[1].before.lat, 39.9612);
    var miss = await post({ action: 'freight-origin', origin: { name: 'Nowhere yard', address: { line1: '5 Nowhere Ln', city: 'Columbus', state: 'OH', zip: '43215-1234' } } });
    assert.equal(GEO.length, 2); assert.equal(miss.origin.lat, null); assert.equal(db.data.get(O + '/fulfillment/config').freight.origin.lat, null); assert.equal(miss.origin.address.zip, '43215-1234');
    await rejects(post({ action: 'freight-origin', origin: { name: 'X', address: { line1: '1 A St', city: 'Toronto', state: 'ON', zip: '43215' } } }), 400, /US state/);
    await rejects(post({ action: 'freight-origin', origin: { name: 'X', address: { line1: '1 A St', city: 'Columbus', state: 'OH', zip: '4321' } } }), 400, /ZIP/);
    await rejects(post({ action: 'freight-origin', origin: { name: 'X', address: { line1: '1 A St', city: 'Columbus', state: 'OH', zip: '43215' } } }, MEMBER), 403);
    var got = await get({ freight: 'oF' }); assert.equal(got.originSet, true); assert.equal(got.origin.name, 'Nowhere yard');
  });
  await test('freight-quote: every field stored and none undefined; stale, non-USD and expired refused; supersede keeps the old amount; withdraw needs a reason and keeps the record', async function () {
    seed(); db.seed(O + '/fulfillment/config', { enabled: true, freight: { origin: ORIGIN } });
    var pl = await get({ freight: 'oF' }), gl = laneOf(pl, 'GREATLAKES'), counts = [];
    var r = await post(quoteBody(gl));
    var docs = quoteDocs(); assert.equal(docs.length, 1); counts.push(docs.length);
    var q = docs[0];
    assert.deepEqual(Object.keys(q).filter(function (k) { return k !== 'id'; }).sort(), ['acceptedAt', 'acceptedBy', 'amountCents', 'carrier', 'currency', 'laneKey', 'laneLabel', 'legIds', 'note', 'orderId', 'orderNo', 'orgId', 'planKey', 'reason', 'recordedAt', 'recordedBy', 'reference', 'status', 'stops', 'supersededBy', 'supersedes', 'trail', 'transitDays', 'units', 'validUntil', 'weightComplete', 'weightLb', 'withdrawnAt', 'withdrawnBy'].sort());
    assert.equal(q.amountCents, 1845075); assert.equal(q.currency, 'USD'); assert.equal(q.orgId, ORG); assert.equal(q.orderId, 'oF'); assert.equal(q.laneKey, 'GREATLAKES'); assert.equal(q.units, 12); assert.equal(q.stops.length, 3); assert.equal(q.status, 'recorded'); assert.equal(q.recordedBy, ADMIN.email); assert.equal(q.weightLb, 66000); assert.equal(q.weightComplete, true);
    assert.equal(r.quote.id, q.id); assert.equal(r.quote.stale, false); assert.equal(r.quote.expired, false);
    assert.equal(audits('freight-quote').length, 1);
    await rejects(post(quoteBody(gl, { planKey: 'p0.0' })), 409, /changed since you opened it/);
    await rejects(post(quoteBody(gl, { currency: 'EUR' })), 400, /USD/);
    await rejects(post(quoteBody(gl, { validUntil: '2020-01-01' })), 400, /already expired/);
    await rejects(post(quoteBody(gl, { amount: '0' })), 400, /more than \$0/);
    await rejects(post(quoteBody(gl, { carrier: ' ' })), 400, /Carrier/);
    await rejects(post(quoteBody(gl, { transitDays: 2.5 })), 400, /Transit/);
    await rejects(post(quoteBody(gl, { laneKey: 'ALASKA' })), 409, /not on this order/);
    await rejects(post(quoteBody(gl), MEMBER), 403); await rejects(post(quoteBody(gl), CUSTOMER), 403);
    counts.push(quoteDocs().length);
    /* a better price replaces the first: the old one is superseded, its amount untouched */
    var r2 = await post(quoteBody(gl, { amount: 17900, reference: 'EFL-Q-5522', supersedes: q.id }));
    var old = db.data.get(O + '/freight_quotes/' + q.id); assert.equal(old.status, 'superseded'); assert.equal(old.supersededBy, r2.quote.id); assert.equal(old.amountCents, 1845075); assert.equal(old.trail.length, 2);
    counts.push(quoteDocs().length);
    await rejects(post(quoteBody(gl, { supersedes: q.id })), 409, /Only a recorded quote/);
    var third = await post(quoteBody(gl, { carrier: 'Sample Haulers', amount: 19999 }));
    var view = laneOf(await get({ freight: 'oF' }), 'GREATLAKES'); assert.equal(view.best.id, r2.quote.id); assert.equal(view.state, 'quoted'); assert.equal(view.quotes.length, 3); assert.equal(view.quotes[0].id, third.quote.id, 'newest first');
    /* withdraw */
    await rejects(post({ action: 'freight-withdraw', orderId: 'oF', quoteId: third.quote.id, reason: 'x' }), 400, /reason/);
    var w = await post({ action: 'freight-withdraw', orderId: 'oF', quoteId: third.quote.id, reason: 'Carrier cannot do liftgate' });
    assert.equal(w.quote.status, 'withdrawn'); var wd = db.data.get(O + '/freight_quotes/' + third.quote.id); assert.equal(wd.status, 'withdrawn'); assert.equal(wd.amountCents, 1999900); assert.equal(wd.reason, 'Carrier cannot do liftgate'); assert.equal(wd.withdrawnBy, ADMIN.email);
    await rejects(post({ action: 'freight-withdraw', orderId: 'oF', quoteId: third.quote.id, reason: 'Again please' }), 409, /already withdrawn/);
    counts.push(quoteDocs().length);
    /* accept, then withdrawing the accepted one is refused */
    var acc = await post({ action: 'freight-accept', orderId: 'oF', quoteId: r2.quote.id, revision: 0 });
    await rejects(post({ action: 'freight-withdraw', orderId: 'oF', quoteId: r2.quote.id, reason: 'Changed our mind' }), 409, /accepted quote planned loads/);
    await rejects(post(quoteBody(laneOf(await get({ freight: 'oF' }), 'GREATLAKES'))), 409, /nothing left to quote/);
    counts.push(quoteDocs().length);
    for (var i = 1; i < counts.length; i++) assert(counts[i] >= counts[i - 1], 'quote documents never fall: ' + counts.join(','));
    assert.equal(acc.legs.length, 3);
  });
  await test('accept plans EXACTLY the legs the ledger’s plan action would, one per stop, in one change', async function () {
    seed(); db.seed(O + '/fulfillment/config', { enabled: true, freight: { origin: ORIGIN } });
    var pl = await get({ freight: 'oF' }), gl = laneOf(pl, 'GREATLAKES');
    var q = (await post(quoteBody(gl))).quote, other = (await post(quoteBody(gl, { carrier: 'Sample Haulers', amount: 21000 }))).quote;
    var acc = await post({ action: 'freight-accept', orderId: 'oF', quoteId: q.id, revision: 0, bookingRef: 'EFL-BK-9001' });
    assert.equal(acc.revision, 1, 'one order change for every stop'); assert.equal(acc.loadId, 'FRT-CC-26-7001-GREATLAKES-1');
    assert.deepEqual(acc.legs.map(function (l) { return l.id; }), ['FRT-CC-26-7001-GREATLAKES-1-S1', 'FRT-CC-26-7001-GREATLAKES-1-S2', 'FRT-CC-26-7001-GREATLAKES-1-S3']);
    assert.deepEqual(acc.notOnQuote, []);
    var A1 = db.data.get('orders/oF'), legsA = A1.delivery.legs, unitsA = {};
    assert.equal(A1.delivery.revision, 1);
    legsA.forEach(function (l, i) { assert.equal(l.siteId, gl.stops[i].siteId); assert.equal(l.freight.quoteId, q.id); assert.equal(l.freight.stop, i + 1); assert.equal(l.freight.stops, 3); assert.equal(l.tracking, 'EFL-BK-9001'); assert.equal(l.carrier, 'Example Freight Lines'); assert.equal(l.destinationId, 'd1'); assert(!('amountCents' in l.freight)); });
    var evA = Array.from(db.data.keys()).filter(function (k) { return k.indexOf('orders/oF/events/') === 0; }).map(function (k) { return db.data.get(k); });
    assert.equal(evA.filter(function (e) { return e.logistics && e.logistics.source === 'freight-quote'; }).length, 3); var accEv = evA.filter(function (e) { return e.freight; })[0];
    assert.match(accEv.what, /^Freight quote accepted · Great Lakes · Example Freight Lines$/); assert(!/1845075|18450/.test(JSON.stringify(evA)), 'no amount on the order events');
    var evidence = {}; evA.forEach(function (e) { if (e.logistics) evidence[e.logistics.legId] = e.logistics.evidence; });
    assert.match(evidence['FRT-CC-26-7001-GREATLAKES-1-S1'], /^Freight quote \S+ accepted \(Example Freight Lines, ref EFL-Q-5521\) · stop 1 of 3$/);
    gl.stops.forEach(function (s) { s.openSerials.forEach(function (sn) { var u = db.data.get('plant_units/' + ORG + '__' + sn); unitsA[sn] = [u.logisticsLegId, u.logisticsOrderId]; }); });
    var qa = db.data.get(O + '/freight_quotes/' + q.id); assert.equal(qa.status, 'accepted'); assert.deepEqual(qa.legIds, acc.legs.map(function (l) { return l.id; })); assert.equal(qa.acceptedBy, ADMIN.email); assert.equal(qa.amountCents, 1845075);
    assert.equal(db.data.get(O + '/freight_quotes/' + other.id).status, 'superseded', 'the lane’s other recorded quote is superseded'); assert.equal(db.data.get(O + '/freight_quotes/' + other.id).supersededBy, q.id);
    assert.equal(audits('freight-accept').length, 1);
    var after = laneOf(await get({ freight: 'oF' }), 'GREATLAKES'); assert.equal(after.state, 'accepted'); assert.equal(after.loads.length, 3); assert.equal(after.loads[0].quoteId, q.id); assert.equal(after.accepted.id, q.id); assert.equal(after.open, 0); assert.equal(after.booked, 12);
    /* the same seed, planned by hand through the plan action, stop by stop */
    seed(); db.seed(O + '/fulfillment/config', { enabled: true, freight: { origin: ORIGIN } });
    for (var i = 0; i < legsA.length; i++) { var l = legsA[i]; await post({ action: 'plan', orderId: 'oF', revision: i, legId: l.id, destinationId: l.destinationId, serials: l.serials, carrier: l.carrier, tracking: l.tracking, evidence: evidence[l.id] }); }
    var B1 = db.data.get('orders/oF'), strip = function (legs) { return legs.map(function (x) { var y = JSON.parse(JSON.stringify(x)); delete y.createdAt; delete y.siteId; delete y.siteName; delete y.freight; return y; }); };
    assert.deepEqual(strip(B1.delivery.legs), strip(legsA)); assert.equal(B1.delivery.revision, legsA.length, 'the plan action moves the revision once per leg');
    Object.keys(unitsA).forEach(function (sn) { var u = db.data.get('plant_units/' + ORG + '__' + sn); assert.deepEqual([u.logisticsLegId, u.logisticsOrderId], unitsA[sn], sn); });
    var evB = Array.from(db.data.keys()).filter(function (k) { return k.indexOf('orders/oF/events/') === 0; }).map(function (k) { return db.data.get(k).logistics; });
    evB.forEach(function (e) { assert.equal(e.evidence, evidence[e.legId]); assert.equal(e.source, 'manual'); });
  });
  await test('accept refuses, naming the serial, a unit now on another load, going elsewhere or scrapped — and writes nothing; expired, withdrawn and stale are refused', async function () {
    async function fresh() { seed(); db.seed(O + '/fulfillment/config', { enabled: true, freight: { origin: ORIGIN } }); var gl = laneOf(await get({ freight: 'oF' }), 'GREATLAKES'); return { gl: gl, q: (await post(quoteBody(gl))).quote }; }
    var f = await fresh(), sn = f.gl.stops[0].openSerials[0];
    await post({ action: 'plan', orderId: 'oF', revision: 0, legId: 'MAN-1', destinationId: 'd1', serials: [sn], carrier: 'Local', tracking: 'LOC-1', evidence: 'Manual booking reference LOC-1' });
    var before = snapshot();
    await rejects(post({ action: 'freight-accept', orderId: 'oF', quoteId: f.q.id, revision: 1 }), 409, new RegExp('Not eligible any more: ' + sn + ' \\(already on load MAN-1\\).*re-quote the lane'));
    assert.deepEqual(snapshot(), before, 'nothing written');
    f = await fresh(); sn = f.gl.stops[1].openSerials[1];
    var u = db.data.get('plant_units/' + ORG + '__' + sn); u.custody.plannedSiteId = 's16'; u.custody.plannedSiteName = 'Bluestem Court Lot'; db.seed('plant_units/' + ORG + '__' + sn, u);
    before = snapshot();
    await rejects(post({ action: 'freight-accept', orderId: 'oF', quoteId: f.q.id, revision: 0 }), 409, new RegExp(sn + ' \\(now going to Bluestem Court Lot\\)'));
    assert.deepEqual(snapshot(), before);
    f = await fresh(); sn = f.gl.stops[2].openSerials[0];
    u = db.data.get('plant_units/' + ORG + '__' + sn); u.custody.state = 'scrapped'; db.seed('plant_units/' + ORG + '__' + sn, u);
    before = snapshot();
    await rejects(post({ action: 'freight-accept', orderId: 'oF', quoteId: f.q.id, revision: 0 }), 409, new RegExp(sn + ' \\(scrapped\\)'));
    assert.deepEqual(snapshot(), before);
    /* expired: a recorded quote whose date has passed */
    f = await fresh(); var qd = db.data.get(O + '/freight_quotes/' + f.q.id); qd.validUntil = '2020-01-01'; db.seed(O + '/freight_quotes/' + f.q.id, qd);
    await rejects(post({ action: 'freight-accept', orderId: 'oF', quoteId: f.q.id, revision: 0 }), 409, /expired on 2020-01-01/);
    assert.equal(laneOf(await get({ freight: 'oF' }), 'GREATLAKES').quotes[0].expired, true); assert.equal(laneOf(await get({ freight: 'oF' }), 'GREATLAKES').best, null);
    f = await fresh(); await post({ action: 'freight-withdraw', orderId: 'oF', quoteId: f.q.id, reason: 'Carrier withdrew the rate' });
    await rejects(post({ action: 'freight-accept', orderId: 'oF', quoteId: f.q.id, revision: 0 }), 409, /withdrawn/);
    f = await fresh();
    await rejects(post({ action: 'freight-accept', orderId: 'oF', quoteId: f.q.id, revision: 3 }), 409, /Order changed/);
    await rejects(post({ action: 'freight-accept', orderId: 'oF', quoteId: f.q.id }), 400, /Revision/);
    await rejects(post({ action: 'freight-accept', orderId: 'oF', quoteId: f.q.id, revision: 0, loadId: 'bad id!' }), 400, /Load id/);
    await rejects(post({ action: 'freight-accept', orderId: 'oF', quoteId: f.q.id, revision: 0 }, MEMBER), 403);
    await rejects(post({ action: 'freight-accept', orderId: 'oF', quoteId: 'nope', revision: 0 }), 404, /Quote not found/);
    /* no booking reference and no quote reference */
    var gl2 = laneOf(await get({ freight: 'oF' }), 'GREATLAKES'), noRef = (await post(quoteBody(gl2, { reference: '' }))).quote;
    await rejects(post({ action: 'freight-accept', orderId: 'oF', quoteId: noRef.id, revision: 0 }), 400, /booking or quote reference/);
    /* a new unit joined the lane after the quote: accepted for what it names, the new one reported */
    f = await fresh(); var extra = unitDoc(99, 'oF', SITES[5]); db.seed('plant_units/' + ORG + '__' + extra.serial, extra);
    var ok = await post({ action: 'freight-accept', orderId: 'oF', quoteId: f.q.id, revision: 0, loadId: 'GL-WEEK-40' });
    assert.deepEqual(ok.notOnQuote, [extra.serial]); assert.equal(ok.legs[0].id, 'GL-WEEK-40-S1'); assert.equal(db.data.get('plant_units/' + ORG + '__' + extra.serial).logisticsLegId, undefined);
  });
  await test('accept on an order with several destinations: by address, else refused naming the stop', async function () {
    seed(); db.seed(O + '/fulfillment/config', { enabled: true, freight: { origin: ORIGIN } });
    var o = orderDoc(); o.delivery.destinations = [
      { id: 'dMKE', address: { name: 'Milwaukee', line1: '301 Dune Grass Avenue', city: 'Milwaukee', state: 'WI', zip: '53202', country: 'US' }, items: [{ sku: 'CC-C215', qty: 4 }] },
      { id: 'dTOL', address: { name: 'Toledo', line1: '77 Foundry Mill Road', city: 'Toledo', state: 'OH', zip: '43604', country: 'US' }, items: [{ sku: 'CC-C215', qty: 4 }] },
      { id: 'dREST', address: { name: 'Everything else', line1: '500 Example Ave', city: 'Denver', state: 'CO', zip: '80202', country: 'US' }, items: [{ sku: 'CC-C215', qty: 32 }, { sku: 'CC-C418', qty: 18 }] }];
    db.seed('orders/oF', o);
    var gl = laneOf(await get({ freight: 'oF' }), 'GREATLAKES');
    var dests = {}; gl.stops.forEach(function (s) { dests[s.siteId] = s.destination; });
    assert.equal(dests.s06.how, 'address'); assert.equal(dests.s06.id, 'dMKE'); assert.equal(dests.s07.id, 'dTOL'); assert.equal(dests.s08.how, 'none'); assert.match(dests.s08.say, /Prairie Lark Yard/);
    var q = (await post(quoteBody(gl))).quote, before = snapshot();
    await rejects(post({ action: 'freight-accept', orderId: 'oF', quoteId: q.id, revision: 0 }), 409, /^Stop \d · Prairie Lark Yard: No destination on the order matches Prairie Lark Yard/);
    assert.deepEqual(snapshot(), before);
    /* over a destination's allocation: the ledger's own check, the stop named */
    o.delivery.destinations[2].id = 'dJOL'; o.delivery.destinations[2].address = { name: 'Joliet', line1: '88 Prairie Lark Lane', city: 'Joliet', state: 'IL', zip: '60431', country: 'US' }; o.delivery.destinations[2].items = [{ sku: 'CC-C215', qty: 2 }];
    db.seed('orders/oF', o);
    await rejects(post({ action: 'freight-accept', orderId: 'oF', quoteId: q.id, revision: 0 }), 409, /^Stop \d · Prairie Lark Yard: Shipment exceeds destination allocation/);
    /* a legacy order: a plan and sheets, never an accept */
    var legacy = orderDoc(); delete legacy.delivery; db.seed('orders/oF', legacy);
    var lp = await get({ freight: 'oF' }); assert.equal(lp.order.legacy, true); assert.equal(parseCsv(lp.exports.quote.csv).length - 1, 16); assert.equal(laneOf(lp, 'GREATLAKES').stops[0].destination.how, 'none');
    await rejects(post({ action: 'freight-accept', orderId: 'oF', quoteId: q.id, revision: 0 }), 409, /legacy orders are not changed automatically/);
  });
  await test('accept refuses a price whose stop has since moved address, naming both, and writes nothing; the plan shows it moved', async function () {
    seed(); db.seed(O + '/fulfillment/config', { enabled: true, freight: { origin: ORIGIN } });
    var ne = laneOf(await get({ freight: 'oF' }), 'NORTHEAST'), q = (await post(quoteBody(ne))).quote, sid = q.stops[0].siteId, sd = db.data.get(O + '/sites/' + sid), was = C.oneLine(sd.address);
    assert.equal(q.stale, false); assert.equal(q.moved, false);
    sd.address = { line1: '900 Other Rd', line2: '', city: 'Buffalo', state: 'NY', zip: '14201', country: 'US' }; sd.lat = null; sd.lng = null; db.seed(O + '/sites/' + sid, sd);
    var view = laneOf(await get({ freight: 'oF' }), 'NORTHEAST'), vq = view.quotes[0];
    assert.equal(vq.stale, true); assert.equal(vq.moved, true); assert.equal(view.best, null); assert.equal(vq.stops[0].where, '900 Other Rd, Buffalo, NY 14201');
    var before = snapshot();
    var e = await rejects(post({ action: 'freight-accept', orderId: 'oF', quoteId: q.id, revision: 0 }), 409);
    assert.equal(e.message, 'Stop ' + q.stops[0].seq + ' · ' + sd.name + ': the address changed since this price (priced for ' + was + '; now 900 Other Rd, Buffalo, NY 14201). Record a new price for this lane');
    assert.deepEqual(snapshot(), before, 'nothing written');
    /* a fresh price for the lane as it now stands is accepted */
    var q2 = (await post(quoteBody(view, { carrier: 'Sample Haulers' }))).quote, ok = await post({ action: 'freight-accept', orderId: 'oF', quoteId: q2.id, revision: 0 });
    assert.equal(ok.legs.filter(function (l) { return l.siteId === sid; }).length, 1);
  });
  await test('the load id the Accept step previews (the lane\'s nextLoadId) is the one Accept writes — after a custom-named load on the lane too', async function () {
    seed(); db.seed(O + '/fulfillment/config', { enabled: true, freight: { origin: ORIGIN } });
    var ne = laneOf(await get({ freight: 'oF' }), 'NORTHEAST'); assert.equal(ne.nextLoadId, 'FRT-CC-26-7001-NORTHEAST-1');
    var q1 = (await post(quoteBody(ne))).quote, a1 = await post({ action: 'freight-accept', orderId: 'oF', quoteId: q1.id, revision: 0, loadId: 'TRUCK7' });
    assert.deepEqual(a1.legs.map(function (l) { return l.id; }), ['TRUCK7-S1', 'TRUCK7-S2']);
    /* a unit with no site is sent to a Northeast site: the lane needs freight again */
    var u = db.data.get('plant_units/' + ORG + '__' + serialOf(57)); u.custody = { status: '', plannedSiteId: 's01', plannedSiteName: 'Quarry Lantern Depot', plannedBy: 'office', plannedAt: NOW }; db.seed('plant_units/' + ORG + '__' + serialOf(57), u);
    var ne2 = laneOf(await get({ freight: 'oF' }), 'NORTHEAST'); assert.equal(ne2.open, 1); assert.equal(ne2.state, 'needs-quote');
    assert.equal(ne2.nextLoadId, 'FRT-CC-26-7001-NORTHEAST-2', 'TRUCK7 counts as the lane\'s first load');
    var q2 = (await post(quoteBody(ne2))).quote, a2 = await post({ action: 'freight-accept', orderId: 'oF', quoteId: q2.id, revision: 1 });
    assert.equal(a2.loadId, ne2.nextLoadId, 'what the page previewed'); assert.deepEqual(a2.legs.map(function (l) { return l.id; }), [ne2.nextLoadId + '-S1']);
    assert.equal(laneOf(await get({ freight: 'oF' }), 'NORTHEAST').nextLoadId, 'FRT-CC-26-7001-NORTHEAST-3');
  });
  await test('what a customer sees of an accepted order: no quote, no amount, no freight block, no site ids', async function () {
    seed(); db.seed(O + '/fulfillment/config', { enabled: true, freight: { origin: ORIGIN } });
    var gl = laneOf(await get({ freight: 'oF' }), 'GREATLAKES'), q = (await post(quoteBody(gl))).quote;
    await post({ action: 'freight-accept', orderId: 'oF', quoteId: q.id, revision: 0 });
    var o = db.data.get('orders/oF'), pub = JSON.stringify(Portal.publicOrder(o, {})), buyer = L.buyerOrder(o, 'oF');
    assert(Portal.publicOrder(o, {}).loads.length === 3);
    ['freight', 'quoteId', 'siteId', 'amountCents', '1845075', '18450', q.id].forEach(function (k) { assert(pub.indexOf(k) < 0, 'publicOrder carries ' + k); });
    buyer.legs.forEach(function (l) { assert.equal(l.freight, undefined); assert.equal(l.siteId, undefined); });
    assert(JSON.stringify(buyer).indexOf('1845075') < 0);
  });

  console.log('\nthe catalog');
  await test('catalog: the five shipping fields are kept when sent, left out when not, refused when bad, shown to the office and never public', function () {
    var base = { sku: 'CC-C215', name: '215 kWh outdoor cabinet', kind: 'product', category: 'bess', kw: 100, kwh: 215 };
    var p = LC.product(Object.assign({}, base, { weightLb: '5,500', heightFt: 7.5, freightClass: '77.50', stackable: 'no', handlingNote: ' Forklift only ' }));
    assert.equal(p.weightLb, 5500); assert.equal(p.heightFt, 7.5); assert.equal(p.freightClass, '77.5'); assert.equal(p.stackable, false); assert.equal(p.handlingNote, 'Forklift only');
    var none = LC.product(base); SF.FIELDS.forEach(function (k) { assert(!Object.prototype.hasOwnProperty.call(none, k), k + ' left out so a save keeps the stored value'); });
    var cleared = LC.product(Object.assign({}, base, { weightLb: '', stackable: '' })); assert.equal(cleared.weightLb, null); assert.equal(cleared.stackable, null);
    var saved = Object.assign({}, p, LC.product(base)); assert.equal(saved.weightLb, 5500, 'the endpoint’s Object.assign(old, product) keeps it');
    assert.throws(function () { LC.product(Object.assign({}, base, { freightClass: '80' })); }, /NMFC class/);
    assert.throws(function () { LC.product(Object.assign({}, base, { weightLb: 0 })); }, /Weight/);
    assert.throws(function () { LC.product(Object.assign({}, base, { heightFt: 900 })); }, /Height/);
    assert.throws(function () { LC.product(Object.assign({}, base, { stackable: 'maybe' })); }, /Stackable/);
    var comp = LC.product({ sku: 'CC-MOD', name: 'Module', kind: 'component', weightLb: 40 }); assert(!('weightLb' in comp), 'a component carries none');
    var v = LC.view(p); SF.FIELDS.forEach(function (k) { assert(Object.prototype.hasOwnProperty.call(v, k), 'view shows ' + k); }); assert.equal(v.stackable, false);
    var src = fs.readFileSync(path.join(__dirname, '..', 'api', 'embed-config.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(function (l) { return l.replace(/(^|[^:'"\\])\/\/.*$/, '$1'); }).join('\n');
    SF.FIELDS.forEach(function (k) { assert(src.indexOf(k) < 0, 'embed-config names ' + k); });
    assert(src.indexOf('...') < 0, 'no spread'); assert(src.indexOf('Object.assign(') < 0, 'no Object.assign');
    /* the validator on its own */
    assert.equal(SF.value('stackable', 'Y'), true); assert.equal(SF.value('stackable', '0'), false); assert.equal(SF.value('stackable', ''), null);
    assert.equal(SF.value('freightClass', 85), '85'); assert.throws(function () { SF.value('handlingNote', 'a\nb'); }, /one line/); assert.throws(function () { SF.value('handlingNote', new Array(202).join('x')); }, /200/);
    assert.deepEqual(SF.pick({ weightLb: 12.345, other: 1 }), { weightLb: 12.35 });
  });
  await test('the libraries a browser bundle carries parse as ES5', function () {
    var acorn = null; try { acorn = require('/opt/node22/lib/node_modules/eslint/node_modules/acorn'); } catch (e) { acorn = null; }
    ['freight.js', 'shipping-fields.js'].forEach(function (f) {
      var s = fs.readFileSync(path.join(__dirname, '..', 'api', '_lib', f), 'utf8');
      assert(/© 2025–2026 ClearSky Energy Solutions LLC\. Proprietary and Confidential\./.test(s.slice(0, 200)), f + ' carries the header');
      if (acorn) acorn.parse(s, { ecmaVersion: 5, sourceType: 'script' });
      else assert(!/=>|`|\b(let|const|class|async)\s/.test(s.replace(/\/\*[\s\S]*?\*\//g, '')), f + ' is ES5');
    });
    var fr = fs.readFileSync(path.join(__dirname, '..', 'api', '_lib', 'freight.js'), 'utf8');
    assert(!/require\(['"]\.\/(order-lifecycle|logic-policy)['"]\)/.test(fr), 'no server-only module in a bundled library');
    /* scripts/tests/tappsandbox.js refuses these names in the public bundle */
    ['freight.js', 'shipping-fields.js'].forEach(function (f) { var s = fs.readFileSync(path.join(__dirname, '..', 'api', '_lib', f), 'utf8'); assert(!/function (snapshot|receipt|terms|cents)\(|firebase-admin|require\('(crypto|fs)'\)/.test(s), f + ' would fail the sandbox checks'); });
    /* a quote amount as the carrier gave it */
    assert.equal(F.cents('$18,450.75'), 1845075); assert.equal(F.cents(17900), 1790000);
    [0, -5, '', null, true, 'abc', 10000000.01].forEach(function (v) { assert.throws(function () { F.cents(v); }, function (e) { return e.status === 400; }, String(v)); });
  });

  console.log('\n' + count + ' freight checks passed');
})().catch(function (e) { console.error(e); process.exitCode = 1; });
