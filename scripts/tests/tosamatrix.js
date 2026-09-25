/* The OSA Matrix: one implementation, not two.

   portfolio.html and portfolio-data.js each carried TWO declarations of the
   matrix — `matrix()` in the data layer, `renderMatrix()` and `mxOpen()` in
   the page — from the commit the view was written in. Function declarations
   hoist, so in both files the SECOND one won and the first never ran. The
   halves that lost were the ones the markup is wired to, which is why the
   symptom was so hard to read back to a cause:

     · the Across and Up pickers in #v-matrix were permanently blank
     · #mx-count printed nothing
     · the unscored tray never painted
     · the grid drew bare counts on fixed 0-100 bands, and because scores
       cluster, a real portfolio landed in a handful of cells and the view
       read as an empty board

   Nothing throws when a declaration is shadowed, no syntax check sees it, and
   the page renders — just the wrong one. So it is pinned here. */
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');
let fails = 0;
function ok(c, m) { if (!c) { fails++; console.log('  FAIL ' + m); } else console.log('  ok   ' + m); }

const page = fs.readFileSync(path.join(ROOT, 'tenants/osa/portfolio.html'), 'utf8');
const data = fs.readFileSync(path.join(ROOT, 'tenants/osa/portfolio-data.js'), 'utf8');

function count(src, re) { return (src.match(re) || []).length; }

/* ── One declaration each ───────────────────────────────────────────────── */
ok(count(page, /^function renderMatrix\(/gm) === 1,
   'portfolio.html declares renderMatrix exactly once');
ok(count(page, /^function mxOpen\(/gm) === 1,
   'portfolio.html declares mxOpen exactly once');
ok(count(data, /^  function matrix\(/gm) === 1,
   'portfolio-data.js declares matrix exactly once');
ok(count(data, /^  function scoreOn\(/gm) === 0,
   'the shadowing scoreOn went with it');

/* An export object cannot name the same key twice and mean anything by it. */
const exp = data.slice(data.indexOf('global.Portfolio = {'));
const keys = (exp.match(/^\s{4}(\w+)\s*:/gm) || []).map(s => s.trim().replace(':', ''));
const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
ok(dupes.length === 0, 'the Portfolio export names no key twice' + (dupes.length ? ' (got ' + dupes.join(', ') + ')' : ''));

/* ── The surviving one is the normalising one ───────────────────────────── */
global.window = {};
require(path.join(ROOT, 'tenants/osa/portfolio-data.js'));
const P = global.window.Portfolio;
const m = P.matrix(P.sample());
ok(!!m.cells && !!m.ranges && !!m.x && !!m.y,
   'matrix() returns cells, ranges and resolved axes');
ok(m.rows === undefined, 'and not the fixed-band `rows` shape the shadow returned');
ok(typeof m.x.get === 'function' && typeof m.y.get === 'function',
   'each axis carries its own accessor, so the page never re-derives a score');

/* The axes normalise against the portfolio's own range. A book clustered in a
   narrow band must still spread across the grid — that is the whole reason
   this implementation is the one that survived. */
const tight = P.sample().map(function (d, i) {
  d.grid = { score: 60 + i, substations: [] };
  d.viability = { score: 70 + i, criteria: [], findings: [], pathToNtp: [] };
  return d;
});
const spread = P.matrix(tight);
const cols = Object.keys(spread.cells).map(k => +k.split(':')[0]);
ok(Math.max.apply(null, cols) - Math.min.apply(null, cols) >= 5,
   'scores one point apart still spread across the grid, not into one column');

/* ── One place names an axis ────────────────────────────────────────────── */
ok(typeof P.matrixAxes === 'function', 'the data layer resolves the axis list');
ok(page.indexOf('F.matrixAxes') >= 0,
   'and the page builds its pickers from it, so a picker and the axis caption '
   + 'under the grid can never print different names for one measurement');

/* ── The CSS lost its shadow too ────────────────────────────────────────── */
const css = page.slice(0, page.indexOf('</style>'));
ok(count(css, /^\.mx-cell\{/gm) === 1, 'there is one .mx-cell rule, not two');
ok(count(css, /^\.mx-grid\{/gm) === 1, 'and one .mx-grid rule');
/* The NAMES still appear, in the note that records why they went. What must
   not come back is a RULE for any of them. */
['mx-tick', 'mx-swatch', 'mx-side', 'mx-yax', 'mx-card'].forEach(function (c) {
  ok(!new RegExp('^\\.' + c + '[,{ ]', 'm').test(css),
     'no rule is left for .' + c + ', which only the shadowed renderer emitted');
});
/* Square cells take their height from their width, so an unbounded grid on a
   wide screen becomes a tall column. The view's own copy says it must fit
   without scrolling. */
ok(/\.mx-grid\{[^}]*max-width:/m.test(css.replace(/\n\s+/g, '')),
   'the grid is bounded, so square cells cannot run off the bottom of a screen');

/* ── A \uXXXX escape is a JS string escape, not an HTML entity ──────────── */
/* "Search project or address…" shipped as a placeholder attribute and
   printed the six characters. Raw markup needs the character itself. */
const markup = page
  .replace(/<script\b[\s\S]*?<\/script>/g, m => '\n'.repeat((m.match(/\n/g) || []).length))
  .replace(/<style\b[\s\S]*?<\/style>/g, m => '\n'.repeat((m.match(/\n/g) || []).length));
const leaked = markup.split('\n')
  .map((l, i) => [i + 1, l])
  .filter(([, l]) => /\\u[0-9a-fA-F]{4}/.test(l));
ok(leaked.length === 0,
   'no \\uXXXX escape sits in raw markup' + (leaked.length ? ' (line ' + leaked.map(l => l[0]).join(', ') + ')' : ''));

/* ── The sample re-derives what it replaces ─────────────────────────────── */
/* loadSample() swaps the whole portfolio out. refresh() re-links the inbox
   and the design list when it loads deals; the sample did not, so every
   sample project read "Link to a deal…" beside the deal that owns it. */
const sample = page.slice(page.indexOf('function loadSample()'),
                          page.indexOf('function loadSample()') + 700);
ok(/IN\.annotate\(S\.inbox, S\.deals\)/.test(sample),
   'loadSample re-annotates the inbox against the sample deals');
ok(/S\.designLoaded.*loadDesign\(/s.test(sample),
   'and re-links the design list, but only if it was already loaded');

if (fails) { console.log('tosamatrix: ' + fails + ' failed'); process.exit(1); }
console.log('tosamatrix: all passed');
