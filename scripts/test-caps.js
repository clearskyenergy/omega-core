#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/test-caps.js — what each plan and add-on actually unlocks
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   This is a commercial document as much as a test. Every row is a sentence
   somebody could say to a customer, and if a row changes without anybody
   meaning it to, the tier ladder has quietly changed what it sells.

   Run: npm run test:caps
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';
var path = require('path');
global.window = global;
global.document = {
  documentElement: {}, body: { setAttribute: function () {}, getAttribute: function () { return null; } },
  querySelectorAll: function () { return []; },
  addEventListener: function () {}, dispatchEvent: function () {}
};
require(path.join(__dirname, '..', 'omega-caps.js'));
var C = global.OmegaCaps;

var fails = 0, checks = 0;
function ok(cond, name, detail) {
  checks++;
  if (cond) { console.log('  ok   ' + name); return; }
  fails++;
  console.log('  FAIL ' + name + (detail ? '\n         ' + detail : ''));
}
function can(tier, cap, addons) { C.setAddons(addons || []); return C.can(tier, cap); }

console.log('\nPlans\n');

/* ── Trial designs and prints nothing ────────────────────────────────── */
ok(can('trial', 'design'), 'trial can design');
ok(!can('trial', 'export.blueprint'), 'trial cannot print a blueprint');
ok(!can('trial', 'export.plotplan'), 'trial cannot print a plot plan');

/* ── Core (tier 1) prints a blueprint and nothing else ───────────────── */
ok(can('standard', 'export.blueprint'), 'Core prints a blueprint');
ok(!can('standard', 'export.oneline'),
   'Core cannot produce a one-line',
   'the one-line is a Performance deliverable');
ok(!can('standard', 'export.plotplan'),
   'Core cannot produce a plot plan',
   'the plot plan is a Performance deliverable');
ok(!can('standard', 'engineering'), 'Core has no engineering suite');
ok(!can('standard', 'parcelscreen'), 'Core has no parcel screening');

/* ── Performance (tier 2) is the permit-set tier ─────────────────────── */
ok(can('deluxe', 'export.plotplan'), 'Performance produces a plot plan');
ok(can('deluxe', 'export.oneline'), 'Performance produces a one-line');
ok(can('deluxe', 'engineering'), 'Performance has the engineering suite');
ok(can('deluxe', 'parcelscreen'), 'Performance has parcel screening');
ok(!can('deluxe', 'compute'), 'Performance does NOT include Compute');

/* ── Enterprise has everything ───────────────────────────────────────── */
ok(can('enterprise', 'compute'), 'Enterprise includes Compute');
ok(can('enterprise', 'export.anything.at.all'), 'Enterprise exports anything');

console.log('\nAdd-ons\n');

/* The whole point: a service sold separately unlocks in the editor. */
ok(can('deluxe', 'compute', ['compute']),
   'the Compute add-on unlocks Compute on a Performance plan');
ok(can('deluxe', 'parcelscreen', ['compute']),
   'the Compute add-on brings screening with it',
   'selling the campus tab without the screen that feeds it is half a workflow');
ok(can('standard', 'compute', ['compute']),
   'an add-on applies on any plan, not only the one above it');
ok(!can('standard', 'export.plotplan', ['compute']),
   'an add-on widens ONLY what it names — Core still has no plot plan');

/* Typed by a human into a text field. */
ok(can('deluxe', 'compute', ['Compute']), 'add-on matching ignores case');
ok(can('deluxe', 'compute', ['grid-atlas', 'compute', 'osa-jv']),
   'unrelated add-ons alongside it are harmless');
ok(can('deluxe', 'compute', ['  compute  ']), 'surrounding whitespace is tolerated');
ok(!can('deluxe', 'compute', ['computeX']), 'a word that is not an add-on grants nothing');
ok(!can('deluxe', 'compute', ['grid-atlas']),
   'grid-atlas grants nothing in the editor',
   'it is a tool-list entry, and inventing an editor cap for it would be two places to change one answer');

/* An add-on must survive a plan cap — it was bought separately. */
ok(C.effectiveTier('enterprise', 'trial') === 'trial', 'capTier still narrows the plan');
ok(can('trial', 'compute', ['compute']),
   'a capped account keeps an add-on it paid for',
   'capTier scopes the PLAN; it must not cancel a separate purchase');

/* Add-ons never remove. */
C.setAddons(['compute']);
ok(C.can('deluxe', 'engineering'),
   'adding an add-on takes nothing away from the plan');
C.setAddons([]);

