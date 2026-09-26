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
resolverChecks().then(function () {
  console.log('\n' + (fails ? fails + ' of ' + checks + ' FAILED' : 'all ' + checks + ' checks passed') + '\n');
  process.exit(fails ? 1 : 0);
}).catch(function (e) { console.error(e); process.exit(1); });
