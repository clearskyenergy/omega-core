#!/usr/bin/env node
/* scripts/test-plant-scan.js — the scan engine, every branch
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The engine decides whether a unit may move, so these are the assertions
   that stop a bench quietly walking a unit past a station it never visited.
   Pure functions, no Firestore, runs in about a second. */
'use strict';
var P = require('../api/_lib/plant.js');
var serialFrom = P.serialFrom;

var pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (got === undefined ? '' : '  got: ' + JSON.stringify(got))); }
}
function unit(at, extra) {
  var u = { serial: 'CC418-26-418', at: at || '', done: {}, hold: null };
  for (var k in (extra || {})) u[k] = extra[k];
  return u;
}
var R = P.DEFAULT_ROUTING;

console.log('\nplant scan engine\n');

/* ── the happy path ─────────────────────────────────────────────────────── */
var v = P.judgeScan(unit(''), 'kit', R);
ok('a fresh unit may be scanned in at the first station', v.ok && v.action === 'advance' && v.from === null, v);

v = P.judgeScan(unit('kit'), 'module', R);
ok('advances exactly one station', v.ok && v.action === 'advance' && v.to === 'module', v);

v = P.judgeScan(unit('pack'), 'ready', R);
ok('the last station is reachable and flagged', v.ok && v.last === true, v);

/* ── the refusals that matter ───────────────────────────────────────────── */
v = P.judgeScan(unit('rack'), 'pack', R);
ok('REFUSES a skipped station', !v.ok && v.reason === 'out_of_sequence', v);
ok('  and names what is actually next', v.expected === 'encl' && /Electrical|Enclosure/.test(v.say), v.say);

v = P.judgeScan(unit(''), 'elec', R);
ok('REFUSES a unit that was never kitted', !v.ok && v.reason === 'out_of_sequence', v);
ok('  and says so in words a bench can act on', /not been kitted/.test(v.say), v.say);

v = P.judgeScan(unit('qa'), 'rack', R);
ok('REFUSES a backwards scan', !v.ok && v.reason === 'already_past', v);

v = P.judgeScan(unit('ready'), 'ready', R);
ok('a finished unit re-scanned at its own station is a duplicate, not an error',
   v.ok && v.action === 'duplicate', v);

v = P.judgeScan(unit('pack', { hold: 'Capacity below limit at EOL', ncr: 'NCR-26-89' }), 'ready', R);
ok('REFUSES a unit on hold', !v.ok && v.reason === 'on_hold', v);
ok('  carries the NCR so the bench can quote it', v.ncr === 'NCR-26-89', v);
ok('  and states plainly that a scan cannot release it', /cannot release/.test(v.say), v.say);

v = P.judgeScan(unit('bms'), 'eol', R);
ok('REFUSES a human scan at a machine station', !v.ok && v.reason === 'machine_station', v);
v = P.judgeScan(unit('bms'), 'eol', R, { machine: true });
ok('  but the test rig itself may post it', v.ok && v.action === 'advance', v);

/* ── the EOL rig supplies evidence; it cannot be impersonated by a gun ─── */
var testUnit = unit('bms');
v = P.judgeMachineResult(testUnit, 'eol', R, { pass: true });
var testPatch = P.applyMachineResult(testUnit, v, '2026-09-21T11:00:00Z', { result: 'pass', measurements: { insulationMohm: 500 } });
ok('a passing machine test advances exactly one machine-only station', v.ok && v.to === 'eol' && testPatch.at === 'eol', v);
ok('  and retains its measurements on the traveler', testPatch.test.measurements.insulationMohm === 500, testPatch);
v = P.judgeMachineResult(unit('bms'), 'eol', R, { pass: false });
testPatch = P.applyMachineResult(unit('bms'), v, '2026-09-21T11:01:00Z', { result: 'fail', failureCode: 'CAP_LOW', ncr: 'NCR-001' });
ok('a failed machine test places a hold without advancing the unit', !v.ok && v.action === 'hold' && !Object.prototype.hasOwnProperty.call(testPatch, 'at') && testPatch.hold === 'CAP_LOW', testPatch);
v = P.judgeMachineResult(unit('eol'), 'eol', R, { pass: false });
ok('a later failed retest still places an EOL unit on hold', !v.ok && v.action === 'hold' && v.at === 'eol', v);
ok('measurements reject an arbitrary diagnostic blob', (function () { try { P.measurementsOf({ bad: 'not-a-number' }); return false; } catch (e) { return true; } })());