/* Exercise the asynchronous resolver, not a copy of its domain check. */
var DB = require('./_lib/firestore-double').DB;
var fs = require('fs');
async function resolverChecks() {
  var missing = new DB();
  var failed = { collection: function () { return { doc: function () { return {
    collection: function () { return { doc: function () { return {
      get: function () { return Promise.reject(new Error('offline')); }
    }; } }; }
  }; } }; } };
  var paths = [null, missing, failed];
  var people = [
    ['rep@clearsky-usa.com', true, 'internal'],
    ['REP@CLEARSKY-USA.COM', true, 'internal'],
    ['rep@clearsky-usa.com', false, 'trial'],
    ['rep@clearsky-usa.com', undefined, 'trial'],
    ['rep@clearsky-usa.com', 'true', 'trial'],
    ['rep@csebuilders.com', true, 'trial'],
    ['rep@clearsky-usa.com.evil.example', true, 'trial'],
    ['designer@tenant.example', true, 'trial']
  ];
  for (var i = 0; i < paths.length; i++) {
    for (var j = 0; j < people.length; j++) {
      var p = people[j];
      ok(await C.resolve(paths[i], p[0], p[1]) === p[2],
        'fallback ' + i + ': ' + p[0] + ' verified=' + p[1] + ' -> ' + p[2]);
    }
  }
  var billed = new DB();
  billed.seed('omega_orgs/clearsky-usa.com/billing/current', { tier: 'enterprise', capTier: 'standard', addons: ['compute'] });
  ok(await C.resolve(billed, 'rep@clearsky-usa.com', true) === 'standard', 'billing cap wins over verified internal fallback');
  ok(C.addons().indexOf('compute') >= 0, 'billing add-ons survive resolution');
  await C.resolve(failed, 'designer@tenant.example', true);
  ok(C.addons().length === 0, 'a failed read cannot retain the previous account add-ons');
  billed.seed('omega_orgs/tenant.example/billing/current', { tier: 'deluxe' });
  ok(await C.resolve(billed, 'designer@tenant.example', true) === 'deluxe', 'customer billing resolves normally');
  var editor = fs.readFileSync(path.join(__dirname, '..', 'editor.html'), 'utf8');
  ok(/OmegaCaps\.resolve\(firebase\.firestore\(\), u\.email, u\.emailVerified\)/.test(editor), 'editor passes verification from the same Firebase user as the email');
}
/* ── THE PLAN CHANGES WHILE THE EDITOR IS OPEN ────────────────────────
   Opting in has to unlock without a reload, and a lapse has to lock without
   one. refresh() asks the same question sign-in asks; these rows hold what it
   may and may not do with the answer. */
