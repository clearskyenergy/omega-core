/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   Bills of materials and the materials plan. Offline: no credentials, no
   network. Three layers:

     1 · api/_lib/materials.js — the explosion is netted level by level, in
         low-level-code order, and stock is consumed by the firmest demand
         first. Every one of those clauses has a case below that fails if it
         is dropped.
     2 · api/_lib/logic-catalog.js — a component is a third kind that the
         BESS picker drops; a bill of materials is validated as a graph.
     3 · the surfaces that could publish a component — api/embed-config.js,
         omega-bess-products.js, api/orders.js — refuse it.

   node scripts/test-materials.js */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..');
var M = require('../api/_lib/materials');
/* api/_lib/admin.js needs firebase-admin; nothing here does. The mock is
   installed before anything that requires it (logic-catalog, the endpoint). */
var db = null;
var A = { db: function () { return db; }, httpError: function (s, m) { var e = new Error(m); e.status = s; return e; },
  safeOrg: function (s) { return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(s || '') ? s : ''; },
  authenticate: async function (r) { return r.caller; }, handler: function (f) { return f; }, FieldValue: function () { return { serverTimestamp: function () { return 1; } }; } };
function mock(p, e) { require.cache[require.resolve(p)] = { id: require.resolve(p), filename: require.resolve(p), loaded: true, exports: e }; }
mock('../api/_lib/admin', A);
var pass = 0, fail = 0;
function ok(label, yes, detail) {
  console.log('  ' + (yes ? 'PASS' : 'FAIL') + '  ' + label + (detail !== undefined && !yes ? '  got: ' + JSON.stringify(detail) : ''));
  if (yes) pass++; else fail++;
}
function rejects(label, fn, words) {
  try { fn(); ok(label, false, 'did not reject'); }
  catch (e) { ok(label, (!words || String(e.message).indexOf(words) >= 0) && e.status === 400, e.message); }
}
function row(planned, sku) { return planned.rows.filter(function (r) { return r.sku === sku; })[0]; }

/* A cabinet of eight modules; a module of 104 cells and 2.5 m of harness. */
var CATALOG = [
  { sku: 'CAB', name: 'Cabinet', kind: 'product', leadTimeDays: 20, bom: [{ sku: 'MOD', qty: 8, unit: 'ea' }, { sku: 'BMS', qty: 1, unit: 'ea' }, { sku: 'ENC', qty: 1, unit: 'ea' }] },
  { sku: 'MOD', name: 'Module', kind: 'component', kwh: 5.2, leadTimeDays: 10, bom: [{ sku: 'CELL', qty: 104, unit: 'ea' }, { sku: 'HARN', qty: 2.5, unit: 'm' }] },
  { sku: 'CELL', name: 'LFP cell 280Ah', kind: 'component', unit: 'ea', moq: 1000, leadTimeDays: 60, supplier: 'EVE' },
  { sku: 'BMS', name: 'Master BMS', kind: 'component', unit: 'ea', leadTimeDays: 30 },
  { sku: 'ENC', name: 'Enclosure', kind: 'component', unit: 'ea', leadTimeDays: 45 },
  { sku: 'HARN', name: 'Harness', kind: 'component', unit: 'm', leadTimeDays: 14 },
  { sku: 'INSTALL', name: 'Installation', kind: 'service' }
];
var NOW = '2026-09-21';

console.log('\nmaterials plan — the explosion');
(function () {
  var p = M.plan({ now: NOW, products: CATALOG, stock: { MOD: { onHand: 8 } },
    works: [{ id: 'wo_1', orderNo: 'CC-1', status: 'awaiting_serials', requirements: [{ sku: 'CAB', qty: 5 }], registeredCounts: {}, dueDate: '2026-12-01' }] });
  ok('five cabinets to build', row(p, 'CAB').net.committed === 5 && row(p, 'CAB').suggestedOrder === 5);
  ok('forty modules gross, eight on the shelf, thirty-two to make', row(p, 'MOD').gross.committed === 40 && row(p, 'MOD').net.committed === 32, row(p, 'MOD'));
  ok('cells are exploded from the NET modules, not the gross', row(p, 'CELL').gross.committed === 32 * 104, row(p, 'CELL').gross);
  ok('  so the eight shelf modules save 832 cells', row(p, 'CELL').gross.committed === 4160 - 832);
  ok('  and the suggested order rounds up to the MOQ', row(p, 'CELL').suggestedOrder === 4000, row(p, 'CELL').suggestedOrder);
  ok('harness is fractional in metres', row(p, 'HARN').net.committed === 80 && row(p, 'HARN').unit === 'm' && row(p, 'HARN').suggestedOrder === 80);
  ok('the enclosure and BMS follow the cabinet count', row(p, 'ENC').net.committed === 5 && row(p, 'BMS').net.committed === 5);
  ok('order-by is need-by minus the lead time', row(p, 'CELL').needBy === '2026-12-01' && row(p, 'CELL').orderBy === '2026-10-02', row(p, 'CELL'));
  ok('  and need-by propagates down the tree', row(p, 'HARN').needBy === '2026-12-01');
  ok('nothing is late yet', p.summary.late === 0 && !row(p, 'CELL').late);
  ok('a service never appears', !row(p, 'INSTALL'));
  ok('the driver names the works order, and the child names its assembly',
     row(p, 'CAB').drivers[0].ref === 'CC-1' && row(p, 'CELL').drivers[0].kind === 'assembly' && row(p, 'CELL').drivers[0].ref === 'MOD');
  ok('summary: five components carried, four leaf parts short, one sub-assembly to make', p.summary.components === 5 && p.summary.short === 4 && p.summary.toMake === 2, p.summary);
  ok('the module is a sub-assembly: 32 to BUILD, never on the purchase list', row(p, 'MOD').make === true && row(p, 'MOD').suggestedOrder === 32 && !M.purchaseList(p).some(function (r) { return r.sku === 'MOD'; }));
  ok('  and the purchase list is exactly the four leaf parts', M.purchaseList(p).map(function (r) { return r.sku; }).sort().join(',') === 'BMS,CELL,ENC,HARN');
})();

