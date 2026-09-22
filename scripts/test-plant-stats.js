#!/usr/bin/env node
/* scripts/test-plant-stats.js — the plant map: dwell per station, WIP,
   throughput, bottleneck — read off the unit records the scan engine writes
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   node scripts/test-plant-stats.js */
'use strict';
var S = require('../api/_lib/plant-stats'), P = require('../api/_lib/plant'), W = require('../api/_lib/plant-work');
var pass = 0, fail = 0;
function ok(label, yes, detail) { console.log('  ' + (yes ? 'PASS' : 'FAIL') + '  ' + label + (detail !== undefined && !yes ? '  got: ' + JSON.stringify(detail) : '')); if (yes) pass++; else fail++; }
var R = [{ key: 'kit', label: 'Kitting' }, { key: 'module', label: 'Module build' }, { key: 'eol', label: 'EOL test' }, { key: 'ready', label: 'Ready' }];
var NOW = '2026-09-22T12:00:00Z';
function t(h) { return new Date(Date.parse('2026-09-15T08:00:00Z') + h * 3600000).toISOString(); }

console.log('\nplant map');
(function () {
  /* three finished cabinets, two on the floor, one never started */
  var units = [
    { serial: 'A', shipUnit: true, startedAt: t(0), done: { kit: t(2), module: t(10), eol: t(12) }, at: 'ready', arrivedAt: t(12) },
    { serial: 'B', shipUnit: true, startedAt: t(1), done: { kit: t(2), module: t(14), eol: t(15) }, at: 'ready', arrivedAt: t(15) },
    { serial: 'C', shipUnit: true, startedAt: t(3), done: { kit: t(6), module: t(30), eol: t(31) }, at: 'ready', arrivedAt: t(31) },
    { serial: 'D', shipUnit: true, startedAt: t(20), done: { kit: t(21) }, at: 'module', arrivedAt: t(21) },
    { serial: 'E', shipUnit: true, startedAt: t(40), done: { kit: t(41) }, at: 'module', arrivedAt: t(41), hold: 'NCR-1' },
    { serial: 'F', shipUnit: true, at: '', done: {} }
  ];
  var m = S.stationMap(R, units, NOW);
  var kit = m.stations[0], mod = m.stations[1], eol = m.stations[2], ready = m.stations[3];
  ok('kitting dwell is first arrival to the next bench: 2, 1, 3, 1, 1 h → median 1', kit.samples === 5 && kit.medianHours === 1 && kit.avgHours === 1.6, kit);
  ok('module build dwell: 8, 12, 24 h → median 12, p90 24', mod.samples === 3 && mod.medianHours === 12 && mod.p90Hours === 24, mod);
  ok('  and it is the bottleneck', m.bottleneck === 'module', m.bottleneck);
  ok('two units are at module build now, one on hold', mod.here === 2 && mod.hold === 1 && m.busiest === 'module', mod);
  ok('  with how long they have been there', mod.oldestHereHours === Math.round((Date.parse(NOW) - Date.parse(t(21))) / 3600000 * 10) / 10, mod.oldestHereHours);
  ok('EOL has three samples of one hour', eol.samples === 3 && eol.medianHours === 1, eol);
  ok('three finished, two in progress, one not started', m.finished === 3 && m.wip === 2 && m.notStarted === 1 && m.onHold === 1, [m.finished, m.wip, m.notStarted]);
  ok('lead time start → finished: 12, 14, 28 h → median 14', m.leadTimeHours.samples === 3 && m.leadTimeHours.median === 14, m.leadTimeHours);
  ok('throughput is per week, eight weeks, finished counted in their week', m.throughput.length === 8 && m.throughput[m.throughput.length - 1].finished + m.throughput[m.throughput.length - 2].finished === 3, m.throughput.slice(-2));
  ok('a station with too few samples is never the bottleneck', S.stationMap(R, units.slice(0, 2), NOW).bottleneck === null);
  ok('finished units do not count as WIP at Ready', ready.here === 0);
  var live = S.stationMap(R, [P.applyScan({ serial: 'G', at: '', done: {} }, P.judgeScan({ serial: 'G', at: '', done: {} }, 'kit', R), t(50))], NOW);
  ok('a unit the engine just scanned in carries startedAt and shows at Kitting', live.stations[0].here === 1 && live.stations[0].oldestHereHours > 0, live.stations[0]);
  var empty = S.stationMap(R, [], NOW);
  ok('no units: no numbers, no bottleneck, no invented throughput', empty.stations.every(function (s) { return s.samples === 0 && s.medianHours === null; }) && empty.bottleneck === null && empty.throughput.every(function (w) { return w.finished === 0; }));
  var steps = S.stepsByStation(R.concat([{ key: 'bms', label: 'BMS', checks: ['Load firmware'] }]), [
    { sku: 'CAB', name: 'Cabinet', kind: 'product', bom: [{ sku: 'MOD', qty: 2, station: 'module', step: 'Fit modules' }, { sku: 'BMS', qty: 1, station: 'bms' }] },
    { sku: 'MOD', name: 'Module', kind: 'component', bom: [{ sku: 'CELL', qty: 16, station: 'module', step: 'Fit cells' }] },
    { sku: 'CELL', name: 'Cell', kind: 'component' }], W.stepsFor);
  ok('each station lists the steps it carries per product, and its checks', steps[1].products.length === 2 && steps[1].products[0].steps[0] === 'Fit modules' && steps[4].checks[0] === 'Load firmware' && steps[0].products.length === 0, steps);
})();
console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
