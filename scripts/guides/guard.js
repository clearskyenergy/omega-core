/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   scripts/guides/guard.js — what a published guide must never carry, and
   the record of which screenshots were taken by shots.js.

   /guides is public and goes to every Omega Logic subscriber, so no guide
   names a tenant: not in a picture, not in its text. This is the ONE list
   (LEAK): shots.js refuses a screenshot whose visible text matches it, and
   build.js refuses a guide whose printed text matches it. Add a tenant's
   name or domain here when a sample or a fixture starts carrying it.

   A screenshot on disk proves nothing about where it came from. shots.js
   records each picture that passed the check in shots/manifest.json (its
   sha256, when, from which tree); build.js prints only pictures whose bytes
   match that record, so a leftover or hand-copied capture cannot reach a
   published PDF.

   A guide also goes stale the other way: the screen changes and the picture
   does not. So each record also carries `sources` — the sha256 of every
   page file the shot loaded (sourcesOf: the HTML, the shared omega-*.js and
   CSS; a sandbox page counts as the page it is built from) — and build.js
   writes built.json here: which pictures each PDF printed. freshness() is
   the one judge of both; scripts/tests/tguides.js runs it in npm test, so a
   release that changes a photographed screen and does not retake the guides
   (npm run guides) fails. */
'use strict';
var fs = require('fs'), path = require('path'), crypto = require('crypto');

var LEAK = /clean\s?cell|cleancell\.us|incharge|bucher/i;  /* the buyer on a live order is matched by hash (scripts/_lib/discreet.js), never spelled here */
var MANIFEST = 'manifest.json';

function sha256(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function readManifest(dir) {
  var f = path.join(dir, MANIFEST);
  try { return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {}; }
  catch (e) { throw new Error(f + ' is not valid JSON (' + e.message + '): retake with node scripts/guides/shots.js'); }
}
function writeManifest(dir, m) {
  var out = {}; Object.keys(m).sort().forEach(function (k) { out[k] = m[k]; });
  fs.writeFileSync(path.join(dir, MANIFEST), JSON.stringify(out, null, 2) + '\n');
}
/* the manifest's verdict on one picture in dir: 'ok', 'missing' (no file),
   'unrecorded' (never taken by shots.js) or 'changed' (bytes differ) */
function verdict(dir, file, m) {
  var f = path.join(dir, file);
  if (!fs.existsSync(f)) return 'missing';
  var e = m[file];
  if (!e || !e.sha256) return 'unrecorded';
  return e.sha256 === sha256(f) ? 'ok' : 'changed';
}

/* the repo files a shot's requests came from: a sandbox page is the page it
   is built from (build-app-sandbox PAGES); the sandbox runtime, the config
   and tenant stand-ins, vendored code and pictures are not screens */
var SCREEN_EXT = { '.html': 1, '.js': 1, '.css': 1 };
function sourcesOf(root, urlPaths, sandboxPages) {
  var bySandbox = {}, out = {};
  (sandboxPages || []).forEach(function (p) { bySandbox[p.out] = p.src; });
  (urlPaths || []).forEach(function (u) {
    u = String(u || '').split('?')[0].split('#')[0];
    var rel = null;
    if (u.indexOf('/app-sandbox/') === 0) { var name = u.slice(13); if (!path.extname(name)) name += '.html'; rel = bySandbox[name] || null; }
    else if (/^\/(config|omega-brand|omega-tenant)\.js$/.test(u) || u.indexOf('/vendor/') === 0) rel = null;
    else {
      rel = u === '/' ? 'index.html' : u.replace(/^\/+/, '');
      if (!fs.existsSync(path.join(root, rel)) && fs.existsSync(path.join(root, rel + '.html'))) rel += '.html';
      if (/\/$/.test(rel) && fs.existsSync(path.join(root, rel, 'index.html'))) rel += 'index.html';
    }
    if (!rel || !SCREEN_EXT[path.extname(rel)]) return;
    var f = path.join(root, path.normalize(rel));
    if (f.indexOf(root + path.sep) !== 0 || !fs.existsSync(f) || !fs.statSync(f).isFile()) return;
    out[rel] = sha256(f);
  });
  var sorted = {}; Object.keys(out).sort().forEach(function (k) { sorted[k] = out[k]; });
  return sorted;
}
/* the published guides: the PDF each guide key becomes, the second names a
   PDF is also written under, and the guide sources each one is made from
   (build.js prints the three back to back as the Phone Apps guide) */
var GUIDES = { plant: 'Omega-Logic-Plant-App.pdf', office: 'Omega-Logic-Office-App.pdf', customer: 'Omega-Logic-Customer-App.pdf', all: 'Omega-Logic-Phone-Apps.pdf' };
var ALSO = { office: ['Omega-Logic-App.pdf'] };
var GUIDE_HTML = { plant: ['plant.html'], office: ['office.html'], customer: ['customer.html'], all: ['office.html', 'plant.html', 'customer.html'] };
/* the screenshots a guide source prints */
function shotsIn(html) { var out = [], re = /\ssrc="shots\/([^"]+\.png)"/g, m; while ((m = re.exec(html))) if (out.indexOf(m[1]) < 0) out.push(m[1]); return out; }
/* every published PDF → the guide sources and screenshots it is made of */
function guideMap(guideDir) {
  var out = {};
  Object.keys(GUIDES).forEach(function (k) {
    var html = GUIDE_HTML[k], shots = [];
    html.forEach(function (h) { shotsIn(fs.readFileSync(path.join(guideDir, h), 'utf8')).forEach(function (x) { if (shots.indexOf(x) < 0) shots.push(x); }); });
    [GUIDES[k]].concat(ALSO[k] || []).forEach(function (pdf) { out[pdf] = { key: k, html: html, shots: shots }; });
  });
  return out;
}
/* built.json (next to this file): { pdf: { sha256, shots: { png: sha256 }, guides: { html: sha256 } } } */
var BUILT = path.join(__dirname, 'built.json');
function readBuilt(file) { file = file || BUILT; try { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {}; } catch (e) { return {}; } }
function writeBuilt(b, file) { var out = {}; Object.keys(b).sort().forEach(function (k) { out[k] = b[k]; }); fs.writeFileSync(file || BUILT, JSON.stringify(out, null, 2) + '\n'); }
/* is every published guide what the current screens look like?
   o: { root, shotsDir, guidesDir, guideDir (the guide .html sources), pdfs: [names], used: { pdf: [png] }, built }
   → a list of problems, each naming the file and what went stale */
