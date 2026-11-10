/* The screens' handlers must be IN the function that runs them (2026-11-09:
   every production screen of a 104-site Run answered "Cannot find module
   '../../grid-atlas'"). api/site-crm.js runs the Grid Atlas, network,
   hosting and parcel handlers in-process, and the deploy bundles a function
   from the requires it can read: a literal string, never a path held in a
   variable. Locally every file is on disk, so only this test sees it.
     1. neither screening door calls require() on anything but a literal
     2. following literal requires from api/site-crm.js reaches each handler
     3. the files those handlers read off disk at run time (vercel.json
        includeFiles) are carried by api/site-crm.js too
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   node scripts/tests/tscreenbundle.js */
'use strict';
var fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '..', '..');
var pass = 0, fail = 0;
function ok(msg, c, got) { if (c) { pass++; return; } fail++; console.log('  FAIL ' + msg + (got !== undefined ? '  got: ' + JSON.stringify(got) : '')); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function code(src) { return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1'); }

/* 1. no require() of a non-literal in the doors */
['api/_lib/portfolio/assess-door.js', 'api/_lib/portfolio/diligence-door.js'].forEach(function (f) {
  var bad = code(read(f)).match(/\brequire\(\s*(?!['"])[^)]*\)/g) || [];
  ok(f + ' requires only literal paths', bad.length === 0, bad);
});

/* 2. the literal-require graph from the one door */
function resolve(from, spec) {
  if (spec.charAt(0) !== '.') return null;
  var base = path.join(path.dirname(from), spec), tries = [base, base + '.js', base + '.json', path.join(base, 'index.js')];
  for (var i = 0; i < tries.length; i++) if (fs.existsSync(tries[i]) && fs.statSync(tries[i]).isFile()) return tries[i];
  return null;
}
function reach(entry) {
  var seen = {}, queue = [path.join(ROOT, entry)];
  while (queue.length) {
    var f = queue.pop(); if (seen[f]) continue; seen[f] = true;
    if (!/\.js$/.test(f)) continue;
    var src = code(fs.readFileSync(f, 'utf8')), re = /\brequire\(\s*(['"])([^'"]+)\1\s*\)/g, m;
    while ((m = re.exec(src))) { var r = resolve(f, m[2]); if (r && !seen[r]) queue.push(r); }
  }
  return Object.keys(seen).map(function (f) { return path.relative(ROOT, f).split(path.sep).join('/'); });
}
var got = reach('api/site-crm.js'), HANDLERS = ['api/grid-atlas.js', 'api/network-proximity.js', 'api/hosting-capacity.js', 'api/parcel.js'];
HANDLERS.forEach(function (h) { ok('api/site-crm.js bundles ' + h, got.indexOf(h) >= 0); });

/* 3. what a bundled handler reads off disk rides with the door */
function braces(g) {
  var m = /\{([^{}]*)\}/.exec(g); if (!m) return [g];
  return m[1].split(',').reduce(function (a, part) { return a.concat(braces(g.slice(0, m.index) + part + g.slice(m.index + m[0].length))); }, []);
}
var fns = JSON.parse(read('vercel.json')).functions || {}, mine = braces((fns['api/site-crm.js'] || {}).includeFiles || '');
ok('api/site-crm.js still carries its own pdf-lib', mine.indexOf('vendor/pdf-lib/1.17.1/pdf-lib.min.js') >= 0, mine);
got.filter(function (f) { return /^api\/[^/]+\.js$/.test(f) && f !== 'api/site-crm.js' && fns[f] && fns[f].includeFiles; }).forEach(function (f) {
  braces(fns[f].includeFiles).forEach(function (g) { ok('api/site-crm.js carries ' + g + ' (read by ' + f + ')', mine.indexOf(g) >= 0, mine); });
});
ok('the fiber inventory the network screen reads is on disk', fs.existsSync(path.join(ROOT, 'data/fiber')) && fs.existsSync(path.join(ROOT, 'data/fiber-api/manifest.json')));

console.log('screen bundle: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
