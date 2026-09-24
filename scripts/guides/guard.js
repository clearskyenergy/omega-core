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
   published PDF. */
'use strict';
var fs = require('fs'), path = require('path'), crypto = require('crypto');

var LEAK = /clean\s?cell|cleancell\.us|incharge|amperage|bucher/i;
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

module.exports = { LEAK: LEAK, MANIFEST: MANIFEST, sha256: sha256, readManifest: readManifest, writeManifest: writeManifest, verdict: verdict };
