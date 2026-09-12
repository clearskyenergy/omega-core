/* portals/invest/samples.js carries a `headline` per sample that was COPIED
   out of api/_lib/invest-math.js so a sample card can show a target yield
   without the formula shipping to the browser. A copy drifts; this makes the
   drift a failing test instead of a wrong number on a card.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential. */
'use strict';
var path = require('path');
var IM = require(path.join(__dirname, '..', '..', 'api', '_lib', 'invest-math.js'));
var SAMPLES = require(path.join(__dirname, '..', '..', 'portals', 'invest', 'samples.js'));

var fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }
function near(a, b, tol) { return Math.abs(Number(a) - Number(b)) <= tol; }

ok(SAMPLES.length === 4, 'four samples');
SAMPLES.forEach(function (s) {
  var h = IM.headline(s), c = s.headline || {};
  console.log(s.id);
  ok(s.sample === true, 'is marked sample');
  ok(['live', 'funded', 'closed'].indexOf(s.status) >= 0, 'has a public status');
  ok(near(c.targetYieldPct, h.targetYieldPct, 0.002), 'target yield matches the engine (' + h.targetYieldPct.toFixed(3) + ')');
  ok(near(c.irrPct, h.irrPct, 0.01), 'IRR matches the engine (' + h.irrPct.toFixed(2) + ')');
  ok(near(c.moic, h.moic, 0.002), 'MOIC matches the engine (' + h.moic.toFixed(3) + ')');
  ok(c.paybackYear === h.paybackYear, 'payback year matches (' + h.paybackYear + ')');
  ok(c.unitsTotal === h.unitsTotal && s.unitsTotal === h.unitsTotal, 'unitsTotal = goal / unitPrice');
  ok(c.sharePct === h.sharePct && c.termYears === h.termYears && c.kind === h.kind, 'terms pass through');
  ok(Number(s.raised) === Number(s.unitsSold) * Number(s.unitPrice), 'raised is unitsSold × unitPrice');
  ok(Number(s.unitsSold) <= Number(s.unitsTotal), 'not oversold');
  (s.perks || []).forEach(function (p) { ok(Number(p.minAmount) >= Number(s.unitPrice), 'perk "' + p.title + '" costs at least one unit'); });
});

console.log(fails ? '\n' + fails + ' failing' : '\nall passing');
process.exit(fails ? 1 : 0);
