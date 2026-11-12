#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 *
 * The carrier-hotel snapshot (data/peeringdb-facilities.geojson, built by
 * scripts/build-peeringdb-facilities.js) and the layer that reads it. The
 * `carrierhotels` layer pointed at this file for months while the file did
 * not exist — the layer was silently empty, the exact failure the backbone
 * layer had. Holds, with no network:
 *   1. the file exists, is a FeatureCollection of >1,000 US points in
 *      WGS84 lng/lat, carries provenance, and every feature carries the
 *      attribution PeeringDB's terms ask for;
 *   2. `networks` is a number on every feature (it sizes the bubble and is
 *      the carrier-density read the pin analysis names);
 *   3. the functional site from the layer spec — 4846 S Michigan Ave,
 *      Chicago — sees the Cermak carrier-hotel cluster within 10 km and a
 *      ≥100-network building within 40 km;
 *   4. grid-atlas.html reads this exact file, and the pin analysis names
 *      the nearest facility without scoring it. */
'use strict';
var assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
var ROOT = path.join(__dirname, '../..');
var n = 0;
function ok(c, m) { assert.ok(c, m); n++; }
function eq(a, b, m) { assert.deepEqual(a, b, m); n++; }

var FILE = path.join(ROOT, 'data/peeringdb-facilities.geojson');
ok(fs.existsSync(FILE), 'data/peeringdb-facilities.geojson exists — the layer is no longer pointed at nothing');
var fc = JSON.parse(fs.readFileSync(FILE, 'utf8'));
eq(fc.type, 'FeatureCollection', 'FeatureCollection');
ok(Array.isArray(fc.features) && fc.features.length > 1000, 'a full national pull (' + fc.features.length + ' features)');
ok(fc.omegaSource && fc.omegaSource.source === 'peeringdb' && fc.omegaSource.as_of, 'provenance with an as-of date');
ok(/PeeringDB/.test(fc.omegaSource.attribution || ''), 'attribution recorded at the collection');
ok(/absence/i.test(fc.omegaSource.note || ''), 'the note says absence from the layer is not absence of a facility');

var i, f, p, c, bad = 0;
for (i = 0; i < fc.features.length; i++) {
  f = fc.features[i]; p = f.properties; c = f.geometry && f.geometry.coordinates;
  if (!f.geometry || f.geometry.type !== 'Point' ||
      typeof c[0] !== 'number' || typeof c[1] !== 'number' ||
      c[0] < -180 || c[0] > -60 || c[1] < 17 || c[1] > 72 ||
      !p || !p.name || typeof p.networks !== 'number' || p.attrib !== 'PeeringDB') { bad++; }
}
eq(bad, 0, 'every feature: US-bounded WGS84 point with name, numeric networks, attribution');

/* The spec's functional site: 4846 S Michigan Ave, Chicago. */
function km(aLat, aLng, bLat, bLng) {
  var R = 6371, r = Math.PI / 180;
  var x = Math.sin((bLat - aLat) * r / 2), y = Math.sin((bLng - aLng) * r / 2);
  return 2 * R * Math.asin(Math.sqrt(x * x + Math.cos(aLat * r) * Math.cos(bLat * r) * y * y));
}
var SITE = [41.8057, -87.6236], within40 = 0, nearest = 1e9, dense = 0;
for (i = 0; i < fc.features.length; i++) {
  c = fc.features[i].geometry.coordinates;
  var d = km(SITE[0], SITE[1], c[1], c[0]);
  if (d <= 40) { within40++; if (fc.features[i].properties.networks >= 100) dense++; }
  if (d < nearest) nearest = d;
}
ok(within40 >= 3, 'Chicago test site: ' + within40 + ' facilities within 40 km (dense fiber metro)');
ok(nearest <= 10, 'nearest facility ' + nearest.toFixed(1) + ' km — the Cermak cluster is in reach');
ok(dense >= 1, 'a ≥100-network carrier hotel within 40 km (' + dense + ')');

/* The layer and the pin analysis read it. */
var atlas = fs.readFileSync(path.join(ROOT, 'grid-atlas.html'), 'utf8');
ok(atlas.indexOf('staticFile:"/data/peeringdb-facilities.geojson"') > 0, 'the carrierhotels layer reads this file');
ok(/carrierhotels:[\s\S]{0,700}networks on-net/.test(atlas), 'the popup states networks on-net');
ok(/dcKeys=\['dc_licensed','carrierhotels','colo','dc_registry','datacenters'\]/.test(atlas),
  'the nearest-facility row reads licensed first, then the snapshot, then registry and live OSM');
ok(/Nearest: /.test(atlas) && /none within 80 km in the loaded layers — not evidence none exists/.test(atlas),
  'a miss is named as a miss, never as absence');
ok(atlas.indexOf('"carrierhotels"') > 0 && /dd:"compute"[^\n]*carrierhotels/.test(atlas),
  'the Data Center preset turns the snapshot on');

console.log('tcarrierhotels: ' + n + ' checks passed');
