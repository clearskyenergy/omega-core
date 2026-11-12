#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════
   scripts/ingest-rextag.js — one-command ingest for the Rextag delivery
   © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.

   ─────────────────────────────────────────────────────────────────────────
   WHAT THIS IS
   ─────────────────────────────────────────────────────────────────────────
   When the licensed Rextag telecom delivery arrives (Fiber Optic Network
   lines, Data Center points — Shapefile, File Geodatabase or GeoJSON),
   this converts it to the normalized layers Grid Atlas reads. Run it, and
   nothing else changes: the map's `fiber_licensed` / `dc_licensed` slots
   and the pin analysis already prefer the licensed source.

     node scripts/ingest-rextag.js /path/to/delivery.shp
     node scripts/ingest-rextag.js /path/to/delivery.gdb --layer FiberOpticNetwork
     node scripts/ingest-rextag.js /path/to/fiber.geojson --kind fiber
     node scripts/ingest-rextag.js /path/to/datacenters.geojson --kind datacenters

   A Shapefile or .gdb needs GDAL (`brew install gdal`) — ogr2ogr converts
   and reprojects to EPSG:4326; plain GeoJSON is read directly and is
   assumed WGS84 (Rextag GeoJSON exports are). --kind is inferred from the
   geometry when not given. --simplify PCT runs mapshaper if installed.

   ─────────────────────────────────────────────────────────────────────────
   WHERE THE OUTPUT GOES, AND WHY NOT /data/
   ─────────────────────────────────────────────────────────────────────────
   Output lands in private-fiber/rextag/ — GITIGNORED. Licensed geometry is
   never committed and never served from /data/, which is world-readable
   with no token: /data/ would republish Rextag's product to anyone with
   the URL, which is the IP-misappropriation liability the FiberLocator
   spec (docs/fiberlocator-integration-spec.md) already names. The serving
   road is the authenticated proxy slot (CLEARSKY_CONFIG.fiberProxyUrl →
   a serverless function that reads these files and answers bbox slices to
   signed-in users). docs/REXTAG-INGEST.md is the full runbook.

   This is also deliberately NOT scripts/import-published-fiber.js: the
   vetted registry is for PUBLISHED sources only ("reachable without a
   token is not published" — and licensed is the opposite of published).
   The licensed set stays isolable, so a licence question never touches
   the clean layers.
   ═══════════════════════════════════════════════════════════════════════════ */
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const M = require('./_lib/rextag-map.js');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'private-fiber', 'rextag');

function arg(name, dflt) {
  const i = process.argv.indexOf(name);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : dflt;
}
const input = process.argv[2];
if (!input || input.indexOf('--') === 0) {
  console.error('Usage: node scripts/ingest-rextag.js <delivery.(shp|gdb|geojson)> [--layer NAME] [--kind fiber|datacenters] [--simplify 15]');
  process.exit(1);
}
if (!fs.existsSync(input)) { console.error('Not found: ' + input); process.exit(1); }

/* Refuse an output path inside data/ outright — belt and braces on the
   "licensed is never world-readable" rule above. */
if (OUT_DIR.indexOf(path.join(ROOT, 'data')) === 0) throw new Error('refusing to write licensed data under /data/');

function haveCmd(cmd) {
  const r = spawnSync(cmd, ['--version'], { stdio: 'ignore' });
  return !r.error;
}

