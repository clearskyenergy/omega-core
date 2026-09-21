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

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