function freshness(o) {
  var m = readManifest(o.shotsDir), built = o.built || readBuilt(), problems = [], seen = {};
  Object.keys(o.used || {}).forEach(function (pdf) {
    (o.used[pdf] || []).forEach(function (png) {
      if (seen[png]) return; seen[png] = true;
      var v = verdict(o.shotsDir, png, m);
      if (v !== 'ok') { problems.push(png + ': ' + v + ' (shots/manifest.json)'); return; }
      var src = m[png].sources;
      if (!src || !Object.keys(src).length) { problems.push(png + ': taken before shots recorded their pages; retake it'); return; }
      Object.keys(src).forEach(function (rel) {
        var f = path.join(o.root, rel);
        if (!fs.existsSync(f)) problems.push(png + ': ' + rel + ' is gone since the shot');
        else if (sha256(f) !== src[rel]) problems.push(png + ': ' + rel + ' changed since the shot');
      });
    });
  });
  (o.pdfs || []).forEach(function (pdf) {
    var b = built[pdf], f = path.join(o.guidesDir, pdf);
    if (!b) { problems.push(pdf + ': not in built.json (build it with scripts/guides/build.js)'); return; }
    if (!fs.existsSync(f) || sha256(f) !== b.sha256) { problems.push(pdf + ': the file is not the one build.js wrote'); return; }
    Object.keys(b.shots || {}).forEach(function (png) { var e = m[png]; if (!e || e.sha256 !== b.shots[png]) problems.push(pdf + ': printed an older ' + png); });
    (o.used[pdf] || []).forEach(function (png) { if (!(b.shots || {})[png]) problems.push(pdf + ': was built without ' + png); });
    Object.keys(b.guides || {}).forEach(function (h) { var g = path.join(o.guideDir, h); if (!fs.existsSync(g) || sha256(g) !== b.guides[h]) problems.push(pdf + ': scripts/guides/' + h + ' changed since the build'); });
  });
  return problems;
}

module.exports = { LEAK: LEAK, MANIFEST: MANIFEST, sha256: sha256, readManifest: readManifest, writeManifest: writeManifest, verdict: verdict,
  sourcesOf: sourcesOf, BUILT: BUILT, readBuilt: readBuilt, writeBuilt: writeBuilt, freshness: freshness,
  GUIDES: GUIDES, ALSO: ALSO, GUIDE_HTML: GUIDE_HTML, shotsIn: shotsIn, guideMap: guideMap };
