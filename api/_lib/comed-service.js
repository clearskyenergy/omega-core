/* © 2025–2026 ClearSky Energy Solutions LLC. Proprietary and Confidential.
   THE ONE PLACE THE COMED HOSTING-CAPACITY SERVICE IS NAMED, SERVER-SIDE.

   ComEd publishes its BESS hosting-capacity map as an ArcGIS feature service
   behind a "usrsvcs" gateway that answers only when the request carries the
   Referer of ComEd's own web app. A browser cannot set Referer, so every
   browser read goes through a proxy that sets it; this module is what the
   Vercel proxy (api/comed-proxy.js) and the catalogue's circuit attribution
   (api/_lib/circuit-attribution.js) share. The Cloudflare worker in
   workers/ does the same job on its own host and is deployed separately.

   THE SERVICE NAME ROTATES MONTHLY (JUN2026 -> SEP2026 ...). When every
   circuit reads "unknown" at once, this constant is the first thing to
   check: search exelonutilities.maps.arcgis.com for "ComEd BESS Hosting
   Capacity" and take the current FeatureServer URL. Layers 71-75 have kept
   their meaning across rotations: 75 is the address-resolved buffered
   circuit, 71-74 are township-block grains. */
'use strict';

var SERVICE = 'https://utility.arcgis.com/usrsvcs/servers/2ee23dc46a374272ac3fe1528a451819/rest/services/ComEd_BESS_Hosting_Capacity_SEP2026/FeatureServer';
var REFERER = 'https://exelonutilities.maps.arcgis.com/apps/webappviewer/index.html?id=c4068de162b943c9bd81fe4c4fbfe0ea';
var ORIGIN = 'https://exelonutilities.maps.arcgis.com';
var UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
var ATTRIB_LAYER = 75;
var NEAREST_M = 46;   /* the desktop tool's attribution radius: ComEd's own viewer resolves an address with a 150 ft buffer */

/* Only the service root and a layer's metadata or query are reachable through
   the proxy: "75/query", "75", "". Anything else is refused before a request
   is made. */
function safePath(p) {
  p = String(p || '').replace(/^\/+|\/+$/g, '');
  if (p === '') return '';
  if (/^\d{1,3}$/.test(p) || /^\d{1,3}\/query$/.test(p)) return p;
  return null;
}
function url(path, params) {
  var p = safePath(path);
  if (p === null) throw new Error('path not allowed');
  var qs = Object.keys(params || {}).filter(function (k) { return k !== 'path'; }).map(function (k) {
    return encodeURIComponent(k) + '=' + encodeURIComponent(String(params[k]));
  }).join('&');
  if (!/(^|&)f=/.test(qs)) qs = (qs ? qs + '&' : '') + 'f=json';
  return SERVICE + (p ? '/' + p : '') + '?' + qs;
}
function headers() { return { Accept: 'application/json,text/plain,*/*', Referer: REFERER, Origin: ORIGIN, 'User-Agent': UA }; }

async function fetchJson(target, ms) {
  var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, ms || 20000);
  try {
    var r = await fetch(target, { headers: headers(), signal: ctl.signal, redirect: 'error' });
    var text = await r.text(), j;
    try { j = JSON.parse(text); } catch (e) { throw new Error('ComEd answered with something other than JSON (HTTP ' + r.status + ')'); }
    return j;
  } finally { clearTimeout(t); }
}

/* The circuits within NEAREST_M of a point on the attribution layer, as
   ArcGIS returns them. */
function pointQueryUrl(lat, lon, layer) {
  return url((layer || ATTRIB_LAYER) + '/query', {
    f: 'json', geometry: lon + ',' + lat, geometryType: 'esriGeometryPoint', inSR: 4326,
    spatialRel: 'esriSpatialRelIntersects', distance: NEAREST_M, units: 'esriSRUnit_Meter',
    outFields: 'Feeder,Feeder_N,SS_N,BESS_HC,PV_HC_kW,EV_HC_kW,Feeder_Q', returnGeometry: false
  });
}

module.exports = { SERVICE: SERVICE, REFERER: REFERER, ORIGIN: ORIGIN, ATTRIB_LAYER: ATTRIB_LAYER, NEAREST_M: NEAREST_M,
  safePath: safePath, url: url, headers: headers, fetchJson: fetchJson, pointQueryUrl: pointQueryUrl };