console.log('\nmaterials plan — stock goes to the firmest demand first');
(function () {
  var p = M.plan({ now: NOW, products: CATALOG, stock: { CAB: { onHand: 2 } },
    orders: [{ id: 'a', orderNo: 'A', status: 'accepted', items: [{ sku: 'CAB', qty: 2 }] },
             { id: 'b', orderNo: 'B', status: 'new', items: [{ sku: 'CAB', qty: 3 }, { sku: 'INSTALL', qty: 1, kind: 'service' }] }] });
  var cab = row(p, 'CAB');
  ok('two finished cabinets cover the priced order entirely', cab.gross.pipeline === 2 && cab.net.pipeline === 0);
  ok('  and none of the forecast', cab.net.forecast === 3);
  ok('so the cells below are forecast only', row(p, 'CELL').net.forecast === 3 * 8 * 104 && row(p, 'CELL').net.committed === 0 && row(p, 'CELL').net.pipeline === 0);
  ok('  which does NOT make a purchase suggestion', row(p, 'CELL').suggestedOrder === 0 && p.summary.short === 0);
  ok('  and appears on nobody\'s purchase list', M.purchaseList(p).length === 0);
  var q = M.plan({ now: NOW, products: CATALOG, stock: { CAB: { onHand: 1 } },
    works: [{ id: 'w', orderNo: 'W', status: 'released', requirements: [{ sku: 'CAB', qty: 3 }], registeredCounts: { CAB: 1 } }],
    orders: [{ id: 'a', orderNo: 'A', status: 'quoted', items: [{ sku: 'CAB', qty: 2 }] }] });
  ok('a started unit comes off the committed count', row(q, 'CAB').gross.committed === 2, row(q, 'CAB').gross);
  ok('  the shelf unit goes to committed before pipeline', row(q, 'CAB').net.committed === 1 && row(q, 'CAB').net.pipeline === 2);
})();

console.log('\nmaterials plan — what is NOT counted');
(function () {
  var p = M.plan({ now: NOW, products: CATALOG,
    works: [{ id: 'done', status: 'complete', requirements: [{ sku: 'CAB', qty: 9 }] },
            { id: 'live', status: 'awaiting_serials', requirements: [{ sku: 'CAB', qty: 1 }] }],
    orders: [{ id: 'released', status: 'in_fulfilment', worksOrderId: 'live', items: [{ sku: 'CAB', qty: 1 }] },
             { id: 'x', status: 'cancelled', items: [{ sku: 'CAB', qty: 7 }] },
             { id: 'y', status: 'accepted', cancelRequested: true, items: [{ sku: 'CAB', qty: 7 }] },
             { id: 'z', status: 'shipped', items: [{ sku: 'CAB', qty: 7 }] },
             { id: 'odd', status: 'new', items: [{ sku: 'NOT-IN-CATALOG', qty: 1 }] }] });
  ok('a finished works order is not demand', row(p, 'CAB').gross.committed === 1);
  ok('an order with a works order is counted ONCE, through the works order', row(p, 'CAB').gross.total === 1, row(p, 'CAB').gross);
  ok('cancelled, cancel-requested and shipped orders are ignored', row(p, 'CAB').gross.pipeline === 0 && row(p, 'CAB').gross.forecast === 0);
  ok('a SKU the catalog does not know is reported, not thrown', p.unknownSkus.length === 1 && p.unknownSkus[0] === 'NOT-IN-CATALOG');
  ok('a component with no demand and no stock is not a row', !row(p, 'HARN') === false && row(p, 'HARN').gross.total > 0 && !row(M.plan({ products: CATALOG }), 'HARN'));
})();

