/* Release-package validation: an accepted sale only becomes physical truth
   when every serial and parent/child link can be proved. */
'use strict';
var R = require('../api/_lib/plant-release');
var pass = 0, fail = 0;
function ok(label, yes, detail) {
  console.log('  ' + (yes ? 'PASS' : 'FAIL') + '  ' + label + (detail ? '  ' + detail : ''));
  if (yes) pass++; else fail++;
}
function rejects(label, fn, words) {
  try { fn(); ok(label, false, 'did not reject'); }
  catch (e) { ok(label, !words || String(e.message).indexOf(words) >= 0, e.message); }
}
var order = { items: [{ sku: 'CC-418', qty: 1 }] };
var packageOk = [
  { serial: 'CAB-0001', sku: 'CC-418', unitType: 'cabinet', shipUnit: true, trace: { lot: 'LOT-9', supplier: 'CleanCell', capacityKwh: 418 } },
  { serial: 'MOD-0001', sku: 'CC-418', unitType: 'module', parentSerial: 'CAB-0001', trace: { lot: 'LOT-9' } },
  { serial: 'CEL-0001', sku: 'CC-418', unitType: 'cell', parentSerial: 'MOD-0001', trace: { chemistry: 'LFP', nominalVoltage: 3.2 } }
];

console.log('\nplant release');
var units = R.normalizeUnits(packageOk, order);
ok('accepts a serialized cabinet → module → cell genealogy', units.length === 3 && units[2].parentSerial === 'MOD-0001' && units[0].trace.capacityKwh === 418);
ok('normalises an explicit routing', R.routingOf(['kit', 'eol', 'ready']).map(function (s) { return s.key; }).join(',') === 'kit,eol,ready');
rejects('refuses a component whose parent is a smaller part', function () {
  var bad = packageOk.map(function (u) { return Object.assign({}, u); });
  bad[1].parentSerial = 'CEL-0001';
  R.normalizeUnits(bad, order);
}, 'larger assembly');
rejects('refuses a component tree that omits its parent', function () {
  var bad = packageOk.slice(1);
  R.normalizeUnits(bad, order);
}, 'parentSerial');
rejects('refuses more shipping cabinets than the sale ordered', function () {
  var bad = packageOk.concat([{ serial: 'CAB-0002', sku: 'CC-418', unitType: 'cabinet', shipUnit: true, trace: {} }]);
  R.normalizeUnits(bad, order);
}, 'more CC-418');
rejects('refuses duplicate routing stations', function () { R.routingOf(['kit', 'kit']); }, 'repeat');
rejects('refuses an overlong trace value', function () { R.traceOf({ lot: 'x'.repeat(500) }); }, 'too long');

/* PLANT-12: a serial typed wrong may be voided or corrected only while it
   is nothing but a typo — nothing on the floor has seen it. */
var fresh = { serial: 'CAB-0001', at: '', done: {}, work: {}, test: null, inventoryStatus: 'allocated' };
ok('a registered serial the floor has not seen may be corrected', R.correctable(fresh).ok === true);
ok('  one that was scanned in anywhere may not', !R.correctable(Object.assign({}, fresh, { at: 'kit' })).ok && /evidence/.test(R.correctable(Object.assign({}, fresh, { at: 'kit' })).why));
ok('  nor one with a part issued, a test, or a backflush', !R.correctable(Object.assign({}, fresh, { work: { rack: {} } })).ok && !R.correctable(Object.assign({}, fresh, { test: { result: 'pass' } })).ok && !R.correctable(Object.assign({}, fresh, { backflushed: { X: 1 } })).ok);
ok('  nor finished stock, an assigned stock unit or one that left the plant', !R.correctable(Object.assign({}, fresh, { inventoryStatus: 'available' })).ok && !R.correctable(Object.assign({}, fresh, { allocatedAt: 'T' })).ok && !R.correctable(Object.assign({}, fresh, { custody: { status: 'in_transit' } })).ok);
ok('  and a void is final', !R.correctable(Object.assign({}, fresh, { inventoryStatus: 'void' })).ok && !R.correctable(null).ok);

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
