#!/usr/bin/env node
/* scripts/test-editor-mode.js — which product of the editor a tenant bought
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The mode decides what a white-label partner's customers are SHOWN, so the
   assertions that matter are the ones about failing open: a tenant with no
   record, a typo'd mode or a read that threw must all land on the full
   platform. Getting that backwards strips the ribbon for every paying
   customer on the first deploy. */
'use strict';
var M = require('../omega-editor-mode.js');

var pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (got === undefined ? '' : '  got: ' + JSON.stringify(got))); }
}

console.log('\neditor mode\n');

/* ── failing open is the whole safety argument ──────────────────────────── */
ok('no mode at all resolves to the full platform', M.norm(undefined) === 'full');
ok('an empty string resolves to the full platform', M.norm('') === 'full');
ok('null resolves to the full platform', M.norm(null) === 'full');
ok('a typo resolves to the full platform, not to a stripped one', M.norm('bess_lite') === 'full', M.norm('bess_lite'));
ok('an unknown mode resolves to the full platform', M.norm('enterprise-plus') === 'full');
ok('  and the full platform subtracts nothing',
   M.hiddenPages('full').length === 0 && M.hiddenCats('full').length === 0);

/* ── the lite product, exactly ──────────────────────────────────────────── */
ok('bess-lite is recognised', M.norm('bess-lite') === 'bess-lite');
ok('  case and padding do not defeat it', M.norm('  BESS-Lite ') === 'bess-lite');
ok('bess-lite hides the compute workspace', M.hiddenPages('bess-lite').indexOf('compute') >= 0);
ok('  and hides the data-centre and EV equipment categories',
   M.hiddenCats('bess-lite').indexOf('datacenter') >= 0 && M.hiddenCats('bess-lite').indexOf('ev') >= 0);

/* ── what the partner asked to KEEP ─────────────────────────────────────── */
var keepPages = ['home', 'draw', 'insert', 'modify', 'annotate', 'view',
                 'analyze', 'estimate', 'output', 'validation', 'settings'];
var hiddenLite = M.hiddenPages('bess-lite');
keepPages.forEach(function (p) {
  ok('bess-lite keeps the ' + p + ' ribbon page', hiddenLite.indexOf(p) < 0);
});
ok('bess-lite keeps solar equipment — a BESS on a PV site is a normal job',
   M.hiddenCats('bess-lite').indexOf('solar') < 0);
ok('bess-lite keeps the BESS category itself',
   M.hiddenCats('bess-lite').indexOf('bess') < 0);

/* ── the capability question ────────────────────────────────────────────── */
ok('bess-lite denies compute', M.allows('bess-lite', 'compute') === false);
ok('bess-lite denies the data centre', M.allows('bess-lite', 'datacenter') === false);
ok('bess-lite allows the draw tools', M.allows('bess-lite', 'draw') === true);
ok('bess-lite allows exports', M.allows('bess-lite', 'export') === true);
ok('bess-lite allows the guided build', M.allows('bess-lite', 'guided') === true);
ok('bess-lite allows the marketplace push', M.allows('bess-lite', 'marketplace') === true);
ok('an unnamed feature is allowed — a new tool does not vanish on ship day',
   M.allows('bess-lite', 'something-shipped-next-month') === true);
ok('an empty feature name is allowed rather than refused', M.allows('bess-lite', '') === true);
ok('the full platform denies nothing', M.allows('full', 'compute') === true);

/* ── the policy is data, and callers cannot bend it ─────────────────────── */
var got = M.hiddenPages('bess-lite');
got.push('draw');
ok('hiddenPages returns a copy — a caller cannot mutate the policy',
   M.hiddenPages('bess-lite').indexOf('draw') < 0);
var gotc = M.hiddenCats('bess-lite');
gotc.push('bess');
ok('hiddenCats returns a copy too', M.hiddenCats('bess-lite').indexOf('bess') < 0);

/* ── resolve() with no browser ──────────────────────────────────────────── */
ok('resolve() with no CLEARSKY_CONFIG is the full platform', M.resolve() === 'full');
global.CLEARSKY_CONFIG = { tenant: { editorMode: 'bess-lite' } };
ok('resolve() reads the tenant record hydrate() populated', M.resolve() === 'bess-lite');
global.CLEARSKY_CONFIG = { tenant: { editorMode: 'nonsense' } };
ok('resolve() still fails open on a bad value in the record', M.resolve() === 'full');
global.CLEARSKY_CONFIG = { tenant: {} };
ok('a tenant record with no editorMode is the full platform', M.resolve() === 'full');
delete global.CLEARSKY_CONFIG;

/* ── apply() without a DOM must not throw ───────────────────────────────── */
var threw = false;
try { M.apply('bess-lite'); M.restore(); } catch (e) { threw = true; }
ok('apply() and restore() are safe with no document', !threw);

console.log('\n  ' + pass + ' passed, ' + fail + ' failed\n');
process.exit(fail ? 1 : 0);