function toGeoJSON(src) {
  const ext = path.extname(src).toLowerCase();
  if (ext === '.geojson' || ext === '.json') return JSON.parse(fs.readFileSync(src, 'utf8'));
  if (ext !== '.shp' && ext !== '.gdb') throw new Error('Unrecognized delivery format "' + ext + '" — expected .shp, .gdb or .geojson');
  if (!haveCmd('ogr2ogr')) throw new Error('This delivery needs GDAL: brew install gdal (or apt-get install gdal-bin), then re-run.');
  const tmp = path.join(OUT_DIR, '_build', path.basename(src).replace(/\.[^.]+$/, '') + '.4326.geojson');
  fs.mkdirSync(path.dirname(tmp), { recursive: true });
  if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
  const args = ['-f', 'GeoJSON', '-t_srs', 'EPSG:4326', tmp, src];
  const layer = arg('--layer', null);
  if (layer) args.push(layer);
  console.log('ogr2ogr ' + args.join(' '));
  execFileSync('ogr2ogr', args, { stdio: 'inherit' });
  return JSON.parse(fs.readFileSync(tmp, 'utf8'));
}

const gj = toGeoJSON(input);
const feats = (gj && gj.features) || [];
if (!feats.length) throw new Error('The delivery has no features — wrong --layer name? (ogrinfo lists a .gdb’s layers)');

/* Which layer is this? Lines are fiber, points are data centers; --kind
   settles a mixed or ambiguous file. */
let kind = arg('--kind', null);
if (!kind) {
  const types = {};
  feats.forEach((f) => { if (f && f.geometry) types[f.geometry.type] = (types[f.geometry.type] || 0) + 1; });
  const lines = (types.LineString || 0) + (types.MultiLineString || 0);
  const points = types.Point || 0;
  kind = lines >= points ? 'fiber' : 'datacenters';
  console.log('Geometry: ' + JSON.stringify(types) + ' → kind "' + kind + '" (pass --kind to override)');
}
if (kind !== 'fiber' && kind !== 'datacenters') throw new Error('--kind must be fiber or datacenters');

const asOf = new Date().toISOString().slice(0, 10);
const mapper = kind === 'fiber' ? M.fiberFeature : M.dcFeature;
let skipped = 0;
const out = [];
for (const f of feats) {
  const m = mapper(f, asOf);
  if (m) out.push(m); else skipped++;
}
if (!out.length) throw new Error('No ' + kind + ' features survived mapping — wrong layer, or a schema Rextag changed. See scripts/_lib/rextag-map.js.');

fs.mkdirSync(OUT_DIR, { recursive: true });
const outFile = path.join(OUT_DIR, kind === 'fiber' ? 'rextag-fiber.geojson' : 'rextag-datacenters.geojson');
fs.writeFileSync(outFile, JSON.stringify({ type: 'FeatureCollection', features: out }));

/* Provenance beside the artefacts, the shape data/fiber/sources.json uses. */
const srcFile = path.join(OUT_DIR, 'sources.json');
let sources = {};
try { sources = JSON.parse(fs.readFileSync(srcFile, 'utf8')); } catch (e) { /* first run */ }
sources[kind === 'fiber' ? 'fiber_routes' : 'data_centers'] = {
  source: 'rextag', as_of: asOf, input: path.basename(input),
  attribution: 'Rextag (licensed) — display and redistribution per the Rextag license, never public',
  feature_count: out.length, skipped: skipped
};
fs.writeFileSync(srcFile, JSON.stringify(sources, null, 2));

/* Optional simplify for web weight — topology-keeping, never the default. */
const simp = arg('--simplify', null);
if (simp) {
  if (!haveCmd('mapshaper')) console.log('--simplify asked but mapshaper is not installed (npm i -g mapshaper); kept full geometry.');
  else {
    const sOut = outFile.replace('.geojson', '.simplified.geojson');
    execFileSync('mapshaper', [outFile, '-simplify', simp + '%', 'keep-shapes', '-o', sOut], { stdio: 'inherit' });
    console.log('Simplified copy: ' + sOut);
  }
}

console.log('Wrote ' + outFile + ' — ' + out.length + ' features (' + skipped + ' skipped), provenance in ' + srcFile);
console.log('NOT committed and NOT served: wire the authenticated proxy per docs/REXTAG-INGEST.md, then the fiber_licensed / dc_licensed layers and the pin analysis pick it up with no code change.');
