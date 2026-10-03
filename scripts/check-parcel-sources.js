#!/usr/bin/env node
/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Are the public parcel layers still there? Counties move their services
 * (Cook did in 2026; Coles puts a date in its service name), and a layer
 * that moves draws nothing rather than failing loudly. This asks every
 * source in omega-parcel-sources.js for the tile at its `test` point, at
 * z17 or its first zoom, exactly as the editor asks, and reports which
 * drew lines.
 *
 *   node scripts/check-parcel-sources.js            every source
 *   node scripts/check-parcel-sources.js kane,cook  some of them
 *
 * NETWORK: it reaches every county's server, so it is not in npm test. Exit
 * 1 when any source did not draw. A transparent tile is about 885 bytes; one
 * with lines is over 1,000 (a sparse block of straight lines compresses to
 * ~1,400, so the bar is not set higher). Each tile is timed: Mississippi's
 * statewide server takes 15–20 s for a tile, which is slow, not gone. The
 * test itself is scripts/_lib/parcel-draw.js, shared with
 * scripts/parcel-coverage.js. */
'use strict';
var PS = require('../omega-parcel-sources.js');
var D = require('./_lib/parcel-draw.js');
var only = (process.argv[2] || '').split(',').filter(Boolean);

function check(src) {
  return D.draws(src, src.test[0], src.test[1]).then(function (r) { r.id = src.id; r.browserOnly = !!src.browserOnly; return r; });
}

var list = PS.SOURCES.filter(function (s) { return !only.length || only.indexOf(s.id) >= 0; });
Promise.all(list.map(check)).then(function (rows) {
  var bad = rows.filter(function (r) { return !r.drew; });
  rows.forEach(function (r) {
    console.log((r.drew ? 'ok   ' : 'FAIL ') + (r.id + '            ').slice(0, 12) + String(r.status).padEnd(8) + String(r.bytes).padStart(7) + ' bytes'
      + String((r.ms / 1000).toFixed(1)).padStart(6) + ' s' + (r.browserOnly ? '  (browser only: asked as a browser)' : r.cors ? '' : '  (no CORS)'));
  });
  console.log(rows.length - bad.length + ' of ' + rows.length + ' parcel layers drew lines.');
  if (bad.length) process.exitCode = 1;
});
