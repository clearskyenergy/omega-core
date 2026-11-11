#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * The Rextag adapter (scripts/_lib/rextag-map.js + scripts/ingest-rextag.js):
 * the licensed delivery drops into the atlas's layer slots with one
 * converter run, and the licence never leaks. Holds, with no network:
 *   1. Type→class is the fixed table — longhaul / regional / metro — and a
 *      type the table does not know is `unknown`, never promoted;
 *   2. Operator and Owner are kept apart (different phone calls), a DBF's
 *      upper-cased columns still land, and a missing column is null —
 *      nothing invented;
 *   3. geometry passes through untouched (reprojection is ogr2ogr's job),
 *      a Point is refused by the fiber mapper and a line by the DC mapper;
 *   4. the output slot private-fiber/ is gitignored and the ingest refuses
 *      to write licensed geometry under world-readable /data/. */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '../..');
var M = require(path.join(ROOT, 'scripts/_lib/rextag-map.js'));
var n = 0;
function ok(c, m) { assert.ok(c, m); n++; }
function eq(a, b, m) { assert.deepEqual(a, b, m); n++; }

/* 1 ── the class table */
eq(M.classOf('Longhaul Backbone'), 'longhaul', 'longhaul backbone');
eq(M.classOf('Long-Haul Backbone'), 'longhaul', 'hyphenated longhaul');
eq(M.classOf('Regional Backbone'), 'regional', 'regional');
eq(M.classOf('Metro Backbone'), 'metro', 'metro backbone');
eq(M.classOf('Metro'), 'metro', 'bare metro');
eq(M.classOf('Lit Building Lateral'), 'unknown', 'unlisted type is unknown');
eq(M.classOf(null), 'unknown', 'null type is unknown, not a throw');

/* 2 ── fiber mapping, mixed-case and DBF upper-case */
var line = { type: 'Feature', geometry: { type: 'LineString', coordinates: [[-87.62, 41.80], [-87.60, 41.82]] },
  properties: { Name: 'Chicago–Milwaukee', Operator: 'Zayo', Owner: 'Zayo Group LLC', Type: 'Regional Backbone', Miles: '92.4' } };
var f = M.fiberFeature(line, '2026-11-11');
eq(f.properties.operator, 'Zayo', 'operator kept');
eq(f.properties.owner, 'Zayo Group LLC', 'owner kept apart from operator');
eq(f.properties.class, 'regional', 'type mapped');
eq(f.properties.miles, 92.4, 'miles numeric');
eq(f.properties.source, 'rextag', 'source of record');
eq(f.properties.confidence, 'high', 'licensed data is the high-confidence set');
eq(f.geometry, line.geometry, 'geometry passes through untouched');

var dbf = { type: 'Feature', geometry: { type: 'MultiLineString', coordinates: [[[-90, 40], [-89, 41]]] },
  properties: { NAME: 'X', OPERATOR: 'Lumen', OWNER: 'Level 3', TYPE: 'LONGHAUL BACKBONE', MILES: 10 } };
var fd = M.fiberFeature(dbf, '2026-11-11');
eq(fd.properties.operator, 'Lumen', 'DBF upper-cased columns still land');
eq(fd.properties.class, 'longhaul', 'DBF type still classed');

var sparse = M.fiberFeature({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: {} }, null);
eq(sparse.properties.operator, null, 'missing operator is null, never invented');
eq(sparse.properties.miles, null, 'missing miles is null, never 0');
eq(sparse.properties.class, 'unknown', 'missing type is unknown');

eq(M.fiberFeature({ type: 'Feature', geometry: { type: 'Point', coordinates: [-87, 41] }, properties: {} }, null), null,
  'a point is not a fiber route');

/* 3 ── data-center mapping */
var dc = M.dcFeature({ type: 'Feature', geometry: { type: 'Point', coordinates: [-87.6189, 41.8530] },
  properties: { Name: '350 E Cermak', Operator: 'Digital Realty', Owner: 'Digital Realty Trust', City: 'Chicago', State: 'IL', Power_MW: '100' } }, '2026-11-11');
eq(dc.properties.name, '350 E Cermak', 'dc name');
eq(dc.properties.owner, 'Digital Realty Trust', 'dc owner kept');
eq(dc.properties.power_mw, 100, 'power numeric');
eq(M.dcFeature({ type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: {} }, null), null,
  'a line is not a data center');
eq(M.dcFeature({ type: 'Feature', geometry: { type: 'Point', coordinates: [412, 95] }, properties: {} }, null), null,
  'out-of-range coordinates are refused, not drawn at sea');

/* 4 ── the licence never leaks */
var gitignore = fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8');
ok(/^private-fiber\/$/m.test(gitignore), 'private-fiber/ (the ingest output) is gitignored');
var ingest = fs.readFileSync(path.join(ROOT, 'scripts/ingest-rextag.js'), 'utf8');
ok(ingest.indexOf("'private-fiber', 'rextag'") > 0, 'ingest writes to private-fiber/rextag');
ok(ingest.indexOf('refusing to write licensed data under /data/') > 0, 'ingest refuses the world-readable folder');
ok(ingest.indexOf('import-published-fiber') > 0, 'ingest says why it is not the published registry');

/* 5 ── the atlas has both licensed slots wired to the authenticated proxy */
var atlas = fs.readFileSync(path.join(ROOT, 'grid-atlas.html'), 'utf8');
ok(/dc_licensed:\s*{/.test(atlas), 'dc_licensed layer exists');
ok(/proxyKey:"datacenters"/.test(atlas), 'dc_licensed rides the proxy, never a static /data/ file');
ok(atlas.indexOf('"dc_licensed"') > 0, 'dc_licensed is in ORDER');
ok(/validatePointGeoJSON/.test(atlas), 'the proxy path validates point layers');
ok(!/staticFile:"\/data\/[^"]*rextag/i.test(atlas), 'no layer serves rextag from /data/');

console.log('trextagmap: ' + n + ' checks passed');
