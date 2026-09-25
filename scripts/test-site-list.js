#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-site-list.js — many sites at once: a PO's site list pasted,
   the sites created, the order's units spread over them in one go
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   api/_lib/custody.js (parseSiteList, matchSites, spread, plannable) on its
   own, then the four actions on api/my-sites.js (the customer's account)
   and api/logic-custody.js (the office, one account at a time) over the
   in-memory Firestore double, then the sample (scripts/_lib/logic-fixtures.js)
   answering them the same way. No network: the geocoder is stood in for.
   Every address here is fictional.
     node scripts/test-site-list.js
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var assert = require('node:assert/strict');
var FD = require('./_lib/firestore-double'), DB = FD.DB, mock = FD.mock;
var db;
var A = { db: function () { return db; }, safeOrg: function (v) { return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(v || '') ? v : ''; }, httpError: function (s, m) { var e = new Error(m); e.status = s; return e; },
  authenticate: async function (r) { return r.caller; }, handler: function (f) { return f; }, canActInOrg: async function (c, o) { return c.orgId === o; }, FieldValue: function () { return { serverTimestamp: function () { return 'TS'; } }; } };
mock('../api/_lib/admin', A);
/* the geocoder, stood in for: every call counted, nothing leaves the box */
var G = require('../api/_lib/geocode'), GEO = [];
G.geocode = function (addr, opts) { GEO.push({ addr: addr, opts: opts }); return Promise.resolve(/nowhere/i.test(addr) ? null : { lat: 39.7, lng: -105.1, matched: String(addr).toUpperCase(), source: 'census' }); };
var C = require('../api/_lib/custody'), office = require('../api/logic-custody'), mine = require('../api/my-sites'), F = require('./_lib/logic-fixtures');
var ORG = 'cleancell.us', O = 'omega_orgs/' + ORG;
var PM = { uid: 'pm', email: 'pm@cleancell.us', orgId: ORG, claims: { email_verified: true } };
var OPS = { uid: 'v1', email: 'ops@voltline.example', orgId: 'voltline.example', claims: { email_verified: true } };
var NEW = { uid: 'v2', email: 'new@voltline.example', orgId: 'voltline.example', claims: { email_verified: true } };
var UNVERIFIED = { uid: 'v3', email: 'ops@voltline.example', orgId: 'voltline.example', claims: { email_verified: false } };
var OTHER = { uid: 'o1', email: 'buyer@otherco.example', orgId: 'otherco.example', claims: { email_verified: true } };
var res = { headers: {}, setHeader: function (k, v) { this.headers[k] = v; }, end: function (b) { this.body = b; } };
function opost(body, caller) { return office({ method: 'POST', body: Object.assign({ org: ORG }, body), caller: caller || PM }, res); }
function oget(q, caller) { return office({ method: 'GET', query: Object.assign({ org: ORG }, q || {}), caller: caller || PM }, res); }
function cpost(body, caller) { return mine({ method: 'POST', body: Object.assign({ org: ORG }, body), caller: caller || OPS }, res); }
function cget(caller) { return mine({ method: 'GET', query: { org: ORG }, caller: caller || OPS }, res); }
async function rejects(p, status, re) { try { await p; } catch (e) { assert.equal(e.status, status, e.message); if (re) assert.match(e.message, re); return e; } throw new Error('expected a ' + status); }
var count = 0; async function test(name, fn) { await fn(); count++; console.log('PASS ' + name); }
function unit(serial, extra) { return Object.assign({ orgId: ORG, serial: serial, rootSerial: serial, sku: 'CC-C215', unitType: 'cabinet', shipUnit: true, orderId: 'ov1', orderNo: 'CC-26-5001', at: 'rack', hold: null, inventoryStatus: 'building', createdAt: '2026-09-01T00:00:00Z' }, extra || {}); }
function U(n, extra) { return Object.assign({ serial: 'VC-' + n, shipUnit: true, at: 'rack' }, extra || {}); }
function seedUnits(orderId, prefix, n, extra) { for (var i = 1; i <= n; i++) db.seed('plant_units/' + ORG + '__' + prefix + i, unit(prefix + i, Object.assign({ orderId: orderId }, extra || {}))); }
function custodyOf(serial) { return (db.data.get('plant_units/' + ORG + '__' + serial) || {}).custody || {}; }
function events(serial) { return Array.from(db.data.keys()).filter(function (k) { return k.indexOf('plant_units/' + ORG + '__' + serial + '/custody_events/') === 0; }).map(function (k) { return db.data.get(k); }); }
function sitesOf(cid) { return Array.from(db.data.keys()).filter(function (k) { return k.indexOf(O + '/sites/') === 0 && k.split('/').length === 4; }).map(function (k) { return Object.assign({ id: k.split('/').pop() }, db.data.get(k)); }).filter(function (x) { return !cid || x.customerId === cid; }); }
function seed() {
  db = new DB(); GEO.length = 0;
  db.seed(O, { name: 'Clean Cell', status: 'active' }); db.seed(O + '/billing/current', { addons: ['omega-logic'], status: 'active' }); db.seed(O + '/fulfillment/config', { enabled: true });
  db.seed(O + '/members/pm', { email: 'pm@cleancell.us', role: 'member', status: 'active' });
  db.seed(O + '/storefront/config', { products: [{ sku: 'CC-C215', name: '215 kWh outdoor cabinet', kind: 'product', warrantyYears: 10 }] });
  /* the buyer: a company ACCOUNT with an owner and a colleague still asking to join */
  db.seed(O + '/customers/company_volt', { orgId: ORG, name: 'Voltline Capital', status: 'active', source: 'office', accountType: 'company' });
  db.seed(O + '/customers/company_volt/users/ops@voltline.example', { email: 'ops@voltline.example', role: 'owner', status: 'active' });
  db.seed(O + '/customers/company_volt/users/new@voltline.example', { email: 'new@voltline.example', role: 'user', status: 'pending', source: 'domain-request' });
  db.seed(O + '/customer_index/ops@voltline.example', { customerId: 'company_volt' }); db.seed(O + '/customer_index/new@voltline.example', { customerId: 'company_volt' });
  db.seed(O + '/customers/company_other', { orgId: ORG, name: 'Other Co', status: 'active' });
  db.seed(O + '/customers/company_other/users/buyer@otherco.example', { email: 'buyer@otherco.example', role: 'owner', status: 'active' });
  db.seed(O + '/customer_index/buyer@otherco.example', { customerId: 'company_other' });
  db.seed(O + '/customers/company_shut', { orgId: ORG, name: 'Closed Co', status: 'suspended' });
  db.seed('orders/ov1', { orgId: ORG, orderNo: 'CC-26-5001', status: 'in_fulfilment', createdAt: '2026-09-02T10:00:00Z', customerId: 'company_volt', customer: { email: 'ops@voltline.example', company: 'Voltline Capital' }, purchaseOrder: { number: 'VC-PO-77' }, items: [{ sku: 'CC-C215', qty: 12 }] });
  db.seed('orders/oo1', { orgId: ORG, orderNo: 'CC-26-5002', status: 'in_fulfilment', createdAt: '2026-09-03T10:00:00Z', customerId: 'company_other', customer: { email: 'buyer@otherco.example' }, items: [{ sku: 'CC-C215', qty: 2 }] });
  seedUnits('ov1', 'VC-', 12); seedUnits('oo1', 'OC-', 2);
  db.seed('plant_units/' + ORG + '__VC-MOD1', unit('VC-MOD1', { shipUnit: false, unitType: 'module', rootSerial: 'VC-1' }));
  /* one site the account already has, typed a little differently */
  db.seed(O + '/sites/site_existing-yard', { orgId: ORG, name: 'Denver yard', customerId: 'company_volt', address: { line1: '500 Juniper Mesa Road', city: 'Denver', state: 'CO', zip: '80202', country: 'US' }, status: 'active' });
  db.seed(O + '/sites/site_other-yard', { orgId: ORG, name: 'Other yard', customerId: 'company_other', address: { line1: '9 Quarry Ln', city: 'Mesa', state: 'AZ', zip: '85201', country: 'US' }, status: 'active' });
}
/* the list as an email arrives: bullets, one address per line (fictional) */
var EMAIL = ['Hi Clean Cell team,', '', 'Please ship PO VC-PO-77 to these sites:', '',
  '- 1450 Aspen Hollow Dr, Boulder, CO 80301', '- 88 Prairie Lark Ln, Joliet, IL 60431', '- 2710 Mesquite Bend Rd Suite 210, Round Rock, TX 78664',
  '- 3300 Old Mill Ct, Fredericksburg, VA 22401', '- 915 Harbor Finch Way, Tacoma, WA 98402', '- 402 Citrus Grove Pkwy, Sebring, FL 33870', '', 'Thanks!'].join('\r\n');

(async function () {
  console.log('\nthe list, read');
  await test('the email as it arrives: bullets and a greeting, one site per address line, suite text kept in the street', function () {
    var p = C.parseSiteList(EMAIL);
    assert.equal(p.format, 'lines'); assert.equal(p.rows.length, 6);
    assert.deepEqual(p.rows.map(function (r) { return r.problems.length; }), [0, 0, 0, 0, 0, 0]);
    assert.deepEqual(p.rows[2].address, { line1: '2710 Mesquite Bend Rd Suite 210', city: 'Round Rock', state: 'TX', zip: '78664', country: 'US' });
    assert.deepEqual(p.rows.map(function (r) { return r.name; }), ['Boulder, CO', 'Joliet, IL', 'Round Rock, TX', 'Fredericksburg, VA', 'Tacoma, WA', 'Sebring, FL']);
    assert.equal(p.rows[0].line, 5, 'the line the person sees in the paste box'); assert.equal(p.rows[0].units, null); assert.equal(p.rows[0].named, false);
    assert.equal(p.problems.length, 3, 'the greeting, the request line and the sign-off are named, not read as sites'); assert.match(p.problems[0], /Line 1 does not look like an address/); assert.match(p.problems[1], /Line 3 .*Please ship PO VC-PO-77/);
  });
  await test('a trailing unit count in every accepted form; "Name:" and "Name — " name the site', function () {
    var p = C.parseSiteList(['1 Elm St, Aurora, CO 80010 x3', '2 Elm St, Aurora, CO 80010 ×4', '3 Elm St, Aurora, CO 80010 (5 units)', '4 Elm St, Aurora, CO 80010 - 6 units', '5 Elm St, Aurora, CO 80010; 7', '6 Elm St, Aurora, CO 80010\t8', '7 Elm St, Aurora, CO 80010, 9 units', 'North store: 8 Elm St, Aurora, CO 80010 x 2', 'Depot 4 — 9 Elm St, Aurora, CO 80010', '1) Yard – 10 Elm St, Aurora, CO 80010'].join('\n'));
    assert.deepEqual(p.rows.map(function (r) { return r.units; }), [3, 4, 5, 6, 7, 8, 9, 2, null, null]);
    assert.deepEqual(p.rows.slice(7).map(function (r) { return r.name; }), ['North store', 'Depot 4', 'Yard']); assert.equal(p.rows[8].address.line1, '9 Elm St');
    assert.ok(p.rows.every(function (r) { return !r.problems.length; }), JSON.stringify(p.rows.map(function (r) { return r.problems; })));
    assert.match(C.parseSiteList('1 Elm St, Aurora, CO 80010 x2.5').rows[0].problems[0], /whole number/);
    assert.match(C.parseSiteList('1 Elm St, Aurora, CO 80010 x20000').rows[0].problems[0], /0 to 10,000/);
  });
  await test('ZIP+4, "ST, 12345", a full state name and "City ST" without its comma all read', function () {
    var p = C.parseSiteList(['915 Harbor Finch Way, Tacoma, WA 98402-1234', '402 Citrus Grove Pkwy, Sebring, FL, 33870', '3300 Old Mill Ct, Fredericksburg, Virginia 22401', '12 Pine Knot Rd, Lake Placid NY 12946', '7 Ferry Rd, Washington, District of Columbia 20001, USA'].join('\n'));
    assert.deepEqual(p.rows.map(function (r) { return r.address.state + ' ' + r.address.zip + ' ' + r.address.city; }), ['WA 98402-1234 Tacoma', 'FL 33870 Sebring', 'VA 22401 Fredericksburg', 'NY 12946 Lake Placid', 'DC 20001 Washington']);
    assert.ok(p.rows.every(function (r) { return !r.problems.length; }));
  });
  await test('a bad state, a missing ZIP, a missing city and a missing comma say so in plain English and are not creatable', function () {
    var p = C.parseSiteList(['1 Bad St, Springfield, ZZ 12345', '5 No Zip Rd, Denver, CO', '5 No City Rd, CO 80202', '16 Elm St Denver, CO 80202', '9 Short Zip Rd, Denver, CO 8020', '3 No State Rd, Denver 80202', '4 Typo Rd, Denver, Colorad 80202'].join('\n'));
    assert.match(p.rows[0].problems[0], /"ZZ" is not a US state/); assert.deepEqual(p.rows[1].problems, ['No ZIP code']);
    assert.deepEqual(p.rows[2].problems, ['No city, or no comma between the street and the city']); assert.deepEqual(p.rows[3].problems, ['No city, or no comma between the street and the city']);
    assert.match(p.rows[4].problems[0], /5 digits/); assert.deepEqual(p.rows[5].problems, ['No state']); assert.equal(p.rows[5].address.city, 'Denver');
    assert.deepEqual(p.rows[6].problems, ['"Colorad" is not a US state']);
    var m = C.matchSites(p.rows, [], 'c1'); assert.ok(m.every(function (r) { return r.status === 'problem' && r.siteId === null; }));
  });
  await test('the same street and ZIP twice is a problem on the second, however it is typed', function () {
    var p = C.parseSiteList('1450 Aspen Hollow Dr, Boulder, CO 80301\n\n1450 Aspen Hollow Drive, Boulder, CO 80301-2201 x2');
    assert.deepEqual(p.rows[0].problems, []); assert.deepEqual(p.rows[1].problems, ['Listed twice: the same address as line 1']);
  });
  await test('default names: "City, ST", and "City, ST · street" when two rows share the city', function () {
    var p = C.parseSiteList('1450 Aspen Hollow Dr, Boulder, CO 80301\n77 Lake Rd, Boulder, CO 80302\n88 Prairie Lark Ln, Joliet, IL 60431');
    assert.deepEqual(p.rows.map(function (r) { return r.name; }), ['Boulder, CO · 1450 Aspen Hollow Dr', 'Boulder, CO · 77 Lake Rd', 'Joliet, IL']);
  });
  await test('a sheet with a header: CSV with quoted cells, Excel\'s dropped ZIP zero, a store number and units', function () {
    var p = C.parseSiteList('Store #,Site Name,Address,City,State,Zip,Units\r\n101,"Boulder, East",1450 Aspen Hollow Dr,Boulder,CO,80301,3\r\n102,,"88 Prairie Lark Ln, Suite 4",Joliet,Illinois,60431,2 units\r\n103,Harbor,5 Wharf St,Portland,ME,4101,\r\n');
    assert.equal(p.format, 'table'); assert.equal(p.rows.length, 3);
    assert.deepEqual([p.rows[0].name, p.rows[0].ref, p.rows[0].units, p.rows[0].line], ['Boulder, East', '101', 3, 2]);
    assert.deepEqual([p.rows[1].address.line1, p.rows[1].address.state, p.rows[1].units, p.rows[1].name], ['88 Prairie Lark Ln, Suite 4', 'IL', 2, 'Joliet, IL']);
    assert.equal(p.rows[2].address.zip, '04101', 'a Maine ZIP Excel read as a number gets its zero back'); assert.equal(p.rows[2].units, null);
  });
  await test('a TSV pasted from Excel keeps the commas inside its address cells; a one-line address in the Address column is read like a line', function () {
    var p = C.parseSiteList('Location\tAddress\tQty\nBoulder east\t1450 Aspen Hollow Dr, Boulder, CO 80301\t3\n\t2710 Mesquite Bend Rd, Suite 210, Round Rock, TX 78664-4411\t1\n');
    assert.equal(p.format, 'table'); assert.equal(p.rows.length, 2);
    assert.deepEqual(p.rows[1].address, { line1: '2710 Mesquite Bend Rd, Suite 210', city: 'Round Rock', state: 'TX', zip: '78664-4411', country: 'US' });
    assert.deepEqual([p.rows[0].name, p.rows[0].units, p.rows[1].name], ['Boulder east', 3, 'Round Rock, TX']);
    assert.equal(C.parseCsv('a\tb\n"1, 2"\t3', '\t').rows[0].a, '1, 2', 'parseCsv takes the separator it is told');
    assert.equal(C.parseCsv('serial\tsite\nS1\tYard').rows[0].site, 'Yard', 'and still guesses tab when there is no comma');
    assert.match(C.parseSiteList('Name,City\nYard,Denver').problems[0], /address column/);
  });
  await test('at most 200 sites in a list: 201 is refused whole, 200 is read', function () {
    function lines(n) { var out = []; for (var i = 1; i <= n; i++) out.push(i + ' Test Loop Rd, Aurora, CO 80010'); return out.join('\n'); }
    var e = assert.throws(function () { C.parseSiteList(lines(201)); }, /At most 200 sites in one list; this one has 201/);
    assert.equal(C.parseSiteList(lines(200)).rows.length, 200);
    assert.throws(function () { C.parseSiteList('Address,City,State,Zip\n' + lines(201).split('\n').map(function (l) { return '"' + l.split(',')[0] + '",Aurora,CO,80010'; }).join('\n')); }, /this one has 201/);
  });
  /* ── what review found, each pinned ── */
  function ms(fn) { var t0 = Date.now(); fn(); return Date.now() - t0; }
  await test('a crafted line cannot hold the parser: tabs, spaces and digit runs a customer can paste run in milliseconds, and the list and each line are bounded', function () {
    var attacks = ['1' + '\t'.repeat(5000) + 'x', '1, a' + ' '.repeat(64000) + 'b', '1,' + '1 '.repeat(32000) + 'a', '- 1 Elm St, Aurora, CO 80010' + ' '.repeat(90) + 'x' + '\t'.repeat(300) + '5'];
    attacks.forEach(function (t, i) { var took = ms(function () { C.parseSiteList(t); }); assert.ok(took < 100, 'attack ' + i + ' took ' + took + ' ms'); });
    /* the readers themselves, handed the long text with no line cap in front of them */
    assert.ok(ms(function () { C.splitAddress('1,' + '1 '.repeat(32000) + 'a'); C.splitAddress('1, a' + ' '.repeat(64000) + 'b'); C.splitAddress('1 Elm St, Aurora, CO ' + '8 '.repeat(30000) + 'x'); }) < 100, 'splitAddress is linear');
    assert.ok(ms(function () { C.unitTail('1' + '\t'.repeat(50000) + 'x'); C.unitTail('1 Elm St' + ' '.repeat(50000) + 'x'); C.trimEnd('a' + ' '.repeat(64000) + 'b'); }) < 100, 'the tail readers are linear');
    var long = C.parseSiteList('1 Elm St, Aurora, CO 80010\n' + '1' + '\t'.repeat(5000) + 'x');
    assert.equal(long.rows.length, 1); assert.match(long.problems[0], /^Line 2 is too long to be one address \(5002 characters\) and was left out$/);
    assert.throws(function () { C.parseSiteList('x'.repeat(C.MAX_SITE_TEXT + 1)); }, function (e) { return e.status === 400 && /too long/.test(e.message); });
    var table = ms(function () { C.parseSiteList('Name,Address\nA,"1, a' + ' '.repeat(64000) + 'b"'); }); assert.ok(table < 100, 'a sheet cell is bounded too: ' + table + ' ms');
  });
  await test('a one-column sheet saved as CSV (Excel quotes every address) reads, with its header or without; a header line is read past', function () {
    var csv = 'Address\r\n"100 Maple Ave, Springfield, IL 62701"\r\n"200 S Oak Rd, Fairview, TX 75069"\r\n';
    [csv, csv.split('\r\n').slice(1).join('\r\n')].forEach(function (t) {
      var p = C.parseSiteList(t);
      assert.deepEqual(p.problems, []); assert.equal(p.rows.length, 2);
      assert.deepEqual(p.rows[0].address, { line1: '100 Maple Ave', city: 'Springfield', state: 'IL', zip: '62701', country: 'US' }); assert.deepEqual(p.rows[1].problems, []);
    });
    var two = C.parseSiteList('"100 Maple Ave, Springfield, IL 62701",3\n"Store 9","200 S Oak Rd, Fairview, TX 75069"');
    assert.deepEqual([two.rows[0].units, two.rows[1].name, two.rows[1].address.line1], [3, 'Store 9', '200 S Oak Rd']);
  });
  await test('a row copied out of a sheet without its header (tab-separated) is read by position, and its ZIP is never taken for a unit count', function () {
    var p = C.parseSiteList(['12400 W Maple Ave\tAurora\tCO\t80010', 'Store 12\t77 Lake Rd\tBoulder\tCO\t80302\t4', '\t9 Pine St\tDenver\tCO 80202', '5 Wharf St\tPortland\tME\t4101', '8 Elm St, Aurora, CO 80011\t2'].join('\n'));
    assert.deepEqual(p.rows.map(function (r) { return r.problems.length; }), [0, 0, 0, 0, 0], JSON.stringify(p.rows.map(function (r) { return r.problems; })));
    assert.deepEqual(p.rows[0].address, { line1: '12400 W Maple Ave', city: 'Aurora', state: 'CO', zip: '80010', country: 'US' }); assert.equal(p.rows[0].units, null);
    assert.deepEqual([p.rows[1].name, p.rows[1].address.line1, p.rows[1].address.zip, p.rows[1].units], ['Store 12', '77 Lake Rd', '80302', 4]);
    assert.deepEqual([p.rows[2].address.line1, p.rows[2].address.city, p.rows[2].address.zip], ['9 Pine St', 'Denver', '80202']);
    assert.equal(p.rows[3].address.zip, '04101', 'a Maine ZIP that lost its zero in a sheet gets it back');
    assert.deepEqual([p.rows[4].address.zip, p.rows[4].units], ['80011', 2], 'an address then a tab and a count');
  });
  await test('a line ending in a full stop or semicolon keeps its ZIP', function () {
    var p = C.parseSiteList('- 12400 W Maple Ave, Aurora, CO 80010.\n- 500 Oak St, Springfield, IL 62701;\n- 7 Pine St, Denver, CO 80202 (2 units).');
    assert.deepEqual(p.rows.map(function (r) { return r.address.state + ' ' + r.address.zip + ' ' + r.problems.length; }), ['CO 80010 0', 'IL 62701 0', 'CO 80202 0']);
    assert.deepEqual(p.rows.map(function (r) { return r.name; }), ['Aurora, CO', 'Springfield, IL', 'Denver, CO']); assert.equal(p.rows[2].units, 2);
    var t = C.parseSiteList('Name,Address\nA,"12400 W Maple Ave, Aurora, CO 80010."'); assert.equal(t.rows[0].address.zip, '80010');
  });
  await test('an emailed "street – suite" (Outlook turns " - " into " – ") is one street; "Name – street" still names the site', function () {
    var p = C.parseSiteList(['1200 S Highway 99 – Suite 100, Round Rock, TX 78664', '- 1200 Main St — Unit 4, Springfield, IL 62701', 'Store 12 – 1200 S Highway 99, Round Rock, TX 78665', 'Yard — One Plaza Way, Aurora, CO 80010'].join('\n'));
    assert.deepEqual([p.rows[0].name, p.rows[0].address.line1], ['Round Rock, TX · 1200 S Highway 99 – Suite 100', '1200 S Highway 99 – Suite 100']);
    assert.equal(p.rows[1].address.line1, '1200 Main St — Unit 4'); assert.equal(p.rows[1].named, false);
    assert.deepEqual([p.rows[2].name, p.rows[2].address.line1], ['Store 12', '1200 S Highway 99']);
    assert.equal(p.rows[3].named, false, 'no house number after the dash: not a name');
  });
  await test('a street with no house number (the sender\'s signature) is flagged to check, never a problem, and is still creatable when ticked', function () {
    var p = C.parseSiteList('Hi,\n- 100 Maple Ave, Springfield, IL 62701\nThanks,\nJane Doe\nExample Capital, 500 Demo Ave Suite 2000, Austin, TX 78701\nN7W22025 Johnson Dr, Pewaukee, WI 53072');
    assert.equal(p.rows.length, 3); assert.deepEqual(p.rows[1].problems, []);
    assert.match(p.rows[1].warnings[0], /does not start with a house number/); assert.deepEqual(p.rows[0].warnings, []); assert.deepEqual(p.rows[2].warnings, [], 'a grid address is a house number');
    var m = C.matchSites(p.rows, [{ id: 's1', name: 'HQ', customerId: 'c1', status: 'active', address: { line1: 'Example Capital, 500 Demo Ave Suite 2000', zip: '78701' } }], 'c1');
    assert.equal(m[1].status, 'exists'); assert.deepEqual(m[1].warnings, [], 'a site already on the account is not flagged again');
    assert.equal(C.siteListInputs([{ name: 'Austin, TX', address: p.rows[1].address }], 'c1').length, 1);
  });
  await test('our own CSV download\'s ="04101" reads back as the ZIP', function () {
    var p = C.parseSiteList('﻿Serial,Site,Address,City,State,ZIP,Order,Status\r\nA-1,Harbor,45 Harbor Rd,Portland,ME,"=""04101""",PO-1,going to\r\n');
    assert.equal(p.format, 'table'); assert.equal(p.rows[0].address.zip, '04101'); assert.deepEqual(p.rows[0].problems, []);
  });
  await test('matching: the same street + ZIP on the account exists; the same NAME at another address is a clash, not a match; another account never matches', function () {
    var have = [{ id: 's_yard', name: 'Boulder, CO', customerId: 'c1', address: { line1: '1450 Aspen Hollow Drive', zip: '80301' }, status: 'active' }, { id: 's_other', name: 'Joliet, IL', customerId: 'c2', address: { line1: '88 Prairie Lark Ln', zip: '60431' }, status: 'active' }, { id: 's_old', name: 'Old', customerId: 'c1', address: { line1: '3300 Old Mill Ct', zip: '22401' }, status: 'inactive' }];
    var m = C.matchSites(C.parseSiteList('1450 Aspen Hollow Dr., Boulder, CO 80301-2201\n9 Other Rd, Boulder, CO 80301\n88 Prairie Lark Ln, Joliet, IL 60431\n3300 Old Mill Ct, Fredericksburg, VA 22401').rows, have, 'c1');
    assert.deepEqual(m.map(function (r) { return r.status; }), ['exists', 'new', 'new', 'new']);
    assert.equal(m[0].existingId, 's_yard'); assert.equal(m[0].siteId, 's_yard');
    assert.equal(m[1].clash, false, 'its default name differs (two Boulder rows) — no clash');
    var k = C.matchSites(C.parseSiteList('Boulder, CO: 9 Other Rd, Boulder, CO 80301').rows, have, 'c1')[0];
    assert.equal(k.status, 'new'); assert.equal(k.clash, true); assert.match(k.note, /separate site/);
    assert.equal(m[2].existingId, null, 'another account\'s site at the same address is not this account\'s'); assert.equal(m[3].existingId, null, 'an inactive site is not matched');
    var pv = C.sitesPreview(EMAIL, have, 'c1'); assert.deepEqual(pv.summary, { rows: 6, new: 5, existing: 1, problems: 0 });
  });
  await test('the one planning rule: plant, in transit, delivered — not received, bound, scrapped, lost, in service; the register uses it', function () {
    assert.equal(C.plannable(U(1)).ok, true); assert.equal(C.plannable(U(1, { custody: { status: 'in_transit' } })).ok, true); assert.equal(C.plannable(U(1, { custody: { status: 'delivered' } })).ok, true);
    assert.equal(C.plannable(U(1, { custody: { status: 'received' } })).why, 'received'); assert.equal(C.plannable(U(1, { custody: { status: 'assigned', siteId: 's', siteName: 'Yard' } })).why, 'bound');
    assert.equal(C.plannable(U(1, { custody: { state: 'scrapped' } })).why, 'scrapped'); assert.equal(C.plannable(U(1, { custody: { state: 'lost', status: 'in_transit' } })).why, 'lost');
    assert.equal(C.plannable(U(1, { custody: { status: 'in_service', siteId: 's' } })).ok, false); assert.equal(C.plannable(U(1, { shipUnit: false })).why, 'component');
    assert.equal(C.registerRow(U(1, { custody: { status: 'received' } }), {}, '2026-09-20T00:00:00Z').can.destination, false); assert.equal(C.registerRow(U(1), {}, '2026-09-20T00:00:00Z').can.destination, true);
  });
  var sixteen = []; for (var j = 1; j <= 16; j++) sixteen.push({ siteId: 's' + j, name: 'Site ' + j, units: null });
  function fleet(n, extra) { var out = []; for (var i = 1; i <= n; i++) out.push(U(i, extra)); return out; }
  await test('spread: 56 units over 16 sites is 8 × 4 then 8 × 3, lowest serials first, in natural order', function () {
    var pl = C.spread(fleet(56).reverse(), sixteen);
    assert.deepEqual(pl.perSite.map(function (s) { return s.count; }), [4, 4, 4, 4, 4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 3]);
    assert.deepEqual(pl.assignments.slice(0, 5).map(function (a) { return a.serial + '>' + a.siteId; }), ['VC-1>s1', 'VC-2>s1', 'VC-3>s1', 'VC-4>s1', 'VC-5>s2']);
    assert.deepEqual(pl.assignments.slice(8, 10).map(function (a) { return a.serial; }), ['VC-9', 'VC-10'], '…-9 before …-10');
    assert.equal(pl.assignments.length, 56); assert.equal(pl.leftover.length, 0); assert.equal(pl.writes, 56); assert.ok(pl.assignments.every(function (a) { return a.how === 'new'; }));
    assert.equal(C.naturalCompare('CC-26-9', 'CC-26-10') < 0, true); assert.equal(C.naturalCompare('A-010', 'A-9') > 0, true);
  });
  await test('spread: numbers given are exact (the rest left over, never dropped); mixed puts the numbered first and spreads the rest', function () {
    var ex = C.spread(fleet(10), [{ siteId: 'a', name: 'A', units: 3 }, { siteId: 'b', name: 'B', units: 5 }]);
    assert.deepEqual(ex.perSite.map(function (s) { return s.count; }), [3, 5]); assert.deepEqual(ex.leftover, ['VC-9', 'VC-10']);
    var mx = C.spread(fleet(10), [{ siteId: 'a', name: 'A', units: null }, { siteId: 'b', name: 'B', units: 4 }, { siteId: 'c', name: 'C', units: '' }]);
    assert.deepEqual(mx.perSite.map(function (s) { return s.count; }), [3, 4, 3]); assert.equal(mx.leftover.length, 0);
    assert.deepEqual(mx.assignments.filter(function (a) { return a.siteId === 'b'; }).map(function (a) { return a.serial; }), ['VC-4', 'VC-5', 'VC-6', 'VC-7']);
  });
  await test('spread: asking for more than the order has assigns nothing and says so; a site twice or a bad number is a problem', function () {
    var pl = C.spread(fleet(5), [{ siteId: 'a', name: 'A', units: 4 }, { siteId: 'b', name: 'B', units: 2 }]);
    assert.equal(pl.assignments.length, 0); assert.match(pl.problems[0], /asks for 6 units, but only 5/); assert.equal(pl.planKey, '');
    assert.match(C.spread(fleet(2), [{ siteId: 'a', name: 'A' }, { siteId: 'a', name: 'A' }]).problems[0], /listed twice/);
    assert.match(C.spread(fleet(2), [{ siteId: 'a', name: 'A', units: -1 }]).problems[0], /whole number/);
    assert.match(C.spread(fleet(2), []).problems[0], /at least one site/);
  });
  await test('spread leaves out what cannot be planned, with the reason: bound, received, scrapped, lost, in service, a component', function () {
    var units = fleet(6); units[0].custody = { status: 'assigned', siteId: 'a', siteName: 'A' }; units[1].custody = { status: 'received' }; units[2].custody = { state: 'scrapped' }; units[3].custody = { status: 'in_transit', state: 'lost' }; units[4].custody = { status: 'in_service', siteId: 'x' }; units.push({ serial: 'M1', shipUnit: false });
    var pl = C.spread(units, [{ siteId: 'a', name: 'A', units: null }, { siteId: 'b', name: 'B', units: null }]);
    assert.deepEqual(pl.notPlanned.map(function (x) { return x.serial + ':' + x.why; }), ['VC-1:bound', 'VC-2:received', 'VC-3:scrapped', 'VC-4:lost', 'VC-5:bound']);
    assert.match(pl.notPlanned[1].say, /assign it to its site when it gets there/);
    assert.deepEqual(pl.perSite.map(function (s) { return s.count + '/' + s.placed; }), ['1/1', '1/0'], 'the unit already at A counts toward A; one planned unit left for B');
    assert.deepEqual(pl.assignments.map(function (a) { return a.serial + '>' + a.siteId; }), ['VC-6>b']);
  });
  function applied(units, pl) { var by = {}; units.forEach(function (u) { by[u.serial] = u; }); C.planWrites(pl).forEach(function (w) { var u = by[w.serial], d = C.destination(u, { siteId: w.siteId, siteName: w.siteName }, 'x', '2026-09-24T00:00:00Z', 'customer'); u.custody = Object.assign({}, u.custody || {}); Object.keys(d.patch).forEach(function (k) { u.custody[k.slice(8)] = d.patch[k]; }); }); return units; }
  await test('spread is idempotent: a re-run changes nothing; a lowered number keeps the lowest serials and releases the rest', function () {
    var units = fleet(9), sites = [{ siteId: 'a', name: 'A', units: null }, { siteId: 'b', name: 'B', units: null }, { siteId: 'c', name: 'C', units: null }];
    var first = C.spread(units, sites); applied(units, first);
    var again = C.spread(units, sites); assert.equal(again.writes, 0); assert.ok(again.assignments.every(function (a) { return a.how === 'unchanged'; })); assert.equal(again.planKey, first.planKey);
    var lower = C.spread(units, [{ siteId: 'a', name: 'A', units: 1 }, { siteId: 'b', name: 'B', units: 3 }, { siteId: 'c', name: 'C', units: 3 }]);
    assert.deepEqual(lower.assignments.filter(function (a) { return a.siteId === 'a'; }).map(function (a) { return a.serial + ':' + a.how; }), ['VC-1:unchanged']);
    assert.deepEqual(lower.released.map(function (r) { return r.serial; }), ['VC-2', 'VC-3'], 'released: A was lowered to 1 and B and C are full');
    applied(units, lower); assert.equal(units[1].custody.plannedSiteId, null, 'a released unit has no destination');
    var grow = C.spread(units, [{ siteId: 'a', name: 'A', units: 2 }, { siteId: 'b', name: 'B', units: 3 }, { siteId: 'c', name: 'C', units: 3 }]);
    assert.deepEqual(grow.assignments.filter(function (a) { return a.how !== 'unchanged'; }).map(function (a) { return a.serial + '>' + a.siteId + ':' + a.how; }), ['VC-2>a:new']);
  });
  await test('a unit already going to a site NOT on the list is left alone and reported, unless replan', function () {
    var units = fleet(4); units[0].custody = { plannedSiteId: 'z', plannedSiteName: 'Zed' };
    var pl = C.spread(units, [{ siteId: 'a', name: 'A' }]); assert.deepEqual(pl.elsewhere, [{ serial: 'VC-1', siteId: 'z', siteName: 'Zed' }]); assert.equal(pl.assignments.length, 3);
    var re = C.spread(units, [{ siteId: 'a', name: 'A' }], { replan: true }); assert.equal(re.assignments.length, 4); assert.equal(re.assignments[0].how, 'changed'); assert.equal(re.assignments[0].from, 'z');
  });
  await test('replan: a unit going to a site not ticked that the numbers do not use stays going there, and says so — never "without a site"', function () {
    var units = fleet(10).map(function (u) { u.serial = u.serial.replace('VC-', 'AC-'); return u; }); for (var i = 0; i < 5; i++) units[i].custody = { plannedSiteId: 'oldx', plannedSiteName: 'Old X' };
    var pl = C.spread(units, [{ siteId: 'a', name: 'A', units: 3 }], { replan: true });
    assert.deepEqual(pl.assignments.map(function (a) { return a.serial + ':' + a.how; }), ['AC-1:changed', 'AC-2:changed', 'AC-3:changed']);
    assert.deepEqual(pl.leftover, ['AC-6', 'AC-7', 'AC-8', 'AC-9', 'AC-10']); assert.deepEqual(pl.released, []);
    assert.deepEqual(pl.elsewhere, [{ serial: 'AC-4', siteId: 'oldx', siteName: 'Old X', unused: true }, { serial: 'AC-5', siteId: 'oldx', siteName: 'Old X', unused: true }]);
    assert.equal(pl.writes, 3, 'and nothing is written to them');
  });
  await test('the planKey is the same on every call of one apply: a release written in the first call does not change it for the second', function () {
    var units = fleet(12); units.forEach(function (u) { u.custody = { plannedSiteId: 'a', plannedSiteName: 'A' }; });
    var sites = [{ siteId: 'a', name: 'A', units: 2 }, { siteId: 'b', name: 'B', units: 3 }], first = C.spread(units, sites), w = C.planWrites(first);
    assert.equal(first.released.length, 7); assert.equal(w.length, 10);
    function write(list) { var by = {}; units.forEach(function (u) { by[u.serial] = u; }); list.forEach(function (x) { var u = by[x.serial]; u.custody = x.siteId ? { plannedSiteId: x.siteId, plannedSiteName: x.siteName } : {}; }); }
    write(w.slice(0, 6));   // the three moves and three of the releases, as a capped call writes them
    var second = C.spread(units, sites); assert.equal(second.released.length, 4); assert.equal(second.planKey, first.planKey); assert.equal(C.planMatches(second, { planKey: first.planKey, perSite: first.perSite }), true);
    write(C.planWrites(second)); var third = C.spread(units, sites); assert.equal(third.writes, 0); assert.equal(third.planKey, first.planKey);
  });
  await test('the created site keeps its reference and its pin through an edit that does not send them — while it is the same place', function () {
    var s = C.site({ name: 'Yard', ref: 'Store 12', lat: 39.7, lng: -105.1, address: { line1: '410 Example Ave', city: 'Fairview', state: 'OR', zip: '97024' } });
    assert.equal(s.ref, 'Store 12'); var e = C.site({ name: 'Yard', address: { line1: '410 Example Avenue', city: 'fairview', state: 'Oregon', zip: '97024-1100' } }, s); assert.equal(e.ref, 'Store 12'); assert.equal(e.lat, 39.7, 'the same place typed another way keeps the pin'); assert.equal(e.lng, -105.1);
    var moved = C.site({ name: 'Yard', address: { line1: '77 Corrected Blvd', city: 'Gresham', state: 'OR', zip: '97030' } }, s); assert.equal(moved.lat, null, 'a new address does not keep the old address\'s pin'); assert.equal(moved.lng, null);
    assert.equal(C.site({ name: 'Yard', address: s.address, lat: 45.5, lng: -122.4 }, s).lat, 45.5, 'a pin sent with the edit wins');
    assert.equal(C.site({ name: 'Yard', lat: '', ref: '' }, s).lat, null, 'an empty value clears it');
    assert.throws(function () { C.siteListInputs([{ name: 'X', address: { line1: '1 A St', city: 'Aurora', state: 'ZZ', zip: '80010' } }], 'c1'); }, /Row 1 \(X\): "ZZ" is not a US state\. Nothing was created/);
    assert.throws(function () { C.siteListInputs([{ name: 'X', address: { line1: '1 A St', city: 'Aurora', state: 'CO', zip: '80010' }, lat: 300 }], 'c1'); }, /Row 1 \(X\): Latitude/);
  });

  console.log('\nthe customer (api/my-sites.js)');
  seed();
  await test('the account\'s orders with units, by orderNo and never by id; an unverified or waiting person is refused', async function () {
    var d = await cget(); assert.equal(d.orders.length, 1); assert.deepEqual(d.orders[0], { orderNo: 'CC-26-5001', po: 'VC-PO-77', units: 12, eligible: 12, building: 12, planned: 0 });
    assert.equal(JSON.stringify(d.orders).indexOf('ov1'), -1); assert.equal(d.units.length, 0, 'units still being built stay off the fleet list'); assert.equal(d.sites[0].planned, 0);
    await rejects(cget(UNVERIFIED), 403, /confirm your email/); await rejects(cpost({ action: 'sites-preview', text: EMAIL }, NEW), 403, /waiting for approval/);
    await rejects(cpost({ action: 'plan-preview', orderNo: 'CC-26-5001', sites: [{ siteId: 'site_existing-yard' }] }, NEW), 403);
  });
  await test('preview: the list read and matched against the account; only NEW rows are geocoded, Census only', async function () {
    GEO.length = 0;
    var r = await cpost({ action: 'sites-preview', text: EMAIL + '\n500 Juniper Mesa Rd, Denver, CO 80202\n1 Bad St, Springfield, ZZ 12345' });
    assert.deepEqual(r.summary, { rows: 8, new: 6, existing: 1, problems: 1 });
    assert.equal(GEO.length, 6); assert.ok(GEO.every(function (g) { return g.opts.censusOnly === true; }));
    var ex = r.rows.filter(function (x) { return x.status === 'exists'; })[0]; assert.equal(ex.existingId, 'site_existing-yard'); assert.equal(ex.geo, null); assert.equal(ex.lookedUp, false);
    assert.deepEqual(r.rows[0].geo, { lat: 39.7, lng: -105.1, matchedAddress: '1450 ASPEN HOLLOW DR, BOULDER, CO 80301' }); assert.equal(r.rows[0].lookedUp, true);
    await rejects(cpost({ action: 'sites-preview', text: new Array(200010).join('x') }), 400, /too long/);
  });
  await test('at most 40 addresses are looked up per preview; the rest come back unpinned, not refused', async function () {
    GEO.length = 0; var many = []; for (var i = 1; i <= 45; i++) many.push(i + ' Test Loop Rd, Nowhere' + (i === 3 ? '' : 'ville') + ', CO 80010');
    var r = await cpost({ action: 'sites-preview', text: many.join('\n') });
    assert.equal(GEO.length, 40); assert.equal(r.rows.filter(function (x) { return x.lookedUp; }).length, 40); assert.equal(r.rows.filter(function (x) { return !x.lookedUp && x.geo === null; }).length, 5);
    assert.equal(r.rows[2].geo, null, 'a miss is shown without a pin'); assert.equal(r.rows[2].lookedUp, true);
  });
  await test('the map lookups are an allowance claimed before any leaves: per account a day and for all customers, a cache hit free, the office apart', async function () {
    var SG = require('../api/_lib/site-geo'), was = { account: SG.LIMITS.account, customers: SG.LIMITS.customers };
    var day = new Date().toISOString().slice(0, 10), acctDoc = O + '/geocode_usage/acct_company_volt__' + day, custDoc = O + '/geocode_usage/customers__' + day;
    var spent = (db.data.get(acctDoc) || {}).count || 0; assert.equal(spent, 46, 'the two previews above were counted: 6 + 40');
    function list(tag, n) { var out = []; for (var i = 1; i <= n; i++) out.push(i + ' ' + tag + ' Loop Rd, Aurora, CO 80010'); return out.join('\n'); }
    SG.LIMITS.account = spent + 5; GEO.length = 0;
    var r1 = await cpost({ action: 'sites-preview', text: list('Budget', 8) });
    assert.equal(GEO.length, 5); assert.equal(r1.geoLimited, true); assert.equal(r1.summary.new, 8, 'never refused');
    assert.equal(r1.rows.filter(function (x) { return x.geo; }).length, 5); assert.equal(r1.rows.filter(function (x) { return !x.lookedUp; }).length, 3);
    assert.equal(db.data.get(acctDoc).count, spent + 5); assert.equal(db.data.get(custDoc).count, spent + 5);
    GEO.length = 0; var realPeek = G.peek; G.peek = function (a) { return /^1 cached/i.test(a) ? { lat: 1, lng: 2, matched: 'CACHED' } : undefined; };
    var r2 = await cpost({ action: 'sites-preview', text: list('Spent', 3) + '\n1 Cached Loop Rd, Aurora, CO 80010' }); G.peek = realPeek;
    assert.equal(GEO.length, 0, 'spent: nothing leaves the box'); assert.equal(r2.geoLimited, true); assert.equal(r2.summary.new, 4);
    assert.deepEqual(r2.rows[3].geo, { lat: 1, lng: 2, matchedAddress: 'CACHED' }, 'a cache hit is free and still pins');
    var o = await opost({ action: 'sites-preview', customerId: 'company_volt', text: list('Office', 2) });
    assert.equal(GEO.length, 2, 'the office spends its own allowance'); assert.equal(o.geoLimited, false);
    SG.LIMITS.account = was.account; SG.LIMITS.customers = db.data.get(custDoc).count; GEO.length = 0;
    var other = await cpost({ action: 'sites-preview', text: list('Other', 2) }, OTHER);
    assert.equal(GEO.length, 0, 'a second account cannot spend past all customers\' allowance'); assert.equal(other.geoLimited, true);
    SG.LIMITS.customers = was.customers;
  });
  var created;
  await test('create: the new rows become sites on the caller\'s account in one go; a second run creates nothing', async function () {
    var pv = await cpost({ action: 'sites-preview', text: EMAIL + '\n500 Juniper Mesa Rd, Denver, CO 80202' });
    var rows = pv.rows.map(function (x) { return { name: x.name, address: x.address, lat: x.geo && x.geo.lat, lng: x.geo && x.geo.lng, ref: x.ref }; });
    rows[0].name = 'Boulder flagship'; rows[0].ref = 'VC-101';
    var r = await cpost({ action: 'sites-create', rows: rows }); created = r.created;
    assert.equal(r.created.length, 6); assert.deepEqual(r.existing.map(function (x) { return x.id; }), ['site_existing-yard']);
    var b0 = db.data.get(O + '/sites/' + r.created[0].id); assert.equal(b0.customerId, 'company_volt'); assert.equal(b0.source, 'customer-list'); assert.equal(b0.createdBy, 'ops@voltline.example'); assert.equal(b0.ref, 'VC-101'); assert.equal(b0.lat, 39.7); assert.equal(b0.name, 'Boulder flagship');
    assert.equal(r.created[0].ref, 'VC-101');
    var again = await cpost({ action: 'sites-create', rows: rows }); assert.equal(again.created.length, 0); assert.equal(again.existing.length, 7); assert.equal(sitesOf('company_volt').length, 7);
  });
  await test('create: an edited row from the browser is validated like a pasted one; nothing is created on a bad row', async function () {
    var before = sitesOf().length;
    await rejects(cpost({ action: 'sites-create', rows: [{ name: 'Good', address: { line1: '1 Good Rd', city: 'Aurora', state: 'CO', zip: '80010' } }, { name: 'Bad', address: { line1: '2 Bad Rd', city: 'Aurora', state: 'CO', zip: '800' } }] }), 400, /Row 2 \(Bad\): ZIP "800" must be 5 digits.*Nothing was created/);
    assert.equal(sitesOf().length, before);
    await rejects(cpost({ action: 'sites-create', rows: new Array(201).fill({ name: 'x', address: {} }) }), 400, /At most 200/);
  });
  await test('create: an id another account already holds is never "exists": the new site takes the next free suffix', async function () {
    var base = C.siteId('company_volt', { name: 'Mesa, AZ', address: { zip: '85201' } });
    db.seed(O + '/sites/' + base, { orgId: ORG, name: 'Mesa, AZ', customerId: 'someone_else', address: { line1: '9 Elsewhere Ave', city: 'Mesa', state: 'AZ', zip: '85201' }, status: 'active' });
    var r = await cpost({ action: 'sites-create', rows: [{ name: 'Mesa, AZ', address: { line1: '14 Saguaro Bend', city: 'Mesa', state: 'AZ', zip: '85201' } }] });
    assert.equal(r.created[0].id, base + '-2'); assert.equal(db.data.get(O + '/sites/' + base).customerId, 'someone_else', 'the other record is untouched');
  });
  var mySites;
  await test('plan: the order\'s units spread over the account\'s sites; another account\'s order or site is not reachable', async function () {
    mySites = (await cget()).sites.filter(function (x) { return x.id !== 'site_existing-yard'; }).slice(0, 4).map(function (x) { return { siteId: x.id, units: null }; });
    var pv = await cpost({ action: 'plan-preview', orderNo: 'CC-26-5001', sites: mySites });
    assert.deepEqual(pv.perSite.map(function (x) { return x.count; }), [3, 3, 3, 3]); assert.equal(pv.assignments.length, 12); assert.equal(pv.eligible, 12); assert.equal(pv.orderId, undefined);
    await rejects(cpost({ action: 'plan-preview', orderNo: 'CC-26-5002', sites: mySites }), 404, /not on your account/);
    await rejects(cpost({ action: 'plan-preview', orderNo: 'CC-26-5001', sites: [{ siteId: 'site_other-yard' }] }), 404, /Site not found on your account/);
    await rejects(cpost({ action: 'plan-preview', orderNo: 'CC-26-5001', sites: mySites }, OTHER), 404, /not on your account/);
    await rejects(cpost({ action: 'sites-create', rows: [{ name: 'x', address: { line1: '1 A St', city: 'Mesa', state: 'AZ', zip: '85201' } }] }, OTHER).then(function (r) { assert.equal(db.data.get(O + '/sites/' + r.created[0].id).customerId, 'company_other', 'a site is always the caller\'s own account'); throw A.httpError(418, 'ok'); }), 418);
  });
  await test('apply: needs the Assign confirmation and the preview it came from; each unit gets its "going to" with one event', async function () {
    var pv = await cpost({ action: 'plan-preview', orderNo: 'CC-26-5001', sites: mySites });
    await rejects(cpost({ action: 'plan-apply', orderNo: 'CC-26-5001', sites: mySites }), 400, /Preview the plan/);
    await rejects(cpost({ action: 'plan-apply', orderNo: 'CC-26-5001', sites: mySites, confirm: true, planKey: 'p0.1' }), 409, /changed since your preview/);
    await rejects(cpost({ action: 'plan-apply', orderNo: 'CC-26-5001', sites: mySites, confirm: true, perSite: pv.perSite.map(function (x, i) { return { siteId: x.siteId, count: i ? x.count : x.count + 1 }; }) }), 409, /changed since your preview/);
    assert.equal(C.planMatches(pv, { perSite: pv.perSite }), true);
    var r = await cpost({ action: 'plan-apply', orderNo: 'CC-26-5001', sites: mySites, confirm: true, planKey: pv.planKey });
    assert.equal(r.applied, 12); assert.deepEqual(r.skipped, []); assert.equal(r.more, false); assert.equal(r.assignments.length, 12); assert.ok(r.assignments.every(function (a) { return a.how === 'new'; }));
    var c1 = custodyOf('VC-1'); assert.equal(c1.plannedSiteId, mySites[0].siteId); assert.equal(c1.plannedBy, 'customer'); assert.equal(c1.customerId, 'company_volt');
    var ev = events('VC-1'); assert.equal(ev.length, 1); assert.equal(ev[0].type, 'destination'); assert.equal(ev[0].via, 'site-list'); assert.equal(ev[0].planId, r.planId); assert.equal(ev[0].method, 'customer'); assert.equal(ev[0].orderId, 'ov1');
    var again = await cpost({ action: 'plan-apply', orderNo: 'CC-26-5001', sites: mySites, confirm: true, planKey: pv.planKey });
    assert.equal(again.applied, 0); assert.ok(again.assignments.every(function (a) { return a.how === 'unchanged'; })); assert.equal(events('VC-1').length, 1, 'an unchanged unit is not written again');
    var d = await cget(); assert.deepEqual(d.sites.filter(function (x) { return x.id === mySites[0].siteId; })[0].planned, 3); assert.equal(d.orders[0].planned, 12);
  });
  await test('apply re-reads each unit inside its transaction and skips, with the reason, one that changed since the preview', async function () {
    var sites = mySites.slice(0, 2).concat([{ siteId: 'site_existing-yard', units: 2 }]).map(function (x, i) { return { siteId: x.siteId, units: i < 2 ? 5 : 2 }; });
    var held = await cpost({ action: 'plan-preview', orderNo: 'CC-26-5001', sites: sites });
    assert.equal(held.elsewhere.length, 6, 'the units going to the two sites left off the list are not taken without replan'); assert.match(held.problems[0], /asks for 12 units, but only 6 .* \(6 already going to other sites\)\. Lower/);
    var pv = await cpost({ action: 'plan-preview', orderNo: 'CC-26-5001', sites: sites, replan: true });
    assert.deepEqual(pv.problems, []); assert.ok(pv.writes > 0); assert.equal(pv.assignments.filter(function (a) { return a.serial === 'VC-7'; })[0].how, 'changed');
    var real = db.runTransaction, once = true;
    db.runTransaction = function (fn) { if (once) { once = false; var p = 'plant_units/' + ORG + '__VC-7', u = db.data.get(p); u.custody = Object.assign({}, u.custody, { state: 'scrapped' }); } return real.call(db, fn); };
    var r = await cpost({ action: 'plan-apply', orderNo: 'CC-26-5001', sites: sites, replan: true, confirm: true, planKey: pv.planKey });
    db.runTransaction = real;
    assert.deepEqual(r.skipped, [{ serial: 'VC-7', why: 'Scrapped' }]); assert.equal(r.assignments.filter(function (a) { return a.serial === 'VC-7'; })[0].how, 'skipped');
    assert.equal(r.applied, pv.writes - 1);
  });
  await test('at most 200 units are written per call; the rest follow on the next', async function () {
    db.seed('orders/ov2', { orgId: ORG, orderNo: 'CC-26-5003', status: 'in_fulfilment', createdAt: '2026-09-04T10:00:00Z', customerId: 'company_volt', customer: { email: 'ops@voltline.example' } });
    seedUnits('ov2', 'BIG-', 230);
    var sites = mySites.slice(0, 2), pv = await cpost({ action: 'plan-preview', orderNo: 'CC-26-5003', sites: sites });
    var r1 = await cpost({ action: 'plan-apply', orderNo: 'CC-26-5003', sites: sites, confirm: true, planKey: pv.planKey });
    assert.equal(r1.applied, 200); assert.equal(r1.more, true); assert.equal(r1.assignments.filter(function (a) { return a.how === 'pending'; }).length, 30);
    var r2 = await cpost({ action: 'plan-apply', orderNo: 'CC-26-5003', sites: sites, confirm: true, planKey: pv.planKey });
    assert.equal(r2.applied, 30); assert.equal(r2.more, false);
    var r3 = await cpost({ action: 'plan-apply', orderNo: 'CC-26-5003', sites: sites, confirm: true, planKey: pv.planKey }); assert.equal(r3.applied, 0);
  });
  await test('one apply over 200 writes whose releases straddle two calls finishes on the preview\'s planKey (no 409 after the first call wrote)', async function () {
    db.seed('orders/ov4', { orgId: ORG, orderNo: 'CC-26-5004', status: 'in_fulfilment', createdAt: '2026-09-05T10:00:00Z', customerId: 'company_volt', customer: { email: 'ops@voltline.example' } });
    seedUnits('ov4', 'REL-', 300);
    var s1 = mySites[0].siteId, s2 = mySites[1].siteId;
    async function applyAll(sites) { var pv = await cpost({ action: 'plan-preview', orderNo: 'CC-26-5004', sites: sites }), n = 0, r; do { r = await cpost({ action: 'plan-apply', orderNo: 'CC-26-5004', sites: sites, confirm: true, planKey: pv.planKey }); n++; } while (r.more && r.applied > 0 && n < 5); return { pv: pv, calls: n, last: r }; }
    var a = await applyAll([{ siteId: s1, units: null }]); assert.equal(a.calls, 2);
    var b = await applyAll([{ siteId: s1, units: 0 }, { siteId: s2, units: 100 }]);
    assert.equal(b.pv.writes, 300); assert.equal(b.pv.released.length, 200); assert.equal(b.calls, 2); assert.equal(b.last.more, false);
    var at = {}; for (var i = 1; i <= 300; i++) { var k = custodyOf('REL-' + i).plannedSiteId || '-'; at[k] = (at[k] || 0) + 1; }
    var want = {}; want[s2] = 100; want['-'] = 200; assert.deepEqual(at, want);
  });
  await test('a login moved to another account meanwhile writes nothing', async function () {
    var one = [{ siteId: mySites[3].siteId }], pv = await cpost({ action: 'plan-preview', orderNo: 'CC-26-5001', sites: one, replan: true });
    assert.ok(pv.writes > 0); var before = events('VC-1').length;
    var real = db.runTransaction, once = true;
    db.runTransaction = function (fn) { if (once) { once = false; db.seed(O + '/customer_index/ops@voltline.example', { customerId: 'company_other' }); } return real.call(db, fn); };
    await rejects(cpost({ action: 'plan-apply', orderNo: 'CC-26-5001', sites: one, replan: true, confirm: true, planKey: pv.planKey }), 409, /moved to another account/);
    assert.equal(events('VC-1').length, before);
    db.runTransaction = real; db.seed(O + '/customer_index/ops@voltline.example', { customerId: 'company_volt' });
  });
  await test('a unit of the order stamped for ANOTHER account is left out of the customer\'s plan and never re-stamped; one stamped meanwhile is skipped', async function () {
    seed();
    function stamp(sn, c) { var p = 'plant_units/' + ORG + '__' + sn, u = db.data.get(p); u.custody = Object.assign({}, u.custody || {}, c); db.seed(p, u); }
    stamp('VC-2', { status: 'in_transit', customerId: 'company_other' }); stamp('VC-3', { customerId: 'company_volt' });
    var yard = [{ siteId: 'site_existing-yard', units: null }];
    var pv = await cpost({ action: 'plan-preview', orderNo: 'CC-26-5001', sites: yard });
    assert.deepEqual(pv.notPlanned.map(function (x) { return x.serial + ':' + x.why + ':' + x.say; }), ['VC-2:account:On another customer account']); assert.equal(pv.assignments.length, 11);
    var real = db.runTransaction, once = true;
    db.runTransaction = function (fn) { if (once) { once = false; stamp('VC-4', { customerId: 'company_other' }); } return real.call(db, fn); };
    var r = await cpost({ action: 'plan-apply', orderNo: 'CC-26-5001', sites: yard, confirm: true, planKey: pv.planKey });
    db.runTransaction = real;
    assert.deepEqual(r.skipped, [{ serial: 'VC-4', why: 'On another customer account' }]); assert.equal(r.applied, 10);
    assert.deepEqual([custodyOf('VC-2').customerId, custodyOf('VC-2').plannedSiteId], ['company_other', undefined], 'left out and not re-stamped');
    assert.deepEqual([custodyOf('VC-4').customerId, custodyOf('VC-4').plannedSiteId], ['company_other', undefined]);
    assert.deepEqual([custodyOf('VC-1').customerId, custodyOf('VC-1').plannedSiteId, custodyOf('VC-3').customerId], ['company_volt', 'site_existing-yard', 'company_volt']);
  });

  console.log('\nthe office (api/logic-custody.js)');
  seed();
  await test('the office names the account: no customerId, a closed account or an unknown one is refused', async function () {
    await rejects(opost({ action: 'sites-preview', text: EMAIL }), 400, /customer account/);
    await rejects(opost({ action: 'sites-create', rows: [] }), 400, /customer account/);
    await rejects(opost({ action: 'sites-preview', text: EMAIL, customerId: 'company_shut' }), 404, /closed/);
    await rejects(opost({ action: 'sites-preview', text: EMAIL, customerId: 'company_nope' }), 404);
    await rejects(oget({ view: 'plan' }), 400, /customer account/);
  });
  var officeSites;
  await test('the office previews and creates the account\'s sites from the list, audited; idempotent', async function () {
    GEO.length = 0;
    var pv = await opost({ action: 'sites-preview', text: EMAIL, customerId: 'company_volt' }); assert.deepEqual(pv.summary, { rows: 6, new: 6, existing: 0, problems: 0 }); assert.equal(GEO.length, 6);
    var rows = pv.rows.map(function (x) { return { name: x.name, address: x.address, lat: x.geo && x.geo.lat, lng: x.geo && x.geo.lng }; });
    var r = await opost({ action: 'sites-create', customerId: 'company_volt', rows: rows }); assert.equal(r.created.length, 6);
    assert.equal(db.data.get(O + '/sites/' + r.created[0].id).source, 'office-list'); assert.equal(r.created[0].customerId, 'company_volt'); assert.equal(r.created[0].createdBy, 'pm@cleancell.us');
    var audits = Array.from(db.data.values()).filter(function (v) { return v.action === 'custody-sites-created'; }); assert.equal(audits.length, 1); assert.equal(audits[0].created.length, 6);
    var again = await opost({ action: 'sites-create', customerId: 'company_volt', rows: rows }); assert.equal(again.created.length, 0); assert.equal(again.existing.length, 6);
    officeSites = r.created.slice(0, 3).map(function (x) { return { siteId: x.id }; });
  });
  await test('view=plan: one account\'s sites and its orders with units, by orderId', async function () {
    var d = await oget({ view: 'plan', customerId: 'company_volt' });
    assert.deepEqual(d.customer, { id: 'company_volt', name: 'Voltline Capital', status: 'active', open: true }); assert.equal(d.sites.length, 7);
    assert.deepEqual(d.orders, [{ orderId: 'ov1', orderNo: 'CC-26-5001', po: 'VC-PO-77', units: 12, eligible: 12, building: 12, planned: 0 }]);
    await rejects(oget({ view: 'plan', customerId: 'company_nope' }), 404);
  });
  await test('the office plans an order over the account\'s sites; another account\'s site is refused (siteFits)', async function () {
    await rejects(opost({ action: 'plan-preview', sites: officeSites }), 400, /Choose the order/);
    await rejects(opost({ action: 'plan-preview', orderId: 'ov1', sites: [{ siteId: 'site_other-yard' }] }), 409, /another customer account/);
    await rejects(opost({ action: 'plan-preview', orderId: 'ov1', sites: [{ siteId: 'site_nope' }] }), 404);
    var pv = await opost({ action: 'plan-preview', orderId: 'ov1', sites: officeSites }); assert.deepEqual(pv.perSite.map(function (x) { return x.count; }), [4, 4, 4]); assert.equal(pv.orderNo, 'CC-26-5001');
  });
  await test('the office applies: method manual, the account stamped only where empty, one audit row; a unit stamped for another account is left out', async function () {
    var p = 'plant_units/' + ORG + '__VC-12', u = db.data.get(p); u.custody = { customerId: 'company_other' }; db.seed(p, u);
    var p11 = 'plant_units/' + ORG + '__VC-11', u11 = db.data.get(p11); u11.custody = { customerId: 'company_volt' }; db.seed(p11, u11);
    var pv = await opost({ action: 'plan-preview', orderId: 'ov1', sites: officeSites });
    assert.deepEqual(pv.notPlanned.map(function (x) { return x.serial + ':' + x.why; }), ['VC-12:account']); assert.deepEqual(pv.perSite.map(function (x) { return x.count; }), [4, 4, 3]);
    var r = await opost({ action: 'plan-apply', orderId: 'ov1', sites: officeSites, confirm: true, planKey: pv.planKey });
    assert.equal(r.applied, 11); var ev = events('VC-1'); assert.equal(ev[0].method, 'manual'); assert.equal(ev[0].via, 'site-list'); assert.equal(custodyOf('VC-1').plannedBy, 'office'); assert.equal(custodyOf('VC-1').customerId, 'company_volt');
    assert.equal(custodyOf('VC-12').plannedSiteId, undefined);
    var audits = Array.from(db.data.values()).filter(function (v) { return v.action === 'custody-site-plan'; }); assert.equal(audits.length, 1); assert.equal(audits[0].applied, 11); assert.equal(audits[0].planId, r.planId);
  });
  await test('the office overview lists "going to" from every unit, the ones being built included, with a count per site', async function () {
    var d = await oget({}); assert.equal(d.planned.length, 11); assert.equal(d.units.length, 0, 'the off-plant list is unchanged');
    var s0 = d.sites.filter(function (x) { return x.id === officeSites[0].siteId; })[0]; assert.equal(s0.planned, 4); assert.equal(s0.units, 0);
    var v = await oget({ view: 'plan', customerId: 'company_volt' }); assert.equal(v.orders[0].planned, 11); assert.equal(v.sites.filter(function (x) { return x.id === officeSites[0].siteId; })[0].planned, 4);
    var reg = await oget({ view: 'register' }); assert.equal(reg.rows.filter(function (x) { return x.serial === 'VC-1'; })[0].goingTo, db.data.get(O + '/sites/' + officeSites[0].siteId).name);
  });

  console.log('\nthe sample answers the same way');
  await test('the sandbox: preview, create, plan and apply on both paths, with no geocoding', function () {
    var st = F.initialState(), V = F.views(st);
    var cv = V.mySitesJson(); assert.deepEqual(cv.orders, [{ orderNo: 'CC-26-4419', po: 'RCC-2200', units: 3, eligible: 3, building: 2, planned: 0 }]); assert.equal(cv.units.length, 1, 'the fleet list is unchanged');
    var pv = F.post(st, '/api/my-sites', 'org=cleancell.us', { action: 'sites-preview', text: '- 1450 Aspen Hollow Dr, Boulder, CO 80301 x2\n- 88 Prairie Lark Ln, Joliet, IL 60431\n- 1200 Depot Road, Bakersfield, CA 93307' }, 'ops@riverside.example');
    assert.deepEqual(pv.summary, { rows: 3, new: 2, existing: 1, problems: 0 }); assert.ok(pv.rows.every(function (x) { return x.geo === null && x.lookedUp === false; }));
    var cr = F.post(st, '/api/my-sites', '', { action: 'sites-create', rows: pv.rows.map(function (x) { return { name: x.name, address: x.address }; }) }, 'ops@riverside.example');
    assert.equal(cr.created.length, 2); assert.equal(cr.existing.length, 1); assert.equal(F.post(st, '/api/my-sites', '', { action: 'sites-create', rows: pv.rows.map(function (x) { return { name: x.name, address: x.address }; }) }).created.length, 0);
    var sites = V.mySitesJson().sites.map(function (x) { return { siteId: x.id, units: null }; });
    assert.equal(F.post(st, '/api/my-sites', '', { action: 'plan-preview', orderNo: 'CC-26-4420', sites: sites }).status, 404);
    var pp = F.post(st, '/api/my-sites', '', { action: 'plan-preview', orderNo: 'CC-26-4419', sites: sites }); assert.deepEqual(pp.perSite.map(function (x) { return x.count; }), [1, 1, 1]);
    var ap = F.post(st, '/api/my-sites', '', { action: 'plan-apply', orderNo: 'CC-26-4419', sites: sites, confirm: true, planKey: pp.planKey }, 'ops@riverside.example');
    assert.equal(ap.applied, 3); assert.equal(st.units.filter(function (u) { return u.serial === 'CC418-26-44193'; })[0].custody.plannedBy, 'customer');
    assert.equal(V.mySitesJson().orders[0].planned, 3); assert.equal(st.custodyEvents['CC418-26-44193'][0].via, 'site-list');
    assert.equal(F.post(st, '/api/my-sites', '', { action: 'plan-apply', orderNo: 'CC-26-4419', sites: sites, confirm: true }).applied, 0, 'a re-run writes nothing');
    var plan = V.custodyJson('org=cleancell.us&view=plan&customerId=company_riverside'); assert.equal(plan.sites.length, 3); assert.equal(plan.orders[0].orderId, 'o1'); assert.equal(plan.orders[0].planned, 3);
    assert.equal(V.custodyJson('org=cleancell.us').planned.length, 3, 'the overview lists units being built that are going somewhere');
    assert.equal(F.post(st, '/api/logic-custody', '', { action: 'sites-preview', text: 'x' }).status, 400);
    var op = F.post(st, '/api/logic-custody', '', { action: 'sites-preview', customerId: 'company_harbor', text: '- 915 Harbor Finch Way, Tacoma, WA 98402' }); assert.equal(op.summary.new, 1);
    var oc = F.post(st, '/api/logic-custody', '', { action: 'sites-create', customerId: 'company_harbor', rows: [{ name: 'Tacoma, WA', address: op.rows[0].address }] }); assert.equal(oc.created[0].source, 'office-list');
    assert.equal(F.post(st, '/api/logic-custody', '', { action: 'plan-preview', orderId: 'o1', sites: [{ siteId: oc.created[0].id }] }).status, 409, 'another account\'s site');
    assert.match(F.post(st, '/api/logic-custody', '', { action: 'plan-preview', orderId: 'o1', sites: [{ siteId: sites[0].siteId, units: 3 }] }).problems[0], /2 already going to other sites/);
    var opv = F.post(st, '/api/logic-custody', '', { action: 'plan-preview', orderId: 'o1', replan: true, sites: [{ siteId: sites[0].siteId, units: 3 }] }); assert.equal(opv.writes, 2);
    var oap = F.post(st, '/api/logic-custody', '', { action: 'plan-apply', orderId: 'o1', replan: true, sites: [{ siteId: sites[0].siteId, units: 3 }], confirm: true, planKey: opv.planKey }); assert.equal(oap.applied, 2);
    assert.equal(st.custodyEvents['CC418-26-44193'][1].method, 'manual');
    assert.equal(V.custodyJson('org=cleancell.us&view=plan&customerId=company_riverside').sites[0].planned, 3);
  });
  await test('the sandbox leaves out a unit stamped for another account on the customer\'s door too', function () {
    var st = F.initialState(), V = F.views(st), u = st.units.filter(function (x) { return x.serial === 'CC418-26-44195'; })[0];
    u.custody = { customerId: 'company_harbor' };
    var sites = V.mySitesJson().sites.map(function (x) { return { siteId: x.id, units: null }; });
    var pp = F.post(st, '/api/my-sites', '', { action: 'plan-preview', orderNo: 'CC-26-4419', sites: sites }, 'ops@riverside.example');
    assert.deepEqual(pp.notPlanned.map(function (x) { return x.serial + ':' + x.why; }), ['CC418-26-44195:account']);
    var ap = F.post(st, '/api/my-sites', '', { action: 'plan-apply', orderNo: 'CC-26-4419', sites: sites, confirm: true, planKey: pp.planKey }, 'ops@riverside.example');
    assert.equal(ap.applied, 2); assert.deepEqual(u.custody, { customerId: 'company_harbor' }, 'not planned, not re-stamped');
    assert.equal(F.post(st, '/api/my-sites', '', { action: 'sites-preview', text: '- 1 Elm St, Aurora, CO 80010' }).geoLimited, false);
  });
  console.log('\n' + count + ' site-list checks passed\n');
})().catch(function (e) { console.error('FAIL', e); process.exit(1); });