console.log('\nmaterials plan — late, and the order of the list');
(function () {
  var p = M.plan({ now: NOW, products: CATALOG,
    works: [{ id: 'soon', orderNo: 'SOON', status: 'awaiting_serials', requirements: [{ sku: 'CAB', qty: 1 }], dueDate: '2026-10-15' }] });
  ok('cells with a 60-day lead and a need-by 24 days out are late', row(p, 'CELL').late === true && row(p, 'CELL').orderBy === '2026-08-16');
  ok('  the enclosure (45 days) is late too, the harness (14) is not', row(p, 'ENC').late === true && row(p, 'HARN').late === false);
  ok('late rows come first', p.rows[0].late === true && p.summary.late === 3, p.rows.map(function (r) { return r.sku + (r.late ? '!' : ''); }));
  ok('  a sub-assembly is never "late" — its parts are', row(p, 'MOD').late === false && row(p, 'MOD').orderBy !== null);
  var stocked = M.plan({ now: NOW, products: CATALOG, stock: { CELL: { onHand: 0, onOrder: 104 } },
    works: [{ id: 'soon', status: 'awaiting_serials', requirements: [{ sku: 'CAB', qty: 1 }], dueDate: '2026-10-15' }] });
  ok('material already on order is not late — there is nothing left to order', row(stocked, 'CELL').net.total === 8 * 104 - 104 && row(stocked, 'CELL').late === true);
  var covered = M.plan({ now: NOW, products: CATALOG, stock: { CELL: { onOrder: 832 } },
    works: [{ id: 'soon', status: 'awaiting_serials', requirements: [{ sku: 'CAB', qty: 1 }], dueDate: '2026-10-15' }] });
  ok('  fully covered cells are not late and not on the list', row(covered, 'CELL').late === false && row(covered, 'CELL').suggestedOrder === 0);
})();

console.log('\nmaterials plan — yield, and which works order a shortfall belongs to');
(function () {
  var cat = JSON.parse(JSON.stringify(CATALOG));
  cat[1].bom[0].yieldPct = 98;          /* 2% of cells fail incoming test */
  cat[1].bom[1].yieldPct = 95;          /* harness offcuts */
  var p = M.plan({ now: NOW, products: cat,
    works: [{ id: 'wo_1', orderNo: 'CC-1', status: 'awaiting_serials', requirements: [{ sku: 'CAB', qty: 1 }], dueDate: '2026-12-01' },
            { id: 'wo_2', orderNo: 'CC-2', status: 'awaiting_serials', requirements: [{ sku: 'CAB', qty: 1 }], dueDate: '2026-12-15' }] });
  ok('yield divides the issued quantity: 2 × 8 × 104 / 0.98 = 1697.96 cells, to four places', Math.abs(row(p, 'CELL').gross.committed - 2 * 8 * 104 / 0.98) < 0.0001, row(p, 'CELL').gross);
  ok('  harness at 95%: 2 × 8 × 2.5 / 0.95', Math.abs(row(p, 'HARN').gross.committed - 42.1053) < 0.001, row(p, 'HARN').gross);
  ok('  rows fed by a yielded line are marked, unyielded ones are not', row(p, 'CELL').yielded === true && row(p, 'HARN').yielded === true && row(p, 'BMS').yielded === false && row(p, 'MOD').yielded === false);
  ok('  and the summary counts them', p.summary.yielded === 2, p.summary);
  ok('the suggested cell order still rounds to the MOQ', row(p, 'CELL').suggestedOrder === 2000);
  ok('every component knows which works orders it is short for', row(p, 'CELL').worksOrders.join(',') === 'CC-1,CC-2' && row(p, 'ENC').worksOrders.join(',') === 'CC-1,CC-2', row(p, 'CELL').worksOrders);
  var by = M.shortfallsByWorksOrder(p);
  ok('shortfalls group by works order, leaf parts only', Object.keys(by).sort().join(',') === 'CC-1,CC-2' && by['CC-1'].length === 4 && by['CC-1'][0].short > 0 && !by['CC-1'].some(function (c) { return c.sku === 'MOD'; }));
  var stocked = M.plan({ now: NOW, products: cat, stock: { MOD: { onHand: 8 }, BMS: { onHand: 1 }, ENC: { onOrder: 1 } },
    works: [{ id: 'wo_1', orderNo: 'CC-1', status: 'awaiting_serials', requirements: [{ sku: 'CAB', qty: 1 }], dueDate: '2026-12-01' }] });
  ok('  a works order that stock covers has no shortfall entry, and the cells it never needed are not even a row', Object.keys(M.shortfallsByWorksOrder(stocked)).length === 0 && row(stocked, 'CELL') === undefined, row(stocked, 'MOD'));
  ok('  the module row still knows the works order whose demand reached it — tracing is by demand, shortfall is by net', row(stocked, 'MOD').worksOrders.join(',') === 'CC-1' && row(stocked, 'MOD').net.total === 0);
  ok('a blank yield is 100', M.bomLines([{ sku: 'X', qty: 1 }])[0].yieldPct === 100 && M.bomLines([{ sku: 'X', qty: 1, yieldPct: '' }])[0].yieldPct === 100);
  rejects('a zero yield', function () { M.bomLines([{ sku: 'X', qty: 1, yieldPct: 0 }]); }, 'between 1 and 100');
  rejects('a yield over 100', function () { M.bomLines([{ sku: 'X', qty: 1, yieldPct: 101 }]); }, 'between 1 and 100');
  ok('a fractional yield is kept to two places', M.bomLines([{ sku: 'X', qty: 1, yieldPct: 97.555 }])[0].yieldPct === 97.56);
})();

