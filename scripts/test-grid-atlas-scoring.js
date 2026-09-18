#!/usr/bin/env node
/* Regression tests for the two in-page scores in grid-atlas.html.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   THE BUG THESE PIN DOWN
   Both scores used to feed a constant in for every factor whose layer was
   switched off — fiber route 0, FCC coverage 0, DC fiber 15/100 — and then
   weight it as though it were a measurement. Fiber is 70% of the confidence
   score and 24% of the DC score, so a site nobody had looked at scored the
   same as a site that had been looked at and found wanting. "Challenged for
   DC scale" was being printed about parcels with no fiber layer loaded.

   The rule now matches weightedScore() in api/grid-atlas.js: an unmeasured
   factor drops out of the numerator AND the denominator. A factor whose
   layer IS on and which found nothing still counts — "looked and found none"
   and "never looked" are different answers.

   node scripts/test-grid-atlas-scoring.js */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');

let pass = 0, fail = 0;
function ok(name, cond, got) {
  if (cond) { pass++; return; }
  fail++; console.error('  FAIL ' + name + (got !== undefined ? '  got: ' + JSON.stringify(got) : ''));
}

/* Lift wScore straight out of the page so the test cannot drift from it. */
const html = fs.readFileSync(path.join(__dirname, '../grid-atlas.html'), 'utf8');
const m = html.match(/function wScore\(parts\)\{[\s\S]*?\n  \}/);
ok('wScore is present in grid-atlas.html', !!m);
if (!m) { console.log('✗ grid-atlas scoring: ' + pass + ' passed, ' + fail + ' failed'); process.exit(1); }
const box = { Math: Math };
vm.runInNewContext(m[0] + '; this.wScore = wScore;', box);
const wScore = box.wScore;

/* ── the rule itself ──────────────────────────────────────────────────── */
const allNull = wScore([['a', null, 45], ['b', null, 30], ['c', null, 25]]);
ok('nothing measured scores null, not zero', allNull.score === null, allNull.score);
ok('...and reports the full weight as unmeasured', allNull.missedWeight === 100, allNull.missedWeight);

const oneOnly = wScore([['route', null, 45], ['peering', 80, 30], ['fcc', null, 25]]);
ok('one measured factor scores on its own weight alone', oneOnly.score === 80, oneOnly.score);
ok('...and says 70% went unmeasured', oneOnly.missedWeight === 70, oneOnly.missedWeight);
ok('...and names what was missed', oneOnly.missed.join(',') === 'route,fcc', oneOnly.missed);

/* The regression, stated as the arithmetic that used to happen. */
const measuredZero = wScore([['route', 0, 45], ['peering', 80, 30], ['fcc', 0, 25]]);
ok('looked-and-found-none scores low but is NOT the same as never-looked',
   measuredZero.score === 24 && oneOnly.score === 80, [measuredZero.score, oneOnly.score]);
ok('never-looked leaves the denominator smaller, not the numerator',
   measuredZero.measuredWeight === 100 && oneOnly.measuredWeight === 30,
   [measuredZero.measuredWeight, oneOnly.measuredWeight]);

const full = wScore([['a', 100, 42], ['b', 50, 24], ['c', 50, 14], ['d', 50, 12], ['e', 50, 8]]);
ok('a fully measured score is a plain weighted mean', full.score === 71 && full.missedWeight === 0, full);
ok('score stays within 0..100', [allNull, oneOnly, measuredZero, full]
   .every(r => r.score === null || (r.score >= 0 && r.score <= 100)));

/* ── and that the page actually uses it for both scores ───────────────── */
ok('Fiber Confidence routes through wScore',
   /var fcW=wScore\(/.test(html));
ok('DC Site Report routes through wScore',
   /var dcW=wScore\(/.test(html));
ok('the old fiber fallback constant of 15 is gone',
   !/var pFiber=fiber\?Math\.max\(0,100-fiber\.km\*8\):15/.test(html));
ok('the old fcRoute zero fallback is gone',
   !/var fcRoute=fiber\?Math\.max\(0,100-fiber\.km\*7\):0/.test(html));
ok('an unmeasured score renders as an em dash, never as 0',
   /\(fcScore==null\?"—":fcScore\)/.test(html) && /\(dcScore==null\?"—":dcScore\)/.test(html));

console.log((fail ? '✗' : '✓') + ' grid-atlas scoring: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
