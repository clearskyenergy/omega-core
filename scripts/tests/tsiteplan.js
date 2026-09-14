/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   /api/site-plan: entitlement, input guards and the planner's three answers.
   Offline. No Firebase, no network. */
'use strict';
var assert = require('assert');
var path = require('path');

/* STAND IN FOR _lib/admin, THE WAY tparcel.js AND tprequal.js DO.

   api/site-plan.js requires it, and it requires firebase-admin. CI has no
   install step on purpose — these tests are pure functions with nothing to
   fetch, which is the whole reason they run on every push — so the module is
   not there and this file threw "Cannot find module 'firebase-admin'" before
   a single assertion ran. It passed on any laptop that happened to have
   node_modules, which is the worst way for a test to fail: green where it is
   written, red where it is the gate.

   firebase-admin is not what is under test here. The helpers are. */
var libPath = require.resolve(path.join(__dirname, '..', '..', 'api', '_lib', 'admin.js'));
require.cache[libPath] = { id: libPath, filename: libPath, loaded: true, exports: {
  handler: function (fn) { return fn; },
  httpError: function (st, m) { var e = new Error(m); e.status = st; return e; },
  authenticate: function () { return Promise.resolve({ uid: 'u1', email: 'pm@concord.com',
                                                       orgId: 'concordenergyusa.com', staff: false }); },
  db: function () { return { collection: function () { return { doc: function () {
        return { get: function () { return Promise.resolve({ exists: false, data: function () { return {}; } }); },
                 set: function () { return Promise.resolve(); },
                 collection: function () { return this; } }; } }; } }; },
  billingOf: function () { return Promise.resolve({ tier: 'pro', addons: [], toolOverrides: {} }); },
  init: function () { return { auth: function () { return {}; } }; },
  admin: { firestore: { FieldValue: { serverTimestamp: function () { return 'TS'; } } } }
} };

var api = require('../../api/site-plan.js');
var planner = require('../../api/_lib/site-agent-planner.js');
var H = api._helpers;
var fixture = require('../site-agent/example-site.json');
function clone(o) { return JSON.parse(JSON.stringify(o)); }

/* ── entitlement ─────────────────────────────────────────────────────────── */
assert.equal(H.entitled({ tier: 'standard', addons: [] }), false, 'standard tier is not entitled');
assert.equal(H.entitled({ tier: 'pro' }), true, 'pro tier is entitled');
assert.equal(H.entitled({ tier: 'enterprise' }), true, 'enterprise tier is entitled');
assert.equal(H.entitled({ tier: 'PRO' }), true, 'tier match is case-insensitive');
assert.equal(H.entitled({ tier: 'standard', addons: [H.PLAN_ADDON] }), true, 'the add-on entitles on its own');
assert.equal(H.entitled({ tier: 'pro', toolOverrides: { 'site-plan': false } }), true === false, 'a false override beats the tier');
assert.equal(H.entitled({ tier: 'standard', toolOverrides: { 'site-plan': true } }), true, 'a true override beats the tier');
assert.equal(H.entitled({}), false, 'an empty billing doc is not entitled');
assert.equal(H.entitled(null), false, 'a missing billing doc is not entitled');

/* ── input guards ────────────────────────────────────────────────────────── */
function guardFails(site, why) {
  try { H.guard(site); } catch (e) { assert.equal(e.status, 400, why + ' must be a 400'); return; }
  assert.fail(why + ' should have been refused');
}
guardFails(null, 'a null site');
guardFails('a string', 'a string site');
guardFails([], 'an array site');
guardFails({ parcel: new Array(101).fill({ x: 0, y: 0 }) }, 'a 101-vertex parcel');
guardFails({ obstacles: new Array(201).fill({ x: 0, y: 0, w: 1, h: 1 }) }, 'a 201-obstacle site');
H.guard(fixture);                                    /* the fixture passes */

/* ── the planner's three answers, through the same object the route sends ── */
var ok = planner.plan(clone(fixture));
assert.equal(ok.status, 'concept_ready', 'the fixture plans');
assert.ok(ok.layout.routeLengthFt > 0, 'a real route has length');
assert.ok(ok.unverified.length >= 4, 'the answer carries what it never checked');

var bare = clone(fixture);
delete bare.service;
var need = planner.plan(bare);
assert.equal(need.status, 'needs_input', 'a missing service wall asks rather than invents');
assert.ok(need.missing.join(' ').indexOf('service wall') >= 0, 'it names the missing evidence');

var boxed = clone(fixture);
boxed.obstacles = [{ x: -10, y: 40, w: 140, h: 10 }];   /* a wall across the parcel */
var blocked = planner.plan(boxed);
assert.ok(blocked.status === 'blocked' || blocked.status === 'concept_ready',
  'a full-width barrier either blocks or is routed around, never crashes');

/* Geometry the planner refuses to reason about must throw, so the route can
   turn it into a 400 that names the thing to fix. */
var bad = clone(fixture);
bad.building = { x: 500, y: 500, w: 30, h: 30 };        /* outside the parcel */
assert.throws(function () { planner.plan(bad); }, /parcel/i, 'a building outside the parcel throws');

console.log('PASS: /api/site-plan entitlement, guards and the planner\'s ready/needs_input/blocked answers.');