console.log('\nmaterials plan — safety stock is a firm buffer, netted after real demand');
(function () {
  var cat = JSON.parse(JSON.stringify(CATALOG));
  cat[2].safetyStock = 2000;   /* keep 2,000 cells on the shelf */
  cat[3].safetyStock = 10;     /* and ten BMS boards */
  var idle = M.plan({ now: NOW, products: cat, stock: { CELL: { onHand: 500 }, BMS: { onHand: 12 } } });
  ok('with no orders at all, a shelf below its buffer is still a row, still short', row(idle, 'CELL') && row(idle, 'CELL').net.buffer === 1500 && row(idle, 'CELL').belowSafety === true, row(idle, 'CELL'));
  ok('  and the suggested order refills it to the MOQ', row(idle, 'CELL').suggestedOrder === 2000);
  ok('  order-by is today — the buffer is already breached — but it is not "late"', row(idle, 'CELL').orderBy === NOW && row(idle, 'CELL').late === false);
  ok('  the driver says why', row(idle, 'CELL').drivers[0].kind === 'safety');
  ok('  a shelf above its buffer is not short', row(idle, 'BMS').net.buffer === 0 && row(idle, 'BMS').belowSafety === false);
  ok('  and the summary counts the breach', idle.summary.belowSafety === 1 && idle.summary.short === 1, idle.summary);
  var busy = M.plan({ now: NOW, products: cat, stock: { CELL: { onHand: 2500 } },
    works: [{ id: 'w', orderNo: 'CC-1', status: 'awaiting_serials', requirements: [{ sku: 'CAB', qty: 1 }], dueDate: '2026-12-01' }] });
  var c = row(busy, 'CELL');
  ok('real demand is served from the shelf BEFORE the buffer: 832 cells for the cabinet leave 1,668, so 332 to refill', c.net.committed === 0 && c.net.buffer === 332 && c.gross.committed === 832, c.net);
  ok('  the works order itself is not short of cells — the buffer is not its problem', !(M.shortfallsByWorksOrder(busy)['CC-1'] || []).some(function (x) { return x.sku === 'CELL'; }));
  ok('  but the purchase list carries the refill', M.purchaseList(busy).some(function (r) { return r.sku === 'CELL' && r.suggestedOrder === 1000; }));
  var sub = JSON.parse(JSON.stringify(CATALOG)); sub[1].safetyStock = 10;   /* ten spare modules */
  var s2 = M.plan({ now: NOW, products: sub });
  ok('a buffer on a sub-assembly explodes into its parts', row(s2, 'MOD').net.buffer === 10 && row(s2, 'CELL').gross.buffer === 1040 && row(s2, 'HARN').gross.buffer === 25, row(s2, 'CELL').gross);
  ok('  and the sub-assembly is listed to build, its cells to buy', row(s2, 'MOD').suggestedOrder === 10 && M.purchaseList(s2).some(function (r) { return r.sku === 'CELL'; }) && !M.purchaseList(s2).some(function (r) { return r.sku === 'MOD'; }));
  var C = require('../api/_lib/logic-catalog');
  ok('the catalog keeps safetyStock on a component and drops it on a product', C.product({ sku: 'X', name: 'X', kind: 'component', safetyStock: 250 }).safetyStock === 250 && C.product({ sku: 'Y', name: 'Y', kind: 'product', kw: 1, safetyStock: 250 }).safetyStock === null);
})();

console.log('\nbills of materials — the graph is checked');
(function () {
  rejects('a loop is refused, and the message shows the path', function () {
    M.validateCatalog([{ sku: 'A', bom: [{ sku: 'B', qty: 1 }] }, { sku: 'B', bom: [{ sku: 'A', qty: 1 }] }]);
  }, 'A → B → A');
  rejects('a component that is not in the catalog', function () { M.validateCatalog([{ sku: 'A', bom: [{ sku: 'GHOST', qty: 1 }] }]); }, 'no such SKU');
  rejects('a service used as a material', function () { M.validateCatalog([{ sku: 'A', bom: [{ sku: 'S', qty: 1 }] }, { sku: 'S', kind: 'service' }]); }, 'is a service');
  rejects('self-reference', function () { M.validateCatalog([{ sku: 'A', bom: [{ sku: 'A', qty: 1 }] }]); }, 'itself');
  var deep = []; for (var i = 0; i < 11; i++) deep.push({ sku: 'L' + i, bom: i < 10 ? [{ sku: 'L' + (i + 1), qty: 1 }] : [] });
  rejects('more than ' + M.MAX_DEPTH + ' levels', function () { M.validateCatalog(deep); }, 'levels');
  ok('a four-level tree is fine', !!M.validateCatalog(deep.slice(6)));
  rejects('a duplicated line', function () { M.bomLines([{ sku: 'X', qty: 1 }, { sku: 'X', qty: 2 }]); }, 'twice');
  rejects('a zero quantity', function () { M.bomLines([{ sku: 'X', qty: 0 }]); }, 'greater than zero');
  rejects('an unknown unit', function () { M.bomLines([{ sku: 'X', qty: 1, unit: 'furlong' }]); }, 'Unit must be');
  rejects('a poisoned SKU', function () { M.bomLines([{ sku: '__proto__', qty: 1 }]); }, 'invalid');
  var many = []; for (var j = 0; j <= M.MAX_LINES; j++) many.push({ sku: 'P' + j, qty: 1 });
  rejects('more than ' + M.MAX_LINES + ' lines', function () { M.bomLines(many); }, 'at most');
  ok('a gram of thermal paste is a valid quantity', M.bomLines([{ sku: 'PASTE', qty: 0.0001, unit: 'g' }])[0].qty === 0.0001);
  ok('a blank bill is an empty list, not an error', M.bomLines(undefined).length === 0 && M.bomLines('').length === 0);
  var llc = M.lowLevelCodes(M.validateCatalog([
    { sku: 'CAB', bom: [{ sku: 'MOD', qty: 1 }, { sku: 'CELL', qty: 4 }] },   /* a loose cell at level 1 */
    { sku: 'MOD', bom: [{ sku: 'CELL', qty: 100 }] }, { sku: 'CELL' }]));
  ok('a shared component takes its DEEPEST level, so it is netted after every parent', llc.CELL === 2 && llc.MOD === 1 && llc.CAB === 0, llc);
})();

