/* The empty register's Download CSV hands back the blank import template
   (2026-11-09, Tommy, after the button answered an empty register with only
   "Nothing to export."). The template's headers are the Import sites
   mapper's own fields and every one must auto-map back onto its own field,
   so the filled-in sheet comes home with no hand-mapping. The field list,
   the mapper and the template builder are cut out of portfolio.html between
   the imTemplate markers, so this runs the shipped words, not a copy.
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   node scripts/tests/tportfoliotemplate.js */
'use strict';
var fs = require('fs'), path = require('path');
var src = fs.readFileSync(path.join(__dirname, '..', '..', 'portfolio.html'), 'utf8');
var m = /\/\* ▶ imTemplate \*\/([\s\S]*?)\/\* ◀ imTemplate \*\//.exec(src);
if (!m) { console.log('  FAIL portfolio.html no longer carries the imTemplate markers'); process.exit(1); }
var T = Function(m[1] + '; return { IMFIELDS: IMFIELDS, imNorm: imNorm, imAutoMap: imAutoMap, imTemplateHeaders: imTemplateHeaders };')();

var pass = 0, fail = 0;
function ok(msg, c, got) { if (c) { pass++; return; } fail++; console.log('  FAIL ' + msg + (got !== undefined ? '  got: ' + JSON.stringify(got) : '')); }

var heads = T.imTemplateHeaders();
ok('one header per import field, Site name first', heads.length === T.IMFIELDS.length && heads[0] === 'Site name', heads);
ok('no header keeps a label aside (*, yes/no, optional); units stay', heads.every(function (h) { return !/\*|\(yes\/no\)|\(optional\)/.test(h); }), heads);
ok('no two headers collapse to the same column', heads.map(T.imNorm).filter(function (n, i, a) { return a.indexOf(n) !== i; }).length === 0, heads);
T.IMFIELDS.forEach(function (f, i) {
  ok('template header "' + heads[i] + '" auto-maps onto its own field ' + f.key, T.imAutoMap(heads[i]) === f.key, { header: heads[i], mapped: T.imAutoMap(heads[i]) });
});

/* the wiring: an empty, LOADED register answers the export with the template
   file; filters hiding every site, or a failed load, keep the refusal. */
ok('Download CSV takes the template road only on a loaded, empty register', src.indexOf('if (LOADED && !SITES.length) { downloadTemplate(); return; }') >= 0);
ok('the template is its own named file, built from the shipped headers', src.indexOf("'portfolio-import-template.csv'") >= 0 && /imTemplateHeaders\(\)\.map/.test(src));
ok('a register with rows still exports the filtered sites', src.indexOf("downloadCsv(filtered(), 'portfolio-sites-')") >= 0);

console.log('portfolio template: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
