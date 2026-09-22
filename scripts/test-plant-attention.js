/* What the floor needs a person for, pinned: stuck, held, failed, off the
   routing, and benches gone quiet.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var T = require('../api/_lib/plant-attention'), P = require('../api/_lib/plant');
var pass = 0, fail = 0;
function ok(label, yes, detail) { console.log('  ' + (yes ? 'PASS' : 'FAIL') + '  ' + label + (detail ? '  ' + detail : '')); if (yes) pass++; else fail++; }
var NOW = '2026-09-22T12:00:00.000Z', H = 3600000, base = Date.parse(NOW);
function unit(serial, extra) { return Object.assign({ serial: serial, sku: 'CAB', unitType: 'cabinet', shipUnit: true, at: 'elec', arrivedAt: new Date(base - 2 * H).toISOString(), hold: null, test: null, woId: 'wo_1', orderNo: 'CC-1' }, extra); }
var units = [
  unit('FRESH'),
  unit('STUCK', { arrivedAt: new Date(base - 30 * H).toISOString() }),
  unit('STUCKER', { at: 'kit', arrivedAt: null, startedAt: new Date(base - 72 * H).toISOString() }),
  unit('HELD', { hold: 'Cell voltage spread', holdAt: new Date(base - 5 * H).toISOString(), holdBy: 'qa@x', ncr: 'NCR-1', arrivedAt: new Date(base - 90 * H).toISOString(), test: { result: 'fail', failureCode: 'V-SPREAD', at: new Date(base - 5.1 * H).toISOString() } }),
  unit('DONE', { at: 'ready', arrivedAt: new Date(base - 100 * H).toISOString() }),
  unit('NEW', { at: '', arrivedAt: null }),
  unit('LOST', { at: 'mystery', arrivedAt: new Date(base - 50 * H).toISOString() })
];
var stations = [
  { id: 's1', label: 'Kitting bench', station: 'kit', active: true, lastSeenAt: new Date(base - 1 * H).toISOString() },
  { id: 's2', label: 'EOL rig', station: 'eol', machine: true, active: true, lastSeenAt: new Date(base - 20 * H).toISOString(), lastSerial: 'HELD' },
  { id: 's3', label: 'Old tablet', station: 'pack', active: false, lastSeenAt: null },
  { id: 's4', label: 'Phone', station: '*', roaming: true, active: true }
];
console.log('\nplant attention');
var a = T.attention(units, stations, P.DEFAULT_ROUTING, NOW);
ok('a unit past the stuck threshold is listed longest first; a fresh one and a held one are not', a.stuck.map(function (x) { return x.serial; }).join(',') === 'STUCKER,STUCK', a.stuck.map(function (x) { return x.serial + ':' + x.hours; }).join(','));
ok('a unit with no arrival stamp falls back to its start stamp', a.stuck[0].hours === 72);
ok('held units carry the reason, NCR, who and how long, and flag a failed test', a.held.length === 1 && a.held[0].ncr === 'NCR-1' && a.held[0].hours === 5 && a.held[0].failedTest === true && a.held[0].by === 'qa@x');
ok('failed tests are listed with their code', a.failed.length === 1 && a.failed[0].failureCode === 'V-SPREAD' && a.failed[0].onHold === true);
ok('a unit at a station not on the routing is an exception, not stuck', a.offRouting.length === 1 && a.offRouting[0].serial === 'LOST' && !a.stuck.some(function (x) { return x.serial === 'LOST'; }));
ok('finished and not-started units are counted, not listed', a.counts.finished === 1 && a.counts.notStarted === 1 && a.counts.wip === 4);
ok('a bench silent for a working day and a never-seen roaming phone are listed; a disabled one is not; the recent bench is not', a.silent.map(function (s) { return s.id; }).join(',') === 's4,s2', a.silent.map(function (s) { return s.id; }).join(','));
ok('silent stations name the operation, roaming phones are named as such', a.silent[0].operation === 'Roaming phone' && a.silent[1].operation === 'EOL test' && a.silent[1].hoursSince === 20);
var t = T.attention(units, stations, P.DEFAULT_ROUTING, NOW, { stuckHours: 1, silentHours: 0.5, limit: 1 });
ok('thresholds and the list cap are honoured, counts stay whole', t.stuck.length === 1 && t.counts.stuck === 3 && t.silent.length === 1 && t.counts.silent === 3 && t.thresholds.stuckHours === 1);
ok('an empty plant has empty lists and zero counts', T.attention([], [], P.DEFAULT_ROUTING, NOW).counts.units === 0);
console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