console.log('\ncatalog — a third kind, dropped by the picker');
(function () {
  var C = require('../api/_lib/logic-catalog');
  var comp = C.product({ sku: 'CELL', name: 'Cell', kind: 'component', unit: 'ea', moq: 1000, supplier: 'EVE', supplierSku: 'LF280K', leadTimeDays: 60, priceMode: 'list', listPrice: 9 });
  ok('a component keeps its sourcing fields', comp.kind === 'component' && comp.unit === 'ea' && comp.moq === 1000 && comp.supplier === 'EVE' && comp.supplierSku === 'LF280K');
  ok('  and can never carry a public list price', comp.priceMode === 'quote' && comp.listPrice === null);
  ok('  nor be a design product', comp.designEnabled === false);
  var prod = C.product({ sku: 'CAB', name: 'Cabinet', kind: 'product', bom: [{ sku: 'MOD', qty: 8 }] });
  ok('a product carries its bill of materials', prod.bom.length === 1 && prod.bom[0].sku === 'MOD' && prod.bom[0].qty === 8 && prod.bom[0].unit === 'ea');
  ok('  and no sourcing fields', prod.unit === null && prod.moq === null && prod.supplier === '');
  ok('a service has no bill of materials, whatever was sent', C.product({ sku: 'S', name: 'S', kind: 'service', bom: [{ sku: 'X', qty: 1 }] }).bom.length === 0);
  assert.throws(function () { C.product({ sku: 'X', name: 'X', kind: 'component', unit: 'bushel' }); }, /Unit must be/);
  var cfg = { products: [{ sku: 'MOD', name: 'Module', kind: 'component', kw: 10, kwh: 5, widthFt: 2, depthFt: 1, designEnabled: true },
                         { sku: 'CAB', name: 'Cabinet', kind: 'product', kw: 100, kwh: 215, widthFt: 4, depthFt: 3, designEnabled: true }] };
  ok('the BESS picker never offers a component, even one with kW, kWh and a footprint',
     C.designs(cfg).length === 1 && C.designs(cfg)[0].sku === 'CAB');
  ok('the office projection shows the bill and the unit', C.view(comp).unit === 'ea' && Array.isArray(C.view(prod).bom) && C.view(prod).bom[0].qty === 8);
})();

