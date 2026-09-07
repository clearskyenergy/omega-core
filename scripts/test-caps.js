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

console.log('\n' + (fails ? fails + ' of ' + checks + ' FAILED' : 'all ' + checks + ' checks passed') + '\n');
process.exit(fails ? 1 : 0);
