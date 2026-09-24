/* Floor performance, build demand, finished stock and completion — pinned so
   the office's operations views cannot drift from the ledger.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var O = require('../api/_lib/plant-ops'), B = require('../api/_lib/plant-board'), P = require('../api/_lib/plant');
var pass = 0, fail = 0;
function ok(label, yes, detail) { console.log('  ' + (yes ? 'PASS' : 'FAIL') + '  ' + label + (detail ? '  ' + detail : '')); if (yes) pass++; else fail++; }
var NOW = '2026-09-22T12:00:00.000Z';
var scans = [
  { at: '2026-09-22T08:00:00Z', ok: true, verdict: { action: 'advance', to: 'rack' }, stationId: 's1' },
  { at: '2026-09-22T09:00:00Z', ok: true, verdict: { action: 'advance', to: 'ready' }, stationId: 's2' },
  { at: '2026-09-21T09:00:00Z', ok: false, verdict: { reason: 'out_of_sequence' }, stationId: 's1' },
  { at: '2026-09-21T10:00:00Z', ok: true, machine: true, test: { result: 'pass' }, verdict: { action: 'advance', to: 'eol' }, stationId: 'rig' },
  { at: '2026-09-21T11:00:00Z', ok: false, machine: true, test: { result: 'fail' }, verdict: { action: 'hold' }, stationId: 'rig' },
  { at: '2026-09-21T12:00:00Z', ok: true, control: { action: 'hold' }, verdict: { action: 'hold' } },
  { at: '2026-08-01T12:00:00Z', ok: true, verdict: { action: 'advance', to: 'kit' }, stationId: 'old' }
];
console.log('\nplant ops');
var f = O.floor(scans, NOW, 14);
ok('fourteen daily buckets ending today', f.days.length === 14 && f.days[13].day === '2026-09-22' && f.days[0].day === '2026-09-09');
ok('advances, ready, refusals, tests, fails and holds are counted on their day', f.days[13].advances === 2 && f.days[13].ready === 1 && f.days[12].refusals === 1 && f.days[12].tests === 2 && f.days[12].testFails === 1 && f.days[12].holds === 1, JSON.stringify(f.days[12]));
ok('a failed machine test is not counted as an advance or a refusal', f.days[12].advances === 1 && f.days[12].refusals === 1);
ok('totals cover the window only; older events are outside it', f.totals.advances === 3 && f.totals.refusals === 1 && f.lastScanAt === '2026-09-22T09:00:00.000Z');
ok('active stations are counted across the whole ledger read', f.activeStations === 4);

function unit(serial, extra) { return Object.assign({ serial: serial, sku: 'CAB', unitType: 'cabinet', shipUnit: true, at: '', done: {}, hold: null, test: null }, extra); }
var wo1 = { id: 'wo_1', orderNo: 'CC-1', orderId: 'one', requirements: [{ sku: 'CAB', qty: 3 }], registeredCounts: { CAB: 2 }, routing: P.DEFAULT_ROUTING, status: 'released', dueDate: '2026-09-20' };
var wo2 = { id: 'wo_2', orderNo: 'CC-2', orderId: 'two', requirements: [{ sku: 'CAB', qty: 1 }, { sku: 'RACK', qty: 2 }], registeredCounts: { CAB: 1 }, routing: P.DEFAULT_ROUTING, status: 'released' };
var stockWo = { id: 'stock_1', orderNo: 'STOCK', inventory: true, requirements: [{ sku: 'CAB', qty: 1 }], registeredCounts: { CAB: 1 }, routing: P.DEFAULT_ROUTING, status: 'released' };
var rows = [
  B.row(wo1, [unit('A1', { at: 'elec' }), unit('A2', { at: 'ready' })], NOW),
  B.row(wo2, [unit('B1', { at: 'ready' })], NOW),
  B.row(stockWo, [unit('S1', { at: 'ready' })], NOW),
  B.row({ id: 'wo_done', orderNo: 'CC-0', status: 'shipped', requirements: [{ sku: 'CAB', qty: 9 }], routing: P.DEFAULT_ROUTING }, [], NOW)
];
var q = O.queues(rows);
ok('queues aggregate units at each operation across open work orders only', q.filter(function (x) { return x.key === 'ready'; })[0].count === 3 && q.filter(function (x) { return x.key === 'elec'; })[0].count === 1 && q.filter(function (x) { return x.key === 'elec'; })[0].workOrders === 1);
var d = O.demand(rows);
ok('build demand by SKU is required less registered, across open work orders, never the shipped one', d.skus[0].sku === 'RACK' && d.skus[0].toRegister === 2 && d.skus[1].sku === 'CAB' && d.skus[1].required === 5 && d.skus[1].registered === 4 && d.skus[1].toRegister === 1, JSON.stringify(d.skus));
ok('per-work-order remaining lists late work first', d.workOrders[0].id === 'wo_1' && d.workOrders[0].late === true && d.workOrders[0].remaining.CAB === 1 && d.workOrders.length === 3);
var st = O.stock([{ serial: 'S1', sku: 'CAB', at: 'ready', shipUnit: true }, { serial: 'S2', sku: 'CAB', at: 'ready', shipUnit: true, hold: 'x' }, { serial: 'M1', sku: 'CAB', at: 'ready', shipUnit: false }, { serial: 'S3', sku: 'CAB', at: 'pack', shipUnit: true }]);
ok('finished stock counts only shipping roots at Ready, separating held ones', st.available === 1 && st.held === 1 && st.skus[0].serials.length === 2);
var c = O.completed(rows);
ok('completed units on orders: ready roots counted, stock and shipped orders excluded, expected-minus-ready still building', c.readyOnOrders === 2 && c.building === 4 && c.awaitingShipment.length === 0, JSON.stringify(c));
var readyRow = B.row({ id: 'wo_r', orderNo: 'CC-R', orderId: 'r', requirements: [{ sku: 'CAB', qty: 1 }], routing: P.DEFAULT_ROUTING, status: 'released' }, [unit('R1', { at: 'ready' })], NOW);
ok('an order whose every unit is ready is awaiting shipment', O.completed([readyRow]).awaitingShipment[0].orderNo === 'CC-R');
console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
