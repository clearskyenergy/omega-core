/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var assert = require('assert'), fs = require('fs'), vm = require('vm');
var X = require('../api/_lib/package-access'), M = require('../api/_lib/modules');
var count = 0, now = Date.parse('2026-09-26T12:00:00Z');
var caller = { uid: 'member', orgId: 'example.com', emailVerified: true, staff: false };
var org = { status: 'active' }, member = { status: 'active', role: 'member' };
function check(fn) { fn(); count++; }
function bill(keys) { return { packaged: true, modules: keys || ['lite'], packagingState: 'paid', accessUntil: Date.now() + 86400000, tier: 'enterprise', addons: ['compute'], toolOverrides: { compute: true } }; }
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
/* live is the PLAN's standing, readOnly also the person's role: a viewer on a paid-up plan is view-only, not "read-only until paid" */
var viewerLive = project(null, { status: 'active', role: 'viewer' });
check(function () { assert.equal(lite.live, true); assert.equal(lite.readOnly, false); assert.equal(viewerLive.live, true); assert.equal(viewerLive.readOnly, true); });
var lapsed = project(Object.assign(bill(), { accessUntil: now - 1000 }));
check(function () { assert.equal(lapsed.live, false); assert.equal(lapsed.readOnly, true); });
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
var deadline = bill(['lite', 'storage']); deadline.accessUntil = now + 1;
check(function () { X.requireModule(project(deadline), 'storage'); });
delete deadline.accessUntil; denied(function () { X.requireModule(project(deadline), 'storage'); });
deadline.accessUntil = now; denied(function () { X.requireModule(project(deadline), 'storage'); });
deadline.accessUntil = 'invalid'; denied(function () { X.requireModule(project(deadline), 'storage'); });
var fallback = bill(); fallback.packagingState = 'past_due_lite'; fallback.paidThrough = '2026-09-01'; fallback.accessUntil = now + 1;
check(function () { X.requireModule(project(fallback), 'lite'); });
fallback.modules.push('storage'); denied(function () { X.requireModule(project(fallback), 'storage'); });
fallback.modules = ['lite']; delete fallback.paidThrough; denied(function () { X.requireModule(project(fallback), 'lite'); });
var day11 = bill(); day11.packagingState = 'trial'; day11.trialStartedAt = now - 10 * 86400000; day11.trialEndsAt = now + 4 * 86400000; day11.accessUntil = day11.trialEndsAt;
check(function () { assert(project(day11).billingNotice.text.includes('Your trial ends')); });
day11.packagingState = 'awaiting_payment'; day11.paymentLink = 'javascript:alert(1)';
check(function () { assert.equal(project(day11).billingNotice.payUrl, null); });
day11.paymentLink = 'https://connect.intuit.com/pay/fixture';
check(function () { assert.equal(project(day11).billingNotice.payUrl, day11.paymentLink); });
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
/* A legacy plan (billed outside the engine): its add-ons on now, by the add-on
   engine's own rule, and the catalog whose ribbon the editor opens them by
   and offers the rest with (Opt in). Never a price, never a grant. */
var legacyBill = { tier: 'standard', addons: [], addOns: { modules: ['compute', 'storage'], live: ['storage', 'compute'], accessUntil: now + 86400000 } };
var lv = X.legacy(legacyBill, now);
check(function () { assert.equal(lv.packaged, false); assert.deepEqual(lv.addOns, ['storage', 'compute']); });
check(function () { assert.deepEqual(lv.catalog.map(function (m) { return m.key; }), M.catalog().map(function (m) { return m.key; })); assert.deepEqual(lv.notSold, M.notSold()); });
check(function () { assert(lv.catalog.every(function (m) { return Array.isArray(m.ribbon) && m.priceCents === undefined && m.priceDisplay === undefined; }), 'ribbon ownership, no prices'); });
check(function () { assert.deepEqual(X.legacy(legacyBill, now + 86400000).addOns, [], 'nothing is on past accessUntil'); });
check(function () { assert.deepEqual(X.legacy({ tier: 'deluxe' }, now).addOns, []); assert.deepEqual(X.legacy(undefined, now).addOns, []); });
check(function () { assert.deepEqual(X.project(caller, legacyBill, org, member, now), { packaged: false }, 'producers still read a legacy plan as unpackaged'); });
var endpoint = fs.readFileSync(require('path').join(__dirname, '..', 'api', 'package-access.js'), 'utf8');
check(function () { assert(/packaged !== true\) return res\.status\(200\)\.json\(X\.legacy\(ctx\.billing, Date\.now\(\)\)\)/.test(endpoint), 'the endpoint answers a legacy plan with legacy()'); });
console.log('Package access: ' + count + ' passed; no network calls.');