v = P.judgeScan(unit('kit'), 'welding', R);
ok('REFUSES a station that is not on this routing', !v.ok && v.reason === 'unknown_station', v);

v = P.judgeScan(null, 'kit', R);
ok('REFUSES an unknown serial', !v.ok && v.reason === 'unknown_unit', v);

/* ── duplicates: a gun double-firing must never move anything ───────────── */
v = P.judgeScan(unit('elec'), 'elec', R);
ok('a re-scan at the current station is a duplicate', v.ok && v.action === 'duplicate', v);
ok('  and applyScan writes nothing for it', P.applyScan(unit('elec'), v, 'T') === null);

/* ── applyScan records where it LEFT, not just where it is ─────────────── */
var u = unit('encl');
v = P.judgeScan(u, 'elec', R);
var patch = P.applyScan(u, v, '2026-09-21T10:00:00Z');
ok('applyScan moves the unit forward', patch.at === 'elec', patch);
ok('  stamps the station it left', patch.done.encl === '2026-09-21T10:00:00Z', patch.done);
ok('  does not mutate the unit it was given', u.at === 'encl' && !u.done.encl, u);
ok('  clears any stale hold field', patch.hold === null, patch);

/* ── a tenant's own routing wins over the default ──────────────────────── */
var custom = P.routingOf({ routing: ['kit', 'weld', 'test', 'ship'] });
ok('a works order carries its own routing', custom.length === 4 && custom[1].key === 'weld', custom);
v = P.judgeScan(unit('kit'), 'weld', custom);
ok('  and the engine follows it', v.ok && v.action === 'advance', v);
v = P.judgeScan(unit('kit'), 'module', custom);
ok('  so a default-routing station is refused on it', !v.ok && v.reason === 'unknown_station', v);
ok('routingOf falls back to the default when a works order has none',
   P.routingOf({}).length === P.DEFAULT_ROUTING.length);

/* ── what the gun is allowed to say ────────────────────────────────────── */
var forbidden = ['release', 'ship', 'price', 'cancel', 'complete'];
var actions = {};
[unit(''), unit('kit'), unit('qa'), unit('ready'), unit('pack', { hold: 'x' })].forEach(function (uu) {
  R.forEach(function (s) { var r = P.judgeScan(uu, s.key, R); if (r.ok) actions[r.action] = true; });
});
ok('a scan can only ever advance or duplicate — nothing else',
   Object.keys(actions).sort().join(',') === 'advance,duplicate', Object.keys(actions));
ok('  and none of the refusal reasons is a privileged verb',
   forbidden.every(function (w) { return !Object.keys(actions).some(function (a) { return a.indexOf(w) >= 0; }); }));

/* ── the label reader ──────────────────────────────────────────────────── */
ok('reads a bare serial', serialFrom('CC418-26-418') === 'CC418-26-418');
ok('reads the tail of a label URL', serialFrom('https://plant.cleancell.us/u/CC418-26-418') === 'CC418-26-418');
ok('ignores a query string', serialFrom('https://plant.cleancell.us/u/CC418-26-418?src=qr') === 'CC418-26-418');
ok('upper-cases so a lowercase read still matches', serialFrom('cc418-26-418') === 'CC418-26-418');
ok('refuses junk', serialFrom('???') === '');
ok('refuses an empty scan', serialFrom('') === '');
ok('does not trust the host part of a URL', serialFrom('https://evil.example/u/CC418-26-418') === 'CC418-26-418');

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
