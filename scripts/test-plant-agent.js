/* The deterministic factory agent: priority is evidence-led and never writes. */
'use strict';
var Agent = require('../api/_lib/plant-agent');
var pass = 0, fail = 0;
function ok(label, yes, detail) {
  console.log('  ' + (yes ? 'PASS' : 'FAIL') + '  ' + label + (detail ? '  ' + detail : ''));
  if (yes) pass++; else fail++;
}

var now = '2026-09-21T12:00:00Z';
var advice = Agent.advise({
  now: now,
  orders: [
    { id: 'o-accept', orderNo: 'CC-100', status: 'accepted' },
    { id: 'o-live', orderNo: 'CC-101', status: 'in_fulfilment' }
  ],
  works: [{ id: 'wo-live', orderId: 'o-live', orderNo: 'CC-101', promisedShipAt: '2026-09-20T12:00:00Z', routing: ['kit', 'eol', 'ready'] }],
  units: [
    { serial: 'CAB-001', woId: 'wo-live', orderNo: 'CC-101', shipUnit: true, at: 'kit' },
    { serial: 'MOD-001', woId: 'wo-live', orderNo: 'CC-101', at: 'eol', hold: 'Capacity below threshold', ncr: 'NCR-17', testFailedAt: '2026-09-21T09:00:00Z' },
    { serial: 'CELL-001', woId: 'wo-live', orderNo: 'CC-101', at: 'not-a-real-station' }
  ]
});

console.log('\nplant agent');
ok('counts the serialized floor', advice.summary.units === 3 && advice.summary.inProgress === 3, JSON.stringify(advice.summary));
ok('makes the quality hold the highest-priority action', advice.actions[0].key === 'quality_hold' && advice.actions[0].data.serial === 'MOD-001');
ok('identifies accepted order waiting for a serialized release', advice.actions.some(function (a) { return a.key === 'release_work_order' && a.data.orderId === 'o-accept'; }));
ok('calls overdue risk without claiming a shipment', advice.actions.some(function (a) { return a.key === 'protect_ship_date' && a.data.workOrderId === 'wo-live'; }));
ok('retains a routing exception instead of losing the traveller', advice.summary.offRouting === 1);
ok('never returns a privileged action', advice.actions.every(function (a) { return ['release', 'ship', 'clear_hold'].indexOf(a.key) < 0; }));
ok('uses a concrete response that does not promise an override', /not release/i.test(Agent.replyFor(advice, 'what is held?')));

/* Materials: the plan is optional input; when present it adds two bounded,
   non-privileged actions and never an order. */
var M = require('../api/_lib/materials');
var planned = M.plan({ now: '2026-09-21', products: [
    { sku: 'CAB', name: 'Cabinet', kind: 'product', bom: [{ sku: 'CELL', qty: 100, unit: 'ea' }, { sku: 'ENC', qty: 1, unit: 'ea' }] },
    { sku: 'CELL', name: 'Cell', kind: 'component', unit: 'ea', leadTimeDays: 60, supplier: 'EVE' },
    { sku: 'ENC', name: 'Enclosure', kind: 'component', unit: 'ea', leadTimeDays: 5 }],
  stock: { ENC: { onHand: 5 } },
  works: [{ id: 'wo-live', orderNo: 'CC-101', status: 'awaiting_serials', requirements: [{ sku: 'CAB', qty: 2 }], dueDate: '2026-10-10' }] });
var withM = Agent.advise({ now: now, orders: [], works: [], units: [], materials: planned });
console.log('\nplant agent — materials');
ok('a late component becomes an order_material action, priority 1', withM.actions.some(function (a) { return a.key === 'order_material' && a.priority === 1 && a.data.sku === 'CELL' && a.data.short === 200; }), JSON.stringify(withM.actions));
ok('  naming the order-by date and the supplier', /should have been ordered by 2026-08-11/.test(withM.actions[0].detail) && /from EVE/.test(withM.actions[0].detail), withM.actions[0].detail);
ok('a works order short of stock becomes a material_shortfall action', withM.actions.some(function (a) { return a.key === 'material_shortfall' && a.data.orderNo === 'CC-101' && a.data.components[0] === 'CELL 200 ea'; }));
ok('  the enclosure, covered by stock, is not in it', !withM.actions.some(function (a) { return a.key === 'material_shortfall' && a.data.components.some(function (c) { return /ENC/.test(c); }); }));
ok('the summary carries the counts', withM.summary.materialsShort === 1 && withM.summary.materialsLate === 1, JSON.stringify(withM.summary));
ok('the spoken reply names the late material without promising to buy it', /past the date/.test(Agent.replyFor(withM, 'what next?')) && /not place the order/.test(Agent.replyFor(withM, 'what next?')));
ok('still never a privileged action', withM.actions.every(function (a) { return ['release', 'ship', 'clear_hold', 'purchase'].indexOf(a.key) < 0; }));
var without = Agent.advise({ now: now, orders: [], works: [], units: [] });
ok('no plan means no materials actions and zero counts, not an error', without.actions.length === 0 && without.summary.materialsShort === 0);

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