function fakeButton(cap, display) {
  var attrs = { 'data-cap': cap };
  return { style: { display: display || '' }, attrs: attrs,
    getAttribute: function (k) { return Object.prototype.hasOwnProperty.call(attrs, k) ? attrs[k] : null; },
    setAttribute: function (k, v) { attrs[k] = String(v); }, removeAttribute: function (k) { delete attrs[k]; },
    hasAttribute: function (k) { return Object.prototype.hasOwnProperty.call(attrs, k); } };
}
async function liveChecks() {
  console.log('\nLive plan\n');
  var X = require('../api/_lib/package-access');
  C.setPackage(null); C.setAddons([]);
  var plot = fakeButton('export.plotplan', 'flex'), draw = fakeButton('design');
  var scope = { querySelectorAll: function (sel) {
    var all = [plot, draw];
    return sel === '[data-cap]' ? all : sel === '[data-cap-blocked]' ? all.filter(function (n) { return n.hasAttribute('data-cap-blocked'); }) : [];
  } };
  C.apply('standard', scope);
  ok(plot.style.display === 'none' && plot.hasAttribute('data-cap-blocked'), 'Core hides the plot plan export');
  C.apply('deluxe', scope);
  ok(plot.style.display === 'flex' && !plot.hasAttribute('data-cap-blocked'),
     'a wider plan brings a hidden button back, with the display it had',
     'the legacy pass only ever hid: an upgrade in the same tab stayed hidden until a reload');
  C.apply('standard', scope); C.apply('standard', scope); C.apply('enterprise', scope);
  ok(plot.style.display === 'flex', 'hiding twice still restores the original display, not "none"');

  var events = [], attrs = {};
  function announced() { return events.filter(function (e) { return e.type === 'omega:plan-changed'; }); }
  global.CustomEvent = function (type, init) { this.type = type; this.detail = init && init.detail; };
  global.document.dispatchEvent = function (e) { events.push(e); };
  global.document.body.getAttribute = function (k) { return attrs[k] == null ? null : attrs[k]; };
  global.document.body.setAttribute = function (k, v) { attrs[k] = String(v); };
  global.document.getElementById = function () { return null; };
  global.document.querySelector = function () { return null; };
  global.document.createElement = function () { return {}; };
  global.document.head = { appendChild: function () {} };
  var user = { email: 'designer@tenant.example', emailVerified: true, getIdToken: function () { return Promise.resolve('token'); } };
  global.firebase = { auth: function () { return { currentUser: user }; } };
  var db = new DB(), billing = 'omega_orgs/tenant.example/billing/current';
  db.seed(billing, { tier: 'standard' });
  ok(await C.resolve(db, user.email, true) === 'standard', 'signed in on Core');
  C.apply('standard');
  db.seed(billing, { tier: 'deluxe' });
  var r = await C.refresh(db, user);
  ok(r.changed && !r.packaged && r.added.indexOf('engineering') >= 0 && C.tier() === 'deluxe',
     'ClearSky moves a legacy workspace up a tier: the editor follows without a reload', JSON.stringify(r));
  ok(announced().length === 1, 'and says so (omega:plan-changed)');
  events.length = 0;
  r = await C.refresh(db, user);
  ok(!r.changed && !announced().length, 'nothing moved: nothing is announced');
  db.seed(billing, { tier: 'deluxe', optIns: { compute: { status: 'requested' } } });
  r = await C.refresh(db, user);
  ok(!r.changed && !C.can(C.tier(), 'compute'),
     'an opt-in REQUEST unlocks nothing: it is priced and recorded, not paid');
  db.seed(billing, { tier: 'deluxe', addons: ['compute'] });
  r = await C.refresh(db, user);
  ok(r.changed && C.can(C.tier(), 'compute'), 'the add-on ClearSky switches on after the purchase unlocks it');

  function view(modules, extra) {
    return X.project({ emailVerified: true }, Object.assign({ packaged: true, packagingState: 'paid', accessUntil: Date.now() + 86400000, modules: modules }, extra || {}),
      { status: 'active' }, { role: 'owner', status: 'active' }, Date.now());
  }
  var answer = { status: 200, body: view(['lite']) }, asked = 0;
  global.fetch = function () { asked++; return Promise.resolve({ ok: answer.status === 200, status: answer.status, json: function () { return Promise.resolve(answer.status === 200 ? answer.body : { error: answer.error || 'Package access is unavailable' }); } }); };
  db.seed(billing, { packaged: true });
  r = await C.refresh(db, user);
  ok(r.changed && r.packaged && !r.wasPackaged && C.packageAccess().modules.join() === 'lite',
     'ClearSky moves the workspace onto a package: the editor switches to the projection');
  answer.body = view(['lite', 'storage']);
  var pendingRefresh = C.refresh(db, user);
  ok(C.packageAccess().modules.join() === 'lite' && !C.packageAccess().pending,
     'a re-check keeps the current answer on screen while it waits',
     'fetchPackage empties the view while it waits; a ribbon that blinks empty on every focus is worse than the bug');
  r = await pendingRefresh;
  ok(r.changed && r.added.join() === 'storage' && !r.removed.length && C.packageAccess().modules.indexOf('storage') >= 0,
     'a module paid for while the editor is open switches on without a reload');
  answer.status = 503;
  r = await C.refresh(db, user);
  ok(!r.changed && r.unavailable && C.packageAccess().modules.indexOf('storage') >= 0,
     'an unreachable server keeps what is on screen (the API still refuses production on its own)');
  answer.status = 403; answer.error = 'Active organization membership required';
  r = await C.refresh(db, user);
  ok(r.changed && r.readOnly && C.packageAccess().readOnly && !C.packageAccess().modules.length,
     'a 403 is the server saying no: the editor locks');
  ok(r.refused === 'Active organization membership required' && C.packageAccess().refused === r.refused,
     'and says why, in the server\'s words: a refusal is not a connection problem and not a bill to pay');
  answer.status = 200; answer.body = view(['lite', 'storage']);
  r = await C.refresh(db, user);
  ok(r.recovered && !r.added.length && !r.readOnly, 'coming back from the lock is "recovered", not a list of new purchases');
  answer.body = view(['lite', 'storage'], { packagingState: 'suspended' });
  r = await C.refresh(db, user);
  ok(r.changed && r.readOnly && !r.wasReadOnly && C.packageAccess().billingNotice && C.packageAccess().billingNotice.payUrl !== undefined,
     'a lapsed payment turns the open editor read-only, with the server\'s notice');
  answer.body = view(['lite']);
  r = await C.refresh(db, user);
  ok(r.removed.join() === 'storage' && !r.readOnly, 'a module that is no longer paid for goes away');

  var staffView = X.project({ staff: true }, { packaged: true }, null, null);
  staffView.preview = true; C.setPackage(staffView); asked = 0;
  r = await C.refresh(db, user);
  ok(r.skipped === 'staff' && asked === 0 && C.packageAccess().preview === true, 'a staff preview is never re-checked away');

  /* At the deadline the server decides; the editor's own clock only when the server cannot answer. */
  answer.body = view(['lite', 'storage'], { accessUntil: Date.now() - 1 });
  C.setPackage(view(['lite', 'storage'], { accessUntil: Date.now() + 40 })); C.apply('standard'); events.length = 0;
  C.watchPlan(function () { return db; });
  await new Promise(function (done) { setTimeout(done, 1250); });
  ok(C.packageAccess().readOnly === true, 'at accessUntil the open editor turns read-only by itself');
  ok(announced().some(function (e) { return e.detail.readOnly && !e.detail.wasReadOnly; }), 'and says so');
  answer.status = 503;
  C.setPackage(view(['lite', 'storage'], { accessUntil: Date.now() + 40 })); C.apply('standard'); events.length = 0;
  C.watchPlan(function () { return db; });
  await new Promise(function (done) { setTimeout(done, 1250); });
  ok(C.packageAccess().readOnly === true && C.packageAccess().modules.indexOf('storage') >= 0,
     'with the server out of reach at the deadline, the editor closes on its own clock');
  answer.status = 200; answer.body = view(['lite', 'storage']);
  C.setPackage(view(['lite', 'storage'], { accessUntil: Date.now() + 40 })); C.apply('standard'); events.length = 0;
  C.watchPlan(function () { return db; });
  await new Promise(function (done) { setTimeout(done, 1250); });
  ok(C.packageAccess().readOnly === false && !announced().length,
     'a clock that crosses the deadline ahead of the server\'s closes nothing and says nothing: the server still says open');
  /* sign-in: locked while the answer is on its way, never open */
  var release, slowDb = { collection: function () { return { doc: function () { return { collection: function () { return { doc: function () { return {
    get: function () { return new Promise(function (r) { release = r; }); } }; } }; } }; } }; } };
  var signing = C.resolve(slowDb, user.email, true);
  ok(C.packageAccess() && C.packageAccess().pending === true && C.packageAccess().loading === true && C.packageAccess().readOnly === true,
     'while sign-in reads the plan the editor is locked (marked loading, not failed), not open',
     'the read()/commit() split had left it open (and clickable) while /api/package-access loaded');
  release({ exists: true, data: function () { return { tier: 'standard' }; } });
  ok(await signing === 'standard' && C.packageAccess() === null, 'and opens what the answer says');

  /* a re-check asked for while another is on its way reads again after it */
  db.seed(billing, { packaged: true }); answer.status = 200; answer.body = view(['lite']); asked = 0;
  await C.refresh(db, user); asked = 0;
  var gate, slowFetch = global.fetch;
  global.fetch = function () { asked++; var body = answer.body; return new Promise(function (r) { gate = function () { r({ ok: true, status: 200, json: function () { return Promise.resolve(body); } }); }; }); };
  var first = C.refresh(db, user);
  await new Promise(function (r) { setTimeout(r, 20); });
  answer.body = view(['lite', 'storage']);
  var second = C.refresh(db, user);
  gate(); await first; await new Promise(function (r) { setTimeout(r, 20); }); gate(); r = await second;
  ok(asked === 2 && C.packageAccess().modules.indexOf('storage') >= 0,
     'a refresh asked for mid-read reads again, so a purchase made meanwhile is not missed', 'asked ' + asked);
  global.fetch = slowFetch;

  /* a clock ahead of the server's: past accessUntil here, still open there */
  var skewed = view(['lite', 'storage']); skewed.accessUntil = Date.now() - 5000;
  answer.body = skewed; events.length = 0;
  await C.refresh(db, user);
  await new Promise(function (d) { setTimeout(d, 1300); });
  ok(C.packageAccess().readOnly === false && !announced().some(function (e) { return e.detail.readOnly; }),
     'a clock ahead of the server does not lock and unlock the editor every second: the server decides');
  delete global.fetch; delete global.firebase;
}

resolverChecks().then(liveChecks).then(function () {
  console.log('\n' + (fails ? fails + ' of ' + checks + ' FAILED' : 'all ' + checks + ' checks passed') + '\n');
  process.exit(fails ? 1 : 0);
}).catch(function (e) { console.error(e); process.exit(1); });
