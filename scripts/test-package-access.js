/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert = require('assert'), fs = require('fs'), vm = require('vm');
var X = require('../api/_lib/package-access'), M = require('../api/_lib/modules');
var count = 0, now = Date.parse('2026-09-26T12:00:00Z');
var caller = { uid: 'member', orgId: 'example.com', emailVerified: true, staff: false };
var org = { status: 'active' }, member = { status: 'active', role: 'member' };
function check(fn) { fn(); count++; }
function bill(keys) { return { packaged: true, modules: keys || ['lite'], packagingState: 'paid', tier: 'enterprise', addons: ['compute'], toolOverrides: { compute: true } }; }
function project(b, m, c, o) { return X.project(c || caller, b || bill(), o || org, m || member, now); }
function denied(fn) { check(function () { assert.throws(fn, function (e) { return e.status === 403; }); }); }
check(function () { assert.deepEqual(X.project(caller, {}, null, null, now), { packaged: false }); });
var lite = project();
check(function () { assert(!lite.caps.includes('compute')); });
check(function () { assert(!lite.toolAccess.includes('proforma')); });
M.catalog().forEach(function (module) {
  var keys = ['lite']; module.requires.forEach(function (k) { if (!keys.includes(k)) keys.push(k); });
  if (!keys.includes(module.key)) keys.push(module.key);
  var v = project(bill(keys));
  check(function () { X.requireModule(v, module.key); });
  if (module.key !== 'lite') denied(function () { X.requireModule(lite, module.key); });
  denied(function () { X.requireModule(project(bill(keys), { status: 'active', role: 'viewer' }), module.key); });
  denied(function () { X.requireModule(project(bill(keys), { status: 'active', role: 'member', toolAccess: [] }), module.key); });
});
['suspended', 'pending', 'cancelled'].forEach(function (status) { denied(function () { project(null, null, null, { status: status }); }); });
['disabled', 'pending', 'invited'].forEach(function (status) { denied(function () { project(null, { status: status, role: 'member' }); }); });
[false, undefined, 'true'].forEach(function (verified) { denied(function () { project(null, null, Object.assign({}, caller, { emailVerified: verified })); }); });
denied(function () { project(bill(['lite', 'unknown'])); });
['trial', 'unpaid', 'pending-payment', 'cancelled', undefined].forEach(function (state) {
  var b = bill(['lite', 'storage']); b.packagingState = state;
  denied(function () { X.requireModule(project(b), 'storage'); });
  check(function () { X.requireModule(project(b), 'storage', { produce: false }); });
});
var trial = bill(['lite', 'storage']); trial.packagingState = 'trial'; trial.trialStartedAt = now - 1000; trial.trialEndsAt = trial.trialStartedAt + 14 * 86400000;
check(function () { X.requireModule(project(trial), 'storage'); });
trial.trialEndsAt++; denied(function () { X.requireModule(project(trial), 'storage'); });
trial.trialStartedAt = now - 14 * 86400000; trial.trialEndsAt = now; denied(function () { X.requireModule(project(trial), 'storage'); });
check(function () { X.requireModule(project(bill(), null, Object.assign({}, caller, { staff: true })), 'compute'); });
// Server projection and the actual browser runtime agree without a second catalog.
var box = { console: console }; vm.runInNewContext(fs.readFileSync(require.resolve('../omega-caps.js'), 'utf8'), box);
var C = box.OmegaCaps;
C.setOrg('rep@clearsky-usa.com'); C.setAddons(['compute', 'exports']); C.setPackage(lite);
check(function () { assert.equal(C.can('enterprise', 'compute'), false); });
check(function () { assert.equal(C.allowedCommand('', 'openBlueprintExport()'), true); });
var leaks = [
  ['File menu', '', 'openPlotPlanExport()', 'plansets'],
  ['Summary Cost', '', "openRpPanel('cost')", 'estimate'],
  ['Documentation', '', 'd4Open()', 'plansets'],
  ['Output', '', 'openOneLineExport()', 'plansets'],
  ['Ctrl+K', '', 'openBessSizer()', 'storage'],
  ['Jarvis', '', 'openElectricalEstimate()', 'estimate'],
  ['Compute outside tab', '', "_guidedPick('compute')", 'compute'],
  ['AI Render', 'ov-airender', 'OmegaAIRender.open()', 'plansets']
];
leaks.forEach(function (r) {
  C.setPackage(lite); check(function () { assert.equal(C.allowedCommand(r[1], r[2]), false, r[0]); });
  C.setPackage(project(bill(['lite', r[3]]))); check(function () { assert.equal(C.allowedCommand(r[1], r[2]), true, r[0]); });
});
C.setPackage(lite); check(function () { assert.equal(C.allowedCommand('future-paid-button', 'unknownPaid()'), false); });
// ID ownership wins over a generic Lite launcher on Compute controls.
check(function () { assert.equal(C.allowedCommand('rb-place-sub', 'rbInsert()'), false); });
var calls = 0; box.openRpPanel = function () { calls++; }; box.OmegaAIRender = { open: function () { calls++; } };
C.guardLaunchers(); box.openRpPanel('cost'); box.OmegaAIRender.open();
check(function () { assert.equal(calls, 0); }); box.openRpPanel('summary'); check(function () { assert.equal(calls, 1); });
C.setPackage(project(bill(['lite', 'estimate', 'plansets']))); box.openRpPanel('cost'); box.OmegaAIRender.open(); check(function () { assert.equal(calls, 3); });
C.setPackage(project(bill(['lite', 'estimate']), { role: 'viewer', status: 'active' })); box.openRpPanel('cost'); check(function () { assert.equal(calls, 3); });
check(function () { assert.equal(C.allowedCommand('', 'openProjectsModal()'), true); });
check(function () { assert.equal(C.allowedCommand('', 'openBlueprintExport()'), false); });
var buyer = X.customerDrawing(true); C.setPackage(buyer);
check(function () { assert.equal(C.allowedCommand('', 'openBessSizer()'), false); });
check(function () { assert.equal(C.allowedCommand('', 'openBlueprintExport()'), true); });
C.setPackage(C.pendingPackage()); check(function () { assert.equal(C.allowedCommand('', 'openBlueprintExport()'), false); });
console.log('Package access: ' + count + ' passed; no network calls.');
