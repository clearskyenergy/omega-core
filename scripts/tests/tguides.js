#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   scripts/tests/tguides.js — the PDF guides show today's screens.

   Every release that changes a screen retakes the guides. shots.js records,
   for each screenshot, the sha256 of every page file the shot loaded
   (shots/manifest.json `sources`); build.js records which screenshots each
   PDF printed (scripts/guides/built.json). guard.js freshness() is the one
   judge; this runs it on the repo, after proving on a scratch tree that it
   catches each way a guide goes stale. The fix is always the same:

     npm run guides      (shots.js, then build.js)

   never an edit to the manifest or built.json.
   node scripts/tests/tguides.js */
'use strict';
var fs = require('fs'), path = require('path'), os = require('os');
var ROOT = path.join(__dirname, '../..'), G = require('../guides/guard');
var pass = 0, fail = 0;
function ok(label, yes, detail) { console.log('  ' + (yes ? 'PASS' : 'FAIL') + '  ' + label + (detail !== undefined && !yes ? '  got: ' + JSON.stringify(detail) : '')); if (yes) pass++; else fail++; }

console.log('\nthe judge catches each way a guide goes stale (scratch tree)');
var tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tguides-')), shots = path.join(tmp, 'shots'), guides = path.join(tmp, 'guides'), src = path.join(tmp, 'src');
[shots, guides, src, path.join(tmp, 'office'), path.join(tmp, 'app-sandbox')].forEach(function (d) { fs.mkdirSync(d, { recursive: true }); });
function put(f, body) { fs.writeFileSync(f, body); return f; }
put(path.join(tmp, 'office/app.html'), '<p>office</p>'); put(path.join(tmp, 'omega-logic-theme.js'), '/* theme */'); put(path.join(tmp, 'logo.png'), 'png');
put(path.join(tmp, 'app-sandbox/sandbox.js'), '/* fixtures + shim + libraries */');
put(path.join(src, 'office.html'), '<img src="shots/a.png"><img src="shots/b.png">');
put(path.join(shots, 'a.png'), 'A'); put(path.join(shots, 'b.png'), 'B');
var PAGES = [{ src: 'office/app.html', out: 'office.html' }];
var srcA = G.sourcesOf(tmp, ['/app-sandbox/office', '/omega-logic-theme.js?v=2', '/app-sandbox/sandbox.js', '/omega-tenant.js', '/vendor/zxing/x.js', '/logo.png', '/nowhere.js'], PAGES);
ok('sourcesOf: a sandbox page is the page it is built from; shared JS counts; the runtime is its committed build (the libraries that work out what a screen shows); stand-ins, vendor, pictures and missing files are not screens', JSON.stringify(Object.keys(srcA)) === JSON.stringify(['app-sandbox/sandbox.js', 'office/app.html', 'omega-logic-theme.js']), srcA);
ok('  a desktop page\'s /config.js is the same runtime', JSON.stringify(Object.keys(G.sourcesOf(tmp, ['/config.js'], PAGES))) === JSON.stringify(['app-sandbox/sandbox.js']));
G.writeManifest(shots, { 'a.png': { sha256: G.sha256(path.join(shots, 'a.png')), sources: srcA }, 'b.png': { sha256: G.sha256(path.join(shots, 'b.png')), sources: { 'office/app.html': srcA['office/app.html'] } } });
put(path.join(guides, 'X.pdf'), '%PDF');
function built() { var m = G.readManifest(shots); return { 'X.pdf': { sha256: G.sha256(path.join(guides, 'X.pdf')), shots: { 'a.png': m['a.png'].sha256, 'b.png': m['b.png'].sha256 }, guides: { 'office.html': G.sha256(path.join(src, 'office.html')) } } }; }
function judge(b) { return G.freshness({ root: tmp, shotsDir: shots, guidesDir: guides, guideDir: src, pdfs: ['X.pdf'], used: { 'X.pdf': ['a.png', 'b.png'] }, built: b || built() }); }
ok('fresh: nothing to say', judge().length === 0, judge());
put(path.join(tmp, 'app-sandbox/sandbox.js'), '/* a library now draws the lanes differently */');
ok('a change in the sandbox runtime (a library behind the screen) makes the pictures that loaded it stale', judge().some(function (x) { return /^a\.png: app-sandbox\/sandbox\.js changed since the shot$/.test(x); }), judge());
put(path.join(tmp, 'app-sandbox/sandbox.js'), '/* fixtures + shim + libraries */');
put(path.join(tmp, 'office/app.html'), '<p>office, changed</p>');
var p1 = judge();
ok('a photographed page changed since its shots → both pictures named, with the file', p1.length === 2 && p1.every(function (x) { return /office\/app\.html changed since the shot/.test(x); }), p1);
put(path.join(tmp, 'office/app.html'), '<p>office</p>');
var m0 = G.readManifest(shots); delete m0['b.png'].sources; G.writeManifest(shots, m0);
ok('a picture taken before shots recorded their pages → retake it', judge().some(function (x) { return /^b\.png: taken before/.test(x); }), judge());
m0['b.png'].sources = { 'office/app.html': srcA['office/app.html'] }; G.writeManifest(shots, m0);
var b1 = built(); put(path.join(shots, 'a.png'), 'A2'); m0['a.png'].sha256 = G.sha256(path.join(shots, 'a.png')); G.writeManifest(shots, m0);
ok('a picture retaken but the PDF not rebuilt → the PDF printed an older picture', judge(b1).some(function (x) { return /^X\.pdf: printed an older a\.png$/.test(x); }), judge(b1));
put(path.join(guides, 'X.pdf'), '%PDF-hand-edited');
ok('a PDF that is not the file build.js wrote → named', judge(b1).some(function (x) { return /^X\.pdf: the file is not the one build\.js wrote$/.test(x); }), judge(b1));
put(path.join(guides, 'X.pdf'), '%PDF'); var b2 = built(); put(path.join(src, 'office.html'), '<img src="shots/a.png"><img src="shots/b.png"><p>new words</p>');
ok('the guide\'s own words changed since the build → named', judge(b2).some(function (x) { return /office\.html changed since the build/.test(x); }), judge(b2));
ok('a PDF missing from built.json → named', judge({}).some(function (x) { return /^X\.pdf: not in built\.json/.test(x); }), judge({}));
var b3 = built(); b3['X.pdf'].build = 'old';
ok('a PDF built by an older build.js or band → named', G.freshness({ root: tmp, shotsDir: shots, guidesDir: guides, guideDir: src, pdfs: ['X.pdf'], used: { 'X.pdf': ['a.png', 'b.png'] }, built: b3, build: 'new' }).some(function (x) { return /build\.js or header\.html changed/.test(x); }));
ok('a PDF whose record leaves out one of its guide sources → named', G.freshness({ root: tmp, shotsDir: shots, guidesDir: guides, guideDir: src, pdfs: ['X.pdf'], used: { 'X.pdf': ['a.png', 'b.png'] }, built: built(), guideFiles: { 'X.pdf': ['office.html', 'plant.html'] } }).some(function (x) { return /built without scripts\/guides\/plant\.html/.test(x); }));
put(path.join(shots, 'b.png'), 'B-hand-copied');
ok('a picture whose bytes are not what shots.js took → named', judge().some(function (x) { return /^b\.png: changed/.test(x); }), judge());
fs.rmSync(tmp, { recursive: true, force: true });

