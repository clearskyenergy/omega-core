/* The work-order board derives every number from evidence; these are the
   numbers the office may quote, so they are pinned here.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var B = require('../api/_lib/plant-board'), P = require('../api/_lib/plant');
var pass = 0, fail = 0;
function ok(label, yes, detail) { console.log('  ' + (yes ? 'PASS' : 'FAIL') + '  ' + label + (detail ? '  ' + detail : '')); if (yes) pass++; else fail++; }
function unit(serial, extra) { return Object.assign({ serial: serial, sku: 'CAB', unitType: 'cabinet', shipUnit: true, at: '', done: {}, hold: null, test: null }, extra); }
var NOW = '2026-09-22T12:00:00.000Z';
var wo = { id: 'wo_1', orderNo: 'CC-1', orderId: 'one', requirements: [{ sku: 'CAB', qty: 2 }], routing: P.DEFAULT_ROUTING, status: 'released', dueDate: '2026-09-20', priority: 'urgent', createdAt: { _seconds: 1758000000, _nanoseconds: 0 } };

console.log('\nplant board');
var none = B.row(wo, [], NOW);
ok('a released works order with no serials is awaiting serials, not 0% in progress', none.stage === 'awaiting_serials' && none.progress.percent === 0 && none.progress.expectedRoots === 2);
ok('expected roots come from the requirements, not from what happens to be registered', B.expectedRoots({ requirements: [{ sku: 'A', qty: 3 }, { sku: 'B', qty: 2 }] }, 1) === 5 && B.expectedRoots({ shippingUnitCount: 4 }, 1) === 4 && B.expectedRoots({}, 7) === 7);

var units = [
  unit('C1', { at: 'elec', done: { kit: '2026-09-21T08:00:00Z', module: '2026-09-21T09:00:00Z', rack: '2026-09-21T10:00:00Z', encl: '2026-09-21T11:00:00Z' }, arrivedAt: '2026-09-21T11:00:00Z' }),
  unit('C2', { at: 'kit', arrivedAt: '2026-09-21T07:00:00Z' }),
  unit('M1', { unitType: 'module', shipUnit: false, at: '' })
];
var p = B.progress(wo, units);
ok('progress is per unit step: (5 + 1 + 0) of 3 × 10', p.done === 6 && p.total === 30 && p.percent === 20, p.done + '/' + p.total);
ok('the bottleneck is the operation holding the most units short of Ready; ties go to the earliest operation', p.nextUp && p.nextUp.key === 'kit' && p.nextUp.count === 1, p.nextUp && p.nextUp.key);
ok('unstarted units are counted and never placed at a station', p.unstarted === 1 && p.queues.filter(function (q) { return q.count; }).length === 2);
ok('EOL is marked as a machine operation on the queue strip', p.queues.filter(function (q) { return q.key === 'eol'; })[0].machine === true);
var r = B.row(wo, units, NOW);
ok('a past target date on unfinished work is late', r.late === true && r.due === '2026-09-20' && r.stage === 'in_progress');
ok('Firestore timestamp shapes serialise to ISO', r.createdAt === '2025-09-16T05:20:00.000Z', r.createdAt);

var held = units.map(function (u) { return Object.assign({}, u); }); held[0].hold = 'Cell voltage spread'; held[0].holdAt = '2026-09-21T12:00:00Z'; held[0].holdBy = 'qa@cleancell.us'; held[0].test = { result: 'fail', at: '2026-09-21T11:59:00Z', station: 'eol', failureCode: 'V-SPREAD' };
var h = B.row(wo, held, NOW);
ok('any held unit puts the works order on hold and counts the failed test', h.stage === 'on_hold' && h.progress.held === 1 && h.progress.failed === 1);

var finished = [unit('C1', { at: 'ready', done: { kit: 1, module: 1, rack: 1, encl: 1, elec: 1, bms: 1, eol: 1, qa: 1, pack: 1 } }), unit('C2', { at: 'ready' })];
var f = B.row(wo, finished, NOW);
ok('every unit at Ready with the required roots is ready to ship, and ready work is never late', f.stage === 'ready' && f.progress.readyRoots === 2 && f.progress.percent === 100 && f.late === false);
var short = B.row(wo, finished.slice(0, 1), NOW);
ok('one of two required cabinets at Ready is still in progress', short.stage === 'in_progress' && short.progress.readyRoots === 1 && short.progress.expectedRoots === 2);
ok('a shipped or complete order is complete regardless of the floor', B.row(Object.assign({}, wo, { status: 'shipped' }), [], NOW).stage === 'complete');
ok('a held root at Ready is not a ready root', B.progress(wo, [unit('C1', { at: 'ready', hold: 'x' })]).readyRoots === 0);
ok('a unit recorded off its routing is counted as an exception, not as progress', B.progress(wo, [unit('C1', { at: 'mystery' })]).offRouting === 1 && B.progress(wo, [unit('C1', { at: 'mystery' })]).done === 0);

var feed = B.activity(held, wo, 40);
ok('activity is newest first and names the operation, the test and the hold', feed[0].kind === 'hold' && feed[1].kind === 'test' && /FAILED · V-SPREAD/.test(feed[1].say) && feed[feed.length - 1].say === 'Arrived at Kitting', feed.map(function (e) { return e.kind; }).join(','));
ok('activity is bounded', B.activity(held, wo, 2).length === 2);
ok('assignee is carried and trimmed', B.row(Object.assign({}, wo, { assignee: '  Dana Ortiz  ' }), [], NOW).assignee === 'Dana Ortiz');

var rows = [B.row(Object.assign({}, wo, { id: 'b', priority: 'low', dueDate: '2026-12-01' }), units, NOW), B.row(Object.assign({}, wo, { id: 'a', priority: 'normal', dueDate: '2026-12-01' }), units, NOW), r];
rows.sort(B.compare);
ok('the default order is late first, then priority, then due date', rows.map(function (x) { return x.id; }).join(',') === 'wo_1,a,b', rows.map(function (x) { return x.id; }).join(','));

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