console.log('\nthe surfaces that could publish a component');
(function () {
  var cfgSrc = fs.readFileSync(path.join(ROOT, 'api/embed-config.js'), 'utf8');
  ok('api/embed-config.js drops kind:component before projecting', /p\.kind!=='component'/.test(cfgSrc));
  ok('  and never names bom in its projection', !/\bbom\b/.test(cfgSrc.replace(/\/\*[\s\S]*?\*\//g, '')));
  var B = require('../omega-bess-products.js');
  ok('omega-bess-products.js will not turn a module into a battery', B.toCatalogEntry('cc', { sku: 'MOD', kind: 'component', kwh: 5.2, kw: 2 }) === null);
  ok('  nor a service', B.toCatalogEntry('cc', { sku: 'S', kind: 'service', kwh: 5 }) === null);
  ok('  but still takes a product', B.toCatalogEntry('cc', { sku: 'CAB', kind: 'product', kwh: 215, kw: 100 }) !== null);
  var ordersSrc = fs.readFileSync(path.join(ROOT, 'api/orders.js'), 'utf8');
  ok('api/orders.js refuses a component on an order line', /is a component, not a product/.test(ordersSrc));
})();

console.log('\nthe endpoint');
(async function () {
  function clone(v) { return v === undefined ? undefined : JSON.parse(JSON.stringify(v)); }
  function field(v, k) { return k.split('.').reduce(function (x, p) { return x == null ? undefined : x[p]; }, v); }
  function merge(a, b) { Object.keys(b).forEach(function (k) { a[k] = (a[k] && typeof a[k] === 'object' && !Array.isArray(a[k]) && b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) ? merge(a[k], b[k]) : clone(b[k]); }); return a; }
  class DB {
    constructor() { this.rows = new Map(); this.seq = 0; }
    seed(p, d) { this.rows.set(p, clone(d)); }
    doc(p) { return new Ref(this, p); }
    collection(p) { return new Query(this, p); }
    runTransaction(fn) { var self = this, writes = []; return Promise.resolve(fn({
      get: function (r) { return r.get(); },
      set: function (r, v, o) { writes.push(function () { self.seed(r.path, o && o.merge ? merge(clone(self.rows.get(r.path) || {}), v) : v); }); },
      create: function (r, v) { writes.push(function () { assert(!self.rows.has(r.path)); self.seed(r.path, v); }); }
    })).then(function (out) { writes.forEach(function (w) { w(); }); return out; }); }
  }
  class Ref { constructor(db, p) { this.db = db; this.path = p; this.id = p.split('/').pop(); }
    collection(n) { return new Query(this.db, this.path + '/' + n); }
    async get() { var d = this.db.rows.get(this.path); return { exists: d !== undefined, id: this.id, data: function () { return clone(d); } }; } }
  class Query { constructor(db, p, f, cap) { this.db = db; this.path = p; this.f = f || []; this.cap = cap || Infinity; }
    doc(id) { return new Ref(this.db, this.path + '/' + (id || 'auto' + (++this.db.seq))); }
    where(k, op, v) { return new Query(this.db, this.path, this.f.concat([[k, v]]), this.cap); }
    orderBy() { return this; } limit(n) { return new Query(this.db, this.path, this.f, n); }
    async get() { var docs = []; for (var e of this.db.rows) { if (e[0].startsWith(this.path + '/') && e[0].split('/').length === this.path.split('/').length + 1 && this.f.every(function (f) { return field(e[1], f[0]) === f[1]; })) docs.push(await this.db.doc(e[0]).get()); } docs = docs.slice(0, this.cap); return { docs: docs, size: docs.length, empty: !docs.length }; } }
  db = new DB();
  var X = { owner: function () { return false; }, authorize: async function (c, org, write) { if (!org) throw A.httpError(400, 'Valid org required'); if (write && !c.admin) throw A.httpError(403, 'An active OEM administrator is required'); return { orgId: org, org: { name: 'Clean Cell' }, billing: {}, config: {} }; } };
  mock('../api/_lib/logic-access', X); mock('../api/_lib/logic-brand', function () { return { name: 'Clean Cell' }; });
  var api = require('../api/logic-materials');
  var admin = { email: 'plant@cleancell.us', admin: true }, member = { email: 'm@cleancell.us', admin: false };
  db.seed('omega_orgs/cleancell.us/storefront/config', { products: CATALOG, catalogRevision: 3 });
  db.seed('orders/o1', { orgId: 'cleancell.us', orderNo: 'CC-1', status: 'accepted', items: [{ sku: 'CAB', qty: 2 }], createdAt: 1 });
  db.seed('orders/other', { orgId: 'other.com', orderNo: 'X', status: 'accepted', items: [{ sku: 'CAB', qty: 50 }], createdAt: 1 });
  db.seed('plant_works_orders/wo_1', { orgId: 'cleancell.us', orderNo: 'CC-0', status: 'awaiting_serials', requirements: [{ sku: 'CAB', qty: 1 }], dueDate: '2026-12-01', createdAt: 1 });
  var res = { setHeader: function () {} };
  var got = await api({ method: 'GET', query: { org: 'cleancell.us' }, caller: member }, res);
  ok('a member reads the plan', got.rows.length > 0 && got.summary.components === 5);
  ok('  scoped to this org — the other tenant\'s fifty cabinets are not in it', row(got, 'CAB').gross.total === 3, row(got, 'CAB').gross);
  ok('  with the catalog and stock revisions the page needs to save against', got.catalogRevision === 3 && got.stockRevision === 0);
  ok('  and counts of what is set up', got.components === 5 && got.withBom === 2);
  await assert.rejects(api({ method: 'POST', body: { org: 'cleancell.us', action: 'stock', sku: 'CELL', onHand: 500, revision: 0 }, caller: member }, res), /administrator/);
  ok('a member cannot record a count', true);
  await assert.rejects(api({ method: 'POST', body: { org: 'cleancell.us', action: 'stock', sku: 'GHOST', onHand: 1, revision: 0 }, caller: admin }, res), /No such component/);
  ok('a count against a SKU not in the catalog is refused', true);
  await assert.rejects(api({ method: 'POST', body: { org: 'cleancell.us', action: 'stock', sku: 'INSTALL', onHand: 1, revision: 0 }, caller: admin }, res), /No such component/);
  ok('  as is one against a service', true);
  await assert.rejects(api({ method: 'POST', body: { org: 'cleancell.us', action: 'stock', sku: '__proto__', onHand: 1, revision: 0 }, caller: admin }, res), /Invalid SKU/);
  ok('  and a poisoned key', true);
  await assert.rejects(api({ method: 'POST', body: { org: 'cleancell.us', action: 'stock', sku: 'CELL', onHand: -1, revision: 0 }, caller: admin }, res), /between 0/);
  ok('  and a negative count', true);
  var saved = await api({ method: 'POST', body: { org: 'cleancell.us', action: 'stock', sku: 'CELL', onHand: 500, onOrder: 1000, note: 'shelf B', revision: 0 }, caller: admin }, res);
  ok('an admin records a count', saved.ok && saved.revision === 1);
  var st = db.rows.get('omega_orgs/cleancell.us/fulfillment/materials');
  ok('  written under fulfillment/, with who and when', st.stock.CELL.onHand === 500 && st.stock.CELL.onOrder === 1000 && st.stock.CELL.by === admin.email && !!st.stock.CELL.countedAt && st.revision === 1, st);
  var audit = []; for (var e of db.rows) if (e[0].startsWith('omega_audit/')) audit.push(e[1]);
  ok('  and audited with the previous value', audit.length === 1 && audit[0].action === 'materials-stock' && audit[0].before === null && audit[0].after.onHand === 500);
  await assert.rejects(api({ method: 'POST', body: { org: 'cleancell.us', action: 'stock', sku: 'CELL', onHand: 1, revision: 0 }, caller: admin }, res), /changed/);
  ok('a stale revision is refused, so two counters cannot overwrite each other', true);
  got = await api({ method: 'GET', query: { org: 'cleancell.us' }, caller: member }, res);
  ok('the plan now nets against the count', row(got, 'CELL').onHand === 500 && row(got, 'CELL').onOrder === 1000 && row(got, 'CELL').net.total === 3 * 8 * 104 - 1500, row(got, 'CELL'));

  var solo = await api({ method: 'GET', query: { org: 'cleancell.us', workOrder: 'wo_1' }, caller: member }, res);
  ok('one works order, on its own: infeasible, and it names what must be bought', solo.feasible === false && solo.hasBom && solo.short.length === 3 && solo.workOrder.orderNo === 'CC-0', solo);
  ok('  one cabinet needs 832 cells and 1,500 are on hand or on order, so cells are NOT short for it', !solo.short.some(function (c) { return c.sku === 'CELL'; }), solo.short);
  ok('  while in the whole plan (three cabinets) they are', row(got, 'CELL').net.total > 0);
  ok('  the modules it needs are built, not bought, so they are not in the list', !solo.short.some(function (c) { return c.sku === 'MOD'; }));
  db.seed('plant_works_orders/wo_other', { orgId: 'other.com', orderNo: 'X', status: 'awaiting_serials', requirements: [{ sku: 'CAB', qty: 1 }] });
  await assert.rejects(api({ method: 'GET', query: { org: 'cleancell.us', workOrder: 'wo_other' }, caller: member }, res), /not found/);
  ok('another tenant\'s works order is not found, not refused by name', true);
  await assert.rejects(api({ method: 'GET', query: { org: 'cleancell.us', workOrder: '../x' }, caller: member }, res), /Invalid works order/);
  ok('  and a malformed id is refused', true);

  console.log('\nthe endpoint — purchase orders');
  var rev = (await api({ method: 'GET', query: { org: 'cleancell.us' }, caller: member }, res)).stockRevision;
  await assert.rejects(api({ method: 'POST', body: { org: 'cleancell.us', action: 'po', supplier: '', lines: [{ sku: 'CELL', qty: 4000 }], revision: rev }, caller: admin }, res), /supplier/);
  ok('a purchase order needs a supplier', true);
  await assert.rejects(api({ method: 'POST', body: { org: 'cleancell.us', action: 'po', supplier: 'EVE', lines: [], revision: rev }, caller: admin }, res), /at least one line/);
  ok('  and a line', true);
  await assert.rejects(api({ method: 'POST', body: { org: 'cleancell.us', action: 'po', supplier: 'EVE', lines: [{ sku: 'INSTALL', qty: 1 }], revision: rev }, caller: admin }, res), /not a component or product/);
  ok('  and refuses a service line', true);
  await assert.rejects(api({ method: 'POST', body: { org: 'cleancell.us', action: 'po', supplier: 'EVE', expectedAt: '2026-13-40', lines: [{ sku: 'CELL', qty: 1 }], revision: rev }, caller: admin }, res), /YYYY-MM-DD/);
  ok('  and a bad date', true);
  await assert.rejects(api({ method: 'POST', body: { org: 'cleancell.us', action: 'po', supplier: 'EVE', lines: [{ sku: 'CELL', qty: 1 }], revision: rev }, caller: member }, res), /administrator/);
  ok('  and a member', true);
  var before = db.rows.get('omega_orgs/cleancell.us/fulfillment/materials').stock.CELL;
  var made = await api({ method: 'POST', body: { org: 'cleancell.us', action: 'po', supplier: 'EVE Energy', reference: 'PO-1001', expectedAt: '2026-11-01', note: 'air freight', lines: [{ sku: 'CELL', qty: 4000 }, { sku: 'HARN', qty: 100.5 }], revision: rev }, caller: admin }, res);
  ok('an admin records a purchase order', made.ok && made.poId && made.revision === rev + 1);
  var po = db.rows.get('omega_orgs/cleancell.us/purchase_orders/' + made.poId);
  ok('  stored under the org, open, with the lines carrying name and unit', po && po.orgId === 'cleancell.us' && po.status === 'open' && po.lines[0].name === 'LFP cell 280Ah' && po.lines[1].unit === 'm' && po.lines[0].received === 0, po);
  var after = db.rows.get('omega_orgs/cleancell.us/fulfillment/materials').stock;
  ok('  on-order rose by the ordered quantity, in the same write', after.CELL.onOrder === before.onOrder + 4000 && after.HARN.onOrder === 100.5 && after.CELL.onHand === before.onHand, after.CELL);
  ok('  and the stock revision moved, so a stale count is refused next', db.rows.get('omega_orgs/cleancell.us/fulfillment/materials').revision === rev + 1);
  got = await api({ method: 'GET', query: { org: 'cleancell.us' }, caller: member }, res);
  ok('the plan lists it and nets against the new on-order (1,000 counted + 4,000 ordered)', got.purchaseOrders.length === 1 && got.purchaseOrders[0].reference === 'PO-1001' && row(got, 'CELL').onOrder === 5000, row(got, 'CELL'));
  await assert.rejects(api({ method: 'POST', body: { org: 'cleancell.us', action: 'receive', poId: made.poId, lines: [{ sku: 'CELL', qty: 5000 }], revision: got.stockRevision }, caller: admin }, res), /more than the 4000 still expected/);
  ok('receiving more than was ordered is refused', true);
  await assert.rejects(api({ method: 'POST', body: { org: 'cleancell.us', action: 'receive', poId: made.poId, lines: [{ sku: 'BMS', qty: 1 }], revision: got.stockRevision }, caller: admin }, res), /not on this purchase order/);
  ok('  as is a SKU not on the order', true);
  var rcv = await api({ method: 'POST', body: { org: 'cleancell.us', action: 'receive', poId: made.poId, lines: [{ sku: 'CELL', qty: 1500, lot: 'EVE-2026-W38-0417' }], note: 'first pallet', revision: got.stockRevision }, caller: admin }, res);
  po = db.rows.get('omega_orgs/cleancell.us/purchase_orders/' + made.poId); after = db.rows.get('omega_orgs/cleancell.us/fulfillment/materials').stock;
  ok('a partial receipt moves quantity from on-order to on-hand', rcv.status === 'partial' && po.lines[0].received === 1500 && after.CELL.onOrder === 3500 && after.CELL.onHand === 2000, after.CELL);
  ok('  and is recorded on the order with who and when', po.receipts.length === 1 && po.receipts[0].by === admin.email && po.receipts[0].note === 'first pallet' && po.receipts[0].lines[0].qty === 1500);
  ok('  the supplier lot travels onto the shelf and the receipt', after.CELL.lots.length === 1 && after.CELL.lots[0].lot === 'EVE-2026-W38-0417' && after.CELL.lots[0].qty === 1500 && after.CELL.lots[0].po === made.poId && po.receipts[0].lines[0].lot === 'EVE-2026-W38-0417', after.CELL.lots);
  got = await api({ method: 'GET', query: { org: 'cleancell.us' }, caller: member }, res);
  rcv = await api({ method: 'POST', body: { org: 'cleancell.us', action: 'receive', poId: made.poId, lines: [{ sku: 'CELL', qty: 2500 }, { sku: 'HARN', qty: 100.5 }], revision: got.stockRevision }, caller: admin }, res);
  po = db.rows.get('omega_orgs/cleancell.us/purchase_orders/' + made.poId);
  ok('the last receipt closes it', rcv.status === 'received' && po.status === 'received' && !!po.receivedAt);
  got = await api({ method: 'GET', query: { org: 'cleancell.us' }, caller: member }, res);
  await assert.rejects(api({ method: 'POST', body: { org: 'cleancell.us', action: 'receive', poId: made.poId, lines: [{ sku: 'CELL', qty: 1 }], revision: got.stockRevision }, caller: admin }, res), /is received/);
  ok('  and nothing more can be received against it', true);
  var second = await api({ method: 'POST', body: { org: 'cleancell.us', action: 'po', supplier: 'Orion', lines: [{ sku: 'BMS', qty: 10 }], revision: got.stockRevision }, caller: admin }, res);
  got = await api({ method: 'GET', query: { org: 'cleancell.us' }, caller: member }, res);
  await api({ method: 'POST', body: { org: 'cleancell.us', action: 'receive', poId: second.poId, lines: [{ sku: 'BMS', qty: 4 }], revision: got.stockRevision }, caller: admin }, res);
  got = await api({ method: 'GET', query: { org: 'cleancell.us' }, caller: member }, res);
  var cancelled = await api({ method: 'POST', body: { org: 'cleancell.us', action: 'cancel-po', poId: second.poId, revision: got.stockRevision }, caller: admin }, res);
  after = db.rows.get('omega_orgs/cleancell.us/fulfillment/materials').stock;
  ok('cancelling releases only what never arrived', cancelled.status === 'cancelled' && after.BMS.onOrder === 0 && after.BMS.onHand === 4, after.BMS);
  db.seed('omega_orgs/other.com/purchase_orders/x', { orgId: 'other.com', status: 'open', lines: [{ sku: 'CELL', qty: 1 }] });
  got = await api({ method: 'GET', query: { org: 'cleancell.us' }, caller: member }, res);
  await assert.rejects(api({ method: 'POST', body: { org: 'cleancell.us', action: 'receive', poId: 'x', lines: [{ sku: 'CELL', qty: 1 }], revision: got.stockRevision }, caller: admin }, res), /not found/);
  ok('another tenant\'s purchase order is not found', true);
  ok('  and never listed here', got.purchaseOrders.every(function (p) { return p.id !== 'x'; }) && got.purchaseOrders.length === 2);
  var audits = []; for (var e2 of db.rows) if (e2[0].startsWith('omega_audit/')) audits.push(e2[1].action);
  ok('every move is audited', audits.filter(function (a) { return a === 'materials-po'; }).length === 2 && audits.filter(function (a) { return a === 'materials-receive'; }).length === 3 && audits.indexOf('materials-po-cancel') >= 0, audits);

  console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
