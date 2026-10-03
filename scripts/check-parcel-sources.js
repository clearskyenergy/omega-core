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
 * with lines is well over 1,500. */
'use strict';
var PS = require('../omega-parcel-sources.js');
var only = (process.argv[2] || '').split(',').filter(Boolean);

function tileOf(lat, lng, z) {
  var n = Math.pow(2, z), r = lat * Math.PI / 180;
  return [Math.floor((lng + 180) / 360 * n), Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n)];
}

function check(src) {
  var z = Math.max(17, src.minZoom || 0), t = tileOf(src.test[0], src.test[1], z);
  var url = PS.tileUrl(src, t[0], t[1], z), ctl = new AbortController();
  var timer = setTimeout(function () { ctl.abort(); }, 20000);
  return fetch(url, { signal: ctl.signal, headers: { Origin: 'https://silmarillion.clearskyomega.com' } }).then(function (r) {
    return r.arrayBuffer().then(function (b) {
      clearTimeout(timer);
      var type = r.headers.get('content-type') || '', bytes = b.byteLength;
      var drew = r.ok && type.indexOf('image/png') === 0 && bytes > 1500;
      return { id: src.id, drew: drew, status: r.status, bytes: bytes, cors: !!r.headers.get('access-control-allow-origin') };
    });
  }).catch(function (e) {
    clearTimeout(timer);
    return { id: src.id, drew: false, status: e.name === 'AbortError' ? 'timeout' : 'error ' + e.message, bytes: 0, cors: false };
  });
}

var list = PS.SOURCES.filter(function (s) { return !only.length || only.indexOf(s.id) >= 0; });
Promise.all(list.map(check)).then(function (rows) {
  var bad = rows.filter(function (r) { return !r.drew; });
  rows.forEach(function (r) {
    console.log((r.drew ? 'ok   ' : 'FAIL ') + (r.id + '            ').slice(0, 12) + String(r.status).padEnd(8) + String(r.bytes).padStart(7) + ' bytes' + (r.cors ? '' : '  (no CORS)'));
  });
  console.log(rows.length - bad.length + ' of ' + rows.length + ' parcel layers drew lines.');
  if (bad.length) process.exitCode = 1;
});