console.log('\nthe published guides are today\'s screens');
var GD = path.join(ROOT, 'scripts/guides'), map = G.guideMap(GD), used = {};
var files = {}; Object.keys(map).forEach(function (pdf) { used[pdf] = map[pdf].shots; files[pdf] = map[pdf].html; });
ok('every published PDF prints screenshots (a guide with none would pass vacuously)', Object.keys(used).every(function (pdf) { return used[pdf].length > 0; }), Object.keys(used).map(function (pdf) { return pdf + ' ' + used[pdf].length; }));
ok('every published PDF is one the map knows (guides/*.pdf)', fs.readdirSync(path.join(ROOT, 'guides')).filter(function (f) { return /\.pdf$/.test(f); }).every(function (f) { return !!map[f]; }), Object.keys(map));
var problems = G.freshness({ root: ROOT, shotsDir: path.join(GD, 'shots'), guidesDir: path.join(ROOT, 'guides'), guideDir: GD, pdfs: Object.keys(map), used: used, guideFiles: files, build: G.buildSha(GD) });
ok('no photographed screen changed since its shot, and every PDF was built from the current shots — else: npm run guides', problems.length === 0, problems.slice(0, 12).concat(problems.length > 12 ? ['… ' + (problems.length - 12) + ' more'] : []));

console.log('\nguides: ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('\nThe PDF guides are behind the screens. Retake and rebuild them:\n  npm run guides\nthen commit scripts/guides/shots/, scripts/guides/built.json and guides/.'); process.exit(1); }
