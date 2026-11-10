#!/usr/bin/env node
/* scripts/tests/twlchrome.js — the workspace chrome under a white label.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   The rule (omega-workspace-shell.js byLine/markHtml/headHtml, cut out of
   the source so the test fails when the source changes): under an active
   white label the head wears the TENANT'S platform from the first paint —
   the attribution line is the contract's own (OmegaWhiteLabel.attribution(),
   '' when the agreement removes our name, never a literal that flashes it),
   and the mark is the tenant's markUrl, else the short name's initial,
   never the Ω. Without a white label the head is ours: Ω, the product,
   'by ClearSky'. 2026-11-09, Tommy, of the Solela-attached host: "the
   workspace should not have any omega or clearsky references". */
'use strict';
var fs = require('fs'), path = require('path');

var src = fs.readFileSync(path.join(__dirname, '..', '..', 'omega-workspace-shell.js'), 'utf8');
var start = src.indexOf('function byLine()');
var headAt = src.indexOf('function headHtml(');
if (start < 0 || headAt < 0 || headAt < start) { console.error('twlchrome: byLine/headHtml not found in omega-workspace-shell.js'); process.exit(1); }
var region = src.slice(start, src.indexOf('\n', headAt) + 1);

function esc(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

/* the shell's own productName() shape: the white label wins when active */
function build(wl) {
  var PRODUCT = 'Omega Workspace';
  function productName() {
    try { if (wl && wl.active && wl.active()) return wl.platformName(); } catch (e) {}
    return PRODUCT;
  }
  var make = new Function('PRODUCT', 'esc', 'productName', 'global', 'OmegaWhiteLabel',
    region + '\nreturn { byLine: byLine, markHtml: markHtml, headHtml: headHtml };');
  return make(PRODUCT, esc, productName, { OmegaWhiteLabel: wl }, wl);
}

var fails = 0;
function ok(name, cond) { if (!cond) { fails++; console.error('FAIL ' + name); } else console.log('  ok ' + name); }

/* ── no white label: ours ── */
var ours = build(null);
ok('no WL: by ClearSky', ours.byLine() === 'by ClearSky');
ok('no WL: the Ω mark', ours.markHtml().indexOf('Ω') >= 0);
ok('no WL: head says the product', ours.headHtml('').indexOf('Omega Workspace') >= 0);

/* ── active white label, attribution removed by the contract (Solela) ── */
function wlOf(over) {
  var w = {
    active: function () { return true; },
    platformName: function () { return 'Solela Capital'; },
    shortName: function () { return 'Solela'; },
    attribution: function () { return ''; },
    markUrl: function () { return ''; }
  };
  Object.keys(over || {}).forEach(function (k) { w[k] = over[k]; });
  return w;
}
var none = build(wlOf());
ok('WL none: no attribution line', none.byLine() === '');
var head = none.headHtml('');
ok('WL none: the head never says ClearSky', head.indexOf('ClearSky') < 0);
ok('WL none: the head never says Omega', /omega/i.test(head) === false);
ok('WL none: never the Ω', head.indexOf('Ω') < 0);
ok('WL none: the short name’s initial stands in for the mark', none.markHtml().indexOf('>S<') >= 0);
ok('WL none: the head says the tenant’s platform', head.indexOf('Solela Capital') >= 0);

/* ── active white label that keeps the default attribution ── */
var kept = build(wlOf({ attribution: function () { return 'Powered by ClearSky OMEGA'; } }));
ok('WL powered-by: the contract’s line, from the first paint', kept.byLine() === 'Powered by ClearSky OMEGA');
ok('WL powered-by: the line is the attribution(), in the head too', kept.headHtml('').indexOf('Powered by ClearSky OMEGA') >= 0);

/* ── a tenant mark replaces the initial ── */
var marked = build(wlOf({ markUrl: function () { return '/tenants/solelacapital/logos/solela-monogram-white.svg'; } }));
ok('WL mark: the tenant’s image', marked.markHtml().indexOf('solela-monogram-white.svg') >= 0);
ok('WL mark: inside the sn-mark span', /class="sn-mark wl"/.test(marked.markHtml()));

if (fails) { console.error('twlchrome: ' + fails + ' failed'); process.exit(1); }
console.log('twlchrome: all passed');
