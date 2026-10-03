/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
 * Does a parcel layer draw lines at a point? The one network test both
 * scripts/check-parcel-sources.js and scripts/parcel-coverage.js run: the
 * tile at z17 (or the layer's first zoom) exactly as the editor asks for it
 * (omega-parcel-sources.js tileUrl), lines meaning a PNG over 1,000 bytes (a
 * transparent tile is ~885).
 *
 * A layer marked `browserOnly` (Tennessee's) answers a browser and refuses
 * every scripted client, Node's fetch included, whatever its user agent; it
 * is asked through curl with a browser's user agent, which it answers.
 * Behind a proxy that Node's fetch does not use on its own, run with
 * NODE_USE_ENV_PROXY=1. */
'use strict';
var execFile = require('child_process').execFile;
var PS = require('../../omega-parcel-sources.js');
var BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

function tileOf(lat, lng, z) {
  var n = Math.pow(2, z), r = lat * Math.PI / 180;
  return [Math.floor((lng + 180) / 360 * n), Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n)];
}

function viaCurl(url) {
  return new Promise(function (resolve) {
    execFile('curl', ['-s', '-o', '-', '-w', '\n%{http_code} %{content_type}', '--max-time', '45', '-A', BROWSER_UA, url],
      { encoding: 'buffer', maxBuffer: 8 << 20 }, function (err, out) {
        if (err || !out) return resolve({ status: 'error ' + (err && err.code), type: '', bytes: 0 });
        var cut = out.lastIndexOf(10), tail = out.slice(cut + 1).toString().split(' ');
        resolve({ status: +tail[0], type: tail[1] || '', bytes: cut });
      });
  });
}
function viaFetch(url, left) {
  var ctl = new AbortController(), timer = setTimeout(function () { ctl.abort(); }, 45000);
  return fetch(url, { signal: ctl.signal, headers: { Origin: 'https://silmarillion.clearskyomega.com' } }).then(function (r) {
    return r.arrayBuffer().then(function (b) {
      clearTimeout(timer);
      return { status: r.status, type: r.headers.get('content-type') || '', bytes: b.byteLength, cors: !!r.headers.get('access-control-allow-origin') };
    });
  }).catch(function (e) {
    clearTimeout(timer);
    if (left) return viaFetch(url, left - 1);
    return { status: e.name === 'AbortError' ? 'timeout' : 'error ' + e.message, type: '', bytes: 0 };
  });
}

/* { drew, status, bytes, ms, cors } for one layer at one point */
function draws(src, lat, lng) {
  var z = Math.max(17, src.minZoom || 0), t = tileOf(lat, lng, z), url = PS.tileUrl(src, t[0], t[1], z), t0 = Date.now();
  if (!url) return Promise.resolve({ drew: false, status: 'outside its box', bytes: 0, ms: 0 });
  return (src.browserOnly ? viaCurl(url) : viaFetch(url, 1)).then(function (r) {
    r.ms = Date.now() - t0;
    r.drew = r.status === 200 && r.type.indexOf('image/png') === 0 && r.bytes > 1000;
    return r;
  });
}

module.exports = { draws: draws, tileOf: tileOf, BROWSER_UA: BROWSER_UA };
