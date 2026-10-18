/* A drawing's quote or BOM becomes one purchase order per OEM.
   The address, the lines and the estimate ride along. Nothing is retyped.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert = require('node:assert/strict');
var D = require('../../api/_lib/design-order');
var pass = 0;
function ok(name) { pass++; console.log('  ok  ' + name); }

var CHICAGO = '100 Main St, Chicago, IL 60601';
var AUSTIN = '100 Main St, Austin, Texas 78701';
var chi = D.parseAddress(CHICAGO, { name: 'Harbor yard' });
assert.equal(chi.line1, '100 Main St');
assert.equal(chi.city, 'Chicago');
assert.equal(chi.state, 'IL');
assert.equal(chi.zip, '60601');
assert.equal(chi.raw, CHICAGO);
var aus = D.parseAddress(AUSTIN, {});
assert.equal(aus.city, 'Austin');
assert.equal(aus.state, 'TX');
assert.equal(aus.zip, '78701');
var partial = D.parseAddress('1200 W Industrial Dr, Elgin IL', { zip: '60123', name: 'Elgin' });
assert.equal(partial.city, 'Elgin');
assert.equal(partial.state, 'IL');
assert.equal(partial.zip, '60123');
assert.equal(partial.line1, '1200 W Industrial Dr');
assert.equal(D.parseAddress('Just a street', {}).city, '');
ok('addresses stay whole: Chicago, Texas, and a ZIP the drawing already had');

var published = function (sku, name) { return { sku: sku, name: name || sku, active: true, kind: 'product' }; };
var project = { id: 'harbor-yard', name: 'Harbor yard', address: CHICAGO, state: 'IL', zip: '60601' };
var fenCat = { 'fenecon.com': [published('FENECON-IND-XXL', 'FENECON Industrial XXL')] };
var editorLine = { sku: 'FENECON-IND-XXL', description: 'FENECON Industrial XXL', qty: 1, unit: 'ea', manufacturer: 'FENECON', vendorOrgId: 'fenecon.com' };
var primeLine = { sku: 'FENECON-IND-XXL', description: 'FENECON Industrial XXL', qty: 1, unit: 'ea', manufacturer: 'FENECON', vendorOrgId: 'fenecon.com' };
var editor = D.draft({ lines: [editorLine, { sku: '', description: '2 in. EMT', qty: 400, unit: 'LF' }], catalogs: fenCat, designerOrgId: 'concordenergyusa.com', project: project, estimateCents: 125000000, orgNames: { 'fenecon.com': 'FENECON' } });
var prime = D.draft({ lines: [primeLine], catalogs: fenCat, designerOrgId: 'concordenergyusa.com', project: project, orgNames: { 'fenecon.com': 'FENECON' } });
assert.deepEqual(editor.orders[0].items, prime.orders[0].items);
assert.equal(editor.orders.length, 1);
assert.equal(editor.orders[0].orgId, 'fenecon.com');
assert.equal(editor.orders[0].items[0].qty, 1);
assert.equal(editor.orders[0].destination.address.city, 'Chicago');
assert.equal(editor.orders[0].destination.address.zip, '60601');
assert.equal(editor.orders[0].design.address, CHICAGO);
assert.equal(editor.orders[0].design.estimateCents, 125000000);
assert.equal(editor.unmatched.length, 1);
assert.equal(editor.unmatched[0].reason, 'no-sku');
assert.equal(editor.orders[0].design.lines.length, 1, 'an external OEM sees only its own slice');
assert.equal(editor.orders[0].poIntake, undefined);
assert.equal(editor.orders[0].approvedQuote, undefined);
ok('the editor line and the Prime unit key are the same order, and conduit stays on the drawing');

var none = D.draft({ lines: [editorLine], catalogs: { 'fenecon.com': [] }, designerOrgId: 'concordenergyusa.com', project: project });
assert.equal(none.orders.length, 0);
assert.equal(none.unmatched[0].reason, 'unpublished');
var stolen = D.draft({
  lines: [editorLine],
  catalogs: { 'fenecon.com': [], 'concordenergyusa.com': [published('FENECON-IND-XXL', 'XXL')] },
  designerOrgId: 'concordenergyusa.com', project: project
});
assert.equal(stolen.orders.length, 0, 'another OEM\'s unpublished line is not taken into the designer catalog');
ok('nothing published means no order');
var split = D.draft({lines:[editorLine,{sku:'OTHER-UNIT',description:'Other supplier equipment',qty:1,vendorOrgId:'other.example'}],catalogs:Object.assign({},fenCat,{'other.example':[published('OTHER-UNIT')]}),designerOrgId:'concordenergyusa.com',project:project});
assert.equal(split.orders.length,2);
split.orders.forEach(function(o){assert.equal(o.design.lines.length,1);assert.equal(o.design.lines[0].sku,o.items[0].sku);});
ok('each external OEM receives only its own BOM slice');

var excessive = D.draft({ lines: [Object.assign({}, editorLine, { qty: 6000 }), Object.assign({}, editorLine, { qty: 6000 })], catalogs: fenCat, designerOrgId: 'concordenergyusa.com', project: project });
assert.equal(excessive.orders.length, 0);
assert.equal(excessive.unmatched.length, 2);
assert(excessive.unmatched.every(function (l) { return l.reason === 'qty' && l.onOrder === false; }));
ok('combined quantities above the limit stay explicitly unmatched and never make an empty order');


var own = D.draft({
  lines: [{ sku: 'CC-C215', description: '215 kWh outdoor cabinet', qty: 2, unit: 'ea', manufacturer: 'Clean Cell' }, { sku: 'CC-C215', description: '215 kWh outdoor cabinet', qty: 3, unit: 'ea' }, { sku: 'CC-MOD-52', description: 'module', qty: 8, unit: 'ea' }, { sku: 'TRAY', description: 'tray', qty: 2.5, unit: 'ea' }],
  catalogs: { 'cleancell.us': [published('CC-C215', '215 kWh outdoor cabinet'), { sku: 'CC-MOD-52', name: 'module', active: true, kind: 'component' }] },
  designerOrgId: 'cleancell.us', project: project
});
assert.equal(own.orders.length, 1);
assert.equal(own.orders[0].orgId, 'cleancell.us');
assert.equal(own.orders[0].items.length, 1);
assert.equal(own.orders[0].items[0].qty, 5);
assert.ok(own.unmatched.some(function (l) { return l.sku === 'CC-MOD-52' && l.reason === 'unpublished'; }));
assert.ok(own.unmatched.some(function (l) { return l.sku === 'TRAY' && l.reason === 'qty'; }));
ok('the OEM\'s own catalog is their workspace, quantities add, and a component is not ordered');

var solar = D.draft({
  lines: [{ sku: 'MOD-550', description: '550 W module', qty: 40, unit: 'ea', vendorOrgId: 'solarco.example' }],
  catalogs: { 'solarco.example': [published('MOD-550', '550 W module')] },
  designerOrgId: 'concordenergyusa.com', project: { id: 'roof-1', name: 'Roof', address: AUSTIN }
});
var battery = D.draft({
  lines: [editorLine], catalogs: fenCat, designerOrgId: 'concordenergyusa.com', project: project
});
assert.deepEqual(Object.keys(solar.orders[0]).sort(), Object.keys(battery.orders[0]).sort());
assert.equal(solar.orders[0].type, undefined);
assert.equal(battery.orders[0].type, undefined);
assert.equal(solar.orders[0].items[0].sku, 'MOD-550');
assert.equal(solar.orders[0].destination.address.state, 'TX');
ok('a solar module and a battery take the same order shape');

assert.equal(D.estimateFrom({ prime: { run: { totalUsd: 10 } }, capex: 99 }, { estimateUsd: 5 }), 1000);
assert.equal(D.estimateFrom({ capex: 639000 }, {}), 63900000);
assert.equal(D.estimateFrom({}, { estimateUsd: 12.5 }), 1250);
assert.equal(D.response('ds_abc', { orgId: 'cleancell.us', orderNo: 'DS-1', items: [{ sku: 'A' }] }, 'cleancell.us', 'Clean Cell').href, '/omega-logic?org=cleancell.us&order=ds_abc#orders');
assert.equal(D.response('ds_abc', { orgId: 'fenecon.com', orderNo: 'DS-1', items: [{}] }, 'concordenergyusa.com', 'FENECON').href, undefined);
ok('the estimate is the drawing\'s, and a link opens only the caller\'s own workspace');

var FD = require('../_lib/firestore-double');
var db = new FD.DB();
var caller = { uid: 'u1', email: 'owner@cleancell.us', orgId: 'cleancell.us', staff: false };
FD.mock('../api/_lib/admin', {
  handler: function (fn) { return fn; },
  httpError: function (s, m) { var e = new Error(m); e.status = s; return e; },
  authenticate: function () { return Promise.resolve(caller); },
  canActInOrg: function (c, o) { return Promise.resolve(c.orgId === o); },
  db: function () { return db; },
  billingOf: function () { return Promise.resolve({}); },
  FieldValue: function () { return { serverTimestamp: function () { return 'TS'; }, arrayUnion: function () { return []; } }; }
});
var place = require('../../api/_lib/design-place').place;
var rfq = require('../../api/rfq');

function seedOwn() {
  db.seed('projects/harbor-yard', { orgId: 'cleancell.us', name: 'Harbor yard', address: CHICAGO, state: 'IL', capex: 639000 });
  db.seed('omega_orgs/cleancell.us', { name: 'Clean Cell', status: 'active' });
  db.seed('omega_orgs/cleancell.us/storefront/config', { products: [published('CC-C215', '215 kWh outdoor cabinet'), { sku: 'CC-MOD-52', name: 'module', kind: 'component', active: true }] });
}

(async function () {
  seedOwn();
  var body = { projectId: 'harbor-yard', address: CHICAGO, zip: '60601', toOrgIds: [], bom: [
    { sku: 'CC-C215', description: '215 kWh outdoor cabinet', qty: 2, unit: 'ea', manufacturer: 'Clean Cell' },
    { sku: '', description: '2 in. EMT', qty: 400, unit: 'LF' }
  ] };
  await assert.rejects(rfq({ method: 'POST', headers: {}, body: Object.assign({}, body, { bom: [{ sku: 'CC-C215', qty: 0 }] }) }), /positive quantity/);
  var out = await rfq({ method: 'POST', headers: {}, body: body });
  assert.equal(out.rfqId, null);
  assert.match(out.skipped, /no routable/);
  assert.equal(out.orders.length, 1);
  assert.equal(out.orders[0].sameWorkspace, true);
  assert.match(out.orders[0].href, /org=cleancell\.us/);
  assert.match(out.orders[0].href, /#orders$/);
  assert.doesNotMatch(out.orders[0].href, /\/omega-logic\?$/);
  var id = out.orders[0].id;
  var saved = (await db.collection('orders').doc(id).get()).data();
  assert.equal(saved.source, 'design');
  assert.equal(saved.status, 'new');
  assert.equal(saved.projectId, 'harbor-yard');
  assert.equal(saved.poIntake, undefined);
  assert.equal(saved.approvedQuote, undefined);
  assert.equal(saved.logic, undefined);
  assert.equal(saved.design.estimateCents, 63900000);
  assert.equal(saved.design.address, CHICAGO);
  assert.equal(saved.customer.address.city, 'Chicago');
  assert.equal(saved.customer.address.zip, '60601');
  assert.equal(saved.items[0].sku, 'CC-C215');
  assert.equal(saved.items[0].qty, 2);
  assert.equal(saved.design.lines[1].onOrder, false);
  assert.equal(saved.createdAt, 'TS');
  assert.equal(saved.customer.company, '');
  assert.equal(saved.customer.email, '');
  assert.equal(saved.customerId, undefined);
  assert.equal(Array.from(db.data.keys()).filter(function (k) { return k.indexOf('/customers/') >= 0; }).length, 0);
  await assert.rejects(rfq({ method: 'POST', headers: {}, body: Object.assign({}, body, { address: AUSTIN }) }), /site address matches/);
  var again = await rfq({ method: 'POST', headers: {}, body: body });
  assert.equal(again.orders[0].id, id);
  var n = 0;
  db.data.forEach(function (v, k) { if (k.indexOf('orders/') === 0 && k.indexOf('/events/') < 0) n++; });
  assert.equal(n, 1);
  ok('filing the drawing opens one order in the OEM workspace, and filing it again opens that same order');

  caller = { uid: 'u2', email: 'pm@concordenergyusa.com', orgId: 'concordenergyusa.com', staff: false };
  db.seed('projects/p-fen', { orgId: 'concordenergyusa.com', name: 'Model yard', address: AUSTIN, prime: { run: { totalUsd: 450000 } } });
  db.seed('omega_orgs/concordenergyusa.com', { name: 'Concord Energy' });
  db.seed('omega_orgs/fenecon.com', { name: 'FENECON', brands: ['fenecon'], status: 'active' });
  db.seed('omega_orgs/fenecon.com/storefront/config', { products: [published('FENECON-IND-XXL', 'FENECON Industrial XXL')] });
  var fen = await rfq({ method: 'POST', headers: {}, body: {
    projectId: 'p-fen', address: AUSTIN, zip: '78701', toOrgIds: [],
    bom: [{ sku: 'FENECON-IND-XXL', description: 'FENECON Industrial XXL', qty: 1, unit: 'ea', manufacturer: 'FENECON', vendorOrgId: 'fenecon.com' }]
  } });
  assert.equal(fen.recipients.length, 1);
  assert.equal(fen.recipients[0], 'fenecon.com');
  assert.equal(fen.orders.length, 1);
  assert.equal(fen.orders[0].orgId, 'fenecon.com');
  assert.equal(fen.orders[0].sameWorkspace, false);
  assert.equal(fen.orders[0].href, undefined);
  var fenDoc = (await db.collection('orders').doc(fen.orders[0].id).get()).data();
  assert.equal(fenDoc.design.estimateCents, 45000000);
  assert.equal(fenDoc.customer.address.state, 'TX');
  assert.equal(fenDoc.customer.company, '');
  ok('a line for another OEM opens in their workspace, with no link into it');

  console.log(pass + ' passed');
})().catch(function (e) { console.error(e); process.exit(1); });
